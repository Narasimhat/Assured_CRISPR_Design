import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runDesign, summarizeProcurementReadiness } from '../src/designEngine.js';
import { pickPartnerGuide } from '../src/guideSelection.js';
import { classifyPosition, inSpliceWindow } from '../src/spliceZones.js';

// Point mutations on the APOE fixture (exons 2-4). K2A has one distinct guide within 10 bp; A14G sits at the exon 2 / intron 2 boundary; E31A co-delivered cannot combine two guides' changes.
const gb = fs.readFileSync(new URL('./fixtures/apoe-r154s.gb', import.meta.url), 'utf8');
const run = (mutation, extra = {}) => runDesign('pm', gb, mutation, '', 400, { deliveryMethod: 'rnp', expectedGene: 'APOE', maxBlockingChanges: '3', ...extra });
const BEFORE = { ensureGuidePair: false, allowNonCodingBlockers: false };  // the behaviour before the two options existed

const spacer = (i) => 'ACGT'.repeat(5).split('').map((b, k) => 'ACGT'[(k + i) % 4]).join('');
const guide = (i, cut, str = '+') => ({ sp: spacer(i), cut, str });

test('pickPartnerGuide: best protection first, at least 10 bp from the lead, opposite strand among equals, never the lead', () => {
  const lead = guide(0, 100);
  const entries = [
    { guide: guide(1, 105), index: 0, rank: 0 },            // too close
    { guide: guide(2, 112, '+'), index: 1, rank: 1 },       // distinct but worse protected
    { guide: guide(3, 118, '+'), index: 2, rank: 0 },
    { guide: guide(0, 100), index: 3, rank: 0 },            // the lead itself
    { guide: guide(1, 121, '-'), index: 4, rank: 0 },
  ];
  assert.equal(pickPartnerGuide(lead, entries).cut, 121);   // rank 0, opposite strand
  assert.equal(pickPartnerGuide(lead, entries.slice(0, 3)).cut, 118);
  assert.equal(pickPartnerGuide(lead, entries.slice(0, 2)).cut, 112);
  assert.equal(pickPartnerGuide(lead, entries.slice(0, 1)), null);
  assert.equal(pickPartnerGuide(lead, []), null);
});

test('inSpliceWindow: donor and acceptor windows only', () => {
  const model = { exons: [{ start: 100, end: 200, label: 'Exon 2' }, { start: 400, end: 500, label: 'Exon 3' }] };
  for (const p of [197, 199, 200, 205, 360, 399, 400, 402, 100, 102]) assert.ok(inSpliceWindow(model, p), `${p}`);
  for (const p of [196, 150, 206, 300, 359, 403, 450]) assert.ok(!inSpliceWindow(model, p), `${p}`);
});

test('a lone guide gets a partner from the wider window, with the lead unchanged and a warning about the distance', () => {
  const before = run('K2A', BEFORE), after = run('K2A');
  assert.equal(before.err, undefined); assert.equal(after.err, undefined);
  assert.equal(before.gs.length, 1); assert.equal(before.guideWindow, 10); assert.equal(before.partnerFallback, undefined);
  assert.equal(after.gs.length, 2);
  assert.equal(after.gs[0].sp, before.gs[0].sp, 'the lead guide is the same');
  assert.ok(Math.abs(after.gs[0].cut - after.gs[1].cut) >= 10, 'cuts at least 10 bp apart');
  assert.equal(after.guideWindow, 10); assert.equal(after.guideTier, 'preferred');
  assert.equal(after.partnerFallback.leadWindow, 10); assert.equal(after.partnerFallback.partnerWindow, 20);
  assert.ok(after.partnerFallback.partnerCutDistance > 10 && after.partnerFallback.partnerCutDistance <= 20);
  assert.equal(after.os.length, 2); assert.ok(after.os.every((d) => d.proteinValidation.valid));
  assert.ok(summarizeProcurementReadiness(after).warnings.some((w) => /The second guide cuts \d+ bp from the mutation site/.test(w)));
  // the same holds under co-delivery, where both donors carry both guides' blocking changes
  const co = run('K2A', { coDeliveryBlocking: true });
  assert.equal(co.gs.length, 2); assert.ok(co.os.every((d) => d.proteinValidation.valid));
});

test('designs that already had two guides keep them: the partner step only runs for a lone guide', () => {
  for (const mutation of ['W5A', 'A6G', 'A7G']) {
    const before = run(mutation, BEFORE), after = run(mutation);
    assert.equal(before.gs.length, 2);
    assert.deepEqual(after.gs.map((g) => g.sp), before.gs.map((g) => g.sp));
    assert.equal(after.partnerFallback, undefined);
  }
});

test('noncoding blockers: only as a fallback, only in the intron, never in a splice-site window, and reported as a review item', () => {
  const before = run('A14G', BEFORE), after = run('A14G');
  assert.equal(before.ss.filter((s) => s.mt === 'noncoding').length, 0);
  const noncoding = after.ss.filter((s) => s.mt === 'noncoding');
  assert.ok(noncoding.length >= 1);
  for (const change of noncoding) {
    assert.equal(classifyPosition(after.gb, change.gp).zone, 'intron-deep', 'intron, outside the windows');
    assert.ok(!inSpliceWindow(after.gb, change.gp));
    assert.ok(after.os.some((d) => d.silentMutations.some((m) => m.gp === change.gp && m.nb === change.nb)), 'carried by a donor');
  }
  assert.ok(after.os.every((d) => d.proteinValidation.valid), 'the protein is unchanged');
  for (const change of after.ss.filter((s) => s.mt === 'silent')) assert.ok(!inSpliceWindow(after.gb, change.gp) || before.ss.some((s) => s.gp === change.gp));
  assert.ok(summarizeProcurementReadiness(after).warnings.some((w) => /outside the coding sequence \(intron; not silent\)/.test(w)));
  assert.ok(!summarizeProcurementReadiness(before).warnings.some((w) => /outside the coding sequence/.test(w)));
  const off = run('A14G', { allowNonCodingBlockers: false });
  assert.equal(off.ss.filter((s) => s.mt === 'noncoding').length, 0);
});

test('co-delivery: a pair whose combined changes would alter the protein falls back to the lone guide, flagged', () => {
  const before = run('E31A', { coDeliveryBlocking: true, ...BEFORE }), after = run('E31A', { coDeliveryBlocking: true });
  assert.equal(before.err, undefined); assert.equal(after.err, undefined);
  assert.equal(after.gs.length, 1); assert.equal(after.partnerSkipped, true);
  assert.equal(after.gs[0].sp, before.gs[0].sp);
  assert.ok(after.os.every((d) => d.proteinValidation.valid));
  assert.ok(summarizeProcurementReadiness(after).warnings.some((w) => /Only one guide is offered/.test(w)));
  assert.equal(before.partnerSkipped, undefined);
});

test('custom guides are not given a partner, and the options can be switched off', () => {
  const lone = run('K2A', BEFORE); const custom = run('K2A', { customGuides: [lone.gs[0].sp] });
  assert.equal(custom.err, undefined); assert.equal(custom.gs.length, 1); assert.equal(custom.partnerFallback, undefined);
  assert.equal(run('K2A', { ensureGuidePair: false }).gs.length, 1);
});
