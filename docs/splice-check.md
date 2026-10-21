# Splice screening

Two layers, with different claims.

## 1. Rule-based positional screen (always on)

`assured-crispr-designer/src/spliceZones.js` and `src/pairBlocking.js`. This is **not** a splice-site predictor. It decides where a
blocking change may be placed and flags the requested edit when it sits in a splice-site window.

Windows (`SPLICE_WINDOWS`, this tool's own cut points): donor = last 3 exon bases and intron +1..+6; acceptor = intron -40..-1 and
first 3 exon bases; `exonMargin` 4; `crypticReach` 60.

Placement rules for blocking changes in Genomic SNP mode:

- never inside a splice-site window of an annotated exon;
- inside an exon only if synonymous in the coding sequence and at least 4 bases from both exon ends;
- otherwise (deeper intron) any base, preferring changes that do not create a new GT or AG within 60 bp of an exon.

Position classes returned by `classifyPosition`: `donor-critical`, `acceptor-critical`, `exon-edge`, `exon-interior`, `intron-deep`, `unknown`
(no exon annotation). In the point-mutation and knock-in designs the engine additionally keeps blocking changes at least
`SPLICE_BOUNDARY_MARGIN = 3` bp from a CDS exon boundary (`src/designEngine.js`).

## 2. Optional SpliceAI check (run on your computer)

`assured-crispr-designer/scripts/splice_check.py` scores the reference, the requested edit, and the edit with each ssODN's blocking
changes with SpliceAI, and reports how far the blocking changes move predicted splice sites on the edited allele.

```
python scripts/splice_check.py request.json reference.gb [-o splice_check.json] [--window 400] [--strand +]
```

- `request.json` is the splice-check request the app downloads (schema `assured-splice-check-request/1`); `reference.gb` is the same
  forward-strand genomic GenBank reference that was uploaded to the app; use `--strand -` for a gene on the reverse strand.
- Environment (from the script's docstring): Python 3.10 or 3.11, numpy < 2, tensorflow-cpu 2.15 and `spliceai`
  (`pip install spliceai --no-deps`, then `tensorflow-cpu==2.15.1`). SpliceAI runs on windows of +/- `--window` bases (default 400)
  around the edit with 5,000 bases of context on each side, averaging its five models. Nothing leaves your computer.
- The result file (schema `assured-splice-check-result/1`: `tool`, `version`, `request`, `scores`, `summary.blockingEffectMax`) is attached
  to the design in the app. The app refuses a result whose request does not match the design's edit and blocking changes.
- With co-transfection both ssODNs carry the same changes and are scored once; delivered separately, each ssODN's allele is scored and the
  worst case is reported.

Verdict thresholds on the largest change caused by the blocking changes (`SPLICE_CHECK_THRESHOLDS` in `src/pairBlocking.js`, the tool's own
cut points): <= 0.05 pass; <= 0.2 review; above 0.2 advises against. SpliceAI's own calling thresholds are 0.2 / 0.5 / 0.8.

## Limits

- The scores are predictions, not measurements, and are not validated against splicing assays in this repository.
- The check is for the Genomic SNP mode; other modes use only the rule-based boundary margin.
- SpliceAI is **not** bundled and is not a dependency of the web app. It is installed by the user and carries its own licence:
  as read on 2026-10-21 at `github.com/Illumina/SpliceAI`, source code is under PolyForm Strict 1.0.0, models under CC BY-NC 4.0 for academic
  and non-commercial use, and the repository is archived. Check the current terms before using the check outside academic research.
  See [third-party.md](./third-party.md).
