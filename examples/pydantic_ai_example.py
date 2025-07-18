#!/usr/bin/env python3
"""
Example: Using TextPrompts with Pydantic AI

Two approaches for integrating TextPrompts with Pydantic AI:
1. Direct system prompt formatting in Agent constructor
2. Single system prompt decorator with full formatting
"""

import tempfile
from datetime import date
from pathlib import Path
from typing import NamedTuple

try:
    from pydantic_ai import Agent, RunContext

    PYDANTIC_AI_AVAILABLE = True
except ImportError:
    # Mock classes for demonstration when pydantic_ai is not available
    class MockRunContext:
        def __init__(self, deps):
            self.deps = deps

    class MockAgent:
        def __init__(self, model, deps_type=None, system_prompt=None):
            self.model = model
            self.deps_type = deps_type
            self._system_prompt_value = system_prompt
            self._system_prompt_func = None

        def system_prompt(self, func):
            self._system_prompt_func = func
            return func

        def run_sync(self, message, deps=None):
            if self._system_prompt_func:
                system = self._system_prompt_func(MockRunContext(deps))
            else:
                system = self._system_prompt_value

            class MockResult:
                output = f"[MOCK] System: {system[:50]}... | User: {message} | Response: Professional support response."

            return MockResult()

    Agent = MockAgent
    RunContext = MockRunContext
    PYDANTIC_AI_AVAILABLE = False

from textprompts import PromptString, load_prompt


class CustomerInfo(NamedTuple):
    name: str
    company: str
    tier: str


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
    print("🔥 Example 1: Direct System Prompt Formatting")
    print("-" * 45)

    # Setup
    prompt_dir = create_prompts()
    system_prompt = load_prompt(prompt_dir / "system.txt", meta="allow")
    customer = CustomerInfo(name="Alice", company="ACME Corp", tier="Premium")

    # Format the system prompt directly
    formatted_prompt = system_prompt.body.format(
        company=customer.company,
        customer_name=customer.name,
        tier=customer.tier,
        current_date=date.today(),
    )

    # Create agent with pre-formatted system prompt
    agent = Agent(
        "openai:gpt-4.1-mini",
        deps_type=CustomerInfo,
        system_prompt=formatted_prompt,
    )

    print(f"📋 Formatted System Prompt: {formatted_prompt[:100]}...")

    # Use the agent
    result = agent.run_sync("I can't access my dashboard", deps=customer)
    print(f"🤖 Response: {result.output}")

    # Cleanup
    import shutil

    shutil.rmtree(prompt_dir)


def example_2_single_decorator():
    """Example 2: Single system prompt decorator with full formatting."""
    print("\n🚀 Example 2: Single System Prompt Decorator")
    print("-" * 45)

    # Setup
    prompt_dir = create_prompts()
    system_prompt = load_prompt(prompt_dir / "system.txt", meta="allow")
    customer = CustomerInfo(name="Bob", company="TechCorp", tier="Standard")

    # Create agent with no system prompt in constructor
    agent = Agent(
        "openai:gpt-4.1-mini",
        deps_type=CustomerInfo,
    )

    # Use single decorator to define the complete system prompt
    @agent.system_prompt
    def complete_system_prompt(ctx) -> str:
        return system_prompt.body.format(
            company=ctx.deps.company,
            customer_name=ctx.deps.name,
            tier=ctx.deps.tier,
            current_date=date.today(),
        )

    print(f"📋 Using TextPrompts template: {system_prompt.meta.title}")

    # Use the agent
    result = agent.run_sync("My account is locked", deps=customer)
    print(f"🤖 Response: {result.output}")

    # Cleanup
    import shutil

    shutil.rmtree(prompt_dir)


def main():
    """Run both examples."""
    print("🤖 TextPrompts + Pydantic AI: Two Approaches")
    print("=" * 50)

    if not PYDANTIC_AI_AVAILABLE:
        print("ℹ️  Note: pydantic_ai not installed - using mock for demonstration")
        print()

    # Run both examples
    example_1_direct_formatting()
    example_2_single_decorator()

    # Quick PromptString demo
    print("\n🔒 Bonus: PromptString Demo")
    print("-" * 25)
    template = PromptString("Hello {name}, your {item} is ready!")

    try:
        safe_msg = template.format(name="Charlie", item="order")
        print(f"✅ {safe_msg}")
    except ValueError as e:
        print(f"❌ {e}")

    print("\n✨ Done!")


if __name__ == "__main__":
    main()
