# Rank knockout guides by predicted loss of function

`koOutcomes.js` grades a guide by what a panel of frameshift indels does to the protein. This pipeline adds the other half: **how often each outcome happens**, so
guides whose repair favours a frameshift (a templated +1 insertion, microhomology deletions) rank above guides that mostly make in-frame deletions or
frameshifts that escape decay.

```
tools/ko-rank/run.sh record.gb ranking.csv /path/to/Lindel [GENE]
```

Three steps (run separately if Python and Node live in different environments):

1. `ko_candidates.mjs record.gb` lists every NGG guide that cuts a non-terminal coding exon, with the 65-nt input Lindel needs.
2. `lindel_outcomes.py candidates.json --lindel DIR` predicts, per guide, the frequency of every repair outcome with
   [Lindel](https://github.com/shendurelab/Lindel) (Chen et al. 2019, *Nucleic Acids Res* 47:7989; MIT licence; needs numpy and scipy). Clone it separately: its
   9.8 MB weights are not vendored. They are a pickle and are read with an unpickler that admits only numpy array reconstruction and plain containers.
3. `ko_classify.mjs edits.json record.gb` maps each outcome onto the record, splices it into the coding sequence and classifies it with `koOutcomes.js`.

Main columns: `predicted_LoF_allele_pct` (Lindel-weighted share of outcomes that are a predicted loss of function), `predicted_biallelic_LoF_clone_pct` (its square:
both alleles of a clone must be, alleles treated as independent), `lindel_frameshift_pct`, `lindel_plus1_ins_pct`, `base_pos17` (the base 5' of the cut, which the
dominant +1 insertion duplicates), `panel_tier`, and `other_isoform_not_disrupted_pct` (outcomes that leave another annotated isoform of the record expressed).

## What was checked

* **Class-to-genome mapping:** 2,392 sampled Lindel classes, both strands, applied to the record and compared with Lindel's own edited sequence: 0 mismatches
  (`test/ko-rank.test.js` repeats it in CI on a fixture).
* **One site against real clones (DIPK2A, g2, iPSC):** 23 clones, about 46 alleles measured by Sanger deconvolution. Frameshift fraction predicted 84.4%,
  observed 84.2%. Share of alleles that are a predicted loss of function: predicted 36.3%, observed 41.6%. Clones with both alleles a loss of function: predicted 13%,
  observed 1 of 23. The top predicted insertion (+2 TG) is the insertion the clones carry. One site, so a sanity check, not a calibration.
* **The +1 insertion rule, in the model, across 1,889 guides of the DIPK2A locus:** mean predicted +1 insertion by the base at position 17 (the base immediately 5' of the
  cut; position -4 counting the PAM's first base as -1): T 26%, A 20%, C 12%, G 5%. A or T together 23%, C or G together 8.5%. About 68% of predicted +1 insertions duplicate that base,
  as inDelphi and Lindel describe for SpCas9. The effect on the overall frameshift ratio is smaller (0.80 for A/T, 0.74 for C/G); frameshift ratio and loss of function are different quantities.

## What it does not do

* **On-target efficiency.** A guide that does not cut makes no alleles at all; none of the 23 DIPK2A clones carries an edit at g1. Combine the ranking with an on-target score.
* **Cell type.** Lindel was trained on cell-line data (see the paper), not iPSC; repair profiles differ between cell types.
* **Insertions over 2 bp** are one group in Lindel and are counted as not loss of function. Deletions over 30 bp are not predicted.
* **Alleles are assumed independent;** NMD is rule-based and fails for roughly a third of premature stops; off-target specificity is a separate requirement.
* SpCas9 (NGG) only.
