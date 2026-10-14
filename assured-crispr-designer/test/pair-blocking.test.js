import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { designGenomicSnp, buildGenomicSnpReport } from '../src/genomicSnp.js';
import { buildGenomicSequenceCsv } from '../src/genomicSequenceExport.js';
import { BLOCKING_POLICIES, isPairPolicy } from '../src/genomicBlocking.js';
import { CFD_PROTECTION_THRESHOLDS } from '../src/designEngine.js';
import {
  SPLICE_WINDOWS, SPLICE_CHECK_THRESHOLDS, classifyPosition, guideRole, createdSpliceDinucleotides,
  buildSpliceCheckRequest, applySpliceCheck, initialRecommendation,
} from '../src/pairBlocking.js';

// ---- unit tests on a hand-made exon model (0-based, end exclusive) --------------------------------------------------------------------
const model = { exons: [{ start: 100, end: 200, label: 'Exon 2' }, { start: 400, end: 500, label: 'Exon 3' }] };
const zone = (p) => classifyPosition(model, p).zone;

test('classifyPosition: donor, acceptor, exon edge, exon interior and deep intron', () => {
  assert.deepEqual([199, 198, 197].map(zone), ['donor-critical', 'donor-critical', 'donor-critical']);
  assert.deepEqual([196, 195].map(zone), ['exon-edge', 'exon-interior']);
  assert.deepEqual([100, 102].map(zone), ['acceptor-critical', 'acceptor-critical']);
  assert.deepEqual([103, 104].map(zone), ['exon-edge', 'exon-interior']);
  assert.deepEqual([200, 205].map(zone), ['donor-critical', 'donor-critical']);
  assert.equal(classifyPosition(model, 200).offset, '+1');
  assert.equal(zone(206), 'intron-deep');
  assert.deepEqual([399, 360].map(zone), ['acceptor-critical', 'acceptor-critical']);
  assert.equal(classifyPosition(model, 399).offset, '-1');
  assert.equal(classifyPosition(model, 360).offset, '-40');
  assert.equal(zone(359), 'intron-deep');
  assert.equal(zone(50), 'intron-deep');
  assert.equal(zone(900), 'intron-deep');
});

test('classifyPosition: windows are the documented constants; no annotation is unknown; CDS segments stand in for exons', () => {
  assert.deepEqual(SPLICE_WINDOWS, { donorExonBases: 3, donorIntronBases: 6, acceptorIntronBases: 40, acceptorExonBases: 3, exonMargin: 4, crypticReach: 60 });
  assert.equal(classifyPosition({ exons: [], cdsSegments: [] }, 10).zone, 'unknown');
  assert.equal(classifyPosition({}, 10).zone, 'unknown');
  assert.equal(classifyPosition({ cdsSegments: [[100, 200]] }, 201).zone, 'donor-critical');
});

test('guideRole: protospacer positions and PAM bases on both strands', () => {
  const plus = { ps: 1000, str: '+' }, minus = { ps: 1000, str: '-' };
  assert.deepEqual(guideRole(plus, 1000), { kind: 'spacer', index: 1 });
  assert.deepEqual(guideRole(plus, 1019), { kind: 'spacer', index: 20 });
  assert.deepEqual([1020, 1021, 1022].map((p) => guideRole(plus, p).index), [0, 1, 2]);
  assert.equal(guideRole(plus, 1020).kind, 'pam');
  assert.equal(guideRole(plus, 1023), null);
  assert.equal(guideRole(plus, 999), null);
  assert.deepEqual([1000, 1001, 1002].map((p) => guideRole(minus, p).index), [2, 1, 0]);
  assert.equal(guideRole(minus, 1000).kind, 'pam');
  assert.deepEqual(guideRole(minus, 1003), { kind: 'spacer', index: 20 });
  assert.deepEqual(guideRole(minus, 1022), { kind: 'spacer', index: 1 });
});

test('createdSpliceDinucleotides: reports a new GT or AG near an exon only', () => {
  const seq = 'C'.repeat(400).split(''); seq[210] = 'G'; seq[211] = 'C'; const s = seq.join('');
  assert.deepEqual(createdSpliceDinucleotides(model, s, [{ gp: 211, nb: 'T' }]), [{ gp: 210, dinucleotide: 'GT' }]);
  assert.deepEqual(createdSpliceDinucleotides(model, s, [{ gp: 211, nb: 'A' }]), []);
  const far = 'C'.repeat(400).split(''); far[300] = 'G'; assert.deepEqual(createdSpliceDinucleotides(model, far.join(''), [{ gp: 301, nb: 'T' }]), []);
  const existing = 'C'.repeat(400).split(''); existing[210] = 'G'; existing[211] = 'T';
  assert.deepEqual(createdSpliceDinucleotides(model, existing.join(''), [{ gp: 211, nb: 'T' }]), []);
});

test('initialRecommendation: mode none gives none; infeasible and trivial cases are exact', () => {
  assert.equal(initialRecommendation('none', {}, {}), null);
  assert.equal(initialRecommendation('pair', { feasible: false, reason: 'x' }, {}).use, 'exact');
  assert.equal(initialRecommendation('pair', { feasible: true, changes: [] }, {}).use, 'exact');
  assert.equal(initialRecommendation('pair', { feasible: true, changes: [{}] }, {}).use, 'review');
  assert.equal(initialRecommendation('pair-check', { feasible: true, changes: [{}] }, { overall: 'pass' }).use, 'blockers');
  assert.equal(initialRecommendation('pair-check', { feasible: true, changes: [{}] }, { overall: 'review' }).use, 'review');
  assert.deepEqual(Object.keys(BLOCKING_POLICIES), ['none', 'synonymous', 'noncoding', 'pair', 'pair-check']);
  assert.ok(isPairPolicy('pair') && isPairPolicy('pair-check') && !isPairPolicy('noncoding') && !isPairPolicy('none'));
});

// ---- end-to-end on the APOE fixture (genomic GenBank with exons 2-4, no Location annotation) ---------------------------------------------
const raw = fs.readFileSync(new URL('./fixtures/apoe-r154s.gb', import.meta.url), 'utf8');
const seq = raw.split('ORIGIN')[1].split('//')[0].replace(/[^a-z]/gi, '').toUpperCase();
const TS = { A: 'G', G: 'A', C: 'T', T: 'C' };
const base = { assembly: 'GRCh38', chromosome: '19', referenceStart: 1, forwardConfirmed: true, gene: 'APOE', deliveryMethod: 'rnp' };
const at = (position, extra = {}) => ({ ...base, position, ref: seq[position - 1], alt: TS[seq[position - 1]], ...extra });
const INTRONIC = 1578, EXONIC = 1500;  // intron +6 after exon 3 and an exon 3 coding base

test('the default and the per-guide policies are unchanged; an unknown policy is refused', () => {
  const dflt = designGenomicSnp(raw, at(INTRONIC)), none = designGenomicSnp(raw, at(INTRONIC, { blockingPolicy: 'none' }));
  assert.equal(dflt.err, undefined); assert.equal(dflt.input.blockingPolicy, 'none');
  for (const k of ['blocking', 'splice', 'recommendation']) assert.equal(dflt[k], undefined, `${k} appears only for the pair policies`);
  assert.deepEqual(none.candidates.map((c) => c.donor.od), dflt.candidates.map((c) => c.donor.od));
  for (const c of dflt.candidates) { assert.equal(c.nucleotideValidation.differences, 1); assert.equal(c.inPair, undefined); }
  assert.ok(dflt.candidates.length > 2, 'all guides stay listed');
  assert.ok(!/Blocking changes/.test(buildGenomicSnpReport(dflt)));
  assert.match(designGenomicSnp(raw, at(INTRONIC, { blockingPolicy: 'bogus' })).err, /Unknown blocking-change policy/);
  const per = designGenomicSnp(raw, at(INTRONIC, { blockingPolicy: 'noncoding' }));
  assert.equal(per.err, undefined); assert.equal(per.blocking, undefined); assert.ok(per.candidates.every((c) => c.comparison));
});

function checkDesign(result, position, mode) {
  assert.equal(result.err, undefined);
  const b = result.blocking; assert.equal(b.mode, mode); assert.equal(b.feasible, true, b.reason);
  assert.equal(b.pair.length, 2); assert.ok(b.changes.length >= 1 && b.changes.length <= 3);
  assert.ok(b.cfdAfter.every((c) => c <= CFD_PROTECTION_THRESHOLDS.strong), `CFD after ${b.cfdAfter}`);
  const expected = new Set([position - 1, ...b.changes.map((c) => c.gp)]);
  const inPair = result.candidates;
  assert.equal(inPair.length, 2, 'the pair policies list the two guides of the pair'); assert.ok(inPair.every((c) => c.inPair));
  assert.deepEqual(inPair.map((c) => c.name), b.pair);
  for (const c of inPair) {
    const wt = seq.slice(c.donor.donorStart, c.donor.donorEnd);
    const diff = [...wt].flatMap((x, i) => (x !== c.donor.genomicDonor[i] ? [c.donor.donorStart + i] : []));
    assert.deepEqual(new Set(diff), expected, 'donor differs from the reference only at the edit and the blocking changes');
    assert.equal(c.donor.od.length, 127);
    assert.equal(c.nucleotideValidation.differences, 1 + b.changes.length);
    assert.equal(c.crossProtection.length, 2);
  }
  for (const ch of b.changes) {
    const zn = classifyPosition({ exons: [{ start: 222 - 1, end: 287 }, { start: 1380 - 1, end: 1572 }, { start: 2153 - 1, end: 3301 }] }, ch.gp);
    assert.ok(['intron-deep', 'exon-interior'].includes(zn.zone), `change at ${ch.gp + 1} is in ${zn.zone}`);
    assert.equal(ch.zone, zn.zone);
    if (zn.zone === 'exon-interior') { assert.equal(ch.mt, 'silent'); assert.ok(zn.distance >= 4); }
    assert.notEqual(ch.nb, seq[ch.gp]);
  }
}

test('pair policy: an intronic edit gets intron-only blocking changes shared by a guide pair', () => {
  const r = designGenomicSnp(raw, at(INTRONIC, { blockingPolicy: 'pair' }));
  checkDesign(r, INTRONIC, 'pair');
  assert.ok(r.blocking.changes.every((c) => c.zone === 'intron-deep'));
  assert.equal(r.splice, null); assert.equal(r.recommendation.use, 'review');
  assert.ok(/not screened|not requested/.test(r.recommendation.text + r.recommendation.basis));
});

test('pair-check policy: positional screen passes intron-deep changes and recommends them', () => {
  const r = designGenomicSnp(raw, at(INTRONIC, { blockingPolicy: 'pair-check' }));
  checkDesign(r, INTRONIC, 'pair-check');
  assert.equal(r.splice.overall, 'pass'); assert.equal(r.recommendation.use, 'blockers');
  assert.ok(/requested change lies in a splice-site window/.test(r.splice.edit.note));
  assert.equal(r.splice.items.length, r.blocking.changes.length);
});

test('exonic edit: blocking changes are synonymous given the edit and at least 4 bp from the exon ends', () => {
  const r = designGenomicSnp(raw, at(EXONIC, { blockingPolicy: 'pair-check' }));
  checkDesign(r, EXONIC, 'pair-check');
  assert.ok(r.blocking.changes.some((c) => c.zone === 'exon-interior'));
  assert.equal(r.recommendation.use, 'review'); assert.equal(r.splice.overall, 'review');
  for (const c of r.blocking.changes.filter((x) => x.zone === 'exon-interior')) assert.equal(c.oc.length, 3);
});

test('a pinned guide pair is honoured, and a one-change cap can make the design infeasible rather than exceeding it', () => {
  const free = designGenomicSnp(raw, at(INTRONIC, { blockingPolicy: 'pair' }));
  const pair = free.candidates.map((c) => c.sp);
  const pinned = designGenomicSnp(raw, at(INTRONIC, { blockingPolicy: 'pair', guideSpacers: pair }));
  assert.deepEqual(pinned.candidates.map((c) => c.sp).sort(), [...pair].sort());
  const capped = designGenomicSnp(raw, at(INTRONIC, { blockingPolicy: 'pair', maxBlockingChanges: 1 }));
  assert.ok(capped.blocking.feasible ? capped.blocking.changes.length <= 1 : capped.blocking.reason.length > 0);
});

test('applySpliceCheck: verdicts follow the thresholds and mismatches are refused', () => {
  const r = designGenomicSnp(raw, at(INTRONIC, { blockingPolicy: 'pair-check' }));
  const request = buildSpliceCheckRequest(r);
  assert.equal(request.schema, 'assured-splice-check-request/1');
  assert.equal(request.edit.position, INTRONIC); assert.equal(request.edit.ref, seq[INTRONIC - 1]);
  assert.equal(request.blocking.length, r.blocking.changes.length);
  request.blocking.forEach((c, i) => { assert.equal(c.position, r.blocking.changes[i].gp + 1); assert.equal(c.ref, seq[c.position - 1]); assert.equal(c.ref.length, 1); });
  const check = (max, extra = {}) => ({ schema: 'assured-splice-check-result/1', tool: 'SpliceAI', version: '1.3.1', request, scores: [], summary: { blockingEffectMax: max }, ...extra });
  assert.equal(SPLICE_CHECK_THRESHOLDS.pass, 0.05); assert.equal(SPLICE_CHECK_THRESHOLDS.review, 0.2);
  const pass = applySpliceCheck(r, check(0.01)), edge = applySpliceCheck(r, check(0.05)), review = applySpliceCheck(r, check(0.12)), fail = applySpliceCheck(r, check(0.45));
  assert.equal(pass.splice.external.verdict, 'pass'); assert.equal(pass.recommendation.use, 'blockers');
  assert.equal(edge.splice.external.verdict, 'pass');
  assert.equal(review.splice.external.verdict, 'review'); assert.equal(review.recommendation.use, 'review');
  assert.equal(fail.splice.external.verdict, 'fail'); assert.equal(fail.recommendation.use, 'exact');
  assert.equal(r.splice.external, undefined, 'the input design is not modified');
  assert.throws(() => applySpliceCheck(r, check(0.01, { schema: 'x' })), /not a splice check/);
  assert.throws(() => applySpliceCheck(r, check('abc')), /summary\.blockingEffectMax/);
  assert.throws(() => applySpliceCheck(r, check(0.01, { request: { ...request, edit: { ...request.edit, alt: 'N' } } })), /different edit/);
  assert.throws(() => applySpliceCheck(r, check(0.01, { request: { ...request, blocking: request.blocking.slice(1) } })), /different edit or different blocking/);
  const none = designGenomicSnp(raw, at(INTRONIC));
  assert.throws(() => applySpliceCheck(none, check(0.01)), /no blocking changes/);
  const html = buildGenomicSnpReport(pass); assert.ok(/SpliceAI/.test(html));
});

test('sequence CSV export carries the pair policy, the shared changes and the splice screen', () => {
  const r = designGenomicSnp(raw, at(INTRONIC, { blockingPolicy: 'pair-check' }));
  const csv = buildGenomicSequenceCsv(r, { selectedNames: r.candidates.map((c) => c.name), acknowledged: false, note: '', reviewedAt: '' });
  const rows = csv.trim().split(/\r?\n/);
  assert.equal(rows.length, 7, 'header, 2 guides, 2 ssODNs and 2 primers');
  assert.ok(!/Alternative pairs; do not pool/.test(csv));
  assert.match(rows[0], /Blocking policy/); assert.match(csv, /"pair-check"/);
  for (const c of r.blocking.changes) assert.ok(csv.includes(`${r.input.referenceStart + c.gp} ${seq[c.gp]}>${c.nb}`));
});

test('reports: blocking section present, escaped, and free of undefined', () => {
  const r = designGenomicSnp(raw, at(INTRONIC, { blockingPolicy: 'pair-check', fileName: '<script>alert(1)</script>.gb', assembly: 'GRCh38<img src=x onerror=alert(1)>' }));
  assert.equal(r.err, undefined);
  const html = buildGenomicSnpReport(r);
  assert.ok(/Blocking changes/.test(html)); assert.ok(!/undefined|NaN/.test(html));
  assert.ok(!/<script>alert\(1\)|<img src=x/.test(html));
  assert.ok(/Protection against both guides/.test(html));
});
