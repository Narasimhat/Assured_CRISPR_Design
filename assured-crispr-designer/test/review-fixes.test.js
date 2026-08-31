import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPrimerRecord,
  assessGuideSequence,
  classifySpCas9PamDisruption,
  designIT,
  designPM,
  designOutsideHomologyArmPrimerPairs,
  summarizeGuideBlocking,
  summarizePrimerPairQuality,
  summarizePrimerReadiness,
  summarizeProcurementReadiness,
  validatePointMutationPayload,
} from "../src/designEngine.js";

function seededDna(length) {
  let state = 0x5eed1234;
  const bases = "ACGT";
  let sequence = "";
  for (let index = 0; index < length; index += 1) {
    state = (1664525 * state + 1013904223) >>> 0;
    sequence += bases[(state >>> 28) % 4];
  }
  return sequence;
}

test("NAG and NGA are never accepted as dead SpCas9 PAMs", () => {
  assert.deepEqual(classifySpCas9PamDisruption("AGG", "AAG").acceptable, false);
  assert.deepEqual(classifySpCas9PamDisruption("TGG", "TGA").acceptable, false);
  assert.equal(classifySpCas9PamDisruption("TGG", "TGT").tier, "strong");
  assert.equal(classifySpCas9PamDisruption("AGG", "ACG").tier, "strong");
});

test("a single seed mismatch with an intact PAM stays a warning", () => {
  const summary = summarizeGuideBlocking({
    gs: [{ n: "gRNA1" }],
    ss: [{ gi: 1, pur: "Seed pos 11/20", blockingTier: "weak", blockingReason: "single seed mismatch" }],
  });
  assert.equal(summary.status, "warn");
  assert.equal(summary.tier, "weak");
});

test("legacy NAG mutations are reclassified as weak rather than passed", () => {
  const summary = summarizeGuideBlocking({
    gs: [{ n: "gRNA1" }],
    ss: [{ gi: 1, pur: "PAM AGG->AAG" }],
  });
  assert.equal(summary.status, "warn");
  assert.match(summary.detail, /weak/i);
});

test("a weakened PAM plus a seed mismatch is moderate but still requires review", () => {
  const summary = summarizeGuideBlocking({
    gs: [{ n: "gRNA1" }],
    ss: [
      { gi: 1, pur: "PAM AGG->AAG" },
      { gi: 1, pur: "Seed pos 15/20", blockingTier: "weak" },
    ],
  });
  assert.equal(summary.tier, "moderate");
  assert.equal(summary.status, "warn");
});

test("outside-arm primer pairs enforce and report a 50 bp nearest-edge margin", () => {
  const sequence = seededDna(2400);
  const pairs = designOutsideHomologyArmPrimerPairs(sequence, 950, 1450);
  assert.ok(pairs.length > 0);
  const pair = pairs[0];
  assert.ok(pair.leftOutsideMargin >= 50);
  assert.ok(pair.rightOutsideMargin >= 50);
  assert.equal(pair.minimumOutsideMargin, 50);

  const readiness = summarizePrimerReadiness({
    ps: [buildPrimerRecord("Fw", pair.fw.seq), buildPrimerRecord("Rev", pair.rev.seq)],
    amp: `WT ~${pair.amp} bp`,
    primerStrategy: pair.score <= -900 ? "outside-homology-arms-fallback" : "validated-outside-homology-arms",
    primerCandidates: [pair],
  });
  assert.equal(readiness.ready, pair.score > -900);
  assert.match(readiness.detail, /outside the 5'\/3' arms/);
});

test("fallback primers never receive an ordering-ready result", () => {
  const forward = buildPrimerRecord("Fw", "GCTACGATCGTACGATCGTACG");
  const reverse = buildPrimerRecord("Rev", "CGTACGATCGTACGATCGTAGC");
  const readiness = summarizePrimerReadiness({
    ps: [forward, reverse],
    amp: "WT ~650 bp",
    primerStrategy: "outside-homology-arms-fallback",
    primerCandidates: [{ score: -999, leftOutsideMargin: 50, rightOutsideMargin: 50, minimumOutsideMargin: 50 }],
  });
  assert.equal(readiness.ready, false);
  assert.equal(readiness.status, "warn");
  assert.match(readiness.detail, /fallback/i);
});

test("R154S-style same-codon collision fails the final protein assertion", () => {
  const model = {
    genomicSequence: "CGC" + "GCC".repeat(20),
    cdsSegments: [[0, 63]],
  };
  const wrongPayload = ("AGA" + "GCC".repeat(20)).split("");
  const validation = validatePointMutationPayload(model, 0, wrongPayload, 1, "S");
  assert.equal(validation.valid, false);
  assert.equal(validation.observedAa, "R");
  assert.match(validation.errors[0], /expected S, observed R/);

  const correctPayload = ("AGC" + "GCC".repeat(20)).split("");
  assert.equal(validatePointMutationPayload(model, 0, correctPayload, 1, "S").valid, true);
});

test("poly-T warning is gated by guide delivery method", () => {
  const spacer = "TTTTACATTTGCAGAGAGAT";
  assert.match(assessGuideSequence(spacer, "u6").warnings.join(" "), /Pol III termination/i);
  assert.doesNotMatch(assessGuideSequence(spacer, "rnp").warnings.join(" "), /termination/i);
  assert.match(assessGuideSequence(spacer, "unknown").warnings.join(" "), /choose a delivery method/i);
});

test("guide QC flags incomplete and non-DNA spacers before procurement export", () => {
  const truncated = assessGuideSequence("GGCGTTCAGTGATTGTCGC", "rnp");
  assert.equal(truncated.status, "warn");
  assert.match(truncated.warnings.join(" "), /19 nt/i);

  const ambiguous = assessGuideSequence("GGCGTTCAGTGATTGTCGCN", "rnp");
  assert.equal(ambiguous.status, "warn");
  assert.match(ambiguous.warnings.join(" "), /DNA bases/i);
});

test("procurement readiness blocks weak guide protection and always retains external specificity review", () => {
  const result = {
    type: "pm",
    deliveryMethod: "rnp",
    gs: [{ n: "TEST_gRNA1", sp: "GCTACGATCGTACGATCGTA" }],
    ss: [{ gi: 1, pur: "PAM AGG->AAG" }],
    os: [{ proteinValidation: { valid: true } }],
    ps: [
      buildPrimerRecord("Fw", "GCTACGATCGTACGATCGTACG"),
      buildPrimerRecord("Rev", "CGTACGATCGTACGATCGTAGC"),
    ],
    amp: "~450 bp",
    primerStrategy: "validated-centered",
    primerCandidates: [{ score: 1 }],
  };
  const readiness = summarizeProcurementReadiness(result);
  assert.equal(readiness.status, "blocked");
  assert.match(readiness.blockers.join(" "), /not strong/i);
  assert.match(readiness.warnings.join(" "), /Genome-wide/i);
});

test("archived APOE and Landthaler primer pairs no longer pass thermodynamic review", () => {
  const archivedPairs = [
    ["APOE_R154S", "GACACCCTCCCGCCCTCTCGGCCG", "CGCGGGTCCGGCTGCCCATCTCCT"],
    ["APOE_V254E", "CGATGACCTGCAGAAGCGCCTGGC", "ACAGGGTCTCCCGCTGCAGGCTGC"],
    ["EIF3D", "TTTAAAGATGTTACAGTAAAAAGA", "CTCTTCTATGACTACACCCAGAGA"],
    ["EIF4E", "TTGAGAACCGCGCACCCTACCCAT", "CGCAGGAGGCGCCACGCCGCCCCT"],
    ["UPF1", "ACGGCGACGGCGGCGGTGGCGGCA", "CGCCGAGGCCGGGCCCGGGCTTCC"],
    ["EIF4G3", "GCACATTTATTCAGTCATTCATTA", "TGTTTAAAAAGAAAAGATTAAAAC"],
  ];
  archivedPairs.forEach(([name, forward, reverse]) => {
    const quality = summarizePrimerPairQuality(forward, reverse);
    assert.equal(quality.confidence, "review", `${name} should require primer review`);
  });
});

test("overlapping custom guide alternatives are marked as non-independent and not safe to pool", () => {
  const sequence = seededDna(240).split("");
  sequence.splice(75, 3, ..."GTT");
  const overlappingSite = "GGACGAGGTGAAGGAGCAGGTGGCGG";
  sequence.splice(80, overlappingSite.length, ...overlappingSite);
  const model = {
    genomicSequence: sequence.join(""),
    cdsSegments: [[0, 240]],
    exons: [{ start: 0, end: 240, exonNumber: 1 }],
    gene: "TEST",
    proteinLength: 80,
  };
  const result = designPM(model, "V26E", {
    customGuides: ["GGACGAGGTGAAGGAGCAGG", "CGAGGTGAAGGAGCAGGTGG"],
  });
  assert.equal(result.err, undefined);
  assert.equal(result.guideDistinctness.customGuidesRequireReview, true);
  assert.equal(result.coDeliverySafe, false);
  assert.match(result.guideDonorInstruction, /Do not co-deliver/i);
  assert.ok(result.os.every((donor) => donor.proteinValidation.valid));
});

test("internal-tag donors are checked against every offered guide and report both WT and KI bands", () => {
  const sequence = seededDna(240).split("");
  sequence.splice(75, 3, ..."GTT");
  const overlappingSite = "GGACGAGGTGAAGGAGCAGGTGGCGG";
  sequence.splice(80, overlappingSite.length, ...overlappingSite);
  const model = {
    genomicSequence: sequence.join(""),
    cdsSegments: [[0, 240]],
    exons: [{ start: 0, end: 240, exonNumber: 1 }],
    gene: "TEST",
    proteinLength: 80,
  };
  const result = designIT(model, "V26", "SPOT", {
    customGuides: ["GGACGAGGTGAAGGAGCAGG", "CGAGGTGAAGGAGCAGGTGG"],
  });
  assert.equal(result.err, undefined);
  assert.ok(result.os.every((donor) => donor.guideProtection.length === result.gs.length));
  assert.equal(result.coDeliverySafe, false);
  assert.match(result.guideDonorInstruction, /Do not co-deliver/i);
  assert.match(result.amp, /^WT ~\d+ bp \| KI ~\d+ bp$/);
});
