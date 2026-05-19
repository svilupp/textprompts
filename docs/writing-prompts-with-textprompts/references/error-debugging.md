# Error debugging reference

Every exception textprompts raises, what causes it, and how to fix it. Errors are grouped by **phase**: the point in the prompt lifecycle where they surface.

Phases, in order:

1. **load** — opening the file and parsing frontmatter.
2. **parse** — tokenizing the body and building the conditional AST.
3. **parse-finalize** — semantic checks across parsed body + declared frontmatter.
4. **format** — calling `prompt.format(...)` with runtime values.

See [SPEC_conditional_syntax_v2.md §7](../../specs/SPEC_conditional_syntax_v2.md) for the authoritative error taxonomy.

> **Note on availability.** `FrontmatterError`, `ParseError`, `SemanticError`, and `FormatError` ship with **textprompts v2.0**. Before v2.0, the closest pre-existing errors are `InvalidMetadataError` (for frontmatter) and `MalformedHeaderError` (for malformed `---` markers). All four new exceptions extend `TextPromptsError`, the common base in `src/textprompts/errors.py`.

---

## Error table

| Exception | Phase | Typical cause | Example trigger | Fix |
|-----------|-------|---------------|-----------------|-----|
| `FileMissingError` | load | Path does not exist on disk. | `load_prompt("does_not_exist.txt")` | Check the path; resolve against the right working directory. |
| `MissingMetadataError` | load | Strict mode and the file has no frontmatter, or an empty frontmatter block. (SPEC §4.6) | `load_prompt("plain.txt", metadata="strict")` on a body-only file | Add a `---` frontmatter block with non-empty `title`, `description`, and `version`, or switch to `metadata="allow"`. |
| `InvalidMetadataError` | load | TOML or YAML parser rejected the frontmatter bytes. Under `metadata="allow"` this fires only if the format was unambiguous; under explicit format selection any parse failure raises. (SPEC §7.1, §4.1) | Unbalanced `[` in TOML: `[flags.tier` with no closing bracket | Fix the syntax, or use `metadata="ignore"` to treat the entire file as body. |
| `MalformedHeaderError` | load | The `---` delimiter pair is malformed — e.g. opening `---` with no closing `---` before EOF, or `+++` used in place of `---`. | File starts with `---` but never closes | Close the frontmatter block with a matching `---` line. Use `---` exclusively; `+++` is intentionally rejected. |
| `FrontmatterError` (v2.0) | load | Frontmatter parsed but violates the flag/variable schema: reserved keyword as flag name; `values` set on a boolean flag; duplicate value in an enum's `values` list; or, in strict mode, a referenced flag missing `description`. (SPEC §4.3.2, §7.1) | `[flags.if]` (reserved keyword) or `[flags.tier]` with `type = "boolean"` and `values = [...]` | Rename the flag to a non-reserved identifier; drop `values` from boolean flags; dedupe enum values; add a non-empty `description` to every referenced flag under strict mode. |
| `ParseError` (v2.0) | parse | Lexer or parser rejected a tag: mismatched braces, `{if}` with no flag name, `{end}` outside any block, mixed inline/block form for one construct, positional `{0}`, empty `{}`, whitespace inside braces like `{ if flag }`. (SPEC §1.1, §2.3, §7.2) | `{ if active }` (whitespace) or `{0}` (positional) | Remove whitespace inside braces; use named identifiers only; close every `{if}` / `{switch}` with `{end}`. |
| `SemanticError` (v2.0) | parse-finalize | Body uses constructs that disagree with frontmatter or each other: boolean flag used in `{switch}`, enum flag used in `{if}`, `{switch}` without exhaustive cases and no `{else}`, or the same identifier declared as both flag and variable. (SPEC §4.7, §5.1, §5.3, §7.3) | `[flags.is_admin]` declared `type = "boolean"` but body has `{switch is_admin}` | Pick one shape per flag (boolean for `{if}`, enum for `{switch}`); add the missing `{case ...}` branches or an `{else}`; never share an identifier across the flag and variable namespaces. |
| `FormatError` (v2.0) | format | `prompt.format(...)` was called but inputs are wrong: a required body variable was not passed; a required flag was not passed; `flags=` was omitted entirely while the prompt uses flags; a flag value is not in the declared enum; a flag value is the wrong type. Extras are **silently ignored** and never raise (SPEC §5.5, §5.6, §5.7). | `prompt.format(role="bot")` when the body also references `{tone}` | Pass every body-referenced variable and flag explicitly. If a value is genuinely optional, pass an empty string or `None`/`null` at the call site so the decision is visible. |

---

## Repro snippets

### `FileMissingError`

```python
from textprompts import load_prompt
load_prompt("/tmp/no-such-file.txt")
# FileMissingError: File not found: /tmp/no-such-file.txt
```

### `MissingMetadataError`

`plain.txt`:

```
You are a {role}.
```

```python
load_prompt("plain.txt", metadata="strict")
# MissingMetadataError: strict mode requires frontmatter
```

### `InvalidMetadataError`

`bad.txt`:

```
---
[flags.tier
type = "enum"
---
Body.
```

```python
load_prompt("bad.txt")
# InvalidMetadataError: TOML parse error: ...
```

### `MalformedHeaderError`

`unclosed.txt`:

```
---
title = "x"

You are a {role}.
```

(no closing `---`)

### `FrontmatterError` (v2.0)

`reserved.txt`:

```
---
[flags.if]
type = "boolean"
---
Body.
```

```python
load_prompt("reserved.txt")
# FrontmatterError: `if` is a reserved keyword and cannot be a flag name
```

`bool_with_values.txt`:

```
---
[flags.is_admin]
type = "boolean"
values = ["yes", "no"]
---
Body.
```

```python
load_prompt("bool_with_values.txt")
# FrontmatterError: boolean flag `is_admin` must not declare `values`
```

### `ParseError` (v2.0)

```
{ if active }
hello
{end}
```

```python
# ParseError: whitespace not allowed inside braces at line 1
```

```
You are user {0}.
```

```python
# ParseError: positional placeholder {0} is not supported (use a named identifier)
```

```
{if active}
hello
```

```python
# ParseError: unclosed {if active} at line 1 (missing {end})
```

### `SemanticError` (v2.0)

`bool_in_switch.txt`:

```
---
[flags.is_admin]
type = "boolean"
---
{switch is_admin}
{case true}admin
{else}user
{end}
```

```python
load_prompt("bool_in_switch.txt")
# SemanticError: flag `is_admin` is boolean but used in {switch}; use {if}
```

`flag_and_var.txt`:

```
---
[flags.tone]
type = "boolean"
---
{if tone}
Tone is {tone}.
{end}
```

```python
load_prompt("flag_and_var.txt")
# SemanticError: `tone` declared as flag but body uses it as variable {tone}
```

### `FormatError` (v2.0)

`needs_inputs.txt`:

```
You are a {role} with tone {tone}.
{if verbose}
Be thorough.
{end}
```

```python
p = load_prompt("needs_inputs.txt")

p.format(role="bot")
# FormatError: variable `tone` required but not provided

p.format(role="bot", tone="dry")
# FormatError: prompt requires `flags` parameter but none was passed; expected flags: [verbose]

p.format(role="bot", tone="dry", flags={"verbose": "yes"})
# FormatError: flag `verbose` got string, expected boolean
```

Extras are not errors:

```python
p.format(role="bot", tone="dry", unused_extra=42, flags={"verbose": True})
# OK — `unused_extra` is silently ignored (SPEC §5.7)
```

---

## How to read a textprompts stack trace

Every textprompts exception inherits from `TextPromptsError` (`src/textprompts/errors.py`). When debugging, walk the trace from the bottom up and look for these signals:

1. **Which phase is named?** The exception class itself encodes the phase — `MissingMetadataError` / `InvalidMetadataError` / `MalformedHeaderError` / `FrontmatterError` are load-phase, `ParseError` is parse, `SemanticError` is parse-finalize, `FormatError` is format. If you see a `FormatError` you can stop reading at `prompt.format(...)` in your call site — the file already parsed cleanly.
2. **Which file?** Load- and parse-phase errors include the source path. If the path is wrong, the error is `FileMissingError` and nothing else has run yet.
3. **Which identifier?** Schema, syntax, semantic, and format errors all name the offending flag, variable, tag, or field in the message. Search the prompt body for that exact identifier first.
4. **Which line/column?** Where available (lexer- and parser-emitted errors), the message includes a 1-based line and column. These point at the *tag*, not the surrounding prose.
5. **Did the prompt parse but format fail?** Then the file is structurally valid and the problem is in the caller's arguments. Compare `prompt.flags` / `prompt.variables` against the keys you passed.

If a stack trace surfaces an exception that is *not* a `TextPromptsError` subclass, it is not from textprompts — most often it is a `FileNotFoundError` from a wrapper that bypassed `load_prompt`, or a `TomlDecodeError` / `yaml.YAMLError` leaking through because the caller invoked the underlying parser directly instead of `load_prompt`. Route file IO through `load_prompt` so failures arrive as typed `TextPromptsError` subclasses.

---

## Stable error codes (v2.0)

Every v2 error carries a string `code`. Match on this in tests; message
wording may change across patch releases. Codes are cross-port stable.

| Code | Class | Typical cause | Fix |
|------|-------|---------------|-----|
| `E_EMPTY_PROMPT` | `ParseError` | Prompt file is empty (zero bytes or whitespace-only after preprocessing). | Write a non-empty body. (SPEC §2.5) |
| `E_BAD_TAG` | `ParseError` | Malformed tag: `{ if flag }` (inside-brace whitespace), `{IF flag}` (uppercase), `{if !}` (bare bang), `{if}` (bare keyword). | Use exactly the documented tag forms (SPEC §2.2, §2.3). |
| `E_INVALID_IDENTIFIER` | `ParseError` / `FrontmatterError` | Identifier with dash, leading digit, or non-ASCII characters. | Rename to snake_case ASCII. |
| `E_RESERVED_IDENTIFIER` | `ParseError` / `FrontmatterError` | Identifier is a reserved keyword (`if`, `else`, `end`, `switch`, `case`, `flags`). | Rename. |
| `E_POSITIONAL_PLACEHOLDER` | `ParseError` | `{0}`, `{1}`, ... — removed in v2. | Use a named variable. |
| `E_EMPTY_PLACEHOLDER` | `ParseError` | Bare `{}`. | Use a named variable. |
| `E_UNCLOSED_IF` | `ParseError` | `{if}` with no matching `{end}`. | Add `{end}`. |
| `E_UNCLOSED_SWITCH` | `ParseError` | `{switch}` with no matching `{end}`. | Add `{end}`. |
| `E_EXTRA_END` | `ParseError` | `{end}` outside any open block. | Remove or rebalance. |
| `E_SWITCH_NO_CASES` | `ParseError` | `{switch}` with zero `{case}` branches. | Add at least one `{case X}`. |
| `E_DUPLICATE_CASE` | `ParseError` | Duplicate `{case X}` within one switch. | Remove one or dedupe. |
| `E_TEXT_BEFORE_CASE` | `ParseError` | Text or variables between `{switch}` and the first `{case}`. | Move the text inside a case or remove. |
| `E_ELSE_BEFORE_CASE` | `ParseError` | `{else}` before any `{case}` in a switch. | Move `{else}` after all cases. |
| `E_MIXED_FORM` | `ParseError` | One construct mixes inline and block. | Pick one form for the whole construct. |
| `E_BAD_SCHEMA_SHAPE` | `FrontmatterError` | `flags` or `variables` is not an object in frontmatter. | Use `[flags.X]` / `[variables.X]` (TOML) or nested map (YAML). |
| `E_INVALID_FLAG_TYPE` | `FrontmatterError` | `type` is not `"boolean"` or `"enum"`. | Set `type = "boolean"` or `type = "enum"`. |
| `E_ENUM_MISSING_VALUES` | `FrontmatterError` | Enum flag has no `values` array. | Add `values = [...]`. |
| `E_ENUM_EMPTY_VALUES` | `FrontmatterError` | Enum `values` is empty. | Add at least one value. |
| `E_ENUM_DUPLICATE_VALUES` | `FrontmatterError` | Enum `values` has duplicates. | Dedupe. |
| `E_BOOLEAN_WITH_VALUES` | `FrontmatterError` | Boolean flag has a `values` field. | Remove `values`, or switch to `type = "enum"`. |
| `E_FLAG_VARIABLE_COLLISION` | `FrontmatterError` | Same name declared as both a flag and a variable. | Pick one namespace per name. |
| `E_STRICT_MISSING_DESCRIPTION` | `FrontmatterError` | Strict mode: body-referenced flag has no `description`. | Add a non-empty `description`. |
| `E_UNDECLARED_FLAG_STRICT` | `SemanticError` | Strict mode: body uses a flag with no declaration. | Add `[flags.X]`. |
| `E_BOOLEAN_FLAG_IN_SWITCH` | `SemanticError` | Boolean-declared flag used in `{switch}`. | Change the flag to enum, or use `{if}`. |
| `E_ENUM_FLAG_IN_IF` | `SemanticError` | Enum-declared flag used in `{if}`. | Use `{switch}`, or change the flag to boolean. |
| `E_CASE_VALUE_NOT_IN_ENUM` | `SemanticError` | `{case X}` value not in the declared enum `values`. | Add `X` to `values`, or remove the case. |
| `E_NON_EXHAUSTIVE_SWITCH` | `SemanticError` | `{switch}` doesn't cover every declared enum value and has no `{else}`. | Add the missing `{case}` or add `{else}`. |
| `E_FLAG_VARIABLE_BODY_COLLISION` | `SemanticError` | Same name used as both flag and variable in body. | Pick one usage per name. |
| `E_MISSING_FLAGS_OBJECT` | `FormatError` | Prompt uses flags; caller passed no `flags` key at all. | Pass `flags: { ... }`. |
| `E_BAD_FLAGS_TYPE` | `FormatError` | `flags` was not a plain object (string, array, number). | Pass a plain object. |
| `E_MISSING_FLAG` | `FormatError` | A specific flag referenced by the body is missing from `inputs.flags`. | Pass the flag. The message names it. |
| `E_MISSING_VARIABLE` | `FormatError` | A body-referenced variable is missing (including in inactive branches, SPEC §5.2). | Pass the variable. Empty string is OK. |
| `E_WRONG_FLAG_TYPE` | `FormatError` | Boolean flag got a non-boolean; enum flag got a non-string. No coercion. | Pass the correct type. |
| `E_INVALID_FLAG_VALUE` | `FormatError` | Enum flag got a string not in `values`. | Pass a declared value, or add `{else}` to the switch. |
| `E_RESERVED_KEY` | `FormatError` | Caller used a reserved keyword as an input key. | Rename the input. |

Codes are stable across releases and across language ports; the SPEC's
conformance corpus (`docs/specs/fixtures/`) matches on code + category, not
on message wording.
