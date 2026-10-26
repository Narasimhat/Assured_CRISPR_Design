#!/usr/bin/env node
// Rank every NGG guide that cuts a non-terminal coding exon by the predicted share of loss-of-function alleles, without Python:
// the same Lindel model, run in JavaScript from src/lindel/lindel-weights.bin (checked against the Python implementation in test/lindel.test.js).
//   node tools/ko-rank/rank.mjs record.gb ranking.csv [--gene SYMBOL]
import fs from "node:fs";
import { parseGB } from "../../src/designEngine.js";
import { normalizeGenBankToTranscriptModel } from "../../src/transcriptModel.js";
import { loadLindel } from "../../src/lindel/loadLindel.js";
import { rankKoGuides, toCsv } from "../../src/koRank.js";

const [recordFile, outFile] = process.argv.slice(2); const geneAt = process.argv.indexOf("--gene");
if (!recordFile || !outFile) { console.error("usage: rank.mjs record.gb ranking.csv [--gene SYMBOL]"); process.exit(2); }
const model = normalizeGenBankToTranscriptModel(parseGB(fs.readFileSync(recordFile, "utf8")), { expectedGene: geneAt > 0 ? process.argv[geneAt + 1] : undefined });
if (!model.cdsSegments || model.cdsSegments.length < 2) { console.error("The record needs a CDS with at least two coding exons."); process.exit(1); }
const rows = rankKoGuides(model, await loadLindel());
fs.writeFileSync(outFile, toCsv(rows));
console.log(`wrote ${outFile} (${rows.length} guides)`);
