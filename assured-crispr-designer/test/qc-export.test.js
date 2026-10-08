// QC hand-off: the exported design must describe the same edit the engine designed, in its own coordinates.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { runDesign } from "../src/designEngine.js";
import { QC_SPEC_SCHEMA, buildQcDesignSpec } from "../src/qcExport.js";

const fixture = (name) => readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", name), "utf8");
const revcomp = (seq) => [...seq].reverse().map((base) => ({ A: "T", C: "G", G: "C", T: "A" }[base])).join("");
const CASES = {
  nr2f2_block: ["ct", "nr2f2-ng016753.gb", "", "GGGGS3-SD40-GGGGS-V5", "", { expectedGene: "NR2F2", donorFormat: "auto", autoTrimArms: true }],
  nr2f2_ssodn: ["ct", "nr2f2-ng016753.gb", "", "2xHA-only", "", { expectedGene: "NR2F2", donorFormat: "auto", autoTrimArms: true }],
  nr2f2_opposite: ["ct", "nr2f2-ng016753.gb", "", "2xHA-only", "", { expectedGene: "NR2F2", donorFormat: "auto", autoTrimArms: true, customGuides: ["CAGTTTTAACTGGCCGTATA", "ATTTATTGAATTGCCATATA"] }],
  tagme_nt: ["nt", "synthetic-tagging.gb", "", "N:EGFP-Linker", "", { expectedGene: "TAGME", donorFormat: "auto", autoTrimArms: true }],
  tagme_it: ["it", "synthetic-tagging.gb", "F50", "SPOT", 250, { expectedGene: "TAGME" }],
  apoe_snp: ["pm", "apoe-r154s.gb", "R176C", "", 250, { expectedGene: "APOE", deliveryMethod: "rnp", coDeliveryBlocking: true }],
  tagme_ko: ["ko", "synthetic-tagging.gb", "", "", 400, { expectedGene: "TAGME" }],
};
const exportCase = (key) => {
  const [type, file, mutation, tag, arm, options] = CASES[key];
  const result = runDesign(type, fixture(file), mutation, tag, arm, options);
  assert.equal(result.err, undefined, result.err);
  return { result, spec: buildQcDesignSpec(result) };
};

test("every design type exports a self-consistent hand-off", () => {
  for (const key of Object.keys(CASES)) {
    const { spec } = exportCase(key);
    assert.equal(spec.err, undefined, `${key}: ${spec.err}`);
    assert.equal(spec.schema, QC_SPEC_SCHEMA);
    const window = spec.reference.sequence;
    // guides sit where they say, 3 bp from the PAM
    spec.guides.forEach((guide) => {
      const site = window.slice(guide.protospacerStart, guide.protospacerEnd);
      assert.equal(site, guide.strand === "+" ? guide.spacer : revcomp(guide.spacer), `${key} guide ${guide.index}`);
      assert.equal(guide.cut, guide.strand === "+" ? guide.protospacerEnd - 3 : guide.protospacerStart + 3);
    });
    // every marker is a real base difference and every donor difference outside the insert is a marker
    spec.markers.forEach((marker) => assert.equal(window[marker.pos], marker.ref, `${key} marker ${marker.pos}`));
    spec.primers.forEach((primer) => {
      const site = window.slice(primer.start, primer.end);
      assert.equal(site, primer.strand === "+" ? primer.sequence : revcomp(primer.sequence), `${key} primer ${primer.name}`);
    });
    spec.amplicons.forEach((amplicon) => {
      const fw = spec.primers.find((primer) => primer.name === amplicon.forward);
      const rv = spec.primers.find((primer) => primer.name === amplicon.reverse);
      assert.equal(amplicon.wtBp, rv.end - fw.start);
    });
  }
});

test("NR2F2 SD40-V5: block donor, two blocking changes, edited amplicon 841 bp", () => {
  const { result, spec } = exportCase("nr2f2_block");
  assert.deepEqual([spec.design.editKind, spec.donors.length, spec.donors[0].format, spec.donors[0].sequence.length], ["tag_large", 1, "block", 613]);
  assert.equal(spec.donors[0].sequence, result.donor);
  assert.deepEqual(spec.donors[0].refEnd - spec.donors[0].refStart, 250 + 3 + 150, "arms plus the replaced stop codon");
  assert.deepEqual(spec.markers.map((marker) => [marker.ref, marker.alt, marker.role, marker.guide]), [["G", "C", "blocking", 1], ["G", "T", "blocking", 2]]);
  assert.equal(spec.guides[1].cut - spec.guides[0].cut, 29);
  assert.deepEqual([spec.amplicons[0].wtBp, spec.amplicons[0].editedBp[spec.donors[0].name]], [631, 841]);
  assert.equal(spec.reference.sequence, result.gb.genomicSequence.slice(spec.reference.offset, spec.reference.offset + spec.reference.sequence.length).toUpperCase());
});

test("APOE R176C: the SNP is the intended marker, the silent changes are blocking, each ssODN is a donor", () => {
  const { result, spec } = exportCase("apoe_snp");
  assert.deepEqual([spec.design.editKind, spec.donors.length], ["snp", 2]);
  const roles = spec.markers.map((marker) => marker.role);
  assert.deepEqual([roles.filter((role) => role === "intended").length, roles.filter((role) => role === "blocking").length], [1, 4]);
  const snp = spec.markers.find((marker) => marker.role === "intended");
  assert.deepEqual([snp.ref, snp.alt], ["C", "T"]);
  assert.equal(spec.reference.offset + snp.pos, result.gp, "the intended base is the design's edited base");
  spec.donors.forEach((donor) => assert.equal(donor.refEnd - donor.refStart, donor.sequence.length));
  assert.deepEqual(spec.guides.map((guide) => guide.strand), ["-", "-"]);
});

test("internal tag and N-terminal designs place the insert", () => {
  const it = exportCase("tagme_it");
  assert.equal(it.spec.donors[0].insertBp, 33);
  assert.equal(it.spec.donors[0].sequence.length - it.spec.donors[0].insertBp, it.spec.donors[0].refEnd - it.spec.donors[0].refStart);
  const designed = [...new Set(it.result.ss.map((change) => change.gp))].sort((x, y) => x - y);
  assert.deepEqual(it.spec.markers.map((marker) => marker.pos + it.spec.reference.offset), designed, "markers are the engine's blocking changes, nothing more");
  it.spec.donors.forEach((donor) => assert.equal(donor.sequence.slice(donor.insertStart - donor.refStart, donor.insertStart - donor.refStart + 33), it.result.os[0].insertSequence, "the insert sits where the spec says"));
  const nt = exportCase("tagme_nt");
  assert.deepEqual([nt.spec.design.editKind, nt.spec.donors[0].replacedBp, nt.spec.amplicons[0].editedBp[nt.spec.donors[0].name] - nt.spec.amplicons[0].wtBp], ["reporter", 3, 747]);
});

test("the opposite-strand pair keeps both guides' strands and the ssODN strands", () => {
  const { spec } = exportCase("nr2f2_opposite");
  assert.deepEqual(spec.guides.map((guide) => guide.strand), ["+", "-"]);
  assert.deepEqual(spec.donors[0].orderStrands.map((entry) => entry.strand), ["antisense", "sense"]);
});

test("a knockout design exports the deletion between its cuts", () => {
  const { spec } = exportCase("tagme_ko");
  assert.deepEqual([spec.design.editKind, spec.donors.length, spec.markers.length], ["deletion", 0, 0]);
  assert.equal(spec.amplicons[0].editedBp.deletion, spec.amplicons[0].wtBp - (spec.guides[1].cut - spec.guides[0].cut));
});

test("nothing to export without a design", () => {
  assert.ok(buildQcDesignSpec(null).err);
  assert.ok(buildQcDesignSpec({ err: "x" }).err);
  assert.ok(buildQcDesignSpec({ type: "ct", gene: "X", gb: {} }).err);
});
