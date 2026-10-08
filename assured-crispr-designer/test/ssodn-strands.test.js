// ssODN strands for terminal tags: one ssODN per PAM-bearing strand of the offered guides.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { runDesign } from "../src/designEngine.js";
import { buildDonorFormatReport, describeDonorFormat, planDonorArms } from "../src/donorFormat.js";
import { buildBatchOrderRows } from "../src/orderRows.js";
import { buildDonorFormatHtml } from "../src/reportHtml.js";

const fixture = (name) => readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", name), "utf8");
const revcomp = (seq) => [...seq].reverse().map((base) => ({ A: "T", C: "G", G: "C", T: "A" }[base])).join("");
const GUIDE1 = "CAGTTTTAACTGGCCGTATA";      // + strand, 14 bp 5' of the stop codon
const MINUS_GUIDE = "ATTTATTGAATTGCCATATA";  // - strand, 12 bp 5' of the stop codon
const design = (tag, extra = {}) => {
  const result = runDesign("ct", fixture("nr2f2-ng016753.gb"), "", tag, "", { expectedGene: "NR2F2", donorFormat: "auto", autoTrimArms: true, ...extra });
  assert.equal(result.err, undefined, result.err);
  return result;
};
const rowsOf = (result) => buildBatchOrderRows([{ status: "success", slot: 1, rowId: "r1", result, row: { gene: result.gene, projectType: "ct", fileName: "reference.gb" } }])
  .filter((row) => row.itemType === "Donor");

test("guides on opposite strands give two ssODNs, one per PAM-bearing strand, same content", () => {
  const result = design("2xHA-only", { customGuides: [GUIDE1, MINUS_GUIDE] });
  assert.deepEqual(result.gs.map((guide) => guide.str), ["+", "-"]);
  const { orderStrands, orderStrand, orderSequence } = result.donorFormat;
  assert.deepEqual(orderStrands.map((entry) => entry.strand), ["antisense", "sense"]);
  assert.equal(orderStrands[0].sequence, revcomp(result.donor));
  assert.equal(orderStrands[1].sequence, result.donor);
  assert.equal(orderStrands[0].sequence, revcomp(orderStrands[1].sequence));
  assert.ok(orderStrands[0].guideNames.length === 1 && orderStrands[0].guideNames[0].endsWith("gRNA1"));
  assert.ok(orderStrands[1].guideNames.length === 1 && orderStrands[1].guideNames[0].endsWith("gRNA2"));
  // The first-guide fields are unchanged for existing consumers.
  assert.deepEqual([orderStrand, orderSequence], ["antisense", orderStrands[0].sequence]);
  assert.ok(result.donor.length <= 200);
  assert.deepEqual([...new Set(result.ss.map((change) => change.gi))].sort(), [1, 2], "the one donor blocks both guides");
});

test("guides on the same strand share one ssODN", () => {
  const result = design("2xHA-only");
  assert.deepEqual(result.gs.map((guide) => guide.str), ["+", "+"]);
  const { orderStrands } = result.donorFormat;
  assert.equal(orderStrands.length, 1);
  assert.equal(orderStrands[0].guideNames.length, 2);
  assert.equal(orderStrands[0].sequence, result.donorFormat.orderSequence);
  const row = describeDonorFormat(result.donorFormat).rows.find(([label]) => label.startsWith("Strand"));
  assert.equal(row[0], "Strand to order");
  assert.ok(row[1].includes("both guides"));
});

test("one custom guide gives one ssODN, and a donor block gives none", () => {
  const single = design("2xHA-only", { customGuides: [MINUS_GUIDE] });
  assert.deepEqual(single.donorFormat.orderStrands.map((entry) => entry.strand), ["sense"]);
  const block = design("GGGGS3-SD40-GGGGS-V5");
  assert.deepEqual([block.donorFormat.format, block.donorFormat.orderStrand, block.donorFormat.orderStrands], ["block", null, []]);
  assert.equal(rowsOf(block).length, 1);
});

test("order rows: two ssODN rows for opposite-strand guides, each linked to its guide", () => {
  const result = design("2xHA-only", { customGuides: [GUIDE1, MINUS_GUIDE] });
  const rows = rowsOf(result);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.name.replace(/^.*_donor_/, "")), ["ssODN1_antisense", "ssODN2_sense"]);
  assert.deepEqual(rows.map((row) => row.sequence), result.donorFormat.orderStrands.map((entry) => entry.sequence));
  assert.deepEqual(rows.map((row) => row.length), [result.donorFormat.orderStrands[0].sequence.length, result.donorFormat.orderStrands[1].sequence.length]);
  assert.equal(new Set(rows.map((row) => row.name)).size, 2);
  assert.ok(rows.every((row, index) => row.linkedGuide === result.donorFormat.orderStrands[index].guideNames[0]));
  assert.ok(rows.every((row) => row.notes.includes("deliver both")));
  const same = rowsOf(design("2xHA-only"));
  assert.equal(same.length, 1);
  assert.ok(same[0].name.endsWith("_donor"));
});

test("description and report name both strands and print both sequences", () => {
  const result = design("2xHA-only", { customGuides: [GUIDE1, MINUS_GUIDE] });
  const info = describeDonorFormat(result.donorFormat);
  const row = info.rows.find(([label]) => label === "Strands to order");
  assert.ok(row && row[1].includes("antisense") && row[1].includes("sense (genomic") && row[1].includes("differ only in strand"));
  const html = buildDonorFormatHtml(result);
  assert.ok(html.includes("ssODN 1 to order") && html.includes("ssODN 2 to order"));
  result.donorFormat.orderStrands.forEach((entry) => assert.ok(html.includes(entry.sequence)));
  const one = buildDonorFormatHtml(design("2xHA-only"));
  assert.ok(one.includes("Sequence to order") && !one.includes("ssODN 2 to order"));
});

test("a call that passes only the first guide strand behaves as before", () => {
  const plan = planDonorArms({ insertBp: 50, genome: "ACGT".repeat(400), leftEdge: 800, rightEdge: 800, requestedArm: null, options: { donorFormat: "ssodn" } });
  const donor = "A".repeat(180);
  const legacy = buildDonorFormatReport({ plan, donor, insertBp: 50, firstGuideStrand: "-" });
  assert.deepEqual([legacy.orderStrand, legacy.orderStrands.length, legacy.orderStrands[0].strand], ["sense", 1, "sense"]);
  const odd = buildDonorFormatReport({ plan, donor, insertBp: 50, guides: [{ str: "+", name: "a" }, { str: "?", name: "b" }] });
  assert.equal(odd.orderStrands.length, 1, "a guide with an unknown strand adds no second ssODN");
});

test("N-terminal designs name their guide and strand the same way", () => {
  const result = runDesign("nt", fixture("synthetic-tagging.gb"), "", "N:EGFP-Linker", "", { expectedGene: "TAGME", donorFormat: "ssodn" });
  assert.equal(result.err, undefined, result.err);
  const [entry] = result.donorFormat.orderStrands;
  assert.deepEqual([result.donorFormat.orderStrands.length, entry.strand, entry.guideNames[0].endsWith("gRNA1")], [1, result.gs[0].str === "+" ? "antisense" : "sense", true]);
});
