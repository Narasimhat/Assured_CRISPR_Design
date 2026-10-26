from __future__ import annotations

import shutil
from pathlib import Path

import pytest

FIXTURES = Path(__file__).resolve().parent / "fixtures"


@pytest.fixture
def work_dir(tmp_path: Path) -> Path:
    for name in ("reads.fastq", "sample.vcf", "ref.fa"):
        shutil.copy(FIXTURES / name, tmp_path / name)
    return tmp_path
