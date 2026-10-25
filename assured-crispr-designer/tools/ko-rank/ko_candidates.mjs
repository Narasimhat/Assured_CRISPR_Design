#!/usr/bin/env node
// Step 1 of 3: every SpCas9 (NGG) guide whose cut lies in a non-terminal coding exon of the record, with the 65-nt input Lindel needs
// (cut at index 30, guide on the + strand of the input).
//   node tools/ko-rank/ko_candidates.mjs record.gb [--gene SYMBOL] > candidates.json
import fs from "node:fs";
import { parseGB } from "../../src/designEngine.js";
import { normalizeGenBankToTranscriptModel } from "../../src/transcriptModel.js";

const rc = (s) => [...s].reverse().map((c) => ({ A: "T", C: "G", G: "C", T: "A" })[c] || "N").join("");

export function listCandidates(model) {
  const G = model.genomicSequence.toUpperCase(); const L = G.length; const segs = model.cdsSegments;
  const where = (cut) => { for (let i = 0; i < segs.length - 1; i += 1) { const [a, b] = segs[i]; if (cut > a + 2 && cut < b - 2) return { exonIndex: i + 1, offset: cut - a }; } return null; };
  const guides = [];
  const push = (spacer, strand, pam, cut) => {
    const place = where(cut); if (!place) return;
    const window65 = strand === "+" ? G.slice(cut - 30, cut + 35) : rc(G.slice(cut - 35, cut + 30));
    if (window65.length !== 65 || !/^[ACGT]+$/.test(window65)) return;
    if (window65.slice(13, 33) !== spacer) return;
    const gc = Math.round([...spacer].filter((c) => c === "G" || c === "C").length * 5);
    guides.push({ spacer, strand, pam, cut, exonIndex: place.exonIndex, offset: place.offset, gc, window65 });
  };
  for (let i = 0; i + 23 <= L; i += 1) {
    const pamP = G.slice(i + 20, i + 23); if (/^[ACGT]GG$/.test(pamP)) push(G.slice(i, i + 20), "+", pamP, i + 17);
    const pamM = rc(G.slice(i, i + 3)); if (/^[ACGT]GG$/.test(pamM)) push(rc(G.slice(i + 3, i + 23)), "-", pamM, i + 6);
  }
  return guides;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2]; const geneAt = process.argv.indexOf("--gene");
  if (!file) { console.error("usage: ko_candidates.mjs record.gb [--gene SYMBOL]"); process.exit(2); }
  const model = normalizeGenBankToTranscriptModel(parseGB(fs.readFileSync(file, "utf8")), { expectedGene: geneAt > 0 ? process.argv[geneAt + 1] : undefined });
  if (!model.cdsSegments || model.cdsSegments.length < 2) { console.error("The record needs a CDS with at least two coding exons."); process.exit(1); }
  process.stdout.write(JSON.stringify({ gene: model.gene, proteinLength: model.proteinLength, guides: listCandidates(model) }));
}
