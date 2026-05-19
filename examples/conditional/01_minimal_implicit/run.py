"""SPEC §8.1: Minimal -- no frontmatter (implicit mode). Requires textprompts>=2.0.
"""

from pathlib import Path

from textprompts import load_prompt

prompt = load_prompt(Path(__file__).parent / "prompt.txt")

# State A: include_examples = true. `examples` is rendered.
print(
    prompt.format(
        role="Julia expert",
        examples="1. macros\n2. multiple dispatch",
        flags={"include_examples": True},
    )
)
print("---")
# State B: include_examples = false. `examples` is still required because
# `{examples}` appears in the body (SPEC §5.2), but the block is dropped.
print(
    prompt.format(
        role="Julia expert",
        examples="1. macros\n2. multiple dispatch",
        flags={"include_examples": False},
    )
)
