import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseGB } from "../src/designEngine.js";
import { normalizeGenBankToTranscriptModel } from "../src/transcriptModel.js";
import { readGenomicReferenceMetadata, designGenomicSnp } from "../src/genomicSnp.js";
import { blockingPolicyFor } from "../src/genomicBlocking.js";
import { FETCH_ORIGINS, GeneFetchError, SNP_FLANK, buildGenBank, cdnaCoordinate, cdnaFromVariantName, cdsToGenomic, fetchGeneReference, fetchVariantReference, parseGeneQuery, searchClinVar, translateDna } from "../src/geneFetch.js";

// Responses recorded from Ensembl REST, NCBI Datasets and NCBI E-utilities on 2026-10-16 (public data; transcripts trimmed to the
// MANE Select one plus two others so selection is still exercised). Tests replay them; nothing here touches the network.
const here = path.dirname(fileURLToPath(import.meta.url));
const store = JSON.parse(fs.readFileSync(path.join(here, "fixtures", "gene-fetch", "responses.json"), "utf8"));
const DATE = new Date("2026-10-16T00:00:00Z");
const noSleep = async () => {};
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => JSON.parse(body), text: async () => body });
const replay = (extra = {}) => async (url) => {
  for (const [needle, handler] of Object.entries(extra)) if (url.includes(needle)) return handler(url);
  const hit = store[url];
  return hit ? reply(hit.status, hit.body) : reply(404, JSON.stringify({ error: `no recording for ${url}` }));
};
const opts = (extra) => ({ fetchImpl: replay(extra), sleep: noSleep, date: DATE });

/** Absolute genomic intervals of a built record's exon or CDS features, from its Location comment. */
function genomicFeatures(text, type) {
  const meta = readGenomicReferenceMetadata(text); const rec = parseGB(text);
  const nums = (loc) => (loc.match(/\d+/g) || []).map(Number);
  const out = [];
  for (const f of rec.feats.filter((x) => x.type === type)) {
    const n = nums(f.loc);
    for (let i = 0; i < n.length; i += 2) {
      const [s, e] = [n[i], n[i + 1]];
      out.push(meta.orientation === 1 ? [meta.start + s - 1, meta.start + e - 1] : [meta.end - e + 1, meta.end - s + 1]);
    }
  }
  return out.sort((a, b) => a[0] - b[0]);
}
const baseAt = (text, position) => {
  const meta = readGenomicReferenceMetadata(text); const rec = parseGB(text);
  const comp = { A: "T", C: "G", G: "C", T: "A" };
  return meta.orientation === 1 ? rec.seq[position - meta.start] : comp[rec.seq[meta.end - position]];
};

test("queries are classified without guessing", () => {
  assert.equal(parseGeneQuery("ptpro").kind, "symbol");
  assert.equal(parseGeneQuery("PTPRO-201").kind, "transcript-name");
  assert.deepEqual(parseGeneQuery("ENST00000281171.9"), { kind: "ensembl-transcript", id: "ENST00000281171", text: "ENST00000281171.9" });
  assert.equal(parseGeneQuery("ENSG00000151490").kind, "ensembl-gene");
  assert.equal(parseGeneQuery("ENSMUST00000000001").kind, "ensembl-transcript");
  assert.equal(parseGeneQuery("nm_030667.3").accession, "NM_030667.3");
  assert.equal(parseGeneQuery("5800").kind, "ncbi-gene-id");
  assert.throws(() => parseGeneQuery("  "), GeneFetchError);
  assert.throws(() => parseGeneQuery("not a gene!"), GeneFetchError);
});

test("an Ensembl gene becomes a reference the existing parsers accept unchanged", async () => {
  const r = await fetchGeneReference({ query: "MYD88", source: "ensembl", ...opts() });
  assert.ok(!r.genbank.includes("\r"));
  assert.equal(r.summary.transcriptId, "ENST00000650905.2");
  assert.equal(r.summary.mane, "NM_002468.5");
  assert.deepEqual(r.summary.warnings, []);
  assert.equal(r.fileName, "MYD88_ENST00000650905.gb");
  const rec = parseGB(r.genbank); const model = normalizeGenBankToTranscriptModel(rec, { expectedGene: "MYD88" });
  assert.deepEqual(model.referenceIssues, []);
  assert.equal(model.gene, "MYD88");
  assert.equal(model.exons.length, 5);
  assert.equal(model.proteinLength, 296);
  assert.equal(model.cdsSequence.slice(0, 3), "ATG");
  const meta = readGenomicReferenceMetadata(r.genbank);
  assert.equal(meta.assembly, "GRCh38"); assert.equal(meta.chromosome, "3"); assert.equal(meta.orientation, 1);
  assert.equal(meta.end - meta.start + 1, rec.seq.length);
  const cdsFeature = rec.feats.find((f) => f.type === "CDS");
  assert.equal(cdsFeature.q.translation, translateDna(model.cdsSequence).replace(/\*$/, ""));
  assert.equal(cdsFeature.q.gene, "MYD88");
  assert.equal(cdsFeature.q.transcript_id, "ENST00000650905.2");
});

test("the flank is a gene span plus 1 kb on each side", async () => {
  const r = await fetchGeneReference({ query: "MYD88", source: "ensembl", ...opts() });
  const meta = readGenomicReferenceMetadata(r.genbank);
  const gene = parseGB(r.genbank).feats.find((f) => f.type === "gene");
  const [a, b] = gene.loc.split("..").map(Number);
  assert.equal(a, 1001);
  assert.equal(meta.end - meta.start + 1 - b, 1000);
});

test("Ensembl and NCBI give the same exons, coding sequence and bases for the same gene", async () => {
  for (const gene of ["MYD88", "HBB"]) {
    const ens = await fetchGeneReference({ query: gene, source: "ensembl", ...opts() });
    const ncbi = await fetchGeneReference({ query: gene, source: "ncbi", ...opts() });
    assert.deepEqual(genomicFeatures(ncbi.genbank, "exon"), genomicFeatures(ens.genbank, "exon"), `${gene} exons`);
    assert.deepEqual(genomicFeatures(ncbi.genbank, "CDS"), genomicFeatures(ens.genbank, "CDS"), `${gene} CDS`);
    const cds = genomicFeatures(ens.genbank, "CDS");
    for (const position of [cds[0][0], cds[0][1], cds[cds.length - 1][1]]) assert.equal(baseAt(ncbi.genbank, position), baseAt(ens.genbank, position), `${gene} base ${position}`);
    assert.equal(ncbi.summary.proteinLength, ens.summary.proteinLength);
    assert.deepEqual(ncbi.summary.warnings, []);
  }
});

test("a reverse-strand gene is written in sense orientation", async () => {
  for (const source of ["ensembl", "ncbi"]) {
    const r = await fetchGeneReference({ query: "HBB", source, ...opts() });
    const meta = readGenomicReferenceMetadata(r.genbank);
    assert.equal(meta.orientation, -1, source);
    const model = normalizeGenBankToTranscriptModel(parseGB(r.genbank), { expectedGene: "HBB" });
    assert.deepEqual(model.referenceIssues, [], source);
    assert.equal(model.cdsSequence.slice(0, 3), "ATG");
    assert.ok(translateDna(model.cdsSequence).startsWith("MVHLTPEEKSAVTALWGKV"), source);
    assert.equal(model.proteinLength, 147);
    assert.equal(model.exons.length, 3);
    // Sickle-cell variant chr11:5,227,002 is c.20 of HBB; the forward-strand base is T.
    const spec = r.spec;
    assert.equal(cdnaCoordinate(spec, 5227002), "c.20", source);
    assert.equal(baseAt(r.genbank, 5227002), "T", source);
  }
});

test("cdsToGenomic maps transcript coordinates on both strands", () => {
  const exons = [[100, 119], [200, 229], [300, 319]]; // 20 + 30 + 20 bases
  assert.deepEqual(cdsToGenomic(exons, 1, 11, 60), [[110, 119], [200, 229], [300, 309]]);
  // On the reverse strand transcript base 1 is genomic 319: bases 11-20 are 309..300, 21-50 the middle exon, 51-60 are 119..110.
  assert.deepEqual(cdsToGenomic(exons, -1, 11, 60), [[110, 119], [200, 229], [300, 309]]);
  assert.deepEqual(cdsToGenomic(exons, -1, 1, 70), exons);
  assert.deepEqual(cdsToGenomic(exons, -1, 21, 50), [[200, 229]]);
  assert.deepEqual(cdsToGenomic(exons, 1, 1, 70), exons);
});

test("cDNA coordinates name coding, intronic and untranslated positions on both strands", () => {
  const seq = "A".repeat(400);
  const plus = { strand: 1, regionStart: 1001, regionEnd: 1400, seq, exons: [[1101, 1130], [1201, 1230], [1301, 1330]], cds: [[1111, 1130], [1201, 1230], [1301, 1310]] };
  assert.equal(cdnaCoordinate(plus, 1111), "c.1");
  assert.equal(cdnaCoordinate(plus, 1130), "c.20");
  assert.equal(cdnaCoordinate(plus, 1201), "c.21");
  assert.equal(cdnaCoordinate(plus, 1131), "c.20+1");
  assert.equal(cdnaCoordinate(plus, 1200), "c.21-1");
  assert.equal(cdnaCoordinate(plus, 1110), "c.-1");
  assert.equal(cdnaCoordinate(plus, 1101), "c.-10");
  assert.equal(cdnaCoordinate(plus, 1311), "c.*1");
  assert.equal(cdnaCoordinate(plus, 1330), "c.*20");
  assert.equal(cdnaCoordinate(plus, 1050), null);
  // The same transcript on the reverse strand: genomic coordinates mirror inside the region.
  const mirror = (p) => 1001 + 1400 - p;
  const minus = { strand: -1, regionStart: 1001, regionEnd: 1400, seq, exons: plus.exons.map(([a, b]) => [mirror(b), mirror(a)]), cds: plus.cds.map(([a, b]) => [mirror(b), mirror(a)]) };
  for (const p of [1111, 1130, 1201, 1131, 1200, 1110, 1101, 1311, 1330]) assert.equal(cdnaCoordinate(minus, mirror(p)), cdnaCoordinate(plus, p), `position ${p}`);
});

test("a single-exon gene round-trips through the parsers", () => {
  const seq = `${"C".repeat(60)}ATG${"GCT".repeat(40)}TAA${"C".repeat(60)}`;
  const spec = { source: "ensembl", gene: { symbol: "ONEEXON", id: "ENSG1" }, transcript: { id: "ENST1.1", name: "ONEEXON-201", protein: "ENSP1.1", proteinLength: 41, mane: "", canonical: true },
    assembly: "GRCh38", chromosome: "1", strand: 1, regionStart: 5001, regionEnd: 5000 + seq.length, geneStart: 5061, geneEnd: 5000 + 60 + 126, seq, exons: [[5061, 5186]], cds: [[5061, 5186]], flank: 60, release: "116", provenance: "test" };
  const built = buildGenBank(spec, { date: DATE });
  assert.deepEqual(built.issues, []);
  const model = normalizeGenBankToTranscriptModel(parseGB(built.text));
  assert.equal(model.cdsSequence.length, 126);
  assert.equal(model.proteinLength, 41);
  assert.deepEqual(model.referenceIssues, []);
});

test("a record whose coding sequence is wrong says so instead of hiding it", () => {
  const seq = `${"C".repeat(30)}GGG${"GCT".repeat(10)}TAA${"C".repeat(30)}`;
  const spec = { source: "ensembl", gene: { symbol: "BAD", id: "G" }, transcript: { id: "T.1", name: "BAD-201", proteinLength: 11, mane: "" }, assembly: "GRCh38", chromosome: "1", strand: 1, regionStart: 1, regionEnd: seq.length, geneStart: 31, geneEnd: 66, seq, exons: [[31, 66]], cds: [[31, 66]], flank: 30, provenance: "test" };
  const built = buildGenBank(spec, { date: DATE });
  assert.ok(built.issues.some((m) => /not ATG/.test(m)));
  assert.throws(() => buildGenBank({ ...spec, seq: seq.slice(1) }, { date: DATE }), GeneFetchError);
});

test("transcript names, transcript IDs and aliases resolve", async () => {
  const gene = JSON.parse(store["https://rest.ensembl.org/lookup/symbol/homo_sapiens/HBB?expand=1&mane=1&content-type=application/json"].body);
  const transcript = gene.Transcript.find((t) => t.MANE?.length);
  const named = await fetchGeneReference({ query: "HBB-201", source: "ensembl", ...opts() });
  assert.equal(named.summary.transcriptName, "HBB-201");
  await assert.rejects(fetchGeneReference({ query: "HBB-999", source: "ensembl", ...opts() }), /no transcript named HBB-999/);
  const byTranscript = await fetchGeneReference({ query: "ENST00000335295.4", ...opts({
    [`lookup/id/${transcript.id}?`]: () => reply(200, JSON.stringify({ ...transcript, object_type: "Transcript", Parent: gene.id })),
    [`lookup/id/${gene.id}?`]: () => reply(200, JSON.stringify(gene)),
  }) });
  assert.equal(byTranscript.summary.transcriptId, "ENST00000335295.4");
  const alias = await fetchGeneReference({ query: "BETAGLOBIN", ...opts({
    "lookup/symbol/homo_sapiens/BETAGLOBIN": () => reply(400, JSON.stringify({ error: "No valid lookup found for symbol BETAGLOBIN" })),
    "xrefs/symbol/homo_sapiens/BETAGLOBIN": () => reply(200, JSON.stringify([{ id: "LRG_1", type: "gene" }, { id: gene.id, type: "gene" }])),
    [`lookup/id/${gene.id}?`]: () => reply(200, JSON.stringify(gene)),
  }) });
  assert.equal(alias.summary.gene, "HBB");
  await assert.rejects(fetchGeneReference({ query: "NOSUCHGENE", ...opts({
    "lookup/symbol/homo_sapiens/NOSUCHGENE": () => reply(400, JSON.stringify({ error: "x" })),
    "xrefs/symbol/homo_sapiens/NOSUCHGENE": () => reply(200, "[]"),
  }) }), /no human gene called NOSUCHGENE/);
});

test("NCBI accepts a RefSeq accession and refuses Ensembl transcript names", async () => {
  const report = store["https://api.ncbi.nlm.nih.gov/datasets/v2/gene/symbol/MYD88/taxon/9606/product_report"].body;
  const r = await fetchGeneReference({ query: "NM_002468.5", ...opts({ "gene/accession/NM_002468.5/product_report": () => reply(200, report) }) });
  assert.equal(r.summary.transcriptId, "NM_002468.5");
  assert.equal(r.summary.source, "ncbi");
  await assert.rejects(fetchGeneReference({ query: "NM_000000.1", ...opts({ "gene/accession/NM_000000.1/product_report": () => reply(200, report) }) }), /not a protein-coding transcript/);
  await assert.rejects(fetchGeneReference({ query: "MYD88-201", source: "ncbi", ...opts() }), /Ensembl names/);
});

test("network trouble is reported plainly and transient errors are retried", async () => {
  await assert.rejects(fetchGeneReference({ query: "MYD88", fetchImpl: async () => { throw new TypeError("Failed to fetch"); }, sleep: noSleep }), /Could not reach Ensembl/);
  await assert.rejects(fetchGeneReference({ query: "MYD88", fetchImpl: async () => reply(403, JSON.stringify({ error: "Forbidden" })), sleep: noSleep }), /Ensembl returned 403: Forbidden/);
  let calls = 0; const lookup = "lookup/symbol/homo_sapiens/MYD88";
  const flaky = replay({ [lookup]: (url) => { calls += 1; return calls < 3 ? reply(503, "") : reply(store[url].status, store[url].body); } });
  const r = await fetchGeneReference({ query: "MYD88", fetchImpl: flaky, sleep: noSleep, date: DATE });
  assert.equal(r.summary.gene, "MYD88");
  assert.equal(calls, 3);
});

test("ClinVar lookups separate designable substitutions from everything else", async () => {
  const myd = await searchClinVar("rs387907272", opts());
  assert.equal(myd.variants.length, 1);
  assert.deepEqual(myd.variants[0].variant, { assembly: "GRCh38", chromosome: "3", position: 38141150, ref: "T", alt: "C" });
  assert.equal(myd.variants[0].gene, "MYD88"); assert.equal(myd.variants[0].supported, true);
  assert.equal(myd.variants[0].cdnaChange, "c.755T>C");
  const ptpro = await searchClinVar("NM_030667.3:c.2829+1G>A", opts());
  assert.deepEqual(ptpro.variants[0].variant, { assembly: "GRCh38", chromosome: "12", position: 15569499, ref: "G", alt: "A" });
  assert.equal(ptpro.variants[0].significance, "Pathogenic");
  assert.equal(cdnaFromVariantName(ptpro.variants[0].cdnaChange), "c.2829+1");
  const haplotype = await searchClinVar("446748", opts());
  assert.equal(haplotype.variants[0].supported, false);
  assert.match(haplotype.variants[0].unsupportedReason, /haplotype/);
  const vcv = await searchClinVar("VCV000015333", opts());
  assert.equal(vcv.variants[0].geneStrand, -1);
  await assert.rejects(searchClinVar("nothing here", opts({ "esearch.fcgi": () => reply(200, JSON.stringify({ esearchresult: { count: "0", idlist: [] } })) })), /no record matching/);
  await assert.rejects(searchClinVar("", opts()), GeneFetchError);
});

test("a ClinVar variant becomes a verified reference with its cDNA coordinate", async () => {
  const found = (await searchClinVar("rs387907272", opts())).variants[0];
  const ref = await fetchVariantReference(found, opts());
  assert.equal(ref.cdna, "c.755"); assert.equal(ref.clinvarCdna, "c.755");
  assert.deepEqual(ref.summary.warnings, []);
  assert.deepEqual(ref.input, { gene: "MYD88", assembly: "GRCh38", chromosome: "3", referenceStart: 38132552, position: 38141150, ref: "T", alt: "C", forwardConfirmed: true });
  assert.equal(baseAt(ref.genbank, 38141150), "T");
  // The reference the tool builds is accepted by the Genomic SNP designer as it stands.
  for (const flags of [{ addBlocking: true, coDelivery: true }, { addBlocking: false, coDelivery: true }]) {
    const design = designGenomicSnp(ref.genbank, { ...ref.input, ...flags, blockingPolicy: blockingPolicyFor(flags), deliveryMethod: "rnp" });
    assert.equal(design.err, undefined, JSON.stringify(flags));
    assert.equal(design.type, "genomic-snv");
    assert.ok(design.candidates.length >= 1);
    assert.equal(design.input.position, 38141150);
  }
});

test("a variant the tool cannot design from is refused before anything is built", async () => {
  const haplotype = (await searchClinVar("446748", opts())).variants[0];
  await assert.rejects(fetchVariantReference(haplotype, opts()), /haplotype/);
  const found = (await searchClinVar("rs387907272", opts())).variants[0];
  // A reference base that disagrees with ClinVar is an error, never a silent substitution.
  const wrong = { ...found, variant: { ...found.variant, ref: "G" } };
  await assert.rejects(fetchVariantReference(wrong, opts()), /disagree/);
  // A different transcript numbering is reported, not hidden.
  const renumbered = await fetchVariantReference({ ...found, cdnaChange: "c.731T>C" }, opts());
  assert.ok(renumbered.summary.warnings.some((m) => /c\.731/.test(m) && /c\.755/.test(m)));
});

test("cDNA positions are read from ClinVar names in every form ClinVar uses", () => {
  assert.equal(cdnaFromVariantName("NM_030667.3(PTPRO):c.2829+1G>A"), "c.2829+1");
  assert.equal(cdnaFromVariantName("c.755T>C"), "c.755");
  assert.equal(cdnaFromVariantName("NM_1.2(GENE):c.-12G>A (p.?)"), "c.-12");
  assert.equal(cdnaFromVariantName("c.*5A>G"), "c.*5");
  assert.equal(cdnaFromVariantName("c.1066-3C>T"), "c.1066-3");
  assert.equal(cdnaFromVariantName("NM_000518.4(HBB):c.[205C>T;20A>T]"), "");
  assert.equal(cdnaFromVariantName(""), "");
});

test("an outage names the other source for a gene symbol but not for an accession", async () => {
  const down = async () => reply(503, "");
  await assert.rejects(fetchGeneReference({ query: "MYD88", source: "ensembl", fetchImpl: down, sleep: noSleep }), /Ensembl returned 503.*NCBI can resolve gene symbols too/);
  await assert.rejects(fetchGeneReference({ query: "MYD88", source: "ncbi", fetchImpl: down, sleep: noSleep }), /NCBI Datasets returned 503.*Ensembl can resolve gene symbols too/);
  await assert.rejects(fetchGeneReference({ query: "NM_002468.5", fetchImpl: down, sleep: noSleep }), (error) => !/can resolve gene symbols/.test(error.message));
});

test("Genomic SNP references carry enough context for the optional SpliceAI check", () => {
  // scripts/splice_check.py needs 400 bases of window plus 5,000 of SpliceAI context on each side of the edit.
  assert.ok(SNP_FLANK >= 5400);
});

test("every origin the fetchers call is allowed by the deployed Content-Security-Policy, and nothing broader", async () => {
  // The Vercel deployment sends a CSP with connect-src. A browser blocks any origin it does not list, and reports only "Failed to fetch",
  // which the app shows as "Could not reach ClinVar". Node and jsdom do not enforce CSP, so this compares the header with the requests directly.
  const config = JSON.parse(fs.readFileSync(path.join(here, "..", "..", "vercel.json"), "utf8"));
  const policy = config.headers.flatMap((h) => h.headers).find((h) => h.key === "Content-Security-Policy").value;
  const directives = Object.fromEntries(policy.split(";").map((d) => d.trim()).filter(Boolean).map((d) => { const [name, ...values] = d.split(/\s+/); return [name, values]; }));
  const allowed = directives["connect-src"];
  assert.ok(allowed.includes("'self'"));
  const seen = new Set();
  const recording = async (url) => { seen.add(new URL(url).origin); return replay()(url); };
  const o = { fetchImpl: recording, sleep: noSleep, date: DATE };
  await fetchGeneReference({ query: "MYD88", source: "ensembl", ...o });
  await fetchGeneReference({ query: "MYD88", source: "ncbi", ...o });
  const found = (await searchClinVar("rs387907272", o)).variants[0];
  await fetchVariantReference(found, o);
  assert.deepEqual([...seen].sort(), [...FETCH_ORIGINS].sort(), "the fixtures exercise every origin the module declares");
  for (const origin of seen) assert.ok(allowed.includes(origin), `${origin} is not in connect-src`);
  // Exactly 'self' plus those origins: no wildcard, no scheme-wide source.
  assert.deepEqual(allowed.filter((token) => token !== "'self'").sort(), [...FETCH_ORIGINS].sort());
});
