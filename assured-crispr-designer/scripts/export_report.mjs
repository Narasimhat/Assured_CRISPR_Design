#!/usr/bin/env node
// Write the same HTML report the hosted app produces via "Download HTML report".
//
//   node scripts/export_report.mjs --manifest examples/manifest_apoe_r176c.json \
//     --output outputs/apoe_r176c_report.html
//
// The app and this script call the same buildReportHtml with the same inputs, so the file
// on disk is the file a reviewer would have downloaded. Exit codes match run_design.mjs:
// 0 = ready, 2 = blocked or review required, 1 = the design failed.

import fs from "fs";
import path from "path";
import { collectProcurementReviewNotes, summarizeProcurementReadiness } from "../src/designEngine.js";
import { buildReportHtml } from "../src/reportHtml.js";
import { buildHistoricalContext, buildReviewItems, buildRowMeta } from "../src/reportInputs.js";
import { buildRowFromManifest, loadManifest, parseArgs, runManifestDesign } from "./manifestDesign.mjs";

function main() {
  const args = parseArgs(process.argv);
  if (!args.manifest) {
    throw new Error("Usage: node scripts/export_report.mjs --manifest <manifest.json> [--output report.html]");
  }

  const loaded = loadManifest(args.manifest);
  const result = runManifestDesign(loaded);
  if (result?.err) throw new Error(result.err);

  const row = buildRowFromManifest(loaded);
  const meta = buildRowMeta(row, result);
  const html = buildReportHtml(
    meta,
    result,
    row.fileName,
    buildHistoricalContext(meta, result, row.projectType),
    buildReviewItems(meta, result, row.fileName),
    null,
  );

  const outputPath = path.resolve(
    args.output || path.join("outputs", `${path.basename(loaded.manifestPath, ".json")}_report.html`),
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html, "utf8");
  process.stdout.write(`${outputPath}\n`);

  // A report that renders is not an orderable design. Say so on stderr and in the exit
  // code, so a pipeline cannot treat "the file was written" as a green light.
  const procurement = summarizeProcurementReadiness(result);
  if (procurement.status !== "ready") {
    process.stderr.write(`[REVIEW] procurement status: ${procurement.status}\n`);
    for (const note of collectProcurementReviewNotes(procurement)) {
      process.stderr.write(`  - ${note}\n`);
    }
    process.exitCode = 2;
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`[ERROR] ${error.message}\n`);
  process.exit(1);
}
