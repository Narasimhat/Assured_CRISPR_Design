"""Model backends for the WGS agent."""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Protocol


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass
class ModelResponse:
    content: str | None = None
    tool_calls: list[ToolCall] | None = None


class Model(Protocol):
    def complete(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
    ) -> ModelResponse: ...


class ScriptedModel:
    """Heuristic / scripted model for tests and offline CLI use.

    If ``script`` is provided, each call pops the next canned response.
    Otherwise it maps simple natural-language requests onto tools using
    the latest user message and prior tool results.
    """

    def __init__(self, script: list[ModelResponse] | None = None):
        self._script = list(script or [])
        self._call_index = 0

    def complete(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
    ) -> ModelResponse:
        del tools
        if self._script:
            if self._call_index >= len(self._script):
                return ModelResponse(content="Done.")
            response = self._script[self._call_index]
            self._call_index += 1
            return response
        return self._heuristic(messages)

    def _heuristic(self, messages: list[dict[str, Any]]) -> ModelResponse:
        user_text = ""
        for message in reversed(messages):
            if message.get("role") == "user" and isinstance(message.get("content"), str):
                user_text = message["content"]
                break

        tool_results = [
            m for m in messages if m.get("role") == "tool"
        ]
        if tool_results:
            last = tool_results[-1]
            content = last.get("content", "")
            return ModelResponse(content=f"Tool result:\n{content}")

        lower = user_text.lower()
        call_id = f"call_{self._call_index}"
        self._call_index += 1

        if any(word in lower for word in ("list", "inputs", "files", "what do we have")):
            return ModelResponse(
                tool_calls=[ToolCall(id=call_id, name="list_inputs", arguments={})]
            )

        vcf_match = re.search(
            r"([^\s\"']+\.vcf(?:\.gz)?)",
            user_text,
            flags=re.IGNORECASE,
        )
        if any(word in lower for word in ("summarize", "vcf", "variant", "ti/tv", "titv")):
            path = vcf_match.group(1) if vcf_match else "sample.vcf"
            return ModelResponse(
                tool_calls=[
                    ToolCall(id=call_id, name="summarize_vcf", arguments={"path": path})
                ]
            )

        fastq_match = re.search(
            r"([^\s\"']+\.(?:fastq|fq)(?:\.gz)?)",
            user_text,
            flags=re.IGNORECASE,
        )
        if any(word in lower for word in ("qc", "quality", "fastq")) and "align" not in lower:
            path = fastq_match.group(1) if fastq_match else "reads.fastq"
            return ModelResponse(
                tool_calls=[
                    ToolCall(id=call_id, name="fastq_qc", arguments={"path": path})
                ]
            )

        if "align" in lower:
            ref_match = re.search(
                r"([^\s\"']+\.(?:fa|fasta)(?:\.gz)?)",
                user_text,
                flags=re.IGNORECASE,
            )
            args: dict[str, Any] = {
                "fastq": fastq_match.group(1) if fastq_match else "reads.fastq",
                "reference": ref_match.group(1) if ref_match else "ref.fa",
            }
            return ModelResponse(
                tool_calls=[ToolCall(id=call_id, name="align", arguments=args)]
            )

        return ModelResponse(
            content=(
                "I can list inputs, run FASTQ QC, align with bwa/samtools when available, "
                "or summarize a VCF. Try: 'list inputs', 'qc reads.fastq', "
                "'summarize sample.vcf', or 'align reads.fastq to ref.fa'."
            )
        )


class OpenAICompatibleModel:
    """Minimal OpenAI-compatible chat completions client (stdlib only)."""

    def __init__(
        self,
        api_key: str,
        base_url: str,
        model: str = "gpt-4o-mini",
        timeout: float = 60.0,
    ):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout

    @classmethod
    def from_env(cls) -> OpenAICompatibleModel | None:
        api_key = os.environ.get("WGS_AGENT_API_KEY", "").strip()
        base_url = os.environ.get("WGS_AGENT_BASE_URL", "").strip()
        if not api_key or not base_url:
            return None
        model = os.environ.get("WGS_AGENT_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"
        return cls(api_key=api_key, base_url=base_url, model=model)

    def complete(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
    ) -> ModelResponse:
        payload = {
            "model": self.model,
            "messages": messages,
            "tools": tools,
            "tool_choice": "auto",
        }
        data = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            f"{self.base_url}/chat/completions",
            data=data,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                body = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"chat API HTTP {exc.code}: {detail}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"chat API request failed: {exc}") from exc

        choices = body.get("choices") or []
        if not choices:
            return ModelResponse(content="No response from model.")
        message = choices[0].get("message") or {}
        content = message.get("content")
        raw_calls = message.get("tool_calls") or []
        tool_calls: list[ToolCall] = []
        for index, call in enumerate(raw_calls):
            function = call.get("function") or {}
            name = function.get("name") or ""
            raw_args = function.get("arguments") or "{}"
            try:
                arguments = json.loads(raw_args) if isinstance(raw_args, str) else dict(raw_args)
            except json.JSONDecodeError:
                arguments = {}
            if not isinstance(arguments, dict):
                arguments = {}
            tool_calls.append(
                ToolCall(
                    id=str(call.get("id") or f"call_{index}"),
                    name=name,
                    arguments=arguments,
                )
            )
        return ModelResponse(
            content=content if isinstance(content, str) else None,
            tool_calls=tool_calls or None,
        )


def select_model(script: list[ModelResponse] | None = None) -> Model:
    if script is not None:
        return ScriptedModel(script)
    remote = OpenAICompatibleModel.from_env()
    if remote is not None:
        return remote
    return ScriptedModel()
