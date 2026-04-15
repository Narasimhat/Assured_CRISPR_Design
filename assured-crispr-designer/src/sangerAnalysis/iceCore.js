/**
 * Assured Sanger Analyser — ICE Core Algorithm (pure JavaScript port)
 *
 * Mirrors the Synthego ICE algorithm:
 *   - Sanger AB1 parsing       → ab1Parser.js
 *   - Sequence alignment       → sequenceUtils.js
 *   - NNLS regression          → nnls.js
 *   - Edit proposal generation → this file
 *
 * Primary export: analyzeIce(controlParsed, editedParsed, guideSequences, options)
 *
 * Returns a rich result object suitable for rendering charts and tables.
 */

import { getPeakValues, getPhredScores } from './ab1Parser.js';
import {
  rna2dna, reverseComplement, normaliseGuide,
  findAlignableWindow, alignWithWindow, smithWaterman,
} from './sequenceUtils.js';
import { nnls, normaliseCoefficients } from './nnls.js';

const BASE_ORDER_DEFAULT = 'ATCG';
const INDEL_MAX_SIZE_DEFAULT = 20;
const MAX_BASES_AFTER_CUTSITE = 40;
const ICE_D_CORRECTION = 1.41;          // ICE-D regression coefficient
const HDR_OVERLAP_FILTER_CUTOFF = 3;    // don't skip proposals within ±3 of HDR size
const MIN_ALN_WINDOW_SIZE = 50;

// ── Guide target ─────────────────────────────────────────────────────────────

function findGuideInSequence(guideSeq, ctrlSeq, label) {
  const rev = reverseComplement(guideSeq);
  let orientation, foundSeq, cutOffset;

  if (ctrlSeq.includes(guideSeq)) {
    orientation = 'fwd';
    foundSeq    = guideSeq;
    cutOffset   = guideSeq.length - 3;
  } else if (ctrlSeq.includes(rev)) {
    orientation = 'rev';
    foundSeq    = rev;
    cutOffset   = 3;
  } else {
    throw new Error(`Guide "${label}" (${guideSeq}) not found in control sequence`);
  }

  const guideStart = ctrlSeq.indexOf(foundSeq);
  const guideEnd   = guideStart + foundSeq.length;
  const cutsite    = guideStart + cutOffset;

  const warnings = [];
  if (orientation === 'rev') {
    const pam = ctrlSeq.slice(guideStart - 3, guideStart - 1);
    if (pam !== 'CC') warnings.push(`No NGG PAM upstream of guide ${label}`);
  } else {
    const pam = ctrlSeq.slice(guideEnd + 1, guideEnd + 3);
    if (pam !== 'GG') warnings.push(`No NGG PAM downstream of guide ${label}`);
  }

  return { label, guideSeq, orientation, cutsite, guideStart, guideEnd, cutOffset, warnings };
}

// ── Edit proposal creation ────────────────────────────────────────────────────

/**
 * Build the trace vector for a sequence, sampling from ctrlPeakValues
 * at positions where the sequence retains wild-type bases, and using 0.25
 * for inserted positions (unknown base).
 *
 * baseOrder is the 4-char string used by the control sanger object (e.g. "GATC").
 * Returns a flat Float32Array of length 4 × seqLength.
 */
function buildProposalTrace(seqData, ctrlPeakValues, baseOrder) {
  const trace = [];
  for (const sd of seqData) {
    if (sd.type === 'deleted') continue; // deleted bases not in trace
    for (const b of baseOrder) {
      if (sd.type === 'insertion') {
        trace.push(0.25);
      } else {
        // wild-type: use control signal at this original position
        const val = ctrlPeakValues[b]?.[sd.origIdx] ?? 0;
        trace.push(val);
      }
    }
  }
  return trace;
}

/**
 * Single-cut edit proposal.
 * cutsite is 0-based; del_before = bases deleted before cut, del_after = after.
 * insertion = number of inserted (unknown) bases at cutsite.
 */
function singleCutProposal(ctrlSeq, ctrlPeakValues, baseOrder, cutsite, label, delBefore, delAfter, insertion) {
  const cs = cutsite - 1; // 0-based position (mirror Python's cutsite-1)
  const seqData = [];
  const deletedSet = new Set();

  if (delBefore > 0 || delAfter > 0) {
    for (let i = 0; i < delBefore; i++) deletedSet.add(cs - i);
    for (let i = 0; i < delAfter;  i++) deletedSet.add(cs + i + 1);
  }

  for (let idx = 0; idx < ctrlSeq.length; idx++) {
    if (deletedSet.has(idx)) {
      seqData.push({ base: '-', type: 'deleted', origIdx: idx });
    } else {
      seqData.push({ base: ctrlSeq[idx], type: 'wildtype', origIdx: idx });
    }
    // Insertion: inject unknown bases after cutsite position
    if (insertion > 0 && idx === cs) {
      for (let k = 0; k < insertion; k++) {
        seqData.push({ base: 'n', type: 'insertion', origIdx: idx });
      }
    }
  }

  const basesChanged = delBefore > 0 || delAfter > 0
    ? -(delBefore + delAfter)
    : insertion;
  const isWt = basesChanged === 0;

  const trace = buildProposalTrace(seqData, ctrlPeakValues, baseOrder);
  const seq   = seqData.filter(s => 'ATCGNnatcgn'.includes(s.base)).map(s => s.base).join('');

  return {
    sequence: seq,
    traceData: trace,
    seqData,
    cutsite: cs,
    basesChanged,
    summary: isWt ? `0[${label}]` : `${basesChanged}[${label}]`,
    summaryJson: { total: basesChanged, details: [{ label, value: basesChanged }] },
    wildtype: isWt,
    guideLabel: label,
  };
}

/**
 * Homologous recombination (HDR) proposal from a donor sequence.
 * Aligns donor to control using local SW, then builds the expected edited sequence.
 */
function hdrProposal(ctrlSeq, ctrlPeakValues, baseOrder, donorSeq) {
  // We do a simple longest-common-subsequence style donor integration
  // by finding the best local alignment of the donor to the control
  const seqData = [];

  // Build donor-as-sequence
  for (let idx = 0; idx < donorSeq.length; idx++) {
    seqData.push({ base: donorSeq[idx], type: 'hdr', origIdx: -1 });
  }

  const trace = seqData.map(sd => {
    if (sd.type === 'hdr') {
      // For HDR positions: use 1.0 for the matching base, 0 for others
      const tracePart = [];
      for (const b of baseOrder) {
        tracePart.push(sd.base === b ? 1.0 : 0.0);
      }
      return tracePart;
    }
    return [];
  }).flat();

  const seq = seqData.map(sd => sd.base).join('');
  const basesChanged = donorSeq.length - ctrlSeq.length;

  return {
    sequence: seq,
    traceData: trace,
    seqData,
    cutsite: -1,
    basesChanged,
    summary: 'HDR',
    summaryJson: { total: basesChanged, details: [{ label: 'HDR', value: basesChanged }] },
    wildtype: false,
    isHdr: true,
    guideLabel: 'HDR',
  };
}

/**
 * Generate all edit proposals for the analysis.
 * Returns array of proposal objects, deduplicated by sequence.
 */
function generateEditProposals(ctrlSeq, ctrlPeakValues, baseOrder, guideTargets, indelMaxSize, donorSeq) {
  const proposals = [];
  const seenSeqs  = new Set();

  function addProposal(p) {
    if (!seenSeqs.has(p.sequence)) {
      seenSeqs.add(p.sequence);
      proposals.push(p);
    }
  }

  // Compute HDR indel size if donor provided
  let hdrIndelSize = null;
  if (donorSeq) {
    // Simple estimate: length difference (accurate enough for overlap filtering)
    hdrIndelSize = donorSeq.length - ctrlSeq.length;
    const hp = hdrProposalSimple(ctrlSeq, ctrlPeakValues, baseOrder, donorSeq);
    if (hp) addProposal(hp);
  }

  function shouldSkip(indelSize) {
    if (!donorSeq) return false;
    if (Math.abs(indelSize) <= HDR_OVERLAP_FILTER_CUTOFF) return false;
    return indelSize === hdrIndelSize;
  }

  for (const guide of guideTargets) {
    const { cutsite, label } = guide;

    // Deletions
    for (let db = 0; db <= indelMaxSize; db++) {
      for (let da = 0; da <= indelMaxSize; da++) {
        const indelSize = -(db + da);
        if (shouldSkip(indelSize)) continue;
        const p = singleCutProposal(ctrlSeq, ctrlPeakValues, baseOrder, cutsite, label, db, da, 0);
        addProposal(p);
      }
    }

    // Insertions
    for (let ins = 1; ins <= indelMaxSize; ins++) {
      if (shouldSkip(ins)) continue;
      const p = singleCutProposal(ctrlSeq, ctrlPeakValues, baseOrder, cutsite, label, 0, 0, ins);
      addProposal(p);
    }
  }

  return proposals;
}

/**
 * Simple HDR proposal: replace a section of the control sequence
 * near the cutsite with the donor sequence.
 */
function hdrProposalSimple(ctrlSeq, ctrlPeakValues, baseOrder, donorSeq) {
  // Find the donor's alignment to control by matching first/last 10 bp of donor
  const leftArm  = donorSeq.slice(0, 15);
  const rightArm = donorSeq.slice(-15);

  const leftPos  = ctrlSeq.indexOf(leftArm);
  const rightEnd = ctrlSeq.lastIndexOf(rightArm);

  if (leftPos < 0 || rightEnd < 0 || rightEnd <= leftPos) {
    // Can't anchor donor — use full donor as the proposed sequence
    const seqData = donorSeq.split('').map((b, i) => ({ base: b, type: 'hdr', origIdx: -1 }));
    const trace   = seqData.flatMap(sd => {
      return baseOrder.split('').map(b => (b === sd.base ? 1.0 : 0.0));
    });
    return {
      sequence: donorSeq,
      traceData: trace,
      seqData,
      cutsite: -1,
      basesChanged: 'HDR',
      summary: 'HDR',
      summaryJson: { total: 'HDR', details: [] },
      wildtype: false,
      isHdr: true,
      guideLabel: 'HDR',
    };
  }

  // Build: ctrlSeq[0..leftPos] + donorSeq + ctrlSeq[rightEnd+15..]
  const leftCtrl  = ctrlSeq.slice(0, leftPos);
  const rightCtrl = ctrlSeq.slice(rightEnd + 15);
  const editedSeq = leftCtrl + donorSeq + rightCtrl;

  const seqData = [];
  for (let i = 0; i < leftCtrl.length; i++)
    seqData.push({ base: leftCtrl[i], type: 'wildtype', origIdx: i });
  for (let i = 0; i < donorSeq.length; i++)
    seqData.push({ base: donorSeq[i], type: 'hdr', origIdx: -1 });
  const rightStart = rightEnd + 15;
  for (let i = 0; i < rightCtrl.length; i++)
    seqData.push({ base: rightCtrl[i], type: 'wildtype', origIdx: rightStart + i });

  const trace = seqData.flatMap(sd => {
    if (sd.type === 'hdr') {
      return baseOrder.split('').map(b => (b === sd.base ? 0.97 : 0.01));
    }
    return baseOrder.split('').map(b => ctrlPeakValues[b]?.[sd.origIdx] ?? 0);
  });

  return {
    sequence: editedSeq,
    traceData: trace,
    seqData,
    cutsite: leftPos + donorSeq.length - 1,
    basesChanged: editedSeq.length - ctrlSeq.length,
    summary: 'HDR',
    summaryJson: { total: editedSeq.length - ctrlSeq.length, details: [{ label: 'HDR', value: editedSeq.length - ctrlSeq.length }] },
    wildtype: false,
    isHdr: true,
    guideLabel: 'HDR',
  };
}

// ── Coefficient matrix + outcome vector ─────────────────────────────────────

/**
 * Build the coefficient matrix A (proposals × trace positions in inference window).
 * Each row is one proposal's normalised trace values in the inference window.
 * Returns the matrix transposed for NNLS: shape = (4*iw_length) × numProposals
 */
function buildCoefficientMatrix(proposals, inferenceWindow) {
  const [iw0, iw1] = inferenceWindow;
  const iwLen       = iw1 - iw0;
  const numProposals = proposals.length;
  const numFeatures  = 4 * iwLen;

  // output_matrix[proposal_idx][feature_idx]
  const outMatrix = Array.from({ length: numProposals }, () => new Float64Array(numFeatures));

  for (let ep = 0; ep < numProposals; ep++) {
    const trace = proposals[ep].traceData;
    for (let baseIdx = iw0; baseIdx < iw1; baseIdx++) {
      const seqIdx = baseIdx - iw0;
      let sum = 0;
      for (let ci = 0; ci < 4; ci++) {
        const v = trace[baseIdx * 4 + ci] ?? 0;
        outMatrix[ep][seqIdx * 4 + ci] = v;
        sum += v;
      }
      // Normalise
      if (sum > 0) {
        for (let ci = 0; ci < 4; ci++) {
          outMatrix[ep][seqIdx * 4 + ci] = (outMatrix[ep][seqIdx * 4 + ci] / sum) * 100;
        }
      }
    }
  }

  // Transpose: A_T[feature_idx][proposal_idx]
  const AT = Array.from({ length: numFeatures }, () => new Float64Array(numProposals));
  for (let ep = 0; ep < numProposals; ep++) {
    for (let fi = 0; fi < numFeatures; fi++) {
      AT[fi][ep] = outMatrix[ep][fi];
    }
  }

  return AT; // m×n where m=features, n=proposals
}

/**
 * Build the observed (b) vector from the edited sample's peak values,
 * mapped through the alignment to the inference window on the control.
 */
function buildOutcomesVector(editedPeakValues, baseOrder, alignmentPairs, inferenceWindow) {
  const [iw0, iw1] = inferenceWindow;
  const iwLen       = iw1 - iw0;
  const output      = new Float64Array(4 * iwLen);

  let lastGoodRefIdx = -1;
  let filled = 0;

  for (const [refIdx, sampleIdx] of alignmentPairs) {
    const r = refIdx !== null ? refIdx : lastGoodRefIdx;
    if (refIdx !== null) lastGoodRefIdx = refIdx;

    if (r >= iw0 && filled < iwLen * 4) {
      const seqIdx = r - iw0;
      if (seqIdx >= 0 && seqIdx < iwLen && sampleIdx !== null) {
        for (let ci = 0; ci < 4; ci++) {
          const base = baseOrder[ci];
          const val  = editedPeakValues[base]?.[sampleIdx] ?? 0;
          output[seqIdx * 4 + ci] = val;
        }
        filled += 4;
      }
    }
    if (filled >= iwLen * 4) break;
  }

  // Normalise each position
  for (let seqIdx = 0; seqIdx < iwLen; seqIdx++) {
    let sum = 0;
    for (let ci = 0; ci < 4; ci++) sum += output[seqIdx * 4 + ci];
    if (sum > 0) {
      for (let ci = 0; ci < 4; ci++) output[seqIdx * 4 + ci] = (output[seqIdx * 4 + ci] / sum) * 100;
    }
  }

  return output;
}

// ── Discordance calculation ────────────────────────────────────────────────────

/**
 * Calculate discordance per position: fraction of signal NOT matching the called base.
 * Mirrors ICE's discordance calculation used for the discordance plot.
 *
 * @param {object} peakValues — { A: [], C: [], G: [], T: [] }
 * @param {string} baseCalls  — called base string
 * @returns {number[]} discordance per base (0 = perfect, 1 = all signal is non-reference)
 */
function calcDiscordance(peakValues, baseCalls) {
  const n = baseCalls.length;
  const disc = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const base = baseCalls[i].toUpperCase();
    const vals = { A: peakValues.A[i] ?? 0, C: peakValues.C[i] ?? 0,
                   G: peakValues.G[i] ?? 0, T: peakValues.T[i] ?? 0 };
    const total = vals.A + vals.C + vals.G + vals.T;
    if (total === 0) { disc[i] = 0; continue; }
    const refVal = vals[base] ?? 0;
    disc[i] = 1 - (refVal / total);
  }
  return disc;
}

// ── ICE score ─────────────────────────────────────────────────────────────────

function computeIceScore(normX, proposals) {
  let wtFrac = 0;
  for (let i = 0; i < proposals.length; i++) {
    if (proposals[i].wildtype) wtFrac += normX[i];
  }
  const editEff = 1 - wtFrac;
  return Math.round(editEff * 100);
}

function computeKoScore(normX, proposals) {
  // KO score: contribution of proposals causing a frameshift (indel not divisible by 3)
  let koFrac = 0;
  for (let i = 0; i < proposals.length; i++) {
    const bc = proposals[i].basesChanged;
    if (typeof bc === 'number' && bc !== 0 && bc % 3 !== 0 && !proposals[i].isHdr) {
      koFrac += normX[i];
    }
  }
  return Math.round(koFrac * 100);
}

function computeHdrScore(normX, proposals) {
  let hdrFrac = 0;
  for (let i = 0; i < proposals.length; i++) {
    if (proposals[i].isHdr) hdrFrac += normX[i];
  }
  return Math.round(hdrFrac * 100);
}

function computeRSquared(A_T, b, x, proposals) {
  // R² = 1 - SS_res / SS_tot
  const m = b.length;

  // Predicted = A·x  (A is transposed, so AT[feature][proposal])
  const predicted = new Float64Array(m);
  for (let fi = 0; fi < m; fi++) {
    for (let p = 0; p < proposals.length; p++) {
      predicted[fi] += A_T[fi][p] * x[p];
    }
  }

  const mean = b.reduce((a, c) => a + c, 0) / m;
  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < m; i++) {
    ssTot += (b[i] - mean) ** 2;
    ssRes += (b[i] - predicted[i]) ** 2;
  }
  return ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
}

// ── Inference window ─────────────────────────────────────────────────────────

function determineInferenceWindow(ctrlPhred, ctrlBaseCalls, cutsite, proposals, indelMaxSize, alignmentPairs, lastAlignedPairIdx) {
  const QUAL_CUTOFF = 35;
  const { maxWindow: ctrlQualWindow } = findAlignableWindow(ctrlPhred, 10, QUAL_CUTOFF);

  // Determine the minimum indel sequence length
  let minIndelSeqLen = Infinity;
  for (const p of proposals) {
    if (p.sequence.length < minIndelSeqLen) minIndelSeqLen = p.sequence.length;
  }
  if (!isFinite(minIndelSeqLen)) minIndelSeqLen = ctrlBaseCalls.length;

  // Left boundary: 10 bp before cutsite
  const leftOffset = Math.max(0, cutsite - 10);

  // Right boundary
  let iwRight;
  if (ctrlQualWindow && ctrlQualWindow[1] > cutsite) {
    iwRight = Math.min(cutsite + MAX_BASES_AFTER_CUTSITE, ctrlQualWindow[1], minIndelSeqLen);
  } else {
    iwRight = Math.min(cutsite + MAX_BASES_AFTER_CUTSITE, minIndelSeqLen);
  }

  // Don't go past the last aligned base - 10
  const lastAlignedCtrlBase = alignmentPairs[lastAlignedPairIdx]?.[0] ?? ctrlBaseCalls.length - 1;
  iwRight = Math.min(iwRight, lastAlignedCtrlBase - 10);

  return [leftOffset, Math.max(leftOffset + 10, iwRight)];
}

// ── Main analysis function ────────────────────────────────────────────────────

/**
 * Run the full ICE analysis.
 *
 * @param {object} controlParsed  — output of parseAb1()
 * @param {object} editedParsed   — output of parseAb1()
 * @param {string|string[]} guideSequences — one or more guide sequences
 * @param {object} [options]
 *   @param {string}  [options.donorSeq]      — optional ssODN/donor for HDR analysis
 *   @param {number}  [options.indelMaxSize]  — max indel size to consider (default 20)
 *   @param {boolean} [options.verbose]
 * @returns {object} ICE result
 */
export function analyzeIce(controlParsed, editedParsed, guideSequences, options = {}) {
  const { donorSeq = null, indelMaxSize = INDEL_MAX_SIZE_DEFAULT, verbose = false } = options;

  const warnings = [];
  const log = verbose ? console.log : () => {};

  // ── Normalise guide sequences ─────────────────────────────────────────────
  const guides = (Array.isArray(guideSequences) ? guideSequences : [guideSequences])
    .map(g => normaliseGuide(g))
    .filter(g => g.length > 0);

  if (guides.length === 0) throw new Error('No valid guide sequences provided');

  // ── Prepare chromatogram data ─────────────────────────────────────────────
  const ctrlPhred  = getPhredScores(controlParsed);
  const editPhred  = getPhredScores(editedParsed);
  const ctrlBases  = controlParsed.baseCalls.toUpperCase();
  const editBases  = editedParsed.baseCalls.toUpperCase();

  const ctrlPeaks  = getPeakValues(controlParsed);
  const editPeaks  = getPeakValues(editedParsed);

  // Use the control's base order for consistent indexing
  const baseOrder  = controlParsed.baseOrder || BASE_ORDER_DEFAULT;

  log('Control bases length:', ctrlBases.length);
  log('Edited  bases length:', editBases.length);

  // ── Quality check on edited sample ───────────────────────────────────────
  const editQualResult = findAlignableWindow(editPhred, 30, 40);
  if (!editQualResult.maxWindow) {
    warnings.push('Edited sample quality scores too low for reliable alignment');
  } else if ((editQualResult.maxWindow[1] - editQualResult.maxWindow[0]) < MIN_ALN_WINDOW_SIZE) {
    warnings.push(`Edited sample high-quality window (${editQualResult.maxWindow[1] - editQualResult.maxWindow[0]} bp) is smaller than recommended ${MIN_ALN_WINDOW_SIZE} bp`);
  }

  // ── Find guide targets ────────────────────────────────────────────────────
  const guideTargets = [];
  for (let gi = 0; gi < guides.length; gi++) {
    const label = `g${gi + 1}`;
    const gt = findGuideInSequence(guides[gi], ctrlBases, label);
    guideTargets.push(gt);
    warnings.push(...gt.warnings);
  }
  // Sort by cutsite
  guideTargets.sort((a, b) => a.cutsite - b.cutsite);
  const primaryCutsite = guideTargets[0].cutsite;

  log('Primary cutsite:', primaryCutsite);

  // ── Find alignment window (high-quality region BEFORE cutsite) ───────────
  const ctrlQualResult = findAlignableWindow(ctrlPhred, 30, 40);
  let alnWindowEnd = primaryCutsite;
  if (ctrlQualResult.maxWindow) {
    alnWindowEnd = Math.min(primaryCutsite, ctrlQualResult.maxWindow[1]);
  }
  const alnWindowStart = Math.max(0, alnWindowEnd - 200); // up to 200 bp upstream
  const alnWindow = [alnWindowStart, alnWindowEnd];
  log('Alignment window:', alnWindow);

  // ── Align control to edited ───────────────────────────────────────────────
  const alnResult = alignWithWindow(ctrlBases, editBases, alnWindow);
  if (!alnResult.success) {
    warnings.push('Alignment warning: ' + alnResult.message);
    // Fallback: identity alignment
    alnResult.pairs = Array.from({ length: Math.max(ctrlBases.length, editBases.length) },
      (_, i) => [i < ctrlBases.length ? i : null, i < editBases.length ? i : null]);
    alnResult.lastAlignedPairIdx = Math.min(ctrlBases.length, editBases.length) - 1;
  }

  // ── Generate edit proposals ────────────────────────────────────────────────
  const proposals = generateEditProposals(
    ctrlBases, ctrlPeaks, baseOrder,
    guideTargets, indelMaxSize, donorSeq
  );
  log('Proposals generated:', proposals.length);

  // ── Determine inference window ────────────────────────────────────────────
  const inferenceWindow = determineInferenceWindow(
    ctrlPhred, ctrlBases, primaryCutsite,
    proposals, indelMaxSize,
    alnResult.pairs, alnResult.lastAlignedPairIdx
  );
  log('Inference window:', inferenceWindow);

  // Warn if window is short
  const iwLen = inferenceWindow[1] - inferenceWindow[0];
  if (iwLen < indelMaxSize * 3) {
    warnings.push(`Inference window (${iwLen} bp) is less than 3× indel_max_size (${indelMaxSize}). Results may be imprecise.`);
  }

  // ── Build NNLS matrices ───────────────────────────────────────────────────
  const A_T = buildCoefficientMatrix(proposals, inferenceWindow);
  const b   = buildOutcomesVector(editPeaks, baseOrder, alnResult.pairs, inferenceWindow);

  log('NNLS matrix shape:', A_T.length, '×', A_T[0]?.length);

  // ── Solve NNLS ────────────────────────────────────────────────────────────
  const { x, residual } = nnls(A_T, b);
  const normX = normaliseCoefficients(x);

  // ── Compute scores ────────────────────────────────────────────────────────
  const iceScore    = computeIceScore(normX, proposals);
  const koScore     = computeKoScore(normX, proposals);
  const hdrScore    = donorSeq ? computeHdrScore(normX, proposals) : null;
  const rSquared    = computeRSquared(A_T, b, normX, proposals);
  const iceDScore   = Math.min(100, Math.round(iceScore * ICE_D_CORRECTION));

  // ── ICE-D (donor-adjusted) score ─────────────────────────────────────────
  // If HDR present: ICE-D = iceScore * correction factor, capped at 100

  // ── Build allele contributions table ─────────────────────────────────────
  const contribs = proposals
    .map((p, i) => ({
      contribution: normX[i],
      percent: Math.round(normX[i] * 1000) / 10,
      basesChanged: p.basesChanged,
      summary: p.summary,
      sequence: p.sequence.slice(
        Math.max(0, primaryCutsite - 20),
        Math.min(p.sequence.length, primaryCutsite + 40)
      ),
      wildtype: p.wildtype,
      isHdr: p.isHdr || false,
      guideLabel: p.guideLabel,
    }))
    .filter(c => c.contribution > 0.001)
    .sort((a, b) => b.contribution - a.contribution);

  // ── Indel distribution (binned by size) ──────────────────────────────────
  const indelBins = new Map(); // size → total fraction
  for (let i = 0; i < proposals.length; i++) {
    if (normX[i] < 0.001) continue;
    const bc = proposals[i].basesChanged;
    if (proposals[i].wildtype) continue;
    const key = proposals[i].isHdr ? 'HDR' : (typeof bc === 'number' ? bc : 'other');
    indelBins.set(key, (indelBins.get(key) || 0) + normX[i]);
  }
  const indelDistribution = [...indelBins.entries()]
    .map(([size, frac]) => ({ size, percent: Math.round(frac * 1000) / 10 }))
    .sort((a, b) => {
      if (a.size === 'HDR') return -1;
      if (b.size === 'HDR') return 1;
      return (typeof a.size === 'number' ? a.size : 0) - (typeof b.size === 'number' ? b.size : 0);
    });

  // ── Discordance vectors ────────────────────────────────────────────────────
  const ctrlDiscordance  = calcDiscordance(ctrlPeaks, ctrlBases);
  const editDiscordance  = calcDiscordance(editPeaks, editBases);

  // Compute mean discord before/after cutsite
  const discBefore = ctrlDiscordance.slice(0, primaryCutsite);
  const discAfter  = editDiscordance.slice(primaryCutsite);
  const meanBefore = discBefore.length > 0 ? discBefore.reduce((a, b) => a + b, 0) / discBefore.length : 0;
  const meanAfter  = discAfter.length  > 0 ? discAfter.reduce((a, b) => a + b, 0)  / discAfter.length  : 0;

  // ── Trace data for visualisation (trimmed around cutsite) ─────────────────
  const TRACE_PAD = 80;
  const traceStart = Math.max(0, primaryCutsite - TRACE_PAD);
  const traceEnd   = Math.min(ctrlBases.length - 1, primaryCutsite + TRACE_PAD);

  function sliceTrace(parsed, start, end) {
    const peaks = getPeakValues(parsed);
    const ploc  = parsed.peakLocations.slice(start, end + 1);
    const rawLen = parsed.traceLen;
    const ts    = ploc[0] ?? 0;
    const te    = ploc[ploc.length - 1] ?? rawLen - 1;
    return {
      A: Array.from(parsed.trace.A ?? []).slice(ts, te + 1),
      C: Array.from(parsed.trace.C ?? []).slice(ts, te + 1),
      G: Array.from(parsed.trace.G ?? []).slice(ts, te + 1),
      T: Array.from(parsed.trace.T ?? []).slice(ts, te + 1),
      baseCalls:     parsed.baseCalls.slice(start, end + 1),
      peakLocations: ploc.map(p => p - ts),
      baseStart: start,
    };
  }

  const ctrlTraceSlice = sliceTrace(controlParsed, traceStart, traceEnd);
  const editTraceSlice = sliceTrace(editedParsed,  traceStart, Math.min(traceEnd, editBases.length - 1));

  // ── Build return object ────────────────────────────────────────────────────
  return {
    // Scores
    ice:         iceScore,
    iceD:        iceDScore,
    ko:          koScore,
    hdr:         hdrScore,
    rSquared:    parseFloat(rSquared.toFixed(4)),
    // Discordance
    meanDiscordBefore: parseFloat(meanBefore.toFixed(4)),
    meanDiscordAfter:  parseFloat(meanAfter.toFixed(4)),
    ctrlDiscordance,
    editDiscordance,
    // Guide info
    guideTargets: guideTargets.map(g => ({
      label: g.label, guideSeq: g.guideSeq, cutsite: g.cutsite,
      orientation: g.orientation, guideStart: g.guideStart, guideEnd: g.guideEnd,
    })),
    primaryCutsite,
    // Allele contributions
    contribs,
    indelDistribution,
    // Window info
    inferenceWindow,
    alignmentWindow: alnWindow,
    // Trace data for chromatogram viewer
    ctrlTrace: ctrlTraceSlice,
    editTrace: editTraceSlice,
    traceStart,  // ctrl base index where trace window begins
    // Raw details
    proposals: proposals.map((p, i) => ({
      summary: p.summary, sequence: p.sequence.slice(0, 80),
      basesChanged: p.basesChanged, wildtype: p.wildtype, isHdr: p.isHdr || false,
      contrib: normX[i],
    })).filter(p => p.contrib > 0.001),
    warnings,
    // Sample names
    controlName: controlParsed.sampleName || 'Control',
    editedName:  editedParsed.sampleName  || 'Edited',
  };
}

/**
 * Analyse multiple samples at once.
 * Each sample: { controlParsed, editedParsed, guideSequences, label, options }
 * Returns array of { label, result, error }
 */
export async function analyzeBatch(samples) {
  const results = [];
  for (const s of samples) {
    try {
      const result = analyzeIce(s.controlParsed, s.editedParsed, s.guideSequences, s.options || {});
      results.push({ label: s.label || s.editedName || `Sample ${results.length + 1}`, result, error: null });
    } catch (err) {
      results.push({ label: s.label || `Sample ${results.length + 1}`, result: null, error: err.message });
    }
  }
  return results;
}
