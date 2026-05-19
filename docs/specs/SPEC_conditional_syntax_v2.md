# textprompts Conditional Syntax — Specification v2.0

**Status:** Final draft for TypeScript reference implementation
**Scope:** Adds conditional rendering (`{if}`, `{switch}`), typed flag declarations, and stricter variable validation to the textprompts format. Major-version feature; intentionally breaks some legacy placeholder behavior in favor of correctness and readability.

**Implementation order:** `packages/textprompts-ts` first. Python (`textprompts`) and Julia (`TextPrompts.jl`) follow once the TypeScript implementation and conformance corpus prove the design.

---

## 1. Goals and design philosophy

The textprompts project exists because prompts deserve the same engineering discipline as code: version control, validation, typed inputs, and clear failure modes. The single-brace `{var}` syntax is deliberately minimal — it looks like prose with holes, not a general templating language.

This spec extends that philosophy to conditional rendering for **feature-flag-style prompt management**.

The design optimizes for, in priority order:

1. **Catching invisible mistakes.** A typo in a flag name, an unreachable branch, a missing variable, an undeclared enum value, or a type mismatch at format time must fail loudly with a clear error. Silent fallbacks — treating an unknown flag as `false`, a missing variable as `""`, etc. — are forbidden.
2. **Human and model readability.** Prompts are read by reviewers in PRs, by engineers debugging behavior, and by LLMs writing or editing them. The syntax reads like prose with structural hints, not like a programming language.
3. **Avoiding Handlebars/Jinja confusion.** The syntax deliberately avoids `#if`, `/if`, `{{...}}`, and other double-brace conventions. textprompts uses one single-brace family: `{...}`.
4. **Simplicity over expressiveness.** One delimiter family, six reserved keywords (`if`, `else`, `end`, `switch`, `case`, `flags`), one clear pair of forms (inline or block, never mixed), two namespaces (flags, variables). Anything that adds expressive power at the cost of more rules is rejected.
5. **Wrong states impossible by design.** The parser and formatter reject ambiguous or risky constructs early rather than support them and rely on author discipline.
6. **Cross-language parity.** Once the TypeScript implementation validates the design, Python and Julia implementations must produce byte-identical output for the same prompt file and inputs, validated by a shared conformance corpus.

### 1.1 Major-version posture

This is a breaking release. The following legacy behaviors are intentionally removed:

- Positional placeholders such as `{0}` are not supported.
- Empty placeholders such as `{}` are not supported.
- Variable names must be explicit identifiers.
- Reserved keywords cannot be variable or flag names.
- `flags` is reserved by the formatting API and cannot be used as a variable name, flag name, or enum case value.
- Legacy `{{ ... }}` double-brace escaping is not supported.

The purpose is to make prompt inputs explicit and reviewable.

### 1.2 What this spec deliberately excludes

The following are out of scope and will not be added without a separate proposal:

- Boolean expressions in conditionals (`{if a && b}`, `{if !a || b}`). Compose flags in caller code.
- Value comparisons in `{if}` (`{if tier == "premium"}`). Use `{switch}` instead.
- `elif` / `{else if}` chains. Use `{switch}` or restructure.
- Loops, partials, includes, helpers, custom functions.
- Dynamic flag names (`{if {dynamic_flag_name}}`). Flag names are static identifiers.
- Default values for flags. The caller always passes flag values explicitly.
- Pulling flag values from environment variables or external systems.
- Comments in the prompt body. Documentation belongs in frontmatter.

The discipline is: the moment the syntax can express arbitrary logic, prompts stop being prose-with-holes and become programs. Holding this line is the feature.

---

## 2. Lexical grammar

### 2.1 Tags and identifiers

A **tag** is any token delimited by `{` and `}` that the parser interprets specially. Plain text outside tags renders literally.

**Lexer order of operations.** When the lexer encounters `{`:

1. If the content immediately following matches a control-tag pattern — `if `, `switch `, `case `, `else}`, or `end}` — it's a control tag.
2. Otherwise, if it matches `identifier}`, it's a variable.
3. Otherwise, it's a malformed tag and produces a clear error.

If `{` is followed by whitespace, a digit, another `{`, or any non-identifier-start character, the lexer attempts to produce a helpful diagnostic, especially for legacy patterns like `{0}` (positional) or `{}` (empty).

**Identifier:** `[a-zA-Z_][a-zA-Z0-9_]*` — ASCII-only, snake_case. Dashes are not allowed.

Identifiers are used for variable names, flag names, and enum case values.

**Reserved keywords** — `if`, `else`, `end`, `switch`, `case`, `flags`. These cannot be used as flag names, variable names, or enum case values, anywhere identifiers appear. `flags` is reserved everywhere identifiers are used, for consistency with the format API surface.

### 2.2 Tag forms

| Form | Meaning |
|------|---------|
| `{name}` | Variable interpolation |
| `{if flag}` | Open conditional block, condition `flag` |
| `{if !flag}` | Open conditional block, condition NOT `flag` |
| `{else}` | Else branch inside `if` or `switch` |
| `{end}` | Close the most recently opened `if` or `switch` block |
| `{switch flag}` | Open switch block on enum `flag` |
| `{case value}` | Case branch separator inside `switch` |

### 2.3 Whitespace and case rules inside tags

- Keywords must be **lowercase**. `{IF flag}` and `{If flag}` are parse errors.
- **No leading or trailing whitespace** is allowed inside braces. `{ if flag }` is a parse error. This protects prose containing brace-delimited content like `{ x | x > 0 }`.
- One or more spaces may separate a keyword from a non-negated argument. `{if flag}` and `{if   flag}` are equivalent.
- Negation is only allowed in `{if !flag}`. Keep this form simple: exactly one space after `if`, and `!` must be immediately adjacent to the identifier. `{if  !flag}` and `{if ! flag}` are parse errors.
- Negation is forbidden in `{case}`. `{case !free}` is a parse error.
- Bare keyword tags missing required arguments are parse errors: `{if}`, `{switch}`, `{case}`, `{if !}`.

### 2.4 Escaping

- A literal `{` in prompt body is written as `\{`.
- A literal `\` is written as `\\`.
- A literal `}` may be written as `\}` for symmetry, though a raw `}` outside a tag renders literally.
- No other escape sequences are recognized. `\n`, `\t`, etc. render as the literal two-character sequences in the source.
- Newlines in the source file are preserved as source newlines after line-ending normalization (§11.1).
- Legacy `{{ ... }}` double-brace escaping is not part of this syntax.

### 2.5 File-level conventions

- **Line endings:** CRLF is normalized to LF at load time, unconditionally. Output uses LF exclusively. A Windows-authored and Unix-authored prompt with otherwise identical content produce byte-identical output.
- **UTF-8 BOM** at file start is silently stripped if present.
- **Trailing newline at end of file** is preserved if present in the source, not auto-added if absent.
- **Tabs and spaces** in indentation are both fine, treated identically as whitespace. No tab-vs-space significance.
- **Empty prompt files** (zero bytes, or whitespace-only after preprocessing) → load error. *"prompt file is empty"*. A prompt with nothing to render is almost always a mistake. This rule fires under all metadata modes. In `"ignore"` mode the entire file is the body, so a file containing a frontmatter-looking block is not empty merely because no post-header body exists.
- **Common-leading-whitespace dedent.** Implementations may strip the minimum common leading whitespace shared by all non-empty body lines before parsing. This is an accommodation for callers who pass indented multi-line string literals (e.g. TS template literals, Python triple-quoted strings) to a `fromString`-style API; for file-loaded prompts it is almost always a no-op because line 1 has zero indent. Line-ending normalization, BOM stripping, and dedent are one preprocessing step applied before body parsing; when §3 says "body lines are preserved as written", the source is the post-preprocessing text.

---

## 3. Syntactic grammar

```
prompt        = [frontmatter], body ;
frontmatter   = "---", newline, (toml | yaml), "---", newline, [blank_separator_line] ;
body          = { node } ;
node          = text | variable | if_block | switch_block ;
variable      = "{", identifier, "}" ;
if_block      = if_open, body, [ else_branch ], end_tag ;
if_open       = "{if ", [ "!" ], identifier, "}" ;
else_branch   = "{else}", body ;
end_tag       = "{end}" ;
switch_block  = switch_open, { case_branch }, [ else_branch ], end_tag ;
switch_open   = "{switch ", identifier, "}" ;
case_branch   = "{case ", identifier, "}", body ;
```

The grammar describes structure. The block-vs-inline placement rules in §3.2 and the whitespace-rendering rules in §3.3 are also normative.

### 3.1 Structural rules enforced at parse time

Load-time errors with helpful diagnostics. Implementations should include source path, line, and column when this is cheap and reliable, but exact source locations are not part of the semantic contract:

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

Style guidance — deeply nested blocks are discouraged; prefer caller-side flag composition or a flatter `{switch}`. This is not enforced by the parser; see §12 (authoring skill).

### 3.2 Inline vs block form

Each conditional or switch construct has exactly two valid forms:

- **Inline form:** the entire control structure — opener, body, any `{else}` or `{case}` separators, and the closer — appears on a single physical line.
- **Block form:** every control keyword tag (`{if}`, `{else}`, `{case}`, `{switch}`, `{end}`) appears alone on its own line. "Alone on its line" means only whitespace before and after the tag on that line. Leading whitespace (indentation) is permitted and encouraged for nested structures.

**Mixed forms are forbidden.** A construct that starts inline must end inline. A construct that starts as a block must remain a block throughout — every related keyword tag must be alone on its line.

**Form is determined by the opener's line.** If the opener's line contains any non-whitespace content other than the opener, the construct is inline; the closer (and any `{else}`/`{case}` separators) must appear on the same line. If the opener is alone on its line, the construct is block form; every related keyword must be alone on its own line.

**Independent judgment per construct.** Multiple constructs may appear on the same line (each is judged independently) and multiple constructs may nest. The form rule applies per-construct.

**Forbidden mixed-form examples (all parse errors):**

```
prefix {if flag}
multi-line body
{end}
```

```
{if flag}
multi-line body
{end} suffix
```

```
{if flag}inline body
{end}
```

```
{if flag}
body {end}
```

```
{if flag} body
{else}
other
{end}
```

**Legal — two separate constructs back-to-back, one inline and one block:**

```
{if flag} short note {end}
{if flag}
longer body
{end}
```

These are independently valid; each construct's form is judged on its own.

### 3.3 Whitespace and rendering rules

#### Block form

A **block-form control keyword line** — a line containing exactly one block control tag (`{if}`, `{else}`, `{case}`, `{switch}`, or `{end}`) plus optional surrounding whitespace — is **removed in its entirety, including any leading whitespace and the trailing newline.**

Body lines are preserved exactly as written, with their indentation intact.

When a branch does not render, both its body and any control keyword lines that gate it are removed. No whitespace is left behind from the inactive branch.

Variables (`{var}`) never receive special line-control behavior; they render in place.

#### Inline form

An **inline control tag** is replaced in place by the rendered content of its active branch, if any. Only the content between the opener and the closer is substituted; **anything before the opener and after the closer on the same line is preserved verbatim.**

Inline tags do not consume surrounding whitespace or newlines. The newline following an inline `{end}` is regular content following an inline tag and is preserved.

### 3.4 Worked rendering examples

**Block, if true:**

```
Hello
{if flag}
World
{end}
!
```

With `flag = true`:

```
Hello
World
!
```

With `flag = false`:

```
Hello
!
```

**Block, with else:**

```
Hello
{if flag}
World
{else}
There
{end}
!
```

With `flag = true`:

```
Hello
World
!
```

With `flag = false`:

```
Hello
There
!
```

**Block with body indentation preserved:**

```
Items:
{if include_items}
  - Alpha
  - Beta
{end}
Done.
```

With `include_items = true`:

```
Items:
  - Alpha
  - Beta
Done.
```

With `include_items = false`:

```
Items:
Done.
```

**Block with blank lines inside the body:**

```
A
{if flag}

B

{end}
C
```

With `flag = true`:

```
A

B

C
```

With `flag = false`:

```
A
C
```

The whole branch (body + gating keyword lines) is removed when the branch does not render.

**Indented nested blocks (now allowed):**

```
{if outer}
  {if inner}
  body line
  {end}
{end}
```

Both keyword lines `  {if inner}` and `  {end}` are removed entirely (including their leading whitespace). The body line `  body line` is preserved as-is.

**Inline form — content outside the tag is preserved:**

```
You are a {role}{if is_admin} (administrator){end}.
```

With `role = "Jan"`, `is_admin = true`:

```
You are a Jan (administrator).
```

With `is_admin = false`:

```
You are a Jan.
```

The trailing `.` after `{end}` stays in both cases.

**Inline if with else:**

```
The user is on the {if premium_tier}premium{else}free{end} plan.
```

With `premium_tier = true`:

```
The user is on the premium plan.
```

With `premium_tier = false`:

```
The user is on the free plan.
```

**Inline with embedded variable:**

```
You are a {role}{if is_admin} (an administrator named {admin_name}){end}.
```

Per the variable-requirement rule (§5.3), `admin_name` must be passed at format time regardless of `is_admin`'s value.

**Inline switch (allowed, discouraged for readability):**

```
Plan: {switch tier}{case free}free{case premium}premium{else}unknown{end}.
```

The whole switch is on one line. Every `{case}` and the `{end}` must be on the same line; any line break within an inline switch is a parse error.

### 3.5 Nesting

Blocks may nest. Each `{end}` closes the most recently opened `{if}` or `{switch}`. There is no per-case `{end}` inside a switch — one `{end}` terminates the entire switch.

---

## 4. Frontmatter

Frontmatter is optional in the default loader mode. When present, it is delimited by `---` lines.

### 4.1 Format detection

- **Default:** parse as **TOML**.
- **Fallback:** if TOML parsing fails, attempt YAML.
- **Explicit override:** the loader accepts a `frontmatterFormat` option set to `"toml"`, `"yaml"`, or `"auto"` (default).
- In `"auto"` mode, TOML is tried first; if it fails, YAML is tried.
- In explicit mode, the named parser is used; parse failure produces a clean error with the parser's diagnostic.
- **Empty frontmatter** (`---\n---\n` with no content) is equivalent to no frontmatter.
- A single blank separator line immediately after the closing `---` delimiter is allowed and consumed. This keeps the common authoring style `---\n...\n---\n\nBody` from adding an unintended leading blank line to the prompt body. Additional blank lines after that separator are body content and are preserved.

The conformance subset of supported value types is defined in §11.2.

### 4.2 Top-level fields

These fields are preserved unchanged from earlier versions of textprompts:

```toml
title = "Support agent"
version = "1.3"
description = "Customer support system prompt"
```

Implementations must preserve **any additional top-level fields** as custom metadata accessible via the loaded prompt object (e.g. `prompt.metadata.owner`). No top-level field is rejected as unknown, except where it conflicts with reserved schema sections (`[flags.*]`, `[variables.*]`).

### 4.3 Flag declarations

Flags are declared under `[flags.*]` (TOML) or `flags:` (YAML).

**Boolean flag, full form:**

```toml
[flags.premium_tier]
type = "boolean"
description = "User is on the premium subscription tier"
```

**Boolean flag, shorthand (`type` defaults to `"boolean"`):**

```toml
[flags.premium_tier]
description = "User is on the premium subscription tier"
```

**Enum flag:**

```toml
[flags.tier]
type = "enum"
values = ["free", "premium", "enterprise"]
description = "User subscription tier"
```

**YAML equivalents:**

```yaml
flags:
  premium_tier:
    type: boolean
    description: User is on the premium subscription tier
  tier:
    type: enum
    values: [free, premium, enterprise]
    description: User subscription tier
```

#### 4.3.1 Fields per flag

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `type` | No | `"boolean"` or `"enum"` | Defaults to `"boolean"` |
| `values` | Only for `type = "enum"` | Array of identifier strings | Forbidden for `type = "boolean"` |
| `description` | Recommended; required in strict mode for every declared flag (§4.6) | String | Documents the flag's purpose |

**Additional fields are preserved as custom metadata** on the parsed flag object. Examples: `owner`, `created`, `expires`, `rollout`, `jira_ticket`.

#### 4.3.2 Frontmatter validation for flags (load-time errors)

- Flag name is not a valid identifier.
- Flag name is a reserved keyword.
- `type` is present and not `"boolean"` or `"enum"`.
- `values` is missing for an enum flag.
- `values` is empty for an enum flag.
- `values` contains an invalid identifier.
- `values` contains duplicates.
- `values` contains a reserved keyword.
- `values` is present for a boolean flag.
- The same name appears in both `[flags.*]` and `[variables.*]`.

### 4.4 Variable declarations

Variables may optionally be declared under `[variables.*]` (TOML) or `variables:` (YAML).

```toml
[variables.role]
description = "The expert role the assistant should adopt"

[variables.last_question]
description = "Previous user query, if any"
```

#### 4.4.1 Fields per variable

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `description` | No | String | Recommended |

**Additional fields are preserved as custom metadata.**

Variable declarations are documentation and metadata. A variable is required at format time **if and only if it appears in the prompt body**, regardless of whether it's declared in frontmatter. Declared-but-unused variables are not required.

### 4.5 No frontmatter — implicit mode

A prompt file with no frontmatter is valid in the default loader mode. In this case:

- `{name}` references are variables.
- `{if foo}` references implicitly define `foo` as a boolean flag.
- `{switch foo}` references implicitly define `foo` as an enum flag with values inferred from the `{case X}` branches present.
- All variables appearing anywhere in the prompt body must be passed to `format()`.
- All flags referenced anywhere in the prompt body must be passed under the `flags` object.
- Implicit flags are exposed through the same metadata surface as declared flags (for example, `prompt.meta.flags` in TypeScript), with empty custom metadata.

### 4.6 Loader metadata modes

The loader accepts a `metadata` option set to `"allow"` (default), `"strict"`, or `"ignore"`.

**`metadata: "allow"` (default):**

- Frontmatter is optional.
- If present, frontmatter is parsed and validated per §4.3–§4.5.
- Implicit declarations (from body usage) are permitted.
- Recommended for prototyping and drop-in simple use.

**`metadata: "strict"`:**

- Frontmatter is **required**. Loading a file with no frontmatter, or empty frontmatter, → error.
- Standard fields `title`, `description`, and `version` are **required** and must be non-empty.
- If the prompt body references any flags, **every referenced flag must be declared** in `[flags.*]`.
- Every declared flag must have a non-empty `description`, including declared flags that the current body does not reference.
- Variables are not required to be declared. (Variable declarations remain optional even in strict mode; the goal is operational discipline around flags, which are the moving parts.)
- Recommended for production prompts and CI checks.

**`metadata: "ignore"`:**

- The source is **not inspected for frontmatter at all**. The entire file is treated as prompt body.
- No flags or variables are declared from frontmatter; everything is treated as implicit (per §4.5) based on the full file body.
- No frontmatter validation runs. A malformed or non-TOML/non-YAML header is not an error in this mode because there is no header in this mode; those bytes are prompt body bytes.
- The prompt's `title` defaults to the source filename stem (matching the v1 IGNORE behavior).
- Use this mode to load files that intentionally do not use the textprompts metadata schema, or to bypass frontmatter parser churn while preserving the file exactly as prompt body.

Strict mode and ignore mode are opt-in per loader call. Implementations may also expose a global default (e.g. environment variable, library-level configuration) for convenience; the per-call option always takes precedence.

### 4.7 Declared vs implicit usage disagreements

If frontmatter declares a flag and the body uses it inconsistently, this is a load-time error:

- Flag declared as boolean but used in `{switch}`.
- Flag declared as enum but used in `{if}`.
- `{case X}` not in declared enum values.
- Switch missing declared enum values and no `{else}` branch (see §5.2).

If frontmatter declares variables that are not used in the body, they are metadata only and are not required at format time. If the body uses variables that are not declared in frontmatter, they are still valid (in `metadata: "allow"`) and required at format time.

---

## 5. Semantic rules

### 5.1 Namespaces

Two namespaces:

1. **Flags** — booleans or enums used by `{if}` and `{switch}`. Passed at format time via a dedicated `flags` object.
2. **Variables** — values interpolated by `{name}`. Passed at format time as top-level fields.

A given name can be either a flag or a variable in a prompt file, never both. Declaring `[flags.foo]` and `[variables.foo]` in the same file → load error.

**Enum case values are scoped to their flag** and do not occupy the top-level identifier namespace. A flag named `tier` with values `["free", "premium"]` does not prevent a variable named `premium` from existing. Case values only have meaning inside the matching `{switch}`.

`flags` is reserved and cannot be a variable name, flag name, or enum case value.

### 5.2 Core rule — all body variables and flags are required

**Any flag or variable referenced anywhere in the prompt body must be passed at format time, regardless of which branch fires.**

This is the most important semantic rule in this spec.

Example:

```
{if has_history}
Previous question: {last_question}
{end}
```

`has_history` and `last_question` are both required at format time. Even when `has_history = false` and the body doesn't render, `last_question` must still be passed.

**Rationale:** this prevents the bug where a prompt appears valid until a flag flips later and activates a branch with missing wiring. If a variable is genuinely optional from the caller's perspective, pass it as an empty string or null explicitly — that's a decision visible at the call site.

### 5.3 Exhaustiveness for `{switch}`

When `{switch tier}` is used, the set of `{case X}` branches must satisfy one of:

- **Exhaustive case coverage:** every value in the enum's declared or inferred values list has a matching `{case X}` branch. In this case, `{else}` is permitted but not required.
- **Catch-all:** the switch has an `{else}` branch covering values not enumerated by `{case}` branches.

If neither holds → load error: *"switch on `tier` missing cases: [enterprise]. Add `{case enterprise}` or `{else}`."*

A `{case X}` where `X` is not in the declared enum values → load error.

An empty `{case X}` body (no content before the next `{case}`, `{else}`, or `{end}`) is permitted and renders nothing.

Case order in the body is cosmetic. Matching is by value.

In implicit mode, enum values are inferred from the cases that appear; exhaustiveness is therefore trivially satisfied.

### 5.4 Exhaustiveness for `{if}`

When an `{if}` has both branches present (`{if}...{else}...{end}`), `{else}` is permitted but not required. An `{if}` without `{else}` simply renders nothing for the false branch — which is the common case.

### 5.5 Type validation at format time

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

Reserved keywords are forbidden as **identifier names** (variable keys, flag keys, enum case values), not as **runtime variable values**. A variable value such as the string `"end"` is allowed and renders as the literal text `end`.

### 5.6 Missing inputs

- **Missing `flags` parameter when prompt uses any flag** → distinct, helpful error: *"prompt requires `flags` parameter but none was passed; expected flags: [tier, premium_tier]"*.
- **Missing individual flag** → *"flag `tier` required but not provided"*; if available, the message may include where the flag is used.
- **Missing individual variable** → *"variable `role` required but not provided"*; if available, the message may include where the variable is used.

### 5.7 Extra inputs

Extra flags or variables passed to `format()` are **silently ignored** and do not affect rendered output. No warning, no diagnostic, no error.

This permissive stance lets callers pass a single context object to multiple prompts without artificially trimming it. If a caller wants to detect unused inputs, they can compare their input keys against the prompt's declared/referenced flags and variables (exposed via the prompt schema; see §4.3, §4.4, and §6.5).

### 5.8 Custom metadata access

Frontmatter may carry any fields beyond the textprompts schema — `owner`, `created`, `expires`, `rollout`, `jira_ticket`, `last_reviewed`, and so on (§4.2, §4.3.1, §4.4.1). These fields are **preserved as data** and exposed to callers, not warned or stripped.

All loaded metadata lives under a single `meta` object on the prompt. Custom fields appear in three places on that object:

- **Top-level** — additional top-level frontmatter fields (anything beyond `title`, `version`, `description`, `author`, `created`) are exposed as `prompt.meta.extras`.
- **Per flag** — additional fields on a flag declaration (anything beyond `type`, `values`, `description`) are exposed on that flag's record at `prompt.meta.flags["tier"].extras`.
- **Per variable** — additional fields on a variable declaration (anything beyond `description`) are exposed on that variable's record at `prompt.meta.variables["last_question"].extras`.

Values are preserved with their original TOML/YAML types — strings stay strings, integers stay integers, arrays stay arrays, tables stay nested objects. Dates and times are preserved as the conformance subset allows (§11.2). Each language picks the most natural map/dict shape (plain object in TS, dict in Python, `Dict` in Julia); the conformance corpus asserts the data is reachable, not the field shape.

Custom metadata never affects rendering. It is purely for callers to read.

---

## 6. Format API

The primary API is `format()`. `render()` may exist as an alias with identical behavior; the spec uses `format()`.

### 6.1 TypeScript

```ts
import { loadPrompt } from "textprompts";

const prompt = await loadPrompt("./prompts/support.txt");

const formatted: string = prompt.format({
  // Top-level variables
  role: "Julia expert",
  last_question: "How do macros work?",

  // Dedicated flags namespace
  flags: {
    premium_tier: true,
    tier: "premium",
  },
});
```

Loader with options:

```ts
const prompt = await loadPrompt("./prompts/support.txt", {
  frontmatterFormat: "toml",    // "toml" | "yaml" | "auto" (default)
  metadata: "strict",           // "allow" (default) | "strict" | "ignore"
});
```

### 6.2 Python

```python
from textprompts import load_prompt

prompt = load_prompt("./prompts/support.txt")

formatted = prompt.format(
    role="Julia expert",
    last_question="How do macros work?",
    flags={"premium_tier": True, "tier": "premium"},
)
```

Loader with options:

```python
prompt = load_prompt(
    "./prompts/support.txt",
    frontmatter_format="toml",   # "toml" | "yaml" | "auto"
    metadata="strict",            # "allow" | "strict" | "ignore"
)
```

### 6.3 Julia

```julia
using TextPrompts

prompt = load_prompt("./prompts/support.txt")

formatted = format(
    prompt;
    role="Julia expert",
    last_question="How do macros work?",
    flags=(premium_tier=true, tier="premium"),
)
```

Or, if idiomatic for the package:

```julia
formatted = prompt(
    role="Julia expert",
    last_question="How do macros work?",
    flags=(premium_tier=true, tier="premium"),
)
```

Loader with options:

```julia
prompt = load_prompt(
    "./prompts/support.txt";
    frontmatter_format="toml",
    metadata="strict",  # or "allow" or "ignore"
)
```

In all languages, `flags` is a dedicated, explicit field separate from variables. A variable named `flags` is not allowed.

### 6.4 Legacy formatting behavior

Implementations may remove support for:

- Positional arrays
- Numeric placeholders
- Empty `{}` placeholders
- Double-brace escaping

The new behavior prefers explicit named variables and an explicit `flags` object.

### 6.5 Accessing metadata and custom fields

Each loaded prompt exposes all metadata — standard fields, flag declarations, variable declarations, and custom (`extras`) fields — under a single `meta` object. Naming is identical across languages.

**TypeScript:**

```ts
const prompt = await loadPrompt("./prompts/support.txt");

// Standard fields
prompt.meta.title;          // "Customer support agent"
prompt.meta.version;        // "2.1"
prompt.meta.description;    // ...

// Top-level custom fields
prompt.meta.extras.owner;          // "@support-eng"
prompt.meta.extras.last_reviewed;  // "2026-04-30"

// Flag declarations
prompt.meta.flags.tier.kind;          // "enum"
prompt.meta.flags.tier.values;        // ["free", "premium", "enterprise"]
prompt.meta.flags.tier.description;   // "User subscription tier"
prompt.meta.flags.tier.extras.owner;  // "@product"

// Variable declarations
prompt.meta.variables.last_question.description;  // "Previous question, if any"
prompt.meta.variables.last_question.extras;        // {}
```

**Python:**

```python
prompt = load_prompt("./prompts/support.txt")

prompt.meta.title
prompt.meta.extras["owner"]
prompt.meta.flags["tier"].values
prompt.meta.flags["tier"].extras["owner"]
prompt.meta.variables["last_question"].extras
```

**Julia:**

```julia
prompt = load_prompt("./prompts/support.txt")

prompt.meta.title
prompt.meta.extras["owner"]
prompt.meta.flags["tier"].values
prompt.meta.flags["tier"].extras["owner"]
prompt.meta.variables["last_question"].extras
```

Each language picks the most natural map shape (plain object/dict). Values preserve their original TOML/YAML types.

Callers can use this surface to:

- Display flag ownership in tooling.
- Cross-reference prompts against an internal review or expiry system.
- Filter prompts by metadata in CI.
- Detect unused inputs by comparing their context object against `prompt.meta.flags` / `prompt.meta.variables`.

Custom fields are read-only data; mutating them does not affect rendering.

### 6.6 Save API

Implementations that expose a `savePrompt` / `save_prompt` API must preserve v2 metadata when saving a loaded prompt:

- Standard fields (`title`, `version`, `description`, `author`, `created`).
- Top-level custom metadata (`meta.extras`).
- Flag declarations, including enum `values`, descriptions, and per-flag extras.
- Variable declarations, including descriptions and per-variable extras.

Saving must not silently drop declared flags or variables. If a target frontmatter format cannot represent a metadata value safely, the implementation should fail with a clear error rather than write a lossy file.

---

## 7. Error behavior

The implementation prioritizes enforcing correct behavior and producing clear, helpful errors. A detailed error taxonomy is useful for conformance tests but is secondary to making wrong states impossible and failures easy to debug.

All errors include a clear category and stable code where implemented, plus a human-readable message that names the relevant flag, variable, tag, or field. Source path, line, and column are useful and encouraged when they are cheap to provide, but exact locations are optional and not required for conformance.

### 7.1 Frontmatter load errors

- Reserved keyword as flag name.
- Reserved keyword as variable name.
- Invalid flag `type`.
- Enum flag missing `values`.
- Enum flag with empty `values`.
- Boolean flag has `values`.
- Duplicate enum value.
- Invalid identifier (e.g. dashes, digits at start, unicode).
- Same name declared as both flag and variable.
- Strict mode: missing or empty `title`, `description`, or `version`.
- Strict mode: declared flag missing `description`.
- Strict mode: prompt has no frontmatter.
- Strict mode: flag used in body but not declared.
- Frontmatter parse failure (explicit format).
- Frontmatter parse failure under both formats (auto mode).

### 7.2 Parse errors

- Unclosed `{if}` or `{switch}`.
- `{end}` outside any block.
- `{else}` outside any block.
- `{case}` outside switch.
- Multiple `{else}` branches in same block.
- Content between `{switch}` and first `{case}`.
- Duplicate `{case X}` in same switch.
- Switch with zero cases.
- Bare keyword tags missing required arguments (`{if}`, `{switch}`, `{case}`, `{if !}`).
- Uppercase keyword.
- Whitespace inside braces.
- Mixed inline/block form for one construct.
- Positional placeholder `{0}`.
- Empty placeholder `{}`.
- Variable or flag name uses a dash.
- Invalid negation spacing (`{if  !flag}`, `{if ! flag}`).
- Negation in `{case}` (`{case !free}`).
- Empty prompt file.

### 7.3 Semantic load errors

- Boolean flag used in `{switch}`.
- Enum flag used in `{if}`.
- `{case X}` value not in declared enum.
- Non-exhaustive switch without `{else}`.
- Name used as both variable and flag in the prompt body.

### 7.4 Format-time errors

- Required flag not passed.
- `flags` parameter entirely missing when flags are used.
- Required variable from prompt body not passed.
- Wrong type for flag.
- Enum value not in allowed set.
- Reserved keyword used as variable key or flag key.
- `flags` used as a variable name.

Extra flags or variables are **silently ignored**, not errors and not warnings (§5.7).

---

## 8. Complete worked examples

### 8.1 Minimal — no frontmatter (implicit mode)

```
You are a {role}.
{if include_examples}
Here are some examples:
{examples}
{end}
Be helpful.
```

Call:

```ts
prompt.format({
  role: "Julia expert",
  examples: "1. macros\n2. multiple dispatch",
  flags: { include_examples: true },
});
```

`examples` must be passed even when `include_examples = false`, because `{examples}` appears in the prompt body (§5.2).

### 8.2 Full frontmatter with custom metadata

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

{if has_history}
The user previously asked: {last_question}
{end}

How can I help today?
```

Call:

```ts
prompt.format({
  user_name: "Jan",
  last_question: "How do I upgrade?",
  flags: { tier: "premium", has_history: true },
});
```

This file loads cleanly under both `metadata: "allow"` and `metadata: "strict"` (standard metadata fields are present and every referenced flag has a description).

### 8.3 Inline form

```
You are a {role}{if is_admin} (administrator){end}.
The user is on the {if premium_tier}premium{else}free{end} plan.
```

Inline tags only replace the text between opener and closer. Punctuation outside the tags (`.` after `{end}`) is always preserved.

### 8.4 Inline with embedded variable (variable required regardless)

```
You are a {role}{if is_admin} (administrator named {admin_name}){end}.
```

`admin_name` must be passed at format time even when `is_admin = false`.

### 8.5 Nested blocks with indentation

```
{if is_authenticated}
Welcome back, {user_name}.
  {switch tier}
  {case free}
You're on the free plan.
  {case premium}
You're on premium. Priority support is active.
    {if has_unread}
You have {unread_count} unread messages.
    {end}
  {case enterprise}
Enterprise support is active.
  {end}
{else}
Please sign in.
{end}
```

Indented keyword lines are valid in block form. Each keyword line is removed in its entirety (including its leading whitespace). Body line indentation is preserved as written.

Deep nesting like this is valid but discouraged; prefer flatter structure or caller-side composition.

### 8.6 Strict-mode file

```
---
title = "Production prompt"
version = "1.0"
description = "Production prompt with subscription tier and onboarding tip variants"

[flags.tier]
type = "enum"
values = ["free", "premium"]
description = "Subscription tier"

[flags.show_tips]
description = "Whether to include onboarding tips"
---
{switch tier}
{case free}
{if show_tips}
Tip: upgrade to premium for faster responses.
{end}
{case premium}
You're on premium.
{end}
```

Loads under both modes. Standard metadata fields are present and every referenced flag has a description, so strict mode passes.

---

## 9. Implementation plan

### 9.1 TypeScript-first rollout

Implement the full feature in `packages/textprompts-ts` first as one cohesive PR:

- Tokenizer
- Parser
- Formatter
- Flag and variable collection
- Frontmatter schema validation (both TOML and YAML, both modes)
- Switch exhaustiveness checks
- Strict format-time validation
- Whitespace and rendering behavior per §3.3
- Tests and conformance fixtures

Python and Julia follow after the TypeScript version proves the syntax and the conformance corpus is stable.

### 9.2 Repository structure

```
textprompts/
├── spec/
│   ├── grammar.md                    # This document
│   ├── fixtures/                     # Cross-language conformance corpus
│   │   ├── 001-plain-variable/
│   │   │   ├── prompt.txt
│   │   │   ├── input.json
│   │   │   ├── options.json          # loader options
│   │   │   └── expected.txt
│   │   ├── 050-error-unclosed-if/
│   │   │   ├── prompt.txt
│   │   │   ├── input.json
│   │   │   └── expected-error.json   # { category, code?, messageContains?, line?, column? }
│   │   └── ...
│   └── test-plan.md
├── packages/
│   ├── textprompts-ts/
│   ├── textprompts-py/
│   └── TextPrompts.jl/
└── docs/
    ├── authoring-skill.md
    └── ...
```

The `docs/specs/fixtures/` directory is the source of truth for cross-language behavior. Each implementation runs the full corpus as part of CI.

### 9.3 Versioning

This is a major-version feature for implementations currently supporting positional placeholders, empty placeholders, or double-brace escaping. Each implementation declares which spec version it supports.

---

## 10. Test plan

### 10.1 Unit — tokenizer

- Variable tags, if tags, negated if tags, else tags, end tags, switch tags, case tags.
- Escapes, plain text, malformed tags.
- Uppercase keywords rejected.
- Whitespace edge cases (tabs, mixed indentation, trailing whitespace).
- CRLF normalization.
- UTF-8 BOM stripped.
- Invalid identifiers (digits at start, dashes, unicode).
- Legacy positional placeholders rejected.
- Empty placeholders rejected.
- Reserved keyword as identifier rejected (including `flags`).

### 10.2 Unit — parser

- Every grammar rule.
- Every structural error.
- Nesting depths 1, 2, 5, 20.
- Inline-only valid cases.
- Block-only valid cases.
- Indented block keywords valid.
- Mixed inline/block invalid.
- Multiple inline constructs on one line.
- Empty `{if}` bodies, empty `{case}` bodies.
- Switches with cases only.
- Switches with cases and else.
- Switch with zero cases rejected.
- Content between `{switch}` and first `{case}` rejected.
- Top-level `{if}` between switch and first case rejected.
- Empty prompt file rejected.

### 10.3 Unit — frontmatter

- TOML and YAML formats.
- Explicit `frontmatterFormat` option.
- Auto-detection (TOML first, YAML fallback).
- Empty frontmatter equivalent to no frontmatter.
- Boolean flag full form and shorthand.
- Enum flag.
- Custom metadata preservation (top-level, per-flag, per-variable).
- Invalid identifiers rejected.
- Reserved names rejected.
- Duplicate enum values rejected.
- Enum values not matching identifier rules rejected.
- Shared-namespace conflict rejected.
- Declared variables not used in body not required at format time.
- Strict mode: missing frontmatter rejected.
- Strict mode: missing or empty `title`, `description`, or `version` rejected.
- Strict mode: any declared flag without description rejected.
- Strict mode: undeclared flag used in body rejected.
- Strict mode: undeclared variable used in body accepted (variables not subject to strict).

### 10.4 Unit — formatter

- Variable interpolation.
- All body variables required, including inactive branches.
- `if` true, `if` false, `if/else` both branches, negated `if`.
- Switch: every case, switch with `{else}`, switch with exhaustive cases and no `{else}`.
- Nested rendering.
- Block keyword lines removed in entirety (including leading whitespace and trailing newline).
- Body indentation preserved.
- Blank lines inside active branches preserved.
- Inactive branch produces nothing (no stray whitespace).
- Inline rendering: content before/after tag preserved, only content between opener and closer is replaced.
- Trailing newline at file end preserved or absent per source.

### 10.5 Format-time validation

- Missing flag → distinct error.
- Missing entire `flags` parameter → distinct error.
- Missing variable → distinct error.
- Wrong boolean type → error.
- Wrong enum type → error.
- Enum value outside allowed set → error.
- Extra flags → silently ignored, no error, no warning.
- Extra variables → silently ignored, no error, no warning.
- Reserved keyword as input key → error.
- Reserved keyword as variable value (string) → allowed.
- Custom metadata on a top-level field is reachable via `prompt.meta.extras`.
- Custom metadata on a flag declaration is reachable via the flag's `extras` map.
- Custom metadata on a variable declaration is reachable via the variable's `extras` map.
- `metadata: "ignore"` mode treats the whole file as prompt body; an invalid header-looking block is not frontmatter and is not a metadata error in this mode.

### 10.6 Cross-language conformance

Once TypeScript stabilizes, all implementations run `docs/specs/fixtures/` end-to-end. For each fixture:

- Parse the prompt.
- Load `input.json` and `options.json` (loader options).
- Call `format()`.
- Compare output bytes to `expected.txt`, OR compare structured error category/code and key message information to `expected-error.json`. Line and column fields may be included by an implementation but are optional in shared fixtures.

The conformance corpus represents inputs as JSON with `flags` as a nested object; each language's test harness translates this to its native call shape.

### 10.7 Property-based tests

1. Rendering is deterministic for the same prompt and input.
2. Declaration order in frontmatter does not affect output.
3. Keyword lines never appear in output (block form).
4. All variables appearing in prompt body are required regardless of active branch.
5. Removing an `{if flag}...{end}` block in its entirety from a prompt produces the same output as rendering with `flag = false`, assuming variables referenced only inside that block are no longer required.

### 10.8 Fuzz

- Random byte sequences as prompt source: parser must not crash; must produce a clear error.
- Random JSON as format input: formatter must not crash; must produce a clear error.
- Deep nesting: parser must either succeed or fail clearly without stack overflow.

### 10.9 Performance smoke

- Representative prompt (~50 lines, 5 flags, 3 nesting levels) parses in a practical time.
- Pathological prompt (~5000 lines, deeply nested) parses without catastrophic behavior.

Exact thresholds are set after the reference implementation exists.

---

## 11. Cross-language considerations

### 11.1 String identity

Rendered output must be **byte-identical** across TypeScript, Python, and Julia for the same prompt file and inputs.

Rules:

- Normalize CRLF to LF at load time.
- Preserve source newlines after normalization.
- Do not strip or add trailing newlines.
- UTF-8 throughout. No encoding conversions.
- UTF-8 BOM stripped at load time.

### 11.2 Frontmatter parsing

Each language uses standard or vetted TOML/YAML libraries:

- **TypeScript:** vetted TOML and YAML packages (e.g. `@iarna/toml`, `yaml`).
- **Python:** `tomllib` (stdlib ≥3.11) or `tomli`; `PyYAML` or `ruamel.yaml`.
- **Julia:** `TOML` stdlib; `YAML.jl`.

The conformance subset of supported value types is:

- Strings
- Integers within i64 range
- Booleans
- Arrays
- Tables / objects

Dates and times are represented as strings in conformance fixtures to avoid cross-parser differences.

### 11.3 API differences

Each language exposes idiomatic call patterns, but all must support:

- Named variables.
- A dedicated `flags` parameter or object.
- `format()` as the primary formatting operation (or a language-idiomatic equivalent with identical semantics).
- Loader options: `frontmatterFormat` (or `frontmatter_format`) and `metadata`.

The conformance corpus represents inputs as JSON with `flags` as a nested object; harnesses translate to native shapes.

### 11.4 Error reporting

Cross-language conformance focuses on:

- Error category.
- Stable code if implemented.
- Key message information.
- Source location only when an implementation already exposes it reliably; shared fixtures should not require exact line/column values.

Exact prose may vary by language.

---

## 12. Authoring skill

A companion document, `docs/authoring-skill.md`, guides humans and LLMs on writing and editing conditional prompts.

It covers:

- When to use `{if}` vs `{switch}`.
- How to declare flags with descriptions and custom metadata.
- Why all body variables must be wired even in inactive branches.
- Why block keywords are alone on their lines.
- Why dashes are not allowed in variable or flag names.
- Why prompt-body comments are not supported.
- Common patterns (gating a section, choosing between variants, optional context, small inline phrase insertion).
- Anti-patterns (deep nesting, caller logic embedded in prompts, comments in prompt body, pseudo-expressions).
- How to choose `metadata: "allow"` vs `metadata: "strict"`.
- How `metadata: "ignore"` treats the whole file as prompt body.
- Debugging missing-flag and missing-variable errors.

This skill is essential because LLMs editing prompts will otherwise import Handlebars/Jinja assumptions into textprompts.

---

## 13. Future considerations

Out of scope for v2.0 but worth tracking:

- Named variant fixtures for evals.
- CLI tooling: `textprompts lint`, `textprompts preview`, `textprompts variants`.
- Render/format trace mode (which branches fired, for observability).
- Tree-sitter grammar for editor support.
- Flag expiry warnings driven by custom metadata on flags (read from `extras`).
- Lint pass surfacing unused inputs by diffing caller context against `prompt.meta.flags` / `prompt.meta.variables`.
- Global default for `metadata` mode (env var or library-level config).

---

## Appendix A — Design rationale

**Why `{if}` instead of `{#if}`?**
To avoid Handlebars/Jinja confusion and mistakes around single vs double braces. textprompts uses single braces consistently.

**Why `{end}` instead of `{/if}` or `{endif}`?**
`{/if}` looks like Handlebars and invites double-brace habits. `{end}` is short, readable, and keeps the syntax in one tag family. Lua and Ruby use the same pattern. Nested `{end}` can be harder to review, but deep nesting is discouraged.

**Why not `{end if}`?**
Clunkier and does not solve nested conditionals of the same type. The design relies on shallow structure, clear switch cases, and good parser errors.

**Why allow indented block keywords (no column-1 requirement)?**
Indented keyword lines make nesting visually obvious. The "alone on its line" rule preserves the structural clarity column-1 was meant to provide, without punishing authors who indent for readability.

**Why do block keyword lines disappear entirely?**
Control tags are structure, not content. Removing the whole keyword line gives predictable output: body lines stay exactly where authors wrote them.

**Why do inline tags only replace what's between opener and closer?**
Surrounding text on the same line is content the author chose to write there. Inline conditionals exist for "small phrase insertion" patterns where the surrounding sentence is the point.

**Why require variables in inactive branches?**
Because inactive branches can become active later when a flag changes. Requiring all body variables to be wired catches missing inputs before that happens.

**Why remove positional placeholders?**
They are easy to misuse and hard to review. Named variables are explicit, stable under editing, and clearer in PRs.

**Why no comments in prompt body?**
Prompt body is prompt content. Documentation belongs in frontmatter so it doesn't risk leaking into model-visible text.

**Why exhaustive switches?**
Adding an enum value without updating every prompt that switches on it is exactly the kind of silent drift this design is meant to catch.

**Why no defaults for flags?**
Flag values are runtime decisions made by caller code based on user context, rollout state, A/B bucket, etc. Defaults in prompt files hide those decisions and make rollouts harder to reason about.

**Why allow custom metadata on flags and variables?**
Flags accumulate operational context: owner, expiry, rollout, ticket, review date. Keeping that metadata in frontmatter keeps it version-controlled next to the prompt.

**Why strict mode requires standard metadata and flag descriptions?**
Strict mode is for production prompts and CI. Requiring `title`, `description`, and `version` keeps the prompt catalog reviewable across every implementation. Flags are the moving parts in feature-flag-driven prompt evolution, so every declared flag must carry a non-empty description, even if a particular prompt revision does not currently reference it. Variables are usually obvious from context (a `{user_name}` is a user name), so variable declarations remain optional.

**Why empty prompt files fail to load?**
A prompt that produces no output is almost always a mistake — likely a copy-paste error or a misconfigured loader. Failing loud catches it immediately.

**Why TOML first with YAML fallback?**
TOML has fewer parsing ambiguities and is the existing textprompts default. YAML support exists for compatibility with users who prefer it. Explicit override is available for both.

**Why keep `metadata: "ignore"` alongside `"allow"` and `"strict"`?**
"Ignore" is the escape hatch when frontmatter parsing itself is the problem — a broken TOML/YAML header, a prompt file maintained by another system that puts non-textprompts content above `---`, or an iteration session where the author wants to edit body text without re-validating the header every reload. "Allow" tries to parse and validates the result; "ignore" doesn't try at all and treats the whole file as prompt body. This avoids the budge where a caller has to choose between an unparseable header blocking work and manually copying file bytes into a separate prompt body.

**Why are extra inputs silently ignored, and why expose extras as data instead?**
A prompt is a function over a context object. Callers routinely pass a broad context to many prompts; trimming it per-prompt is friction. Warnings on extras would either be noisy in real apps or get filtered out and forgotten. At the same time, custom frontmatter fields (owner, expiry, rollout, review date) carry real operational value — they shouldn't be discarded. The split lands cleanly: at format time, only declared/used inputs matter; at load time, every custom field is preserved and reachable. Callers that want unused-input detection can diff their context against `prompt.meta.flags` / `prompt.meta.variables` themselves.

---

*End of specification v2.0.*
