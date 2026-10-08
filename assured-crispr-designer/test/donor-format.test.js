// Donor format and arm control: format recommendation, per-side arms, trimming, synthesis pre-check.
//
// The engine tests pin one concrete outcome: the NR2F2 SD40-V5 block that was ordered by hand
// (250 bp 5' arm, 213 bp cassette, 150 bp 3' arm, one guide) is now what the tool produces when
// asked for an automatic format with arm trimming and that guide, byte for byte. The unit tests
// build synthetic references with known stretches so a trimmed length can be derived by hand.

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { runDesign } from "../src/designEngine.js";
import {
  AAV_ABOVE_INSERT_BP, DONOR_FORMATS, SSODN_BELOW_INSERT_BP, buildDonorFormatReport, defaultArms,
  describeDonorFormat, planDonorArms, recommendDonorFormat, scanSynthesisRisks, trimArm,
} from "../src/donorFormat.js";
import { buildBatchOrderRows } from "../src/orderRows.js";
import { buildDesignReadinessChecks, buildDonorFormatHtml, buildReportHtml } from "../src/reportHtml.js";
import { buildDesignSchemeSvg } from "../src/designScheme.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(path.join(here, "fixtures", name), "utf8");
const revcomp = (seq) => [...seq].reverse().map((base) => ({ A: "T", C: "G", G: "C", T: "A" }[base])).join("");

// Deterministic background with no long single-base runs, tandem repeats or extreme GC.
function background(length, seed = 7) {
  let a = seed >>> 0;
  const random = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [];
  while (out.length < length) {
    const base = "ACGT"[Math.floor(random() * 4)];
    if (out.length && out[out.length - 1] === base) continue;
    out.push(base);
  }
  return out.join("");
}
function withRun(genome, start, base, length, guardBase = "C") {
  const chars = genome.split("");
  for (let i = 0; i < length; i += 1) chars[start + i] = base;
  chars[start - 1] = guardBase; chars[start + length] = guardBase;
  return chars.join("");
}

test("the synthetic background is clean, so every flag in the tests comes from a planted stretch", () => {
  assert.deepEqual(scanSynthesisRisks(background(1200)), []);
});

// --- recommendation and defaults ---------------------------------------------------------------

test("format follows insert size: ssODN below 120 bp, block to 500 bp, AAV above", () => {
  const pick = (bp) => recommendDonorFormat(bp).format;
  assert.equal(SSODN_BELOW_INSERT_BP, 120);
  assert.equal(AAV_ABOVE_INSERT_BP, 500);
  assert.deepEqual([93, 119, 120, 213, 417, 500, 501, 747].map(pick), ["ssodn", "ssodn", "block", "block", "block", "block", "aav", "aav"]);
  assert.equal(pick(0), "block");
});

test("default arms: 250 for blocks, 500 for AAV, up to 60 nt for ssODNs but never past 200 nt in total", () => {
  assert.deepEqual(defaultArms("block", 213), { five: 250, three: 250, feasible: true });
  assert.deepEqual(defaultArms("aav", 774), { five: 500, three: 500, feasible: true });
  assert.deepEqual(defaultArms("ssodn", 42), { five: 60, three: 60, feasible: true });
  const tight = defaultArms("ssodn", 96);
  assert.deepEqual([tight.five, tight.three, 96 + tight.five + tight.three], [52, 52, 200]);
  const impossible = defaultArms("ssodn", 186);
  assert.equal(impossible.feasible, false);
  assert.equal(impossible.five, DONOR_FORMATS.ssodn.minArm, "arms stay at the 30 nt minimum instead of collapsing");
});

// --- synthesis pre-check -------------------------------------------------------------------------

test("homopolymers are flagged from 12 nt, with exact coordinates", () => {
  const seq = withRun(background(300), 100, "A", 12);
  assert.deepEqual(scanSynthesisRisks(seq).map((i) => [i.kind, i.start, i.end]), [["homopolymer", 100, 112]]);
  assert.deepEqual(scanSynthesisRisks(withRun(background(300), 100, "A", 11)), []);
});

test("extreme local GC and perfect short tandem repeats are flagged; ordinary sequence is not", () => {
  const gcHigh = background(200).slice(0, 70) + "GC".repeat(40) + background(200).slice(70, 130);
  assert.ok(scanSynthesisRisks(gcHigh).some((i) => i.kind === "gc-high"));
  const gcLow = background(120) + "AT".repeat(50) + background(120).split("").reverse().join("");
  assert.ok(scanSynthesisRisks(gcLow).some((i) => i.kind === "gc-low"));
  const tandem = background(100) + "CA".repeat(12) + background(100).split("").reverse().join("");
  const found = scanSynthesisRisks(tandem).filter((i) => i.kind === "tandem-repeat");
  assert.equal(found.length, 1);
  assert.equal(found[0].end - found[0].start, 24);
  const short = background(100) + "CA".repeat(9) + background(100).split("").reverse().join("");
  assert.equal(scanSynthesisRisks(short).filter((i) => i.kind === "tandem-repeat").length, 0);
});

// --- arm trimming ----------------------------------------------------------------------------------

test("3' arm is trimmed to the longest 10 bp step that stops before a poly-A run and does not end inside it", () => {
  const genome = withRun(background(1200), 700, "A", 15);
  const trim = trimArm(genome, "three", 500, 250, 100);
  assert.deepEqual([trim.length, trim.trimmed, trim.unavoidable], [200, true, false]);
  assert.ok(trim.issues.some((i) => i.kind === "homopolymer"));
  // 210 bp ends inside the run (10 of its 15 bases), which is its own problem.
  assert.ok(trimArm(genome, "three", 500, 210, 100).length < 210);
});

test("5' arm is trimmed the same way from the other side", () => {
  const genome = withRun(background(1200), 300, "T", 15);
  const trim = trimArm(genome, "five", 500, 250, 100);
  assert.deepEqual([trim.length, trim.trimmed], [180, true]);
});

test("a flagged stretch inside the minimum arm cannot be trimmed away, so the arm is kept and reported", () => {
  const genome = withRun(background(1200), 520, "A", 15);
  const trim = trimArm(genome, "three", 500, 250, 100);
  assert.deepEqual([trim.length, trim.trimmed, trim.unavoidable], [250, false, true]);
});

test("a clean arm is left alone", () => {
  const trim = trimArm(background(1200), "three", 500, 250, 100);
  assert.deepEqual([trim.length, trim.trimmed, trim.unavoidable, trim.issues.length], [250, false, false, 0]);
});

// --- planning ------------------------------------------------------------------------------------------

test("without a donor format the arms are what they always were: symmetric, 250 bp when none is given", () => {
  const genome = background(1200);
  const plan = (requestedArm, options = {}, left = 500) => planDonorArms({ insertBp: 213, genome, leftEdge: left, rightEdge: left + 3, requestedArm, options });
  assert.deepEqual([plan(400).arms.five, plan(400).arms.three, plan(400).format], [400, 400, null]);
  assert.deepEqual([plan("").arms.five, plan(undefined).arms.three], [250, 250]);
  const clamped = plan(250, {}, 100);
  assert.deepEqual([clamped.arms.five, clamped.arms.limited.five, clamped.arms.limited.three], [100, true, false]);
});

test("auto picks the format default per side; an explicit arm or per-side length overrides it", () => {
  const genome = background(1200);
  const run = (insertBp, requestedArm, options) => planDonorArms({ insertBp, genome, leftEdge: 600, rightEdge: 603, requestedArm, options: { donorFormat: "auto", ...options } }).arms;
  assert.deepEqual([run(213, "").five, run(213, "").three], [250, 250]);
  assert.deepEqual([run(93, "").five, run(93, "").three], [53, 53]);
  assert.deepEqual([run(774, "").five, run(774, "").three], [500, 500]);
  assert.deepEqual([run(213, 200).five, run(213, 200).three], [200, 200]);
  const split = run(213, 250, { arm5Length: 120, arm3Length: 300 });
  assert.deepEqual([split.five, split.three], [120, 300]);
  const oneSide = run(213, "", { arm3Length: 180 });
  assert.deepEqual([oneSide.five, oneSide.three], [250, 180]);
});

test("trimming only happens when asked for, and never for a cloned or AAV donor", () => {
  const genome = withRun(background(1200), 700, "A", 15);
  const arms = (options, insertBp = 213) => planDonorArms({ insertBp, genome, leftEdge: 497, rightEdge: 500, requestedArm: "", options }).arms;
  assert.equal(arms({ donorFormat: "block" }).three, 250);
  assert.equal(arms({ donorFormat: "block", autoTrimArms: true }).three, 200);
  assert.equal(arms({ donorFormat: "aav", autoTrimArms: true }).three, 500);
  assert.equal(arms({ donorFormat: "auto", autoTrimArms: true }, 774).three, 500);
});

// --- report ------------------------------------------------------------------------------------------------

const plan = (format, insertBp, options = {}, genome = background(1200)) => planDonorArms({ insertBp, genome, leftEdge: 600, rightEdge: 603, requestedArm: "", options: { donorFormat: format, ...options } });

test("length limits: ssODN above 200 nt, block outside 201-3000 bp", () => {
  const tooLong = buildDonorFormatReport({ plan: plan("ssodn", 186), donor: "A".repeat(246), insertBp: 186, firstGuideStrand: "+" });
  assert.equal(tooLong.status, "warn");
  assert.ok(tooLong.limits.problems.some((text) => text.includes("200 nt")));
  const tooShort = buildDonorFormatReport({ plan: plan("block", 42, { arm5Length: 60, arm3Length: 60 }), donor: background(162), insertBp: 42, firstGuideStrand: "+" });
  assert.ok(tooShort.limits.problems.some((text) => text.includes("201 bp")));
  const fine = buildDonorFormatReport({ plan: plan("block", 213), donor: background(713), insertBp: 213, firstGuideStrand: "+" });
  assert.deepEqual([fine.status, fine.limits.problems.length], ["pass", 0]);
});

test("an ssODN is ordered as the strand complementary to the PAM-bearing strand of guide 1", () => {
  const donor = background(160);
  const plus = buildDonorFormatReport({ plan: plan("ssodn", 40), donor, insertBp: 40, firstGuideStrand: "+" });
  assert.deepEqual([plus.orderStrand, plus.orderSequence], ["antisense", revcomp(donor)]);
  const minus = buildDonorFormatReport({ plan: plan("ssodn", 40), donor, insertBp: 40, firstGuideStrand: "-" });
  assert.deepEqual([minus.orderStrand, minus.orderSequence], ["sense", donor]);
  const block = buildDonorFormatReport({ plan: plan("block", 213), donor: background(713), insertBp: 213, firstGuideStrand: "+" });
  assert.equal(block.orderSequence, null);
  const inferred = buildDonorFormatReport({ plan: planDonorArms({ insertBp: 40, genome: background(1200), leftEdge: 600, rightEdge: 603, requestedArm: 60, options: {} }), donor, insertBp: 40, firstGuideStrand: "+" });
  assert.deepEqual([inferred.inferred, inferred.format, inferred.orderSequence], [true, "ssodn", null], "a format inferred from length must not change what is ordered");
});

test("arms outside the vendor ranges and a format that differs from the recommendation are explained", () => {
  const report = buildDonorFormatReport({ plan: plan("block", 213, { arm5Length: 50 }), donor: background(663), insertBp: 213, firstGuideStrand: "+" });
  assert.ok(report.notes.some((text) => text.includes("5\u2032 arm is 50 bp, outside IDT's 100-500")));
  const odd = buildDonorFormatReport({ plan: plan("ssodn", 213), donor: background(273), insertBp: 213, firstGuideStrand: "+" });
  assert.ok(odd.notes.some((text) => text.includes("dsDNA block is recommended")));
});

test("the description used by the app and the report carries format, arms, length and pre-check lines", () => {
  const report = buildDonorFormatReport({ plan: plan("block", 213), donor: background(713), insertBp: 213, firstGuideStrand: "+" });
  const info = describeDonorFormat(report);
  assert.equal(info.rows[0][0], "Format");
  assert.ok(info.rows.some(([label, value]) => label === "Arms" && value === "250 bp each"));
  assert.ok(info.rows.some(([label, value]) => label === "Donor length" && value.startsWith("713 bp (250 + 213 + 250)")));
  assert.deepEqual(info.synthesis, ["No homopolymer, extreme-GC or tandem-repeat stretch flagged."]);
  assert.equal(describeDonorFormat(null), null);
});

// --- engine -----------------------------------------------------------------------------------------------------

const NR2F2 = (extra = {}, arm = "", tag = "GGGGS3-SD40-GGGGS-V5") => {
  const result = runDesign("ct", fixture("nr2f2-ng016753.gb"), "", tag, arm, { expectedGene: "NR2F2", ...extra });
  assert.equal(result.err, undefined, result.err);
  return result;
};
const GUIDE1 = "CAGTTTTAACTGGCCGTATA";

test("NR2F2: automatic format with trimming and guide 1 reproduces the ordered 613 bp block byte for byte", () => {
  const result = NR2F2({ donorFormat: "auto", autoTrimArms: true, customGuides: [GUIDE1] });
  assert.deepEqual([result.h5l, result.il, result.h3l, result.dl], [250, 213, 150, 613]);
  assert.equal(result.donorFormat.format, "block");
  assert.deepEqual([result.donorFormat.arms.trimmedFive, result.donorFormat.arms.trimmedThree], [false, true]);
  assert.equal(result.donorFormat.status, "pass");
  assert.equal(result.gs.length, 1);
  assert.equal(createHash("sha256").update(result.donor).digest("hex"), "4aca43b856f303b8e94b1c362dfc6f22ee88ed53fb8aec88ed55cf21b0b0e56a");
  // The 3' arm stops three bases before the first poly-A run.
  const genome = result.gb.genomicSequence.toUpperCase();
  const end = result.sp - 1 + 3 + result.h3l;
  assert.equal(genome.slice(end + 3, end + 18), "A".repeat(15));
});

test("NR2F2: without trimming the 3' arm keeps both poly-A runs and the pre-check says so", () => {
  const result = NR2F2({ donorFormat: "block", customGuides: [GUIDE1] });
  assert.deepEqual([result.h5l, result.h3l], [250, 250]);
  assert.equal(result.donorFormat.status, "warn");
  const runs = result.donorFormat.synthesis.issues.filter((i) => i.kind === "homopolymer");
  assert.deepEqual(runs.map((i) => i.region), ["3\u2032 arm", "3\u2032 arm"]);
  assert.ok(runs.every((i) => i.detail === "15-nt poly-A run"));
});

test("legacy calls are unchanged: symmetric arms, format inferred from the length, nothing reordered", () => {
  const result = NR2F2({}, 400, "SD40-V5");
  assert.deepEqual([result.h5l, result.h3l, result.hl], [400, 400, 400]);
  assert.deepEqual([result.donorFormat.inferred, result.donorFormat.format, result.donorFormat.orderSequence], [true, "block", null]);
  const small = NR2F2({}, 50, "2xHA-only");
  assert.deepEqual([small.donorFormat.inferred, small.donorFormat.format, small.donorFormat.orderSequence], [true, "ssodn", null]);
  assert.equal(small.donor.length, small.donorFormat.totalLength);
});

test("a small tag becomes an ssODN of at most 200 nt, ordered as one strand and carried into the order rows", () => {
  const result = NR2F2({ donorFormat: "auto", autoTrimArms: true }, "", "2xHA-only");
  const format = result.donorFormat;
  assert.equal(format.format, "ssodn");
  assert.ok(result.dl <= 200 && result.dl >= 190, `donor is ${result.dl} nt`);
  assert.deepEqual([result.h5l, result.h3l], [52, 52]);
  const strand = result.gs[0].str === "+" ? "antisense" : "sense";
  assert.equal(format.orderStrand, strand);
  assert.equal(format.orderSequence, strand === "antisense" ? revcomp(result.donor) : result.donor);
  const rows = buildBatchOrderRows([{ status: "success", slot: 1, rowId: "r1", result, row: { gene: result.gene, projectType: "ct", fileName: "reference.gb" } }]);
  const donorRow = rows.find((row) => row.itemType === "Donor");
  assert.equal(donorRow.sequence, format.orderSequence);
  assert.ok(donorRow.notes.includes(`ssODN, 52 bp arms, order the ${strand} strand`));
});

test("a reporter-sized insert defaults to a cloned/AAV donor with 500 bp arms and is not trimmed", () => {
  const result = NR2F2({ donorFormat: "auto", autoTrimArms: true }, "", "T2A-EGFP");
  assert.deepEqual([result.donorFormat.format, result.h5l, result.h3l], ["aav", 500, 500]);
  assert.equal(result.donorFormat.synthesis.relevant, false);
  assert.equal(result.donorFormat.status, "pass");
  assert.ok(result.donorFormat.notes.some((text) => text.includes("homology cassette")));
  assert.equal(result.donorFormat.orderSequence, null);
});

test("per-side arms are honoured and clamped to the reference", () => {
  const result = NR2F2({ donorFormat: "block", arm5Length: 120, arm3Length: 300, customGuides: [GUIDE1] });
  assert.deepEqual([result.h5l, result.h3l, result.dl], [120, 300, 120 + 213 + 300]);
  const huge = NR2F2({ donorFormat: "block", arm5Length: 99999 });
  assert.equal(huge.donorFormat.arms.limitedFive, true);
  assert.ok(huge.h5l < 99999 && huge.h5l > 0);
});

test("the N-terminal design plans arms the same way", () => {
  const result = runDesign("nt", fixture("synthetic-tagging.gb"), "", "N:EGFP-Linker", "", { expectedGene: "TAGME", donorFormat: "auto", arm3Length: 180 });
  assert.equal(result.err, undefined);
  assert.deepEqual([result.donorFormat.format, result.h5l, result.h3l], ["aav", 500, 180]);
});

test("report and readiness: the donor format block is rendered, with the order sequence for an ssODN", () => {
  const result = NR2F2({ donorFormat: "block", customGuides: [GUIDE1] });
  const html = buildDonorFormatHtml(result);
  assert.ok(html.includes("Donor format and arms") && html.includes("15-nt poly-A run"));
  assert.ok(html.includes("Synthesis pre-check") && html.includes("not IDT"));
  const check = buildDesignReadinessChecks(result).find((item) => item.label === "Donor format and synthesis");
  assert.deepEqual([check.status, check.detail.includes("poly-A")], ["warn", true]);
  const ok = NR2F2({ donorFormat: "auto", autoTrimArms: true, customGuides: [GUIDE1] });
  assert.equal(buildDesignReadinessChecks(ok).find((item) => item.label === "Donor format and synthesis").status, "pass");
  const small = NR2F2({ donorFormat: "auto", autoTrimArms: true }, "", "2xHA-only");
  assert.ok(buildDonorFormatHtml(small).includes("Sequence to order"));
  const meta = { gene: ok.gene, cellLine: "", irisId: "", parentId: "", projectType: "ct", mutation: "", tag: ok.tag };
  assert.ok(buildReportHtml(meta, ok, "fixture", null, [], null).includes("Donor format and arms"));
  assert.equal(buildDonorFormatHtml({}), "");
});

test("the design scheme draws the asymmetric block and names its format", () => {
  const result = NR2F2({ donorFormat: "auto", autoTrimArms: true, customGuides: [GUIDE1] });
  const svg = buildDesignSchemeSvg(result);
  assert.ok(svg.includes("Donor (dsDNA block), 613 bp: 250 | 213 | 150"));
  assert.ok(svg.includes("5\u2032 arm 250 bp") && svg.includes("3\u2032 arm 150 bp"));
});
