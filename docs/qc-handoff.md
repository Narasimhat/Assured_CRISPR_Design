# Design hand-off to Assured QC: `assured-qc-design/1`

The design app can write one JSON object per design (button: **Download QC design file**).
The Assured QC app reads it and builds its expected-allele library from it alone, so QC does not need the
design engine. This page is the producer side; the consumer side, including the validator, is described in
`docs/design-handoff.md` of the [Assured QC repository](https://github.com/Narasimhat/Assured_QC).

Source: `assured-crispr-designer/src/qcExport.js`, function `buildQcDesignSpec(result, options)`.
The schema string is the constant `QC_SPEC_SCHEMA = "assured-qc-design/1"`.

## Coordinates

All positions are 0-based indices into `reference.sequence`, which is a window of the uploaded reference
(the + strand) starting at `reference.offset`. A cut index `c` means the cut lies between bases `c-1` and `c`
on the + strand. The window is the span of the guide cuts (+/- 30 bp), the donors and the placed primers,
padded by `windowPad` (default 300 bp) on each side. If the window would exceed `maxWindow` (default 5000 bp)
the export is refused with an error message instead of a truncated file.

## Top-level fields

| Field | Content |
|---|---|
| `schema` | `assured-qc-design/1` |
| `design` | `type` (`ko`, `pm`, `it`, `ct`, `nt`), `editKind`, `gene`, `label` (one-line description of the intended edit), `tag`, `codingStrand` (`+`) |
| `reference` | `sequence` (the window), `offset`, `convention` |
| `coding` | Optional. Gene region (`sequence`, `offset`), coding exons as 0-based half-open `segments`, `transcript`, `proteinLength`. Omitted when the record has no complete CDS (length not a multiple of 3) or the region exceeds `maxCodingRegion` (default 300000 bp) |
| `guides[]` | Up to the first three guides of the design: `name`, `spacer`, `pam`, `strand`, `cut`, `protospacerStart`, `protospacerEnd`, `offsetFromEdit`, `index` |
| `donors[]` | `name`, `format` (`ssodn`, `block`, `aav`), `sequence`, `refStart`, `refEnd`, `insertBp`, `arm5`, `arm3`, `replacedBp`, `insertStart`, `guide`, order strands; ssODNs also carry `orderSequence`, `orderStrand`, `carriesMarkers` |
| `markers[]` | Every base the donor changes outside the insert: `pos`, `ref`, `alt`, `role`, `guide`, `label`, `change` |
| `primers[]` | `name`, `sequence`, `start`, `end`, `strand` (placement on the window; `null` when the primer cannot be placed) |
| `amplicons[]` | For each forward/reverse pair that placed on the window: `wtBp` and `editedBp` per donor (and `deletion` for two-guide knockouts) |

## `design.editKind`

Derived from `design.type` and the donor format: `ko` gives `deletion`; `pm` gives `snp`; `it` gives `internal_tag`;
`ct` and `nt` give `tag_small` for an ssODN-format donor, `tag_large` for a block or AAV donor with an insert of
300 bp or less, and `reporter` for a block or AAV donor with a longer insert.

## Marker roles

`role` is `intended` for the bases that make up the requested edit and `blocking` for every other base the donor
changes (PAM or seed changes that stop a guide re-cutting the repaired allele). For point-mutation (`pm`) and internal-tag
(`it`) designs the intended positions are passed to the marker collector from the donor's `desiredDiffIndexes`. For
terminal-tag designs (`ct`, `nt`) no intended positions are passed, so every changed base outside the insert is
labelled `blocking`. Consumers should read `design.label` and `donors[].insertBp` for the intended edit, not infer it
from marker roles alone.

## Limits worth knowing

- Only the first three guides are exported.
- `ko` designs carry an empty `donors` list; for two guides `amplicons[].editedBp.deletion` gives the expected deletion product size.
- For terminal-tag designs the donor is placed on the reference by its first 40 nt of arm, allowing up to 2 mismatches
  (blocking changes sit inside arms); a donor that cannot be placed makes the export fail with
  `The donor could not be placed on the reference.`
- The file is a description of the design, not a record of what was delivered. It contains the reference window of the
  uploaded GenBank file; do not publish an export made from a reference you do not have the right to share.

## Validation

The QC app checks a hand-off for internal consistency before using it (spacer at its stated position, cut 3 bp from the PAM,
marker base equals the reference base, every donor difference declared by a marker, primers on the window, amplicon sizes
that follow from the primers). The design repository's tests for the producer are in
`assured-crispr-designer/test/qc-export.test.js`.
