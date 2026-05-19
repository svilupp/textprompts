#!/usr/bin/env python3
"""
Example: Using TextPrompts with Pydantic AI

Two approaches for integrating TextPrompts with Pydantic AI:
1. Direct system prompt formatting in Agent constructor
2. Single system prompt decorator with full formatting

If Pydantic AI or OPENAI_API_KEY is unavailable, this example uses a small
local mock agent so the TextPrompts integration remains runnable offline.
"""

import os
import shutil
import tempfile
from datetime import date
from pathlib import Path
from typing import NamedTuple

try:
    from pydantic_ai import Agent as PydanticAgent
except ImportError:  # pragma: no cover - exercised when optional dep is absent
    PydanticAgent = None

from textprompts import FormatError, PromptString, load_prompt


class CustomerInfo(NamedTuple):
    name: str
    company: str
    tier: str


class _MockRunResult(NamedTuple):
    output: str


class _MockContext(NamedTuple):
    deps: CustomerInfo


class MockAgent:
    """Tiny stand-in for the Pydantic AI API used in this example."""

    def __init__(self, _model: str, *, deps_type=None, system_prompt: str = "") -> None:
        self.deps_type = deps_type
        self._system_prompt = system_prompt
        self._system_prompt_fn = None

    def system_prompt(self, fn):
        self._system_prompt_fn = fn
        return fn

    def run_sync(self, message: str, *, deps: CustomerInfo) -> _MockRunResult:
        if self._system_prompt_fn is not None:
            system_prompt = self._system_prompt_fn(_MockContext(deps))
        else:
            system_prompt = self._system_prompt
        preview = " ".join(system_prompt.split())[:90]
        return _MockRunResult(
            f"Mock response to {deps.name!r} for {message!r}. Prompt preview: {preview}"
        )


def _agent_class():
    if (
        PydanticAgent is not None
        and os.getenv("OPENAI_API_KEY")
        and os.getenv("TEXTPROMPTS_EXAMPLE_REAL_AI") == "1"
    ):
        return PydanticAgent
    return MockAgent


def create_prompts():
    """Create example prompts."""
    temp_dir = Path(tempfile.mkdtemp())

    # System prompt with multiple placeholders
    system_prompt = """---
title = "Support Agent"
version = "1.0"
---
You are a helpful support agent for {company}.
Customer: {customer_name}
Tier: {tier}
Date: {current_date}

Always be professional and address the customer by name."""

    (temp_dir / "system.txt").write_text(system_prompt)
    return temp_dir


def example_1_direct_formatting():
    """Example 1: Direct system prompt formatting in Agent constructor."""
    print("Example 1: Direct System Prompt Formatting")
    print("-" * 45)

    # Setup
    prompt_dir = create_prompts()
    try:
        system_prompt = load_prompt(prompt_dir / "system.txt", metadata="allow")
        customer = CustomerInfo(name="Alice", company="ACME Corp", tier="Premium")

        formatted_prompt = system_prompt.prompt.format(
            company=customer.company,
            customer_name=customer.name,
            tier=customer.tier,
            current_date=date.today(),
        )

        agent = _agent_class()(
            "openai:gpt-4.1-mini",
            deps_type=CustomerInfo,
            system_prompt=formatted_prompt,
        )

        print(f"Formatted System Prompt: {formatted_prompt[:100]}...")

        result = agent.run_sync("I can't access my dashboard", deps=customer)
        print(f"Response: {result.output}")
    finally:
        shutil.rmtree(prompt_dir)


def example_2_single_decorator():
    """Example 2: Single system prompt decorator with full formatting."""
    print("\nExample 2: Single System Prompt Decorator")
    print("-" * 45)

    # Setup
    prompt_dir = create_prompts()
    try:
        system_prompt = load_prompt(prompt_dir / "system.txt", metadata="allow")
        customer = CustomerInfo(name="Bob", company="TechCorp", tier="Standard")

        agent = _agent_class()(
            "openai:gpt-4.1-mini",
            deps_type=CustomerInfo,
        )

        @agent.system_prompt
        def complete_system_prompt(ctx) -> str:
            return system_prompt.prompt.format(
                company=ctx.deps.company,
                customer_name=ctx.deps.name,
                tier=ctx.deps.tier,
                current_date=date.today(),
            )

        print(f"Using TextPrompts template: {system_prompt.meta.title}")

        result = agent.run_sync("My account is locked", deps=customer)
        print(f"Response: {result.output}")
    finally:
        shutil.rmtree(prompt_dir)


def main():
    """Run both examples."""
    mode = "Pydantic AI" if _agent_class() is PydanticAgent else "offline mock"
    print(f"TextPrompts + Pydantic AI: Two Approaches ({mode})")
    print("=" * 50)

    example_1_direct_formatting()
    example_2_single_decorator()

    print("\nBonus: PromptString Demo")
    print("-" * 25)
    template = PromptString("Hello {name}, your {item} is ready!")

    try:
        safe_msg = template.format(name="Charlie", item="order")
        print(safe_msg)
    except FormatError as e:
        print(e)

    print("\nDone.")


if __name__ == "__main__":
    main()
