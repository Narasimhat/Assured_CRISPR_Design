import { useState } from 'react';
import { designGenomicSnp, readGenomicReferenceMetadata, buildGenomicSnpReport } from './genomicSnp.js';
import './genomicSnp.css';

function download(name, text, type) {
  const url=URL.createObjectURL(new Blob([text],{type}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export default function GenomicSnpTool({ onGenerate, onInvalidate }) {
  const [raw,setRaw]=useState('');
  const [input,setInput]=useState({gene:'',cellLine:'',assembly:'',chromosome:'',referenceStart:'',position:'',ref:'G',alt:'A',forwardConfirmed:false,deliveryMethod:'rnp',fileName:''});
  const [result,setResult]=useState(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const update=(key,value)=>{setInput(prev=>({...prev,[key]:value}));setResult(null);onInvalidate?.();setError('');};
  async function upload(event) {
    const file=event.target.files?.[0];setResult(null);onInvalidate?.();setError('');setRaw('');
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
    if(design.err){setResult(null);setError(design.err);}else {setResult(design);onGenerate?.(design);}
  }
  const field=(label,key,type='text')=><label>{label}<input type={type} value={input[key]} onChange={e=>update(key,e.target.value)} required={['assembly','chromosome','referenceStart','position'].includes(key)} min={type==='number'?1:undefined} step={type==='number'?1:undefined}/></label>;
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
    {result && <button type="button" onClick={()=>onGenerate?.(result)}>Show final report</button>}
  </section>;
}

export function GenomicSnpReport({ result, onEdit, onOtherReports }) {
  const html=buildGenomicSnpReport(result);
  const fileStem=String(result.input.gene || 'locus').replace(/[^a-zA-Z0-9_-]/g,'_')+`_${result.input.position}_${result.input.ref}${result.input.alt}`;
  return <section aria-label="Genomic SNP final report">
    <h2>2. Final Report</h2>
    <div className="snp-actions" style={{marginBottom:16}}>
      <button onClick={()=>download(fileStem+'_report.html',html,'text/html')}>Download HTML report to browser Downloads</button>
      <button onClick={()=>download(fileStem+'_design.json',JSON.stringify(result,null,2),'application/json')}>Download genomic SNP JSON</button>
      <button onClick={onEdit}>Edit genomic SNP request</button>
      <button onClick={onOtherReports}>Show other project reports</button>
    </div>
    <iframe title="ASSURED final design report" srcDoc={html} sandbox="" style={{width:'100%',height:'78vh',minHeight:650,border:'1px solid #d0d5dd',borderRadius:12,background:'white'}} />
  </section>;
}
