#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { collectProcurementReviewNotes, runDesign, summarizeProcurementReadiness } from "../src/designEngine.js";

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

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
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

function normalizeManifest(manifestPath) {
  const manifest = readJson(manifestPath);
  const referencePath = manifest?.extra?.reference_file
    ? path.resolve(path.dirname(manifestPath), manifest.extra.reference_file)
    : null;
  return {
    manifest,
    projectType: mapEditType(manifest.edit_type),
    referencePath,
  };
}

function buildRawReference(extra = {}) {
  if (!extra.rawReference) return null;
  return extra.rawReference;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.manifest) {
    throw new Error("Usage: node scripts/run_design.mjs --manifest <manifest.json> [--output result.json]");
  }

  const manifestPath = path.resolve(args.manifest);
  const outputPath = args.output ? path.resolve(args.output) : null;
  const { manifest, projectType, referencePath } = normalizeManifest(manifestPath);

  let gbRaw = "";
  if (referencePath) {
    gbRaw = fs.readFileSync(referencePath, "utf8");
  }

  const options = {};
  const rawReference = buildRawReference(manifest.extra || {});
  if (rawReference) options.rawReference = rawReference;
  if (manifest.extra?.design_options && typeof manifest.extra.design_options === "object") {
    Object.assign(options, manifest.extra.design_options);
  }
  if (Array.isArray(manifest.extra?.custom_guides)) {
    options.customGuides = manifest.extra.custom_guides;
  }
  // The manifest already states the requested gene, so use it to select the CDS rather
  // than letting feature order in the reference decide. References that annotate a
  // neighbouring gene are common in NCBI RefSeqGene downloads.
  if (manifest.gene_symbol) options.expectedGene = manifest.gene_symbol;
  // Set when both guides and both ssODNs are transfected together, so every donor is built
  // to block every offered guide rather than only its matched one.
  if (manifest.extra?.co_delivery === true) options.coDeliveryBlocking = true;

  const result = runDesign(
    projectType,
    gbRaw,
    manifest.mutation || "",
    manifest.extra?.tag || "",
    Number(manifest.extra?.homology_arm_length || 400),
    options,
  );

  const ok = !result?.err;
  // A successful computation is not an order-ready design. The app draws that
  // distinction everywhere; without it here an automated caller would read a
  // populated `result` as a green light - the exact failure mode
  // audit/2026_GE_design_audit.md records for the archived vendor workbooks.
  const procurement = ok ? summarizeProcurementReadiness(result) : null;

  const payload = {
    ok,
    input: {
      manifest_path: manifestPath,
      reference_file: referencePath,
      edit_type: manifest.edit_type,
      gene_symbol: manifest.gene_symbol || "",
      ensembl_id: manifest.ensembl_id || "",
    },
    procurement: procurement
      ? {
        status: procurement.status,
        blockers: procurement.blockers,
        warnings: procurement.warnings,
        standing_requirements: procurement.standingRequirements,
        review_notes: collectProcurementReviewNotes(procurement),
      }
      : null,
    result,
  };

  const serialized = JSON.stringify(payload, null, 2);
  if (outputPath) {
    mkdirp(path.dirname(outputPath));
    fs.writeFileSync(outputPath, serialized, "utf8");
    process.stdout.write(`${outputPath}\n`);
  } else {
    process.stdout.write(serialized + "\n");
  }

  // Exit codes so a pipeline can branch without parsing the payload:
  //   0 = design succeeded and procurement status is "ready"
  //   2 = design succeeded but procurement is blocked or needs review
  //   1 = the design itself failed, or the runner threw
  if (!ok) {
    process.stderr.write(`[ERROR] ${result.err}\n`);
    process.exitCode = 1;
    return;
  }
  if (procurement.status !== "ready") {
    process.stderr.write(`[REVIEW] procurement status: ${procurement.status}\n`);
    for (const note of collectProcurementReviewNotes(procurement)) {
      process.stderr.write(`  - ${note}\n`);
    }
    process.exitCode = 2;
  }
}

main().catch((error) => {
  process.stderr.write(`[ERROR] ${error.message}\n`);
  process.exit(1);
});
