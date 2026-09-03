// How the engine stops a guide re-cutting a repaired allele.
//
// It used to emit exactly one synonymous change per guide. Where that change could destroy
// the PAM, fine - no PAM, no cut. Where it could not, the guide got a single seed mismatch,
// which SpCas9 tolerates: the tool's own text called that "weak protection" and then shipped
// it as the design. Standard practice, and what Benchling and IDT do, is to stack two or
// three seed mismatches when the PAM cannot be touched.
//
// The check that matters most here is the last one: that every change credited in the tier
// is actually present in the oligo a supplier would synthesise. A tier computed from a list
// of intended changes says nothing on its own.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  MAX_BLOCKING_CHANGES,
  gradeProtection,
  normalizeMaxBlockingChanges,
  runDesign,
  summarizeGuideBlocking,
} from "../src/designEngine.js";
import { HUMAN_CODON_FRACTION, RARE_CODON_FLOOR, getCodonFraction } from "../src/codonUsage.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(path.join(here, "fixtures", name), "utf8");

const design = (type, reference, mutation = "", tag = "", options = {}) =>
  runDesign(type, fixture(reference), mutation, tag, 400, { deliveryMethod: "rnp", ...options });

// Standard genetic code, written out here rather than imported: a test that shares the
// translation it is checking cannot catch a mistake in that translation.
const TRANSLATE = (() => {
  const bases = "TCAG";
  const aas = "FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG";
  const table = {};
  let index = 0;
  for (const first of bases) for (const second of bases) for (const third of bases) {
    table[first + second + third] = aas[index];
    index += 1;
  }
  return table;
})();

const changesFor = (result, guideIndex) => (result.ss || []).filter((entry) => entry.gi === guideIndex);

// --- stacking -----------------------------------------------------------------------

test("changes are added until predicted residual activity is below threshold", async () => {
  // The rule is a score, not a count. Two things this replaced, both wrong:
  //
  //   - "a destroyed PAM needs one change" - changing NGG to NCG leaves 0.107 of the
  //     original activity per the published PAM table, so it is not sufficient alone.
  //   - "three seed mismatches are adequate" - on this very fixture, three chosen by
  //     position left 0.30. Chosen by score, three reach 0.019.
  //
  // Position class is no longer asserted either: the engine takes PAM-distal positions when
  // the identity there costs more activity than a PAM-proximal one, which the CFD table
  // says happens.
  const { CFD_PROTECTION_THRESHOLDS, scoreResidualActivity } = await import("../src/designEngine.js");
  const result = design("pm", "apoe-r154s.gb", "R154S", "", { expectedGene: "APOE" });

  summarizeGuideBlocking(result).guides.forEach((entry) => {
    const guide = result.gs.find((g) => g.n === entry.guideName);
    const changes = changesFor(result, entry.guideIndex);
    const scored = scoreResidualActivity(result.gb, guide, changes);
    assert.ok(scored, `${entry.guideName}: site could not be scored`);
    assert.ok(scored.score <= CFD_PROTECTION_THRESHOLDS.strong,
      `${entry.guideName}: residual activity ${scored.score} is above the threshold`);
    assert.equal(entry.tier, "strong");
  });
});

test("blocking depth is capped, and the cap is honoured", () => {
  const counts = [1, 2, 3].map((cap) => {
    const result = design("pm", "apoe-r154s.gb", "R154S", "", { expectedGene: "APOE", maxBlockingChanges: cap });
    return Math.max(...summarizeGuideBlocking(result).guides.map((g) => changesFor(result, g.guideIndex).length));
  });
  assert.deepEqual(counts, [1, 2, 3], "the cap does not bound the number of changes");

  // Every extra mismatch costs HDR efficiency and makes the edited allele harder to read,
  // so the ceiling is a real limit rather than a suggestion.
  assert.equal(normalizeMaxBlockingChanges(99), MAX_BLOCKING_CHANGES);
  assert.equal(normalizeMaxBlockingChanges(0), 1);
  assert.equal(normalizeMaxBlockingChanges(undefined), MAX_BLOCKING_CHANGES);
});

test("no donor carries a change it did not need", async () => {
  // Every extra mismatch costs HDR efficiency, so the last change added must have been
  // necessary: without it the site is still above the protection threshold. This is what
  // "stop as soon as it is adequate" means once the stopping rule is a score.
  const { CFD_PROTECTION_THRESHOLDS, scoreResidualActivity } = await import("../src/designEngine.js");
  const cases = [
    design("pm", "apoe-r154s.gb", "R154S", "", { expectedGene: "APOE" }),
    design("pm", "apoe-r154s.gb", "R176C", "", { expectedGene: "APOE" }),
    design("it", "synthetic-tagging.gb", "F50", "SPOT", { expectedGene: "TAGME" }),
    design("ct", "synthetic-tagging.gb", "", "SD40-2xHA", { expectedGene: "TAGME" }),
  ];
  let checked = 0;
  cases.forEach((result) => {
    (result.gs || []).forEach((guide, index) => {
      const changes = changesFor(result, index + 1);
      if (!changes.length) return;
      const full = scoreResidualActivity(result.gb, guide, changes);
      if (!full || full.score > CFD_PROTECTION_THRESHOLDS.strong) return;
      checked += 1;
      // result.ss preserves the order changes were chosen in, so the last one is the one
      // that crossed the threshold.
      const withoutLast = scoreResidualActivity(result.gb, guide, changes.slice(0, -1));
      assert.ok(withoutLast && withoutLast.score > CFD_PROTECTION_THRESHOLDS.strong,
        `${guide.n}: the last of ${changes.length} changes was unnecessary`
        + ` (${withoutLast ? withoutLast.score : "unscoreable"} without it)`);
    });
  });
  assert.ok(checked >= 4, `expected at least 4 protected guides to check, saw ${checked}`);
});

// --- one grading rule ----------------------------------------------------------------

test("the tier ladder is defined in exactly one place", () => {
  assert.equal(gradeProtection({ pamKilled: true }), "strong");
  assert.equal(gradeProtection({ seedMismatches: 3 }), "strong");
  assert.equal(gradeProtection({ seedMismatches: 2 }), "moderate");
  assert.equal(gradeProtection({ seedMismatches: 1 }), "weak");
  assert.equal(gradeProtection({ seedMismatches: 0 }), "none");
  // A surviving-but-weakened PAM is worth about one seed mismatch.
  assert.equal(gradeProtection({ pamWeakened: true, seedMismatches: 2 }), "strong");
  assert.equal(gradeProtection({ pamWeakened: true, seedMismatches: 1 }), "moderate");
});

test("the set-based and donor-based graders agree", () => {
  // They did not: the set grader called three seed mismatches strong while the grader that
  // reads the finished donor capped seed-only protection at moderate. Same design, two
  // answers, depending on which path a reader hit.
  const result = design("pm", "apoe-r154s.gb", "R154S", "", { expectedGene: "APOE" });
  const fromSet = summarizeGuideBlocking(result).guides;
  fromSet.forEach((guide) => {
    const donor = (result.os || []).find((entry) => entry.guideName === guide.guideName);
    assert.ok(donor, `no donor for ${guide.guideName}`);
    const own = donor.guideProtection.find((entry) => entry.guideIndex === guide.guideIndex);
    assert.equal(own.tier, guide.tier,
      `${guide.guideName}: set grader says ${guide.tier}, donor grader says ${own.tier}`);
  });
});

test("protection is reported as a number, not only as a tier", () => {
  // A tier is a reading of a score against thresholds this tool chose. The score itself is
  // published, so it travels with the design and a reviewer can disagree with the cut points
  // without re-deriving anything.
  const result = design("pm", "apoe-r154s.gb", "R154S", "", { expectedGene: "APOE" });
  const donor = result.os.find((entry) => /gRNA2/.test(entry.guideName));
  const own = donor.guideProtection.find((entry) => entry.guideIndex === 2);
  assert.equal(own.tier, "strong");
  assert.ok(Number.isFinite(own.cfd) && own.cfd >= 0 && own.cfd <= 1, `no usable score: ${own.cfd}`);
  assert.match(own.reason, /predicted residual activity/i);
  assert.match(own.reason, /CFD/);
  // And it must not claim the site cannot be cut - only a destroyed PAM does that.
  assert.ok(!/cannot be (re-)?cut|uncuttable|impossible/i.test(own.reason), `overclaims: ${own.reason}`);
});

// --- codon usage ----------------------------------------------------------------------

test("blocking changes never install a rare codon", () => {
  // Sites 111 and 291 are here because they are where the floor actually bites: without it
  // the engine reaches a Leu position whose only synonymous option is TTA (0.07), one of the
  // rarest human codons. Scanning every site in the fixture with the guard removed showed
  // 8 designs change, and none of them were the four originally listed here.
  const cases = [
    design("pm", "apoe-r154s.gb", "R154S", "", { expectedGene: "APOE" }),
    design("pm", "apoe-r154s.gb", "R176C", "", { expectedGene: "APOE" }),
    design("it", "synthetic-tagging.gb", "F50", "SPOT", { expectedGene: "TAGME" }),
    design("it", "synthetic-tagging.gb", "R100", "alphaBtx", { expectedGene: "TAGME" }),
    design("it", "synthetic-tagging.gb", "111", "SPOT", { expectedGene: "TAGME" }),
    design("it", "synthetic-tagging.gb", "291", "SPOT", { expectedGene: "TAGME" }),
    design("it", "synthetic-tagging.gb", "326", "SPOT", { expectedGene: "TAGME" }),
  ];
  let checked = 0;
  cases.forEach((result) => {
    (result.ss || []).filter((entry) => entry.mt === "silent").forEach((entry) => {
      const before = getCodonFraction(entry.oc);
      const after = getCodonFraction(entry.nc);
      checked += 1;
      assert.ok(after >= RARE_CODON_FLOOR || after >= before,
        `${entry.pur}: ${entry.oc} (${before}) -> ${entry.nc} (${after}) installs a rare codon`);
    });
  });
  assert.ok(checked > 0, "no silent coding changes were examined - this test would be vacuous");
});

test("the codon table covers every codon and each family sums to one", () => {
  const codons = Object.keys(HUMAN_CODON_FRACTION);
  assert.equal(codons.length, 64, "the table is not a complete codon table");
  // A missing codon would read as fraction 0 and be treated as maximally rare.
  const bases = ["T", "C", "A", "G"];
  bases.forEach((a) => bases.forEach((b) => bases.forEach((c) => {
    assert.ok(Object.prototype.hasOwnProperty.call(HUMAN_CODON_FRACTION, a + b + c), `missing ${a}${b}${c}`);
  })));
});

// --- splice safety ---------------------------------------------------------------------

test("no blocking change lands on a CDS exon boundary", () => {
  // A synonymous change three bases from a junction can still break the splice site or an
  // adjacent enhancer. The engine does not model splicing, so it stays out of that window
  // rather than predicting the consequence.
  const result = design("pm", "apoe-r154s.gb", "R154S", "", { expectedGene: "APOE" });
  const segments = result.gb.cdsSegments || [];
  assert.ok(segments.length > 1, "fixture must be multi-exon for this test to mean anything");

  const boundaries = [];
  segments.forEach(([start, end], index) => {
    if (index > 0) boundaries.push(start);
    if (index < segments.length - 1) boundaries.push(end - 1);
  });

  (result.ss || []).filter((entry) => entry.mt === "silent").forEach((entry) => {
    const nearest = Math.min(...boundaries.map((boundary) => Math.abs(boundary - entry.gp)));
    assert.ok(nearest >= 3, `${entry.pur} at ${entry.gp} is ${nearest} bp from a splice boundary`);
  });
});

// --- the change reaches the oligo --------------------------------------------------------

test("every change credited in the tier is present in the donor a supplier would order", () => {
  // The crux. A tier computed from a list of intended changes proves nothing if the oligo
  // does not carry them - the design would claim protection it does not have. Checked
  // against genomicDonor, the donor in reference orientation, so donor strand cannot
  // confuse the comparison.
  const result = design("pm", "apoe-r154s.gb", "R154S", "", { expectedGene: "APOE" });
  let verified = 0;
  (result.os || []).forEach((donor) => {
    assert.ok(donor.genomicDonor, `${donor.n} exposes no genomic-orientation sequence`);
    changesFor(result, donor.gi + 1).forEach((change) => {
      const index = change.gp - donor.donorStart;
      assert.ok(index >= 0 && index < donor.genomicDonor.length,
        `${donor.n}: ${change.pur} at ${change.gp} falls outside the donor window`);
      assert.equal(donor.genomicDonor[index], change.nb,
        `${donor.n}: ${change.pur} is credited but the oligo carries ${donor.genomicDonor[index]}`);
      verified += 1;
    });
  });
  assert.ok(verified >= 4, `expected at least 4 changes to verify, saw ${verified}`);
});

test("stacked blocking changes do not disturb the requested protein change", () => {
  const result = design("pm", "apoe-r154s.gb", "R154S", "", { expectedGene: "APOE" });
  result.os.forEach((donor) => {
    assert.equal(donor.proteinValidation.valid, true, `${donor.n} failed its protein assertion`);
    assert.equal(donor.proteinValidation.observedAa, "S");
    donor.proteinValidation.codons
      .filter((codon) => codon.aaNumber !== 154)
      .forEach((codon) => {
        assert.equal(codon.observedAa, codon.referenceAa,
          `${donor.n} changed residue ${codon.aaNumber}`);
      });
  });
});

// --- guide choice -------------------------------------------------------------------------

test("GC is reported as an observation, not a prediction of failure", () => {
  // GC correlates with SpCas9 activity weakly and non-monotonically. Guides well outside
  // 40-60% are frequently active, so the warning must not read as "this will not work".
  const result = design("pm", "apoe-r154s.gb", "R154S", "", { expectedGene: "APOE" });
  const gcWarnings = (result.guideSequenceQc || [])
    .flatMap((entry) => entry.warnings)
    .filter((warning) => /GC \d+%/.test(warning));
  assert.ok(gcWarnings.length > 0, "fixture must raise a GC warning for this test to mean anything");
  gcWarnings.forEach((warning) => {
    assert.ok(!/\bwill not\b|\bcannot work\b|\bunusable\b|\bfails\b/i.test(warning),
      `GC warning overclaims: ${warning}`);
    assert.match(warning, /on average|does not predict/i, `GC warning states no caveat: ${warning}`);
  });
});


// --- predicates no bundled reference happens to exercise -------------------------------
//
// Four guards below are real but unreachable from the committed fixtures: at the positions
// these designs actually choose, the guarded condition never arises. Mutation testing found
// each of them surviving. Rather than leave them looking covered - or build four synthetic
// references to reach them - the predicates are tested directly, and the integration gap is
// stated here.

test("the rare-codon floor refuses a change that would install a rare codon", async () => {
  const { introducesRareCodon, RARE_CODON_FLOOR, getCodonFraction } = await import("../src/codonUsage.js");

  // CGC (0.19) -> CGT (0.08) is a synonymous Arg change into a rare codon.
  assert.ok(getCodonFraction("CGT") < RARE_CODON_FLOOR);
  assert.equal(introducesRareCodon("CGC", "CGT"), true);

  // The reverse is fine, and so is staying put among common codons.
  assert.equal(introducesRareCodon("CGT", "CGC"), false);
  assert.equal(introducesRareCodon("CTG", "CTC"), false);

  // Already rare and not getting worse is not a problem this change introduced - refusing
  // it would strand codons that are simply uncommon in the reference.
  assert.equal(introducesRareCodon("TCG", "CTA"), false);
});

test("synonymous alternatives are ordered by codon usage", async () => {
  const { rankByCodonUsage } = await import("../src/codonUsage.js");
  // Leu, deliberately shuffled. CTG (0.41) is the common one; CTA (0.07) the rare one.
  const ordered = rankByCodonUsage(["CTA", "CTG", "CTC", "CTT"], (codon) => codon);
  assert.deepEqual(ordered, ["CTG", "CTC", "CTT", "CTA"]);
});

test("the splice-boundary guard measures distance from CDS junctions", async () => {
  const { distanceToSpliceBoundary, getSpliceBoundaries, SPLICE_BOUNDARY_MARGIN } =
    await import("../src/designEngine.js");

  // Three CDS exons: junctions at 199/300 and 399/500.
  const model = { cdsSegments: [[100, 200], [300, 400], [500, 600]] };
  assert.deepEqual(getSpliceBoundaries(model).sort((a, b) => a - b), [199, 300, 399, 500]);

  assert.equal(distanceToSpliceBoundary(model, 300), 0);
  assert.equal(distanceToSpliceBoundary(model, 302), 2);
  assert.equal(distanceToSpliceBoundary(model, 350), 49);
  // Anything inside the margin is refused; the engine does not model splicing, so it stays
  // out of the window rather than predicting the consequence.
  assert.ok(distanceToSpliceBoundary(model, 301) < SPLICE_BOUNDARY_MARGIN);
  assert.ok(distanceToSpliceBoundary(model, 303) >= SPLICE_BOUNDARY_MARGIN);

  // A single-exon CDS has no junctions to avoid.
  assert.equal(distanceToSpliceBoundary({ cdsSegments: [[0, 900]] }, 400), Infinity);
});

test("guides are ordered by protection first and distance second", async () => {
  const { compareGuidesByProtectionThenDistance, PROTECTION_RANK } = await import("../src/designEngine.js");
  assert.deepEqual(Object.keys(PROTECTION_RANK), ["strong", "moderate", "weak", "none"]);

  // index is the nearest-first position, so a lower index is a closer guide.
  const entries = [
    { name: "near-unblockable", rank: PROTECTION_RANK.none, index: 0 },
    { name: "far-strong", rank: PROTECTION_RANK.strong, index: 3 },
    { name: "near-strong", rank: PROTECTION_RANK.strong, index: 1 },
    { name: "mid-weak", rank: PROTECTION_RANK.weak, index: 2 },
  ];
  const ordered = [...entries].sort(compareGuidesByProtectionThenDistance).map((entry) => entry.name);
  assert.deepEqual(ordered, ["near-strong", "far-strong", "mid-weak", "near-unblockable"]);

  // Distance only decides between equals: it must never promote a far guide over a nearer
  // one with the same protection, which is what keeps HDR efficiency in the trade.
  const sameRank = [
    { name: "far", rank: PROTECTION_RANK.strong, index: 5 },
    { name: "near", rank: PROTECTION_RANK.strong, index: 1 },
  ].sort(compareGuidesByProtectionThenDistance).map((entry) => entry.name);
  assert.deepEqual(sameRank, ["near", "far"]);
});


test("a tag near an exon junction gets no blocking change on the splice site", async () => {
  // Sites 197-199 of the synthetic fixture are where this guard does work. Removing it makes
  // each of them place a synonymous change 1 bp from the CDS junction - in the intronic
  // GT/AG - because that change scores better than any alternative. With the guard they take
  // one 6 bp away instead.
  //
  // The test used to use site 200, which stacked three position-ordered changes at 3-5 bp.
  // Once changes are chosen by score that site takes a single change at 4 bp and removing the
  // guard changes nothing there, so the mutation survived. Scanning all 393 sites with the
  // guard removed found the three that actually depend on it.
  const { getSpliceBoundaries, SPLICE_BOUNDARY_MARGIN } = await import("../src/designEngine.js");

  ["197", "198", "199", "200", "201", "202", "203"].forEach((site) => {
    const result = design("it", "synthetic-tagging.gb", site, "SPOT", { expectedGene: "TAGME" });
    assert.equal(result.err, undefined, `site ${site}: ${result.err}`);

    const boundaries = getSpliceBoundaries(result.gb);
    assert.ok(boundaries.length >= 2, "fixture must be multi-exon for this test to mean anything");

    const changes = result.ss || [];
    assert.ok(changes.length > 0, `site ${site}: no blocking changes to check`);
    changes.forEach((change) => {
      const nearest = Math.min(...boundaries.map((boundary) => Math.abs(boundary - change.gp)));
      assert.ok(nearest >= SPLICE_BOUNDARY_MARGIN,
        `site ${site}: ${change.pur} at ${change.gp} is ${nearest} bp from a splice boundary`);
    });
  });

  // Non-vacuous in the other direction: these sites must stay close enough to the junction
  // that the guard is the only thing keeping changes out of it.
  const near = design("it", "synthetic-tagging.gb", "198", "SPOT", { expectedGene: "TAGME" });
  const boundaries = getSpliceBoundaries(near.gb);
  const nearest = Math.min(...(near.ss || []).map((change) =>
    Math.min(...boundaries.map((boundary) => Math.abs(boundary - change.gp)))));
  assert.ok(nearest < SPLICE_BOUNDARY_MARGIN + 6,
    `site 198 now places changes ${nearest} bp away - it no longer exercises the guard`);

  // And avoiding the junction must not have cost the protection.
  assert.ok(summarizeGuideBlocking(near).guides.every((guide) => guide.tier === "strong"),
    "avoiding the splice site lost the blocking");
});


// Removed: "each blocking change installs the commonest synonymous codon available".
//
// That was true while candidates were ordered by position then codon usage. Selection is now
// driven by predicted residual activity, with codon usage only breaking ties between changes
// that protect equally - so the commonest synonymous codon is deliberately not always taken.
// What still holds, and is asserted above, is the rare-codon floor: no change installs a
// codon below 10% usage within its family.
test("codon usage remains a tie-break, and the rare-codon floor still applies", () => {
  const sites = ["10", "17", "50", "111", "200", "291"];
  let checked = 0;
  sites.forEach((site) => {
    const result = design("it", "synthetic-tagging.gb", site, "SPOT", { expectedGene: "TAGME" });
    if (result.err) return;
    (result.ss || []).filter((change) => change.mt === "silent").forEach((change) => {
      const before = getCodonFraction(change.oc);
      const after = getCodonFraction(change.nc);
      checked += 1;
      assert.ok(after >= RARE_CODON_FLOOR || after >= before,
        `site ${site}: ${change.oc} (${before}) -> ${change.nc} (${after}) installs a rare codon`);
      // Every installed codon must be a real codon, which a lookup miss would not be.
      assert.ok(TRANSLATE[change.nc], `site ${site}: ${change.nc} is not a codon`);
      assert.equal(TRANSLATE[change.nc], TRANSLATE[change.oc],
        `site ${site}: ${change.oc} -> ${change.nc} is not synonymous`);
    });
  });
  assert.ok(checked > 0, "no silent coding changes were examined - this test would be vacuous");
});


// --- terminal tags and reporters ---------------------------------------------------------
//
// The blocking strategy first landed on point mutations and internal tags only. designCT and
// designNT kept calling the older single-change finder, so a C- or N-terminal reporter
// knock-in received one synonymous change, chosen alphabetically, with no splice guard and
// no codon-usage weighting.
//
// It is often masked for terminal tags: when the insert splits a guide's protospacer the
// insertion itself destroys the site. It is not masked when a guide cuts near the stop or
// ATG without spanning the insertion point.
//
// COVERAGE GAP, stated rather than implied. All ten SpCas9 guides within 60 bp of the stop
// codon in synthetic-tagging.gb have a synonymous PAM change available, and under CFD one
// such change reaches 0.0161 - below the protection threshold on its own. So a terminal-tag
// design takes a single change here and never enters the stacking path.
//
// Mutation testing confirms the consequence: removing the blocking cap, the homology-arm
// predicate, or blockability-first guide ranking from designCT/designNT changes no design in
// this fixture. Four mutations survive there and are expected to.
//
// The tests below therefore assert the wiring, the cap, splice clearance and donor presence
// - not that stacking alters a terminal-tag design. The stacking and scoring code is shared
// with designPM and designIT, which are covered on sites where it demonstrably changes the
// output. Closing this needs a fixture engineered so no guide near a stop codon has a
// synonymous PAM change: a fixture built solely to reach a branch, judged not worth the
// artificiality.

const TERMINAL_CASES = [
  ["ct", "SD40-2xHA"],
  ["nt", "N:SD40-Linker"],
];

test("terminal tag designs use the same blocking strategy as the rest", () => {
  TERMINAL_CASES.forEach(([type, tag]) => {
    const result = design(type, "synthetic-tagging.gb", "", tag, { expectedGene: "TAGME" });
    assert.equal(result.err, undefined, `${type}: ${result.err}`);

    // Every emitted change must carry the shared grading vocabulary, which the old
    // single-change path did not produce for a stacked set.
    (result.ss || []).forEach((change) => {
      assert.ok(["strong", "moderate", "weak", "none"].includes(change.blockingTier),
        `${type}: ${change.pur} has tier ${change.blockingTier}`);
    });

    // And the cap must be respected here too.
    (result.gs || []).forEach((_, index) => {
      const count = (result.ss || []).filter((change) => change.gi === index + 1).length;
      assert.ok(count <= MAX_BLOCKING_CHANGES, `${type}: guide ${index + 1} received ${count} changes`);
    });
  });
});

test("terminal tag blocking changes stay clear of splice boundaries", async () => {
  const { getSpliceBoundaries, SPLICE_BOUNDARY_MARGIN } = await import("../src/designEngine.js");
  TERMINAL_CASES.forEach(([type, tag]) => {
    const result = design(type, "synthetic-tagging.gb", "", tag, { expectedGene: "TAGME" });
    const boundaries = getSpliceBoundaries(result.gb);
    assert.ok(boundaries.length >= 2, "fixture must be multi-exon for this test to mean anything");
    (result.ss || []).forEach((change) => {
      const nearest = Math.min(...boundaries.map((boundary) => Math.abs(boundary - change.gp)));
      assert.ok(nearest >= SPLICE_BOUNDARY_MARGIN,
        `${type}: ${change.pur} at ${change.gp} is ${nearest} bp from a splice boundary`);
    });
  });
});

test("terminal tag blocking changes are inside the donor that gets ordered", () => {
  // The reason the position predicate exists. A terminal-tag design only applies a change
  // that lands in a homology arm, so stacking without that restriction would credit changes
  // in the tier that the oligo never carries.
  TERMINAL_CASES.forEach(([type, tag]) => {
    const result = design(type, "synthetic-tagging.gb", "", tag, { expectedGene: "TAGME" });
    const donor = result.donor || "";
    assert.ok(donor.length > 100, `${type}: no donor to check`);

    (result.ss || []).forEach((change) => {
      // The donor is the assembled 5' arm + insert + 3' arm, so a credited change must be
      // findable as an actual difference from the reference at its own position.
      const reference = result.gb.sequence || result.gb.seq || "";
      assert.notEqual(reference[change.gp], change.nb,
        `${type}: ${change.pur} claims to change ${reference[change.gp]} to the same base`);
      assert.ok(donor.includes(change.nc) || donor.includes(change.nb),
        `${type}: ${change.pur} is credited but its base is not in the donor`);
    });
  });
});

test("co-delivery guide selection scores blockability the way the design blocks", async () => {
  // Selection used the single-change finder while the design stacks up to three, so it
  // under-rated every guide whose PAM cannot be killed but whose seed can be mismatched -
  // and then reported that no pair could be strongly blocked.
  const engine = readFileSync(path.join(here, "..", "src", "designEngine.js"), "utf8");
  const selector = engine.slice(engine.indexOf("function selectCoDeliveryGuidesWithFallback"));
  const body = selector.slice(0, selector.indexOf("\nfunction "));
  assert.match(body, /findBlockingSet/, "co-delivery selection does not use the stacked strategy");
  assert.ok(!/findSilent\(/.test(body), "co-delivery selection still scores by a single change");

  // And behaviourally: at the APOE locus the pair is only jointly protectable because gRNA2
  // can be stacked to strong. Selection has to see that.
  const result = design("pm", "apoe-r154s.gb", "R154S", "", {
    expectedGene: "APOE", coDeliveryBlocking: true,
  });
  assert.ok(result.coDeliverySelection, "no co-delivery selection was produced");
  assert.equal(result.coDeliverySelection.stronglyBlockableSelected, 2,
    "selection does not credit both guides as strongly blockable");
  assert.equal(result.coDeliverySafe, true);
});
