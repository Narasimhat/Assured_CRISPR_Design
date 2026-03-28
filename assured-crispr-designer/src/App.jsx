import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { CASSETTES, runDesign } from "./designEngine";
import { HISTORICAL_PROJECTS, HISTORICAL_PROJECTS_SUMMARY } from "./data/historicalProjects";

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

const CODON_TABLE = {
  TTT: "F", TTC: "F", TTA: "L", TTG: "L", CTT: "L", CTC: "L", CTA: "L", CTG: "L",
  ATT: "I", ATC: "I", ATA: "I", ATG: "M", GTT: "V", GTC: "V", GTA: "V", GTG: "V",
  TCT: "S", TCC: "S", TCA: "S", TCG: "S", CCT: "P", CCC: "P", CCA: "P", CCG: "P",
  ACT: "T", ACC: "T", ACA: "T", ACG: "T", GCT: "A", GCC: "A", GCA: "A", GCG: "A",
  TAT: "Y", TAC: "Y", TAA: "*", TAG: "*", CAT: "H", CAC: "H", CAA: "Q", CAG: "Q",
  AAT: "N", AAC: "N", AAA: "K", AAG: "K", GAT: "D", GAC: "D", GAA: "E", GAG: "E",
  TGA: "*", TGT: "C", TGC: "C", TGG: "W", CGT: "R", CGC: "R", CGA: "R", CGG: "R",
  AGT: "S", AGC: "S", AGA: "R", AGG: "R", GGT: "G", GGC: "G", GGA: "G", GGG: "G",
};

const DNA_COMPLEMENT = { A: "T", T: "A", G: "C", C: "G" };
const PM_REGION_COLORS = {
  longArm: "#DBEAFE",
  shortArm: "#DCFCE7",
};
const PM_GUIDE_COLORS = {
  site: "#E9D5FF",
  pam: "#FDE68A",
};

function sanitizeSegment(value, fallback) {
  const clean = value.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/\s+/g, " ").trim();
  return clean || fallback;
}

function getProjectTypeMeta(projectType) {
  return PROJECT_TYPES.find((item) => item.id === projectType) || PROJECT_TYPES[0];
}

function buildProjectFolderName(meta) {
  const gene = sanitizeSegment(meta.gene, "GENE");
  const edit = sanitizeSegment(meta.editSummary, "Genome edit");
  const cellLine = sanitizeSegment(meta.cellLine, "CELL-LINE");
  return `${gene} ${edit} in ${cellLine}`;
}

function buildRowMeta(row, result = null) {
  return {
    irisId: row?.irisId || "",
    clientId: "",
    clientName: row?.clientName || "",
    requester: "",
    gene: row?.gene || result?.gene || "",
    cellLine: row?.cellLine || "",
    editSummary: row?.editSummary || row?.label || "",
    notes: row?.notes || "",
    projectType: row?.projectType || result?.type || "pm",
  };
}

function formatDesignLabel(meta, result) {
  if (!result) return "";
  if (result.type === "pm") return `${result.gene} p.${result.wA}${result.an}${result.mA}`;
  if (result.type === "ko") return `${result.gene} knockout`;
  return `${result.gene} ${result.type === "ct" ? "C-terminal" : "N-terminal"} ${result.tag}`;
}

function buildDisplayedEditLabel(meta, result) {
  if (!result) return meta.editSummary || "";
  const canonical = formatDesignLabel(meta, result);
  const requested = String(meta.editSummary || "").trim();
  if (result.type === "pm") {
    if (!requested) return canonical;
    return requested === canonical ? canonical : `${canonical} | requested: ${requested}`;
  }
  return requested || canonical;
}

function buildDesignSummary(result) {
  if (!result) return "";
  const lines = [];
  const getGuideName = (guideIndex) => result.gs?.[guideIndex - 1]?.n || `gRNA${guideIndex}`;
  lines.push(`Design: ${result.type === "pm" ? `${result.gene} p.${result.wA}${result.an}${result.mA}` : formatDesignLabel({ projectType: result.type }, result)}`);
  if (result.type === "pm") lines.push(`Codon: ${result.wC} -> ${result.mC}`);
  if (result.type === "ko") {
    lines.push(`Target exon: ${result.exon}`);
    if (result.gs?.length >= 2) lines.push(`Pair spacing: ${Math.abs((result.gs[1]?.d ?? 0) - (result.gs[0]?.d ?? 0))} bp`);
    if (result.strat) lines.push(`Strategy: ${result.strat}`);
    return lines.join("\n");
  }
  if (result.type === "ct" || result.type === "nt") lines.push(`Donor length: ${result.dl} bp`);
  lines.push("");
  lines.push("gRNAs:");
  result.gs.forEach((guide) => lines.push(`- ${guide.n}: ${guide.sp} ${guide.pm} | ${guide.str} strand | GC ${guide.gc}%`));
  if (result.ss?.length) {
    lines.push("");
    lines.push("Silent mutations:");
    result.ss.forEach((mutation) => lines.push(`- ${getGuideName(mutation.gi)}: ${mutation.lb} (${mutation.oc} -> ${mutation.nc}) | ${mutation.pur}`));
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
    ["Target", buildDisplayedEditLabel(meta, result)],
    ["Cell line", meta.cellLine || "n/a"],
    ["Protein / CDS", result.prot ? `${result.prot} aa` : "n/a"],
    ["Reference file", fileName || "Uploaded GenBank"],
  ];
}

function buildGuideRows(result) {
  return (result?.gs || []).map((guide) => [guide.n, `${guide.sp} ${guide.pm}`, `${guide.str} strand`, `${guide.gc}%`, guide.arm || guide.note || ""]);
}

function renderGuideSequence(spacer, pam, html = false) {
  if (html) {
    return `<span style="font-family:Consolas,monospace;font-weight:700;color:#111827;">${spacer}</span> <span style="display:inline-block;padding:1px 6px;border-radius:999px;background:#FEF3C7;color:#92400E;font-family:Consolas,monospace;font-weight:800;">${pam}</span>`;
  }
  return (
    <>
      <span style={{ fontFamily: "Consolas, monospace", fontWeight: 700, color: "#111827" }}>{spacer}</span>{" "}
      <span style={{ display: "inline-block", padding: "1px 6px", borderRadius: 999, background: "#FEF3C7", color: "#92400E", fontFamily: "Consolas, monospace", fontWeight: 800 }}>{pam}</span>
    </>
  );
}

function buildPrimerRows(result) {
  return (result?.ps || []).map((primer) => [primer.n, primer.s]);
}

function buildSsOdnNotes(result) {
  if (!result || result.type !== "pm") return [];
  const getGuideName = (guideIndex) => result.gs?.[guideIndex - 1]?.n || `gRNA${guideIndex}`;
  const desired = result.ch.map((change, index) => `Desired edit ${index + 1}: genomic position ${change.p + 1}, ${change.w}->${change.m}`);
  const silent = (result.ss || []).map((entry) => `${getGuideName(entry.gi)}: ${entry.lb} (${entry.oc} -> ${entry.nc}) | ${entry.pur}`);
  return desired.concat(silent);
}

function createBatchRow(index) {
  return {
    id: `batch-${index + 1}`,
    label: "",
    irisId: "",
    clientName: "",
    gene: "",
    cellLine: "",
    editSummary: "",
    notes: "",
    projectType: "pm",
    mutation: "",
    tag: "SD40-2xHA",
    homologyArm: "250",
    gbRaw: "",
    fileName: "",
  };
}

function resizeBatchRows(rows, size) {
  const next = rows.slice(0, size);
  while (next.length < size) next.push(createBatchRow(next.length));
  return next;
}

function formatBatchDesignLabel(row, result) {
  if (row?.label?.trim()) return row.label.trim();
  if (!result) return `Slot ${row?.slot || "?"}`;
  if (result.type === "pm") return `${result.gene} ${result.wA}${result.an}${result.mA}`;
  if (result.type === "ko") return `${result.gene} knockout`;
  return `${result.gene} ${result.type === "ct" ? "C-terminal" : "N-terminal"} ${result.tag}`;
}

function buildSafeToken(value, fallback) {
  const normalized = String(value || "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return normalized || fallback;
}

function buildPmDonorOrderName(result, donor, donorIndex) {
  return `${buildSafeToken(result.gene, "GENE")}_${result.wA}${result.an}${result.mA}_${donor.n || `ssODN${donorIndex + 1}`}`;
}

function buildInsertDonorOrderName(result) {
  const side = result.type === "ct" ? "CT" : "NT";
  return `${buildSafeToken(result.gene, "GENE")}_${buildSafeToken(result.tag, "TAG")}_${side}_donor`;
}

function buildBatchOrderRows(entries) {
  return entries.flatMap((entry) => {
    if (entry.status !== "success" || !entry.result) return [];
    const { row, result, slot } = entry;
    const designType = getProjectTypeMeta(result.type).label;
    const designLabel = formatBatchDesignLabel({ ...row, slot }, result);
    const common = {
      slot,
      designLabel,
      gene: result.gene,
      designType,
      referenceFile: row.fileName || "Uploaded GenBank",
    };
    const guides = (result.gs || []).map((guide) => ({
      ...common,
      itemType: "gRNA",
      name: guide.n,
      sequence: guide.sp,
      spacer: guide.sp,
      pam: guide.pm,
      strand: guide.str,
      length: guide.sp.length,
      linkedGuide: "",
      recommended: "Yes",
      notes: guide.arm || guide.note || "",
    }));
    const donors = result.type === "pm"
      ? (result.os || []).map((donor, donorIndex) => ({
        ...common,
        itemType: "Donor",
        name: buildPmDonorOrderName(result, donor, donorIndex),
        sequence: donor.od,
        spacer: "",
        pam: "",
        strand: donor.sl || "",
        length: donor.od?.length || 0,
        linkedGuide: donor.guideName || "",
        recommended: "Order this strand",
        notes: donor.guideName ? `Reverse complement to ${donor.guideName}` : "Recommended donor strand",
      }))
      : (result.type === "ct" || result.type === "nt")
        ? [{
          ...common,
          itemType: "Donor",
          name: buildInsertDonorOrderName(result),
          sequence: result.donor || "",
          spacer: "",
          pam: "",
          strand: "",
          length: result.donor?.length || 0,
          linkedGuide: "",
          recommended: "Yes",
          notes: `${result.type === "ct" ? "C-terminal" : "N-terminal"} HDR donor`,
        }]
        : [];
    const primers = (result.ps || []).map((primer) => ({
      ...common,
      itemType: "Primer",
      name: primer.n,
      sequence: primer.s,
      spacer: "",
      pam: "",
      strand: "",
      length: primer.s?.length || 0,
      linkedGuide: "",
      recommended: "Yes",
      notes: "Validation primer",
    }));
    return guides.concat(donors, primers);
  });
}

function escapeDelimitedValue(value) {
  const stringValue = String(value ?? "");
  if (/[",\n\t]/.test(stringValue)) return `"${stringValue.replace(/"/g, "\"\"")}"`;
  return stringValue;
}

function buildBatchOrderDelimited(rows, delimiter = ",") {
  const headers = ["Slot", "Design", "Gene", "Design Type", "Reference File", "Item Type", "Name", "Sequence To Order", "Spacer", "PAM", "Strand", "Length", "Linked Guide", "Recommended", "Notes"];
  const lines = [headers.join(delimiter)];
  rows.forEach((row) => {
    lines.push([
      row.slot,
      row.designLabel,
      row.gene,
      row.designType,
      row.referenceFile,
      row.itemType,
      row.name,
      row.sequence,
      row.spacer,
      row.pam,
      row.strand,
      row.length,
      row.linkedGuide,
      row.recommended,
      row.notes,
    ].map(escapeDelimitedValue).join(delimiter));
  });
  return lines.join("\n");
}

function normalizeBatchProjectType(value) {
  const compact = String(value || "").toLowerCase().replace(/[^a-z]/g, "");
  if (compact === "pm" || compact === "snp" || compact === "pointmutation" || compact === "pointmutations") return "pm";
  if (compact === "ko" || compact === "knockout" || compact === "knockouts") return "ko";
  if (compact === "ct" || compact === "cterminal" || compact === "ctag" || compact === "cterminaltag") return "ct";
  if (compact === "nt" || compact === "nterminal" || compact === "ntag" || compact === "nterminaltag") return "nt";
  return "";
}

function normalizeFileLookupKey(value) {
  return String(value || "").trim().toLowerCase();
}

function buildFolderLibrary(entries) {
  const byName = new Map();
  const byStem = new Map();
  const byGene = new Map();
  entries.forEach((entry) => {
    const fileKey = normalizeFileLookupKey(entry.fileName);
    const stem = entry.fileName.replace(/\.[^.]+$/, "");
    const stemKey = normalizeFileLookupKey(stem);
    const geneKey = normalizeGeneToken(stem);
    if (fileKey && !byName.has(fileKey)) byName.set(fileKey, entry);
    if (stemKey && !byStem.has(stemKey)) byStem.set(stemKey, entry);
    if (geneKey && !byGene.has(geneKey)) byGene.set(geneKey, entry);
  });
  return { byName, byStem, byGene };
}

function detectCellLineToken(text) {
  const match = String(text || "").match(/\b[A-Za-z]{2,10}\d{3}-A(?:-[A-Za-z0-9]+)?\b/);
  return match ? match[0] : "";
}

function detectMutationToken(text) {
  const match = String(text || "").match(/\b([A-Za-z])\s*-?(\d+)\s*-?([A-Za-z])\b/);
  return match ? `${match[1].toUpperCase()}${match[2]}${match[3].toUpperCase()}` : "";
}

function detectProjectTypeFromText(text, mutation, cassetteKey) {
  const lower = String(text || "").toLowerCase();
  if (/\b(ko|knockout)\b/.test(lower)) return "ko";
  if (/\b(c[\s-]?term(?:inal)?|ct)\b/.test(lower)) return "ct";
  if (/\b(n[\s-]?term(?:inal)?|nt)\b/.test(lower)) return "nt";
  if (cassetteKey?.startsWith("N:")) return "nt";
  if (cassetteKey) return "ct";
  if (mutation) return "pm";
  return "pm";
}

function detectCassetteKey(text, targetType = "") {
  const normalizedLine = String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const keys = Object.keys(CASSETTES).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const bareKey = normalizedKey.replace(/^n/, "");
    if (normalizedLine.includes(normalizedKey)) {
      if (!targetType || (targetType === "nt" ? key.startsWith("N:") : !key.startsWith("N:"))) return key;
    }
    if (targetType === "nt" && key.startsWith("N:") && normalizedLine.includes(bareKey)) return key;
    if (targetType === "ct" && !key.startsWith("N:") && normalizedLine.includes(normalizedKey)) return key;
  }
  return "";
}

function detectGeneToken(text, cellLine, mutation, cassetteKey) {
  const raw = String(text || "").replace(/[,;]+/g, " ").trim();
  const tokens = raw.split(/\s+/).filter(Boolean);
  const stopTokens = new Set([
    "ko", "knockout", "ct", "nt", "cterminal", "nterminal", "c-terminal", "n-terminal",
    "c", "n", "term", "terminal", "in", "with",
  ]);
  const mutationLower = mutation.toLowerCase();
  const cellLineLower = String(cellLine || "").toLowerCase();
  const cassettePieces = new Set(String(cassetteKey || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const token = tokens.find((value) => {
    const lower = value.toLowerCase();
    if (!/[a-z]/i.test(value)) return false;
    if (stopTokens.has(lower)) return false;
    if (cellLineLower && lower === cellLineLower) return false;
    if (mutation && lower === mutationLower) return false;
    if (cassettePieces.has(lower)) return false;
    return true;
  });
  return token ? normalizeGeneToken(token) : "";
}

function parseRequestLine(line, index, folderLibrary) {
  const trimmed = String(line || "").trim();
  if (!trimmed) return null;
  const initialCassette = detectCassetteKey(trimmed);
  const mutation = detectMutationToken(trimmed);
  const projectType = detectProjectTypeFromText(trimmed, mutation, initialCassette);
  const cassetteKey = detectCassetteKey(trimmed, projectType) || (projectType === "ct" || projectType === "nt" ? initialCassette : "");
  const cellLine = detectCellLineToken(trimmed);
  const gene = detectGeneToken(trimmed, cellLine, mutation, cassetteKey);
  const geneMatch = folderLibrary.byGene.get(gene);
  const fileEntry = geneMatch || null;
  const row = {
    ...createBatchRow(index),
    label: trimmed,
    editSummary: trimmed,
    gene,
    cellLine,
    projectType,
    mutation: projectType === "pm" ? mutation : "",
    tag: projectType === "ct" || projectType === "nt" ? (cassetteKey || (projectType === "nt" ? "N:EGFP-Linker" : "SD40-2xHA")) : "SD40-2xHA",
    homologyArm: projectType === "ct" || projectType === "nt" ? "250" : "250",
    gbRaw: fileEntry?.gbRaw || "",
    fileName: fileEntry?.fileName || "",
    parseIssue: "",
  };
  row.parseIssue = summarizeRowParseIssue(row, fileEntry);
  return row;
}

function parseRequestText(text, folderLibrary) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line, index) => parseRequestLine(line, index, folderLibrary))
    .filter(Boolean);
}

function summarizeRowParseIssue(row, fileEntryOverride = null) {
  const issues = [];
  if (!row?.gene) issues.push("gene");
  if (!row?.cellLine) issues.push("cell line");
  if (row?.projectType === "pm" && !row?.mutation) issues.push("mutation");
  if ((row?.projectType === "ct" || row?.projectType === "nt") && !row?.tag) issues.push("cassette");
  const hasFile = Boolean(fileEntryOverride || row?.gbRaw || row?.fileName);
  if (!hasFile) issues.push("GenBank");
  return issues.length ? `Needs ${issues.join(", ")}` : "";
}

function parseBatchDefinitionText(text) {
  const lines = String(text || "").split(/\r?\n/);
  const definitions = [];
  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) return;
    const cells = line.split(line.includes("\t") ? "\t" : ",").map((cell) => cell.trim());
    const firstCell = cells[0]?.toLowerCase();
    if (index === 0 && (firstCell === "file" || firstCell === "filename" || firstCell === "genbank")) return;
    definitions.push({
      lineNumber: index + 1,
      fileToken: cells[0] || "",
      projectType: normalizeBatchProjectType(cells[1] || ""),
      modification: cells[2] || "",
      homologyArm: cells[3] || "",
      label: cells[4] || "",
    });
  });
  return definitions;
}

function buildIdtTemplateRows(orderRows, defaults) {
  return {
    crispr: orderRows
      .filter((row) => row.itemType === "gRNA")
      .map((row) => ({ Name: row.name, Sequence: row.sequence, Scale: defaults.crisprScale })),
    oligo: orderRows
      .filter((row) => row.itemType === "Primer")
      .map((row) => ({ Name: row.name, Sequence: row.sequence, Scale: defaults.oligoScale, Purification: defaults.oligoPurification })),
    hdr: orderRows
      .filter((row) => row.itemType === "Donor")
      .map((row) => ({ Name: row.name, Sequence: row.sequence, Scale: defaults.hdrScale, Modification: defaults.hdrModification })),
  };
}

function downloadXlsxTemplate(headers, rows, fileName) {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows.map((row) => headers.map((header) => row[header] ?? ""))]);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  XLSX.writeFile(workbook, fileName);
}

function downloadIdtWorkbook(kind, templateRows, filePrefix = "") {
  const config = {
    crispr: {
      headers: ["Name", "Sequence", "Scale"],
      rows: templateRows.crispr,
      fileName: `${filePrefix}template-paste-entry-crispr.xlsx`,
    },
    oligo: {
      headers: ["Name", "Sequence", "Scale", "Purification"],
      rows: templateRows.oligo,
      fileName: `${filePrefix}template-paste-entry.xlsx`,
    },
    hdr: {
      headers: ["Name", "Sequence", "Scale", "Modification"],
      rows: templateRows.hdr,
      fileName: `${filePrefix}template-paste-entry-hdr.xlsx`,
    },
  }[kind];
  if (!config?.rows?.length) return null;
  downloadXlsxTemplate(config.headers, config.rows, config.fileName);
  return config.fileName;
}

function normalizeGeneToken(value) {
  const upper = String(value || "").toUpperCase().trim();
  const withoutIds = upper.replace(/[-_\s]*(ENSG|NM_|NCBI)\S*/g, " ");
  const compact = withoutIds.replace(/[^A-Z0-9]+/g, " ").trim();
  return compact.split(/\s+/)[0] || "";
}

const CELL_LINE_ALIAS_GROUPS = [
  ["MDCI053A", "HMGUI001A"],
];

function canonicalizeCellLineBase(value) {
  const normalized = String(value || "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
  if (!normalized) return "";
  const withoutClone = normalized.replace(/-\w+$/g, "").replace(/([A-Z0-9]+A)\w*$/, "$1");
  const base = withoutClone || normalized;
  const aliasGroup = CELL_LINE_ALIAS_GROUPS.find((group) => group.includes(base));
  return aliasGroup ? aliasGroup[0] : base;
}

function normalizeCellLine(value) {
  return canonicalizeCellLineBase(value);
}

function inferCurrentHistoricalSubtype(result, projectType) {
  const kind = result?.type || projectType;
  if (kind === "ko") return "ko";
  if (kind === "pm") return "snp_ki";
  if (kind === "ct") return "ct_ki";
  if (kind === "nt") return "nt_ki";
  return "other";
}

function inferHistoricalSubtype(record) {
  const modClass = String(record.modificationClass || "").toLowerCase();
  const modType = String(record.modificationType || "").toLowerCase();
  const donorType = String(record.donorType || "").toLowerCase();
  const descriptor = `${record.modificationDescription || ""} ${record.donorName || ""} ${record.targetGene || ""}`.toLowerCase();

  if (modClass === "ko" || modType === "ko" || descriptor.includes("knockout")) return "ko";
  if (
    modClass === "pm"
    || modType === "snp"
    || donorType === "ssodn"
    || /\b[a-z]\d+[a-z]\b/i.test(record.modificationDescription || "")
    || descriptor.includes(" snp")
  ) return "snp_ki";

  if (modClass === "ki" || modType === "ki") {
    if (
      descriptor.includes("n-term")
      || descriptor.includes("n term")
      || descriptor.includes("nterminal")
      || descriptor.includes("n-terminal")
      || descriptor.includes("start codon")
      || descriptor.includes(" atg")
      || descriptor.includes("exn1")
      || descriptor.includes("exon1")
      || descriptor.includes("exon 1")
    ) return "nt_ki";
    if (
      descriptor.includes("c-term")
      || descriptor.includes("c term")
      || descriptor.includes("cterminal")
      || descriptor.includes("c-terminal")
      || descriptor.includes("stop codon")
      || descriptor.includes("gfp-tag")
      || descriptor.includes("snap-tag")
      || descriptor.includes("sd40")
      || descriptor.includes("dtag")
      || descriptor.includes("maid")
      || descriptor.includes("2xha")
      || descriptor.includes("egfp")
      || descriptor.includes("mcherry")
      || descriptor.includes("mscarlet")
      || descriptor.includes("luc2")
    ) return "ct_ki";
    return "ki_generic";
  }

  return "other";
}

function inferCurrentHistoricalSignature(result) {
  if (!result) return "";
  if (result.type === "pm") return `${result.wA}${result.an}${result.mA}`.toLowerCase();
  if (result.type === "ct" || result.type === "nt") return simplifyTagName(result.tag).toLowerCase();
  return "";
}

function inferRecordSpecificMatch(record, targetSubtype, signature) {
  if (!signature) return false;
  const descriptor = `${record.modificationDescription || ""} ${record.donorName || ""} ${record.targetGene || ""}`.toLowerCase();
  if (targetSubtype === "snp_ki") {
    const normalized = signature.replace(/\s+/g, "");
    return descriptor.includes(normalized) || descriptor.includes(`p.${normalized}`);
  }
  if (targetSubtype === "ct_ki" || targetSubtype === "nt_ki") return descriptor.includes(signature);
  return false;
}

function inferCurrentDonorType(result) {
  if (!result) return "none";
  if (result.type === "pm") return "ssODN";
  if (result.type === "ko") return "none";
  return "donor";
}

function buildHistoricalContext(meta, result, projectType) {
  const targetGene = normalizeGeneToken(meta.gene || result?.gene);
  const targetCellLine = normalizeCellLine(meta.cellLine);
  const targetSubtype = inferCurrentHistoricalSubtype(result, projectType);
  const targetSignature = inferCurrentHistoricalSignature(result);
  const currentGuides = new Set((result?.gs || []).map((guide) => guide.sp));
  const donorType = inferCurrentDonorType(result);

  const scored = HISTORICAL_PROJECTS.map((record) => {
    const recordGene = normalizeGeneToken(record.targetGene);
    const recordCellLine = normalizeCellLine(record.parentalLine);
    const sameGene = Boolean(targetGene && recordGene === targetGene);
    const sameCellLine = Boolean(targetCellLine && recordCellLine === targetCellLine);
    const subtype = inferHistoricalSubtype(record);
    const sameSubtype = subtype === targetSubtype;
    const sameSpecificEdit = sameGene && sameSubtype && inferRecordSpecificMatch(record, targetSubtype, targetSignature);
    const compatibleSubtype = sameSubtype
      || ((targetSubtype === "ct_ki" || targetSubtype === "nt_ki") && subtype === "ki_generic");
    const guideOverlap = (record.guides || []).filter((guide) => currentGuides.has(guide.sequence)).length;
    let score = 0;
    if (sameSpecificEdit) score += 12;
    if (sameGene) score += 6;
    if (sameSubtype) score += 6;
    else if (compatibleSubtype) score += 2;
    if (sameCellLine) score += 3;
    if (record.donorType === donorType) score += 1;
    score += guideOverlap * 5;
    return { ...record, sameGene, sameCellLine, sameSubtype, sameSpecificEdit, compatibleSubtype, subtype, guideOverlap, score };
  }).filter((record) => record.score > 0);

  const matches = scored.sort((left, right) => {
    if (right.sameSpecificEdit !== left.sameSpecificEdit) return right.sameSpecificEdit ? 1 : -1;
    if (right.sameGene !== left.sameGene) return right.sameGene ? 1 : -1;
    if (right.sameSubtype !== left.sameSubtype) return right.sameSubtype ? 1 : -1;
    if (right.compatibleSubtype !== left.compatibleSubtype) return right.compatibleSubtype ? 1 : -1;
    if (right.score !== left.score) return right.score - left.score;
    if (right.guideOverlap !== left.guideOverlap) return right.guideOverlap - left.guideOverlap;
    return (left.projectId || "").localeCompare(right.projectId || "");
  });

  const sameSpecificMatches = matches.filter((record) => record.sameSpecificEdit);
  const sameGeneMatches = matches.filter((record) => record.sameGene);
  const sameGeneAndSubtype = matches.filter((record) => record.sameGene && record.sameSubtype);
  const sameGeneAndCell = matches.filter((record) => record.sameGene && record.sameCellLine);
  const sameSubtypeAndCell = matches.filter((record) => record.sameSubtype && record.sameCellLine);
  const compatibleKiMatches = matches.filter((record) => record.compatibleSubtype && !record.sameSubtype);
  const exactGuideReuse = matches.filter((record) => record.guideOverlap > 0);
  const recommendations = [];
  const recommendedGuides = [];
  const recommendedDonors = [];
  const seenGuideSequences = new Set();
  const seenDonorSequences = new Set();

  if (sameSpecificMatches.length) recommendations.push(`Found ${sameSpecificMatches.length} historical record${sameSpecificMatches.length === 1 ? "" : "s"} that appear to match this exact edit signature.`);
  if (sameGeneAndCell.length) recommendations.push(`Found ${sameGeneAndCell.length} established project${sameGeneAndCell.length === 1 ? "" : "s"} for this gene in the same parental line.`);
  if (!sameGeneAndCell.length && sameGeneAndSubtype.length) recommendations.push(`Found ${sameGeneAndSubtype.length} established project${sameGeneAndSubtype.length === 1 ? "" : "s"} for this gene with the same edit subtype.`);
  if (!sameGeneAndSubtype.length && sameSubtypeAndCell.length) recommendations.push(`No same-gene precedent was found, but ${sameSubtypeAndCell.length} established project${sameSubtypeAndCell.length === 1 ? "" : "s"} exist in the same parental line for this exact design subtype.`);
  if (!sameGeneAndSubtype.length && !sameSubtypeAndCell.length && compatibleKiMatches.length) recommendations.push(`Only generic KI precedent was found for this gene or cell line. Orientation-specific KI precedent is limited, so review insertion context manually.`);
  if (exactGuideReuse.length) recommendations.push(`Exact guide reuse appears in ${exactGuideReuse.length} established record${exactGuideReuse.length === 1 ? "" : "s"}; review those projects before ordering.`);
  if (result?.type === "pm" && sameGeneMatches.some((record) => record.donorType === "ssODN")) recommendations.push("Historical matches for this gene used ssODN donors, which supports the current SNP design strategy.");
  if ((result?.type === "ct" || result?.type === "nt") && !sameGeneAndSubtype.length) recommendations.push("No close orientation-matched KI precedent was found in the imported history; verify donor frame, insertion orientation, and junction-PCR plan manually.");

  let prioritizedMatches = [];
  if (sameSpecificMatches.length) prioritizedMatches = sameSpecificMatches;
  else if (sameGeneAndSubtype.length) prioritizedMatches = sameGeneAndSubtype;
  else if (sameGeneMatches.length) prioritizedMatches = sameGeneMatches;
  else if (exactGuideReuse.length) prioritizedMatches = exactGuideReuse;

  prioritizedMatches.forEach((record) => {
    if ((record.sameSubtype || record.compatibleSubtype || record.sameGene || record.sameCellLine || record.guideOverlap > 0) && recommendedGuides.length < 6) {
      (record.guides || []).forEach((guide) => {
        if (recommendedGuides.length >= 6) return;
        if (!guide.sequence || seenGuideSequences.has(guide.sequence)) return;
        seenGuideSequences.add(guide.sequence);
        recommendedGuides.push({
          name: guide.name || "Historical guide",
          sequence: guide.sequence,
          sourceProject: record.projectId,
          sourceLine: record.parentalLine || "n/a",
          matchLabel: record.guideOverlap > 0 ? "exact guide reuse" : record.sameSpecificEdit ? "same edit" : record.sameSubtype ? "same subtype" : record.compatibleSubtype ? "generic KI fallback" : record.sameGene && record.sameCellLine ? "same gene + same line" : record.sameGene ? "same gene" : "same line",
        });
      });
    }

    if ((record.sameSubtype || record.compatibleSubtype || record.sameGene || record.sameCellLine) && record.donorSequence && recommendedDonors.length < 3 && !seenDonorSequences.has(record.donorSequence)) {
      seenDonorSequences.add(record.donorSequence);
      recommendedDonors.push({
        name: record.donorName || "Historical donor",
        sequence: record.donorSequence,
        donorType: record.donorType || "donor",
        sourceProject: record.projectId,
        sourceLine: record.parentalLine || "n/a",
        matchLabel: record.sameSpecificEdit ? "same edit" : record.sameSubtype ? "same subtype" : record.compatibleSubtype ? "generic KI fallback" : record.sameGene && record.sameCellLine ? "same gene + same line" : record.sameGene ? "same gene" : "same line",
      });
    }
  });

  return {
    targetGene,
    targetSubtype,
    totalMatches: matches.length,
    topMatches: prioritizedMatches.slice(0, 6),
    recommendations: recommendations.slice(0, 4),
    recommendedGuides,
    recommendedDonors,
    stats: {
      sameSpecificEdit: sameSpecificMatches.length,
      sameGene: sameGeneMatches.length,
      sameGeneAndSubtype: sameGeneAndSubtype.length,
      sameGeneAndCell: sameGeneAndCell.length,
      sameSubtypeAndCell: sameSubtypeAndCell.length,
      compatibleKiFallbacks: compatibleKiMatches.length,
      exactGuideReuse: exactGuideReuse.length,
    },
  };
}

function buildReviewItems(meta, result, fileName) {
  if (!result) return [];
  const items = [];

  if (!fileName) items.push({ level: "warning", text: "Reference sequence filename is missing from the report. Keep the exact GenBank record with the final design package." });
  if (!meta.notes.trim()) items.push({ level: "check", text: "Record transcript assumptions, exon numbering assumptions, and delivery method before final sign-off." });

  const outOfRangeGuides = (result.gs || []).filter((guide) => typeof guide.gc === "number" && (guide.gc < 30 || guide.gc > 80));
  if (outOfRangeGuides.length) items.push({ level: "warning", text: `Guide GC content is atypical for ${outOfRangeGuides.length} guide${outOfRangeGuides.length === 1 ? "" : "s"}; review activity and synthesis risk manually.` });

  if (result.type === "pm") {
    if (!(result.ss || []).length) items.push({ level: "warning", text: "No silent guide-blocking mutation was introduced. Re-cut after HDR may remain possible." });
    items.push({ level: "check", text: "Confirm the desired amino-acid change against the intended transcript and verify that the donor does not create unwanted amino-acid substitutions." });
  }

  if (result.type === "ko") {
    const guideCount = (result.gs || []).length;
    if (guideCount < 2) items.push({ level: "warning", text: "Knockout design has fewer than two guides. Deletion-based screening will be weaker than expected." });
    items.push({ level: "check", text: "Validate the expected deletion by junction PCR and confirm frameshift or protein loss in established clones." });
  }

  if (result.type === "ct" || result.type === "nt") {
    const labels = new Set((result.donorAnnotations || []).map((annotation) => annotation.label));
    if (!(result.ss || []).length) items.push({ level: "warning", text: "No silent guide-disrupting mutation was captured in the HDR donor arms. Re-cut of the edited allele is still possible." });
    if (result.type === "nt" && !labels.has("Start")) items.push({ level: "warning", text: "N-terminal donor annotation does not include a start codon block. Verify start codon replacement before ordering." });
    if (result.type === "ct" && !labels.has("Stop")) items.push({ level: "warning", text: "C-terminal donor annotation does not include a terminal stop codon block. Verify stop codon placement before ordering." });
    if ((result.donor || "").length > 2200) items.push({ level: "warning", text: "HDR donor is long for routine synthesis and cloning. Confirm assembly plan and QC strategy." });
    items.push({ level: "check", text: "Review donor frame across both homology junctions and confirm the expected translated product at the protein level." });
  }

  return items;
}

function translateCodon(codon) {
  const aa = CODON_TABLE[codon] || "?";
  return aa === "*" ? "Stop" : aa;
}

function reverseComplement(sequence) {
  return (sequence || "").split("").reverse().map((base) => DNA_COMPLEMENT[base] || "N").join("");
}

function buildPmArmRegions(sequenceLength, longArmFirst = true) {
  if (!sequenceLength) return [];
  const longArmLength = Math.min(91, sequenceLength);
  const shortArmStart = longArmFirst ? longArmLength : Math.min(36, sequenceLength);
  const firstArmLength = longArmFirst ? longArmLength : Math.min(36, sequenceLength);
  return [
    {
      label: `${longArmFirst ? "91 bp arm" : "36 bp arm"}`,
      start: 0,
      end: firstArmLength,
      color: longArmFirst ? PM_REGION_COLORS.longArm : PM_REGION_COLORS.shortArm,
    },
    {
      label: `${longArmFirst ? "36 bp arm" : "91 bp arm"}`,
      start: shortArmStart,
      end: sequenceLength,
      color: longArmFirst ? PM_REGION_COLORS.shortArm : PM_REGION_COLORS.longArm,
    },
  ].filter((region) => region.end > region.start);
}

function findPmRegion(index, regions) {
  return regions.find((region) => index >= region.start && index < region.end) || null;
}

function buildPmStrandModels(donor) {
  const length = donor.od?.length || 0;
  const orderedDiff = [...(donor.df || [])].sort((left, right) => left - right);
  const oppositeDiff = orderedDiff.map((index) => length - 1 - index).sort((left, right) => left - right);
  const orderedLabel = donor.guideStrand === "+" ? "- strand donor" : "+ strand donor";
  const oppositeLabel = donor.guideStrand === "+" ? "+ strand donor" : "- strand donor";
  const genomicGuide = {
    siteStart: donor.guideSiteStart,
    siteEnd: donor.guideSiteEnd,
    pamStart: donor.guidePamStart,
    pamEnd: donor.guidePamEnd,
  };
  const mapGuide = (reversed) => {
    if (!reversed) return genomicGuide;
    return {
      siteStart: length - genomicGuide.siteEnd,
      siteEnd: length - genomicGuide.siteStart,
      pamStart: length - genomicGuide.pamEnd,
      pamEnd: length - genomicGuide.pamStart,
    };
  };
  return [
    {
      key: "ordered",
      title: orderedLabel,
      recommended: true,
      note: `Recommended to order. This strand is reverse complement to ${donor.guideName}. Cut site lies between the 91 bp and 36 bp arms.`,
      wt: donor.wo,
      donor: donor.od,
      diffIndexes: orderedDiff,
      regions: buildPmArmRegions(length, true),
      guide: mapGuide(donor.guideStrand === "+"),
    },
    {
      key: "opposite",
      title: oppositeLabel,
      recommended: false,
      note: "Opposite donor strand for reference. Cut site lies between the 36 bp and 91 bp arms on this view.",
      wt: reverseComplement(donor.wo),
      donor: reverseComplement(donor.od),
      diffIndexes: oppositeDiff,
      regions: buildPmArmRegions(length, false),
      guide: mapGuide(donor.guideStrand !== "+"),
    },
  ];
}

function splitFramedSequence(sequence) {
  const safeSequence = sequence || "";
  const codonLength = Math.floor(safeSequence.length / 3) * 3;
  const codingRegion = safeSequence.slice(0, codonLength);
  const codons = [];
  for (let index = 0; index < codingRegion.length; index += 3) codons.push(codingRegion.slice(index, index + 3));
  return { prefix: "", codons, suffix: "" };
}

function buildPmDonorComparison(donor) {
  const wt = splitFramedSequence(donor.codingWt);
  const edited = splitFramedSequence(donor.codingDonor);
  const diffCodonIndexes = edited.codons.reduce((indexes, codon, index) => {
    if (codon !== wt.codons[index]) indexes.push(index);
    return indexes;
  }, []);
  const wtAa = wt.codons.map(translateCodon);
  const donorAa = edited.codons.map(translateCodon);
  const diffAaIndexes = donorAa.reduce((indexes, aa, index) => {
    if (aa !== wtAa[index]) indexes.push(index);
    return indexes;
  }, []);
  return { wt, donor: edited, wtAa, donorAa, diffCodonIndexes, diffAaIndexes };
}

function tableHtml(rows, header = false) {
  return rows.map((row) => `<tr>${row.map((cell, index) => header ? `<th style="padding:8px 10px;border:1px solid #bbbbbb;background:#2E75B6;color:#ffffff;text-align:left;">${cell}</th>` : `<td style="padding:8px 10px;border:1px solid #bbbbbb;vertical-align:top;${index === 0 ? "background:#F0F4F8;font-weight:700;width:220px;" : "background:#FFFFFF;"}">${cell}</td>`).join("")}</tr>`).join("");
}

function buildAlignedRowHtml(label, { prefix = "", tokens = [], suffix = "" }, diffIndexes = [], mode = "donor", tokenWidth = "4ch") {
  const changedSet = new Set(diffIndexes);
  const prefixHtml = prefix ? `<span style="color:#98A2B3;">${prefix}</span>` : "";
  const suffixHtml = suffix ? `<span style="color:#98A2B3;">${suffix}</span>` : "";
  const tokensHtml = tokens.map((token, index) => {
    const changed = changedSet.has(index);
    const styles = [
      "display:inline-block",
      `min-width:${tokenWidth}`,
      "margin-right:6px",
      "text-align:center",
      changed ? `color:${mode === "wt" ? "#CC0000" : "#111827"}` : "color:#111827",
      changed && mode === "donor" ? "background:#FFF59D" : "background:transparent",
      changed && mode === "wt" ? "text-decoration:line-through" : "text-decoration:none",
      `font-weight:${changed ? 800 : 400}`,
    ].join(";");
    return `<span style="${styles}">${token}</span>`;
  }).join("");
  return `
    <div style="margin:0 0 8px 0;">
      <div style="color:#667085;font-size:11px;margin-bottom:4px;">${label}</div>
      <div style="font-family:Consolas,monospace;font-size:12px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere;">${prefixHtml}${tokensHtml}${suffixHtml}</div>
    </div>
  `;
}

function buildPmAnnotatedSequenceHtml(label, sequence, diffIndexes, mode, regions, guide) {
  const diffSet = new Set(diffIndexes);
  const sequenceHtml = (sequence || "").split("").map((base, index) => {
    const changed = diffSet.has(index);
    const region = findPmRegion(index, regions);
    const inGuide = guide && index >= guide.siteStart && index < guide.siteEnd;
    const inPam = guide && index >= guide.pamStart && index < guide.pamEnd;
    const styles = [
      `background:${inPam ? PM_GUIDE_COLORS.pam : changed && mode === "donor" ? "#FDE68A" : inGuide ? PM_GUIDE_COLORS.site : (region?.color || "transparent")}`,
      `color:${changed && mode === "wt" ? "#CC0000" : "#111827"}`,
      `text-decoration:${changed && mode === "wt" ? "line-through" : "none"}`,
      `font-weight:${inGuide || changed ? 800 : 400}`,
    ].join(";");
    return `<span style="${styles}">${base}</span>`;
  }).join("");
  return `
    <div style="margin:0 0 8px 0;">
      <div style="color:#667085;font-size:11px;margin-bottom:4px;">${label}</div>
      <div style="font-family:Consolas,monospace;font-size:12px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere;">${sequenceHtml}</div>
    </div>
  `;
}

function buildPmStrandCardHtml(strand) {
  return `
    <div style="margin:0 0 12px 0;padding:12px;border:1px solid ${strand.recommended ? "#10B98155" : "#d7dee7"};border-radius:12px;background:${strand.recommended ? "#ECFDF5" : "#f8fafc"};">
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px;">
        <span style="font-weight:700;color:#1f2937;">${strand.title}</span>
        <span style="display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:700;color:${strand.recommended ? "#047857" : "#475467"};background:${strand.recommended ? "#D1FAE5" : "#EAECF0"};">${strand.recommended ? "Order this strand" : "Reference strand"}</span>
      </div>
      <p style="font-size:12px;color:#555;margin:0 0 8px 0;">${strand.note}</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
        ${strand.regions.map((region) => `<span style="display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:700;color:#1f2937;background:${region.color};">${region.label} (${region.end - region.start} nt)</span>`).join("")}
        <span style="display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:700;color:#1f2937;background:${PM_GUIDE_COLORS.site};">gRNA site</span>
        <span style="display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:700;color:#92400E;background:${PM_GUIDE_COLORS.pam};">PAM</span>
      </div>
      ${buildPmAnnotatedSequenceHtml("WT", strand.wt, strand.diffIndexes, "wt", strand.regions, strand.guide)}
      ${buildPmAnnotatedSequenceHtml("Donor", strand.donor, strand.diffIndexes, "donor", strand.regions, strand.guide)}
    </div>
  `;
}

function buildPmDonorHtml(donor) {
  const comparison = buildPmDonorComparison(donor);
  const strands = buildPmStrandModels(donor);
  return `
    <h3 style="color:#2E75B6;margin:18px 0 8px 0;">${donor.n} (${donor.sl})</h3>
    <p style="font-size:12px;color:#555;margin:0 0 10px 0;">Linked guide: ${donor.guideName}</p>
    ${strands.map((strand) => buildPmStrandCardHtml(strand)).join("")}
    <div style="margin:0 0 14px 0;padding:12px;border:1px solid #d7dee7;border-radius:12px;background:#f8fafc;">
      <div style="color:#667085;font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:8px;">Coding Frame View</div>
      ${buildAlignedRowHtml("WT codons", { prefix: comparison.wt.prefix, tokens: comparison.wt.codons, suffix: comparison.wt.suffix }, comparison.diffCodonIndexes, "wt")}
      ${buildAlignedRowHtml("Donor codons", { prefix: comparison.donor.prefix, tokens: comparison.donor.codons, suffix: comparison.donor.suffix }, comparison.diffCodonIndexes, "donor")}
      ${buildAlignedRowHtml("WT amino acids", { tokens: comparison.wtAa }, comparison.diffAaIndexes, "wt")}
      ${buildAlignedRowHtml("Donor amino acids", { tokens: comparison.donorAa }, comparison.diffAaIndexes, "donor")}
    </div>
  `;
}

function buildAnnotatedDonorHtml(sequence, annotations = []) {
  const findAnnotation = (index) => annotations.find((item) => index >= item.start && index < item.end);
  const legend = annotations.map((item) => `<span style="display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:700;color:${item.color};background:${item.color}14;border:1px solid ${item.color}33;">${item.label} (${item.end - item.start} bp)</span>`).join("");
  const sequenceHtml = (sequence || "").split("").map((base, index) => {
    const annotation = findAnnotation(index);
    return `<span style="color:${annotation?.color || "#111827"};font-weight:${annotation ? 800 : 400};">${base}</span>`;
  }).join("");
  return `
    <div style="margin:0 0 14px 0;">
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;">${legend}</div>
      <div style="font-family:Consolas,monospace;font-size:12px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere;">${sequenceHtml}</div>
    </div>
  `;
}

function buildReviewListHtml(items) {
  if (!items.length) return "<p style=\"font-size:13px;line-height:1.45;\">No automated warnings were triggered. Manual review is still required before synthesis or ordering.</p>";
  return `<ul style="padding-left:18px;">${items.map((item) => `<li style="margin:0 0 8px 0;color:${item.level === "warning" ? "#B42318" : "#344054"};"><strong>${item.level === "warning" ? "Warning" : "Check"}:</strong> ${item.text}</li>`).join("")}</ul>`;
}

function buildHistoricalRowsHtml(matches) {
  if (!matches.length) return "";
  const rows = matches.map((record) => [
    record.targetGene || "n/a",
    record.parentalLine || "n/a",
    record.establishedLine || "n/a",
    (record.guides || []).map((guide) => guide.sequence).filter(Boolean).join("<br/>") || "n/a",
    record.donorSequence || "N/A",
    record.guideOverlap ? `${record.guideOverlap} exact` : "none",
  ]);
  return `<table>${tableHtml([["Gene", "Parental line", "Established line", "Used gRNAs", "Used donor", "Guide overlap"]], true)}${tableHtml(rows)}</table>`;
}

function buildReportHtml(meta, result, fileName, historicalContext, reviewItems) {
  if (!result) return "";
  const headerRows = [
    ["Group", meta.clientName || "n/a"],
    ["IRIS ID", meta.irisId || "[to be assigned]"],
  ];
  const geneRows = buildGeneInfoRows(meta, result, fileName);
  const guideRows = (result?.gs || []).map((guide) => [guide.n, renderGuideSequence(guide.sp, guide.pm, true), `${guide.str} strand`, `${guide.gc}%`, guide.arm || guide.note || ""]);
  const primerRows = buildPrimerRows(result);
  const ssOdnNotes = buildSsOdnNotes(result);
  const sectionTitle = result.type === "pm" ? "ssODN Donor Templates" : result.type === "ko" ? "Knockout Design" : "Donor Design";
  const donorBlock = result.type === "pm"
    ? ((result.os || []).length
      ? (result.os || []).map((donor) => buildPmDonorHtml(donor)).join("")
      : `<p style="font-size:13px;line-height:1.45;color:#B42318;">No ssODN donor could be rendered for this SNP design. This usually means the asymmetric donor window ran outside the uploaded sequence bounds.</p>`)
    : result.type === "ko"
      ? `<p style="font-size:13px;line-height:1.45;">No donor is required for knockout design. Use the paired gRNAs below for deletion/NHEJ-based disruption.</p>`
      : buildAnnotatedDonorHtml(result.donor || "", result.donorAnnotations || []);
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
  <h2>4. ${sectionTitle}</h2>
  <p class="note">${result.type === "pm" ? "WT and donor templates are listed together for review." : result.type === "ko" ? "Knockout designs use paired gRNAs and do not require an HDR donor." : "HDR donor sequence is listed in full below."}</p>
  ${donorBlock}
  ${ssOdnNotes.length ? `<div>${ssOdnNotes.map((line) => `<p style="color:#CC0000;font-weight:700;margin:6px 0;">${line}</p>`).join("")}</div>` : ""}
  ${historicalContext?.topMatches?.length ? `<h2>5. Matched Historical Records</h2>${buildHistoricalRowsHtml(historicalContext.topMatches)}` : ""}
  <h2>${historicalContext?.topMatches?.length ? "6" : "5"}. Review Checkpoints</h2>
  ${buildReviewListHtml(reviewItems)}
  <h2>${historicalContext?.topMatches?.length ? "7" : "6"}. Additional Info</h2>
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

function PmAnnotatedSequenceRow({ label, sequence, diffIndexes, mode, regions, guide }) {
  const diffSet = new Set(diffIndexes);
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ color: "#667085", fontSize: 11, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "Consolas, monospace", fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
        {(sequence || "").split("").map((base, index) => {
          const changed = diffSet.has(index);
          const region = findPmRegion(index, regions);
          const inGuide = guide && index >= guide.siteStart && index < guide.siteEnd;
          const inPam = guide && index >= guide.pamStart && index < guide.pamEnd;
          return (
            <span
              key={`${label}-${index}`}
              style={{
                background: inPam ? PM_GUIDE_COLORS.pam : changed && mode === "donor" ? "#FDE68A" : inGuide ? PM_GUIDE_COLORS.site : (region?.color || "transparent"),
                color: changed && mode === "wt" ? "#CC0000" : "#111827",
                textDecoration: changed && mode === "wt" ? "line-through" : "none",
                fontWeight: inGuide || changed ? 800 : 400,
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

function AlignedTokenRow({ label, prefix = "", tokens = [], suffix = "", diffIndexes = [], mode = "donor", tokenWidth = "4ch" }) {
  const changedSet = new Set(diffIndexes);
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ color: "#667085", fontSize: 11, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "Consolas, monospace", fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
        {prefix ? <span style={{ color: "#98A2B3" }}>{prefix}</span> : null}
        {tokens.map((token, index) => {
          const changed = changedSet.has(index);
          return (
            <span
              key={`${label}-${token}-${index}`}
              style={{
                display: "inline-block",
                minWidth: tokenWidth,
                marginRight: 6,
                textAlign: "center",
                color: changed ? (mode === "wt" ? "#CC0000" : "#111827") : "#111827",
                background: changed && mode === "donor" ? "#FFF59D" : "transparent",
                textDecoration: changed && mode === "wt" ? "line-through" : "none",
                fontWeight: changed ? 800 : 400,
              }}
            >
              {token}
            </span>
          );
        })}
        {suffix ? <span style={{ color: "#98A2B3" }}>{suffix}</span> : null}
      </div>
    </div>
  );
}

function PmDonorPreview({ donor }) {
  const comparison = buildPmDonorComparison(donor);
  const strands = buildPmStrandModels(donor);
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontWeight: 700, color: "#2E75B6", marginBottom: 6 }}>{donor.n} ({donor.sl})</div>
      <div style={{ color: "#555", fontSize: 12, marginBottom: 10 }}>Linked guide: {donor.guideName}</div>
      {strands.map((strand) => (
        <div key={strand.key} style={{ marginBottom: 12, padding: 12, border: `1px solid ${strand.recommended ? "#10B98155" : "#d7dee7"}`, borderRadius: 12, background: strand.recommended ? "#ECFDF5" : "#f8fafc" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontWeight: 700, color: "#1f2937" }}>{strand.title}</div>
            <Badge color={strand.recommended ? COLORS.success : COLORS.muted}>{strand.recommended ? "Order This Strand" : "Reference Strand"}</Badge>
          </div>
          <div style={{ color: "#555", fontSize: 12, marginBottom: 8 }}>{strand.note}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            {strand.regions.map((region) => <span key={`${strand.key}-${region.label}-${region.start}`} style={{ display: "inline-flex", alignItems: "center", padding: "4px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, color: "#1f2937", background: region.color }}>{region.label} ({region.end - region.start} nt)</span>)}
            <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, color: "#1f2937", background: PM_GUIDE_COLORS.site }}>gRNA site</span>
            <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, color: "#92400E", background: PM_GUIDE_COLORS.pam }}>PAM</span>
          </div>
          <PmAnnotatedSequenceRow label="WT" sequence={strand.wt} diffIndexes={strand.diffIndexes} mode="wt" regions={strand.regions} guide={strand.guide} />
          <PmAnnotatedSequenceRow label="Donor" sequence={strand.donor} diffIndexes={strand.diffIndexes} mode="donor" regions={strand.regions} guide={strand.guide} />
        </div>
      ))}
      <div style={{ marginTop: 10, padding: 12, border: "1px solid #d7dee7", borderRadius: 12, background: "#f8fafc" }}>
        <div style={{ color: "#667085", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>Coding frame view</div>
        <AlignedTokenRow label="WT codons" prefix={comparison.wt.prefix} tokens={comparison.wt.codons} suffix={comparison.wt.suffix} diffIndexes={comparison.diffCodonIndexes} mode="wt" />
        <AlignedTokenRow label="Donor codons" prefix={comparison.donor.prefix} tokens={comparison.donor.codons} suffix={comparison.donor.suffix} diffIndexes={comparison.diffCodonIndexes} mode="donor" />
        <AlignedTokenRow label="WT amino acids" tokens={comparison.wtAa} diffIndexes={comparison.diffAaIndexes} mode="wt" />
        <AlignedTokenRow label="Donor amino acids" tokens={comparison.donorAa} diffIndexes={comparison.diffAaIndexes} mode="donor" />
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
  const [copyState, setCopyState] = useState("");
  const [batchRows, setBatchRows] = useState(() => resizeBatchRows([], 1));
  const [batchResults, setBatchResults] = useState([]);
  const [batchError, setBatchError] = useState("");
  const [batchCopyState, setBatchCopyState] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [batchFolderEntries, setBatchFolderEntries] = useState([]);
  const [requestText, setRequestText] = useState("");
  const [batchDefinitionText, setBatchDefinitionText] = useState("");
  const [idtDefaults, setIdtDefaults] = useState({
    crisprScale: "",
    oligoScale: "",
    oligoPurification: "",
    hdrScale: "",
    hdrModification: "",
  });

  const ctCassetteOptions = useMemo(() => Object.keys(CASSETTES).filter((key) => !key.startsWith("N:")), []);
  const ntCassetteOptions = useMemo(() => Object.keys(CASSETTES), []);
  const batchSuccessfulResults = useMemo(() => batchResults.filter((entry) => entry.status === "success"), [batchResults]);
  const selectedEntry = useMemo(
    () => batchSuccessfulResults.find((entry) => entry.rowId === selectedProjectId) || batchSuccessfulResults[0] || null,
    [batchSuccessfulResults, selectedProjectId],
  );
  const selectedRowMeta = useMemo(() => buildRowMeta(selectedEntry?.row, selectedEntry?.result), [selectedEntry]);
  const folderName = useMemo(() => buildProjectFolderName(selectedRowMeta), [selectedRowMeta]);
  const historicalContext = useMemo(
    () => buildHistoricalContext(selectedRowMeta, selectedEntry?.result, selectedEntry?.row?.projectType),
    [selectedRowMeta, selectedEntry],
  );
  const reviewItems = useMemo(
    () => buildReviewItems(selectedRowMeta, selectedEntry?.result, selectedEntry?.row?.fileName),
    [selectedRowMeta, selectedEntry],
  );
  const reportHtml = useMemo(
    () => buildReportHtml(selectedRowMeta, selectedEntry?.result, selectedEntry?.row?.fileName, historicalContext, reviewItems),
    [selectedRowMeta, selectedEntry, historicalContext, reviewItems],
  );
  const singleOrderRows = useMemo(() => {
    if (!selectedEntry?.result) return [];
    return buildBatchOrderRows([{
      slot: selectedEntry.slot,
      row: selectedEntry.row,
      status: "success",
      result: selectedEntry.result,
    }]);
  }, [selectedEntry]);
  const batchOrderRows = useMemo(() => buildBatchOrderRows(batchSuccessfulResults), [batchSuccessfulResults]);
  const batchFolderLibrary = useMemo(() => buildFolderLibrary(batchFolderEntries), [batchFolderEntries]);
  const singleIdtTemplateRows = useMemo(() => buildIdtTemplateRows(singleOrderRows, idtDefaults), [singleOrderRows, idtDefaults]);
  const idtTemplateRows = useMemo(() => buildIdtTemplateRows(batchOrderRows, idtDefaults), [batchOrderRows, idtDefaults]);
  const batchDonorRows = useMemo(() => batchOrderRows.filter((row) => row.itemType === "Donor"), [batchOrderRows]);

  useEffect(() => {
    if (!batchSuccessfulResults.length) {
      if (selectedProjectId) setSelectedProjectId("");
      return;
    }
    if (!batchSuccessfulResults.some((entry) => entry.rowId === selectedProjectId)) {
      setSelectedProjectId(batchSuccessfulResults[0].rowId);
    }
  }, [batchSuccessfulResults, selectedProjectId]);

  useEffect(() => {
    if (!batchFolderEntries.length) return;
    setBatchRows((current) => current.map((row) => {
      if (row.gbRaw && row.fileName) return row;
      const match = batchFolderLibrary.byGene.get(normalizeGeneToken(row.gene));
      if (!match) return row;
      const nextRow = {
        ...row,
        gbRaw: match.gbRaw,
        fileName: match.fileName,
      };
      return {
        ...nextRow,
        parseIssue: summarizeRowParseIssue(nextRow, match),
      };
    }));
  }, [batchFolderEntries, batchFolderLibrary]);

  const updateBatchRow = (index, key, value) => {
    setBatchRows((current) => current.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      const nextRow = { ...row, [key]: value };
      if (key === "gene" && !nextRow.fileName && batchFolderLibrary.byGene.has(normalizeGeneToken(value))) {
        const match = batchFolderLibrary.byGene.get(normalizeGeneToken(value));
        nextRow.gbRaw = match.gbRaw;
        nextRow.fileName = match.fileName;
      }
      nextRow.parseIssue = summarizeRowParseIssue(nextRow);
      return nextRow;
    }));
    setBatchResults([]);
    setBatchError("");
    setBatchCopyState("");
  };
  const setProjectCount = (nextSize) => {
    const parsed = Number(nextSize);
    const safeSize = Number.isFinite(parsed) ? Math.max(1, Math.min(48, Math.floor(parsed))) : 1;
    setBatchRows((current) => resizeBatchRows(current, safeSize));
    setBatchResults((current) => current.filter((entry) => entry.slot <= safeSize));
  };
  const addProjectRow = () => setBatchRows((current) => resizeBatchRows(current, current.length + 1));
  const removeProjectRow = (index) => {
    setBatchRows((current) => {
      if (current.length <= 1) return current;
      const next = current.filter((_, rowIndex) => rowIndex !== index);
      return next.map((row, rowIndex) => ({ ...row, id: `batch-${rowIndex + 1}` }));
    });
    setBatchResults([]);
  };
  const duplicateProjectRow = (index) => {
    setBatchRows((current) => {
      const source = current[index];
      if (!source) return current;
      const clone = { ...source, id: `batch-${current.length + 1}` };
      return [...current.slice(0, index + 1), clone, ...current.slice(index + 1)].map((row, rowIndex) => ({ ...row, id: `batch-${rowIndex + 1}` }));
    });
    setBatchResults([]);
  };
  const updateIdtDefault = (key, value) => setIdtDefaults((current) => ({ ...current, [key]: value }));

  const onBatchFile = useCallback((index, event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBatchResults([]);
    setBatchError("");
    setBatchCopyState("");
    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const content = readerEvent.target?.result || "";
      setBatchRows((current) => current.map((row, rowIndex) => (rowIndex === index ? {
        ...row,
        gbRaw: content,
        fileName: file.name,
        label: row.label || file.name.replace(/\.[^.]+$/, ""),
        gene: row.gene || file.name.replace(/\.[^.]+$/, ""),
        parseIssue: summarizeRowParseIssue({
          ...row,
          gbRaw: content,
          fileName: file.name,
          label: row.label || file.name.replace(/\.[^.]+$/, ""),
          gene: row.gene || file.name.replace(/\.[^.]+$/, ""),
        }),
      } : row)));
    };
    reader.onerror = () => setBatchError(`Failed to read ${file.name}.`);
    reader.readAsText(file);
  }, []);

  const onBatchFolder = useCallback(async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    try {
      const entries = await Promise.all(files
        .filter((file) => /\.(gb|gbk|genbank|txt)$/i.test(file.name))
        .map((file) => new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (readerEvent) => resolve({
            fileName: file.name,
            relativePath: file.webkitRelativePath || file.name,
            gbRaw: readerEvent.target?.result || "",
          });
          reader.onerror = () => reject(new Error(`Failed to read ${file.name}.`));
          reader.readAsText(file);
        })));
      setBatchFolderEntries(entries);
      setBatchError("");
      setBatchCopyState("");
    } catch (folderError) {
      setBatchError(folderError?.message || "Folder import failed.");
    }
  }, []);

  const runBatch = () => {
    setBatchError("");
    setBatchResults([]);
    setBatchCopyState("");
    const activeRows = batchRows.filter((row) => row.gbRaw);
    if (!activeRows.length) {
      setBatchError("Upload at least one GenBank file in the design table.");
      return;
    }
    const nextResults = batchRows.map((row, index) => {
      const slot = index + 1;
      if (!row.gbRaw) return { slot, rowId: row.id, row, status: "empty" };
      try {
        const design = runDesign(row.projectType, row.gbRaw, row.mutation, row.tag, row.homologyArm);
        if (design.err) return { slot, rowId: row.id, row, status: "error", error: design.err, debug: design.dbg || "" };
        return { slot, rowId: row.id, row, status: "success", result: design, debug: design.dbg || "" };
      } catch (runError) {
        return { slot, rowId: row.id, row, status: "error", error: runError?.message || "Design generation failed unexpectedly.", debug: "" };
      }
    });
    setBatchResults(nextResults);
    if (!nextResults.some((entry) => entry.status === "success")) setBatchError("No batch designs were generated successfully.");
  };

  const applyBatchDefinitions = () => {
    setBatchError("");
    setBatchResults([]);
    setBatchCopyState("");
    try {
      const definitions = parseBatchDefinitionText(batchDefinitionText);
      if (!definitions.length) {
        setBatchError("Paste at least one batch definition line.");
        return;
      }
      if (!batchFolderEntries.length) {
        setBatchError("Upload a folder of GenBank files first.");
        return;
      }

      const mappedRows = definitions.map((definition, index) => {
        if (!definition.fileToken) throw new Error(`Line ${definition.lineNumber}: missing file name.`);
        if (!definition.projectType) throw new Error(`Line ${definition.lineNumber}: design type must be pm, ko, ct, or nt.`);
        if (definition.projectType === "pm" && !definition.modification) throw new Error(`Line ${definition.lineNumber}: point mutation designs need a mutation such as N32R.`);
        if ((definition.projectType === "ct" || definition.projectType === "nt") && !definition.modification) throw new Error(`Line ${definition.lineNumber}: insert designs need a cassette name such as SD40-2xHA.`);
        const lookupKey = normalizeFileLookupKey(definition.fileToken);
        const fileEntry = batchFolderLibrary.byName.get(lookupKey) || batchFolderLibrary.byStem.get(lookupKey);
        if (!fileEntry) throw new Error(`Line ${definition.lineNumber}: could not find GenBank file "${definition.fileToken}" in the uploaded folder.`);
        return {
          ...createBatchRow(index),
          label: definition.label || fileEntry.fileName.replace(/\.[^.]+$/, ""),
          projectType: definition.projectType,
          mutation: definition.projectType === "pm" ? definition.modification : "",
          tag: definition.projectType === "ct" || definition.projectType === "nt" ? definition.modification : "SD40-2xHA",
          homologyArm: definition.projectType === "ct" || definition.projectType === "nt" ? (definition.homologyArm || "250") : "250",
          gbRaw: fileEntry.gbRaw,
          fileName: fileEntry.fileName,
        };
      });

      setBatchRows(resizeBatchRows(mappedRows, Math.max(1, mappedRows.length)));
    } catch (definitionError) {
      setBatchError(definitionError?.message || "Failed to apply batch definitions.");
    }
  };

  const parseRequests = () => {
    setBatchError("");
    setBatchResults([]);
    setBatchCopyState("");
    const parsedRows = parseRequestText(requestText, batchFolderLibrary);
    if (!parsedRows.length) {
      setBatchError("Paste at least one request line to parse.");
      return;
    }
    setBatchRows(parsedRows);
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

  const downloadAllReports = () => {
    if (!batchSuccessfulResults.length) return;
    batchSuccessfulResults.forEach((entry, index) => {
      const entryMeta = buildRowMeta(entry.row, entry.result);
      const entryHistorical = buildHistoricalContext(entryMeta, entry.result, entry.row?.projectType);
      const entryReview = buildReviewItems(entryMeta, entry.result, entry.row?.fileName);
      const entryHtml = buildReportHtml(entryMeta, entry.result, entry.row?.fileName, entryHistorical, entryReview);
      const blob = new Blob([entryHtml], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${String(entry.slot).padStart(2, "0")}_${buildSafeToken(buildProjectFolderName(entryMeta), `design_${entry.slot}`)}.html`;
      window.setTimeout(() => {
        link.click();
        URL.revokeObjectURL(url);
      }, index * 150);
    });
    setCopyState(`Started download for ${batchSuccessfulResults.length} HTML reports.`);
  };

  const downloadIdtTemplate = (kind) => {
    const fileName = downloadIdtWorkbook(kind, idtTemplateRows);
    if (!fileName) return;
    setBatchCopyState(`Downloaded ${fileName}.`);
  };

  const downloadSingleIdtTemplate = (kind) => {
    const filePrefix = `${buildSafeToken(selectedEntry?.result?.gene, "GENE")}_`;
    const fileName = downloadIdtWorkbook(kind, singleIdtTemplateRows, filePrefix);
    if (!fileName) return;
    setCopyState(`Downloaded ${fileName}.`);
  };
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
                <Badge color={COLORS.success}>{HISTORICAL_PROJECTS_SUMMARY.recordCount} established references</Badge>
                <Badge color={COLORS.accentAlt}>Report-style preview</Badge>
                <Badge color={COLORS.success}>HTML export for Word</Badge>
              </div>
            </div>
            <div style={{ maxWidth: 360, color: COLORS.muted, fontSize: 13, lineHeight: 1.5 }}>
              This version is focused on producing the final design document after the edit is designed, following the same structured format as your APOE strategy example.
            </div>
          </div>
        </div>

        <div style={{ ...CARD_STYLE, marginTop: 18 }}>
          <SectionTitle>1. Design Requests</SectionTitle>
          <div style={{ color: COLORS.muted, fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
            Paste one request per line, upload a GenBank folder once, then review only the parsed rows that need adjustment.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12, alignItems: "center" }}>
            <label style={{ ...FIELD_STYLE, width: "auto", display: "inline-flex", alignItems: "center", gap: 10, cursor: "pointer", fontWeight: 700 }}>
              <span style={{ color: COLORS.accent }}>Upload GenBank folder</span>
              <input type="file" accept=".gb,.gbk,.genbank,.txt" multiple webkitdirectory="" directory="" onChange={onBatchFolder} style={{ display: "none" }} />
            </label>
            <button type="button" onClick={parseRequests} style={{ ...FIELD_STYLE, width: "auto", cursor: "pointer", fontWeight: 700 }}>Parse requests</button>
            <button type="button" onClick={addProjectRow} style={{ ...FIELD_STYLE, width: "auto", cursor: "pointer", fontWeight: 700 }}>Add blank row</button>
            <Badge color={COLORS.accent}>{batchFolderEntries.length} folder files</Badge>
            <Badge color={COLORS.success}>{batchRows.length} parsed rows</Badge>
            <Badge color={COLORS.accentAlt}>{batchSuccessfulResults.length} successful</Badge>
            <Badge>{batchOrderRows.length} order lines</Badge>
          </div>

          <div style={{ ...CARD_STYLE, background: COLORS.panelAlt, padding: 14, marginBottom: 14 }}>
            <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 8 }}>Paste requests</div>
            <div style={{ color: COLORS.muted, fontSize: 13, marginBottom: 10, lineHeight: 1.5 }}>
              Use simple natural-language lines. The parser will infer KO, SNP, C-terminal, or N-terminal design types and match GenBank files by gene where possible.
            </div>
            <label style={{ display: "block" }}>
              <div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Request lines</div>
              <textarea
                value={requestText}
                onChange={(event) => setRequestText(event.target.value)}
                style={{ ...FIELD_STYLE, minHeight: 126, resize: "vertical", fontFamily: 'Consolas, "Courier New", monospace' }}
                placeholder={"PSEN1 G384A BIHi005-A\nSORCS1 knockout BIHi274-A\nAPP C-terminal SD40-2xHA HMGUi001-A\nSNCA N-terminal N:EGFP-Linker BIHi268-A"}
              />
            </label>
            <div style={{ color: COLORS.dim, fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>
              The parser works best with: `GENE edit cell-line`. If a line cannot infer gene, cell line, mutation, cassette, or GenBank file, the row below will be flagged for review.
            </div>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            {batchRows.map((row, index) => {
              const slot = index + 1;
              const batchStatus = batchResults.find((entry) => entry.rowId === row.id);
              return (
                <div key={row.id} style={{ padding: 14, borderRadius: 14, border: `1px solid ${COLORS.border}`, background: COLORS.panelAlt }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 700 }}>Design {slot}</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      {row.fileName && <Badge color={COLORS.success}>{row.fileName}</Badge>}
                      {row.parseIssue && <Badge color={COLORS.accentAlt}>{row.parseIssue}</Badge>}
                      {batchStatus?.status === "success" && <Badge color={COLORS.success}>{formatBatchDesignLabel({ ...row, slot }, batchStatus.result)}</Badge>}
                      {batchStatus?.status === "error" && <Badge color={COLORS.danger}>Error</Badge>}
                      {batchSuccessfulResults.length > 1 && batchStatus?.status === "success" && (
                        <button type="button" onClick={() => setSelectedProjectId(row.id)} style={{ ...FIELD_STYLE, width: "auto", cursor: "pointer", fontWeight: 700 }}>
                          {selectedEntry?.rowId === row.id ? "Shown below" : "Show report"}
                        </button>
                      )}
                      <button type="button" onClick={() => duplicateProjectRow(index)} style={{ ...FIELD_STYLE, width: "auto", cursor: "pointer", fontWeight: 700 }}>Duplicate</button>
                      <button type="button" onClick={() => removeProjectRow(index)} disabled={batchRows.length <= 1} style={{ ...FIELD_STYLE, width: "auto", cursor: batchRows.length > 1 ? "pointer" : "not-allowed", fontWeight: 700 }}>Remove</button>
                    </div>
                  </div>

                  <Grid>
                    <label><div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>IRIS ID</div><input value={row.irisId} onChange={(event) => updateBatchRow(index, "irisId", event.target.value)} style={FIELD_STYLE} placeholder="72860" /></label>
                    <label><div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Group</div><input value={row.clientName} onChange={(event) => updateBatchRow(index, "clientName", event.target.value)} style={FIELD_STYLE} placeholder="Internal / sponsor name" /></label>
                    <label><div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Gene / locus</div><input value={row.gene} onChange={(event) => updateBatchRow(index, "gene", event.target.value)} style={FIELD_STYLE} placeholder="APOE" /></label>
                    <label><div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Cell line</div><input value={row.cellLine} onChange={(event) => updateBatchRow(index, "cellLine", event.target.value)} style={FIELD_STYLE} placeholder="BIHi005-A" /></label>
                    <label><div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Project label</div><input value={row.label} onChange={(event) => updateBatchRow(index, "label", event.target.value)} style={FIELD_STYLE} placeholder={`Project ${slot}`} /></label>
                    <label><div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Design type</div><select value={row.projectType} onChange={(event) => updateBatchRow(index, "projectType", event.target.value)} style={FIELD_STYLE}>{PROJECT_TYPES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
                  </Grid>

                  <label style={{ display: "block", marginTop: 12 }}><div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Requested edit summary</div><input value={row.editSummary} onChange={(event) => updateBatchRow(index, "editSummary", event.target.value)} style={FIELD_STYLE} placeholder="APOE2 (p.Arg176Cys) SNP knockin" /></label>
                  <label style={{ display: "block", marginTop: 12 }}><div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Notes / assumptions</div><textarea value={row.notes} onChange={(event) => updateBatchRow(index, "notes", event.target.value)} style={{ ...FIELD_STYLE, minHeight: 84, resize: "vertical" }} placeholder="Transcript assumptions, strand notes, delivery mode, client constraints..." /></label>

                  <label style={{ display: "block", marginTop: 12 }}>
                    <div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Reference GenBank</div>
                    <label style={{ ...FIELD_STYLE, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                      <span style={{ color: row.fileName ? COLORS.success : COLORS.muted }}>{row.fileName || "Upload .gb / .gbk / .genbank"}</span>
                      <span style={{ color: COLORS.accent, fontWeight: 700 }}>Browse</span>
                      <input type="file" accept=".gb,.gbk,.genbank,.txt" onChange={(event) => onBatchFile(index, event)} style={{ display: "none" }} />
                    </label>
                  </label>

                  {row.projectType === "pm" && <label style={{ display: "block", marginTop: 12 }}><div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Mutation</div><input value={row.mutation} onChange={(event) => updateBatchRow(index, "mutation", event.target.value)} style={FIELD_STYLE} placeholder="R176C" /></label>}
                  {(row.projectType === "ct" || row.projectType === "nt") && (
                    <Grid>
                      <label><div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Cassette</div><select value={row.tag} onChange={(event) => updateBatchRow(index, "tag", event.target.value)} style={FIELD_STYLE}>{(row.projectType === "nt" ? ntCassetteOptions : ctCassetteOptions).map((option) => <option key={option} value={option}>{option} ({CASSETTES[option].len} bp)</option>)}</select></label>
                      <label><div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Homology arm</div><select value={row.homologyArm} onChange={(event) => updateBatchRow(index, "homologyArm", event.target.value)} style={FIELD_STYLE}><option value="250">250 bp</option><option value="500">500 bp</option><option value="750">750 bp</option></select></label>
                    </Grid>
                  )}
                  {row.projectType === "ko" && <div style={{ marginTop: 12, color: COLORS.muted, fontSize: 12 }}>KO uses the uploaded GenBank only. No mutation or donor cassette entry is needed.</div>}

                  {batchStatus?.status === "error" && (
                    <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "rgba(251,113,133,0.10)", border: `1px solid ${COLORS.danger}55`, color: COLORS.danger }}>
                      {batchStatus.error}
                    </div>
                  )}
                  {batchStatus?.status === "success" && (
                    <div style={{ marginTop: 10, color: COLORS.muted, fontSize: 12, lineHeight: 1.5 }}>
                      {batchStatus.result.gs?.length || 0} gRNAs | {(batchStatus.result.type === "pm" ? batchStatus.result.os?.length : batchStatus.result.donor ? 1 : 0) || 0} donor entries | {batchStatus.result.ps?.length || 0} primers
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
            <button type="button" onClick={runBatch} style={{ ...FIELD_STYLE, width: "auto", cursor: "pointer", fontWeight: 700, background: "linear-gradient(135deg, #2dd4bf, #f59e0b)", color: "#07111c", border: "none" }}>
              Generate project designs
            </button>
            {batchCopyState && <Badge color={COLORS.success}>{batchCopyState}</Badge>}
          </div>
          {batchError && <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "rgba(251,113,133,0.10)", border: `1px solid ${COLORS.danger}55`, color: COLORS.danger }}>{batchError}</div>}
        </div>

        <div style={{ ...CARD_STYLE, marginTop: 18 }}>
          <SectionTitle>2. Final Report</SectionTitle>
          <div style={{ color: COLORS.muted, fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>This export is modeled on your APOE strategy document. Download the HTML file and open it in Word if you want to save it as a `.docx` document afterward.</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
            <button type="button" disabled={!reportHtml} onClick={downloadReport} style={{ ...FIELD_STYLE, width: "auto", cursor: reportHtml ? "pointer" : "not-allowed", fontWeight: 700 }}>Download HTML report</button>
            <button type="button" disabled={batchSuccessfulResults.length < 2} onClick={downloadAllReports} style={{ ...FIELD_STYLE, width: "auto", cursor: batchSuccessfulResults.length >= 2 ? "pointer" : "not-allowed", fontWeight: 700 }}>Download all HTML reports</button>
            <button type="button" disabled={!selectedEntry?.result} onClick={() => copyText(buildDesignSummary(selectedEntry.result), "Design summary")} style={{ ...FIELD_STYLE, width: "auto", cursor: selectedEntry?.result ? "pointer" : "not-allowed", fontWeight: 700 }}>Copy design summary</button>
            {copyState && <Badge color={COLORS.success}>{copyState}</Badge>}
          </div>

          {selectedEntry?.result && (
            <div style={{ marginBottom: 14, padding: 12, borderRadius: 12, background: COLORS.panelAlt, border: `1px solid ${COLORS.border}` }}>
              <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 8 }}>Selected Design IDT Export</div>
              <div style={{ color: COLORS.muted, fontSize: 13, marginBottom: 10, lineHeight: 1.5 }}>
                Export the currently selected project directly into the same IDT upload template format used in the multi-project order sheet.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <button type="button" disabled={!singleIdtTemplateRows.crispr.length} onClick={() => downloadSingleIdtTemplate("crispr")} style={{ ...FIELD_STYLE, width: "auto", cursor: singleIdtTemplateRows.crispr.length ? "pointer" : "not-allowed", fontWeight: 700 }}>
                  Download single IDT CRISPR template
                </button>
                <button type="button" disabled={!singleIdtTemplateRows.oligo.length} onClick={() => downloadSingleIdtTemplate("oligo")} style={{ ...FIELD_STYLE, width: "auto", cursor: singleIdtTemplateRows.oligo.length ? "pointer" : "not-allowed", fontWeight: 700 }}>
                  Download single IDT primer template
                </button>
                <button type="button" disabled={!singleIdtTemplateRows.hdr.length} onClick={() => downloadSingleIdtTemplate("hdr")} style={{ ...FIELD_STYLE, width: "auto", cursor: singleIdtTemplateRows.hdr.length ? "pointer" : "not-allowed", fontWeight: 700 }}>
                  Download single IDT HDR template
                </button>
              </div>
            </div>
          )}

          <div style={{ padding: 14, borderRadius: 12, background: "#f8fafc", color: "#333", border: "1px solid #d7dee7", minHeight: 380 }}>
            {!selectedEntry?.result && <div style={{ color: "#667085" }}>Generate at least one successful project design to populate the final report preview.</div>}
            {selectedEntry?.result && (
              <>
                {batchSuccessfulResults.length > 1 && (
                  <>
                    <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Generated Projects</div>
                    <div style={{ color: "#667085", fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
                      {batchSuccessfulResults.length} designs were generated successfully. The detailed report below shows one selected design at a time.
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
                      <thead>
                        <tr>{["Design", "IRIS ID", "Gene", "Cell line", "Edit", "Status"].map((label) => <th key={label} style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#2E75B6", color: "#ffffff", textAlign: "left" }}>{label}</th>)}</tr>
                      </thead>
                      <tbody>
                        {batchSuccessfulResults.map((entry) => (
                          <tr key={entry.rowId} onClick={() => setSelectedProjectId(entry.rowId)} style={{ cursor: "pointer" }}>
                            <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff" }}>{entry.slot}</td>
                            <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff" }}>{entry.row.irisId || "n/a"}</td>
                            <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff" }}>{entry.result.gene || entry.row.gene || "n/a"}</td>
                            <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff" }}>{entry.row.cellLine || "n/a"}</td>
                            <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff" }}>{formatBatchDesignLabel({ ...entry.row, slot: entry.slot }, entry.result)}</td>
                            <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: entry.rowId === selectedEntry.rowId ? "#ECFDF3" : "#ffffff", fontWeight: 700 }}>
                              {entry.rowId === selectedEntry.rowId ? "Shown below" : "Also generated"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
                {batchSuccessfulResults.length > 1 && (
                  <label style={{ display: "block", marginBottom: 14 }}>
                    <div style={{ color: "#667085", fontSize: 12, marginBottom: 6 }}>Detailed report design</div>
                    <select value={selectedEntry.rowId} onChange={(event) => setSelectedProjectId(event.target.value)} style={{ ...FIELD_STYLE, background: "#ffffff", color: "#111827", borderColor: "#d7dee7" }}>
                      {batchSuccessfulResults.map((entry) => (
                        <option key={entry.rowId} value={entry.rowId}>{formatBatchDesignLabel({ ...entry.row, slot: entry.slot }, entry.result)}</option>
                      ))}
                    </select>
                  </label>
                )}
                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
                  <tbody>
                    {[
                      ["Group", selectedRowMeta.clientName || "n/a"],
                      ["IRIS ID", selectedRowMeta.irisId || "[to be assigned]"],
                    ].map(([label, value]) => (
                      <tr key={label}>
                        <td style={{ width: 180, padding: "8px 10px", border: "1px solid #bbbbbb", background: "#F0F4F8", fontWeight: 700 }}>{label}</td>
                        <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff" }}>{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>Design: {formatDesignLabel(selectedRowMeta, selectedEntry.result)}</div>
                <div style={{ color: "#555", fontSize: 13, marginBottom: 16 }}>{selectedRowMeta.notes || "Final strategy report preview."}</div>

                <div style={{ fontSize: 18, fontWeight: 700, margin: "14px 0 8px 0" }}>1. Gene Information</div>
                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
                  <tbody>
                    {buildGeneInfoRows(selectedRowMeta, selectedEntry.result, selectedEntry.row?.fileName).map(([label, value]) => (
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
                    {(selectedEntry.result?.gs || []).map((guide, rowIndex) => (
                      <tr key={rowIndex}>
                        <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff" }}>{guide.n}</td>
                        <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff" }}>{renderGuideSequence(guide.sp, guide.pm)}</td>
                        <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff" }}>{guide.str} strand</td>
                        <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff" }}>{guide.gc}%</td>
                        <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff" }}>{guide.arm || guide.note || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ fontSize: 18, fontWeight: 700, margin: "14px 0 8px 0" }}>3. Validation Primers</div>
                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
                  <thead>
                    <tr>{["Name", "Sequence"].map((label) => <th key={label} style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#2E75B6", color: "#ffffff", textAlign: "left" }}>{label}</th>)}</tr>
                  </thead>
                  <tbody>
                    {buildPrimerRows(selectedEntry.result).map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`} style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff", fontFamily: cellIndex === 1 ? "Consolas, monospace" : "inherit" }}>{cell}</td>)}</tr>)}
                  </tbody>
                </table>
                <div style={{ color: "#555", fontSize: 13, marginBottom: 16 }}>Expected amplicon: {selectedEntry.result.amp || "n/a"}</div>

                <div style={{ fontSize: 18, fontWeight: 700, margin: "14px 0 8px 0" }}>4. {selectedEntry.result.type === "pm" ? "ssODN Donor Templates" : selectedEntry.result.type === "ko" ? "Knockout Design" : "Donor Design"}</div>
                {selectedEntry.result.type === "pm" && (selectedEntry.result.os || []).map((donor) => <PmDonorPreview key={donor.n} donor={donor} />)}
                {selectedEntry.result.type === "ko" && (
                  <div style={{ color: "#555", fontSize: 13, lineHeight: 1.5 }}>
                    No donor is required for knockout design. Use the paired gRNAs above for deletion/NHEJ-based disruption.
                  </div>
                )}
                {(selectedEntry.result.type === "ct" || selectedEntry.result.type === "nt") && <AnnotatedDonor sequence={selectedEntry.result.donor} annotations={selectedEntry.result.donorAnnotations} />}
                {buildSsOdnNotes(selectedEntry.result).map((line) => <div key={line} style={{ color: "#CC0000", fontWeight: 700, marginTop: 6 }}>{line}</div>)}

                {historicalContext.topMatches.length > 0 && (
                  <>
                    <div style={{ fontSize: 18, fontWeight: 700, margin: "14px 0 8px 0" }}>5. Matched Historical Records</div>
                    <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
                      <thead>
                        <tr>{["Gene", "Parental line", "Established line", "Used gRNAs", "Used donor", "Guide overlap"].map((label) => <th key={label} style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#2E75B6", color: "#ffffff", textAlign: "left" }}>{label}</th>)}</tr>
                      </thead>
                      <tbody>
                        {historicalContext.topMatches.map((record) => (
                          <tr key={record.projectId}>
                            <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff" }}>{record.targetGene || "n/a"}</td>
                            <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff" }}>{record.parentalLine || "n/a"}</td>
                            <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff" }}>{record.establishedLine || "n/a"}</td>
                            <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff", fontFamily: "Consolas, monospace", fontSize: 12, wordBreak: "break-all" }}>
                              {(record.guides || []).map((guide) => guide.sequence).filter(Boolean).join(" | ") || "n/a"}
                            </td>
                            <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff", fontFamily: "Consolas, monospace", fontSize: 12, wordBreak: "break-all" }}>
                              {record.donorSequence || "N/A"}
                            </td>
                            <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff" }}>{record.guideOverlap ? `${record.guideOverlap} exact` : "none"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}

                <div style={{ fontSize: 18, fontWeight: 700, margin: "14px 0 8px 0" }}>{historicalContext.topMatches.length > 0 ? "6. Review Checkpoints" : "5. Review Checkpoints"}</div>
                {!reviewItems.length && <div style={{ color: "#555", fontSize: 13, marginBottom: 16 }}>No automated warnings were triggered. Manual review is still required before synthesis or ordering.</div>}
                {reviewItems.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    {reviewItems.map((item, index) => (
                      <div key={`${item.level}-${index}`} style={{ color: item.level === "warning" ? "#B42318" : "#344054", fontSize: 13, lineHeight: 1.5, marginBottom: 6 }}>
                        - <strong>{item.level === "warning" ? "Warning" : "Check"}:</strong> {item.text}
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ fontSize: 18, fontWeight: 700, margin: "14px 0 8px 0" }}>{historicalContext.topMatches.length > 0 ? "7. Additional Info" : "6. Additional Info"}</div>
                <div style={{ fontSize: 13, color: "#333", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{buildDesignSummary(selectedEntry.result)}</div>
              </>
            )}
          </div>
        </div>

        <div style={{ ...CARD_STYLE, marginTop: 18 }}>
          <SectionTitle>3. Order Exports</SectionTitle>
          <div style={{ color: COLORS.muted, fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
            Successful designs are flattened into IDT-ready order files for gRNAs, primers, and donors. The same export area works whether you designed one project or many.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <Badge color={COLORS.success}>{batchSuccessfulResults.length} successful projects</Badge>
            <Badge>{batchOrderRows.length} order lines</Badge>
            {batchCopyState && <Badge color={COLORS.success}>{batchCopyState}</Badge>}
          </div>
          {batchError && <div style={{ marginBottom: 12, padding: 12, borderRadius: 12, background: "rgba(251,113,133,0.10)", border: `1px solid ${COLORS.danger}55`, color: COLORS.danger }}>{batchError}</div>}

          {batchSuccessfulResults.length > 0 && (
            <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: "#f8fafc", color: "#333", border: "1px solid #d7dee7", overflowX: "auto" }}>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>IDT Template Export</div>
              <div style={{ color: "#667085", fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
                These downloads match the headers in your IDT upload templates:
                `template-paste-entry-crispr.xlsx`, `template-paste-entry.xlsx`, and `template-paste-entry-hdr.xlsx`.
              </div>
              <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
                <Grid>
                  <label>
                    <div style={{ color: "#667085", fontSize: 12, marginBottom: 6 }}>CRISPR scale</div>
                    <input value={idtDefaults.crisprScale} onChange={(event) => updateIdtDefault("crisprScale", event.target.value)} style={{ ...FIELD_STYLE, background: "#ffffff", color: "#111827", borderColor: "#d7dee7" }} placeholder="25nm" />
                  </label>
                  <label>
                    <div style={{ color: "#667085", fontSize: 12, marginBottom: 6 }}>Primer scale</div>
                    <input value={idtDefaults.oligoScale} onChange={(event) => updateIdtDefault("oligoScale", event.target.value)} style={{ ...FIELD_STYLE, background: "#ffffff", color: "#111827", borderColor: "#d7dee7" }} placeholder="25nm" />
                  </label>
                  <label>
                    <div style={{ color: "#667085", fontSize: 12, marginBottom: 6 }}>Primer purification</div>
                    <input value={idtDefaults.oligoPurification} onChange={(event) => updateIdtDefault("oligoPurification", event.target.value)} style={{ ...FIELD_STYLE, background: "#ffffff", color: "#111827", borderColor: "#d7dee7" }} placeholder="STD" />
                  </label>
                  <label>
                    <div style={{ color: "#667085", fontSize: 12, marginBottom: 6 }}>HDR scale</div>
                    <input value={idtDefaults.hdrScale} onChange={(event) => updateIdtDefault("hdrScale", event.target.value)} style={{ ...FIELD_STYLE, background: "#ffffff", color: "#111827", borderColor: "#d7dee7" }} placeholder="4nmU" />
                  </label>
                  <label>
                    <div style={{ color: "#667085", fontSize: 12, marginBottom: 6 }}>HDR modification</div>
                    <input value={idtDefaults.hdrModification} onChange={(event) => updateIdtDefault("hdrModification", event.target.value)} style={{ ...FIELD_STYLE, background: "#ffffff", color: "#111827", borderColor: "#d7dee7" }} placeholder="None or phosphorothioate format" />
                  </label>
                </Grid>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  <button type="button" disabled={!idtTemplateRows.crispr.length} onClick={() => downloadIdtTemplate("crispr")} style={{ ...FIELD_STYLE, width: "auto", cursor: idtTemplateRows.crispr.length ? "pointer" : "not-allowed", fontWeight: 700, background: "#ffffff", color: "#111827", borderColor: "#d7dee7" }}>
                    Download IDT CRISPR template
                  </button>
                  <button type="button" disabled={!idtTemplateRows.oligo.length} onClick={() => downloadIdtTemplate("oligo")} style={{ ...FIELD_STYLE, width: "auto", cursor: idtTemplateRows.oligo.length ? "pointer" : "not-allowed", fontWeight: 700, background: "#ffffff", color: "#111827", borderColor: "#d7dee7" }}>
                    Download IDT primer template
                  </button>
                  <button type="button" disabled={!idtTemplateRows.hdr.length} onClick={() => downloadIdtTemplate("hdr")} style={{ ...FIELD_STYLE, width: "auto", cursor: idtTemplateRows.hdr.length ? "pointer" : "not-allowed", fontWeight: 700, background: "#ffffff", color: "#111827", borderColor: "#d7dee7" }}>
                    Download IDT HDR template
                  </button>
                </div>
              </div>

              {batchDonorRows.length > 0 && (
                <>
                  <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Batch Donor Sequences</div>
                  <div style={{ color: "#667085", fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
                    This section lists the donor sequences explicitly before export. For SNP designs, the sequence shown here is the recommended order strand.
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16, minWidth: 980 }}>
                    <thead>
                      <tr>{["Slot", "Design", "Donor Name", "Sequence", "Linked Guide", "Notes"].map((label) => <th key={label} style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#2E75B6", color: "#ffffff", textAlign: "left" }}>{label}</th>)}</tr>
                    </thead>
                    <tbody>
                      {batchDonorRows.map((row, rowIndex) => (
                        <tr key={`${row.slot}-${row.name}-${rowIndex}`}>
                          <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff" }}>{row.slot}</td>
                          <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff" }}>{row.designLabel}</td>
                          <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff" }}>{row.name}</td>
                          <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff", fontFamily: "Consolas, monospace", wordBreak: "break-all" }}>{row.sequence}</td>
                          <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff" }}>{row.linkedGuide || "n/a"}</td>
                          <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff" }}>{row.notes || ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Combined Order Preview</div>
              <div style={{ color: "#667085", fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
                This is a review table only. The actual upload files are the separate IDT template downloads above. For gRNAs, the sequence exported to IDT is the spacer without PAM. For SNP donors, the exported donor is the recommended order strand.
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1180 }}>
                <thead>
                  <tr>{["Slot", "Design", "Item", "Name", "Sequence To Order", "PAM", "Strand", "Length", "Linked Guide", "Notes"].map((label) => <th key={label} style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#2E75B6", color: "#ffffff", textAlign: "left" }}>{label}</th>)}</tr>
                </thead>
                <tbody>
                  {batchOrderRows.map((row, rowIndex) => (
                    <tr key={`${row.slot}-${row.itemType}-${row.name}-${rowIndex}`}>
                      <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff" }}>{row.slot}</td>
                      <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff" }}>{row.designLabel}</td>
                      <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff" }}>{row.itemType}</td>
                      <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff" }}>{row.name}</td>
                      <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff", fontFamily: "Consolas, monospace", wordBreak: "break-all" }}>{row.sequence}</td>
                      <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff", fontFamily: "Consolas, monospace" }}>{row.pam || "n/a"}</td>
                      <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff" }}>{row.strand || "n/a"}</td>
                      <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff" }}>{row.length}</td>
                      <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff" }}>{row.linkedGuide || "n/a"}</td>
                      <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff" }}>{row.notes || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
