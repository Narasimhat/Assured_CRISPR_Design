# Enzyme-aware CRISPR design

In **Workspace**, fetch a gene or upload GenBank, select SpCas9, AsCas12a or
Mad7, and choose the modification. All three systems now use the same canonical
result format and the same on-screen report, HTML report, design figure,
primer workflow, ordering spreadsheets and Assured QC JSON export. Raw DNA with
CDS coordinates is also supported. **Sequence Scan** is an optional advanced
whole-sequence utility; it is not a separate modification-design workflow.

## Shared design principles

- **Knockout:** two guides, selected with the existing Cas9 exon/pair policy:
  non-terminal coding segments, preference for coding segments 2–4, pair spacing
  up to 140 bp, with 40–140 bp preferred. The same pair ranking and screening
  primer functions are used. Custom longer-deletion pairs use the existing
  deletion-screen PCR path. A single guide or duplicate cut cannot masquerade
  as a knockout pair. References with no usable pair receive an explicit error.
- **Point mutations:** inspect 10, 20, then 30 bp windows; rank blockability
  within the nearest available window, then composition and distance. Keep the
  near lead and add a distinct partner from the wider windows when one exists.
  Custom guides remain explicit choices. No distant guide silently replaces
  the closest-window design.
- **Internal/terminal tags:** use the same insertion anchors and nearest-window
  selection principles, curated cassette/protein checks, homology planning,
  screening primer searches and report sections as Cas9.
- **Composition:** in the normal design workflow, GC is an observation and an
  extreme-composition tie-break, not a hard 40–60% rejection gate. The native
  poly-A/poly-T screening and delivery-dependent U6 checks apply consistently.
- **Genomic SNP:** the existing two-guide/shared-or-independent donor policies,
  exact nucleotide validation and splice screens now accept all three enzymes.
  Coordinate/allele and reverse-reference rules are unchanged.
- **Reporting/export:** guide sequences, donors, opposing strands, codon/protein
  comparisons, primers, design figures, release verdict, order rows and QC hand-off
  come from the shared report/export code. Enzyme/config version, PAM side and
  staggered cuts are recorded. Cas9-only reference libraries are never proposed
  for another enzyme.

Differences belong in enzyme configuration and evidence: PAM/strand geometry,
spacer length, crRNA repeat, cut offsets, seed and scoring model. Cut-to-edit
windows for staggered systems use the nearest predicted strand cut; nominal
knockout deletion sizes use target-strand boundaries and additionally record
strand-cut combinations. Actual repaired junctions require sequencing.

Cas12a/Mad7 use canonical-PAM removal or target interruption as categorical
protection findings. **No SpCas9 CFD or fabricated residual-activity values are
applied.** Their activity and noncanonical-PAM/mismatch behavior require review;
that limitation does not remove design, report, primer or export functionality.
See [ENZYME_DONORS.md](./ENZYME_DONORS.md) for donor details.

Gene-only Cas9 reference-library mode remains specific to that library. Fetch or
upload the sequence to design another enzyme's guides instead of reusing Cas9
library spacers.

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

Advanced Sequence Scan filters default to GC 40–60%, no homopolymer longer than four,
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

The advanced scanner exports Cas-OFFinder input for passing guides; it does not execute
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
