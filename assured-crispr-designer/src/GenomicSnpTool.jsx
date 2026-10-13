import { useState } from 'react';
import { designGenomicSnp, readGenomicReferenceMetadata, buildGenomicSnpReport } from './genomicSnp.js';
import './genomicSnp.css';

function download(name, text, type) {
  const url=URL.createObjectURL(new Blob([text],{type}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export default function GenomicSnpTool() {
  const [raw,setRaw]=useState('');
  const [input,setInput]=useState({gene:'',cellLine:'',assembly:'',chromosome:'',referenceStart:'',position:'',ref:'G',alt:'A',forwardConfirmed:false,deliveryMethod:'rnp',fileName:''});
  const [result,setResult]=useState(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const update=(key,value)=>{setInput(prev=>({...prev,[key]:value}));setResult(null);setError('');};
  async function upload(event) {
    const file=event.target.files?.[0];setResult(null);setError('');setRaw('');
    if(!file)return;
    setBusy(true);
    try {
      const text=await file.text();const meta=readGenomicReferenceMetadata(text);
      setRaw(text);setInput(prev=>({...prev,fileName:file.name,assembly:meta?.assembly || '',chromosome:meta?.chromosome || '',referenceStart:meta?.start || '',forwardConfirmed:meta?.orientation===1}));
    } catch {setError('Could not read this reference file.');}
    finally {setBusy(false);}
  }
  function generate(event) {
    event.preventDefault();setError('');
    const design=designGenomicSnp(raw,input);
    if(design.err){setResult(null);setError(design.err);}else setResult(design);
  }
  const field=(label,key,type='text')=><label>{label}<input type={type} value={input[key]} onChange={e=>update(key,e.target.value)} required={['assembly','chromosome','referenceStart','position'].includes(key)} min={type==='number'?1:undefined} step={type==='number'?1:undefined}/></label>;
  const fileStem=String(input.gene || 'locus').replace(/[^a-zA-Z0-9_-]/g,'_')+`_${input.position}_${input.ref}${input.alt}`;
  return <section className="genomic-snp">
    <h2>Genomic SNP</h2>
    <p>Design an exact nucleotide substitution in an intron, splice site, untranslated region or coding sequence. Coordinates and alleles use the forward genomic strand.</p>
    <form onSubmit={generate}>
      <label>Genomic reference (GenBank)<input type="file" accept=".gb,.gbk,.genbank" onChange={upload} /></label>
      <p>Reference stays in your browser. An Ensembl Location annotation fills the assembly, chromosome and reference start automatically. Forward genomic references only.</p>
      <div className="snp-grid">
        {field('Gene or locus','gene')}{field('Cell line (optional)','cellLine')}
        {field('Genome assembly','assembly')}{field('Chromosome','chromosome')}
        {field('Reference start (1-based genomic coordinate)','referenceStart','number')}
        {field('Edit position (1-based genomic coordinate)','position','number')}
        <label>Reference base<select value={input.ref} onChange={e=>update('ref',e.target.value)}>{['A','C','G','T'].map(b=><option key={b}>{b}</option>)}</select></label>
        <label>Alternate base<select value={input.alt} onChange={e=>update('alt',e.target.value)}>{['A','C','G','T'].map(b=><option key={b}>{b}</option>)}</select></label>
        <label>Guide delivery<select value={input.deliveryMethod} onChange={e=>update('deliveryMethod',e.target.value)}><option value="rnp">Synthetic guide + Cas RNP</option><option value="u6">U6 / Pol III expression</option></select></label>
      </div>
      <label className="snp-check"><input type="checkbox" checked={input.forwardConfirmed} onChange={e=>update('forwardConfirmed',e.target.checked)}/>The reference sequence is in forward genomic orientation.</label>
      <p>No additional blocking substitutions will be added. Every donor is checked for exactly the requested single-base change.</p>
      <button type="submit" disabled={!raw || busy}>Generate genomic SNP design</button>
    </form>
    {error && <p role="alert" className="snp-alert">{error}</p>}
    {result && <div aria-label="Genomic SNP result">
      <h2>{input.gene || 'Locus'} — {input.assembly} chr{String(input.chromosome).replace(/^chr/i,'')}:{input.position} {input.ref}→{input.alt}</h2>
      <div className="snp-alert" role="status"><strong>{result.status}</strong><ul>{result.blockers.map((s,i)=><li key={i}>{s}</li>)}</ul><p>Draft candidates, not an ordering approval. Protein and splicing outcomes are not validated.</p></div>
      <pre>{result.context.before}<mark>[{input.ref}→{input.alt}]</mark>{result.context.after}</pre>
      {result.context.nearestExonBoundary && <p>Nearest annotated boundary: {result.context.nearestExonBoundary.label}, {result.context.nearestExonBoundary.edge}; offset {result.context.nearestExonBoundary.distance} bp from that boundary coordinate.</p>}
      <div className="snp-actions"><button onClick={()=>download(fileStem+'_report.html',buildGenomicSnpReport(result),'text/html')}>Download genomic SNP report</button><button onClick={()=>download(fileStem+'_design.json',JSON.stringify(result,null,2),'application/json')}>Download genomic SNP JSON</button></div>
      <h3>Guide candidates</h3><p>Listed by cut distance. Residual CFD estimates activity against the repaired allele, not genome-wide specificity or editing probability.</p>
      <div className="snp-table"><table><thead><tr>{['Guide','Spacer 5′→3′','PAM','Strand','GC','Cut offset','Re-cutting protection','Residual CFD'].map(s=><th key={s}>{s}</th>)}</tr></thead><tbody>{result.candidates.map(c=><tr key={c.name}><td>{c.name}</td><td><code>{c.sp}</code></td><td>{c.pam}</td><td>{c.str}</td><td>{c.gc}%</td><td>{c.d} bp</td><td>{c.protection.tier}</td><td>{c.protection.cfd?.toFixed(4) ?? 'unscored'}</td></tr>)}</tbody></table></div>
      <h3>Matched draft ssODNs</h3>{result.candidates.map(c=><details key={c.name}><summary>{c.name}: 127 nt, 5′→3′ — {c.protection.tier} protection</summary><pre>{c.donor.od}</pre><p>Exactly one requested nucleotide change; no additional substitutions. {c.protection.reason}</p>{c.qc.warnings.map((w,i)=><p key={i}>{w}</p>)}</details>)}
      <h3>Validation primers</h3><p>WT and edited amplicon lengths are equal. Genomic PCR does not establish the splicing outcome.</p>
      {result.primers.map(p=><details key={p.rank}><summary>Pair {p.rank} — {p.ampliconLength} bp</summary><p>Forward: <code>{p.forward.s}</code><br/>Reverse: <code>{p.reverse.s}</code></p><p>{[...(p.forward.qc?.warnings||[]),...(p.reverse.qc?.warnings||[]),...(p.quality?.warnings||[])].join('; ') || 'No local primer QC warnings; genome-wide specificity is untested.'}</p></details>)}
      <h3>Review checkpoints</h3><ul>{result.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul>
    </div>}
  </section>;
}
