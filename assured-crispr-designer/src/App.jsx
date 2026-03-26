import { useCallback, useMemo, useState } from "react";
import { CASSETTES, runDesign } from "./designEngine";

const COLORS = {
  bg: "#07111c",
  panel: "#0f1c2e",
  panelAlt: "#14243b",
  border: "#213754",
  accent: "#2dd4bf",
  accentAlt: "#f59e0b",
  success: "#34d399",
  danger: "#fb7185",
  text: "#e5eef7",
  muted: "#93a7bd",
  dim: "#5f748c",
};

const PROJECT_TYPES = [
  { id: "pm", label: "Point mutation", short: "SNP / amino-acid change" },
  { id: "ko", label: "Knockout", short: "Frameshift knockout" },
  { id: "ct", label: "C-terminal tag / reporter", short: "HDR insert at stop" },
  { id: "nt", label: "N-terminal tag / reporter", short: "HDR insert at ATG" },
];

const FIELD_STYLE = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: `1px solid ${COLORS.border}`,
  background: COLORS.panelAlt,
  color: COLORS.text,
  fontSize: 13,
  boxSizing: "border-box",
};

const CARD_STYLE = {
  background: COLORS.panel,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 18,
  padding: 18,
};

function sanitizeSegment(value, fallback) {
  const clean = value.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/\s+/g, " ").trim();
  return clean || fallback;
}

function getProjectTypeMeta(projectType) {
  return PROJECT_TYPES.find((item) => item.id === projectType) || PROJECT_TYPES[0];
}

function buildProjectFolderName(meta) {
  const irisId = sanitizeSegment(meta.irisId, "IRIS");
  const clientId = sanitizeSegment(meta.clientId, "CLIENT");
  const gene = sanitizeSegment(meta.gene, "GENE");
  const edit = sanitizeSegment(meta.editSummary, "Genome edit");
  const cellLine = sanitizeSegment(meta.cellLine, "CELL-LINE");
  return `${irisId} (${clientId}) - ${gene} ${edit} in ${cellLine}`;
}

function formatDesignLabel(meta, result) {
  if (!result) return "";
  if (result.type === "pm") return `${result.gene} p.${result.wA}${result.an}${result.mA}`;
  if (result.type === "ko") return `${result.gene} knockout`;
  return `${result.gene} ${result.type === "ct" ? "C-terminal" : "N-terminal"} ${result.tag}`;
}

function buildDesignSummary(result) {
  if (!result) return "";
  const lines = [];
  lines.push(`Design: ${result.type === "pm" ? `${result.gene} p.${result.wA}${result.an}${result.mA}` : formatDesignLabel({ projectType: result.type }, result)}`);
  if (result.type === "pm") lines.push(`Codon: ${result.wC} -> ${result.mC}`);
  if (result.type === "ko") lines.push(`Target exon: ${result.exon}`);
  if (result.type === "ct" || result.type === "nt") lines.push(`Donor length: ${result.dl} bp`);
  lines.push("");
  lines.push("gRNAs:");
  result.gs.forEach((guide) => lines.push(`- ${guide.n}: ${guide.sp} ${guide.pm} | ${guide.str} strand | GC ${guide.gc}%`));
  if (result.ss?.length) {
    lines.push("");
    lines.push("Silent mutations:");
    result.ss.forEach((mutation) => lines.push(`- gRNA${mutation.gi}: ${mutation.lb} (${mutation.oc} -> ${mutation.nc}) | ${mutation.pur}`));
  }
  lines.push("");
  lines.push("Validation primers:");
  result.ps.forEach((primer) => lines.push(`- ${primer.n}: ${primer.s}`));
  if (result.amp) lines.push(`Expected amplicon: ${result.amp}`);
  return lines.join("\n");
}

function buildGeneInfoRows(meta, result, fileName) {
  if (!result) return [];
  return [
    ["Gene", meta.gene || result.gene],
    ["Design class", getProjectTypeMeta(meta.projectType).label],
    ["Target", meta.editSummary || formatDesignLabel(meta, result)],
    ["Cell line", meta.cellLine || "n/a"],
    ["Protein / CDS", result.prot ? `${result.prot} aa` : "n/a"],
    ["Reference file", fileName || "Uploaded GenBank"],
  ];
}

function buildGuideRows(result) {
  return (result?.gs || []).map((guide) => [guide.n, `${guide.sp} ${guide.pm}`, `${guide.str} strand`, `${guide.gc}%`, guide.arm || guide.note || ""]);
}

function buildPrimerRows(result) {
  return (result?.ps || []).map((primer) => [primer.n, primer.s]);
}

function buildSsOdnNotes(result) {
  if (!result || result.type !== "pm") return [];
  const desired = result.ch.map((change, index) => `Desired edit ${index + 1}: genomic position ${change.p + 1}, ${change.w}->${change.m}`);
  const silent = (result.ss || []).map((entry) => `gRNA${entry.gi}: ${entry.lb} (${entry.oc} -> ${entry.nc}) | ${entry.pur}`);
  return desired.concat(silent);
}

function tableHtml(rows, header = false) {
  return rows.map((row) => `<tr>${row.map((cell, index) => header ? `<th style="padding:8px 10px;border:1px solid #bbbbbb;background:#2E75B6;color:#ffffff;text-align:left;">${cell}</th>` : `<td style="padding:8px 10px;border:1px solid #bbbbbb;vertical-align:top;${index === 0 ? "background:#F0F4F8;font-weight:700;width:220px;" : "background:#FFFFFF;"}">${cell}</td>`).join("")}</tr>`).join("");
}

function buildReportHtml(meta, result, fileName) {
  if (!result) return "";
  const headerRows = [
    ["Group", meta.clientName || "n/a"],
    ["IRIS ID", meta.irisId || "[to be assigned]"],
    ["Mutation / edit", meta.editSummary || formatDesignLabel(meta, result)],
    ["Cell line", meta.cellLine || "n/a"],
  ];
  const geneRows = buildGeneInfoRows(meta, result, fileName);
  const guideRows = buildGuideRows(result);
  const primerRows = buildPrimerRows(result);
  const ssOdnNotes = buildSsOdnNotes(result);
  const donorBlock = result.type === "pm"
    ? (result.os || []).map((donor) => `
        <h3 style="color:#2E75B6;margin:18px 0 8px 0;">${donor.n} (${donor.sl})</h3>
        <p style="font-family:Consolas,monospace;font-size:13px;margin:0 0 6px 0;"><strong style="color:#888;">WT 5'-</strong> ${donor.wo} <strong style="color:#888;">-3'</strong></p>
        <p style="font-family:Consolas,monospace;font-size:13px;margin:0 0 10px 0;"><strong style="color:#888;">ssODN 5'-</strong> ${donor.od} <strong style="color:#888;">-3'</strong></p>
      `).join("")
    : `<p style="font-family:Consolas,monospace;font-size:13px;word-break:break-all;">${result.donor || ""}</p>`;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${formatDesignLabel(meta, result)}</title>
<style>
body{font-family:Calibri,Arial,sans-serif;margin:24px;color:#333}
h1{font-size:24px;margin:18px 0 4px 0}
h2{font-size:18px;margin:20px 0 10px 0;color:#1f2937}
h3{font-size:15px}
table{border-collapse:collapse;width:100%;margin:8px 0 14px 0}
p{font-size:13px;line-height:1.45}
.sub{color:#555;font-size:13px}
.note{color:#555;font-style:italic}
</style>
</head>
<body>
  <table>${tableHtml(headerRows)}</table>
  <h1>Design: ${formatDesignLabel(meta, result)}</h1>
  <p class="sub">${meta.notes || "Strategy document generated by ASSURED CRISPR Designer."}</p>
  <h2>1. Gene Information</h2>
  <table>${tableHtml(geneRows)}</table>
  <h2>2. gRNA Sequences</h2>
  <table>${tableHtml([["Name", "Sequence", "Strand", "GC", "Notes"]], true)}${tableHtml(guideRows)}</table>
  <h2>3. Validation Primers</h2>
  <table>${tableHtml([["Name", "Sequence"]], true)}${tableHtml(primerRows)}</table>
  <p class="sub">Expected amplicon: ${result.amp || "n/a"}</p>
  <h2>4. ${result.type === "pm" ? "ssODN Donor Templates" : "Donor Design"}</h2>
  <p class="note">${result.type === "pm" ? "WT and donor templates are listed together for review." : "HDR donor sequence is listed in full below."}</p>
  ${donorBlock}
  ${ssOdnNotes.length ? `<div>${ssOdnNotes.map((line) => `<p style="color:#CC0000;font-weight:700;margin:6px 0;">${line}</p>`).join("")}</div>` : ""}
  <h2>5. Additional Info</h2>
  <p>${buildDesignSummary(result).replace(/\n/g, "<br/>")}</p>
</body>
</html>`;
}

function Badge({ children, color = COLORS.accent }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, color, background: `${color}12`, border: `1px solid ${color}33` }}>{children}</span>;
}

function SectionTitle({ children }) {
  return <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.8, color: COLORS.accent, textTransform: "uppercase", marginBottom: 10 }}>{children}</div>;
}

function Grid({ children }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>{children}</div>;
}

function SequenceDiffRow({ label, sequence, diffIndexes, mode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ color: "#667085", fontSize: 11, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "Consolas, monospace", fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
        {sequence.split("").map((base, index) => {
          const changed = diffIndexes.includes(index);
          return (
            <span
              key={`${label}-${index}`}
              style={{
                color: changed ? (mode === "wt" ? "#CC0000" : "#111827") : "#111827",
                background: changed && mode === "donor" ? "#FFF59D" : "transparent",
                textDecoration: changed && mode === "wt" ? "line-through" : "none",
                fontWeight: changed ? 800 : 400,
              }}
            >
              {base}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function AnnotatedDonor({ sequence, annotations = [] }) {
  const findAnnotation = (index) => annotations.find((item) => index >= item.start && index < item.end);
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        {annotations.map((item) => <Badge key={`${item.label}-${item.start}`} color={item.color}>{item.label} ({item.end - item.start} bp)</Badge>)}
      </div>
      <div style={{ fontFamily: "Consolas, monospace", fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
        {sequence.split("").map((base, index) => {
          const annotation = findAnnotation(index);
          return <span key={`donor-${index}`} style={{ color: annotation?.color || "#111827", fontWeight: annotation ? 700 : 400 }}>{base}</span>;
        })}
      </div>
    </div>
  );
}

export default function App() {
  const [projectType, setProjectType] = useState("pm");
  const [gbRaw, setGbRaw] = useState("");
  const [fileName, setFileName] = useState("");
  const [mutation, setMutation] = useState("");
  const [tag, setTag] = useState("SD40-2xHA");
  const [homologyArm, setHomologyArm] = useState("250");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [debug, setDebug] = useState("");
  const [copyState, setCopyState] = useState("");
  const [meta, setMeta] = useState({
    irisId: "",
    clientId: "",
    clientName: "",
    requester: "",
    gene: "",
    cellLine: "",
    editSummary: "",
    notes: "",
    projectType: "pm",
  });

  const cassetteOptions = useMemo(() => Object.keys(CASSETTES).filter((key) => !key.startsWith("N:")), []);
  const folderName = useMemo(() => buildProjectFolderName(meta), [meta]);
  const reportHtml = useMemo(() => buildReportHtml(meta, result, fileName), [meta, result, fileName]);

  const updateMeta = (key, value) => setMeta((current) => ({ ...current, [key]: value }));

  const onFile = useCallback((event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setError("");
    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const content = readerEvent.target?.result || "";
      setGbRaw(content);
      setDebug(`Loaded ${file.name} (${content.length} characters).`);
      setMeta((current) => (current.gene ? current : { ...current, gene: file.name.replace(/\.[^.]+$/, "") }));
    };
    reader.onerror = () => setError("Failed to read the GenBank file.");
    reader.readAsText(file);
  }, []);

  const run = () => {
    setError("");
    setResult(null);
    setCopyState("");
    const design = runDesign(projectType, gbRaw, mutation, tag, homologyArm);
    if (design.err) {
      setError(design.err);
      setDebug(design.dbg || "");
      return;
    }
    setDebug(design.dbg || "");
    setResult(design);
  };

  const copyText = async (value, label) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState(`${label} copied.`);
    } catch (copyError) {
      setCopyState(`Copy failed: ${copyError.message}`);
    }
  };

  const downloadReport = () => {
    if (!reportHtml) return;
    const blob = new Blob([reportHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${folderName || "crispr_design_report"}.html`;
    link.click();
    URL.revokeObjectURL(url);
    setCopyState("HTML report downloaded.");
  };

  const projectTypeMeta = getProjectTypeMeta(projectType);

  return (
    <div style={{ minHeight: "100vh", background: `radial-gradient(circle at top, #16314d 0%, ${COLORS.bg} 42%)`, color: COLORS.text, fontFamily: '"Segoe UI", "Helvetica Neue", sans-serif' }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 18px 40px" }}>
        <div style={{ ...CARD_STYLE, marginBottom: 18, background: "linear-gradient(135deg, rgba(45,212,191,0.14), rgba(245,158,11,0.10))" }}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg, #2dd4bf, #f59e0b)", color: "#07111c", display: "grid", placeItems: "center", fontWeight: 800 }}>AC</div>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>ASSURED CRISPR Designer</div>
                  <div style={{ color: COLORS.muted, fontSize: 14 }}>Final design document output for SNPs, knockouts, tags, and reporters.</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Badge>{Object.keys(CASSETTES).length} cassette options</Badge>
                <Badge color={COLORS.accentAlt}>Report-style preview</Badge>
                <Badge color={COLORS.success}>HTML export for Word</Badge>
              </div>
            </div>
            <div style={{ maxWidth: 360, color: COLORS.muted, fontSize: 13, lineHeight: 1.5 }}>
              This version is focused on producing the final design document after the edit is designed, following the same structured format as your APOE strategy example.
            </div>
          </div>
        </div>

        <Grid>
          <div style={CARD_STYLE}>
            <SectionTitle>1. IRIS Intake</SectionTitle>
            <Grid>
              <label><div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>IRIS request ID</div><input value={meta.irisId} onChange={(event) => updateMeta("irisId", event.target.value)} style={FIELD_STYLE} placeholder="72860" /></label>
              <label><div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Client ID</div><input value={meta.clientId} onChange={(event) => updateMeta("clientId", event.target.value)} style={FIELD_STYLE} placeholder="72668" /></label>
              <label><div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Client name</div><input value={meta.clientName} onChange={(event) => updateMeta("clientName", event.target.value)} style={FIELD_STYLE} placeholder="Internal / sponsor name" /></label>
              <label><div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Requester</div><input value={meta.requester} onChange={(event) => updateMeta("requester", event.target.value)} style={FIELD_STYLE} placeholder="Scientist or team" /></label>
              <label><div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Gene / locus</div><input value={meta.gene} onChange={(event) => updateMeta("gene", event.target.value)} style={FIELD_STYLE} placeholder="APOE" /></label>
              <label><div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Cell line</div><input value={meta.cellLine} onChange={(event) => updateMeta("cellLine", event.target.value)} style={FIELD_STYLE} placeholder="BIHi005-A" /></label>
            </Grid>
            <label style={{ display: "block", marginTop: 12 }}><div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Requested edit summary</div><input value={meta.editSummary} onChange={(event) => updateMeta("editSummary", event.target.value)} style={FIELD_STYLE} placeholder="APOE2 (p.Arg176Cys) SNP knockin" /></label>
            <label style={{ display: "block", marginTop: 12 }}><div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Notes / assumptions</div><textarea value={meta.notes} onChange={(event) => updateMeta("notes", event.target.value)} style={{ ...FIELD_STYLE, minHeight: 90, resize: "vertical" }} placeholder="Transcript assumptions, strand notes, delivery mode, client constraints..." /></label>
            <div style={{ marginTop: 14, padding: 12, background: COLORS.panelAlt, borderRadius: 12, border: `1px solid ${COLORS.border}` }}><div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Suggested project title</div><div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.4 }}>{folderName}</div></div>
          </div>

          <div style={CARD_STYLE}>
            <SectionTitle>2. Edit Design</SectionTitle>
            <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
              {PROJECT_TYPES.map((item) => (
                <button key={item.id} type="button" onClick={() => { setProjectType(item.id); updateMeta("projectType", item.id); }} style={{ textAlign: "left", padding: "12px 14px", borderRadius: 12, border: `1px solid ${projectType === item.id ? COLORS.accent : COLORS.border}`, background: projectType === item.id ? "rgba(45,212,191,0.10)" : COLORS.panelAlt, color: COLORS.text, cursor: "pointer" }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>{item.label}</div>
                  <div style={{ color: COLORS.muted, fontSize: 12 }}>{item.short}</div>
                </button>
              ))}
            </div>

            <label style={{ display: "block", marginBottom: 12 }}>
              <div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Reference GenBank</div>
              <label style={{ ...FIELD_STYLE, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                <span style={{ color: fileName ? COLORS.success : COLORS.muted }}>{fileName || "Upload .gb / .gbk / .genbank"}</span>
                <span style={{ color: COLORS.accent, fontWeight: 700 }}>Browse</span>
                <input type="file" accept=".gb,.gbk,.genbank,.txt" onChange={onFile} style={{ display: "none" }} />
              </label>
            </label>

            {projectType === "pm" && <label style={{ display: "block", marginBottom: 12 }}><div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Mutation</div><input value={mutation} onChange={(event) => setMutation(event.target.value)} style={FIELD_STYLE} placeholder="R176C" /></label>}
            {(projectType === "ct" || projectType === "nt") && (
              <Grid>
                <label><div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Cassette</div><select value={tag} onChange={(event) => setTag(event.target.value)} style={FIELD_STYLE}>{cassetteOptions.map((option) => <option key={option} value={option}>{option} ({CASSETTES[option].len} bp)</option>)}</select></label>
                <label><div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Homology arm</div><select value={homologyArm} onChange={(event) => setHomologyArm(event.target.value)} style={FIELD_STYLE}><option value="250">250 bp</option><option value="500">500 bp</option><option value="750">750 bp</option></select></label>
              </Grid>
            )}

            <button type="button" onClick={run} style={{ marginTop: 12, width: "100%", padding: "12px 14px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #2dd4bf, #f59e0b)", color: "#07111c", fontWeight: 800, cursor: "pointer" }}>Generate {projectTypeMeta.label} design</button>
            {error && <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "rgba(251,113,133,0.10)", border: `1px solid ${COLORS.danger}55`, color: COLORS.danger }}>{error}</div>}
            {debug && <div style={{ marginTop: 12, color: COLORS.dim, fontSize: 12, lineHeight: 1.5 }}>{debug}</div>}
          </div>
        </Grid>

        <div style={{ ...CARD_STYLE, marginTop: 18 }}>
          <SectionTitle>3. Final Report</SectionTitle>
          <div style={{ color: COLORS.muted, fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>This export is modeled on your APOE strategy document. Download the HTML file and open it in Word if you want to save it as a `.docx` document afterward.</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
            <button type="button" disabled={!reportHtml} onClick={downloadReport} style={{ ...FIELD_STYLE, width: "auto", cursor: reportHtml ? "pointer" : "not-allowed", fontWeight: 700 }}>Download HTML report</button>
            <button type="button" disabled={!result} onClick={() => copyText(buildDesignSummary(result), "Design summary")} style={{ ...FIELD_STYLE, width: "auto", cursor: result ? "pointer" : "not-allowed", fontWeight: 700 }}>Copy design summary</button>
            {copyState && <Badge color={COLORS.success}>{copyState}</Badge>}
          </div>

          <div style={{ padding: 14, borderRadius: 12, background: "#f8fafc", color: "#333", border: "1px solid #d7dee7", minHeight: 380 }}>
            {!result && <div style={{ color: "#667085" }}>Run a design to populate the final report preview.</div>}
            {result && (
              <>
                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
                  <tbody>
                    {[
                      ["Group", meta.clientName || "n/a"],
                      ["IRIS ID", meta.irisId || "[to be assigned]"],
                      ["Mutation / edit", meta.editSummary || formatDesignLabel(meta, result)],
                      ["Cell line", meta.cellLine || "n/a"],
                    ].map(([label, value]) => (
                      <tr key={label}>
                        <td style={{ width: 180, padding: "8px 10px", border: "1px solid #bbbbbb", background: "#F0F4F8", fontWeight: 700 }}>{label}</td>
                        <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff" }}>{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>Design: {formatDesignLabel(meta, result)}</div>
                <div style={{ color: "#555", fontSize: 13, marginBottom: 16 }}>{meta.notes || "Final strategy report preview."}</div>

                <div style={{ fontSize: 18, fontWeight: 700, margin: "14px 0 8px 0" }}>1. Gene Information</div>
                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
                  <tbody>
                    {buildGeneInfoRows(meta, result, fileName).map(([label, value]) => (
                      <tr key={label}>
                        <td style={{ width: 180, padding: "8px 10px", border: "1px solid #bbbbbb", background: "#F0F4F8", fontWeight: 700 }}>{label}</td>
                        <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff" }}>{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ fontSize: 18, fontWeight: 700, margin: "14px 0 8px 0" }}>2. gRNA Sequences</div>
                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
                  <thead>
                    <tr>{["Name", "Sequence", "Strand", "GC", "Notes"].map((label) => <th key={label} style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#2E75B6", color: "#ffffff", textAlign: "left" }}>{label}</th>)}</tr>
                  </thead>
                  <tbody>
                    {buildGuideRows(result).map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`} style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff", fontFamily: cellIndex === 1 ? "Consolas, monospace" : "inherit" }}>{cell}</td>)}</tr>)}
                  </tbody>
                </table>

                <div style={{ fontSize: 18, fontWeight: 700, margin: "14px 0 8px 0" }}>3. Validation Primers</div>
                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
                  <thead>
                    <tr>{["Name", "Sequence"].map((label) => <th key={label} style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#2E75B6", color: "#ffffff", textAlign: "left" }}>{label}</th>)}</tr>
                  </thead>
                  <tbody>
                    {buildPrimerRows(result).map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`} style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff", fontFamily: cellIndex === 1 ? "Consolas, monospace" : "inherit" }}>{cell}</td>)}</tr>)}
                  </tbody>
                </table>
                <div style={{ color: "#555", fontSize: 13, marginBottom: 16 }}>Expected amplicon: {result.amp || "n/a"}</div>

                <div style={{ fontSize: 18, fontWeight: 700, margin: "14px 0 8px 0" }}>4. {result.type === "pm" ? "ssODN Donor Templates" : "Donor Design"}</div>
                {result.type === "pm" && (result.os || []).map((donor) => (
                  <div key={donor.n} style={{ marginBottom: 14 }}>
                    <div style={{ fontWeight: 700, color: "#2E75B6", marginBottom: 6 }}>{donor.n} ({donor.sl})</div>
                    <SequenceDiffRow label="WT" sequence={donor.wo} diffIndexes={donor.df} mode="wt" />
                    <SequenceDiffRow label="ssODN" sequence={donor.od} diffIndexes={donor.df} mode="donor" />
                  </div>
                ))}
                {result.type !== "pm" && <AnnotatedDonor sequence={result.donor} annotations={result.donorAnnotations} />}
                {buildSsOdnNotes(result).map((line) => <div key={line} style={{ color: "#CC0000", fontWeight: 700, marginTop: 6 }}>{line}</div>)}

                <div style={{ fontSize: 18, fontWeight: 700, margin: "14px 0 8px 0" }}>5. Additional Info</div>
                <div style={{ fontSize: 13, color: "#333", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{buildDesignSummary(result)}</div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
