"""Tool-calling agent loop."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from wgs_agent.models import Model, ModelResponse, ToolCall
from wgs_agent.paths import resolve_work_dir
from wgs_agent.tools import ToolRegistry


SYSTEM_PROMPT = (
    "You are a whole-genome sequencing assistant. "
    "Use only the provided tools. Never invent file contents or BAM outputs. "
    "Paths must stay inside the work directory. "
    "When a tool reports missing binaries, say so clearly."
)


@dataclass
class AgentResult:
    answer: str
    messages: list[dict[str, Any]] = field(default_factory=list)
    steps: int = 0


class Agent:
    def __init__(
        self,
        model: Model,
        work_dir: str | Path,
        registry: ToolRegistry | None = None,
        max_steps: int = 8,
    ):
        self.model = model
        self.work_dir = resolve_work_dir(work_dir)
        self.registry = registry or ToolRegistry()
        self.max_steps = max_steps

    def run(self, user_message: str) -> AgentResult:
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Work directory: {self.work_dir}\n"
                    f"Request: {user_message}"
                ),
            },
        ]
        tools = self.registry.schemas()
        steps = 0

        for steps in range(1, self.max_steps + 1):
            response = self.model.complete(messages, tools)
            if response.tool_calls:
                messages.append(self._assistant_tool_message(response))
                for call in response.tool_calls:
                    observation = self.registry.call(
                        self.work_dir, call.name, call.arguments
                    )
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": call.id,
                            "name": call.name,
                            "content": json.dumps(observation, sort_keys=True),
                        }
                    )
                continue

            answer = (response.content or "").strip() or "No response."
            messages.append({"role": "assistant", "content": answer})
            return AgentResult(answer=answer, messages=messages, steps=steps)

        return AgentResult(
            answer="Stopped after max tool steps without a final answer.",
            messages=messages,
            steps=steps,
        )

    @staticmethod
    def _assistant_tool_message(response: ModelResponse) -> dict[str, Any]:
        tool_calls = response.tool_calls or []
        return {
            "role": "assistant",
            "content": response.content,
            "tool_calls": [
                {
                    "id": call.id,
                    "type": "function",
                    "function": {
                        "name": call.name,
                        "arguments": json.dumps(call.arguments),
                    },
                }
                for call in tool_calls
            ],
        }
