export const FULL_PROJECT_TYPES = [
  { id: "pm", label: "Point mutation", short: "SNP / amino-acid change" },
  { id: "ko", label: "Knockout", short: "Frameshift knockout" },
  { id: "it", label: "Internal in-frame tag", short: "ssODN insert within CDS" },
  { id: "ct", label: "C-terminal tag / reporter", short: "HDR insert at stop" },
  { id: "nt", label: "N-terminal tag / reporter", short: "HDR insert at ATG" },
];

export const COMMUNITY_PROJECT_TYPES = [
  { id: "pm", label: "SNP knock-in", short: "Point mutation / allele edit" },
  { id: "ko", label: "Knockout", short: "Frameshift knockout" },
];

const FULL_SAMPLE_REQUEST_TEXT = [
  "PSEN1 N32R BIHi005-A",
  "ECSIT knockout BIHi005-A",
  "SCN5A internal SPOT after P155 BIHi005-A",
  "INS C-terminal SD40-2xHA BIHi005-A",
  "SORCS1 N-terminal N:EGFP-Linker BIHi005-A",
].join("\n");

const COMMUNITY_SAMPLE_REQUEST_TEXT = [
  "PSEN1 N32R SNP knockin BIHi005-A",
  "APOE R176C SNP knockin BIHi005-A",
  "ECSIT knockout BIHi005-A",
  "SORCS1 knockout BIHi005-A",
].join("\n");

export const APP_EDITION = import.meta.env.VITE_APP_EDITION === "community" ? "community" : "full";
export const IS_COMMUNITY_EDITION = APP_EDITION === "community";

const FULL_CONFIG = {
  key: "full",
  appName: "ASSURED CRISPR Designer",
  browserTitle: "ASSURED CRISPR Designer",
  metaDescription: "ASSURED CRISPR Designer helps scientists generate CRISPR edit designs, review donor architecture, and export ordering-ready reports.",
  socialDescription: "Generate CRISPR edit designs and export ordering-ready reports from a hosted browser app.",
  heroHeadline: "Genome editing design, donor review, and ordering exports in one clean workspace.",
  heroDescription: "Built for knockouts, SNP knock-ins, internal in-frame tags, and terminal reporters. Start from a request, a GenBank file, or raw sequence, then move directly into a scientist-readable report and export package.",
  heroBadges: ["Knockout, SNP, internal, N-term, C-term", "Annotated donor and protein views", "Spreadsheet-ready exports"],
  valueBlurb: "One place for guides, donor geometry, protein impact, QC checkpoints, and export files.",
  emptyFolderNotice: "No GenBank folder loaded yet. KO can still start from gene name alone, but sequence-backed designs benefit from a GenBank file or raw DNA.",
  designDetailsHint: "Capture the requested edit, reporter, or tag configuration for this row.",
  quickStartCopy: "Quick start: upload a GenBank folder, click Load sample requests, then click Generate designs.",
  sampleRequestText: FULL_SAMPLE_REQUEST_TEXT,
  projectTypes: FULL_PROJECT_TYPES,
  defaultTag: "dTAG-V5",
  unsupportedMessage: "",
  footerLabel: "Hosted build • 31 Mar 2026",
  batchTypeHelp: "pm, ko, it, ct, or nt",
};

const COMMUNITY_CONFIG = {
  key: "community",
  appName: "ASSURED CRISPR Community Edition",
  browserTitle: "ASSURED CRISPR Community Edition",
  metaDescription: "ASSURED CRISPR Community Edition helps scientists generate knockout and SNP knock-in designs, review primer QC, and export ordering-ready reports.",
  socialDescription: "Generate knockout and SNP knock-in designs and export ordering-ready reports from a hosted browser app.",
  heroHeadline: "Community-ready CRISPR design for knockout and SNP knock-in projects.",
  heroDescription: "Built for sequence-backed SNP edits, knockout programs, and validation primer review. Start from a request, a GenBank file, or raw sequence, then move directly into a scientist-readable report and ordering package.",
  heroBadges: ["Knockout and SNP only", "Primer QC and validation views", "Spreadsheet-ready exports"],
  valueBlurb: "One place for guides, donor geometry, primer QC checkpoints, and export files for the two most common community use cases.",
  emptyFolderNotice: "No GenBank folder loaded yet. KO can still start from gene name alone, but SNP projects need a GenBank file or raw DNA reference.",
  designDetailsHint: "Capture the requested knockout or SNP edit for this row.",
  quickStartCopy: "Quick start: upload a GenBank folder, click Load sample requests, then click Generate designs for KO or SNP projects.",
  sampleRequestText: COMMUNITY_SAMPLE_REQUEST_TEXT,
  projectTypes: COMMUNITY_PROJECT_TYPES,
  defaultTag: "",
  unsupportedMessage: "Community edition supports knockout or SNP knock-in only.",
  footerLabel: "Community build • 15 Apr 2026",
  batchTypeHelp: "pm or ko",
};

export const EDITION_CONFIG = IS_COMMUNITY_EDITION ? COMMUNITY_CONFIG : FULL_CONFIG;

export function isProjectTypeEnabled(projectType) {
  return EDITION_CONFIG.projectTypes.some((entry) => entry.id === projectType);
}

export function getEditionUnsupportedIssue(text, cassetteKey = "") {
  if (!IS_COMMUNITY_EDITION) return "";
  const lower = String(text || "").toLowerCase();
  if (/\b(internal|in-frame|inframe)\b/.test(lower)) return COMMUNITY_CONFIG.unsupportedMessage;
  if (/\b(c[\s-]?(?:term(?:inal|inus)?)|ct)\b/.test(lower)) return COMMUNITY_CONFIG.unsupportedMessage;
  if (/\b(n[\s-]?(?:term(?:inal|inus)?)|nt)\b/.test(lower)) return COMMUNITY_CONFIG.unsupportedMessage;
  if (cassetteKey) return COMMUNITY_CONFIG.unsupportedMessage;
  return "";
}
