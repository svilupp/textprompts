"""SPEC §8.3: Inline form. Requires textprompts>=2.0.
"""

from pathlib import Path

from textprompts import load_prompt

prompt = load_prompt(Path(__file__).parent / "prompt.txt")

# State A: admin on the premium plan.
print(
    prompt.format(
        role="Julia expert",
        flags={"is_admin": True, "premium_tier": True},
    )
)
print("---")
# State B: non-admin on the free plan. Punctuation outside the inline tags
# is preserved (SPEC §8.3).
print(
    prompt.format(
        role="Julia expert",
        flags={"is_admin": False, "premium_tier": False},
    )
)
