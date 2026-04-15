const BASES = ["A", "C", "G", "T"];
const DNA_COMPLEMENT = { A: "T", T: "A", C: "G", G: "C", N: "N" };

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function sanitizeDna(value) {
  return String(value || "").toUpperCase().replace(/[^ACGTN]/g, "");
}

export function reverseComplement(sequence) {
  return sanitizeDna(sequence)
    .split("")
    .reverse()
    .map((base) => DNA_COMPLEMENT[base] || "N")
    .join("");
}

function smithWaterman(seq1, seq2, match = 2, mismatch = -1, gapOpen = -3, gapExtend = -1) {
  const m = seq1.length;
  const n = seq2.length;
  const negInf = -1e9;
  const h = Array.from({ length: m + 1 }, () => new Float32Array(n + 1));
  const e = Array.from({ length: m + 1 }, () => new Float32Array(n + 1).fill(negInf));
  const f = Array.from({ length: m + 1 }, () => new Float32Array(n + 1).fill(negInf));
  const tb = Array.from({ length: m + 1 }, () => new Uint8Array(n + 1));
  let bestScore = 0;
  let bestI = 0;
  let bestJ = 0;

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const s = seq1[i - 1] === seq2[j - 1] ? match : mismatch;
      e[i][j] = Math.max(h[i][j - 1] + gapOpen + gapExtend, e[i][j - 1] + gapExtend);
      f[i][j] = Math.max(h[i - 1][j] + gapOpen + gapExtend, f[i - 1][j] + gapExtend);
      const diag = h[i - 1][j - 1] + s;
      const best = Math.max(0, diag, e[i][j], f[i][j]);
      h[i][j] = best;
      tb[i][j] = best === 0 ? 0 : best === diag ? 1 : best === f[i][j] ? 2 : 3;
      if (best > bestScore) {
        bestScore = best;
        bestI = i;
        bestJ = j;
      }
    }
  }

  let seq1Aln = "";
  let seq2Aln = "";
  let i = bestI;
  let j = bestJ;
  while (i > 0 && j > 0 && h[i][j] > 0) {
    const dir = tb[i][j];
    if (dir === 1) {
      seq1Aln = seq1[i - 1] + seq1Aln;
      seq2Aln = seq2[j - 1] + seq2Aln;
      i -= 1;
      j -= 1;
    } else if (dir === 2) {
      seq1Aln = seq1[i - 1] + seq1Aln;
      seq2Aln = `-${seq2Aln}`;
      i -= 1;
    } else if (dir === 3) {
      seq1Aln = `-${seq1Aln}`;
      seq2Aln = seq2[j - 1] + seq2Aln;
      j -= 1;
    } else {
      break;
    }
  }

  return {
    seq1Aln,
    seq2Aln,
    score: bestScore,
    startSeq1: i,
    startSeq2: j,
  };
}

function parseFastaLike(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .filter((line) => !line.startsWith(">"))
    .join("");
  return sanitizeDna(lines);
}

function decodeAscii(bytes) {
  let output = "";
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] === 0) break;
    output += String.fromCharCode(bytes[index]);
  }
  return output;
}

function parseDirectoryEntry(view, offset) {
  let tag = "";
  for (let index = 0; index < 4; index += 1) {
    tag += String.fromCharCode(view.getUint8(offset + index));
  }
  const number = view.getUint32(offset + 4, false);
  const elementType = view.getUint16(offset + 8, false);
  const elementSize = view.getUint16(offset + 10, false);
  const numElements = view.getUint32(offset + 12, false);
  const dataSize = view.getUint32(offset + 16, false);
  const dataOffset = view.getUint32(offset + 20, false);
  const inlineOffset = offset + 20;
  return {
    tag,
    number,
    elementType,
    elementSize,
    numElements,
    dataSize,
    dataOffset: dataSize <= 4 ? inlineOffset : dataOffset,
  };
}

function readByteSlice(view, offset, length) {
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) {
    bytes[index] = view.getUint8(offset + index);
  }
  return bytes;
}

function readEntryValue(view, entry) {
  const count = entry.numElements || 0;
  const offset = entry.dataOffset;
  switch (entry.elementType) {
    case 1:
    case 2:
    case 18:
    case 19:
      return decodeAscii(readByteSlice(view, offset, entry.dataSize));
    case 3: {
      const values = [];
      for (let index = 0; index < count; index += 1) {
        values.push(view.getUint16(offset + (index * 2), false));
      }
      return values;
    }
    case 4: {
      const values = [];
      for (let index = 0; index < count; index += 1) {
        values.push(view.getInt16(offset + (index * 2), false));
      }
      return values;
    }
    case 5: {
      const values = [];
      for (let index = 0; index < count; index += 1) {
        values.push(view.getInt32(offset + (index * 4), false));
      }
      return values;
    }
    case 7: {
      const values = [];
      for (let index = 0; index < count; index += 1) {
        values.push(view.getFloat32(offset + (index * 4), false));
      }
      return values;
    }
    case 10:
      return readByteSlice(view, offset, entry.dataSize);
    default:
      return readByteSlice(view, offset, entry.dataSize);
  }
}

function localPeak(trace, center) {
  if (!trace?.length) return 0;
  const start = clamp(Math.round(center) - 2, 0, trace.length - 1);
  const end = clamp(Math.round(center) + 2, 0, trace.length - 1);
  let peak = 0;
  for (let index = start; index <= end; index += 1) {
    peak = Math.max(peak, Number(trace[index]) || 0);
  }
  return peak;
}

function normalizeVector(vector) {
  const total = BASES.reduce((accumulator, base) => accumulator + (vector[base] || 0), 0);
  if (!total) return { A: 0, C: 0, G: 0, T: 0 };
  return {
    A: (vector.A || 0) / total,
    C: (vector.C || 0) / total,
    G: (vector.G || 0) / total,
    T: (vector.T || 0) / total,
  };
}

function buildBaseCallVector(base, intensities, quality, position, index) {
  return {
    index,
    base,
    quality: Number(quality) || 0,
    position,
    intensities,
    normalized: normalizeVector(intensities),
  };
}

function buildSyntheticTraceFromSequence(sequence, sourceName = "sequence.txt") {
  const cleanSequence = parseFastaLike(sequence);
  if (!cleanSequence) {
    throw new Error("No DNA sequence was found in the pasted text.");
  }
  const baseCalls = cleanSequence.split("").map((base, index) => {
    const intensities = {
      A: base === "A" ? 1 : 0,
      C: base === "C" ? 1 : 0,
      G: base === "G" ? 1 : 0,
      T: base === "T" ? 1 : 0,
    };
    return buildBaseCallVector(base, intensities, 40, index * 12, index);
  });
  return {
    fileName: sourceName,
    format: "text",
    sequence: cleanSequence,
    baseCalls,
    channelOrder: "ACGT",
    rawTrace: { A: [], C: [], G: [], T: [] },
  };
}

export function parseAb1(arrayBuffer, fileName = "trace.ab1") {
  const view = new DataView(arrayBuffer);
  const magic = decodeAscii(readByteSlice(view, 0, 4));
  if (magic !== "ABIF") {
    throw new Error("The uploaded file is not a valid AB1/ABIF trace.");
  }

  const rootEntry = parseDirectoryEntry(view, 6);
  const directoryCount = rootEntry.numElements;
  const directoryOffset = rootEntry.dataOffset;
  const entries = new Map();

  for (let index = 0; index < directoryCount; index += 1) {
    const entry = parseDirectoryEntry(view, directoryOffset + (index * 28));
    entries.set(`${entry.tag}${entry.number}`, entry);
  }

  const getEntryValue = (...keys) => {
    for (const key of keys) {
      const entry = entries.get(key);
      if (entry) return readEntryValue(view, entry);
    }
    return null;
  };

  const sequence = sanitizeDna(getEntryValue("PBAS2", "PBAS1"));
  const positions = getEntryValue("PLOC2", "PLOC1") || [];
  const qualities = getEntryValue("PCON2", "PCON1") || [];
  const channelOrder = String(getEntryValue("FWO_1") || "GATC").slice(0, 4);
  const dataEntries = [9, 10, 11, 12].map((number) => getEntryValue(`DATA${number}`) || []);
  const channels = { A: [], C: [], G: [], T: [] };

  for (let index = 0; index < 4; index += 1) {
    const base = channelOrder[index];
    if (BASES.includes(base)) {
      channels[base] = dataEntries[index];
    }
  }

  if (!sequence || !positions.length) {
    throw new Error("The AB1 trace is missing called bases or peak locations.");
  }

  const maxLength = Math.min(sequence.length, positions.length);
  const baseCalls = [];
  for (let index = 0; index < maxLength; index += 1) {
    const base = sequence[index];
    const position = Number(positions[index]) || 0;
    const intensities = {
      A: localPeak(channels.A, position),
      C: localPeak(channels.C, position),
      G: localPeak(channels.G, position),
      T: localPeak(channels.T, position),
    };
    baseCalls.push(buildBaseCallVector(base, intensities, qualities[index], position, index));
  }

  return {
    fileName,
    format: "ab1",
    sequence: sequence.slice(0, baseCalls.length),
    baseCalls,
    channelOrder,
    rawTrace: channels,
  };
}

export async function readSangerInputFromFile(file) {
  if (!file) return null;
  const extension = String(file.name || "").toLowerCase();
  if (extension.endsWith(".ab1")) {
    return parseAb1(await file.arrayBuffer(), file.name);
  }
  return buildSyntheticTraceFromSequence(await file.text(), file.name);
}

export function buildSangerInputFromText(text, sourceName) {
  if (!String(text || "").trim()) return null;
  return buildSyntheticTraceFromSequence(text, sourceName);
}

function vectorToArray(vector) {
  return [vector.A || 0, vector.C || 0, vector.G || 0, vector.T || 0];
}

function flattenVectors(vectors) {
  const flattened = [];
  for (const vector of vectors) {
    flattened.push(vector.A || 0, vector.C || 0, vector.G || 0, vector.T || 0);
  }
  return flattened;
}

function dot(a, b) {
  let total = 0;
  for (let index = 0; index < a.length; index += 1) {
    total += (a[index] || 0) * (b[index] || 0);
  }
  return total;
}

function makeOneHotVector(base) {
  return {
    A: base === "A" ? 1 : 0,
    C: base === "C" ? 1 : 0,
    G: base === "G" ? 1 : 0,
    T: base === "T" ? 1 : 0,
  };
}

function findGuide(sequence, guide) {
  const cleanGuide = sanitizeDna(guide);
  if (!cleanGuide) return null;
  const forwardIndex = sequence.indexOf(cleanGuide);
  if (forwardIndex !== -1) {
    return {
      orientation: "forward",
      start: forwardIndex,
      end: forwardIndex + cleanGuide.length,
      guide: cleanGuide,
    };
  }
  const reverseGuide = reverseComplement(cleanGuide);
  const reverseIndex = sequence.indexOf(reverseGuide);
  if (reverseIndex !== -1) {
    return {
      orientation: "reverse",
      start: reverseIndex,
      end: reverseIndex + reverseGuide.length,
      guide: reverseGuide,
    };
  }
  return null;
}

function resolveCutSite(sequence, guideSequence, manualCutSite, cutOffset) {
  const manualCut = Number(manualCutSite);
  if (manualCut > 0) {
    return {
      cutIndex: manualCut - 1,
      guide: null,
      guideOrientation: "manual",
    };
  }

  const guideHit = findGuide(sequence, guideSequence);
  if (!guideHit) {
    throw new Error("Guide sequence was not found in the control trace. Provide a valid spacer or set the cut site manually.");
  }
  const offset = Number(cutOffset) || 3;
  const cutIndex = guideHit.orientation === "forward"
    ? guideHit.end - offset
    : guideHit.start + offset - 1;
  return {
    cutIndex,
    guide: guideHit.guide,
    guideOrientation: guideHit.orientation,
  };
}

function resolveAnchorOffset(controlSequence, editedSequence, cutIndex) {
  const candidateLengths = [28, 24, 20, 16, 12];
  for (const length of candidateLengths) {
    const anchorStart = Math.max(0, cutIndex - length - 8);
    const anchor = controlSequence.slice(anchorStart, anchorStart + length);
    if (!anchor) continue;
    const editedIndex = editedSequence.indexOf(anchor);
    if (editedIndex !== -1) {
      return {
        offset: editedIndex - anchorStart,
        anchor,
        anchorStart,
      };
    }
  }
  return {
    offset: 0,
    anchor: "",
    anchorStart: 0,
  };
}

function getWindowVectors(sample, start, length) {
  const vectors = [];
  for (let index = 0; index < length; index += 1) {
    const baseCall = sample.baseCalls[start + index];
    vectors.push(baseCall?.normalized || { A: 0, C: 0, G: 0, T: 0 });
  }
  return vectors;
}

function topBaseCandidates(vector, limit = 2) {
  return BASES
    .map((base) => ({ base, value: vector?.[base] || 0 }))
    .sort((left, right) => right.value - left.value)
    .slice(0, limit)
    .filter((entry) => entry.value > 0);
}

function buildInsertionCandidates(editedVectors, maxInsertion) {
  const insertionCandidates = [];
  for (let size = 1; size <= maxInsertion; size += 1) {
    let combos = [""];
    for (let index = 0; index < size; index += 1) {
      const candidates = topBaseCandidates(editedVectors[index], size === 1 ? 4 : 2);
      if (!candidates.length) {
        combos = [];
        break;
      }
      const nextCombos = [];
      for (const combo of combos) {
        for (const candidate of candidates) {
          nextCombos.push(`${combo}${candidate.base}`);
        }
      }
      combos = nextCombos.slice(0, 16);
    }
    for (const combo of combos) {
      insertionCandidates.push(combo);
    }
  }
  return insertionCandidates;
}

function buildProposalVector(proposal, controlBaseCalls, windowStart, windowLength, cutIndex) {
  const vectors = [];
  for (let refIndex = windowStart; refIndex < windowStart + windowLength; refIndex += 1) {
    if (refIndex < cutIndex || proposal.type === "wt") {
      vectors.push(controlBaseCalls[refIndex]?.normalized || { A: 0, C: 0, G: 0, T: 0 });
      continue;
    }

    if (proposal.type === "del") {
      const shiftedIndex = refIndex + proposal.size;
      vectors.push(controlBaseCalls[shiftedIndex]?.normalized || { A: 0, C: 0, G: 0, T: 0 });
      continue;
    }

    if (proposal.type === "dropout") {
      const dropoutSize = proposal.rightCutIndex - proposal.leftCutIndex;
      const shiftedIndex = refIndex + dropoutSize;
      vectors.push(controlBaseCalls[shiftedIndex]?.normalized || { A: 0, C: 0, G: 0, T: 0 });
      continue;
    }

    if (proposal.type === "hdr") {
      const donorVector = proposal.donorVectors?.[refIndex];
      vectors.push(donorVector || controlBaseCalls[refIndex]?.normalized || { A: 0, C: 0, G: 0, T: 0 });
      continue;
    }

    const relativePosition = refIndex - cutIndex;
    if (relativePosition < proposal.inserted.length) {
      vectors.push(makeOneHotVector(proposal.inserted[relativePosition]));
      continue;
    }
    const shiftedIndex = refIndex - proposal.inserted.length;
    vectors.push(controlBaseCalls[shiftedIndex]?.normalized || { A: 0, C: 0, G: 0, T: 0 });
  }
  return vectors;
}

function buildDonorVectors(controlSequence, donorSequence) {
  const donor = sanitizeDna(donorSequence);
  const vectors = {};
  if (!donor) return vectors;
  const seedLength = Math.min(24, Math.max(12, Math.floor(donor.length / 4)));
  const seed = donor.slice(seedLength, seedLength * 2) || donor.slice(0, seedLength);
  const matchIndex = controlSequence.indexOf(seed);
  if (matchIndex === -1) return vectors;
  const donorStart = Math.max(0, matchIndex - seedLength);
  for (let index = 0; index < donor.length; index += 1) {
    const controlIndex = donorStart + index;
    if (controlIndex >= controlSequence.length) break;
    vectors[controlIndex] = makeOneHotVector(donor[index]);
  }
  return vectors;
}

function buildDonorEditMap(controlSequence, donorSequence) {
  const donor = sanitizeDna(donorSequence);
  if (!donor) return { donorVectors: {}, donorEdits: [], donorSpan: null };
  const candidates = [donor, reverseComplement(donor)].map((sequence, index) => ({
    sequence,
    orientation: index === 0 ? "forward" : "reverse",
    alignment: smithWaterman(controlSequence, sequence),
  }));
  const best = candidates.sort((left, right) => right.alignment.score - left.alignment.score)[0];
  if (!best?.alignment?.score) {
    return { donorVectors: {}, donorEdits: [], donorSpan: null };
  }

  const donorVectors = {};
  const donorEdits = [];
  let controlIndex = best.alignment.startSeq1;
  let donorIndex = best.alignment.startSeq2;
  let minControlIndex = Number.POSITIVE_INFINITY;
  let maxControlIndex = -1;

  for (let index = 0; index < best.alignment.seq1Aln.length; index += 1) {
    const controlBase = best.alignment.seq1Aln[index];
    const donorBase = best.alignment.seq2Aln[index];
    const currentControlIndex = controlIndex;

    if (controlBase !== "-") {
      minControlIndex = Math.min(minControlIndex, currentControlIndex);
      maxControlIndex = Math.max(maxControlIndex, currentControlIndex);
    }

    if (controlBase !== "-" && donorBase !== "-") {
      donorVectors[currentControlIndex] = makeOneHotVector(donorBase);
      if (controlBase !== donorBase) {
        const wtBase = controlSequence[currentControlIndex];
        const alignedDonorBase = best.sequence[donorIndex];
        if (wtBase && alignedDonorBase) {
          donorEdits.push({
            position1Based: currentControlIndex + 1,
            wtBase,
            donorBase: alignedDonorBase,
          });
        }
      }
    }

    if (controlBase !== "-") {
      controlIndex += 1;
    }
    if (donorBase !== "-") {
      donorIndex += 1;
    }
  }

  if (!donorEdits.length && !Number.isFinite(minControlIndex)) {
    return { donorVectors: {}, donorEdits: [], donorSpan: null };
  }

  return {
    donorVectors,
    donorEdits,
    donorSpan: Number.isFinite(minControlIndex)
      ? {
        start1Based: minControlIndex + 1,
        end1Based: maxControlIndex + 1,
        orientation: best.orientation,
      }
      : null,
  };
}

function estimateHdrSupport(edited, anchorOffset, donorEdits) {
  if (!donorEdits.length) {
    return {
      estimatedFraction: 0,
      informativeSites: 0,
      meanDonorSignal: 0,
      meanWildTypeSignal: 0,
    };
  }

  const perSite = donorEdits
    .map((edit) => {
      const baseCall = edited.baseCalls[(edit.position1Based - 1) + anchorOffset];
      if (!baseCall?.normalized) return null;
      const donorSignal = baseCall.normalized[edit.donorBase] || 0;
      const wtSignal = baseCall.normalized[edit.wtBase] || 0;
      const totalSignal = ["A", "C", "G", "T"].reduce((sum, base) => sum + (baseCall.normalized[base] || 0), 0);
      const estimatedFraction = donorSignal / Math.max(1e-6, totalSignal);
      return {
        ...edit,
        donorSignal,
        wtSignal,
        totalSignal,
        estimatedFraction,
      };
    })
    .filter(Boolean);

  return {
    estimatedFraction: mean(perSite.map((site) => site.estimatedFraction)),
    informativeSites: perSite.length,
    meanDonorSignal: mean(perSite.map((site) => site.donorSignal)),
    meanWildTypeSignal: mean(perSite.map((site) => site.wtSignal)),
    sites: perSite,
  };
}

function buildAllelePreview(controlSequence, cutIndex, proposal) {
  const left = controlSequence.slice(Math.max(0, cutIndex - 18), cutIndex);
  const right = controlSequence.slice(cutIndex, cutIndex + 28);
  if (proposal.type === "wt") return `${left}|${right}`;
  if (proposal.type === "del") {
    const deleted = controlSequence.slice(cutIndex, cutIndex + proposal.size);
    const after = controlSequence.slice(cutIndex + proposal.size, cutIndex + proposal.size + 28);
    return `${left}|-${deleted || "del"}-${after}`;
  }
  return `${left}|[${proposal.inserted}]${right}`;
}

function buildHdrPreview(controlSequence, cutIndex, donorEdits = []) {
  const windowStart = Math.max(0, cutIndex - 18);
  const windowEnd = Math.min(controlSequence.length, cutIndex + 18);
  const editsByIndex = new Map(
    donorEdits.map((edit) => [edit.position1Based - 1, edit]),
  );
  const preview = [];

  for (let index = windowStart; index < windowEnd; index += 1) {
    if (index === cutIndex) preview.push("|");
    const edit = editsByIndex.get(index);
    if (edit) {
      preview.push(`[${edit.wtBase}>${edit.donorBase}]`);
    } else {
      preview.push(controlSequence[index]);
    }
  }

  if (cutIndex >= windowEnd) {
    preview.push("|");
  }

  return preview.join("");
}

function buildDropoutPreview(controlSequence, leftCutIndex, rightCutIndex) {
  const left = controlSequence.slice(Math.max(0, leftCutIndex - 18), leftCutIndex);
  const removed = controlSequence.slice(leftCutIndex, rightCutIndex);
  const right = controlSequence.slice(rightCutIndex, rightCutIndex + 28);
  return `${left}|<dropout ${removed.length}bp>|${right}`;
}

function buildProposalSet(control, editedVectorsNearCut, options) {
  const proposals = [{
    id: "wt",
    label: "WT",
    type: "wt",
    indelSize: 0,
  }];

  for (let deletionSize = 1; deletionSize <= options.maxDeletion; deletionSize += 1) {
    proposals.push({
      id: `del-${deletionSize}`,
      label: `-${deletionSize}`,
      type: "del",
      size: deletionSize,
      indelSize: -deletionSize,
    });
  }

  for (const inserted of buildInsertionCandidates(editedVectorsNearCut, options.maxInsertion)) {
    proposals.push({
      id: `ins-${inserted}`,
      label: `+${inserted.length} ${inserted}`,
      type: "ins",
      inserted,
      indelSize: inserted.length,
    });
  }

  if (options.enableDropout && Number.isInteger(options.secondaryCutIndex) && options.secondaryCutIndex > options.cutIndex) {
    proposals.push({
      id: "dropout",
      label: `dropout ${options.secondaryCutIndex - options.cutIndex} bp`,
      type: "dropout",
      leftCutIndex: options.cutIndex,
      rightCutIndex: options.secondaryCutIndex,
      indelSize: -(options.secondaryCutIndex - options.cutIndex),
    });
  }

  if (options.donorSequence) {
    proposals.push({
      id: "hdr",
      label: "HDR donor",
      type: "hdr",
      donorSequence: sanitizeDna(options.donorSequence),
      indelSize: 0,
    });
  }

  return proposals.map((proposal) => {
    if (proposal.type === "dropout") {
      return {
        ...proposal,
        preview: buildDropoutPreview(control.sequence, proposal.leftCutIndex, proposal.rightCutIndex),
      };
    }
    if (proposal.type === "hdr") {
      return {
        ...proposal,
        preview: buildHdrPreview(control.sequence, options.cutIndex, options.donorEdits || []),
      };
    }
    return {
      ...proposal,
      preview: buildAllelePreview(control.sequence, options.cutIndex, proposal),
    };
  });
}

function solveNnls(proposalVectors, observedVector) {
  const count = proposalVectors.length;
  const x = new Array(count).fill(0);
  const gram = Array.from({ length: count }, () => new Array(count).fill(0));
  const rhs = new Array(count).fill(0);

  for (let row = 0; row < count; row += 1) {
    rhs[row] = dot(proposalVectors[row], observedVector);
    for (let column = row; column < count; column += 1) {
      const value = dot(proposalVectors[row], proposalVectors[column]);
      gram[row][column] = value;
      gram[column][row] = value;
    }
  }

  for (let iteration = 0; iteration < 160; iteration += 1) {
    let maxDelta = 0;
    for (let index = 0; index < count; index += 1) {
      const diagonal = gram[index][index] || 1;
      let fitted = 0;
      for (let column = 0; column < count; column += 1) {
        fitted += gram[index][column] * x[column];
      }
      const updated = Math.max(0, x[index] + ((rhs[index] - fitted) / diagonal));
      maxDelta = Math.max(maxDelta, Math.abs(updated - x[index]));
      x[index] = updated;
    }
    if (maxDelta < 1e-6) break;
  }

  const total = sum(x);
  if (!total) return x;
  return x.map((value) => value / total);
}

function computeFitScore(observed, reconstructed) {
  const observedMean = mean(observed);
  let residual = 0;
  let total = 0;
  for (let index = 0; index < observed.length; index += 1) {
    residual += (observed[index] - reconstructed[index]) ** 2;
    total += (observed[index] - observedMean) ** 2;
  }
  return total ? 1 - (residual / total) : 0;
}

function weightedVectorMix(proposalVectors, coefficients) {
  const length = proposalVectors[0]?.length || 0;
  const reconstructed = new Array(length).fill(0);
  for (let index = 0; index < proposalVectors.length; index += 1) {
    const weight = coefficients[index] || 0;
    if (!weight) continue;
    for (let position = 0; position < length; position += 1) {
      reconstructed[position] += proposalVectors[index][position] * weight;
    }
  }
  return reconstructed;
}

function compareVectors(left, right) {
  return dot(vectorToArray(left), vectorToArray(right));
}

function buildDiscordanceProfile(controlVectors, editedVectors) {
  return controlVectors.map((vector, index) => ({
    position: index + 1,
    discordance: 1 - compareVectors(vector, editedVectors[index] || { A: 0, C: 0, G: 0, T: 0 }),
  }));
}

function summarizeWarnings(metrics) {
  const warnings = [];
  if (metrics.upstreamSimilarity < 0.82) {
    warnings.push("Weak upstream alignment between control and edited traces. Re-sequence or trim the amplicon closer to the cut site.");
  }
  if (metrics.fitScore < 0.7) {
    warnings.push("Regression fit is modest. Large rearrangements, HDR, mixed amplicons, or poor-quality traces may be present.");
  }
  if (metrics.meanEditedQuality && metrics.meanEditedQuality < 18) {
    warnings.push("Edited trace quality is low near the analysis window. Quantification may be unstable.");
  }
  if (metrics.detectedEditFraction < 0.05) {
    warnings.push("Editing signal is weak. This looks close to wild type or below reliable Sanger deconvolution range.");
  }
  return warnings;
}

function aggregateIndelSpectrum(alleles) {
  const bins = new Map();
  for (const allele of alleles) {
    bins.set(allele.indelSize, (bins.get(allele.indelSize) || 0) + allele.contribution);
  }
  return Array.from(bins.entries())
    .map(([indelSize, contribution]) => ({ indelSize, contribution }))
    .sort((left, right) => left.indelSize - right.indelSize);
}

function buildKnockoutInterpretation(alleles, cutInsideCodingSequence) {
  if (!cutInsideCodingSequence) {
    return {
      enabled: false,
      frameshiftFraction: 0,
      inFrameFraction: 0,
      editedFraction: sum(alleles.filter((allele) => allele.indelSize !== 0).map((allele) => allele.contribution)),
      summary: "Frameshift scoring is disabled because the cut is not marked as coding.",
    };
  }

  let frameshiftFraction = 0;
  let inFrameFraction = 0;
  let editedFraction = 0;
  for (const allele of alleles) {
    if (allele.indelSize === 0) continue;
    editedFraction += allele.contribution;
    if (Math.abs(allele.indelSize) % 3 === 0) {
      inFrameFraction += allele.contribution;
    } else {
      frameshiftFraction += allele.contribution;
    }
  }

  let summary = "Most detected edits are in-frame.";
  if (frameshiftFraction >= 0.6) {
    summary = "Frameshift alleles dominate the edited population.";
  } else if (frameshiftFraction >= 0.35) {
    summary = "The pool contains a meaningful frameshift fraction, but in-frame alleles remain substantial.";
  }

  return {
    enabled: true,
    frameshiftFraction,
    inFrameFraction,
    editedFraction,
    summary,
  };
}

export function analyzeCrisprSanger({
  control,
  edited,
  guideSequence,
  secondaryGuideSequence,
  donorSequence,
  manualCutSite,
  cutOffset = 3,
  maxDeletion = 30,
  maxInsertion = 2,
  upstreamWindow = 25,
  inferenceWindow = 120,
  cutInsideCodingSequence = true,
}) {
  if (!control?.sequence || !edited?.sequence) {
    throw new Error("Both control and edited samples are required.");
  }

  const cutInfo = resolveCutSite(control.sequence, guideSequence, manualCutSite, cutOffset);
  const secondaryCutInfo = secondaryGuideSequence
    ? resolveCutSite(control.sequence, secondaryGuideSequence, "", cutOffset)
    : null;
  const anchorInfo = resolveAnchorOffset(control.sequence, edited.sequence, cutInfo.cutIndex);
  const windowStart = Math.max(0, cutInfo.cutIndex - upstreamWindow);
  const windowLength = Math.min(
    inferenceWindow + upstreamWindow,
    control.baseCalls.length - windowStart,
    edited.baseCalls.length - Math.max(0, windowStart + anchorInfo.offset),
  );
  if (windowLength < 40) {
    throw new Error("The aligned window is too short for analysis. Check sequencing quality or use a longer amplicon.");
  }

  const controlVectors = getWindowVectors(control, windowStart, windowLength);
  const editedVectors = getWindowVectors(edited, Math.max(0, windowStart + anchorInfo.offset), windowLength);
  const observedVector = flattenVectors(editedVectors);
  const editedVectorsNearCut = editedVectors.slice(upstreamWindow, upstreamWindow + Math.max(1, maxInsertion));
  const donorMap = donorSequence ? buildDonorEditMap(control.sequence, donorSequence) : { donorVectors: null, donorEdits: [] };
  const proposals = buildProposalSet(control, editedVectorsNearCut, {
    maxDeletion: clamp(Number(maxDeletion) || 30, 1, 60),
    maxInsertion: clamp(Number(maxInsertion) || 2, 1, 4),
    cutIndex: cutInfo.cutIndex,
    secondaryCutIndex: secondaryCutInfo?.cutIndex ?? null,
    enableDropout: !!secondaryCutInfo,
    donorSequence,
    donorEdits: donorMap.donorEdits,
  });
  const donorVectors = donorMap.donorVectors;
  const hydratedProposals = proposals.map((proposal) => (
    proposal.type === "hdr"
      ? { ...proposal, donorVectors }
      : proposal
  ));

  const proposalVectors = hydratedProposals.map((proposal) => flattenVectors(
    buildProposalVector(proposal, control.baseCalls, windowStart, windowLength, cutInfo.cutIndex),
  ));

  const coefficients = solveNnls(proposalVectors, observedVector);
  const reconstructed = weightedVectorMix(proposalVectors, coefficients);
  const fitScore = computeFitScore(observedVector, reconstructed);

  const alleles = hydratedProposals
    .map((proposal, index) => ({
      id: proposal.id,
      label: proposal.label,
      type: proposal.type,
      indelSize: proposal.indelSize,
      contribution: coefficients[index] || 0,
      preview: proposal.preview,
    }))
    .filter((allele) => allele.contribution > 0.002)
    .sort((left, right) => right.contribution - left.contribution);

  const upstreamSimilarity = mean(controlVectors.slice(0, upstreamWindow).map((vector, index) => compareVectors(vector, editedVectors[index])));
  const downstreamDiscordance = mean(
    controlVectors.slice(upstreamWindow, Math.min(windowLength, upstreamWindow + 50))
      .map((vector, index) => 1 - compareVectors(vector, editedVectors[upstreamWindow + index])),
  );
  const detectedEditFraction = sum(alleles.filter((allele) => allele.indelSize !== 0).map((allele) => allele.contribution));
  const knockout = buildKnockoutInterpretation(alleles, cutInsideCodingSequence);
  const hdr = donorSequence
    ? estimateHdrSupport(edited, anchorInfo.offset, donorMap.donorEdits)
    : null;
  const meanControlQuality = mean(control.baseCalls.slice(windowStart, windowStart + windowLength).map((baseCall) => baseCall.quality).filter(Boolean));
  const meanEditedQuality = mean(
    edited.baseCalls.slice(Math.max(0, windowStart + anchorInfo.offset), Math.max(0, windowStart + anchorInfo.offset) + windowLength)
      .map((baseCall) => baseCall.quality)
      .filter(Boolean),
  );

  const metrics = {
    fitScore,
    upstreamSimilarity,
    downstreamDiscordance,
    detectedEditFraction,
    meanControlQuality,
    meanEditedQuality,
    usableWindowBp: windowLength,
  };

  return {
    control: {
      fileName: control.fileName,
      format: control.format,
      sequenceLength: control.sequence.length,
    },
    edited: {
      fileName: edited.fileName,
      format: edited.format,
      sequenceLength: edited.sequence.length,
    },
    guide: {
      sequence: cutInfo.guide || "",
      orientation: cutInfo.guideOrientation,
      cutSite1Based: cutInfo.cutIndex + 1,
      cutOffset: Number(cutOffset) || 3,
    },
    secondaryGuide: secondaryCutInfo
      ? {
        sequence: secondaryCutInfo.guide || "",
        orientation: secondaryCutInfo.guideOrientation,
        cutSite1Based: secondaryCutInfo.cutIndex + 1,
      }
      : null,
    anchor: anchorInfo,
    metrics,
    warnings: summarizeWarnings(metrics),
    topAlleles: alleles.slice(0, 12),
    indelSpectrum: aggregateIndelSpectrum(alleles),
    knockout,
    hdr: hdr
      ? {
        ...hdr,
        donorEdits: donorMap.donorEdits,
        donorSpan: donorMap.donorSpan,
      }
      : null,
    discordanceProfile: buildDiscordanceProfile(controlVectors, editedVectors),
  };
}

export async function analyzeBatchCrisprSanger({
  controlInput,
  editedInputs,
  guideSequence,
  secondaryGuideSequence,
  donorSequence,
  manualCutSite,
  cutOffset,
  maxDeletion,
  maxInsertion,
  upstreamWindow,
  inferenceWindow,
  cutInsideCodingSequence,
}) {
  if (!controlInput) {
    throw new Error("A control sample is required for batch analysis.");
  }
  if (!editedInputs?.length) {
    throw new Error("At least one edited sample is required for batch analysis.");
  }

  const analyses = editedInputs.map((edited) => analyzeCrisprSanger({
    control: controlInput,
    edited,
    guideSequence,
    secondaryGuideSequence,
    donorSequence,
    manualCutSite,
    cutOffset,
    maxDeletion,
    maxInsertion,
    upstreamWindow,
    inferenceWindow,
    cutInsideCodingSequence,
  }));

  return {
    sampleCount: analyses.length,
    meanEditing: mean(analyses.map((analysis) => analysis.metrics.detectedEditFraction)),
    meanFrameshift: mean(analyses.map((analysis) => analysis.knockout.frameshiftFraction || 0)),
    bestFit: Math.max(...analyses.map((analysis) => analysis.metrics.fitScore)),
    analyses,
  };
}
