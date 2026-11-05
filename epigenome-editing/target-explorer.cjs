// ASSURED Epigenome Editing v0.1: reference-aware annotation prototype.
// No guide sequences, off-target predictions, or clinical recommendations.
const TARGETS = Object.freeze({
  LPA: { role: 'primary', readouts: ['LPA mRNA', 'apo(a)', 'Lp(a) assembly', 'CpG methylation'], cautions: ['KIV-2 repeat copy-number variation', 'hepatocyte maturity'] },
  PCSK9: { role: 'positive_control', readouts: ['PCSK9 mRNA', 'secreted PCSK9', 'CpG methylation'], cautions: ['preclinical benchmark'] }
});
const EDITORS = Object.freeze({
  durable_candidate: ['dCas9', 'DNMT3A', 'DNMT3L', 'KRAB'],
  transient_comparator: ['dCas9', 'ZIM3-KRAB']
});
function buildTargetReport({ gene, genomeBuild, annotations = [] }) {
  if (!Object.hasOwn(TARGETS, gene)) throw Error('Unsupported target');
  if (!['GRCh37', 'GRCh38'].includes(genomeBuild)) throw Error('Explicit reference build required');
  if (!Array.isArray(annotations)) throw Error('Annotations must be an array');
  const checked = annotations.map(a => {
    if (a.genomeBuild !== genomeBuild || !/^chr(?:[1-9]|1[0-9]|2[0-2]|X|Y)$/.test(a.chromosome) ||
      !Number.isSafeInteger(a.start) || !Number.isSafeInteger(a.end) || a.start < 0 || a.end <= a.start)
      throw Error('Invalid annotation/build; use 0-based half-open coordinates');
    return { chromosome: a.chromosome, start: a.start, end: a.end, genomeBuild, source: a.source || 'unverified', type: a.type || 'unspecified' };
  });
  return {
    schemaVersion: '0.1.0', status: 'annotation_only', gene, role: TARGETS[gene].role,
    genomeBuild, coordinateConvention: 'zero_based_half_open', annotations: checked,
    editors: EDITORS, readouts: TARGETS[gene].readouts,
    cautions: [...TARGETS[gene].cautions, ...(checked.length ? [] : ['No verified annotations yet'])],
    disclaimer: 'Research prototype only. No sequence-based targeting, specificity prediction, or therapeutic validation.'
  };
}
module.exports = { TARGETS, EDITORS, buildTargetReport };
