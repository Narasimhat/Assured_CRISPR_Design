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
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { runDesign, summarizeProcurementReadiness } from "../src/designEngine.js";
import { buildReportHtml, getProjectTypeMeta } from "../src/reportHtml.js";

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

// A design blocked on its reference: the record annotates two genes and none was stated,
// so which gene was designed is a guess. That is a hard error, not a risk to weigh.
//
// It used to be a weak-protection case, and then a no-strongly-blocked-pair case. Neither
// survives multi-mutation blocking - the engine now stacks up to three synonymous seed
// mismatches, so every guide in every committed fixture reaches strong protection. Weak
// protection is also no longer a hard blocker: it is a pair-level refusal a designer can
// accept. A blocked design needs a reason that cannot be accepted away.
const BLOCKED = { reference: "two-genes-partial-first.gb", type: "pm", opts: { mutation: "L10S", options: {} } };
const READY = { reference: "synthetic-tagging.gb", type: "ct", opts: { tag: "SD40-2xHA", options: { expectedGene: "TAGME" } } };
// A design that computes cleanly but still awaits an external check. Without this case
// the suite cannot tell "only ready is orderable" from "anything not blocked is orderable".
const REVIEW = { reference: "apoe-r154s.gb", type: "pm", opts: { mutation: "R176C", options: { expectedGene: "APOE" } } };

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
});

test("a point-mutation co-delivery report names the safer single-guide alternative", () => {
  // Only designPM searches for a replacement guide that can be strongly blocked, so this is
  // asserted on a PM design rather than folded into the test above. designIT reports
  // co-delivery and the dual-cut risk but offers no such alternative - a real gap, stated
  // here rather than hidden behind an optional assertion.
  const co = render("apoe-r154s.gb", "pm", {
    mutation: "R154S",
    options: { expectedGene: "APOE", coDeliveryBlocking: true },
  });
  assert.ok(co.result.coDeliverySelection, "PM co-delivery produced no guide selection");
  const alternative = co.result.coDeliverySelection.singleGuideAlternative;
  assert.ok(alternative, "no safer single-guide alternative was found for this fixture");
  assert.ok(
    co.html.includes(alternative.spacer),
    "co-delivery report omits the safer single-guide alternative",
  );
});

test("an internal-tag design reports co-delivery, not just applies it", () => {
  // designIT built donors for co-delivery but set none of the reporting fields, so the
  // report section and the dual-cut warning never appeared - and the per-pair release gate,
  // which reads the same flag, would have taken the lenient path for a co-delivered design.
  const single = render("synthetic-tagging.gb", "it", { mutation: "R100", tag: "alphaBtx", options: { expectedGene: "TAGME" } });
  assert.equal(single.result.coDeliveryBlockingRequested, false);
  assert.equal(single.result.dualCutDeletionRisk, undefined);

  const co = render("synthetic-tagging.gb", "it", {
    mutation: "R100",
    tag: "alphaBtx",
    options: { expectedGene: "TAGME", coDeliveryBlocking: true },
  });
  assert.equal(co.result.coDeliveryBlockingRequested, true);
  assert.ok(co.result.dualCutDeletionRisk, "internal-tag co-delivery does not warn about the deletion product");
  assert.ok(co.result.dualCutDeletionRisk.spans.length > 0);
  assert.match(co.html, /Screen for the deletion product/i);
});

test("the app shell and the report describe designs from one list", async () => {
  // These were two lists. editionConfig.js filtered its copy by build edition, so a
  // narrowed build made getProjectTypeMeta fall back to entry [0] and label a tagging
  // design "SNP knock-in" in a downloadable record - which is why reportHtml.js kept a
  // private duplicate. With the edition gone there is one list, and this pins it: a type
  // added to the UI cannot silently be unrenderable by the report.
  const { PROJECT_TYPES } = await import("../src/appConfig.js");
  const { DESIGN_TYPES } = await import("../src/designTypes.js");
  assert.equal(PROJECT_TYPES, DESIGN_TYPES, "the UI list is no longer the canonical list");
  DESIGN_TYPES.forEach((entry) => {
    assert.equal(getProjectTypeMeta(entry.id).id, entry.id, `report cannot label design type ${entry.id}`);
  });
  // Fallback is still needed for unknown ids, but it must not silently mislabel a real one.
  assert.equal(getProjectTypeMeta("nonsense").id, DESIGN_TYPES[0].id);
});

test("no build-time edition switch has crept back in", () => {
  // The community edition was an untested build-time flag that no deployment set. Its
  // reintroduction would take reportHtml.js back to a private list, and importing
  // import.meta.env into a shared module makes it unloadable under `node --test`.
  const shared = ["appConfig.js", "designTypes.js", "reportHtml.js", "reportModel.js", "designEngine.js"];
  // Comments are stripped first: these modules deliberately document the removal, and a
  // guard that forbids naming the thing it guards against is a guard nobody can explain.
  const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  shared.forEach((name) => {
    const source = stripComments(readFileSync(path.join(here, "..", "src", name), "utf8"));
    assert.ok(!/import\.meta\.env/.test(source), `${name} reads import.meta.env and cannot load in node`);
    assert.ok(!/EDITION_CONFIG|IS_COMMUNITY_EDITION/.test(source), `${name} reintroduces an edition switch`);
  });
  // And the module itself must be gone, not merely unreferenced.
  assert.equal(existsSync(path.join(here, "..", "src", "editionConfig.js")), false, "editionConfig.js is back");
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


// --- the shared release verdict --------------------------------------------------------
//
// The on-screen report and the downloadable HTML used to describe release state
// differently: the HTML led with BLOCKED / REVIEW REQUIRED / READY, while the screen a
// reviewer actually reads showed only a nine-row checklist that graded a hard blocker as
// "warn" and never stated a status at all. Both now render one getReleaseVerdict object.

test("every design resolves to exactly one of the three release states", async () => {
  const { getReleaseVerdict } = await import("../src/releaseVerdict.js");
  [BLOCKED, REVIEW, READY].forEach((entry) => {
    const { result, readiness } = render(entry.reference, entry.type, entry.opts);
    const verdict = getReleaseVerdict(result);
    assert.ok(["blocked", "review", "ready"].includes(verdict.status));
    assert.equal(verdict.status, readiness.status, "verdict disagrees with procurement readiness");
    assert.equal(verdict.label, STATUS_LABEL[readiness.status]);
    assert.ok(verdict.lead.length > 20, "verdict has no lead sentence");
  });
});

test("only a ready design is orderable - review is not a green light", async () => {
  // The distinction the donor badge originally missed by treating "not blocked" as
  // orderable. A design awaiting an external specificity check must not read as go.
  const { getReleaseVerdict, RELEASE_VERDICT_STYLES } = await import("../src/releaseVerdict.js");
  assert.deepEqual(Object.keys(RELEASE_VERDICT_STYLES).sort(), ["blocked", "ready", "review"]);

  const blocked = getReleaseVerdict(render(BLOCKED.reference, BLOCKED.type, BLOCKED.opts).result);
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.orderable, false);
  assert.ok(blocked.blockers.length > 0, "a blocked design must state why");

  // The middle state is the one that matters here: `status !== "blocked"` and
  // `status === "ready"` agree on both extremes and differ only on review.
  const review = getReleaseVerdict(render(REVIEW.reference, REVIEW.type, REVIEW.opts).result);
  assert.equal(review.status, "review", "fixture must be review for this test to mean anything");
  assert.equal(review.orderable, false, "a design awaiting review must not read as orderable");
  assert.equal(review.blockers.length, 0, "review must not be blocked");
  assert.ok(review.warnings.length > 0, "a review design must state what is outstanding");

  const ready = getReleaseVerdict(render(READY.reference, READY.type, READY.opts).result);
  assert.equal(ready.status, "ready");
  assert.equal(ready.orderable, true);
  assert.equal(ready.blockers.length, 0);
  // Ready still carries the standing external checks; "ready" never means "nothing left".
  assert.ok(ready.standingRequirements.length > 0, "ready design dropped the standing requirements");
});

test("the HTML report states exactly the shared verdict, not a paraphrase of it", async () => {
  const { getReleaseVerdict, getReleaseVerdictSections } = await import("../src/releaseVerdict.js");
  [BLOCKED, REVIEW, READY].forEach((entry) => {
    const { html, result } = render(entry.reference, entry.type, entry.opts);
    const verdict = getReleaseVerdict(result);
    assert.ok(html.includes(verdict.label), `report omits ${verdict.label}`);
    assert.ok(html.includes(verdict.lead), "report paraphrases the lead sentence");
    // Every reason the verdict carries must appear, and the section headings with them.
    getReleaseVerdictSections(verdict).forEach((section) => {
      assert.ok(html.includes(section.title), `report omits the ${section.title} list`);
      section.items.forEach((item) => {
        assert.ok(html.includes(item), `report omits a ${section.title} entry: ${item.slice(0, 48)}`);
      });
    });
  });
});

test("the on-screen report renders the same verdict module as the download", () => {
  // App.jsx cannot be imported here - it is JSX. This asserts the wiring only; that the
  // panel actually appears on screen is checked against the deployed build.
  const app = readFileSync(path.join(here, "..", "src", "App.jsx"), "utf8");
  assert.match(app, /from "\.\/releaseVerdict"/, "App.jsx does not use the shared verdict");
  assert.match(app, /<ReleaseVerdictPanel result=/, "App.jsx never renders the verdict panel");
  // No second copy of the wording may exist outside the shared module.
  ["App.jsx", "reportHtml.js"].forEach((name) => {
    const source = readFileSync(path.join(here, "..", "src", name), "utf8");
    assert.ok(!/REVIEW REQUIRED/.test(source), `${name} hardcodes a release label`);
    assert.ok(!/RELEASE_VERDICT_STYLES\s*=/.test(source), `${name} redefines the verdict styles`);
  });
});

test("the verdict module stays loadable outside the browser", () => {
  const source = readFileSync(path.join(here, "..", "src", "releaseVerdict.js"), "utf8");
  assert.ok(!/from "react"/.test(source), "releaseVerdict.js imports react");
  assert.ok(!/import\.meta\.env/.test(source), "releaseVerdict.js reads import.meta.env");
  const bare = source.match(/from "\.\/[A-Za-z0-9_/-]+"/g) || [];
  assert.deepEqual(bare, [], `extension-less imports break node --test: ${bare.join(", ")}`);
});
