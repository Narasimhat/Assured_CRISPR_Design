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

### `two-genes-partial-first.gb`

- **Source:** fully synthetic (deterministic generator); no reference, project or subject data.
- **Reproduces:** the hazard in NCBI RefSeqGene records that annotate a neighbouring gene.
  The first CDS in the file belongs to `NEIGHBOURA` and is partial (`<1..70`), out of frame
  (70 nt) and lacks ATG — exactly like TOMM40 in `NG_007084`. `TARGETB` is the complete gene.
- **What it pins:** selecting a CDS by file order designs against the wrong gene. Selecting
  by annotation completeness does not, and the choice must still be reported because it was
  inferred rather than requested. Stating the intended gene removes the ambiguity.

### `synthetic-tagging.gb`

- **Source:** fully synthetic (deterministic generator); no reference, project or subject data.
- **Shape:** single gene `TAGME`, two-exon CDS (1200 nt / 399 aa), with 1500 bp of flank
  before the ATG and 1800 bp after the stop codon.
- **Why those flanks:** N- and C-terminal designs need to place 400 bp homology arms *and*
  position recommended primers wholly outside those arms with ≥50 bp clearance. A tighter
  reference falls back to unvalidated primer placement and stops testing the real path.
- **What it pins:** terminal-tag donor construction, internal-tag frame validation,
  outside-homology-arm primer margins, and the refusal paths for unsupported cassettes and
  malformed or off-target custom guides.
- **Useful residues:** 50 is Phe, 100 is Arg. Internal-tag sites on either side of the
  locus produce donors on opposite strands, which is what exercises orientation handling.

### `nr2f2-ng016753.gb`

- **Source:** NCBI RefSeqGene `NG_016753.1` (21,336 bp), unmodified, retrieved 2026-10-07.
- **Gene:** NR2F2 (Gene ID 7026), CDS `join(11179..11620,13149..13676,16421..16695)`, protein
  `NP_066285.1` (414 aa). The record also annotates the antisense gene `NR2F2-AS1` first, so the
  design must be told the intended gene.
- **What it pins:** C-terminal tag guide selection. The guide nearest the stop codon (-12 bp)
  grades a tier below the guide at -14 bp, whose cut is 2 bp from it. Guide selection used to
  choose the pair by proximity before scoring, which discarded the better guide.
- Public reference sequence only; contains no project or subject data.

## Adding a fixture

Add the reference here, then add a case to `CASES` in `../regression-fixtures.test.js`.

Every case is additionally checked against the universal invariants in that file, so a
new fixture strengthens the whole suite rather than only its own scenario. A fixture left
unreferenced by any case will fail the suite.

### `gene-fetch/responses.json`

- **Source:** responses recorded on 2026-10-16 from Ensembl REST (`lookup/symbol`, `sequence/region`, `info/*`), NCBI Datasets (`gene/symbol/.../product_report`), and NCBI E-utilities (`efetch` nuccore, ClinVar `esearch`/`esummary`), keyed by request URL.
- **Genes:** MYD88 (forward strand, 5 exons) and HBB (reverse strand, 3 exons). Ensembl and NCBI transcript lists are trimmed to the MANE Select transcript plus up to two others, so transcript selection is still exercised. ClinVar records: MYD88 rs387907272, HBB VCV000015333 (sickle-cell, c.20A>T), HBB haplotype 446748, PTPRO c.2829+1G>A.
- **Regions:** the genomic sequence is recorded for the gene fetch (gene span ± 1 kb) and for Genomic SNP references (± 6 kb) of the MYD88 and HBB variants.
- **`hbb-splice-check-result.json`:** the output of `scripts/splice_check.py` (SpliceAI 1.3.1) for the reverse-strand HBB sickle-cell design with its 6 kb reference, run on 2026-10-16. Largest change from the blocking changes 0.124 (acceptor loss), the edit alone 0.011.
- **What it pins:** the GenBank record built from each source, `cdnaCoordinate`, ClinVar parsing and the Genomic SNP designer accepting a fetched reference. Public data only; tests replay it and never touch the network.

### `dipk2a-region.gb`

- **Source:** GRCh38 `NC_000003.12:143971198..143992967` (NCBI efetch, retrieved 2026-10-25), plus strand. Public reference sequence only.
- **Annotation:** the three RefSeq CDS of DIPK2A, written as `join()` locations from the RefSeq mRNA exon features: MANE Select `NM_173552.5` (430 aa), `NM_001134470.2` (221 aa) and `NM_001363944.1` (192 aa). Each joined CDS translates to its RefSeq protein.
- **Why it is here:** a knockout pair chosen on geometry alone put one guide 63 nt before the last exon junction. Its frameshifts escape NMD and leave a stable protein of about 70% of full length, so a Western blot shows protein although the ICE knockout score reads 100%. The expected values in `ko-outcomes.test.js` were produced by the Assured QC engine's coding module (`coding.js`) on this record.

### `ko-rank-dipk2a-edits.json`

- **What it is:** the output of `tools/ko-rank/lindel_outcomes.py` (Lindel, Chen et al. 2019, MIT licence) for three DIPK2A guides on `dipk2a-region.gb`: the two guides of a knockout pair whose clones showed protein, and one guide the ranking puts first in exon 2. Each guide carries its 65-nt Lindel input and every predicted outcome class with its frequency.
- **Why it is here:** `ko-rank.test.js` classifies these outcomes with `koOutcomes.js` without needing Python or the Lindel weights, so the pipeline's second half and the class-to-genome mapping on both strands are checked in CI.

### `lindel-parity.json`

- **What it is:** Lindel's own output (`Lindel.Predictor.gen_prediction`, github.com/shendurelab/Lindel commit `fdcad580ba76bcfb7a98f58c3769b76f31693d63`, MIT licence) for 10 65-nt windows: the three DIPK2A guides of `ko-rank-dipk2a-edits.json` and seven others chosen from a larger set of random windows to cover plain sequence, microhomology repeats, a homopolymer and sequence at the window ends. All 557 class frequencies and the frame-shift ratio, to 12 significant digits. The windows are random or from the public DIPK2A reference; nothing here is lab data.
- **Why it is here:** `lindel.test.js` requires the JavaScript port in `src/lindel/` to match these to within 1e-10 (it matches to 1e-16 on 5,200 windows when run against Python directly).

### `ko-rank-dipk2a-ranking.csv`

- **What it is:** the ranking of all 145 NGG guides that cut non-terminal coding exons of `dipk2a-region.gb`, written by the Python pipeline `tools/ko-rank/run.sh` (Lindel from Python, outcomes classified by `koOutcomes.js`).
- **Why it is here:** `lindel.test.js` checks that the JavaScript pipeline reproduces it exactly, column for column and in the same order.
