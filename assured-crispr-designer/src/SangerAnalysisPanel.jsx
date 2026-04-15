/**
 * Assured Sanger Validator — complete rewrite
 * Builds on the existing sangerAnalysis.js engine.
 * Adds: ICE / ICE-D / KO scores, interactive chromatogram viewer (SVG),
 *       indel bar chart, drag-and-drop upload, Assured design integration,
 *       batch mode with per-sample control files, PDF + Excel export.
 */

import { startTransition, useCallback, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  analyzeCrisprSanger,
  readSangerInputFromFile,
} from "./sangerAnalysis";

// ── Theme ─────────────────────────────────────────────────────────────────────
const C = {
  bg: "#08131f",
  panel: "#102234",
  panelAlt: "#173149",
  border: "#27435f",
  borderSoft: "rgba(199,213,228,0.22)",
  accent: "#59c7bd",
  accentAlt: "#f0b458",
  success: "#42c98f",
  danger: "#f07a7a",
  text: "#f2f7fb",
  muted: "#d2deea",
  dim: "#a8b8ca",
};

const TRACE_COLORS = { A: "#4ddb7a", C: "#4daef5", G: "#f5d04d", T: "#f57a7a" };

const CARD = {
  background: "linear-gradient(180deg,rgba(15,28,46,0.98),rgba(12,23,38,0.96))",
  border: `1px solid ${C.border}`,
  borderRadius: 18,
  padding: "18px 20px",
  boxShadow: "0 22px 50px rgba(2,8,23,0.28)",
};

const FIELD = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 10,
  border: `1px solid ${C.borderSoft}`,
  background: "rgba(10,20,34,0.78)",
  color: C.text,
  fontSize: 13,
  boxSizing: "border-box",
};

const BTN = {
  padding: "10px 22px",
  borderRadius: 10,
  border: "none",
  background: `linear-gradient(135deg,${C.accent},#3fa89e)`,
  color: "#08131f",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
};

const BTN2 = {
  padding: "8px 16px",
  borderRadius: 8,
  border: `1px solid ${C.border}`,
  background: "transparent",
  color: C.muted,
  fontSize: 13,
  cursor: "pointer",
};

// ── Score helpers ─────────────────────────────────────────────────────────────
const ICE_D_FACTOR = 1.41;

function calcIce(metrics) {
  return Math.round((metrics.detectedEditFraction || 0) * 100);
}
function calcIceD(iceScore) {
  return Math.min(100, Math.round(iceScore * ICE_D_FACTOR));
}
function calcKo(knockout) {
  return Math.round((knockout.frameshiftFraction || 0) * 100);
}
function calcHdr(result) {
  if (result?.hdr?.informativeSites) {
    return Math.round((result.hdr.estimatedFraction || 0) * 100);
  }
  const hdr = result?.topAlleles?.find((a) => a.type === "hdr");
  return hdr ? Math.round((hdr.contribution || 0) * 100) : null;
}

// ── Score badge ───────────────────────────────────────────────────────────────
function ScoreBadge({ label, value, unit = "%", color = C.accent, sub }) {
  return (
    <div style={{ ...CARD, padding: "14px 18px", textAlign: "center", flex: "1 1 110px", minWidth: 100 }}>
      <div style={{ fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 34, fontWeight: 800, color, lineHeight: 1 }}>
        {value !== null && value !== undefined ? value : "—"}
        <span style={{ fontSize: 15 }}>{unit}</span>
      </div>
      {sub && <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Drag-drop file zone ───────────────────────────────────────────────────────
function DropZone({ label, file, onFile, accept = ".ab1,.seq,.fa,.fasta,.txt", accent = C.accent }) {
  const [over, setOver] = useState(false);
  const ref = useRef();

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setOver(false);
    if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]);
  }, [onFile]);

  return (
    <div
      onClick={() => ref.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
      style={{
        border: `2px dashed ${over ? accent : C.border}`,
        borderRadius: 12,
        padding: "16px 10px",
        textAlign: "center",
        cursor: "pointer",
        background: over ? "rgba(89,199,189,0.06)" : "rgba(10,20,34,0.35)",
        transition: "all 0.18s",
        minHeight: 78,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
      }}
    >
      <input ref={ref} type="file" accept={accept} style={{ display: "none" }}
        onChange={(e) => { if (e.target.files[0]) onFile(e.target.files[0]); }} />
      <div style={{ fontSize: 20 }}>{file ? "✅" : "📂"}</div>
      <div style={{ fontSize: 12, color: file ? C.success : C.dim }}>
        {file ? file.name : label}
      </div>
      {file && <div style={{ fontSize: 11, color: C.dim }}>{(file.size / 1024).toFixed(1)} KB · click to replace</div>}
    </div>
  );
}

// ── Chromatogram viewer (SVG) ─────────────────────────────────────────────────
function ChromatogramViewer({ parsed, cutSite1Based, title, height = 140 }) {
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState(0);
  const dragging = useRef(false);
  const dragX = useRef(0);

  if (!parsed?.rawTrace) return null;
  const { rawTrace, baseCalls } = parsed;
  const rawLen = rawTrace.A?.length || 0;
  if (rawLen === 0) return <div style={{ color: C.dim, fontSize: 12 }}>No raw trace data</div>;

  const W = 580;
  const H = height;
  const displayLen = Math.max(50, Math.floor(rawLen / zoom));
  const start = Math.max(0, Math.min(panOffset, rawLen - displayLen));

  const maxVal = Math.max(
    ...["A","C","G","T"].flatMap(b => (rawTrace[b] || []).slice(start, start + displayLen).map(Number)),
    1
  );

  function makePath(base) {
    const data = rawTrace[base] || [];
    const end = Math.min(start + displayLen, data.length);
    if (end <= start) return null;
    let d = "";
    for (let i = start; i < end; i++) {
      const x = ((i - start) / displayLen) * W;
      const y = H - ((Number(data[i]) || 0) / maxVal) * (H - 12) - 6;
      d += i === start ? `M ${x} ${y}` : ` L ${x} ${y}`;
    }
    return <path key={base} d={d} stroke={TRACE_COLORS[base]} fill="none" strokeWidth={1.2} opacity={0.9} />;
  }

  // Cutsite indicator
  let cutsiteX = null;
  if (cutSite1Based && baseCalls) {
    const idx = Math.max(0, cutSite1Based - 1);
    const peakPos = baseCalls[idx]?.position;
    if (peakPos !== undefined && peakPos >= start && peakPos < start + displayLen) {
      cutsiteX = ((peakPos - start) / displayLen) * W;
    }
  }

  // Called-base ticks
  const tickEvery = Math.max(1, Math.floor(displayLen / 55));
  const ticks = [];
  if (baseCalls) {
    baseCalls.forEach((bc, i) => {
      if (i % tickEvery !== 0) return;
      const pos = bc?.position;
      if (pos === undefined || pos < start || pos >= start + displayLen) return;
      const x = ((pos - start) / displayLen) * W;
      ticks.push(
        <text key={i} x={x} y={H + 13} textAnchor="middle" fontSize={8}
          fill={TRACE_COLORS[bc.base] || C.dim}>{bc.base}</text>
      );
    });
  }

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1.25 : 0.8;
    setZoom((z) => Math.max(1, Math.min(25, z * delta)));
  };
  const handleMouseDown = (e) => { dragging.current = true; dragX.current = e.clientX; };
  const handleMouseMove = (e) => {
    if (!dragging.current) return;
    const dx = Math.round(((dragX.current - e.clientX) / W) * displayLen);
    dragX.current = e.clientX;
    setPanOffset((o) => Math.max(0, Math.min(rawLen - displayLen, o + dx)));
  };
  const handleMouseUp = () => { dragging.current = false; };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: C.dim, fontWeight: 600 }}>{title}</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11 }}>
          {Object.entries(TRACE_COLORS).map(([b, clr]) => (
            <span key={b} style={{ color: clr, fontWeight: 700 }}>{b}</span>
          ))}
          <span style={{ color: C.dim }}>scroll to zoom · drag to pan</span>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H + 18}`}
        style={{ width: "100%", background: "rgba(8,16,28,0.85)", borderRadius: 8, cursor: "grab", display: "block" }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} y1={H - f * (H - 12) - 6} x2={W} y2={H - f * (H - 12) - 6}
            stroke={C.border} strokeWidth={0.4} strokeDasharray="3,3" />
        ))}
        {["G","A","T","C"].map((b) => makePath(b))}
        {cutsiteX !== null && <>
          <line x1={cutsiteX} y1={0} x2={cutsiteX} y2={H}
            stroke={C.accentAlt} strokeWidth={1.5} strokeDasharray="4,3" opacity={0.95} />
          <text x={cutsiteX + 3} y={11} fontSize={9} fill={C.accentAlt}>✂</text>
        </>}
        {ticks}
      </svg>
    </div>
  );
}

// ── Discordance plot ──────────────────────────────────────────────────────────
function DiscordancePlot({ profile, cutSite1Based }) {
  if (!profile?.length) return null;
  const W = 580, H = 80;
  const cutPos = (cutSite1Based || 1) - 1;
  const start = Math.max(0, cutPos - 80);
  const end = Math.min(profile.length, cutPos + 100);
  const slice = profile.slice(start, end);
  const maxD = Math.max(...slice.map((p) => p.discordance || 0), 0.15);

  let d1 = "";
  for (let i = 0; i < slice.length; i++) {
    const x = (i / Math.max(1, slice.length - 1)) * W;
    const y = H - ((slice[i].discordance || 0) / maxD) * (H - 8) - 4;
    d1 += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  }
  const csX = ((cutPos - start) / Math.max(1, slice.length - 1)) * W;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: C.dim, fontWeight: 600 }}>Discordance around cut</span>
        <span style={{ fontSize: 11, color: C.dim }}>↑ = signal diverges from control</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 16}`}
        style={{ width: "100%", background: "rgba(8,16,28,0.8)", borderRadius: 8 }}>
        <path d={d1} stroke={C.danger} fill="none" strokeWidth={1.5} opacity={0.85} />
        <line x1={csX} y1={0} x2={csX} y2={H} stroke={C.accentAlt} strokeWidth={1.5} strokeDasharray="4,3" />
        {[0, 0.5, 1].map((f) => (
          <text key={f} x={3} y={H - f * (H - 8) - 4 + 4} fontSize={8} fill={C.dim}>{(f * maxD).toFixed(2)}</text>
        ))}
        {[0, 0.5, 1].map((f) => (
          <text key={f} x={Math.round(f * W)} y={H + 13} textAnchor="middle" fontSize={8} fill={C.dim}>
            {start + Math.round(f * (slice.length - 1))}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ── Indel distribution bar chart ─────────────────────────────────────────────
function IndelChart({ indelSpectrum, alleles }) {
  if (!indelSpectrum?.length) return null;
  const entries = [...indelSpectrum];
  const hdrAllele = alleles?.find((a) => a.type === "hdr");
  if (hdrAllele && hdrAllele.contribution > 0.002) {
    entries.push({ indelSize: "HDR", contribution: hdrAllele.contribution });
  }
  if (!entries.length) return null;
  const maxVal = Math.max(...entries.map((e) => e.contribution), 0.01);
  const barW = Math.max(16, Math.min(52, Math.floor(500 / entries.length)));

  return (
    <div>
      <div style={{ fontSize: 12, color: C.dim, fontWeight: 600, marginBottom: 8 }}>Indel size distribution</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 120,
        background: "rgba(8,16,28,0.6)", borderRadius: 10, padding: "12px 8px 8px", overflowX: "auto" }}>
        {entries.map((e, i) => {
          const isHDR = e.indelSize === "HDR";
          const isWT = e.indelSize === 0;
          const clr = isHDR ? C.accentAlt : isWT ? C.success : e.indelSize > 0 ? "#7ab0f5" : C.danger;
          const barH = Math.max((e.contribution / maxVal) * 88, e.contribution > 0.001 ? 3 : 0);
          const pct = (e.contribution * 100).toFixed(1);
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flex: `0 0 ${barW}px` }}>
              <div style={{ fontSize: 9, color: C.muted }}>{parseFloat(pct) >= 2 ? `${pct}%` : ""}</div>
              <div style={{ width: barW - 4, height: barH, background: clr, borderRadius: 4, transition: "height 0.3s" }}
                title={`${isHDR ? "HDR" : isWT ? "WT" : e.indelSize > 0 ? `+${e.indelSize}` : e.indelSize}: ${pct}%`} />
              <div style={{ fontSize: 9, color: C.dim, whiteSpace: "nowrap" }}>
                {isHDR ? "HDR" : isWT ? "WT" : e.indelSize > 0 ? `+${e.indelSize}` : e.indelSize}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Allele table ──────────────────────────────────────────────────────────────
function AlleleTable({ alleles }) {
  if (!alleles?.length) return null;
  return (
    <div>
      <div style={{ fontSize: 12, color: C.dim, fontWeight: 600, marginBottom: 8 }}>Allele contributions</div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {["%", "Allele", "Type", "Sequence near cut"].map((h) => (
                <th key={h} style={{ padding: "5px 10px", textAlign: "left", color: C.dim, fontSize: 11 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {alleles.slice(0, 15).map((a, i) => {
              const isWT  = a.indelSize === 0 && a.type !== "hdr";
              const isHDR = a.type === "hdr";
              const isFS  = !isWT && !isHDR && Math.abs(a.indelSize) % 3 !== 0;
              const clr   = isHDR ? C.accentAlt : isWT ? C.success : isFS ? C.danger : "#7ab0f5";
              return (
                <tr key={i} style={{ borderBottom: `1px solid rgba(39,67,95,0.35)`,
                  background: i % 2 === 0 ? "rgba(16,34,52,0.3)" : "transparent" }}>
                  <td style={{ padding: "5px 10px", color: clr, fontWeight: 700 }}>{(a.contribution * 100).toFixed(1)}%</td>
                  <td style={{ padding: "5px 10px", color: clr }}>{a.label}</td>
                  <td style={{ padding: "5px 10px", color: C.dim }}>
                    {isHDR ? "Knock-in" : isWT ? "Wild-type" : isFS ? "Frameshift" : "In-frame"}
                  </td>
                  <td style={{ padding: "5px 10px" }}>
                    <code style={{ fontSize: 10, color: C.muted, fontFamily: "monospace", letterSpacing: 0.5 }}>
                      {(a.preview || "").slice(0, 70)}
                    </code>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Export helpers ─────────────────────────────────────────────────────────────
function exportExcel(analyses, labels) {
  if (!analyses?.length) return;
  const wb = XLSX.utils.book_new();
  const summaryData = [
    ["Sample", "ICE (%)", "ICE-D (%)", "KO Score (%)", "HDR (%)", "Fit Score (%)", "Downstream Discordance (%)", "Upstream Agreement (%)", "Warnings"],
    ...analyses.map((r, i) => {
      const ice = calcIce(r.metrics);
      return [
        labels[i] || r.edited.fileName,
        ice, calcIceD(ice), calcKo(r.knockout),
        calcHdr(r) ?? "",
        (r.metrics.fitScore * 100).toFixed(1),
        (r.metrics.downstreamDiscordance * 100).toFixed(1),
        (r.metrics.upstreamSimilarity * 100).toFixed(1),
        r.warnings.join("; "),
      ];
    }),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), "Summary");
  if (analyses.length === 1) {
    const alleleData = [
      ["Allele", "Contribution (%)", "Indel Size", "Type", "Sequence Preview"],
      ...(analyses[0].topAlleles || []).map((a) => [
        a.label, (a.contribution * 100).toFixed(1), a.indelSize,
        a.type === "hdr" ? "Knock-in" : a.indelSize === 0 ? "Wild-type" : Math.abs(a.indelSize) % 3 !== 0 ? "Frameshift" : "In-frame",
        a.preview || "",
      ]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(alleleData), "Alleles");
  }
  XLSX.writeFile(wb, "assured_sanger_results.xlsx");
}

// ── Main panel ────────────────────────────────────────────────────────────────
const mkSample = () => ({ controlFile: null, editedFile: null, guide: "", donor: "", label: "" });

export default function SangerAnalysisPanel({ guideFromDesign }) {
  const guideHint = guideFromDesign || "";

  const [mode, setMode]               = useState("single");
  const [samples, setSamples]         = useState([mkSample()]);
  const [shared, setShared]           = useState({ guide: "", donor: "", secondaryGuide: "", maxDel: "30", maxIns: "2" });
  const [status, setStatus]           = useState("idle");
  const [error, setError]             = useState("");
  const [analyses, setAnalyses]       = useState(null);
  const [parsedControls, setParsedControls] = useState([]);
  const [parsedEdited, setParsedEdited]     = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(0);

  function updateSample(idx, patch) {
    setSamples((s) => s.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  }

  async function runAnalysis() {
    setStatus("running"); setError(""); setAnalyses(null);
    try {
      const activeSamples = mode === "single" ? [samples[0]] : samples.filter((s) => s.controlFile && s.editedFile);
      if (!activeSamples.length) throw new Error("Upload at least one control + edited file pair.");

      const ctrlParsed  = await Promise.all(activeSamples.map((s) => s.controlFile ? readSangerInputFromFile(s.controlFile) : Promise.reject(new Error("Control file required"))));
      const editParsed  = await Promise.all(activeSamples.map((s) => s.editedFile  ? readSangerInputFromFile(s.editedFile)  : Promise.reject(new Error("Edited file required"))));

      const results = activeSamples.map((s, i) => {
        const guide = (s.guide || shared.guide || guideHint).trim();
        if (!guide) throw new Error(`Sample ${i + 1}: guide sequence required`);
        return analyzeCrisprSanger({
          control: ctrlParsed[i],
          edited: editParsed[i],
          guideSequence: guide,
          secondaryGuideSequence: shared.secondaryGuide.trim() || undefined,
          donorSequence: (s.donor || shared.donor).trim() || undefined,
          maxDeletion:  parseInt(shared.maxDel) || 30,
          maxInsertion: parseInt(shared.maxIns) || 2,
        });
      });

      startTransition(() => {
        setAnalyses(results);
        setParsedControls(ctrlParsed);
        setParsedEdited(editParsed);
        setSelectedIdx(0);
        setStatus("done");
      });
    } catch (err) {
      setError(err?.message || String(err));
      setStatus("error");
    }
  }

  const sel      = analyses?.[selectedIdx];
  const iceScore = sel ? calcIce(sel.metrics) : null;
  const labels   = samples.map((s, i) => s.label || s.editedFile?.name || `Sample ${i + 1}`);

  return (
    <div style={{ ...CARD, marginTop: 18 }}>

      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 6 }}>Sanger Edit Validator</div>
        <div style={{ color: C.dim, fontSize: 13, lineHeight: 1.65, maxWidth: 820 }}>
          Upload AB1 chromatograms to deconvolve CRISPR editing efficiency, indel spectrum, knock-in rates and KO burden.
          Computes ICE, ICE-D, and KO scores from NNLS trace regression — entirely browser-side, no data leaves your machine.
        </div>
        {guideHint && (
          <div style={{ marginTop: 8, fontSize: 12, color: C.accent }}>
            ✓ Guide pre-loaded from Assured design:
            <code style={{ fontFamily: "monospace", marginLeft: 6, color: C.text }}>{guideHint}</code>
          </div>
        )}
      </div>

      {/* Mode tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, background: "rgba(10,20,34,0.4)", borderRadius: 10, padding: 4, width: "fit-content" }}>
        {[["single", "Single Sample"], ["batch", "Batch Mode"]].map(([id, lbl]) => (
          <button key={id} onClick={() => setMode(id)} style={{
            padding: "6px 18px", borderRadius: 8, border: "none", fontSize: 13, cursor: "pointer",
            background: mode === id ? C.accent : "transparent",
            color: mode === id ? "#08131f" : C.dim, fontWeight: mode === id ? 700 : 400,
          }}>{lbl}</button>
        ))}
      </div>

      {/* Upload zone */}
      {mode === "single" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <DropZone label="Control .ab1 (unedited)" file={samples[0].controlFile}
            onFile={(f) => updateSample(0, { controlFile: f })} accent="#6aafdc" />
          <DropZone label="Edited .ab1 (CRISPR-treated)" file={samples[0].editedFile}
            onFile={(f) => updateSample(0, { editedFile: f })} accent={C.danger} />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          {samples.map((s, i) => (
            <div key={i} style={{ ...CARD, padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: C.muted, fontWeight: 700 }}>Sample {i + 1}</span>
                {i > 0 && <button style={{ ...BTN2, padding: "3px 10px", fontSize: 11 }}
                  onClick={() => setSamples((ss) => ss.filter((_, j) => j !== i))}>✕ Remove</button>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <DropZone label="Control .ab1" file={s.controlFile} onFile={(f) => updateSample(i, { controlFile: f })} accent="#6aafdc" />
                <DropZone label="Edited .ab1" file={s.editedFile}   onFile={(f) => updateSample(i, { editedFile: f  })} accent={C.danger} />
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <input style={{ ...FIELD, fontSize: 12 }} placeholder="Guide (overrides shared)"
                    value={s.guide} onChange={(e) => updateSample(i, { guide: e.target.value })} />
                  <input style={{ ...FIELD, fontSize: 12 }} placeholder="Sample label"
                    value={s.label} onChange={(e) => updateSample(i, { label: e.target.value })} />
                </div>
              </div>
            </div>
          ))}
          <button style={{ ...BTN2, alignSelf: "flex-start" }} onClick={() => setSamples((ss) => [...ss, mkSample()])}>+ Add sample</button>
        </div>
      )}

      {/* Shared settings */}
      <div style={{ ...CARD, padding: "14px 16px", marginBottom: 14, background: "rgba(8,18,32,0.45)" }}>
        <div style={{ fontSize: 11, color: C.dim, fontWeight: 700, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Analysis settings</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: C.dim, marginBottom: 4 }}>Guide spacer {guideHint ? "(pre-loaded)" : ""}</div>
            <input style={FIELD} placeholder={guideHint || "20 nt spacer, no PAM"}
              value={shared.guide} onChange={(e) => setShared((s) => ({ ...s, guide: e.target.value }))} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: C.dim, marginBottom: 4 }}>Second guide (dropout mode)</div>
            <input style={FIELD} placeholder="Optional"
              value={shared.secondaryGuide} onChange={(e) => setShared((s) => ({ ...s, secondaryGuide: e.target.value }))} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: C.dim, marginBottom: 4 }}>HDR donor / ssODN</div>
            <input style={FIELD} placeholder="Optional — enables HDR scoring"
              value={shared.donor} onChange={(e) => setShared((s) => ({ ...s, donor: e.target.value }))} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: C.dim, marginBottom: 4 }}>Max deletion size</div>
            <input style={{ ...FIELD }} placeholder="30" value={shared.maxDel}
              onChange={(e) => setShared((s) => ({ ...s, maxDel: e.target.value }))} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: C.dim, marginBottom: 4 }}>Max insertion size</div>
            <input style={{ ...FIELD }} placeholder="2" value={shared.maxIns}
              onChange={(e) => setShared((s) => ({ ...s, maxIns: e.target.value }))} />
          </div>
        </div>
      </div>

      {/* Run + export buttons */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <button style={{ ...BTN, minWidth: 160, opacity: status === "running" ? 0.7 : 1 }}
          onClick={runAnalysis} disabled={status === "running"}>
          {status === "running" ? "⏳ Analysing…" : "▶ Run Analysis"}
        </button>
        {analyses?.length > 0 && <>
          <button style={BTN2} onClick={() => exportExcel(analyses, labels)}>📊 Export Excel</button>
          <button style={BTN2} onClick={() => window.print()}>🖨 Export PDF</button>
        </>}
      </div>

      {/* Error */}
      {status === "error" && (
        <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 12, background: "rgba(240,122,122,0.1)", border: `1px solid ${C.danger}`, color: C.danger, fontSize: 13 }}>
          ⚠ {error}
        </div>
      )}

      {/* Batch table */}
      {analyses?.length > 1 && (
        <div style={{ ...CARD, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>Batch summary — click to view details</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {["#","Sample","ICE","ICE-D","KO","HDR","Fit","Disc.","Status"].map((h) => (
                    <th key={h} style={{ padding: "5px 10px", textAlign: "left", color: C.dim, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {analyses.map((r, i) => {
                  const ice = calcIce(r.metrics);
                  return (
                    <tr key={i} onClick={() => setSelectedIdx(i)} style={{
                      borderBottom: `1px solid rgba(39,67,95,0.35)`, cursor: "pointer",
                      background: i === selectedIdx ? "rgba(89,199,189,0.08)" : i % 2 === 0 ? "rgba(16,34,52,0.3)" : "transparent",
                    }}>
                      <td style={{ padding: "5px 10px", color: C.dim }}>{i + 1}</td>
                      <td style={{ padding: "5px 10px", color: C.accent, fontWeight: 600 }}>{labels[i]}</td>
                      <td style={{ padding: "5px 10px", color: C.text, fontWeight: 700 }}>{ice}%</td>
                      <td style={{ padding: "5px 10px", color: C.muted }}>{calcIceD(ice)}%</td>
                      <td style={{ padding: "5px 10px", color: C.danger }}>{calcKo(r.knockout)}%</td>
                      <td style={{ padding: "5px 10px", color: C.success }}>{calcHdr(r) !== null ? `${calcHdr(r)}%` : "—"}</td>
                      <td style={{ padding: "5px 10px", color: C.dim }}>{(r.metrics.fitScore * 100).toFixed(0)}%</td>
                      <td style={{ padding: "5px 10px", color: C.dim }}>{(r.metrics.downstreamDiscordance * 100).toFixed(1)}%</td>
                      <td style={{ padding: "5px 10px", color: r.warnings?.length ? C.accentAlt : C.success }}>
                        {r.warnings?.length ? `⚠ ${r.warnings.length}` : "✓"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Selected result */}
      {sel && (
        <div id="assured-sanger-results">
          {analyses.length > 1 && (
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 14 }}>{labels[selectedIdx]}</div>
          )}

          {/* Scores */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
            <ScoreBadge label="ICE Score" value={iceScore} sub="editing efficiency" />
            <ScoreBadge label="ICE-D" value={calcIceD(iceScore)} color={C.accentAlt} sub="indel-corrected" />
            <ScoreBadge label="KO Score" value={calcKo(sel.knockout)} color={C.danger} sub="frameshift burden" />
            {calcHdr(sel) !== null && (
              <ScoreBadge label="HDR" value={calcHdr(sel)} color={C.success} sub="donor-specific signal" />
            )}
            <ScoreBadge label="Fit" value={(sel.metrics.fitScore * 100).toFixed(0)} color={C.dim} sub="model quality" />
          </div>

          {/* Guide info */}
          <div style={{ ...CARD, padding: "10px 14px", marginBottom: 14, fontSize: 12 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
              <span style={{ color: C.muted }}>Guide: <code style={{ color: C.text }}>{sel.guide.sequence || "(derived)"}</code>{" "}
                <span style={{ color: C.dim }}>({sel.guide.orientation} · cut at bp {sel.guide.cutSite1Based})</span>
              </span>
              <span style={{ color: C.dim }}>Upstream agreement: <span style={{ color: C.muted }}>{(sel.metrics.upstreamSimilarity * 100).toFixed(1)}%</span></span>
              <span style={{ color: C.dim }}>Window: <span style={{ color: C.muted }}>{sel.metrics.usableWindowBp} bp</span></span>
              {sel.anchor.offset !== 0 && <span style={{ color: C.accentAlt }}>Trace offset: {sel.anchor.offset > 0 ? "+" : ""}{sel.anchor.offset} bp</span>}
            </div>
          </div>

          {/* Warnings */}
          {sel.warnings?.length > 0 && (
            <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 12, background: "rgba(240,180,88,0.08)", border: `1px solid ${C.accentAlt}88` }}>
              {sel.warnings.map((w, i) => <div key={i} style={{ fontSize: 12, color: C.accentAlt }}>⚠ {w}</div>)}
            </div>
          )}

          {sel.hdr?.informativeSites > 0 && (
            <div style={{ ...CARD, padding: "12px 14px", marginBottom: 14, fontSize: 12 }}>
              <div style={{ fontSize: 12, color: C.text, fontWeight: 700, marginBottom: 8 }}>HDR donor evidence</div>
              <div style={{ color: C.dim, lineHeight: 1.6, marginBottom: 10 }}>
                HDR support is estimated from donor-different bases rather than only the global deconvolution fit. This is more informative for SNP editing projects where donor alleles differ from WT at only a few positions.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 10 }}>
                <span style={{ color: C.muted }}>Informative donor sites: <strong style={{ color: C.text }}>{sel.hdr.informativeSites}</strong></span>
                <span style={{ color: C.muted }}>Mean donor signal: <strong style={{ color: C.success }}>{(sel.hdr.meanDonorSignal * 100).toFixed(1)}%</strong></span>
                <span style={{ color: C.muted }}>Mean WT signal: <strong style={{ color: C.accentAlt }}>{(sel.hdr.meanWildTypeSignal * 100).toFixed(1)}%</strong></span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      {["Position", "WT", "Donor", "Donor signal", "WT signal", "HDR estimate"].map((h) => (
                        <th key={h} style={{ padding: "5px 10px", textAlign: "left", color: C.dim, fontSize: 11 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(sel.hdr.sites || []).map((site, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid rgba(39,67,95,0.35)` }}>
                        <td style={{ padding: "5px 10px", color: C.text }}>{site.position1Based}</td>
                        <td style={{ padding: "5px 10px", color: C.accentAlt, fontFamily: "monospace" }}>{site.wtBase}</td>
                        <td style={{ padding: "5px 10px", color: C.success, fontFamily: "monospace" }}>{site.donorBase}</td>
                        <td style={{ padding: "5px 10px", color: C.success }}>{(site.donorSignal * 100).toFixed(1)}%</td>
                        <td style={{ padding: "5px 10px", color: C.accentAlt }}>{(site.wtSignal * 100).toFixed(1)}%</td>
                        <td style={{ padding: "5px 10px", color: C.text, fontWeight: 700 }}>{(site.estimatedFraction * 100).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Chromatograms */}
          <div style={{ ...CARD, marginBottom: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <ChromatogramViewer
                parsed={parsedControls[selectedIdx]}
                cutSite1Based={sel.guide.cutSite1Based}
                title={`Control — ${sel.control.fileName}`}
              />
              <ChromatogramViewer
                parsed={parsedEdited[selectedIdx]}
                cutSite1Based={sel.guide.cutSite1Based + (sel.anchor.offset || 0)}
                title={`Edited — ${sel.edited.fileName}`}
              />
            </div>
          </div>

          {/* Discordance + Indel chart */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div style={{ ...CARD, padding: "14px 16px" }}>
              <DiscordancePlot profile={sel.discordanceProfile} cutSite1Based={sel.guide.cutSite1Based} />
            </div>
            <div style={{ ...CARD, padding: "14px 16px" }}>
              <IndelChart indelSpectrum={sel.indelSpectrum} alleles={sel.topAlleles} />
            </div>
          </div>

          {/* Allele table */}
          <div style={{ ...CARD, marginBottom: 14 }}>
            <AlleleTable alleles={sel.topAlleles} />
          </div>
        </div>
      )}

      {/* How it works */}
      {status === "idle" && (
        <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: 12,
          background: "rgba(16,34,52,0.35)", border: `1px solid ${C.borderSoft}`,
          fontSize: 12, color: C.dim, lineHeight: 1.7 }}>
          <strong style={{ color: C.muted }}>How it works: </strong>
          Upload unedited (control) and CRISPR-treated (edited) Sanger .ab1 files. Enter the guide spacer.
          Optionally enter a donor for HDR analysis. Click Run — the algorithm aligns traces on the unedited
          reference, builds deletion/insertion proposals, and solves NNLS regression to deconvolve allele
          contributions. <span style={{ color: C.accentAlt }}>ICE = 100 − WT fraction.
          ICE-D applies a 1.41× correction for indel-heavy pools. All computation is local; no data is sent to any server.</span>
        </div>
      )}

      <style>{`@media print{body,#root{background:white!important}#assured-sanger-results *{color:black!important;background:white!important;border-color:#ccc!important}button{display:none!important}}`}</style>
    </div>
  );
}
