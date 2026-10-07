// How the engine chooses which guides to offer.
//
// The ranking is documented as "blockability first, distance second, within a distance
// window", but the pair used to be chosen by proximity before any guide was scored: the
// nearest guide was taken, a partner was added by strand and distance, and only those two
// were ranked. A better-protected guide whose cut sat within 10 bp of the nearest guide's cut
// was discarded without being looked at. The end-to-end case lives in
// regression-fixtures.test.js (NR2F2); these tests pin the ordering rule itself, with the
// candidate set that exposed it.

import test from "node:test";
import assert from "node:assert/strict";

import {
  MINIMUM_ALTERNATIVE_CUT_OFFSET,
  assessSpacerQuality,
  compareScoredGuides,
  pickGuidePair,
} from "../src/guideSelection.js";
import { PROTECTION_RANK } from "../src/designEngine.js";

const guide = (sp, str, cut, d) => ({ sp, str, cut, d, pam: "NGG", gc: 0 });
const entry = (g, index, tier) => ({ guide: g, index, rank: PROTECTION_RANK[tier] });

// The six candidates in the 20 bp window around the NR2F2 stop codon, nearest first, with the
// tier each one earns when scored on its own.
const NR2F2_WINDOW = () => [
  entry(guide("ATTTATTGAATTGCCATATA", "-", 16680, -12), 0, "moderate"),
  entry(guide("CAGTTTTAACTGGCCGTATA", "+", 16678, -14), 1, "strong"),
  entry(guide("AATAAATAAATAAAATAAGA", "+", 16707, 15), 2, "strong"),
  entry(guide("ATAAATAAATAAAATAAGAA", "+", 16708, 16), 3, "strong"),
  entry(guide("TAAATAAATAAAATAAGAAG", "+", 16709, 17), 4, "strong"),
  entry(guide("AAATAAATAAAATAAGAAGG", "+", 16710, 18), 5, "strong"),
];

test("a better-protected guide inside 10 bp of the nearest guide's cut is not discarded", () => {
  const picked = pickGuidePair(NR2F2_WINDOW());
  assert.equal(picked[0].sp, "CAGTTTTAACTGGCCGTATA", "the strongly blockable guide leads");
  assert.ok(
    !picked.some((g) => g.sp === "ATTTATTGAATTGCCATATA"),
    "the nearer, weaker guide is within 10 bp of the leader's cut and is therefore not its partner",
  );
  // Every remaining candidate is AT-rich, so the partner falls back to the nearest of them.
  assert.equal(picked[1].sp, "AATAAATAAATAAAATAAGA");
  assert.ok(Math.abs(picked[0].cut - picked[1].cut) >= MINIMUM_ALTERNATIVE_CUT_OFFSET);
});

test("protection decides before composition, and composition before distance", () => {
  // Composition never outranks protection: a well-protected guide that is AT-rich still leads
  // a poorly protected guide of ordinary composition.
  const protectionFirst = pickGuidePair([
    entry(guide("ACGTACGTACGTACGTACGT", "+", 100, -3), 0, "weak"),
    entry(guide("AATAAATAAATAAAATAAGA", "+", 140, 5), 1, "strong"),
  ]);
  assert.deepEqual(protectionFirst.map((g) => g.sp), ["AATAAATAAATAAAATAAGA", "ACGTACGTACGTACGTACGT"]);

  // Composition beats distance between equally protected guides.
  const compositionOverDistance = pickGuidePair([
    entry(guide("AATAAATAAATAAAATAAGA", "+", 100, -2), 0, "strong"),
    entry(guide("ACGTACGTACGTACGTACGT", "+", 130, 11), 1, "strong"),
  ]);
  assert.equal(compositionOverDistance[0].sp, "ACGTACGTACGTACGTACGT");

  // Distance decides only between guides equal on both.
  const distanceLast = pickGuidePair([
    entry(guide("ACGTACGTACGTACGTACGT", "+", 130, 11), 1, "strong"),
    entry(guide("TGCATGCATGCATGCATGCA", "+", 100, -2), 0, "strong"),
  ]);
  assert.equal(distanceLast[0].sp, "TGCATGCATGCATGCATGCA");
});

test("the partner is the best distinct guide; the opposite strand only breaks a tie", () => {
  const leader = entry(guide("ACGTACGTACGTACGTACGT", "+", 100, -1), 0, "strong");

  // Equally protected: the opposite strand wins even though a same-strand guide is nearer.
  const tie = pickGuidePair([
    leader,
    entry(guide("TGCATGCATGCATGCATGCA", "+", 120, 3), 1, "strong"),
    entry(guide("CATGCATGCATGCATGCATG", "-", 135, 8), 2, "strong"),
  ]);
  assert.equal(tie[1].sp, "CATGCATGCATGCATGCATG");

  // Not equally protected: strand never promotes a weaker partner.
  const protectionWins = pickGuidePair([
    leader,
    entry(guide("TGCATGCATGCATGCATGCA", "+", 120, 3), 1, "strong"),
    entry(guide("CATGCATGCATGCATGCATG", "-", 135, 8), 2, "weak"),
  ]);
  assert.equal(protectionWins[1].sp, "TGCATGCATGCATGCATGCA");
});

test("a single guide is returned when no partner is distinct enough", () => {
  const crowded = pickGuidePair([
    entry(guide("ACGTACGTACGTACGTACGT", "+", 100, -1), 0, "strong"),
    entry(guide("TGCATGCATGCATGCATGCA", "-", 105, 4), 1, "strong"),
    entry(guide("CATGCATGCATGCATGCATG", "+", 109, 8), 2, "strong"),
  ]);
  assert.equal(crowded.length, 1);
  assert.deepEqual(pickGuidePair([]), []);
  assert.deepEqual(pickGuidePair(undefined), []);
});

test("a pair is still offered when the best single guide has no distinct partner", () => {
  // APOE Q39S, 10 bp window. The guides at -2 and -6 have no partner at all: every other
  // cut is within 10 bp of theirs. Only the guide at -10 can pair, with the weak guide at +2
  // (12 bp apart). That strong + weak pair is what the engine has always offered, and a single
  // strong guide must not replace it.
  const q39s = [
    entry(guide("CAGCAGACCGAGTGGCAGAG", "+", 1452, 2), 0, "weak"),
    entry(guide("GCGCTGGCCGCTCTGCCACT", "-", 1448, -2), 1, "strong"),
    entry(guide("AGCTGCGCCAGCAGACCGAG", "+", 1444, -6), 2, "strong"),
    entry(guide("CGCTCTGCCACTCGGTCTGC", "-", 1440, -10), 3, "strong"),
  ];
  const picked = pickGuidePair(q39s);
  assert.deepEqual(picked.map((g) => g.sp), ["CGCTCTGCCACTCGGTCTGC", "CAGCAGACCGAGTGGCAGAG"]);
});

test("with no distinct pair, the best-protected guide is returned, not the nearest", () => {
  const picked = pickGuidePair([
    entry(guide("ACGTACGTACGTACGTACGT", "+", 100, -1), 0, "weak"),
    entry(guide("TGCATGCATGCATGCATGCA", "-", 104, 3), 1, "strong"),
  ]);
  assert.deepEqual(picked.map((g) => g.sp), ["TGCATGCATGCATGCATGCA"]);
});

test("the compare function orders by protection, composition, then distance", () => {
  const a = { rank: 0, severe: true, index: 0 };
  const b = { rank: 0, severe: false, index: 5 };
  const c = { rank: 1, severe: false, index: 0 };
  assert.deepEqual([c, a, b].sort(compareScoredGuides), [b, a, c]);
});

test("spacer quality flags extreme composition and leaves ordinary guides alone", () => {
  assert.equal(assessSpacerQuality("AATAAATAAATAAAATAAGA").severe, true);
  assert.equal(assessSpacerQuality("ATTTATTGAATTGCCATATA").severe, true);
  assert.equal(assessSpacerQuality("GCGCGCGCGCGCGCGCGCAT").severe, true);
  assert.equal(assessSpacerQuality("CAGTTTTAACTGGCCGTATA").severe, false);
  assert.equal(assessSpacerQuality("CGATGACCTGCAGAAGCGCC").severe, false);

  // One base making up most of the spacer is flagged even at moderate GC.
  const dominant = assessSpacerQuality("AAAAAAAAAAAAACGCGCGC");
  assert.equal(dominant.severe, true);
  assert.equal(dominant.dominantBase, "A");
  assert.match(dominant.reasons.join(" "), /of the spacer is A/);

  // Reported values for a guide the report already describes.
  const nr2f2 = assessSpacerQuality("AATAAATAAATAAAATAAGA");
  assert.equal(nr2f2.gc, 5);
  assert.ok(nr2f2.dominantBaseFraction > 0.6);

  assert.deepEqual(assessSpacerQuality("").reasons, []);
});
