# ASSURED CLI usage

Two manifest-driven entry points, both running the same design engine as the hosted app:

| Script | npm script | Produces |
|---|---|---|
| `assured-crispr-designer/scripts/run_design.mjs` | `npm run design` | JSON payload |
| `assured-crispr-designer/scripts/export_report.mjs` | `npm run export-report` | The HTML report the app downloads |

Both read the manifest through `scripts/manifestDesign.mjs`, so they resolve the reference,
the design options and the requested gene identically. Keep it that way — when they had
separate copies, only one passed `expectedGene`, so one selected the CDS by requested gene
while the other fell back to whichever CDS came first in the file.

## Design a manifest and print JSON

```bash
cd assured-crispr-designer
npm run design -- --manifest examples/manifest_knockout.json
```

Write it to a file instead:

```bash
npm run design -- --manifest examples/manifest_knockout.json --output outputs/scn5a_ko.json
```

## Export the HTML report

```bash
cd assured-crispr-designer
npm run export-report -- --manifest examples/manifest_apoe_r176c.json --output outputs/apoe_r176c_report.html
```

This is the same document the app writes from **Download HTML report** — the test suite
asserts the two are byte-for-byte identical. The script prints only the path it wrote, so it
composes in a pipeline.

`outputs/` is git-ignored. Generated reports and payloads stay out of the repository.

## Exit codes

Both scripts distinguish a successful computation from an order-ready design:

| Code | Meaning |
|---|---|
| `0` | Design succeeded and procurement status is `ready` |
| `2` | Design succeeded but procurement is `blocked` or needs `review` |
| `1` | The design itself failed, or the script threw |

On `2` the review reasons go to stderr, and `run_design.mjs` also carries them in the payload
as `procurement.review_notes`. A populated `result` on its own is never an ordering green
light.

## JSON payload shape

```
ok            boolean
input         manifest path, reference file, edit type, gene, ensembl id
procurement   status, blockers, warnings, standing_requirements, review_notes
reference     source, gene, transcript_id, issues
result        the design
```

`result` does not embed the parsed transcript model: it restates the reference file and runs
to hundreds of kB. Its `referenceIssues` are release gates, so they are kept under
`reference.issues` rather than dropped with it.

## Manifest shape

```json
{
  "gene_symbol": "APOE",
  "ensembl_id": "ENSG00000130203",
  "mutation": "R176C",
  "edit_type": "snp knock-in",
  "species": "human",
  "cell_line": "",
  "extra": {
    "reference_file": "../test/fixtures/apoe-r154s.gb",
    "design_options": {
      "deliveryMethod": "rnp"
    }
  }
}
```

`extra.reference_file` is resolved relative to the manifest, and must exist at runtime. Both
bundled examples point at files inside the repo, and a test asserts that stays true — the
documented quickstart used to fail with `ENOENT`.

## Manifest fields

- `edit_type` maps to the engine as:
  - `knockout` → `ko`
  - `point mutation` or `snp knock-in` → `pm`
  - `n-terminal tag` → `nt`
  - `c-terminal tag` → `ct`
  - `internal tag` → `it`
- `gene_symbol` also selects the CDS, which matters for NCBI RefSeqGene records that
  annotate a neighbouring gene.
- `extra.tag` names the cassette for tagging designs.
- `extra.homology_arm_length` defaults to 400.
- `extra.custom_guides` passes an explicit guide list to the engine.
- `extra.co_delivery: true` builds every donor to block every offered guide — set it when
  both guides and both ssODNs are transfected together.
