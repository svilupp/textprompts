"""SPEC §8.6: Strict-mode file. Requires textprompts>=2.0.

v2 only. Engine not yet implemented in Python; reference content until PHASE-3..6 land.

This file loads cleanly under both `metadata="allow"` and `metadata="strict"`:
standard metadata fields are present and every referenced flag has a description.
"""

from pathlib import Path

from textprompts import load_prompt

prompt = load_prompt(Path(__file__).parent / "prompt.txt", metadata="strict")

# State A: free tier with onboarding tips enabled.
print(
    prompt.format(
        flags={"tier": "free", "show_tips": True},
    )
)
print("---")
# State B: premium tier. The {switch} selects the premium case; show_tips
# is ignored for this branch but must still be a valid value.
print(
    prompt.format(
        flags={"tier": "premium", "show_tips": False},
    )
)
