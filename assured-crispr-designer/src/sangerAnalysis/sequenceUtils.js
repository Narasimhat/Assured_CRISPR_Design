/**
 * Assured Sanger Analyser — Sequence utilities
 * Pure-JS sequence manipulation: RNA→DNA, reverse complement,
 * Smith-Waterman local alignment, quality-window detection.
 */

// ── Basic sequence ops ───────────────────────────────────────────────────────

export const COMPLEMENT = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N', U: 'A' };

export function rna2dna(seq) {
  return seq.toUpperCase().replace(/U/g, 'T');
}

export function reverseComplement(seq) {
  return seq
    .toUpperCase()
    .split('')
    .reverse()
    .map(b => COMPLEMENT[b] || 'N')
    .join('');
}

export function normaliseGuide(seq) {
  return rna2dna(seq.trim().toUpperCase());
}

// ── Running mean ─────────────────────────────────────────────────────────────

export function runningMean(arr, windowSize) {
  const result = new Array(arr.length).fill(0);
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
    if (i >= windowSize) sum -= arr[i - windowSize];
    if (i >= windowSize - 1) {
      result[i] = sum / windowSize;
    } else {
      result[i] = sum / (i + 1);
    }
  }
  return result;
}

/**
 * Find contiguous regions where values exceed threshold.
 * Returns array of [start, end] inclusive pairs.
 */
export function findRegionsAbove(arr, threshold) {
  const regions = [];
  let inRegion = false;
  let start = 0;
  for (let i = 0; i < arr.length; i++) {
    if (!inRegion && arr[i] > threshold) {
      inRegion = true;
      start = i;
    } else if (inRegion && arr[i] <= threshold) {
      regions.push([start, i - 1]);
      inRegion = false;
    }
  }
  if (inRegion) regions.push([start, arr.length - 1]);
  return regions;
}

/**
 * Find the largest high-quality window in a phred array.
 * Mirrors ICE SangerObject.find_alignable_window().
 *
 * @param {number[]} phredScores
 * @param {number} windowSize — sliding average window (default 30)
 * @param {number} qualCutoff — minimum windowed phred to qualify (default 40)
 * @returns {{ maxWindow: [number,number]|null, regions: [number,number][], windowedPhred: number[] }}
 */
export function findAlignableWindow(phredScores, windowSize = 30, qualCutoff = 40) {
  const windowed = runningMean(phredScores, windowSize);
  const regions = findRegionsAbove(windowed, qualCutoff);

  let maxSize = 0;
  let maxWindow = null;
  for (const [s, e] of regions) {
    const size = e - s;
    if (size > maxSize) {
      maxSize = size;
      maxWindow = [s, e];
    }
  }

  return { maxWindow, regions, windowedPhred: windowed };
}

// ── Smith-Waterman local alignment ──────────────────────────────────────────
//
// Implements affine-gap (gap-open + gap-extend) Smith-Waterman.
// Mirrors biopython pairwise2.align.localms(seq1, seq2, match, mismatch, open, extend).
//
// Returns { seq1Aln, seq2Aln, score, startSeq1, startSeq2 }
// where seq1Aln / seq2Aln are the aligned strings with '-' for gaps.

const NEG_INF = -1e9;

export function smithWaterman(seq1, seq2, match = 2, mismatch = -1, gapOpen = -3, gapExtend = -1) {
  const m = seq1.length;
  const n = seq2.length;

  // H: best score ending here (match/mismatch)
  // E: best score ending with gap in seq1 (insertion relative to seq1)
  // F: best score ending with gap in seq2 (deletion relative to seq1)
  const H = Array.from({ length: m + 1 }, () => new Float32Array(n + 1));
  const E = Array.from({ length: m + 1 }, () => new Float32Array(n + 1).fill(NEG_INF));
  const F = Array.from({ length: m + 1 }, () => new Float32Array(n + 1).fill(NEG_INF));

  // Traceback: 0=stop, 1=diag, 2=up(gap in seq2/del in seq1), 3=left(gap in seq1/ins)
  const TB = Array.from({ length: m + 1 }, () => new Uint8Array(n + 1));

  let bestScore = 0;
  let bestI = 0, bestJ = 0;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const s = seq1[i - 1] === seq2[j - 1] ? match : mismatch;

      // E[i][j]: gap in seq1 (horizontal gap)
      const eOpen = H[i][j - 1] + gapOpen + gapExtend;
      const eExt  = E[i][j - 1] + gapExtend;
      E[i][j] = Math.max(eOpen, eExt);

      // F[i][j]: gap in seq2 (vertical gap)
      const fOpen = H[i - 1][j] + gapOpen + gapExtend;
      const fExt  = F[i - 1][j] + gapExtend;
      F[i][j] = Math.max(fOpen, fExt);

      const diag = H[i - 1][j - 1] + s;
      const best = Math.max(0, diag, E[i][j], F[i][j]);
      H[i][j] = best;

      if (best === 0)              TB[i][j] = 0;
      else if (best === diag)      TB[i][j] = 1;
      else if (best === F[i][j])   TB[i][j] = 2; // gap in seq2
      else                         TB[i][j] = 3; // gap in seq1

      if (best > bestScore) {
        bestScore = best;
        bestI = i;
        bestJ = j;
      }
    }
  }

  // Traceback from best cell
  let aln1 = '';
  let aln2 = '';
  let i = bestI, j = bestJ;

  while (i > 0 && j > 0 && H[i][j] > 0) {
    const tb = TB[i][j];
    if (tb === 1) {
      aln1 = seq1[i - 1] + aln1;
      aln2 = seq2[j - 1] + aln2;
      i--; j--;
    } else if (tb === 2) {
      aln1 = seq1[i - 1] + aln1;
      aln2 = '-' + aln2;
      i--;
    } else if (tb === 3) {
      aln1 = '-' + aln1;
      aln2 = seq2[j - 1] + aln2;
      j--;
    } else {
      break;
    }
  }

  const startSeq1 = i; // 0-based start in seq1
  const startSeq2 = j; // 0-based start in seq2

  return { seq1Aln: aln1, seq2Aln: aln2, score: bestScore, startSeq1, startSeq2 };
}

/**
 * Build alignment pairs: array of [ctrlIdx, sampleIdx] tuples.
 * Mirrors ICE PairAlignment.align_with_window().
 *
 * This aligns a window of the control sequence to the edited sample, then
 * extrapolates both upstream and downstream to cover the inference region.
 *
 * @param {string} ctrlSeq    — full control called-base sequence
 * @param {string} sampleSeq  — full edited sample called-base sequence
 * @param {[number,number]} alnWindow — [start, end] in ctrl coords (high-quality window before cut)
 * @returns {{ pairs: Array<[number|null, number|null]>, success: boolean, message: string,
 *             lastAlignedPairIdx: number, score: number, scoreNorm: number }}
 */
export function alignWithWindow(ctrlSeq, sampleSeq, alnWindow) {
  const [aw0, aw1] = alnWindow;
  const windowSize = aw1 - aw0;
  if (windowSize <= 0) return { success: false, message: 'Zero-length alignment window', pairs: [] };

  const ctrlWindow = ctrlSeq.slice(aw0, aw1);
  const aln = smithWaterman(ctrlWindow, sampleSeq, 2, -1, -2, -1);

  const scoreNorm = (aln.score / (windowSize * 2)) * 100;
  if (scoreNorm < 50) {
    return {
      success: false,
      message: `Poor alignment upstream of cutsite: ${scoreNorm.toFixed(1)}% of max score`,
      pairs: [], score: aln.score, scoreNorm,
    };
  }

  const src = aln.seq1Aln; // ctrl window portion
  const dst = aln.seq2Aln; // sample portion

  // Build alignment_pairs starting from aw0 in ctrl, aln.startSeq2 in sample
  let refIndex    = aw0;
  let sampleIndex = aln.startSeq2;
  const pairs = [];

  // Track first aligned ctrl base index in dst to back-fill upstream
  let firstAlnedCtrlBase = null;

  for (let alnIdx = 0; alnIdx < dst.length; alnIdx++) {
    const sampleBase = dst[alnIdx];
    const refBase    = src[alnIdx];

    let r = null;
    let s = null;

    if (sampleBase !== '-') { s = sampleIndex++; }
    if (refBase    !== '-') {
      if (firstAlnedCtrlBase === null) firstAlnedCtrlBase = alnIdx;
      r = refIndex++;
    } else if (refIndex >= aw1 && refIndex < ctrlSeq.length) {
      // downstream padding beyond the alignment window
      r = refIndex++;
    }

    pairs.push([r, s]);
  }

  // Back-fill upstream ctrl indices (positions before aw0)
  if (firstAlnedCtrlBase !== null) {
    let alnIdx = firstAlnedCtrlBase - 1;
    let refI   = (pairs[firstAlnedCtrlBase]?.[0] ?? aw0) - 1;
    while (alnIdx >= 0 && refI >= 0) {
      pairs[alnIdx][0] = refI--;
      alnIdx--;
    }
  }

  // Find last pair with both coords non-null
  let lastAlignedPairIdx = 0;
  for (let idx = pairs.length - 1; idx >= 0; idx--) {
    if (pairs[idx][0] !== null && pairs[idx][1] !== null) {
      lastAlignedPairIdx = idx;
      break;
    }
  }

  return { success: true, message: 'Alignment succeeded', pairs, lastAlignedPairIdx, score: aln.score, scoreNorm };
}

/**
 * Convert a ctrl-coordinate to the corresponding sample coordinate
 * using pre-built alignment pairs.
 */
export function ctrl2SampleCoord(pairs, ctrlIdx) {
  for (const [r, s] of pairs) {
    if (r === ctrlIdx) return s;
  }
  return null;
}

/**
 * Build O(1) lookup maps from alignment pairs.
 * Returns { ctrlToSample: Map, sampleToCtrl: Map }
 */
export function buildCoordMaps(pairs) {
  const ctrlToSample = new Map();
  const sampleToCtrl = new Map();
  for (const [r, s] of pairs) {
    ctrlToSample.set(r, s);
    sampleToCtrl.set(s, r);
  }
  return { ctrlToSample, sampleToCtrl };
}
