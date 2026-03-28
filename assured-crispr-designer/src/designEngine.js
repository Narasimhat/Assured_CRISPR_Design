import {
  codingPosToGenomic,
  describeKoGenomicContextFromModel,
  extractCodingDonorWindowFromModel,
  findKoDesignTargetFromModel,
  genomicPosToAa,
  getFeatureCount,
  getCdsFromModel,
  getCodonAtAa,
  getGenomicSequence,
  normalizeGenBankToTranscriptModel,
  selectNearbyGuidesForModel,
} from "./transcriptModel";

const CODON_TABLE = {
  TTT: "F", TTC: "F", TTA: "L", TTG: "L", CTT: "L", CTC: "L", CTA: "L", CTG: "L",
  ATT: "I", ATC: "I", ATA: "I", ATG: "M", GTT: "V", GTC: "V", GTA: "V", GTG: "V",
  TCT: "S", TCC: "S", TCA: "S", TCG: "S", CCT: "P", CCC: "P", CCA: "P", CCG: "P",
  ACT: "T", ACC: "T", ACA: "T", ACG: "T", GCT: "A", GCC: "A", GCA: "A", GCG: "A",
  TAT: "Y", TAC: "Y", TAA: "*", TAG: "*", CAT: "H", CAC: "H", CAA: "Q", CAG: "Q",
  AAT: "N", AAC: "N", AAA: "K", AAG: "K", GAT: "D", GAC: "D", GAA: "E", GAG: "E",
  TGA: "*", TGT: "C", TGC: "C", TGG: "W", CGT: "R", CGC: "R", CGA: "R", CGG: "R",
  AGT: "S", AGC: "S", AGA: "R", AGG: "R", GGT: "G", GGC: "G", GGA: "G", GGG: "G",
};

const DNA_COMPLEMENT = { A: "T", T: "A", G: "C", C: "G" };

export const CASSETTES = {
  "2xHA-only": { seq: "GCTAAAGCCAAAAACAACCAGGGATCCGGAGGCGGCTACCCCTACGACGTGCCCGACTACGCCGGCTATCCGTATGATGTCCCGGACTATTAA", len: 93, pos: "C-term" },
  "N:2xHA-dTAG-Linker": { seq: "GGCGGCTACCCCTACGACGTGCCCGACTACGCCGGCTATCCGTATGATGTCCCGGACTATGCAGGAGTGCAGGTGGAAACCATCTCCCCAGGAGACGGGCGCACCTTCCCCAAGCGCGGCCAGACCTGCGTGGTGCACTACACCGGGATGCTTGAAGATGGAAAGAAAGTTGATTCCTCCCGGGACAGAAACAAGCCCTTTAAGTTTATGCTAGGCAAGCAGGAGGTGATCCGAGGCTGGGAAGAAGGGGTTGCCCAGATGAGTGTGGGTCAGAGAGCCAAACTGACTATATCTCCAGATTATGCCTATGGTGCCACTGGGCACCCAGGCATCATCCCACCACATGCCACTCTCGTCTTCGATGTGGAGCTTCTAAAACTGGAAGCTAAAGCCAAAAACAACCAGGGATCCGGA", len: 414, pos: "N-term" },
  "N:EGFP-Linker": { seq: "ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTACGGCAAGCTGACCCTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCACCCTCGTGACCACCCTGACCTACGGCGTGCAGTGCTTCAGCCGCTACCCCGACCACATGAAGCAGCACGACTTCTTCAAGTCCGCCATGCCCGAAGGCTACGTCCAGGAGCGCACCATCTTCTTCAAGGACGACGGCAACTACAAGACCCGCGCCGAGGTGAAGTTCGAGGGCGACACCCTGGTGAACCGCATCGAGCTGAAGGGCATCGACTTCAAGGAGGACGGCAACATCCTGGGGCACAAGCTGGAGTACAACTACAACAGCCACAACGTCTATATCATGGCCGACAAGCAGAAGAACGGCATCAAGGTGAACTTCAAGATCCGCCACAACATCGAGGACGGCAGCGTGCAGCTCGCCGACCACTACCAGCAGAACACCCCCATCGGCGACGGCCCCGTGCTGCTGCCCGACAACCACTACCTGAGCACCCAGTCCGCCCTGAGCAAAGACCCCAACGAGAAGCGCGATCACATGGTCCTGCTGGAGTTCGTGACCGCCGCCGGGATCACTCTCGGCATGGACGAGCTGTACAAGGCTAAAGCCAAAAACAACCAGGGATCCGGA", len: 747, pos: "N-term" },
  "N:SD40-Linker": { seq: "CTGTTGCTGTTCTGCCCTATTTGCGGGTTTACATGTCGCCAGAAGGGCAACTTACTTCGCCATATTAACCTGCACACAGGGGAAAAGTTATTTAAGTACCACCTGTATGCTAAAGCCAAAAACAACCAGGGATCCGGA", len: 138, pos: "N-term" },
  "N:dTAG-Linker": { seq: "GGAGTGCAGGTGGAAACCATCTCCCCAGGAGACGGGCGCACCTTCCCCAAGCGCGGCCAGACCTGCGTGGTGCACTACACCGGGATGCTTGAAGATGGAAAGAAAGTTGATTCCTCCCGGGACAGAAACAAGCCCTTTAAGTTTATGCTAGGCAAGCAGGAGGTGATCCGAGGCTGGGAAGAAGGGGTTGCCCAGATGAGTGTGGGTCAGAGAGCCAAACTGACTATATCTCCAGATTATGCCTATGGTGCCACTGGGCACCCAGGCATCATCCCACCACATGCCACTCTCGTCTTCGATGTGGAGCTTCTAAAACTGGAAGCTAAAGCCAAAAACAACCAGGGATCCGGA", len: 351, pos: "N-term" },
  "N:mAID-Linker": { seq: "AAGGAGAAGAGTGCTTGTCCTAAAGATCCAGCCAAACCTCCGGCCAAGGCACAAGTTGTGGGATGGCCACCGGTGAGATCATACCGGAAGAACGTGATGGTTTCCTGCCAAAAATCAAGCGGTGGCCCGGAGGCGGCGGCGTTCGTGAAGGTATCAATGGACGGAGCACCGTACTTGAGGAAAATCGATTTGAGGATGTATAAAGCTAAAGCCAAAAACAACCAGGGATCCGGA", len: 234, pos: "N-term" },
  "P2A-mCherry": { seq: "GCAACAAACTTCTCTCTGCTGAAACAAGCCGGAGATGTCGAAGAGAATCCTGGACCGGTGAGCAAGGGCGAGGAGGATAACATGGCCATCATCAAGGAGTTCATGCGCTTCAAGGTGCACATGGAGGGCTCCGTGAACGGCCACGAGTTCGAGATCGAGGGCGAGGGCGAGGGCCGCCCCTACGAGGGCACCCAGACCGCCAAGCTGAAGGTGACCAAGGGTGGCCCCCTGCCCTTCGCCTGGGACATCCTGTCCCCTCAGTTCATGTACGGCTCCAAGGCCTACGTGAAGCACCCCGCCGACATCCCCGACTACTTGAAGCTGTCCTTCCCCGAGGGCTTCAAGTGGGAGCGCGTGATGAACTTCGAGGACGGCGGCGTGGTGACCGTGACCCAGGACTCCTCCCTGCAGGACGGCGAGTTCATCTACAAGGTGAAGCTGCGCGGCACCAACTTCCCCTCCGACGGCCCCGTAATGCAGAAGAAAACCATGGGCTGGGAGGCCTCCTCCGAGCGGATGTACCCCGAGGACGGCGCCCTGAAGGGCGAGATCAAGCAGAGGCTGAAGCTGAAGGACGGCGGCCACTACGACGCTGAGGTCAAGACCACCTACAAGGCCAAGAAGCCCGTGCAGCTGCCCGGCGCCTACAACGTCAACATCAAGTTGGACATCACCTCCCACAACGAGGACTACACCATCGTGGAACAGTACGAACGCGCCGAGGGCCGCCACTCCACCGGCGGCATGGACGAGCTGTACAAGTAATAATAA", len: 771, pos: "C-term" },
  "P2A-mScarlet": { seq: "GCAACAAACTTCTCTCTGCTGAAACAAGCCGGAGATGTCGAAGAGAATCCTGGACCGATGGATAGCACCGAGGCAGTGATCAAGGAGTTCATGCGGTTCAAGGTGCACATGGAGGGCTCCATGAACGGCCACGAGTTCGAGATCGAGGGCGAGGGCGAGGGCCGCCCCTACGAGGGCACCCAGACCGCCAAGCTGAAGGTGACCAAGGGTGGCCCCCTGCCCTTCTCCTGGGACATCCTGTCCCCTCAGTTCATGTACGGCTCCAGGGCCTTCATCAAGCACCCCGCCGACATCCCCGACTACTGGAAGCAGTCCTTCCCCGAGGGCTTCAAGTGGGAGCGCGTGATGATCTTCGAGGACGGCGGCACCGTGTCCGTGACCCAGGACACCTCCCTGGAGGACGGCACCCTGATCTACAAGGTGAAGCTCCGCGGCGGCAACTTCCCTCCTGACGGCCCCGTAATGCAGAAGAGGACAATGGGCTGGGAAGCATCCACCGAGCGGTTGTACCCCGAGGACGTCGTGCTGAAGGGCGACATTAAGATGGCCCTGCGCCTGAAGGACGGCGGCCGCTACCTGGCGGACTTCAAGACCACCTACAAGGCCAAGAAGCCCGTGCAGATGCCCGGCGCCTTCAACATCGACCGCAAGTTGGACATCACCTCCCACAACGAGGACTACACCGTGGTGGAACAGTACGAACGCTCCGTGGCCCGCCACTCCACCGGCGGCTCCGGTGGCTCCTAA", len: 747, pos: "C-term" },
  "SD40-2xHA": { seq: "GCTAAAGCCAAAAACAACCAGGGATCCGGACTGTTGCTGTTCTGCCCTATTTGCGGGTTTACATGTCGCCAGAAGGGCAACTTACTTCGCCATATTAACCTGCACACAGGGGAAAAGTTATTTAAGTACCACCTGTATGGCGGCTACCCCTACGACGTGCCCGACTACGCCGGCTATCCGTATGATGTCCCGGACTATGCATAA", len: 204, pos: "C-term" },
  "SD40-2xHA-P2A-mCherry": { seq: "GCTAAAGCCAAAAACAACCAGGGATCCGGACTGTTGCTGTTCTGCCCTATTTGCGGGTTTACATGTCGCCAGAAGGGCAACTTACTTCGCCATATTAACCTGCACACAGGGGAAAAGTTATTTAAGTACCACCTGTATGGCGGCTACCCCTACGACGTGCCCGACTACGCCGGCTATCCGTATGATGTCCCGGACTATGCAGCAACAAACTTCTCTCTGCTGAAACAAGCCGGAGATGTCGAAGAGAATCCTGGACCGGTGAGCAAGGGCGAGGAGGATAACATGGCCATCATCAAGGAGTTCATGCGCTTCAAGGTGCACATGGAGGGCTCCGTGAACGGCCACGAGTTCGAGATCGAGGGCGAGGGCGAGGGCCGCCCCTACGAGGGCACCCAGACCGCCAAGCTGAAGGTGACCAAGGGTGGCCCCCTGCCCTTCGCCTGGGACATCCTGTCCCCTCAGTTCATGTACGGCTCCAAGGCCTACGTGAAGCACCCCGCCGACATCCCCGACTACTTGAAGCTGTCCTTCCCCGAGGGCTTCAAGTGGGAGCGCGTGATGAACTTCGAGGACGGCGGCGTGGTGACCGTGACCCAGGACTCCTCCCTGCAGGACGGCGAGTTCATCTACAAGGTGAAGCTGCGCGGCACCAACTTCCCCTCCGACGGCCCCGTAATGCAGAAGAAAACCATGGGCTGGGAGGCCTCCTCCGAGCGGATGTACCCCGAGGACGGCGCCCTGAAGGGCGAGATCAAGCAGAGGCTGAAGCTGAAGGACGGCGGCCACTACGACGCTGAGGTCAAGACCACCTACAAGGCCAAGAAGCCCGTGCAGCTGCCCGGCGCCTACAACGTCAACATCAAGTTGGACATCACCTCCCACAACGAGGACTACACCATCGTGGAACAGTACGAACGCGCCGAGGGCCGCCACTCCACCGGCGGCATGGACGAGCTGTACAAGTAATAATAA", len: 972, pos: "C-term" },
  "T2A-EGFP": { seq: "GAGGGCAGAGGAAGTCTTCTAACATGCGGCGACGTGGAGGAAAATCCCGGCCCCATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTACGGCAAGCTGACCCTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCACCCTCGTGACCACCCTGACCTACGGCGTGCAGTGCTTCAGCCGCTACCCCGACCACATGAAGCAGCACGACTTCTTCAAGTCCGCCATGCCCGAAGGCTACGTCCAGGAGCGCACCATCTTCTTCAAGGACGACGGCAACTACAAGACCCGCGCCGAGGTGAAGTTCGAGGGCGACACCCTGGTGAACCGCATCGAGCTGAAGGGCATCGACTTCAAGGAGGACGGCAACATCCTGGGGCACAAGCTGGAGTACAACTACAACAGCCACAACGTCTATATCATGGCCGACAAGCAGAAGAACGGCATCAAGGTGAACTTCAAGATCCGCCACAACATCGAGGACGGCAGCGTGCAGCTCGCCGACCACTACCAGCAGAACACCCCCATCGGCGACGGCCCCGTGCTGCTGCCCGACAACCACTACCTGAGCACCCAGTCCGCCCTGAGCAAAGACCCCAACGAGAAGCGCGATCACATGGTCCTGCTGGAGTTCGTGACCGCCGCCGGGATCACTCTCGGCATGGACGAGCTGTACAAGTAA", len: 774, pos: "C-term" },
  "T2A-mScarlet_I3": { seq: "GAGGGCAGAGGAAGTCTTCTAACATGCGGCGACGTGGAGGAAAATCCCGGCCCCATGGATAGCACCGAGGCAGTGATCAAGGAGTTCATGCGGTTCAAGGTGCACATGGAGGGCTCCATGAACGGCCACGAGTTCGAGATCGAGGGCGAGGGCGAGGGCCGCCCCTACGAGGGCACCCAGACCGCCAAGCTGAAGGTGACCAAGGGTGGCCCCCTGCCCTTCTCCTGGGACATCCTGTCCCCTCAGTTCATGTACGGCTCCAGGGCCTTCATCAAGCACCCCGCCGACATCCCCGACTACTGGAAGCAGTCCTTCCCCGAGGGCTTCAAGTGGGAGCGCGTGATGATCTTCGAGGACGGCGGCACCGTGTCCGTGACCCAGGACACCTCCCTGGAGGACGGCACCCTGATCTACAAGGTGAAGCTCCGCGGCGGCAACTTCCCTCCTGACGGCCCCGTAATGCAGAAGAGGACAATGGGCTGGGAAGCATCCACCGAGCGGTTGTACCCCGAGGACGTCGTGCTGAAGGGCGACATTAAGATGGCCCTGCGCCTGAAGGACGGCGGCCGCTACCTGGCGGACTTCAAGACCACCTACAAGGCCAAGAAGCCCGTGCAGATGCCCGGCGCCTTCAACATCGACCGCAAGTTGGACATCACCTCCCACAACGAGGACTACACCGTGGTGGAACAGTACGAACGCTCCGTGGCCCGCCACTCCACCGGCGGCTCCGGTGGCTCCTAATAA", len: 747, pos: "C-term" },
  "dTAG-2xHA": { seq: "GCTAAAGCCAAAAACAACCAGGGATCCGGAGGAGTGCAGGTGGAAACCATCTCCCCAGGAGACGGGCGCACCTTCCCCAAGCGCGGCCAGACCTGCGTGGTGCACTACACCGGGATGCTTGAAGATGGAAAGAAAGTTGATTCCTCCCGGGACAGAAACAAGCCCTTTAAGTTTATGCTAGGCAAGCAGGAGGTGATCCGAGGCTGGGAAGAAGGGGTTGCCCAGATGAGTGTGGGTCAGAGAGCCAAACTGACTATATCTCCAGATTATGCCTATGGTGCCACTGGGCACCCAGGCATCATCCCACCACATGCCACTCTCGTCTTCGATGTGGAGCTTCTAAAACTGGAAGGCGGCTACCCCTACGACGTGCCCGACTACGCCGGCTATCCGTATGATGTCCCGGACTATGCATAA", len: 417, pos: "C-term" },
  "dTAG-2xHA-P2A-mCherry": { seq: "GCTAAAGCCAAAAACAACCAGGGATCCGGAGGAGTGCAGGTGGAAACCATCTCCCCAGGAGACGGGCGCACCTTCCCCAAGCGCGGCCAGACCTGCGTGGTGCACTACACCGGGATGCTTGAAGATGGAAAGAAAGTTGATTCCTCCCGGGACAGAAACAAGCCCTTTAAGTTTATGCTAGGCAAGCAGGAGGTGATCCGAGGCTGGGAAGAAGGGGTTGCCCAGATGAGTGTGGGTCAGAGAGCCAAACTGACTATATCTCCAGATTATGCCTATGGTGCCACTGGGCACCCAGGCATCATCCCACCACATGCCACTCTCGTCTTCGATGTGGAGCTTCTAAAACTGGAAGGCGGCTACCCCTACGACGTGCCCGACTACGCCGGCTATCCGTATGATGTCCCGGACTATGCAGCAACAAACTTCTCTCTGCTGAAACAAGCCGGAGATGTCGAAGAGAATCCTGGACCGGTGAGCAAGGGCGAGGAGGATAACATGGCCATCATCAAGGAGTTCATGCGCTTCAAGGTGCACATGGAGGGCTCCGTGAACGGCCACGAGTTCGAGATCGAGGGCGAGGGCGAGGGCCGCCCCTACGAGGGCACCCAGACCGCCAAGCTGAAGGTGACCAAGGGTGGCCCCCTGCCCTTCGCCTGGGACATCCTGTCCCCTCAGTTCATGTACGGCTCCAAGGCCTACGTGAAGCACCCCGCCGACATCCCCGACTACTTGAAGCTGTCCTTCCCCGAGGGCTTCAAGTGGGAGCGCGTGATGAACTTCGAGGACGGCGGCGTGGTGACCGTGACCCAGGACTCCTCCCTGCAGGACGGCGAGTTCATCTACAAGGTGAAGCTGCGCGGCACCAACTTCCCCTCCGACGGCCCCGTAATGCAGAAGAAAACCATGGGCTGGGAGGCCTCCTCCGAGCGGATGTACCCCGAGGACGGCGCCCTGAAGGGCGAGATCAAGCAGAGGCTGAAGCTGAAGGACGGCGGCCACTACGACGCTGAGGTCAAGACCACCTACAAGGCCAAGAAGCCCGTGCAGCTGCCCGGCGCCTACAACGTCAACATCAAGTTGGACATCACCTCCCACAACGAGGACTACACCATCGTGGAACAGTACGAACGCGCCGAGGGCCGCCACTCCACCGGCGGCATGGACGAGCTGTACAAGTAATAATAA", len: 1185, pos: "C-term" },
  "mAID-2xHA": { seq: "GCTAAAGCCAAAAACAACCAGGGATCCGGAAAGGAGAAGAGTGCTTGTCCTAAAGATCCAGCCAAACCTCCGGCCAAGGCACAAGTTGTGGGATGGCCACCGGTGAGATCATACCGGAAGAACGTGATGGTTTCCTGCCAAAAATCAAGCGGTGGCCCGGAGGCGGCGGCGTTCGTGAAGGTATCAATGGACGGAGCACCGTACTTGAGGAAAATCGATTTGAGGATGTATAAAGGCGGCTACCCCTACGACGTGCCCGACTACGCCGGCTATCCGTATGATGTCCCGGACTATGCATAA", len: 300, pos: "C-term" },
  "mAID-2xHA-P2A-mCherry": { seq: "GCTAAAGCCAAAAACAACCAGGGATCCGGAAAGGAGAAGAGTGCTTGTCCTAAAGATCCAGCCAAACCTCCGGCCAAGGCACAAGTTGTGGGATGGCCACCGGTGAGATCATACCGGAAGAACGTGATGGTTTCCTGCCAAAAATCAAGCGGTGGCCCGGAGGCGGCGGCGTTCGTGAAGGTATCAATGGACGGAGCACCGTACTTGAGGAAAATCGATTTGAGGATGTATAAAGGCGGCTACCCCTACGACGTGCCCGACTACGCCGGCTATCCGTATGATGTCCCGGACTATGCAGCAACAAACTTCTCTCTGCTGAAACAAGCCGGAGATGTCGAAGAGAATCCTGGACCGGTGAGCAAGGGCGAGGAGGATAACATGGCCATCATCAAGGAGTTCATGCGCTTCAAGGTGCACATGGAGGGCTCCGTGAACGGCCACGAGTTCGAGATCGAGGGCGAGGGCGAGGGCCGCCCCTACGAGGGCACCCAGACCGCCAAGCTGAAGGTGACCAAGGGTGGCCCCCTGCCCTTCGCCTGGGACATCCTGTCCCCTCAGTTCATGTACGGCTCCAAGGCCTACGTGAAGCACCCCGCCGACATCCCCGACTACTTGAAGCTGTCCTTCCCCGAGGGCTTCAAGTGGGAGCGCGTGATGAACTTCGAGGACGGCGGCGTGGTGACCGTGACCCAGGACTCCTCCCTGCAGGACGGCGAGTTCATCTACAAGGTGAAGCTGCGCGGCACCAACTTCCCCTCCGACGGCCCCGTAATGCAGAAGAAAACCATGGGCTGGGAGGCCTCCTCCGAGCGGATGTACCCCGAGGACGGCGCCCTGAAGGGCGAGATCAAGCAGAGGCTGAAGCTGAAGGACGGCGGCCACTACGACGCTGAGGTCAAGACCACCTACAAGGCCAAGAAGCCCGTGCAGCTGCCCGGCGCCTACAACGTCAACATCAAGTTGGACATCACCTCCCACAACGAGGACTACACCATCGTGGAACAGTACGAACGCGCCGAGGGCCGCCACTCCACCGGCGGCATGGACGAGCTGTACAAGTAATAATAA", len: 1068, pos: "C-term" }
};

const toAA = (codon) => CODON_TABLE[codon] || "?";
const reverseComplement = (sequence) => sequence.split("").reverse().map((base) => DNA_COMPLEMENT[base] || "N").join("");

function sanitizeLabelPart(value, fallback) {
  const cleaned = String(value || "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}

function simplifyTagName(tag) {
  const raw = String(tag || "").replace(/^N:/, "");
  if (/SD40/i.test(raw)) return "SD40";
  if (/dTAG/i.test(raw)) return "dTAG";
  if (/mAID/i.test(raw)) return "mAID";
  if (/2xHA/i.test(raw) && !/SD40|dTAG|mAID/i.test(raw)) return "2xHA";
  if (/EGFP/i.test(raw)) return "EGFP";
  if (/mScarlet/i.test(raw)) return "mScarlet";
  if (/mCherry/i.test(raw)) return "mCherry";
  return raw;
}

function buildDesignModifier(projectType, mutationString = "", tag = "") {
  if (projectType === "pm") return sanitizeLabelPart(String(mutationString || "").toUpperCase(), "PM");
  if (projectType === "ko") return "KO";
  return `${sanitizeLabelPart(simplifyTagName(tag), "KI")}_KI`;
}

function buildDesignPrefix(gene, projectType, mutationString = "", tag = "") {
  return `${sanitizeLabelPart(gene, "GENE")}_${buildDesignModifier(projectType, mutationString, tag)}`;
}

function makeGuideName(gene, projectType, index, mutationString = "", tag = "") {
  return `${buildDesignPrefix(gene, projectType, mutationString, tag)}_gRNA${index + 1}`;
}

function makePrimerName(gene, projectType, direction, mutationString = "", tag = "") {
  return `${buildDesignPrefix(gene, projectType, mutationString, tag)}_${direction}`;
}

export function parseGB(rawText) {
  const text = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const feats = [];
  let seq = "";
  let inSequence = false;
  let inFeatures = false;
  let current = null;
  let lastQualifier = "";

  for (const line of text.split("\n")) {
    if (line.startsWith("ORIGIN")) { inSequence = true; inFeatures = false; continue; }
    if (line.startsWith("//")) break;
    if (line.startsWith("FEATURES")) { inFeatures = true; continue; }
    if (inSequence) { seq += line.replace(/[^a-zA-Z]/g, ""); continue; }
    if (!inFeatures) continue;
    if (line.length > 5 && line.charAt(5) !== " " && line.charAt(0) === " ") {
      if (current) feats.push(current);
      const parts = line.trim().split(/\s+/);
      current = { type: parts[0], loc: parts.slice(1).join(""), q: {} };
      lastQualifier = "";
      continue;
    }
    if (current && /^\s{21}\//.test(line)) {
      const match = line.trim().match(/^\/(\w+)=?"?([^"]*)"?$/);
      if (match) { current.q[match[1]] = match[2]; lastQualifier = match[1]; }
      continue;
    }
    if (current && /^\s{21}[^/]/.test(line) && !current.loc.includes(")")) { current.loc += line.trim(); continue; }
    if (current && lastQualifier && /^\s{21}/.test(line)) current.q[lastQualifier] = `${current.q[lastQualifier] || ""}${line.trim().replace(/"/g, "")}`;
  }
  if (current) feats.push(current);
  return { seq: seq.toUpperCase(), feats };
}

function armType(guide, mutationPos) {
  return guide.str === "+" ? (mutationPos > guide.cut ? "PROX" : "DIST") : (mutationPos < guide.cut ? "PROX" : "DIST");
}

function findSilent(model, guide, blockedPositions = new Set(), options = {}) {
  const allowNonCoding = !!options.allowNonCoding;
  const seq = getGenomicSequence(model);
  const pamStart = guide.str === "+" ? guide.ps + 20 : guide.ps;
  if (pamStart < 0 || pamStart + 3 > seq.length) return null;

  const candidateSites = [];
  const seenPositions = new Set();
  const addCandidate = (genomicPos, label, kind, pamIndex = null) => {
    if (!Number.isFinite(genomicPos) || genomicPos < 0 || genomicPos >= seq.length) return;
    if (blockedPositions.has(genomicPos) || seenPositions.has(genomicPos)) return;
    seenPositions.add(genomicPos);
    candidateSites.push({ genomicPos, label, kind, pamIndex });
  };

  const pamIndexes = guide.str === "+" ? [1, 2] : [0, 1];
  pamIndexes.forEach((pamIndex) => addCandidate(pamStart + pamIndex, "PAM", "pam", pamIndex));

  for (let spacerIndex = 10; spacerIndex < 20; spacerIndex += 1) {
    const genomicPos = guide.str === "+"
      ? guide.ps + spacerIndex
      : guide.ps + 3 + (19 - spacerIndex);
    addCandidate(genomicPos, `Seed pos ${spacerIndex + 1}/20`, "seed");
  }

  for (let spacerIndex = 0; spacerIndex < 10; spacerIndex += 1) {
    const genomicPos = guide.str === "+"
      ? guide.ps + spacerIndex
      : guide.ps + 3 + (19 - spacerIndex);
    addCandidate(genomicPos, `Guide pos ${spacerIndex + 1}/20`, "guide");
  }

  for (const site of candidateSites) {
    const { genomicPos, label, kind, pamIndex } = site;
    const aaNumber = genomicPosToAa(model, genomicPos);
    const codonInfo = aaNumber ? getCodonAtAa(model, aaNumber, toAA) : null;
    const codon = codonInfo?.cod || null;
    const codonIndex = codonInfo ? codonInfo.genomicPositions.indexOf(genomicPos) : -1;
    const originalAA = codon ? toAA(codon) : null;
    const originalBase = seq[genomicPos];
    for (const alt of ["A", "C", "G", "T"]) {
      if (alt === originalBase) continue;

      if (kind === "pam") {
        const mutantPam = seq.slice(pamStart, pamStart + 3).split("");
        mutantPam[pamIndex] = alt;
        const stillPam = guide.str === "+"
          ? mutantPam.slice(1).join("") === "GG"
          : reverseComplement(mutantPam.join("")).slice(1) === "GG";
        if (stillPam) continue;
        const oldPam = guide.str === "+" ? seq.slice(pamStart, pamStart + 3) : reverseComplement(seq.slice(pamStart, pamStart + 3));
        const newPam = guide.str === "+" ? mutantPam.join("") : reverseComplement(mutantPam.join(""));

        if (!codonInfo || codonIndex < 0) {
          if (!allowNonCoding) continue;
          return { gp: genomicPos, nb: alt, lb: "noncoding", oc: originalBase, nc: alt, pur: `PAM ${oldPam}->${newPam} outside CDS`, mt: "noncoding" };
        }

        const mutantCodon = `${codon.slice(0, codonIndex)}${alt}${codon.slice(codonIndex + 1)}`;
        if (toAA(mutantCodon) !== originalAA) continue;
        return { gp: genomicPos, nb: alt, lb: `p.${originalAA}${aaNumber}${originalAA}`, oc: codon, nc: mutantCodon, pur: `PAM ${oldPam}->${newPam}`, mt: "silent" };
      }

      if (!codonInfo || codonIndex < 0) {
        if (!allowNonCoding) continue;
        return { gp: genomicPos, nb: alt, lb: "noncoding", oc: originalBase, nc: alt, pur: `${label} outside CDS`, mt: "noncoding" };
      }

      const mutantCodon = `${codon.slice(0, codonIndex)}${alt}${codon.slice(codonIndex + 1)}`;
      if (toAA(mutantCodon) !== originalAA) continue;
      return { gp: genomicPos, nb: alt, lb: `p.${originalAA}${aaNumber}${originalAA}`, oc: codon, nc: mutantCodon, pur: label, mt: "silent" };
    }
  }
  return null;
}

function mkODN(model, guide, mutationPositions, mutationBases, silentMutations = []) {
  const seq = getGenomicSequence(model);
  let donorStart;
  let donorEnd;
  if (guide.str === "+") { donorStart = guide.cut - 36; donorEnd = guide.cut + 91; }
  else { donorStart = guide.cut - 91; donorEnd = guide.cut + 36; }
  const desiredLength = donorEnd - donorStart;
  if (donorStart < 0) {
    donorEnd = Math.min(seq.length, donorEnd - donorStart);
    donorStart = 0;
  }
  if (donorEnd > seq.length) {
    donorStart = Math.max(0, donorStart - (donorEnd - seq.length));
    donorEnd = seq.length;
  }
  if (donorEnd - donorStart < desiredLength && seq.length >= desiredLength) {
    donorStart = Math.max(0, donorEnd - desiredLength);
    donorEnd = Math.min(seq.length, donorStart + desiredLength);
  }
  if (donorStart < 0 || donorEnd > seq.length || donorEnd - donorStart < desiredLength) return null;

  const payload = seq.slice(donorStart, donorEnd).split("");
  const wildType = seq.slice(donorStart, donorEnd);
  mutationPositions.forEach((pos, index) => {
    const donorIndex = pos - donorStart;
    if (donorIndex >= 0 && donorIndex < 127) payload[donorIndex] = mutationBases[index];
  });
  silentMutations.forEach((mutation) => {
    const donorIndex = mutation.gp - donorStart;
    if (donorIndex >= 0 && donorIndex < 127) payload[donorIndex] = mutation.nb;
  });
  const guideSiteStart = guide.ps - donorStart;
  const guideSiteEnd = guideSiteStart + 23;
  const guidePamStart = guide.str === "+" ? guideSiteStart + 20 : guideSiteStart;
  const guidePamEnd = guidePamStart + 3;
  const ssOdn = guide.str === "+" ? reverseComplement(payload.join("")) : payload.join("");
  const wtOdn = guide.str === "+" ? reverseComplement(wildType) : wildType;
  const { codingWt, codingDonor } = extractCodingDonorWindowFromModel(model, donorStart, donorEnd, payload);
  const orderedIndex = (genomicPos) => {
    const payloadIndex = genomicPos - donorStart;
    if (payloadIndex < 0 || payloadIndex >= payload.length) return null;
    return guide.str === "+" ? payload.length - 1 - payloadIndex : payloadIndex;
  };
  const diff = [];
  for (let index = 0; index < 127; index += 1) if (ssOdn[index] !== wtOdn[index]) diff.push(index);
  const desiredDiffIndexes = mutationPositions.map((pos) => orderedIndex(pos)).filter((index) => index !== null).sort((left, right) => left - right);
  const silentDiffIndexes = silentMutations.map((mutation) => orderedIndex(mutation.gp)).filter((index) => index !== null).sort((left, right) => left - right);
  return {
    od: ssOdn,
    wo: wtOdn,
    df: diff,
    desiredDiffIndexes,
    silentDiffIndexes,
    silentMutations,
    sl: guide.str === "+" ? "- strand target" : "+ strand target",
    codingWt,
    codingDonor,
    guideSiteStart,
    guideSiteEnd,
    guidePamStart,
    guidePamEnd,
  };
}

const COMMON_LINKER = "GCTAAAGCCAAAAACAACCAGGGATCCGGA";
const DONOR_COLORS = {
  HA5: "#38bdf8",
  HA3: "#818cf8",
  START: "#22c55e",
  LINKER: "#f59e0b",
  TAG: "#34d399",
  REPORTER: "#fb7185",
  PEPTIDE: "#f97316",
  STOP: "#facc15",
  SILENT: "#ef4444",
};

function cloneSegments(segments) {
  return segments.map((segment) => ({ ...segment }));
}

function buildPureReporterPreset(name, twoALabel, reporterLabel) {
  const sequence = CASSETTES[name].seq;
  const reporterStart = sequence.indexOf("ATG", 20);
  const peptideSeq = sequence.slice(0, reporterStart);
  const reporterSeq = sequence.slice(reporterStart, -3);
  return {
    ct: {
      seq: sequence,
      segments: [
        { label: twoALabel, role: "PEPTIDE", color: DONOR_COLORS.PEPTIDE, seq: peptideSeq },
        { label: reporterLabel, role: "REPORTER", color: DONOR_COLORS.REPORTER, seq: reporterSeq },
        { label: "Stop", role: "STOP", color: DONOR_COLORS.STOP, seq: "TAA" },
      ],
    },
    nt: {
      seq: `${reporterSeq}${peptideSeq}`,
      segments: [
        { label: "Start", role: "START", color: DONOR_COLORS.START, seq: "ATG" },
        { label: reporterLabel, role: "REPORTER", color: DONOR_COLORS.REPORTER, seq: reporterSeq.slice(3) },
        { label: twoALabel, role: "PEPTIDE", color: DONOR_COLORS.PEPTIDE, seq: peptideSeq },
      ],
    },
  };
}

function buildTaggedPreset(name, tagLabel) {
  const fullSeq = CASSETTES[name].seq;
  const tagSeq = fullSeq.slice(COMMON_LINKER.length, -3);
  const ntTagSeq = tagSeq.startsWith("ATG") ? tagSeq : `ATG${tagSeq}`;
  return {
    ct: {
      seq: fullSeq,
      segments: [
        { label: "Linker", role: "LINKER", color: DONOR_COLORS.LINKER, seq: COMMON_LINKER },
        { label: tagLabel, role: "TAG", color: DONOR_COLORS.TAG, seq: tagSeq },
        { label: "Stop", role: "STOP", color: DONOR_COLORS.STOP, seq: "TAA" },
      ],
    },
    nt: {
      seq: `${ntTagSeq}${COMMON_LINKER}`,
      segments: [
        { label: "Start", role: "START", color: DONOR_COLORS.START, seq: "ATG" },
        { label: tagLabel, role: "TAG", color: DONOR_COLORS.TAG, seq: ntTagSeq.slice(3) },
        { label: "Linker", role: "LINKER", color: DONOR_COLORS.LINKER, seq: COMMON_LINKER },
      ],
    },
  };
}

function buildComboPreset(name, tagLabel, tailPresetName, twoALabel, reporterLabel) {
  const tailSeq = CASSETTES[tailPresetName].seq;
  const comboSeq = CASSETTES[name].seq;
  const tagSeq = comboSeq.slice(COMMON_LINKER.length, comboSeq.length - tailSeq.length);
  const pureReporter = buildPureReporterPreset(tailPresetName, twoALabel, reporterLabel);
  const peptideSeq = pureReporter.ct.segments[0].seq;
  const reporterSeq = pureReporter.ct.segments[1].seq;
  return {
    ct: {
      seq: comboSeq,
      segments: [
        { label: "Linker", role: "LINKER", color: DONOR_COLORS.LINKER, seq: COMMON_LINKER },
        { label: tagLabel, role: "TAG", color: DONOR_COLORS.TAG, seq: tagSeq },
        { label: twoALabel, role: "PEPTIDE", color: DONOR_COLORS.PEPTIDE, seq: peptideSeq },
        { label: reporterLabel, role: "REPORTER", color: DONOR_COLORS.REPORTER, seq: reporterSeq },
        { label: "Stop", role: "STOP", color: DONOR_COLORS.STOP, seq: "TAA" },
      ],
    },
    nt: {
      seq: `${reporterSeq}${peptideSeq}${tagSeq}${COMMON_LINKER}`,
      segments: [
        { label: "Start", role: "START", color: DONOR_COLORS.START, seq: "ATG" },
        { label: reporterLabel, role: "REPORTER", color: DONOR_COLORS.REPORTER, seq: reporterSeq.slice(3) },
        { label: twoALabel, role: "PEPTIDE", color: DONOR_COLORS.PEPTIDE, seq: peptideSeq },
        { label: tagLabel, role: "TAG", color: DONOR_COLORS.TAG, seq: tagSeq },
        { label: "Linker", role: "LINKER", color: DONOR_COLORS.LINKER, seq: COMMON_LINKER },
      ],
    },
  };
}

const DONOR_PRESETS = {
  "2xHA-only": buildTaggedPreset("2xHA-only", "2xHA"),
  "SD40-2xHA": buildTaggedPreset("SD40-2xHA", "SD40-2xHA"),
  "dTAG-2xHA": buildTaggedPreset("dTAG-2xHA", "dTAG-2xHA"),
  "mAID-2xHA": buildTaggedPreset("mAID-2xHA", "mAID-2xHA"),
  "P2A-mCherry": buildPureReporterPreset("P2A-mCherry", "P2A", "mCherry"),
  "P2A-mScarlet": buildPureReporterPreset("P2A-mScarlet", "P2A", "mScarlet"),
  "T2A-EGFP": buildPureReporterPreset("T2A-EGFP", "T2A", "EGFP"),
  "T2A-mScarlet_I3": buildPureReporterPreset("T2A-mScarlet_I3", "T2A", "mScarlet_I3"),
  "SD40-2xHA-P2A-mCherry": buildComboPreset("SD40-2xHA-P2A-mCherry", "SD40-2xHA", "P2A-mCherry", "P2A", "mCherry"),
  "dTAG-2xHA-P2A-mCherry": buildComboPreset("dTAG-2xHA-P2A-mCherry", "dTAG-2xHA", "P2A-mCherry", "P2A", "mCherry"),
  "mAID-2xHA-P2A-mCherry": buildComboPreset("mAID-2xHA-P2A-mCherry", "mAID-2xHA", "P2A-mCherry", "P2A", "mCherry"),
};

function getInsertPreset(name, orientation) {
  const preset = DONOR_PRESETS[name];
  if (preset) return { ...preset[orientation], segments: cloneSegments(preset[orientation].segments) };
  if (orientation === "nt" && CASSETTES[name]?.pos === "N-term") {
    return { seq: CASSETTES[name].seq, segments: [{ label: name.replace(/^N:/, ""), role: "TAG", color: DONOR_COLORS.TAG, seq: CASSETTES[name].seq }] };
  }
  const fallback = CASSETTES[name];
  if (!fallback) return null;
  return { seq: fallback.seq, segments: [{ label: name, role: "TAG", color: DONOR_COLORS.TAG, seq: fallback.seq }] };
}

function buildDonorAnnotations(h5Length, insertSegments, h3Length, extraAnnotations = []) {
  const annotations = [];
  let cursor = 0;
  annotations.push({ label: "5' HA", color: DONOR_COLORS.HA5, start: cursor, end: cursor + h5Length, priority: 1 });
  cursor += h5Length;
  insertSegments.forEach((segment) => {
    annotations.push({ label: segment.label, color: segment.color, start: cursor, end: cursor + segment.seq.length, priority: 1 });
    cursor += segment.seq.length;
  });
  annotations.push({ label: "3' HA", color: DONOR_COLORS.HA3, start: cursor, end: cursor + h3Length, priority: 1 });
  return annotations.concat(extraAnnotations).sort((left, right) => {
    if (left.start !== right.start) return left.start - right.start;
    return (left.priority || 0) - (right.priority || 0);
  });
}

function buildSilentAnnotations(silentMutations, toDonorIndex) {
  return silentMutations
    .map((mutation) => {
      const donorIndex = toDonorIndex(mutation);
      if (!Number.isFinite(donorIndex) || donorIndex < 0) return null;
      const isNonCoding = mutation.mt === "noncoding";
      const labelPrefix = isNonCoding ? "Guide block" : "Silent";
      return {
        label: `${labelPrefix} gRNA${mutation.gi || ""}`.trim(),
        badgeLabel: `${labelPrefix} gRNA${mutation.gi || ""}`.trim(),
        title: `${mutation.lb}: ${mutation.oc} -> ${mutation.nc} | ${mutation.pur}`,
        color: DONOR_COLORS.SILENT,
        start: donorIndex,
        end: donorIndex + 1,
        priority: 10,
      };
    })
    .filter(Boolean);
}

function pickPrimerOutsideLeft(seq, boundary, primerLength = 24) {
  const end = Math.max(0, Math.min(seq.length, boundary));
  const start = Math.max(0, end - primerLength);
  return seq.slice(start, end);
}

function pickPrimerOutsideRight(seq, boundary, primerLength = 24) {
  const start = Math.max(0, Math.min(seq.length, boundary));
  const end = Math.min(seq.length, start + primerLength);
  return reverseComplement(seq.slice(start, end));
}

function selectKoGuidePair(guides, maxSpacing = 140) {
  const candidatePairs = [];
  for (let leftIndex = 0; leftIndex < guides.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < guides.length; rightIndex += 1) {
      const leftGuide = guides[leftIndex];
      const rightGuide = guides[rightIndex];
      const spacing = Math.abs(rightGuide.cut - leftGuide.cut);
      if (spacing > maxSpacing) continue;
      candidatePairs.push({
        guides: leftGuide.cut <= rightGuide.cut ? [leftGuide, rightGuide] : [rightGuide, leftGuide],
        spacing,
        preferredSpacing: spacing >= 40 && spacing <= 140,
        oppositeStrands: leftGuide.str !== rightGuide.str,
        score: leftGuide.gc + rightGuide.gc,
      });
    }
  }
  candidatePairs.sort((left, right) => {
    if (left.preferredSpacing !== right.preferredSpacing) return left.preferredSpacing ? -1 : 1;
    if (left.oppositeStrands !== right.oppositeStrands) return left.oppositeStrands ? -1 : 1;
    if (right.score !== left.score) return right.score - left.score;
    if (left.preferredSpacing && right.preferredSpacing) return Math.abs(left.spacing - 90) - Math.abs(right.spacing - 90);
    return right.spacing - left.spacing;
  });
  return candidatePairs[0] || null;
}

function selectInsertGuidesWithFallback(model, targetPos) {
  const windows = [10, 20, 30];
  for (const window of windows) {
    const guides = selectNearbyGuidesForModel(model, reverseComplement, targetPos, window);
    if (!guides.length) continue;
    return {
      guides,
      window,
      tier: window === 10 ? "preferred" : window === 20 ? "fallback" : "distant fallback",
    };
  }
  return null;
}

function buildInsertGuideNote(guide, anchorLabel, tier, window) {
  const relativeLabel = guide.d < 0 ? "5-prime" : "3-prime";
  const tierLabel = tier === "preferred" ? "preferred window" : tier === "fallback" ? "fallback window" : "distant fallback";
  return `Cut ${Math.abs(guide.d)} bp ${relativeLabel} of ${anchorLabel} | ${tierLabel} <=${window} bp`;
}

function buildPointMutationGuideNote(guide, tier, window) {
  const tierLabel = tier === "preferred" ? "preferred window" : tier === "fallback" ? "fallback window" : "distant fallback";
  return `Cut-to-edit distance ${Math.abs(guide.d)} bp | ${tierLabel} <=${window} bp`;
}

function getGuideSpan(guide) {
  return { start: guide.ps, end: guide.ps + 23 };
}

function guideOverlapsReplacement(guide, replaceStart, replaceEnd) {
  const { start, end } = getGuideSpan(guide);
  return start < replaceEnd && end > replaceStart;
}

function parsePointMutationInput(value) {
  const normalized = String(value || "").trim().replace(/^p\./i, "").replace(/\s+/g, "").toUpperCase();
  const canonical = normalized.match(/^([A-Z])(\d+)([A-Z])$/);
  if (canonical) return { wtAA: canonical[1], aaNumber: parseInt(canonical[2], 10), mutAA: canonical[3] };

  const reversed = normalized.match(/^(\d+)([A-Z])([A-Z])$/);
  if (reversed) {
    return {
      err: `Use mutation format ${reversed[2]}${reversed[1]}${reversed[3]}, not ${normalized}. The app expects WT-position-mutant, for example G96S.`,
    };
  }

  const delimited = normalized.match(/^([A-Z])[-_/]?(\d+)[-_/]?([A-Z])$/);
  if (delimited) return { wtAA: delimited[1], aaNumber: parseInt(delimited[2], 10), mutAA: delimited[3] };

  return { err: "Cannot parse mutation. Use WT-position-mutant format such as G96S or p.G96S." };
}

export function designPM(gb, mutationString) {
  const cds = getCdsFromModel(gb);
  if (!cds) return { err: "No CDS annotation found in GenBank file." };
  const seq = getGenomicSequence(gb);
  const mutation = parsePointMutationInput(mutationString);
  if (mutation.err) return { err: mutation.err };
  const { wtAA, aaNumber, mutAA } = mutation;
  const codonInfo = getCodonAtAa(gb, aaNumber, toAA);
  if (!codonInfo) return { err: `Cannot map amino acid ${aaNumber} to the genomic sequence.` };
  if (codonInfo.aa !== wtAA.toUpperCase()) return { err: `Expected ${wtAA.toUpperCase()} at position ${aaNumber} but found ${codonInfo.aa} (${codonInfo.cod}).` };

  let bestMutantCodon = null;
  let bestChanges = [];
  for (const base1 of "ACGT") {
    for (const base2 of "ACGT") {
      for (const base3 of "ACGT") {
        const mutantCodon = `${base1}${base2}${base3}`;
        if (toAA(mutantCodon) !== mutAA.toUpperCase()) continue;
        const changes = [];
        for (let index = 0; index < 3; index += 1) {
          if (codonInfo.cod[index] !== mutantCodon[index]) {
            changes.push({ p: codonInfo.genomicPositions[index], w: codonInfo.cod[index], m: mutantCodon[index] });
          }
        }
        if (!bestMutantCodon || changes.length < bestChanges.length) { bestMutantCodon = mutantCodon; bestChanges = changes; }
      }
    }
  }
  if (!bestMutantCodon) return { err: `No codon encodes ${mutAA.toUpperCase()}.` };

  const mutationPositions = bestChanges.map((change) => change.p);
  const mutationBases = bestChanges.map((change) => change.m);
  const guideSelection = selectInsertGuidesWithFallback(gb, codonInfo.g);
  if (!guideSelection) return { err: "No gRNAs found with cut sites within 30 bp of the mutation site." };
  const { guides: selectedGuides, window: guideWindow, tier: guideTier } = guideSelection;
  const blockedPositions = new Set(mutationPositions);

  const result = { type: "pm", gene: gb.gene, an: aaNumber, wA: wtAA.toUpperCase(), mA: mutAA.toUpperCase(), wC: codonInfo.cod, mC: bestMutantCodon, gp: codonInfo.g, ch: bestChanges, gs: [], os: [], ss: [], ps: [], guideWindow, guideTier };
  selectedGuides.forEach((guide, index) => {
    const silent = findSilent(gb, guide, blockedPositions);
    const donor = mkODN(gb, guide, mutationPositions, mutationBases, silent ? [silent] : []);
    const guideName = makeGuideName(gb.gene, "pm", index, mutationString);
    result.gs.push({ n: guideName, sp: guide.sp, pm: guide.pam, str: guide.str, gc: guide.gc, d: guide.d, arm: buildPointMutationGuideNote(guide, guideTier, guideWindow) });
    if (donor) result.os.push({ ...donor, n: `ssODN${index + 1}`, gi: index, guideName, guideStrand: guide.str });
    if (silent) result.ss.push({ ...silent, gi: index + 1 });
  });

  const forwardPrimerStart = Math.max(0, codonInfo.g - 250);
  result.ps = [
    { n: makePrimerName(gb.gene, "pm", "Fw", mutationString), s: seq.slice(forwardPrimerStart, forwardPrimerStart + 24) },
    { n: makePrimerName(gb.gene, "pm", "Rev", mutationString), s: reverseComplement(seq.slice(Math.min(seq.length - 24, codonInfo.g + 250), Math.min(seq.length, codonInfo.g + 274))) },
  ];
  return result;
}

export function designCT(gb, tag, homologyArmLength) {
  const cds = getCdsFromModel(gb);
  if (!cds) return { err: "No CDS annotation found in GenBank file." };
  const seq = getGenomicSequence(gb);
  const lastSegment = gb.cdsSegments[gb.cdsSegments.length - 1];
  const stopStart = lastSegment[1] - 3;
  const stopCodon = seq.slice(stopStart, stopStart + 3);
  if (!["TAA", "TAG", "TGA"].includes(stopCodon)) return { err: `Expected a stop codon at the end of the CDS, found ${stopCodon}.` };
  const preset = getInsertPreset(tag, "ct");
  if (!preset) return { err: `Tag "${tag}" is not available.` };

  const armLength = parseInt(homologyArmLength, 10) || 250;
  const homology5Start = Math.max(0, stopStart - armLength);
  const homology3End = Math.min(seq.length, stopStart + 3 + armLength);
  const homology5 = seq.slice(homology5Start, stopStart);
  const homology3 = seq.slice(stopStart + 3, homology3End);
  const guideSelection = selectInsertGuidesWithFallback(gb, stopStart);
  if (!guideSelection) return { err: "No SpCas9 gRNAs found with cut sites within 30 bp of the stop codon." };
  const { guides, window: guideWindow, tier: guideTier } = guideSelection;

  const silentMutations = [];
  const blockedPositions = new Set();
  guides.slice(0, 2).forEach((guide, index) => {
    const silent = findSilent(gb, guide, blockedPositions, { allowNonCoding: true });
    const inHomology5 = silent && silent.gp >= homology5Start && silent.gp < stopStart;
    const inHomology3 = silent && silent.gp >= stopStart + 3 && silent.gp < homology3End;
    if (inHomology5 || inHomology3) {
      silentMutations.push({ ...silent, gi: index + 1 });
      blockedPositions.add(silent.gp);
    }
  });
  const homology5Array = homology5.split("");
  const homology3Array = homology3.split("");
  silentMutations.forEach((mutation) => {
    const homology5Index = mutation.gp - homology5Start;
    if (homology5Index >= 0 && homology5Index < homology5Array.length) {
      homology5Array[homology5Index] = mutation.nb;
      return;
    }
    const homology3Index = mutation.gp - (stopStart + 3);
    if (homology3Index >= 0 && homology3Index < homology3Array.length) homology3Array[homology3Index] = mutation.nb;
  });

  const donor = `${homology5Array.join("")}${preset.seq}${homology3Array.join("")}`;
  const donorAnnotations = buildDonorAnnotations(
    homology5.length,
    preset.segments,
    homology3.length,
    buildSilentAnnotations(silentMutations, (mutation) => {
      const homology5Index = mutation.gp - homology5Start;
      if (homology5Index >= 0 && homology5Index < homology5.length) return homology5Index;
      const homology3Index = mutation.gp - (stopStart + 3);
      if (homology3Index >= 0 && homology3Index < homology3.length) return homology5.length + preset.seq.length + homology3Index;
      return -1;
    }),
  );
  const lastAA = getCodonAtAa(gb, gb.proteinLength, toAA);
  const guideProtection = guides.slice(0, 2).map((guide, index) => {
    const guideIndex = index + 1;
    const mutation = silentMutations.find((entry) => entry.gi === guideIndex) || null;
    const byInsertion = guideOverlapsReplacement(guide, stopStart, stopStart + 3);
    return {
      guideIndex,
      byMutation: !!mutation,
      byInsertion,
      protected: !!mutation || byInsertion,
    };
  });
  return {
    type: "ct",
    gene: gb.gene,
    stop: stopCodon,
    sp: stopStart + 1,
    prot: gb.proteinLength,
    lastAA: lastAA ? `${lastAA.aa}${gb.proteinLength}` : "?",
    tag,
    td: `${tag} (${preset.seq.length} bp)`,
    il: preset.seq.length,
    hl: armLength,
    h5l: homology5.length,
    h3l: homology3.length,
    dl: donor.length,
    donor,
    donorAnnotations,
    guideWindow: guideWindow,
    guideTier,
    guideProtection,
    gs: guides.slice(0, 2).map((guide, index) => ({ n: makeGuideName(gb.gene, "ct", index, "", tag), sp: guide.sp, pm: guide.pam, str: guide.str, gc: guide.gc, d: guide.d, note: buildInsertGuideNote(guide, "stop", guideTier, guideWindow) })),
    ss: silentMutations,
    ps: [
      { n: makePrimerName(gb.gene, "ct", "Fw", "", tag), s: pickPrimerOutsideLeft(seq, homology5Start) },
      { n: makePrimerName(gb.gene, "ct", "Rev", "", tag), s: pickPrimerOutsideRight(seq, homology3End) },
    ],
    amp: `WT ~${homology3End + 49 - homology5Start + 50} bp | KI ~${homology3End + 49 - homology5Start + 50 + preset.seq.length} bp`,
  };
}

export function designKO(gb) {
  const cds = getCdsFromModel(gb);
  if (!cds) return { err: "No CDS annotation found." };
  if (gb.cdsSegments.length < 2) return { err: "Not enough coding exons available for KO design." };
  const target = findKoDesignTargetFromModel(gb, reverseComplement, selectKoGuidePair);
  if (!target) return { err: "No gRNA pair found with cut-site spacing up to 140 bp across coding exons 2-4, including exon-intron boundaries." };
  const { start: exonStart, end: exonEnd, exonLength: bestLength, exonNumber, pair: selectedPair } = target;
  const seq = getGenomicSequence(gb);

  return {
    type: "ko",
    gene: gb.gene,
    exon: `Exon ${exonNumber} (${exonStart + 1}-${exonEnd}, ${bestLength} bp)`,
    exSz: bestLength,
    prot: gb.proteinLength,
    gs: selectedPair.guides.map((guide, index) => {
      const context = describeKoGenomicContextFromModel(gb, guide.cut);
      return {
        n: makeGuideName(gb.gene, "ko", index),
        sp: guide.sp,
        pm: guide.pam,
        str: guide.str,
        gc: guide.gc,
        d: guide.d,
        note: `Cut at ${guide.cut + 1}, ${context.label} (${context.detail}) | pair spacing ${selectedPair.spacing} bp`,
      };
    }),
    ps: [
      { n: makePrimerName(gb.gene, "ko", "Fw"), s: seq.slice(Math.max(0, exonStart - 200), Math.max(0, exonStart - 200) + 24) },
      { n: makePrimerName(gb.gene, "ko", "Rev"), s: reverseComplement(seq.slice(Math.min(seq.length - 24, exonEnd + 175), Math.min(seq.length, exonEnd + 199))) },
    ],
    amp: `~${exonEnd + 199 - exonStart + 200} bp`,
    strat: "NHEJ-mediated frameshift using Cas9 RNP. Screen by Sanger sequencing plus ICE/TIDE, then confirm protein loss.",
  };
}

export function designNT(gb, tag, homologyArmLength) {
  const cds = getCdsFromModel(gb);
  if (!cds) return { err: "No CDS annotation found." };
  const seq = getGenomicSequence(gb);
  const startCodonPos = gb.cdsSegments[0][0];
  if (seq.slice(startCodonPos, startCodonPos + 3) !== "ATG") return { err: `Expected ATG at CDS start, found ${seq.slice(startCodonPos, startCodonPos + 3)}.` };
  const preset = getInsertPreset(tag, "nt");
  if (!preset) return { err: `Unknown tag: ${tag}.` };

  const armLength = parseInt(homologyArmLength, 10) || 250;
  const insertionSite = startCodonPos;
  const codingResume = startCodonPos + 3;
  const homology5Start = Math.max(0, insertionSite - armLength);
  const homology3End = Math.min(seq.length, codingResume + armLength);
  const homology5 = seq.slice(homology5Start, insertionSite);
  const homology3 = seq.slice(codingResume, homology3End);
  const guideSelection = selectInsertGuidesWithFallback(gb, startCodonPos);
  if (!guideSelection) return { err: "No gRNAs found with cut sites within 30 bp of the start codon." };
  const { guides, window: guideWindow, tier: guideTier } = guideSelection;

  const silentMutations = [];
  const blockedPositions = new Set();
  guides.slice(0, 2).forEach((guide, index) => {
    const silent = findSilent(gb, guide, blockedPositions, { allowNonCoding: true });
    if (silent && silent.gp >= homology5Start && silent.gp < homology3End) {
      silentMutations.push({ ...silent, gi: index + 1 });
      blockedPositions.add(silent.gp);
    }
  });

  const homology5Array = homology5.split("");
  const homology3Array = homology3.split("");
  silentMutations.forEach((mutation) => {
    const homology5Index = mutation.gp - homology5Start;
    if (homology5Index >= 0 && homology5Index < homology5Array.length) { homology5Array[homology5Index] = mutation.nb; return; }
    const homology3Index = mutation.gp - codingResume;
    if (homology3Index >= 0 && homology3Index < homology3Array.length) homology3Array[homology3Index] = mutation.nb;
  });

  const donor = `${homology5Array.join("")}${preset.seq}${homology3Array.join("")}`;
  const donorAnnotations = buildDonorAnnotations(
    homology5.length,
    preset.segments,
    homology3.length,
    buildSilentAnnotations(silentMutations, (mutation) => {
      const homology5Index = mutation.gp - homology5Start;
      if (homology5Index >= 0 && homology5Index < homology5.length) return homology5Index;
      const homology3Index = mutation.gp - codingResume;
      if (homology3Index >= 0 && homology3Index < homology3.length) return homology5.length + preset.seq.length + homology3Index;
      return -1;
    }),
  );
  const guideProtection = guides.slice(0, 2).map((guide, index) => {
    const guideIndex = index + 1;
    const mutation = silentMutations.find((entry) => entry.gi === guideIndex) || null;
    const byInsertion = guideOverlapsReplacement(guide, startCodonPos, startCodonPos + 3);
    return {
      guideIndex,
      byMutation: !!mutation,
      byInsertion,
      protected: !!mutation || byInsertion,
    };
  });
  return {
    type: "nt",
    gene: gb.gene,
    prot: gb.proteinLength,
    tag,
    td: `${tag} (${preset.seq.length} bp)`,
    il: preset.seq.length,
    hl: armLength,
    h5l: homology5.length,
    h3l: homology3.length,
    dl: donor.length,
    donor,
    donorAnnotations,
    guideWindow: guideWindow,
    guideTier,
    guideProtection,
    gs: guides.slice(0, 2).map((guide, index) => ({ n: makeGuideName(gb.gene, "nt", index, "", tag), sp: guide.sp, pm: guide.pam, str: guide.str, gc: guide.gc, d: guide.d, note: buildInsertGuideNote(guide, "start codon replacement site", guideTier, guideWindow) })),
    ss: silentMutations,
    ps: [
      { n: makePrimerName(gb.gene, "nt", "Fw", "", tag), s: pickPrimerOutsideLeft(seq, homology5Start) },
      { n: makePrimerName(gb.gene, "nt", "Rev", "", tag), s: pickPrimerOutsideRight(seq, homology3End) },
    ],
    amp: `WT ~${homology3End + 49 - homology5Start + 50} bp | KI ~${homology3End + 49 - homology5Start + 50 + preset.seq.length - 3} bp`,
  };
}

export function runDesignFromTranscriptModel(projectType, model, mutation, tag, homologyArmLength) {
  if (!model?.genomicSequence) return { err: "Transcript model is missing genomic sequence." };
  if (!projectType) return { err: "Select a project type first." };
  const cds = getCdsFromModel(model);
  if (!cds) return { err: "Transcript model is missing CDS segments." };

  let designResult;
  if (projectType === "pm") {
    if (!mutation) return { err: "Enter a mutation such as L72S." };
    designResult = designPM(model, mutation);
  } else if (projectType === "ct") designResult = designCT(model, tag, homologyArmLength);
  else if (projectType === "nt") designResult = designNT(model, tag, homologyArmLength);
  else designResult = designKO(model);

  return {
    gb: model,
    cds,
    dbg: `Parsed ${model.genomicSequence.length} bp with ${getFeatureCount(model)} features. CDS: ${model.gene}, ${model.cdsSegments.length} segments, ${model.proteinLength} aa.`,
    ...designResult,
  };
}

export function runDesign(projectType, gbRaw, mutation, tag, homologyArmLength) {
  if (!gbRaw) return { err: "Upload a GenBank file first." };
  const parsedGenBank = parseGB(gbRaw);
  if (!parsedGenBank.seq) return { err: "Could not parse a DNA sequence from the file." };
  const model = normalizeGenBankToTranscriptModel(parsedGenBank);
  if (!model?.genomicSequence) return { err: "Could not normalize the GenBank file into a transcript model." };
  return runDesignFromTranscriptModel(projectType, model, mutation, tag, homologyArmLength);
}
