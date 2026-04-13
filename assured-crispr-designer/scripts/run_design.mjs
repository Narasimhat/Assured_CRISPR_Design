#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { runDesign } from "../src/designEngine.js";

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

  const result = runDesign(
    projectType,
    gbRaw,
    manifest.mutation || "",
    manifest.extra?.tag || "",
    Number(manifest.extra?.homology_arm_length || 400),
    options,
  );

  const payload = {
    ok: !result?.err,
    input: {
      manifest_path: manifestPath,
      reference_file: referencePath,
      edit_type: manifest.edit_type,
      gene_symbol: manifest.gene_symbol || "",
      ensembl_id: manifest.ensembl_id || "",
    },
    result,
  };

  const serialized = JSON.stringify(payload, null, 2);
  if (outputPath) {
    mkdirp(path.dirname(outputPath));
    fs.writeFileSync(outputPath, serialized, "utf8");
    process.stdout.write(`${outputPath}\n`);
    return;
  }
  process.stdout.write(serialized + "\n");
}

main().catch((error) => {
  process.stderr.write(`[ERROR] ${error.message}\n`);
  process.exit(1);
});
