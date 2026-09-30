from __future__ import annotations

from pathlib import Path

import wgs_agent.tools as tools_mod
from wgs_agent.tools import ToolRegistry, align, fastq_qc, list_inputs, summarize_vcf


def test_list_inputs(work_dir: Path) -> None:
    result = list_inputs(work_dir)
    assert "reads.fastq" in result["files"]["fastq"]
    assert "sample.vcf" in result["files"]["vcf"]
    assert result["files"]["bam"] == []


def test_fastq_qc(work_dir: Path) -> None:
    result = fastq_qc(work_dir, {"path": "reads.fastq"})
    assert result["read_count"] == 2
    assert result["total_bases"] == 24
    assert result["n_bases"] == 4
    assert result["mean_length"] == 12.0
    assert result["mean_quality"] > 0


def test_summarize_vcf(work_dir: Path) -> None:
    result = summarize_vcf(work_dir, {"path": "sample.vcf"})
    assert result["snv"] == 4
    assert result["indel"] == 2
    assert result["transitions"] == 2
    assert result["transversions"] == 2
    assert result["ti_tv"] == 1.0
    assert result["per_contig"] == {"chr1": 4, "chr2": 2}


def test_path_escape_rejected(work_dir: Path) -> None:
    registry = ToolRegistry()
    result = registry.call(work_dir, "fastq_qc", {"path": "../outside.fastq"})
    assert result["ok"] is False
    assert "escapes" in result["error"]


def test_align_missing_binaries(work_dir: Path, monkeypatch) -> None:
    monkeypatch.setattr(tools_mod, "_which", lambda _name: None)
    result = align(
        work_dir,
        {"fastq": "reads.fastq", "reference": "ref.fa", "output": "out.bam"},
    )
    assert result["ok"] is False
    assert "bwa" in result["missing"]
    assert "samtools" in result["missing"]
    assert not (work_dir / "out.bam").exists()


def test_align_with_stubbed_subprocess(work_dir: Path, monkeypatch) -> None:
    monkeypatch.setattr(
        tools_mod,
        "_which",
        lambda name: f"/usr/bin/{name}",
    )

    class FakeCompleted:
        def __init__(self, returncode: int = 0, stdout: str = "", stderr: str = ""):
            self.returncode = returncode
            self.stdout = stdout
            self.stderr = stderr

    calls: list[list[str]] = []

    def fake_run(cmd, **_kwargs):
        calls.append(list(cmd))
        if cmd[0].endswith("bwa"):
            return FakeCompleted(stdout="@HD\tVN:1.6\n")
        # samtools sort: create the output BAM path
        out_idx = cmd.index("-o") + 1
        Path(cmd[out_idx]).write_bytes(b"BAM")
        return FakeCompleted()

    monkeypatch.setattr(tools_mod, "_run", fake_run)
    result = align(
        work_dir,
        {"fastq": "reads.fastq", "reference": "ref.fa", "output": "aligned.sorted.bam"},
    )
    assert result["ok"] is True
    assert result["output"] == "aligned.sorted.bam"
    assert (work_dir / "aligned.sorted.bam").exists()
    assert any(c[0].endswith("bwa") for c in calls)
    assert any(c[0].endswith("samtools") for c in calls)


def test_registry_unknown_tool(work_dir: Path) -> None:
    registry = ToolRegistry()
    result = registry.call(work_dir, "explode", {})
    assert result["ok"] is False
    assert "unknown tool" in result["error"]
