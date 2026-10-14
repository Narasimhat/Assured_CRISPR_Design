import { blockingPolicyFor } from './genomicBlocking.js';
import { applySpliceCheck, buildSpliceCheckRequest } from './pairBlocking.js';
import { buildGenomicSequenceCsv } from './genomicSequenceExport.js';
import { buildDesignSchemeSvg, buildDesignSchemeFilename } from './designScheme.js';
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
  const [input,setInput]=useState({addBlocking:true,coDelivery:true,gene:'',cellLine:'',assembly:'',chromosome:'',referenceStart:'',position:'',ref:'G',alt:'A',forwardConfirmed:false,deliveryMethod:'rnp',fileName:''});
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
  async function attachSplice(event) {
    const file=event.target.files?.[0];event.target.value='';
    if(!file||!result)return;
    try {
      const updated=applySpliceCheck(result,JSON.parse(await file.text()));
      setError('');setResult(updated);onGenerate?.(updated);
    } catch(e) {setError(e.message || 'Could not read the splice check file.');}
  }
  function generate(event) {
    event.preventDefault();setError('');
    const design=designGenomicSnp(raw,{...input,blockingPolicy:blockingPolicyFor(input)});
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
      <label className="snp-check"><input type="checkbox" checked={input.addBlocking} onChange={e=>update('addBlocking',e.target.checked)}/><span><strong>Add PAM/seed blocking changes</strong><br/>On (default): two guides and two ssODNs, with silent changes that stop the guides re-cutting the repaired allele. Off: only the requested base is changed; every candidate guide is listed with its matched ssODN and graded for re-cutting.</span></label>
      <label className="snp-check" style={{opacity:input.addBlocking?1:0.5}}><input type="checkbox" disabled={!input.addBlocking} checked={input.coDelivery} onChange={e=>update('coDelivery',e.target.checked)}/><span><strong>Co-transfect both guides and both ssODNs</strong><br/>On (default): each ssODN carries the blocking changes for both guides. Off: each guide gets its own ssODN carrying only its own blocking changes; deliver one pair at a time.</span></label>
      <p>{input.addBlocking?'Blocking changes are added only where the repaired allele would be re-cut. They stay outside the splice-site windows of annotated exons, and inside coding sequence they are silent. Every donor is checked against the reference.':'No additional blocking substitutions will be added. Every donor is checked for exactly the requested single-base change.'}</p>
      <p>Splice assessment is a local junction and GT/AG motif screen, not a splice-strength prediction. Additional intronic changes remain subject to review.</p>
    <button type="submit" disabled={!raw || busy}>Generate genomic SNP design</button>
    </form>
    {error && <p role="alert" className="snp-alert">{error}</p>}
    {result?.recommendation && <div className="snp-reco" role="status"><strong>{{blockers:'Use the blocking changes.',review:'Review before use.',exact:'Use the exact edit only.'}[result.recommendation.use] || result.recommendation.use}</strong> {result.recommendation.text}</div>}
    {result?.blocking?.changes?.length>0 && <div className="snp-splice">
      <p>Optional splice-predictor check: download the request, run <code>scripts/splice_check.py</code> with the same GenBank reference, then attach its result here.</p>
      <button type="button" onClick={()=>download(`${String(result.input.gene || 'locus').replace(/[^a-zA-Z0-9_-]/g,'_')}_${result.input.position}_splice_check_request.json`,JSON.stringify(buildSpliceCheckRequest(result),null,2),'application/json')}>Download splice-check request</button>
      <label>Attach splice-check result<input type="file" accept=".json,application/json" onChange={attachSplice}/></label>
    </div>}
    {result && <button type="button" onClick={()=>onGenerate?.(result)}>Show final report</button>}
  </section>;
}

export function GenomicSnpReport({ result, onEdit, onOtherReports }) {
  const [exportError,setExportError]=useState('');
  const [selection,setSelection]=useState({result,names:result.candidates.map(c=>c.name)});
  const selectedNames=selection.result===result ? selection.names : result.candidates.map(c=>c.name);
  const [review,setReview]=useState({result:null,acknowledged:false,note:''});
  const acknowledged=review.result===result && review.acknowledged;
  const note=review.result===result ? review.note : '';
  function exportSequences(proceed) {
    try {
      const csv=buildGenomicSequenceCsv(result,{selectedNames,acknowledged:proceed && acknowledged,note,reviewedAt:new Date().toISOString()});
      download(fileStem+(proceed?'_reviewed_sequences.csv':'_draft_sequences.csv'),csv,'text/csv;charset=utf-8');
      setExportError('');
    } catch(error){setExportError(error.message);}
  }
  const html=buildGenomicSnpReport(result);
  const scheme=buildDesignSchemeSvg(result);
  async function downloadPng() {
    setExportError('');
    const url=URL.createObjectURL(new Blob([scheme],{type:'image/svg+xml'}));
    try {
      const image=new Image();
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url;});
      const canvas=document.createElement('canvas');canvas.width=image.width*2;canvas.height=image.height*2;
      const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!blob)throw Error('PNG export failed');
      download(buildDesignSchemeFilename(result).replace(/\.svg$/,'.png'),blob,'image/png');
    } catch {setExportError('Could not export PNG. Download SVG instead.');}
    finally {URL.revokeObjectURL(url);}
  }
  const fileStem=String(result.input.gene || 'locus').replace(/[^a-zA-Z0-9_-]/g,'_')+`_${result.input.position}_${result.input.ref}${result.input.alt}`;
  return <section aria-label="Genomic SNP final report">
    <h2>2. Final Report</h2>
    <div className="snp-actions" style={{marginBottom:16}}>
      <button onClick={()=>download(fileStem+'_report.html',html,'text/html')}>Download HTML report to browser Downloads</button>
      <button onClick={()=>download(fileStem+'_design.json',JSON.stringify(result,null,2),'application/json')}>Download genomic SNP JSON</button>
      {scheme && <button onClick={()=>download(buildDesignSchemeFilename(result),scheme,'image/svg+xml')}>Download design scheme SVG</button>}
      {scheme && <button onClick={downloadPng}>Download design scheme PNG</button>}
      <button onClick={onEdit}>Edit genomic SNP request</button>
      <button onClick={onOtherReports}>Show other project reports</button>
    </div>
    <section aria-label="Sequence export" style={{background:'#fff',color:'#111827',padding:18,borderRadius:12,marginBottom:16}}>
      <h3>Download sequences</h3>
      <p>Design status: <strong>{result.status}</strong>. You can proceed after reviewing the limitations. Exporting does not change the scientific status.</p>
      <ul>{result.blockers.map((text,i)=><li key={i}>{text}</li>)}</ul>
      <details><summary>All review limitations</summary><ul>{result.warnings.map((text,i)=><li key={i}>{text}</li>)}</ul></details>
      <p>Select guide/donor pairs. Each guide is exported with its matched ssODN; these are alternatives, not a pool. The primary PCR primer pair is included.</p>
      {result.candidates.map(c=><label key={c.name} style={{display:'block',marginBottom:6}}><input type="checkbox" checked={selectedNames.includes(c.name)} onChange={e=>{setSelection({result,names:e.target.checked?[...selectedNames,c.name]:selectedNames.filter(n=>n!==c.name)});setReview({result,acknowledged:false,note});}}/> {c.name} + matched ssODN  -  {c.protection.tier} protection</label>)}
      <label style={{display:'block',margin:'12px 0'}}>Review note (optional)<input style={{display:'block',width:'100%',color:'#111827',background:'#fff'}} value={note} onChange={e=>setReview({result,acknowledged:false,note:e.target.value})}/></label>
      <label style={{display:'block',margin:'12px 0'}}><input type="checkbox" checked={acknowledged} onChange={e=>setReview({result,acknowledged:e.target.checked,note})}/> I reviewed the selected pairs and limitations and choose to proceed despite the current design status.</label>
      <div className="snp-actions">
        <button disabled={!selectedNames.length} onClick={()=>exportSequences(false)}>Download draft sequences CSV</button>
        <button disabled={!selectedNames.length || !acknowledged} onClick={()=>exportSequences(true)}>Proceed after review  -  download sequences CSV</button>
      </div>
    </section>
    {exportError && <p role="alert">{exportError}</p>}
    <iframe title="ASSURED final design report" srcDoc={html} sandbox="allow-downloads" style={{width:'100%',height:'78vh',minHeight:650,border:'1px solid #d0d5dd',borderRadius:12,background:'white'}} />
  </section>;
}
