# Cas12a/Mad7 HDR donors

In **Workspace**, fetch a gene or upload GenBank, select AsCas12a/Mad7, and choose
the modification. Point mutations, internal tags and N-/C-terminal cassettes now
produce donors in **Report**. Frameshift knockout uses end joining and needs no
HDR donor; defined HDR deletions are not implemented. The separate Genomic SNP
tab and the SpCas9 engine retain their existing SpCas9-specific behavior.

## Construction

- Point mutations choose an alternate codon minimizing nucleotide substitutions,
  with deterministic lexical ties and no species-specific codon-usage assumption.
- Internal tags insert the curated tag sequence after the requested residue.
  Insertions at or near annotated exon boundaries are refused pending a
  splice-aware design.
- Terminal donors use the same curated cassette presets as the existing app,
  replacing the native start/stop codon under the preset's N-/C-terminal convention.
- Automatic or explicit ssODN, synthesized dsDNA block and cloned/AAV cassette
  formats use the shared homology-arm planner and length bounds. These are general
  HDR/synthesis heuristics, not enzyme- or cell-type-specific efficiency claims.
- Both predicted strand cuts must lie within the donor-covered reference interval.
  Arms below the chosen format's minimum, insufficient flanking reference,
  impossible synthesis lengths and uncovered edits refuse donor emission.
- The ssODN strand is an explicit user choice relative to the input record.
  No SpCas9 strand preference is applied to Cas12a/Mad7. A cloned/AAV output
  contains only the homology cassette, not a ready-to-use vector or backbone.

Up to two passing guides with target-strand cut sites at least 10 bp apart are
matched. Co-delivery constructs one shared donor and checks both guides. With
co-delivery off, each alternative has its own matched donor and is labeled
**one guide/donor pair at a time; do not pool alternatives**. When no guide passes
the filters, donors are blocked rather than attached to an unsuitable guide.

## Protein and allele validation

After all desired and synonymous changes, the donor is inserted back into the
reference and must reconstruct the edited allele exactly. Edits are projected
into the full spliced CDS and translated. The final protein must exactly equal
the asserted requested protein; this also checks the unmodified coding sequence.
Internal/terminal inserts must pass the existing frame/stop/preset checks,
including curated protein checks where the cassette carries them. A failed
assertion emits no donor. Desired edits in annotated splice windows are recorded
for independent splice review; this is not a splice-effect model.

## Re-cutting checks

Optional PAM blocking searches synonymous codon substitutions overlapping the
enzyme's PAM. It uses the configured IUPAC motif and guide orientation on both
strands, caps substitutions per guide at 1–3, preserves the requested protein,
avoids annotated splice windows, and never adds changes outside the donor.
It avoids independent changes in an already-edited codon. Where no valid
synonymous PAM destruction exists, it does not invent seed-mismatch protection.

Each donor is checked against every selected guide. Exact spacer matches with a
canonical enzyme PAM are searched on both strands near the repaired locus
(at least 50 bp around the original site, expanded for the insert) and across
the whole donor. This is a local exact-target screen, not an exhaustive
off-target or mismatched-allele search. The report distinguishes:

| Finding | Meaning |
|---|---|
| `intact_target` | An exact canonical target remains locally or in the donor. A matched donor is **BLOCKED**. |
| `canonical_pam_removed` | The original PAM no longer matches the configured motif. Noncanonical cleavage is not modeled. |
| `target_interrupted` | The insertion/replacement interrupts the original site; no intact canonical target was found locally or in the donor. |
| `mismatched_target_unscored` | Spacer changed, canonical PAM retained; mismatch tolerance needs independent review. |

**No CFD, residual activity or protection probability is assigned to Cas12a/Mad7.**
Even PAM-removed and target-interrupted designs remain **REVIEW REQUIRED**.
Noncanonical PAM activity, mismatch tolerance, assembly-specific off-targets,
splice effects, delivery, strand choice and experimental HDR efficiency still
require review. Independent synonymous edits can affect expression even when
the protein sequence is unchanged; codon usage is not optimized here.

## Downloads and traceability

The report shows DNA, homology lengths, matched guide IDs, desired/blocking edits,
full expected/repaired proteins, re-cutting findings and synthesis flags.
The run JSON includes requested parameters even when construction is blocked.

- **Donor CSV / FASTA:** selected 5′→3′ DNA sequence and explicit sense/antisense
  orientation relative to the input reference. BLOCKED exports are labeled for
  troubleshooting and must not be ordered.
- **Donor GenBank:** input-sense donor sequence with homology/core/edit features,
  independent of the chosen order strand; metadata records that choice.
- **Run JSON:** full config/version, reference and modified allele, parameters,
  guide pairing, checks, warnings and status.

These downloads are independent of the existing SpCas9 ordering/QC schemas.
Synthesis flags are heuristics, not vendor approval. Model and licensed-repeat
validation requirements in ENZYME_GUIDES.md still apply.
