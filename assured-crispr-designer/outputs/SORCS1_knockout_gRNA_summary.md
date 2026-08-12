# SORCS1 knockout gRNA design summary

**SpCas9 · NHEJ frameshift · Homo sapiens · RefSeqGene NG_029120.2**  
MANE transcript: `NM_052918.5` / `ENST00000263054`  
Generated: 2026-08-12

## Downloads

| Format | Link |
|--------|------|
| PDF (2 pages) | [Download PDF](https://github.com/Narasimhat/Assured_CRISPR_Design/raw/cursor/sorcs1-knockout-grna-design-e024/assured-crispr-designer/outputs/sorcs1_knockout_design_summary.pdf) |
| HTML | [Download HTML](https://github.com/Narasimhat/Assured_CRISPR_Design/raw/cursor/sorcs1-knockout-grna-design-e024/assured-crispr-designer/outputs/sorcs1_knockout_design_summary.html) |
| PDF on GitHub (in-browser preview) | [View PDF](https://github.com/Narasimhat/Assured_CRISPR_Design/blob/cursor/sorcs1-knockout-grna-design-e024/assured-crispr-designer/outputs/sorcs1_knockout_design_summary.pdf) |

## Strategy

Dual SpCas9 guide RNAs targeting coding **exon 4** to induce NHEJ indels and frameshift knockout. Early constitutive exons are preferred; extreme N- and C-terminal exons are avoided to reduce alternative start usage and residual protein risk.

| Field | Value |
|-------|-------|
| Gene | SORCS1 |
| Species | Homo sapiens |
| Target exon | Exon 4 (159 bp coding) |
| Nuclease / PAM | SpCas9 · NGG |

## Recommended pair (designer auto-select)

Source: ASSURED designer on NG_029120.2 · Cut spacing **103 bp**

| Guide | Spacer (20 nt, order without PAM) | PAM | Strand | GC% |
|-------|-----------------------------------|-----|--------|-----|
| SORCS1_KO_gRNA1 | `ATAAACTGCTCTCAATCTCC` | GGG | − | 40 |
| SORCS1_KO_gRNA2 | `TTCACCCCAAACAAGAAGAC` | TGG | + | 45 |

### Screening primers

| Primer | Sequence | Amplicon |
|--------|----------|----------|
| SORCS1_KO_Fw | `AAGCATTCTTTGCCTGCC` | ~450 bp |
| SORCS1_KO_Rev | `TTTAAACAAGCAACCTGAGACTC` | ~450 bp |

## Validated historical exon-4 pair

Historical hiPSC KO projects (`SorCS1-Exn4-gRNA1/2`); established lines MDCi053-A-27 / HMGUi001-A-28 · Spacing **7 bp**

| Guide | Spacer (20 nt) | PAM | Strand |
|-------|----------------|-----|--------|
| SorCS1-Exn4-gRNA1 | `GATAATGTTACTCACAGACC` | CGG | + |
| SorCS1-Exn4-gRNA2 | `ATAAACTGCTCTCAATCTCC` | GGG | − |

Primers: `TCAAGGTCCCTGTTTGGC` / `AGACTCTCCTTGCTTTCCC` (~452 bp)

## Brunello library guides (human)

| Spacer | PAM | Exon | Rule Set 2 |
|--------|-----|------|------------|
| `AGAACAGGGGACGCACTACG` | AGG | 1 | 0.6693 |
| `AGCTCTATGACTATAACCTG` | GGG | 2 | 0.7234 |
| `ATGTGTGTTTCATAGCAACC` | AGG | 13 | 0.6807 |
| `CCTCGTGACATACCTCATAG` | AGG | 9 | 0.6690 |

## Mouse ortholog candidates (`NM_021377`)

| Spacer | PAM | Exon |
|--------|-----|------|
| `GTTGATCAGCTCAGATGAAG` | GGG | 4 |
| `GATTATGTTACTCACAGACC` | CGG | 4 |
| `GCAGCTTATCCAGGAATCAG` | TGG | 5 |

## Ordering & validation notes

1. Order spacers **without** PAM; use SpCas9 (NGG).
2. For U6 expression, prepend a leading `G` if the spacer does not start with G.
3. Sanger-sequence the target locus in your parental line before ordering (SNPs can block cutting).
4. Test 2–4 guides; dual-guide RNP increases indel rate.
5. Validate KO by ICE/TIDE plus protein loss (western/IF); prefer frameshifting indels.

## Related files in this branch

- `assured-crispr-designer/outputs/sorcs1_knockout_design_card.json`
- `assured-crispr-designer/outputs/sorcs1_ko_auto.json`
- `assured-crispr-designer/outputs/sorcs1_ko_validated.json`
- `references/sorcs1-ng_029120.2.gb`
