# ASSURED CRISPR Designer

Hosted browser app for CRISPR design review and ordering-ready exports.

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
