"""Fixed tool registry for WGS QC, alignment, and VCF summary."""

from __future__ import annotations

import json
import shutil
import subprocess
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from wgs_agent.paths import PathEscapeError, safe_path

FASTQ_SUFFIXES = (".fastq", ".fq", ".fastq.gz", ".fq.gz")
BAM_SUFFIXES = (".bam", ".sam")
VCF_SUFFIXES = (".vcf", ".vcf.gz")

TRANSITIONS = {
    ("A", "G"),
    ("G", "A"),
    ("C", "T"),
    ("T", "C"),
}


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    parameters: dict[str, Any]
    handler: Callable[[Path, dict[str, Any]], dict[str, Any]]

    def schema(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }


def _require_str(args: dict[str, Any], key: str) -> str:
    value = args.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"missing or invalid string argument: {key}")
    return value.strip()


def list_inputs(work_dir: Path, args: dict[str, Any] | None = None) -> dict[str, Any]:
    del args  # no parameters
    files: dict[str, list[str]] = {"fastq": [], "bam": [], "vcf": []}
    for path in sorted(work_dir.rglob("*")):
        if not path.is_file():
            continue
        name = path.name.lower()
        rel = str(path.relative_to(work_dir))
        if name.endswith(FASTQ_SUFFIXES):
            files["fastq"].append(rel)
        elif name.endswith(BAM_SUFFIXES):
            files["bam"].append(rel)
        elif name.endswith(VCF_SUFFIXES):
            files["vcf"].append(rel)
    return {"work_dir": str(work_dir), "files": files}


def _open_text(path: Path):
    if path.name.lower().endswith(".gz"):
        import gzip

        return gzip.open(path, "rt", encoding="utf-8", errors="replace")
    return path.open("rt", encoding="utf-8", errors="replace")


def _phred_mean(qual: str) -> float:
    if not qual:
        return 0.0
    return sum(ord(c) - 33 for c in qual) / len(qual)


def fastq_qc(work_dir: Path, args: dict[str, Any]) -> dict[str, Any]:
    rel = _require_str(args, "path")
    path = safe_path(work_dir, rel)
    if not path.is_file():
        raise FileNotFoundError(f"FASTQ not found: {rel}")

    read_count = 0
    total_bases = 0
    n_bases = 0
    qual_sum = 0.0
    lengths: list[int] = []

    with _open_text(path) as handle:
        while True:
            header = handle.readline()
            if not header:
                break
            seq = handle.readline()
            plus = handle.readline()
            qual = handle.readline()
            if not seq or not plus or not qual:
                break
            sequence = seq.strip().upper()
            quality = qual.rstrip("\n")
            read_count += 1
            lengths.append(len(sequence))
            total_bases += len(sequence)
            n_bases += sequence.count("N")
            qual_sum += _phred_mean(quality)

    mean_length = (sum(lengths) / read_count) if read_count else 0.0
    mean_quality = (qual_sum / read_count) if read_count else 0.0
    return {
        "path": rel,
        "read_count": read_count,
        "total_bases": total_bases,
        "n_bases": n_bases,
        "mean_length": round(mean_length, 3),
        "mean_quality": round(mean_quality, 3),
    }


def _which(binary: str) -> str | None:
    return shutil.which(binary)


def _run(cmd: list[str], *, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=cwd,
        check=False,
        capture_output=True,
        text=True,
    )


def align(work_dir: Path, args: dict[str, Any]) -> dict[str, Any]:
    fastq_rel = _require_str(args, "fastq")
    reference_rel = _require_str(args, "reference")
    output_rel = args.get("output", "aligned.sorted.bam")
    if not isinstance(output_rel, str) or not output_rel.strip():
        raise ValueError("missing or invalid string argument: output")
    output_rel = output_rel.strip()

    fastq = safe_path(work_dir, fastq_rel)
    reference = safe_path(work_dir, reference_rel)
    output = safe_path(work_dir, output_rel)

    if not fastq.is_file():
        raise FileNotFoundError(f"FASTQ not found: {fastq_rel}")
    if not reference.is_file():
        raise FileNotFoundError(f"reference not found: {reference_rel}")

    bwa = _which("bwa")
    samtools = _which("samtools")
    missing = [name for name, path in (("bwa", bwa), ("samtools", samtools)) if path is None]
    if missing:
        return {
            "ok": False,
            "error": f"required programs not on PATH: {', '.join(missing)}",
            "missing": missing,
        }

    output.parent.mkdir(parents=True, exist_ok=True)
    unsorted = output.with_suffix(output.suffix + ".unsorted.sam")

    mem = _run(
        [bwa, "mem", str(reference), str(fastq)],  # type: ignore[list-item]
        cwd=work_dir,
    )
    if mem.returncode != 0:
        return {
            "ok": False,
            "error": "bwa mem failed",
            "returncode": mem.returncode,
            "stderr": (mem.stderr or "")[-4000:],
        }
    unsorted.write_text(mem.stdout, encoding="utf-8")

    sort = _run(
        [
            samtools,  # type: ignore[list-item]
            "sort",
            "-o",
            str(output),
            str(unsorted),
        ],
        cwd=work_dir,
    )
    try:
        unsorted.unlink(missing_ok=True)
    except OSError:
        pass
    if sort.returncode != 0:
        return {
            "ok": False,
            "error": "samtools sort failed",
            "returncode": sort.returncode,
            "stderr": (sort.stderr or "")[-4000:],
        }

    return {
        "ok": True,
        "fastq": fastq_rel,
        "reference": reference_rel,
        "output": str(output.relative_to(work_dir)),
    }


def summarize_vcf(work_dir: Path, args: dict[str, Any]) -> dict[str, Any]:
    rel = _require_str(args, "path")
    path = safe_path(work_dir, rel)
    if not path.is_file():
        raise FileNotFoundError(f"VCF not found: {rel}")

    snv = 0
    indel = 0
    transitions = 0
    transversions = 0
    per_contig: Counter[str] = Counter()

    with _open_text(path) as handle:
        for line in handle:
            if not line or line.startswith("#"):
                continue
            fields = line.rstrip("\n").split("\t")
            if len(fields) < 5:
                continue
            chrom, _pos, _id, ref, alt = fields[:5]
            alts = [a for a in alt.split(",") if a and a != "."]
            if not alts:
                continue
            per_contig[chrom] += 1
            for allele in alts:
                if len(ref) == 1 and len(allele) == 1:
                    snv += 1
                    pair = (ref.upper(), allele.upper())
                    if pair in TRANSITIONS:
                        transitions += 1
                    elif ref.upper() in "ACGT" and allele.upper() in "ACGT":
                        transversions += 1
                else:
                    indel += 1

    ti_tv = (transitions / transversions) if transversions else None
    return {
        "path": rel,
        "snv": snv,
        "indel": indel,
        "transitions": transitions,
        "transversions": transversions,
        "ti_tv": round(ti_tv, 4) if ti_tv is not None else None,
        "per_contig": dict(sorted(per_contig.items())),
    }


def default_tools() -> list[Tool]:
    return [
        Tool(
            name="list_inputs",
            description="List FASTQ, BAM, and VCF files under the work directory.",
            parameters={
                "type": "object",
                "properties": {},
                "additionalProperties": False,
            },
            handler=list_inputs,
        ),
        Tool(
            name="fastq_qc",
            description=(
                "Compute FASTQ QC metrics: read count, lengths, N bases, mean quality. "
                "path is relative to the work directory."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "FASTQ path relative to the work directory",
                    }
                },
                "required": ["path"],
                "additionalProperties": False,
            },
            handler=fastq_qc,
        ),
        Tool(
            name="align",
            description=(
                "Align FASTQ to a reference with bwa mem and samtools sort when both "
                "are on PATH. Paths are relative to the work directory. Does not invent "
                "a BAM if tools are missing."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "fastq": {
                        "type": "string",
                        "description": "FASTQ path relative to the work directory",
                    },
                    "reference": {
                        "type": "string",
                        "description": "Reference FASTA path relative to the work directory",
                    },
                    "output": {
                        "type": "string",
                        "description": "Output BAM path relative to the work directory",
                        "default": "aligned.sorted.bam",
                    },
                },
                "required": ["fastq", "reference"],
                "additionalProperties": False,
            },
            handler=align,
        ),
        Tool(
            name="summarize_vcf",
            description=(
                "Summarize a VCF: SNV and indel counts, transition/transversion ratio, "
                "and counts per contig. path is relative to the work directory."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "VCF path relative to the work directory",
                    }
                },
                "required": ["path"],
                "additionalProperties": False,
            },
            handler=summarize_vcf,
        ),
    ]


class ToolRegistry:
    def __init__(self, tools: list[Tool] | None = None):
        self._tools = {tool.name: tool for tool in (tools or default_tools())}

    def schemas(self) -> list[dict[str, Any]]:
        return [tool.schema() for tool in self._tools.values()]

    def names(self) -> list[str]:
        return sorted(self._tools)

    def call(self, work_dir: Path, name: str, arguments: dict[str, Any] | str | None) -> dict[str, Any]:
        tool = self._tools.get(name)
        if tool is None:
            return {"ok": False, "error": f"unknown tool: {name}"}
        if arguments is None:
            args: dict[str, Any] = {}
        elif isinstance(arguments, str):
            try:
                parsed = json.loads(arguments) if arguments.strip() else {}
            except json.JSONDecodeError as exc:
                return {"ok": False, "error": f"invalid JSON arguments: {exc}"}
            if not isinstance(parsed, dict):
                return {"ok": False, "error": "tool arguments must be a JSON object"}
            args = parsed
        else:
            args = arguments
        try:
            result = tool.handler(work_dir, args)
            if isinstance(result, dict) and "ok" not in result:
                return {"ok": True, **result}
            return result
        except (PathEscapeError, FileNotFoundError, NotADirectoryError, ValueError) as exc:
            return {"ok": False, "error": str(exc)}
        except OSError as exc:
            return {"ok": False, "error": f"os error: {exc}"}
