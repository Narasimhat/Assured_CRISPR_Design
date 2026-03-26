# APOE mScarlet Reporter Knock-in Design

## Basis from existing folder

This design is derived from the existing APOE HaloTag knock-in projects:

- `45638 (34085) - Halo-tagging of endogeneous ApoE2`
- `45639 (34085) - Halo-tagging of endogeneous ApoE3`
- `45640 (34085) - Halo-tagging of endogeneous ApoE4`

Across those three projects, the extracted plan documents are consistent on the core strategy:

- Gene: `APOE` (`ENSG00000130203`)
- Genome build: `GRCh38 / hg38`
- Transcript: `APOE-001` (`ENST00000252486`)
- Genomic region: `chr19:44905754-44909393`
- Existing KI gRNA sequence listed in the plans: `GGCGTTCAGTGATTGTCGC`
- Existing validation primers:
  - `Halo_Tag FWD Set 2 (978)`: `CCTGATCGGTATGGGCAAAT`
  - `Halo_Tag REV Set 2 (979)`: `GTCCACAGCCTTGCAGTTA`
  - `Batch FWD Set1 (946)`: `CCTGGACGAGGTGAAGGA`
  - `Batch REV Set1 (947)`: `TAATCCCAGCTACTGAGGCA`

The GenBank donor map in the ApoE2 project shows the intended architecture:

- 5' homology arm at `3162..3881`
- inserted cassette labeled `linker + HaloTag7` at `3872..4798`
- 3' homology arm at `4789..10`

That indicates the existing ApoE design is a C-terminal in-frame fusion strategy using the same cut site and homology arm framework across ApoE2/3/4.

## Proposed mScarlet knock-in strategy

Use the same ApoE C-terminal knock-in framework, but replace the `linker + HaloTag7` insert with `linker + mScarlet`.

Recommended donor architecture:

`5' APOE homology arm` + `in-frame linker` + `mScarlet CDS` + `stop codon` + `3' APOE homology arm`

Operationally, this means:

1. Reuse the same APOE target transcript and same C-terminal insertion position as the HaloTag projects.
2. Reuse the same 5' and 3' ApoE homology arms from the HaloTag donor backbone.
3. Remove the HaloTag7 coding region.
4. Insert an in-frame `mScarlet` coding sequence in its place.
5. Keep the junctions compatible with the existing ApoE donor design so the fusion remains in-frame and localized at the same locus.

## Recommended cassette layout

Recommended fusion cassette:

`APOE coding sequence (without native stop)` + `flexible linker` + `mScarlet` + `STOP`

Recommended linker:

- Use a short flexible linker if you want to stay close to the existing Halo strategy.
- A practical default is `(GGGGS)2` or `(GGGGS)3`.

Recommended reporter sequence choice:

- Use `mScarlet-I` rather than older `mScarlet` variants if no project-specific constraint requires otherwise.
- Use the CDS without an initiator methionine requirement if it is fused directly in frame to ApoE.
- Do not include an independent promoter.

## What can be reused directly

- APOE gene/transcript selection
- The existing CRISPR cut-site strategy from the HaloTag ApoE projects
- The donor arm concept and likely the exact homology arms
- The outer genomic validation primer pair `946/947`

## What should be redesigned for mScarlet

- Internal reporter-specific integration primers
- The insert sequence itself
- Any PAM-disrupting or re-cut protection changes within the donor
- Junction QC primers if you want insert-specific confirmation instead of Halo-specific confirmation

The `978/979` primers in the existing plans are HaloTag-specific and should not be reused unchanged for mScarlet unless they still bind conserved junction sequence outside the replaced insert.

## Draft design specification

### Target

- Target gene: `APOE`
- Transcript: `ENST00000252486`
- Editing concept: endogenous C-terminal fluorescent knock-in reporter
- Reporter: `mScarlet-I`

### Editing method

- CRISPR knock-in using the existing ApoE KI guide reported in the project plans:
  - `GGCGTTCAGTGATTGTCGC`
- Deliver donor with the same ApoE homology arms used in the HaloTag donor design

### Donor structure

- Left homology arm: reuse from ApoE HaloTag donor
- Insert: linker + `mScarlet-I`
- Stop codon: directly after `mScarlet-I`
- Right homology arm: reuse from ApoE HaloTag donor

### Validation plan

- External genomic PCR:
  - Reuse `946` and `947` as outer primers
- Junction PCR:
  - Design one forward primer in ApoE genomic sequence upstream of the left junction
  - Design one reverse primer inside `mScarlet`
  - Design one forward primer inside `mScarlet`
  - Design one reverse primer in ApoE genomic sequence downstream of the right junction
- Sequence verification:
  - left junction
  - full insert
  - right junction
  - edit-blocking or PAM-disrupting changes

## Design decisions and cautions

- Because the ApoE HaloTag plans do not cleanly preserve the PAM in the extracted text, the gRNA should be re-validated against the exact ApoE allele and target sequence before ordering reagents.
- If the donor is built from the existing Halo donor backbone, verify the linker boundaries carefully so `mScarlet` stays in frame.
- ApoE is secreted; a C-terminal fluorescent fusion can alter trafficking or secretion. This is the main biological risk of the design.
- If preserving ApoE function is more important than direct fusion readout, an alternative would be a self-cleaving reporter strategy, but that would no longer match the HaloTag design logic already present in this folder.

## Minimal next-step implementation plan

1. Open the existing ApoE HaloTag donor sequence map.
2. Define the exact HaloTag insert boundaries.
3. Replace the HaloTag CDS with `mScarlet-I` in frame.
4. Add donor-protective silent mutations at the cut/PAM if needed.
5. Design two new mScarlet-specific junction primer pairs.
6. Export the final donor as `GenBank` and `SnapGene`.

## Conclusion

Based on the materials in this folder, the most defensible mScarlet reporter knock-in design is:

an `APOE` C-terminal knock-in that reuses the existing ApoE HaloTag CRISPR/homology-arm strategy and swaps the `HaloTag7` insert for an in-frame `mScarlet-I` fusion cassette with new reporter-specific validation primers.
