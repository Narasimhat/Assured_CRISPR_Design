#!/usr/bin/env node
// Step 1 of 3: every SpCas9 (NGG) guide whose cut lies in a non-terminal coding exon of the record, with the 65-nt input Lindel needs
// (cut at index 30, guide on the + strand of the input).
//   node tools/ko-rank/ko_candidates.mjs record.gb [--gene SYMBOL] > candidates.json
import fs from "node:fs";
import { parseGB } from "../../src/designEngine.js";
import { normalizeGenBankToTranscriptModel } from "../../src/transcriptModel.js";

export { listKoCandidates as listCandidates } from "../../src/koRank.js";
import { listKoCandidates as listCandidates } from "../../src/koRank.js";

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2]; const geneAt = process.argv.indexOf("--gene");
  if (!file) { console.error("usage: ko_candidates.mjs record.gb [--gene SYMBOL]"); process.exit(2); }
  const model = normalizeGenBankToTranscriptModel(parseGB(fs.readFileSync(file, "utf8")), { expectedGene: geneAt > 0 ? process.argv[geneAt + 1] : undefined });
  if (!model.cdsSegments || model.cdsSegments.length < 2) { console.error("The record needs a CDS with at least two coding exons."); process.exit(1); }
  process.stdout.write(JSON.stringify({ gene: model.gene, proteinLength: model.proteinLength, guides: listCandidates(model) }));
}
