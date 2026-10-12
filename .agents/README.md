# Agent skills

This directory holds [Google DeepMind Science Skills](https://github.com/google-deepmind/science-skills) installed for Cursor Cloud Agents and local Cursor agents.

## Install / update

```bash
npx skills add google-deepmind/science-skills --agent cursor --copy -y
```

Pinned versions are recorded in [`../skills-lock.json`](../skills-lock.json). Third-party data source terms are in [`SKILL_LICENSES.md`](./SKILL_LICENSES.md).

## CRISPR-relevant skills

For ASSURED CRISPR design review, these are especially useful:

| Skill | Use |
|---|---|
| `ensembl-database` | Gene/transcript IDs, MANE Select, sequences, VEP |
| `ncbi-sequence-fetch` | RefSeq / GenBank sequence retrieval |
| `clinvar-database` | Pathogenic / clinical variant context |
| `dbsnp-database` | rsID lookup |
| `gnomad-database` | Population allele frequencies |
| `alphagenome-single-variant-analysis` | Predicted regulatory impact (needs `ALPHAGENOME_API_KEY`) |
| `uniprot-database` | Protein annotation for coding edits |
| `ucsc-conservation-and-tfbs` | Conservation / TFBS near cut sites |

## Runtime notes

- Skills expect the [`uv`](https://github.com/astral-sh/uv) package manager (`uv` skill documents setup).
- Prefer Cursor Secrets / environment variables for API keys on Cloud Agents; the bundled `credentials` skill defaults to `~/.env` for local agents.
- Do not treat science-skill outputs as a substitute for this app’s release gates (`BLOCKED` / `REVIEW REQUIRED` / `READY`).
