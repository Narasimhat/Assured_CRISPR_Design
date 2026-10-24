# Enzyme guide discovery

In **Workspace**, fetch the gene from Ensembl/NCBI or upload GenBank, select the
enzyme in Basic details, and choose the modification as usual. SpCas9 retains
the existing complete workflow. AsCas12a and Mad7 generate modification-aware
guide plans in **Report**, with CSV, GenBank and JSON downloads. Raw DNA plus
CDS coordinates is also supported. The **Sequence Scan** tab is an advanced,
whole-sequence scanner; it is not needed for the normal reference workflow.

Point mutations search around the requested codon after checking its reference
amino acid; internal tags search around the insertion boundary; terminal tags
search around the start/stop boundary. The default search radius is 30 bp from
either predicted strand cut and is configurable to 1–500 bp. Knockout mode
shortlists guides cutting in preferred internal coding segments (or the CDS for
a single-exon gene); it does not select or validate a deletion pair. No nearby
guides is a valid empty result, not an invitation to substitute distant guides.
Uploaded/fetched CDS reference blockers are rejected before planning.

Cas12a/Mad7 reports explicitly contain **no donor construction, repaired-allele
protection or primer recommendations**, and never enter batch ordering or QC
donor exports. Gene-only KO library lookup is SpCas9-only: other enzymes need
a sequence-backed reference. The existing genomic SNP tab remains SpCas9-only.

The shared scanner adds guide discovery for SpCas9, AsCas12a
and Mad7. Existing protein-edit and genomic SNP donor calculations remain SpCas9
workflows. Do not feed Cas12a/Mad7 guides into their CFD or synonymous-blocking
calculations: those calculations are specific to SpCas9.

## Config and coordinates

`assured-crispr-designer/src/enzymeConfig.js` records a versioned PAM, PAM side,
spacer limits, repeat and repeat position, predicted strand-specific cut offsets,
seed length, model adapter name, filter defaults and license note for each enzyme.
The legacy SpCas9 finder now uses this scanner while preserving its existing
window, ordering, output fields and composition policy.

All internal/exported guide intervals are **0-based, half-open** relative to the
input sequence, including minus-strand guides. GenBank feature locations use
1-based inclusive coordinates and `complement(...)` for minus-strand guides.
Cut sites are interbase coordinates; target and non-target labels are relative
to the guide. Offsets are measured from the spacer's 5′ boundary in guide
orientation. AsCas12a/Mad7 defaults predict non-target cleavage at spacer offset
18 and target cleavage at offset 23. Actual cuts can be heterogeneous and depend
on enzyme, substrate and conditions. These defaults need experimental validation.
The Mad7 defaults are Cas12-family assumptions, not Mad7-specific measurements.

Candidates are scanned at every base on both strands, including overlapping PAMs.
Incomplete sites and ambiguous spacers are skipped. Input is DNA or one FASTA
record. Exclusion intervals use the input reference coordinates, not genomic
assembly coordinates unless the input is that entire contig.

Default discovery filters are GC 40–60%, no homopolymer longer than four,
and no non-overlapping reverse-complement arms of six bases. TTTT is excluded
only for Pol III expression. Filters can be changed; zero disables homopolymer
or complementary-arm screens. Exclusions screen the entire spacer/PAM interval.
These filters are screens, not calibrated predictors of cleavage or folding.
Failed candidates remain visible and are exported with reasons. Passing candidates
rank first; supplied model scores rank within each filter class.

## Direct repeats and scoring

Mad7's direct repeat is intentionally unset: licensed documentation was not
available during implementation. Supply the sequence, documentation reference
and version, and confirm verification. A mature AsCas12a repeat is supplied as
a starting value, but likewise requires confirmation against the actual reagent.
For Cas12-family enzymes the emitted full crRNA is RNA, **repeat + spacer**,
5′→3′. No PAM is included. SpCas9 exports only the spacer and does not claim it
is a complete sgRNA. User confirmation is recorded; it is not independent
verification by the application. License terms must be checked with Inscripta.

No trained DeepCpf1 model or weights are bundled. Unavailable scores are `null`,
never invented numeric predictions. The module API accepts a synchronous scorer:

```js
import { designEnzymeGuides } from './src/enzymeGuides.js';
const run = designEnzymeGuides(sequence, {
  enzyme: 'mad7',
  scorer: ({ guide, config, sequence }) => myValidatedModel(guide, config, sequence),
});
// Adapter returns { value: <finite number>, model: <name>, version: <version> }.
// Scores must share a scale where higher is better. Mad7 scores are always
// flagged approximate, including in ranking output and exports.
```

A DeepCpf1 adapter must construct the precise sequence context and enforce the
spacer/context lengths expected by its trained model; do not silently pad a
missing context or assume the model supports every configurable spacer length.
The whole reference and guide coordinates are passed for that purpose. In-house
adapters can be substituted without changing candidate discovery.

## CLI and genome searches

From `assured-crispr-designer`:

```sh
node scripts/enzyme_guides.mjs --sequence reference.fa --options options.json --out /tmp/mad7
```

Example `options.json`:

```json
{
  "enzyme": "mad7",
  "spacerLength": 23,
  "delivery": "rnp",
  "filters": { "gc_min": 40, "gc_max": 60 },
  "exclusions": [{ "start": 10, "end": 11, "label": "known SNP" }]
}
```

Add `--scorer ./model-adapter.mjs` for a trusted local module exporting `score`.
The CLI writes JSON, CSV and annotated GenBank. JSON retains the full reference,
config snapshot, timestamp, parameters and reference SHA-256. All runs remain
`REVIEW REQUIRED`.

The browser exports Cas-OFFinder input for passing guides; it does not execute
a genome search. A local CPU/OpenCL Cas-OFFinder installation and genome FASTA
are required for actual searching:

```sh
node scripts/enzyme_guides.mjs --sequence reference.fa --options options.json --out /tmp/mad7 \
  --cas-offinder /opt/cas-offinder --genome /data/GRCh38.fa --assembly GRCh38 --mismatches 3
```

The pattern puts the PAM at the correct end. Standard six-column Cas-OFFinder
output is checked against the queries, PAMs and mismatch counts. Target sequences
must be in guide orientation even for minus-strand hits. The full raw hit file
is retained beside the run; each guide receives the top 20 hits and total count.
This workflow searches substitutions, not bulges. A successful aligner exit is
recorded as completion; its assembly contents and completeness require review.

Specificity uses an explicitly **uncalibrated heuristic**, with risk per hit
`exp(-1.5 × seed mismatches - 0.5 × other mismatches)` and specificity
`100 / (1 + sum(off-target risks))`. This is not CFD, DeepCpf1 or a probability.
Seed positions are PAM-proximal (first eight spacer bases for the Cas12 entries,
last ten for SpCas9). Scores remain null unless the search completed and exactly
one intended target was found. Set `intendedTargets` in options to map candidate
IDs (e.g. `mad7:0:+:23`) to `{ "chromosome": "chr1", "start": 1234, "strand": "+" }`.
These are genome site coordinates, not input-fragment coordinates; a wrong map
can misclassify an on-target hit. Other perfect matches are retained as off-targets.

## Validation status

Automated tests cover strand/PAM placement, staggered cuts, overlapping sites,
boundaries, delivery-dependent filters, repeat verification, scoring provenance,
exports, Cas-OFFinder parsing, seed weighting and legacy Cas9 equivalence.

Outstanding before describing this as a validated Mad7 designer:

- Verify the Mad7 repeat, spacer limits and cut assumptions against licensed documentation.
- Install and validate a real Cas12a activity model; calibrate the Mad7 proxy with in-house data.
- Compare the same Cas12a inputs against CRISPOR or Benchling (including coordinates and strands).
- Run and independently check Cas-OFFinder against the intended genome assembly.
- Validate activity, specificity and cleavage positions experimentally.

No reference-tool equivalence, licensed-repeat verification, genome search, or
experimental validation is implied by passing the software tests.
