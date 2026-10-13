import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGenomicSequenceCsv} from '../src/genomicSequenceExport.js';
const r={status:'BLOCKED',input:{assembly:'GRCh38',chromosome:'12',position:123,ref:'G',alt:'A'},blockers:['Re-cutting risk'],warnings:['Specificity untested'],primers:[],candidates:[{name:'gRNA1',sp:'ACGT',pam:'TGG',str:'+',donor:{od:'AACCGG'},nucleotideValidation:{valid:true},protection:{tier:'weak',cfd:0.9}},{name:'gRNA2',sp:'TGCA',pam:'AGG',str:'-',donor:{od:'CCGGAA'},nucleotideValidation:{valid:true},protection:{tier:'none',cfd:1}}]};
test('exports only selected pairs, ordered donor sequence and retains blockers after acknowledgement',()=>{
 const csv=buildGenomicSequenceCsv(r,{selectedNames:['gRNA1'],acknowledged:true,note:'Reviewed alternatives',reviewedAt:'2026-10-13T12:00:00Z'});
 assert.ok(csv.includes('AACCGG'));assert.ok(!csv.includes('CCGGAA'));assert.ok(csv.includes('BLOCKED'));assert.ok(csv.includes('Re-cutting risk'));assert.ok(csv.includes('User acknowledged'));assert.ok(csv.includes('2026-10-13'));assert.equal(r.status,'BLOCKED');
});
test('drafts do not claim review; malformed designs and empty selections cannot export',()=>{
 assert.ok(buildGenomicSequenceCsv(r,{selectedNames:['gRNA2']}).includes('Draft; not reviewed'));
 assert.throws(()=>buildGenomicSequenceCsv(r),/Select/);
 assert.throws(()=>buildGenomicSequenceCsv({...r,candidates:[{...r.candidates[0],nucleotideValidation:{valid:false}}]},{selectedNames:['gRNA1']}),/validation/);
 assert.ok(buildGenomicSequenceCsv(r,{selectedNames:['gRNA1'],note:'=HYPERLINK("bad")'}).includes("'=HYPERLINK"));
});
