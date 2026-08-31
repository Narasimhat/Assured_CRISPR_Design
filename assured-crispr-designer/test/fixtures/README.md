# Regression fixtures

Each fixture pins a finding from `audit/2026_GE_design_audit.md` to an executable
expectation, so an audited defect cannot silently return.

## What may live here

Public reference sequence and synthetic sequence only.

Internal project documents, IRIS identifiers, project numbers, cell-line records and
generated genomic reports must **not** be committed. Where a fixture derives from a real
project, only the gene, the requested edit, and public reference sequence are reproduced;
everything identifying the project is dropped.

## Provenance

### `apoe-r154s.gb`

- **Source:** NCBI RefSeqGene `NG_007084.2`, region 5600..8900, retrieved 2026-08-31
- **Gene:** APOE. The neighbouring TOMM40 gene and all unrelated annotation are removed.
- **Why this window:** the complete APOE CDS is retained so preprotein residue numbering
  is preserved. Residue 154 is Arg (`CGC`) — the codon the audited design mutated to
  `CGA`, which encodes Arg rather than the requested Ser.
- **Validated:** this 3,301 bp slice reproduces the full 10,612 bp record's design result
  exactly — same guides, PAMs, GC, blocking tiers, donors, amplicon and release status.
- Public reference sequence only; contains no project or subject data.

## Adding a fixture

Add the reference here, then add a case to `CASES` in `../regression-fixtures.test.js`.

Every case is additionally checked against the universal invariants in that file, so a
new fixture strengthens the whole suite rather than only its own scenario. A fixture left
unreferenced by any case will fail the suite.
