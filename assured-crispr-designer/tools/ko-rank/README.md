# Rank knockout guides by predicted loss of function

`koOutcomes.js` grades a guide by what a panel of frameshift indels does to the protein. This ranking adds the other half: **how often each outcome happens**, so
guides whose repair favours a frameshift (a templated +1 insertion, microhomology deletions) rank above guides that mostly make in-frame deletions or
frameshifts that escape decay.

It runs in two places, with the same model and the same numbers:

* **In the app (and in Node, no Python).** `src/lindel/` is a JavaScript port of [Lindel](https://github.com/shendurelab/Lindel) (Chen et al. 2019, *Nucleic Acids Res*
  47:7989; MIT licence, notice in `src/lindel/LICENSE-Lindel.txt`). Its 6.5 MB weights, `src/lindel/lindel-weights.bin`, are a separate asset: the browser fetches them once,
  and only when a SpCas9 knockout with a sequence is designed. The design engine takes the loaded model as the option `koLindel`; it then picks the pair whose weaker guide has
  the larger predicted share of loss-of-function alleles (differences under 5 percentage points are inside the model's error and do not decide; isoform coverage and
  geometry do), prints the numbers in the report, and warns when a guide is predicted to be weak (under 60%). Pasted custom guides get the same numbers.
  `node tools/ko-rank/rank.mjs record.gb ranking.csv [--gene SYMBOL]` writes the full ranking of a record.
* **Offline, with the original Python Lindel** (an independent cross-check; needs numpy and scipy and a clone of Lindel, tested against commit
  `fdcad580ba76bcfb7a98f58c3769b76f31693d63`):

```
tools/ko-rank/run.sh record.gb ranking.csv /path/to/Lindel [GENE]
```

  1. `ko_candidates.mjs record.gb` lists every NGG guide that cuts a non-terminal coding exon, with the 65-nt input Lindel needs.
  2. `lindel_outcomes.py candidates.json --lindel DIR` predicts, per guide, the frequency of every repair outcome. The weights are a pickle and are read with an unpickler
     that admits only numpy array reconstruction and plain containers.
  3. `ko_classify.mjs edits.json record.gb` maps each outcome onto the record, splices it into the coding sequence and classifies it with `koOutcomes.js`.

`export_lindel_weights.py /path/to/Lindel src/lindel/lindel-weights.bin` rebuilds the weights file from Lindel's two pickles (the file records their SHA-256; the test pins the
hash of the result, so a new file has to be accepted on purpose).

Main columns: `predicted_LoF_allele_pct` (Lindel-weighted share of outcomes that are a predicted loss of function), `predicted_biallelic_LoF_clone_pct` (its square:
both alleles of a clone must be, alleles treated as independent), `lindel_frameshift_pct`, `lindel_plus1_ins_pct`, `base_pos17` (the base 5' of the cut, which the
dominant +1 insertion duplicates), `panel_tier`, and `other_isoform_not_disrupted_pct` (outcomes that leave another annotated isoform of the record expressed).

## What was checked

* **The JavaScript port against Python Lindel:** 5,200 windows (plain, repeat, homopolymer and window-edge sequences): largest difference in any of the 557 class
  frequencies 1.7e-16, in the frame-shift ratio 1.1e-15. `test/lindel.test.js` repeats it in CI on 10 stored Python outputs, and checks that the JavaScript ranking of all 145 DIPK2A
  candidates equals the Python pipeline's CSV in every column and in order (`test/fixtures/ko-rank-dipk2a-ranking.csv`). A full ranking takes about a second in Node.
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
* SpCas9 (NGG) only. A knockout designed with another enzyme is chosen as before.
* **Cost.** Ranking all pairs of a large coding exon (NR2F2, 528 nt) takes about a second on the main thread, once per design.
