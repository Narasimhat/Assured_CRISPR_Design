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
const exporter = path.join(pkgRoot, "scripts", "export_report.mjs");
const reportManifest = path.join(pkgRoot, "examples", "manifest_apoe_r176c.json");
const twoGeneManifest = path.join(pkgRoot, "examples", "manifest_two_genes_ko.json");

function runCli(args) {
  const result = spawnSync(process.execPath, [runner, ...args], { cwd: pkgRoot, encoding: "utf8" });
  return { code: result.status, stdout: result.stdout || "", stderr: result.stderr || "" };
}

function runScript(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: pkgRoot, encoding: "utf8" });
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


// --- scripts/export_report.mjs -------------------------------------------------------
//
// The report builders used to live in App.jsx, so no CLI could produce a report without
// running JSX through vite-node. These tests are the reason the extraction is safe:
// Rollup resolves a missing identifier to a global and the production build still passes,
// so only actually rendering a report under plain node proves the module graph is intact.

test("the report exporter writes the same HTML report the app downloads", () => {
  const output = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "acd-report-")), "report.html");
  const { code, stdout } = runScript(exporter, ["--manifest", reportManifest, "--output", output]);
  assert.ok(code === 0 || code === 2, `unexpected exit code ${code}`);
  assert.equal(stdout.trim(), output, "the exporter must print only the path it wrote");

  const html = fs.readFileSync(output, "utf8");
  assert.match(html.trim(), /^<!doctype html>/i);
  assert.ok(html.trim().endsWith("</html>"));
  assert.ok(html.includes("APOE"), "report does not name the gene");
  assert.match(html, /Design class/i);
  // buildReviewItems was trapped in App.jsx; if it silently returned [], the report would
  // still render and still say "Genome-wide" (that line comes from the procurement panel),
  // so assert on text only this builder produces.
  assert.match(html, /IRIS\/internal project ID is missing/, "review checklist did not reach the report");
  assert.match(html, /Confirm the desired amino-acid change/, "edit-specific review items are missing");
  assert.ok(html.length > 20000, `report suspiciously short (${html.length} chars)`);
});

test("the exported report never invites ordering unless the design is releasable", () => {
  const output = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "acd-report-")), "report.html");
  const { code } = runScript(exporter, ["--manifest", reportManifest, "--output", output]);
  const html = fs.readFileSync(output, "utf8");
  if (code === 2) {
    // Blocked *and* review-required designs are both non-orderable.
    assert.ok(!/Order this strand/i.test(html), "a non-releasable report invites ordering");
    assert.match(html, /Candidate donor/i);
  } else {
    assert.equal(code, 0);
  }
});

test("the exporter reports procurement status through its exit code, like the runner", () => {
  const output = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "acd-report-")), "report.html");
  const { code, stderr } = runScript(exporter, ["--manifest", reportManifest, "--output", output]);
  if (code === 2) {
    assert.match(stderr, /\[REVIEW\] procurement status: (review|blocked)/);
  } else {
    assert.equal(code, 0);
    assert.doesNotMatch(stderr, /\[REVIEW\]/);
  }
});

test("a missing manifest argument fails the exporter with exit code 1", () => {
  const { code, stderr } = runScript(exporter, []);
  assert.equal(code, 1);
  assert.match(stderr, /\[ERROR\]/);
});

test("the shared manifest loader turns manifest fields into design options", async () => {
  // Asserted on behaviour, not on source text. The first version of this test grepped
  // manifestDesign.mjs for "expectedGene" and passed even with the line deleted, because
  // the module header mentions it in prose - the same false-pass that once let a golden
  // report test match "do not order" in a donor badge instead of the release panel.
  const { loadManifest } = await import("../scripts/manifestDesign.mjs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "acd-manifest-"));
  const write = (body) => {
    const file = path.join(dir, `m${Math.abs(JSON.stringify(body).length)}.json`);
    fs.writeFileSync(file, JSON.stringify(body), "utf8");
    return file;
  };
  const reference = path.join(here, "fixtures", "apoe-r154s.gb");

  // The requested gene must select the CDS, or a reference that annotates a neighbouring
  // gene designs the wrong one - the defect that made an APOE request design TOMM40.
  const base = loadManifest(write({
    gene_symbol: "APOE", edit_type: "snp knock-in", mutation: "R176C",
    extra: { reference_file: reference },
  }));
  assert.equal(base.options.expectedGene, "APOE", "loader does not pass the requested gene");
  assert.equal(base.projectType, "pm");
  assert.ok(base.gbRaw.length > 1000, "loader did not read the reference");
  assert.equal(base.options.coDeliveryBlocking, undefined, "co-delivery must be opt-in");

  // Co-delivery changes what a correct donor is, so the flag has to survive the CLI.
  const co = loadManifest(write({
    gene_symbol: "APOE", edit_type: "snp knock-in", mutation: "R176C",
    extra: { reference_file: reference, co_delivery: true },
  }));
  assert.equal(co.options.coDeliveryBlocking, true, "co_delivery did not reach the engine");

  const guides = loadManifest(write({
    gene_symbol: "APOE", edit_type: "snp knock-in", mutation: "R176C",
    extra: { reference_file: reference, custom_guides: ["ACGTACGTACGTACGTACGT"] },
  }));
  assert.deepEqual(guides.options.customGuides, ["ACGTACGTACGTACGTACGT"], "custom guides were dropped");

  // Neither entry point may set design options of its own, or they drift apart again.
  ["run_design.mjs", "export_report.mjs"].forEach((name) => {
    const source = fs.readFileSync(path.join(pkgRoot, "scripts", name), "utf8");
    assert.match(source, /from "\.\/manifestDesign\.mjs"/, `${name} does not use the shared loader`);
    assert.ok(!/function mapEditType/.test(source), `${name} still has its own edit-type map`);
    assert.ok(!/options\.expectedGene/.test(source), `${name} sets design options outside the shared loader`);
  });
});

test("the JSON payload drops the transcript model but keeps its release-gating issues", async () => {
  // The embedded model restates the reference file and buried the design in the payload.
  // Its referenceIssues are release gates, so dropping those too would let an automated
  // caller read a clean payload for a design flagged on the wrong CDS. Asserted against a
  // reference that actually raises one - the knockout example raises none, so an empty
  // list there proves nothing.
  const { stdout } = runCli(["--manifest", twoGeneManifest]);
  const payload = JSON.parse(stdout);
  assert.equal(payload.result.gb, undefined, "payload still embeds the transcript model");
  assert.ok(payload.reference, "payload lost the reference summary");
  assert.equal(payload.reference.gene, "TARGETB");
  assert.ok("transcript_id" in payload.reference, "payload lost transcript identity");

  const { runDesign } = await import("../src/designEngine.js");
  const { loadManifest, runManifestDesign } = await import("../scripts/manifestDesign.mjs");
  assert.equal(typeof runDesign, "function");
  const expected = runManifestDesign(loadManifest(twoGeneManifest)).gb.referenceIssues;
  assert.ok(expected.length > 0, "fixture must raise a reference issue for this test to mean anything");
  assert.deepEqual(payload.reference.issues, expected, "payload lost referenceIssues");
});

test("the report input builders stay free of React", () => {
  const source = fs.readFileSync(path.join(pkgRoot, "src", "reportInputs.js"), "utf8");
  assert.ok(!/from "react"/.test(source), "reportInputs.js imports react");
  assert.ok(!/\buse(State|Effect|Memo|Callback|Ref)\s*\(/.test(source), "reportInputs.js uses React hooks");
  assert.ok(!/from "\.\/App/.test(source), "reportInputs.js imports App");
  const bare = source.match(/from "\.\/[A-Za-z0-9_/-]+"/g) || [];
  assert.deepEqual(bare, [], `extension-less imports break node --test: ${bare.join(", ")}`);
});


test("the extracted report inputs each produce real content", async () => {
  // The exported report cannot cover buildHistoricalContext: the APOE example matches no
  // archived project, so an empty context renders identically to a correct one. Assert on
  // the builders directly rather than leave that gap unstated.
  const { runDesign } = await import("../src/designEngine.js");
  const { buildHistoricalContext, buildReviewItems, buildRowMeta } = await import("../src/reportInputs.js");

  const reference = fs.readFileSync(path.join(here, "fixtures", "apoe-r154s.gb"), "utf8");
  const result = runDesign("pm", reference, "R154S", "", 400, { deliveryMethod: "rnp", expectedGene: "APOE" });
  assert.equal(result.err, undefined);

  const meta = buildRowMeta({ gene: "APOE", projectType: "pm", cellLine: "BIHi005-A" }, result);
  assert.equal(meta.gene, "APOE");
  assert.equal(meta.projectType, "pm");

  const context = buildHistoricalContext(meta, result, "pm");
  assert.ok(context && typeof context === "object", "historical context is not an object");
  assert.ok("matches" in context || "stats" in context || Object.keys(context).length > 0,
    "historical context is empty");

  const items = buildReviewItems(meta, result, "apoe-r154s.gb");
  assert.ok(items.length > 0, "review items are empty");
  items.forEach((item) => {
    assert.ok(["warning", "check"].includes(item.level), `unexpected review level ${item.level}`);
    assert.ok(item.text && item.text.length > 10, "review item has no usable text");
  });
});


test("the exported file is byte-for-byte the report the app builds", async () => {
  // The strongest guard on the exporter's wiring. Loose text assertions cannot tell that
  // it passed `null` for the historical context, because the APOE example matches no
  // archived project and renders identically either way. buildReportHtml embeds no
  // timestamp, so the document is deterministic and equality is a fair test.
  const { buildReportHtml } = await import("../src/reportHtml.js");
  const { buildHistoricalContext, buildReviewItems, buildRowMeta } = await import("../src/reportInputs.js");
  const { buildRowFromManifest, loadManifest, runManifestDesign } = await import("../scripts/manifestDesign.mjs");

  const loaded = loadManifest(reportManifest);
  const result = runManifestDesign(loaded);
  const row = buildRowFromManifest(loaded);
  const meta = buildRowMeta(row, result);
  const expected = buildReportHtml(
    meta,
    result,
    row.fileName,
    buildHistoricalContext(meta, result, row.projectType),
    buildReviewItems(meta, result, row.fileName),
    null,
  );

  const output = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "acd-report-")), "report.html");
  runScript(exporter, ["--manifest", reportManifest, "--output", output]);
  assert.equal(fs.readFileSync(output, "utf8"), expected, "the CLI report differs from the app's");
});


test("row meta falls back to the gene the design resolved", async () => {
  // A CLI manifest can omit the gene; the report must still name it, because a report that
  // cannot say which gene it designed is not usable as a record.
  const { runDesign } = await import("../src/designEngine.js");
  const { buildRowMeta } = await import("../src/reportInputs.js");
  const reference = fs.readFileSync(path.join(here, "fixtures", "apoe-r154s.gb"), "utf8");
  const result = runDesign("pm", reference, "R154S", "", 400, { deliveryMethod: "rnp", expectedGene: "APOE" });

  assert.equal(buildRowMeta({ projectType: "pm" }, result).gene, "APOE", "meta lost the resolved gene");
  // An explicit row value still wins, so a stated request is never overwritten.
  assert.equal(buildRowMeta({ gene: "STATED", projectType: "pm" }, result).gene, "STATED");
});

test("the report renders matched historical records when there are any", async () => {
  // Coverage note: no bundled reference matches an archived project, so the exporter's
  // historical-context argument is not exercised end to end - passing null there renders
  // an identical document. This covers the renderer instead; the wiring is not covered.
  const { runDesign } = await import("../src/designEngine.js");
  const { buildReportHtml } = await import("../src/reportHtml.js");
  const { buildReviewItems, buildRowMeta } = await import("../src/reportInputs.js");
  const reference = fs.readFileSync(path.join(here, "fixtures", "apoe-r154s.gb"), "utf8");
  const result = runDesign("pm", reference, "R154S", "", 400, { deliveryMethod: "rnp", expectedGene: "APOE" });
  const meta = buildRowMeta({ gene: "APOE", projectType: "pm" }, result);
  const items = buildReviewItems(meta, result, "apoe-r154s.gb");

  const withNone = buildReportHtml(meta, result, "apoe-r154s.gb", { topMatches: [] }, items, null);
  assert.ok(!/Matched Historical Records/.test(withNone));

  const withMatch = buildReportHtml(meta, result, "apoe-r154s.gb", {
    topMatches: [{ record: { project: "P-0001", targetGene: "APOE", parentalLine: "BIHi005-A" }, score: 12, matchLabel: "Same gene" }],
  }, items, null);
  assert.match(withMatch, /Matched Historical Records/, "the report drops precedent it was given");
});
