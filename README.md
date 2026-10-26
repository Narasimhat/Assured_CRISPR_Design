# ASSURED CRISPR Designer

**Enzyme selection:** fetch a gene or upload GenBank in Workspace, select SpCas9,
AsCas12a, LbCas12a or Mad7, and choose the modification. Cas12a/Mad7 now construct
two-guide knockout and HDR designs through the same reports, primers, ordering
and QC exports as Cas9. SNP donors use the same 127-nt asymmetric window and
opposite-guide ordering, with enzyme-aware synonymous PAM blocking and an unscored
synonymous seed fallback. See [ENZYME_DONORS.md](./ENZYME_DONORS.md) for review requirements.
SpCas9 retains its existing workflow. An advanced Sequence
Scan tab also provides configurable whole-sequence discovery.
See [ENZYME_GUIDES.md](./ENZYME_GUIDES.md) for usage and validation limits.
SpCas9 CFD remains SpCas9-specific; no trained Cas12a scoring model is bundled.

Hosted browser app for CRISPR design review and ordering-ready exports.

Version 1.0.0. See [RELEASE_NOTES.md](./RELEASE_NOTES.md) for what changed and, more
importantly, for the **known limitations** — read those before treating an export as an
order. CLI usage is in [RUNNER_USAGE.md](./RUNNER_USAGE.md).

## Release state

Every design gets one authoritative release state, shown at the top of the on-screen report
and of the downloaded HTML, and carried into every exported row:

| State | Meaning |
|---|---|
| `BLOCKED` | Do not order. A hard error - wrong or ambiguous reference, a donor that mistranslates, an insert out of frame. Not a risk to weigh. |
| `REVIEW REQUIRED` | Computation succeeded, external checks remain. Not a green light. |
| `READY` | Every configured gate passed. The standing requirements below still apply. |

`READY` never means "nothing left to check": genome-wide guide and primer specificity are
not checked by this tool and are stated as a standing requirement on every design, including
ready ones.

**Release is decided per guide+donor pair, not per design.** One weakly protected
alternative does not condemn a soundly protected pair; the report names which pair to order
and marks the other do-not-order. Co-delivery is the exception and stays all-or-nothing,
because there a guide that is not blocked in every donor re-cuts the allele the other donor
just repaired.

**Weak protection can be accepted.** Ticking "Accept weak guide protection and order anyway"
requires a written reason, records it in the report and the export, and never lets the design
read as `READY`. It does not override a donor that fails its protein assertion - that is an
error, not a risk - and it is unavailable under co-delivery.

## Safety semantics

- Guide blocking is graded by **CFD** (Cutting Frequency Determination, Doench et al. 2016, *Nat Biotechnol* 34:184), applied to the repaired allele: the original guide scored against the donor's edited target site. CFD is position- and identity-weighted, which counting mismatches is not - in the published table the mean penalty runs from 0.93 at the PAM-distal end to about 0.31 mid-seed, and entries at one position vary by an order of magnitude between identities.
- The score is reported with every design, as *predicted residual activity of the unedited target*. **Strong** is at or below 0.023, **moderate** at or below 0.10, **weak** above. The score is published; **these cut points are this tool's choice** and are stated as such so they can be recalibrated against bench data. 0.023 is the value below which a site is conventionally not treated as a plausible off-target.
- Two consequences worth knowing, because both contradict what this tool said before:
  - A synonymous change to PAM position 2 or 3 is **not** complete protection. CFD puts NCG at 0.107 and NTG at 0.039 of NGG activity, so the engine keeps going until the site is below threshold.
  - Counting seed mismatches was unreliable in both directions. On the APOE R154S fixture, three mismatches chosen by position left 0.30 of the original activity; three chosen by score leave 0.019.
- Blocking changes are chosen to **minimise predicted residual activity**, not by position order, so the engine takes PAM-distal positions where the identity there costs more activity. That yields the same or fewer donor edits for materially better protection, which also costs the least HDR efficiency. `maxBlockingChanges` caps the count at 1, 2 or 3.
- NAG and NGA are never treated as adequate blocking; they carry substantial residual activity (0.259 and 0.069).
- Among changes that protect equally, the commoner synonymous codon wins, and a floor refuses to install a rare codon (below 10% within its amino-acid family). A silent change is silent at the protein level, not at the level of translation.
- Two individually synonymous changes in one codon are rejected if they would combine into a coding change - reachable only once more than one change per guide is possible.
- Where a site cannot be scored (ambiguity codes, a site running past the end of the reference) the engine falls back to counting mismatches and says so in the report rather than presenting a count as a score.
- No blocking change is placed within 3 bp of a CDS exon boundary. A synonymous change that close can still disrupt the splice site or an adjacent enhancer, and this tool does not model splicing.
- Guides are ranked by whether their target can be blocked first and by distance second, within a distance window. HDR efficiency falls steeply with cut-to-edit distance, so the search widens only when the nearer window is empty. Guides that cannot be blocked are still offered, ranked last, and refused at the pair level - not hidden.
  Every candidate in the window is scored before the pair is chosen, so a better-protected guide whose cut is within 10 bp of the nearest guide's cut is not discarded without being looked at. Among equally protected guides, those with extreme composition (GC below 25% or above 75%, or one base making up more than 60% of the spacer) rank behind the others. That is a tie-break, not a gate, and such a guide is still offered when nothing better exists.
- Point-mutation donors are translated after every desired and blocking change is assembled. A donor is not emitted unless the final protein contains the requested amino-acid substitution and no unintended coding changes.
- Every point-mutation or internal-tag ssODN is assessed against every offered guide. When cross-guide blocking is not strong, the report explicitly requires one matched guide/ssODN pair and forbids pooling the alternatives.
- Automatically selected alternative guides must have cut sites at least 10 bp apart. Closely overlapping custom guides are retained only with a non-independence warning.
- Guide delivery is an explicit input. TTTT is a blocking warning for U6/Pol III expression but not synthetic-guide RNP delivery; guide GC and poly-G warnings apply in either mode.
- Guide GC outside 40-60% is reported as an observation, not a prediction of failure, and never gates a design. GC correlates with SpCas9 activity weakly and non-monotonically; guides well outside that band are frequently active. Use an on-target model or empirical data, not GC, to judge whether a guide will cut.
- Recommended primers are searched by Tm, GC, homopolymer, hairpin, self-dimer, hetero-dimer, pair-Tm, and 3'-end stability criteria. The 3'-end check uses the nearest-neighbour ΔG of the terminal 5 nt and flags both an under-stable clamp (> -4.0 kcal/mol) and an over-stable end (< -8.0 kcal/mol); the thresholds are calibrated to the range that metric can actually produce. Fallback placements never receive an ordering-ready result.
- Knock-in primers must sit completely outside the homology arms with at least 50 bp between the nearest primer edge and each arm. Both margins are recorded in the report.
- Primer thermodynamic acceptance does not imply genome-wide specificity. Run the supplied specificity check or another genome-indexed PCR specificity workflow before ordering.

## Current limitations

- Guide selection does not yet calculate a genome-wide CFD/MIT specificity score or a full off-target candidate list.
- Guide GC content is reported, but a calibrated on-target efficiency model is not yet applied to every design mode. Reference KO guides may carry source-library scores when available.
- Uploaded transcript identifiers are recorded, but MANE Select matching is not automatic for uploads (a fetched reference uses MANE Select; see below). Confirm the intended transcript—especially the terminal coding exon for N- and C-terminal tagging—before sign-off.
- Remote primer specificity is an approximation and is not a substitute for a locally indexed, assembly-specific in-silico PCR result.
- `strong` blocking means predicted residual activity at or below 0.023, not zero. Only a fully destroyed PAM makes a site uncuttable.
- CFD is SpCas9-only, was fitted on off-target cleavage in a single screen, and estimates relative activity rather than a probability. It says nothing about repair outcome. It is the best published proxy for re-cutting of a repaired allele, not a measurement of it.
- Stacked blocking changes lower HDR efficiency and make the edited allele harder to read. Sequence the whole amplicon, not only the edited codon: a re-cut allele can carry the intended edit plus a nearby indel, which a codon-specific assay scores as a success.
- The design engine returns a terse internal result shape with no schema. Reports, exports and the CLI consume it by convention, so a change to that shape is not caught by validation.
- The 26 archived 2026_GE designs have not been re-derived against the current engine. The audit's claims *about this application* are executable; its per-project findings are not.

## Knockout designs: guides chosen by predicted protein loss

A frameshift is not a knockout if the cell makes the protein anyway. For a knockout the engine therefore simulates a panel of
frameshift indels at each candidate guide's cut, finds the premature stop, and applies the same exon-junction rules as the Assured QC engine:
no nonsense-mediated decay for a stop in the last coding exon, within 55 nt of the last exon junction, within 150 nt of the start codon, or in a coding
exon longer than 407 nt. A pair is offered only if each guide qualifies on its own (either can cut alone) and the deletion between the cuts does too.

- `koAssessment` on the result: tier (robust, marginal, truncation, escape), per-guide shares of outcomes, nearest stop to the last junction,
  and the isoforms of the record that some edit leaves undisrupted. The report prints it and the release verdict raises a review warning
  below robust.
- It is a prediction from sequence: roughly a third of premature stops that the 55-nt rule calls NMD-triggering still escape. Confirm loss of protein.
- `koAware: false` in the design options restores the geometry-only choice.
- **Repair-outcome ranking (SpCas9).** The browser app also loads a JavaScript port of Lindel (`src/lindel/`, MIT, 6.5 MB asset fetched on first use) and chooses, among pairs of the
  same tier, the pair whose weaker guide is predicted to give the larger share of loss-of-function alleles. A guide with T or A at spacer position 17 (the base just 5' of the cut)
  tends to make +1 insertions, and microhomology deletions are part of the same model. The report shows the predicted shares; a guide predicted under 60% raises a review warning.
  On-target cutting efficiency and off-targets are not part of the estimate. Details and checks: `assured-crispr-designer/tools/ko-rank/README.md`.

## Point-mutation designs: two guides and intronic blockers

The point-mutation designer offers two guides whenever two exist within 30 bp of the edit.

- **Partner guide.** The nearest window (cuts within 10 bp) can hold guides whose cuts are closer than 10 bp to each other; the designer then used to return one guide. It now keeps that guide as the lead and adds the best-protected guide from the 20 bp or 30 bp window whose cut is at least 10 bp from the lead's cut. The report lists the partner's cut distance as a review item, because HDR falls off with distance. If the two guides' blocking changes cannot be combined on one donor without changing the protein (co-delivery), the lone guide is offered and the report says so. Custom guides are never given a partner.
- **Intronic blockers.** Blocking changes stay coding and silent. Only when those cannot make a guide strongly blocked is a search repeated with changes outside the coding sequence, kept only if it grades better. Such a change lies in the intron, never inside a splice-site window of an annotated exon (donor: last 3 exon bases and intron +1..+6; acceptor: intron -40..-1 and first 3 exon bases); UTR bases inside exons are not changed. These changes are not silent, so every such design carries a review item, and splice effects are not predicted.
- **Turning it off.** Pass `ensureGuidePair: false` and `allowNonCodingBlockers: false` in the design options (`extra.design_options` in a manifest) to restore the earlier behaviour.
- **Unchanged.** The release gate still grades a guide on its blocking changes alone, not on the mismatches the requested edit itself creates; the donor's own protection record (shown per ssODN) includes both.

## Genomic SNP mode

Use the **Genomic SNP** tab for exact single-base edits, including intronic and
splice-site substitutions. Look up a ClinVar variant (the reference is fetched for you),
fetch a gene, or upload a forward-oriented genomic GenBank reference. For a file,
enter assembly, chromosome, reference start, edit position (all coordinates
1-based), and forward-strand reference/alternate bases. Ensembl `Location:` metadata
fills the reference mapping automatically; conflicting coordinates and reference-base
mismatches are rejected. A CDS is optional. A gene on the reverse strand is written along its transcript (`Location: ...:-1`, as in Ensembl and Benchling exports); see below.

This mode reuses the guide, ssODN, primer and CFD functions, but validates the exact
nucleotide substitution rather than requiring an amino-acid change. In the form it designs two guides and two ssODNs
and adds blocking mutations where needed (see below). Results and downloadable HTML/JSON are always **BLOCKED**
or **REVIEW REQUIRED**, never ordering approval. Guides lacking strong repaired-allele
protection, splice effects, parental genotype and genome-wide specificity need review.
These results have their own downloads; they are not included in the protein-workspace
batch ordering or Assured QC exports.

## Fetching a reference instead of uploading one

Both the design-request rows (protein workspace) and the Genomic SNP tab can fetch the reference from Ensembl or NCBI instead of reading a GenBank file. `src/geneFetch.js` builds the same record a Benchling "Import from genome" export contains: the sequence in sense orientation, gene, exon and CDS features, and an Ensembl-style `Location:` comment. Everything downstream (parsers, designers, reports, the Location check) sees an ordinary GenBank file, and the fetched text is saved with the project like an upload.

- **Gene.** Gene symbol (aliases resolved through Ensembl cross-references), Ensembl transcript or gene ID, transcript name such as `PTPRO-201`, RefSeq accession (`NM_…`) or NCBI Gene ID. A symbol resolves to the MANE Select transcript, else the Ensembl canonical one, else the longest coding transcript. The record is the gene span plus 1 kb on each side (6 kb in the Genomic SNP tab, so the optional SpliceAI check has its context); a reverse-strand gene is written reverse-complemented, as Benchling does. Ensembl IDs are always answered by Ensembl and RefSeq accessions by NCBI; the source selector matters for symbols. Species: human, mouse, rat, zebrafish.
- **ClinVar variant** (Genomic SNP tab). Variation ID, VCV accession, rsID, HGVS name (`NM_030667.3:c.2829+1G>A`) or `GENE c.…`. Only a record that is itself a single-base substitution is designable; haplotypes and other types are listed with the reason. The designer takes the ClinVar GRCh38 position and alleles, fetches the gene's MANE Select transcript from Ensembl, and refuses to continue if the reference base differs from ClinVar's. It reports the variant's cDNA position on the fetched transcript and warns when ClinVar names a different one. The design then runs exactly as for an upload (two guides, two ssODNs, blocking changes as set in the form), and the report's Reference row names the ClinVar record and the Ensembl transcript. The fetched reference can be downloaded from the tab; `scripts/splice_check.py` reads it (it also reads a reverse-oriented reference and scores the gene on its own strand).
- **Reverse-strand genes.** Coordinates and alleles stay on the forward genomic strand (as ClinVar and VCF give them), but the reference record is written along the transcript. The designer maps the position from the `Location` annotation (index *i* is coordinate `referenceEnd − i`), complements the alleles, and then designs in the record's own space, so a reverse design equals the design of the same record read as a forward one (tested on a synthetic locus and on MYD88 read as a mirror gene). Positions, blocking-change alleles, guide spans, the splice-check request and the sequence export are mapped back to forward coordinates and say so; guide and donor strands (+/−), primers and cut offsets stay relative to the transcript, which the design warns about. A reverse record without a `Location` annotation is refused (coordinates cannot be mapped), as is any record whose Location, assembly, chromosome or start disagrees with the form.
- **Where it runs.** Requests go from the browser to Ensembl REST, NCBI Datasets and NCBI E-utilities, which all allow cross-origin reads, so it works on Vercel and GitHub Pages alike and nothing but the identifier you type is sent. The Vercel deployment's Content-Security-Policy (`vercel.json`) lists exactly these three origins in `connect-src` besides `'self'`; a browser blocks any other origin and reports only "Failed to fetch", so a new host must be added there (a test compares the header with the origins the module requests). Public Ensembl and NCBI services rate-limit and occasionally return errors; the module retries transient failures and otherwise says which service failed. Benchling's own API is not used: it needs a per-user key and does not allow browser requests.
- **Tests.** `test/genomic-reverse.test.js` checks the mirror equivalence, the HBB sickle-cell design (c.20A>T installs T on the transcript strand and turns E7 into V, silent blockers map to the right forward bases) and the forward-coordinate outputs. `test/gene-fetch.test.js` replays recorded Ensembl, NCBI and ClinVar responses (`test/fixtures/gene-fetch/responses.json`: MYD88 on the forward strand, HBB on the reverse strand, three ClinVar records). It checks that Ensembl and NCBI give identical exons, coding sequence and bases, that reverse-strand records translate correctly, and that a fetched ClinVar reference is accepted by the Genomic SNP designer. Against a Benchling import of PTPRO-201 the fetched record (gene span, no flank) had identical sequence, 27 exons and CDS, and the F942E design output was byte-identical.

### Gene-fetch service outages

For a gene symbol such as **TP53**, the source selector is the preferred provider.
The app retries transient failures and automatically tries NCBI if Ensembl is
unavailable (or Ensembl if NCBI is unavailable). The summary warns about the
switch and records the actual transcript/assembly; the GenBank COMMENT records
the recovery source and reason. Review the selected transcript before designing.
Requests time out after 15 seconds per attempt.

Exact Ensembl IDs/transcript names and RefSeq accessions retain their provider;
they are never silently replaced by a transcript from the other service. If
both services fail, the error reports both failures and offers GenBank upload.

## Local development

```bash
cd assured-crispr-designer
npm install
npm run dev
```

## Production build

```bash
cd assured-crispr-designer
npm run build
```

### Build provenance

The footer names the commit the bundle was built from, for example
`Hosted build 418aabc • 1 Sep 2026`. When a report looks wrong, that short SHA identifies the
code that produced it; a date cannot.

`vite.config.js` resolves it from `VERCEL_GIT_COMMIT_SHA`, `GITHUB_SHA` or `BUILD_SHA`, and
otherwise reads `.git` directly. A build outside a checkout still succeeds — the footer just
drops the SHA rather than failing.

There is one edition. A build-time `VITE_APP_EDITION` switch used to narrow the app to
knockout and SNP designs; no deployment ever set it, and it is gone. If a narrower public
surface is wanted later, make it a runtime setting on one deployment rather than a second
build.

## GitHub Pages deployment

This repo already includes a GitHub Actions workflow at [`.github/workflows/deploy-github-pages.yml`](./.github/workflows/deploy-github-pages.yml).

To publish it as a hosted web app:

1. Push to `master`.
2. Open the repository on GitHub.
3. Go to `Settings -> Pages`.
4. Confirm the source is `GitHub Actions`.
5. Wait for the `Deploy GitHub Pages` workflow to complete.

The app is built from:

- [`assured-crispr-designer`](./assured-crispr-designer)

## Vercel deployment

The repo is also prepared for Vercel deployment through [`vercel.json`](./vercel.json).

Recommended setup:

1. Create a Vercel account and import this GitHub repository.
2. Let Vercel use the repository root.
3. It will pick up:
   - `installCommand`: `cd assured-crispr-designer && npm install`
   - `buildCommand`: `cd assured-crispr-designer && npm run build`
   - `outputDirectory`: `assured-crispr-designer/dist`
4. Deploy.

That gives you:

- cleaner production hosting than GitHub Pages
- custom domain support
- preview deployments on future pushes
- a better path toward auth, analytics, and saved projects

## Recommended product path

For broader sharing and commercialization, prefer a hosted deployment over local terminal use:

- GitHub Pages for quick internal/demo sharing
- Vercel or Netlify for a cleaner production-facing URL
- add auth and saved projects later if you move toward SaaS

Genomic SNP results open in the Report tab and use the shared ASSURED HTML report renderer: gene information, guides, primers, annotated WT/donor strands, readiness, target map, and review checkpoints. Nucleotide validation replaces protein assertions for this mode; RNA outcomes remain unvalidated.

### Genomic SNP blocking policies
The Genomic SNP form does not offer these policies any more (it uses the two-guide design below); they remain available through `designGenomicSnp({ blockingPolicy })` as `none` (default), `synonymous` and `noncoding`. They are per guide: synonymous coding or synonymous-plus-noncoding policies compare requested-only, PAM-blocking and PAM/seed-blocking alternatives, with a 1-3-change cap. Native codon and CFD logic is reused, scored against the requested-edit allele. Annotated junction dinucleotides are excluded from extra changes. Reports and CSV exports list every added nucleotide. The recommendation is provisional and concerns re-cutting, not biological release.

Splice screening distinguishes WT-to-requested-edit from requested-edit-to-final-donor. It reports annotated junction dinucleotide changes, a conservative 20-bp boundary proximity flag, and local GT/AG motif gains/losses. These are transparent heuristics, not splice-strength probabilities or predictions of RNA isoforms. SpliceAI is not integrated; no motif flag means no local flag, not safety. Its deployment requirements and model licence are documented at https://github.com/Illumina/SpliceAI. Missing CDS annotation prevents automatic additional-change proposals. Existing protein-edit and tagging workflows retain their original policies.


### Two guides and two ssODNs (co-transfection or separate delivery)

As in the protein SNP knock-in tool, the form designs **two guides and two ssODNs** with blocking changes. Two checkboxes set this:

| Checkboxes | Policy | What the tool does |
| --- | --- | --- |
| **Add PAM/seed blocking changes** on and **Co-transfect both guides and both ssODNs** on (defaults) | `pair` | One blocking set that both guides need (CFD <= 0.023, the engine's own cut point), carried by both ssODNs, so neither guide can cut the repaired allele whichever ssODN performs the repair. |
| Blocking changes on, co-transfection off | `independent` | Each guide gets the smallest blocking set of its own, and each ssODN carries only the set for its own guide. Deliver one guide and ssODN pair at a time; do not pool the pairs. |
| Blocking changes off | `none` | Only the requested base is changed. Every candidate guide is listed with its matched ssODN and graded for re-cutting, as before. The co-transfection checkbox is disabled. |

Blocking changes are added only where the requested edit leaves a guide able to re-cut. They must not affect splicing, which the tool enforces by position:
never inside a splice-site window of an annotated exon (donor: last 3 exon bases and intron +1..+6; acceptor: intron -40..-1 and first 3 exon bases);
inside coding sequence only if the change is silent given the requested edit and at least 4 bp from both exon ends; deeper in the intron anywhere,
preferring changes that do not create a new GT or AG within 60 bp of an exon. Among feasible pairs the tool prefers fewer coding changes, then (co-transfection only)
cuts at least 10 bp apart, fewer changes, fewer guide-sequence warnings and nearer cuts; other feasible pairs are listed in the report. Every ssODN is checked
against the reference: it may differ only at the requested base and its listed changes. The report and the sequence CSV list the two guides of the pair.

The positional screen and its recommendation (use the changes, review them, or use the exact edit) are always shown. They are rule-based and are **not** a
splice-site predictor; a pass does not validate splicing. For a prediction, download the *splice-check request* from the result panel and run
`assured-crispr-designer/scripts/splice_check.py` (SpliceAI; needs Python 3.10/3.11, numpy < 2, tensorflow-cpu 2.15 and `spliceai`, and runs on your computer). It scores the
wild type, the edit and the edit with each ssODN's blocking changes and writes a result file; attach that file in the app to update the recommendation. The largest score
change caused by the blocking changes on the edited allele (the worst ssODN allele) is judged: <= 0.05 supports them, up to 0.2 asks for review, above 0.2 advises against
them (the tool's own thresholds). Limits: forward-strand references only; genome-wide specificity is not checked; RNA outcomes still need validation in the edited clones.

SNP donor policy 2 places the 91 nt flank toward the PAM and the 36 nt flank
on the opposite side of the nominal target-strand cut. This mirrors the reference
layout for 5′-PAM Cas12a/Mad7 while retaining Cas9's 3′-PAM behavior. The policy is
a computational design heuristic; enzyme-specific HDR and strand preferences
still require experimental validation.
