Design Strategy: PSEN1 p.N32R

Conservative substitution in PSEN1 N-terminus:
- Target mutation: p.N32R
- Coding change used here: c.94A>C and c.95A>G (AAT -> CGT)

1. Gene Info
- Group: [to be assigned]
- Iris ID: [to be assigned]
- Project responsible: [to be assigned]
- Gene: PSEN1 (Presenilin 1)
- Ensembl gene/transcript: ENSG00000080815 / ENST00000324501 (PSEN1-001)
- RefSeq (template annotation): CCDS9812
- Genomic locus in provided file: chr14:73136418-73223691 (GRCh38)
- Strand in provided file: forward (+)
- Target mutation coordinates in provided sequence file:
- Local coordinates: 34386-34388 (codon 32, WT AAT)
- chr14 coordinates: 73170803-73170805

2. gRNA Sequences (SpCas9, 5'->3')

| Name | Sequence (protospacer) | PAM | Strand | Cut site (local) | Distance to edit | GC% | Notes |
|---|---|---|---|---:|---:|---:|---|
| PSEN1_N32R_KI_gRNA1 | TATAGAATGACAATAGAGAA | CGG | + | 34392/34393 | 4 bp | 25.0 | Closest cut; low GC. If U6 expression is used, prepend 5' G (`GTATAGAATGACAATAGAGAA`). |
| PSEN1_N32R_KI_gRNA2 | GAATGACAATAGAGAACGGC | AGG | + | 34396/34397 | 8 bp | 45.0 | Better GC; slightly farther cut. |

3. Primer (genomic PCR around codon 32)

Expected amplicon size: ~457 bp

| Name | Sequence (5'->3') | Binding coordinates (local) | Tm (Wallace) | GC% | Notes |
|---|---|---|---:|---:|---|
| PSEN1_N32R_Fw_1 | GACCTGAATGCCTTCAGTGAAC | 34188-34209 | 66 | 50.0 | Primary forward primer |
| PSEN1_N32R_Rv_1 | AAACTCATACGTACAGCTGCCC | 34623-34644 (reverse primer binds + strand) | 66 | 50.0 | Primary reverse primer |
| PSEN1_N32R_Fw_2 | AGAACTCATAGTGACGGGTCTG | 34279-34300 | 66 | 50.0 | Backup forward primer |
| PSEN1_N32R_Rv_2 | GCTAAGTCATGCCCCTTCAATG | 34714-34735 (reverse primer binds + strand) | 66 | 50.0 | Backup reverse primer |

Recommended pairs:
- Pair A: `PSEN1_N32R_Fw_1` + `PSEN1_N32R_Rv_1` -> 457 bp amplicon
- Pair B: `PSEN1_N32R_Fw_2` + `PSEN1_N32R_Rv_2` -> 457 bp amplicon

4. Donor Templates (ssODN)

Design basis:
- ASSURED protocol: 127 nt each, asymmetric 36 nt distal HA + 91 nt proximal HA; non-PAM strand (- strand = RC of gRNA protospacer strand). PAM-disrupting silent mutation included in each.
- Color convention for visual sequence below: proximal HA = dark blue, distal HA = green, edited bases = bold yellow.
- Note: because donors are shown 5'->3' on the non-PAM strand, the 91 nt proximal HA appears first, followed by the 36 nt distal HA.

4.1 ssODN for PSEN1_N32R_KI_gRNA1
- Name: PSEN1_N32R_KI_ssODN_gRNA1
- Length: 127 nt
- Sequence (5'->3', plain):
`TCCACCACCTGCCGGGAGTTACCCTGGGGTCGTCCATTAGATAATGGCTCAGGGTGGCCAAGGCTCCGTCTGTCGTTGTGCTCCTGTCGTTCTCTACGGTCATTCTATAAGCACAAGAAAAACATTT`
- Sequence (5'->3', formatted):
<span style="color:#0B3D91;">TCCACCACCTGCCGGGAGTTACCCTGGGGTCGTCCATTAGATAATGGCTCAGGGTGGCCAAGGCTCCGTCTGTCGTTGTGCTCCTG<span style="background-color:#FFD84D;color:#000000;font-weight:700;">T</span>CGTT</span><span style="color:#2E8B57;">CTCTA<span style="background-color:#FFD84D;color:#000000;font-weight:700;">C</span><span style="background-color:#FFD84D;color:#000000;font-weight:700;">G</span>GTCATTCTATAAGCACAAGAAAAACATTT</span>
- Intended edits on + strand:
- p.N32R: c.94A>C and c.95A>G (AAT -> CGT)
- PAM block: c.105G>A (CGG -> CGA, p.R35=)

4.2 ssODN for PSEN1_N32R_KI_gRNA2
- Name: PSEN1_N32R_KI_ssODN_gRNA2
- Length: 127 nt
- Sequence (5'->3', plain):
`TTGCTCCACCACCTGCCGGGAGTTACCCTGGGGTCGTCCATTAGATAATGGCTCAGGGTGGCCAAGGCTCCGTCTGTCGTTGTGCTCTTGCCGTTCTCTACGGTCATTCTATAAGCACAAGAAAAAC`
- Sequence (5'->3', formatted):
<span style="color:#0B3D91;">TTGCTCCACCACCTGCCGGGAGTTACCCTGGGGTCGTCCATTAGATAATGGCTCAGGGTGGCCAAGGCTCCGTCTGTCGTTGTGCTC<span style="background-color:#FFD84D;color:#000000;font-weight:700;">T</span>TGC</span><span style="color:#2E8B57;">CGTTCTCTA<span style="background-color:#FFD84D;color:#000000;font-weight:700;">C</span><span style="background-color:#FFD84D;color:#000000;font-weight:700;">G</span>GTCATTCTATAAGCACAAGAAAAAC</span>
- Intended edits on + strand:
- p.N32R: c.94A>C and c.95A>G (AAT -> CGT)
- PAM block: c.108G>A (CAG -> CAA, p.Q36=)

WT vs Mutant alignment (local + strand, 34374-34405)
- WT: `TTATAGAATGACAATAGAGAACGGCAGGAGCA`
- gRNA1 ssODN allele: `TTATAGAATGACCGTAGAGAACGACAGGAGCA`
- gRNA2 ssODN allele: `TTATAGAATGACCGTAGAGAACGGCAAGAGCA`
- Changed bases are at c.94/c.95 for N32R plus one silent PAM-block base per guide.

5. Notes
- Off-target ranking is not included from this local-only run. Run CRISPOR/Cas-OFFinder/CHOPCHOP before ordering.
- Verify final donor with your preferred synthesis constraints (phosphorothioate ends, purification grade, and max homopolymer policy).
