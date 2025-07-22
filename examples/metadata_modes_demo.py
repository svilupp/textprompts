#!/usr/bin/env python3
"""
Example: Metadata Modes Demo

This example demonstrates the three metadata handling modes in TextPrompts:
- IGNORE (default): Simple file loading, filename becomes title
- ALLOW: Load metadata if present, don't worry about completeness
- STRICT: Require complete metadata for production safety
"""

import os
import shutil
import tempfile

import textprompts


def create_test_files():
    """Create test files with different metadata scenarios."""
    test_dir = tempfile.mkdtemp()

    # File with complete metadata
    complete_metadata = """---
title = "Complete Prompt"
description = "A prompt with all required metadata fields"
version = "1.0.0"
author = "Demo Author"
created = "2024-01-15"
---
This prompt has complete metadata with title: {title}, description, and version."""

    # File with partial metadata
    partial_metadata = """---
title = "Partial Prompt"
# Missing description and version
author = "Demo Author"
---
This prompt has partial metadata - only title and author."""

    # File with no metadata
    no_metadata = """This is a simple prompt with no metadata.

It just has content with a {placeholder}."""

    # File with invalid TOML
    invalid_toml = """---
title = "Invalid TOML
# Missing closing quote - this will cause TOML parse error
---
This file has invalid TOML metadata."""

    # Write test files
    with open(os.path.join(test_dir, "complete.txt"), "w") as f:
        f.write(complete_metadata)

    with open(os.path.join(test_dir, "partial.txt"), "w") as f:
        f.write(partial_metadata)

    with open(os.path.join(test_dir, "simple.txt"), "w") as f:
        f.write(no_metadata)

    with open(os.path.join(test_dir, "invalid.txt"), "w") as f:
        f.write(invalid_toml)

    return test_dir


def demonstrate_ignore_mode(test_dir):
    """Demonstrate IGNORE mode - simple file loading."""
    print("1. IGNORE Mode (Default) - Simple File Loading")
    print("=" * 50)
    print("✨ Perfect for: Simple text file loading, no configuration needed\n")

    # Set global mode to IGNORE (this is the default)
    textprompts.set_metadata("ignore")

    files = ["complete.txt", "partial.txt", "simple.txt", "invalid.txt"]

    for filename in files:
        file_path = os.path.join(test_dir, filename)
        try:
            prompt = textprompts.load_prompt(file_path)
            print(f"✅ {filename}:")
            print(f"   Title: {prompt.meta.title} (from filename)")
            print(f"   Content preview: {str(prompt.body)[:60]}...")
            print()
        except Exception as e:
            print(f"❌ {filename}: {type(e).__name__}: {e}")
            print()


def demonstrate_allow_mode(test_dir):
    """Demonstrate ALLOW mode - flexible metadata loading."""
    print("2. ALLOW Mode - Flexible Metadata Loading")
    print("=" * 50)
    print(
        "✨ Perfect for: Loading metadata when available, not strict about completeness\n"
    )

    # Set global mode to ALLOW
    textprompts.set_metadata("allow")

    files = ["complete.txt", "partial.txt", "simple.txt", "invalid.txt"]

    for filename in files:
        file_path = os.path.join(test_dir, filename)
        try:
            prompt = textprompts.load_prompt(file_path)
            print(f"✅ {filename}:")
            print(f"   Title: {prompt.meta.title}")
            print(f"   Description: {prompt.meta.description}")
            print(f"   Version: {prompt.meta.version}")
            print(f"   Author: {prompt.meta.author}")
            print()
        except Exception as e:
            print(f"❌ {filename}: {type(e).__name__}: {e}")
            print()


def demonstrate_strict_mode(test_dir):
    """Demonstrate STRICT mode - production-safe loading."""
    print("3. STRICT Mode - Production-Safe Loading")
    print("=" * 50)
    print(
        "✨ Perfect for: Production deployments, ensuring all prompts have complete metadata\n"
    )

    # Set global mode to STRICT
    textprompts.set_metadata("strict")

    files = ["complete.txt", "partial.txt", "simple.txt", "invalid.txt"]

    for filename in files:
        file_path = os.path.join(test_dir, filename)
        try:
            prompt = textprompts.load_prompt(file_path)
            print(f"✅ {filename}: VALID")
            print(f"   Title: {prompt.meta.title}")
            print(f"   Description: {prompt.meta.description}")
            print(f"   Version: {prompt.meta.version}")
            print()
        except Exception as e:
            print(f"❌ {filename}: {type(e).__name__}")
            print(f"   Error: {str(e)[:100]}...")
            print()


def demonstrate_per_prompt_override(test_dir):
    """Demonstrate per-prompt mode override."""
    print("4. Per-Prompt Override - Mix Different Modes")
    print("=" * 50)
    print(
        "✨ Perfect for: Using different modes for different files in the same application\n"
    )

    # Set global to one mode, then override per prompt
    textprompts.set_metadata("ignore")  # Global setting

    complete_path = os.path.join(test_dir, "complete.txt")
    simple_path = os.path.join(test_dir, "simple.txt")

    print("Global mode: IGNORE")
    print()

    # Load with different overrides
    modes = ["ignore", "allow", "strict"]

    for mode in modes:
        print(f"Loading complete.txt with meta='{mode}':")
        try:
            prompt = textprompts.load_prompt(complete_path, meta=mode)
            print(f"   ✅ Success - Title: {prompt.meta.title}")
        except Exception as e:
            print(f"   ❌ {type(e).__name__}: {e}")
        print()

    for mode in modes:
        print(f"Loading simple.txt with meta='{mode}':")
        try:
            prompt = textprompts.load_prompt(simple_path, meta=mode)
            print(f"   ✅ Success - Title: {prompt.meta.title}")
        except Exception as e:
            print(f"   ❌ {type(e).__name__}: {e}")
        print()


def demonstrate_use_cases(test_dir):
    """Demonstrate real-world use cases for each mode."""
    print("5. Real-World Use Cases")
    print("=" * 50)

    print("📝 IGNORE Mode Use Cases:")
    print("   • Quick prototyping and experimentation")
    print("   • Simple prompt management without metadata overhead")
    print("   • Converting existing text files to prompts")
    print("   • Educational examples and tutorials")
    print()

    print("🔄 ALLOW Mode Use Cases:")
    print("   • Development environments with mixed prompt types")
    print("   • Gradual migration from simple to structured prompts")
    print("   • Third-party prompt collections with varying metadata")
    print("   • Flexible prompt libraries")
    print()

    print("🔒 STRICT Mode Use Cases:")
    print("   • Production deployments requiring complete documentation")
    print("   • Regulated environments needing full traceability")
    print("   • Team workflows with mandatory metadata standards")
    print("   • Quality assurance and compliance checking")
    print()

    # Show a practical example
    print("Practical Example - CI/CD Pipeline:")
    print()

    # Development: Use ALLOW mode for flexibility
    textprompts.set_metadata("allow")
    try:
        dev_prompts = textprompts.load_prompts(test_dir, meta="allow")
        print(f"✅ Development: Loaded {len(dev_prompts)} prompts with ALLOW mode")
    except Exception as e:
        print(f"❌ Development: {e}")

    # Production: Use STRICT mode for safety
    try:
        prod_prompts = textprompts.load_prompts(test_dir, meta="strict")
        print(f"✅ Production: {len(prod_prompts)} prompts passed STRICT validation")
    except Exception as e:
        print(f"❌ Production: Failed STRICT validation - {type(e).__name__}")

    print()


def main():
    """Run all demonstrations."""
    print("TextPrompts Metadata Modes Demo")
    print("===============================")
    print("Learn when and how to use IGNORE, ALLOW, and STRICT modes\n")

    # Create test files
    test_dir = create_test_files()
    print(f"Created test files in: {test_dir}\n")

    try:
        demonstrate_ignore_mode(test_dir)
        demonstrate_allow_mode(test_dir)
        demonstrate_strict_mode(test_dir)
        demonstrate_per_prompt_override(test_dir)
        demonstrate_use_cases(test_dir)

        print("🎉 All metadata mode demonstrations completed!")
        print()
        print("💡 Quick Reference:")
        print("   textprompts.set_metadata('ignore')  # Simple file loading (default)")
        print("   textprompts.set_metadata('allow')   # Flexible metadata loading")
        print("   textprompts.set_metadata('strict')  # Production-safe validation")
        print("   load_prompt('file.txt', meta='...')  # Per-prompt override")

    finally:
        # Cleanup
        shutil.rmtree(test_dir)
        print(f"\nCleaned up: {test_dir}")


if __name__ == "__main__":
    main()
