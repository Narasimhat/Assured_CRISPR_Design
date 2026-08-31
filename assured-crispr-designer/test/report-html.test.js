// Golden checks on the rendered HTML report.
//
// These were impossible until reportHtml.js was extracted from App.jsx: JSX cannot be
// imported by `node --test`, so nothing ever asserted what a report actually says. That
// gap is why a green "Order this strand" badge sat on blocked designs in production, and
// why a unit-tested fix plus a passing build still left one of the four render paths
// broken.
//
// The assertions are deliberately behavioural rather than full-text snapshots: a snapshot
// of a 190 kB document would break on every styling change and teach everyone to
// regenerate it without reading the diff.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { runDesign, summarizeProcurementReadiness } from "../src/designEngine.js";
import { buildReportHtml } from "../src/reportHtml.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(path.join(here, "fixtures", name), "utf8");

function render(reference, type, { mutation = "", tag = "", arm = 400, options = {} } = {}) {
  const result = runDesign(type, fixture(reference), mutation, tag, arm, { deliveryMethod: "rnp", ...options });
  assert.equal(result.err, undefined, `design failed: ${result.err}`);
  const meta = { gene: result.gene, cellLine: "", irisId: "", parentId: "", projectType: type, mutation, tag };
  return {
    result,
    readiness: summarizeProcurementReadiness(result),
    html: buildReportHtml(meta, result, `${reference}`, null, [], null),
  };
}

const BLOCKED = { reference: "apoe-r154s.gb", type: "pm", opts: { mutation: "R154S", options: { expectedGene: "APOE" } } };
const READY = { reference: "synthetic-tagging.gb", type: "ct", opts: { tag: "SD40-2xHA", options: { expectedGene: "TAGME" } } };

test("every design type renders a well-formed report", () => {
  const cases = [
    ["apoe-r154s.gb", "pm", { mutation: "R154S", options: { expectedGene: "APOE" } }],
    ["two-genes-partial-first.gb", "ko", { options: { expectedGene: "TARGETB" } }],
    ["synthetic-tagging.gb", "it", { mutation: "F50", tag: "SPOT", options: { expectedGene: "TAGME" } }],
    ["synthetic-tagging.gb", "ct", { tag: "SD40-2xHA", options: { expectedGene: "TAGME" } }],
    ["synthetic-tagging.gb", "nt", { tag: "N:SD40-Linker", options: { expectedGene: "TAGME" } }],
  ];
  cases.forEach(([reference, type, opts]) => {
    const { html, result } = render(reference, type, opts);
    assert.match(html.trim(), /^<!doctype html>/i, `${type}: missing doctype`);
    assert.ok(html.trim().endsWith("</html>"), `${type}: document not closed`);
    assert.ok(html.includes(result.gene), `${type}: report does not name the gene`);
    assert.ok(html.length > 5000, `${type}: report suspiciously short (${html.length} chars)`);
    // A report that silently omits the design type is not usable as a record.
    assert.match(html, /Design class/i, `${type}: no design class stated`);
  });
});

test("a BLOCKED design's report never invites ordering", () => {
  // This is the regression that was live in production: strand.recommended drove the
  // badge with no reference to release state.
  const { html, readiness } = render(BLOCKED.reference, BLOCKED.type, BLOCKED.opts);
  assert.equal(readiness.status, "blocked", "fixture must be blocked for this test to mean anything");

  assert.ok(
    !/Order this strand/i.test(html),
    'blocked report still contains "Order this strand"',
  );
  assert.match(html, /Candidate donor/i, "blocked report does not mark donors as candidates");
  assert.match(html, /do not order/i, "blocked report does not say not to order");
});

test("a READY design's report does present its orderable strand", () => {
  // The mirror of the test above: the fix must not simply suppress the label everywhere,
  // which would pass the blocked test while making the report useless.
  const { html, readiness } = render(READY.reference, READY.type, READY.opts);
  assert.equal(readiness.status, "ready", "fixture must be ready for this test to mean anything");
  assert.ok(!/do not order/i.test(html), "ready report should not warn against ordering");
});

const STATUS_LABEL = { blocked: "BLOCKED", review: "REVIEW REQUIRED", ready: "READY" };

test("the report states the authoritative release status, not a softer parallel one", () => {
  // The report used to render only its own nine-row checklist, which graded a hard blocker
  // as "warn" and never stated the release status at all. Asserting the label explicitly:
  // an earlier version of this test passed even when the panel was forced to READY,
  // because "do not order" still matched the donor badge elsewhere in the document.
  [BLOCKED, READY].forEach((entry) => {
    const { html, readiness } = render(entry.reference, entry.type, entry.opts);
    const expected = STATUS_LABEL[readiness.status];
    assert.ok(html.includes(expected), `report does not state release status ${expected}`);
    Object.entries(STATUS_LABEL)
      .filter(([status]) => status !== readiness.status)
      .forEach(([, label]) => {
        assert.ok(!html.includes(label), `report also claims release status ${label}`);
      });
  });
});

test("the report carries the release verdict and its reasons", () => {
  const { html, readiness } = render(BLOCKED.reference, BLOCKED.type, BLOCKED.opts);
  assert.match(html, /Do not order/i, "blocked report does not instruct the reader not to order");
  assert.ok(
    !/All configured release gates passed/i.test(html),
    "blocked report claims the release gates passed",
  );
  // The standing external-specificity requirement must reach the reader, not just the API.
  assert.match(html, /Genome-wide/i, "report omits the standing specificity requirement");
  // Every blocker must appear somewhere in the document.
  readiness.blockers.forEach((blocker) => {
    const fragment = blocker.split(".")[0].slice(0, 40);
    assert.ok(html.includes(fragment), `report omits blocker: ${fragment}`);
  });
});

test("the report states guide-donor pairing and never suggests pooling", () => {
  const { html, result } = render(BLOCKED.reference, BLOCKED.type, BLOCKED.opts);
  assert.equal(result.coDeliverySafe, false);
  assert.match(html, /Do not co-deliver|do not pool/i, "report does not forbid pooling");
  // Each donor must be shown against its matched guide by name.
  result.os.forEach((donor) => {
    assert.ok(html.includes(donor.guideName), `report omits the guide matched to ${donor.n}`);
  });
});

test("primers are described as recommended, never as validated", () => {
  // The tool computes thermodynamics. It has validated nothing experimentally, and the
  // README states that genome-wide specificity is explicitly unchecked. Calling these
  // "validation primers" is the same class of overclaim as the QC gates that could not
  // fire and the ordering badge on blocked designs.
  const { html, result } = render(BLOCKED.reference, BLOCKED.type, BLOCKED.opts);
  assert.ok(!/validation primer/i.test(html), 'report still calls them "validation primers"');
  assert.match(html, /Recommended Primers/i, "report does not label the primer section");
  // The strategy identifier travels into exports and the CLI payload, so it carries the
  // same claim and must not say "validated" either.
  assert.ok(!/^validated-/.test(result.primerStrategy), `primerStrategy claims validation: ${result.primerStrategy}`);
  assert.match(result.primerStrategy, /^recommended-/);
});

test("the co-delivery section appears only when co-delivery was requested", () => {
  const single = render(BLOCKED.reference, BLOCKED.type, BLOCKED.opts);
  assert.ok(
    !single.html.includes("Co-delivery of two guides"),
    "single-pair report should not carry a co-delivery section",
  );

  const co = render(BLOCKED.reference, BLOCKED.type, {
    ...BLOCKED.opts,
    options: { ...BLOCKED.opts.options, coDeliveryBlocking: true },
  });
  assert.ok(co.html.includes("Co-delivery of two guides"), "co-delivery report is missing its section");
  // The reader must be told to screen for the deletion two cut sites can produce.
  assert.match(co.html, /Screen for the deletion product/i);
  assert.match(co.html, /delete the intervening/i);
  // And the named safer alternative must reach the page, not just the API.
  assert.ok(
    co.html.includes(co.result.coDeliverySelection.singleGuideAlternative.spacer),
    "co-delivery report omits the safer single-guide alternative",
  );
});

test("the report layer stays free of React", () => {
  // The whole point of the extraction. An accidental react import here would make this
  // suite unloadable and take report coverage back to zero.
  const source = readFileSync(path.join(here, "..", "src", "reportHtml.js"), "utf8");
  assert.ok(!/from "react"/.test(source), "reportHtml.js imports react");
  assert.ok(!/\buse(State|Effect|Memo|Callback|Ref)\s*\(/.test(source), "reportHtml.js uses React hooks");
  assert.ok(!/from "\.\/App/.test(source), "reportHtml.js imports App - that would be circular");
  // Relative imports must carry explicit extensions or Node cannot load the module.
  const bare = source.match(/from "\.\/[A-Za-z0-9_/-]+"/g) || [];
  assert.deepEqual(bare, [], `extension-less imports break node --test: ${bare.join(", ")}`);
});
