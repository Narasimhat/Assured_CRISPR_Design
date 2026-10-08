// Report layout: what is shown first, what is folded, and what is no longer repeated.
//
// The checks are structural (order of sections, one copy of each long sequence, mismatches still
// shown in full, items needing review listed first) because pixel layout cannot be asserted in
// node. They guard against the report drifting back to repeating the same QC list and sequences.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { runDesign } from "../src/designEngine.js";
import { buildReportHtml } from "../src/reportHtml.js";
import { buildReviewItems, buildRowMeta } from "../src/reportInputs.js";

const fixture = (name) => readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", name), "utf8");

const CASES = {
  ct: ["ct", "nr2f2-ng016753.gb", "", "GGGGS3-SD40-GGGGS-V5", "", { expectedGene: "NR2F2", donorFormat: "auto", autoTrimArms: true, customGuides: ["CAGTTTTAACTGGCCGTATA"] }],
  nt: ["nt", "synthetic-tagging.gb", "", "N:EGFP-Linker", 250, { expectedGene: "TAGME" }],
  it: ["it", "synthetic-tagging.gb", "F50", "SPOT", 250, { expectedGene: "TAGME" }],
  pm: ["pm", "apoe-r154s.gb", "R154S", "", 250, { expectedGene: "APOE", deliveryMethod: "rnp" }],
  ko: ["ko", "synthetic-tagging.gb", "", "", 400, { expectedGene: "TAGME" }],
};

function build(key, edit = (result) => result) {
  const [type, reference, mutation, tag, arm, options] = CASES[key];
  const result = edit(runDesign(type, fixture(reference), mutation, tag, arm, { deliveryMethod: "rnp", ...options }));
  assert.equal(result.err, undefined, result.err);
  const row = { gene: result.gene, cellLine: "", projectType: type, mutation, tag, fileName: reference, referenceSource: "genbank", deliveryMethod: "rnp" };
  const meta = buildRowMeta(row, result);
  return { result, html: buildReportHtml(meta, result, reference, null, buildReviewItems(meta, result, reference), null) };
}

// Visible text outside styles, scripts, SVG and the SVG data-URI download link.
const stripMarkup = (html) => html
  .replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<svg[\s\S]*?<\/svg>/g, " ")
  .replace(/href="data:[^"]*"/g, "").replace(/<[^>]+>/g, " ");

Object.keys(CASES).forEach((key) => {
  test(`${key}: sections come in a fixed order with consecutive numbers`, () => {
    const { html } = build(key);
    const headings = [...html.matchAll(/<h2>([^<]*)<\/h2>/g)].map((match) => match[1]);
    const numbers = headings.map((text) => Number(text.match(/^(\d+)\./)?.[1]));
    assert.deepEqual(numbers, numbers.map((_, index) => index + 1), `headings: ${headings.join(" | ")}`);
    const at = (text) => html.indexOf(text);
    assert.ok(at("Release status") < at(">Design Scheme<"), "release status comes first");
    assert.ok(at(">Design Scheme<") < at("1. Gene Information"), "the scheme comes before the numbered sections");
    assert.ok(at("1. Gene Information") < at("2. gRNA Sequences") && at("2. gRNA Sequences") < at("3. Recommended Primers"));
    assert.ok(at("3. Recommended Primers") < at("Design Readiness") && at("Design Readiness") < at("Review Checkpoints"));
  });

  test(`${key}: the report has no stray undefined, NaN or object text`, () => {
    const { html } = build(key);
    assert.ok(!/undefined|NaN|\[object Object\]/.test(stripMarkup(html)));
  });

  test(`${key}: readiness lists checks to review first and passes last, one row per check`, () => {
    const { html } = build(key);
    const table = html.slice(html.indexOf('<table class="checks">'), html.indexOf("</table>", html.indexOf('<table class="checks">')));
    const statuses = [...table.matchAll(/>(Review|N\/A|Pass)<\/span>/g)].map((match) => match[1]);
    const rank = { Review: 0, "N/A": 1, Pass: 2 };
    assert.ok(statuses.length >= 4);
    assert.deepEqual(statuses, [...statuses].sort((a, b) => rank[a] - rank[b]));
    assert.equal((table.match(/<tr>/g) || []).length, statuses.length);
  });

  test(`${key}: nothing is listed again under Review Checkpoints that readiness or the release status already print`, () => {
    const { html } = build(key);
    const review = html.slice(html.indexOf("Review Checkpoints"), html.indexOf("</body>"));
    const readiness = html.slice(html.indexOf("Design Readiness"), html.indexOf("Review Checkpoints"));
    const details = [...readiness.matchAll(/<td style="color:[^"]*;font-size:[\d.]+px;">([^<]+)<\/td>/g)].map((match) => match[1]);
    assert.ok(details.length > 0);
    details.forEach((detail) => assert.ok(!review.includes(detail), `repeated under Review Checkpoints: ${detail.slice(0, 80)}`));
  });
});

test("the QC checklist is printed once: no separate Knock-in QC Summary beside Design Readiness", () => {
  ["ct", "nt", "it"].forEach((key) => assert.ok(!build(key).html.includes("Knock-in QC Summary"), key));
});

test("a matching insert is printed once; a mismatch prints expected and designed in full", () => {
  const { result, html } = build("ct");
  const insert = result.insertValidation.actualSequence;
  assert.equal(html.split(insert).length - 1, 1, "insert DNA should appear once");
  assert.ok(html.includes("Insert DNA (identical to the preset)"));
  const broken = build("ct", (design) => ({
    ...design,
    insertValidation: { ...design.insertValidation, matchesPreset: false, actualSequence: `${design.insertValidation.actualSequence.slice(0, -3)}CCC` },
  })).html;
  assert.ok(broken.includes("Preset mismatch"));
  assert.ok(broken.includes("Expected insert DNA") && broken.includes("Designed donor insert DNA"));
  assert.ok(broken.includes(insert) && broken.includes(`${insert.slice(0, -3)}CCC`));
});

test("derived detail sits in closed folds: alternative primers, coding frame and insert translation, figure legend", () => {
  const { html } = build("ct");
  const folds = [...html.matchAll(/<details class="fold"([^>]*)><summary>([^<]*)<\/summary>/g)];
  const titles = folds.map((match) => match[2]);
  ["Alternative primer pairs", "Coding frame, insert sequence and translation", "Suggested figure legend"]
    .forEach((title) => assert.ok(titles.some((text) => text.startsWith(title)), `missing fold: ${title}`));
  assert.ok(folds.every((match) => !match[1].includes("open")), "folds start closed");
  const alt = html.indexOf("Alternative primer pairs");
  assert.ok(html.indexOf("<table", alt) < html.indexOf("</details>", alt), "alternative pairs sit inside their fold");
});

test("primers are one table; the donor format and arms show in the snapshot strip", () => {
  const { html } = build("ct");
  assert.ok(html.includes("Sequence (5'-3')"));
  assert.ok(html.includes("dsDNA block, arms 250/150"));
  assert.ok(!html.includes("grid-template-columns:repeat(auto-fit"), "no auto-fit card grids left in the page");
});

test("ssODN donors show the strand to order and fold the opposite strand", () => {
  ["pm", "it"].forEach((key) => {
    const { html } = build(key);
    const fold = html.indexOf("Opposite strand (reference only, not for ordering)");
    assert.ok(fold > 0, `${key}: reference strand should be folded`);
    assert.ok(html.indexOf("Recommended to order") > 0 && html.indexOf("Recommended to order") < fold, `${key}: the ordering strand stays visible, above the fold`);
    assert.ok(html.indexOf("Opposite donor strand for reference") > fold, `${key}: the opposite strand sits inside the fold`);
  });
});

test("with matched historical records the following sections renumber", () => {
  const { result } = build("ct");
  const meta = buildRowMeta({ gene: result.gene, cellLine: "", projectType: "ct", mutation: "", tag: "x", fileName: "f", referenceSource: "genbank" }, result);
  const html = buildReportHtml(meta, result, "f", { topMatches: [{ gene: "NR2F2", label: "earlier design", similarity: 0.9 }] }, [], null);
  const numbers = [...html.matchAll(/<h2>(\d+)\./g)].map((match) => Number(match[1]));
  assert.deepEqual(numbers, numbers.map((_, index) => index + 1));
  assert.ok(html.includes("5. Matched Historical Records") && html.includes("6. Design Readiness"));
});

test("Additional Info and the target region map are gone when the design scheme is drawn", () => {
  Object.keys(CASES).forEach((key) => {
    const { html } = build(key);
    assert.ok(!html.includes("Additional Info") && !html.includes("Plain-text summary"), `${key}: plain-text summary should be gone`);
    assert.ok(!html.includes("Target region map") && !html.includes("Target Region Map"), `${key}: the map duplicates the scheme`);
  });
});

test("the target region map is the fallback when the scheme cannot be drawn", () => {
  const { html } = build("ct", (design) => ({ ...design, gs: design.gs.map((guide) => ({ ...guide, cut: undefined })) }));
  assert.ok(!html.includes(">Design Scheme<"));
  assert.ok(html.includes("<summary>Target region map</summary>"), "the map should take the scheme's place");
});

test("what only the summary used to say now sits in its own section", () => {
  const ct = build("ct");
  assert.ok(ct.html.includes("Guide-blocking changes in the donor") && /Seed pos \d+\/\d+/.test(ct.html), "blocking changes with seed position");
  assert.ok(/Primer QC: \w+ confidence, pair penalty [\d.]+, Tm delta [\d.]+ C/.test(ct.html), "primer QC line");
  const ko = build("ko");
  assert.ok(ko.html.includes("Expected deletion") && ko.html.includes(`${ko.result.deletionOutcome.deletionSize} bp`) && ko.html.includes("Strategy"), "knockout outcome and strategy");
  assert.ok(ko.html.indexOf("Expected deletion") < ko.html.indexOf("Design Readiness"), "under the knockout section, not at the end");
});

test("the scheme axis states the position in the uploaded reference", () => {
  const ct = build("ct");
  assert.ok(ct.html.includes(`= 0 = position ${ct.result.sp} of the uploaded reference`));
  const pm = build("pm");
  assert.ok(pm.html.includes(`edited base = position ${pm.result.gp + 1} of the uploaded reference`));
  const it = build("it");
  assert.ok(it.html.includes(`insertion between positions ${it.result.gp} and ${it.result.gp + 1}`));
});
