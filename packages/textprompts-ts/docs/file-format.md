# File format

This is the v2 file format. The full cross-language source of truth is
[`docs/specs/SPEC_conditional_syntax_v2.md`](../../../docs/specs/SPEC_conditional_syntax_v2.md);
this page condenses the parts a TypeScript user needs.

## v2 breaking changes

- Positional placeholders (`{0}`, `{1}`, …) are gone. Use named placeholders.
- Empty placeholders (`{}`) are gone.
- New: `{if flag}`, `{else}`, `{end}`, `{switch flag}`, `{case value}`, `{if !flag}`.
- New: typed flags namespace declared in `[flags.*]` frontmatter.

Escapes use double braces: `{{` renders as a literal `{` and `}}` as a literal
`}`. Backslash has no special meaning.

See [Migrating from v1](../README.md#migrating-from-v1) for diff-style examples.

## File anatomy

```
---
<frontmatter — TOML by default, YAML if TOML parse fails>
---
<body — UTF-8 text with {var}, {if ...}, {switch ...} tags>
```

Both halves are optional. A file with no `---` block is treated as body-only
(implicit mode). A file with only `---\n---\n` is equivalent to no frontmatter.
One blank separator line after the closing `---` is consumed, so
`---\n...\n---\n\nBody` starts the body at `Body`. Additional blank lines are
preserved as body content.

The `+++` delimiter is **not** accepted. Frontmatter starts at the very first
byte of the file (after an optional UTF-8 BOM); leading whitespace before
the opening `---` is a parse error.

## Frontmatter

### Format detection

- Default: parse as TOML, fall back to YAML on failure.
- Override: pass `frontmatterFormat: "toml" | "yaml" | "auto"` to `loadPrompt`,
  `Prompt.fromString`, `loadSection`, `parseFile`, or `parseString`.

### Standard top-level fields

```toml
title = "Support agent"
version = "2.1"
description = "Customer support prompt"
author = "support-eng"
created = "2026-04-30"
```

Every other top-level field is preserved verbatim on `prompt.meta.extras` with
its original TOML/YAML type (strings, numbers, booleans, arrays, nested tables).

### Flag declarations — `[flags.*]`

Boolean flag (full form):

```toml
[flags.persona]
type = "boolean"
description = "Include the persona line"
```

Boolean flag (shorthand — `type` defaults to `"boolean"`):

```toml
[flags.persona]
description = "Include the persona line"
```

Enum flag:

```toml
[flags.tier]
type = "enum"
values = ["free", "premium", "enterprise"]
description = "User subscription tier"
```

YAML equivalent:

```yaml
flags:
  persona:
    description: Include the persona line
  tier:
    type: enum
    values: [free, premium, enterprise]
    description: User subscription tier
```

#### Recognized fields per flag

| Field | Required | Type | Notes |
|---|---|---|---|
| `type` | No | `"boolean"` or `"enum"` | Defaults to `"boolean"` |
| `values` | Only for `type = "enum"` | string array | Forbidden for booleans |
| `description` | Recommended; required for every declared flag in strict mode | string | |

Any other key (e.g. `owner`, `expires`, `jira_ticket`) is preserved on
`prompt.meta.flags[name].extras`.

#### Load-time errors (FrontmatterError)

- `E_INVALID_IDENTIFIER` — flag name or enum value is not `[a-zA-Z_][a-zA-Z0-9_]*`.
- `E_RESERVED_IDENTIFIER` — name is `if` / `else` / `end` / `switch` / `case` / `flags`.
- `E_INVALID_FLAG_TYPE` — `type` is not `"boolean"` or `"enum"`.
- `E_INVALID_FLAG_VALUES` — enum `values` missing / empty / duplicated / non-string,
  or `values` present on a boolean flag.
- `E_BAD_SCHEMA_SHAPE` — `flags` or a single flag table is not an object.
- `E_DUPLICATE_NAME` — the same name appears in both `[flags.*]` and `[variables.*]`.

### Variable declarations — `[variables.*]`

```toml
[variables.user_name]
description = "Display name shown to the model"

[variables.last_question]
description = "Previous question, if any"
```

Only `description` is recognized. Anything else lands in
`prompt.meta.variables[name].extras`. Variable declarations are documentation;
they are never required at format time, but every variable referenced anywhere
in the body **is** required (see §5.2 below).

## Body syntax

### Variables

```
Hello {customer_name}!
```

Identifier rule (same for variables, flags, and enum values):
`[a-zA-Z_][a-zA-Z0-9_]*` (ASCII, snake_case, no dashes). The reserved
keywords `if`, `else`, `end`, `switch`, `case`, and `flags` cannot be used.

Whitespace inside braces is a parse error. `{ name }` does not parse.

### Inline conditional

```
You are a {role}{if is_admin} (administrator){end}.
```

- The opener, body, and closer are all on the same line.
- Punctuation outside the tag (`.`) is preserved.
- `{if !is_admin}` negates the condition.
- Optional `{else}`:

  ```
  Plan: {if premium_tier}premium{else}free{end}.
  ```

### Block conditional

```
Hello
{if flag}
World
{end}
!
```

- Opener, `{else}`, `{case}`, and `{end}` must be **alone on their line**
  (only leading whitespace allowed).
- Each keyword line is removed in its entirety — leading whitespace included.
- Body line indentation is preserved exactly as authored.
- Inactive branches contribute zero bytes; no stray whitespace is left behind.

### Switch

Block form:

```
{switch tier}
{case free}
Politely mention upgrade options.
{case premium}
Greet warmly.
{case enterprise}
Connect to a dedicated account manager.
{end}
```

Inline form (allowed but discouraged):

```
Plan: {switch tier}{case free}free{case premium}premium{else}unknown{end}.
```

Rules:

- At least one `{case}` is required.
- No text or other tags between `{switch}` and the first `{case}`.
- Duplicate `{case X}` values fail to parse.
- `{else}` (optional) acts as a default and must come after all `{case}`s.
- Empty `{case X}` bodies are valid (render nothing).
- Case order is cosmetic — matching is by value.

### Exhaustiveness

When a switch references a declared `[flags.X]` enum:

- Either every declared value has a `{case}`, **or** the switch ends with
  `{else}`. Otherwise: load-time `SemanticError` (`E_NON_EXHAUSTIVE_SWITCH`).

In implicit mode (no declaration), the enum value set is inferred from the
cases present, so exhaustiveness is trivially satisfied.

### Escapes

| Source | Renders as |
|---|---|
| `{{` | `{` |
| `}}` | `}` |

So `{{name}}` renders as the literal text `{name}` (the doubled braces
collapse — this is NOT a placeholder reference). Backslash has no special
meaning and renders literally; `\n`, `\t`, `\\` are all two literal
characters. Use real newlines if you need newlines.

### Whitespace, BOM, line endings

- UTF-8 BOM at the start of the file is stripped.
- CRLF and CR are normalized to LF before parsing — a prompt authored on
  Windows renders identically to one authored on Unix.
- An empty (or whitespace-only) file is a load error in every metadata mode.
  In `metadata: "ignore"` mode a file containing only a `---...---` block is
  NOT empty — the block IS the body (SPEC §2.5, §4.6).

## Metadata modes

The loader's `metadata` option (SPEC §4.6):

- **`"allow"` (default)** — frontmatter optional; implicit declarations from
  body usage allowed.
- **`"strict"`** — frontmatter required; `title`, `description`, `version`
  required and non-empty; every flag referenced in the body must be declared,
  and every declared flag must have a non-empty `description`. Variable
  descriptions remain optional.
- **`"ignore"`** — no frontmatter parsing. The entire file is body. Title
  defaults to the filename stem. A malformed `---` block is not an error in
  this mode because there is no header parsing.

## Required-input rule (the one that bites)

> Every variable and flag referenced **anywhere** in the body must be passed
> to `format()`, regardless of which branch fires (SPEC §5.2).

```
{if has_history}
Previous question: {last_question}
{end}
```

Even when `has_history = false`, `last_question` must be passed. Pass an
empty string explicitly if you want "no value" — that decision belongs at the
call site, not hidden in the prompt.

## Type validation at format time

No coercion (SPEC §5.5):

| Caller passes | Flag type | Result |
|---|---|---|
| `true` / `false` | boolean | OK |
| string matching declared enum value | enum | OK |
| string not matching declared enum value | enum | `E_INVALID_FLAG_VALUE` |
| `true` / `false` | enum | `E_WRONG_FLAG_TYPE` |
| string | boolean | `E_WRONG_FLAG_TYPE` |
| number, null, undefined, object, array | any | `E_WRONG_FLAG_TYPE` |

Reserved keywords are forbidden as identifier keys, but allowed as runtime
variable **values**: passing `{ role: "end" }` renders the literal text `end`.

## Stable error codes

Cross-port stable codes you can pattern-match on:

- **ParseError** (lexer/body-parser) — `E_BAD_TAG`, `E_UNCLOSED_IF`,
  `E_UNCLOSED_SWITCH`, `E_DUPLICATE_CASE`, `E_SWITCH_NO_CASES`,
  `E_MIXED_FORM`, `E_RESERVED_IDENTIFIER`, `E_EMPTY_PROMPT`, …
- **FrontmatterError** — `E_INVALID_IDENTIFIER`, `E_RESERVED_IDENTIFIER`,
  `E_DUPLICATE_NAME`, `E_INVALID_FLAG_TYPE`, `E_INVALID_FLAG_VALUES`,
  `E_BAD_SCHEMA_SHAPE`.
- **SemanticError** — `E_UNDECLARED_FLAG`,
  `E_FLAG_USED_AS_BOTH_IF_AND_SWITCH`, `E_NON_EXHAUSTIVE_SWITCH`,
  `E_INVALID_CASE_VALUE`, `E_FLAG_AND_VARIABLE_COLLISION`.
- **FormatError** — `E_MISSING_FLAGS_OBJECT`, `E_BAD_FLAGS_TYPE`,
  `E_MISSING_FLAG`, `E_MISSING_VARIABLE`, `E_WRONG_FLAG_TYPE`,
  `E_INVALID_FLAG_VALUE`, `E_RESERVED_KEY`.

All four error classes extend `TextPromptsError`.

## Worked example

The full SPEC §8.2 example, runnable as
[`examples/prompts/support.txt`](../examples/prompts/support.txt):

```
---
title = "Customer support agent"
version = "2.1.0"
description = "Customer support prompt with tier-based routing"
owner = "@support-eng"

[flags.tier]
type = "enum"
values = ["free", "premium", "enterprise"]
description = "User subscription tier"

[flags.has_urgent]
description = "Whether the conversation has been flagged as urgent"

[variables.user_name]
description = "The user's display name"

[variables.last_question]
description = "Previous question, used when has_urgent is true"
---
You are a helpful support agent assisting {user_name}.

{switch tier}
{case free}
You have standard support. Response times may vary.
{case premium}
You have priority support with guaranteed response within 1 hour.
{case enterprise}
You have a dedicated account manager. Their name is on file.
{end}
{if has_urgent}
This conversation has been flagged as urgent. The user previously asked: {last_question}
{end}
How can I help today?
```

```typescript
import { loadPrompt } from "textprompts";

const support = await loadPrompt("examples/prompts/support.txt", {
  metadata: "strict",
});

const message = support.format({
  user_name: "Jan",
  last_question: "How do I upgrade?",
  flags: { tier: "premium", has_urgent: true },
});
```

## See also

- [Authoring skill](../../../docs/writing-prompts-with-textprompts/SKILL.md)
- [Cross-language SPEC](../../../docs/specs/SPEC_conditional_syntax_v2.md)
- [Examples](./examples.md)
- [API reference](./api.md)
