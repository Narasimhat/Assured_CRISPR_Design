# SCN5A Internal Tag ssODN Design Report

Date: 2026-03-30

Reference sequence:
[scn5a-ensg00000183873.gb](/U:/DATA%20MANAGMENT/Projects/AG%20Stem%20cell%20core%20Facility/projects%202024/Horizon_Pathfinder/Project%20plan/Tag_Knockin/scn5a-ensg00000183873.gb)

Reference constructs reviewed:
- [hH1c_SPOT_155-156_pcDNA3.1(+)_2](/U:/DATA%20MANAGMENT/Projects/AG%20Stem%20cell%20core%20Facility/projects%202024/Horizon_Pathfinder/Project%20plan/Tag_Knockin/hH1c_SPOT_155-156_pcDNA3.1(+)_2)
- [hH1c_alphaBungarotoxine_155-156_pcDNA3.1(+)_2](/U:/DATA%20MANAGMENT/Projects/AG%20Stem%20cell%20core%20Facility/projects%202024/Horizon_Pathfinder/Project%20plan/Tag_Knockin/hH1c_alphaBungarotoxine_155-156_pcDNA3.1(+)_2)
- [Nav1.5_tag_constructs.pptx](/U:/DATA%20MANAGMENT/Projects/AG%20Stem%20cell%20core%20Facility/projects%202024/Horizon_Pathfinder/Project%20plan/Tag_Knockin/Nav1.5_tag_constructs.pptx)

Transcript used:
- SCN5A-001
- ENST00000413689
- CCDS46799

Local coding context:
- P155 = `CCC`
- W156 = `TGG`
- T157 = `ACC`
- K158 = `AAG`

## Design 1
SCN5A internal SPOT knockin after P155, before W156

Insert:
- SPOT tag = `GACCGCGTGCGCGCCGTGAGCCATTGGAGCAGC`
- Length = 35 bp

Insertion model:
- protein junction = `...P155-[SPOT]-W156...`
- genomic insertion site = after base 28257, before base 28258 of the CDS context

### Primary gRNA
- Spacer: `TCGACATACTTGGTCCAGGG`
- PAM: `TGG`
- Strand: `-`
- GC: `55%`
- Cut: exact insertion site

### Backup gRNAs
- Backup 1: `CCCAGCACGACCCTCCACCC` `TGG` | `+` strand | GC `75%` | cut 3 bp upstream
- Backup 2: `CACTCGACATACTTGGTCCA` `GGG` | `-` strand | GC `50%` | cut 3 bp downstream

### HDR shield mutation
- Intended silent change: `T157 ACC -> ACA`
- Purpose: disrupt guide seed sequence after HDR

### ssODN
Architecture:
- `5' HA (60 nt)` + `SPOT insert (35 nt)` + `3' HA (58 nt with silent change)`

Annotated donor, sense orientation:
```text
[5'HA]   TCATCATGTGCACCATCCTCACCAACTGCGTGTTCATGGCCCAGCACGACCCTCCACCCT
[INSERT] GACCGCGTGCGCGCCGTGAGCCATTGGAGCAGC
[3'HA]   GGACAAAGTATGTCGAGTGAGTATCTTCAGGGCCTCTTCTCCACGTGGCCCCCTCCCTTC
```

Full ssODN, sense:
```text
TCATCATGTGCACCATCCTCACCAACTGCGTGTTCATGGCCCAGCACGACCCTCCACCCTGACCGCGTGCGCGCCGTGAGCCATTGGAGCAGCGGACAAAGTATGTCGAGTGAGTATCTTCAGGGCCTCTTCTCCACGTGGCCCCCTCCCTTC
```

Full ssODN, antisense:
```text
GAAGGGAGGGGGCCACGTGGAGAAGAGGCCCTGAAGATACTCACTCGACATACTTTGTCCGCTGCTCCAATGGCTCACGGCGCGCACGCGGTCAGGGTGGAGGGTCGTGCTGGGCCATGAACACGCAGTTGGTGAGGATGGTGCACATGATGA
```

### Validation primers
- Forward: `GAAAGAGACCAGCCTGGGTGGAGG`
- Reverse: `ACTTTCTACTTTGCCACTCTGGAG`

## Design 2
SCN5A internal alphaBungarotoxin knockin after W156, before T157

Insert:
- alphaBungarotoxin tag = `CGATACTATGAAAGCAGTCTAGAGCCTTACCCAGAC`
- Length = 36 bp

Insertion model:
- protein junction = `...W156-[alphaBungarotoxin]-T157...`
- genomic insertion site = after base 28260, before base 28261 of the CDS context

### Primary gRNA
- Spacer: `CACTCGACATACTTGGTCCA`
- PAM: `GGG`
- Strand: `-`
- GC: `50%`
- Cut: exact insertion site

### Backup gRNAs
- Backup 1: `TCGACATACTTGGTCCAGGG` `TGG` | `-` strand | GC `55%` | cut 3 bp upstream
- Backup 2: `CCCAGCACGACCCTCCACCC` `TGG` | `+` strand | GC `75%` | cut 6 bp upstream

### HDR shield mutation
- Intended silent change: `K158 AAG -> AAA`
- Purpose: disrupt guide seed sequence after HDR

### ssODN
Architecture:
- `5' HA (60 nt)` + `alphaBungarotoxin insert (36 nt)` + `3' HA (60 nt with silent change)`

Annotated donor, sense orientation:
```text
[5'HA]   TCATGTGCACCATCCTCACCAACTGCGTGTTCATGGCCCAGCACGACCCTCCACCCTGGA
[INSERT] CGATACTATGAAAGCAGTCTAGAGCCTTACCCAGAC
[3'HA]   CCAAATATGTCGAGTGAGTATCTTCAGGGCCTCTTCTCCACGTGGCCCCCTCCCTTCCTT
```

Full ssODN, sense:
```text
TCATGTGCACCATCCTCACCAACTGCGTGTTCATGGCCCAGCACGACCCTCCACCCTGGACGATACTATGAAAGCAGTCTAGAGCCTTACCCAGACCCAAATATGTCGAGTGAGTATCTTCAGGGCCTCTTCTCCACGTGGCCCCCTCCCTTCCTT
```

Full ssODN, antisense:
```text
AAGGAAGGGAGGGGGCCACGTGGAGAAGAGGCCCTGAAGATACTCACTCGACATATTTGGGTCTGGGTAAGGCTCTAGACTGCTTTCATAGTATCGTCCAGGGTGGAGGGTCGTGCTGGGCCATGAACACGCAGTTGGTGAGGATGGTGCACATGA
```

### Validation primers
- Forward: `AGAGACCAGCCTGGGTGGAGGGGG`
- Reverse: `GAAACTTTCTACTTTGCCACTCTG`

## Ordering Notes
- Both designs are internal, in-frame insertions and are not standard N-terminal or C-terminal HDR events.
- Primary guides cut at the intended insertion junction, which is favorable for HDR.
- Both designs include a synonymous shielding change in the 3' homology arm to reduce re-cutting of the edited allele.
- Backup guide 2 for both designs has high GC (`75%`) and should be treated as a fallback rather than the first choice.
- Order both sense and antisense ssODNs if you want flexibility during pilot optimization.

## Review Before Ordering
- Confirm whether you want the ssODN ordered exactly as written or with phosphorothioate end protection.
- Confirm the final donor arm length policy for your platform. These candidates use approximately `60/60` nt arms.
- Confirm the protein-level junction from the Horizon construct strategy before final synthesis approval.
- Confirm that internal insertion at this site does not disrupt a known SCN5A functional motif needed for the specific assay.
