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

test("a guide whose PAM cannot be destroyed gets stacked seed mismatches, not one", () => {
  // APOE_R154S_gRNA2 is the case that prompted this: its PAM has no synonymous change, so
  // the engine used to hand over a single seed mismatch and call the pair unusable.
  const result = design("pm", "apoe-r154s.gb", "R154S", "", { expectedGene: "APOE" });
  const tiers = summarizeGuideBlocking(result).guides;

  const pamGuide = tiers.find((guide) => changesFor(result, guide.guideIndex).some((c) => /^PAM/.test(c.pur)));
  const seedGuide = tiers.find((guide) => !changesFor(result, guide.guideIndex).some((c) => /^PAM/.test(c.pur)));
  assert.ok(pamGuide && seedGuide, "fixture must have one PAM-killable and one not");

  // One change is enough when it destroys the PAM; more would be pointless donor edits.
  assert.equal(changesFor(result, pamGuide.guideIndex).length, 1);
  assert.equal(pamGuide.tier, "strong");

  const seedChanges = changesFor(result, seedGuide.guideIndex);
  assert.equal(seedChanges.length, 3, "the seed-only guide should receive three changes");
  assert.ok(seedChanges.every((c) => /^Seed pos/.test(c.pur)), "changes should be in the seed");
  assert.equal(seedGuide.tier, "strong");
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

test("stacking stops as soon as protection is adequate", () => {
  // A guide whose PAM dies takes one change even though three are allowed.
  const result = design("pm", "apoe-r154s.gb", "R176C", "", { expectedGene: "APOE" });
  const guides = summarizeGuideBlocking(result).guides;
  guides.forEach((guide) => {
    const changes = changesFor(result, guide.guideIndex);
    if (changes.some((c) => /^PAM/.test(c.pur))) {
      assert.equal(changes.length, 1, "a destroyed PAM needs no further mismatches");
    }
  });
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

test("a strong tier from mismatches alone does not claim the site is uncuttable", () => {
  const result = design("pm", "apoe-r154s.gb", "R154S", "", { expectedGene: "APOE" });
  const donor = result.os.find((entry) => /gRNA2/.test(entry.guideName));
  const own = donor.guideProtection.find((entry) => entry.guideIndex === 2);
  assert.equal(own.tier, "strong");
  // The PAM survives, so the wording has to say what the protection rests on.
  assert.match(own.reason, /seed mismatch/i);
  assert.match(own.reason, /PAM itself is intact|strongly disfavoured/i);
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


test("a tag on an exon junction gets no blocking change on the splice site", async () => {
  // Residue 200 of the synthetic fixture sits on the exon 1/2 junction, so the guides there
  // straddle it and the seed reaches into the intron.
  //
  // This found a real defect. The guard was applied only on the coding branches, and
  // internal tags allow non-coding positions - so a non-coding position within 3 bp of a CDS
  // boundary, which is the intronic GT/AG splice site itself, went through unchecked. The
  // design emitted changes 1 and 2 bp from the junction. The guard now runs before the
  // coding/non-coding split.
  const { getSpliceBoundaries, SPLICE_BOUNDARY_MARGIN } = await import("../src/designEngine.js");
  const result = design("it", "synthetic-tagging.gb", "200", "SPOT", { expectedGene: "TAGME" });
  assert.equal(result.err, undefined);

  const boundaries = getSpliceBoundaries(result.gb);
  assert.ok(boundaries.length >= 2, "fixture must be multi-exon for this test to mean anything");

  const distances = (result.ss || []).map((change) =>
    Math.min(...boundaries.map((boundary) => Math.abs(boundary - change.gp))));
  assert.ok(distances.length > 0, "no blocking changes to check - this test would be vacuous");

  // Non-vacuous in the other direction too: the changes must sit *close* to the junction,
  // or this site is not exercising the guard at all.
  assert.ok(Math.min(...distances) >= SPLICE_BOUNDARY_MARGIN,
    `a blocking change is ${Math.min(...distances)} bp from a splice boundary`);
  assert.ok(Math.min(...distances) < SPLICE_BOUNDARY_MARGIN + 4,
    `changes are ${Math.min(...distances)} bp away - this site no longer exercises the guard`);

  // And avoiding the junction must not have cost the protection.
  assert.ok(summarizeGuideBlocking(result).guides.every((guide) => guide.tier === "strong"),
    "avoiding the splice site lost the blocking");
});


test("each blocking change installs the commonest synonymous codon available", () => {
  // Ordering by usage changes the design at 212 of the 394 sites in this fixture, so it is
  // not a cosmetic preference. At site 17 the difference is ATC (Ile, 0.48) against ATA
  // (0.16) - a threefold difference in how often the cell uses that codon.
  //
  // The property is checked generally rather than by naming expected codons: at every
  // changed position, no synonymous alternative may be more common than the one chosen.
  const sites = ["10", "17", "50", "111", "200", "291"];
  let compared = 0;

  sites.forEach((site) => {
    const result = design("it", "synthetic-tagging.gb", site, "SPOT", { expectedGene: "TAGME" });
    if (result.err) return;
    (result.ss || [])
      .filter((change) => change.mt === "silent")
      // PAM changes are excluded: there the base is not free. It has to be one that destroys
      // the NGG *and* keeps the amino acid, so usage cannot be the deciding factor. At site
      // 17 that forces GCC->GCA (0.23) even though GCT (0.26) is commoner - GCT leaves the
      // PAM alive. The same genomic position at site 10 is a seed change, where the base is
      // free, and there the engine does pick GCT.
      .filter((change) => !/^PAM/.test(change.pur))
      .forEach((change) => {
        const original = change.oc;
        const chosen = change.nc;
        const codonIndex = [...original].findIndex((base, index) => base !== chosen[index]);
        assert.ok(codonIndex >= 0, `${site}: ${original} -> ${chosen} changes nothing`);

        const synonymous = ["A", "C", "G", "T"]
          .filter((base) => base !== original[codonIndex])
          .map((base) => original.slice(0, codonIndex) + base + original.slice(codonIndex + 1))
          // Only alternatives that keep the same amino acid are real options.
          .filter((candidate) => TRANSLATE[candidate] === TRANSLATE[original]);

        synonymous.forEach((alternative) => {
          assert.ok(
            getCodonFraction(chosen) >= getCodonFraction(alternative),
            `site ${site}: chose ${chosen} (${getCodonFraction(chosen)}) over ${alternative} (${getCodonFraction(alternative)})`,
          );
        });
        compared += synonymous.length;
      });
  });

  assert.ok(compared > 0, "no synonymous alternatives were compared - this test would be vacuous");
});
