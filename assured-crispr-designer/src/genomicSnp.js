import { parseGB, mkODN, assessGuideAgainstPointMutationDonor, assessGuideSequence, designCenteredPrimerPairs, buildPrimerRecord, summarizePrimerPairQuality } from './designEngine.js';
import { normalizeGenBankToTranscriptModel, findSpCas9Guides } from './transcriptModel.js';

const rc = (s) => s.split('').reverse().map(b => ({ A:'T', T:'A', C:'G', G:'C', N:'N' }[b] || 'N')).join('');
const chromosome = (s) => String(s || '').replace(/^chr/i, '');
export function readGenomicReferenceMetadata(raw) {
  const m = String(raw).match(/Location:\s*chromosome:([^:\s]+):([^:\s]+):(\d+):(\d+):(-?1)\b/i);
  return m ? { assembly:m[1], chromosome:m[2], start:Number(m[3]), end:Number(m[4]), orientation:Number(m[5]) } : null;
}

/** Exact single-nucleotide substitution; no extra blocking edits, codon conversion or inferred assembly. */
export function designGenomicSnp(raw, input) {
  try {
    const record = parseGB(raw);
    if (!record.seq || !/^[ACGTN]+$/.test(record.seq)) throw Error('Upload a GenBank reference with an A/C/G/T/N genomic sequence.');
    const meta = readGenomicReferenceMetadata(raw);
    const start = Number(input.referenceStart), position = Number(input.position);
    const ref = String(input.ref || '').toUpperCase(), alt = String(input.alt || '').toUpperCase();
    if (!input.assembly?.trim() || !input.chromosome?.trim()) throw Error('Specify the genome assembly and chromosome.');
    if (!Number.isSafeInteger(start) || start < 1 || !Number.isSafeInteger(position) || position < 1) throw Error('Coordinates must be positive, 1-based integers.');
    if (!/^[ACGT]$/.test(ref) || !/^[ACGT]$/.test(alt) || ref === alt) throw Error('Enter different single reference and alternate bases (A, C, G or T).');
    if (meta) {
      if (meta.orientation !== 1) throw Error('This mode requires a forward genomic reference. Reverse-oriented reference records are not supported yet.');
      if (meta.assembly !== input.assembly.trim() || chromosome(meta.chromosome) !== chromosome(input.chromosome) || meta.start !== start) throw Error('Assembly, chromosome or reference start conflicts with the GenBank Location annotation.');
      if (meta.end - meta.start + 1 !== record.seq.length) throw Error('The annotated genomic interval does not match the reference sequence length.');
    } else if (!input.forwardConfirmed) throw Error('Confirm that the reference sequence is in forward genomic orientation.');
    const gp = position - start;
    if (gp < 0 || gp >= record.seq.length) throw Error('The requested position lies outside this reference.');
    if (record.seq[gp] !== ref) throw Error(`Reference mismatch at ${position}: requested ${ref}, but the uploaded sequence contains ${record.seq[gp]}.`);
    const normalized = normalizeGenBankToTranscriptModel(record, { expectedGene: input.gene || '' });
    const issues = normalized?.referenceIssues || [];
    const fatalIssues = issues.filter(i => ['error','blocker'].includes(i.severity));
    if (fatalIssues.length) throw Error(fatalIssues.map(i => i.message).join(' '));
    // Genomic SNVs do not require a CDS. An annotation-free model must not invent one.
    const model = normalized || { genomicSequence:record.seq, cdsSegments:[], exons:[], rawFeatures:record.feats, gene:input.gene || 'Locus' };
    const guides = findSpCas9Guides(model, rc, gp, 30).sort((a,b) => Math.abs(a.d)-Math.abs(b.d));
    const candidates = guides.map((guide,index) => {
      const donor = mkODN(model,guide,[gp],[alt],[],null);
      if (!donor) throw Error('The reference is too short to construct a complete 127-nt donor. Supply more flanking sequence.');
      const wt = record.seq.slice(donor.donorStart, donor.donorEnd);
      const differences = [...wt].flatMap((b,i) => b !== donor.genomicDonor[i] ? [donor.donorStart+i] : []);
      if (differences.length !== 1 || differences[0] !== gp || donor.genomicDonor[gp-donor.donorStart] !== alt) throw Error('Donor validation failed: the final allele does not contain exactly the requested substitution.');
      if (donor.od !== (guide.str === '+' ? rc(donor.genomicDonor) : donor.genomicDonor)) throw Error('Donor strand validation failed.');
      return { name:`gRNA${index+1}`, ...guide, interval:{ start:start+guide.ps,end:start+guide.ps+22 }, qc:assessGuideSequence(guide.sp,input.deliveryMethod || 'rnp'), donor, protection:assessGuideAgainstPointMutationDonor(guide,donor), nucleotideValidation:{ valid:true, differences:1, additionalChanges:0 } };
    });
    const primers = designCenteredPrimerPairs(record.seq,gp,{ minAmp:400,maxAmp:700,desiredAmp:500 }).slice(0,3).map((p,index)=>({ rank:index+1,ampliconLength:p.amp,forward:buildPrimerRecord('Fw',p.fw.seq),reverse:buildPrimerRecord('Rev',p.rev.seq),quality:p.quality || summarizePrimerPairQuality(p.fw.seq,p.rev.seq) }));
    const boundaries = (model.exons || []).flatMap(exon => [
      { label:exon.label || `Exon ${exon.exonNumber || ''}`,edge:'start',distance:gp-exon.start },
      { label:exon.label || `Exon ${exon.exonNumber || ''}`,edge:'last exon base',distance:gp-(exon.end-1) },
    ]).sort((a,b)=>Math.abs(a.distance)-Math.abs(b.distance));
    const warnings = [
      ...issues.map(i=>i.message),
      ...(!normalized ? ['No usable CDS annotation. Coding and splice context have not been established.'] : []),
      ...(!meta ? ['Genomic mapping is user-supplied; no Location annotation was available to verify it.'] : []),
      'Genome-wide guide and primer specificity are not checked.',
      'No additional blocking substitutions were added. Review each guide against its matched repaired allele.',
      'Splicing and protein outcomes are not predicted. An unchanged annotated CDS does not validate mature RNA or protein.',
      'Alternative guides and donors are separate candidates; do not pool them.',
      ...(!input.cellLine ? ['Cell line and parental genotype are unspecified.'] : ['Parental sequence must be confirmed; specifying a cell line is not WGS validation.']),
    ];
    const blockers = !candidates.length ? ['No SpCas9 NGG guides passed the native sequence filters within 30 bp.'] : candidates.every(c=>c.protection.tier!=='strong') ? ['No candidate has strong predicted re-cutting protection from the requested edit alone.'] : [];
    return { type:'genomic-snv',status:blockers.length?'BLOCKED':'REVIEW REQUIRED',blockers,warnings,input:{ ...input,ref,alt,position,referenceStart:start },reference:{ length:record.seq.length,metadata:meta,issues },context:{ before:record.seq.slice(Math.max(0,gp-20),gp),ref,alt,after:record.seq.slice(gp+1,gp+21),nearestExonBoundary:boundaries[0] || null },candidates,primers };
  } catch (error) { return { err:error.message }; }
}

const escape = (s) => String(s ?? '').replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
export function buildGenomicSnpReport(r) {
  if (!r || r.err) throw Error('A validated nucleotide design is required for a report.');
  const row=(cells)=>`<tr>${cells.map(v=>`<td>${escape(v)}</td>`).join('')}</tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Genomic SNP design</title><style>body{font:16px system-ui;margin:40px;color:#152b40}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #cbd5e1;padding:10px;text-align:left}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f1f5f9;padding:16px}p,li{line-height:1.6}.status{padding:20px;background:#fff0d6}</style></head><body><h1>${escape(r.input.gene)} genomic SNP</h1><p>${escape(r.input.assembly)} chr${escape(chromosome(r.input.chromosome))}:${r.input.position} ${escape(r.input.ref)}→${escape(r.input.alt)}</p><p>Reference: ${escape(r.input.fileName || 'GenBank')} · Cell line: ${escape(r.input.cellLine || 'unspecified')}</p><div class="status"><b>${escape(r.status)}</b><ul>${[...r.blockers,...r.warnings].map(w=>`<li>${escape(w)}</li>`).join('')}</ul></div><pre>${escape(r.context.before)}[${escape(r.input.ref)}&gt;${escape(r.input.alt)}]${escape(r.context.after)}</pre><h2>Guide candidates</h2><p>Listed by cut distance, not genome-wide specificity. CFD is predicted residual activity against the edited allele, not an editing probability.</p><table><tr><th>Guide</th><th>Spacer 5′→3′</th><th>PAM</th><th>Strand</th><th>GC %</th><th>Cut offset (bp)</th><th>Protection</th><th>Residual CFD</th></tr>${r.candidates.map(c=>row([c.name,c.sp,c.pam,c.str,c.gc,c.d,c.protection.tier,c.protection.cfd])).join('')}</table><h2>Matched draft donors</h2>${r.candidates.map(c=>`<h3>${escape(c.name)}</h3><p>Target + PAM: chr${escape(chromosome(r.input.chromosome))}:${c.interval.start}–${c.interval.end}. 127 nt, 5′→3′; exactly one verified nucleotide substitution and no additional blocking changes.</p><pre>${escape(c.donor.od)}</pre><p>${escape(c.protection.reason)}</p>`).join('')}<h2>Genomic validation primers</h2><p>WT and edited amplicons have equal length. Primer QC is not genome-wide specificity. RNA validation must separately establish splice effects.</p><table><tr><th>Rank</th><th>Forward 5′→3′</th><th>Reverse 5′→3′</th><th>Amplicon bp</th><th>QC warnings</th></tr>${r.primers.map(p=>row([p.rank,p.forward.s,p.reverse.s,p.ampliconLength,[...(p.forward.qc?.warnings||[]),...(p.reverse.qc?.warnings||[]),...(p.quality?.warnings||[])].join('; ')])).join('')}</table></body></html>`;
}
