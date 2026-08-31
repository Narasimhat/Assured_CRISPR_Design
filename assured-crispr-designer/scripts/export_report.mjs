#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { runDesign } from "../src/designEngine.js";
import {
  buildHistoricalContext,
  buildReportHtml,
  buildReviewItems,
  buildRowMeta,
} from "../src/App.jsx";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const value = argv[i + 1];
    args[key.slice(2)] = value;
    i += 1;
  }
  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function mapEditType(editType) {
  const raw = String(editType || "").trim().toLowerCase();
  const mapping = new Map([
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
  if (!mapping.has(raw)) {
    throw new Error(`Unsupported edit type: ${editType}`);
  }
  return mapping.get(raw);
}

function buildRowFromManifest(manifest, referencePath) {
  const mutation = manifest.mutation || "";
  const gene = manifest.gene_symbol || "";
  const editSummary = manifest.edit_summary
    || (mutation ? `${gene} ${mutation} SNP knock-in` : `${gene} ${manifest.edit_type || "edit"}`);
  return {
    gene,
    cellLine: manifest.cell_line || "",
    editSummary,
    label: editSummary,
    mutation,
    projectType: mapEditType(manifest.edit_type),
    fileName: referencePath ? path.basename(referencePath) : "",
    referenceSource: "genbank",
    deliveryMethod: manifest.extra?.design_options?.deliveryMethod || "rnp",
    irisId: manifest.iris_id || "",
    clientName: manifest.client_name || manifest.group || "",
    notes: manifest.notes || "",
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.manifest) {
    throw new Error("Usage: node scripts/export_report.mjs --manifest <manifest.json> [--output report.html]");
  }

  const manifestPath = path.resolve(args.manifest);
  const outputPath = args.output
    ? path.resolve(args.output)
    : path.join(scriptDir, "../outputs", `${path.basename(manifestPath, ".json")}_report.html`);
  const manifest = readJson(manifestPath);
  const referencePath = manifest?.extra?.reference_file
    ? path.resolve(path.dirname(manifestPath), manifest.extra.reference_file)
    : null;

  let gbRaw = "";
  if (referencePath) {
    gbRaw = fs.readFileSync(referencePath, "utf8");
  }

  const options = {};
  if (manifest.extra?.design_options && typeof manifest.extra.design_options === "object") {
    Object.assign(options, manifest.extra.design_options);
  }
  if (Array.isArray(manifest.extra?.custom_guides)) {
    options.customGuides = manifest.extra.custom_guides;
  }
  if (manifest.gene_symbol) options.expectedGene = manifest.gene_symbol;

  const row = buildRowFromManifest(manifest, referencePath);
  const result = runDesign(
    row.projectType,
    gbRaw,
    manifest.mutation || "",
    manifest.extra?.tag || "",
    Number(manifest.extra?.homology_arm_length || 400),
    options,
  );

  if (result?.err) {
    throw new Error(result.err);
  }

  const meta = buildRowMeta(row, result);
  const historicalContext = buildHistoricalContext(meta, result, row.projectType);
  const reviewItems = buildReviewItems(meta, result, row.fileName);
  const html = buildReportHtml(meta, result, row.fileName, historicalContext, reviewItems, null);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html, "utf8");
  process.stdout.write(`${outputPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`[ERROR] ${error.message}\n`);
  process.exit(1);
});
