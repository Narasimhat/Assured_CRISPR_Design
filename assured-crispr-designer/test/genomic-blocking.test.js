import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBlockingComparison,screenSpliceChanges} from '../src/genomicBlocking.js';
const seq='A'.repeat(100)+'CTCTTCAGTTTGAGGTGAGTTGG'+'A'.repeat(277);
const model={genomicSequence:seq,cdsSegments:[[50,110],[200,260]],exons:[{start:50,end:114,label:'Exon 1'},{start:200,end:280,label:'Exon 2'}]};
const guide={ps:100,cut:117,sp:seq.slice(100,120),pam:seq.slice(120,123),str:'+',d:3};
test('requested-only retains exact allele; noncoding mode compares real blocking variants without changing +1',()=>{
 const base=buildBlockingComparison(model,guide,114,'A','none',2);
 assert.equal(base.selected.changes.length,0);
 assert.equal(base.requestedSplice.junctionChanges[0].before,'GT');
 assert.equal(base.requestedSplice.junctionChanges[0].after,'AT');
 const r=buildBlockingComparison(model,guide,114,'A','noncoding',2);
 assert.ok(r.variants.length>1);assert.equal(r.selected.protection.tier,'strong');
 assert.ok(r.selected.changes.length<=2);
 assert.ok(r.selected.changes.every(m=>m.gp!==114 && m.gp!==115 && m.gp!==198 && m.gp!==199));
 assert.equal(r.selected.donor.genomicDonor[114-r.selected.donor.donorStart],'A');
 assert.ok(r.recommendation.includes('unassessed'));
 assert.equal(r.selected.splice.predictionStatus,'unassessed');
 for(const v of r.variants){
   const expected=new Map([[114,'A'],...v.changes.map(m=>[m.gp,m.nb])]);
   assert.ok([...v.donor.genomicDonor].every((b,i)=>b===(expected.get(v.donor.donorStart+i)??seq[v.donor.donorStart+i])));
 }
});
test('synonymous-only cannot introduce noncoding substitutions; missing annotation cannot prove noncoding',()=>{
 const r=buildBlockingComparison(model,guide,114,'A','synonymous',3);
 assert.ok(r.variants.every(v=>v.changes.every(m=>m.mt==='silent')));
 const unknown=buildBlockingComparison({...model,cdsSegments:[],exons:[]},guide,114,'A','noncoding',3);
 assert.equal(unknown.variants.length,1);
 assert.equal(unknown.selected.splice.risk,'annotation unavailable');
});
test('splice screening separates intended junction loss from incremental nearby or motif changes',()=>{
 const edited=seq.slice(0,114)+'A'+seq.slice(115);
 const s=screenSpliceChanges(model,edited,[{gp:121,nb:'T'},{gp:122,nb:'T'}]);
 assert.equal(s.junctionChanges.length,0);assert.ok(s.nearby.length);assert.equal(s.motifChanges.length,0);
 const motif=screenSpliceChanges(model,edited,[{gp:118,nb:'A'}]);assert.ok(motif.motifChanges.length);
 assert.equal(s.predictionStatus,'unassessed');
 assert.ok(s.limitation.includes('not evidence'));
});
