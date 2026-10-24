#!/usr/bin/env node
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { designEnzymeGuides } from "../src/enzymeGuides.js";
import { enzymeGuideCsv, enzymeGuideGenbank } from "../src/enzymeGuideExport.js";
import { casOffinderInput, parseCasOffinder, summarizeOffTargets } from "../src/enzymeOffTargets.js";

const usage = `node scripts/enzyme_guides.mjs --sequence reference.fa --options options.json --out run-prefix
  [--scorer ./model-adapter.mjs]
  [--cas-offinder /path/to/cas-offinder --genome /path/to/genome.fa --assembly GRCh38 --mismatches 3]
options.json: enzyme, spacerLength, delivery, filters, exclusions, directRepeat,
repeatSource, repeatVerified. Optional intendedTargets maps candidate ids to
{chromosome, start, strand} in genome coordinates (0-based site start).
Scorer module exports synchronous score({guide,config,sequence}) returning {value,model,version}.
Outputs .json, .csv and .gb. Off-target execution needs a locally installed Cas-OFFinder.`;
async function main() {
  const args = {};
  const allowed = new Set(["sequence", "options", "out", "scorer", "cas-offinder", "genome", "assembly", "mismatches"]);
  const tokens = process.argv.slice(2);
  if (tokens.includes("--help")) { console.log(usage); return; }
  for (let i = 0; i < tokens.length; i += 2) {
    const key = tokens[i].slice(2);
    if (!tokens[i].startsWith("--") || !allowed.has(key) || !tokens[i + 1] || tokens[i + 1].startsWith("--") || key in args) throw new Error(usage);
    args[key] = tokens[i + 1];
  }
  if (!args.sequence || !args.out) throw new Error(usage);
  const options = args.options ? JSON.parse(await readFile(args.options, "utf8")) : {};
  if (args.scorer) options.scorer = (await import(pathToFileURL(resolve(args.scorer)).href)).score;
  if (args.scorer && typeof options.scorer !== "function") throw new Error("Scorer module must export score().");
  const run = designEnzymeGuides(await readFile(args.sequence, "utf8"), options);
  run.reference_sha256 = createHash("sha256").update(run.reference_sequence).digest("hex");
  if (args["cas-offinder"]) {
    if (!args.genome || !args.assembly) throw new Error("Genome path and assembly are required for off-target search.");
    const maxMismatches = Number(args.mismatches ?? 3);
    const input = casOffinderInput(run, resolve(args.genome), maxMismatches);
    const temp = await mkdtemp(join(tmpdir(), "assured-offinder-"));
    try {
      const inputPath = join(temp, "input.txt");
      const outputPath = join(temp, "hits.txt");
      await writeFile(inputPath, input);
      const result = spawnSync(resolve(args["cas-offinder"]), [inputPath, "C", outputPath], { encoding: "utf8", timeout: 3600000, maxBuffer: 1024 * 1024 });
      if (result.error || result.status !== 0) throw new Error(`Cas-OFFinder failed: ${result.error?.message || result.stderr || result.status}`);
      const raw = await readFile(outputPath, "utf8");
      const hits = parseCasOffinder(raw, run);
      if (hits.some(hit => hit.mismatches > maxMismatches)) throw new Error("Aligner returned a hit outside the requested mismatch limit.");
      // Keep the full aligner output, not only the top-hit summaries.
      await writeFile(`${args.out}.cas-offinder.tsv`, raw);
      run.off_target = { status: "completed", assembly: args.assembly, genome_path: resolve(args.genome),
        max_mismatches: maxMismatches, aligner: "Cas-OFFinder", executable: resolve(args["cas-offinder"]),
        output_sha256: createHash("sha256").update(raw).digest("hex"), by_guide: {} };
      for (const guide of run.candidates.filter(candidate => candidate.qc.passed)) {
        run.off_target.by_guide[guide.id] = summarizeOffTargets(hits.filter(hit => hit.guide === guide.spacer), {
          intendedTarget: options.intendedTargets?.[guide.id], complete: true,
        });
      }
    } finally { await rm(temp, { recursive: true, force: true }); }
  } else if (args.genome || args.assembly || args.mismatches) throw new Error("Off-target parameters require --cas-offinder.");
  await writeFile(`${args.out}.json`, JSON.stringify(run, null, 2) + "\n");
  await writeFile(`${args.out}.csv`, enzymeGuideCsv(run));
  await writeFile(`${args.out}.gb`, enzymeGuideGenbank(run));
  console.log(`${run.candidates.length} candidates; ${run.candidates.filter(guide => guide.qc.passed).length} pass. ${run.status}. Saved ${args.out}.{json,csv,gb}`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
