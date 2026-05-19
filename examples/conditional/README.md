# Conditional syntax v2 — worked examples

Reference content for the v2 conditional/switch syntax. Each subdirectory holds
a `prompt.txt` copied byte-for-byte from
[`docs/specs/SPEC_conditional_syntax_v2.md`](../../docs/specs/SPEC_conditional_syntax_v2.md)
§8, plus a `run.py` that demonstrates at least two flag combinations.

**Status:** v2 only. The engine is not yet implemented in Python; these files
are reference content until PHASE-3..6 of the v2 rollout land. They double as
the canonical fixtures for the Python port's conformance run.

For authoring guidance see
[`../../docs/writing-prompts-with-textprompts/SKILL.md`](../../docs/writing-prompts-with-textprompts/SKILL.md).

## Index

| # | Directory | SPEC | Demonstrates |
|---|-----------|------|--------------|
| 1 | [`01_minimal_implicit/`](01_minimal_implicit/) | [§8.1](../../docs/specs/SPEC_conditional_syntax_v2.md#81-minimal--no-frontmatter-implicit-mode) | Minimal prompt with no frontmatter (implicit mode); single `{if}` block. |
| 2 | [`02_full_frontmatter/`](02_full_frontmatter/) | [§8.2](../../docs/specs/SPEC_conditional_syntax_v2.md#82-full-frontmatter-with-custom-metadata) | Full TOML frontmatter with `[flags.*]` and `[variables.*]` tables; `{switch}` plus `{if}`. |
| 3 | [`03_inline_insertion/`](03_inline_insertion/) | [§8.3](../../docs/specs/SPEC_conditional_syntax_v2.md#83-inline-form) | Inline `{if}...{end}` and `{if}...{else}...{end}` on the same line. |
| 4 | [`04_inline_embedded_var/`](04_inline_embedded_var/) | [§8.4](../../docs/specs/SPEC_conditional_syntax_v2.md#84-inline-with-embedded-variable-variable-required-regardless) | Inline insertion containing a `{variable}` — variable required regardless of flag state. |
| 5 | [`05_nested_switch_in_if/`](05_nested_switch_in_if/) | [§8.5](../../docs/specs/SPEC_conditional_syntax_v2.md#85-nested-blocks-with-indentation) | Nested `{switch}` inside `{if}`, with indented keyword lines and a nested `{if}` inside a `{case}`. |
| 6 | [`06_strict_mode/`](06_strict_mode/) | [§8.6](../../docs/specs/SPEC_conditional_syntax_v2.md#86-strict-mode-file) | Loads cleanly under `metadata="strict"`: standard metadata present, every referenced flag described. |

## Running

Once the v2 engine ships in Python (PHASE-3..6):

```bash
python examples/conditional/01_minimal_implicit/run.py
python examples/conditional/02_full_frontmatter/run.py
python examples/conditional/03_inline_insertion/run.py
python examples/conditional/04_inline_embedded_var/run.py
python examples/conditional/05_nested_switch_in_if/run.py
python examples/conditional/06_strict_mode/run.py
```

Each script prints output for at least two flag combinations, separated by a
`---` line.
