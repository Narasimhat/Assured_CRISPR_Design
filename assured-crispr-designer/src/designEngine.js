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

function getCDS(gb) {
  for (const feature of gb.feats) {
    if (feature.type !== "CDS") continue;
    const nums = feature.loc.match(/\d+/g);
    if (!nums || nums.length < 2) continue;
    const segs = [];
    for (let index = 0; index < nums.length - 1; index += 2) segs.push([parseInt(nums[index], 10) - 1, parseInt(nums[index + 1], 10)]);
    let cds = "";
    for (const [start, end] of segs) cds += gb.seq.slice(start, end);
    const geneFeature = gb.feats.find((entry) => entry.type === "gene");
    const name = geneFeature?.q?.label || geneFeature?.q?.gene || "Gene";
    return { segs, cds, prot: Math.floor(cds.length / 3) - 1, name };
  }
  return null;
}

function c2g(segs, codingPos) {
  let cursor = 0;
  for (const [start, end] of segs) {
    if (cursor + (end - start) > codingPos) return start + (codingPos - cursor);
    cursor += end - start;
  }
  return null;
}

function g2aa(segs, genomicPos) {
  let cursor = 0;
  for (const [start, end] of segs) {
    if (start <= genomicPos && genomicPos < end) return Math.floor((cursor + genomicPos - start) / 3) + 1;
    cursor += end - start;
  }
  return null;
}

function gCodon(segs, seq, aaNumber) {
  const genomicPos = c2g(segs, (aaNumber - 1) * 3);
  if (genomicPos === null) return null;
  const codon = seq.slice(genomicPos, genomicPos + 3);
  return { g: genomicPos, cod: codon, aa: toAA(codon) };
}

function findG(seq, target, range = 50) {
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

function armType(guide, mutationPos) {
  return guide.str === "+" ? (mutationPos > guide.cut ? "PROX" : "DIST") : (mutationPos < guide.cut ? "PROX" : "DIST");
}

function findSilent(seq, segs, guide) {
  let pamStart;
  if (guide.str === "+") pamStart = guide.ps + 20;
  else {
    const target = reverseComplement(guide.sp);
    const found = seq.indexOf(target);
    if (found < 0) return null;
    pamStart = found - 3;
  }
  if (pamStart < 0 || pamStart + 3 > seq.length) return null;

  const pamIndexes = guide.str === "+" ? [1, 2] : [0, 1];
  for (const pamIndex of pamIndexes) {
    const genomicPos = pamStart + pamIndex;
    if (genomicPos < 0 || genomicPos >= seq.length) continue;
    const aaNumber = g2aa(segs, genomicPos);
    if (!aaNumber) continue;
    const codonPos = c2g(segs, (aaNumber - 1) * 3);
    if (codonPos === null) continue;
    const codon = seq.slice(codonPos, codonPos + 3);
    const codonIndex = genomicPos - codonPos;
    const originalAA = toAA(codon);
    for (const alt of ["A", "C", "G", "T"]) {
      if (alt === codon[codonIndex]) continue;
      const mutantCodon = `${codon.slice(0, codonIndex)}${alt}${codon.slice(codonIndex + 1)}`;
      if (toAA(mutantCodon) !== originalAA) continue;
      const mutantPam = seq.slice(pamStart, pamStart + 3).split("");
      mutantPam[pamIndex] = alt;
      const stillPam = guide.str === "+" ? mutantPam.slice(1).join("") === "GG" : reverseComplement(mutantPam.join("")).slice(1) === "GG";
      if (!stillPam) {
        const oldPam = guide.str === "+" ? seq.slice(pamStart, pamStart + 3) : reverseComplement(seq.slice(pamStart, pamStart + 3));
        const newPam = guide.str === "+" ? mutantPam.join("") : reverseComplement(mutantPam.join(""));
        return { gp: genomicPos, nb: alt, lb: `p.${originalAA}${aaNumber}${originalAA}`, oc: codon, nc: mutantCodon, pur: `PAM ${oldPam}->${newPam}` };
      }
    }
  }

  for (let seedIndex = 10; seedIndex < 20; seedIndex += 1) {
    let genomicPos;
    if (guide.str === "+") genomicPos = guide.ps + seedIndex;
    else {
      const target = reverseComplement(guide.sp);
      const found = seq.indexOf(target);
      if (found < 0) continue;
      genomicPos = found + 19 - seedIndex;
    }
    if (genomicPos === undefined || genomicPos < 0 || genomicPos >= seq.length) continue;
    const aaNumber = g2aa(segs, genomicPos);
    if (!aaNumber) continue;
    const codonPos = c2g(segs, (aaNumber - 1) * 3);
    if (codonPos === null) continue;
    const codon = seq.slice(codonPos, codonPos + 3);
    const codonIndex = genomicPos - codonPos;
    const originalAA = toAA(codon);
    for (const alt of ["A", "C", "G", "T"]) {
      if (alt === codon[codonIndex]) continue;
      const mutantCodon = `${codon.slice(0, codonIndex)}${alt}${codon.slice(codonIndex + 1)}`;
      if (toAA(mutantCodon) === originalAA) return { gp: genomicPos, nb: alt, lb: `p.${originalAA}${aaNumber}${originalAA}`, oc: codon, nc: mutantCodon, pur: `Seed pos ${seedIndex + 1}/20` };
    }
  }
  return null;
}

function mkODN(seq, guide, mutationPositions, mutationBases, silentMutations = []) {
  let donorStart;
  let donorEnd;
  if (guide.str === "+") { donorStart = guide.cut - 36; donorEnd = guide.cut + 91; }
  else { donorStart = guide.cut - 91; donorEnd = guide.cut + 36; }
  if (donorStart < 0 || donorEnd > seq.length) return null;

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
  const ssOdn = guide.str === "+" ? reverseComplement(payload.join("")) : payload.join("");
  const wtOdn = guide.str === "+" ? reverseComplement(wildType) : wildType;
  const diff = [];
  for (let index = 0; index < 127; index += 1) if (ssOdn[index] !== wtOdn[index]) diff.push(index);
  return { od: ssOdn, wo: wtOdn, df: diff, sl: guide.str === "+" ? "- strand target" : "+ strand target" };
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

function buildDonorAnnotations(h5Length, insertSegments, h3Length) {
  const annotations = [];
  let cursor = 0;
  annotations.push({ label: "5' HA", color: DONOR_COLORS.HA5, start: cursor, end: cursor + h5Length });
  cursor += h5Length;
  insertSegments.forEach((segment) => {
    annotations.push({ label: segment.label, color: segment.color, start: cursor, end: cursor + segment.seq.length });
    cursor += segment.seq.length;
  });
  annotations.push({ label: "3' HA", color: DONOR_COLORS.HA3, start: cursor, end: cursor + h3Length });
  return annotations;
}

export function designPM(gb, mutationString) {
  const cds = getCDS(gb);
  if (!cds) return { err: "No CDS annotation found in GenBank file." };
  const mutation = mutationString.match(/([A-Z])(\d+)([A-Z])/i);
  if (!mutation) return { err: "Cannot parse mutation. Use a format like L72S or R176C." };

  const [, wtAA, aaNumberRaw, mutAA] = mutation;
  const aaNumber = parseInt(aaNumberRaw, 10);
  const codonInfo = gCodon(cds.segs, gb.seq, aaNumber);
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
        for (let index = 0; index < 3; index += 1) if (codonInfo.cod[index] !== mutantCodon[index]) changes.push({ p: codonInfo.g + index, w: codonInfo.cod[index], m: mutantCodon[index] });
        if (!bestMutantCodon || changes.length < bestChanges.length) { bestMutantCodon = mutantCodon; bestChanges = changes; }
      }
    }
  }
  if (!bestMutantCodon) return { err: `No codon encodes ${mutAA.toUpperCase()}.` };

  const mutationPositions = bestChanges.map((change) => change.p);
  const mutationBases = bestChanges.map((change) => change.m);
  const proximalGuides = findG(gb.seq, codonInfo.g, 50).filter((guide) => armType(guide, codonInfo.g) === "PROX").sort((left, right) => Math.abs(left.d) - Math.abs(right.d));
  if (!proximalGuides.length) return { err: "No gRNAs found that place the mutation in the proximal arm." };

  const result = { type: "pm", gene: cds.name, an: aaNumber, wA: wtAA.toUpperCase(), mA: mutAA.toUpperCase(), wC: codonInfo.cod, mC: bestMutantCodon, gp: codonInfo.g, ch: bestChanges, gs: [], os: [], ss: [], ps: [] };
  proximalGuides.slice(0, 2).forEach((guide, index) => {
    const silent = findSilent(gb.seq, cds.segs, guide);
    const donor = mkODN(gb.seq, guide, mutationPositions, mutationBases, silent ? [silent] : []);
    result.gs.push({ n: `gRNA${index + 1}`, sp: guide.sp, pm: guide.pam, str: guide.str, gc: guide.gc, d: guide.d, arm: `91nt proximal (${Math.abs(guide.d)} bp)` });
    if (donor) result.os.push({ ...donor, n: `ssODN${index + 1}`, gi: index });
    if (silent) result.ss.push({ ...silent, gi: index + 1 });
  });

  const forwardPrimerStart = Math.max(0, codonInfo.g - 250);
  result.ps = [
    { n: "Fw", s: gb.seq.slice(forwardPrimerStart, forwardPrimerStart + 24) },
    { n: "Rev", s: reverseComplement(gb.seq.slice(Math.min(gb.seq.length - 24, codonInfo.g + 250), Math.min(gb.seq.length, codonInfo.g + 274))) },
  ];
  return result;
}

export function designCT(gb, tag, homologyArmLength) {
  const cds = getCDS(gb);
  if (!cds) return { err: "No CDS annotation found in GenBank file." };
  const lastSegment = cds.segs[cds.segs.length - 1];
  const stopStart = lastSegment[1] - 3;
  const stopCodon = gb.seq.slice(stopStart, stopStart + 3);
  if (!["TAA", "TAG", "TGA"].includes(stopCodon)) return { err: `Expected a stop codon at the end of the CDS, found ${stopCodon}.` };
  const preset = getInsertPreset(tag, "ct");
  if (!preset) return { err: `Tag "${tag}" is not available.` };

  const armLength = parseInt(homologyArmLength, 10) || 250;
  const homology5Start = Math.max(0, stopStart - armLength);
  const homology3End = Math.min(gb.seq.length, stopStart + 3 + armLength);
  const homology5 = gb.seq.slice(homology5Start, stopStart);
  const homology3 = gb.seq.slice(stopStart + 3, homology3End);
  const guides = findG(gb.seq, stopStart, 50).sort((left, right) => Math.abs(left.d) - Math.abs(right.d));
  if (!guides.length) return { err: "No SpCas9 gRNAs found within 50 bp of the stop codon." };

  const silentMutations = [];
  guides.slice(0, 2).forEach((guide, index) => {
    const silent = findSilent(gb.seq, cds.segs, guide);
    if (silent && silent.gp >= homology5Start && silent.gp < stopStart) silentMutations.push({ ...silent, gi: index + 1 });
  });
  const homology5Array = homology5.split("");
  silentMutations.forEach((mutation) => {
    const donorIndex = mutation.gp - homology5Start;
    if (donorIndex >= 0 && donorIndex < homology5Array.length) homology5Array[donorIndex] = mutation.nb;
  });

  const donor = `${homology5Array.join("")}${preset.seq}${homology3}`;
  const donorAnnotations = buildDonorAnnotations(homology5.length, preset.segments, homology3.length);
  const lastAA = gCodon(cds.segs, gb.seq, cds.prot);
  return {
    type: "ct",
    gene: cds.name,
    stop: stopCodon,
    sp: stopStart + 1,
    prot: cds.prot,
    lastAA: lastAA ? `${lastAA.aa}${cds.prot}` : "?",
    tag,
    td: `${tag} (${preset.seq.length} bp)`,
    il: preset.seq.length,
    hl: armLength,
    h5l: homology5.length,
    h3l: homology3.length,
    dl: donor.length,
    donor,
    donorAnnotations,
    gs: guides.slice(0, 2).map((guide, index) => ({ n: `gRNA${index + 1}`, sp: guide.sp, pm: guide.pam, str: guide.str, gc: guide.gc, d: guide.d, note: `Cut ${Math.abs(guide.d)} bp ${guide.d < 0 ? "5-prime" : "3-prime"} of stop` })),
    ss: silentMutations,
    ps: [
      { n: "Fw", s: gb.seq.slice(Math.max(0, homology5Start - 50), Math.max(0, homology5Start - 50) + 24) },
      { n: "Rev", s: reverseComplement(gb.seq.slice(Math.min(gb.seq.length - 24, homology3End + 25), Math.min(gb.seq.length, homology3End + 49))) },
    ],
    amp: `WT ~${homology3End + 49 - homology5Start + 50} bp | KI ~${homology3End + 49 - homology5Start + 50 + preset.seq.length} bp`,
  };
}

export function designKO(gb) {
  const cds = getCDS(gb);
  if (!cds) return { err: "No CDS annotation found." };
  const targetSegments = cds.segs.slice(1, 4);
  if (!targetSegments.length) return { err: "Not enough coding exons available for KO design." };

  let bestSegment = targetSegments[0];
  let bestLength = 0;
  targetSegments.forEach(([start, end]) => {
    if (end - start > bestLength) { bestLength = end - start; bestSegment = [start, end]; }
  });

  const [exonStart, exonEnd] = bestSegment;
  const exonMidpoint = Math.floor((exonStart + exonEnd) / 2);
  const segmentIndex = cds.segs.findIndex((segment) => segment[0] === exonStart) + 1;
  const guides = findG(gb.seq, exonMidpoint, Math.floor(bestLength / 2) + 10).filter((guide) => guide.cut >= exonStart + 5 && guide.cut <= exonEnd - 5).sort((left, right) => right.gc - left.gc);
  if (!guides.length) return { err: "No gRNAs found within the target exon." };

  return {
    type: "ko",
    gene: cds.name,
    exon: `CDS segment ${segmentIndex} (${exonStart + 1}-${exonEnd}, ${bestLength} bp)`,
    exSz: bestLength,
    prot: cds.prot,
    gs: guides.slice(0, 2).map((guide, index) => ({ n: `gRNA${index + 1}`, sp: guide.sp, pm: guide.pam, str: guide.str, gc: guide.gc, d: guide.d, note: `Cut at ${guide.cut + 1}, ${guide.cut - exonStart} bp into exon` })),
    ps: [
      { n: "Fw", s: gb.seq.slice(Math.max(0, exonStart - 200), Math.max(0, exonStart - 200) + 24) },
      { n: "Rev", s: reverseComplement(gb.seq.slice(Math.min(gb.seq.length - 24, exonEnd + 175), Math.min(gb.seq.length, exonEnd + 199))) },
    ],
    amp: `~${exonEnd + 199 - exonStart + 200} bp`,
    strat: "NHEJ-mediated frameshift using Cas9 RNP. Screen by Sanger sequencing plus ICE/TIDE, then confirm protein loss.",
  };
}

export function designNT(gb, tag, homologyArmLength) {
  const cds = getCDS(gb);
  if (!cds) return { err: "No CDS annotation found." };
  const startCodonPos = cds.segs[0][0];
  if (gb.seq.slice(startCodonPos, startCodonPos + 3) !== "ATG") return { err: `Expected ATG at CDS start, found ${gb.seq.slice(startCodonPos, startCodonPos + 3)}.` };
  const preset = getInsertPreset(tag, "nt");
  if (!preset) return { err: `Unknown tag: ${tag}.` };

  const armLength = parseInt(homologyArmLength, 10) || 250;
  const insertionSite = startCodonPos;
  const codingResume = startCodonPos + 3;
  const homology5Start = Math.max(0, insertionSite - armLength);
  const homology3End = Math.min(gb.seq.length, codingResume + armLength);
  const homology5 = gb.seq.slice(homology5Start, insertionSite);
  const homology3 = gb.seq.slice(codingResume, homology3End);
  const guides = findG(gb.seq, startCodonPos, 50).sort((left, right) => Math.abs(left.d) - Math.abs(right.d));
  if (!guides.length) return { err: "No gRNAs found near the start codon." };

  const silentMutations = [];
  guides.slice(0, 2).forEach((guide, index) => {
    const silent = findSilent(gb.seq, cds.segs, guide);
    if (silent && silent.gp >= homology5Start && silent.gp < homology3End) silentMutations.push({ ...silent, gi: index + 1 });
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
  const donorAnnotations = buildDonorAnnotations(homology5.length, preset.segments, homology3.length);
  return {
    type: "nt",
    gene: cds.name,
    prot: cds.prot,
    tag,
    td: `${tag} (${preset.seq.length} bp)`,
    il: preset.seq.length,
    hl: armLength,
    h5l: homology5.length,
    h3l: homology3.length,
    dl: donor.length,
    donor,
    donorAnnotations,
    gs: guides.slice(0, 2).map((guide, index) => ({ n: `gRNA${index + 1}`, sp: guide.sp, pm: guide.pam, str: guide.str, gc: guide.gc, d: guide.d, note: `Cut ${Math.abs(guide.d)} bp from start codon replacement site` })),
    ss: silentMutations,
    ps: [
      { n: "Fw", s: gb.seq.slice(Math.max(0, homology5Start - 50), Math.max(0, homology5Start - 50) + 24) },
      { n: "Rev", s: reverseComplement(gb.seq.slice(Math.min(gb.seq.length - 24, homology3End + 25), Math.min(gb.seq.length, homology3End + 49))) },
    ],
    amp: `WT ~${homology3End + 49 - homology5Start + 50} bp | KI ~${homology3End + 49 - homology5Start + 50 + preset.seq.length - 3} bp`,
  };
}

export function runDesign(projectType, gbRaw, mutation, tag, homologyArmLength) {
  if (!gbRaw) return { err: "Upload a GenBank file first." };
  if (!projectType) return { err: "Select a project type first." };

  const gb = parseGB(gbRaw);
  if (!gb.seq) return { err: "Could not parse a DNA sequence from the file." };
  const cds = getCDS(gb);
  if (!cds) return { err: "No CDS annotation found. The GenBank file needs a CDS feature." };

  let designResult;
  if (projectType === "pm") {
    if (!mutation) return { err: "Enter a mutation such as L72S." };
    designResult = designPM(gb, mutation);
  } else if (projectType === "ct") designResult = designCT(gb, tag, homologyArmLength);
  else if (projectType === "nt") designResult = designNT(gb, tag, homologyArmLength);
  else designResult = designKO(gb);

  return { gb, cds, dbg: `Parsed ${gb.seq.length} bp with ${gb.feats.length} features. CDS: ${cds.name}, ${cds.segs.length} segments, ${cds.prot} aa.`, ...designResult };
}
