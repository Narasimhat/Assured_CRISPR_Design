import test from "node:test";
import assert from "node:assert/strict";

import { getPreferredStrandPresentation, normalizeDesignResult } from "../src/designResult.js";

test("normalizes guide-linked ssODNs without leaking engine field names to reports", () => {
  const normalized = normalizeDesignResult({
    type: "pm",
    gene: "APOE",
    gs: [{ n: "APOE_gRNA1", sp: "CCAGAGCACCGAGGAGCTGC", pm: "GGG", str: "+", gc: 70, arm: "8 bp from edit" }],
    os: [{ n: "ssODN1", od: "AACCGGTT", wo: "AACCGGCT", guideName: "APOE_gRNA1", sl: "- strand target" }],
    ps: [{ n: "APOE_Fw", s: "ACCATGAAGGAGTTGAAGGC" }],
  });

  assert.equal(normalized.guides[0].pam, "GGG");
  assert.equal(normalized.donors.length, 1);
  assert.equal(normalized.donors[0].sequence, "AACCGGTT");
  assert.equal(normalized.donors[0].linkedGuide, "APOE_gRNA1");
  assert.equal(normalized.primers[0].sequence, "ACCATGAAGGAGTTGAAGGC");
});

test("normalizes terminal HDR donors into the same donor collection", () => {
  const normalized = normalizeDesignResult({
    type: "ct",
    gene: "RAD52",
    tag: "SD40-2xHA",
    donor: "ACGTACGT",
    gs: [{ n: "RAD52_gRNA1", sp: "GCTACGATCGTACGATCGTA", pm: "AGG" }],
    ps: [],
  });

  assert.equal(normalized.donors.length, 1);
  assert.equal(normalized.donors[0].kind, "HDR");
  assert.equal(normalized.donors[0].sequence, "ACGTACGT");
  assert.equal(normalized.donors[0].linkedGuide, "RAD52_gRNA1");
});

test("knockout designs correctly normalize to no donor", () => {
  const normalized = normalizeDesignResult({ type: "ko", gene: "MYD88", gs: [], ps: [] });
  assert.deepEqual(normalized.donors, []);
});

test("preferred-strand copy never tells a blocked or review design to order", () => {
  for (const status of ["blocked", "review", "ready"]) {
    const presentation = getPreferredStrandPresentation(status);
    assert.doesNotMatch(`${presentation.label} ${presentation.note}`, /order this strand|recommended to order/i);
  }
  assert.match(getPreferredStrandPresentation("blocked").label, /blocked/i);
  assert.match(getPreferredStrandPresentation("review").label, /review/i);
});
