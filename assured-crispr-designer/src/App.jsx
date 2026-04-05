import { useCallback, useEffect, useMemo, useState } from "react";
import { CASSETTES, INTERNAL_TAGS, REPORTERS, getCassetteSequenceLength, parseGB, runDesign } from "./designEngine";
import { describeKoGenomicContextFromModel, getGenomicSequence, normalizeGenBankToTranscriptModel, normalizeRawSequenceToTranscriptModel } from "./transcriptModel";
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
  { id: "it", label: "Internal in-frame tag", short: "ssODN insert within CDS" },
  { id: "ct", label: "C-terminal tag / reporter", short: "HDR insert at stop" },
  { id: "nt", label: "N-terminal tag / reporter", short: "HDR insert at ATG" },
];

const CAS_DATABASE_ORGANISM_OPTIONS = [
  { id: "1", label: "Human (GRCh38/hg38)" },
  { id: "6", label: "Mouse (GRCm38/mm10)" },
  { id: "5", label: "Rat (Rnor 6.0)" },
  { id: "8", label: "Zebrafish (GRCz10)" },
  { id: "12", label: "Pig (Ensembl v10.2)" },
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
const PM_EDIT_COLORS = {
  desired: "#FDE68A",
  silent: "#FCA5A5",
};
const APP_FOOTER_LABEL = "Hosted build • 31 Mar 2026";
const REPO_URL = "https://github.com/Narasimhat/Assured_CRISPR_Design";
const SAMPLE_REQUEST_TEXT = [
  "PSEN1 N32R BIHi005-A",
  "ECSIT knockout BIHi005-A",
  "SCN5A internal SPOT after P155 BIHi005-A",
  "INS C-terminal SD40-2xHA BIHi005-A",
  "SORCS1 N-terminal N:EGFP-Linker BIHi005-A",
].join("\n");

const CASSETTE_ALIASES = {
  mscarlett2a: "T2A-mScarlet_I3",
  t2amscarlet: "T2A-mScarlet_I3",
  t2amscarleti3: "T2A-mScarlet_I3",
  mstaygold2t2a: "T2A-mStayGold2",
  t2amstaygold2: "T2A-mStayGold2",
  mscarletp2a: "P2A-mScarlet",
  p2amscarlet: "P2A-mScarlet",
  mscarleti3p2a: "P2A-mScarlet",
  mstaygold2p2a: "P2A-mStayGold2",
  p2amstaygold2: "P2A-mStayGold2",
  egfplinker: "N:EGFP-Linker",
  mstaygold2linker: "N:mStayGold2-Linker",
  sd40linker: "N:SD40-Linker",
  dtaglinker: "N:dTAG-Linker",
  maidlinker: "N:mAID-Linker",
  egfpt2a: "T2A-EGFP",
  mscarleti3t2a: "T2A-mScarlet_I3",
  mcherryp2a: "P2A-mCherry",
};

const NT_CASSETTE_OPTIONS = [
  "N:EGFP-Linker",
  "N:mStayGold2-Linker",
  "T2A-EGFP",
  "T2A-mScarlet_I3",
  "T2A-mStayGold2",
  "P2A-mCherry",
  "P2A-mScarlet",
  "P2A-mStayGold2",
  "N:SD40-Linker",
  "N:dTAG-Linker",
  "N:mAID-Linker",
  "N:2xHA-dTAG-Linker",
];

const CT_CASSETTE_OPTIONS = [
  "2xHA-only",
  "SD40-2xHA",
  "dTAG-2xHA",
  "mAID-2xHA",
  "T2A-EGFP",
  "T2A-mScarlet_I3",
  "T2A-mStayGold2",
  "P2A-mCherry",
  "P2A-mScarlet",
  "P2A-mStayGold2",
  "SD40-2xHA-P2A-mCherry",
  "dTAG-2xHA-P2A-mCherry",
  "mAID-2xHA-P2A-mCherry",
];

const CASSETTE_DISPLAY = {
  "N:EGFP-Linker": {
    nt: "EGFP fusion (reporter-linker)",
  },
  "N:mStayGold2-Linker": {
    nt: "mStayGold2 fusion (reporter-linker)",
  },
  "N:SD40-Linker": {
    nt: "SD40 fusion (tag-linker)",
  },
  "N:dTAG-Linker": {
    nt: "dTAG fusion (tag-linker)",
  },
  "N:mAID-Linker": {
    nt: "mAID fusion (tag-linker)",
  },
  "N:2xHA-dTAG-Linker": {
    nt: "2xHA-dTAG fusion (tag-linker)",
  },
  "T2A-EGFP": {
    nt: "EGFP-T2A cleavable",
    ct: "T2A-EGFP cleavable",
  },
  "T2A-mScarlet_I3": {
    nt: "mScarlet-I3-T2A cleavable",
    ct: "T2A-mScarlet-I3 cleavable",
  },
  "T2A-mStayGold2": {
    nt: "mStayGold2-T2A cleavable",
    ct: "T2A-mStayGold2 cleavable",
  },
  "P2A-mCherry": {
    nt: "mCherry-P2A cleavable",
    ct: "P2A-mCherry cleavable",
  },
  "P2A-mScarlet": {
    nt: "mScarlet-P2A cleavable",
    ct: "P2A-mScarlet cleavable",
  },
  "P2A-mStayGold2": {
    nt: "mStayGold2-P2A cleavable",
    ct: "P2A-mStayGold2 cleavable",
  },
  "2xHA-only": {
    ct: "2xHA fusion (linker-tag)",
  },
  "SD40-2xHA": {
    ct: "SD40-2xHA fusion (linker-tag)",
  },
  "dTAG-2xHA": {
    ct: "dTAG-2xHA fusion (linker-tag)",
  },
  "mAID-2xHA": {
    ct: "mAID-2xHA fusion (linker-tag)",
  },
  "SD40-2xHA-P2A-mCherry": {
    ct: "SD40-2xHA-P2A-mCherry cleavable",
  },
  "dTAG-2xHA-P2A-mCherry": {
    ct: "dTAG-2xHA-P2A-mCherry cleavable",
  },
  "mAID-2xHA-P2A-mCherry": {
    ct: "mAID-2xHA-P2A-mCherry cleavable",
  },
};

const CONSTRUCT_BUILDER_OPTIONS = {
  nt: [
    {
      id: "fusion",
      label: "Fusion / linker",
      help: "Reporter or tag is fused directly at the N-terminus with the built-in linker.",
      payloads: [
        { cassette: "N:EGFP-Linker", label: "EGFP", kind: "reporter" },
        { cassette: "N:mStayGold2-Linker", label: "mStayGold2", kind: "reporter" },
        { cassette: "N:SD40-Linker", label: "SD40", kind: "tag" },
        { cassette: "N:dTAG-Linker", label: "dTAG", kind: "tag" },
        { cassette: "N:mAID-Linker", label: "mAID", kind: "tag" },
        { cassette: "N:2xHA-dTAG-Linker", label: "2xHA-dTAG", kind: "tag" },
      ],
    },
    {
      id: "t2a",
      label: "T2A cleavable",
      help: "Reporter is expressed as a cleavable N-terminal module with T2A.",
      payloads: [
        { cassette: "T2A-EGFP", label: "EGFP", kind: "reporter" },
        { cassette: "T2A-mScarlet_I3", label: "mScarlet-I3", kind: "reporter" },
        { cassette: "T2A-mStayGold2", label: "mStayGold2", kind: "reporter" },
      ],
    },
    {
      id: "p2a",
      label: "P2A cleavable",
      help: "Reporter is expressed as a cleavable N-terminal module with P2A.",
      payloads: [
        { cassette: "P2A-mCherry", label: "mCherry", kind: "reporter" },
        { cassette: "P2A-mScarlet", label: "mScarlet", kind: "reporter" },
        { cassette: "P2A-mStayGold2", label: "mStayGold2", kind: "reporter" },
      ],
    },
  ],
  ct: [
    {
      id: "fusion",
      label: "Fusion / linker",
      help: "Tag is fused directly at the C-terminus with the built-in linker.",
      payloads: [
        { cassette: "2xHA-only", label: "2xHA", kind: "tag" },
        { cassette: "SD40-2xHA", label: "SD40-2xHA", kind: "tag" },
        { cassette: "dTAG-2xHA", label: "dTAG-2xHA", kind: "tag" },
        { cassette: "mAID-2xHA", label: "mAID-2xHA", kind: "tag" },
      ],
    },
    {
      id: "t2a",
      label: "T2A cleavable",
      help: "Reporter is expressed as a cleavable C-terminal module with T2A.",
      payloads: [
        { cassette: "T2A-EGFP", label: "EGFP", kind: "reporter" },
        { cassette: "T2A-mScarlet_I3", label: "mScarlet-I3", kind: "reporter" },
        { cassette: "T2A-mStayGold2", label: "mStayGold2", kind: "reporter" },
      ],
    },
    {
      id: "p2a",
      label: "P2A cleavable",
      help: "Reporter is expressed as a cleavable C-terminal module with P2A.",
      payloads: [
        { cassette: "P2A-mCherry", label: "mCherry", kind: "reporter" },
        { cassette: "P2A-mScarlet", label: "mScarlet", kind: "reporter" },
        { cassette: "P2A-mStayGold2", label: "mStayGold2", kind: "reporter" },
      ],
    },
    {
      id: "tag_p2a_reporter",
      label: "Tag + P2A reporter",
      help: "C-terminal fusion tag followed by a cleavable P2A reporter.",
      payloads: [
        { cassette: "SD40-2xHA-P2A-mCherry", label: "SD40-2xHA + mCherry", kind: "combo" },
        { cassette: "dTAG-2xHA-P2A-mCherry", label: "dTAG-2xHA + mCherry", kind: "combo" },
        { cassette: "mAID-2xHA-P2A-mCherry", label: "mAID-2xHA + mCherry", kind: "combo" },
      ],
    },
  ],
};

const ORDER_READY_REPORTER_CASSETTES = {
  EGFP: {
    nt: ["N:EGFP-Linker", "T2A-EGFP"],
    ct: ["T2A-EGFP"],
  },
  mCherry: {
    nt: ["P2A-mCherry"],
    ct: ["P2A-mCherry"],
  },
  mScarlet: {
    nt: ["P2A-mScarlet"],
    ct: ["P2A-mScarlet"],
  },
  mScarlet_I3: {
    nt: ["T2A-mScarlet_I3"],
    ct: ["T2A-mScarlet_I3"],
  },
  mStayGold2: {
    nt: ["N:mStayGold2-Linker", "T2A-mStayGold2", "P2A-mStayGold2"],
    ct: ["T2A-mStayGold2", "P2A-mStayGold2"],
  },
};

const ORDER_READY_REPORTER_NAME_MAP = {
  egfp: "EGFP",
  mcherry: "mCherry",
  mscarlet: "mScarlet",
  mscarleti3: "mScarlet_I3",
  mstaygold2: "mStayGold2",
};

function sanitizeSegment(value, fallback) {
  const clean = value.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/\s+/g, " ").trim();
  return clean || fallback;
}

function getProjectTypeMeta(projectType) {
  return PROJECT_TYPES.find((item) => item.id === projectType) || PROJECT_TYPES[0];
}

function getCassetteDisplayLabel(option, projectType) {
  const display = CASSETTE_DISPLAY[option];
  if (display?.[projectType]) return display[projectType];
  return option.replace(/^N:/, "");
}

function normalizeReporterName(value) {
  return String(value || "").replace(/[^A-Za-z0-9]+/g, "").toLowerCase();
}

function getOrderReadyReporterKey(name) {
  return ORDER_READY_REPORTER_NAME_MAP[normalizeReporterName(name)] || "";
}

function getReporterActionOptions(reporterName, projectType) {
  const key = getOrderReadyReporterKey(reporterName);
  if (!key) return [];
  return (ORDER_READY_REPORTER_CASSETTES[key]?.[projectType] || []).filter((option) => CASSETTES[option]);
}

function formatFpbaseReporterSummary(reporter) {
  const parts = [];
  if (reporter?.exMax && reporter?.emMax) parts.push(`Ex/Em ${reporter.exMax}/${reporter.emMax}`);
  if (reporter?.brightness) parts.push(`Brightness ${reporter.brightness}`);
  if (reporter?.agg) parts.push(`Agg ${reporter.agg}`);
  if (reporter?.organism) parts.push(String(reporter.organism));
  return parts.join(" • ");
}

function getConstructBuilderGroups(projectType) {
  return CONSTRUCT_BUILDER_OPTIONS[projectType] || [];
}

function resolveConstructBuilderSelection(tag, projectType) {
  const groups = getConstructBuilderGroups(projectType);
  for (const group of groups) {
    const payload = group.payloads.find((item) => item.cassette === tag);
    if (payload) return { architecture: group.id, cassette: payload.cassette };
  }
  const fallback = groups[0];
  return {
    architecture: fallback?.id || "",
    cassette: fallback?.payloads?.[0]?.cassette || tag || "",
  };
}

function getConstructBuilderPayloads(projectType, architecture) {
  return getConstructBuilderGroups(projectType).find((group) => group.id === architecture)?.payloads || [];
}

function getConstructBuilderHelp(projectType, architecture) {
  return getConstructBuilderGroups(projectType).find((group) => group.id === architecture)?.help || "";
}

function buildProjectFolderName(meta) {
  const gene = sanitizeSegment(meta.gene, "GENE");
  const edit = sanitizeSegment(meta.editSummary, "Genome edit");
  const cellLine = sanitizeSegment(meta.cellLine, "CELL-LINE");
  return `${gene} ${edit} in ${cellLine}`;
}

function buildWorkspaceProjectFolderName(row, result = null) {
  const explicit = sanitizeSegment(String(row?.projectFolderName || ""), "");
  if (explicit) return explicit;
  const irisId = sanitizeSegment(String(row?.irisId || ""), "");
  const parentId = sanitizeSegment(String(row?.clientId || ""), "");
  const requestedEdit = sanitizeSegment(String(row?.editSummary || row?.label || ""), "");
  if (irisId && requestedEdit) return `${irisId}${parentId ? ` (${parentId})` : ""} - ${requestedEdit}`;
  return buildProjectFolderName(buildRowMeta(row, result));
}

function extractIrisIdFromFolderName(name) {
  const match = String(name || "").match(/^(\d{3,})\b/);
  return match ? match[1] : "";
}

function extractParentIdFromFolderName(name) {
  const match = String(name || "").match(/^\d{3,}\s+\((\d{3,})\)/);
  return match ? match[1] : "";
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
    referenceSource: row?.referenceSource || "genbank",
  };
}

function formatDesignLabel(meta, result) {
  if (!result) return "";
  if (result.type === "pm") return `${result.gene} p.${result.wA}${result.an}${result.mA}`;
  if (result.type === "ko") return `${result.gene} knockout`;
  if (result.type === "it") return `${result.gene} internal ${result.tag} after ${result.wA}${result.an}`;
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
    if (result.gs?.length >= 2 && Number.isFinite(result.gs[0]?.d) && Number.isFinite(result.gs[1]?.d)) {
      lines.push(`Pair spacing: ${Math.abs(result.gs[1].d - result.gs[0].d)} bp`);
    }
    if (result.strat) lines.push(`Strategy: ${result.strat}`);
    return lines.join("\n");
  }
  if (result.type === "it") lines.push(`Insert after ${result.wA}${result.an}, before ${result.nextAA}${result.an + 1}`);
  if (result.type === "ct" || result.type === "nt") lines.push(`Donor length: ${result.dl} bp`);
  if (result.type === "it") lines.push(`Insert length: ${result.il} bp`);
  lines.push("");
  lines.push("gRNAs:");
  result.gs.forEach((guide) => lines.push(`- ${guide.n}: ${guide.sp} ${guide.pm} | ${guide.str} strand | GC ${guide.gc}%`));
  if (result.ss?.length) {
    lines.push("");
    lines.push(result.type === "pm" ? "Silent mutations:" : "Guide-blocking mutations:");
    result.ss.forEach((mutation) => lines.push(`- ${getGuideName(mutation.gi)}: ${mutation.lb} (${mutation.oc} -> ${mutation.nc}) | ${mutation.pur}`));
  }
  lines.push("");
  lines.push("Validation primers:");
  result.ps.forEach((primer) => lines.push(`- ${primer.n}: ${primer.s}`));
  if (result.amp) lines.push(`Expected amplicon: ${result.amp}`);
  return lines.join("\n");
}

function buildGeneInfoRows(meta, result, fileName) {
  const referenceLabel = result?.gb?.source === "raw-sequence"
    ? "Raw DNA + CDS coordinates"
    : fileName || (result.referenceOnly ? "Gene-list KO mode (no GenBank uploaded)" : "Uploaded GenBank");
  if (!result) return [];
  return [
    ["Gene", meta.gene || result.gene],
    ["Design class", getProjectTypeMeta(meta.projectType).label],
    ["Target", buildDisplayedEditLabel(meta, result)],
    ["Cell line", meta.cellLine || "n/a"],
    ["Protein / CDS", result.prot ? `${result.prot} aa` : "n/a"],
    ["Reference", referenceLabel],
  ];
}

function buildGuideRows(result) {
  return (result?.gs || []).map((guide) => [guide.n, `${guide.sp} ${guide.pm}`, `${guide.str} strand`, `${guide.gc}%`, guide.arm || guide.note || ""]);
}

function calculateGcPercent(sequence) {
  const clean = String(sequence || "").toUpperCase();
  if (!clean) return 0;
  const gcCount = [...clean].filter((base) => base === "G" || base === "C").length;
  return Math.round((gcCount / clean.length) * 100);
}

function reverseComplementLocal(sequence) {
  return String(sequence || "").split("").reverse().map((base) => DNA_COMPLEMENT[base] || "N").join("");
}

function parseGuideCutFromNote(note) {
  const match = String(note || "").match(/Cut at\s+(\d+)/i);
  return match ? parseInt(match[1], 10) - 1 : null;
}

function parseGuideExonNumber(note) {
  const match = String(note || "").match(/exon\s+(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

function findMatchingGuideCut(model, spacer, pam, preferredExonNumber = null, preferredCut = null) {
  const seq = getGenomicSequence(model);
  const cleanSpacer = String(spacer || "").toUpperCase();
  const cleanPam = String(pam || "").toUpperCase();
  if (!cleanSpacer || cleanSpacer.length !== 20 || !cleanPam || cleanPam.length !== 3) return null;

  const matches = [];
  for (let pos = 0; pos <= seq.length - 23; pos += 1) {
    const plusSpacer = seq.slice(pos, pos + 20).toUpperCase();
    const plusPam = seq.slice(pos + 20, pos + 23).toUpperCase();
    if (plusSpacer === cleanSpacer && plusPam === cleanPam) {
      const cut = pos + 17;
      const context = describeKoGenomicContextFromModel(model, cut);
      const exonMatch = context.label.match(/exon\s+(\d+)/i);
      matches.push({ cut, str: "+", context, exonNumber: exonMatch ? parseInt(exonMatch[1], 10) : null });
    }

    const minusPamWindow = seq.slice(pos, pos + 3).toUpperCase();
    const minusSpacerWindow = seq.slice(pos + 3, pos + 23).toUpperCase();
    if (reverseComplementLocal(minusSpacerWindow) === cleanSpacer && reverseComplementLocal(minusPamWindow) === cleanPam) {
      const cut = pos + 6;
      const context = describeKoGenomicContextFromModel(model, cut);
      const exonMatch = context.label.match(/exon\s+(\d+)/i);
      matches.push({ cut, str: "-", context, exonNumber: exonMatch ? parseInt(exonMatch[1], 10) : null });
    }
  }

  if (!matches.length) return null;
  matches.sort((left, right) => {
    const leftPreferredExon = preferredExonNumber && left.exonNumber === preferredExonNumber ? 0 : 1;
    const rightPreferredExon = preferredExonNumber && right.exonNumber === preferredExonNumber ? 0 : 1;
    if (leftPreferredExon !== rightPreferredExon) return leftPreferredExon - rightPreferredExon;
    const leftPreferredCut = Number.isFinite(preferredCut) ? Math.abs(left.cut - preferredCut) : Number.MAX_SAFE_INTEGER;
    const rightPreferredCut = Number.isFinite(preferredCut) ? Math.abs(right.cut - preferredCut) : Number.MAX_SAFE_INTEGER;
    if (leftPreferredCut !== rightPreferredCut) return leftPreferredCut - rightPreferredCut;
    return left.cut - right.cut;
  });
  return matches[0];
}

function scorePrimerSequenceLocal(primer) {
  const seq = String(primer || "").toUpperCase();
  if (!seq) return Number.MAX_SAFE_INTEGER;
  const gcCount = [...seq].filter((base) => base === "G" || base === "C").length;
  const gcPercent = (gcCount / seq.length) * 100;
  let score = Math.abs(gcPercent - 50);
  if (/(A{5,}|T{5,}|G{5,}|C{5,})/.test(seq)) score += 20;
  if (/AAAA|TTTT/.test(seq)) score += 6;
  const lastBase = seq[seq.length - 1];
  if (lastBase !== "G" && lastBase !== "C") score += 4;
  return score;
}

function pickCenteredPrimerPairLocal(seq, center, minAmpliconLength = 450, maxAmpliconLength = 500, primerLength = 24) {
  const minLength = Math.max(primerLength * 2, minAmpliconLength);
  const maxLength = Math.max(minLength, maxAmpliconLength);
  let best = null;
  for (let ampliconLength = minLength; ampliconLength <= maxLength; ampliconLength += 1) {
    const maxStart = Math.max(0, seq.length - ampliconLength);
    const idealStart = Math.round(center - ampliconLength / 2);
    for (const offset of [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5]) {
      const ampliconStart = Math.max(0, Math.min(maxStart, idealStart + offset));
      const ampliconEnd = ampliconStart + ampliconLength;
      const forward = seq.slice(ampliconStart, ampliconStart + primerLength);
      const reverse = reverseComplementLocal(seq.slice(Math.max(0, ampliconEnd - primerLength), ampliconEnd));
      if (forward.length !== primerLength || reverse.length !== primerLength) continue;
      const ampliconCenter = ampliconStart + ampliconLength / 2;
      const centerPenalty = Math.abs(center - ampliconCenter);
      const score = centerPenalty * 3 + scorePrimerSequenceLocal(forward) + scorePrimerSequenceLocal(reverse) + Math.abs(ampliconLength - 475) * 0.2;
      if (!best || score < best.score) {
        best = { forward, reverse, ampliconLength, score };
      }
    }
  }
  if (best) return best;
  const fallbackLength = Math.max(primerLength * 2, Math.min(seq.length, 480));
  const maxStart = Math.max(0, seq.length - fallbackLength);
  const ampliconStart = Math.max(0, Math.min(maxStart, Math.round(center - fallbackLength / 2)));
  const ampliconEnd = Math.min(seq.length, ampliconStart + fallbackLength);
  return {
    forward: seq.slice(ampliconStart, ampliconStart + primerLength),
    reverse: reverseComplementLocal(seq.slice(Math.max(0, ampliconEnd - primerLength), ampliconEnd)),
    ampliconLength: ampliconEnd - ampliconStart,
  };
}

const KO_LONG_DELETION_THRESHOLD = 1000;
const KO_DELETION_SCREEN_FLANK = 250;

function pickDeletionScreenPrimerPairLocal(seq, leftCut, rightCut, flank = KO_DELETION_SCREEN_FLANK, primerLength = 24) {
  const maxStart = Math.max(0, seq.length - primerLength);
  const desiredForwardStart = Math.max(0, Math.min(maxStart, leftCut - flank));
  const desiredReverseStart = Math.max(0, Math.min(maxStart, rightCut + flank - primerLength));
  let best = null;
  for (let forwardOffset = -20; forwardOffset <= 20; forwardOffset += 1) {
    const forwardStart = Math.max(0, Math.min(maxStart, desiredForwardStart + forwardOffset));
    const forward = seq.slice(forwardStart, forwardStart + primerLength);
    if (forward.length !== primerLength) continue;
    for (let reverseOffset = -20; reverseOffset <= 20; reverseOffset += 1) {
      const reverseStart = Math.max(forwardStart + primerLength + 50, Math.min(maxStart, desiredReverseStart + reverseOffset));
      const reverse = reverseComplementLocal(seq.slice(reverseStart, reverseStart + primerLength));
      if (reverse.length !== primerLength) continue;
      const wtAmpliconLength = reverseStart + primerLength - forwardStart;
      const deletionAmpliconLength = Math.max(primerLength * 2, (leftCut - forwardStart) + ((reverseStart + primerLength) - rightCut));
      const leftFlankPenalty = Math.abs((leftCut - forwardStart) - flank);
      const rightFlankPenalty = Math.abs(((reverseStart + primerLength) - rightCut) - flank);
      const score = scorePrimerSequenceLocal(forward)
        + scorePrimerSequenceLocal(reverse)
        + leftFlankPenalty * 0.15
        + rightFlankPenalty * 0.15
        + Math.abs(deletionAmpliconLength - 500) * 0.2;
      if (!best || score < best.score) {
        best = { forward, reverse, wtAmpliconLength, deletionAmpliconLength, score };
      }
    }
  }
  if (best) return best;
  const forwardStart = desiredForwardStart;
  const reverseStart = Math.max(forwardStart + primerLength + 50, desiredReverseStart);
  return {
    forward: seq.slice(forwardStart, forwardStart + primerLength),
    reverse: reverseComplementLocal(seq.slice(reverseStart, reverseStart + primerLength)),
    wtAmpliconLength: reverseStart + primerLength - forwardStart,
    deletionAmpliconLength: Math.max(primerLength * 2, (leftCut - forwardStart) + ((reverseStart + primerLength) - rightCut)),
  };
}

function buildKoGuideDisplayNote(guide, context, pairSpacing, sourceDetail = "") {
  const sourcePrefix = sourceDetail ? `${sourceDetail} | ` : "";
  const spacingText = Number.isFinite(pairSpacing) ? ` | pair spacing ${pairSpacing} bp` : "";
  return `${sourcePrefix}Cut at ${guide.cut + 1}, ${context.label} (${context.detail})${spacingText}`;
}

function finalizeKoResultWithGuides(result, row, guides) {
  if (!result || result.type !== "ko") return result;
  let model = null;
  if (row?.referenceSource === "raw" && hasRawReference(row)) {
    model = normalizeRawSequenceToTranscriptModel({
      gene: row.gene || result.gene || "Unknown",
      sequence: parseRawSequenceInput(row.rawSequence),
      cdsStart: row.cdsStart,
      cdsEnd: row.cdsEnd,
      exons: parseExonCoordinateInput(row.exonCoordinates),
    });
  } else if (row?.gbRaw) {
    model = normalizeGenBankToTranscriptModel(parseGB(row.gbRaw));
  }
  if (!model) return finalizeReferenceOnlyKoResult(result, row, guides);
  const seq = getGenomicSequence(model);
  const currentGuides = [...(guides || [])];
  if (currentGuides.length < 2) return result;

  const mappedGuides = currentGuides.map((guide) => {
    const existingCut = Number.isFinite(guide.cut) ? guide.cut : parseGuideCutFromNote(guide.note || guide.arm);
    const preferredExon = parseGuideExonNumber(guide.note || guide.arm);
    const mapped = findMatchingGuideCut(model, guide.sp, guide.pm, preferredExon, existingCut);
    const cut = mapped?.cut ?? existingCut;
    const context = mapped?.context ?? (Number.isFinite(cut) ? describeKoGenomicContextFromModel(model, cut) : { label: "genomic context unresolved", detail: "position unavailable" });
    return {
      ...guide,
      str: mapped?.str || guide.str,
      cut,
      context,
      exonNumber: mapped?.exonNumber ?? preferredExon ?? null,
    };
  });

  const pairSpacing = mappedGuides.every((guide) => Number.isFinite(guide.cut))
    ? Math.abs(mappedGuides[1].cut - mappedGuides[0].cut)
    : null;

  const updatedGuides = mappedGuides.map((guide) => ({
    ...guide,
    note: buildKoGuideDisplayNote(guide, guide.context, pairSpacing, guide.referenceDetail || ""),
  }));

  const cutCenter = mappedGuides.filter((guide) => Number.isFinite(guide.cut)).length
    ? Math.round(mappedGuides.filter((guide) => Number.isFinite(guide.cut)).reduce((sum, guide) => sum + guide.cut, 0) / mappedGuides.filter((guide) => Number.isFinite(guide.cut)).length)
    : null;
  const sortedCuts = mappedGuides.map((guide) => guide.cut).filter(Number.isFinite).sort((left, right) => left - right);
  const longDeletion = sortedCuts.length === 2 && Number.isFinite(pairSpacing) && pairSpacing > KO_LONG_DELETION_THRESHOLD;
  const primerPair = longDeletion
    ? pickDeletionScreenPrimerPairLocal(seq, sortedCuts[0], sortedCuts[1], KO_DELETION_SCREEN_FLANK, 24)
    : (Number.isFinite(cutCenter) ? pickCenteredPrimerPairLocal(seq, cutCenter, 450, 500, 24) : null);

  const exonNumbers = [...new Set(mappedGuides.map((guide) => guide.exonNumber).filter(Number.isFinite))];
  let exonLabel = result.exon;
  if (exonNumbers.length === 1) {
    const exon = (model.exons || []).find((entry) => entry.exonNumber === exonNumbers[0]);
    if (exon) exonLabel = `Exon ${exon.exonNumber} (${exon.start + 1}-${exon.end}, ${exon.end - exon.start} bp)`;
  }

  return {
    ...result,
    exon: exonLabel,
    gs: updatedGuides,
    ps: primerPair ? [
      { ...result.ps?.[0], s: primerPair.forward },
      { ...result.ps?.[1], s: primerPair.reverse },
    ] : result.ps,
    amp: primerPair
      ? (longDeletion
        ? `WT ~${primerPair.wtAmpliconLength} bp | deletion ~${primerPair.deletionAmpliconLength} bp`
        : `~${primerPair.ampliconLength} bp`)
      : result.amp,
    strat: longDeletion
      ? "NHEJ-mediated deletion using dual Cas9 guides. Screen with flanking junction PCR, then confirm the deletion by sequencing."
      : result.strat,
    primerStrategy: longDeletion ? "deletion-screen" : (result.primerStrategy || "centered"),
  };
}

function finalizeReferenceOnlyKoResult(result, row, guides, sourceLabel = "Reference") {
  if (!result || result.type !== "ko") return result;
  const currentGuides = [...(guides || [])].slice(0, 2).map((guide, index) => {
    const exonNumber = parseGuideExonNumber(guide.note || guide.arm);
    const sourceDetail = guide.referenceDetail || `${sourceLabel} guide`;
    const note = `${sourceDetail} | Reference-only KO mode. Upload GenBank to calculate pair spacing and centered primers.`;
    return {
      ...guide,
      n: guide.n || `${buildSafeToken(result.gene || row?.gene || "GENE", "GENE")}_KO_gRNA${index + 1}`,
      gc: Number.isFinite(guide.gc) ? guide.gc : calculateGcPercent(guide.sp),
      exonNumber: Number.isFinite(exonNumber) ? exonNumber : null,
      note,
    };
  });
  const exonNumbers = [...new Set(currentGuides.map((guide) => guide.exonNumber).filter(Number.isFinite))];
  const exonLabel = exonNumbers.length === 1 ? `Reference exon shortlist: exon ${exonNumbers[0]}` : "Reference-only KO shortlist";
  return {
    ...result,
    gene: result.gene || row?.gene || "",
    exon: exonLabel,
    gs: currentGuides,
    ps: [],
    amp: "n/a",
    strat: `${sourceLabel} reference-guide shortlist; upload GenBank to calculate pair spacing and centered primers.`,
    referenceOnly: true,
  };
}

function updateKoResultWithMappedGuides(result, row, slotIndex, guideUpdater) {
  if (!result || result.type !== "ko" || !row?.gbRaw) return result;
  const currentGuides = [...(result.gs || [])];
  if (!currentGuides[slotIndex]) return result;
  const previousGuide = currentGuides[slotIndex];
  const preferredExonNumber = parseGuideExonNumber(previousGuide.note || previousGuide.arm);
  const preferredCut = Number.isFinite(previousGuide.cut) ? previousGuide.cut : parseGuideCutFromNote(previousGuide.note || previousGuide.arm);
  const replacement = guideUpdater(previousGuide, slotIndex, preferredExonNumber, preferredCut);
  if (!replacement) return result;
  currentGuides[slotIndex] = replacement;
  return finalizeKoResultWithGuides(result, row, currentGuides);
}

function buildBrunelloGuideOverride(guide, slotIndex, previousGuide) {
  return {
    ...previousGuide,
    n: previousGuide?.n || `gRNA${slotIndex + 1}`,
    sp: guide.spacer,
    pm: guide.pam || previousGuide?.pm || "",
    str: guide.strand || previousGuide?.str || "n/a",
    gc: calculateGcPercent(guide.spacer),
    d: Number.isFinite(previousGuide?.d) ? previousGuide.d : null,
    cut: Number.isFinite(guide.cutPosition) ? guide.cutPosition - 1 : (Number.isFinite(previousGuide?.cut) ? previousGuide.cut : null),
    referenceDetail: `Brunello reference guide | Rule Set 2 ${guide.ruleSet2}${guide.exon ? ` | Exon ${guide.exon}` : ""}${guide.transcript ? ` | ${guide.transcript}` : ""}`,
    note: `Brunello reference guide | Rule Set 2 ${guide.ruleSet2}${guide.exon ? ` | Exon ${guide.exon}` : ""}${guide.transcript ? ` | ${guide.transcript}` : ""}`,
  };
}

function buildCasDatabaseGuideOverride(target, slotIndex, previousGuide) {
  return {
    ...previousGuide,
    n: previousGuide?.n || `gRNA${slotIndex + 1}`,
    sp: target.spacer,
    pm: target.pam || previousGuide?.pm || "",
    str: target.strand || previousGuide?.str || "n/a",
    gc: calculateGcPercent(target.spacer),
    d: Number.isFinite(previousGuide?.d) ? previousGuide.d : null,
    cut: Number.isFinite(previousGuide?.cut) ? previousGuide.cut : null,
    referenceDetail: `Cas-Database reference guide | OOF ${Number(target.oofScore || 0).toFixed(2)} | off-targets ${Array.isArray(target.offTargetCounts) ? target.offTargetCounts.join("/") : "n/a"}${target.location ? ` | ${target.location}` : ""}`,
    note: `Cas-Database reference guide | OOF ${Number(target.oofScore || 0).toFixed(2)} | off-targets ${Array.isArray(target.offTargetCounts) ? target.offTargetCounts.join("/") : "n/a"}${target.location ? ` | ${target.location}` : ""}`,
  };
}

function buildReferenceOnlyKoDesignFromGuides(row, sourceLabel, guides, extra = {}) {
  if (!row?.gene || !Array.isArray(guides) || guides.length < 2) return { err: `No ${sourceLabel} guide pair was available for ${row?.gene || "this gene"}.` };
  const baseResult = {
    type: "ko",
    gene: normalizeGeneToken(row.gene),
    gs: [],
    ps: [],
    amp: "n/a",
    exon: "Reference-only KO shortlist",
    strat: `${sourceLabel} reference-guide shortlist; upload GenBank to calculate pair spacing and centered primers.`,
    referenceOnly: true,
    gb: { assembly: "" },
    dbg: "",
    ...extra,
  };
  return finalizeReferenceOnlyKoResult(baseResult, row, guides, sourceLabel);
}

async function fetchJsonOrThrow(url, endpointName) {
  const response = await fetch(url);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(`${endpointName} endpoint returned HTML instead of JSON. Restart the dev server so the local API route is active.`);
  }
  const payload = await response.json();
  if (!response.ok || payload?.ok === false) throw new Error(payload?.error || payload?.note || `${endpointName} lookup failed.`);
  return payload;
}

function buildKoPairLocationLabel(pairResult, exonNumbers = []) {
  const uniqueExons = [...new Set(exonNumbers.filter(Number.isFinite))];
  if (uniqueExons.length === 1 && pairResult?.exon) return pairResult.exon;
  if (uniqueExons.length >= 2) return `Exon ${uniqueExons[0]} -> Exon ${uniqueExons[uniqueExons.length - 1]}`;
  return pairResult?.exon || "Location unavailable";
}

function buildKoReferencePairDiagnostics(result, row, sourceGuides, overrideBuilder, sourceLabel) {
  if (!result || result.type !== "ko" || !Array.isArray(sourceGuides) || sourceGuides.length < 2) return { included: [], filtered: [] };
  const topGuides = sourceGuides.slice(0, 3);
  const hasLocalReference = hasSequenceBackedReference(row);
  const candidates = [];
  const filtered = [];
  for (let leftIndex = 0; leftIndex < topGuides.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < topGuides.length; rightIndex += 1) {
      const leftGuide = overrideBuilder(topGuides[leftIndex], 0, result.gs?.[0]);
      const rightGuide = overrideBuilder(topGuides[rightIndex], 1, result.gs?.[1]);
      const sourceExonNumbers = [leftGuide, rightGuide].map((guide) => parseGuideExonNumber(guide.note || guide.arm)).filter(Number.isFinite);
      const pairResult = hasLocalReference
        ? finalizeKoResultWithGuides(result, row, [leftGuide, rightGuide])
        : finalizeReferenceOnlyKoResult(result, row, [leftGuide, rightGuide], sourceLabel);
      if (!pairResult) continue;
      const guideCuts = (pairResult.gs || []).map((guide) => guide.cut).filter(Number.isFinite);
      const spacing = guideCuts.length === 2 ? Math.abs(guideCuts[1] - guideCuts[0]) : null;
      const exonNumbers = [...new Set((pairResult.gs || []).map((guide) => parseGuideExonNumber(guide.note || guide.arm)).filter(Number.isFinite))];
      const sameExon = exonNumbers.length === 1;
      const preferredSpacing = Number.isFinite(spacing) && spacing >= 40 && spacing <= 140;
      const candidateMode = !hasLocalReference
        ? "reference-only"
        : sameExon && preferredSpacing
          ? "nearby"
          : sameExon && Number.isFinite(spacing)
            ? "local"
          : Number.isFinite(spacing) && spacing > KO_LONG_DELETION_THRESHOLD
            ? "deletion-screen"
            : Number.isFinite(spacing) && !sameExon
              ? "cross-exon"
            : "unresolved";
      const exonLabel = buildKoPairLocationLabel(pairResult, exonNumbers);
      if (candidateMode === "unresolved") {
        let reason = "This pair did not survive remapping onto the selected reference.";
        if (!Number.isFinite(spacing)) {
          reason = "Could not remap both guides cleanly onto the selected reference.";
        } else if (!sameExon) {
          reason = `Guides remap to ${exonLabel}. Only same-exon local pairs or >${KO_LONG_DELETION_THRESHOLD} bp long-range deletions are shown.`;
        }
        filtered.push({
          id: `${sourceLabel}-${leftIndex + 1}-${rightIndex + 1}`,
          sourceIndexes: [leftIndex + 1, rightIndex + 1],
          spacing,
          exonLabel,
          reason,
        });
        continue;
      }
      candidates.push({
        id: `${sourceLabel}-${leftIndex + 1}-${rightIndex + 1}`,
        source: sourceLabel,
        sourceIndexes: [leftIndex + 1, rightIndex + 1],
        guides: [leftGuide, rightGuide],
        result: pairResult,
        spacing,
        sameExon,
        preferredSpacing,
        candidateMode,
        deletionSize: spacing,
        sourceSameExon: sourceExonNumbers.length === 2 && sourceExonNumbers[0] === sourceExonNumbers[1],
        sourceExonGap: sourceExonNumbers.length === 2 ? Math.abs(sourceExonNumbers[1] - sourceExonNumbers[0]) : Number.MAX_SAFE_INTEGER,
        exonLabel,
      });
    }
  }
  const included = candidates
    .sort((left, right) => {
      const modePriority = { nearby: 0, local: 1, "cross-exon": 2, "deletion-screen": 3, "reference-only": 4 };
      if ((modePriority[left.candidateMode] || 9) !== (modePriority[right.candidateMode] || 9)) return (modePriority[left.candidateMode] || 9) - (modePriority[right.candidateMode] || 9);
      if (left.candidateMode === "reference-only") {
        if (left.sourceSameExon !== right.sourceSameExon) return left.sourceSameExon ? -1 : 1;
        if (left.sourceExonGap !== right.sourceExonGap) return left.sourceExonGap - right.sourceExonGap;
      }
      const leftDistance = Number.isFinite(left.spacing) ? Math.abs(left.spacing - 90) : Number.MAX_SAFE_INTEGER;
      const rightDistance = Number.isFinite(right.spacing) ? Math.abs(right.spacing - 90) : Number.MAX_SAFE_INTEGER;
      if (leftDistance !== rightDistance) return leftDistance - rightDistance;
      return String(left.id).localeCompare(String(right.id));
    })
    .slice(0, 3);
  return { included, filtered };
}

function buildKoReferencePairCandidates(result, row, sourceGuides, overrideBuilder, sourceLabel) {
  return buildKoReferencePairDiagnostics(result, row, sourceGuides, overrideBuilder, sourceLabel).included;
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
    clientId: "",
    clientName: "",
    gene: "",
    cellLine: "",
    editSummary: "",
    projectFolderName: "",
    notes: "",
    projectType: "pm",
    referenceSource: "genbank",
    mutation: "",
    tag: "SD40-2xHA",
    homologyArm: "250",
    customGuides: "",
    gbRaw: "",
    fileName: "",
    rawSequence: "",
    cdsStart: "",
    cdsEnd: "",
    exonCoordinates: "",
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
  if (result.type === "it") return `${result.gene} internal ${result.tag} after ${result.wA}${result.an}`;
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

function buildInternalDonorOrderName(result, donor, donorIndex) {
  return `${buildSafeToken(result.gene, "GENE")}_${result.wA}${result.an}_${buildSafeToken(result.tag, "TAG")}_${donor.n || `ssODN${donorIndex + 1}`}`;
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
      referenceFile: row.referenceSource === "raw" ? "Raw DNA + CDS coordinates" : (row.fileName || "Uploaded GenBank"),
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
      : result.type === "it"
        ? (result.os || []).map((donor, donorIndex) => ({
          ...common,
          itemType: "Donor",
          name: buildInternalDonorOrderName(result, donor, donorIndex),
          sequence: donor.od,
          spacer: "",
          pam: "",
          strand: donor.sl || "",
          length: donor.od?.length || 0,
          linkedGuide: donor.guideName || "",
          recommended: "Order this strand",
          notes: donor.guideName ? `Guide-linked internal ssODN, reverse complement to ${donor.guideName}` : "Guide-linked internal ssODN donor",
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
  if (compact === "it" || compact === "internal" || compact === "internaltag" || compact === "internalinframetag" || compact === "inframe" || compact === "inframetag" || compact === "internalknockin") return "it";
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

function detectInternalSiteToken(text) {
  const raw = String(text || "");
  const afterMatch = raw.match(/\bafter\s+([A-Za-z]\d+|\d+)\b/i);
  if (afterMatch) return afterMatch[1].toUpperCase();
  if (/\b(internal|in-frame|inframe)\b/i.test(raw)) {
    const inlineMatch = raw.match(/\b([A-Za-z]\d+|\d+)\b/i);
    if (inlineMatch) return inlineMatch[1].toUpperCase();
  }
  return "";
}

function detectProjectTypeFromText(text, mutation, internalSite, cassetteKey) {
  const lower = String(text || "").toLowerCase();
  if (/\b(ko|knockout)\b/.test(lower)) return "ko";
  if (/\b(internal|in-frame|inframe)\b/.test(lower)) return "it";
  if (/\b(c[\s-]?term(?:inal)?|ct)\b/.test(lower)) return "ct";
  if (/\b(n[\s-]?term(?:inal)?|nt)\b/.test(lower)) return "nt";
  if (internalSite && cassetteKey && INTERNAL_TAGS[cassetteKey]) return "it";
  if (cassetteKey?.startsWith("N:")) return "nt";
  if (cassetteKey) return "ct";
  if (mutation) return "pm";
  if (/^[A-Za-z0-9._-]+$/.test(String(text || "").trim())) return "ko";
  return "pm";
}

function detectCassetteKey(text, targetType = "") {
  const normalizedLine = String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const aliasedKey = CASSETTE_ALIASES[normalizedLine];
  if (aliasedKey) return aliasedKey;
  if (!targetType || targetType === "it") {
    const internalKeys = Object.keys(INTERNAL_TAGS).sort((a, b) => b.length - a.length);
    for (const key of internalKeys) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]+/g, "");
      if (normalizedLine.includes(normalizedKey)) return key;
    }
  }
  const keys = Object.keys(CASSETTES).sort((a, b) => b.length - a.length);
  const allowKeyForTarget = (key) => {
    if (!targetType) return true;
    if (targetType === "nt") return NT_CASSETTE_OPTIONS.includes(key);
    if (targetType === "ct") return CT_CASSETTE_OPTIONS.includes(key);
    return true;
  };
  for (const key of keys) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const bareKey = normalizedKey.replace(/^n/, "");
    if (normalizedLine.includes(normalizedKey)) {
      if (allowKeyForTarget(key)) return key;
    }
    if (targetType === "nt" && key.startsWith("N:") && normalizedLine.includes(bareKey)) return key;
    if (targetType === "ct" && CT_CASSETTE_OPTIONS.includes(key) && normalizedLine.includes(normalizedKey)) return key;
  }
  return "";
}

function detectGeneToken(text, cellLine, mutation, cassetteKey) {
  const raw = String(text || "").replace(/[,;]+/g, " ").trim();
  const tokens = raw.split(/\s+/).filter(Boolean);
  const stopTokens = new Set([
    "ko", "knockout", "ct", "nt", "cterminal", "nterminal", "c-terminal", "n-terminal",
    "c", "n", "term", "terminal", "in", "with", "internal", "inframe", "after",
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
  const internalSite = detectInternalSiteToken(trimmed);
  const projectType = detectProjectTypeFromText(trimmed, mutation, internalSite, initialCassette);
  const cassetteKey = detectCassetteKey(trimmed, projectType) || ((projectType === "ct" || projectType === "nt" || projectType === "it") ? initialCassette : "");
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
    mutation: projectType === "pm" ? mutation : projectType === "it" ? internalSite : "",
    tag: projectType === "ct" || projectType === "nt"
      ? (cassetteKey || (projectType === "nt" ? "N:EGFP-Linker" : "SD40-2xHA"))
      : projectType === "it"
        ? (cassetteKey || "SPOT")
        : "SD40-2xHA",
    homologyArm: projectType === "ct" || projectType === "nt" ? "250" : "250",
    customGuides: "",
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

function parseWorkspaceProjectFolderEntries(entries, folderLibrary) {
  return entries.map((entry, index) => {
    const title = String(entry.name || "").replace(/^\d{3,}(?:\s+\(\d{3,}\))?\s*-\s*/, "").trim();
    const parsed = parseRequestLine(title, index, folderLibrary) || createBatchRow(index);
    const nextRow = {
      ...parsed,
      irisId: entry.irisId || parsed.irisId,
      clientId: entry.parentId || parsed.clientId || "",
      label: title || parsed.label,
      editSummary: title || parsed.editSummary,
      projectFolderName: entry.name,
    };
    return {
      ...nextRow,
      parseIssue: summarizeRowParseIssue(nextRow),
    };
  });
}

function parseCustomGuideInput(value) {
  return String(value || "")
    .split(/\r?\n|,|;/)
    .map((entry) => entry.toUpperCase().replace(/[^ACGT]/g, ""))
    .filter(Boolean)
    .slice(0, 2);
}

function parseRawSequenceInput(value) {
  return String(value || "").toUpperCase().replace(/[^ACGT]/g, "");
}

function parseExonCoordinateInput(value) {
  return String(value || "")
    .split(/\r?\n|,|;/)
    .map((entry, index) => {
      const match = entry.trim().match(/^(\d+)\s*[-:]\s*(\d+)$/);
      if (!match) return null;
      const start = parseInt(match[1], 10);
      const end = parseInt(match[2], 10);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
      return {
        start: start - 1,
        end,
        exonNumber: index + 1,
        label: `Exon ${index + 1}`,
      };
    })
    .filter(Boolean);
}

function hasRawReference(row) {
  return Boolean(parseRawSequenceInput(row?.rawSequence) && row?.cdsStart && row?.cdsEnd);
}

function hasSequenceBackedReference(row) {
  return row?.referenceSource === "raw"
    ? hasRawReference(row)
    : Boolean(row?.gbRaw || row?.fileName);
}

function summarizeRowParseIssue(row, fileEntryOverride = null) {
  const issues = [];
  if (!row?.gene) issues.push("gene");
  if (!row?.cellLine && !(row?.projectType === "ko" && !row?.gbRaw && !row?.fileName && !fileEntryOverride)) issues.push("cell line");
  if (row?.projectType === "pm" && !row?.mutation) issues.push("mutation");
  if (row?.projectType === "it" && !row?.mutation) issues.push("in-frame insert site");
  if (row?.projectType === "it" && !row?.tag) issues.push("internal tag");
  if ((row?.projectType === "ct" || row?.projectType === "nt") && !row?.tag) issues.push("cassette");
  const hasFile = Boolean(fileEntryOverride || row?.gbRaw || row?.fileName);
  const hasRawReferenceValue = hasRawReference(row);
  const hasCustomGuides = parseCustomGuideInput(row?.customGuides).length > 0;
  if (row?.referenceSource === "raw") {
    if (!parseRawSequenceInput(row?.rawSequence)) issues.push("DNA sequence");
    if (!row?.cdsStart || !row?.cdsEnd) issues.push("CDS coordinates");
  } else if (!hasFile && (row?.projectType !== "ko" || hasCustomGuides)) {
    issues.push("GenBank");
  }
  if (row?.projectType === "ko" && hasCustomGuides && !(hasFile || hasRawReferenceValue)) issues.push("reference sequence");
  return issues.length ? `Needs ${issues.join(", ")}` : "";
}

function parseInternalDefinitionSpec(value) {
  const text = String(value || "").trim();
  return {
    site: detectInternalSiteToken(text),
    tag: detectCassetteKey(text, "it"),
  };
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

let xlsxModulePromise = null;

async function loadXlsx() {
  if (!xlsxModulePromise) {
    xlsxModulePromise = import("xlsx");
  }
  return xlsxModulePromise;
}

async function downloadXlsxTemplate(headers, rows, fileName) {
  const XLSX = await loadXlsx();
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows.map((row) => headers.map((header) => row[header] ?? ""))]);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  XLSX.writeFile(workbook, fileName);
}

async function downloadIdtWorkbook(kind, templateRows, filePrefix = "") {
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
  await downloadXlsxTemplate(config.headers, config.rows, config.fileName);
  return config.fileName;
}

async function buildIdtWorkbookFile(kind, templateRows, filePrefix = "") {
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
  const XLSX = await loadXlsx();
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([config.headers, ...config.rows.map((row) => config.headers.map((header) => row[header] ?? ""))]);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  const blob = new Blob(
    [XLSX.write(workbook, { bookType: "xlsx", type: "array" })],
    { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  );
  return { fileName: config.fileName, blob };
}

async function writeTextToDirectory(directoryHandle, fileName, content) {
  const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

async function writeBlobToDirectory(directoryHandle, fileName, blob) {
  const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

function normalizeGeneToken(value) {
  const upper = String(value || "").toUpperCase().trim();
  const withoutIds = upper.replace(/[-_\s]*(ENSG|NM_|NCBI)\S*/g, " ");
  const compact = withoutIds.replace(/[^A-Z0-9]+/g, " ").trim();
  return compact.split(/\s+/)[0] || "";
}

function inferCasDatabaseOrganismId(result) {
  const assembly = String(result?.gb?.assembly || "").toLowerCase();
  if (assembly.includes("grcm") || assembly.includes("mm10") || assembly.includes("mouse")) return "6";
  if (assembly.includes("rnor") || assembly.includes("rat")) return "5";
  if (assembly.includes("grcz") || assembly.includes("zebrafish")) return "8";
  if (assembly.includes("sus") || assembly.includes("pig")) return "12";
  return "1";
}

function getBrunelloReferenceGuideSet(result, brunelloLookup) {
  if (!brunelloLookup?.guides?.length) return null;
  return {
    requestedGene: brunelloLookup.requestedGene || normalizeGeneToken(result?.gene),
    libraryGene: brunelloLookup.libraryGene || normalizeGeneToken(result?.gene),
    source: brunelloLookup.source || "Broad GPP Brunello human CRISPRko library",
    summary: brunelloLookup.summary || "Reference sgRNAs ranked by Rule Set 2 on-target score from the Addgene Brunello library contents table.",
    guides: brunelloLookup.guides,
  };
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

function simplifyTagName(tag) {
  const raw = String(tag || "").replace(/^N:/, "");
  if (/SD40/i.test(raw)) return "SD40";
  if (/dTAG/i.test(raw)) return "dTAG";
  if (/mAID/i.test(raw)) return "mAID";
  if (/2xHA/i.test(raw) && !/SD40|dTAG|mAID/i.test(raw)) return "2xHA";
  if (/EGFP/i.test(raw)) return "EGFP";
  if (/mScarlet/i.test(raw)) return "mScarlet";
  if (/mCherry/i.test(raw)) return "mCherry";
  return raw;
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
  if (result.type === "pm" || result.type === "it") return "ssODN";
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

  if (!fileName && result?.gb?.source !== "raw-sequence" && !result?.referenceOnly) items.push({ level: "warning", text: "Reference sequence filename is missing from the report. Keep the exact GenBank record with the final design package." });
  if (!meta.notes.trim()) items.push({ level: "check", text: "Record transcript assumptions, exon numbering assumptions, and delivery method before final sign-off." });

  const outOfRangeGuides = (result.gs || []).filter((guide) => typeof guide.gc === "number" && (guide.gc < 30 || guide.gc > 80));
  if (outOfRangeGuides.length) items.push({ level: "warning", text: `Guide GC content is atypical for ${outOfRangeGuides.length} guide${outOfRangeGuides.length === 1 ? "" : "s"}; review activity and synthesis risk manually.` });

  if (result.type === "pm") {
    if (!(result.ss || []).length) items.push({ level: "warning", text: "No silent guide-blocking mutation was introduced. Re-cut after HDR may remain possible." });
    if (typeof result.guideWindow === "number" && result.guideWindow > 10) items.push({ level: "warning", text: `No guide was available within 10 bp of the mutation site. This design is using the best available ${result.guideTier || "fallback"} guide set within ${result.guideWindow} bp.` });
    items.push({ level: "check", text: "Confirm the desired amino-acid change against the intended transcript and verify that the donor does not create unwanted amino-acid substitutions." });
  }

  if (result.type === "it") {
    if (!(result.os || []).length) items.push({ level: "warning", text: "No guide-linked internal ssODN donor could be rendered. Review the insertion-site window and sequence bounds before ordering." });
    if (!(result.ss || []).length) items.push({ level: "warning", text: "No guide-blocking mutation was introduced in the internal ssODN donors. Re-cut after HDR may remain possible." });
    if ((result.os || []).length !== (result.gs || []).length) items.push({ level: "warning", text: "A donor was not generated for every selected guide. Review guide-linked donor coverage before ordering." });
    if (typeof result.guideWindow === "number" && result.guideWindow > 10) items.push({ level: "warning", text: `No guide was available within 10 bp of the internal insertion site. This design is using the best available ${result.guideTier || "fallback"} guide set within ${result.guideWindow} bp.` });
    if (result.insertValidation && !result.insertValidation.matchesPreset) items.push({ level: "warning", text: "The designed internal-tag donor insert does not match the intended tag preset sequence. Review the tag DNA before ordering." });
    if (result.insertValidation && !result.insertValidation.framePreserved) items.push({ level: "warning", text: "The designed internal-tag donor insert is not passing the frame check. Review codon continuity and unexpected stop codons before ordering." });
    (result.insertValidation?.canonicalChecks || []).forEach((check) => {
      if (!check.matches) items.push({ level: "warning", text: `${check.label} does not match the designed internal-tag donor at the protein level. Review the preset sequence before ordering.` });
    });
    items.push({ level: "check", text: "Confirm that the internal tag remains in frame with the surrounding CDS and verify that the inserted peptide does not disrupt known functional motifs." });
  }

  if (result.type === "ko") {
    const guideCount = (result.gs || []).length;
    if (guideCount < 2) items.push({ level: "warning", text: "Knockout design has fewer than two guides. Deletion-based screening will be weaker than expected." });
    if (result.referenceOnly) items.push({ level: "warning", text: "This knockout was generated from gene-name reference guides only. Upload a GenBank file to calculate exact exon geometry, pair spacing, and validation primers on your target sequence." });
    items.push({ level: "check", text: "Validate the expected deletion by junction PCR and confirm frameshift or protein loss in established clones." });
  }

  if (result.type === "ct" || result.type === "nt") {
    const labels = new Set((result.donorAnnotations || []).map((annotation) => annotation.label));
    const guideProtection = Array.isArray(result.guideProtection) ? result.guideProtection : [];
    const unprotectedGuides = guideProtection.filter((entry) => !entry.protected);
    if (guideProtection.length && unprotectedGuides.length) {
      items.push({ level: "warning", text: `${unprotectedGuides.length} of ${guideProtection.length} tag-insertion guide${guideProtection.length === 1 ? "" : "s"} remain unblocked in the donor design. Re-cut of the edited allele may still be possible.` });
    } else if (!guideProtection.length && !(result.ss || []).length) {
      items.push({ level: "warning", text: "No guide-disrupting mutation was captured in the HDR donor arms. Re-cut of the edited allele is still possible." });
    }
    if (result.type === "nt" && !labels.has("Start")) items.push({ level: "warning", text: "N-terminal donor annotation does not include a start codon block. Verify start codon replacement before ordering." });
    if (result.type === "ct" && !labels.has("Stop")) items.push({ level: "warning", text: "C-terminal donor annotation does not include a terminal stop codon block. Verify stop codon placement before ordering." });
    if (result.insertValidation && !result.insertValidation.matchesPreset) items.push({ level: "warning", text: "The designed HDR donor insert does not match the intended cassette preset. Review the insert sequence before ordering." });
    if (result.insertValidation && !result.insertValidation.framePreserved) items.push({ level: "warning", text: "The designed HDR donor insert is not passing the frame check. Review codon continuity and unexpected stop codons before ordering." });
    (result.insertValidation?.canonicalChecks || []).forEach((check) => {
      if (!check.matches) items.push({ level: "warning", text: `${check.label} does not match the designed HDR donor at the protein level. Review the cassette preset before ordering.` });
    });
    if (typeof result.guideWindow === "number" && result.guideWindow > 10) items.push({ level: "warning", text: `No guide was available within 10 bp of the insertion site. This design is using the best available ${result.guideTier || "fallback"} guide set within ${result.guideWindow} bp.` });
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
  const orderedDesired = [...(donor.desiredDiffIndexes || [])].sort((left, right) => left - right);
  const oppositeDesired = orderedDesired.map((index) => length - 1 - index).sort((left, right) => left - right);
  const orderedSilent = [...(donor.silentDiffIndexes || [])].sort((left, right) => left - right);
  const oppositeSilent = orderedSilent.map((index) => length - 1 - index).sort((left, right) => left - right);
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
      desiredIndexes: orderedDesired,
      silentIndexes: orderedSilent,
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
      desiredIndexes: oppositeDesired,
      silentIndexes: oppositeSilent,
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

function buildPmAnnotatedSequenceHtml(label, sequence, diffIndexes, mode, regions, guide, desiredIndexes = [], silentIndexes = []) {
  const diffSet = new Set(diffIndexes);
  const desiredSet = new Set(desiredIndexes);
  const silentSet = new Set(silentIndexes);
  const sequenceHtml = (sequence || "").split("").map((base, index) => {
    const changed = diffSet.has(index);
    const isDesired = desiredSet.has(index);
    const isSilent = silentSet.has(index);
    const region = findPmRegion(index, regions);
    const inGuide = guide && index >= guide.siteStart && index < guide.siteEnd;
    const inPam = guide && index >= guide.pamStart && index < guide.pamEnd;
    const styles = [
      `background:${inPam ? PM_GUIDE_COLORS.pam : isSilent && mode === "donor" ? PM_EDIT_COLORS.silent : isDesired && mode === "donor" ? PM_EDIT_COLORS.desired : changed && mode === "donor" ? PM_EDIT_COLORS.desired : inGuide ? PM_GUIDE_COLORS.site : (region?.color || "transparent")}`,
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
        <span style="display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:700;color:#92400E;background:${PM_EDIT_COLORS.desired};">Desired edit</span>
        ${strand.silentIndexes?.length ? `<span style="display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:700;color:#7F1D1D;background:${PM_EDIT_COLORS.silent};">Silent mutation</span>` : ""}
      </div>
      ${buildPmAnnotatedSequenceHtml("WT", strand.wt, strand.diffIndexes, "wt", strand.regions, strand.guide, strand.desiredIndexes, strand.silentIndexes)}
      ${buildPmAnnotatedSequenceHtml("Donor", strand.donor, strand.diffIndexes, "donor", strand.regions, strand.guide, strand.desiredIndexes, strand.silentIndexes)}
    </div>
  `;
}

function buildPmDonorHtml(donor) {
  const comparison = buildPmDonorComparison(donor);
  const strands = buildPmStrandModels(donor);
  const silentSummary = (donor.silentMutations || []).map((mutation) => `${mutation.lb}: ${mutation.oc} -> ${mutation.nc} | ${mutation.pur}`).join("<br/>");
  return `
    <h3 style="color:#2E75B6;margin:18px 0 8px 0;">${donor.n} (${donor.sl})</h3>
    <p style="font-size:12px;color:#555;margin:0 0 10px 0;">Linked guide: ${donor.guideName}</p>
    ${silentSummary ? `<p style="font-size:12px;color:#7F1D1D;margin:0 0 10px 0;"><strong>Silent mutation:</strong><br/>${silentSummary}</p>` : ""}
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

function buildKnockinProteinRowHtml(label, tokens = [], insertStart = 0, insertLength = 0, highlightInsert = false) {
  const insertEnd = insertStart + insertLength;
  return `
    <div style="margin:0 0 8px 0;">
      <div style="color:#667085;font-size:11px;margin-bottom:4px;">${label}</div>
      <div style="font-family:Consolas,monospace;font-size:12px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere;">
        ${tokens.map((token, index) => `<span style="display:inline-block;min-width:${token === "Stop" ? "5ch" : "2ch"};margin-right:6px;text-align:center;color:#111827;${highlightInsert && index >= insertStart && index < insertEnd ? "background:#FDE68A;font-weight:800;border-radius:3px;padding:0 2px;" : ""}">${token}</span>`).join("")}
      </div>
    </div>
  `;
}

function buildKnockinProteinHtml(preview, title = "Protein Translation View") {
  if (!preview) return "";
  if (preview.wtCodons && preview.donorCodons && preview.wtAas && preview.donorAas) {
    return `
      <div style="margin:0 0 14px 0;padding:12px;border:1px solid #d7dee7;border-radius:12px;background:#f8fafc;">
        <div style="color:#667085;font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:8px;">Coding Frame View</div>
        <p style="font-size:12px;color:#555;margin:0 0 10px 0;">${preview.note}</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
          <span style="display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:700;color:#92400E;background:#FDE68A;">Inserted tag / reporter codons and amino acids</span>
        </div>
        ${buildAlignedRowHtml("WT codons", { tokens: preview.wtCodons }, [], "wt")}
        ${buildAlignedRowHtml("Donor codons", { tokens: preview.donorCodons }, Array.from({ length: preview.insertCodonLength }, (_, index) => preview.insertCodonStart + index), "donor")}
        ${buildAlignedRowHtml("WT amino acids", { tokens: preview.wtAas }, [], "wt")}
        ${buildAlignedRowHtml("Donor amino acids", { tokens: preview.donorAas }, Array.from({ length: preview.insertAaLength }, (_, index) => preview.insertAaStart + index), "donor")}
      </div>
    `;
  }
  return `
    <div style="margin:0 0 14px 0;padding:12px;border:1px solid #d7dee7;border-radius:12px;background:#f8fafc;">
      <div style="color:#667085;font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:8px;">${title}</div>
      <p style="font-size:12px;color:#555;margin:0 0 10px 0;">${preview.note}</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
        <span style="display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:700;color:#92400E;background:#FDE68A;">Inserted tag / reporter</span>
      </div>
      ${buildKnockinProteinRowHtml(preview.wtLabel, preview.wtTokens)}
      ${buildKnockinProteinRowHtml(preview.donorLabel, preview.donorTokens, preview.insertStart, preview.insertLength, true)}
    </div>
  `;
}

function buildInsertValidationHtml(validation) {
  if (!validation) return "";
  const expectedAa = (validation.expectedAas || []).join("");
  const actualAa = (validation.actualAas || []).join("");
  const badges = [
    {
      label: validation.matchesPreset ? "Preset matches donor" : "Preset mismatch",
      color: validation.matchesPreset ? "#047857" : "#B42318",
      background: validation.matchesPreset ? "#D1FAE5" : "#FEE4E2",
    },
    {
      label: validation.framePreserved ? "Reading frame preserved" : "Frame flagged",
      color: validation.framePreserved ? "#047857" : "#B42318",
      background: validation.framePreserved ? "#D1FAE5" : "#FEE4E2",
    },
  ];
  if (validation.unexpectedStop || validation.terminalStopPresent) {
    badges.push({
      label: validation.unexpectedStop ? "Unexpected stop detected" : "Terminal stop retained",
      color: validation.unexpectedStop ? "#B42318" : "#92400E",
      background: validation.unexpectedStop ? "#FEE4E2" : "#FEF3C7",
    });
  }
  return `
    <div style="margin:0 0 14px 0;padding:12px;border:1px solid #d7dee7;border-radius:12px;background:#f8fafc;">
      <div style="color:#667085;font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:8px;">Insert Identity Check</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
        ${badges.map((badge) => `<span style="display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:700;color:${badge.color};background:${badge.background};">${badge.label}</span>`).join("")}
      </div>
      <div style="font-size:12px;color:#555;margin-bottom:8px;">Expected insert: ${validation.expectedLengthBp} bp | Designed donor insert: ${validation.actualLengthBp} bp</div>
      <div style="color:#667085;font-size:11px;margin-bottom:4px;">Expected insert DNA</div>
      <div style="font-family:Consolas,monospace;font-size:12px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere;margin-bottom:8px;">${validation.expectedSequence || "n/a"}</div>
      <div style="color:#667085;font-size:11px;margin-bottom:4px;">Designed donor insert DNA</div>
      <div style="font-family:Consolas,monospace;font-size:12px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere;margin-bottom:8px;">${validation.actualSequence || "n/a"}</div>
      <div style="color:#667085;font-size:11px;margin-bottom:4px;">Expected insert amino acids</div>
      <div style="font-family:Consolas,monospace;font-size:12px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere;margin-bottom:8px;">${expectedAa || "n/a"}</div>
      <div style="color:#667085;font-size:11px;margin-bottom:4px;">Designed donor insert amino acids</div>
      <div style="font-family:Consolas,monospace;font-size:12px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere;">${actualAa || "n/a"}</div>
      ${(validation.canonicalChecks || []).map((check) => `
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid #E5E7EB;">
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:6px;">
            <span style="font-size:12px;font-weight:700;color:#111827;">${check.label}</span>
            <span style="display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:700;color:${check.matches ? "#047857" : "#B42318"};background:${check.matches ? "#D1FAE5" : "#FEE4E2"};">${check.matches ? "Protein matches reference" : "Protein mismatch"}</span>
          </div>
          ${check.sourceUrl ? `<div style="color:#667085;font-size:11px;margin-bottom:6px;">Source: <a href="${check.sourceUrl}" target="_blank" rel="noreferrer" style="color:#2E75B6;text-decoration:none;">${check.sourceUrl}</a></div>` : ""}
          <div style="color:#667085;font-size:11px;margin-bottom:4px;">Reference amino acids</div>
          <div style="font-family:Consolas,monospace;font-size:12px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere;margin-bottom:8px;">${check.expectedAas || "n/a"}</div>
          <div style="color:#667085;font-size:11px;margin-bottom:4px;">Designed amino acids</div>
          <div style="font-family:Consolas,monospace;font-size:12px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere;">${check.actualAas || "n/a"}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function buildKnockinQcChecks(result) {
  if (!result || !["it", "ct", "nt"].includes(result.type)) return [];
  const canonicalChecks = result.insertValidation?.canonicalChecks || [];
  const anyGuideProtection = result.type === "it"
    ? (result.ss || []).length > 0
    : ((result.guideProtection || []).some((entry) => entry.protected) || (result.ss || []).length > 0);
  const checks = [
    {
      label: "Insert matches preset",
      status: result.insertValidation ? (result.insertValidation.matchesPreset ? "pass" : "warn") : "na",
      detail: result.insertValidation ? (result.insertValidation.matchesPreset ? "Designed donor insert matches the intended preset." : "Designed donor insert differs from the intended preset.") : "Insert identity check unavailable.",
    },
    {
      label: "Frame preserved",
      status: result.insertValidation ? (result.insertValidation.framePreserved ? "pass" : "warn") : "na",
      detail: result.insertValidation ? (result.insertValidation.framePreserved ? "Insert passes the codon/frame check." : "Insert failed the codon/frame check.") : "Frame check unavailable.",
    },
    {
      label: "Reporter sequence verified",
      status: canonicalChecks.length ? (canonicalChecks.every((check) => check.matches) ? "pass" : "warn") : "na",
      detail: canonicalChecks.length
        ? (canonicalChecks.every((check) => check.matches)
          ? canonicalChecks.map((check) => `${check.label} matches canonical FPbase reference.`).join(" ")
          : canonicalChecks.filter((check) => !check.matches).map((check) => `${check.label} does not match canonical FPbase reference.`).join(" "))
        : "No external canonical protein reference attached to this cassette.",
    },
    {
      label: "Guide blocking present",
      status: anyGuideProtection ? "pass" : "warn",
      detail: anyGuideProtection ? "At least one selected guide is blocked by donor mutation or insertion geometry." : "No selected guide is clearly blocked by the donor.",
    },
    {
      label: "Primer strategy ready",
      status: (result.ps || []).length >= 2 && result.amp ? "pass" : "warn",
      detail: (result.ps || []).length >= 2 && result.amp ? `Validation primers are present (${result.amp}).` : "Validation primers or amplicon sizing are incomplete.",
    },
  ];
  return checks;
}

function buildKnockinQcSummaryHtml(result) {
  const checks = buildKnockinQcChecks(result);
  if (!checks.length) return "";
  const styleFor = (status) => status === "pass"
    ? { color: "#047857", background: "#D1FAE5", label: "Pass" }
    : status === "warn"
      ? { color: "#B42318", background: "#FEE4E2", label: "Review" }
      : { color: "#475467", background: "#EAECF0", label: "N/A" };
  return `
    <div style="margin:0 0 14px 0;padding:12px;border:1px solid #d7dee7;border-radius:12px;background:#f8fafc;">
      <div style="color:#667085;font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:8px;">Knock-in QC Summary</div>
      ${checks.map((check) => {
        const badge = styleFor(check.status);
        return `
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:8px 0;border-top:1px solid #E5E7EB;">
            <div style="min-width:0;">
              <div style="font-size:12px;font-weight:700;color:#111827;">${check.label}</div>
              <div style="font-size:12px;color:#555;margin-top:2px;">${check.detail}</div>
            </div>
            <span style="display:inline-flex;align-items:center;white-space:nowrap;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:700;color:${badge.color};background:${badge.background};">${badge.label}</span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function buildDesignReadinessChecks(result) {
  if (!result) return [];
  const referenceAvailable = Boolean(result.gb?.genomicSequence || result.gbRaw || result.gene);
  const guideCount = (result.gs || []).length;
  const primerReady = (result.ps || []).length >= 2 && !!result.amp;
  const checks = [
    {
      label: "Reference anchored",
      status: referenceAvailable ? "pass" : "warn",
      detail: result.referenceOnly
        ? "Guide shortlist is gene-level only. Upload GenBank for exact locus geometry."
        : referenceAvailable
          ? "Design is anchored to a concrete reference sequence or validated lookup."
          : "Reference sequence is missing.",
    },
  ];

  if (result.type === "pm") {
    checks.push(
      {
        label: "Requested edit validated",
        status: result.wA && result.mA && result.gp !== undefined ? "pass" : "warn",
        detail: result.wA && result.mA
          ? `${result.wA}${result.an}${result.mA} was mapped onto the coding sequence.`
          : "Mutation could not be validated against the coding sequence.",
      },
      {
        label: "Guide geometry acceptable",
        status: typeof result.guideWindow === "number" && result.guideWindow <= 30 && guideCount > 0 ? (result.guideWindow <= 10 ? "pass" : "warn") : "warn",
        detail: guideCount
          ? `Selected ${guideCount} guide${guideCount === 1 ? "" : "s"} with best cut distance ${result.guideWindow || "n/a"} bp from the edit.`
          : "No usable guide was found near the mutation.",
      },
      {
        label: "Guide blocking present",
        status: (result.ss || []).length ? "pass" : "warn",
        detail: (result.ss || []).length
          ? "At least one silent guide-blocking change was added to the donor."
          : "No silent guide-blocking change was captured.",
      },
      {
        label: "Primer strategy ready",
        status: primerReady ? "pass" : "warn",
        detail: primerReady ? `Centered validation primers are ready (${result.amp}).` : "Validation primers are incomplete.",
      },
    );
    return checks;
  }

  if (result.type === "ko") {
    checks.push(
      {
        label: "Guide pair ready",
        status: guideCount >= 2 ? "pass" : "warn",
        detail: guideCount >= 2
          ? result.referenceOnly
            ? "Two reference knockout guides are selected. Sequence-backed spacing still needs GenBank."
            : "Two knockout guides are selected with local spacing and primer design."
          : "A full knockout guide pair is not available.",
      },
      {
        label: "Sequence-backed geometry",
        status: result.referenceOnly ? "warn" : "pass",
        detail: result.referenceOnly
          ? "This is a high-throughput reference-only KO design."
          : "Cut spacing and exon context were calculated on the uploaded reference.",
      },
      {
        label: "Primer strategy ready",
        status: primerReady ? "pass" : result.referenceOnly ? "na" : "warn",
        detail: primerReady
          ? `${result.primerStrategy === "deletion-screen" ? "Deletion-junction" : "Validation"} primers are ready (${result.amp}).`
          : result.referenceOnly
            ? "Primer design is deferred until a GenBank reference is uploaded."
            : "Validation primers are incomplete.",
      },
    );
    return checks;
  }

  if (["it", "ct", "nt"].includes(result.type)) {
    const canonicalChecks = result.insertValidation?.canonicalChecks || [];
    const anyGuideProtection = result.type === "it"
      ? (result.ss || []).length > 0
      : ((result.guideProtection || []).some((entry) => entry.protected) || (result.ss || []).length > 0);
    checks.push(
      {
        label: "Insert matches preset",
        status: result.insertValidation ? (result.insertValidation.matchesPreset ? "pass" : "warn") : "na",
        detail: result.insertValidation ? (result.insertValidation.matchesPreset ? "Designed insert matches the intended preset." : "Designed insert differs from the intended preset.") : "Insert identity check unavailable.",
      },
      {
        label: "Frame preserved",
        status: result.insertValidation ? (result.insertValidation.framePreserved ? "pass" : "warn") : "na",
        detail: result.insertValidation ? (result.insertValidation.framePreserved ? "Insert passes the frame check." : "Insert fails the frame check.") : "Frame check unavailable.",
      },
      {
        label: "Reporter or tag verified",
        status: canonicalChecks.length ? (canonicalChecks.every((check) => check.matches) ? "pass" : "warn") : "na",
        detail: canonicalChecks.length
          ? (canonicalChecks.every((check) => check.matches) ? "Canonical FPbase protein check passed." : "Canonical FPbase protein check failed.")
          : "No canonical reporter check attached to this construct.",
      },
      {
        label: "Guide blocking present",
        status: anyGuideProtection ? "pass" : "warn",
        detail: anyGuideProtection ? "At least one selected guide is blocked by donor mutation or insertion geometry." : "No selected guide is clearly blocked by the donor.",
      },
      {
        label: "Primer strategy ready",
        status: primerReady ? "pass" : "warn",
        detail: primerReady ? `Validation primers are ready (${result.amp}).` : "Validation primers are incomplete.",
      },
    );
    return checks;
  }

  return checks;
}

function buildDesignReadinessHtml(result) {
  const checks = buildDesignReadinessChecks(result);
  if (!checks.length) return "";
  const styleFor = (status) => status === "pass"
    ? { color: "#047857", background: "#D1FAE5", label: "Pass" }
    : status === "warn"
      ? { color: "#B42318", background: "#FEE4E2", label: "Review" }
      : { color: "#475467", background: "#EAECF0", label: "N/A" };
  return `
    <div style="margin:0 0 14px 0;padding:12px;border:1px solid #d7dee7;border-radius:12px;background:#f8fafc;">
      <div style="color:#667085;font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:8px;">Design Readiness</div>
      ${checks.map((check) => {
        const badge = styleFor(check.status);
        return `
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:8px 0;border-top:1px solid #E5E7EB;">
            <div style="min-width:0;">
              <div style="font-size:12px;font-weight:700;color:#111827;">${check.label}</div>
              <div style="font-size:12px;color:#555;margin-top:2px;">${check.detail}</div>
            </div>
            <span style="display:inline-flex;align-items:center;white-space:nowrap;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:700;color:${badge.color};background:${badge.background};">${badge.label}</span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function normalizeLocusWindow(result) {
  const genomicLength = result?.gb?.genomicSequence?.length || 0;
  if (!genomicLength) return null;
  const positions = [];
  (result.gs || []).forEach((guide) => {
    if (Number.isFinite(guide.cut)) positions.push(guide.cut);
    const noteCut = String(guide.note || guide.arm || "").match(/Cut at (\d+)/i);
    if (noteCut) positions.push(parseInt(noteCut[1], 10) - 1);
  });
  if (result.type === "pm" && Number.isFinite(result.gp)) positions.push(result.gp);
  if (result.type === "it" && Number.isFinite(result.gp)) positions.push(result.gp);
  if (result.type === "ct" && Number.isFinite(result.sp)) positions.push(result.sp - 1);
  if (result.type === "nt" && Array.isArray(result.gb?.cdsSegments) && result.gb.cdsSegments.length) positions.push(result.gb.cdsSegments[0][0]);
  if (!positions.length) return null;
  const center = Math.round(positions.reduce((sum, value) => sum + value, 0) / positions.length);
  const span = 520;
  const start = Math.max(0, center - Math.floor(span / 2));
  const end = Math.min(genomicLength, Math.max(start + 1, start + span));
  return { start, end, length: end - start, genomicLength };
}

function primerWindowMatches(seq, primer, reverse = false) {
  const target = String(primer || "").toUpperCase();
  if (!target) return null;
  const search = reverse ? reverseComplement(target) : target;
  const index = seq.indexOf(search);
  if (index < 0) return null;
  return { start: index, end: index + search.length, reverse };
}

function buildLocusStructureItems(result, window) {
  if (!window) return { exons: [], introns: [] };
  const exons = Array.isArray(result?.gb?.exons) && result.gb.exons.length
    ? result.gb.exons
    : (Array.isArray(result?.gb?.cdsSegments)
      ? result.gb.cdsSegments.map(([start, end], index) => ({ start, end, exonNumber: index + 1, label: `Exon ${index + 1}` }))
      : []);
  const normalizeItem = (item, kind, label, color) => {
    if (item.end <= window.start || item.start >= window.end) return null;
    return {
      kind,
      label,
      color,
      start: item.start,
      end: item.end,
      left: ((Math.max(item.start, window.start) - window.start) / window.length) * 100,
      width: Math.max(1, ((Math.min(item.end, window.end) - Math.max(item.start, window.start)) / window.length) * 100),
    };
  };
  const exonItems = exons
    .map((exon) => normalizeItem(exon, "exon", exon.label || `Exon ${exon.exonNumber}`, "#2563EB"))
    .filter(Boolean);
  const intronItems = [];
  for (let index = 0; index < exons.length - 1; index += 1) {
    const left = exons[index];
    const right = exons[index + 1];
    if (right.start <= left.end) continue;
    const intron = normalizeItem(
      { start: left.end, end: right.start },
      "intron",
      `Intron ${left.exonNumber}-${right.exonNumber}`,
      "#94A3B8",
    );
    if (intron) intronItems.push(intron);
  }
  return { exons: exonItems, introns: intronItems };
}

function buildLocusMapItems(result, window) {
  if (!window) return [];
  const items = [];
  const pushItem = (item) => {
    if (item.end <= window.start || item.start >= window.end) return;
    items.push({
      ...item,
      left: ((Math.max(item.start, window.start) - window.start) / window.length) * 100,
      width: (Math.max(2, (Math.min(item.end, window.end) - Math.max(item.start, window.start)) / window.length * 100)),
    });
  };
  (result.gs || []).forEach((guide, index) => {
    if (Number.isFinite(guide.cut)) {
      pushItem({
        label: `gRNA${index + 1}`,
        detail: `${guide.sp}${guide.note || guide.arm ? ` | ${guide.note || guide.arm}` : ""}`,
        start: guide.cut,
        end: guide.cut + 1,
        color: "#7C3AED",
        kind: "cut",
      });
    }
  });
  if (result.type === "pm" && Number.isFinite(result.gp)) {
    pushItem({ label: "Edit", detail: `${result.wA}${result.an}${result.mA}`, start: result.gp, end: result.gp + 3, color: "#D97706", kind: "target" });
  }
  if (result.type === "it" && Number.isFinite(result.gp)) {
    pushItem({ label: "Insert", detail: result.tag, start: result.gp, end: result.gp + 3, color: "#D97706", kind: "target" });
  }
  if (result.type === "ct" && Number.isFinite(result.sp)) {
    const start = result.sp - 1;
    pushItem({ label: "Stop junction", detail: result.tag, start, end: start + 3, color: "#D97706", kind: "target" });
    pushItem({ label: "HDR donor", detail: `${result.il || 0} bp insert`, start: Math.max(0, start - (result.h5l || 0)), end: start + 3 + (result.h3l || 0), color: "#0EA5E9", kind: "donor" });
  }
  if (result.type === "nt" && Array.isArray(result.gb?.cdsSegments) && result.gb.cdsSegments.length) {
    const start = result.gb.cdsSegments[0][0];
    pushItem({ label: "Start junction", detail: result.tag, start, end: start + 3, color: "#D97706", kind: "target" });
    pushItem({ label: "HDR donor", detail: `${result.il || 0} bp insert`, start: Math.max(0, start - (result.h5l || 0)), end: start + 3 + (result.h3l || 0), color: "#0EA5E9", kind: "donor" });
  }
  const seq = result.gb?.genomicSequence || "";
  const forwardPrimer = result.ps?.[0]?.s;
  const reversePrimer = result.ps?.[1]?.s;
  const forwardRange = seq ? primerWindowMatches(seq, forwardPrimer, false) : null;
  const reverseRange = seq ? primerWindowMatches(seq, reversePrimer, true) : null;
  if (forwardRange) pushItem({ label: "Fw primer", detail: forwardPrimer, start: forwardRange.start, end: forwardRange.end, color: "#059669", kind: "primer" });
  if (reverseRange) pushItem({ label: "Rev primer", detail: reversePrimer, start: reverseRange.start, end: reverseRange.end, color: "#DC2626", kind: "primer" });
  return items;
}

function buildLocusMapHtml(result) {
  const window = normalizeLocusWindow(result);
  if (!window) return "";
  const structure = buildLocusStructureItems(result, window);
  const items = buildLocusMapItems(result, window);
  if (!items.length) return "";
  return `
    <div style="margin:0 0 14px 0;padding:12px;border:1px solid #d7dee7;border-radius:12px;background:#f8fafc;">
      <div style="color:#667085;font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:8px;">Target Region Map</div>
      <div style="font-size:12px;color:#555;margin-bottom:10px;">Showing ${window.start + 1}-${window.end} on the uploaded reference sequence.</div>
      <div style="font-size:11px;color:#667085;font-weight:700;margin-bottom:6px;">Exon / intron structure</div>
      <div style="position:relative;height:18px;border-radius:999px;background:#E5E7EB;overflow:hidden;margin-bottom:10px;">
        ${structure.introns.map((item) => `<div title="${item.label}" style="position:absolute;left:${item.left}%;width:${item.width}%;top:7px;height:4px;background:${item.color};opacity:0.9;"></div>`).join("")}
        ${structure.exons.map((item) => `<div title="${item.label}" style="position:absolute;left:${item.left}%;width:${item.width}%;top:0;bottom:0;background:${item.color};border-radius:999px;opacity:0.85;"></div>`).join("")}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
        ${structure.exons.map((item) => `<span style="display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:700;color:${item.color};background:${item.color}14;border:1px solid ${item.color}33;">${item.label}</span>`).join("")}
        ${structure.introns.map((item) => `<span style="display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:700;color:${item.color};background:${item.color}14;border:1px solid ${item.color}33;">${item.label}</span>`).join("")}
      </div>
      <div style="font-size:11px;color:#667085;font-weight:700;margin-bottom:6px;">Guides, edits, donors, and primers</div>
      <div style="position:relative;height:14px;border-radius:999px;background:#E5E7EB;overflow:hidden;margin-bottom:14px;">
        ${items.map((item) => `<div title="${item.label}: ${item.detail || ""}" style="position:absolute;left:${item.left}%;width:${item.width}%;top:0;bottom:0;background:${item.color};opacity:${item.kind === "cut" ? 0.95 : 0.7};"></div>`).join("")}
      </div>
      <div style="display:grid;gap:8px;">
        ${items.map((item) => `<div style="display:flex;gap:8px;align-items:flex-start;font-size:12px;color:#344054;"><span style="display:inline-flex;width:10px;height:10px;border-radius:999px;background:${item.color};margin-top:3px;flex:0 0 auto;"></span><span><strong>${item.label}</strong>${item.detail ? `: ${item.detail}` : ""}</span></div>`).join("")}
      </div>
    </div>
  `;
}

function buildInternalProteinHtml(result) {
  const preview = result?.codingPreview;
  if (!preview) return "";
  return `
    <div style="margin:0 0 14px 0;padding:12px;border:1px solid #d7dee7;border-radius:12px;background:#f8fafc;">
      <div style="color:#667085;font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:8px;">Coding Frame View</div>
      <p style="font-size:12px;color:#555;margin:0 0 10px 0;">Insert ${result.tag} after ${result.wA}${result.an}, before ${result.nextAA}${result.an + 1}.</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
        <span style="display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:700;color:#92400E;background:#FDE68A;">Inserted tag codons / amino acids</span>
      </div>
      ${buildAlignedRowHtml("WT codons", { tokens: preview.wtCodons }, [], "wt")}
      ${buildAlignedRowHtml("Donor codons", { tokens: preview.donorCodons }, Array.from({ length: preview.insertCodonLength }, (_, index) => preview.insertCodonStart + index), "donor")}
      ${buildAlignedRowHtml("WT amino acids", { tokens: preview.wtAas }, [], "wt")}
      ${buildAlignedRowHtml("Donor amino acids", { tokens: preview.donorAas }, Array.from({ length: preview.insertAaLength }, (_, index) => preview.insertAaStart + index), "donor")}
    </div>
  `;
}

function mirrorAnnotations(annotations = [], sequenceLength = 0) {
  return (annotations || []).map((item) => ({
    ...item,
    start: Math.max(0, sequenceLength - item.end),
    end: Math.max(0, sequenceLength - item.start),
  }));
}

function buildInternalStrandModels(donor) {
  const ordered = donor.od || "";
  const opposite = reverseComplement(ordered);
  const insertLength = Math.max(0, (donor.insertEnd || 0) - (donor.insertStart || 0));
  const orderedGuideSite = donor.guideSiteIndexes || [];
  const orderedGuidePam = donor.guidePamIndexes || [];
  const orderedSilent = donor.silentIndexes || [];
  const projectWtIndexes = (indexes, wtLength) => indexes
    .map((index) => {
      if (index < (donor.insertStart || 0)) return index;
      if (index >= (donor.insertEnd || 0)) return index - insertLength;
      return null;
    })
    .filter((index) => index !== null && index >= 0 && index < wtLength);
  const orderedWt = donor.wo || "";
  const oppositeWt = reverseComplement(orderedWt);
  const reverseIndexes = (indexes, length) => (indexes || []).map((index) => length - 1 - index).sort((left, right) => left - right);
  const orderedLabel = donor.guideStrand === "+" ? "- strand donor" : "+ strand donor";
  const oppositeLabel = donor.guideStrand === "+" ? "+ strand donor" : "- strand donor";
  return [
    {
      key: "ordered",
      title: orderedLabel,
      recommended: true,
      note: `Recommended to order. This strand is reverse complement to ${donor.guideName}. Cut site lies between the 91 bp and 36 bp arms.`,
      wt: orderedWt,
      donor: ordered,
      annotations: donor.donorAnnotations || [],
      guideSiteIndexes: orderedGuideSite,
      guidePamIndexes: orderedGuidePam,
      silentIndexes: orderedSilent,
      wtGuideSiteIndexes: projectWtIndexes(orderedGuideSite, orderedWt.length),
      wtGuidePamIndexes: projectWtIndexes(orderedGuidePam, orderedWt.length),
    },
    {
      key: "opposite",
      title: oppositeLabel,
      recommended: false,
      note: "Opposite donor strand for reference. Cut site lies between the 36 bp and 91 bp arms on this view.",
      wt: oppositeWt,
      donor: opposite,
      annotations: mirrorAnnotations(donor.donorAnnotations || [], ordered.length),
      guideSiteIndexes: reverseIndexes(orderedGuideSite, ordered.length),
      guidePamIndexes: reverseIndexes(orderedGuidePam, ordered.length),
      silentIndexes: reverseIndexes(orderedSilent, ordered.length),
      wtGuideSiteIndexes: reverseIndexes(projectWtIndexes(orderedGuideSite, orderedWt.length), orderedWt.length),
      wtGuidePamIndexes: reverseIndexes(projectWtIndexes(orderedGuidePam, orderedWt.length), orderedWt.length),
    },
  ];
}

function buildInternalSequenceHtml(label, sequence, guideSiteIndexes = [], guidePamIndexes = [], silentIndexes = [], annotations = [], mode = "donor") {
  const guideSet = new Set(guideSiteIndexes);
  const pamSet = new Set(guidePamIndexes);
  const silentSet = new Set(silentIndexes);
  const findAnnotation = (index) => annotations.filter((item) => index >= item.start && index < item.end).sort((left, right) => (right.priority || 0) - (left.priority || 0))[0];
  const sequenceHtml = (sequence || "").split("").map((base, index) => {
    const annotation = mode === "donor" ? findAnnotation(index) : null;
    const styles = [
      `background:${pamSet.has(index) ? PM_GUIDE_COLORS.pam : silentSet.has(index) && mode === "donor" ? PM_EDIT_COLORS.silent : guideSet.has(index) ? PM_GUIDE_COLORS.site : annotation?.priority > 1 ? `${annotation.color}22` : "transparent"}`,
      `color:${annotation?.color && mode === "donor" && !guideSet.has(index) && !pamSet.has(index) && !silentSet.has(index) ? annotation.color : "#111827"}`,
      `font-weight:${guideSet.has(index) || pamSet.has(index) || silentSet.has(index) || annotation ? 800 : 400}`,
    ].join(";");
    return `<span title="${annotation?.title || annotation?.label || ""}" style="${styles}">${base}</span>`;
  }).join("");
  return `
    <div style="margin:0 0 8px 0;">
      <div style="color:#667085;font-size:11px;margin-bottom:4px;">${label}</div>
      <div style="font-family:Consolas,monospace;font-size:12px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere;">${sequenceHtml}</div>
    </div>
  `;
}

function buildInternalDonorHtml(donor) {
  const blockingSummary = (donor.silentMutations || []).map((mutation) => `${mutation.lb}: ${mutation.oc} -> ${mutation.nc} | ${mutation.pur}`).join("<br/>");
  const strands = buildInternalStrandModels(donor);
  return `
    <h3 style="color:#2E75B6;margin:18px 0 8px 0;">${donor.n} (${donor.sl})</h3>
    <p style="font-size:12px;color:#555;margin:0 0 10px 0;">Linked guide: ${donor.guideName}</p>
    ${blockingSummary ? `<p style="font-size:12px;color:#7F1D1D;margin:0 0 10px 0;"><strong>Guide-blocking mutation:</strong><br/>${blockingSummary}</p>` : ""}
    ${strands.map((strand) => `
      <div style="margin:0 0 12px 0;padding:12px;border:1px solid ${strand.recommended ? "#10B98155" : "#d7dee7"};border-radius:12px;background:${strand.recommended ? "#ECFDF5" : "#f8fafc"};">
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px;">
          <span style="font-weight:700;color:#1f2937;">${strand.title}</span>
          <span style="display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:700;color:${strand.recommended ? "#047857" : "#475467"};background:${strand.recommended ? "#D1FAE5" : "#EAECF0"};">${strand.recommended ? "Order this strand" : "Reference strand"}</span>
        </div>
        <p style="font-size:12px;color:#555;margin:0 0 10px 0;">${strand.note}</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
          <span style="display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:700;color:#1f2937;background:${PM_GUIDE_COLORS.site};">gRNA site</span>
          <span style="display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:700;color:#92400E;background:${PM_GUIDE_COLORS.pam};">PAM</span>
          ${strand.silentIndexes?.length ? `<span style="display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:700;color:#7F1D1D;background:${PM_EDIT_COLORS.silent};">Silent mutation</span>` : ""}
          ${[...new Map((strand.annotations || []).map((item) => [`${item.badgeLabel || item.label}|${item.color}`, item])).values()].map((item) => `<span style="display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:700;color:${item.color};background:${item.color}14;border:1px solid ${item.color}33;">${item.badgeLabel || item.label}</span>`).join("")}
        </div>
        ${buildInternalSequenceHtml("WT context", strand.wt, strand.wtGuideSiteIndexes, strand.wtGuidePamIndexes, [], [], "wt")}
        ${buildInternalSequenceHtml("Donor ssODN", strand.donor, strand.guideSiteIndexes, strand.guidePamIndexes, strand.silentIndexes, strand.annotations, "donor")}
      </div>
    `).join("")}
  `;
}

function buildAnnotatedDonorHtml(sequence, annotations = []) {
  const findAnnotation = (index) => annotations.filter((item) => index >= item.start && index < item.end).sort((left, right) => (right.priority || 0) - (left.priority || 0))[0];
  const legendItems = [...new Map(annotations.map((item) => [`${item.badgeLabel || item.label}|${item.color}`, item])).values()];
  const legend = legendItems.map((item) => `<span title="${item.title || item.label}" style="display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:700;color:${item.color};background:${item.color}14;border:1px solid ${item.color}33;">${item.badgeLabel || item.label}</span>`).join("");
  const sequenceHtml = (sequence || "").split("").map((base, index) => {
    const annotation = findAnnotation(index);
    return `<span title="${annotation?.title || annotation?.label || ""}" style="color:${annotation?.color || "#111827"};font-weight:${annotation ? 800 : 400};background:${annotation?.priority > 1 ? `${annotation.color}22` : "transparent"};">${base}</span>`;
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

function buildReportHtml(meta, result, fileName, historicalContext, reviewItems, brunelloLibrary = null) {
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
  const hasHistoricalMatches = Boolean(historicalContext?.topMatches?.length);
  const brunelloReferenceGuideSet = getBrunelloReferenceGuideSet(result, brunelloLibrary);
  const reviewSectionNumber = 5 + (hasHistoricalMatches ? 1 : 0);
  const additionalInfoSectionNumber = reviewSectionNumber + 1;
  const readinessBlock = buildDesignReadinessHtml(result);
  const locusMapBlock = buildLocusMapHtml(result);
  const donorBlock = result.type === "pm"
    ? ((result.os || []).length
      ? (result.os || []).map((donor) => buildPmDonorHtml(donor)).join("")
      : `<p style="font-size:13px;line-height:1.45;color:#B42318;">No ssODN donor could be rendered for this SNP design. This usually means the asymmetric donor window ran outside the uploaded sequence bounds.</p>`)
      : result.type === "ko"
      ? `<p style="font-size:13px;line-height:1.45;">${result.referenceOnly ? "No donor is required for knockout design. This report is in gene-list KO mode, so the paired gRNAs below are reference guides and exact spacing/primer geometry still need a GenBank-backed follow-up." : "No donor is required for knockout design. Use the paired gRNAs below for deletion/NHEJ-based disruption."}</p>`
      : result.type === "it"
        ? `${buildKnockinQcSummaryHtml(result)}${buildInternalProteinHtml(result)}${buildInsertValidationHtml(result.insertValidation)}${(result.os || []).map((donor) => buildInternalDonorHtml(donor)).join("") || `<p style="font-size:13px;line-height:1.45;color:#B42318;">No internal ssODN donor could be rendered for this in-frame tag design.</p>`}`
      : `${buildKnockinQcSummaryHtml(result)}${buildKnockinProteinHtml(result.proteinPreview)}${buildInsertValidationHtml(result.insertValidation)}${buildAnnotatedDonorHtml(result.donor || "", result.donorAnnotations || [])}`;
  const resolvedSectionTitle = result.type === "it" ? "Internal ssODN Donor Templates" : sectionTitle;
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
  ${readinessBlock}
  ${locusMapBlock}
  <h2>4. ${resolvedSectionTitle}</h2>
  <p class="note">${result.type === "pm" ? "WT and donor templates are listed together for review." : result.type === "ko" ? "Knockout designs use paired gRNAs and do not require an HDR donor." : result.type === "it" ? "Guide-linked internal ssODN donors are listed with protein-frame review." : "HDR donor sequence is listed in full below."}</p>
  ${donorBlock}
  ${result.type === "ko" && brunelloReferenceGuideSet ? `<h3>Brunello CRISPRko Reference Guides</h3><p>${brunelloReferenceGuideSet.source}. ${brunelloReferenceGuideSet.summary}${brunelloReferenceGuideSet.requestedGene !== brunelloReferenceGuideSet.libraryGene ? ` Library symbol: ${brunelloReferenceGuideSet.libraryGene}.` : ""}</p><table>${tableHtml([["Spacer", "PAM", "Exon", "Rule Set 2", "Transcript", "Strand"]], true)}${tableHtml(brunelloReferenceGuideSet.guides.map((guide) => [guide.spacer, guide.pam, `Exon ${guide.exon}`, String(guide.ruleSet2), guide.transcript, guide.strand]))}</table>` : ""}
  ${ssOdnNotes.length ? `<div>${ssOdnNotes.map((line) => `<p style="color:#CC0000;font-weight:700;margin:6px 0;">${line}</p>`).join("")}</div>` : ""}
  ${hasHistoricalMatches ? `<h2>5. Matched Historical Records</h2>${buildHistoricalRowsHtml(historicalContext.topMatches)}` : ""}
  <h2>${reviewSectionNumber}. Review Checkpoints</h2>
  ${buildReviewListHtml(reviewItems)}
  <h2>${additionalInfoSectionNumber}. Additional Info</h2>
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

function PmAnnotatedSequenceRow({ label, sequence, diffIndexes, mode, regions, guide, desiredIndexes = [], silentIndexes = [] }) {
  const diffSet = new Set(diffIndexes);
  const desiredSet = new Set(desiredIndexes);
  const silentSet = new Set(silentIndexes);
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ color: "#667085", fontSize: 11, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "Consolas, monospace", fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
        {(sequence || "").split("").map((base, index) => {
          const changed = diffSet.has(index);
          const isDesired = desiredSet.has(index);
          const isSilent = silentSet.has(index);
          const region = findPmRegion(index, regions);
          const inGuide = guide && index >= guide.siteStart && index < guide.siteEnd;
          const inPam = guide && index >= guide.pamStart && index < guide.pamEnd;
          return (
            <span
              key={`${label}-${index}`}
              style={{
                background: inPam ? PM_GUIDE_COLORS.pam : isSilent && mode === "donor" ? PM_EDIT_COLORS.silent : isDesired && mode === "donor" ? PM_EDIT_COLORS.desired : changed && mode === "donor" ? PM_EDIT_COLORS.desired : inGuide ? PM_GUIDE_COLORS.site : (region?.color || "transparent"),
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

function InternalSequenceRow({ label, sequence, guideSiteIndexes = [], guidePamIndexes = [], silentIndexes = [], annotations = [], mode = "donor" }) {
  const guideSet = new Set(guideSiteIndexes);
  const pamSet = new Set(guidePamIndexes);
  const silentSet = new Set(silentIndexes);
  const findAnnotation = (index) => annotations.filter((item) => index >= item.start && index < item.end).sort((left, right) => (right.priority || 0) - (left.priority || 0))[0];
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ color: "#667085", fontSize: 11, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "Consolas, monospace", fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
        {(sequence || "").split("").map((base, index) => {
          const annotation = mode === "donor" ? findAnnotation(index) : null;
          return (
            <span
              key={`${label}-${index}`}
              title={annotation?.title || annotation?.label || ""}
              style={{
                background: pamSet.has(index) ? PM_GUIDE_COLORS.pam : silentSet.has(index) && mode === "donor" ? PM_EDIT_COLORS.silent : guideSet.has(index) ? PM_GUIDE_COLORS.site : annotation?.priority > 1 ? `${annotation.color}22` : "transparent",
                color: annotation?.color && mode === "donor" && !guideSet.has(index) && !pamSet.has(index) && !silentSet.has(index) ? annotation.color : "#111827",
                fontWeight: guideSet.has(index) || pamSet.has(index) || silentSet.has(index) || annotation ? 800 : 400,
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
      {!!(donor.silentMutations || []).length && (
        <div style={{ color: "#7F1D1D", fontSize: 12, marginBottom: 10 }}>
          <strong>Silent mutation:</strong> {(donor.silentMutations || []).map((mutation) => `${mutation.lb}: ${mutation.oc} -> ${mutation.nc} | ${mutation.pur}`).join(" ; ")}
        </div>
      )}
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
            <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, color: "#92400E", background: PM_EDIT_COLORS.desired }}>Desired edit</span>
            {!!strand.silentIndexes?.length && <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, color: "#7F1D1D", background: PM_EDIT_COLORS.silent }}>Silent mutation</span>}
          </div>
          <PmAnnotatedSequenceRow label="WT" sequence={strand.wt} diffIndexes={strand.diffIndexes} mode="wt" regions={strand.regions} guide={strand.guide} desiredIndexes={strand.desiredIndexes} silentIndexes={strand.silentIndexes} />
          <PmAnnotatedSequenceRow label="Donor" sequence={strand.donor} diffIndexes={strand.diffIndexes} mode="donor" regions={strand.regions} guide={strand.guide} desiredIndexes={strand.desiredIndexes} silentIndexes={strand.silentIndexes} />
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

function InternalProteinPreviewCard({ result }) {
  const preview = result?.codingPreview;
  if (!preview) return null;
  return (
    <div style={{ marginBottom: 14, padding: 12, border: "1px solid #d7dee7", borderRadius: 12, background: "#f8fafc" }}>
      <div style={{ color: "#667085", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>Coding frame view</div>
      <div style={{ color: "#555", fontSize: 12, marginBottom: 8 }}>Insert {result.tag} after {result.wA}{result.an}, before {result.nextAA}{result.an + 1}.</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, color: "#92400E", background: "#FDE68A" }}>Inserted tag codons / amino acids</span>
      </div>
      <AlignedTokenRow label="WT codons" tokens={preview.wtCodons} />
      <AlignedTokenRow label="Donor codons" tokens={preview.donorCodons} diffIndexes={Array.from({ length: preview.insertCodonLength }, (_, index) => preview.insertCodonStart + index)} mode="donor" />
      <AlignedTokenRow label="WT amino acids" tokens={preview.wtAas} />
      <AlignedTokenRow label="Donor amino acids" tokens={preview.donorAas} diffIndexes={Array.from({ length: preview.insertAaLength }, (_, index) => preview.insertAaStart + index)} mode="donor" />
    </div>
  );
}

function InsertValidationCard({ validation }) {
  if (!validation) return null;
  const expectedAa = (validation.expectedAas || []).join("");
  const actualAa = (validation.actualAas || []).join("");
  const badges = [
    {
      label: validation.matchesPreset ? "Preset matches donor" : "Preset mismatch",
      color: validation.matchesPreset ? COLORS.success : "#B42318",
      background: validation.matchesPreset ? "#D1FAE5" : "#FEE4E2",
    },
    {
      label: validation.framePreserved ? "Reading frame preserved" : "Frame flagged",
      color: validation.framePreserved ? COLORS.success : "#B42318",
      background: validation.framePreserved ? "#D1FAE5" : "#FEE4E2",
    },
  ];
  if (validation.unexpectedStop || validation.terminalStopPresent) {
    badges.push({
      label: validation.unexpectedStop ? "Unexpected stop detected" : "Terminal stop retained",
      color: validation.unexpectedStop ? "#B42318" : "#92400E",
      background: validation.unexpectedStop ? "#FEE4E2" : "#FEF3C7",
    });
  }
  return (
    <div style={{ marginBottom: 14, padding: 12, border: "1px solid #d7dee7", borderRadius: 12, background: "#f8fafc" }}>
      <div style={{ color: "#667085", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>Insert identity check</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        {badges.map((badge) => (
          <span key={badge.label} style={{ display: "inline-flex", alignItems: "center", padding: "4px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, color: badge.color, background: badge.background }}>
            {badge.label}
          </span>
        ))}
      </div>
      <div style={{ fontSize: 12, color: "#555", marginBottom: 8 }}>Expected insert: {validation.expectedLengthBp} bp | Designed donor insert: {validation.actualLengthBp} bp</div>
      <div style={{ color: "#667085", fontSize: 11, marginBottom: 4 }}>Expected insert DNA</div>
      <div style={{ fontFamily: "Consolas, monospace", fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap", overflowWrap: "anywhere", marginBottom: 8 }}>{validation.expectedSequence || "n/a"}</div>
      <div style={{ color: "#667085", fontSize: 11, marginBottom: 4 }}>Designed donor insert DNA</div>
      <div style={{ fontFamily: "Consolas, monospace", fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap", overflowWrap: "anywhere", marginBottom: 8 }}>{validation.actualSequence || "n/a"}</div>
      <div style={{ color: "#667085", fontSize: 11, marginBottom: 4 }}>Expected insert amino acids</div>
      <div style={{ fontFamily: "Consolas, monospace", fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap", overflowWrap: "anywhere", marginBottom: 8 }}>{expectedAa || "n/a"}</div>
      <div style={{ color: "#667085", fontSize: 11, marginBottom: 4 }}>Designed donor insert amino acids</div>
      <div style={{ fontFamily: "Consolas, monospace", fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{actualAa || "n/a"}</div>
      {(validation.canonicalChecks || []).map((check) => (
        <div key={check.label} style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #E5E7EB" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>{check.label}</span>
            <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, color: check.matches ? "#047857" : "#B42318", background: check.matches ? "#D1FAE5" : "#FEE4E2" }}>
              {check.matches ? "Protein matches reference" : "Protein mismatch"}
            </span>
          </div>
          {check.sourceUrl ? <div style={{ color: "#667085", fontSize: 11, marginBottom: 6 }}>Source: <a href={check.sourceUrl} target="_blank" rel="noreferrer" style={{ color: "#2E75B6", textDecoration: "none" }}>{check.sourceUrl}</a></div> : null}
          <div style={{ color: "#667085", fontSize: 11, marginBottom: 4 }}>Reference amino acids</div>
          <div style={{ fontFamily: "Consolas, monospace", fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap", overflowWrap: "anywhere", marginBottom: 8 }}>{check.expectedAas || "n/a"}</div>
          <div style={{ color: "#667085", fontSize: 11, marginBottom: 4 }}>Designed amino acids</div>
          <div style={{ fontFamily: "Consolas, monospace", fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{check.actualAas || "n/a"}</div>
        </div>
      ))}
    </div>
  );
}

function KnockinQcSummaryCard({ result }) {
  const checks = buildKnockinQcChecks(result);
  if (!checks.length) return null;
  const styleFor = (status) => status === "pass"
    ? { color: COLORS.success, background: "#D1FAE5", label: "Pass" }
    : status === "warn"
      ? { color: "#B42318", background: "#FEE4E2", label: "Review" }
      : { color: "#475467", background: "#EAECF0", label: "N/A" };
  return (
    <div style={{ marginBottom: 14, padding: 12, border: "1px solid #d7dee7", borderRadius: 12, background: "#f8fafc" }}>
      <div style={{ color: "#667085", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>Knock-in QC summary</div>
      {checks.map((check, index) => {
        const badge = styleFor(check.status);
        return (
          <div key={`${check.label}-${index}`} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", padding: "8px 0", borderTop: "1px solid #E5E7EB" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>{check.label}</div>
              <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{check.detail}</div>
            </div>
            <span style={{ display: "inline-flex", alignItems: "center", whiteSpace: "nowrap", padding: "4px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, color: badge.color, background: badge.background }}>
              {badge.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function DesignReadinessCard({ result }) {
  const checks = buildDesignReadinessChecks(result);
  if (!checks.length) return null;
  const styleFor = (status) => status === "pass"
    ? { color: COLORS.success, background: "#D1FAE5", label: "Pass" }
    : status === "warn"
      ? { color: "#B42318", background: "#FEE4E2", label: "Review" }
      : { color: "#475467", background: "#EAECF0", label: "N/A" };
  return (
    <div style={{ marginBottom: 14, padding: 12, border: "1px solid #d7dee7", borderRadius: 12, background: "#f8fafc" }}>
      <div style={{ color: "#667085", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>Design readiness</div>
      {checks.map((check, index) => {
        const badge = styleFor(check.status);
        return (
          <div key={`${check.label}-${index}`} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", padding: "8px 0", borderTop: "1px solid #E5E7EB" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>{check.label}</div>
              <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{check.detail}</div>
            </div>
            <span style={{ display: "inline-flex", alignItems: "center", whiteSpace: "nowrap", padding: "4px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, color: badge.color, background: badge.background }}>
              {badge.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function LocusMapCard({ result }) {
  const window = normalizeLocusWindow(result);
  if (!window) return null;
  const structure = buildLocusStructureItems(result, window);
  const items = buildLocusMapItems(result, window);
  if (!items.length) return null;
  return (
    <div style={{ marginBottom: 14, padding: 12, border: "1px solid #d7dee7", borderRadius: 12, background: "#f8fafc" }}>
      <div style={{ color: "#667085", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>Target region map</div>
      <div style={{ fontSize: 12, color: "#555", marginBottom: 10 }}>Showing {window.start + 1}-{window.end} on the uploaded reference sequence.</div>
      <div style={{ fontSize: 11, color: "#667085", fontWeight: 700, marginBottom: 6 }}>Exon / intron structure</div>
      <div style={{ position: "relative", height: 18, borderRadius: 999, background: "#E5E7EB", overflow: "hidden", marginBottom: 10 }}>
        {structure.introns.map((item, index) => (
          <div
            key={`intron-${item.label}-${index}`}
            title={item.label}
            style={{
              position: "absolute",
              left: `${item.left}%`,
              width: `${item.width}%`,
              top: 7,
              height: 4,
              background: item.color,
              opacity: 0.9,
            }}
          />
        ))}
        {structure.exons.map((item, index) => (
          <div
            key={`exon-${item.label}-${index}`}
            title={item.label}
            style={{
              position: "absolute",
              left: `${item.left}%`,
              width: `${item.width}%`,
              top: 0,
              bottom: 0,
              background: item.color,
              borderRadius: 999,
              opacity: 0.85,
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {structure.exons.map((item, index) => (
          <span key={`exon-badge-${item.label}-${index}`} style={{ display: "inline-flex", alignItems: "center", padding: "4px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, color: item.color, background: `${item.color}14`, border: `1px solid ${item.color}33` }}>
            {item.label}
          </span>
        ))}
        {structure.introns.map((item, index) => (
          <span key={`intron-badge-${item.label}-${index}`} style={{ display: "inline-flex", alignItems: "center", padding: "4px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, color: item.color, background: `${item.color}14`, border: `1px solid ${item.color}33` }}>
            {item.label}
          </span>
        ))}
      </div>
      <div style={{ fontSize: 11, color: "#667085", fontWeight: 700, marginBottom: 6 }}>Guides, edits, donors, and primers</div>
      <div style={{ position: "relative", height: 14, borderRadius: 999, background: "#E5E7EB", overflow: "hidden", marginBottom: 14 }}>
        {items.map((item, index) => (
          <div
            key={`${item.label}-${index}`}
            title={`${item.label}${item.detail ? `: ${item.detail}` : ""}`}
            style={{
              position: "absolute",
              left: `${item.left}%`,
              width: `${item.width}%`,
              top: 0,
              bottom: 0,
              background: item.color,
              opacity: item.kind === "cut" ? 0.95 : 0.7,
            }}
          />
        ))}
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {items.map((item, index) => (
          <div key={`${item.label}-legend-${index}`} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: "#344054" }}>
            <span style={{ display: "inline-flex", width: 10, height: 10, borderRadius: 999, background: item.color, marginTop: 3, flex: "0 0 auto" }} />
            <span><strong>{item.label}</strong>{item.detail ? `: ${item.detail}` : ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InternalDonorPreview({ donor }) {
  const strands = buildInternalStrandModels(donor);
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontWeight: 700, color: "#2E75B6", marginBottom: 6 }}>{donor.n} ({donor.sl})</div>
      <div style={{ color: "#555", fontSize: 12, marginBottom: 10 }}>Linked guide: {donor.guideName}</div>
      {!!(donor.silentMutations || []).length && (
        <div style={{ color: "#7F1D1D", fontSize: 12, marginBottom: 10 }}>
          <strong>Guide-blocking mutation:</strong> {(donor.silentMutations || []).map((mutation) => `${mutation.lb}: ${mutation.oc} -> ${mutation.nc} | ${mutation.pur}`).join(" ; ")}
        </div>
      )}
      {strands.map((strand) => (
        <div key={strand.key} style={{ marginBottom: 12, padding: 12, border: `1px solid ${strand.recommended ? "#10B98155" : "#d7dee7"}`, borderRadius: 12, background: strand.recommended ? "#ECFDF5" : "#f8fafc" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontWeight: 700, color: "#1f2937" }}>{strand.title}</div>
            <Badge color={strand.recommended ? COLORS.success : COLORS.muted}>{strand.recommended ? "Order This Strand" : "Reference Strand"}</Badge>
          </div>
          <div style={{ color: "#555", fontSize: 12, marginBottom: 8 }}>{strand.note}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, color: "#1f2937", background: PM_GUIDE_COLORS.site }}>gRNA site</span>
            <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, color: "#92400E", background: PM_GUIDE_COLORS.pam }}>PAM</span>
            {!!strand.silentIndexes?.length && <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, color: "#7F1D1D", background: PM_EDIT_COLORS.silent }}>Silent mutation</span>}
            {[...new Map((strand.annotations || []).map((item) => [`${item.badgeLabel || item.label}|${item.color}`, item])).values()].map((item) => <Badge key={`${item.badgeLabel || item.label}-${item.color}`} color={item.color}>{item.badgeLabel || item.label}</Badge>)}
          </div>
          <InternalSequenceRow label="WT context" sequence={strand.wt} guideSiteIndexes={strand.wtGuideSiteIndexes} guidePamIndexes={strand.wtGuidePamIndexes} mode="wt" />
          <InternalSequenceRow label="Donor ssODN" sequence={strand.donor} guideSiteIndexes={strand.guideSiteIndexes} guidePamIndexes={strand.guidePamIndexes} silentIndexes={strand.silentIndexes} annotations={strand.annotations} mode="donor" />
        </div>
      ))}
    </div>
  );
}

function KnockinProteinPreviewCard({ preview }) {
  if (!preview) return null;
  if (preview.wtCodons && preview.donorCodons && preview.wtAas && preview.donorAas) {
    return (
      <div style={{ marginBottom: 14, padding: 12, border: "1px solid #d7dee7", borderRadius: 12, background: "#f8fafc" }}>
        <div style={{ color: "#667085", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>Coding frame view</div>
        <div style={{ color: "#555", fontSize: 12, marginBottom: 8 }}>{preview.note}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, color: "#92400E", background: "#FDE68A" }}>Inserted tag / reporter codons and amino acids</span>
        </div>
        <AlignedTokenRow label="WT codons" tokens={preview.wtCodons} />
        <AlignedTokenRow label="Donor codons" tokens={preview.donorCodons} diffIndexes={Array.from({ length: preview.insertCodonLength }, (_, index) => preview.insertCodonStart + index)} mode="donor" />
        <AlignedTokenRow label="WT amino acids" tokens={preview.wtAas} />
        <AlignedTokenRow label="Donor amino acids" tokens={preview.donorAas} diffIndexes={Array.from({ length: preview.insertAaLength }, (_, index) => preview.insertAaStart + index)} mode="donor" />
      </div>
    );
  }
  const insertEnd = preview.insertStart + preview.insertLength;
  return (
    <div style={{ marginBottom: 14, padding: 12, border: "1px solid #d7dee7", borderRadius: 12, background: "#f8fafc" }}>
      <div style={{ color: "#667085", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>Protein translation view</div>
      <div style={{ color: "#555", fontSize: 12, marginBottom: 8 }}>{preview.note}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, color: "#92400E", background: "#FDE68A" }}>Inserted tag / reporter</span>
      </div>
      <AlignedTokenRow label={preview.wtLabel} tokens={preview.wtTokens} />
      <div style={{ marginBottom: 8 }}>
        <div style={{ color: "#667085", fontSize: 11, marginBottom: 4 }}>{preview.donorLabel}</div>
        <div style={{ fontFamily: "Consolas, monospace", fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {preview.donorTokens.map((token, index) => (
            <span
              key={`${preview.donorLabel}-${token}-${index}`}
              style={{
                display: "inline-block",
                minWidth: token === "Stop" ? "5ch" : "2ch",
                marginRight: 6,
                textAlign: "center",
                color: "#111827",
                background: index >= preview.insertStart && index < insertEnd ? "#FDE68A" : "transparent",
                fontWeight: index >= preview.insertStart && index < insertEnd ? 800 : 400,
                borderRadius: index >= preview.insertStart && index < insertEnd ? 3 : 0,
                padding: index >= preview.insertStart && index < insertEnd ? "0 2px" : 0,
              }}
            >
              {token}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function AnnotatedDonor({ sequence, annotations = [] }) {
  const findAnnotation = (index) => annotations.filter((item) => index >= item.start && index < item.end).sort((left, right) => (right.priority || 0) - (left.priority || 0))[0];
  const safeSequence = sequence || "";
  const legendItems = [...new Map(annotations.map((item) => [`${item.badgeLabel || item.label}|${item.color}`, item])).values()];
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        {legendItems.map((item) => <span key={`${item.badgeLabel || item.label}-${item.color}`} title={item.title || item.label}><Badge color={item.color}>{item.badgeLabel || item.label}</Badge></span>)}
      </div>
      <div style={{ fontFamily: "Consolas, monospace", fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
        {safeSequence.split("").map((base, index) => {
          const annotation = findAnnotation(index);
          return <span key={`donor-${index}`} title={annotation?.title || annotation?.label || ""} style={{ color: annotation?.color || "#111827", fontWeight: annotation ? 700 : 400, background: annotation?.priority > 1 ? `${annotation.color}22` : "transparent" }}>{base}</span>;
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
  const [workspaceStatus, setWorkspaceStatus] = useState("");
  const [workspaceHandle, setWorkspaceHandle] = useState(null);
  const [workspaceFolders, setWorkspaceFolders] = useState([]);
  const [selectedWorkspaceFolders, setSelectedWorkspaceFolders] = useState([]);
  const [showWorkspaceTools, setShowWorkspaceTools] = useState(false);
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
  const [batchKoReferenceMap, setBatchKoReferenceMap] = useState({});
  const [casDbOrganismId, setCasDbOrganismId] = useState("1");
  const [casDbLookup, setCasDbLookup] = useState({ status: "idle", gene: "", data: null, error: "" });
  const [brunelloLookup, setBrunelloLookup] = useState({ status: "idle", gene: "", data: null, error: "" });
  const [fpbaseLookup, setFpbaseLookup] = useState({ status: "idle", search: "", data: null, error: "" });
  const [fpbaseSearchInput, setFpbaseSearchInput] = useState("");
  const [fpbaseRowId, setFpbaseRowId] = useState("");

  const ctCassetteOptions = useMemo(() => CT_CASSETTE_OPTIONS.filter((key) => CASSETTES[key]), []);
  const ntCassetteOptions = useMemo(() => NT_CASSETTE_OPTIONS.filter((key) => CASSETTES[key]), []);
  const internalTagOptions = useMemo(() => Object.keys(INTERNAL_TAGS), []);
  const supportsWorkspaceAccess = typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
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
  const hasHistoricalMatches = historicalContext.topMatches.length > 0;
  const brunelloReferenceGuideSet = useMemo(
    () => getBrunelloReferenceGuideSet(selectedEntry?.result, brunelloLookup.data),
    [selectedEntry, brunelloLookup.data],
  );
  const brunelloPairDiagnostics = useMemo(
    () => buildKoReferencePairDiagnostics(selectedEntry?.result, selectedEntry?.row, brunelloReferenceGuideSet?.guides, buildBrunelloGuideOverride, "Brunello"),
    [selectedEntry, brunelloReferenceGuideSet],
  );
  const casDatabasePairDiagnostics = useMemo(
    () => buildKoReferencePairDiagnostics(selectedEntry?.result, selectedEntry?.row, casDbLookup.data?.targets, buildCasDatabaseGuideOverride, "Cas-Database"),
    [selectedEntry, casDbLookup.data],
  );
  const brunelloPairCandidates = brunelloPairDiagnostics.included;
  const casDatabasePairCandidates = casDatabasePairDiagnostics.included;
  const brunelloFilteredPairs = brunelloPairDiagnostics.filtered;
  const casDatabaseFilteredPairs = casDatabasePairDiagnostics.filtered;
  const brunelloLocalCandidates = useMemo(() => brunelloPairCandidates.filter((candidate) => candidate.candidateMode === "nearby" || candidate.candidateMode === "local"), [brunelloPairCandidates]);
  const brunelloCrossExonCandidates = useMemo(() => brunelloPairCandidates.filter((candidate) => candidate.candidateMode === "cross-exon"), [brunelloPairCandidates]);
  const brunelloDeletionCandidates = useMemo(() => brunelloPairCandidates.filter((candidate) => candidate.candidateMode === "deletion-screen"), [brunelloPairCandidates]);
  const casDatabaseLocalCandidates = useMemo(() => casDatabasePairCandidates.filter((candidate) => candidate.candidateMode === "nearby" || candidate.candidateMode === "local"), [casDatabasePairCandidates]);
  const casDatabaseCrossExonCandidates = useMemo(() => casDatabasePairCandidates.filter((candidate) => candidate.candidateMode === "cross-exon"), [casDatabasePairCandidates]);
  const casDatabaseDeletionCandidates = useMemo(() => casDatabasePairCandidates.filter((candidate) => candidate.candidateMode === "deletion-screen"), [casDatabasePairCandidates]);
  const reviewSectionNumber = 5 + (hasHistoricalMatches ? 1 : 0);
  const additionalInfoSectionNumber = reviewSectionNumber + 1;
  const reviewItems = useMemo(
    () => buildReviewItems(selectedRowMeta, selectedEntry?.result, selectedEntry?.row?.fileName),
    [selectedRowMeta, selectedEntry],
  );
  const reportHtml = useMemo(
    () => buildReportHtml(selectedRowMeta, selectedEntry?.result, selectedEntry?.row?.fileName, historicalContext, reviewItems, brunelloLookup.data),
    [selectedRowMeta, selectedEntry, historicalContext, reviewItems, brunelloLookup.data],
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
  const currentHost = typeof window !== "undefined" ? window.location.host : "local";

  const replaceSelectedKoGuide = useCallback((slotIndex, replacementGuide) => {
    if (!selectedEntry?.result || selectedEntry.result.type !== "ko") return;
    setBatchResults((current) => current.map((entry) => {
      if (entry.rowId !== selectedEntry.rowId || entry.status !== "success" || entry.result?.type !== "ko") return entry;
      const nextResult = updateKoResultWithMappedGuides(entry.result, entry.row, slotIndex, replacementGuide);
      if (!nextResult) return entry;
      return {
        ...entry,
        result: nextResult,
      };
    }));
    setCopyState(`Updated ${slotIndex === 0 ? "gRNA1" : "gRNA2"} and recalculated KO spacing and primers.`);
  }, [selectedEntry]);

  const applyBrunelloGuideToSelectedKo = useCallback((slotIndex, guide) => {
    replaceSelectedKoGuide(slotIndex, (previousGuide) => buildBrunelloGuideOverride(guide, slotIndex, previousGuide));
  }, [replaceSelectedKoGuide]);

  const applyCasDatabaseGuideToSelectedKo = useCallback((slotIndex, target) => {
    replaceSelectedKoGuide(slotIndex, (previousGuide) => buildCasDatabaseGuideOverride(target, slotIndex, previousGuide));
  }, [replaceSelectedKoGuide]);

  const applyKoGuidePairToSelected = useCallback((pairCandidate) => {
    if (!selectedEntry?.result || selectedEntry.result.type !== "ko" || !pairCandidate?.guides?.length) return;
    setBatchResults((current) => current.map((entry) => {
      if (entry.rowId !== selectedEntry.rowId || entry.status !== "success" || entry.result?.type !== "ko") return entry;
      const nextResult = finalizeKoResultWithGuides(entry.result, entry.row, pairCandidate.guides);
      if (!nextResult) return entry;
      return {
        ...entry,
        result: nextResult,
      };
    }));
    setCopyState(`Applied ${pairCandidate.source} pair and recalculated KO spacing and primers.`);
  }, [selectedEntry]);

  const applyKoGuidePairToRow = useCallback((rowId, pairCandidate) => {
    if (!pairCandidate?.guides?.length) return;
    setBatchResults((current) => current.map((entry) => {
      if (entry.rowId !== rowId || entry.status !== "success" || entry.result?.type !== "ko") return entry;
      const nextResult = finalizeKoResultWithGuides(entry.result, entry.row, pairCandidate.guides);
      if (!nextResult) return entry;
      return {
        ...entry,
        result: nextResult,
      };
    }));
    setSelectedProjectId(rowId);
    setCopyState(`Applied ${pairCandidate.source} pair and recalculated KO spacing and primers.`);
  }, []);

  const loadFpbaseReporters = useCallback(async (search = "") => {
    setFpbaseLookup({ status: "loading", search, data: null, error: "" });
    try {
      const data = await fetchJsonOrThrow(`/api/fpbase-reporters?search=${encodeURIComponent(search)}&limit=200`, "FPbase");
      setFpbaseLookup({ status: "success", search, data, error: "" });
    } catch (error) {
      setFpbaseLookup({ status: "error", search, data: null, error: error?.message || "FPbase lookup failed." });
    }
  }, []);

  const toggleFpbaseRow = useCallback((rowId) => {
    setFpbaseRowId((current) => current === rowId ? "" : rowId);
  }, []);

  const applyFpbaseReporterToRow = useCallback((rowIndex, cassetteKey) => {
    updateBatchRow(rowIndex, "tag", cassetteKey);
    setCopyState(`Selected ${getCassetteDisplayLabel(cassetteKey, batchRows[rowIndex]?.projectType || "ct")} from the FPbase order-ready reporter library.`);
  }, [batchRows]);

  useEffect(() => {
    if (!fpbaseRowId || fpbaseLookup.status !== "idle") return;
    loadFpbaseReporters("");
  }, [fpbaseRowId, fpbaseLookup.status, loadFpbaseReporters]);

  useEffect(() => {
    if (selectedEntry?.result?.type !== "ko" || !selectedEntry.result.gene) {
      setBrunelloLookup({ status: "idle", gene: selectedEntry?.result?.gene || "", data: null, error: "" });
      return;
    }
    let cancelled = false;
    setBrunelloLookup({ status: "loading", gene: selectedEntry.result.gene, data: null, error: "" });
    fetch(`/api/brunello?gene=${encodeURIComponent(selectedEntry.result.gene)}`)
      .then((response) => {
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.toLowerCase().includes("application/json")) {
          throw new Error("Brunello endpoint returned HTML instead of JSON. Restart the dev server so the local API route is active.");
        }
        return response.json();
      })
      .then((data) => {
        if (!data?.ok) throw new Error(data?.error || data?.note || "Brunello lookup failed.");
        if (!cancelled) setBrunelloLookup({ status: "success", gene: selectedEntry.result.gene, data, error: "" });
      })
      .catch((error) => {
        if (!cancelled) setBrunelloLookup({ status: "error", gene: selectedEntry.result.gene, data: null, error: error?.message || "Brunello lookup failed." });
      });
    return () => {
      cancelled = true;
    };
  }, [selectedEntry?.rowId, selectedEntry?.result]);

  useEffect(() => {
    setCasDbOrganismId(inferCasDatabaseOrganismId(selectedEntry?.result));
    setCasDbLookup({ status: "idle", gene: selectedEntry?.result?.gene || "", data: null, error: "" });
  }, [selectedEntry?.rowId, selectedEntry?.result]);

  useEffect(() => {
    if (selectedEntry?.result?.type !== "ko" || !selectedEntry.result.gene) {
      setCasDbLookup({ status: "idle", gene: selectedEntry?.result?.gene || "", data: null, error: "" });
      return;
    }
    let cancelled = false;
    setCasDbLookup({ status: "loading", gene: selectedEntry.result.gene, data: null, error: "" });
    fetch(`/api/cas-database?gene=${encodeURIComponent(selectedEntry.result.gene)}&organism=${encodeURIComponent(casDbOrganismId)}`)
      .then((response) => {
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.toLowerCase().includes("application/json")) {
          throw new Error("Cas-Database endpoint returned HTML instead of JSON. Restart the dev server so the local API route is active.");
        }
        return response.json().then((payload) => ({ response, payload }));
      })
      .then(({ response, payload }) => {
        if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Cas-Database lookup failed.");
        if (!cancelled) setCasDbLookup({ status: "success", gene: selectedEntry.result.gene, data: payload, error: "" });
      })
      .catch((error) => {
        if (!cancelled) {
          setCasDbLookup({
            status: "error",
            gene: selectedEntry?.result?.gene || "",
            data: null,
            error: error?.message || "Cas-Database lookup failed unexpectedly.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [casDbOrganismId, selectedEntry?.rowId, selectedEntry?.result]);

  useEffect(() => {
    const koEntries = batchSuccessfulResults.filter((entry) => entry.result?.type === "ko" && entry.result?.gene);
    const activeIds = new Set(koEntries.map((entry) => entry.rowId));
    setBatchKoReferenceMap((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([rowId]) => activeIds.has(rowId)));
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
    const entriesToFetch = koEntries.filter((entry) => {
      const cached = batchKoReferenceMap[entry.rowId];
      const organismId = inferCasDatabaseOrganismId(entry.result);
      if (!cached) return true;
      if (cached.status === "loading") return false;
      return cached.gene !== entry.result.gene || cached.organismId !== organismId;
    });
    if (!entriesToFetch.length) return undefined;
    let cancelled = false;
    entriesToFetch.forEach((entry) => {
      const organismId = inferCasDatabaseOrganismId(entry.result);
      setBatchKoReferenceMap((current) => ({
        ...current,
        [entry.rowId]: { status: "loading", gene: entry.result.gene, organismId, brunello: null, casDb: null, error: "" },
      }));
      Promise.allSettled([
        fetch(`/api/brunello?gene=${encodeURIComponent(entry.result.gene)}`).then(async (response) => {
          const contentType = response.headers.get("content-type") || "";
          if (!contentType.toLowerCase().includes("application/json")) throw new Error("Brunello endpoint returned HTML instead of JSON.");
          const payload = await response.json();
          if (!payload?.ok) throw new Error(payload?.error || payload?.note || "Brunello lookup failed.");
          return payload;
        }),
        fetch(`/api/cas-database?gene=${encodeURIComponent(entry.result.gene)}&organism=${encodeURIComponent(organismId)}`).then(async (response) => {
          const contentType = response.headers.get("content-type") || "";
          if (!contentType.toLowerCase().includes("application/json")) throw new Error("Cas-Database endpoint returned HTML instead of JSON.");
          const payload = await response.json();
          if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Cas-Database lookup failed.");
          return payload;
        }),
      ]).then(([brunelloResult, casDbResult]) => {
        if (cancelled) return;
        setBatchKoReferenceMap((current) => ({
          ...current,
          [entry.rowId]: {
            status: "success",
            gene: entry.result.gene,
            organismId,
            brunello: brunelloResult.status === "fulfilled" ? brunelloResult.value : null,
            casDb: casDbResult.status === "fulfilled" ? casDbResult.value : null,
            error: [
              brunelloResult.status === "rejected" ? brunelloResult.reason?.message : "",
              casDbResult.status === "rejected" ? casDbResult.reason?.message : "",
            ].filter(Boolean).join(" | "),
          },
        }));
      });
    });
    return () => {
      cancelled = true;
    };
  }, [batchSuccessfulResults, batchKoReferenceMap]);

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
    let cancelled = false;
    const loadWorkspaceFolders = async () => {
      if (!workspaceHandle) {
        setWorkspaceFolders([]);
        return;
      }
      try {
        const nextFolders = [];
        for await (const entry of workspaceHandle.values()) {
          if (entry.kind !== "directory") continue;
          if (entry.name === "Template" || entry.name === "Orders") continue;
          nextFolders.push({
            name: entry.name,
            irisId: extractIrisIdFromFolderName(entry.name),
            parentId: extractParentIdFromFolderName(entry.name),
          });
        }
        nextFolders.sort((left, right) => left.name.localeCompare(right.name));
        if (!cancelled) {
          setWorkspaceFolders(nextFolders);
          setSelectedWorkspaceFolders((current) => current.filter((name) => nextFolders.some((entry) => entry.name === name)));
        }
      } catch (error) {
        if (!cancelled) {
          setWorkspaceFolders([]);
          setSelectedWorkspaceFolders([]);
          setWorkspaceStatus(error?.message || "Failed to read project folders from the selected root.");
        }
      }
    };
    loadWorkspaceFolders();
    return () => {
      cancelled = true;
    };
  }, [workspaceHandle]);

  useEffect(() => {
    if (!batchFolderEntries.length) return;
    setBatchRows((current) => current.map((row) => {
      if (row.referenceSource === "raw") return row;
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
      if (key === "projectType") {
        if (value === "it") {
          nextRow.tag = INTERNAL_TAGS[row.tag] ? row.tag : "SPOT";
          nextRow.mutation = row.mutation && /^[A-Z]?\d+$/i.test(row.mutation) ? row.mutation : "";
        } else if (value === "ct") {
          nextRow.tag = CASSETTES[row.tag] && !row.tag.startsWith("N:") ? row.tag : "SD40-2xHA";
        } else if (value === "nt") {
          nextRow.tag = CASSETTES[row.tag] ? row.tag : "N:EGFP-Linker";
        }
      }
      if (key === "gene" && nextRow.referenceSource !== "raw" && !nextRow.fileName && batchFolderLibrary.byGene.has(normalizeGeneToken(value))) {
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

  const pickWorkspaceFolder = useCallback(async () => {
    if (!supportsWorkspaceAccess) {
      setWorkspaceStatus("This browser does not support direct project-folder access. Use Chrome or Edge.");
      return;
    }
    try {
      const handle = await window.showDirectoryPicker();
      setWorkspaceHandle(handle);
      setWorkspaceStatus(`Project root linked: ${handle.name}`);
    } catch (error) {
      if (error?.name !== "AbortError") setWorkspaceStatus(error?.message || "Failed to open project root picker.");
    }
  }, [supportsWorkspaceAccess]);

  const importWorkspaceProjects = useCallback(() => {
    if (!workspaceFolders.length) {
      setWorkspaceStatus("No project folders were detected in the linked project root.");
      return;
    }
    const targetFolders = selectedWorkspaceFolders.length
      ? workspaceFolders.filter((entry) => selectedWorkspaceFolders.includes(entry.name))
      : workspaceFolders;
    if (!targetFolders.length) {
      setWorkspaceStatus("Select at least one project folder to import.");
      return;
    }
    const importedRows = parseWorkspaceProjectFolderEntries(targetFolders, batchFolderLibrary);
    setBatchRows(resizeBatchRows(importedRows, Math.max(1, importedRows.length)));
    setBatchResults([]);
    setBatchError("");
    setBatchCopyState("");
    setWorkspaceStatus(`Imported ${importedRows.length} project folder${importedRows.length === 1 ? "" : "s"} into design rows.`);
  }, [batchFolderLibrary, selectedWorkspaceFolders, workspaceFolders]);

  const saveEntryToWorkspace = useCallback(async (entry) => {
    if (!workspaceHandle) throw new Error("Choose the project root first.");
    if (!entry?.result) throw new Error("Generate a design first.");
    const folderNameForEntry = buildWorkspaceProjectFolderName(entry.row, entry.result);
    const destinationHandle = await workspaceHandle.getDirectoryHandle(folderNameForEntry, { create: true });
    const projectPlanHandle = await destinationHandle.getDirectoryHandle("Project plan", { create: true });
    const summaryHandle = await destinationHandle.getDirectoryHandle("Summary", { create: true });
    const dataHandle = await destinationHandle.getDirectoryHandle("Data", { create: true });

    const entryMeta = buildRowMeta(entry.row, entry.result);
    const entryHistorical = buildHistoricalContext(entryMeta, entry.result, entry.row?.projectType);
    const entryReview = buildReviewItems(entryMeta, entry.result, entry.row?.fileName);
    const entryHtml = buildReportHtml(entryMeta, entry.result, entry.row?.fileName, entryHistorical, entryReview, brunelloLookup.data);
    const entrySummary = buildDesignSummary(entry.result);
    const entryOrderRows = buildBatchOrderRows([{ slot: entry.slot, row: entry.row, status: "success", result: entry.result }]);
    const entryTemplateRows = buildIdtTemplateRows(entryOrderRows, idtDefaults);
    const filePrefix = `${buildSafeToken(folderNameForEntry, "project")}_`;

    await writeTextToDirectory(projectPlanHandle, `${filePrefix}design_report.html`, entryHtml);
    await writeTextToDirectory(projectPlanHandle, `${filePrefix}design_summary.txt`, entrySummary);
    await writeTextToDirectory(summaryHandle, `${filePrefix}order_preview.csv`, buildBatchOrderDelimited(entryOrderRows));
    if (entry.row?.gbRaw) {
      await writeTextToDirectory(dataHandle, entry.row.fileName || `${filePrefix}reference.gb`, entry.row.gbRaw);
    }
    for (const kind of ["crispr", "oligo", "hdr"]) {
      const workbookFile = await buildIdtWorkbookFile(kind, entryTemplateRows, filePrefix);
      if (workbookFile) await writeBlobToDirectory(summaryHandle, workbookFile.fileName, workbookFile.blob);
    }
    return folderNameForEntry;
  }, [brunelloLookup.data, idtDefaults, workspaceHandle]);

  const saveSelectedToWorkspace = useCallback(async () => {
    try {
      const savedFolder = await saveEntryToWorkspace(selectedEntry);
      setWorkspaceStatus(`Saved selected report and order files into ${savedFolder}.`);
    } catch (error) {
      setWorkspaceStatus(error?.message || "Failed to save the selected project files.");
    }
  }, [saveEntryToWorkspace, selectedEntry]);

  const saveAllToWorkspace = useCallback(async () => {
    if (!batchSuccessfulResults.length) {
      setWorkspaceStatus("Generate at least one design first.");
      return;
    }
    try {
      for (const entry of batchSuccessfulResults) await saveEntryToWorkspace(entry);
      setWorkspaceStatus(`Saved ${batchSuccessfulResults.length} project package${batchSuccessfulResults.length === 1 ? "" : "s"} into the linked project folders.`);
    } catch (error) {
      setWorkspaceStatus(error?.message || "Failed to save one or more project packages.");
    }
  }, [batchSuccessfulResults, saveEntryToWorkspace]);

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

  const runBatch = async () => {
    setBatchError("");
    setBatchResults([]);
    setBatchCopyState("");
    const activeRows = batchRows.filter((row) => hasSequenceBackedReference(row) || (row.projectType === "ko" && row.gene && !parseCustomGuideInput(row.customGuides).length));
    if (!activeRows.length) {
      setBatchError("Add at least one usable reference sequence, or provide at least one knockout row with a gene name for gene-list KO mode.");
      return;
    }
    const nextResults = await Promise.all(batchRows.map(async (row, index) => {
      const slot = index + 1;
      if (!hasSequenceBackedReference(row) && !(row.projectType === "ko" && row.gene && !parseCustomGuideInput(row.customGuides).length)) return { slot, rowId: row.id, row, status: "empty" };
      try {
        if (row.projectType === "ko" && !hasSequenceBackedReference(row)) {
          if (parseCustomGuideInput(row.customGuides).length) {
            return {
              slot,
              rowId: row.id,
              row,
              status: "error",
              error: "Upload a GenBank file to use pasted custom knockout guides.",
              debug: "",
            };
          }
          const organismId = "1";
          const [brunello, casDb] = await Promise.allSettled([
            fetchJsonOrThrow(`/api/brunello?gene=${encodeURIComponent(row.gene)}`, "Brunello"),
            fetchJsonOrThrow(`/api/cas-database?gene=${encodeURIComponent(row.gene)}&organism=${encodeURIComponent(organismId)}`, "Cas-Database"),
          ]);
          const brunelloGuides = brunello.status === "fulfilled"
            ? brunello.value.guides.slice(0, 3)
            : [];
          const casDbGuides = casDb.status === "fulfilled"
            ? casDb.value.targets.slice(0, 3)
            : [];
          const referenceOnlySeedResult = { type: "ko", gene: normalizeGeneToken(row.gene), gs: [], ps: [], amp: "n/a", exon: "Reference-only KO shortlist", referenceOnly: true };
          const brunelloCandidates = brunelloGuides.length >= 2
            ? buildKoReferencePairCandidates(referenceOnlySeedResult, row, brunelloGuides, buildBrunelloGuideOverride, "Brunello")
            : [];
          const casDbCandidates = casDbGuides.length >= 2
            ? buildKoReferencePairCandidates(referenceOnlySeedResult, row, casDbGuides, buildCasDatabaseGuideOverride, "Cas-Database")
            : [];
          const primaryCandidate = brunelloCandidates[0] || casDbCandidates[0] || null;
          if (!primaryCandidate) {
            const errorParts = [
              brunello.status === "rejected" ? brunello.reason?.message : "",
              casDb.status === "rejected" ? casDb.reason?.message : "",
            ].filter(Boolean);
            return {
              slot,
              rowId: row.id,
              row,
              status: "error",
              error: errorParts[0] || `No Brunello or Cas-Database guide pair was available for ${row.gene}.`,
              debug: "",
            };
          }
          const referenceOnlyDesign = buildReferenceOnlyKoDesignFromGuides(
            row,
            primaryCandidate.source,
            primaryCandidate.guides,
            {
              referenceSources: {
                brunello: brunello.status === "fulfilled" ? brunello.value : null,
                casDb: casDb.status === "fulfilled" ? casDb.value : null,
              },
            },
          );
          if (referenceOnlyDesign.err) return { slot, rowId: row.id, row, status: "error", error: referenceOnlyDesign.err, debug: "" };
          return { slot, rowId: row.id, row, status: "success", result: referenceOnlyDesign, debug: "" };
        }
        const design = runDesign(row.projectType, row.gbRaw, row.mutation, row.tag, row.homologyArm, {
          customGuides: parseCustomGuideInput(row.customGuides),
          rawReference: row.referenceSource === "raw" ? {
            gene: row.gene,
            sequence: parseRawSequenceInput(row.rawSequence),
            cdsStart: row.cdsStart,
            cdsEnd: row.cdsEnd,
            exons: parseExonCoordinateInput(row.exonCoordinates),
          } : null,
        });
        if (design.err) return { slot, rowId: row.id, row, status: "error", error: design.err, debug: design.dbg || "" };
        return { slot, rowId: row.id, row, status: "success", result: design, debug: design.dbg || "" };
      } catch (runError) {
        return { slot, rowId: row.id, row, status: "error", error: runError?.message || "Design generation failed unexpectedly.", debug: "" };
      }
    }));
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
        if (!definition.projectType) throw new Error(`Line ${definition.lineNumber}: design type must be pm, ko, it, ct, or nt.`);
        if (definition.projectType === "pm" && !definition.modification) throw new Error(`Line ${definition.lineNumber}: point mutation designs need a mutation such as N32R.`);
        if (definition.projectType === "it" && !definition.modification) throw new Error(`Line ${definition.lineNumber}: internal in-frame tag designs need a site and tag such as "after P155 SPOT".`);
        if ((definition.projectType === "ct" || definition.projectType === "nt") && !definition.modification) throw new Error(`Line ${definition.lineNumber}: insert designs need a cassette name such as SD40-2xHA.`);
        const lookupKey = normalizeFileLookupKey(definition.fileToken);
        const fileEntry = batchFolderLibrary.byName.get(lookupKey) || batchFolderLibrary.byStem.get(lookupKey);
        if (!fileEntry) throw new Error(`Line ${definition.lineNumber}: could not find GenBank file "${definition.fileToken}" in the uploaded folder.`);
        const internalSpec = definition.projectType === "it" ? parseInternalDefinitionSpec(definition.modification) : { site: "", tag: "" };
        if (definition.projectType === "it" && !internalSpec.site) throw new Error(`Line ${definition.lineNumber}: internal in-frame tag designs need a site such as P155.`);
        if (definition.projectType === "it" && !internalSpec.tag) throw new Error(`Line ${definition.lineNumber}: internal in-frame tag designs need a supported tag such as SPOT or alphaBtx.`);
        return {
          ...createBatchRow(index),
          label: definition.label || fileEntry.fileName.replace(/\.[^.]+$/, ""),
          projectType: definition.projectType,
          mutation: definition.projectType === "pm" ? definition.modification : definition.projectType === "it" ? internalSpec.site : "",
          tag: definition.projectType === "ct" || definition.projectType === "nt" ? definition.modification : definition.projectType === "it" ? internalSpec.tag : "SD40-2xHA",
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

  const loadSampleRequests = () => {
    setRequestText(SAMPLE_REQUEST_TEXT);
    setBatchRows(parseRequestText(SAMPLE_REQUEST_TEXT, batchFolderLibrary));
    setBatchResults([]);
    setBatchError("");
    setBatchCopyState("");
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
      const entryHtml = buildReportHtml(entryMeta, entry.result, entry.row?.fileName, entryHistorical, entryReview, brunelloLookup.data);
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

  const downloadIdtTemplate = async (kind) => {
    const fileName = await downloadIdtWorkbook(kind, idtTemplateRows);
    if (!fileName) return;
    setBatchCopyState(`Downloaded ${fileName}.`);
  };

  const downloadSingleIdtTemplate = async (kind) => {
    const filePrefix = `${buildSafeToken(selectedEntry?.result?.gene, "GENE")}_`;
    const fileName = await downloadIdtWorkbook(kind, singleIdtTemplateRows, filePrefix);
    if (!fileName) return;
    setCopyState(`Downloaded ${fileName}.`);
  };
  return (
    <div style={{ minHeight: "100vh", background: `radial-gradient(circle at top, #16314d 0%, ${COLORS.bg} 42%)`, color: COLORS.text, fontFamily: '"Segoe UI", "Helvetica Neue", sans-serif' }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 18px 40px" }}>
        <div style={{ ...CARD_STYLE, marginBottom: 18, background: "linear-gradient(135deg, rgba(45,212,191,0.16), rgba(245,158,11,0.12) 54%, rgba(15,28,46,0.92))", padding: 22 }}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 24, alignItems: "flex-start" }}>
            <div style={{ flex: "1 1 620px", minWidth: 280 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: "linear-gradient(135deg, #2dd4bf, #f59e0b)", color: "#07111c", display: "grid", placeItems: "center", fontWeight: 900 }}>AC</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 27, fontWeight: 800, lineHeight: 1.1 }}>ASSURED CRISPR Designer</div>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 8, padding: "7px 12px", borderRadius: 999, border: "1px solid rgba(45,212,191,0.28)", background: "linear-gradient(135deg, rgba(45,212,191,0.12), rgba(245,158,11,0.08))", boxShadow: "0 10px 24px rgba(7,17,28,0.18)" }}>
                    <span style={{ color: COLORS.accent, fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" }}>Created by</span>
                    <span style={{ width: 1, alignSelf: "stretch", background: "rgba(147,167,189,0.28)" }} />
                    <span style={{ color: "#F8FAFC", fontSize: 15, fontWeight: 700, letterSpacing: 0.2 }}>Narasimha Telugu</span>
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.15, maxWidth: 760, marginBottom: 10 }}>
                Design CRISPR edits, review donor architecture, and export order-ready reports from one browser workflow.
              </div>
              <div style={{ color: COLORS.muted, fontSize: 14, lineHeight: 1.65, maxWidth: 760, marginBottom: 16 }}>
                Built for SNP knock-ins, knockouts, internal in-frame tags, N-terminal tags, and C-terminal tags. The app turns a request plus GenBank reference into a scientist-readable report and vendor-neutral ordering exports.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                {["Batch design in one run", "Annotated donor and protein views", "Spreadsheet-ready exports", "Scientist-friendly review report"].map((item) => (
                  <div key={item} style={{ padding: "8px 12px", borderRadius: 999, border: `1px solid ${COLORS.border}`, background: "rgba(15,28,46,0.75)", color: COLORS.text, fontSize: 12, fontWeight: 700 }}>
                    {item}
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <button type="button" onClick={loadSampleRequests} style={{ ...FIELD_STYLE, width: "auto", cursor: "pointer", fontWeight: 800, background: "linear-gradient(135deg, #2dd4bf, #f59e0b)", color: "#07111c", border: "none" }}>
                  Load sample requests
                </button>
                <button
                  type="button"
                  onClick={() => document.getElementById("design-requests")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  style={{ ...FIELD_STYLE, width: "auto", cursor: "pointer", fontWeight: 700 }}
                >
                  Jump to design requests
                </button>
              </div>
            </div>
            <div style={{ flex: "0 1 320px", minWidth: 260, ...CARD_STYLE, padding: 16, background: "rgba(15,28,46,0.72)" }}>
              <div style={{ color: COLORS.accent, fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Why it matters</div>
              <div style={{ color: COLORS.text, fontSize: 16, fontWeight: 700, lineHeight: 1.4, marginBottom: 10 }}>
                Faster path from edit request to an order-ready design package.
              </div>
              <div style={{ color: COLORS.muted, fontSize: 13, lineHeight: 1.6 }}>
                Instead of stitching together guide design, donor review, protein interpretation, and vendor upload sheets manually, the app packages them into one consistent output.
              </div>
              <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
                <div style={{ color: COLORS.text, fontSize: 12, fontWeight: 700 }}>Hosted workflow highlights</div>
                {["Browser-based workflow", "Batch designs in one run", "Export-ready reports and spreadsheet templates"].map((item) => (
                  <div key={item} style={{ color: COLORS.muted, fontSize: 12, lineHeight: 1.5 }}>
                    - {item}
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
                <button
                  type="button"
                  onClick={loadSampleRequests}
                  style={{ ...FIELD_STYLE, width: "auto", cursor: "pointer", fontWeight: 700 }}
                >
                  Try sample workflow
                </button>
                <a
                  href={REPO_URL}
                  target="_blank"
                  rel="noreferrer"
                  style={{ ...FIELD_STYLE, width: "auto", cursor: "pointer", fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                >
                  View repository
                </a>
              </div>
            </div>
          </div>
        </div>

        <div style={{ ...CARD_STYLE, marginBottom: 18, padding: 12, background: "rgba(15,28,46,0.68)" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {[
              "Built for genome engineering workflows",
              "Supports KO, SNP, internal, N-terminal, and C-terminal designs",
              "Hosted browser experience with order-ready exports",
            ].map((item) => (
              <div key={item} style={{ padding: "8px 12px", borderRadius: 999, border: `1px solid ${COLORS.border}`, background: COLORS.panelAlt, color: COLORS.text, fontSize: 12, fontWeight: 700 }}>
                {item}
              </div>
            ))}
          </div>
        </div>

        <div style={{ ...CARD_STYLE, marginBottom: 18, padding: 14, background: "rgba(15,28,46,0.82)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            {[
              ["1. Upload", "Upload a GenBank folder once, or attach a GenBank file directly to a design row."],
              ["2. Describe", "Paste natural-language edit requests instead of filling every field manually."],
              ["3. Generate", "Review only flagged rows, then generate designs in one run."],
              ["4. Export", "Download HTML reports plus separate CRISPR, donor, and primer spreadsheet templates."],
            ].map(([title, text]) => (
              <div key={title} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 12, background: COLORS.panelAlt }}>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.5, color: COLORS.accent, textTransform: "uppercase", marginBottom: 6 }}>{title}</div>
                <div style={{ fontSize: 13, color: COLORS.muted, lineHeight: 1.5 }}>{text}</div>
              </div>
            ))}
          </div>
          <div style={{ color: COLORS.dim, fontSize: 12, marginTop: 10, lineHeight: 1.5 }}>
            Each fresh open starts with a clean workspace. Load sample requests or upload your own GenBank files to begin.
          </div>
        </div>

        <div style={{ ...CARD_STYLE, marginTop: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Optional workspace integration</div>
              <div style={{ color: COLORS.muted, fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
                Use this only if you want to import local project folders and save generated files back into those folders.
              </div>
            </div>
            <button type="button" onClick={() => setShowWorkspaceTools((current) => !current)} style={{ ...FIELD_STYLE, width: "auto", cursor: "pointer", fontWeight: 700 }}>
              {showWorkspaceTools ? "Hide workspace tools" : "Show workspace tools"}
            </button>
          </div>
          {showWorkspaceTools && (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14, marginBottom: 12 }}>
                <button type="button" onClick={pickWorkspaceFolder} disabled={!supportsWorkspaceAccess} style={{ ...FIELD_STYLE, width: "auto", cursor: supportsWorkspaceAccess ? "pointer" : "not-allowed", fontWeight: 700 }}>
                  Choose project root
                </button>
                <button type="button" onClick={importWorkspaceProjects} disabled={!workspaceFolders.length} style={{ ...FIELD_STYLE, width: "auto", cursor: workspaceFolders.length ? "pointer" : "not-allowed", fontWeight: 700 }}>
                  Import project folders as rows
                </button>
                <button
                  type="button"
                  onClick={saveSelectedToWorkspace}
                  disabled={!workspaceHandle || !selectedEntry?.result}
                  style={{ ...FIELD_STYLE, width: "auto", cursor: workspaceHandle && selectedEntry?.result ? "pointer" : "not-allowed", fontWeight: 700 }}
                >
                  Save selected report + order files to project folder
                </button>
                <button
                  type="button"
                  onClick={saveAllToWorkspace}
                  disabled={!workspaceHandle || !batchSuccessfulResults.length}
                  style={{ ...FIELD_STYLE, width: "auto", cursor: workspaceHandle && batchSuccessfulResults.length ? "pointer" : "not-allowed", fontWeight: 700 }}
                >
                  Save all reports + order files to project folders
                </button>
              </div>
              {workspaceFolders.length > 0 && (
                <div style={{ marginBottom: 12, maxWidth: 860 }}>
                  <div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Project folders to import</div>
                  <div style={{ ...FIELD_STYLE, background: COLORS.panelAlt, padding: 12, maxHeight: 220, overflowY: "auto" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
                      <button type="button" onClick={() => setSelectedWorkspaceFolders(workspaceFolders.map((entry) => entry.name))} style={{ ...FIELD_STYLE, width: "auto", cursor: "pointer", fontWeight: 700 }}>
                        Select all
                      </button>
                      <button type="button" onClick={() => setSelectedWorkspaceFolders([])} style={{ ...FIELD_STYLE, width: "auto", cursor: "pointer", fontWeight: 700 }}>
                        Clear selection
                      </button>
                    </div>
                    <div style={{ display: "grid", gap: 8 }}>
                      {workspaceFolders.map((entry) => (
                        <label key={entry.name} style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={selectedWorkspaceFolders.includes(entry.name)}
                            onChange={(event) => {
                              const checked = event.target.checked;
                              setSelectedWorkspaceFolders((current) => checked ? [...current, entry.name] : current.filter((name) => name !== entry.name));
                            }}
                            style={{ marginTop: 2 }}
                          />
                          <span style={{ color: COLORS.text, fontSize: 13, lineHeight: 1.4 }}>{entry.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div style={{ color: COLORS.dim, fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>
                    If nothing is checked, all detected project folders will be imported.
                  </div>
                </div>
              )}
              <div style={{ color: COLORS.dim, fontSize: 12, lineHeight: 1.5 }}>
                Linked root: {workspaceHandle?.name || "none"}
                {!supportsWorkspaceAccess && " | Direct project-folder access is unavailable in this browser."}
              </div>
              {workspaceStatus && <div style={{ marginTop: 12, color: COLORS.success, fontSize: 12 }}>{workspaceStatus}</div>}
            </>
          )}
        </div>

        <div id="design-requests" style={{ ...CARD_STYLE, marginTop: 18 }}>
          <SectionTitle>1. Design Requests</SectionTitle>
          <div style={{ color: COLORS.muted, fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
            Paste one request per line, upload a GenBank folder once, and review only the rows that still need input.
          </div>
          <div style={{ marginBottom: 12, padding: 12, borderRadius: 12, border: `1px solid ${COLORS.border}`, background: "rgba(20,36,59,0.78)" }}>
            <div style={{ color: COLORS.text, fontSize: 13, fontWeight: 700, marginBottom: 6 }}>New to the app?</div>
            <div style={{ color: COLORS.muted, fontSize: 13, lineHeight: 1.6 }}>
              Load sample requests to populate representative SNP, knockout, internal in-frame tag, and terminal tag projects, then click <strong>Generate designs</strong>.
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12, alignItems: "center" }}>
            <label style={{ ...FIELD_STYLE, width: "auto", display: "inline-flex", alignItems: "center", gap: 10, cursor: "pointer", fontWeight: 700 }}>
              <span style={{ color: COLORS.accent }}>Upload GenBank folder</span>
              <input type="file" accept=".gb,.gbk,.genbank,.txt" multiple webkitdirectory="" directory="" onChange={onBatchFolder} style={{ display: "none" }} />
            </label>
            <button type="button" onClick={loadSampleRequests} style={{ ...FIELD_STYLE, width: "auto", cursor: "pointer", fontWeight: 700 }}>Load sample requests</button>
            <button type="button" onClick={parseRequests} style={{ ...FIELD_STYLE, width: "auto", cursor: "pointer", fontWeight: 700 }}>Parse requests</button>
            <button type="button" onClick={addProjectRow} style={{ ...FIELD_STYLE, width: "auto", cursor: "pointer", fontWeight: 700 }}>Add design</button>
          </div>
          {batchFolderEntries.length > 0 && (
            <div style={{ color: COLORS.success, fontSize: 12, marginBottom: 12 }}>
              Folder ready: {batchFolderEntries.length} GenBank file{batchFolderEntries.length === 1 ? "" : "s"} loaded for automatic matching.
            </div>
          )}

          <div style={{ ...CARD_STYLE, background: COLORS.panelAlt, padding: 14, marginBottom: 14 }}>
            <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 8 }}>Paste requests</div>
            <div style={{ color: COLORS.muted, fontSize: 13, marginBottom: 10, lineHeight: 1.5 }}>
              Use short natural-language lines. The parser will infer KO, SNP, internal in-frame tags, C-terminal, or N-terminal designs and match GenBank files by gene where possible.
            </div>
            <label style={{ display: "block" }}>
              <div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Request lines</div>
              <textarea
                value={requestText}
                onChange={(event) => setRequestText(event.target.value)}
                style={{ ...FIELD_STYLE, minHeight: 126, resize: "vertical", fontFamily: 'Consolas, "Courier New", monospace' }}
                placeholder={SAMPLE_REQUEST_TEXT}
              />
            </label>
            <div style={{ color: COLORS.dim, fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>
              Best format: `GENE edit cell-line`. For internal tags, use lines like `SCN5A internal SPOT after P155 BIHi005-A`. If a line cannot infer gene, cell line, mutation/site, tag, or GenBank file, that row will be flagged for review.
            </div>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            {batchRows.map((row, index) => {
              const slot = index + 1;
              const batchStatus = batchResults.find((entry) => entry.rowId === row.id);
              const koRowReferences = batchKoReferenceMap[row.id];
              const koRowBrunelloGuideSet = batchStatus?.status === "success" && batchStatus.result?.type === "ko"
                ? getBrunelloReferenceGuideSet(batchStatus.result, koRowReferences?.brunello)
                : null;
              const koRowBrunelloPairs = batchStatus?.status === "success" && batchStatus.result?.type === "ko"
                ? buildKoReferencePairCandidates(batchStatus.result, row, koRowBrunelloGuideSet?.guides, buildBrunelloGuideOverride, "Brunello")
                : [];
              const koRowCasPairs = batchStatus?.status === "success" && batchStatus.result?.type === "ko"
                ? buildKoReferencePairCandidates(batchStatus.result, row, koRowReferences?.casDb?.targets, buildCasDatabaseGuideOverride, "Cas-Database")
                : [];
              const koRowTopBrunelloPair = koRowBrunelloPairs.find((candidate) => candidate.candidateMode === "nearby") || koRowBrunelloPairs.find((candidate) => candidate.candidateMode === "local") || koRowBrunelloPairs.find((candidate) => candidate.candidateMode === "cross-exon") || koRowBrunelloPairs.find((candidate) => candidate.candidateMode === "deletion-screen") || null;
              const koRowTopCasPair = koRowCasPairs.find((candidate) => candidate.candidateMode === "nearby") || koRowCasPairs.find((candidate) => candidate.candidateMode === "local") || koRowCasPairs.find((candidate) => candidate.candidateMode === "cross-exon") || koRowCasPairs.find((candidate) => candidate.candidateMode === "deletion-screen") || null;
              const constructSelection = (row.projectType === "ct" || row.projectType === "nt")
                ? resolveConstructBuilderSelection(row.tag, row.projectType)
                : null;
              const constructPayloads = constructSelection
                ? getConstructBuilderPayloads(row.projectType, constructSelection.architecture)
                : [];
              const constructHelp = constructSelection
                ? getConstructBuilderHelp(row.projectType, constructSelection.architecture)
                : "";
              const rowReady = !row.parseIssue && (row.projectType === "ko" ? (!!row.gene || hasSequenceBackedReference(row)) : hasSequenceBackedReference(row));
              return (
                <div key={row.id} style={{ padding: 14, borderRadius: 14, border: `1px solid ${COLORS.border}`, background: COLORS.panelAlt }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 700 }}>Design {slot}</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      {row.referenceSource === "raw" && hasRawReference(row) && <Badge color={COLORS.success}>Raw DNA reference</Badge>}
                      {row.referenceSource !== "raw" && row.fileName && <Badge color={COLORS.success}>{row.fileName}</Badge>}
                      {row.parseIssue && <Badge color={COLORS.accentAlt}>{row.parseIssue}</Badge>}
                      {!row.parseIssue && rowReady && !batchStatus && <Badge color={COLORS.accent}>Ready to generate</Badge>}
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

                  <label style={{ display: "block", marginTop: 12 }}>
                    <div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Reference source</div>
                    <select value={row.referenceSource} onChange={(event) => updateBatchRow(index, "referenceSource", event.target.value)} style={FIELD_STYLE}>
                      <option value="genbank">GenBank file</option>
                      <option value="raw">Raw DNA + CDS coordinates</option>
                    </select>
                  </label>

                  <label style={{ display: "block", marginTop: 12 }}><div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Requested edit summary</div><input value={row.editSummary} onChange={(event) => updateBatchRow(index, "editSummary", event.target.value)} style={FIELD_STYLE} placeholder="APOE2 (p.Arg176Cys) SNP knockin" /></label>
                  <label style={{ display: "block", marginTop: 12 }}><div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Notes / assumptions</div><textarea value={row.notes} onChange={(event) => updateBatchRow(index, "notes", event.target.value)} style={{ ...FIELD_STYLE, minHeight: 84, resize: "vertical" }} placeholder="Transcript assumptions, strand notes, delivery mode, client constraints..." /></label>
                  <label style={{ display: "block", marginTop: 12 }}>
                    <div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Custom gRNAs (optional)</div>
                    <textarea
                      value={row.customGuides}
                      onChange={(event) => updateBatchRow(index, "customGuides", event.target.value)}
                      style={{ ...FIELD_STYLE, minHeight: 72, resize: "vertical", fontFamily: "Consolas, monospace" }}
                      placeholder={"Paste one or two 20 nt spacers, one per line\nGGACTGTTGCTGTTCTGCCC\nATGGCAGATCCACTGTGGGT"}
                    />
                    <div style={{ marginTop: 6, color: COLORS.dim, fontSize: 12, lineHeight: 1.5 }}>
                      If provided, the app maps these spacers onto the uploaded reference and uses them for donor and primer design. For knockout, paste two guides. For SNP and knock-ins, paste one or two guides near the edit site.
                    </div>
                  </label>

                  {row.referenceSource === "raw" ? (
                    <>
                      <label style={{ display: "block", marginTop: 12 }}>
                        <div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Reference DNA</div>
                        <textarea value={row.rawSequence} onChange={(event) => updateBatchRow(index, "rawSequence", event.target.value)} style={{ ...FIELD_STYLE, minHeight: 120, resize: "vertical", fontFamily: "Consolas, monospace" }} placeholder="Paste genomic DNA sequence using A/C/G/T only" />
                      </label>
                      <Grid>
                        <label><div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>CDS start (1-based)</div><input value={row.cdsStart} onChange={(event) => updateBatchRow(index, "cdsStart", event.target.value)} style={FIELD_STYLE} placeholder="101" /></label>
                        <label><div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>CDS end (1-based)</div><input value={row.cdsEnd} onChange={(event) => updateBatchRow(index, "cdsEnd", event.target.value)} style={FIELD_STYLE} placeholder="1452" /></label>
                      </Grid>
                      <label style={{ display: "block", marginTop: 12 }}>
                        <div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Exon coordinates (optional)</div>
                        <textarea value={row.exonCoordinates} onChange={(event) => updateBatchRow(index, "exonCoordinates", event.target.value)} style={{ ...FIELD_STYLE, minHeight: 72, resize: "vertical", fontFamily: "Consolas, monospace" }} placeholder={"One exon per line, 1-based inclusive\n101-240\n301-512"} />
                      </label>
                    </>
                  ) : (
                    <label style={{ display: "block", marginTop: 12 }}>
                      <div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Reference GenBank {row.projectType === "ko" ? "(optional for gene-list KO mode)" : ""}</div>
                      <label style={{ ...FIELD_STYLE, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                        <span style={{ color: row.fileName ? COLORS.success : COLORS.muted }}>{row.fileName || "Upload .gb / .gbk / .genbank"}</span>
                        <span style={{ color: COLORS.accent, fontWeight: 700 }}>Browse</span>
                        <input type="file" accept=".gb,.gbk,.genbank,.txt" onChange={(event) => onBatchFile(index, event)} style={{ display: "none" }} />
                      </label>
                    </label>
                  )}

                  {row.projectType === "pm" && <label style={{ display: "block", marginTop: 12 }}><div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Mutation</div><input value={row.mutation} onChange={(event) => updateBatchRow(index, "mutation", event.target.value)} style={FIELD_STYLE} placeholder="R176C" /></label>}
                  {row.projectType === "it" && (
                    <Grid>
                      <label><div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Internal tag</div><select value={INTERNAL_TAGS[row.tag] ? row.tag : "SPOT"} onChange={(event) => updateBatchRow(index, "tag", event.target.value)} style={FIELD_STYLE}>{internalTagOptions.map((option) => <option key={option} value={option}>{option} ({INTERNAL_TAGS[option].seq.length} bp)</option>)}</select></label>
                      <label><div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Insert after residue</div><input value={row.mutation} onChange={(event) => updateBatchRow(index, "mutation", event.target.value)} style={FIELD_STYLE} placeholder="P155" /></label>
                    </Grid>
                  )}
                  {(row.projectType === "ct" || row.projectType === "nt") && (
                    <>
                      <Grid>
                        <label>
                          <div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Architecture</div>
                          <select
                            value={constructSelection?.architecture || ""}
                            onChange={(event) => {
                              const payloads = getConstructBuilderPayloads(row.projectType, event.target.value);
                              if (payloads.length) updateBatchRow(index, "tag", payloads[0].cassette);
                            }}
                            style={FIELD_STYLE}
                          >
                            {getConstructBuilderGroups(row.projectType).map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}
                          </select>
                        </label>
                        <label>
                          <div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>{constructSelection?.architecture === "fusion" ? "Reporter / tag" : constructSelection?.architecture === "tag_p2a_reporter" ? "Tag + reporter" : "Reporter"}</div>
                          <select value={row.tag} onChange={(event) => updateBatchRow(index, "tag", event.target.value)} style={FIELD_STYLE}>
                            {constructPayloads.map((option) => <option key={option.cassette} value={option.cassette}>{option.label} ({getCassetteSequenceLength(option.cassette, row.projectType)} bp)</option>)}
                          </select>
                        </label>
                        <label><div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Homology arm</div><select value={row.homologyArm} onChange={(event) => updateBatchRow(index, "homologyArm", event.target.value)} style={FIELD_STYLE}><option value="250">250 bp</option><option value="500">500 bp</option><option value="750">750 bp</option></select></label>
                      </Grid>
                      <div style={{ marginTop: 8, color: COLORS.muted, fontSize: 12, lineHeight: 1.5 }}>
                        {row.projectType === "nt"
                          ? "N-terminal convention: fusion designs use reporter-linker or tag-linker. Cleavable designs use reporter-T2A or reporter-P2A."
                          : "C-terminal convention: fusion designs use linker-tag. Cleavable designs use T2A-reporter or P2A-reporter."}
                      </div>
                      {constructHelp && (
                        <div style={{ marginTop: 6, color: COLORS.dim, fontSize: 12, lineHeight: 1.5 }}>
                          {constructHelp}
                        </div>
                      )}
                      <div style={{ marginTop: 6, color: COLORS.dim, fontSize: 12, lineHeight: 1.5 }}>
                        Resolved cassette: <span style={{ fontFamily: "Consolas, monospace", color: COLORS.text }}>{row.tag}</span>
                      </div>
                      <div style={{ marginTop: 6, color: COLORS.dim, fontSize: 12, lineHeight: 1.5 }}>
                        Reporter inserts come from the built-in FPbase-backed reporter library, so you do not need to paste reporter DNA manually.
                      </div>
                      <div style={{ marginTop: 12, padding: 12, borderRadius: 12, border: "1px solid #D7DEE7", background: "#F8FAFC" }}>
                        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 8 }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>FPbase reporter catalog</div>
                            <div style={{ color: "#667085", fontSize: 12, lineHeight: 1.5 }}>Search all FPbase reporters, then apply curated order-ready reporters directly into this {row.projectType === "nt" ? "N-terminal" : "C-terminal"} design.</div>
                          </div>
                          <button type="button" onClick={() => toggleFpbaseRow(row.id)} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #D0D5DD", background: "#fff", color: "#111827", fontWeight: 700, cursor: "pointer" }}>
                            {fpbaseRowId === row.id ? "Hide FPbase reporters" : "Browse FPbase reporters"}
                          </button>
                        </div>
                        {fpbaseRowId === row.id && (
                          <>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                              <input
                                value={fpbaseSearchInput}
                                onChange={(event) => setFpbaseSearchInput(event.target.value)}
                                placeholder="Search FPbase, for example mNeonGreen or tdTomato"
                                style={{ ...FIELD_STYLE, flex: "1 1 260px", background: "#fff", color: "#111827" }}
                              />
                              <button type="button" onClick={() => loadFpbaseReporters(fpbaseSearchInput.trim())} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #D0D5DD", background: "#fff", color: "#111827", fontWeight: 700, cursor: "pointer" }}>
                                Search FPbase
                              </button>
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                              <Badge color="#D1FAE5">Order-ready: built-in donor DNA available</Badge>
                              <Badge color="#EAECF0">Reference only: visible from FPbase, not yet curated for donor design</Badge>
                            </div>
                            {fpbaseLookup.status === "loading" && (
                              <div style={{ color: "#667085", fontSize: 12 }}>Loading FPbase reporters...</div>
                            )}
                            {fpbaseLookup.status === "error" && (
                              <div style={{ padding: 10, borderRadius: 10, background: "#FEE4E2", color: "#B42318", fontSize: 12 }}>{fpbaseLookup.error}</div>
                            )}
                            {fpbaseLookup.status === "success" && (
                              <div style={{ display: "grid", gap: 10 }}>
                                <div style={{ color: "#667085", fontSize: 12 }}>
                                  {fpbaseLookup.data?.count || fpbaseLookup.data?.reporters?.length || 0} FPbase reporters found.
                                  {fpbaseLookup.data?.sourceUrl ? <> Source: <a href={fpbaseLookup.data.sourceUrl} target="_blank" rel="noreferrer" style={{ color: "#2E75B6", textDecoration: "none" }}>{fpbaseLookup.data.sourceUrl}</a></> : null}
                                </div>
                                {(fpbaseLookup.data?.reporters || []).slice(0, 24).map((reporter) => {
                                  const actionOptions = getReporterActionOptions(reporter.name, row.projectType);
                                  const orderReadyKey = getOrderReadyReporterKey(reporter.name);
                                  const builtInReporter = orderReadyKey ? REPORTERS[orderReadyKey] : null;
                                  return (
                                    <div key={reporter.id || reporter.name} style={{ padding: 12, borderRadius: 12, border: "1px solid #D7DEE7", background: "#fff" }}>
                                      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 6 }}>
                                        <div style={{ fontWeight: 700, color: "#111827" }}>{reporter.name}</div>
                                        <Badge color={actionOptions.length ? "#D1FAE5" : "#EAECF0"}>{actionOptions.length ? "Order-ready" : "Reference only"}</Badge>
                                      </div>
                                      <div style={{ color: "#667085", fontSize: 12, lineHeight: 1.5, marginBottom: 6 }}>
                                        {formatFpbaseReporterSummary(reporter) || "FPbase reporter entry"}
                                      </div>
                                      <div style={{ color: "#667085", fontSize: 12, lineHeight: 1.5, marginBottom: 8 }}>
                                        {reporter.aaLength ? `${reporter.aaLength} aa` : "AA length n/a"}
                                        {reporter.genbank ? ` • GenBank ${reporter.genbank}` : ""}
                                        {builtInReporter?.sourceUrl ? <> • <a href={builtInReporter.sourceUrl} target="_blank" rel="noreferrer" style={{ color: "#2E75B6", textDecoration: "none" }}>FPbase entry</a></> : reporter.url ? <> • <a href={reporter.url} target="_blank" rel="noreferrer" style={{ color: "#2E75B6", textDecoration: "none" }}>FPbase entry</a></> : null}
                                      </div>
                                      {!!actionOptions.length && (
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                          {actionOptions.map((option) => (
                                            <button
                                              key={option}
                                              type="button"
                                              onClick={() => applyFpbaseReporterToRow(index, option)}
                                              style={{
                                                padding: "8px 12px",
                                                borderRadius: 10,
                                                border: row.tag === option ? "1px solid #10B981" : "1px solid #D0D5DD",
                                                background: row.tag === option ? "#ECFDF5" : "#fff",
                                                color: "#111827",
                                                fontWeight: 700,
                                                cursor: "pointer",
                                              }}
                                            >
                                              Use {getCassetteDisplayLabel(option, row.projectType)}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </>
                  )}
                  {row.projectType === "ko" && <div style={{ marginTop: 12, color: COLORS.muted, fontSize: 12 }}>KO can run from gene name alone for high-throughput reference-guide mode, or use an uploaded GenBank for sequence-backed spacing and primer design. Custom pasted guides require GenBank so the app can remap cut sites and rebuild the centered amplicon.</div>}

                  {batchStatus?.status === "error" && (
                    <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "rgba(251,113,133,0.10)", border: `1px solid ${COLORS.danger}55`, color: COLORS.danger }}>
                      {batchStatus.error}
                    </div>
                  )}
                  {batchStatus?.status === "success" && (
                    <div style={{ marginTop: 10, color: COLORS.muted, fontSize: 12, lineHeight: 1.5 }}>
                      {batchStatus.result.gs?.length || 0} gRNAs | {(batchStatus.result.type === "pm" || batchStatus.result.type === "it" ? batchStatus.result.os?.length : batchStatus.result.donor ? 1 : 0) || 0} donor entries | {batchStatus.result.ps?.length || 0} primers
                    </div>
                  )}
                  {batchStatus?.status === "success" && batchStatus.result?.type === "ko" && (
                    <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "#F8FAFC", border: "1px solid #D7DEE7" }}>
                      <div style={{ color: "#111827", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>High-throughput KO pair suggestions</div>
                      <div style={{ color: "#667085", fontSize: 12, lineHeight: 1.5, marginBottom: 10 }}>
                        For KO rows, the app can suggest nearby pairs from the top 3 Brunello and Cas-Database guides, then center validation primers automatically.
                      </div>
                      {koRowReferences?.status === "loading" && (
                        <div style={{ color: "#667085", fontSize: 12 }}>Loading KO reference pairs...</div>
                      )}
                      {koRowReferences?.error && (
                        <div style={{ color: "#B42318", fontSize: 12, marginBottom: 8 }}>{koRowReferences.error}</div>
                      )}
                      {koRowTopBrunelloPair && (
                        <div style={{ marginBottom: 8, padding: 10, borderRadius: 10, background: "#FFF7ED", border: "1px solid #FED7AA" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                            <div>
                              <div style={{ color: "#9A3412", fontWeight: 700, fontSize: 12 }}>{koRowTopBrunelloPair.candidateMode === "deletion-screen" ? "Top Brunello deletion-screen pair" : koRowTopBrunelloPair.candidateMode === "cross-exon" ? "Top Brunello cross-exon pair" : "Top Brunello local pair"}</div>
                              <div style={{ color: "#7C2D12", fontSize: 12, marginTop: 4 }}>
                                {koRowTopBrunelloPair.exonLabel} | {Number.isFinite(koRowTopBrunelloPair.spacing) ? `${koRowTopBrunelloPair.spacing} bp ${koRowTopBrunelloPair.candidateMode === "deletion-screen" ? "deletion" : "spacing"}` : "spacing n/a"} | {koRowTopBrunelloPair.result.amp || "amplicon n/a"}
                              </div>
                            </div>
                            <button type="button" onClick={() => applyKoGuidePairToRow(row.id, koRowTopBrunelloPair)} style={{ ...FIELD_STYLE, width: "auto", padding: "6px 8px", background: "#ffffff", color: "#9A3412", borderColor: "#FDBA74", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                              Apply Brunello pair
                            </button>
                          </div>
                        </div>
                      )}
                      {koRowTopCasPair && (
                        <div style={{ padding: 10, borderRadius: 10, background: "#ffffff", border: "1px solid #D0D5DD" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                            <div>
                              <div style={{ color: "#111827", fontWeight: 700, fontSize: 12 }}>{koRowTopCasPair.candidateMode === "deletion-screen" ? "Top Cas-Database deletion-screen pair" : koRowTopCasPair.candidateMode === "cross-exon" ? "Top Cas-Database cross-exon pair" : "Top Cas-Database local pair"}</div>
                              <div style={{ color: "#475467", fontSize: 12, marginTop: 4 }}>
                                {koRowTopCasPair.exonLabel} | {Number.isFinite(koRowTopCasPair.spacing) ? `${koRowTopCasPair.spacing} bp ${koRowTopCasPair.candidateMode === "deletion-screen" ? "deletion" : "spacing"}` : "spacing n/a"} | {koRowTopCasPair.result.amp || "amplicon n/a"}
                              </div>
                            </div>
                            <button type="button" onClick={() => applyKoGuidePairToRow(row.id, koRowTopCasPair)} style={{ ...FIELD_STYLE, width: "auto", padding: "6px 8px", background: "#ffffff", color: "#111827", borderColor: "#D0D5DD", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                              Apply Cas-Database pair
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
            <button type="button" onClick={runBatch} style={{ ...FIELD_STYLE, width: "auto", cursor: "pointer", fontWeight: 700, background: "linear-gradient(135deg, #2dd4bf, #f59e0b)", color: "#07111c", border: "none" }}>
              Generate designs
            </button>
            {batchCopyState && <Badge color={COLORS.success}>{batchCopyState}</Badge>}
          </div>
          {batchError && <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "rgba(251,113,133,0.10)", border: `1px solid ${COLORS.danger}55`, color: COLORS.danger }}>{batchError}</div>}
        </div>

        <div style={{ ...CARD_STYLE, marginTop: 18 }}>
          <SectionTitle>2. Final Report</SectionTitle>
          <div style={{ color: COLORS.muted, fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
            Review the selected design, then either save it into the linked project folder or download the HTML/browser export fallback.
          </div>
          {workspaceHandle && selectedEntry?.result && (
            <div style={{ marginBottom: 12, padding: 12, borderRadius: 12, background: "#ECFDF3", border: "1px solid #A7F3D0" }}>
              <div style={{ color: "#047857", fontSize: 12, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 6 }}>Recommended Save Path</div>
              <div style={{ color: "#111827", fontSize: 13, marginBottom: 10, lineHeight: 1.5 }}>
                Save the selected report and order files into the linked project folder. The HTML report is the editable version; open it in Word if you want to revise it, then export PDF from Word only for a final fixed copy.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <button type="button" onClick={saveSelectedToWorkspace} style={{ ...FIELD_STYLE, width: "auto", cursor: "pointer", fontWeight: 700, background: "#D1FAE5", border: "1px solid #86EFAC", color: "#065F46" }}>
                  Save selected report + order files to project folder
                </button>
                <button
                  type="button"
                  onClick={saveAllToWorkspace}
                  disabled={!batchSuccessfulResults.length}
                  style={{ ...FIELD_STYLE, width: "auto", cursor: batchSuccessfulResults.length ? "pointer" : "not-allowed", fontWeight: 700, background: "#ffffff", border: "1px solid #86EFAC", color: "#065F46" }}
                >
                  Save all reports + order files to project folders
                </button>
              </div>
            </div>
          )}
          <div style={{ color: COLORS.dim, fontSize: 12, marginBottom: 10, lineHeight: 1.5 }}>
            Browser Download Fallback
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
            <button type="button" disabled={!reportHtml} onClick={downloadReport} style={{ ...FIELD_STYLE, width: "auto", cursor: reportHtml ? "pointer" : "not-allowed", fontWeight: 700 }}>Download HTML report to browser Downloads</button>
            <button type="button" disabled={batchSuccessfulResults.length < 2} onClick={downloadAllReports} style={{ ...FIELD_STYLE, width: "auto", cursor: batchSuccessfulResults.length >= 2 ? "pointer" : "not-allowed", fontWeight: 700 }}>Download all HTML reports to browser Downloads</button>
            <button type="button" disabled={!selectedEntry?.result} onClick={() => copyText(buildDesignSummary(selectedEntry.result), "Design summary")} style={{ ...FIELD_STYLE, width: "auto", cursor: selectedEntry?.result ? "pointer" : "not-allowed", fontWeight: 700 }}>Copy design summary</button>
            {copyState && <Badge color={COLORS.success}>{copyState}</Badge>}
          </div>

          {selectedEntry?.result && (
            <div style={{ marginBottom: 14, padding: 12, borderRadius: 12, background: COLORS.panelAlt, border: `1px solid ${COLORS.border}` }}>
              <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 8 }}>Selected Design Order Export</div>
              <div style={{ color: COLORS.muted, fontSize: 13, marginBottom: 10, lineHeight: 1.5 }}>
                Export the currently selected project into spreadsheet templates for CRISPR reagents, primers, and HDR donors. The generated files remain compatible with your current upload workflow.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <button type="button" disabled={!singleIdtTemplateRows.crispr.length} onClick={() => downloadSingleIdtTemplate("crispr")} style={{ ...FIELD_STYLE, width: "auto", cursor: singleIdtTemplateRows.crispr.length ? "pointer" : "not-allowed", fontWeight: 700 }}>
                  Download single CRISPR template
                </button>
                <button type="button" disabled={!singleIdtTemplateRows.oligo.length} onClick={() => downloadSingleIdtTemplate("oligo")} style={{ ...FIELD_STYLE, width: "auto", cursor: singleIdtTemplateRows.oligo.length ? "pointer" : "not-allowed", fontWeight: 700 }}>
                  Download single primer template
                </button>
                <button type="button" disabled={!singleIdtTemplateRows.hdr.length} onClick={() => downloadSingleIdtTemplate("hdr")} style={{ ...FIELD_STYLE, width: "auto", cursor: singleIdtTemplateRows.hdr.length ? "pointer" : "not-allowed", fontWeight: 700 }}>
                  Download single HDR template
                </button>
              </div>
            </div>
          )}

          <div style={{ padding: 14, borderRadius: 12, background: "#f8fafc", color: "#333", border: "1px solid #d7dee7", minHeight: 380 }}>
            {!selectedEntry?.result && (
              <div style={{ color: "#667085", maxWidth: 640 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 8 }}>No design report yet</div>
                <div style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 10 }}>
                  Use the Design Requests section to upload GenBank files, paste request lines, and generate designs. Once at least one design succeeds, the full report preview will appear here.
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                  Quick start: upload a GenBank folder, click <strong>Load sample requests</strong>, then click <strong>Generate designs</strong>.
                </div>
              </div>
            )}
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
                  <div style={{ marginBottom: 16, padding: 14, borderRadius: 12, background: "#ECFDF3", border: "1px solid #A7F3D0" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <div>
                        <div style={{ color: "#047857", fontSize: 12, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 4 }}>Detailed Report</div>
                        <div style={{ color: "#111827", fontSize: 14, fontWeight: 700 }}>Choose which generated design is shown in full below</div>
                      </div>
                      <div style={{ display: "inline-flex", alignItems: "center", padding: "4px 10px", borderRadius: 999, background: "#D1FAE5", color: "#065F46", fontSize: 12, fontWeight: 700 }}>
                        Showing: {formatBatchDesignLabel({ ...selectedEntry.row, slot: selectedEntry.slot }, selectedEntry.result)}
                      </div>
                    </div>
                    <select value={selectedEntry.rowId} onChange={(event) => setSelectedProjectId(event.target.value)} style={{ ...FIELD_STYLE, background: "#ffffff", color: "#111827", borderColor: "#86EFAC", fontWeight: 700 }}>
                      {batchSuccessfulResults.map((entry) => (
                        <option key={entry.rowId} value={entry.rowId}>{formatBatchDesignLabel({ ...entry.row, slot: entry.slot }, entry.result)}</option>
                      ))}
                    </select>
                  </div>
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

                <DesignReadinessCard result={selectedEntry.result} />
                <LocusMapCard result={selectedEntry.result} />

                <div style={{ fontSize: 18, fontWeight: 700, margin: "14px 0 8px 0" }}>4. {selectedEntry.result.type === "pm" ? "ssODN Donor Templates" : selectedEntry.result.type === "ko" ? "Knockout Design" : selectedEntry.result.type === "it" ? "Internal ssODN Donor Templates" : "Donor Design"}</div>
                {selectedEntry.result.type === "pm" && (selectedEntry.result.os || []).map((donor) => <PmDonorPreview key={donor.n} donor={donor} />)}
                {selectedEntry.result.type === "ko" && (
                  <>
                    <div style={{ color: "#555", fontSize: 13, lineHeight: 1.5, marginBottom: 12 }}>
                      {selectedEntry.result.referenceOnly
                        ? "No donor is required for knockout design. This report is in gene-list KO mode, so the paired gRNAs above are reference guides and exact spacing/primer geometry still need a GenBank-backed follow-up."
                        : "No donor is required for knockout design. Use the paired gRNAs above for deletion/NHEJ-based disruption."}
                    </div>
                    {brunelloLookup.status === "loading" && (
                      <div style={{ marginBottom: 12, color: "#9A3412", fontSize: 13 }}>
                        Loading Brunello CRISPRko reference guides...
                      </div>
                    )}
                    {brunelloLookup.status === "error" && (
                      <div style={{ marginBottom: 12, padding: 10, borderRadius: 10, background: "#FEF3F2", border: "1px solid #FECDCA", color: "#B42318", fontSize: 13 }}>
                        {brunelloLookup.error}
                      </div>
                    )}
                    {brunelloReferenceGuideSet && (
                      <div style={{ marginBottom: 16, padding: 12, borderRadius: 12, background: "#FFF7ED", border: "1px solid #FED7AA" }}>
                        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: "#9A3412" }}>Brunello CRISPRko Reference Guides</div>
                        <div style={{ color: "#7C2D12", fontSize: 13, lineHeight: 1.5, marginBottom: 10 }}>
                          {brunelloReferenceGuideSet.source}. {brunelloReferenceGuideSet.summary}
                          {brunelloReferenceGuideSet.requestedGene !== brunelloReferenceGuideSet.libraryGene ? ` Library symbol: ${brunelloReferenceGuideSet.libraryGene}.` : ""}
                        </div>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr>{["Spacer", "PAM", "Exon", "Rule Set 2", "Transcript", "Strand", "Use"].map((label) => <th key={label} style={{ padding: "8px 10px", border: "1px solid #FDBA74", background: "#FFEDD5", color: "#7C2D12", textAlign: "left", fontSize: 12 }}>{label}</th>)}</tr>
                          </thead>
                          <tbody>
                            {brunelloReferenceGuideSet.guides.map((guide) => (
                              <tr key={guide.spacer}>
                                <td style={{ padding: "8px 10px", border: "1px solid #FDBA74", background: "#ffffff", fontFamily: "Consolas, monospace", fontSize: 12 }}>{guide.spacer}</td>
                                <td style={{ padding: "8px 10px", border: "1px solid #FDBA74", background: "#ffffff", fontFamily: "Consolas, monospace", fontSize: 12 }}>{guide.pam}</td>
                                <td style={{ padding: "8px 10px", border: "1px solid #FDBA74", background: "#ffffff", fontSize: 12 }}>Exon {guide.exon}</td>
                                <td style={{ padding: "8px 10px", border: "1px solid #FDBA74", background: "#ffffff", fontSize: 12 }}>{guide.ruleSet2}</td>
                                <td style={{ padding: "8px 10px", border: "1px solid #FDBA74", background: "#ffffff", fontSize: 12 }}>{guide.transcript}</td>
                                <td style={{ padding: "8px 10px", border: "1px solid #FDBA74", background: "#ffffff", fontSize: 12 }}>{guide.strand}</td>
                                <td style={{ padding: "8px 10px", border: "1px solid #FDBA74", background: "#ffffff", fontSize: 12 }}>
                                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                    <button type="button" onClick={() => applyBrunelloGuideToSelectedKo(0, guide)} style={{ ...FIELD_STYLE, width: "auto", padding: "6px 8px", background: "#ffffff", color: "#9A3412", borderColor: "#FDBA74", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                                      Use as gRNA1
                                    </button>
                                    <button type="button" onClick={() => applyBrunelloGuideToSelectedKo(1, guide)} style={{ ...FIELD_STYLE, width: "auto", padding: "6px 8px", background: "#ffffff", color: "#9A3412", borderColor: "#FDBA74", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                                      Use as gRNA2
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {!!brunelloLocalCandidates.length && (
                          <div style={{ marginTop: 14 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: "#9A3412" }}>Local pair designs from the top 3 Brunello guides</div>
                            <div style={{ color: "#7C2D12", fontSize: 12, lineHeight: 1.5, marginBottom: 8 }}>
                              These pairs are remapped onto your selected reference. Preferred same-exon pairs in the 40-140 bp window are listed first, and other local same-exon pairs are kept for manual review with recalculated primers.
                            </div>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                              <thead>
                                <tr>{["Pair", "Exon", "Spacing", "Amplicon", "Primers", "Apply"].map((label) => <th key={label} style={{ padding: "8px 10px", border: "1px solid #FDBA74", background: "#FFEDD5", color: "#7C2D12", textAlign: "left", fontSize: 12 }}>{label}</th>)}</tr>
                              </thead>
                              <tbody>
                                {brunelloLocalCandidates.map((candidate) => (
                                  <tr key={candidate.id}>
                                    <td style={{ padding: "8px 10px", border: "1px solid #FDBA74", background: "#ffffff", fontSize: 12 }}>
                                      <div style={{ fontWeight: 700 }}>{candidate.sourceIndexes[0]} + {candidate.sourceIndexes[1]}</div>
                                      <div style={{ fontFamily: "Consolas, monospace", color: "#7C2D12", fontSize: 11 }}>{candidate.result.gs?.[0]?.sp}</div>
                                      <div style={{ fontFamily: "Consolas, monospace", color: "#7C2D12", fontSize: 11 }}>{candidate.result.gs?.[1]?.sp}</div>
                                    </td>
                                    <td style={{ padding: "8px 10px", border: "1px solid #FDBA74", background: "#ffffff", fontSize: 12 }}>{candidate.exonLabel}</td>
                                    <td style={{ padding: "8px 10px", border: "1px solid #FDBA74", background: "#ffffff", fontSize: 12 }}>
                                      {Number.isFinite(candidate.spacing) ? `${candidate.spacing} bp${candidate.candidateMode === "local" ? " (review)" : ""}` : "n/a"}
                                    </td>
                                    <td style={{ padding: "8px 10px", border: "1px solid #FDBA74", background: "#ffffff", fontSize: 12 }}>{candidate.result.amp || "n/a"}</td>
                                    <td style={{ padding: "8px 10px", border: "1px solid #FDBA74", background: "#ffffff", fontSize: 11, fontFamily: "Consolas, monospace" }}>
                                      <div>Fw: {candidate.result.ps?.[0]?.s || "n/a"}</div>
                                      <div>Rev: {candidate.result.ps?.[1]?.s || "n/a"}</div>
                                    </td>
                                    <td style={{ padding: "8px 10px", border: "1px solid #FDBA74", background: "#ffffff", fontSize: 12 }}>
                                      <button type="button" onClick={() => applyKoGuidePairToSelected(candidate)} style={{ ...FIELD_STYLE, width: "auto", padding: "6px 8px", background: "#ffffff", color: "#9A3412", borderColor: "#FDBA74", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                                        Use pair
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {!!brunelloDeletionCandidates.length && (
                          <div style={{ marginTop: 14 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: "#9A3412" }}>Long-range deletion-screen pairs from the top 3 Brunello guides</div>
                            <div style={{ color: "#7C2D12", fontSize: 12, lineHeight: 1.5, marginBottom: 8 }}>
                              These guide pairs are far apart on your selected reference, so the app designs flanking junction-PCR primers to amplify the deletion band and reports the expected deletion size.
                            </div>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                              <thead>
                                <tr>{["Pair", "Exon location", "Deletion size", "Amplicon", "Primers", "Apply"].map((label) => <th key={label} style={{ padding: "8px 10px", border: "1px solid #FDBA74", background: "#FFEDD5", color: "#7C2D12", textAlign: "left", fontSize: 12 }}>{label}</th>)}</tr>
                              </thead>
                              <tbody>
                                {brunelloDeletionCandidates.map((candidate) => (
                                  <tr key={candidate.id}>
                                    <td style={{ padding: "8px 10px", border: "1px solid #FDBA74", background: "#ffffff", fontSize: 12 }}>
                                      <div style={{ fontWeight: 700 }}>{candidate.sourceIndexes[0]} + {candidate.sourceIndexes[1]}</div>
                                      <div style={{ fontFamily: "Consolas, monospace", color: "#7C2D12", fontSize: 11 }}>{candidate.result.gs?.[0]?.sp}</div>
                                      <div style={{ fontFamily: "Consolas, monospace", color: "#7C2D12", fontSize: 11 }}>{candidate.result.gs?.[1]?.sp}</div>
                                    </td>
                                    <td style={{ padding: "8px 10px", border: "1px solid #FDBA74", background: "#ffffff", fontSize: 12 }}>{candidate.exonLabel}</td>
                                    <td style={{ padding: "8px 10px", border: "1px solid #FDBA74", background: "#ffffff", fontSize: 12 }}>{Number.isFinite(candidate.deletionSize) ? `~${candidate.deletionSize} bp` : "n/a"}</td>
                                    <td style={{ padding: "8px 10px", border: "1px solid #FDBA74", background: "#ffffff", fontSize: 12 }}>{candidate.result.amp || "n/a"}</td>
                                    <td style={{ padding: "8px 10px", border: "1px solid #FDBA74", background: "#ffffff", fontSize: 11, fontFamily: "Consolas, monospace" }}>
                                      <div>Fw: {candidate.result.ps?.[0]?.s || "n/a"}</div>
                                      <div>Rev: {candidate.result.ps?.[1]?.s || "n/a"}</div>
                                    </td>
                                    <td style={{ padding: "8px 10px", border: "1px solid #FDBA74", background: "#ffffff", fontSize: 12 }}>
                                      <button type="button" onClick={() => applyKoGuidePairToSelected(candidate)} style={{ ...FIELD_STYLE, width: "auto", padding: "6px 8px", background: "#ffffff", color: "#9A3412", borderColor: "#FDBA74", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                                        Use pair
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {!!brunelloCrossExonCandidates.length && (
                          <div style={{ marginTop: 14 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: "#9A3412" }}>Cross-exon review pairs from the top 3 Brunello guides</div>
                            <div style={{ color: "#7C2D12", fontSize: 12, lineHeight: 1.5, marginBottom: 8 }}>
                              These pairs remap across different local exons. They are kept for manual review, with recalculated spacing and validation primers, but are not preferred default KO pairs.
                            </div>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                              <thead>
                                <tr>{["Pair", "Exon location", "Spacing", "Amplicon", "Primers", "Apply"].map((label) => <th key={label} style={{ padding: "8px 10px", border: "1px solid #FDBA74", background: "#FFEDD5", color: "#7C2D12", textAlign: "left", fontSize: 12 }}>{label}</th>)}</tr>
                              </thead>
                              <tbody>
                                {brunelloCrossExonCandidates.map((candidate) => (
                                  <tr key={candidate.id}>
                                    <td style={{ padding: "8px 10px", border: "1px solid #FDBA74", background: "#ffffff", fontSize: 12 }}>
                                      <div style={{ fontWeight: 700 }}>{candidate.sourceIndexes[0]} + {candidate.sourceIndexes[1]}</div>
                                      <div style={{ fontFamily: "Consolas, monospace", color: "#7C2D12", fontSize: 11 }}>{candidate.result.gs?.[0]?.sp}</div>
                                      <div style={{ fontFamily: "Consolas, monospace", color: "#7C2D12", fontSize: 11 }}>{candidate.result.gs?.[1]?.sp}</div>
                                    </td>
                                    <td style={{ padding: "8px 10px", border: "1px solid #FDBA74", background: "#ffffff", fontSize: 12 }}>{candidate.exonLabel}</td>
                                    <td style={{ padding: "8px 10px", border: "1px solid #FDBA74", background: "#ffffff", fontSize: 12 }}>{Number.isFinite(candidate.spacing) ? `${candidate.spacing} bp (review)` : "n/a"}</td>
                                    <td style={{ padding: "8px 10px", border: "1px solid #FDBA74", background: "#ffffff", fontSize: 12 }}>{candidate.result.amp || "n/a"}</td>
                                    <td style={{ padding: "8px 10px", border: "1px solid #FDBA74", background: "#ffffff", fontSize: 11, fontFamily: "Consolas, monospace" }}>
                                      <div>Fw: {candidate.result.ps?.[0]?.s || "n/a"}</div>
                                      <div>Rev: {candidate.result.ps?.[1]?.s || "n/a"}</div>
                                    </td>
                                    <td style={{ padding: "8px 10px", border: "1px solid #FDBA74", background: "#ffffff", fontSize: 12 }}>
                                      <button type="button" onClick={() => applyKoGuidePairToSelected(candidate)} style={{ ...FIELD_STYLE, width: "auto", padding: "6px 8px", background: "#ffffff", color: "#9A3412", borderColor: "#FDBA74", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                                        Use pair
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {!!brunelloFilteredPairs.length && (
                          <div style={{ marginTop: 14, padding: 10, borderRadius: 10, background: "#FFF7ED", border: "1px solid #FDBA74", color: "#7C2D12", fontSize: 12, lineHeight: 1.6 }}>
                            <div style={{ fontWeight: 700, marginBottom: 6 }}>Filtered Brunello pairs</div>
                            {brunelloFilteredPairs.map((candidate) => (
                              <div key={candidate.id}>
                                {candidate.sourceIndexes[0]} + {candidate.sourceIndexes[1]}: {candidate.reason}
                              </div>
                            ))}
                          </div>
                        )}
                        {!brunelloLocalCandidates.length && !brunelloDeletionCandidates.length && hasSequenceBackedReference(selectedEntry.row) && (
                          <div style={{ marginTop: 14, padding: 10, borderRadius: 10, background: "#FFF7ED", border: "1px solid #FDBA74", color: "#7C2D12", fontSize: 12, lineHeight: 1.5 }}>
                            No same-exon local Brunello guide pairs within 40-140 bp were found after remapping onto your selected reference.
                          </div>
                        )}
                      </div>
                    )}
                    <div style={{ marginBottom: 16, padding: 12, borderRadius: 12, background: "#F8FAFC", border: "1px solid #D7DEE7" }}>
                      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: "#111827" }}>Cas-Database Reference Guides</div>
                      <div style={{ color: "#667085", fontSize: 13, lineHeight: 1.5, marginBottom: 10 }}>
                        Top 3 Cas-Database knockout reference guides using the default recommended filters. These load automatically for the selected KO design and can be applied into the local design above.
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end", marginBottom: 10 }}>
                        <label>
                          <div style={{ color: "#667085", fontSize: 12, marginBottom: 6 }}>Cas-Database organism</div>
                          <select value={casDbOrganismId} onChange={(event) => setCasDbOrganismId(event.target.value)} style={{ ...FIELD_STYLE, width: 240, background: "#ffffff", color: "#111827", borderColor: "#d7dee7" }}>
                            {CAS_DATABASE_ORGANISM_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                          </select>
                        </label>
                        <Badge>{selectedEntry.result.gene}</Badge>
                        {casDbLookup.status === "success" && casDbLookup.data?.tierLabel && <Badge color={COLORS.success}>{casDbLookup.data.tierLabel}</Badge>}
                      </div>
                      {casDbLookup.status === "loading" && (
                        <div style={{ marginBottom: 10, color: "#667085", fontSize: 13 }}>
                          Loading Cas-Database reference guides...
                        </div>
                      )}
                      {casDbLookup.status === "error" && (
                        <div style={{ marginBottom: 10, padding: 10, borderRadius: 10, background: "#FEF3F2", border: "1px solid #FECDCA", color: "#B42318", fontSize: 13 }}>
                          {casDbLookup.error}
                        </div>
                      )}
                      {casDbLookup.status === "success" && (
                        <>
                          <div style={{ color: "#475467", fontSize: 13, lineHeight: 1.5, marginBottom: 10 }}>
                            {casDbLookup.data.note}
                            {casDbLookup.data.matchedGene?.ensembl_id ? ` Gene match: ${casDbLookup.data.matchedGene.symbol} (${casDbLookup.data.matchedGene.ensembl_id}).` : ""}
                          </div>
                          {!casDbLookup.data.targets?.length && (
                            <div style={{ color: "#667085", fontSize: 13 }}>No reference guides were returned for the selected filter tiers.</div>
                          )}
                              {!!casDbLookup.data.targets?.length && (
                                <>
                              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <thead>
                                  <tr>{["Spacer", "PAM", "Location", "Strand", "Off-targets (0/1/2)", "OOF", "Coverage", "Best CDS %", "Use"].map((label) => <th key={label} style={{ padding: "8px 10px", border: "1px solid #D0D5DD", background: "#E2E8F0", color: "#111827", textAlign: "left", fontSize: 12 }}>{label}</th>)}</tr>
                                </thead>
                                <tbody>
                                  {casDbLookup.data.targets.map((target) => (
                                    <tr key={target.id}>
                                      <td style={{ padding: "8px 10px", border: "1px solid #D0D5DD", background: "#ffffff", fontFamily: "Consolas, monospace", fontSize: 12 }}>{target.spacer}</td>
                                      <td style={{ padding: "8px 10px", border: "1px solid #D0D5DD", background: "#ffffff", fontFamily: "Consolas, monospace", fontSize: 12 }}>{target.pam || "n/a"}</td>
                                      <td style={{ padding: "8px 10px", border: "1px solid #D0D5DD", background: "#ffffff", fontSize: 12 }}>{target.location || "n/a"}</td>
                                      <td style={{ padding: "8px 10px", border: "1px solid #D0D5DD", background: "#ffffff", fontSize: 12 }}>{target.strand || "n/a"}</td>
                                      <td style={{ padding: "8px 10px", border: "1px solid #D0D5DD", background: "#ffffff", fontSize: 12 }}>{target.offTargetCounts.join("/")}</td>
                                      <td style={{ padding: "8px 10px", border: "1px solid #D0D5DD", background: "#ffffff", fontSize: 12 }}>{target.oofScore.toFixed(2)}</td>
                                      <td style={{ padding: "8px 10px", border: "1px solid #D0D5DD", background: "#ffffff", fontSize: 12 }}>{target.coverage}</td>
                                      <td style={{ padding: "8px 10px", border: "1px solid #D0D5DD", background: "#ffffff", fontSize: 12 }}>{target.bestCdsPercentage === null ? "n/a" : `${target.bestCdsPercentage.toFixed(2)}%`}</td>
                                      <td style={{ padding: "8px 10px", border: "1px solid #D0D5DD", background: "#ffffff", fontSize: 12 }}>
                                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                          <button type="button" onClick={() => applyCasDatabaseGuideToSelectedKo(0, target)} style={{ ...FIELD_STYLE, width: "auto", padding: "6px 8px", background: "#ffffff", color: "#111827", borderColor: "#D0D5DD", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                                            Use as gRNA1
                                          </button>
                                          <button type="button" onClick={() => applyCasDatabaseGuideToSelectedKo(1, target)} style={{ ...FIELD_STYLE, width: "auto", padding: "6px 8px", background: "#ffffff", color: "#111827", borderColor: "#D0D5DD", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                                            Use as gRNA2
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {!!casDatabaseLocalCandidates.length && (
                                <div style={{ marginTop: 14 }}>
                                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: "#111827" }}>Local pair designs from the top 3 Cas-Database guides</div>
                                  <div style={{ color: "#667085", fontSize: 12, lineHeight: 1.5, marginBottom: 8 }}>
                                    These pairs are remapped onto your selected reference. Preferred same-exon pairs in the 40-140 bp window are listed first, and other local same-exon pairs are kept for manual review with recalculated primers.
                                  </div>
                                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                    <thead>
                                      <tr>{["Pair", "Exon", "Spacing", "Amplicon", "Primers", "Apply"].map((label) => <th key={label} style={{ padding: "8px 10px", border: "1px solid #D0D5DD", background: "#E2E8F0", color: "#111827", textAlign: "left", fontSize: 12 }}>{label}</th>)}</tr>
                                    </thead>
                                    <tbody>
                                      {casDatabaseLocalCandidates.map((candidate) => (
                                        <tr key={candidate.id}>
                                          <td style={{ padding: "8px 10px", border: "1px solid #D0D5DD", background: "#ffffff", fontSize: 12 }}>
                                            <div style={{ fontWeight: 700 }}>{candidate.sourceIndexes[0]} + {candidate.sourceIndexes[1]}</div>
                                            <div style={{ fontFamily: "Consolas, monospace", color: "#334155", fontSize: 11 }}>{candidate.result.gs?.[0]?.sp}</div>
                                            <div style={{ fontFamily: "Consolas, monospace", color: "#334155", fontSize: 11 }}>{candidate.result.gs?.[1]?.sp}</div>
                                          </td>
                                          <td style={{ padding: "8px 10px", border: "1px solid #D0D5DD", background: "#ffffff", fontSize: 12 }}>{candidate.exonLabel}</td>
                                          <td style={{ padding: "8px 10px", border: "1px solid #D0D5DD", background: "#ffffff", fontSize: 12 }}>
                                            {Number.isFinite(candidate.spacing) ? `${candidate.spacing} bp${candidate.candidateMode === "local" ? " (review)" : ""}` : "n/a"}
                                          </td>
                                          <td style={{ padding: "8px 10px", border: "1px solid #D0D5DD", background: "#ffffff", fontSize: 12 }}>{candidate.result.amp || "n/a"}</td>
                                          <td style={{ padding: "8px 10px", border: "1px solid #D0D5DD", background: "#ffffff", fontSize: 11, fontFamily: "Consolas, monospace" }}>
                                            <div>Fw: {candidate.result.ps?.[0]?.s || "n/a"}</div>
                                            <div>Rev: {candidate.result.ps?.[1]?.s || "n/a"}</div>
                                          </td>
                                          <td style={{ padding: "8px 10px", border: "1px solid #D0D5DD", background: "#ffffff", fontSize: 12 }}>
                                            <button type="button" onClick={() => applyKoGuidePairToSelected(candidate)} style={{ ...FIELD_STYLE, width: "auto", padding: "6px 8px", background: "#ffffff", color: "#111827", borderColor: "#D0D5DD", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                                              Use pair
                                            </button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                              {!!casDatabaseDeletionCandidates.length && (
                                <div style={{ marginTop: 14 }}>
                                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: "#111827" }}>Long-range deletion-screen pairs from the top 3 Cas-Database guides</div>
                                  <div style={{ color: "#667085", fontSize: 12, lineHeight: 1.5, marginBottom: 8 }}>
                                    These guide pairs are far apart on your selected reference, so the app designs flanking junction-PCR primers to amplify the deletion band and reports the expected deletion size.
                                  </div>
                                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                    <thead>
                                      <tr>{["Pair", "Exon location", "Deletion size", "Amplicon", "Primers", "Apply"].map((label) => <th key={label} style={{ padding: "8px 10px", border: "1px solid #D0D5DD", background: "#E2E8F0", color: "#111827", textAlign: "left", fontSize: 12 }}>{label}</th>)}</tr>
                                    </thead>
                                    <tbody>
                                      {casDatabaseDeletionCandidates.map((candidate) => (
                                        <tr key={candidate.id}>
                                          <td style={{ padding: "8px 10px", border: "1px solid #D0D5DD", background: "#ffffff", fontSize: 12 }}>
                                            <div style={{ fontWeight: 700 }}>{candidate.sourceIndexes[0]} + {candidate.sourceIndexes[1]}</div>
                                            <div style={{ fontFamily: "Consolas, monospace", color: "#334155", fontSize: 11 }}>{candidate.result.gs?.[0]?.sp}</div>
                                            <div style={{ fontFamily: "Consolas, monospace", color: "#334155", fontSize: 11 }}>{candidate.result.gs?.[1]?.sp}</div>
                                          </td>
                                          <td style={{ padding: "8px 10px", border: "1px solid #D0D5DD", background: "#ffffff", fontSize: 12 }}>{candidate.exonLabel}</td>
                                          <td style={{ padding: "8px 10px", border: "1px solid #D0D5DD", background: "#ffffff", fontSize: 12 }}>{Number.isFinite(candidate.deletionSize) ? `~${candidate.deletionSize} bp` : "n/a"}</td>
                                          <td style={{ padding: "8px 10px", border: "1px solid #D0D5DD", background: "#ffffff", fontSize: 12 }}>{candidate.result.amp || "n/a"}</td>
                                          <td style={{ padding: "8px 10px", border: "1px solid #D0D5DD", background: "#ffffff", fontSize: 11, fontFamily: "Consolas, monospace" }}>
                                            <div>Fw: {candidate.result.ps?.[0]?.s || "n/a"}</div>
                                            <div>Rev: {candidate.result.ps?.[1]?.s || "n/a"}</div>
                                          </td>
                                          <td style={{ padding: "8px 10px", border: "1px solid #D0D5DD", background: "#ffffff", fontSize: 12 }}>
                                            <button type="button" onClick={() => applyKoGuidePairToSelected(candidate)} style={{ ...FIELD_STYLE, width: "auto", padding: "6px 8px", background: "#ffffff", color: "#111827", borderColor: "#D0D5DD", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                                              Use pair
                                            </button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                              {!!casDatabaseCrossExonCandidates.length && (
                                <div style={{ marginTop: 14 }}>
                                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: "#111827" }}>Cross-exon review pairs from the top 3 Cas-Database guides</div>
                                  <div style={{ color: "#667085", fontSize: 12, lineHeight: 1.5, marginBottom: 8 }}>
                                    These pairs remap across different local exons. They are kept for manual review, with recalculated spacing and validation primers, but are not preferred default KO pairs.
                                  </div>
                                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                    <thead>
                                      <tr>{["Pair", "Exon location", "Spacing", "Amplicon", "Primers", "Apply"].map((label) => <th key={label} style={{ padding: "8px 10px", border: "1px solid #D0D5DD", background: "#E2E8F0", color: "#111827", textAlign: "left", fontSize: 12 }}>{label}</th>)}</tr>
                                    </thead>
                                    <tbody>
                                      {casDatabaseCrossExonCandidates.map((candidate) => (
                                        <tr key={candidate.id}>
                                          <td style={{ padding: "8px 10px", border: "1px solid #D0D5DD", background: "#ffffff", fontSize: 12 }}>
                                            <div style={{ fontWeight: 700 }}>{candidate.sourceIndexes[0]} + {candidate.sourceIndexes[1]}</div>
                                            <div style={{ fontFamily: "Consolas, monospace", color: "#334155", fontSize: 11 }}>{candidate.result.gs?.[0]?.sp}</div>
                                            <div style={{ fontFamily: "Consolas, monospace", color: "#334155", fontSize: 11 }}>{candidate.result.gs?.[1]?.sp}</div>
                                          </td>
                                          <td style={{ padding: "8px 10px", border: "1px solid #D0D5DD", background: "#ffffff", fontSize: 12 }}>{candidate.exonLabel}</td>
                                          <td style={{ padding: "8px 10px", border: "1px solid #D0D5DD", background: "#ffffff", fontSize: 12 }}>{Number.isFinite(candidate.spacing) ? `${candidate.spacing} bp (review)` : "n/a"}</td>
                                          <td style={{ padding: "8px 10px", border: "1px solid #D0D5DD", background: "#ffffff", fontSize: 12 }}>{candidate.result.amp || "n/a"}</td>
                                          <td style={{ padding: "8px 10px", border: "1px solid #D0D5DD", background: "#ffffff", fontSize: 11, fontFamily: "Consolas, monospace" }}>
                                            <div>Fw: {candidate.result.ps?.[0]?.s || "n/a"}</div>
                                            <div>Rev: {candidate.result.ps?.[1]?.s || "n/a"}</div>
                                          </td>
                                          <td style={{ padding: "8px 10px", border: "1px solid #D0D5DD", background: "#ffffff", fontSize: 12 }}>
                                            <button type="button" onClick={() => applyKoGuidePairToSelected(candidate)} style={{ ...FIELD_STYLE, width: "auto", padding: "6px 8px", background: "#ffffff", color: "#111827", borderColor: "#D0D5DD", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                                              Use pair
                                            </button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                              {!!casDatabaseFilteredPairs.length && (
                                <div style={{ marginTop: 14, padding: 10, borderRadius: 10, background: "#F8FAFC", border: "1px solid #D0D5DD", color: "#475467", fontSize: 12, lineHeight: 1.6 }}>
                                  <div style={{ fontWeight: 700, marginBottom: 6, color: "#111827" }}>Filtered Cas-Database pairs</div>
                                  {casDatabaseFilteredPairs.map((candidate) => (
                                    <div key={candidate.id}>
                                      {candidate.sourceIndexes[0]} + {candidate.sourceIndexes[1]}: {candidate.reason}
                                    </div>
                                  ))}
                                </div>
                              )}
                              {!casDatabaseLocalCandidates.length && !casDatabaseDeletionCandidates.length && hasSequenceBackedReference(selectedEntry.row) && (
                                <div style={{ marginTop: 14, padding: 10, borderRadius: 10, background: "#F8FAFC", border: "1px solid #D0D5DD", color: "#475467", fontSize: 12, lineHeight: 1.5 }}>
                                  No same-exon local Cas-Database guide pairs within 40-140 bp were found after remapping onto your selected reference.
                                </div>
                              )}
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </>
                )}
                {selectedEntry.result.type === "it" && (
                  <>
                    <InternalProteinPreviewCard result={selectedEntry.result} />
                    <InsertValidationCard validation={selectedEntry.result.insertValidation} />
                    {(selectedEntry.result.os || []).map((donor) => <InternalDonorPreview key={donor.n} donor={donor} />)}
                  </>
                )}
                {(selectedEntry.result.type === "ct" || selectedEntry.result.type === "nt") && (
                  <>
                    <KnockinProteinPreviewCard preview={selectedEntry.result.proteinPreview} />
                    <InsertValidationCard validation={selectedEntry.result.insertValidation} />
                    <AnnotatedDonor sequence={selectedEntry.result.donor} annotations={selectedEntry.result.donorAnnotations} />
                  </>
                )}
                {buildSsOdnNotes(selectedEntry.result).map((line) => <div key={line} style={{ color: "#CC0000", fontWeight: 700, marginTop: 6 }}>{line}</div>)}

                {hasHistoricalMatches && (
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

                <div style={{ fontSize: 18, fontWeight: 700, margin: "14px 0 8px 0" }}>{reviewSectionNumber}. Review Checkpoints</div>
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

                <div style={{ fontSize: 18, fontWeight: 700, margin: "14px 0 8px 0" }}>{additionalInfoSectionNumber}. Additional Info</div>
                <div style={{ fontSize: 13, color: "#333", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{buildDesignSummary(selectedEntry.result)}</div>
              </>
            )}
          </div>
        </div>

        <div style={{ ...CARD_STYLE, marginTop: 18 }}>
          <SectionTitle>3. Order Exports</SectionTitle>
          <div style={{ color: COLORS.muted, fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
            Successful designs are flattened into order-ready spreadsheet files for gRNAs, primers, and donors. The same export area works whether you designed one project or many.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <Badge color={COLORS.success}>{batchSuccessfulResults.length} successful designs</Badge>
            <Badge>{batchOrderRows.length} order lines</Badge>
            {batchCopyState && <Badge color={COLORS.success}>{batchCopyState}</Badge>}
          </div>
          {batchError && <div style={{ marginBottom: 12, padding: 12, borderRadius: 12, background: "rgba(251,113,133,0.10)", border: `1px solid ${COLORS.danger}55`, color: COLORS.danger }}>{batchError}</div>}

          {batchSuccessfulResults.length > 0 && (
            <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: "#f8fafc", color: "#333", border: "1px solid #d7dee7", overflowX: "auto" }}>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Spreadsheet Template Export</div>
              <div style={{ color: "#667085", fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
                These downloads match the headers in your current upload templates:
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
                    Download CRISPR template
                  </button>
                  <button type="button" disabled={!idtTemplateRows.oligo.length} onClick={() => downloadIdtTemplate("oligo")} style={{ ...FIELD_STYLE, width: "auto", cursor: idtTemplateRows.oligo.length ? "pointer" : "not-allowed", fontWeight: 700, background: "#ffffff", color: "#111827", borderColor: "#d7dee7" }}>
                    Download primer template
                  </button>
                  <button type="button" disabled={!idtTemplateRows.hdr.length} onClick={() => downloadIdtTemplate("hdr")} style={{ ...FIELD_STYLE, width: "auto", cursor: idtTemplateRows.hdr.length ? "pointer" : "not-allowed", fontWeight: 700, background: "#ffffff", color: "#111827", borderColor: "#d7dee7" }}>
                    Download HDR template
                  </button>
                </div>
              </div>

              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Combined Order Preview</div>
              <div style={{ color: "#667085", fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
                This is a review table only. The actual upload files are the separate spreadsheet template downloads above. For gRNAs, the exported sequence is the spacer without PAM. For SNP donors, the exported donor is the recommended order strand.
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

        <div style={{ color: COLORS.dim, fontSize: 12, marginTop: 18, textAlign: "center", lineHeight: 1.6 }}>
          <div>{APP_FOOTER_LABEL}</div>
          <div>Current host: {currentHost}</div>
        </div>
      </div>
    </div>
  );
}
