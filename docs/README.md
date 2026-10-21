# Documentation

Reference pages for people who want to understand, reproduce or cite the design engine.
They describe what the code in this repository does; where a number is a choice of this tool
rather than a published value, the page says so and names the constant that holds it.

| Page | Covers |
|---|---|
| [qc-handoff.md](./qc-handoff.md) | The `assured-qc-design/1` file the design app writes for Assured QC: fields, coordinates, limits |
| [blocking-rules.md](./blocking-rules.md) | How re-cutting protection of the repaired allele is scored and graded (CFD, strong <= 0.023, moderate <= 0.10) and how release is decided |
| [splice-check.md](./splice-check.md) | The rule-based splice screen and the optional SpliceAI check (`scripts/splice_check.py`) |
| [third-party.md](./third-party.md) | Bundled data, referenced services and dependencies, with licence status |

Other documents in the repository: [README.md](../README.md) (release state, safety semantics, limitations),
[RUNNER_USAGE.md](../RUNNER_USAGE.md) (command line), [RELEASE_NOTES.md](../RELEASE_NOTES.md) (changes and known limitations),
and `audit/` (the design audit that the executable claims in `assured-crispr-designer/test/audit-claims.test.js` check).
