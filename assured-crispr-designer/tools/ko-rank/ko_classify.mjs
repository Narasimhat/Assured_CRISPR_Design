#!/usr/bin/env node
// Step 3 of 3: what each predicted outcome does to the protein, and the fraction of alleles that are loss of function.
//   node tools/ko-rank/ko_classify.mjs edits.json record.gb [--gene SYMBOL] > ranking.csv
// Every Lindel outcome class is mapped to the record, spliced into the coding sequence and classified by koOutcomes.js (the Assured QC engine's NMD and
// truncation rules). predicted_LoF_allele_pct is the Lindel-weighted share of outcomes that are a predicted loss of function; a clone needs both alleles
// to be, so predicted_biallelic_LoF_clone_pct is its square (alleles treated as independent). Insertions over 2 bp (a group Lindel does not resolve)
// are not classified and count as not loss of function.
import fs from "node:fs";
import { parseGB } from "../../src/designEngine.js";
import { normalizeGenBankToTranscriptModel } from "../../src/transcriptModel.js";
import { rankFromEdits, toGenomicEdit, toCsv } from "../../src/koRank.js";

export { rankFromEdits, toGenomicEdit, toCsv };

if (import.meta.url === `file://${process.argv[1]}`) {
  const [editsFile, recordFile] = process.argv.slice(2); const geneAt = process.argv.indexOf("--gene");
  if (!editsFile || !recordFile) { console.error("usage: ko_classify.mjs edits.json record.gb [--gene SYMBOL]"); process.exit(2); }
  const model = normalizeGenBankToTranscriptModel(parseGB(fs.readFileSync(recordFile, "utf8")), { expectedGene: geneAt > 0 ? process.argv[geneAt + 1] : undefined });
  const rows = rankFromEdits(model, JSON.parse(fs.readFileSync(editsFile, "utf8")));
  process.stdout.write(toCsv(rows));
}
