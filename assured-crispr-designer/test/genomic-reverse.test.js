import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { designGenomicSnp, buildGenomicSnpReport, readGenomicReferenceMetadata } from "../src/genomicSnp.js";
import { blockingPolicyFor } from "../src/genomicBlocking.js";
import { applySpliceCheck, buildSpliceCheckRequest } from "../src/pairBlocking.js";
import { buildGenomicSequenceCsv } from "../src/genomicSequenceExport.js";
import { buildDesignSchemeSvg } from "../src/designScheme.js";
import { complementBase, firstTickIndex, genomicAt, genomicSpan, indexOfGenomic, isReverse, otherStrandBase } from "../src/genomicCoords.js";
import { fetchGeneReference, fetchVariantReference, searchClinVar, translateDna } from "../src/geneFetch.js";

// A gene on the reverse strand is written along its transcript (Location ...:-1). The designers work in that record's own space, so a design for
// a reverse record must equal the design for the same record read as a forward one, with positions and alleles mapped back to the forward strand.
const here = path.dirname(fileURLToPath(import.meta.url));
const store = JSON.parse(fs.readFileSync(path.join(here, "fixtures", "gene-fetch", "responses.json"), "utf8"));
const DATE = new Date("2026-10-16T00:00:00Z");
const reply = (status, body) => ({ ok: status < 300, status, headers: { get: () => null }, json: async () => JSON.parse(body), text: async () => body });
const fetchImpl = async (url) => { const hit = store[url]; return hit ? reply(hit.status, hit.body) : reply(404, JSON.stringify({ error: `no recording for ${url}` })); };
const opts = { fetchImpl, sleep: async () => {}, date: DATE };
const rc = (s) => complementBase(s).split("").reverse().join("");

const shape = (design) => design.candidates.map((c) => ({
  guide: [c.name, c.sp, c.pam, c.str, c.d], donor: c.donor.od, donorWindow: [c.donor.donorStart, c.donor.donorEnd],
  changes: (c.blockingChanges || []).map((m) => [m.gp, m.nb, m.oc, m.nc, m.mt]), tier: c.protection.tier, cfd: c.protection.cfd,
}));

test("coordinate helpers map both ways and complement alleles", () => {
  const fwd = { referenceStart: 1001, referenceEnd: 2200, orientation: 1 }; const rev = { referenceStart: 1001, referenceEnd: 2200, orientation: -1 };
  assert.equal(genomicAt(fwd, 0), 1001); assert.equal(genomicAt(rev, 0), 2200); assert.equal(genomicAt(rev, 1199), 1001);
  for (const frame of [fwd, rev]) for (const i of [0, 7, 590, 1199]) assert.equal(indexOfGenomic(frame, genomicAt(frame, i)), i);
  assert.deepEqual(genomicSpan(rev, 10, 32), [2168, 2190]); assert.deepEqual(genomicSpan(fwd, 10, 32), [1011, 1033]);
  assert.equal(isReverse(rev), true); assert.equal(isReverse(fwd), false); assert.equal(isReverse({}), false);
  assert.equal(otherStrandBase(rev, "A"), "T"); assert.equal(otherStrandBase(fwd, "a"), "A");
  assert.equal(complementBase("ACGTN"), "TGCAN");
  // axis ticks fall on multiples of the step in genomic coordinates, whichever way the record runs
  for (const frame of [fwd, rev]) for (const from of [0, 3, 9, 10, 777]) for (const step of [10, 20, 50]) {
    const i = firstTickIndex(frame, from, step);
    assert.ok(i >= from && i - from < step, `${frame.orientation} ${from} ${step}`);
    assert.equal(genomicAt(frame, i) % step, 0, `${frame.orientation} ${from} ${step}`);
  }
});

// Deterministic synthetic reference without annotation, as in genomic-snp.test.js
let seed = 12345;
const dna = Array.from({ length: 1200 }, () => { seed = (seed * 1664525 + 1013904223) >>> 0; return "ACGT"[seed >>> 30]; });
dna.splice(580, 23, ..."ACACTGCCAGGCGCTTCTGCAGG");
const sequence = dna.join("");
const make = (location) => `LOCUS       SYNTHETIC 1200 bp DNA\nCOMMENT     Location: ${location}\nFEATURES             Location/Qualifiers\nORIGIN\n${sequence}\n//\n`;
const GP = 590; const alt = sequence[GP] === "A" ? "G" : "A";
const forwardInput = { assembly: "GRCh38", chromosome: "12", referenceStart: 1001, position: 1001 + GP, ref: sequence[GP], alt, forwardConfirmed: true, deliveryMethod: "rnp" };
const reverseInput = { ...forwardInput, position: 2200 - GP, ref: complementBase(sequence[GP]), alt: complementBase(alt) };

test("a reverse record designs exactly what the same record designs as a forward one", () => {
  for (const flags of [{ addBlocking: true, coDelivery: true }, { addBlocking: true, coDelivery: false }, { addBlocking: false, coDelivery: true }]) {
    const policy = blockingPolicyFor(flags);
    const f = designGenomicSnp(make("chromosome:GRCh38:12:1001:2200:1"), { ...forwardInput, blockingPolicy: policy });
    const r = designGenomicSnp(make("chromosome:GRCh38:12:1001:2200:-1"), { ...reverseInput, blockingPolicy: policy });
    assert.equal(f.err, undefined); assert.equal(r.err, undefined, JSON.stringify(flags));
    assert.deepEqual(shape(r), shape(f), JSON.stringify(flags));
    assert.deepEqual(r.primers.map((p) => [p.forward.s, p.reverse.s]), f.primers.map((p) => [p.forward.s, p.reverse.s]));
    assert.equal(r.status, f.status); assert.deepEqual(r.blockers, f.blockers);
    // what the user sees: forward-strand position and alleles as entered, orientation recorded, guide spans mirrored
    assert.equal(r.input.position, 2200 - GP); assert.equal(r.input.ref, reverseInput.ref); assert.equal(r.input.alt, reverseInput.alt);
    assert.equal(r.input.orientation, -1); assert.equal(r.input.referenceEnd, 2200); assert.equal(f.input.orientation, 1);
    r.candidates.forEach((c, i) => {
      const g = f.candidates[i];
      // forward index ps spans [1001+ps, 1023+ps]; reverse spans [2200-(ps+22), 2200-ps], i.e. [3201-end, 3201-start] of the forward interval
      assert.deepEqual([c.interval.start, c.interval.end], [3201 - g.interval.end, 3201 - g.interval.start], `interval of ${c.name}`);
      assert.ok(c.interval.start < c.interval.end);
    });
    // the context shows the record's own bases and alleles
    assert.equal(r.context.ref, sequence[GP]); assert.equal(r.context.alt, alt);
    assert.ok(r.warnings.some((w) => /reverse-strand gene/.test(w)));
    assert.ok(!f.warnings.some((w) => /reverse-strand gene/.test(w)));
  }
});

test("a reverse record is checked against its Location annotation and the complement of the alleles", () => {
  const ok = designGenomicSnp(make("chromosome:GRCh38:12:1001:2200:-1"), reverseInput);
  assert.equal(ok.err, undefined);
  assert.match(designGenomicSnp(make("chromosome:GRCh38:12:1001:2200:-1"), { ...reverseInput, ref: sequence[GP], alt: complementBase(alt) }).err, /Reference mismatch/);
  assert.match(designGenomicSnp(make("chromosome:GRCh38:12:1001:2200:-1"), { ...reverseInput, position: 2201 }).err, /outside/);
  assert.match(designGenomicSnp(make("chromosome:GRCh38:12:1001:2200:-1"), { ...reverseInput, position: 1000 }).err, /outside/);
  assert.match(designGenomicSnp(make("chromosome:GRCh38:12:1001:2201:-1"), reverseInput).err, /sequence length/);
  assert.match(designGenomicSnp(make("chromosome:GRCh38:12:1002:2201:-1"), reverseInput).err, /conflicts/);
  assert.match(designGenomicSnp(make("none"), { ...reverseInput, forwardConfirmed: false }).err, /Confirm/);
  assert.equal(readGenomicReferenceMetadata(make("chromosome:GRCh38:12:1001:2200:-1")).orientation, -1);
});

// The real reverse-strand gene in the fixtures: HBB, with the sickle-cell variant chr11:5,227,002 T>A (c.20A>T, p.Glu7Val in the preprotein).
async function hbbVariant() {
  const found = (await searchClinVar("VCV000015333", opts)).variants[0];
  const ref = await fetchVariantReference(found, opts);
  return { found, ref };
}

test("a ClinVar variant in a reverse-strand gene gets a reference written along the transcript", async () => {
  const { found, ref } = await hbbVariant();
  assert.equal(found.geneStrand, -1);
  const meta = readGenomicReferenceMetadata(ref.genbank);
  assert.equal(meta.orientation, -1);
  assert.deepEqual(ref.input, { gene: "HBB", assembly: "GRCh38", chromosome: "11", referenceStart: meta.start, position: 5227002, ref: "T", alt: "A", forwardConfirmed: true });
  assert.equal(ref.cdna, "c.20"); assert.equal(ref.clinvarCdna, "c.20");
  assert.deepEqual(ref.summary.warnings, []);
  const wrong = { ...found, variant: { ...found.variant, ref: "G" } };
  await assert.rejects(fetchVariantReference(wrong, opts), /disagree/);
});

test("the HBB sickle-cell design installs the right base on the transcript strand", async () => {
  const { ref } = await hbbVariant();
  const design = designGenomicSnp(ref.genbank, { ...ref.input, ...{ addBlocking: true, coDelivery: true }, blockingPolicy: blockingPolicyFor({ addBlocking: true, coDelivery: true }), deliveryMethod: "rnp" });
  assert.equal(design.err, undefined);
  assert.equal(design.type, "genomic-snv");
  const input = design.input; const gp = indexOfGenomic(input, 5227002);
  assert.equal(input.orientation, -1);
  assert.equal(design.gb.genomicSequence[gp], "A"); // c.20 reads A on the transcript, T on the forward strand
  assert.ok(design.candidates.length >= 2);
  const cds = design.gb.cdsSegments.map(([s, e]) => design.gb.genomicSequence.slice(s, e)).join("");
  const edited = design.gb.genomicSequence.slice(0, gp) + "T" + design.gb.genomicSequence.slice(gp + 1);
  const editedCds = design.gb.cdsSegments.map(([s, e]) => edited.slice(s, e)).join("");
  assert.equal(translateDna(cds)[6], "E"); assert.equal(translateDna(editedCds)[6], "V");
  for (const c of design.candidates) {
    // every donor differs from the reference at the edit (and at its documented blocking changes only), written in the record's orientation
    const wt = design.gb.genomicSequence.slice(c.donor.donorStart, c.donor.donorEnd);
    const diffs = [...wt].flatMap((b, i) => (b !== c.donor.genomicDonor[i] ? [c.donor.donorStart + i] : [])).sort((a, b) => a - b);
    assert.deepEqual(diffs, [gp, ...c.blockingChanges.map((m) => m.gp)].sort((a, b) => a - b));
    assert.equal(c.donor.genomicDonor[gp - c.donor.donorStart], "T");
  }
  // blocking changes keep their record positions; their forward coordinates and alleles are the mirror image
  const forwardSeq = rc(design.gb.genomicSequence);
  const request = buildSpliceCheckRequest(design);
  assert.equal(request.orientation, -1); assert.equal(request.referenceStart, input.referenceStart);
  assert.deepEqual(request.edit, { position: 5227002, ref: "T", alt: "A" });
  const listed = [...request.blocking, ...request.donors.flatMap((d) => d.blocking)];
  for (const m of listed) {
    assert.equal(forwardSeq[m.position - input.referenceStart], m.ref, `forward base at ${m.position}`);
    assert.notEqual(m.alt, m.ref);
  }
  assert.equal(listed.length > 0 ? request.blocking.length : 0, design.blocking.changes.length);
  design.blocking.changes.forEach((c, i) => {
    assert.equal(request.blocking[i].position, input.referenceEnd - c.gp);
    assert.equal(request.blocking[i].ref, complementBase(design.gb.genomicSequence[c.gp])); assert.equal(request.blocking[i].alt, complementBase(c.nb));
  });
});

test("reports, exports and the scheme name forward-strand coordinates for a reverse-strand gene", async () => {
  const { ref } = await hbbVariant();
  const design = designGenomicSnp(ref.genbank, { ...ref.input, blockingPolicy: blockingPolicyFor({ addBlocking: true, coDelivery: true }), deliveryMethod: "rnp" });
  const html = buildGenomicSnpReport(design);
  assert.match(html, /chr11:5227002 T→A \(forward strand; A→T on the transcript\)/);
  assert.match(html, /reverse-strand gene/);
  if (design.blocking.changes.length) assert.match(html, /[ACGT]→[ACGT] forward strand \(.+ on the transcript\)/);
  const csv = buildGenomicSequenceCsv(design, { selectedNames: design.candidates.map((c) => c.name) });
  assert.match(csv, /chr11:5227002 T>A/);
  if (design.blocking.changes.length) assert.match(csv, /forward strand \(/);
  const svg = buildDesignSchemeSvg(design);
  assert.match(svg, /reverse-strand gene, drawn along the transcript/);
  assert.match(svg, /coordinates fall left to right/);
  // The edit box is labelled with the base the drawn (transcript-strand) sequence will carry.
  assert.match(svg, />T<\/text>/);
  // A forward design carries none of this wording.
  const f = designGenomicSnp(make("chromosome:GRCh38:12:1001:2200:1"), { ...forwardInput, blockingPolicy: blockingPolicyFor({ addBlocking: true, coDelivery: true }) });
  assert.doesNotMatch(buildGenomicSnpReport(f), /reverse-strand/);
  assert.doesNotMatch(buildDesignSchemeSvg(f), /reverse-strand/);
  assert.equal("orientation" in buildSpliceCheckRequest(f), false);
});

test("an annotated gene designs the same on either strand", async () => {
  // MYD88 as fetched is forward. Read the same record as the transcript-oriented record of a reverse-strand gene occupying the same interval:
  // the variant maps to the mirrored coordinate and its alleles complement, and the design in record space must not change.
  const mine = await fetchGeneReference({ query: "MYD88", source: "ensembl", ...opts });
  const meta = readGenomicReferenceMetadata(mine.genbank);
  const mirrored = mine.genbank.replace(/Location: chromosome:GRCh38:3:\d+:\d+:1/, `Location: chromosome:GRCh38:3:${meta.start}:${meta.end}:-1`);
  assert.notEqual(mirrored, mine.genbank);
  const found = (await searchClinVar("rs387907272", opts)).variants[0];
  const base = { assembly: "GRCh38", chromosome: "3", referenceStart: meta.start, forwardConfirmed: true, deliveryMethod: "rnp", gene: "MYD88" };
  const gp = found.variant.position - meta.start;
  const policy = blockingPolicyFor({ addBlocking: true, coDelivery: true });
  const f = designGenomicSnp(mine.genbank, { ...base, position: found.variant.position, ref: found.variant.ref, alt: found.variant.alt, blockingPolicy: policy });
  const r = designGenomicSnp(mirrored, { ...base, position: meta.end - gp, ref: complementBase(found.variant.ref), alt: complementBase(found.variant.alt), blockingPolicy: policy });
  assert.equal(f.err, undefined); assert.equal(r.err, undefined);
  assert.deepEqual(shape(r), shape(f));
  assert.deepEqual(r.splice?.items.map((i) => [i.gp, i.risk]), f.splice?.items.map((i) => [i.gp, i.risk]));
  assert.equal(r.recommendation.use, f.recommendation.use);
  assert.deepEqual(r.blocking.changes.map((c) => c.gp), f.blocking.changes.map((c) => c.gp));
  assert.equal(r.input.orientation, -1);
});

test("a SpliceAI result made for a reverse-strand design attaches to it", async () => {
  // fixtures/gene-fetch/hbb-splice-check-result.json is the output of scripts/splice_check.py (SpliceAI 1.3.1, run 2026-10-16) on this design's request
  // and its 6 kb reference: the script turned the transcript-oriented record back to the forward strand and scored the gene on the reverse strand.
  const { ref } = await hbbVariant();
  const design = designGenomicSnp(ref.genbank, { ...ref.input, blockingPolicy: blockingPolicyFor({ addBlocking: true, coDelivery: true }), deliveryMethod: "rnp", fileName: ref.fileName });
  const check = JSON.parse(fs.readFileSync(path.join(here, "fixtures", "gene-fetch", "hbb-splice-check-result.json"), "utf8"));
  assert.equal(check.strand, "-"); assert.equal(check.request.orientation, -1);
  const updated = applySpliceCheck(design, check);
  assert.equal(updated.splice.external.tool, "SpliceAI");
  assert.equal(updated.splice.external.verdict, "review"); // 0.124 lies between the 0.05 and 0.2 thresholds
  assert.notEqual(updated.recommendation.use, "blockers");
  // a result made for a different edit is refused
  assert.throws(() => applySpliceCheck(design, { ...check, request: { ...check.request, edit: { ...check.request.edit, position: check.request.edit.position + 1 } } }), /different edit/);
});
