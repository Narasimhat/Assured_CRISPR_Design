import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseGB } from "../src/designEngine.js";
import { normalizeGenBankToTranscriptModel } from "../src/transcriptModel.js";
import { listCandidates } from "../tools/ko-rank/ko_candidates.mjs";
import { rankFromEdits, toGenomicEdit, toCsv } from "../tools/ko-rank/ko_classify.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const model = normalizeGenBankToTranscriptModel(parseGB(fs.readFileSync(path.join(HERE, "fixtures", "dipk2a-region.gb"), "utf8")), {});
const payload = JSON.parse(fs.readFileSync(path.join(HERE, "fixtures", "ko-rank-dipk2a-edits.json"), "utf8"));
const rc = (s) => [...s].reverse().map((c) => ({ A: "T", C: "G", G: "C", T: "A" })[c]).join("");
const G = model.genomicSequence.toUpperCase();
const G2 = "AGTTGGTCCTAGAGATGGGA"; const EARLY = "TTTCCATTAATTGCCAAGCG"; const G1 = "TGTCAAAGCTGACGTCCAGG";

test("candidate guides: every NGG guide cutting a non-terminal coding exon is listed with a Lindel input that holds the spacer at 13..33 and the PAM after it", () => {
  const guides = listCandidates(model);
  assert.equal(guides.length, 145);
  for (const guide of guides) { assert.equal(guide.window65.length, 65); assert.equal(guide.window65.slice(13, 33), guide.spacer); assert.match(guide.window65.slice(33, 36), /^[ACGT]GG$/); }
  const strands = new Set(guides.map((g) => g.strand)); assert.deepEqual([...strands].sort(), ["+", "-"]);
  for (const sp of [G1, G2, EARLY]) assert.ok(guides.some((g) => g.spacer === sp), `${sp} is a candidate`);
});

test("class-to-genome mapping: applying each Lindel class to the record reproduces Lindel's own edited sequence, on both strands", () => {
  let checked = 0; const strands = new Set();
  for (const guide of payload.guides) {
    const winLo = guide.strand === "+" ? guide.cut - 30 : guide.cut - 35; const winHi = guide.strand === "+" ? guide.cut + 35 : guide.cut + 30;
    const window = G.slice(winLo, winHi);
    assert.equal(guide.strand === "+" ? window : rc(window), guide.window65, "the genomic window is Lindel's input");
    for (const edit of guide.edits.filter((e) => e.kind !== "ins_group").slice(0, 120)) {
      const expected = edit.kind === "ins" ? guide.window65.slice(0, 30) + edit.bases + guide.window65.slice(30)
        : guide.window65.slice(0, 30 + edit.start) + guide.window65.slice(30 + edit.start + edit.length);
      const g = toGenomicEdit(guide, edit);
      const edited = window.slice(0, g.s - winLo) + g.ins + window.slice(g.e - winLo);
      assert.equal(guide.strand === "+" ? edited : rc(edited), expected, `${guide.spacer} ${edit.k}`);
      checked += 1; strands.add(guide.strand);
    }
  }
  assert.ok(checked > 300); assert.deepEqual([...strands].sort(), ["+", "-"]);
});

test("ranking: the guide of the clones that kept protein is far weaker than a guide in the 5' half of exon 2, and the numbers match the pipeline's validated run", () => {
  const rows = rankFromEdits(model, payload); const by = Object.fromEntries(rows.map((r) => [r.spacer, r]));
  // g2: Lindel's frameshift ratio is high (84%), yet only about a third of its alleles are a predicted loss of function; the 23 clones measured at this guide
  // had 42% such alleles and 1 of 23 clones with both alleles
  assert.equal(by[G2].lindel_frameshift_pct, 84.4); assert.equal(by[G2].panel_tier, "escape");
  assert.ok(Math.abs(by[G2].predicted_LoF_allele_pct - 36.3) < 0.2, String(by[G2].predicted_LoF_allele_pct));
  assert.ok(Math.abs(by[G2].predicted_biallelic_LoF_clone_pct - 13.1) < 0.3);
  assert.equal(by[EARLY].panel_tier, "robust"); assert.equal(by[EARLY].base_pos17, "A");
  assert.ok(by[EARLY].predicted_LoF_allele_pct > 89 && by[EARLY].lindel_plus1_ins_pct > 50, JSON.stringify(by[EARLY]));
  assert.ok(Math.abs(by[G1].predicted_LoF_allele_pct - 72.7) < 0.3);
  assert.equal(rows[0].spacer, EARLY, "sorted by predicted loss-of-function alleles");
  assert.ok(by[EARLY].predicted_LoF_allele_pct > 2 * by[G2].predicted_LoF_allele_pct);
});

test("CSV output has one header and one row per guide", () => {
  const rows = rankFromEdits(model, payload); const lines = toCsv(rows).trim().split("\n");
  assert.equal(lines.length, rows.length + 1); assert.match(lines[0], /predicted_LoF_allele_pct/); assert.match(lines[0], /other_isoform_not_disrupted_pct/);
});
