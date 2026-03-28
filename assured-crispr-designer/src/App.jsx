import { useCallback, useMemo, useState } from "react";
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
const BATCH_SIZE_OPTIONS = [8, 16];

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
    ["Target", meta.editSummary || formatDesignLabel(meta, result)],
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
  entries.forEach((entry) => {
    const fileKey = normalizeFileLookupKey(entry.fileName);
    const stemKey = normalizeFileLookupKey(entry.fileName.replace(/\.[^.]+$/, ""));
    if (fileKey && !byName.has(fileKey)) byName.set(fileKey, entry);
    if (stemKey && !byStem.has(stemKey)) byStem.set(stemKey, entry);
  });
  return { byName, byStem };
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

function normalizeGeneToken(value) {
  const upper = String(value || "").toUpperCase().trim();
  const withoutIds = upper.replace(/[-_\s]*(ENSG|NM_|NCBI)\S*/g, " ");
  const compact = withoutIds.replace(/[^A-Z0-9]+/g, " ").trim();
  return compact.split(/\s+/)[0] || "";
}

function normalizeCellLine(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function mapHistoricalClass(projectType) {
  if (projectType === "ct" || projectType === "nt") return "ki";
  return projectType || "other";
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
  const targetClass = mapHistoricalClass(result?.type || projectType);
  const currentGuides = new Set((result?.gs || []).map((guide) => guide.sp));
  const donorType = inferCurrentDonorType(result);

  const scored = HISTORICAL_PROJECTS.map((record) => {
    const recordGene = normalizeGeneToken(record.targetGene);
    const recordCellLine = normalizeCellLine(record.parentalLine);
    const sameGene = Boolean(targetGene && recordGene === targetGene);
    const sameCellLine = Boolean(targetCellLine && recordCellLine === targetCellLine);
    const sameClass = record.modificationClass === targetClass;
    const guideOverlap = (record.guides || []).filter((guide) => currentGuides.has(guide.sequence)).length;
    let score = 0;
    if (sameGene) score += 6;
    if (sameClass) score += 4;
    if (sameCellLine) score += 3;
    if (record.donorType === donorType) score += 1;
    score += guideOverlap * 5;
    return { ...record, sameGene, sameCellLine, sameClass, guideOverlap, score };
  }).filter((record) => record.score > 0);

  const matches = scored.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    if (right.guideOverlap !== left.guideOverlap) return right.guideOverlap - left.guideOverlap;
    return (left.projectId || "").localeCompare(right.projectId || "");
  });

  const sameGeneMatches = matches.filter((record) => record.sameGene);
  const sameGeneAndClass = matches.filter((record) => record.sameGene && record.sameClass);
  const sameGeneAndCell = matches.filter((record) => record.sameGene && record.sameCellLine);
  const sameClassAndCell = matches.filter((record) => record.sameClass && record.sameCellLine);
  const exactGuideReuse = matches.filter((record) => record.guideOverlap > 0);
  const recommendations = [];
  const recommendedGuides = [];
  const recommendedDonors = [];
  const seenGuideSequences = new Set();
  const seenDonorSequences = new Set();

  if (sameGeneAndCell.length) recommendations.push(`Found ${sameGeneAndCell.length} established project${sameGeneAndCell.length === 1 ? "" : "s"} for this gene in the same parental line.`);
  if (!sameGeneAndCell.length && sameGeneAndClass.length) recommendations.push(`Found ${sameGeneAndClass.length} established project${sameGeneAndClass.length === 1 ? "" : "s"} for this gene with the same edit class.`);
  if (!sameGeneAndClass.length && sameClassAndCell.length) recommendations.push(`No same-gene precedent was found, but ${sameClassAndCell.length} established project${sameClassAndCell.length === 1 ? "" : "s"} exist in the same parental line for this edit class.`);
  if (exactGuideReuse.length) recommendations.push(`Exact guide reuse appears in ${exactGuideReuse.length} established record${exactGuideReuse.length === 1 ? "" : "s"}; review those projects before ordering.`);
  if (result?.type === "pm" && sameGeneMatches.some((record) => record.donorType === "ssODN")) recommendations.push("Historical matches for this gene used ssODN donors, which supports the current SNP design strategy.");
  if ((result?.type === "ct" || result?.type === "nt") && !sameGeneAndClass.length) recommendations.push("No close KI precedent was found in the imported history; verify donor frame, junction PCR, and protein expression plan manually.");

  matches.forEach((record) => {
    if ((record.sameGene || record.sameCellLine || record.guideOverlap > 0) && recommendedGuides.length < 6) {
      (record.guides || []).forEach((guide) => {
        if (recommendedGuides.length >= 6) return;
        if (!guide.sequence || seenGuideSequences.has(guide.sequence)) return;
        seenGuideSequences.add(guide.sequence);
        recommendedGuides.push({
          name: guide.name || "Historical guide",
          sequence: guide.sequence,
          sourceProject: record.projectId,
          sourceLine: record.parentalLine || "n/a",
          matchLabel: record.guideOverlap > 0 ? "exact guide reuse" : record.sameGene && record.sameCellLine ? "same gene + same line" : record.sameGene ? "same gene" : "same line",
        });
      });
    }

    if ((record.sameGene || record.sameCellLine) && record.donorSequence && recommendedDonors.length < 3 && !seenDonorSequences.has(record.donorSequence)) {
      seenDonorSequences.add(record.donorSequence);
      recommendedDonors.push({
        name: record.donorName || "Historical donor",
        sequence: record.donorSequence,
        donorType: record.donorType || "donor",
        sourceProject: record.projectId,
        sourceLine: record.parentalLine || "n/a",
        matchLabel: record.sameGene && record.sameCellLine ? "same gene + same line" : record.sameGene ? "same gene" : "same line",
      });
    }
  });

  return {
    targetGene,
    targetClass,
    totalMatches: matches.length,
    topMatches: matches.slice(0, 6),
    recommendations: recommendations.slice(0, 4),
    recommendedGuides,
    recommendedDonors,
    stats: {
      sameGene: sameGeneMatches.length,
      sameGeneAndClass: sameGeneAndClass.length,
      sameGeneAndCell: sameGeneAndCell.length,
      sameClassAndCell: sameClassAndCell.length,
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

function buildHistoricalRowsHtml(matches) {
  if (!matches.length) {
    return `<p style="font-size:13px;line-height:1.45;">No comparable established projects were found in the imported internal history for the current gene, parental line, or edit class.</p>`;
  }
  const rows = matches.map((record) => [
    record.projectId,
    record.targetGene || "n/a",
    record.parentalLine || "n/a",
    record.establishedLine || "n/a",
    record.modificationType || "n/a",
    record.donorType || "n/a",
    record.guideOverlap ? `${record.guideOverlap} exact` : "none",
  ]);
  return `<table>${tableHtml([["Project", "Gene", "Parental line", "Established line", "Type", "Donor", "Guide overlap"]], true)}${tableHtml(rows)}</table>`;
}

function buildRecommendedSequencesHtml(historicalContext) {
  const guideRows = (historicalContext?.recommendedGuides || []).map((guide) => `
    <div style="margin:0 0 10px 0;padding:10px;border:1px solid #d7dee7;border-radius:10px;background:#f8fafc;">
      <div style="font-weight:700;color:#1f2937;margin-bottom:4px;">${guide.name}</div>
      <div style="font-size:12px;color:#667085;margin-bottom:6px;">${guide.matchLabel} | ${guide.sourceProject} | ${guide.sourceLine}</div>
      <div style="font-family:Consolas,monospace;font-size:12px;word-break:break-all;">${guide.sequence}</div>
    </div>
  `).join("");
  const donorRows = (historicalContext?.recommendedDonors || []).map((donor) => `
    <div style="margin:0 0 10px 0;padding:10px;border:1px solid #d7dee7;border-radius:10px;background:#f8fafc;">
      <div style="font-weight:700;color:#1f2937;margin-bottom:4px;">${donor.name} (${donor.donorType})</div>
      <div style="font-size:12px;color:#667085;margin-bottom:6px;">${donor.matchLabel} | ${donor.sourceProject} | ${donor.sourceLine}</div>
      <div style="font-family:Consolas,monospace;font-size:12px;word-break:break-all;">${donor.sequence}</div>
    </div>
  `).join("");

  if (!guideRows && !donorRows) {
    return `<p style="font-size:13px;line-height:1.45;">No historical sequences met the recommendation threshold for this design.</p>`;
  }

  return `
    ${guideRows ? `<h3 style="color:#2E75B6;margin:14px 0 8px 0;">Recommended historical gRNAs</h3>${guideRows}` : ""}
    ${donorRows ? `<h3 style="color:#2E75B6;margin:14px 0 8px 0;">Recommended historical donors</h3>${donorRows}` : ""}
  `;
}

function buildReviewListHtml(items) {
  if (!items.length) return "<p style=\"font-size:13px;line-height:1.45;\">No automated warnings were triggered. Manual review is still required before synthesis or ordering.</p>";
  return `<ul style="padding-left:18px;">${items.map((item) => `<li style="margin:0 0 8px 0;color:${item.level === "warning" ? "#B42318" : "#344054"};"><strong>${item.level === "warning" ? "Warning" : "Check"}:</strong> ${item.text}</li>`).join("")}</ul>`;
}

function buildReportHtml(meta, result, fileName, historicalContext, reviewItems) {
  if (!result) return "";
  const headerRows = [
    ["Group", meta.clientName || "n/a"],
    ["IRIS ID", meta.irisId || "[to be assigned]"],
    ["Mutation / edit", meta.editSummary || formatDesignLabel(meta, result)],
    ["Cell line", meta.cellLine || "n/a"],
  ];
  const geneRows = buildGeneInfoRows(meta, result, fileName);
  const guideRows = (result?.gs || []).map((guide) => [guide.n, renderGuideSequence(guide.sp, guide.pm, true), `${guide.str} strand`, `${guide.gc}%`, guide.arm || guide.note || ""]);
  const primerRows = buildPrimerRows(result);
  const ssOdnNotes = buildSsOdnNotes(result);
  const sectionTitle = result.type === "pm" ? "ssODN Donor Templates" : result.type === "ko" ? "Knockout Design" : "Donor Design";
  const donorBlock = result.type === "pm"
    ? (result.os || []).map((donor) => buildPmDonorHtml(donor)).join("")
    : result.type === "ko"
      ? `<p style="font-size:13px;line-height:1.45;">No donor is required for knockout design. Use the paired gRNAs below for deletion/NHEJ-based disruption.</p>`
      : buildAnnotatedDonorHtml(result.donor || "", result.donorAnnotations || []);
  const historicalSummary = historicalContext?.recommendations?.length
    ? `<ul style="padding-left:18px;">${historicalContext.recommendations.map((line) => `<li style="margin:0 0 8px 0;">${line}</li>`).join("")}</ul>`
    : `<p style="font-size:13px;line-height:1.45;">Historical context is limited for this design. Treat the output as a fresh design and plan additional validation accordingly.</p>`;

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
  <h2>5. Historical References</h2>
  <p class="sub">Imported established-project dataset: ${HISTORICAL_PROJECTS_SUMMARY.recordCount} records from ${HISTORICAL_PROJECTS_SUMMARY.sheet}.</p>
  ${historicalSummary}
  ${buildHistoricalRowsHtml(historicalContext?.topMatches || [])}
  <h2>6. Recommended Historical Sequences</h2>
  <p class="sub">These sequences are suggested from matched established projects and should be treated as references, not automatic replacements for the current design.</p>
  ${buildRecommendedSequencesHtml(historicalContext)}
  <h2>7. Review Checkpoints</h2>
  ${buildReviewListHtml(reviewItems)}
  <h2>8. Additional Info</h2>
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
  const [batchSize, setBatchSize] = useState(8);
  const [batchRows, setBatchRows] = useState(() => resizeBatchRows([], 8));
  const [batchResults, setBatchResults] = useState([]);
  const [batchError, setBatchError] = useState("");
  const [batchCopyState, setBatchCopyState] = useState("");
  const [batchFolderEntries, setBatchFolderEntries] = useState([]);
  const [batchDefinitionText, setBatchDefinitionText] = useState("");
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
  const historicalContext = useMemo(() => buildHistoricalContext(meta, result, projectType), [meta, result, projectType]);
  const reviewItems = useMemo(() => buildReviewItems(meta, result, fileName), [meta, result, fileName]);
  const reportHtml = useMemo(() => buildReportHtml(meta, result, fileName, historicalContext, reviewItems), [meta, result, fileName, historicalContext, reviewItems]);
  const batchSuccessfulResults = useMemo(() => batchResults.filter((entry) => entry.status === "success"), [batchResults]);
  const batchOrderRows = useMemo(() => buildBatchOrderRows(batchSuccessfulResults), [batchSuccessfulResults]);
  const batchFolderLibrary = useMemo(() => buildFolderLibrary(batchFolderEntries), [batchFolderEntries]);

  const updateMeta = (key, value) => setMeta((current) => ({ ...current, [key]: value }));
  const updateBatchRow = (index, key, value) => setBatchRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)));

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

  const onBatchFile = useCallback((index, event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const content = readerEvent.target?.result || "";
      setBatchRows((current) => current.map((row, rowIndex) => (rowIndex === index ? {
        ...row,
        gbRaw: content,
        fileName: file.name,
        label: row.label || file.name.replace(/\.[^.]+$/, ""),
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

  const run = () => {
    setError("");
    setResult(null);
    setCopyState("");
    try {
      const design = runDesign(projectType, gbRaw, mutation, tag, homologyArm);
      if (design.err) {
        setError(design.err);
        setDebug(design.dbg || "");
        return;
      }
      setDebug(design.dbg || "");
      setResult(design);
    } catch (runError) {
      setError(runError?.message || "Design generation failed unexpectedly.");
      setDebug("");
    }
  };

  const runBatch = () => {
    setBatchError("");
    setBatchResults([]);
    setBatchCopyState("");
    const activeRows = batchRows.filter((row) => row.gbRaw);
    if (!activeRows.length) {
      setBatchError("Upload at least one GenBank file in the batch table.");
      return;
    }
    const nextResults = batchRows.map((row, index) => {
      const slot = index + 1;
      if (!row.gbRaw) return { slot, row, status: "empty" };
      try {
        const design = runDesign(row.projectType, row.gbRaw, row.mutation, row.tag, row.homologyArm);
        if (design.err) return { slot, row, status: "error", error: design.err, debug: design.dbg || "" };
        return { slot, row, status: "success", result: design, debug: design.dbg || "" };
      } catch (runError) {
        return { slot, row, status: "error", error: runError?.message || "Design generation failed unexpectedly.", debug: "" };
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

      const targetSize = Math.max(batchSize, mappedRows.length);
      setBatchSize(targetSize);
      setBatchRows(resizeBatchRows(mappedRows, targetSize));
    } catch (definitionError) {
      setBatchError(definitionError?.message || "Failed to apply batch definitions.");
    }
  };

  const copyText = async (value, label) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState(`${label} copied.`);
    } catch (copyError) {
      setCopyState(`Copy failed: ${copyError.message}`);
    }
  };

  const copyBatchOrderSheet = async () => {
    if (!batchOrderRows.length) return;
    try {
      await navigator.clipboard.writeText(buildBatchOrderDelimited(batchOrderRows, "\t"));
      setBatchCopyState("Batch order sheet copied as tab-delimited text.");
    } catch (copyError) {
      setBatchCopyState(`Copy failed: ${copyError.message}`);
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

  const downloadBatchOrderSheet = () => {
    if (!batchOrderRows.length) return;
    const blob = new Blob([buildBatchOrderDelimited(batchOrderRows)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `idt_batch_order_${batchSuccessfulResults.length}_designs.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setBatchCopyState("Batch order sheet downloaded.");
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
          <SectionTitle>3. Historical References</SectionTitle>
          <div style={{ color: COLORS.muted, fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
            Imported from your established-project workbook. This panel is advisory only and is meant to show precedent, guide reuse, and how much same-gene or same-cell-line support exists before the design is finalized.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            <Badge color={COLORS.success}>{HISTORICAL_PROJECTS_SUMMARY.recordCount} imported projects</Badge>
            <Badge color={COLORS.accentAlt}>{historicalContext.stats.sameGene} same-gene matches</Badge>
            <Badge color={COLORS.accent}>{historicalContext.stats.sameGeneAndCell} same-gene same-line</Badge>
            <Badge color={COLORS.success}>{historicalContext.stats.exactGuideReuse} exact guide reuses</Badge>
          </div>
          {!result && <div style={{ color: COLORS.muted, fontSize: 13 }}>Run a design to compare it against the imported established projects.</div>}
          {result && (
            <Grid>
              <div style={{ ...CARD_STYLE, background: COLORS.panelAlt, padding: 14 }}>
                <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 10 }}>Recommendations</div>
                {historicalContext.recommendations.length ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    {historicalContext.recommendations.map((line) => (
                      <div key={line} style={{ padding: 10, borderRadius: 12, border: `1px solid ${COLORS.border}`, background: COLORS.panel }}>
                        {line}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: COLORS.muted, fontSize: 13, lineHeight: 1.5 }}>No close precedent was found for this exact combination. Treat the design as novel and review all ordering assumptions manually.</div>
                )}
              </div>
              <div style={{ ...CARD_STYLE, background: COLORS.panelAlt, padding: 14 }}>
                <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 10 }}>Top established matches</div>
                {!historicalContext.topMatches.length && <div style={{ color: COLORS.muted, fontSize: 13 }}>No comparable records found.</div>}
                {historicalContext.topMatches.length > 0 && (
                  <div style={{ display: "grid", gap: 8 }}>
                    {historicalContext.topMatches.map((record) => (
                      <div key={record.projectId} style={{ padding: 10, borderRadius: 12, border: `1px solid ${COLORS.border}`, background: COLORS.panel }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", marginBottom: 6 }}>
                          <div style={{ fontWeight: 700 }}>{record.projectId}</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {record.sameGene && <Badge color={COLORS.success}>same gene</Badge>}
                            {record.sameCellLine && <Badge color={COLORS.accent}>same line</Badge>}
                            {record.sameClass && <Badge color={COLORS.accentAlt}>same class</Badge>}
                            {record.guideOverlap > 0 && <Badge color={COLORS.success}>{record.guideOverlap} guide overlap</Badge>}
                          </div>
                        </div>
                        <div style={{ color: COLORS.muted, fontSize: 12, lineHeight: 1.6 }}>
                          {record.targetGene || "n/a"} | {record.modificationType || "n/a"} | parent {record.parentalLine || "n/a"} | established {record.establishedLine || "n/a"}
                        </div>
                        <div style={{ color: COLORS.muted, fontSize: 12, lineHeight: 1.6 }}>
                          Donor: {record.donorType || "n/a"}{record.registrationDate ? ` | registered ${record.registrationDate}` : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Grid>
          )}
          {result && (historicalContext.recommendedGuides.length > 0 || historicalContext.recommendedDonors.length > 0) && (
            <div style={{ ...CARD_STYLE, marginTop: 12, background: COLORS.panelAlt, padding: 14 }}>
              <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 10 }}>Recommended historical sequences</div>
              <div style={{ color: COLORS.muted, fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
                These are pulled from matched established projects. Use them as reference candidates, not as automatic replacements for the current design.
              </div>
              {historicalContext.recommendedGuides.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 8 }}>Historical gRNAs</div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {historicalContext.recommendedGuides.map((guide) => (
                      <div key={`${guide.sourceProject}-${guide.sequence}`} style={{ padding: 10, borderRadius: 12, border: `1px solid ${COLORS.border}`, background: COLORS.panel }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", marginBottom: 4 }}>
                          <div style={{ fontWeight: 700 }}>{guide.name}</div>
                          <Badge color={COLORS.success}>{guide.matchLabel}</Badge>
                        </div>
                        <div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>{guide.sourceProject} | {guide.sourceLine}</div>
                        <div style={{ fontFamily: "Consolas, monospace", fontSize: 12, wordBreak: "break-all" }}>{guide.sequence}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {historicalContext.recommendedDonors.length > 0 && (
                <div>
                  <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 8 }}>Historical donors</div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {historicalContext.recommendedDonors.map((donor) => (
                      <div key={`${donor.sourceProject}-${donor.sequence}`} style={{ padding: 10, borderRadius: 12, border: `1px solid ${COLORS.border}`, background: COLORS.panel }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", marginBottom: 4 }}>
                          <div style={{ fontWeight: 700 }}>{donor.name} ({donor.donorType})</div>
                          <Badge color={COLORS.accentAlt}>{donor.matchLabel}</Badge>
                        </div>
                        <div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>{donor.sourceProject} | {donor.sourceLine}</div>
                        <div style={{ fontFamily: "Consolas, monospace", fontSize: 12, wordBreak: "break-all" }}>{donor.sequence}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ ...CARD_STYLE, marginTop: 18 }}>
          <SectionTitle>4. Final Report</SectionTitle>
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
                    {(result?.gs || []).map((guide, rowIndex) => (
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
                    {buildPrimerRows(result).map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`} style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff", fontFamily: cellIndex === 1 ? "Consolas, monospace" : "inherit" }}>{cell}</td>)}</tr>)}
                  </tbody>
                </table>
                <div style={{ color: "#555", fontSize: 13, marginBottom: 16 }}>Expected amplicon: {result.amp || "n/a"}</div>

                <div style={{ fontSize: 18, fontWeight: 700, margin: "14px 0 8px 0" }}>4. {result.type === "pm" ? "ssODN Donor Templates" : result.type === "ko" ? "Knockout Design" : "Donor Design"}</div>
                {result.type === "pm" && (result.os || []).map((donor) => <PmDonorPreview key={donor.n} donor={donor} />)}
                {result.type === "ko" && (
                  <div style={{ color: "#555", fontSize: 13, lineHeight: 1.5 }}>
                    No donor is required for knockout design. Use the paired gRNAs above for deletion/NHEJ-based disruption.
                  </div>
                )}
                {(result.type === "ct" || result.type === "nt") && <AnnotatedDonor sequence={result.donor} annotations={result.donorAnnotations} />}
                {buildSsOdnNotes(result).map((line) => <div key={line} style={{ color: "#CC0000", fontWeight: 700, marginTop: 6 }}>{line}</div>)}

                <div style={{ fontSize: 18, fontWeight: 700, margin: "14px 0 8px 0" }}>5. Historical References</div>
                <div style={{ color: "#555", fontSize: 13, marginBottom: 12 }}>
                  Imported established-project dataset: {HISTORICAL_PROJECTS_SUMMARY.recordCount} records from {HISTORICAL_PROJECTS_SUMMARY.sheet}.
                </div>
                {historicalContext.recommendations.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    {historicalContext.recommendations.map((line) => (
                      <div key={line} style={{ marginBottom: 6, color: "#333", fontSize: 13, lineHeight: 1.5 }}>
                        - {line}
                      </div>
                    ))}
                  </div>
                )}
                {!historicalContext.topMatches.length && (
                  <div style={{ color: "#555", fontSize: 13, marginBottom: 16 }}>
                    No comparable established projects were found in the imported history.
                  </div>
                )}
                {historicalContext.topMatches.length > 0 && (
                  <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
                    <thead>
                      <tr>{["Project", "Gene", "Parental line", "Established line", "Type", "Donor", "Guide overlap"].map((label) => <th key={label} style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#2E75B6", color: "#ffffff", textAlign: "left" }}>{label}</th>)}</tr>
                    </thead>
                    <tbody>
                      {historicalContext.topMatches.map((record) => (
                        <tr key={record.projectId}>
                          <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff" }}>{record.projectId}</td>
                          <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff" }}>{record.targetGene || "n/a"}</td>
                          <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff" }}>{record.parentalLine || "n/a"}</td>
                          <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff" }}>{record.establishedLine || "n/a"}</td>
                          <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff" }}>{record.modificationType || "n/a"}</td>
                          <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff" }}>{record.donorType || "n/a"}</td>
                          <td style={{ padding: "8px 10px", border: "1px solid #bbbbbb", background: "#ffffff" }}>{record.guideOverlap ? `${record.guideOverlap} exact` : "none"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <div style={{ fontSize: 18, fontWeight: 700, margin: "14px 0 8px 0" }}>6. Recommended Historical Sequences</div>
                {!historicalContext.recommendedGuides.length && !historicalContext.recommendedDonors.length && (
                  <div style={{ color: "#555", fontSize: 13, marginBottom: 16 }}>
                    No historical sequences met the recommendation threshold for this design.
                  </div>
                )}
                {historicalContext.recommendedGuides.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ color: "#1f2937", fontWeight: 700, marginBottom: 8 }}>Recommended historical gRNAs</div>
                    {historicalContext.recommendedGuides.map((guide) => (
                      <div key={`${guide.sourceProject}-${guide.sequence}`} style={{ padding: 10, border: "1px solid #d7dee7", borderRadius: 10, background: "#f8fafc", marginBottom: 8 }}>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>{guide.name}</div>
                        <div style={{ color: "#667085", fontSize: 12, marginBottom: 6 }}>{guide.matchLabel} | {guide.sourceProject} | {guide.sourceLine}</div>
                        <div style={{ fontFamily: "Consolas, monospace", fontSize: 12, wordBreak: "break-all" }}>{guide.sequence}</div>
                      </div>
                    ))}
                  </div>
                )}
                {historicalContext.recommendedDonors.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ color: "#1f2937", fontWeight: 700, marginBottom: 8 }}>Recommended historical donors</div>
                    {historicalContext.recommendedDonors.map((donor) => (
                      <div key={`${donor.sourceProject}-${donor.sequence}`} style={{ padding: 10, border: "1px solid #d7dee7", borderRadius: 10, background: "#f8fafc", marginBottom: 8 }}>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>{donor.name} ({donor.donorType})</div>
                        <div style={{ color: "#667085", fontSize: 12, marginBottom: 6 }}>{donor.matchLabel} | {donor.sourceProject} | {donor.sourceLine}</div>
                        <div style={{ fontFamily: "Consolas, monospace", fontSize: 12, wordBreak: "break-all" }}>{donor.sequence}</div>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ fontSize: 18, fontWeight: 700, margin: "14px 0 8px 0" }}>7. Review Checkpoints</div>
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

                <div style={{ fontSize: 18, fontWeight: 700, margin: "14px 0 8px 0" }}>8. Additional Info</div>
                <div style={{ fontSize: 13, color: "#333", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{buildDesignSummary(result)}</div>
              </>
            )}
          </div>
        </div>

        <div style={{ ...CARD_STYLE, marginTop: 18 }}>
          <SectionTitle>5. Batch Transfection Set</SectionTitle>
          <div style={{ color: COLORS.muted, fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
            Generate multiple designs in one pass for a transfection batch. Blank slots are ignored. Successful designs are flattened into an Excel-friendly order sheet with gRNAs, donors, and primers for IDT submission.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {BATCH_SIZE_OPTIONS.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => {
                  setBatchSize(size);
                  setBatchRows((current) => resizeBatchRows(current, size));
                  setBatchResults([]);
                  setBatchError("");
                  setBatchCopyState("");
                }}
                style={{
                  ...FIELD_STYLE,
                  width: "auto",
                  cursor: "pointer",
                  fontWeight: 700,
                  borderColor: batchSize === size ? COLORS.accent : COLORS.border,
                  background: batchSize === size ? "rgba(45,212,191,0.10)" : COLORS.panelAlt,
                }}
              >
                {size} designs
              </button>
            ))}
            <Badge color={COLORS.success}>{batchRows.filter((row) => row.gbRaw).length} loaded</Badge>
            <Badge color={COLORS.accentAlt}>{batchSuccessfulResults.length} successful</Badge>
            <Badge>{batchOrderRows.length} order lines</Badge>
            <Badge color={COLORS.accent}>{batchFolderEntries.length} folder files</Badge>
          </div>

          <div style={{ ...CARD_STYLE, background: COLORS.panelAlt, padding: 14, marginBottom: 14 }}>
            <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 8 }}>Alternative: upload a folder and paste definitions</div>
            <div style={{ color: COLORS.muted, fontSize: 13, marginBottom: 10, lineHeight: 1.5 }}>
              Use this when you already have a folder of GenBank files and want to define the requested modifications in one list instead of filling each slot manually.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
              <label style={{ ...FIELD_STYLE, width: "auto", display: "inline-flex", alignItems: "center", gap: 10, cursor: "pointer", fontWeight: 700 }}>
                <span style={{ color: COLORS.accent }}>Upload GenBank folder</span>
                <input type="file" accept=".gb,.gbk,.genbank,.txt" multiple webkitdirectory="" directory="" onChange={onBatchFolder} style={{ display: "none" }} />
              </label>
              <button type="button" onClick={applyBatchDefinitions} disabled={!batchDefinitionText.trim() || !batchFolderEntries.length} style={{ ...FIELD_STYLE, width: "auto", cursor: batchDefinitionText.trim() && batchFolderEntries.length ? "pointer" : "not-allowed", fontWeight: 700 }}>
                Apply folder definitions
              </button>
            </div>
            <label style={{ display: "block" }}>
              <div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Definition list</div>
              <textarea
                value={batchDefinitionText}
                onChange={(event) => setBatchDefinitionText(event.target.value)}
                style={{ ...FIELD_STYLE, minHeight: 126, resize: "vertical", fontFamily: 'Consolas, "Courier New", monospace' }}
                placeholder={"file,design_type,modification_or_cassette,homology_arm,label\npsen1.gb,pm,N32R,,PSEN1 N32R\nmapt.gb,ko,,,\napp.gb,ct,SD40-2xHA,500,APP C-term KI\nsnca.gb,nt,N:EGFP-Linker,250,SNCA N-term EGFP"}
              />
            </label>
            <div style={{ color: COLORS.dim, fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>
              Columns: `file`, `design_type`, `modification_or_cassette`, `homology_arm`, `label`. Use the file name or the file stem in the first column. For `pm`, enter a mutation like `N32R`. For `ct` or `nt`, enter the cassette name. `ko` can leave modification blank.
            </div>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            {batchRows.map((row, index) => {
              const slot = index + 1;
              const batchStatus = batchResults.find((entry) => entry.slot === slot);
              return (
                <div key={row.id} style={{ padding: 14, borderRadius: 14, border: `1px solid ${COLORS.border}`, background: COLORS.panelAlt }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 700 }}>Design {slot}</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {row.fileName && <Badge color={COLORS.success}>{row.fileName}</Badge>}
                      {batchStatus?.status === "success" && <Badge color={COLORS.success}>{formatBatchDesignLabel({ ...row, slot }, batchStatus.result)}</Badge>}
                      {batchStatus?.status === "error" && <Badge color={COLORS.danger}>Error</Badge>}
                    </div>
                  </div>

                  <Grid>
                    <label>
                      <div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Batch label</div>
                      <input value={row.label} onChange={(event) => updateBatchRow(index, "label", event.target.value)} style={FIELD_STYLE} placeholder={`Transfection ${slot}`} />
                    </label>
                    <label>
                      <div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Design type</div>
                      <select value={row.projectType} onChange={(event) => updateBatchRow(index, "projectType", event.target.value)} style={FIELD_STYLE}>
                        {PROJECT_TYPES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                      </select>
                    </label>
                    <label>
                      <div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Reference GenBank</div>
                      <label style={{ ...FIELD_STYLE, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                        <span style={{ color: row.fileName ? COLORS.success : COLORS.muted }}>{row.fileName || "Upload .gb / .gbk / .genbank"}</span>
                        <span style={{ color: COLORS.accent, fontWeight: 700 }}>Browse</span>
                        <input type="file" accept=".gb,.gbk,.genbank,.txt" onChange={(event) => onBatchFile(index, event)} style={{ display: "none" }} />
                      </label>
                    </label>
                    {row.projectType === "pm" ? (
                      <label>
                        <div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Mutation</div>
                        <input value={row.mutation} onChange={(event) => updateBatchRow(index, "mutation", event.target.value)} style={FIELD_STYLE} placeholder="N32R" />
                      </label>
                    ) : (
                      <>
                        {(row.projectType === "ct" || row.projectType === "nt") && (
                          <>
                            <label>
                              <div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Cassette</div>
                              <select value={row.tag} onChange={(event) => updateBatchRow(index, "tag", event.target.value)} style={FIELD_STYLE}>
                                {cassetteOptions.map((option) => <option key={option} value={option}>{option} ({CASSETTES[option].len} bp)</option>)}
                              </select>
                            </label>
                            <label>
                              <div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>Homology arm</div>
                              <select value={row.homologyArm} onChange={(event) => updateBatchRow(index, "homologyArm", event.target.value)} style={FIELD_STYLE}>
                                <option value="250">250 bp</option>
                                <option value="500">500 bp</option>
                                <option value="750">750 bp</option>
                              </select>
                            </label>
                          </>
                        )}
                        {row.projectType === "ko" && (
                          <div style={{ display: "flex", alignItems: "center", color: COLORS.muted, fontSize: 12 }}>
                            KO uses the uploaded GenBank only. No mutation or donor cassette entry is needed.
                          </div>
                        )}
                      </>
                    )}
                  </Grid>

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
              Generate batch designs
            </button>
            <button type="button" disabled={!batchOrderRows.length} onClick={downloadBatchOrderSheet} style={{ ...FIELD_STYLE, width: "auto", cursor: batchOrderRows.length ? "pointer" : "not-allowed", fontWeight: 700 }}>
              Download IDT order sheet CSV
            </button>
            <button type="button" disabled={!batchOrderRows.length} onClick={copyBatchOrderSheet} style={{ ...FIELD_STYLE, width: "auto", cursor: batchOrderRows.length ? "pointer" : "not-allowed", fontWeight: 700 }}>
              Copy order sheet
            </button>
            {batchCopyState && <Badge color={COLORS.success}>{batchCopyState}</Badge>}
          </div>
          {batchError && <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "rgba(251,113,133,0.10)", border: `1px solid ${COLORS.danger}55`, color: COLORS.danger }}>{batchError}</div>}

          {batchSuccessfulResults.length > 0 && (
            <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: "#f8fafc", color: "#333", border: "1px solid #d7dee7", overflowX: "auto" }}>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Order Sheet Preview</div>
              <div style={{ color: "#667085", fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
                `Sequence To Order` is the field intended for Excel/IDT submission. For gRNAs, the spacer is exported without PAM. For SNP donors, the exported donor is the recommended order strand.
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
