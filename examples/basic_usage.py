#!/usr/bin/env python3
"""
Example: Basic TextPrompts Usage

This example demonstrates the core functionality of TextPrompts
including loading single prompts, multiple prompts, and using PromptString.
"""

import os
import shutil
import tempfile

from textprompts import PromptString, load_prompt, load_prompts, save_prompt


def create_example_prompts():
    """Create a set of example prompt files."""
    prompt_dir = tempfile.mkdtemp()

    # Create subdirectories
    os.makedirs(os.path.join(prompt_dir, "customer"))
    os.makedirs(os.path.join(prompt_dir, "internal"))

    # Customer-facing prompts
    greeting = """---
title = "Customer Greeting"
version = "1.0.0"
author = "Customer Success Team"
created = "2024-01-15"
description = "Standard greeting for customer interactions"
---
Hello {customer_name}!

Welcome to {company_name}. We're excited to help you with {service_type} today.

If you have any questions, please don't hesitate to ask!

Best regards,
{agent_name}"""

    support_response = """---
title = "Support Response Template"
version = "2.1.0"
author = "Support Team"
description = "Template for responding to support tickets"
---

Dear {customer_name},

Thank you for contacting {company_name} support regarding {issue_type}.

We have reviewed your request and here's our response:

{resolution_details}

If you need any further assistance, please reply to this message or contact us at {support_email}.

Ticket ID: {ticket_id}
Priority: {priority}

Best regards,
{agent_name}
{company_name} Support Team"""

    # Internal prompts
    code_review = """---
title = "Code Review Prompt"
version = "1.0.0"
author = "Engineering Team"
description = "AI-assisted code review prompt"
---

Please review the following code for:
- Performance issues
- Security vulnerabilities
- Code style and best practices
- Potential bugs

Language: {programming_language}
Component: {component_name}
Author: {author}

Code to review:
```{programming_language}
{code_content}
```

Focus areas: {focus_areas}"""

    # Simple prompt without metadata
    simple_prompt = """This is a simple prompt template for {purpose}.

No metadata required - just use {variables} as needed."""

    # Write files
    with open(os.path.join(prompt_dir, "customer", "greeting.txt"), "w") as f:
        f.write(greeting)

    with open(os.path.join(prompt_dir, "customer", "support.txt"), "w") as f:
        f.write(support_response)

    with open(os.path.join(prompt_dir, "internal", "code_review.txt"), "w") as f:
        f.write(code_review)

    with open(os.path.join(prompt_dir, "simple.txt"), "w") as f:
        f.write(simple_prompt)

    return prompt_dir


def demonstrate_single_prompt_loading(prompt_dir):
    """Demonstrate loading and using a single prompt."""
    print("1. Single Prompt Loading")
    print("-" * 30)

    # Load greeting prompt
    greeting_path = os.path.join(prompt_dir, "customer", "greeting.txt")
    greeting = load_prompt(greeting_path, meta="allow")

    print(f"Loaded: {greeting.meta.title}")
    print(f"Version: {greeting.meta.version}")
    print(f"Author: {greeting.meta.author}")
    print(f"Description: {greeting.meta.description}")

    # Use the prompt
    message = greeting.body.format(
        customer_name="Alice Johnson",
        company_name="Tech Solutions Inc",
        service_type="cloud hosting",
        agent_name="Sarah",
    )

    print("\nFormatted message:")
    print(message)
    print()


def demonstrate_multiple_prompt_loading(prompt_dir):
    """Demonstrate loading multiple prompts from directories."""
    print("2. Multiple Prompt Loading")
    print("-" * 30)

    # Load all prompts recursively (allow metadata parsing for files that have it)
    prompts = load_prompts(prompt_dir, recursive=True, meta="allow")

    print(f"Loaded {len(prompts)} prompts:")
    for prompt in prompts:
        if prompt.meta.version:
            print(f"  • {prompt.meta.title} (v{prompt.meta.version})")
        else:
            print(f"  • {prompt.meta.title} (from filename)")

    # Create a lookup by title (all prompts now have metadata)
    prompt_lookup = {p.meta.title: p for p in prompts}

    # Use support response template
    if "Support Response Template" in prompt_lookup:
        support = prompt_lookup["Support Response Template"]
        response = support.body.format(
            customer_name="Bob Smith",
            company_name="Tech Solutions Inc",
            issue_type="billing inquiry",
            resolution_details="We've updated your billing address and the charge will be corrected in your next statement.",
            support_email="support@techsolutions.com",
            ticket_id="TS-2024-001",
            priority="Medium",
            agent_name="Mike",
        )

        print(f"\nSample {support.meta.title}:")
        print(response[:200] + "..." if len(response) > 200 else response)
    print()


def demonstrate_safestring():
    """Demonstrate PromptString validation features."""
    print("3. PromptString Validation")
    print("-" * 30)

    # Create a template with variables
    template = PromptString(
        "Order {order_id} for {customer} is {status}. Total: ${amount}"
    )

    print("Template:", template)
    print("Placeholders:", template.placeholders)

    # Successful formatting (all placeholders provided)
    try:
        result = template.format(
            order_id="12345", customer="Alice", status="shipped", amount="99.99"
        )
        print(f"✅ Success: {result}")
    except ValueError as e:
        print(f"❌ Error: {e}")

    # Failed formatting - missing variables (default behavior)
    try:
        result = template.format(
            order_id="12345",
            customer="Bob",
            # Missing: status, amount
        )
        print(f"✅ Success: {result}")
    except ValueError as e:
        print(f"❌ Error (expected): {e}")

    # Partial formatting with skip_validation=True
    try:
        partial = template.format(
            order_id="12345",
            customer="Bob",
            skip_validation=True,  # Only replace available placeholders
        )
        print(f"✅ Partial format: {partial}")
        print("   ^ Notice {status} and {amount} remain as placeholders")
    except ValueError as e:
        print(f"❌ Error: {e}")

    # Test with extra variables (should work)
    try:
        result = template.format(
            order_id="67890",
            customer="Charlie",
            status="processing",
            amount="149.99",
            extra_field="ignored",  # Extra fields are OK
        )
        print(f"✅ Success with extra fields: {result}")
    except ValueError as e:
        print(f"❌ Error: {e}")
    print()


def demonstrate_no_metadata_loading(prompt_dir):
    """Demonstrate loading prompts without metadata."""
    print("4. No Metadata Loading")
    print("-" * 30)

    simple_path = os.path.join(prompt_dir, "simple.txt")

    # This will work with meta="ignore"
    try:
        simple = load_prompt(simple_path, meta="ignore")
        print(f"✅ Loaded simple prompt: {simple.path.name}")
        print(f"   Title (from filename): {simple.meta.title}")
        print(f"   Version: {simple.meta.version}")

        # Use the prompt
        result = simple.body.format(purpose="quick testing", variables="placeholder")
        print(f"   Result: {result}")

    except Exception as e:
        print(f"❌ Error: {e}")

    # This will fail with strict mode (default is ignore, so we need to set strict)
    try:
        simple = load_prompt(simple_path, meta="strict")
        print("✅ Loaded simple prompt with strict mode")
    except Exception as e:
        print(f"❌ Expected error with strict mode: {type(e).__name__}")
    print()


def demonstrate_save_prompt(prompt_dir):
    """Demonstrate saving prompts."""
    print("5. Saving Prompts")
    print("-" * 30)

    # Save a simple prompt with template
    simple_path = os.path.join(prompt_dir, "generated_simple.txt")
    save_prompt(simple_path, "You are a helpful assistant for {task}.")

    print(f"✅ Saved simple prompt to: {simple_path}")

    # Load it back and show the template
    loaded = load_prompt(simple_path, meta="allow")
    print(f"   Template created with title: '{loaded.meta.title}'")
    print(f"   Template created with description: '{loaded.meta.description}'")
    print(f"   Template created with version: '{loaded.meta.version}'")

    # Save a full Prompt object
    from datetime import date
    from pathlib import Path

    from textprompts import Prompt, PromptMeta, PromptString

    full_meta = PromptMeta(
        title="Generated Prompt",
        description="A programmatically created prompt",
        version="1.0.0",
        author="Example Script",
        created=date.today(),
    )

    full_prompt = Prompt(
        path=Path(simple_path),
        meta=full_meta,
        prompt=PromptString("This is a {type} prompt with full metadata."),
    )

    full_path = os.path.join(prompt_dir, "generated_full.txt")
    save_prompt(full_path, full_prompt)

    print(f"✅ Saved full prompt to: {full_path}")

    # Load it back
    loaded_full = load_prompt(full_path, meta="allow")
    print(f"   Full prompt title: '{loaded_full.meta.title}'")
    print(f"   Full prompt author: '{loaded_full.meta.author}'")
    print()


def demonstrate_error_handling(prompt_dir):
    """Demonstrate error handling."""
    print("6. Error Handling")
    print("-" * 30)

    from textprompts import FileMissingError, TextPromptsError

    # Try to load non-existent file
    try:
        load_prompt(os.path.join(prompt_dir, "nonexistent.txt"))
    except FileMissingError as e:
        print(f"❌ File not found: {e}")
    except TextPromptsError as e:
        print(f"❌ TextPrompts error: {e}")

    # Try to load directory with file limit
    try:
        prompts = load_prompts(prompt_dir, recursive=True, max_files=2)
        print(f"✅ Loaded {len(prompts)} prompts with limit")
    except TextPromptsError as e:
        print(f"❌ File limit exceeded: {e}")
    print()


def main():
    """Run all demonstrations."""
    print("TextPrompts Basic Usage Examples")
    print("=" * 40)

    # Create example prompts
    prompt_dir = create_example_prompts()
    print(f"Created example prompts in: {prompt_dir}\n")

    try:
        demonstrate_single_prompt_loading(prompt_dir)
        demonstrate_multiple_prompt_loading(prompt_dir)
        demonstrate_safestring()
        demonstrate_no_metadata_loading(prompt_dir)
        demonstrate_save_prompt(prompt_dir)
        demonstrate_error_handling(prompt_dir)

        print("All examples completed successfully! 🎉")

    finally:
        # Cleanup
        shutil.rmtree(prompt_dir)
        print(f"\nCleaned up: {prompt_dir}")


if __name__ == "__main__":
    main()
