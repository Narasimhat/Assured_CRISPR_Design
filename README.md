# ASSURED CRISPR Designer

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
- Uploaded transcript identifiers are recorded, but MANE Select matching is not yet automatic. Confirm the intended transcript—especially the terminal coding exon for N- and C-terminal tagging—before sign-off.
- Remote primer specificity is an approximation and is not a substitute for a locally indexed, assembly-specific in-silico PCR result.
- `strong` blocking means predicted residual activity at or below 0.023, not zero. Only a fully destroyed PAM makes a site uncuttable.
- CFD is SpCas9-only, was fitted on off-target cleavage in a single screen, and estimates relative activity rather than a probability. It says nothing about repair outcome. It is the best published proxy for re-cutting of a repaired allele, not a measurement of it.
- Stacked blocking changes lower HDR efficiency and make the edited allele harder to read. Sequence the whole amplicon, not only the edited codon: a re-cut allele can carry the intended edit plus a nearby indel, which a codon-specific assay scores as a success.
- The design engine returns a terse internal result shape with no schema. Reports, exports and the CLI consume it by convention, so a change to that shape is not caught by validation.
- The 26 archived 2026_GE designs have not been re-derived against the current engine. The audit's claims *about this application* are executable; its per-project findings are not.

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
