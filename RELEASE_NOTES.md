# Release notes

## 1.0.0 — 2026-09-01

First release intended for routine use. The theme of the work behind it is narrow: the tool
used to state more than it checked, and each change below removes one of those gaps.

### Release state is now stated, once, everywhere

- Every design carries one authoritative state — `BLOCKED`, `REVIEW REQUIRED`, `READY` —
  from `src/releaseVerdict.js`. The on-screen report, the downloaded HTML and every exported
  row render the same object, so the screen and the file cannot word a design differently.
  Previously only the download stated a release status; the screen a reviewer actually reads
  showed a checklist that graded a hard blocker as "warn".
- `READY` never means "nothing left to check". Genome-wide guide and primer specificity are
  not checked by this tool and appear as a standing requirement on every design.
- **Release is decided per guide+donor pair.** A weakly protected alternative no longer
  condemns a soundly protected pair — the report names which pair to order and marks the
  other do-not-order. The previous behaviour blocked a whole design because of an alternative
  the same report told you not to use.
- Co-delivery stays all-or-nothing. There an unblocked guide re-cuts the allele the other
  donor just repaired, so one weak guide fails the set.

### Guide blocking is graded by CFD, not by counting mismatches

Blocking protection is now scored with **CFD** (Doench et al. 2016, *Nat Biotechnol* 34:184)
applied to the repaired allele, and the score is reported with every design.

The count-based rule this replaced was wrong in both directions, and CFD says so:

- A synonymous **PAM change alone is not adequate**. NCG retains 0.107 of NGG activity and
  NTG 0.039, where the old rule called either one "strong" and stopped.
- **Three seed mismatches are not automatically adequate.** On the APOE R154S fixture, three
  chosen by position left 0.300 of the original activity. The old rule called that strong.

Changes are now chosen to **minimise predicted residual activity** rather than by position
order, which is where most of the benefit is - CFD entries vary by an order of magnitude
between identities at the same position:

| Design | Before | After |
|---|---|---|
| APOE R154S gRNA2 | 3 changes, 0.300 | 3 changes, **0.0188** |
| APOE R176C | 1 change, 0.107 | 2 changes, **0.0156** |
| Internal tag, alphaBtx | 3 changes | **1 change**, ~0 |
| C- and N-terminal tags | 1 change, 0.107 | 1 change, **0.0161** |

Same or fewer donor edits for an order of magnitude better protection, which is also the
outcome that costs the least HDR efficiency. Applies to SNP knock-ins, internal tags and
both terminal tags. Configurable per design (1, 2 or 3 changes).

Thresholds: strong at or below 0.023, moderate at or below 0.10. The score is published; the
cut points are this tool's choice and are labelled as such.

Two defects this surfaced, both invisible while one change per guide was the rule:

- Reported guides did not carry the genomic coordinate scoring needs, so every downstream
  score silently returned nothing and fell back to counting - the two graders began
  disagreeing again.
- Two individually synonymous changes landed in the same codon and combined into a coding
  change. The protein assertion caught it, so a donor was dropped rather than wrong, but the
  design silently lost a donor. Now rejected at candidate selection.
- Synonymous choices are weighted by **human codon usage**, with a floor that refuses to
  install a rare codon. Previously the alternative was chosen alphabetically.
- No blocking change lands within **3 bp of a CDS exon boundary**. This tool does not model
  splicing, so it stays out of that window instead of predicting the consequence.
- Guides are ranked **blockability first, distance second**, within a distance window. HDR
  efficiency falls steeply with cut-to-edit distance, so the search widens only when the
  nearer window is empty.
- Guide **GC is an observation, not a verdict**. GC correlates with SpCas9 activity weakly;
  the warning no longer implies a guide will fail, and GC never gates a design.

### Reviewed acceptance of a known risk

Weak protection can be accepted deliberately: tick the box, give a reason, optionally sign
it. The reason and attribution reach the report and the exported rows. It requires a reason
to take effect, never overrides a donor that fails its protein assertion, is unavailable
under co-delivery, and never lets a design read as `READY`.

### Exports

- Every exported row carries `Review Status` and the full review reasons.
- The `Recommended` column follows each pair's own release state, so a strongly protected
  ssODN and a weakly protected one no longer export identical wording.
- Guide-to-donor pairing is preserved in the export, with each donor naming its guide.

### CLI

- `npm run export-report` writes the same HTML report the app downloads — asserted
  byte-for-byte identical in the test suite.
- `npm run design` emits JSON. Both entry points share one manifest reader, so they cannot
  disagree about which gene or options a manifest asked for.
- Exit codes: `0` ready, `2` blocked or review required, `1` the design failed.

### Provenance

The footer names the deployed commit rather than a hardcoded date.

### Verification

137 tests. 64 mutations, none surviving. The mutation suite is the reason several of these
entries exist: a green test suite repeatedly failed to notice a gate that could not fire, a
grader that disagreed with itself, and a splice guard that protected the wrong positions.

The claims `audit/2026_GE_design_audit.md` makes about this application are executable, and a
test fails if that list grows without a corresponding check.

## Known limitations

Read these before treating an export as an order.

- **No off-target analysis.** No CFD/MIT score, no off-target candidate list. Genome-wide
  specificity for guides and primers must be checked elsewhere, against the assembly you
  actually use.
- **No on-target efficiency model.** Guide GC is reported; a calibrated activity prediction
  is not applied.
- **`strong` means predicted residual activity at or below 0.023, not zero.** Only a fully
  destroyed PAM makes a site uncuttable.
- **CFD is a proxy, not a measurement.** SpCas9-only, fitted on off-target cleavage in a
  single screen, and it estimates relative activity rather than a probability. It says
  nothing about repair outcome. The thresholds are this tool's choice - recalibrate them
  against your own clones.
- **Stacked blocking changes cost HDR efficiency** and make genotyping harder. Sequence the
  whole amplicon, not only the edited codon — a re-cut allele can carry the intended edit
  plus a nearby indel, which a codon-specific assay scores as a success.
- **MANE Select matching is not automatic.** Transcript identifiers are recorded; confirming
  the intended transcript is yours, especially the terminal coding exon for terminal tags.
- **No schema on the design result.** Reports, exports and the CLI consume a terse internal
  shape by convention, so a change to it is not caught by validation.
- **The 26 archived 2026_GE designs have not been re-derived** against the current engine.
  The audit's claims about the application are tested; its per-project findings are not.
- **Vendor-format XLSX files are procurement drafts.** Their fixed upload schema cannot carry
  the safety review — keep the combined preview or `order_preview.csv` with them.
- **Stacked blocking is not behaviourally covered for terminal tags.** Every guide near the
  stop codon in the bundled fixture has a synonymous PAM change that scores 0.0161 on its
  own - below the protection threshold - so a C- or N-terminal design takes one change and
  never reaches the stacking path in the test suite. The code is shared with point mutations
  and internal tags, where it is covered on sites where it demonstrably changes the output.
  The terminal-tag tests assert the wiring, the cap, splice clearance and donor presence.
  Four mutations survive there and are expected to; stated in `test/blocking-strategy.test.js`.
- **The engine adds changes until the score clears the threshold**, which on some sites means
  three. A low HDR rate is recoverable by screening more clones, whereas a re-cut allele
  carries the intended edit plus an indel and a codon-specific assay scores it as a success -
  so the default errs toward protection. Use `maxBlockingChanges` to trade back, and read the
  reported score rather than the tier if you want to judge the trade yourself.
