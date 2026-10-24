import { enzymeDonorCsv, enzymeDonorFasta, enzymeDonorGenbank } from "./enzymeDonorExport.js";

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function EnzymeDonorReport({ run }) {
  const design = run.donor_design;
  if (!design) return null;
  return <section aria-label="Donor design">
    <h3>Donor design · {design.status.replace(/_/g, " ")}</h3>
    {design.note && <p>{design.note}</p>}
    {design.errors?.length > 0 && <div role="alert" className="enzyme-error">{design.errors.map(error => <p key={error}>{error}</p>)}</div>}
    {!!design.donors.length && <>
      <p>Pairing: {design.co_delivery ? "one shared donor for the selected guides" : "one matched guide/donor pair at a time; do not pool the alternatives"}. Review the status and per-guide re-cutting assessment before delivery.</p>
      <button onClick={() => download(`${run.enzyme.id}-donors.csv`, enzymeDonorCsv(run))}>Export donor CSV</button>
      <button onClick={() => download(`${run.enzyme.id}-donors.fasta`, enzymeDonorFasta(run))}>Export donor FASTA</button>
      <button onClick={() => download(`${run.enzyme.id}-donors.gb`, enzymeDonorGenbank(run))}>Export donor GenBank</button>
      <p>CSV/FASTA use the selected DNA strand. GenBank uses input-sense orientation with annotated homology arms and edits. BLOCKED sequences are for troubleshooting and must not be ordered.</p>
      {design.donors.map(donor => <article key={donor.id} className="enzyme-donor">
        <h4>{donor.id} · {donor.status}</h4>
        <p>{donor.format_label} · {donor.sequence.length} bases · arms {donor.arms.five}/{donor.arms.three} bp · selected strand: {donor.strand}</p>
        <p>{donor.strand_note}</p>
        <p>Matched guides: {donor.matched_guide_ids.join(", ")}. {donor.delivery}.</p>
        <label>Donor DNA (5′→3′)<textarea aria-label={`Donor DNA ${donor.id} (5′→3′)`} readOnly rows={5} value={donor.order_sequence} spellCheck={false} /></label>
        <p>Protein check: {donor.protein_validation.valid ? "Passed" : "Failed"} · {donor.protein_validation.scope}.</p>
        <details><summary>Protein validation and edit trace</summary>
          <p>{donor.construction_note}</p>
          <p>Desired nucleotide changes: {donor.edits.filter(edit => edit.kind === "desired").length}; synonymous PAM changes: {donor.edits.filter(edit => edit.kind === "synonymous_pam").length}.</p>
          <label>Expected protein<textarea readOnly rows={3} value={donor.protein_validation.expected} /></label>
          <label>Repaired protein<textarea readOnly rows={3} value={donor.protein_validation.observed} /></label>
        </details>
        <h4>Re-cutting assessment</h4>
        {donor.guide_protection.map(check => <p key={check.guide_id}><strong>{check.guide_id}{donor.matched_guide_ids.includes(check.guide_id) ? " (matched)" : " (alternative)"}: {check.state.replace(/_/g, " ")}</strong>. {check.reason}</p>)}
        {donor.warnings.map(warning => <p key={warning} className="enzyme-notice">{warning}</p>)}
      </article>)}
    </>}
  </section>;
}
