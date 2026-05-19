#!/usr/bin/env python3
"""Simple demonstration of the core TextPrompts formatting feature.

PromptString validates ``{name}`` placeholders at format time so missing
variables fail loudly instead of silently rendering empty strings or raising
cryptic KeyError messages.
"""

from textprompts import FormatError, PromptString


def main():
    print("TextPrompts PromptString Demo")
    print("=" * 30)
    print()

    print("Problem with regular strings:")
    regular_template = "Hello {name}, your order #{order_id} is {status}"

    try:
        result = regular_template.format(name="Alice", status="shipped")
        print(f"   Regular string result: '{result}'")
    except KeyError as e:
        print(f"   KeyError: {e}")
        print("   No prompt-specific context about what went wrong.")

    print()

    print("Solution with PromptString:")
    safe_template = PromptString("Hello {name}, your order #{order_id} is {status}")

    try:
        result = safe_template.format(name="Alice", status="shipped")
        print(f"   PromptString result: '{result}'")
    except FormatError as e:
        print(f"   FormatError: {e}")
        print("   Clear error message about missing variables!")

    print()

    print("Correct usage (all placeholders provided):")
    try:
        result = safe_template.format(name="Alice", order_id="12345", status="shipped")
        print(f"   Correct result: '{result}'")
    except FormatError as e:
        print(f"   Error: {e}")

    print()

    print("PromptString is still a string:")
    print(f"   Length: {len(safe_template)}")
    print(f"   Upper: {safe_template.upper()}")
    print(f"   Contains 'order': {'order' in safe_template}")
    print(f"   Type: {type(safe_template).__name__}")
    print(f"   Is string: {isinstance(safe_template, str)}")

    print()
    print(
        "Use TextPrompts to load prompts from files and get PromptString automatically!"
    )


if __name__ == "__main__":
    main()
