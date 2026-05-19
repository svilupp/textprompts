"""SPEC §8.4: Inline with embedded variable (variable required regardless). Requires textprompts>=2.0.
"""

from pathlib import Path

from textprompts import load_prompt

prompt = load_prompt(Path(__file__).parent / "prompt.txt")

# State A: is_admin = true. `admin_name` is rendered into the inline insertion.
print(
    prompt.format(
        role="Julia expert",
        admin_name="Ada",
        flags={"is_admin": True},
    )
)
print("---")
# State B: is_admin = false. `admin_name` must still be passed because
# `{admin_name}` appears in the body (SPEC §8.4).
print(
    prompt.format(
        role="Julia expert",
        admin_name="Ada",
        flags={"is_admin": False},
    )
)
