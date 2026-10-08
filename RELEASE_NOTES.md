# Release notes

## Unreleased

### Guide use for terminal tags, and two guides by default

- C- and N-terminal tag designs now state how the offered guides can be used with the one donor
  (`guideUse` in the result, new `src/guideUse.js`; a "Guide use" row in the readiness table of the
  report). It says whether every guide is strongly protected in the donor (both can then be
  delivered together), what the unprotected guide risks (re-cutting a correctly repaired allele), and,
  for two guides, how many bp lie between the cuts, because two cuts on one allele can delete that
  stretch by non-homologous repair. Spacers with extreme composition are named there. The text states
  facts about the design; it does not choose between one guide and two.
- Two guides is the default posture, matching the lab convention (knockouts: two guides; SNP and
  small-tag knock-ins: two guides, each ssODN carrying the silent changes for both; large knock-ins:
  two guides and one donor carrying the silent changes for both). "Co-transfect both guides and both
  ssODNs" in the batch form is now on by default, so SNP and small-tag ssODNs block both guides unless
  it is switched off. C- and N-terminal donors already blocked both guides and are unchanged.
- No donor sequence changes. New tests: `test/guide-use.test.js`.

### Guide selection scores every candidate before choosing the pair

- The guide ranking is documented as blockability first and distance second, within a distance
  window. The code did not do that: it took the nearest guide, added a distinct partner by strand
  and distance, and only then ranked those two. A better-protected guide whose cut was within
  10 bp of the nearest guide's cut was discarded without being scored. On NR2F2 (C-terminal tag)
  the guide at -14 bp (strongly blockable, 40% GC) was dropped for sitting 2 bp from a guide at
  -12 bp that grades one tier lower, and the tool offered an AT-rich guide in its place.
- Every candidate in the window is now scored, and the pair is chosen from the scored set (new
  `src/guideSelection.js`). A pair of distinct guides is still offered whenever one exists; the
  lead guide is the best-protected one that has a distinct partner.
- Among equally protected guides, extreme spacer composition (GC below 25% or above 75%, or one
  base making up more than 60% of the spacer) ranks behind ordinary composition. This is a
  tie-break, not a gate, and does not replace the genome-wide specificity check that the tool
  still does not perform.
- Custom guides and the co-delivery selector are unchanged.
- Results that change on re-run: a design whose nearest guide has no distinct partner now offers
  the best pair of distinct guides instead of that one guide. Of the nine fixture designs checked,
  two changed. NR2F2 C-terminal SD40-V5 is the case above. The bundled APOE R176C example offered
  one guide (+1 bp) and now offers two (-4 bp and +8 bp), each strongly blocked by its own
  matched ssODN and not poolable, as for APOE R154S. The other seven are identical.
- New tests: `test/guide-selection.test.js`, and an NR2F2 case in the regression fixtures
  (`test/fixtures/nr2f2-ng016753.gb`, RefSeqGene `NG_016753.1`).

### SD40-V5 C-terminal cassettes with a GGGGS spacer

- The built-in `SD40-V5` cassette fuses V5 directly onto the SD40 C-terminal tail, which is the
  part of SD40 that contacts cereblon, and uses the 11-aa house linker upstream. Two C-terminal
  variants are added, both selectable under "Fusion / linker" for a C-terminal tag:
  - `SD40-GGGGS-V5`: house linker, SD40, GGGGS spacer, V5, stop (201 bp, 66 aa added).
  - `GGGGS3-SD40-GGGGS-V5`: (GGGGS)x3 linker, SD40, GGGGS spacer, V5, stop (213 bp, 70 aa added).
- Both reuse the SD40 and V5 modules of `SD40-V5` unchanged. The Gly-Ser DNA is codon-diversified
  (no repeated 9-mers, no runs of five, no BsaI/BsmBI/BbsI sites). Guide selection and blocking
  do not depend on the cassette, and existing cassettes and designs are unchanged.
- Whether a longer linker or spacer helps a given target is not something the tool can predict;
  compare the untreated tagged protein with wild type before using it for degradation.
- New tests: `test/spaced-sd40-v5.test.js`, and two NR2F2 cases in the regression fixtures.

### Report layout: shorter, one copy of each thing, detail one click away

- The HTML report no longer repeats itself. The knock-in QC checklist that duplicated Design Readiness
  is gone; the insert DNA and amino-acid strings, printed twice when expected and designed were
  identical, are printed once (and both, in full, when they differ, with the mismatch badge); review
  checkpoints already printed word for word under Release status or Design Readiness are not listed a
  third time, with a one-line note saying so.
- Order: release status, a four-cell snapshot strip (the donor cell now names the format and arms), the
  design scheme, then Gene Information, gRNA Sequences, Recommended Primers, Donor Design, Design
  Readiness, Review Checkpoints. Section numbers follow what is present.
- Layout: one centred column (980 px), thin-ruled tables with a light header, label/value pairs in a
  four-column table instead of a card each, primers in one table instead of two cards with nested
  cards, readiness as one row per check with items to review first and passes last, and a print
  stylesheet. Page structure uses tables and blocks only, no card grids.
- Folded by default (HTML `details`, no script): alternative primer pairs, coding frame and insert
  sequence and translation, the suggested figure legend, and, for point-mutation and internal-tag
  ssODNs, the opposite (reference-only) strand and the coding frame view. The strand to order stays visible. Folds are closed in print, so print or save a copy
  with them opened if the detail is needed on paper.
- Two sections are dissolved. The target region map restated what the design scheme draws to scale
  (guides, cut sites, donor, primers, gene model), so it is shown only when the scheme cannot be drawn;
  the scheme's axis now states the position in the uploaded reference (insertion point, edited base or
  cut), the one thing the map added. Additional Info was a plain-text copy of other sections; the three
  facts that existed only there now sit where they belong: the guide-blocking changes with seed
  position (C- and N-terminal tags), the primer QC line (confidence, pair penalty, Tm delta) under the
  primer table, and the expected deletion, splice-donor note and strategy under Knockout Design. The
  app's on-screen results page also hides its region map when the scheme is drawn.
- Everything else that was folded or de-duplicated is still in the document, and the engine, the
  app's results and the order exports are unchanged.
- New tests: `test/report-layout.test.js` (30) checks section order and numbering, one copy of the
  insert sequence and the mismatch case, readiness ordering and one row per check, no repetition under
  Review Checkpoints, closed folds, the folded reference strand, and renumbering with historical
  matches. Seven mutations (QC list back, unsorted readiness, no de-duplication, mismatch hidden, open
  folds, scheme after the sections, reference strand not folded) each fail a test.

### Donor format and arm control for terminal tags

- New `src/donorFormat.js` (pure functions) plans the donor for C- and N-terminal tags. Three formats:
  ssODN (insert shorter than 120 bp; arms up to 60 nt, 30 nt minimum, at most 200 nt in total), dsDNA
  donor block (arms 250 bp by default; 201-3000 bp in total) and cloned/AAV donor (arms 500 bp). The
  numbers follow IDT's Alt-R HDR Donor Oligo and Donor Block guidance, except that the 500 bp insert
  size where the default moves from a block to AAV is this tool's choice (reporter- and
  selection-cassette-sized inserts); a block remains orderable to 3000 bp and can be selected.
- 5' and 3' arms are now independent (`arm5Length`, `arm3Length`; the positional arm length stays the
  symmetric request) and are clamped to the supplied reference, which is now reported instead of
  silent. `autoTrimArms` shortens an arm, in 10 bp steps and never below the format minimum (100 bp
  for blocks), when it runs into a flagged stretch or ends inside a single-base run, which IDT's
  guidance suggests doing for complexity problems. A flagged stretch inside the minimum arm cannot be
  trimmed away; the arm is then kept and the stretch is reported.
- Synthesis pre-check of the finished donor: single-base runs of 12 nt or more, 50-nt windows below 20%
  or above 80% GC, and perfect tandem repeats of 20 nt or more (period 2-8). It is a heuristic and is
  labelled as one: IDT's complexity screen is proprietary and decides acceptance. It does not look for
  inverted repeats, secondary structure or repeats between distant parts of the donor.
- An ssODN is ordered as the strand complementary to the PAM-bearing strand of guide 1, the rule the
  point-mutation ssODNs already use. A format that is only inferred from length (calls that name no
  format) never changes what is ordered.
- Result: `donorFormat` on C- and N-terminal designs (format, recommendation and reason, arms with
  requested, trimmed and clamped state, length limits, synthesis issues with positions, notes, order
  strand and sequence). Calls that name no format behave as before: symmetric arms, 250 bp when none is
  given, donor sequence unchanged.
- App: Donor format, 5' arm and 3' arm selectors and a trimming option for terminal-tag rows
  (defaults: Auto, default arms, trimming on), and a Donor format card with the pre-check and, for an
  ssODN, the sequence to order with a copy button. Report: a Donor format block, and a "Donor format
  and synthesis" line in the readiness checks. The design scheme names the format and draws the arms
  as planned. The order-row note carries format and arms; an ssODN row carries the strand to order.
- CLI manifests: `extra.donor_format`, `extra.homology_arm_5_length`, `extra.homology_arm_3_length` and
  `extra.auto_trim_arms`; with `donor_format` set and no `homology_arm_length`, arms default by format
  instead of 400 bp. Manifests without these keys are unchanged (400 bp).
- The pre-check is advisory. It does not change procurement readiness or the release verdict.
- Not covered: point-mutation and internal-tag ssODNs keep their own fixed 36/91 nt windows; the arm
  selectors and the Donor format card are not exercised by `node --test` (no DOM).
- New tests: `test/donor-format.test.js` (25). The NR2F2 SD40-V5 block that was ordered by hand
  (250 bp 5' arm, 213 bp cassette, 150 bp 3' arm, one guide) is reproduced byte for byte by an
  automatic-format, trimmed design with that guide. Planted-stretch references give hand-derivable trim
  lengths, and ten mutations (swapped arms, wrong limits and thresholds, inverted strand rule,
  trimming step, boundary check, defaults) each fail at least one test.

### Design scheme figure: drawn from every design, in the app, the report and the CLI

- New `src/designScheme.js` draws a publication-style schematic from a design result, as a pure
  function (no React, no DOM), so the app, the HTML report and the CLI produce the same figure.
  Panel a (all design types) shows the guides with PAM and cut sites, the reference allele, the
  donor(s), the edited allele and the screening PCR with wild-type and edited sizes, on a bp axis
  relative to the insertion or edit site. For C- and N-terminal tags, panel b shows the sequence and
  reading frame at the insertion site (reference against edited, cassette segments shaded, changed
  bases marked) and panel c the layout of the tagged protein. Point-mutation, internal-tag and
  knockout designs get panel a.
- Every number and sequence in the figure is read from the result (guide positions, arm and cassette
  lengths, primer positions, blocking changes, translated codons); nothing is typed in per design.
  All text is XML-escaped.
- App: a "Design scheme" card between the readiness summary and the target region map, with Download
  SVG, Download PNG (4x, rasterised in the browser) and Copy figure legend. Report: the same figure
  is embedded inline with a Download SVG link and a draft figure legend. CLI:
  `export_report.mjs --scheme-svg <file>` also writes the standalone SVG.
- The figure legend is a draft: bracketed fields (for example `[cell line]`) are left for the author.
- Limits: the figure shows the donor the engine builds (symmetric arms); it does not show
  genome-wide specificity, which the tool still does not check. Browser PNG export and the on-screen
  card are not covered by `node --test` (no DOM); the SVG they are made from is.
- New tests: `test/design-scheme.test.js` (42) checks the figure against the result for C-terminal
  (new and built-in SD40-V5 cassettes), N-terminal, internal-tag, point-mutation and knockout
  designs: guide distances equal the engine's, donor, amplicon and protein sizes match, the sequence
  rows equal the genome flank and the donor cassette ends, the edited-allele amplicon bar is longer
  than the wild-type bar by the net insertion, markup is well formed and inside the canvas, text is
  escaped, and the report places the block before the locus map. Mutation checks (off-by-one anchor,
  wrong amplicon end, escaping removed, wrong deletion size, wrong protein length, shifted flank)
  each fail a test.
- Found while testing, not changed here: other parts of the report HTML interpolate the gene name
  from the uploaded record without escaping it.

### Design scheme: each ssODN is drawn with the changes it carries

- The point-mutation and internal-tag scheme drew, under each ssODN, only the blocking changes of
  the guide that ssODN is matched to. That was right when each ssODN blocks only its own guide, and
  wrong with co-delivery (now the batch-form default): every ssODN then carries the changes for
  every guide, but the second ssODN was drawn as if it lacked the first guide's. The figure now
  draws the markers from each donor's own list of changes, and the row title says which other
  guide it also blocks (for example "ssODN1 (matched to gRNA1; also blocks gRNA2)").
- Without co-delivery the figure is unchanged. No donor sequence changes; the report text was
  already correct, only the picture was not.
- Test added to `test/design-scheme.test.js` (APOE R176C, with and without co-delivery).

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
