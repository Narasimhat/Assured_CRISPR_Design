from __future__ import annotations

import json
from pathlib import Path

from wgs_agent.agent import Agent
from wgs_agent.models import ModelResponse, ScriptedModel, ToolCall, select_model


def test_agent_calls_summarize_vcf(work_dir: Path) -> None:
    script = [
        ModelResponse(
            tool_calls=[
                ToolCall(
                    id="call_1",
                    name="summarize_vcf",
                    arguments={"path": "sample.vcf"},
                )
            ]
        ),
        ModelResponse(content="Found 4 SNVs and 2 indels; Ti/Tv is 1.0."),
    ]
    agent = Agent(model=ScriptedModel(script), work_dir=work_dir)
    result = agent.run("summarize variants in sample.vcf")
    assert "4 SNVs" in result.answer
    tool_messages = [m for m in result.messages if m.get("role") == "tool"]
    assert len(tool_messages) == 1
    payload = json.loads(tool_messages[0]["content"])
    assert payload["ok"] is True
    assert payload["snv"] == 4
    assert payload["indel"] == 2


def test_agent_list_inputs_heuristic(work_dir: Path) -> None:
    agent = Agent(model=ScriptedModel(), work_dir=work_dir)
    result = agent.run("list inputs")
    assert "reads.fastq" in result.answer or "Tool result" in result.answer
    tool_messages = [m for m in result.messages if m.get("role") == "tool"]
    assert tool_messages
    payload = json.loads(tool_messages[0]["content"])
    assert "reads.fastq" in payload["files"]["fastq"]


def test_select_model_prefers_script() -> None:
    model = select_model(script=[ModelResponse(content="hi")])
    assert isinstance(model, ScriptedModel)


def test_cli_summarize(work_dir: Path, monkeypatch, capsys) -> None:
    from wgs_agent.cli import main

    monkeypatch.delenv("WGS_AGENT_API_KEY", raising=False)
    monkeypatch.delenv("WGS_AGENT_BASE_URL", raising=False)
    code = main(["summarize sample.vcf", "--work-dir", str(work_dir)])
    captured = capsys.readouterr()
    assert code == 0
    assert "snv" in captured.out.lower() or "Tool result" in captured.out
