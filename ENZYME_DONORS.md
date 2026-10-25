# Cas12a/Mad7 HDR donors

In **Workspace**, fetch a gene or upload GenBank, select AsCas12a/LbCas12a/Mad7, and choose
the modification. Point mutations, internal tags and N-/C-terminal cassettes now
produce donors in the same **Report** used for Cas9, including HTML, figures,
ordering spreadsheets and QC JSON. Frameshift knockout uses end joining and needs no
HDR donor; defined HDR deletions are not implemented. The Genomic SNP tab also
accepts all three enzymes while sharing its existing nucleotide, pair and splice
validation rules. SpCas9 keeps its calibrated CFD behavior.

## Construction

- Point mutations choose an alternate codon minimizing nucleotide substitutions,
  with deterministic lexical ties and no species-specific codon-usage assumption.
- Internal tags insert the curated tag sequence after the requested residue.
  Insertions at or near annotated exon boundaries are refused pending a
  splice-aware design.
- Terminal donors use the same curated cassette presets as the existing app,
  replacing the native start/stop codon under the preset's N-/C-terminal convention.
- Tag donors use automatic or explicit ssODN, synthesized dsDNA block and cloned/AAV
  cassette formats with the shared homology-arm planner and length bounds. These are general
  HDR/synthesis heuristics, not enzyme- or cell-type-specific efficiency claims.
- Both predicted strand cuts must lie within the donor-covered reference interval.
  Arms below the chosen format's minimum, insufficient flanking reference,
  impossible synthesis lengths and uncovered edits refuse donor emission.
- SNP ssODNs use the same opposite-guide ordering heuristic as Cas9: antisense
  for a plus-strand guide, sense for a minus-strand guide. This is a shared design
  principle, not evidence of enzyme-specific HDR efficiency. Tag donors retain
  explicit strand selection. A cloned/AAV output
  contains only the homology cassette, not a ready-to-use vector or backbone.

The shared nearest-window policy chooses the guides. For SNPs, the donor is always the same complete 127-base reference window as
Cas9 in total length, with 91 nt toward the PAM and 36 nt on the opposite side
of the nominal target-strand cut, including the same
end-of-reference adjustment. Saved tag format/arm/strand settings cannot override
this policy. Internal tags retain the default 127-base reference window plus
the inserted tag. Each selected guide has an explicitly matched
donor. Co-delivery carries shared blocking changes on both donors and checks
each repaired allele against both guides; independent delivery keeps per-guide
changes. Terminal knock-ins use the shared homology-arm planner and cassette.
Explicit format/arm overrides remain available for tag donors. With co-delivery off, each
alternative is labeled
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
synonymous PAM destruction exists, SNP design proposes synonymous changes in the
configured PAM-proximal seed, within the same substitution cap and protein/splice
checks. These are review-required candidates: seed-only protection is unscored,
never assigned a fabricated CFD or a strong protection grade.

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

## Reports, downloads and traceability

The standard report shows guide DNA/PAM, matched donors, homology lengths,
expected/repaired codons and proteins, blocking changes, primer recommendations,
release findings and the design figure. The on-screen and downloaded HTML views
use the same presentation functions as Cas9. The canonical result also drives
the same order-row/spreadsheet pipeline and Assured QC JSON hand-off, including
enzyme, PAM geometry, both strand cuts and configuration provenance.

For ssODNs, both DNA strands are displayed, with the selected strand explicitly
labeled in input-reference coordinates. SNPs explicitly adopt the shared
opposite-guide ordering heuristic; enzyme-specific strand bias remains unvalidated. Terminal donors keep the chosen format, cassette and arm
annotations. Sequence exports retain review status; export does not constitute
ordering approval.

The module-level donor CSV/FASTA/GenBank helpers remain available for programmatic
use. The normal website uses the shared report/order/QC interfaces. Synthesis
flags are heuristics, not vendor approval. Model and licensed-repeat validation
requirements in ENZYME_GUIDES.md still apply.

### PAM-oriented asymmetry (donor policy 2)

The 91 nt flank faces the PAM and the opposite flank is 36 nt. For a plus-strand
Cas12a/Mad7 guide (5′ PAM), the reference window is `[cut - 91, cut + 36)`; for
a minus-strand guide it is `[cut - 36, cut + 91)`. Cas9's 3′ PAM uses the reverse
layout and is unchanged. The total stays 127 nt. Reference-end adjustments are
flagged when full nominal asymmetry cannot be achieved. This is a design heuristic,
not evidence of optimal Cas12a/Mad7 HDR efficiency or donor-strand preference.
