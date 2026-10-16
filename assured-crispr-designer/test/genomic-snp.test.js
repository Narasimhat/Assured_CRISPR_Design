import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildDesignSchemeSvg,buildDesignSchemeCaption,supportsDesignScheme} from '../src/designScheme.js';
import { designGenomicSnp, readGenomicReferenceMetadata, buildGenomicSnpReport } from '../src/genomicSnp.js';

// Deterministic synthetic reference, no patient or project data and deliberately no CDS.
let seed=12345;
const dna=Array.from({length:1200},()=>{seed=(seed*1664525+1013904223)>>>0;return 'ACGT'[seed>>>30];});
dna.splice(580,23,...'ACACTGCCAGGCGCTTCTGCAGG');
const sequence=dna.join('');
const make=(seq=sequence,location='chromosome:GRCh38:12:1001:2200:1')=>`LOCUS       SYNTHETIC 1200 bp DNA\nCOMMENT     Location: ${location}\nFEATURES             Location/Qualifiers\nORIGIN\n${seq}\n//\n`;
const input={assembly:'GRCh38',chromosome:'12',referenceStart:1001,position:1591,ref:sequence[590],alt:sequence[590]==='A'?'G':'A',forwardConfirmed:true};
test('genomic SNV works without CDS and installs only the requested base in both donor orientations',()=>{
 const result=designGenomicSnp(make(),input);assert.equal(result.err,undefined);assert.ok(result.candidates.length);
 for(const c of result.candidates){
  assert.equal(c.donor.od.length,127);
  const before=sequence.slice(c.donor.donorStart,c.donor.donorEnd);
  const changes=[...before].flatMap((b,i)=>b!==c.donor.genomicDonor[i]?[i+c.donor.donorStart]:[]);
  assert.deepEqual(changes,[590]);assert.equal(c.donor.genomicDonor[590-c.donor.donorStart],input.alt);
  assert.equal(c.donor.proteinValidation,null);assert.deepEqual(c.donor.silentMutations,[]);
 }
 assert.ok(result.candidates.some(c=>c.str==='+'));assert.ok(result.candidates.some(c=>c.str==='-'));
 assert.notEqual(result.status,'READY');
});
test('rejects reference mismatch, out-of-range and invalid alleles',()=>{
 assert.match(designGenomicSnp(make(),{...input,ref:'N'}).err,/single reference/);
 assert.match(designGenomicSnp(make(),{...input,ref:input.alt,alt:input.ref}).err,/Reference mismatch/);
 assert.match(designGenomicSnp(make(),{...input,position:1000}).err,/outside/);
 assert.match(designGenomicSnp(make(),{...input,position:1591.5}).err,/integers/);
 assert.match(designGenomicSnp(make(),{...input,alt:input.ref}).err,/different/);
});
test('does not guess or silently change assembly, chromosome, reference start or strand',()=>{
 for(const change of [{assembly:'GRCh37'},{chromosome:'13'},{referenceStart:1002}])assert.match(designGenomicSnp(make(),{...input,...change}).err,/conflicts/);
 // A reverse-oriented record is mapped from its Location annotation; forward-strand alleles that do not match its complement are a mismatch, not a strand guess.
 assert.match(designGenomicSnp(make(sequence,'chromosome:GRCh38:12:1001:2200:-1'),input).err,/Reference mismatch/);
 assert.match(designGenomicSnp(make(sequence,'chromosome:GRCh38:12:1001:2201:1'),input).err,/sequence length/);
 assert.match(designGenomicSnp(make(sequence,'none'),{...input,forwardConfirmed:false}).err,/Confirm/);
 assert.equal(readGenomicReferenceMetadata(make()).start,1001);
});
test('no nearby PAM is reported as blocked, never as a successful order',()=>{
 const result=designGenomicSnp(make('AT'.repeat(600)),{...input,ref:'A',alt:'G'});
 assert.equal(result.status,'BLOCKED');assert.equal(result.candidates.length,0);
});
test('report preserves release state, nucleotide identity and escaped user labels',()=>{
 const r=designGenomicSnp(make(),{...input,gene:'<script>bad</script>'});const html=buildGenomicSnpReport(r);
 assert.ok(html.includes(r.status));assert.ok(html.includes('1591'));assert.ok(!html.includes('<script>bad'));
 for(const section of ['1. Gene Information','2. gRNA Sequences','3. Recommended Primers','4. ssODN Donor Templates','Design Readiness','Design Scheme','Review Checkpoints','Final donor nucleotide assertion:']) assert.ok(html.includes(section),section);
 assert.ok(html.includes('WT and donor templates are listed together'));
 assert.ok(!html.includes('Final donor protein assertion:'));
 assert.ok(!html.includes('Coding frame view'));
 assert.ok(!html.includes('undefined'));
 assert.ok(!html.includes('Recommended to order.'));
 assert.ok(!html.includes('No automated warnings were triggered'));
 assert.ok(!html.includes('Protection against all offered guides:'));
 assert.ok(html.includes('No additional blocking substitutions'));assert.ok(html.includes('Splicing and protein outcomes are not predicted'));
});
test('a CDS reference blocker is not downgraded to a warning in nucleotide mode',()=>{
 const raw=fs.readFileSync(new URL('./fixtures/apoe-r154s.gb',import.meta.url),'utf8');
 const seq=raw.split('ORIGIN')[1].split('//')[0].replace(/[^a-z]/gi,'').toUpperCase();
 const r=designGenomicSnp(raw,{...input,gene:'WRONG_GENE',referenceStart:1,position:150,ref:seq[149],alt:seq[149]==='A'?'G':'A'});
 assert.ok(r.err);assert.match(r.err,/WRONG_GENE|gene/i);
});

test('genomic scheme uses actual alleles, coordinates, donor strands and protection',()=>{
 const r=designGenomicSnp(make(),input);
 assert.ok(supportsDesignScheme(r));
 const svg=buildDesignSchemeSvg(r);
 assert.ok(svg.startsWith('<svg'));assert.ok(svg.includes('1591'));
 assert.ok(!/NaN|undefined/.test(svg));
 assert.ok(svg.includes('no blocking changes'));
 assert.ok(svg.includes('supplied - strand'));assert.ok(svg.includes('supplied + strand'));
 assert.ok(svg.includes('36 nt'));assert.ok(svg.includes('91 nt'));
 assert.ok(svg.includes(r.status));assert.ok(!svg.includes('prevent re-cutting'));
 assert.ok(buildDesignSchemeCaption(r).includes('unvalidated'));
 assert.ok(buildGenomicSnpReport(r).includes('Download SVG'));
 const noGuides=designGenomicSnp(make('AT'.repeat(600)),{...input,ref:'A',alt:'G'});
 assert.equal(buildDesignSchemeSvg(noGuides),'');
});
