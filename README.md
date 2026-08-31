# ASSURED CRISPR Designer

Hosted browser app for CRISPR design review and ordering-ready exports.

## Safety semantics

- An SpCas9 PAM change is called **strong blocking** only when the NGG PAM is changed with C/T at PAM position 2 or 3. NAG and NGA are treated as residual alternative PAMs and never receive a blocking pass.
- A single protospacer or seed mismatch with an intact PAM is **weak blocking** and is shown as a review warning.
- Point-mutation donors are translated after every desired and blocking change is assembled. A donor is not emitted unless the final protein contains the requested amino-acid substitution and no unintended coding changes.
- Every point-mutation or internal-tag ssODN is assessed against every offered guide. When cross-guide blocking is not strong, the report explicitly requires one matched guide/ssODN pair and forbids pooling the alternatives.
- Automatically selected alternative guides must have cut sites at least 10 bp apart. Closely overlapping custom guides are retained only with a non-independence warning.
- Guide delivery is an explicit input. TTTT is a blocking warning for U6/Pol III expression but not synthetic-guide RNP delivery; guide GC and poly-G warnings apply in either mode.
- Validation primers are searched by Tm, GC, homopolymer, hairpin, self-dimer, hetero-dimer, pair-Tm, and 3'-end stability criteria. The 3'-end check uses the nearest-neighbour ΔG of the terminal 5 nt and flags both an under-stable clamp (> -4.0 kcal/mol) and an over-stable end (< -8.0 kcal/mol); the thresholds are calibrated to the range that metric can actually produce. Fallback placements never receive an ordering-ready result.
- Knock-in validation primers must sit completely outside the homology arms with at least 50 bp between the nearest primer edge and each arm. Both margins are recorded in the report.
- Primer thermodynamic acceptance does not imply genome-wide specificity. Run the supplied specificity check or another genome-indexed PCR specificity workflow before ordering.

## Current limitations

- Guide selection does not yet calculate a genome-wide CFD/MIT specificity score or a full off-target candidate list.
- Guide GC content is reported, but a calibrated on-target efficiency model is not yet applied to every design mode. Reference KO guides may carry source-library scores when available.
- Uploaded transcript identifiers are recorded, but MANE Select matching is not yet automatic. Confirm the intended transcript—especially the terminal coding exon for N- and C-terminal tagging—before sign-off.
- Remote primer specificity is an approximation and is not a substitute for a locally indexed, assembly-specific in-silico PCR result.

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
