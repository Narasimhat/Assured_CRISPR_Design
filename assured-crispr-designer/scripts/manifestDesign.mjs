// Shared manifest handling for the CLI entry points.
//
// run_design.mjs and export_report.mjs both turn a manifest into a design. When each kept
// its own copy of that plumbing they disagreed in ways that matter: only one of them passed
// `expectedGene`, so the JSON runner selected the CDS by the requested gene while the report
// exporter fell back to feature order - the exact defect that made an APOE request design
// TOMM40. One reader, one set of options, one design call.

import fs from "fs";
import path from "path";
import { runDesign } from "../src/designEngine.js";

export function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    args[key.slice(2)] = argv[i + 1];
    i += 1;
  }
  return args;
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const EDIT_TYPES = new Map([
  ["knockout", "ko"],
  ["ko", "ko"],
  ["snp knock-in", "pm"],
  ["point mutation", "pm"],
  ["mutation", "pm"],
  ["pm", "pm"],
  ["n-terminal tag", "nt"],
  ["nt", "nt"],
  ["c-terminal tag", "ct"],
  ["ct", "ct"],
  ["internal tag", "it"],
  ["it", "it"],
]);

export function mapEditType(editType) {
  const raw = String(editType || "").trim().toLowerCase();
  if (!EDIT_TYPES.has(raw)) throw new Error(`Unsupported edit type: ${editType}`);
  return EDIT_TYPES.get(raw);
}

/** Read a manifest and resolve everything the design engine needs from it. */
export function loadManifest(rawManifestPath) {
  const manifestPath = path.resolve(rawManifestPath);
  const manifest = readJson(manifestPath);
  const extra = manifest.extra || {};
  const referencePath = extra.reference_file
    ? path.resolve(path.dirname(manifestPath), extra.reference_file)
    : null;

  const options = {};
  if (extra.rawReference) options.rawReference = extra.rawReference;
  if (extra.design_options && typeof extra.design_options === "object") {
    Object.assign(options, extra.design_options);
  }
  if (Array.isArray(extra.custom_guides)) options.customGuides = extra.custom_guides;
  // The manifest already states the requested gene, so use it to select the CDS rather
  // than letting feature order in the reference decide. References that annotate a
  // neighbouring gene are common in NCBI RefSeqGene downloads.
  if (manifest.gene_symbol) options.expectedGene = manifest.gene_symbol;
  // Set when both guides and both ssODNs are transfected together, so every donor is built
  // to block every offered guide rather than only its matched one.
  if (extra.co_delivery === true) options.coDeliveryBlocking = true;

  return {
    manifest,
    manifestPath,
    referencePath,
    projectType: mapEditType(manifest.edit_type),
    gbRaw: referencePath ? fs.readFileSync(referencePath, "utf8") : "",
    options,
  };
}

export function runManifestDesign(loaded) {
  return runDesign(
    loaded.projectType,
    loaded.gbRaw,
    loaded.manifest.mutation || "",
    loaded.manifest.extra?.tag || "",
    Number(loaded.manifest.extra?.homology_arm_length || 400),
    loaded.options,
  );
}

/** The provenance row a report is built from - the CLI equivalent of one workspace row. */
export function buildRowFromManifest(loaded) {
  const { manifest, projectType, referencePath } = loaded;
  const gene = manifest.gene_symbol || "";
  const mutation = manifest.mutation || "";
  const editSummary = manifest.edit_summary
    || (mutation ? `${gene} ${mutation}` : `${gene} ${manifest.edit_type || "edit"}`).trim();
  return {
    gene,
    cellLine: manifest.cell_line || "",
    editSummary,
    label: editSummary,
    mutation,
    projectType,
    fileName: referencePath ? path.basename(referencePath) : "",
    referenceSource: referencePath ? "genbank" : "raw",
    deliveryMethod: manifest.extra?.design_options?.deliveryMethod || "unknown",
    irisId: manifest.iris_id || "",
    clientName: manifest.client_name || manifest.group || "",
    notes: manifest.notes || "",
  };
}
