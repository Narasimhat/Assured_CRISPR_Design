import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPrimerRecord,
  assessGuideSequence,
  classifySpCas9PamDisruption,
  collectProcurementReviewNotes,
  designCenteredPrimerPairs,
  designDeletionScreenPrimerPairs,
  designIT,
  designPM,
  designOutsideHomologyArmPrimerPairs,
  PRIMER_THREE_PRIME_DG,
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
  // The external-specificity requirement is a standing requirement, not a
  // design-specific warning - it must never influence `status`, but it must always
  // reach an exported order record.
  assert.doesNotMatch(readiness.warnings.join(" "), /Genome-wide/i);
  assert.match(readiness.standingRequirements.join(" "), /Genome-wide/i);
  assert.match(collectProcurementReviewNotes(readiness).join(" "), /Genome-wide/i);
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

function everyFiveMer() {
  const bases = ["A", "C", "G", "T"];
  const out = [];
  bases.forEach((a) => bases.forEach((b) => bases.forEach((c) => bases.forEach((d) => bases.forEach((e) => {
    out.push(a + b + c + d + e);
  })))));
  return out;
}

test("3' delta-G thresholds sit inside the range the metric can actually produce", () => {
  // Regression guard for a silent failure: the original -1.0 / -10.0 cut-offs were
  // outside the achievable interval, so neither 3'-end check could ever fire.
  const window = PRIMER_THREE_PRIME_DG.window;
  assert.equal(window, 5, "everyFiveMer() only covers a 5 nt window");

  const observed = everyFiveMer().map((fiveMer) => buildPrimerRecord("probe", fiveMer).dg3);
  const min = Math.min(...observed);
  const max = Math.max(...observed);

  assert.equal(min, PRIMER_THREE_PRIME_DG.reachableMin, "recorded reachableMin is stale");
  assert.equal(max, PRIMER_THREE_PRIME_DG.reachableMax, "recorded reachableMax is stale");

  assert.ok(
    min < PRIMER_THREE_PRIME_DG.weakAbove && PRIMER_THREE_PRIME_DG.weakAbove < max,
    `weakAbove ${PRIMER_THREE_PRIME_DG.weakAbove} is unreachable within [${min}, ${max}]`,
  );
  assert.ok(
    min < PRIMER_THREE_PRIME_DG.overStableBelow && PRIMER_THREE_PRIME_DG.overStableBelow < max,
    `overStableBelow ${PRIMER_THREE_PRIME_DG.overStableBelow} is unreachable within [${min}, ${max}]`,
  );
  assert.ok(PRIMER_THREE_PRIME_DG.overStableBelow < PRIMER_THREE_PRIME_DG.weakAbove);
});

test("both 3' end-stability warnings actually fire on real primer sequences", () => {
  const weakClamp = buildPrimerRecord("Fw", "CGCAGGCTAGCTGACGTATATA");
  assert.ok(weakClamp.dg3 > PRIMER_THREE_PRIME_DG.weakAbove);
  assert.match(weakClamp.qc.warnings.join(" "), /weak 3' clamp/);

  const overStable = buildPrimerRecord("Rev", "ATGCATAGCATGACTGGCGCGC");
  assert.ok(overStable.dg3 < PRIMER_THREE_PRIME_DG.overStableBelow);
  assert.match(overStable.qc.warnings.join(" "), /over-stable 3' end/);

  // A well-behaved 3' end must stay silent, otherwise the check is just noise.
  const clean = buildPrimerRecord("Fw", "GCTACGATCGTACGATCGTACG");
  assert.doesNotMatch(clean.qc.warnings.join(" "), /3' clamp|over-stable/);
});

test("the archived APOE_R154S forward primer is flagged for an over-stable 3' end", () => {
  // audit/2026_GE_design_audit.md lists this pair as wrongly labelled primer-ready.
  const forward = buildPrimerRecord("APOE_R154S_Fw", "GACACCCTCCCGCCCTCTCGGCCG");
  assert.ok(forward.dg3 < PRIMER_THREE_PRIME_DG.overStableBelow);
  assert.match(forward.qc.warnings.join(" "), /over-stable 3' end/);
});

test("a clean design reaches procurement status ready", () => {
  // Regression guard: the standing external-specificity requirement used to be pushed
  // into `warnings`, so `status` resolved to "review" for every possible design and
  // the "ready" state - plus the green badge in App.jsx - was unreachable. That erased
  // the difference between a design with real findings and one without.
  const sequence = seededDna(2400);
  // A narrow amplicon window is enough to obtain one validated pair, and keeps this
  // test from paying for a full default sweep.
  const pair = designCenteredPrimerPairs(sequence, 1200, { minAmp: 450, maxAmp: 480, maxOffset: 10 })[0];
  assert.ok(pair, "expected a validated centered primer pair");

  const result = {
    type: "pm",
    deliveryMethod: "rnp",
    gs: [{ n: "TEST_gRNA1", sp: "GCTACGATCGTACGATCGTA" }],
    ss: [{ gi: 1, pur: "PAM AGG->ACG" }],
    os: [{ proteinValidation: { valid: true } }],
    ps: [buildPrimerRecord("Fw", pair.fw.seq), buildPrimerRecord("Rev", pair.rev.seq)],
    amp: `~${pair.amp} bp`,
    primerStrategy: "validated-centered",
    primerCandidates: [pair],
  };

  assert.equal(summarizePrimerReadiness(result).ready, true);
  const readiness = summarizeProcurementReadiness(result);
  assert.equal(readiness.status, "ready");
  assert.deepEqual(readiness.blockers, []);
  assert.deepEqual(readiness.warnings, []);
  // Still surfaced, still exported - just not as a status-changing warning.
  assert.match(readiness.standingRequirements.join(" "), /Genome-wide/i);
});

test("standing requirements travel with every procurement verdict", () => {
  const verdicts = [
    summarizeProcurementReadiness(null),
    summarizeProcurementReadiness({ err: "boom" }),
    summarizeProcurementReadiness({ type: "ko", gs: [] }),
  ];
  verdicts.forEach((readiness, index) => {
    assert.match(
      collectProcurementReviewNotes(readiness).join(" "),
      /Genome-wide/i,
      `verdict ${index} dropped the standing external-specificity requirement`,
    );
  });
});

test("primer search stays memoized instead of re-assessing every candidate", () => {
  // Guard for a performance defect, not a correctness one. designCenteredPrimerPairs and
  // designDeletionScreenPrimerPairs sweep amplicon lengths x offsets x primer lengths and
  // used to call assessPrimerSequence - several O(len^2) alignments - once per visit
  // rather than once per distinct candidate. A 2400 nt locus took 45-60 s, synchronously,
  // on the browser main thread.
  //
  // The budget is deliberately loose: it only has to separate "memoized" from "not
  // memoized" (a ~25x gap), so it should not flake on a slow or contended CI runner.
  const BUDGET_MS = 15000;
  const sequence = seededDna(2400);

  const centeredStart = Date.now();
  const centered = designCenteredPrimerPairs(sequence, 1200);
  const centeredMs = Date.now() - centeredStart;
  assert.ok(centered.length > 0);
  assert.ok(centeredMs < BUDGET_MS, `designCenteredPrimerPairs took ${centeredMs} ms (budget ${BUDGET_MS} ms)`);

  const deletionStart = Date.now();
  const deletion = designDeletionScreenPrimerPairs(sequence, 1140, 1260);
  const deletionMs = Date.now() - deletionStart;
  assert.ok(deletion.length > 0);
  assert.ok(deletionMs < BUDGET_MS, `designDeletionScreenPrimerPairs took ${deletionMs} ms (budget ${BUDGET_MS} ms)`);
});

test("reverse-strand candidates containing ambiguity codes are rejected", () => {
  // reverseComplement maps any non-ACGT base to N. The candidate filter therefore has to
  // test the oriented primer, not the raw genomic window, or an IUPAC code on the reverse
  // strand would reach an ordering-ready primer as a literal N.
  const sequence = `${seededDna(400)}${"R".repeat(3)}${seededDna(400)}`;
  const pairs = designCenteredPrimerPairs(sequence, 400, { minAmp: 200, maxAmp: 260, maxOffset: 8 });
  pairs.forEach((pair) => {
    assert.doesNotMatch(pair.fw.seq, /N/, "forward primer must not contain N");
    assert.doesNotMatch(pair.rev.seq, /N/, "reverse primer must not contain N");
  });
});
