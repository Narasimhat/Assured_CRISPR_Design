# ASSURED CLI runner usage

The repo now includes a lightweight manifest-based runner:

- `assured-crispr-designer/scripts/run_design.mjs`

## Basic usage

```bash
cd assured-crispr-designer
node scripts/run_design.mjs --manifest examples/manifest_knockout.json
```

## Write result to a file

```bash
cd assured-crispr-designer
node scripts/run_design.mjs --manifest examples/manifest_knockout.json --output outputs/scn5a_ko.json
```

## Recommended package.json script

Add this under `scripts` in `assured-crispr-designer/package.json`:

```json
"design": "node scripts/run_design.mjs"
```

Then run:

```bash
cd assured-crispr-designer
npm run design -- --manifest examples/manifest_knockout.json
```

## Manifest shape

```json
{
  "gene_symbol": "SCN5A",
  "ensembl_id": "ENSG00000183873",
  "mutation": "",
  "edit_type": "knockout",
  "species": "human",
  "cell_line": "",
  "extra": {
    "reference_file": "../../scn5a-ensg00000183873.gb"
  }
}
```

## Notes

- `edit_type` values currently supported by the runner map to the app engine as:
  - `knockout` -> `ko`
  - `point mutation` or `snp knock-in` -> `pm`
  - `n-terminal tag` -> `nt`
  - `c-terminal tag` -> `ct`
  - `internal tag` -> `it`
- `extra.reference_file` should point to a readable GenBank file at runtime.
- Optional `extra.custom_guides` can be passed through to the native design engine.
