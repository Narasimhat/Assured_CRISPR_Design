#!/usr/bin/env node
// Run one manifest through the design engine and emit the result as JSON.
//
// Exit codes so a pipeline can branch without parsing the payload:
//   0 = design succeeded and procurement status is "ready"
//   2 = design succeeded but procurement is blocked or needs review
//   1 = the design itself failed, or the runner threw

import fs from "fs";
import path from "path";
import { collectProcurementReviewNotes, summarizeProcurementReadiness } from "../src/designEngine.js";
import { loadManifest, parseArgs, runManifestDesign } from "./manifestDesign.mjs";

function main() {
  const args = parseArgs(process.argv);
  if (!args.manifest) {
    throw new Error("Usage: node scripts/run_design.mjs --manifest <manifest.json> [--output result.json]");
  }

  const loaded = loadManifest(args.manifest);
  const outputPath = args.output ? path.resolve(args.output) : null;
  const result = runManifestDesign(loaded);

  const ok = !result?.err;
  // A successful computation is not an order-ready design. The app draws that
  // distinction everywhere; without it here an automated caller would read a
  // populated `result` as a green light - the exact failure mode
  // audit/2026_GE_design_audit.md records for the archived vendor workbooks.
  const procurement = ok ? summarizeProcurementReadiness(result) : null;

  // Drop the embedded transcript model from the payload: it restates the reference file and
  // runs to hundreds of kB, which buried the design in machine-read output. Its
  // referenceIssues are kept - those are release gates, and losing them would let a caller
  // read a clean payload for a design blocked on the wrong CDS.
  const { gb, cds: _cds, ...design } = result || {};
  const reference = gb
    ? {
      source: gb.source || "",
      gene: gb.gene || "",
      transcript_id: gb.transcriptId || "",
      issues: gb.referenceIssues || [],
    }
    : null;

  const payload = {
    ok,
    input: {
      manifest_path: loaded.manifestPath,
      reference_file: loaded.referencePath,
      edit_type: loaded.manifest.edit_type,
      gene_symbol: loaded.manifest.gene_symbol || "",
      ensembl_id: loaded.manifest.ensembl_id || "",
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
    reference,
    result: design,
  };

  const serialized = JSON.stringify(payload, null, 2);
  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, serialized, "utf8");
    process.stdout.write(`${outputPath}\n`);
  } else {
    process.stdout.write(serialized + "\n");
  }

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

try {
  main();
} catch (error) {
  process.stderr.write(`[ERROR] ${error.message}\n`);
  process.exit(1);
}
