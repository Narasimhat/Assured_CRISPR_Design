// End-to-end coverage for scripts/run_design.mjs.
//
// This also guards the documented quickstart in RUNNER_USAGE.md: the runner used to
// ship an example manifest pointing at a reference file that was not in the repo, so
// the very first command in the docs failed with ENOENT.

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, "..");
const runner = path.join(pkgRoot, "scripts", "run_design.mjs");
const manifest = path.join(pkgRoot, "examples", "manifest_knockout.json");

function runCli(args) {
  const result = spawnSync(process.execPath, [runner, ...args], { cwd: pkgRoot, encoding: "utf8" });
  return { code: result.status, stdout: result.stdout || "", stderr: result.stderr || "" };
}

test("the bundled example manifest and its reference both exist", () => {
  assert.ok(fs.existsSync(manifest), "examples/manifest_knockout.json is missing");
  const parsed = JSON.parse(fs.readFileSync(manifest, "utf8"));
  const reference = path.resolve(path.dirname(manifest), parsed.extra.reference_file);
  assert.ok(fs.existsSync(reference), `manifest reference_file does not exist: ${reference}`);
});

test("the documented quickstart produces a design plus a procurement verdict", () => {
  const { code, stdout } = runCli(["--manifest", manifest]);
  // 0 = ready, 2 = succeeded but needs review. Either is a working quickstart;
  // 1 would mean the design itself failed.
  assert.ok(code === 0 || code === 2, `unexpected exit code ${code}`);

  const payload = JSON.parse(stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.result.type, "ko");
  assert.equal(payload.result.err, undefined);
  assert.ok((payload.result.gs || []).length >= 1, "expected at least one guide");
  assert.match(payload.result.amp, /WT ~\d+ bp \| deletion ~\d+ bp/);

  assert.ok(payload.procurement, "payload must carry a procurement verdict");
  assert.ok(["ready", "review", "blocked"].includes(payload.procurement.status));
  // The standing external-specificity requirement must reach an automated consumer.
  assert.match(payload.procurement.review_notes.join(" "), /Genome-wide/i);
});

test("exit code reflects procurement status, not just computational success", () => {
  const { code, stderr } = runCli(["--manifest", manifest]);
  if (code === 2) {
    assert.match(stderr, /\[REVIEW\] procurement status: (review|blocked)/);
  } else {
    assert.equal(code, 0);
    assert.doesNotMatch(stderr, /\[REVIEW\]/);
  }
});

test("--output writes the payload to disk and prints only the path", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "assured-cli-"));
  const outFile = path.join(outDir, "nested", "result.json");
  try {
    const { code, stdout } = runCli(["--manifest", manifest, "--output", outFile]);
    assert.ok(code === 0 || code === 2);
    assert.equal(stdout.trim(), outFile);
    const payload = JSON.parse(fs.readFileSync(outFile, "utf8"));
    assert.equal(payload.ok, true);
    assert.ok(payload.procurement);
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test("a missing manifest argument fails with exit code 1", () => {
  const { code, stderr } = runCli([]);
  assert.equal(code, 1);
  assert.match(stderr, /\[ERROR\].*--manifest/);
});

test("an unsupported edit type fails with exit code 1", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "assured-cli-"));
  const bad = path.join(dir, "bad.json");
  fs.writeFileSync(bad, JSON.stringify({ edit_type: "transmogrify", extra: {} }));
  try {
    const { code, stderr } = runCli(["--manifest", bad]);
    assert.equal(code, 1);
    assert.match(stderr, /Unsupported edit type/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
