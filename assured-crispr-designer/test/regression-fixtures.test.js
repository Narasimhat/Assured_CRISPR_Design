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
  parseGB,
  runDesign,
  summarizeGuideBlocking,
  summarizePrimerReadiness,
  summarizeProcurementReadiness,
} from "../src/designEngine.js";
import { normalizeGenBankToTranscriptModel } from "../src/transcriptModel.js";
import { getDonorStrandBadge } from "../src/reportModel.js";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const readFixture = (name) => readFileSync(path.join(fixturesDir, name), "utf8");

const CASES = [
  {
    name: "APOE R154S: donors encode Ser, and both guides are strongly blocked",
    audit: "findings 1 and 2 - APOE R154S donor collision; false-positive guide blocking",
    reference: "apoe-r154s.gb",
    design: { type: "pm", mutation: "R154S", options: { deliveryMethod: "rnp" } },
    expect: {
      gene: "APOE",
      // Review, on guide GC only. gRNA2's PAM cannot be changed synonymously, so it used to
      // carry a single seed mismatch and be refused; the engine now stacks three, which is
      // adequate protection. What remains is the 70%/75% GC observation.
      procurement: "review",
      // The archived donor applied CGC->CGA and encoded Arg. Every emitted donor must
      // encode the requested Ser and nothing else.
      donorCount: 2,
      donorObservedAa: "S",
      // gRNA1 kills its PAM outright. gRNA2 cannot, so it gets three synonymous seed
      // mismatches instead - adequate protection, though the PAM does survive.
      guideBlocking: ["strong", "strong"],
      // The blocking sets themselves, so a regression to single-change blocking is caught
      // here and not only in the tier it happens to produce. Both guides take three: a
      // synonymous PAM change alone leaves about 0.107 of the original activity, which is
      // above the protection threshold, so gRNA1 does not stop at its PAM change either.
      blockingChangeCounts: [3, 3],
      // The cross-guide protection matrix, donor by donor, is the evidence behind the
      // "do not pool" instruction: each ssODN protects only its own guide and leaves the
      // other guide's target intact. Asserting only the matrix's *size* let a mutation
      // that graded every mismatch as "strong" pass unnoticed, because summarizeGuideBlocking
      // reads result.ss while this matrix comes from assessOrientedGuideSite.
      donorGuideProtection: [["strong", "none"], ["none", "strong"]],
      // Still false in single-pair mode: each donor carries only its own guide's changes, so
      // the other guide's target is untouched. Co-delivery mode is what changes that.
      coDeliverySafe: false,
      guidePairs: [
        { guideName: "APOE_R154S_gRNA1", tier: "strong", orderable: true },
        { guideName: "APOE_R154S_gRNA2", tier: "strong", orderable: true },
      ],
      warnings: [/GC 70%/, /GC 75%/],
    },
  },
  {
    name: "two-gene reference: the neighbouring gene must not be designed against silently",
    audit: "reference handling - CDS was selected by file order, so NG_007084 designed TOMM40 for an APOE request",
    reference: "two-genes-partial-first.gb",
    design: { type: "ko", options: { deliveryMethod: "rnp" } },
    expect: {
      // NEIGHBOURA is first in the file; TARGETB is the complete gene. File order must
      // not decide this.
      gene: "TARGETB",
      procurement: "blocked",
      blockers: [/annotates 2 genes/i, /chosen by annotation completeness/i],
    },
  },
  {
    name: "two-gene reference: stating the intended gene resolves the ambiguity",
    audit: "reference handling - an explicit gene removes the guess rather than papering over it",
    reference: "two-genes-partial-first.gb",
    design: { type: "ko", options: { deliveryMethod: "rnp", expectedGene: "TARGETB" } },
    expect: {
      gene: "TARGETB",
      // No longer blocked: the choice was requested, not inferred.
      procurementNot: "blocked",
      blockersNotMatching: [/annotates 2 genes/i],
    },
  },
  {
    name: "N-terminal tag: insert intact and recommended primers outside the homology arms",
    audit: "terminal-tag donor construction; primers outside homology arms",
    reference: "synthetic-tagging.gb",
    design: { type: "nt", tag: "N:SD40-Linker", arm: 400, options: { deliveryMethod: "rnp", expectedGene: "TAGME" } },
    expect: {
      gene: "TAGME",
      procurement: "ready",
      insertValid: true,
      primerStrategy: "recommended-outside-homology-arms",
      minOutsideMargin: 50,
      amp: /^WT ~\d+ bp \| KI ~\d+ bp$/,
    },
  },
  {
    name: "C-terminal tag: insert intact and recommended primers outside the homology arms",
    audit: "terminal-tag donor construction; primers outside homology arms",
    reference: "synthetic-tagging.gb",
    design: { type: "ct", tag: "SD40-2xHA", arm: 400, options: { deliveryMethod: "rnp", expectedGene: "TAGME" } },
    expect: {
      gene: "TAGME",
      procurement: "ready",
      insertValid: true,
      primerStrategy: "recommended-outside-homology-arms",
      minOutsideMargin: 50,
      amp: /^WT ~\d+ bp \| KI ~\d+ bp$/,
    },
  },
  {
    name: "internal tag: in-frame insert, both WT and KI bands, guides not poolable",
    audit: "internal tag frame validation",
    reference: "synthetic-tagging.gb",
    design: { type: "it", mutation: "F50", tag: "SPOT", arm: 400, options: { deliveryMethod: "rnp", expectedGene: "TAGME" } },
    expect: {
      gene: "TAGME",
      insertValid: true,
      guideBlocking: ["strong", "strong"],
      coDeliverySafe: false,
      amp: /^WT ~\d+ bp \| KI ~\d+ bp$/,
      warnings: [/Do not co-deliver or pool/i],
    },
  },
  {
    name: "internal tag on a minus-strand donor is validated in coding orientation",
    audit: "internal tag frame validation - orientation defect",
    reference: "synthetic-tagging.gb",
    // The insert used to be sliced out of the ORDER strand, which is the reverse
    // complement of the sense donor when the guide is on the + strand. Comparing that to
    // a sense-orientation preset always failed, and because alphaBtx's reverse complement
    // contains an in-frame TAG it also reported a fabricated premature stop. Both were
    // false blockers on a valid design.
    design: { type: "it", mutation: "R100", tag: "alphaBtx", arm: 400, options: { deliveryMethod: "rnp", expectedGene: "TAGME" } },
    expect: {
      gene: "TAGME",
      insertValid: true,
      insertUnexpectedStop: false,
      // Previously blocked: both guides relied on one seed mismatch each. With up to three
      // synonymous changes both are now adequately protected, so what is left is review.
      procurement: "review",
      blockersNotMatching2: [/No guide is strongly blocked by its matched donor/i],
      blockersNotMatching: [/does not match the selected preset/i, /does not preserve the intended coding frame/i],
    },
  },
  // ----- refusal paths -----
  {
    name: "refusal: an unsupported C-terminal cassette",
    audit: "unsupported cassette handling",
    reference: "synthetic-tagging.gb",
    design: { type: "ct", tag: "NOT_A_REAL_CASSETTE", arm: 400, options: { expectedGene: "TAGME" } },
    expect: { designError: /Tag "NOT_A_REAL_CASSETTE" is not available/ },
  },
  {
    name: "refusal: an unsupported internal tag",
    audit: "unsupported cassette handling",
    reference: "synthetic-tagging.gb",
    design: { type: "it", mutation: "F50", tag: "NOT_A_TAG", arm: 400, options: { expectedGene: "TAGME" } },
    expect: { designError: /Internal tag "NOT_A_TAG" is not available/ },
  },
  {
    name: "refusal: a custom guide that is not an explicit 20 nt spacer",
    audit: "incomplete guide/PAM input",
    reference: "synthetic-tagging.gb",
    design: {
      type: "pm",
      mutation: "R100E",
      arm: 400,
      options: { expectedGene: "TAGME", customGuides: ["GGCGTTCAGTGATTGTCGC"] },
    },
    expect: { designError: /must be a 20 nt spacer/ },
  },
  {
    name: "refusal: a custom guide that does not map near the target site",
    audit: "mixed-project input rejection - reagents from the wrong locus",
    reference: "synthetic-tagging.gb",
    design: {
      type: "pm",
      mutation: "R100E",
      arm: 400,
      options: { expectedGene: "TAGME", customGuides: ["AAAAAAAAAAAAAAAAAAAA"] },
    },
    expect: { designError: /does not map within \d+ bp of the target site/ },
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
      // Each donor must be assessed against EVERY offered guide, not just its own -
      // that matrix is what the "do not pool" instruction rests on.
      assert.equal(
        (donor.guideProtection || []).length,
        (result.gs || []).length,
        `${label}: donor ${index} was not assessed against every offered guide`,
      );
      // Point-mutation donors carry the final assembled-protein assertion; internal-tag
      // donors are validated at the result level via insertValidation instead.
      if (result.type === "pm") {
        assert.ok(donor.proteinValidation, `${label}: donor ${index} has no protein assertion`);
        assert.equal(donor.proteinValidation.valid, true, `${label}: donor ${index} failed its protein assertion`);
      }
    });
  }

  // Any design that inserts a preset must prove the insert survived assembly intact.
  if (["it", "ct", "nt"].includes(result.type)) {
    assert.ok(result.insertValidation, `${label}: ${result.type} design has no insertValidation`);
    assert.equal(
      result.insertValidation.actualLengthBp,
      result.insertValidation.expectedLengthBp,
      `${label}: assembled insert length differs from the preset`,
    );
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

    // Refusal cases assert on the error instead: a design that never completed has no
    // guides, donors or verdict for the invariants to inspect.
    if (e.designError) {
      assert.ok(result.err, `${label}: expected the design to be refused, but it completed`);
      assert.match(result.err, e.designError, `${label}: refusal message`);
      return;
    }

    assertUniversalInvariants(result, label);

    if (e.gene) assert.equal(result.gene, e.gene, `${label}: wrong gene selected from the reference`);

    const readiness = summarizeProcurementReadiness(result);
    if (e.procurement) assert.equal(readiness.status, e.procurement, `${label}: procurement status`);
    if (e.procurementNot) assert.notEqual(readiness.status, e.procurementNot, `${label}: procurement status`);

    (e.blockersNotMatching || []).forEach((pattern) => {
      assert.doesNotMatch(readiness.blockers.join(" "), pattern, `${label}: unexpected blocker ${pattern}`);
    });

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

    if (e.blockingChangeCounts) {
      // How many synonymous changes each guide actually received. The tier alone cannot tell
      // a single lucky PAM change from three stacked seed mismatches, and a regression to
      // one-change blocking would keep the tier for guides whose PAM can be killed.
      const counts = (result.gs || []).map((_, index) =>
        (result.ss || []).filter((entry) => entry.gi === index + 1).length);
      assert.deepEqual(counts, e.blockingChangeCounts, `${label}: blocking change counts`);
    }

    if (e.blockersNotMatching2) {
      const joined = summarizeProcurementReadiness(result).blockers.join(" ");
      e.blockersNotMatching2.forEach((pattern) => {
        assert.doesNotMatch(joined, pattern, `${label}: unexpected blocker ${pattern}`);
      });
    }

    if (e.guidePairs) {
      // Release state is per guide+donor pair, so the harness has to check it per pair.
      // This expectation was silently ignored until the branch existed - an unhandled key
      // in a declarative harness is a test that reads as coverage and asserts nothing.
      const actual = summarizeProcurementReadiness(result).guidePairs
        .map((pair) => ({ guideName: pair.guideName, tier: pair.tier, orderable: pair.orderable }));
      assert.deepEqual(actual, e.guidePairs, `${label}: guide pair readiness`);
    }

    if (e.donorGuideProtection) {
      const matrix = (result.os || []).map((donor) => (donor.guideProtection || []).map((entry) => entry.tier));
      assert.deepEqual(matrix, e.donorGuideProtection, `${label}: cross-guide protection matrix`);
    }

    if (e.coDeliverySafe !== undefined) assert.equal(result.coDeliverySafe, e.coDeliverySafe);

    if (e.insertValid) {
      const v = result.insertValidation || {};
      assert.equal(v.matchesPreset, true, `${label}: assembled insert does not match the preset`);
      assert.equal(v.framePreserved, true, `${label}: assembled insert does not preserve frame`);
    }
    if (e.insertUnexpectedStop !== undefined) {
      assert.equal(
        result.insertValidation.unexpectedStop,
        e.insertUnexpectedStop,
        `${label}: unexpectedStop`,
      );
    }
    if (e.primerStrategy) assert.equal(result.primerStrategy, e.primerStrategy, `${label}: primer strategy`);
    if (e.amp) assert.match(result.amp, e.amp, `${label}: amplicon reporting`);

    if (e.minOutsideMargin !== undefined) {
      // The README promises recommended primers sit wholly outside the homology arms with
      // at least this much clearance, and that both margins are recorded.
      const candidate = (result.primerCandidates || [])[0];
      assert.ok(candidate, `${label}: no primer candidate recorded`);
      assert.equal(candidate.minimumOutsideMargin, e.minOutsideMargin, `${label}: recorded margin floor`);
      assert.ok(
        candidate.leftOutsideMargin >= e.minOutsideMargin,
        `${label}: left margin ${candidate.leftOutsideMargin} < ${e.minOutsideMargin}`,
      );
      assert.ok(
        candidate.rightOutsideMargin >= e.minOutsideMargin,
        `${label}: right margin ${candidate.rightOutsideMargin} < ${e.minOutsideMargin}`,
      );
    }

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

test("an unusable CDS is reported rather than silently designed against", () => {
  // NEIGHBOURA reproduces the TOMM40 hazard exactly: partial annotation, no ATG, and a
  // length that is not a multiple of three. Selecting it must surface all three, because
  // every downstream coordinate and residue number depends on the CDS being trustworthy.
  const record = parseGB(readFixture("two-genes-partial-first.gb"));

  const bad = normalizeGenBankToTranscriptModel(record, { expectedGene: "NEIGHBOURA" });
  assert.equal(bad.gene, "NEIGHBOURA");
  const codes = bad.referenceIssues.map((issue) => issue.code);
  assert.ok(codes.includes("partial-cds"), `expected partial-cds, got ${codes}`);
  assert.ok(codes.includes("cds-no-start-codon"), `expected cds-no-start-codon, got ${codes}`);
  assert.ok(codes.includes("cds-not-in-frame"), `expected cds-not-in-frame, got ${codes}`);
  bad.referenceIssues
    .filter((issue) => ["partial-cds", "cds-no-start-codon", "cds-not-in-frame"].includes(issue.code))
    .forEach((issue) => assert.equal(issue.severity, "blocker", `${issue.code} must block release`));

  // The complete gene has none of those problems.
  const good = normalizeGenBankToTranscriptModel(record, { expectedGene: "TARGETB" });
  assert.equal(good.gene, "TARGETB");
  assert.equal(good.transcriptId, "SYN_TARGETB.1", "transcript accession must belong to the selected gene");
  assert.deepEqual(
    good.referenceIssues.filter((issue) => issue.severity === "blocker"),
    [],
    "the complete gene must not be blocked",
  );
});

test("a requested gene that the reference does not contain is refused", () => {
  const record = parseGB(readFixture("two-genes-partial-first.gb"));
  const model = normalizeGenBankToTranscriptModel(record, { expectedGene: "SORCS1" });
  const issue = model.referenceIssues.find((entry) => entry.code === "expected-gene-not-found");
  assert.ok(issue, "expected an expected-gene-not-found issue");
  assert.equal(issue.severity, "blocker");
  assert.match(issue.message, /no CDS for SORCS1/i);
  assert.match(issue.message, /NEIGHBOURA, TARGETB/);
});

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

// ---------------------------------------------------------------------------
// Co-delivery of two guides with two donors.
//
// The default design pairs each ssODN with one guide, which is only sound if that pair is
// delivered alone. When both guides and both donors go into the same well, a donor that
// disrupts only its own guide leaves the other guide free to re-cut the allele it just
// repaired.
// ---------------------------------------------------------------------------

const APOE = "apoe-r154s.gb";
const apoeDesign = (options) => runDesign("pm", readFixture(APOE), "R154S", "", 400,
  { deliveryMethod: "rnp", expectedGene: "APOE", ...options });

test("by default each donor blocks only its own guide", () => {
  // Regression guard: co-delivery mode must not change the single-pair output. Each donor
  // strongly blocks its own guide and leaves the other guide's target completely intact,
  // which is exactly why these two must not be pooled.
  const result = apoeDesign({});
  const matrix = result.os.map((donor) => donor.guideProtection.map((entry) => entry.tier));
  assert.deepEqual(matrix, [["strong", "none"], ["none", "strong"]]);
  assert.equal(result.coDeliverySafe, false);
  assert.match(result.guideDonorInstruction, /Do not co-deliver/i);
});

test("co-delivery mode makes every donor carry every guide's blocking change", () => {
  const result = apoeDesign({ coDeliveryBlocking: true });

  // No donor may leave any offered guide target completely intact.
  result.os.forEach((donor) => {
    donor.guideProtection.forEach((entry) => {
      assert.notEqual(
        entry.tier,
        "none",
        `${donor.n} leaves ${entry.guideName} fully intact, so that guide could re-cut a repaired allele`,
      );
    });
  });

  // Stacking blocking changes must not break the requested edit.
  result.os.forEach((donor) => {
    assert.equal(donor.proteinValidation.valid, true, `${donor.n} failed its protein assertion`);
    assert.equal(donor.proteinValidation.observedAa, "S");
  });
});

test("co-delivery is only declared safe when every guide is strongly disrupted", () => {
  const result = apoeDesign({ coDeliveryBlocking: true });
  const tiers = result.os.flatMap((donor) => donor.guideProtection.map((entry) => entry.tier));
  const allStrong = tiers.every((tier) => tier === "strong");
  // The invariant, whichever way this locus happens to come out.
  assert.equal(result.coDeliverySafe, allStrong);

  // At this locus it now comes out safe. gRNA2's PAM still cannot be changed synonymously,
  // but three seed mismatches protect it, and in co-delivery mode both donors carry both
  // guides' changes - so neither guide can re-cut whichever donor performed the repair.
  // With single-change blocking this design was correctly refused for co-delivery.
  assert.equal(result.coDeliverySafe, true);
  assert.ok(!tiers.includes("none"), "a guide target is left fully intact");
  assert.match(result.guideDonorInstruction, /co-?deliver/i);
});

test("co-delivery reports the deletion product two cut sites can create", () => {
  const result = apoeDesign({ coDeliveryBlocking: true });
  assert.ok(result.dualCutDeletionRisk, "co-delivery must flag the dual-cut deletion risk");
  assert.equal(result.dualCutDeletionRisk.cutSites.length, 2);
  assert.equal(result.dualCutDeletionRisk.spans.length, 1);
  assert.ok(result.dualCutDeletionRisk.spans[0] > 0);
  assert.match(result.dualCutDeletionRisk.note, /delete the intervening/i);

  // Not reported when co-delivery was not requested - it is a property of the protocol.
  assert.equal(apoeDesign({}).dualCutDeletionRisk, undefined);
});

test("co-delivery guide selection searches for a strongly blockable pair", () => {
  const result = apoeDesign({ coDeliveryBlocking: true });
  const selection = result.coDeliverySelection;
  assert.ok(selection, "co-delivery mode must report how guides were selected");
  // Proximity-only selection never looked at blockability at all.
  assert.ok(selection.searched >= 2, "should have searched more than the chosen pair");
  assert.equal(typeof selection.allStronglyBlockable, "boolean");
});

test("co-delivery names a safer single guide only when the pair is not safe", () => {
  // Co-delivery is a choice, not a free upgrade. Where no pair can be strongly blocked but
  // one guide can, the safer single-guide option has to be named rather than the weaker
  // two-guide design handed over silently.
  //
  // At this locus the pair *is* now safe, so there is nothing safer to recommend - the
  // advice must not appear. Capping blocking at one change reproduces the situation the
  // recommendation exists for.
  const safePair = apoeDesign({ coDeliveryBlocking: true });
  assert.equal(safePair.coDeliverySafe, true);
  assert.doesNotMatch(safePair.guideDonorInstruction, /safer at this site than co-delivering two/i);

  const constrained = apoeDesign({ coDeliveryBlocking: true, maxBlockingChanges: 1 });
  assert.equal(constrained.coDeliverySafe, false);
  const alternative = constrained.coDeliverySelection.singleGuideAlternative;
  assert.ok(alternative, "expected a single-guide alternative to be identified");
  assert.match(alternative.spacer, /^[ACGT]{20}$/);
  assert.ok(
    constrained.guideDonorInstruction.includes(alternative.spacer),
    "instruction does not name the safer single guide",
  );
  assert.match(constrained.guideDonorInstruction, /safer at this site than co-delivering two/i);
});

test("internal-tag co-delivery also blocks every offered guide", () => {
  const gb = readFixture("synthetic-tagging.gb");
  const opts = { deliveryMethod: "rnp", expectedGene: "TAGME" };
  const single = runDesign("it", gb, "R100", "alphaBtx", 400, opts);
  const co = runDesign("it", gb, "R100", "alphaBtx", 400, { ...opts, coDeliveryBlocking: true });

  const tiers = (result) => result.os.map((donor) => donor.guideProtection.map((entry) => entry.tier));
  // Default leaves the other guide's target untouched in at least one donor.
  assert.ok(tiers(single).flat().includes("none"), "fixture expected to show an unprotected guide by default");
  // Co-delivery must not leave any offered guide fully intact in any donor.
  tiers(co).flat().forEach((tier) => assert.notEqual(tier, "none"));
  // And the tag insert must still be correct.
  assert.equal(co.insertValidation.matchesPreset, true);
  assert.equal(co.insertValidation.framePreserved, true);
});

test("an insert that does not match its preset blocks procurement", () => {
  // Now that internal-tag inserts are validated in the right orientation, no fixture
  // produces a mismatched insert - so this gate needs asserting directly, or removing it
  // would go unnoticed.
  const base = {
    type: "it",
    deliveryMethod: "rnp",
    gs: [{ n: "TEST_gRNA1", sp: "GCTACGATCGTACGATCGTA", pm: "AGG" }],
    ss: [{ gi: 1, pur: "PAM AGG->ACG" }],
    os: [{ od: "ACGT", guideProtection: [{ guideIndex: 1, tier: "strong" }] }],
    ps: [],
    amp: "",
  };

  const mismatched = summarizeProcurementReadiness({
    ...base,
    insertValidation: { matchesPreset: false, framePreserved: true },
  });
  assert.equal(mismatched.status, "blocked");
  assert.match(mismatched.blockers.join(" "), /does not match the selected preset/i);

  const outOfFrame = summarizeProcurementReadiness({
    ...base,
    insertValidation: { matchesPreset: true, framePreserved: false },
  });
  assert.equal(outOfFrame.status, "blocked");
  assert.match(outOfFrame.blockers.join(" "), /does not preserve the intended coding frame/i);

  const clean = summarizeProcurementReadiness({
    ...base,
    insertValidation: { matchesPreset: true, framePreserved: true },
  });
  assert.doesNotMatch(clean.blockers.join(" "), /selected preset|coding frame/i);
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
