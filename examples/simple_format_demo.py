#!/usr/bin/env python3
"""
Simple demonstration of the core TextPrompts formatting feature.

This shows how PromptString prevents the common problem of missing variables
in prompt templates, making your AI applications more reliable.
"""

from textprompts import PromptString


def main():
    print("TextPrompts PromptString Demo")
    print("=" * 30)
    print()

    # The problem with regular strings
    print("❌ Problem with regular strings:")
    regular_template = "Hello {name}, your order #{order_id} is {status}"

    try:
        # This fails with a cryptic KeyError
        result = regular_template.format(name="Alice", status="shipped")
        print(f"   Regular string result: '{result}'")
        print("   ^ Notice the unfilled {order_id} placeholder!")
    except KeyError as e:
        print(f"   KeyError: {e}")
        print("   ^ Cryptic error message!")

    print()

    # The solution with PromptString
    print("✅ Solution with PromptString:")
    safe_template = PromptString("Hello {name}, your order #{order_id} is {status}")

    try:
        # This fails fast with a clear error message
        result = safe_template.format(name="Alice", status="shipped")
        print(f"   PromptString result: '{result}'")
    except ValueError as e:
        print(f"   ValueError: {e}")
        print("   ^ Clear error message about missing variables!")

    print()

    # Partial formatting with skip_validation
    print("✅ Partial formatting (skip_validation=True):")
    partial_result = safe_template.format(name="Alice", skip_validation=True)
    print(f"   Partial result: '{partial_result}'")
    print("   ^ Only {name} was replaced, others remain as placeholders!")

    print()

    # Correct usage
    print("✅ Correct usage (all placeholders provided):")
    try:
        result = safe_template.format(name="Alice", order_id="12345", status="shipped")
        print(f"   Correct result: '{result}'")
    except ValueError as e:
        print(f"   Error: {e}")

    print()

    # PromptString works like a regular string otherwise
    print("✅ PromptString is still a string:")
    print(f"   Length: {len(safe_template)}")
    print(f"   Upper: {safe_template.upper()}")
    print(f"   Contains 'order': {'order' in safe_template}")
    print(f"   Type: {type(safe_template)}")
    print(f"   Is string: {isinstance(safe_template, str)}")
    print(f"   Placeholders: {safe_template.placeholders}")

    print()
    print(
        "Use TextPrompts to load prompts from files and get PromptString automatically!"
    )


if __name__ == "__main__":
    main()
