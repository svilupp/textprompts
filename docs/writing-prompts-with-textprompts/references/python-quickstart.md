# Python quickstart

> Target: textprompts v2.0 (Python). Engine ships once the TypeScript reference and `docs/specs/fixtures/` conformance corpus land. The signatures below are the v2 surface defined in SPEC `docs/specs/SPEC_conditional_syntax_v2.md` §6.2, §6.5, and §6.6; current PyPI releases (1.x) still expose the v1 subset.

A runnable walkthrough of the Python API. Every snippet is pasteable into a REPL once v2 lands. For the full normative spec see `docs/specs/SPEC_conditional_syntax_v2.md`; for the body syntax see `conditional-syntax-cheatsheet.md`.

## Install

```bash
pip install "textprompts>=2.0"
```

The v2 release is gated on the TypeScript reference engine and the cross-language conformance corpus. Until then `textprompts>=2.0` is **not yet on PyPI**. Pin against `1.x` for production today and follow the spec for v2 authoring.

## Loading a prompt — `load_prompt`

```python
from textprompts import load_prompt

prompt = load_prompt(
    "./prompts/support.txt",
    metadata="allow",              # "allow" (default) | "strict" | "ignore"
    frontmatter_format="auto",     # "auto" (default) | "toml" | "yaml"
)
```

**Signature** (SPEC §6.2):

```python
def load_prompt(
    path: str | Path,
    *,
    metadata: Literal["allow", "strict", "ignore"] = "allow",
    frontmatter_format: Literal["auto", "toml", "yaml"] = "auto",
) -> Prompt: ...
```

**Options:**

- `path` — Filesystem path to a `.txt` (or any text) prompt file.
- `metadata` — Metadata mode (SPEC §4.6). See the three worked examples below.
- `frontmatter_format` — Frontmatter parser selection (SPEC §4.1). `"auto"` tries TOML first, then YAML. Set explicitly to fail fast on the other format.

## Rendering — `Prompt.format`

`format` is the canonical render entry point (SPEC §6.2). It takes top-level variables as keyword arguments, and an optional dedicated `flags` mapping.

```python
def format(self, /, **variables: Any, flags: Mapping[str, bool | str] | None = None) -> str: ...
```

`flags` is a reserved keyword (SPEC §5.1) — you cannot have a variable named `flags`.

### No flags

```python
from textprompts import load_prompt

prompt = load_prompt("./prompts/greeting.txt")
text = prompt.format(role="Julia expert", topic="macros")
print(text)
```

### Boolean flag

Prompt body:

```
You are a {role}.
{if include_examples}
Here are some examples:
{examples}
{end}
```

Render (per SPEC §5.2, `examples` is required even when `include_examples=False`):

```python
prompt = load_prompt("./prompts/with_examples.txt")
text = prompt.format(
    role="Julia expert",
    examples="1. macros\n2. multiple dispatch",
    flags={"include_examples": True},
)
```

### Enum flag

Prompt body:

```
{switch tier}
{case free}
Standard support.
{case premium}
Priority support.
{case enterprise}
Dedicated account manager.
{end}
```

Render:

```python
prompt = load_prompt("./prompts/tier.txt")
text = prompt.format(flags={"tier": "premium"})
```

Type validation is strict at format time — SPEC §5.5. Passing `flags={"tier": True}` against an enum flag, or `flags={"tier": "trial"}` (not in `values`), raises a format-time error.

## In-memory prompts — `Prompt.from_path` and `Prompt.from_string`

`Prompt.from_path` mirrors `load_prompt` and is useful when you already have a `Prompt` reference in scope:

```python
from textprompts import Prompt

prompt = Prompt.from_path("./prompts/support.txt", metadata="strict")
```

`Prompt.from_string` (new in v2) parses a prompt directly from a string. This is the recommended path for tests, notebooks, and anywhere you do not want a file on disk.

```python
from textprompts import Prompt

source = """---
title = "Inline demo"
version = "1.0"
description = "Demonstration of from_string"

[flags.verbose]
description = "Whether to add a trailing note"
---
Hello, {name}.
{if verbose}
(extra context attached)
{end}
"""

prompt = Prompt.from_string(source, metadata="allow")
print(prompt.format(name="Jan", flags={"verbose": True}))
```

`from_string` accepts the same `metadata` and `frontmatter_format` keyword options as `load_prompt`.

## Metadata access — `prompt.meta`

Every loaded prompt exposes its full frontmatter on `prompt.meta` (SPEC §6.5). Standard fields are attributes; custom fields land in `extras` dicts.

Example file `./prompts/support.txt` (SPEC §8.2):

```
---
title = "Customer support agent"
version = "2.1"
description = "Customer support prompt with tier and conversation-history variants"
owner = "@support-eng"
last_reviewed = "2026-04-30"

[flags.tier]
type = "enum"
values = ["free", "premium", "enterprise"]
description = "User subscription tier"
owner = "@product"
expires = "2026-12-01"

[flags.has_history]
description = "Whether prior conversation context is available"

[variables.user_name]
description = "The user's display name"

[variables.last_question]
description = "Previous question, if has_history is true"
review_cadence = "quarterly"
---
You are a helpful support agent assisting {user_name}.

{switch tier}
{case free}
Standard support.
{case premium}
Priority support.
{case enterprise}
Dedicated account manager.
{end}

{if has_history}
The user previously asked: {last_question}
{end}
```

Reading everything:

```python
from textprompts import load_prompt

prompt = load_prompt("./prompts/support.txt")

# Standard fields (SPEC §4.2)
prompt.meta.title          # "Customer support agent"
prompt.meta.version        # "2.1"
prompt.meta.description    # "Customer support prompt with tier and conversation-history variants"

# Top-level custom fields (SPEC §5.8)
prompt.meta.extras["owner"]          # "@support-eng"
prompt.meta.extras["last_reviewed"]  # "2026-04-30"

# Flag declarations (SPEC §4.3, §6.5)
prompt.meta.flags["tier"].kind             # "enum"
prompt.meta.flags["tier"].values           # ["free", "premium", "enterprise"]
prompt.meta.flags["tier"].description      # "User subscription tier"
prompt.meta.flags["tier"].extras["owner"]  # "@product"
prompt.meta.flags["has_history"].kind      # "boolean"
prompt.meta.flags["has_history"].extras    # {}

# Variable declarations (SPEC §4.4, §6.5)
prompt.meta.variables["user_name"].description       # "The user's display name"
prompt.meta.variables["last_question"].description   # "Previous question, if has_history is true"
prompt.meta.variables["last_question"].extras        # {"review_cadence": "quarterly"}
```

Values preserve their TOML/YAML types: strings stay strings, arrays stay lists, nested tables stay dicts (SPEC §5.8). Metadata is read-only data — mutating it does not affect rendering.

## Metadata modes — three worked examples

The `metadata` option controls how strictly frontmatter is required (SPEC §4.6).

### `metadata="allow"` (default)

Frontmatter is optional. Body-referenced flags and variables may be declared or inferred.

```python
from textprompts import Prompt

prompt = Prompt.from_string(
    "You are a {role}.\n{if verbose}Be detailed.{end}\n",
    metadata="allow",
)
text = prompt.format(role="reviewer", flags={"verbose": False})
```

No frontmatter present, no error. `prompt.meta.title` is `None`, `prompt.meta.extras` is `{}`.

### `metadata="strict"`

Frontmatter is required; `title`, `description`, and `version` must all be non-empty; every referenced flag must be declared and carry a non-empty `description` (SPEC §4.6, §7.1).

```python
from textprompts import load_prompt

prompt = load_prompt("./prompts/support.txt", metadata="strict")
```

Loading the SPEC §8.6 file under strict mode succeeds. Stripping `description` from `[flags.tier]` or removing the `version` field raises an `InvalidMetadataError` at load time.

### `metadata="ignore"`

The file is **not** scanned for frontmatter; the entire byte stream is the prompt body. Title defaults to the filename stem (SPEC §4.6).

```python
from textprompts import load_prompt

prompt = load_prompt("./prompts/raw_legacy.txt", metadata="ignore")
prompt.meta.title              # "raw_legacy"
prompt.meta.extras             # {}
prompt.meta.flags              # {}  (flags still inferred from body usage)
```

Use this for files that intentionally do not use textprompts metadata, or to bypass frontmatter parsing entirely.

## Round-tripping — `save_prompt`

`save_prompt(path, prompt)` writes a `Prompt` back to disk and preserves all v2 metadata (SPEC §6.6): standard fields, top-level `extras`, every flag declaration (including enum `values` and per-flag extras), and every variable declaration with its extras.

```python
from textprompts import load_prompt, save_prompt

prompt = load_prompt("./prompts/support.txt")

# Edit a custom field on the in-memory object.
prompt.meta.extras["last_reviewed"] = "2026-05-19"
prompt.meta.flags["tier"].extras["owner"] = "@product-eng"

save_prompt("./prompts/support.txt", prompt)
```

`save_prompt` never silently drops declared flags or variables. If a target frontmatter format cannot represent a metadata value safely, it raises rather than write a lossy file (SPEC §6.6).

To force a particular emit format:

```python
save_prompt("./prompts/support.txt", prompt, frontmatter_format="yaml")
```

## Error handling

All textprompts errors derive from `TextPromptsError` and carry a category plus a human-readable message naming the relevant flag, variable, tag, or field (SPEC §7).

```python
from textprompts import load_prompt
from textprompts import (
    TextPromptsError,
    FileMissingError,
    InvalidMetadataError,
    MalformedHeaderError,
    MissingMetadataError,
)

try:
    prompt = load_prompt("./prompts/support.txt", metadata="strict")
    text = prompt.format(role="reviewer", flags={"tier": "premium"})
except FileMissingError as exc:
    ...   # path did not resolve to a file
except (InvalidMetadataError, MalformedHeaderError, MissingMetadataError) as exc:
    ...   # frontmatter load errors — SPEC §7.1
except TextPromptsError as exc:
    ...   # parse, semantic, and format-time errors — SPEC §7.2–§7.4
```

For the full error-class to cause-to-fix table see `error-debugging.md`.

## Runnable examples

See `examples/conditional/` for the six end-to-end scripts that mirror SPEC §8.1–§8.6 (minimal implicit, full frontmatter, inline, inline-with-variable, nested, strict-mode). Each subdirectory has a `prompt.txt` and a `run.py` that exercises load + format and prints the rendered output.

## See also

- `conditional-syntax-cheatsheet.md` — body syntax lookup table.
- `error-debugging.md` — error class to cause to fix.
- `anti-patterns.md` — common mistakes and what to do instead.
- `migration-from-v1.md` — upgrade notes from textprompts 1.x.
- `docs/specs/SPEC_conditional_syntax_v2.md` — full normative spec.
