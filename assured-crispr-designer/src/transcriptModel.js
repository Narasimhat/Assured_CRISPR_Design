function extractFeatureRanges(loc) {
  const nums = String(loc || "").match(/\d+/g);
  if (!nums || nums.length < 2) return [];
  const ranges = [];
  for (let index = 0; index < nums.length - 1; index += 2) {
    ranges.push([parseInt(nums[index], 10) - 1, parseInt(nums[index + 1], 10)]);
  }
  return ranges;
}

function getGeneNameFromFeatures(features) {
  const geneFeature = features.find((entry) => entry.type === "gene");
  return geneFeature?.q?.label || geneFeature?.q?.gene || "Gene";
}

function getTranscriptIdFromFeatures(features) {
  const mrnaFeature = features.find((entry) => entry.type === "mRNA" || entry.type === "transcript");
  return mrnaFeature?.q?.transcript_id || mrnaFeature?.q?.label || mrnaFeature?.q?.gene || "";
}

function normalizeExons(features) {
  return features
    .filter((feature) => feature.type === "exon")
    .map((feature, index) => {
      const ranges = extractFeatureRanges(feature.loc);
      if (!ranges.length) return null;
      const [start, end] = ranges[0];
      const label = feature.q?.label || `Exon ${index + 1}`;
      const labelMatch = label.match(/Exon\s+(\d+)/i);
      return {
        start,
        end,
        exonNumber: labelMatch ? parseInt(labelMatch[1], 10) : index + 1,
        label,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.start - right.start);
}

function normalizeCds(rawRecord) {
  for (const feature of rawRecord.feats) {
    if (feature.type !== "CDS") continue;
    const cdsSegments = extractFeatureRanges(feature.loc);
    if (!cdsSegments.length) continue;
    let cdsSequence = "";
    for (const [start, end] of cdsSegments) cdsSequence += rawRecord.seq.slice(start, end);
    return {
      cdsSegments,
      cdsSequence,
      proteinLength: Math.floor(cdsSequence.length / 3) - 1,
    };
  }
  return null;
}

function normalizeInterval(input) {
  if (Array.isArray(input) && input.length >= 2) return [Number(input[0]), Number(input[1])];
  if (input && typeof input === "object") return [Number(input.start), Number(input.end)];
  return [NaN, NaN];
}

function normalizeIntervalList(inputs = []) {
  return inputs
    .map(normalizeInterval)
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start)
    .sort((left, right) => left[0] - right[0]);
}

function normalizeExonList(inputs = []) {
  return inputs
    .map((input, index) => {
      const [start, end] = normalizeInterval(input);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
      return {
        start,
        end,
        exonNumber: Number(input?.exonNumber) || index + 1,
        label: input?.label || `Exon ${Number(input?.exonNumber) || index + 1}`,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.start - right.start);
}

function buildCdsSequenceFromSegments(genomicSequence, cdsSegments) {
  let cdsSequence = "";
  for (const [start, end] of cdsSegments) cdsSequence += genomicSequence.slice(start, end);
  return cdsSequence;
}

function buildTranscriptModel({
  gene,
  transcriptId = "",
  proteinLength = null,
  genomicSequence,
  cdsSegments,
  exons = [],
  strand = 1,
  source,
  assembly = "",
  rawFeatures = [],
}) {
  const normalizedSequence = String(genomicSequence || "").toUpperCase();
  if (!normalizedSequence) return null;
  const normalizedCdsSegments = normalizeIntervalList(cdsSegments);
  if (!normalizedCdsSegments.length) return null;
  const cdsSequence = buildCdsSequenceFromSegments(normalizedSequence, normalizedCdsSegments);
  const resolvedProteinLength = Number.isFinite(proteinLength) ? proteinLength : Math.floor(cdsSequence.length / 3) - 1;
  return {
    gene: String(gene || "Gene"),
    transcriptId: String(transcriptId || ""),
    proteinLength: resolvedProteinLength,
    genomicSequence: normalizedSequence,
    cdsSequence,
    cdsSegments: normalizedCdsSegments,
    exons: normalizeExonList(exons),
    strand: strand === -1 ? -1 : 1,
    source: String(source || "unknown"),
    assembly: String(assembly || ""),
    rawFeatures: Array.isArray(rawFeatures) ? rawFeatures : [],
  };
}

export function normalizeGenBankToTranscriptModel(rawRecord) {
  if (!rawRecord?.seq) return null;
  const normalizedCds = normalizeCds(rawRecord);
  if (!normalizedCds) return null;

  const gene = getGeneNameFromFeatures(rawRecord.feats);
  const transcriptId = getTranscriptIdFromFeatures(rawRecord.feats);
  const exons = normalizeExons(rawRecord.feats);

  return buildTranscriptModel({
    gene,
    transcriptId,
    genomicSequence: rawRecord.seq,
    cdsSegments: normalizedCds.cdsSegments,
    exons,
    strand: 1,
    source: "genbank",
    assembly: "",
    rawFeatures: rawRecord.feats,
    proteinLength: normalizedCds.proteinLength,
  });
}

export function getCdsFromModel(model) {
  if (!model) return null;
  if (model.cdsSegments && model.genomicSequence) {
    return {
      segs: model.cdsSegments,
      cds: model.cdsSequence,
      prot: model.proteinLength,
      name: model.gene,
    };
  }
  return null;
}

export function getExonsFromModel(model) {
  return Array.isArray(model?.exons) ? model.exons : [];
}

export function getGenomicSequence(model) {
  return String(model?.genomicSequence || "");
}

export function getCdsSegments(model) {
  return Array.isArray(model?.cdsSegments) ? model.cdsSegments : [];
}

export function getFeatureCount(model) {
  return Array.isArray(model?.rawFeatures) ? model.rawFeatures.length : 0;
}

export function normalizeEnsemblToTranscriptModel(payload) {
  return buildTranscriptModel({
    gene: payload?.gene || payload?.geneSymbol || payload?.displayName,
    transcriptId: payload?.transcriptId || payload?.id || payload?.stableId,
    proteinLength: payload?.proteinLength,
    genomicSequence: payload?.genomicSequence || payload?.sequence,
    cdsSegments: payload?.cdsSegments || payload?.cds || [],
    exons: payload?.exons || [],
    strand: payload?.strand,
    source: "ensembl",
    assembly: payload?.assembly || payload?.assemblyName || "",
    rawFeatures: payload?.rawFeatures || [],
  });
}

export function normalizeNcbiToTranscriptModel(payload) {
  return buildTranscriptModel({
    gene: payload?.gene || payload?.geneSymbol || payload?.symbol,
    transcriptId: payload?.transcriptId || payload?.accession || payload?.id,
    proteinLength: payload?.proteinLength,
    genomicSequence: payload?.genomicSequence || payload?.sequence,
    cdsSegments: payload?.cdsSegments || payload?.cds || [],
    exons: payload?.exons || [],
    strand: payload?.strand,
    source: "ncbi",
    assembly: payload?.assembly || payload?.assemblyName || "",
    rawFeatures: payload?.rawFeatures || [],
  });
}

export function codingPosToGenomic(model, codingPos) {
  const segments = getCdsSegments(model);
  let cursor = 0;
  for (const [start, end] of segments) {
    if (cursor + (end - start) > codingPos) return start + (codingPos - cursor);
    cursor += end - start;
  }
  return null;
}

export function genomicPosToAa(model, genomicPos) {
  const segments = getCdsSegments(model);
  let cursor = 0;
  for (const [start, end] of segments) {
    if (start <= genomicPos && genomicPos < end) return Math.floor((cursor + genomicPos - start) / 3) + 1;
    cursor += end - start;
  }
  return null;
}

export function getCodonAtAa(model, aaNumber, codonToAa) {
  const genomicSequence = getGenomicSequence(model);
  const codingStart = (aaNumber - 1) * 3;
  const genomicPositions = [0, 1, 2].map((offset) => codingPosToGenomic(model, codingStart + offset));
  if (genomicPositions.some((position) => position === null || position === undefined)) return null;
  const codon = genomicPositions.map((position) => genomicSequence[position]).join("");
  return { g: genomicPositions[0], cod: codon, aa: codonToAa(codon), genomicPositions };
}

export function findExonForSegment(modelOrExons, start, end) {
  const exons = Array.isArray(modelOrExons) ? modelOrExons : getExonsFromModel(modelOrExons);
  return exons.find((exon) => exon.start <= start && exon.end >= end)
    || exons.find((exon) => !(exon.end <= start || exon.start >= end))
    || null;
}

export function findSpCas9Guides(model, reverseComplement, target, range = 50) {
  const seq = getGenomicSequence(model);
  const results = [];
  for (let pos = Math.max(0, target - range - 23); pos <= Math.min(seq.length - 23, target + range); pos += 1) {
    const plusPam = seq.slice(pos + 20, pos + 23);
    if (["AGG", "TGG", "CGG", "GGG"].includes(plusPam)) {
      const spacer = seq.slice(pos, pos + 20);
      const cut = pos + 17;
      const gc = Math.round((spacer.split("").filter((base) => base === "G" || base === "C").length / 20) * 100);
      if (!spacer.includes("TTTTT") && !spacer.includes("AAAAA") && Math.abs(cut - target) <= range) results.push({ sp: spacer, pam: plusPam, str: "+", cut, d: cut - target, gc, ps: pos });
    }
    const minusPam = seq.slice(pos, pos + 3);
    if (["CCA", "CCT", "CCC", "CCG"].includes(minusPam)) {
      const spacer = reverseComplement(seq.slice(pos + 3, pos + 23));
      const cut = pos + 6;
      const gc = Math.round((spacer.split("").filter((base) => base === "G" || base === "C").length / 20) * 100);
      if (!spacer.includes("TTTTT") && !spacer.includes("AAAAA") && Math.abs(cut - target) <= range) results.push({ sp: spacer, pam: reverseComplement(minusPam), str: "-", cut, d: cut - target, gc, ps: pos });
    }
  }
  return results;
}

export function selectNearbyGuidesForModel(model, reverseComplement, targetPos, window = 10) {
  const guidesInWindow = findSpCas9Guides(model, reverseComplement, targetPos, window).sort((left, right) => Math.abs(left.d) - Math.abs(right.d));
  if (!guidesInWindow.length) return [];
  const plusGuide = guidesInWindow.find((guide) => guide.str === "+");
  const minusGuide = guidesInWindow.find((guide) => guide.str === "-");
  if (plusGuide && minusGuide) return [plusGuide, minusGuide];
  return guidesInWindow.slice(0, Math.min(2, guidesInWindow.length));
}

export function describeKoGenomicContextFromModel(model, cut) {
  const exons = getExonsFromModel(model);
  const segments = getCdsSegments(model);
  const regions = exons.length
    ? exons.map((exon) => ({ start: exon.start, end: exon.end, exonNumber: exon.exonNumber }))
    : segments.map(([start, end], index) => ({ start, end, exonNumber: index + 1 }));

  for (let index = 0; index < regions.length; index += 1) {
    const { start, end, exonNumber } = regions[index];
    if (cut >= start && cut < end) {
      return {
        label: `exon ${exonNumber}`,
        detail: `${cut - start} bp into exon ${exonNumber}`,
      };
    }
    const next = regions[index + 1];
    if (next && cut >= end && cut < next.start) {
      const afterPrev = cut - end;
      const beforeNext = next.start - cut;
      const usePrev = afterPrev <= beforeNext;
      return {
        label: `intron between exon ${exonNumber} and exon ${next.exonNumber}`,
        detail: usePrev
          ? `${afterPrev} bp downstream of exon ${exonNumber}`
          : `${beforeNext} bp upstream of exon ${next.exonNumber}`,
      };
    }
  }

  if (cut < regions[0].start) {
    return {
      label: "upstream of CDS",
      detail: `${regions[0].start - cut} bp upstream of exon ${regions[0].exonNumber}`,
    };
  }

  const lastRegion = regions[regions.length - 1];
  return {
    label: "downstream of CDS",
    detail: `${cut - lastRegion.end} bp downstream of exon ${lastRegion.exonNumber}`,
  };
}

export function extractCodingDonorWindowFromModel(model, donorStart, donorEnd, payload) {
  const seq = getGenomicSequence(model);
  const segs = getCdsSegments(model);
  const entries = [];
  let codingCursor = 0;
  segs.forEach(([segStart, segEnd]) => {
    const overlapStart = Math.max(donorStart, segStart);
    const overlapEnd = Math.min(donorEnd, segEnd);
    for (let genomicPos = overlapStart; genomicPos < overlapEnd; genomicPos += 1) {
      entries.push({
        wt: seq[genomicPos],
        donor: payload[genomicPos - donorStart],
        codingIndex: codingCursor + (genomicPos - segStart),
      });
    }
    codingCursor += segEnd - segStart;
  });
  if (!entries.length) return { codingWt: "", codingDonor: "" };
  const trimStart = (3 - (entries[0].codingIndex % 3)) % 3;
  const trimmed = entries.slice(trimStart);
  const usableLength = trimmed.length - (trimmed.length % 3);
  const finalEntries = trimmed.slice(0, usableLength);
  return {
    codingWt: finalEntries.map((entry) => entry.wt).join(""),
    codingDonor: finalEntries.map((entry) => entry.donor).join(""),
  };
}

export function findKoDesignTargetFromModel(model, reverseComplement, selectKoGuidePair) {
  const seq = getGenomicSequence(model);
  const segs = getCdsSegments(model);
  const exons = getExonsFromModel(model);
  const indexedSegments = segs.map(([start, end], index) => ({ start, end, index }));
  const nonTerminalSegments = indexedSegments.filter((entry) => entry.index < segs.length - 1);
  if (!nonTerminalSegments.length) return null;
  const preferredSegments = nonTerminalSegments.filter((entry) => entry.index >= 1 && entry.index <= 3);
  const targetSegments = preferredSegments.length ? preferredSegments : nonTerminalSegments;
  const boundaryWindow = 25;

  const candidates = targetSegments.map(({ start, end, index }) => {
    const exonLength = end - start;
    const exon = findExonForSegment(exons, start, end);
    const guides = findSpCas9Guides(model, reverseComplement, Math.floor((start + end) / 2), Math.floor(exonLength / 2) + 10)
      .filter((guide) => guide.cut >= start - boundaryWindow && guide.cut <= end + boundaryWindow)
      .sort((left, right) => right.gc - left.gc);
    const pair = selectKoGuidePair(guides);
    return {
      segmentIndex: index + 1,
      exonNumber: exon?.exonNumber || index + 1,
      start,
      end,
      exonLength,
      pair,
    };
  }).filter((entry) => entry.pair);

  candidates.sort((left, right) => {
    if (left.pair.oppositeStrands !== right.pair.oppositeStrands) return left.pair.oppositeStrands ? -1 : 1;
    if (right.exonLength !== left.exonLength) return right.exonLength - left.exonLength;
    if (right.pair.score !== left.pair.score) return right.pair.score - left.pair.score;
    return left.pair.spacing - right.pair.spacing;
  });

  return candidates[0] || null;
}
