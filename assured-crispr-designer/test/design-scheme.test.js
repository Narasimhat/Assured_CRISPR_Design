// Design scheme figure: drawn from the design result, shown in the app and embedded in the report.
//
// The figure is only useful if what it draws is what the engine designed, so these tests check the
// drawn numbers and sequences against the result (and against the genome) rather than snapshotting
// markup: guide distances, donor and amplicon sizes, the sequence rows at the insertion site, and
// that every design type renders to well-formed SVG without overflow, NaN or unescaped text.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { runDesign } from "../src/designEngine.js";
import {
  buildDesignSchemeCaption, buildDesignSchemeFilename, buildDesignSchemeSvg, supportsDesignScheme,
} from "../src/designScheme.js";
import { buildDesignSchemeHtml, buildReportHtml } from "../src/reportHtml.js";

const fixture = (name) => readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", name), "utf8");

const CASES = [
  { key: "ct", label: "NR2F2 C-terminal SD40-V5 (GGGGS)x3", args: ["ct", "nr2f2-ng016753.gb", "", "GGGGS3-SD40-GGGGS-V5", 250, { expectedGene: "NR2F2" }] },
  { key: "ct-asym", label: "NR2F2 C-terminal, automatic 250/150 block with one guide", args: ["ct", "nr2f2-ng016753.gb", "", "GGGGS3-SD40-GGGGS-V5", "", { expectedGene: "NR2F2", donorFormat: "auto", autoTrimArms: true, customGuides: ["CAGTTTTAACTGGCCGTATA"] }] },
  { key: "ct-builtin", label: "NR2F2 C-terminal SD40-V5 (built-in cassette)", args: ["ct", "nr2f2-ng016753.gb", "", "SD40-V5", 250, { expectedGene: "NR2F2" }] },
  { key: "nt", label: "N-terminal EGFP", args: ["nt", "synthetic-tagging.gb", "", "N:EGFP-Linker", 250, { expectedGene: "TAGME" }] },
  { key: "it", label: "internal SPOT tag", args: ["it", "synthetic-tagging.gb", "F50", "SPOT", 250, { expectedGene: "TAGME" }] },
  { key: "pm", label: "APOE R154S", args: ["pm", "apoe-r154s.gb", "R154S", "", 250, { expectedGene: "APOE", deliveryMethod: "rnp" }] },
  { key: "ko", label: "two-guide knockout", args: ["ko", "synthetic-tagging.gb", "", "", 400, { expectedGene: "TAGME" }] },
];

const designs = {};
const design = (key) => {
  if (!designs[key]) {
    const { args } = CASES.find((item) => item.key === key);
    const [type, reference, mutation, tag, arm, options] = args;
    designs[key] = runDesign(type, fixture(reference), mutation, tag, arm, { deliveryMethod: "rnp", ...options });
    assert.equal(designs[key].err, undefined, `design failed: ${designs[key].err}`);
  }
  return designs[key];
};

const revcomp = (seq) => [...seq].reverse().map((base) => ({ A: "T", C: "G", G: "C", T: "A" }[base])).join("");

// Minimal well-formedness check: every opening tag is closed in order, attributes are quoted.
function assertWellFormed(svg) {
  const stack = [];
  for (const match of svg.matchAll(/<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g)) {
    const [, closing, name, , selfClosing] = match;
    if (selfClosing) continue;
    if (closing) assert.equal(stack.pop(), name, `mismatched </${name}>`);
    else stack.push(name);
  }
  assert.deepEqual(stack, [], "unclosed elements");
  // Everything between tags must be free of raw angle brackets and bare ampersands.
  const stripped = svg.replace(/<[^>]*>/g, "\u0000");
  assert.ok(!/[<>]/.test(stripped), "raw angle bracket in text");
  assert.ok(!/&(?!amp;|lt;|gt;|quot;)/.test(stripped), "unescaped ampersand in text");
}

// Concatenated glyphs of every monospace sequence row, in drawing order.
function sequenceRows(svg) {
  return [...svg.matchAll(/<g font-family="Consolas[^>]*>(.*?)<\/g>/g)]
    .map((group) => [...group[1].matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((glyph) => glyph[1]).join(""));
}

const tagAnchor = (result) => (result.type === "ct" ? result.sp - 1 : result.gb.cdsSegments[0][0]);

CASES.forEach(({ key, label }) => {
  test(`${label}: renders well-formed SVG with no NaN, undefined or overflow`, () => {
    const result = design(key);
    assert.equal(supportsDesignScheme(result), true);
    const svg = buildDesignSchemeSvg(result);
    assert.ok(svg.startsWith("<svg xmlns=\"http://www.w3.org/2000/svg\""));
    assert.ok(svg.endsWith("</svg>"));
    assert.ok(!/NaN|undefined|Infinity|\bnull\b/.test(svg), "bad value in markup");
    assertWellFormed(svg);
    const width = Number(svg.match(/viewBox="0 0 (\d+)/)[1]);
    for (const match of svg.matchAll(/<rect x="([-\d.]+)" y="[-\d.]+" width="([-\d.]+)"/g)) {
      const [x, w] = [Number(match[1]), Number(match[2])];
      assert.ok(x >= -0.5 && x + w <= width + 0.5, `rect outside canvas: x=${x} w=${w}`);
    }
    for (const match of svg.matchAll(/<line x1="([-\d.]+)" y1="[-\d.]+" x2="([-\d.]+)"/g)) {
      assert.ok(Number(match[1]) >= -0.5 && Number(match[2]) <= width + 0.5, "line outside canvas");
    }
    for (const match of svg.matchAll(/<text x="([-\d.]+)"/g)) {
      assert.ok(Number(match[1]) >= 0 && Number(match[1]) <= width, "text anchor outside canvas");
    }
  });

  test(`${label}: output is deterministic and carries the design title`, () => {
    const result = design(key);
    assert.equal(buildDesignSchemeSvg(result), buildDesignSchemeSvg(result));
    assert.ok(buildDesignSchemeSvg(result).includes(`<title>${result.gene}:`));
  });

  test(`${label}: every guide is labelled with its sequence and PAM`, () => {
    const result = design(key);
    const svg = buildDesignSchemeSvg(result);
    result.gs.forEach((guide, index) => {
      assert.ok(svg.includes(`gRNA${index + 1} ${guide.sp} + ${guide.pm}`), `guide ${index + 1} missing`);
      assert.ok(svg.includes(`GC ${guide.gc}%`));
    });
  });

  test(`${label}: report HTML embeds the scheme with a download link, ahead of the locus map`, () => {
    const result = design(key);
    const meta = { gene: result.gene, cellLine: "", irisId: "", parentId: "", projectType: result.type, mutation: "", tag: result.tag || "" };
    const html = buildReportHtml(meta, result, "fixture", null, [], null);
    const at = html.indexOf(">Design Scheme<");
    assert.ok(at > 0, "design scheme block missing from the report");
    assert.ok(html.includes(`download="${buildDesignSchemeFilename(result)}"`));
    assert.ok(html.includes("href=\"data:image/svg+xml;charset=utf-8,%3Csvg"));
    assert.ok(html.indexOf("<svg", at) > at);
    const locus = html.indexOf("Target Region Map");
    if (locus > 0) assert.ok(at < locus, "scheme should precede the locus map");
    assert.ok(html.includes("Suggested figure legend"));
  });
});

["ct", "ct-asym", "ct-builtin", "nt"].forEach((key) => {
  test(`${key}: guide distances in the figure equal the engine's distance to the insertion point`, () => {
    const result = design(key);
    const svg = buildDesignSchemeSvg(result);
    result.gs.forEach((guide) => {
      const where = `cut ${Math.abs(guide.d)} bp ${guide.d < 0 ? "5\u2032" : "3\u2032"} of the insertion point`;
      assert.ok(svg.includes(where), `expected "${where}"`);
      assert.equal(guide.cut - tagAnchor(result), guide.d, "figure anchor differs from the engine's insertion point");
    });
  });

  test(`${key}: donor, amplicon and protein sizes in the figure match the result`, () => {
    const result = design(key);
    const svg = buildDesignSchemeSvg(result);
    assert.ok(svg.includes(`${result.dl} bp: ${result.h5l} | ${result.il} | ${result.h3l}`), "donor composition");
    const genome = result.gb.genomicSequence.toUpperCase();
    const forward = genome.indexOf(result.ps[0].s.toUpperCase());
    const reverse = genome.indexOf(revcomp(result.ps[1].s.toUpperCase())) + result.ps[1].s.length;
    const wild = reverse - forward;
    assert.ok(svg.includes(`wild type, ${wild} bp`), `wild-type amplicon ${wild}`);
    assert.ok(svg.includes(`edited allele, ${wild + result.il - 3} bp`), "edited amplicon");
    const tagAa = result.donorAnnotations.filter((a) => a.priority === 1 && !/HA$|^Start$|^Stop$/i.test(a.label))
      .reduce((sum, a) => sum + (a.end - a.start) / 3, 0);
    assert.ok(svg.includes(`${result.prot} aa native + ${tagAa} aa tag = ${result.prot + tagAa} aa`), "protein layout");
  });

  test(`${key}: sequence rows show the genome flank and the donor cassette ends`, () => {
    const result = design(key);
    const rows = sequenceRows(buildDesignSchemeSvg(result));
    const genome = result.gb.genomicSequence.toUpperCase();
    const donor = result.donor.toUpperCase();
    const x0 = tagAnchor(result);
    const reference = result.type === "ct" ? genome.slice(x0 - 24, x0 + 15) : genome.slice(x0 - 12, x0 + 27);
    assert.ok(rows.includes(reference), "reference row does not match the genome");
    const cassette = donor.slice(result.h5l, result.h5l + result.il);
    assert.ok(rows.some((row) => row.includes(cassette.slice(0, 12) + cassette.slice(-12))), "edited row does not carry the cassette ends");
    assert.equal(result.type === "ct" ? cassette.slice(-3) : cassette.slice(0, 3), result.type === "ct" ? "TAA" : "ATG");
  });
});

test("ct: the edited-allele amplicon bar is longer than the wild-type bar by exactly the net insertion", () => {
  const result = design("ct");
  const svg = buildDesignSchemeSvg(result);
  const arm = [...svg.matchAll(/<rect x="[-\d.]+" y="[-\d.]+" width="([\d.]+)" height="16" fill="#c9d1dc"/g)][0];
  const pixelsPerBp = Number(arm[1]) / result.h5l;
  const span = (color) => {
    const bar = svg.match(new RegExp(`<line x1="([-\\d.]+)" y1="[-\\d.]+" x2="([-\\d.]+)" y2="[-\\d.]+" stroke="${color}" stroke-width="1.1"`));
    return Number(bar[2]) - Number(bar[1]);
  };
  const extra = (span("#0F766E") - span("#222222")) / pixelsPerBp;
  assert.ok(Math.abs(extra - (result.il - 3)) < 0.5, `bars differ by ${extra} bp, expected ${result.il - 3}`);
});

test("NR2F2 SD40-V5: the figure names every cassette element and the silent blocking change", () => {
  const result = design("ct");
  const svg = buildDesignSchemeSvg(result);
  ["Linker (GGGGS)x3", "SD40", "GGGGS spacer", "V5 tag", "Stop"].forEach((label) => assert.ok(svg.includes(`>${label}<`), label));
  assert.ok(svg.includes("P409P CCG&gt;CCC"), "silent blocking change P409P");
  assert.ok(svg.includes("713 bp: 250 | 213 | 250"));
  assert.ok(svg.includes("484 aa"), "tagged protein length");
});

test("knockout figure draws the deletion between the cuts and both amplicon sizes", () => {
  const result = design("ko");
  const svg = buildDesignSchemeSvg(result);
  const cuts = result.gs.map((guide) => guide.cut);
  const deletion = Math.max(...cuts) - Math.min(...cuts);
  assert.equal(deletion, result.deletionOutcome.deletionSize);
  assert.ok(svg.includes(`deletion between the cuts, ${deletion} bp`));
  assert.ok(svg.includes("frameshift predicted"));
  const genome = result.gb.genomicSequence.toUpperCase();
  const forward = genome.indexOf(result.ps[0].s.toUpperCase());
  const reverse = genome.indexOf(revcomp(result.ps[1].s.toUpperCase())) + result.ps[1].s.length;
  assert.ok(svg.includes(`wild type, ${reverse - forward} bp`));
  assert.ok(svg.includes(`deletion allele, ${reverse - forward - deletion} bp`));
});

test("ssODN figures draw one donor row per guide with its length and the edit label", () => {
  const pm = design("pm");
  const svgPm = buildDesignSchemeSvg(pm);
  pm.os.forEach((donor) => assert.ok(svgPm.includes(`, ${donor.donorEnd - donor.donorStart} nt`)));
  assert.ok(svgPm.includes("R154S"));
  const it = design("it");
  const svgIt = buildDesignSchemeSvg(it);
  assert.ok(svgIt.includes(`insert ${it.il} bp (${it.tag})`));
  it.os.forEach((donor) => assert.ok(svgIt.includes(`, ${donor.donorEnd - donor.donorStart + it.il} nt`)));
});

test("text from the design is escaped, so a hostile gene or tag name cannot inject markup", () => {
  const hostile = { ...design("ct"), gene: "A<img src=x onerror=alert(1)>&\"B", tag: "T</text><script>x</script>" };
  const svg = buildDesignSchemeSvg(hostile);
  assert.ok(svg.length > 0);
  assert.ok(!svg.includes("<img") && !svg.includes("<script"));
  assert.ok(svg.includes("A&lt;img src=x onerror=alert(1)&gt;&amp;&quot;B"));
  assertWellFormed(svg);
  const caption = buildDesignSchemeCaption(hostile);
  assert.ok(caption.includes("<img"), "caption is plain text; the HTML wrappers escape it");
  // The scheme block escapes everything it embeds (the rest of the report predates this check).
  const block = buildDesignSchemeHtml(hostile);
  assert.ok(block.includes("Download SVG"));
  assert.ok(!block.includes("<img src=x onerror") && !block.includes("<script"), "report block must not contain injected markup");
  assert.ok(block.includes("A&lt;img src=x onerror=alert(1)&gt;&amp;&quot;B"));
});

test("results the figure cannot draw return an empty string instead of throwing", () => {
  assert.equal(buildDesignSchemeSvg(undefined), "");
  assert.equal(buildDesignSchemeSvg({ err: "no target" }), "");
  assert.equal(buildDesignSchemeSvg({ type: "ct" }), "");
  assert.equal(buildDesignSchemeSvg({ ...design("ct"), type: "unknown" }), "");
  assert.equal(buildDesignSchemeCaption(undefined), "");
  const broken = { ...design("ct"), donorAnnotations: [] };
  assert.equal(buildDesignSchemeSvg(broken), "");
});

test("responsive mode scales to the container; the default has fixed pixel dimensions", () => {
  const result = design("ct");
  assert.ok(/<svg[^>]*width="760" height="[\d.]+"/.test(buildDesignSchemeSvg(result)));
  assert.ok(/<svg[^>]*width="100%"/.test(buildDesignSchemeSvg(result, { responsive: true })));
});

test("figure legend is written from the design and leaves author fields in brackets", () => {
  const result = design("ct");
  const caption = buildDesignSchemeCaption(result);
  assert.ok(caption.includes("[cell line]"));
  assert.ok(caption.includes(result.gs[0].sp));
  assert.ok(caption.includes("250-bp 5\u2032 and a 250-bp 3\u2032 homology arm"));
  assert.ok(caption.includes("213 bp, 70 aa added"));
  assert.ok(caption.includes("P409P CCG>CCC"));
  assert.ok(!/NaN|undefined/.test(caption));
});

test("file names are filesystem-safe", () => {
  assert.equal(buildDesignSchemeFilename({ gene: "NR2F2", type: "ct" }), "NR2F2_ct_design_scheme.svg");
  assert.equal(buildDesignSchemeFilename({ gene: "a b/c:d", type: "pm" }), "a_b_c_d_pm_design_scheme.svg");
  assert.equal(buildDesignSchemeFilename({}), "design_scheme_design_scheme.svg");
});

test("point-mutation ssODNs are drawn with the blocking changes each one carries, including co-delivery", () => {
  const design = (coDeliveryBlocking) => {
    const result = runDesign("pm", fixture("apoe-r154s.gb"), "R176C", "", 250, { expectedGene: "APOE", deliveryMethod: "rnp", coDeliveryBlocking });
    assert.equal(result.err, undefined, result.err);
    return result;
  };
  const markers = (svg) => (svg.match(/<polygon/g) || []).length;
  const carried = (result) => result.os.reduce((total, donor) => total + donor.silentMutations.length, 0);
  const matched = design(false);
  const together = design(true);
  const svgMatched = buildDesignSchemeSvg(matched);
  const svgTogether = buildDesignSchemeSvg(together);
  // Matched ssODNs carry only their own guide's changes; co-delivery ssODNs carry every guide's.
  assert.ok(carried(together) > carried(matched), "co-delivery donors carry more blocking changes");
  assert.equal(markers(svgTogether) - markers(svgMatched), carried(together) - carried(matched));
  assert.ok(svgTogether.includes("ssODN1 (matched to gRNA1; also blocks gRNA2)") && svgTogether.includes("ssODN2 (matched to gRNA2; also blocks gRNA1)"));
  assert.ok(svgMatched.includes("ssODN1 (matched to gRNA1), ") && !svgMatched.includes("also blocks"));
});
