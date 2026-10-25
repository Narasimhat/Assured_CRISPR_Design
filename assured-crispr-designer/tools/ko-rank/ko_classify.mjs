#!/usr/bin/env node
// Step 3 of 3: what each predicted outcome does to the protein, and the fraction of alleles that are loss of function.
//   node tools/ko-rank/ko_classify.mjs edits.json record.gb [--gene SYMBOL] > ranking.csv
// Every Lindel outcome class is mapped to the record, spliced into the coding sequence and classified by koOutcomes.js (the Assured QC engine's NMD and
// truncation rules). predicted_LoF_allele_pct is the Lindel-weighted share of outcomes that are a predicted loss of function; a clone needs both alleles
// to be, so predicted_biallelic_LoF_clone_pct is its square (alleles treated as independent). Insertions over 2 bp (a group Lindel does not resolve)
// are not classified and count as not loss of function.
import fs from "node:fs";
import { parseGB } from "../../src/designEngine.js";
import { normalizeGenBankToTranscriptModel } from "../../src/transcriptModel.js";
import { classifyEditAcrossIsoforms, assessKoGuide } from "../../src/koOutcomes.js";

const rc = (s) => [...s].reverse().map((c) => ({ A: "T", C: "G", G: "C", T: "A" })[c] || "N").join("");

/** A Lindel class (relative to the cut, in input orientation) as an edit of the record's + strand. */
export function toGenomicEdit(guide, edit) {
  const { cut, strand } = guide;
  if (edit.kind === "ins") return { s: cut, e: cut, ins: strand === "+" ? edit.bases : rc(edit.bases) };
  if (strand === "+") return { s: cut + edit.start, e: cut + edit.start + edit.length, ins: "" };
  const e = cut - edit.start; return { s: e - edit.length, e, ins: "" };
}

export function rankFromEdits(model, payload) {
  const rows = payload.guides.filter((g) => g.edits && g.edits.length).map((guide) => {
    let total = 0; let lof = 0; let clean = 0; let inframe = 0; let group = 0; let gap = 0; let plus1 = 0;
    for (const edit of guide.edits) {
      total += edit.f;
      if (edit.kind === "ins" && edit.bases.length === 1) plus1 += edit.f;
      if (edit.kind === "ins_group") { group += edit.f; continue; }
      const r = classifyEditAcrossIsoforms(model, toGenomicEdit(guide, edit));
      if (r.lof === true) lof += edit.f;
      if (r.class === "lof_nmd" && !(r.nmd && r.nmd.borderline)) clean += edit.f;
      if (r.class === "inframe" || r.class === "no_coding_effect") inframe += edit.f;
      if (r.gaps && r.gaps.length) gap += edit.f;
    }
    const tier = assessKoGuide(model, guide).tier;
    const pct = (x) => Math.round((1000 * x) / total) / 10;
    return {
      spacer: guide.spacer, strand: guide.strand, pam: guide.pam, coding_exon: guide.exonIndex, cut_after_exon_nt: guide.offset, gc_percent: guide.gc,
      base_pos17: guide.spacer[16], panel_tier: tier,
      lindel_frameshift_pct: Math.round(1000 * guide.lindelFrameshift) / 10, lindel_plus1_ins_pct: pct(plus1),
      predicted_LoF_allele_pct: pct(lof), predicted_clear_NMD_allele_pct: pct(clean), predicted_in_frame_pct: pct(inframe), ge3bp_insertion_group_pct: pct(group),
      other_isoform_not_disrupted_pct: pct(gap), predicted_biallelic_LoF_clone_pct: Math.round((lof / total) ** 2 * 1000) / 10,
    };
  });
  rows.sort((a, b) => b.predicted_LoF_allele_pct - a.predicted_LoF_allele_pct || b.gc_percent - a.gc_percent);
  return rows;
}

export const toCsv = (rows) => { const head = Object.keys(rows[0] || {}); return [head.join(","), ...rows.map((r) => head.map((h) => r[h]).join(","))].join("\n") + "\n"; };

if (import.meta.url === `file://${process.argv[1]}`) {
  const [editsFile, recordFile] = process.argv.slice(2); const geneAt = process.argv.indexOf("--gene");
  if (!editsFile || !recordFile) { console.error("usage: ko_classify.mjs edits.json record.gb [--gene SYMBOL]"); process.exit(2); }
  const model = normalizeGenBankToTranscriptModel(parseGB(fs.readFileSync(recordFile, "utf8")), { expectedGene: geneAt > 0 ? process.argv[geneAt + 1] : undefined });
  const rows = rankFromEdits(model, JSON.parse(fs.readFileSync(editsFile, "utf8")));
  process.stdout.write(toCsv(rows));
}
