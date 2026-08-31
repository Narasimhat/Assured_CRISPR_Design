// Regression fixtures derived from audit/2026_GE_design_audit.md.
//
// The audit established, by independent human review, what the correct answer is for a
// set of real design packages. That makes it the only ground-truth validation set this
// engine has. Each case below pins one audited finding to an executable expectation.
//
// Two kinds of assertion run per case:
//   - the case's own `expect` block, for the specific audited behaviour
//   - the universal invariants, which every design must satisfy regardless of scenario
//
// The invariants are the more valuable half: they turn each new fixture into coverage
// for every class of defect, not only its own scenario.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  runDesign,
  summarizeGuideBlocking,
  summarizePrimerReadiness,
  summarizeProcurementReadiness,
} from "../src/designEngine.js";
import { getDonorStrandBadge } from "../src/reportModel.js";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const readFixture = (name) => readFileSync(path.join(fixturesDir, name), "utf8");

const CASES = [
  {
    name: "APOE R154S: donors must encode Ser, and one weak guide blocks release",
    audit: "findings 1 and 2 - APOE R154S donor collision; false-positive guide blocking",
    reference: "apoe-r154s.gb",
    design: { type: "pm", mutation: "R154S", options: { deliveryMethod: "rnp" } },
    expect: {
      gene: "APOE",
      procurement: "blocked",
      // The archived donor applied CGC->CGA and encoded Arg. Every emitted donor must
      // encode the requested Ser and nothing else.
      donorCount: 2,
      donorObservedAa: "S",
      // gRNA1 has a real PAM disruption; gRNA2 has only a seed mismatch, which must
      // never be graded as adequate protection.
      guideBlocking: ["strong", "weak"],
      // The cross-guide protection matrix, donor by donor, is the evidence behind the
      // "do not pool" instruction: each ssODN protects only its own guide and leaves the
      // other guide's target intact. Asserting only the matrix's *size* let a mutation
      // that graded every mismatch as "strong" pass unnoticed, because summarizeGuideBlocking
      // reads result.ss while this matrix comes from assessOrientedGuideSite.
      donorGuideProtection: [["strong", "none"], ["none", "weak"]],
      coDeliverySafe: false,
      blockers: [/not strong/i],
      warnings: [/GC 70%/, /GC 75%/],
    },
  },
];

function runCase(entry) {
  const gb = readFixture(entry.reference);
  const { type, mutation = "", tag = "", arm = 400, options = {} } = entry.design;
  return runDesign(type, gb, mutation, tag, arm, options);
}

// ---------------------------------------------------------------------------
// Universal invariants: applied to every fixture, whatever the design type.
// ---------------------------------------------------------------------------
function assertUniversalInvariants(result, label) {
  const readiness = summarizeProcurementReadiness(result);

  assert.equal(result.err, undefined, `${label}: design reported an error`);

  // A design that claims to have completed must not be hollow. The audit's recurring
  // failure mode is a populated-looking record missing the thing being ordered.
  if (["pm", "it"].includes(result.type)) {
    assert.ok(
      (result.os || []).length > 0,
      `${label}: ${result.type} design completed with no donor - this must fail loudly, not render prose`,
    );
    (result.os || []).forEach((donor, index) => {
      assert.match(donor.od || "", /^[ACGT]+$/, `${label}: donor ${index} order sequence is empty or not DNA`);
      assert.ok(donor.proteinValidation, `${label}: donor ${index} has no protein assertion`);
      assert.equal(donor.proteinValidation.valid, true, `${label}: donor ${index} failed its protein assertion`);
      // Each donor must be assessed against EVERY offered guide, not just its own.
      assert.equal(
        (donor.guideProtection || []).length,
        (result.gs || []).length,
        `${label}: donor ${index} was not assessed against every offered guide`,
      );
    });
  }

  // Guide records must be complete enough to order.
  (result.gs || []).forEach((guide) => {
    assert.match(guide.sp || "", /^[ACGT]{20}$/, `${label}: ${guide.n} is not an explicit 20 nt SpCas9 spacer`);
    assert.match(guide.pm || "", /^[ACGT]{3}$/, `${label}: ${guide.n} has no complete PAM`);
  });

  // The standing external-specificity requirement must always travel with the verdict.
  assert.match(
    (readiness.standingRequirements || []).join(" "),
    /Genome-wide/i,
    `${label}: standing specificity requirement missing from the verdict`,
  );

  // Release language: a blocked design must never present an orderable donor strand.
  if (readiness.status === "blocked") {
    [true, false].forEach((recommended) => {
      const badge = getDonorStrandBadge({ recommended }, true);
      assert.equal(badge.orderable, false, `${label}: blocked design produced an orderable strand badge`);
      assert.doesNotMatch(badge.label, /^Order/i, `${label}: blocked design still says "Order..."`);
    });
  }

  // "ready" may only be reached when primer readiness genuinely passed.
  if (readiness.status === "ready") {
    assert.equal(
      summarizePrimerReadiness(result).ready,
      true,
      `${label}: reached "ready" while primer readiness had not passed`,
    );
    assert.deepEqual(readiness.blockers, [], `${label}: "ready" with blockers present`);
  }
}

for (const entry of CASES) {
  test(`fixture: ${entry.name}`, () => {
    const result = runCase(entry);
    const label = entry.reference;
    const e = entry.expect;

    assertUniversalInvariants(result, label);

    if (e.gene) assert.equal(result.gene, e.gene, `${label}: wrong gene selected from the reference`);

    const readiness = summarizeProcurementReadiness(result);
    if (e.procurement) assert.equal(readiness.status, e.procurement, `${label}: procurement status`);

    if (e.donorCount !== undefined) assert.equal((result.os || []).length, e.donorCount);

    if (e.donorObservedAa) {
      (result.os || []).forEach((donor, i) => {
        assert.equal(
          donor.proteinValidation.observedAa,
          e.donorObservedAa,
          `${label}: donor ${i} encodes the wrong residue`,
        );
      });
    }

    if (e.guideBlocking) {
      const tiers = summarizeGuideBlocking(result).guides.map((guide) => guide.tier);
      assert.deepEqual(tiers, e.guideBlocking, `${label}: guide blocking tiers`);
    }

    if (e.donorGuideProtection) {
      const matrix = (result.os || []).map((donor) => (donor.guideProtection || []).map((entry) => entry.tier));
      assert.deepEqual(matrix, e.donorGuideProtection, `${label}: cross-guide protection matrix`);
    }

    if (e.coDeliverySafe !== undefined) assert.equal(result.coDeliverySafe, e.coDeliverySafe);

    (e.blockers || []).forEach((pattern) => {
      assert.match(readiness.blockers.join(" "), pattern, `${label}: expected blocker ${pattern}`);
    });
    (e.warnings || []).forEach((pattern) => {
      assert.match(readiness.warnings.join(" "), pattern, `${label}: expected warning ${pattern}`);
    });
  });
}

// ---------------------------------------------------------------------------
// Negative wiring checks.
//
// A fixture whose design behaves correctly cannot prove that a *rejection* path still
// works: deleting the protein-assertion blocker changed nothing for the APOE case,
// because both of its donors are valid. These assert the gates themselves fire, using
// minimal hand-built results rather than a reference.
// ---------------------------------------------------------------------------

test("a donor that fails its protein assertion blocks procurement", () => {
  // audit finding 1: the archived R154S gRNA2 donor encoded Arg instead of Ser. If the
  // assertion is ever bypassed, this is the gate that must still refuse release.
  const base = {
    type: "pm",
    deliveryMethod: "rnp",
    gs: [{ n: "TEST_gRNA1", sp: "GCTACGATCGTACGATCGTA", pm: "AGG" }],
    ss: [{ gi: 1, pur: "PAM AGG->ACG" }],
    ps: [],
    amp: "",
  };

  const failing = summarizeProcurementReadiness({
    ...base,
    os: [{ proteinValidation: { valid: false, intendedAa: "S", observedAa: "R", errors: ["expected S, observed R"] } }],
  });
  assert.equal(failing.status, "blocked");
  assert.match(failing.blockers.join(" "), /protein assertion/i);

  const passing = summarizeProcurementReadiness({
    ...base,
    os: [{ proteinValidation: { valid: true, intendedAa: "S", observedAa: "S" } }],
  });
  assert.doesNotMatch(passing.blockers.join(" "), /protein assertion/i);
});

test("a point-mutation design with no donor at all blocks procurement", () => {
  const readiness = summarizeProcurementReadiness({
    type: "pm",
    deliveryMethod: "rnp",
    gs: [{ n: "TEST_gRNA1", sp: "GCTACGATCGTACGATCGTA", pm: "AGG" }],
    ss: [{ gi: 1, pur: "PAM AGG->ACG" }],
    os: [],
    ps: [],
    amp: "",
  });
  assert.equal(readiness.status, "blocked");
  assert.match(readiness.blockers.join(" "), /no validated ssODN donor/i);
});

test("every committed fixture is exercised by a case", () => {
  // Guards against a reference being added to fixtures/ and never wired into CASES.
  const present = readdirSync(fixturesDir).filter((name) => name.endsWith(".gb"));
  const referenced = new Set(CASES.map((entry) => entry.reference));
  assert.ok(present.length > 0, "no fixtures found");
  present.forEach((name) => {
    assert.ok(referenced.has(name), `fixture ${name} is not referenced by any case`);
  });
});
