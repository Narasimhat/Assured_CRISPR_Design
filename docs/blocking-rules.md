# Guide blocking and release rules

When a donor repairs the cut, the original guide can cut again if the repaired allele still matches it.
The design engine therefore changes the donor so that each guide no longer matches the repaired allele,
and grades how well it succeeded. This page states the rules as implemented; constants are named so they can be
found and recalibrated.

## What is scored

The score is **CFD** (Cutting Frequency Determination; Doench et al. 2016, *Nat Biotechnol* 34:184-191,
supplementary tables 19 and 20, transcribed in `assured-crispr-designer/src/cfd.js` as `CFD_MISMATCH` and `CFD_PAM`).
The engine applies it to the **repaired allele**: the original guide is scored against the donor's edited target
site (`buildEditedGuideSite`, `scoreResidualActivity` in `src/designEngine.js`). The result is reported with every design as the
predicted residual activity of the unedited target, relative to a perfect match with an NGG PAM. Lower is better protected.

## Grades

`gradeProtectionFromCfd` in `src/designEngine.js`, using `CFD_PROTECTION_THRESHOLDS = { strong: 0.023, moderate: 0.10 }`:

| Grade | CFD of the repaired allele |
|---|---|
| strong | <= 0.023 |
| moderate | > 0.023 and <= 0.10 |
| weak | > 0.10 |

The CFD scores are published; **the two cut points are this tool's choice**. 0.023 is the value below which a site is
conventionally not treated as a plausible off-target. The raw score travels with the design so the cut points can be
checked against bench data.

If CFD cannot be computed (ambiguity codes, a site running past the end of the reference), `gradeProtection` falls back to
counting: a destroyed PAM is strong; otherwise seed mismatches plus one for a weakened PAM (NAG/NGA) give strong at 3 or more,
moderate at 2, weak at 1, none at 0. The report marks the fallback.

## Choosing the changes

- Up to `MAX_BLOCKING_CHANGES = 3` synonymous changes per guide; `normalizeMaxBlockingChanges` clamps a caller's cap to 1..3.
- Changes are chosen to minimise predicted residual activity, not by position order. Among changes that protect equally, the commoner
  human synonymous codon wins, and a change that would install a codon below `RARE_CODON_FLOOR = 0.10` of its amino-acid family
  is refused (`src/codonUsage.js`).
- No change is placed within `SPLICE_BOUNDARY_MARGIN = 3` bp of a CDS exon boundary. The engine does not model splicing; it
  avoids the window. See [splice-check.md](./splice-check.md).
- Two changes that are each synonymous but together change a codon are rejected (`keepsCodonsSynonymous`).
- A donor is not emitted unless the protein translated from the assembled donor carries the requested substitution and no
  unintended coding change.
- NAG and NGA PAMs are never treated as adequate blocking (README: residual activity 0.259 and 0.069).

## Guides and pairs

- Two guides are used by default. Automatically selected alternative guides must have cut sites at least 10 bp apart
  (README; the Genomic SNP code names the same spacing `MIN_PAIR_CUT_SEPARATION = 10` in `src/pairBlocking.js`); closely overlapping custom
  guides are kept only with a non-independence warning.
- In Genomic SNP mode a guide's cut must lie within `MAX_GUIDE_CUT_DISTANCE = 15` bp of the edit (the source comment notes that HDR falls off
  beyond about 10 bp).
- Every point-mutation or internal-tag ssODN is assessed against every offered guide. When cross-guide blocking is not strong, the report
  requires one matched guide/ssODN pair and forbids pooling the alternatives.

## Release state

Release is decided **per guide+donor pair** (`summarizeGuidePairReadiness`), so one weakly protected alternative does not condemn a soundly
protected pair. Co-delivery is the exception and stays all-or-nothing, because an unblocked guide re-cuts the allele the other donor repaired.
`getWeakProtectionAcceptance` records a written reason for accepting weak protection; it never overrides a donor that fails its protein
assertion, is unavailable under co-delivery, and never lets the design read `READY`. The states are `BLOCKED`, `REVIEW REQUIRED` and `READY`
(see the README).

## What this does not establish

- CFD predicts re-cutting of a mismatched site from published cell-based data; it is not a measurement for your cell line. Genome-wide
  guide and primer specificity are not checked by the engine and are stated as a standing requirement on every design.
- The cut points are not validated against clone-level outcomes in this repository.

## Where it is tested

`assured-crispr-designer/test/audit-claims.test.js`, `blocking-strategy.test.js`, `pair-blocking.test.js`, `review-fixes.test.js` and
`regression-fixtures.test.js` (run with `npm test` in `assured-crispr-designer`).
