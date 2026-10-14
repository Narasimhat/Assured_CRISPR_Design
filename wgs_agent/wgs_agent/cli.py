"""Command-line entry point for the WGS agent."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from wgs_agent.agent import Agent
from wgs_agent.models import select_model


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="wgs-agent",
        description="Tool-calling agent for WGS QC, alignment, and VCF summary.",
    )
    parser.add_argument(
        "message",
        help="Natural-language request, e.g. 'summarize sample.vcf'",
    )
    parser.add_argument(
        "--work-dir",
        type=Path,
        default=Path("."),
        help="Directory that contains FASTQ/BAM/VCF inputs (default: current directory)",
    )
    parser.add_argument(
        "--max-steps",
        type=int,
        default=8,
        help="Maximum model/tool iterations (default: 8)",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        model = select_model()
        agent = Agent(model=model, work_dir=args.work_dir, max_steps=args.max_steps)
        result = agent.run(args.message)
    except (FileNotFoundError, NotADirectoryError, RuntimeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(result.answer)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
