import { useState } from "react";
import { ENZYMES, getEnzyme } from "./enzymeConfig.js";
import { designEnzymeGuides } from "./enzymeGuides.js";
import { enzymeGuideCsv, enzymeGuideGenbank } from "./enzymeGuideExport.js";
import { casOffinderInput } from "./enzymeOffTargets.js";
import "./enzymeGuides.css";
import EnzymeDonorReport from "./EnzymeDonorReport.jsx";

function download(name, text, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function EnzymeGuideTool({ initialRun = null, reportOnly = false }) {
  const [enzyme, setEnzyme] = useState(initialRun?.enzyme.id || "mad7");
  const [sequence, setSequence] = useState("");
  const [length, setLength] = useState(23);
  const [delivery, setDelivery] = useState("rnp");
  const [repeat, setRepeat] = useState("");
  const [source, setSource] = useState("");
  const [verified, setVerified] = useState(false);
  const [filters, setFilters] = useState({ ...getEnzyme("mad7").filters });
  const [exclusions, setExclusions] = useState("");
  const [genomePath, setGenomePath] = useState("");
  const [mismatches, setMismatches] = useState(3);
  const [run, setRun] = useState(initialRun);
  const [error, setError] = useState("");
  const config = getEnzyme(enzyme);
  const invalidate = () => { setRun(null); setError(""); };
  function generate(event) {
    event.preventDefault();
    try {
      const intervals = exclusions.trim() ? exclusions.trim().split(/\n/).map(line => {
        const [start, end, ...label] = line.trim().split(/\s+/);
        return { start: Number(start), end: Number(end), label: label.join(" ") };
      }) : [];
      setRun(designEnzymeGuides(sequence, { enzyme, spacerLength: length, delivery, directRepeat: repeat,
        repeatSource: source, repeatVerified: verified, exclusions: intervals, filters }));
      setError("");
    } catch (failure) { setError(failure.message); setRun(null); }
  }
  function exportOffinder() {
    try { download(`${enzyme}-cas-offinder.txt`, casOffinderInput(run, genomePath, mismatches)); setError(""); }
    catch (failure) { setError(failure.message); }
  }
  return <section className="enzyme-guides">
    <h2>{reportOnly ? `${config.name} · ${run?.modification?.label}` : "Advanced sequence scan"}</h2>
    {reportOnly ? <>
      <p>{run.reference.gene} · {run.reference.transcript_id || "Transcript not recorded"} · {run.reference.source}</p>
      <p className="enzyme-notice">{run.modification.note}</p>
      <p>{run.modification.target_boundary === null ? "Guides within the selected coding segments." : `Target boundary: ${run.modification.target_boundary}; at least one predicted strand cut within ${run.modification.search_radius} bp.`} Return to Workspace to change the reference, enzyme or modification.</p>
      {run.reference.reference_issues.map((issue, index) => <p key={index}>{issue.message}</p>)}
      {config.license_note && <p className="enzyme-notice">{config.license_note}</p>}
    </> : <p>For gene fetch, GenBank uploads and guide/donor design, choose the enzyme and modification in Workspace. This advanced tool only scans a complete pasted sequence.</p>}
    {!reportOnly && <form onSubmit={generate} onChange={invalidate}>
      <div className="enzyme-fields">
        <label>Enzyme<select aria-label="Enzyme" value={enzyme} onChange={event => {
          const next = getEnzyme(event.target.value);
          setEnzyme(next.id); setLength(next.spacer_len.default); setRepeat(next.direct_repeat || ""); setVerified(false); setSource("");
        }}>{Object.values(ENZYMES).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Spacer length<input type="number" min={config.spacer_len.min} max={config.spacer_len.max} required value={length} onChange={e => setLength(Number(e.target.value))} /></label>
        <label>Delivery<select aria-label="Delivery" value={delivery} onChange={e => setDelivery(e.target.value)}><option value="rnp">Synthetic RNA / RNP</option><option value="poliii">U6 / Pol III</option></select></label>
      </div>
      <p>PAM: {config.pam_pattern} ({config.pam_side === "5prime" ? "5′" : "3′"}); config v{config.version}. Cut positions are predictions and can vary experimentally.</p>
      {config.license_note && <p className="enzyme-notice">{config.license_note}</p>}
      <label>Reference DNA or single-record FASTA<textarea required rows={6} value={sequence} onChange={e => setSequence(e.target.value)} spellCheck={false} /></label>
      {config.pam_side === "5prime" && <fieldset><legend>Full crRNA assembly</legend>
        <p>{config.repeat_note}</p>
        <label>5′ direct repeat (RNA or DNA)<input value={repeat} onChange={e => { setRepeat(e.target.value); setVerified(false); }} spellCheck={false} /></label>
        <label>Documentation reference and version<input value={source} onChange={e => { setSource(e.target.value); setVerified(false); }} /></label>
        <label className="enzyme-check"><input type="checkbox" checked={verified} disabled={!repeat.trim() || !source.trim()} onChange={e => setVerified(e.target.checked)} />I verified this repeat against the documentation for my nuclease.</label>
        <p>Full crRNA is emitted only after this verification. Specificity and experimental review remain required.</p>
      </fieldset>}
      <details><summary>Filters and exclusion intervals</summary>
        <div className="enzyme-fields">{Object.entries({ gc_min: "Minimum GC %", gc_max: "Maximum GC %", max_homopolymer: "Maximum homopolymer (0 disables)", self_complement_length: "Complementary arm length (0 disables)" }).map(([key, label]) =>
          <label key={key}>{label}<input type="number" min="0" max="100" value={filters[key]} onChange={e => setFilters({ ...filters, [key]: Number(e.target.value) })} /></label>)}</div>
        <label>SNP/repeat exclusions: start end label, one per line (0-based half-open, input reference)<textarea rows={3} value={exclusions} onChange={e => setExclusions(e.target.value)} /></label>
        <p>TTTT is excluded for Pol III delivery. Composition and complementary-arm filters are screens, not predictions of activity.</p>
      </details>
      <button type="submit">Find guides</button>
    </form>}
    {error && <p role="alert" className="enzyme-error">{error}</p>}
    {run && <div aria-live="polite">
      <h3>{run.status} · {run.candidates.filter(guide => guide.qc.passed).length} passing / {run.candidates.length} candidates</h3>
      <p>{run.created_at} · {run.coordinate_system}. Genome-wide specificity has not been checked.</p>
      <p>{enzyme === "mad7" ? "Mad7 model scores are approximate Cas12a proxies when supplied. " : ""}Scores are unavailable until a validated activity model is configured.</p>
      <div><button onClick={() => download(`${enzyme}-guides.csv`, enzymeGuideCsv(run), "text/csv")}>Export CSV</button>
        <button onClick={() => download(`${enzyme}-guides.gb`, enzymeGuideGenbank(run))}>Export GenBank</button>
        <button onClick={() => download(`${enzyme}-run.json`, JSON.stringify(run, null, 2), "application/json")}>Export run JSON</button></div>
      <div className="enzyme-table"><table><caption>First 200 candidates; exports contain all candidates, including filter failures.</caption><thead><tr>{["Strand / site", "PAM", "Spacer (5′→3′)", "Cuts (target / non-target)", "GC", "Filters", "Score", "Full crRNA (RNA, 5′→3′)"].map(title => <th key={title} scope="col">{title}</th>)}</tr></thead>
        <tbody>{run.candidates.slice(0, 200).map(guide => <tr key={guide.id}>
          <td>{guide.strand} [{guide.start}, {guide.end})<br /><code>{guide.id}</code>{run.donor_design?.selected_guide_ids.includes(guide.id) && <div>Selected for donor design</div>}</td><td>{guide.pam}</td><td><code>{guide.spacer}</code></td>
          <td>{guide.cuts.target} / {guide.cuts.non_target}</td><td>{guide.gc.toFixed(1)}%</td><td>{guide.qc.passed ? "Pass" : guide.qc.reasons.join(", ")}</td>
          <td>{guide.score.value ?? "Unavailable"}{guide.score.approximate && " (approximate)"}</td><td><code>{guide.full_crrna || "Unavailable"}</code></td>
        </tr>)}</tbody></table></div>
      <EnzymeDonorReport run={run} />
      <h3>Genome off-target search</h3>
      <p>Export input for a locally installed Cas-OFFinder, then use the repository CLI to run it against your assembly and report top hits. The browser does not run a genome search.</p>
      <div className="enzyme-fields"><label>Genome FASTA path on the search machine<input value={genomePath} onChange={e => setGenomePath(e.target.value)} /></label>
        <label>Maximum mismatches<input type="number" min="0" max="6" value={mismatches} onChange={e => setMismatches(Number(e.target.value))} /></label></div>
      <button onClick={exportOffinder}>Export Cas-OFFinder input</button>
    </div>}
  </section>;
}
