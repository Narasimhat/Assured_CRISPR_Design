# WGS tool-calling agent

A small Python agent that calls a fixed set of whole-genome tools: list inputs, FASTQ QC, optional BWA/samtools alignment, and VCF summary.

The model never gets a shell. Each tool validates arguments and keeps paths inside a work directory you provide.

## Install

```bash
cd wgs_agent
pip install -e ".[dev]"
```

## CLI

```bash
python -m wgs_agent "summarize variants in sample.vcf" --work-dir ./data
```

Without `WGS_AGENT_API_KEY` and `WGS_AGENT_BASE_URL`, the CLI uses a scripted heuristic model that maps simple requests to tools. With those env vars set, it uses an OpenAI-compatible chat API.

## Tools

| Tool | Role |
|---|---|
| `list_inputs` | List FASTQ, BAM, and VCF files under the work directory |
| `fastq_qc` | Pure-Python read count, length, N bases, mean quality |
| `align` | Run `bwa mem` + `samtools sort` when both are on `PATH` |
| `summarize_vcf` | SNV/indel counts, Ti/Tv, per-contig counts |

## Tests

From the repository root:

```bash
pip install -e "wgs_agent/[dev]"
pytest
```

Alignment tests stub subprocess calls so CI does not need `bwa` or a reference genome.
