import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const cli = new URL("../scripts/enzyme_guides.mjs", import.meta.url).pathname;
const spacer = "ACGTCAGTCAGTACGATCGATCA";

test("CLI writes traceable artifacts and invokes the aligner without a shell (simulated aligner)", async () => {
  const directory = await mkdtemp(join(tmpdir(), "enzyme-cli-"));
  try {
    const reference = join(directory, "reference.fa");
    const options = join(directory, "options.json");
    const out = join(directory, "run");
    const aligner = join(directory, "simulated-aligner");
    await writeFile(reference, `>synthetic\nCTTA${spacer}\n`);
    await writeFile(options, JSON.stringify({ enzyme: "mad7", intendedTargets: { "mad7:0:+:23": { chromosome: "chr1", start: 100, strand: "+" } } }));
    await writeFile(aligner, `#!${process.execPath}\nconst fs=require('node:fs');
const input=fs.readFileSync(process.argv[2],'utf8');
if(!input.includes('YTTN'+'N'.repeat(23)))process.exit(2);
fs.writeFileSync(process.argv[4], 'NNNN${spacer}\\tchr1\\t100\\tCTTA${spacer}\\t+\\t0\\n');\n`);
    await chmod(aligner, 0o755);
    const result = spawnSync(process.execPath, [cli, "--sequence", reference, "--options", options, "--out", out,
      "--cas-offinder", aligner, "--genome", join(directory, "genome with spaces.fa"), "--assembly", "synthetic-test"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const run = JSON.parse(await readFile(`${out}.json`, "utf8"));
    assert.equal(run.off_target.status, "completed");
    assert.equal(run.off_target.by_guide["mad7:0:+:23"].specificity, 100);
    assert.match(run.reference_sha256, /^[a-f0-9]{64}$/);
    assert.equal(run.status, "REVIEW REQUIRED");
    assert.match(await readFile(`${out}.csv`, "utf8"), /mad7/);
    assert.match(await readFile(`${out}.gb`, "utf8"), /ORIGIN/);
    assert.match(await readFile(`${out}.cas-offinder.tsv`, "utf8"), /chr1/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("CLI rejects invalid options and scorer provenance rather than emitting successful results", async () => {
  const directory = await mkdtemp(join(tmpdir(), "enzyme-cli-"));
  try {
    const reference = join(directory, "reference.fa");
    const scorer = join(directory, "bad-scorer.mjs");
    await writeFile(reference, `${spacer.slice(0, 20)}AGG`);
    await writeFile(scorer, "export function score(){ return {value:72}; }\n");
    const result = spawnSync(process.execPath, [cli, "--sequence", reference, "--out", join(directory, "run"), "--scorer", scorer], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Scorer must return/);
    const unknown = spawnSync(process.execPath, [cli, "--unknown", "value"], { encoding: "utf8" });
    assert.equal(unknown.status, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
