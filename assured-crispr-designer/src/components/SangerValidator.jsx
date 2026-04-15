/**
 * Assured Sanger Validator
 * Full ICE-like Sanger sequencing analysis component, integrated into
 * the Assured CRISPR Designer app.
 *
 * Features:
 *  • AB1 drag-and-drop / file picker (control + edited pairs)
 *  • Batch mode with multiple sample pairs
 *  • Guide sequence input (pre-populated from Assured design if available)
 *  • Optional donor/ssODN for HDR analysis
 *  • Interactive chromatogram viewer (4-channel SVG, zoom, pan, cutsite line)
 *  • Discordance plot
 *  • Indel distribution bar chart
 *  • Allele contribution table with sequence view
 *  • PDF export via browser print + Excel export via xlsx
 *  • Full responsive layout matching the Assured dark theme
 */

import { useCallback, useRef, useState } from 'react';
import { utils as xlsxUtils, write as xlsxWrite } from 'xlsx';
import { parseAb1File } from '../sangerAnalysis/ab1Parser.js';
import { analyzeIce, analyzeBatch } from '../sangerAnalysis/iceCore.js';

// ── Theme (matches App.jsx) ───────────────────────────────────────────────────
const C = {
  bg:         '#08131f',
  panel:      '#102234',
  panelAlt:   '#173149',
  border:     '#27435f',
  borderSoft: 'rgba(199,213,228,0.22)',
  accent:     '#59c7bd',
  accentAlt:  '#f0b458',
  success:    '#42c98f',
  danger:     '#f07a7a',
  text:       '#f2f7fb',
  muted:      '#d2deea',
  dim:        '#a8b8ca',
};

const TRACE_COLORS = { A: '#4ddb7a', C: '#4daef5', G: '#f5d04d', T: '#f57a7a' };

const card = {
  background: 'linear-gradient(180deg,rgba(15,28,46,0.98),rgba(12,23,38,0.96))',
  border: `1px solid ${C.border}`,
  borderRadius: 18,
  padding: '18px 20px',
  boxShadow: '0 22px 50px rgba(2,8,23,0.28)',
};

const fieldStyle = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 10,
  border: `1px solid ${C.borderSoft}`,
  background: 'rgba(10,20,34,0.78)',
  color: C.text,
  fontSize: 13,
  boxSizing: 'border-box',
};

const btnPrimary = {
  padding: '10px 22px',
  borderRadius: 10,
  border: 'none',
  background: `linear-gradient(135deg,${C.accent},#3fa89e)`,
  color: '#08131f',
  fontWeight: 700,
  fontSize: 14,
  cursor: 'pointer',
};

const btnSecondary = {
  padding: '8px 16px',
  borderRadius: 8,
  border: `1px solid ${C.border}`,
  background: 'transparent',
  color: C.muted,
  fontSize: 13,
  cursor: 'pointer',
};

// ── Score badge ──────────────────────────────────────────────────────────────

function ScoreBadge({ label, value, unit = '%', color = C.accent, sub }) {
  return (
    <div style={{
      ...card,
      padding: '14px 18px',
      textAlign: 'center',
      minWidth: 110,
      flex: '1 1 110px',
    }}>
      <div style={{ fontSize: 11, color: C.dim, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 36, fontWeight: 800, color, lineHeight: 1 }}>
        {value !== null && value !== undefined ? value : '—'}
        <span style={{ fontSize: 16 }}>{unit}</span>
      </div>
      {sub && <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Drag-drop file zone ───────────────────────────────────────────────────────

function DropZone({ label, file, onFile, accept = '.ab1', color = C.accent }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef();

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setOver(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  }, [onFile]);

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
      style={{
        border: `2px dashed ${over ? color : C.border}`,
        borderRadius: 12,
        padding: '18px 12px',
        textAlign: 'center',
        cursor: 'pointer',
        background: over ? 'rgba(89,199,189,0.06)' : 'rgba(10,20,34,0.4)',
        transition: 'all 0.2s',
        minHeight: 80,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      }}
    >
      <input ref={inputRef} type="file" accept={accept} style={{ display: 'none' }}
        onChange={e => { if (e.target.files[0]) onFile(e.target.files[0]); }} />
      <div style={{ fontSize: 22 }}>{file ? '✅' : '📁'}</div>
      <div style={{ fontSize: 12, color: file ? C.success : C.dim }}>
        {file ? file.name : label}
      </div>
      {file && <div style={{ fontSize: 11, color: C.dim }}>{(file.size / 1024).toFixed(1)} KB · click to replace</div>}
    </div>
  );
}

// ── Chromatogram viewer (SVG) ────────────────────────────────────────────────

function ChromatogramViewer({ traceData, cutsite, title, height = 150 }) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState(0);
  const svgRef = useRef();
  const dragging = useRef(false);
  const dragStart = useRef(0);

  if (!traceData) return null;
  const { A, C, G, T, baseCalls = '', peakLocations = [], baseStart = 0 } = traceData;
  const rawLen = A?.length || 0;
  if (rawLen === 0) return <div style={{ color: C.dim, fontSize: 12, padding: 8 }}>No trace data</div>;

  const W = 600;
  const H = height;
  const displayLen = Math.floor(rawLen / zoom);
  const maxVal = Math.max(...A, ...C, ...G, ...T) || 1;

  function traceToPath(ch, color) {
    const data = { A, C, G, T }[ch];
    if (!data || data.length === 0) return null;
    const start = Math.floor(offset);
    const end   = Math.min(data.length, start + displayLen);
    let d = '';
    for (let i = start; i < end; i++) {
      const x = ((i - start) / displayLen) * W;
      const y = H - (data[i] / maxVal) * (H - 10) - 5;
      d += i === start ? `M ${x} ${y}` : ` L ${x} ${y}`;
    }
    return <path key={ch} d={d} stroke={color} fill="none" strokeWidth={1.2} opacity={0.9} />;
  }

  // Cutsite line position in the window
  const cutsiteInTrace = cutsite - baseStart; // position relative to traceStart
  // Map base index to raw trace position via peakLocations
  let cutsiteX = null;
  if (peakLocations[cutsiteInTrace] !== undefined) {
    const rawPos = peakLocations[cutsiteInTrace];
    const start  = Math.floor(offset);
    if (rawPos >= start && rawPos < start + displayLen) {
      cutsiteX = ((rawPos - start) / displayLen) * W;
    }
  }

  // Called-base labels (shown as ticks below)
  const baseLabels = [];
  const labelEvery = Math.max(1, Math.floor(displayLen / 60));
  const start = Math.floor(offset);
  for (let i = start; i < Math.min(start + displayLen, peakLocations.length); i++) {
    if ((i - start) % labelEvery !== 0) continue;
    const rawPos = peakLocations[i];
    if (rawPos < start || rawPos >= start + displayLen) continue;
    const x = ((rawPos - start) / displayLen) * W;
    const base = baseCalls[i - start] || '';
    const bColor = TRACE_COLORS[base] || C.dim;
    baseLabels.push(
      <text key={i} x={x} y={H + 14} textAnchor="middle" fontSize={9} fill={bColor}>{base}</text>
    );
  }

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1.2 : 0.833;
    setZoom(z => Math.max(1, Math.min(20, z * delta)));
  };

  const handleMouseDown = (e) => {
    dragging.current = true;
    dragStart.current = e.clientX;
  };
  const handleMouseMove = (e) => {
    if (!dragging.current) return;
    const dx = (dragStart.current - e.clientX) / W * displayLen;
    dragStart.current = e.clientX;
    setOffset(o => Math.max(0, Math.min(rawLen - displayLen, o + dx)));
  };
  const handleMouseUp = () => { dragging.current = false; };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: C.dim, fontWeight: 600 }}>{title}</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {Object.entries(TRACE_COLORS).map(([b, clr]) => (
            <span key={b} style={{ fontSize: 11, color: clr, fontWeight: 700 }}>{b}</span>
          ))}
          <span style={{ fontSize: 11, color: C.dim }}>Scroll to zoom · Drag to pan</span>
        </div>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H + 20}`}
        style={{ width: '100%', background: 'rgba(8,16,28,0.8)', borderRadius: 8, cursor: 'grab' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map(f => (
          <line key={f} x1={0} y1={H - f * (H - 10) - 5} x2={W} y2={H - f * (H - 10) - 5}
            stroke={C.border} strokeWidth={0.5} strokeDasharray="3,3" />
        ))}
        {/* Traces */}
        {['G', 'A', 'T', 'C'].map(ch => traceToPath(ch, TRACE_COLORS[ch]))}
        {/* Cutsite indicator */}
        {cutsiteX !== null && (
          <line x1={cutsiteX} y1={0} x2={cutsiteX} y2={H}
            stroke={C.accentAlt} strokeWidth={1.5} strokeDasharray="4,3" opacity={0.9} />
        )}
        {cutsiteX !== null && (
          <text x={cutsiteX + 3} y={12} fontSize={9} fill={C.accentAlt}>✂ cut</text>
        )}
        {/* Base labels */}
        {baseLabels}
      </svg>
    </div>
  );
}

// ── Discordance plot ──────────────────────────────────────────────────────────

function DiscordancePlot({ ctrl, edit, cutsite, inferenceWindow, alignmentWindow }) {
  if (!ctrl || !edit) return null;
  const W = 600, H = 90;
  const n = Math.min(ctrl.length, 300);
  const start = Math.max(0, cutsite - 100);
  const end   = Math.min(ctrl.length, start + n);

  function makePath(arr, color) {
    const slice = arr.slice(start, end);
    let d = '';
    for (let i = 0; i < slice.length; i++) {
      const x = (i / (slice.length - 1)) * W;
      const y = H - slice[i] * H * 0.9 - 5;
      d += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
    }
    return <path d={d} stroke={color} fill="none" strokeWidth={1.3} opacity={0.85} />;
  }

  const csX = ((cutsite - start) / (end - start)) * W;
  const iwL = ((inferenceWindow[0] - start) / (end - start)) * W;
  const iwR = ((inferenceWindow[1] - start) / (end - start)) * W;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: C.dim, fontWeight: 600 }}>Discordance</span>
        <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
          <span style={{ color: '#6aafdc' }}>■ Control</span>
          <span style={{ color: C.danger }}>■ Edited</span>
          <span style={{ color: C.accentAlt }}>│ Cut</span>
          <span style={{ color: 'rgba(89,199,189,0.3)' }}>▓ Inference window</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 20}`} style={{ width: '100%', background: 'rgba(8,16,28,0.8)', borderRadius: 8 }}>
        {/* Inference window highlight */}
        {iwL > 0 && iwR > iwL && (
          <rect x={Math.max(0,iwL)} y={0} width={Math.min(W,iwR) - Math.max(0,iwL)} height={H}
            fill="rgba(89,199,189,0.08)" />
        )}
        {/* Y axis labels */}
        {[0, 0.5, 1.0].map(v => (
          <text key={v} x={3} y={H - v * H * 0.9 - 5 + 4} fontSize={8} fill={C.dim}>{v.toFixed(1)}</text>
        ))}
        {makePath(ctrl, '#6aafdc')}
        {makePath(edit, C.danger)}
        <line x1={csX} y1={0} x2={csX} y2={H} stroke={C.accentAlt} strokeWidth={1.5} strokeDasharray="3,3" />
        {/* X axis: base positions */}
        {[0, 0.25, 0.5, 0.75, 1].map(f => {
          const pos = Math.round(start + f * (end - start));
          return <text key={f} x={f * W} y={H + 14} textAnchor="middle" fontSize={8} fill={C.dim}>{pos}</text>;
        })}
      </svg>
    </div>
  );
}

// ── Indel distribution chart ─────────────────────────────────────────────────

function IndelChart({ distribution }) {
  if (!distribution || distribution.length === 0) return null;
  const maxPct = Math.max(...distribution.map(d => d.percent), 1);
  const barW   = Math.max(18, Math.min(48, Math.floor(520 / distribution.length)));

  return (
    <div>
      <div style={{ fontSize: 12, color: C.dim, fontWeight: 600, marginBottom: 8 }}>Indel Size Distribution</div>
      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 3,
        height: 120,
        background: 'rgba(8,16,28,0.6)',
        borderRadius: 10,
        padding: '12px 8px 8px',
        overflowX: 'auto',
      }}>
        {distribution.map((d, i) => {
          const isWT  = d.size === 0;
          const isHDR = d.size === 'HDR';
          const color = isHDR ? C.accentAlt : isWT ? C.success : (d.size > 0 ? '#7ab0f5' : C.danger);
          const barH  = (d.percent / maxPct) * 88;
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: `0 0 ${barW}px` }}>
              <div style={{ fontSize: 9, color: C.muted }}>{d.percent > 1 ? d.percent.toFixed(0) : ''}</div>
              <div style={{
                width: barW - 4, height: barH, background: color,
                borderRadius: 4, transition: 'height 0.4s',
                minHeight: d.percent > 0.1 ? 3 : 0,
              }} title={`${d.size}: ${d.percent}%`} />
              <div style={{ fontSize: 9, color: C.dim, whiteSpace: 'nowrap' }}>
                {isHDR ? 'HDR' : (isWT ? 'WT' : (d.size > 0 ? `+${d.size}` : d.size))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Allele contribution table ─────────────────────────────────────────────────

function AlleleTable({ contribs }) {
  if (!contribs || contribs.length === 0) return null;
  return (
    <div>
      <div style={{ fontSize: 12, color: C.dim, fontWeight: 600, marginBottom: 8 }}>Allele Contributions</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {['%', 'Indel', 'Type', 'Sequence (region near cut)'].map(h => (
                <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: C.dim, fontWeight: 600, fontSize: 11 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {contribs.slice(0, 20).map((c, i) => {
              const color = c.isHdr ? C.accentAlt : c.wildtype ? C.success : (c.basesChanged > 0 ? '#7ab0f5' : C.danger);
              return (
                <tr key={i} style={{ borderBottom: `1px solid rgba(39,67,95,0.4)`, background: i % 2 === 0 ? 'rgba(16,34,52,0.3)' : 'transparent' }}>
                  <td style={{ padding: '5px 10px', color, fontWeight: 700 }}>{c.percent.toFixed(1)}%</td>
                  <td style={{ padding: '5px 10px', color }}>
                    {c.isHdr ? 'HDR' : c.wildtype ? 'WT' : (c.basesChanged > 0 ? `+${c.basesChanged}` : `${c.basesChanged}`)}
                  </td>
                  <td style={{ padding: '5px 10px', color: C.dim }}>
                    {c.isHdr ? 'Knock-in' : c.wildtype ? 'Wild-type' : (Math.abs(c.basesChanged) % 3 === 0 ? 'In-frame' : 'Frameshift')}
                  </td>
                  <td style={{ padding: '5px 10px' }}>
                    <code style={{ fontSize: 10, color: C.muted, fontFamily: 'monospace', letterSpacing: 1 }}>
                      {c.sequence.slice(0, 60)}{c.sequence.length > 60 ? '…' : ''}
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

// ── Results panel ─────────────────────────────────────────────────────────────

function ResultsPanel({ result, onExportPdf, onExportExcel }) {
  if (!result) return null;
  const r = result;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Score row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <ScoreBadge label="ICE Score" value={r.ice} sub="editing efficiency" />
        <ScoreBadge label="ICE-D" value={r.iceD} color={C.accentAlt} sub="indel-corrected" />
        <ScoreBadge label="KO Score" value={r.ko} color={C.danger} sub="frameshifts" />
        {r.hdr !== null && <ScoreBadge label="HDR" value={r.hdr} color={C.success} sub="knock-in" />}
        <ScoreBadge label="R²" value={r.rSquared !== undefined ? r.rSquared.toFixed(3) : '—'} unit="" color={C.muted} sub="fit quality" />
      </div>

      {/* Guide info */}
      <div style={{ ...card, padding: '12px 16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12 }}>
          {r.guideTargets.map(g => (
            <div key={g.label} style={{ color: C.muted }}>
              <span style={{ color: C.accent, fontWeight: 700 }}>{g.label}</span>{' '}
              <code style={{ color: C.text }}>{g.guideSeq}</code>{' '}
              <span style={{ color: C.dim }}>cutsite {g.cutsite} ({g.orientation})</span>
            </div>
          ))}
          <div style={{ color: C.dim }}>
            Ctrl discordance: <span style={{ color: C.muted }}>{(r.meanDiscordBefore * 100).toFixed(1)}%</span> →{' '}
            Edit discordance: <span style={{ color: C.danger }}>{(r.meanDiscordAfter * 100).toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* Warnings */}
      {r.warnings && r.warnings.length > 0 && (
        <div style={{ background: 'rgba(240,180,88,0.08)', border: `1px solid ${C.accentAlt}`, borderRadius: 10, padding: '10px 14px' }}>
          {r.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 12, color: C.accentAlt }}>⚠ {w}</div>
          ))}
        </div>
      )}

      {/* Chromatograms */}
      <div style={{ ...card }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ChromatogramViewer
            traceData={r.ctrlTrace}
            cutsite={r.primaryCutsite}
            title={`Control — ${r.controlName}`}
            height={130}
          />
          <ChromatogramViewer
            traceData={r.editTrace}
            cutsite={r.primaryCutsite}
            title={`Edited — ${r.editedName}`}
            height={130}
          />
        </div>
      </div>

      {/* Discordance + Indel chart side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={{ ...card }}>
          <DiscordancePlot
            ctrl={r.ctrlDiscordance}
            edit={r.editDiscordance}
            cutsite={r.primaryCutsite}
            inferenceWindow={r.inferenceWindow}
            alignmentWindow={r.alignmentWindow}
          />
        </div>
        <div style={{ ...card }}>
          <IndelChart distribution={r.indelDistribution} />
        </div>
      </div>

      {/* Allele table */}
      <div style={{ ...card }}>
        <AlleleTable contribs={r.contribs} />
      </div>

      {/* Export buttons */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button style={btnPrimary} onClick={onExportPdf}>🖨 Export PDF</button>
        <button style={{ ...btnSecondary }} onClick={onExportExcel}>📊 Export Excel</button>
      </div>
    </div>
  );
}

// ── Batch results table ────────────────────────────────────────────────────────

function BatchResultsTable({ batchResults, onSelect }) {
  if (!batchResults || batchResults.length === 0) return null;
  return (
    <div style={{ ...card }}>
      <div style={{ fontSize: 14, color: C.text, fontWeight: 700, marginBottom: 12 }}>Batch Results</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            {['Sample', 'ICE', 'ICE-D', 'KO', 'HDR', 'R²', 'Status'].map(h => (
              <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: C.dim, fontSize: 11 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {batchResults.map((br, i) => (
            <tr key={i}
              style={{ borderBottom: `1px solid rgba(39,67,95,0.4)`, cursor: 'pointer', background: i % 2 === 0 ? 'rgba(16,34,52,0.3)' : 'transparent' }}
              onClick={() => onSelect(br)}
            >
              <td style={{ padding: '6px 10px', color: C.accent, fontWeight: 600 }}>{br.label}</td>
              <td style={{ padding: '6px 10px', color: br.error ? C.danger : C.text }}>{br.result ? `${br.result.ice}%` : '—'}</td>
              <td style={{ padding: '6px 10px', color: C.muted }}>{br.result ? `${br.result.iceD}%` : '—'}</td>
              <td style={{ padding: '6px 10px', color: C.danger }}>{br.result ? `${br.result.ko}%` : '—'}</td>
              <td style={{ padding: '6px 10px', color: C.success }}>{br.result?.hdr !== null && br.result?.hdr !== undefined ? `${br.result.hdr}%` : '—'}</td>
              <td style={{ padding: '6px 10px', color: C.dim }}>{br.result ? br.result.rSquared?.toFixed(3) : '—'}</td>
              <td style={{ padding: '6px 10px', color: br.error ? C.danger : C.success }}>
                {br.error ? `⚠ ${br.error.slice(0, 40)}` : '✓ OK'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Sample input row (one control+edited pair) ────────────────────────────────

function SampleRow({ idx, sample, onChange, onRemove, guideFromDesign }) {
  return (
    <div style={{ ...card, padding: '14px 16px', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 13, color: C.muted, fontWeight: 700 }}>Sample {idx + 1}</span>
        {idx > 0 && (
          <button style={{ ...btnSecondary, padding: '4px 10px', fontSize: 11 }} onClick={onRemove}>✕ Remove</button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <DropZone
          label="Control .ab1 (unedited)"
          file={sample.controlFile}
          onFile={f => onChange({ ...sample, controlFile: f })}
          color="#6aafdc"
        />
        <DropZone
          label="Edited .ab1 (CRISPR-treated)"
          file={sample.editedFile}
          onFile={f => onChange({ ...sample, editedFile: f })}
          color={C.danger}
        />
      </div>
      <input
        style={{ ...fieldStyle, marginBottom: 8 }}
        placeholder={guideFromDesign ? `Guide from design: ${guideFromDesign}` : 'Guide sequence(s) — separate multiple with comma (e.g. ATGCTAGCTAGCT)'}
        value={sample.guide}
        onChange={e => onChange({ ...sample, guide: e.target.value })}
      />
      <input
        style={{ ...fieldStyle, marginBottom: 4 }}
        placeholder="Donor / ssODN sequence (optional — for HDR efficiency analysis)'}"
        value={sample.donor}
        onChange={e => onChange({ ...sample, donor: e.target.value })}
      />
      <input
        style={{ ...fieldStyle, fontSize: 12 }}
        placeholder="Sample label (optional)"
        value={sample.label}
        onChange={e => onChange({ ...sample, label: e.target.value })}
      />
    </div>
  );
}

// ── Export helpers ─────────────────────────────────────────────────────────────

function exportExcel(results) {
  if (!results || results.length === 0) return;

  const wb = xlsxUtils.book_new();

  // Summary sheet
  const summaryData = [
    ['Sample', 'ICE Score (%)', 'ICE-D (%)', 'KO Score (%)', 'HDR (%)', 'R²', 'Mean Discord Before', 'Mean Discord After', 'Warnings'],
    ...results.map(r => {
      const res = r.result;
      if (!res) return [r.label, '', '', '', '', '', '', '', r.error || 'Error'];
      return [
        r.label, res.ice, res.iceD, res.ko,
        res.hdr !== null ? res.hdr : '',
        res.rSquared, res.meanDiscordBefore.toFixed(4), res.meanDiscordAfter.toFixed(4),
        res.warnings.join('; '),
      ];
    }),
  ];
  xlsxUtils.book_append_sheet(wb, xlsxUtils.aoa_to_sheet(summaryData), 'Summary');

  // Allele contributions sheet (first result only if single)
  if (results.length === 1 && results[0].result) {
    const r = results[0].result;
    const alleleData = [
      ['Contribution (%)', 'Bases Changed', 'Summary', 'Type', 'Sequence'],
      ...r.contribs.map(c => [
        c.percent.toFixed(1),
        c.basesChanged,
        c.summary,
        c.isHdr ? 'Knock-in' : c.wildtype ? 'Wild-type' : (Math.abs(c.basesChanged) % 3 === 0 ? 'In-frame' : 'Frameshift'),
        c.sequence,
      ]),
    ];
    xlsxUtils.book_append_sheet(wb, xlsxUtils.aoa_to_sheet(alleleData), 'Allele Contributions');

    // Indel distribution
    const indelData = [
      ['Indel Size', 'Percent (%)'],
      ...r.indelDistribution.map(d => [d.size === 'HDR' ? 'HDR' : d.size, d.percent]),
    ];
    xlsxUtils.book_append_sheet(wb, xlsxUtils.aoa_to_sheet(indelData), 'Indel Distribution');
  }

  const buf = xlsxWrite(wb, { type: 'array', bookType: 'xlsx' });
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'assured_sanger_results.xlsx'; a.click();
  URL.revokeObjectURL(url);
}

function exportPdf() {
  window.print();
}

// ── Main SangerValidator component ───────────────────────────────────────────

const defaultSample = () => ({ controlFile: null, editedFile: null, guide: '', donor: '', label: '' });

export default function SangerValidator({ guideFromDesign }) {
  const [samples, setSamples] = useState([defaultSample()]);
  const [analyzing, setAnalyzing] = useState(false);
  const [batchResults, setBatchResults] = useState(null);
  const [selectedResult, setSelectedResult] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('single'); // 'single' | 'batch'

  const guideHint = guideFromDesign || '';

  function updateSample(idx, val) {
    setSamples(s => s.map((x, i) => i === idx ? val : x));
  }

  function addSample() { setSamples(s => [...s, defaultSample()]); }
  function removeSample(idx) { setSamples(s => s.filter((_, i) => i !== idx)); }

  async function runAnalysis() {
    setError(null);
    setAnalyzing(true);
    setBatchResults(null);
    setSelectedResult(null);

    try {
      const runSamples = samples.filter(s => s.controlFile && s.editedFile);
      if (runSamples.length === 0) throw new Error('Please upload at least one control and one edited .ab1 file.');

      const parsedSamples = await Promise.all(
        runSamples.map(async (s, i) => {
          const ctrl = await parseAb1File(s.controlFile);
          const edit = await parseAb1File(s.editedFile);
          const guide = (s.guide.trim() || guideHint).trim();
          if (!guide) throw new Error(`Sample ${i + 1}: Guide sequence required`);
          return {
            controlParsed: ctrl,
            editedParsed: edit,
            guideSequences: guide,
            label: s.label || edit.sampleName || `Sample ${i + 1}`,
            options: { donorSeq: s.donor.trim() || null, indelMaxSize: 20 },
          };
        })
      );

      const results = await analyzeBatch(parsedSamples);
      setBatchResults(results);
      if (results.length === 1) setSelectedResult(results[0]);
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  }

  const hasFiles = samples.some(s => s.controlFile && s.editedFile);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 0 40px' }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ color: C.accent, fontSize: 22, fontWeight: 800, margin: '0 0 6px' }}>
          Sanger Validator
        </h2>
        <p style={{ color: C.dim, fontSize: 13, margin: 0 }}>
          Upload AB1 files to quantify CRISPR editing efficiency, indel spectrum, and HDR rates.
          Analysis runs entirely in your browser — no data is uploaded to any server.
        </p>
      </div>

      {/* Mode tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'rgba(10,20,34,0.5)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
        {[['single', 'Single Sample'], ['batch', 'Batch Mode']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            padding: '7px 18px', borderRadius: 8, border: 'none', fontSize: 13, cursor: 'pointer',
            background: tab === id ? C.accent : 'transparent',
            color: tab === id ? '#08131f' : C.dim, fontWeight: tab === id ? 700 : 400,
          }}>{label}</button>
        ))}
      </div>

      {tab === 'single' ? (
        <>
          <SampleRow
            idx={0}
            sample={samples[0]}
            onChange={v => updateSample(0, v)}
            onRemove={() => {}}
            guideFromDesign={guideHint}
          />
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {samples.map((s, i) => (
            <SampleRow key={i} idx={i} sample={s} onChange={v => updateSample(i, v)}
              onRemove={() => removeSample(i)} guideFromDesign={guideHint} />
          ))}
          <button style={{ ...btnSecondary, alignSelf: 'flex-start' }} onClick={addSample}>
            + Add sample
          </button>
        </div>
      )}

      {/* Indel max size & run button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
        <button
          style={{ ...btnPrimary, opacity: hasFiles ? 1 : 0.5, minWidth: 160 }}
          onClick={runAnalysis}
          disabled={!hasFiles || analyzing}
        >
          {analyzing ? '⏳ Analysing…' : '▶ Run Analysis'}
        </button>
        <span style={{ fontSize: 12, color: C.dim }}>
          {hasFiles ? `${samples.filter(s => s.controlFile && s.editedFile).length} sample(s) ready` : 'Upload AB1 files to begin'}
        </span>
      </div>

      {/* Error */}
      {error && (
        <div style={{ marginTop: 14, background: 'rgba(240,122,122,0.1)', border: `1px solid ${C.danger}`, borderRadius: 10, padding: '10px 14px', fontSize: 13, color: C.danger }}>
          ⚠ {error}
        </div>
      )}

      {/* Batch summary table */}
      {batchResults && batchResults.length > 1 && (
        <div style={{ marginTop: 24 }}>
          <BatchResultsTable
            batchResults={batchResults}
            onSelect={br => setSelectedResult(br)}
          />
        </div>
      )}

      {/* Selected / single result */}
      {selectedResult && (
        <div style={{ marginTop: 24 }} id="assured-sanger-results">
          {selectedResult.error ? (
            <div style={{ color: C.danger, fontSize: 13, padding: 12 }}>
              Analysis failed for <strong>{selectedResult.label}</strong>: {selectedResult.error}
            </div>
          ) : (
            <>
              <div style={{ fontSize: 16, color: C.text, fontWeight: 700, marginBottom: 14 }}>
                Results — {selectedResult.label}
              </div>
              <ResultsPanel
                result={selectedResult.result}
                onExportPdf={exportPdf}
                onExportExcel={() => exportExcel(batchResults || [selectedResult])}
              />
            </>
          )}
        </div>
      )}

      {/* How it works */}
      {!batchResults && (
        <div style={{ ...card, marginTop: 28, padding: '14px 18px', opacity: 0.8 }}>
          <div style={{ fontSize: 12, color: C.dim, fontWeight: 700, marginBottom: 8 }}>How it works</div>
          <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.7 }}>
            1. Upload unedited (control) and CRISPR-treated (edited) Sanger .ab1 files.<br />
            2. Enter the guide RNA sequence (or load from a saved Assured design).<br />
            3. Optionally enter a donor/ssODN sequence to quantify HDR efficiency.<br />
            4. Click <strong style={{ color: C.accent }}>Run Analysis</strong> — the ICE algorithm aligns traces,
            deconvolves alleles via NNLS regression, and reports editing efficiency and indel spectrum.<br />
            <span style={{ color: C.accentAlt }}>All computation runs locally in your browser. No files are sent to any server.</span>
          </div>
        </div>
      )}

      {/* Print styles injected once */}
      <style>{`
        @media print {
          body { background: white !important; color: black !important; }
          #assured-sanger-results * { color: black !important; background: white !important; border-color: #ccc !important; }
          button { display: none !important; }
        }
      `}</style>
    </div>
  );
}
