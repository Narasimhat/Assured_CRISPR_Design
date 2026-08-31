# 2026_GE CRISPR design audit

Audit date: 2026-08-31

Source root: `U:\DATA MANAGMENT\Projects\Gene_Editing_Projects\Projects\2026_GE`

## Scope and interpretation

- Reviewed 28 directories named `Project plan`, containing 158 unique files. The design-bearing set included 31 DOCX, 17 PDF, 15 HTML, 29 XLSX, 11 TXT, 6 CSV, 20 GenBank, 5 SnapGene DNA, and 1 FASTA file. Images and scanner files were inventoried but were not treated as design specifications.
- Duplicate templates and the six individual Landthaler reports repeated inside the parent `Project plan` were counted once.
- Sequence checks used the rules now implemented in ASSURED CRISPR Designer: explicit 20 nt SpCas9 spacers, guide GC/poly-G/poly-T review, strict PAM disruption (NAG/NGA are not accepted as dead PAMs), final assembled-donor translation, guide/donor cross-protection, primer thermodynamics, and WT-versus-edited amplicon reporting.
- This is a computational and document-consistency audit. Genome-wide specificity, cell-line genotype, transcript choice, and wet-lab suitability still require independent confirmation before procurement or experimental use.

## Highest-priority findings

1. **APOE R154S donor collision:** the donor linked to `APOE_R154S_gRNA2` applies `CGC -> CGA` at the same codon requested as `CGC -> AGC`. The assembled donor therefore encodes Arg instead of the requested Ser. The current engine rejects this donor with a final protein assertion.
2. **Systematic false-positive guide blocking:** multiple reports call NAG/NGA PAM changes or one seed mismatch “guide blocking present.” These include APOE R176C, APOE V254E, PHF6 S199E/S199A, SCN5A internal tags, and several Landthaler tag designs. The current engine grades these as review-required and only passes strong disruption for every selected guide.
3. **Systematic false-positive primer readiness:** several reports label primer pairs ready despite extreme Tm/GC, self-/hetero-dimer risk, low-complexity runs, fallback placement, or lack of outside-homology-arm margin. The clearest examples are APOE R154S/V254E, EIF3D, EIF4E, UPF1, EIF4G1, and EIF4G3. The current engine no longer marks fallback or failed thermodynamic pairs ordering-ready.
4. **Order export lacked safety state:** older vendor workbooks carry sequences but not the design-readiness findings. The application now labels exports as procurement drafts and includes `Review Status` and `Review Notes` in the retained order preview/CSV.
5. **Metadata and copy-forward defects:** the POLQ plan says “knockout RetSat”; one APOE4 plan carries the APOE2 IRIS ID; several APOE/INS plans contain blank or incomplete guide rows; and the NALCN V316M/K1115N plans live only inside the E280D project document.

## Project-by-project review

| Project | Finding | Current handling / next action |
|---|---|---|
| 45638 APOE2 HALO | Original design table has a blank gRNA1 and a 19 nt gRNA2; the later experimental plan supplies a 19 nt gRNA1 and 20 nt gRNA2 and proposes pooled dual-guide delivery. | Current guide QC explicitly warns on non-20 nt spacers. Re-map both guides and prove the common AAV donor protects both before pooling. |
| 45639 APOE3 HALO | Same incomplete original guide table as 45638; relies on the shared later experimental plan. | Treat the later plan as a separate revision and repeat donor-versus-both-guides protection analysis. |
| 45640 APOE4 HALO | Two near-duplicate plan documents disagree on project identity; one displays IRIS 45638 instead of 45640. | Retire or mark the stale copy. Current exports retain project metadata alongside each order row. |
| 58769 INS mScarlet | gRNA1 and both PAM cells are blank; only gRNA2 is populated. The donor and primer pair exist, but the guide specification is incomplete. | Procurement blocked until a complete, reference-mapped guide/PAM record is present. |
| 62615 TP53BP1/53BP1 SD40 | gRNA1 has 30% GC; forward primer has a predicted 3-prime self-dimer risk. | Review alternate guide/primer candidates and re-run frame, junction, and guide-blocking checks on the exact transcript. |
| 62616 POLQ SD40 | Opening text incorrectly says “knockout RetSat”; forward primer has predicted 3-prime self-dimer risk. | Correct metadata before reuse. Primer and donor-frame review remain required. |
| 62619 RAD52 SD40 | Reverse primer has predicted 3-prime self-dimer risk. | Re-rank primer alternatives and verify donor frame/guide blocking against the selected transcript. |
| 62620 BRCA1 SD40 | gRNA2 contains GGGG; forward primer has predicted 3-prime self-dimer risk. | Review synthesis/activity risk and an alternate primer pair. |
| 71913 NALCN E280D | Guides pass basic composition screening, but the documented primer pair triggers review for 3-prime heterodimer risk and low GC. The same document also contains V316M and K1115N. | Re-rank primers and split or clearly version the three project records. |
| 71914 NALCN V316M | Project folder contains only a blank template; the completed design is embedded in the 71913 document. Cas9/Cas12 alternatives are mixed in one guide table. | Create an independent plan with nuclease-specific PAM, donor, and order sections. |
| 71915 NALCN K1115N | Project folder contains only a blank template; completed design is embedded in the 71913 document. | Create an independent plan and run final donor-translation and guide-blocking checks. |
| 72860 APOE R176C | Both guides are 65% GC. Report primers fail current thermodynamic review. PAM changes `TGG->TAG` and `AGG->AGA` are NAG/NGA-class and are not strong blocks. The later IRIS document contains alternate primers. | Use the IRIS primer candidates only after fresh PCR QC; redesign or experimentally justify guide protection. |
| 72862 APOE R154S | Critical same-codon donor collision in gRNA2 donor; both guides are high GC and original validation primers are extreme-GC. | Current final-protein assertion removes the incorrect donor. Re-generate the complete design and do not use the archived gRNA2 ssODN. |
| 72863 APOE V254E | Both guides are 65% GC; both primer oligos fail current review; `CGG->CAG` and `TGG->TAG` are weak NAG-class PAMs. | Re-design blocking and validation primers before ordering. |
| 72876/72878/72889 NKX3.1 + RNF213 | A combined document/order contains NKX3.1 KI plus both RNF213 WT and mutant donors. The structure makes accidental cross-project or WT/mutant co-delivery plausible. | Separate procurement sets and preserve explicit guide-to-donor pairing. |
| 73029 SCN5A alphaBtx | gRNA1 is 75% GC; both donors rely on one seed mismatch; primer pair fails current thermodynamic review. | Treat blocking and primers as review-required; report both WT and KI amplicon sizes. |
| 73030 SCN5A SPOT | gRNA1 is 75% GC; both donors rely on one seed mismatch; reverse primer has strong self-dimer risk. | Same remediation as 73029. |
| 75647 MYD88 KO | gRNA2 is 75% GC with GGGG and crosses the exon boundary; old report calls the pair and primers ready and reports only one amplicon size. | Current app flags guide quality, reports WT and deletion products, deletion modulo 3, exon-skipping consequence, and splice-boundary risk. |
| 75994 PHF6 S199E | gRNA1 is 30% GC and contains TTTT; its PAM edit is NGA-class, while gRNA2 has one seed mismatch. Order sheets contain both S199E and S199A reagents. | Set delivery method explicitly, use matched guide/donor pairs only, and separate project procurement sets. |
| 75995 PHF6 S199A | Same guide/blocking concerns and mixed-project workbook as S199E. | Same remediation as 75994. |
| 73836 EIF3D miniIAA7-V5 | Distant fallback guides, gRNA2 contains GGGG, blocking is NAG plus one seed mismatch, and forward primer is low-GC/low-complexity with large Tm imbalance. | Current app marks guide blocking and primer placement as review-required. |
| 73837 EIF4E miniIAA7-V5 | Only one guide in the per-project export; blocker is one seed mismatch. Reverse primer is 83.3% GC with homopolymer/self-dimer risk. Parent workbook also contains an unused second guide. | Reconcile the parent and per-project guide sets and redesign primers. |
| 73838 UPF1 miniIAA7-V5 | Both guides are 70% GC. One donor uses an NAG PAM; both primers are >83% GC and fail review. | Re-rank guides and primers; require strong protection for every guide offered. |
| 73839 EIF4G1 miniIAA7-V5 | gRNA2 is 70% GC; PAM changes are NAG/NGA-class; reverse primer is high-GC/low-complexity with a large Tm imbalance. | Redesign blocking and primers. |
| 73840 EIF4G2 miniIAA7-V5 | Guides pass basic composition; one blocker is NAG-class and the other is strong. Guide placement is a >10 bp fallback and forward primer has 3-prime self-dimer risk. | Keep review status until every selected guide is strongly protected and primer QC passes. |
| 73841 EIF4G3 miniIAA7-V5 | gRNA2 is 65% GC; both PAM changes are NAG-class. Reverse primer is 16.7% GC with homopolymer, self-dimer, and hairpin risks. | Redesign blocking and primers; do not retain the prior “primer ready” label. |

## Application changes driven by this audit

- Reject/warn on incomplete or ambiguous SpCas9 spacer sequences at the QC layer, including historical 19 nt rows.
- Compute procurement readiness separately from computational design success.
- Carry `Review Status` and the full review reasons into the combined order preview and CSV.
- Describe vendor-format XLSX files as procurement drafts because their fixed upload schema cannot preserve the full safety review.
- Retain the earlier fixes for strict PAM classification, final donor translation, cross-guide protection, primer thermodynamics/outside-arm placement, delivery-specific poly-T, guide GC/poly-G, transcript assumptions, and edited-versus-WT validation amplicons.
