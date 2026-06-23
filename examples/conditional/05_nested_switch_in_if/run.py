"""SPEC §8.5: Nested blocks with indentation. Requires textprompts>=2.0."""

from pathlib import Path

from textprompts import load_prompt

prompt = load_prompt(Path(__file__).parent / "prompt.txt")

# State A: authenticated premium user with unread messages. The inner
# {if has_unread} block renders.
print(
    prompt.format(
        user_name="Jan",
        unread_count="3",
        flags={
            "is_authenticated": True,
            "tier": "premium",
            "has_unread": True,
        },
    )
)
print("---")
# State B: not authenticated. The {else} branch renders; the switch and
# inner if are skipped entirely.
print(
    prompt.format(
        user_name="Jan",
        unread_count="3",
        flags={
            "is_authenticated": False,
            "tier": "free",
            "has_unread": False,
        },
    )
)
