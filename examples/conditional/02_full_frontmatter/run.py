"""SPEC §8.2: Full frontmatter with custom metadata. Requires textprompts>=2.0."""

from pathlib import Path

from textprompts import load_prompt

prompt = load_prompt(Path(__file__).parent / "prompt.txt")

# State A: premium tier with prior conversation history.
print(
    prompt.format(
        user_name="Jan",
        last_question="How do I upgrade?",
        flags={"tier": "premium", "has_history": True},
    )
)
print("---")
# State B: free tier, no history. `last_question` is still required because
# `{last_question}` appears in the body.
print(
    prompt.format(
        user_name="Jan",
        last_question="How do I upgrade?",
        flags={"tier": "free", "has_history": False},
    )
)
