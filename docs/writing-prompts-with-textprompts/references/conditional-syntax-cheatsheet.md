# Conditional syntax cheatsheet

One-page normative reference for the textprompts conditional syntax. Lookup-only. For prose explanation see the skill; for the full normative text see `docs/specs/SPEC_conditional_syntax_v2.md`.

## Tag forms (SPEC §2.2)

| Form | Meaning |
|------|---------|
| `{name}` | Variable interpolation |
| `{if flag}` | Open conditional block, condition `flag` |
| `{if !flag}` | Open conditional block, condition NOT `flag` |
| `{else}` | Else branch inside `if` or `switch` |
| `{end}` | Close the most recently opened `if` or `switch` block |
| `{switch flag}` | Open switch block on enum `flag` |
| `{case value}` | Case branch separator inside `switch` |

## Identifiers and reserved keywords (SPEC §2.1)

- **Identifier regex:** `[a-zA-Z_][a-zA-Z0-9_]*` — ASCII-only, snake_case. Dashes not allowed.
- Used for: variable names, flag names, enum case values.
- **Reserved keywords (forbidden as identifiers anywhere):** `if`, `else`, `end`, `switch`, `case`, `flags`.

## Inside-brace whitespace and case rules (SPEC §2.3)

- Keywords must be **lowercase**. `{IF flag}`, `{If flag}` → parse error.
- **No leading or trailing whitespace inside braces.** `{ if flag }` → parse error.
- One or more spaces may separate a keyword from its argument. `{if flag}` and `{if   flag}` are equivalent.
- Negation only in `{if !flag}`. The `!` must be immediately adjacent to the identifier; `{if ! flag}` → parse error.
- Negation forbidden in `{case}`. `{case !free}` → parse error.
- Bare keyword tags missing required arguments are parse errors: `{if}`, `{switch}`, `{case}`, `{if !}`.

## Escape rules (SPEC §2.4)

- Literal `{` → `\{`.
- Literal `\` → `\\`.
- Literal `}` → `\}` (symmetry); a raw `}` outside a tag renders literally.
- No other escape sequences. `\n`, `\t`, etc. render as the literal two-character source.
- Source newlines preserved after line-ending normalization (§11.1).
- Legacy `{{ ... }}` double-brace escaping is **not** supported.

## Structural rules (SPEC §3.1) — verbatim

1. Every `{if}` must have a matching `{end}`.
2. Every `{switch}` must have a matching `{end}`.
3. `{end}` outside any open block → error.
4. `{else}` outside any open `{if}` or `{switch}` → error.
5. `{case}` outside any open `{switch}` → error.
6. A `{switch}` may have at most one `{else}` branch.
7. A `{switch}` `{else}` branch must come after all `{case}` branches.
8. An `{if}` may have at most one `{else}` branch.
9. Inside a `{switch}` body, the only allowed top-level constructs are `{case}` branches and one optional trailing `{else}`. Any text, variable, `{if}`, or nested `{switch}` between `{switch}` and the first `{case}` → error.
10. Duplicate `{case X}` within the same `{switch}` → error.
11. A `{switch}` with zero `{case}` branches → error. *"switch has no cases; remove the switch or add cases"*.
12. Bare `{if}` with no flag name → error.
13. Bare `{switch}` with no flag name → error.
14. Bare `{case}` with no value → error.
15. `{if !}` with no flag name after `!` → error.
16. Positional placeholders such as `{0}` → error.
17. Empty placeholders `{}` → error.

## Block vs inline form (SPEC §3.2)

- **Inline:** opener, body, separators, and closer all on a single physical line.
- **Block:** every control keyword tag (`{if}`, `{else}`, `{case}`, `{switch}`, `{end}`) alone on its own line (leading indentation permitted).
- **Mixed forms are forbidden.** A construct that starts inline must end inline. A construct that starts block must remain block.
- Form is determined by the opener's line. Independent judgment per construct; siblings on the same line are each judged on their own.

**Legal — two back-to-back constructs, one inline and one block:**

```
{if flag} short note {end}
{if flag}
longer body
{end}
```

**Forbidden — mixed form (parse error):**

```
prefix {if flag}
multi-line body
{end}
```

## Whitespace and rendering rules (SPEC §3.3)

Block form:

- A block-form control keyword line (one block control tag plus optional surrounding whitespace) is **removed in its entirety**, including leading whitespace and trailing newline.
- Body lines are preserved exactly as written, indentation intact.
- When a branch does not render, both its body and the control keyword lines that gate it are removed. No whitespace left behind.
- Variables (`{var}`) never receive line-control behavior; they render in place.

Inline form:

- An inline control tag is replaced in place by the rendered content of its active branch.
- Anything before the opener and after the closer on the same line is **preserved verbatim**.
- Inline tags do not consume surrounding whitespace or newlines. The newline after an inline `{end}` is regular content.

## Frontmatter — flags and variables (SPEC §4.3, §4.4)

Side-by-side. Same prompt, two formats.

**Boolean flag (one shorthand and one full form) + enum flag + variable — TOML:**

```toml
title = "Support agent"
version = "1.3"
description = "Customer support system prompt"

[flags.premium_tier]
description = "User is on the premium subscription tier"

[flags.notifications_enabled]
type = "boolean"
description = "Whether to mention notifications"

[flags.tier]
type = "enum"
values = ["free", "premium", "enterprise"]
description = "User subscription tier"

[variables.role]
description = "The expert role the assistant should adopt"
```

**Same prompt — YAML:**

```yaml
title: Support agent
version: "1.3"
description: Customer support system prompt

flags:
  premium_tier:
    description: User is on the premium subscription tier
  notifications_enabled:
    type: boolean
    description: Whether to mention notifications
  tier:
    type: enum
    values: [free, premium, enterprise]
    description: User subscription tier

variables:
  role:
    description: The expert role the assistant should adopt
```

**Fields per flag (SPEC §4.3.1):**

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `type` | No | `"boolean"` or `"enum"` | Defaults to `"boolean"` |
| `values` | Only for `type = "enum"` | Array of identifier strings | Forbidden for `type = "boolean"` |
| `description` | Recommended; required in strict mode for flags referenced by the body | String | Documents the flag's purpose |

**Fields per variable (SPEC §4.4.1):**

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `description` | No | String | Recommended |

Additional fields on either object are preserved as custom metadata.

## Metadata modes (SPEC §4.6)

| Mode | Frontmatter | `title`/`description`/`version` | Body flag declarations | Notes |
|------|-------------|---------------------------------|------------------------|-------|
| `allow` (default) | Optional | Optional | Implicit declarations permitted | Prototyping; drop-in simple use |
| `strict` | Required (non-empty) | Required, non-empty | Every body-referenced flag must be declared with non-empty `description` | Production prompts and CI |
| `ignore` | Not inspected — whole file is body | N/A; `title` defaults to filename stem | All implicit (§4.5) | Bypass frontmatter entirely |

## Type validation at format time (SPEC §5.5) — verbatim

Strict by default. No coercion.

| Caller passes | Flag type | Result |
|---|---|---|
| `true` / `false` | boolean | OK |
| String matching declared enum value | enum | OK |
| String not matching declared enum value | enum | error |
| `true` / `false` | enum | error |
| String | boolean | error |
| Number, null, undefined, object, array | any flag type | error |

Example errors:

```
flag `tier` got value `trial`, expected one of [free, premium, enterprise]
flag `premium_tier` got string, expected boolean
```
