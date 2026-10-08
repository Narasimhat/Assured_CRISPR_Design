// Guide use for terminal tags: what the donor protects, and what two cuts can do.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { runDesign } from "../src/designEngine.js";
import { describeGuideUse } from "../src/guideUse.js";
import { buildDesignReadinessChecks } from "../src/reportHtml.js";

const fixture = (name) => readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", name), "utf8");
const NR2F2 = (extra = {}) => {
  const result = runDesign("ct", fixture("nr2f2-ng016753.gb"), "", "GGGGS3-SD40-GGGGS-V5", "", { expectedGene: "NR2F2", donorFormat: "auto", autoTrimArms: true, ...extra });
  assert.equal(result.err, undefined, result.err);
  return result;
};
const G1 = "CAGTTTTAACTGGCCGTATA";
const MODERATE_PARTNER = "TGTCCGGCAGCAGTTTTAAC";

test("NR2F2 default pair: both guides strongly protected in one donor, 29 bp between the cuts", () => {
  const result = NR2F2();
  const use = result.guideUse;
  assert.deepEqual([use.count, use.together, use.status, use.cutSpan], [2, true, "pass", 29]);
  assert.deepEqual(use.tiers, ["strong", "strong"]);
  assert.equal(result.gs[1].cut - result.gs[0].cut, 29, "span in the text is the real distance between cuts");
  assert.ok(use.detail.includes("Both guides can be delivered together"));
  assert.ok(use.detail.includes("delete those 29 bp"));
  assert.ok(use.detail.includes("14 bp 5\u2032 of the stop codon") && use.detail.includes("15 bp 3\u2032 of the stop codon"));
});

test("the donor of the pair carries a blocking change for each guide", () => {
  const result = NR2F2();
  assert.deepEqual([...new Set(result.ss.map((change) => change.gi))].sort(), [1, 2]);
});

test("a flagged spacer is named in the guide-use text without changing the verdict", () => {
  const use = NR2F2().guideUse;
  assert.equal(use.flagged.length, 1);
  assert.ok(use.detail.includes("GC 5% is below 25%") && use.detail.includes("75% of the spacer is A"));
});

test("one guide: no deletion warning, and a weakly protected one is flagged", () => {
  const use = NR2F2({ customGuides: [G1] }).guideUse;
  assert.deepEqual([use.count, use.together, use.status, use.cutSpan], [1, false, "pass", null]);
  assert.ok(use.detail.includes("no deletion between cuts is possible"));
  const weak = describeGuideUse({ guides: [{ name: "g", sp: G1, str: "+", gc: 40, d: -3, cut: 100 }], protection: [{ guideIndex: 1, tier: "weak" }], anchorWord: "stop codon" });
  assert.equal(weak.status, "warn");
  assert.ok(weak.detail.includes("can re-cut"));
});

test("a pair with a partner that is only moderately protected is flagged: deliver the strong guide alone or add changes", () => {
  const result = NR2F2({ customGuides: [G1, MODERATE_PARTNER] });
  const use = result.guideUse;
  assert.deepEqual([use.count, use.together, use.status], [2, false, "warn"]);
  assert.deepEqual(use.tiers, ["strong", "moderate"]);
  assert.ok(use.detail.includes("Not every guide is strongly protected") && use.detail.includes("re-cut"));
});

test("readiness lists Guide use for C- and N-terminal tags only", () => {
  const ct = buildDesignReadinessChecks(NR2F2()).find((check) => check.label === "Guide use");
  assert.equal(ct.status, "pass");
  assert.ok(ct.detail.includes("delete those 29 bp"));
  const nt = runDesign("nt", fixture("synthetic-tagging.gb"), "", "N:EGFP-Linker", "", { expectedGene: "TAGME", donorFormat: "auto" });
  assert.ok(nt.guideUse && nt.guideUse.detail.includes("start codon"));
  assert.ok(buildDesignReadinessChecks(nt).some((check) => check.label === "Guide use"));
  const pm = runDesign("pm", fixture("apoe-r154s.gb"), "R154S", "", 250, { expectedGene: "APOE", deliveryMethod: "rnp" });
  assert.equal(pm.guideUse, undefined);
  assert.ok(!buildDesignReadinessChecks(pm).some((check) => check.label === "Guide use"));
});

test("nothing to say without guides", () => {
  assert.equal(describeGuideUse({ guides: [], protection: [], anchorWord: "stop codon" }), null);
});
