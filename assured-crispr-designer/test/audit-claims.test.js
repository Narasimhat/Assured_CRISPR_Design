// Every claim `audit/2026_GE_design_audit.md` makes about this application, made executable.
//
// The audit is a governance document: it tells a reader which archived designs are unsafe
// and asserts that the current engine now handles each case. Those assertions were prose.
// An unverified assertion in a safety document is the same defect class as a QC gate that
// cannot fire or a "ready" status nothing can reach - it reads as assurance and provides
// none.
//
// Scope: this file verifies claims about the *application*. It does not re-derive the
// per-project findings, which would need the internal 2026_GE project files. Those stay
// outside the repository, so the claims here are exercised against committed fixtures and
// synthetic input that reproduce the same shape.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  collectProcurementReviewNotes,
  runDesign,
  summarizeGuideBlocking,
  summarizeGuidePairReadiness,
  summarizeProcurementReadiness,
} from "../src/designEngine.js";
import { buildBatchOrderRows } from "../src/orderRows.js";
import * as releaseVerdictModule from "../src/releaseVerdict.js";
import { getReleaseVerdict } from "../src/releaseVerdict.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(path.join(here, "fixtures", name), "utf8");

const design = (type, reference, mutation = "", tag = "", options = {}) =>
  runDesign(type, fixture(reference), mutation, tag, 400, { deliveryMethod: "rnp", ...options });

/**
 * Same design, with blocking capped at one change.
 *
 * The engine now stacks up to three synonymous seed mismatches, so most guides reach strong
 * protection and the fixtures no longer produce a weak pair on their own. Tests about what
 * the tool does with a weakly protected pair still need one. maxBlockingChanges is a real
 * option - a designer may want fewer donor edits - not a hook invented for the suite.
 */
const designWeaklyBlocked = (type, reference, mutation = "", tag = "", options = {}) =>
  design(type, reference, mutation, tag, { ...options, maxBlockingChanges: 1 });

/** One workspace entry, the shape buildBatchOrderRows consumes. */
const entry = (result, row = {}) => ({
  status: "success",
  slot: 1,
  rowId: "r1",
  result,
  row: { gene: result.gene, projectType: result.type, fileName: "reference.gb", ...row },
});

// --- "Compute procurement readiness separately from computational design success." -------

test("audit: a design can compute cleanly and still not be releasable", () => {
  const result = design("pm", "apoe-r154s.gb", "R176C", "", { expectedGene: "APOE" });
  assert.equal(result.err, undefined, "the design must compute");
  assert.ok((result.gs || []).length > 0, "and produce guides");
  // Computational success says nothing about release state; that is the whole point.
  assert.notEqual(summarizeProcurementReadiness(result).status, "ready");
});

// --- "Reject/warn on incomplete or ambiguous SpCas9 spacer sequences ... including 19 nt" -

test("audit: historical 19 nt spacer rows are refused, not silently padded", () => {
  // 45638/45639 APOE HALO carried 19 nt guides and a blank gRNA1 row.
  const nineteen = "GCACCGAGGAGCTGCGGGT"; // 19 nt
  assert.equal(nineteen.length, 19);
  const result = design("pm", "apoe-r154s.gb", "R154S", "", {
    expectedGene: "APOE",
    customGuides: [nineteen],
  });
  assert.ok(result.err, "a 19 nt spacer was accepted");
  assert.match(result.err, /20/, `refusal should say what is required: ${result.err}`);
});

test("audit: a blank guide row cannot become a design", () => {
  ["", "   ", "NNNNNNNNNNNNNNNNNNNN"].forEach((spacer) => {
    const result = design("pm", "apoe-r154s.gb", "R154S", "", {
      expectedGene: "APOE",
      customGuides: [spacer],
    });
    // Either refused outright, or the empty entry is discarded rather than designed against.
    if (!result.err) {
      (result.gs || []).forEach((guide) => {
        assert.equal(guide.sp.length, 20, "a guide of the wrong length reached the design");
        assert.ok(!/^N+$/.test(guide.sp), "an all-ambiguous guide reached the design");
      });
    }
  });
});

// --- "strict PAM disruption (NAG/NGA are not accepted as dead PAMs)" ----------------------

test("audit: NAG and NGA PAM changes are not graded as strong blocking", () => {
  // Finding 2: APOE R176C, V254E, PHF6, SCN5A and several Landthaler designs called
  // NAG/NGA changes "guide blocking present". Only a real PAM kill counts as strong.
  const result = design("pm", "apoe-r154s.gb", "R176C", "", { expectedGene: "APOE" });
  const blocking = summarizeGuideBlocking(result);
  assert.ok(blocking, "no blocking summary was produced");

  const tiers = (blocking.guides || []).map((g) => g.tier || g.blocking?.tier).filter(Boolean);
  assert.ok(tiers.length > 0, "no per-guide blocking tiers were produced - this test would be vacuous");
  tiers.forEach((tier) => {
    assert.ok(["strong", "moderate", "weak", "none", "unknown"].includes(tier), `unknown tier ${tier}`);
  });

  // Whatever the tiers are, a design not strongly protected on every guide must not be
  // ready. That is the property the audit asserts, independent of this fixture's specifics.
  if (tiers.some((tier) => tier !== "strong")) {
    assert.notEqual(summarizeProcurementReadiness(result).status, "ready",
      "a design with a non-strong block was graded ready");
  }
});

// --- "final assembled-donor translation" (finding 1: the R154S donor collision) -----------

test("audit finding 1: the R154S donors encode Ser at 154, not the archived Arg", () => {
  // The archived gRNA2 donor applied CGC->CGA at the codon requested as CGC->AGC, so the
  // assembled donor encoded Arg. Note what is and is not checkable here: the engine builds
  // its own donors, so this asserts it does not *produce* the collision. Whether it would
  // *reject* the archived oligo is a different guarantee - there is no entry point that
  // validates an arbitrary supplied donor, so the audit's "rejects this donor" wording
  // outruns what the code can demonstrate.
  const result = design("pm", "apoe-r154s.gb", "R154S", "", { expectedGene: "APOE" });
  assert.equal(result.err, undefined);
  assert.ok((result.os || []).length >= 2, "expected a donor per guide");

  (result.os || []).forEach((donor) => {
    const validation = donor.proteinValidation;
    assert.ok(validation, `donor ${donor.n} carries no protein assertion`);
    assert.equal(validation.targetAaNumber, 154);
    assert.equal(validation.intendedAa, "S");
    assert.equal(validation.observedAa, "S", `${donor.n} encodes ${validation.observedAa}, not Ser`);
    assert.equal(validation.valid, true);

    // The audited codon itself: CGC -> AGC (Ser), never CGA (Arg).
    const codon = validation.codons.find((entry) => entry.aaNumber === 154);
    assert.ok(codon, `${donor.n} does not report codon 154`);
    assert.equal(codon.referenceCodon, "CGC");
    assert.equal(codon.finalCodon, "AGC", `${donor.n} applies ${codon.finalCodon} at codon 154`);
    assert.notEqual(codon.finalCodon, "CGA", "the archived collision was reproduced");
    assert.equal(codon.observedAa, "S");

    // No silent edit may change a residue the request did not ask to change.
    validation.codons.filter((entry) => entry.aaNumber !== 154).forEach((entry) => {
      assert.equal(entry.observedAa, entry.referenceAa,
        `${donor.n} changed residue ${entry.aaNumber} from ${entry.referenceAa} to ${entry.observedAa}`);
    });
  });
});

test("audit finding 1: a donor failing its protein assertion blocks release", () => {
  // The consequence half of the claim, asserted directly rather than behind an `if` that
  // no fixture enters. summarizeProcurementReadiness must treat a failed assertion as a
  // blocker, not a warning.
  const result = design("pm", "apoe-r154s.gb", "R154S", "", { expectedGene: "APOE" });
  const broken = {
    ...result,
    os: (result.os || []).map((donor, index) => (index === 0
      ? { ...donor, proteinValidation: { ...donor.proteinValidation, valid: false, observedAa: "R" } }
      : donor)),
  };
  const readiness = summarizeProcurementReadiness(broken);
  assert.equal(readiness.status, "blocked", "a donor failing translation did not block release");
  assert.ok(readiness.blockers.some((item) => /protein|assert/i.test(item)),
    `blocked without naming the protein assertion: ${readiness.blockers.join(" | ")}`);
});

// --- "cross-guide protection" / "guide-to-donor pairing" ---------------------------------

test("audit: alternative guides are never presented as poolable unless every donor blocks them", () => {
  // 72876/72878/72889 NKX3.1 + RNF213: one document mixed projects and WT/mutant donors,
  // making accidental co-delivery plausible.
  const result = designWeaklyBlocked("pm", "apoe-r154s.gb", "R154S", "", { expectedGene: "APOE" });
  if ((result.gs || []).length > 1 && !result.coDeliverySafe) {
    assert.ok(result.guideDonorInstruction, "multiple guides offered with no pairing instruction");
    assert.match(result.guideDonorInstruction, /do not|only|matched/i,
      "the pairing instruction does not forbid pooling");
  }
  // Every donor must name the guide it belongs to, or pairing cannot be preserved downstream.
  (result.os || []).forEach((donor) => {
    assert.ok(donor.guideName, `donor ${donor.n} is not linked to a guide`);
  });
});

// --- "primer thermodynamics / outside-arm placement" (finding 3) --------------------------

test("audit finding 3: primers that cannot clear the homology arms are never ordering-ready", () => {
  // EIF3D, EIF4E, UPF1, EIF4G1, EIF4G3 and the APOE plans labelled primers ready despite
  // extreme Tm/GC, dimer risk, low complexity, or fallback placement.
  //
  // A C-terminal design on the 3.3 kb APOE reference cannot place primers outside 400 bp
  // arms with the required margin, so it takes the degraded path. The first version of this
  // test looked for "fallback" in the strategy id, which no strategy ever contains, and so
  // asserted nothing at all.
  const degraded = design("ct", "apoe-r154s.gb", "", "SD40-2xHA", { expectedGene: "APOE" });
  assert.equal(degraded.err, undefined);
  assert.equal(degraded.primerStrategy, "outside-homology-arms-unavailable",
    `fixture no longer takes the degraded path: ${degraded.primerStrategy}`);
  assert.notEqual(summarizeProcurementReadiness(degraded).status, "ready",
    "primers that could not clear the homology arms were graded ready");

  // The healthy counterpart, so this is not passing merely because everything is unready.
  const placed = design("ct", "synthetic-tagging.gb", "", "SD40-2xHA", { expectedGene: "TAGME" });
  assert.equal(placed.primerStrategy, "recommended-outside-homology-arms");
  assert.equal(summarizeProcurementReadiness(placed).status, "ready");
});

test("audit finding 3: no primer strategy claims the primers were validated", () => {
  // The identifier travels into the CSV, the vendor templates and the CLI payload, so it
  // carries whatever it claims. Every strategy is either a recommendation or a statement
  // that placement was unavailable - none asserts validation.
  [
    design("pm", "apoe-r154s.gb", "R154S", "", { expectedGene: "APOE" }),
    design("pm", "apoe-r154s.gb", "R176C", "", { expectedGene: "APOE" }),
    design("ct", "synthetic-tagging.gb", "", "SD40-2xHA", { expectedGene: "TAGME" }),
    design("ct", "apoe-r154s.gb", "", "SD40-2xHA", { expectedGene: "APOE" }),
    design("ko", "two-genes-partial-first.gb", "", "", { expectedGene: "TARGETB" }),
  ].forEach((result) => {
    assert.ok(result.primerStrategy, "no primer strategy recorded");
    assert.ok(!/valid/i.test(result.primerStrategy), `strategy claims validation: ${result.primerStrategy}`);
    assert.match(result.primerStrategy, /^(recommended-|outside-homology-arms-unavailable$)/,
      `unrecognised primer strategy: ${result.primerStrategy}`);
  });
});

// --- Finding 4: "Order export lacked safety state" ---------------------------------------

test("audit finding 4: every exported order row carries the review status and its reasons", () => {
  // The archived vendor workbooks carried sequences without the findings. This is the claim
  // that could not be tested at all while the builder lived in App.jsx.
  const result = design("pm", "apoe-r154s.gb", "R154S", "", { expectedGene: "APOE" });
  const readiness = summarizeProcurementReadiness(result);
  const rows = buildBatchOrderRows([entry(result)]);

  assert.ok(rows.length > 0, "no order rows were produced");
  rows.forEach((row) => {
    assert.equal(row.reviewStatus, readiness.status, `${row.name} lost the review status`);
    assert.ok(row.reviewNotes.length > 0, `${row.name} carries no review notes`);
    // The full reasons, not a truncated summary.
    collectProcurementReviewNotes(readiness).forEach((note) => {
      assert.ok(row.reviewNotes.includes(note), `${row.name} omits a review note: ${note.slice(0, 40)}`);
    });
  });
});

test("audit finding 4: the exported Recommended column follows the release state", () => {
  const blocked = design("pm", "apoe-r154s.gb", "R154S", "", { expectedGene: "APOE" });
  const ready = design("ct", "synthetic-tagging.gb", "", "SD40-2xHA", { expectedGene: "TAGME" });

  const blockedVerdict = getReleaseVerdict(blocked);
  const readyVerdict = getReleaseVerdict(ready);
  assert.equal(blockedVerdict.orderable, false, "fixture must be non-orderable to mean anything");
  assert.equal(readyVerdict.orderable, true, "fixture must be orderable to mean anything");

  buildBatchOrderRows([entry(blocked)]).forEach((row) => {
    assert.ok(!/^Yes$/i.test(row.recommended), `${row.name} recommends ordering a non-releasable design`);
    assert.match(row.recommended, /blocked|review|do not/i,
      `${row.name} does not say why it is not recommended: ${row.recommended}`);
  });
  buildBatchOrderRows([entry(ready)]).forEach((row) => {
    assert.ok(!/do not order|blocked/i.test(row.recommended),
      `${row.name} warns against ordering a releasable design`);
  });
});

test("audit: a failed design contributes no order rows at all", () => {
  const rows = buildBatchOrderRows([
    { status: "error", slot: 1, rowId: "r1", result: null, row: {} },
    { status: "success", slot: 2, rowId: "r2", result: null, row: {} },
  ]);
  assert.deepEqual(rows, [], "rows were emitted for a design that does not exist");
});

// --- MYD88 KO claims ----------------------------------------------------------------------

test("audit: a knockout reports both products, not one amplicon size", () => {
  // 75647 MYD88 KO: the old report gave a single amplicon size for a dual-cut deletion.
  const result = design("ko", "two-genes-partial-first.gb", "", "", { expectedGene: "TARGETB" });
  assert.equal(result.err, undefined);
  assert.ok(result.amp, "no amplicon description");
  assert.match(result.amp, /WT ~\d+ bp \| deletion ~\d+ bp/,
    `a knockout must report both products: ${result.amp}`);
});

// --- The audit's own scope statement -------------------------------------------------------

test("audit: the standing external check is stated on every design, including ready ones", () => {
  // "Genome-wide specificity ... still require independent confirmation." A design that
  // reaches ready must still say so, or "ready" reads as "nothing left to check".
  [
    design("pm", "apoe-r154s.gb", "R154S", "", { expectedGene: "APOE" }),
    design("ct", "synthetic-tagging.gb", "", "SD40-2xHA", { expectedGene: "TAGME" }),
  ].forEach((result) => {
    const verdict = getReleaseVerdict(result);
    assert.ok(verdict.standingRequirements.length > 0,
      `${verdict.status} design dropped the standing requirements`);
    assert.ok(verdict.standingRequirements.some((item) => /genome-wide/i.test(item)),
      "the standing specificity requirement is missing");
  });
});

// --- The document must not outrun the code -------------------------------------------------

test("audit: the document's application-change list is the one this file covers", () => {
  // If a change is added to the audit's closing list, it needs a check here. This fails
  // loudly on drift rather than letting the document accumulate unverified assurances.
  const doc = readFileSync(path.join(here, "..", "..", "audit", "2026_GE_design_audit.md"), "utf8");
  const section = doc.split("## Application changes driven by this audit")[1] || "";
  const bullets = section.split("\n").filter((line) => line.trim().startsWith("- "));
  assert.equal(bullets.length, 5, `the audit lists ${bullets.length} application changes; this file was written against 5`);
});


test("audit: guide-to-donor pairing survives into the exported rows", () => {
  // 72876/72878/72889 NKX3.1 + RNF213: one combined order made cross-project and WT/mutant
  // co-delivery plausible. Pairing on the design object is not enough - the export is what
  // a supplier and a bench scientist actually read, so the link has to be in the row.
  //
  // Mutation testing found this: blanking `linkedGuide` in orderRows.js broke nothing,
  // because the only pairing assertion was against the design result.
  [
    designWeaklyBlocked("pm", "apoe-r154s.gb", "R154S", "", { expectedGene: "APOE" }),
    designWeaklyBlocked("it", "synthetic-tagging.gb", "F50", "SPOT", { expectedGene: "TAGME" }),
  ].forEach((result) => {
    assert.equal(result.err, undefined);
    const rows = buildBatchOrderRows([entry(result)]);
    const guideNames = rows.filter((row) => row.itemType === "gRNA").map((row) => row.name);
    const donorRows = rows.filter((row) => row.itemType === "Donor");
    assert.ok(donorRows.length > 0, `${result.type}: no donor rows to check`);

    donorRows.forEach((row) => {
      assert.ok(row.linkedGuide, `${result.type} donor ${row.name} exports with no linked guide`);
      assert.ok(guideNames.includes(row.linkedGuide),
        `${result.type} donor ${row.name} names a guide that is not in the export: ${row.linkedGuide}`);
      // The note must name the guide too - a bare "recommended donor strand" reads as
      // usable with any guide in the set.
      assert.ok(row.notes.includes(row.linkedGuide),
        `${result.type} donor ${row.name} notes do not name its guide: ${row.notes}`);
    });

    // Distinct donors must not all collapse onto one guide.
    if (donorRows.length > 1) {
      const linked = new Set(donorRows.map((row) => row.linkedGuide));
      assert.equal(linked.size, donorRows.length,
        `${result.type}: ${donorRows.length} donors exported against ${linked.size} distinct guides`);
    }
  });
});


// --- per-pair release state ----------------------------------------------------------
//
// Grading blocking design-wide meant one weak *alternative* guide blocked the pair you were
// actually going to use, while the same report told you to use one matched pair only and
// not to pool the alternatives. Both statements cannot be right. The orderable unit is a
// guide with its matched ssODN, so that is where release state is decided - except under
// co-delivery, where both guides share a well and an unblocked one re-cuts the repair.

test("a weak alternative guide no longer condemns the pair you were told to use", () => {
  const result = designWeaklyBlocked("pm", "apoe-r154s.gb", "R154S", "", { expectedGene: "APOE" });
  const readiness = summarizeProcurementReadiness(result);

  assert.notEqual(readiness.status, "blocked", "a sound pair was blocked by its alternative");
  const pairs = readiness.guidePairs;
  assert.equal(pairs.length, 2);

  const strong = pairs.find((pair) => pair.tier === "strong");
  const weak = pairs.find((pair) => pair.tier === "weak");
  assert.ok(strong && weak, "fixture must have one strong and one weak pair to mean anything");
  assert.equal(strong.orderable, true, "the strongly blocked pair is not orderable");
  assert.equal(weak.orderable, false, "the weakly blocked pair is orderable");

  // And the report must say which one, and what to do. Asserting only that both names
  // appear was too loose: a mutation that reduced the sentence to the bare names still
  // passed, because both names were still in it.
  const steer = readiness.warnings.find((item) => item.includes(strong.guideName) && item.includes(weak.guideName));
  assert.ok(steer, "no instruction names the orderable pair and the one to avoid");
  assert.match(steer, new RegExp(`Order ${strong.guideName} with its matched ssODN only`),
    `the instruction does not say what to order: ${steer}`);
  assert.match(steer, new RegExp(`Do not order ${weak.guideName}`),
    `the instruction does not say what to avoid: ${steer}`);
  assert.match(steer, /re-cut/i, "the instruction does not say why");
});

test("co-delivery still fails the whole set on one weak guide", () => {
  // The strict gate is not gone, it is scoped. Both guides and both ssODNs in one well is
  // exactly the case where a guide that is not blocked in every donor re-cuts the allele
  // the other donor just repaired.
  const result = designWeaklyBlocked("pm", "apoe-r154s.gb", "R154S", "", {
    expectedGene: "APOE", coDeliveryBlocking: true,
  });
  const readiness = summarizeProcurementReadiness(result);
  assert.equal(readiness.status, "blocked", "co-delivery with a weak guide was not blocked");
  assert.ok(readiness.blockers.some((item) => /Co-delivery requires every guide/i.test(item)),
    `blocked without naming the co-delivery reason: ${readiness.blockers.join(" | ")}`);
});

test("the relaxation did not become 'nothing is ever blocked'", () => {
  // A hard error still blocks outright and no pair is orderable through it. Weak protection
  // is deliberately no longer such an error - it is a risk a designer can accept - so this
  // uses a reference the engine cannot resolve: two annotated genes and none stated.
  const result = design("pm", "two-genes-partial-first.gb", "L10S", "", {});
  const readiness = summarizeProcurementReadiness(result);
  assert.equal(readiness.status, "blocked");
  assert.ok(readiness.blockers.some((item) => /annotates 2 genes|multiple/i.test(item)),
    `blocked for an unexpected reason: ${readiness.blockers.join(" | ")}`);
  // Every donor is unorderable while the design itself is blocked, whatever its pair state.
  const { getDonorReleaseStatus } = releaseVerdictModule;
  (result.os || []).forEach((donor) => {
    assert.equal(getDonorReleaseStatus(result, donor.guideName), "blocked");
  });
});

test("the exported rows state each pair's own release state", () => {
  // The distinction has to survive into the CSV, or the person ordering cannot act on it.
  const result = designWeaklyBlocked("pm", "apoe-r154s.gb", "R154S", "", { expectedGene: "APOE" });
  const readiness = summarizeProcurementReadiness(result);
  const strong = readiness.guidePairs.find((pair) => pair.orderable);
  const weak = readiness.guidePairs.find((pair) => !pair.orderable);

  const donorRows = buildBatchOrderRows([entry(result)]).filter((row) => row.itemType === "Donor");
  const strongRow = donorRows.find((row) => row.linkedGuide === strong.guideName);
  const weakRow = donorRows.find((row) => row.linkedGuide === weak.guideName);
  assert.ok(strongRow && weakRow, "both donor rows must be present");

  assert.ok(!/do not order|blocked/i.test(strongRow.recommended),
    `the orderable pair's donor is marked unorderable: ${strongRow.recommended}`);
  assert.match(weakRow.recommended, /do not order|blocked/i,
    `the weak pair's donor does not warn against ordering: ${weakRow.recommended}`);
  assert.notEqual(strongRow.recommended, weakRow.recommended,
    "both donors export the same recommendation, so the per-pair distinction is lost");
});

test("the report shows the orderable donor differently from the unorderable one", async () => {
  const { buildReportHtml } = await import("../src/reportHtml.js");
  const { buildHistoricalContext, buildReviewItems, buildRowMeta } = await import("../src/reportInputs.js");
  const { getDonorReleaseStatus } = await import("../src/releaseVerdict.js");

  const result = designWeaklyBlocked("pm", "apoe-r154s.gb", "R154S", "", { expectedGene: "APOE" });
  const readiness = summarizeProcurementReadiness(result);
  const strong = readiness.guidePairs.find((pair) => pair.orderable);
  const weak = readiness.guidePairs.find((pair) => !pair.orderable);
  assert.equal(getDonorReleaseStatus(result, strong.guideName), readiness.status);
  // "pair-blocked", not "blocked": the design is in review, only this pair is refused.
  assert.equal(getDonorReleaseStatus(result, weak.guideName), "pair-blocked");

  const meta = buildRowMeta({ gene: "APOE", projectType: "pm" }, result);
  const html = buildReportHtml(meta, result, "apoe-r154s.gb",
    buildHistoricalContext(meta, result, "pm"), buildReviewItems(meta, result, "apoe-r154s.gb"), null);

  // The weak pair must be refused in the document, and the instruction naming both must
  // reach the page rather than sitting only in the API.
  assert.match(html, /do not order/i, "the report does not refuse the weak pair's donor");
  assert.ok(html.includes(strong.guideName) && html.includes(weak.guideName),
    "the report does not name both guides");
});


test("a donor failing its protein assertion is not an orderable pair", () => {
  // The design-level blocker already stops release, which is why removing the pair-level
  // check broke no test. But `orderable` is read per pair by the badges, the CSV and any
  // future consumer, so a pair whose donor mistranslates must not report itself usable.
  const result = designWeaklyBlocked("pm", "apoe-r154s.gb", "R154S", "", { expectedGene: "APOE" });
  const target = result.os[0];
  const broken = {
    ...result,
    os: result.os.map((donor) => (donor === target
      ? { ...donor, proteinValidation: { ...donor.proteinValidation, valid: false, observedAa: "R" } }
      : donor)),
  };

  const pairs = summarizeGuidePairReadiness(broken).pairs;
  const affected = pairs.find((pair) => pair.guideName === target.guideName);
  assert.ok(affected, "the mistranslating donor's pair is missing");
  assert.equal(affected.orderable, false, "a pair whose donor mistranslates reports itself orderable");
  assert.ok(affected.blockers.some((item) => /protein assertion/i.test(item)),
    `the pair does not say why: ${affected.blockers.join(" | ")}`);
});


// --- accepting weak protection, on the record ------------------------------------------
//
// Weak protection is a risk a competent designer can weigh and accept. The tool's job is
// then to record that a person decided it - not to hide the advice, and not to pretend the
// design passed.

test("weak protection can be accepted, and the design still does not read as ready", () => {
  const plain = designWeaklyBlocked("pm", "apoe-r154s.gb", "R154S", "", { expectedGene: "APOE" });
  const weakName = summarizeProcurementReadiness(plain).guidePairs.find((p) => !p.orderable).guideName;

  const accepted = designWeaklyBlocked("pm", "apoe-r154s.gb", "R154S", "", {
    expectedGene: "APOE",
    acceptWeakProtection: true,
    weakProtectionReason: "RNP, short exposure; screening 48 clones with full-amplicon sequencing.",
    acceptedBy: "N. Telugu",
  });
  const readiness = summarizeProcurementReadiness(accepted);
  const pair = readiness.guidePairs.find((entry) => entry.guideName === weakName);

  assert.equal(pair.acknowledged, true, "the acceptance was not applied");
  assert.equal(pair.orderable, true, "an accepted pair is still refused");
  assert.notEqual(readiness.status, "ready", "an acceptance must not make a design read as ready");

  // The advice stays visible and the reason is on the record.
  const notes = readiness.warnings.join(" | ");
  assert.match(notes, /weak protection accepted for ordering/i, "the acceptance is not stated");
  assert.match(notes, /RNP, short exposure/, "the recorded reason is missing");
  assert.match(notes, /weak protection/i, "the original risk is no longer described");
});

test("an acceptance without a reason does nothing", () => {
  const result = designWeaklyBlocked("pm", "apoe-r154s.gb", "R154S", "", {
    expectedGene: "APOE", acceptWeakProtection: true, weakProtectionReason: "   ",
  });
  const pair = summarizeProcurementReadiness(result).guidePairs.find((entry) => entry.tier !== "strong");
  assert.equal(pair.acknowledged, false, "an unexplained override was honoured");
  assert.equal(pair.orderable, false);
});

test("an acceptance never overrides a donor that encodes the wrong protein", () => {
  // Weak protection is a risk. A mistranslating donor is an error, and no amount of
  // sign-off makes it orderable.
  const result = designWeaklyBlocked("pm", "apoe-r154s.gb", "R154S", "", {
    expectedGene: "APOE", acceptWeakProtection: true, weakProtectionReason: "accepted after review",
  });
  const target = result.os[0];
  const broken = {
    ...result,
    os: result.os.map((donor) => (donor === target
      ? { ...donor, proteinValidation: { ...donor.proteinValidation, valid: false, observedAa: "R" } }
      : donor)),
  };
  const pair = summarizeGuidePairReadiness(broken).pairs.find((entry) => entry.guideName === target.guideName);
  assert.equal(pair.orderable, false, "an acceptance overrode a failed protein assertion");
  assert.ok(pair.hardBlockers.length > 0);
});

test("an acceptance is not honoured under co-delivery", () => {
  // There the weak guide re-cuts the allele the *other* donor just repaired - a different
  // and larger risk than the one being accepted. Order the pairs separately instead.
  const result = designWeaklyBlocked("pm", "apoe-r154s.gb", "R154S", "", {
    expectedGene: "APOE",
    coDeliveryBlocking: true,
    acceptWeakProtection: true,
    weakProtectionReason: "accepted after review",
  });
  const readiness = summarizeProcurementReadiness(result);
  assert.equal(readiness.status, "blocked", "an acceptance unblocked a co-delivered design");
  assert.ok(readiness.guidePairs.every((pair) => !pair.acknowledged));
});

test("an accepted pair exports as orderable, with the acceptance in the wording", async () => {
  const { getDonorReleaseStatus } = await import("../src/releaseVerdict.js");
  const accepted = designWeaklyBlocked("pm", "apoe-r154s.gb", "R154S", "", {
    expectedGene: "APOE",
    acceptWeakProtection: true,
    weakProtectionReason: "screening 48 clones with full-amplicon sequencing",
  });
  const weakName = summarizeProcurementReadiness(accepted).guidePairs
    .find((entry) => entry.acknowledged).guideName;
  assert.equal(getDonorReleaseStatus(accepted, weakName), "accepted");

  const row = buildBatchOrderRows([entry(accepted)])
    .find((item) => item.itemType === "Donor" && item.linkedGuide === weakName);
  assert.ok(row, "the accepted donor is missing from the export");
  assert.match(row.recommended, /accepted/i, `the export hides the acceptance: ${row.recommended}`);
  assert.ok(!/do not order/i.test(row.recommended), "the export still refuses an accepted pair");
  // And the export still carries the full review reasons, including the recorded decision.
  assert.match(row.reviewNotes, /weak protection accepted/i, "the export drops the recorded decision");
});

test("a refused pair no longer claims the design is blocked", async () => {
  // The wording was wrong once per-pair state existed: the design is in review, so
  // "Do not order - design blocked" was a false statement in an ordering artefact.
  const { getOrderRecommendationLabels } = await import("../src/reportModel.js");
  const labels = getOrderRecommendationLabels("pair-blocked");
  assert.ok(!/design blocked/i.test(labels.donorStrand), `still claims the design is blocked: ${labels.donorStrand}`);
  assert.match(labels.donorStrand, /not strongly blocked/i);

  const result = designWeaklyBlocked("pm", "apoe-r154s.gb", "R154S", "", { expectedGene: "APOE" });
  const weakName = summarizeProcurementReadiness(result).guidePairs.find((p) => !p.orderable).guideName;
  const row = buildBatchOrderRows([entry(result)])
    .find((item) => item.itemType === "Donor" && item.linkedGuide === weakName);
  assert.ok(!/design blocked/i.test(row.recommended), `export claims the design is blocked: ${row.recommended}`);
});


test("every field the acceptance collects reaches the record", () => {
  // "Accepted by" was captured by the form and shown nowhere - a field that exists only in
  // the input is not a record. Asserted rather than assumed, because the first version of
  // this feature had exactly that gap.
  const result = designWeaklyBlocked("pm", "apoe-r154s.gb", "R154S", "", {
    expectedGene: "APOE",
    acceptWeakProtection: true,
    weakProtectionReason: "screening 48 clones with full-amplicon sequencing",
    acceptedBy: "N. Telugu",
  });
  const readiness = summarizeProcurementReadiness(result);
  const pair = readiness.guidePairs.find((entry) => entry.acknowledged);
  assert.ok(pair, "no pair was acknowledged");
  assert.equal(pair.acknowledgedBy, "N. Telugu");

  const notes = readiness.warnings.join(" | ");
  assert.match(notes, /screening 48 clones/, "the reason is missing from the record");
  assert.match(notes, /Accepted by: N\. Telugu/, "the attribution is missing from the record");

  // And it must travel into the export, not stop at the screen.
  const row = buildBatchOrderRows([entry(result)])
    .find((item) => item.itemType === "Donor" && item.linkedGuide === pair.guideName);
  assert.match(row.reviewNotes, /Accepted by: N\. Telugu/, "the export drops the attribution");
});
