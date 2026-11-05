# ASSURED Epigenome Editing — research prototype v0.1

**LPA is the primary research target; PCSK9 is the positive control.**

This is an isolated, dependency-free CommonJS module and does not modify the existing CRISPR donor design, browser workflow, or Assured QC export.

## Run

```bash
node epigenome-editing/test-target-explorer.cjs
```

## Current scope

The target explorer creates a structured annotation/QC skeleton for LPA and PCSK9. It enforces an explicit GRCh37/GRCh38 genome build and 0-based half-open coordinates. Genomic intervals must be provided with source attribution. It does **not** fetch reference sequence, invent TSS/promoter coordinates, generate guides, or predict off-target sites.

```js
const { buildTargetReport } = require('./epigenome-editing/target-explorer.cjs');
const report = buildTargetReport({ gene: 'LPA', genomeBuild: 'GRCh38' });
console.log(JSON.stringify(report, null, 2));
```

## Planned follow-up

1. Resolve validated MANE/Ensembl/NCBI transcript IDs, assembly-specific LPA and PCSK9 transcription start sites, CpG annotations and provenance.
2. Flag KIV-2 repeat complexity and haplotype/structural variation in LPA before guide evaluation.
3. Add non-targeting control and ZIM3-KRAB transient comparator alongside the published dCas9-DNMT3A-DNMT3L-KRAB architecture.
4. Validate hepatocyte maturation and distinguish apo(a) secretion from assembled circulating Lp(a).
5. Add versioned export to ASSURED QC after schema review.

## Literature

Tremblay et al., *Nature Medicine* (2025), DOI: 10.1038/s41591-025-03508-x.

**Limitations:** Research-only annotation scaffold. No sequence targeting or experimental protocol is provided; no therapeutic efficacy is implied.
