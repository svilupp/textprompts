---
name: writing-prompts-with-textprompts
description: Author and edit textprompts prompt files. Use when writing or editing files that use the textprompts format — frontmatter, {var} placeholders, {if}/{switch} conditionals, flags, and metadata modes.
---

# Writing prompts with textprompts

> **Status note.** This skill describes the conditional-syntax prompt-file format defined in `docs/specs/SPEC_conditional_syntax_v2.md`. The TypeScript port in `packages/textprompts-ts/` is the reference implementation; the Python engine (`src/textprompts/`) ships once the TS reference and the `docs/specs/fixtures/` corpus stabilize. Each language port versions independently — consult the port's own `CHANGELOG.md` for which release contains the syntax described here. The surface, syntax, and metadata model below are normative — see the SPEC for the full specification. Rule citations such as "(SPEC §5.2)" refer to that document.

This skill teaches humans and LLMs how to write `.txt` prompt files in the textprompts format. The format is intentionally minimal: prose with `{name}` holes, optional frontmatter for metadata, and a small conditional syntax (`{if}`, `{switch}`) for feature-flag-style prompt management.

If you are coming from Handlebars, Jinja, or Mustache, **stop and read §"Coming from Handlebars or Jinja"** before writing anything. textprompts deliberately does not work the way those engines work, and the mistakes import directly.

---

## What a textprompts file looks like

Minimal, no frontmatter:

```
You are a {role}.
Be concise.
```

With frontmatter, flags, and a switch:

```
---
title = "Customer support agent"
version = "2.1"
description = "Support prompt with tier-based variants"
owner = "@support-eng"

[flags.tier]
type = "enum"
values = ["free", "premium", "enterprise"]
description = "User subscription tier"

[flags.has_history]
description = "Whether prior conversation context is available"

[variables.user_name]
description = "The user's display name"
---
You are a helpful support agent assisting {user_name}.

{switch tier}
{case free}
Standard support. Response times may vary.
{case premium}
Priority support: response within 1 hour.
{case enterprise}
Dedicated account manager.
{end}

{if has_history}
The user previously asked: {last_question}
{end}

How can I help today?
```

That is the whole format. Everything below is rules and patterns for working inside it.

---

## Coming from Handlebars or Jinja

These habits will produce broken textprompts files. Drop them before writing:

| Habit from elsewhere | What to do in textprompts |
|---|---|
| `{{ var }}` (double braces) | `{var}` (single braces only) |
| `{{#if x}}...{{/if}}` | `{if x}...{end}` |
| `{% if x and y %}` or `{if x && y}` | Compose in caller code; pass a single flag. textprompts has no boolean expressions (SPEC §1.2) |
| `{if tier == "premium"}` | `{switch tier}{case premium}...{end}` (SPEC §1.2) |
| `{% else if %}` / `{elif}` chains | Use `{switch}`, or restructure (SPEC §1.2) |
| `{% comment %}...{% endcomment %}` | Not supported in the body. Put documentation in frontmatter `description` or per-flag/per-variable `description`/`extras` (SPEC §1.2, §5.8) |
| Defaults for variables and flags | The caller always passes flags and variables explicitly (SPEC §1.2, §5.2) |
| Loops, partials, helpers, includes | Not supported. textprompts is prose-with-holes, not a template language (SPEC §1.2) |
| Variables only required in the active branch | **Variables are required everywhere they appear in the body, even in inactive branches** (SPEC §5.2). This is the single most-broken assumption — read §"All body variables are required" below before anything else. |

---

## Tags, identifiers, and reserved words (SPEC §2)

**Variable:** `{name}`.

**Conditional tags:** `{if flag}`, `{if !flag}`, `{else}`, `{end}`, `{switch flag}`, `{case value}`.

**Identifier rule (SPEC §2.1):** `[a-zA-Z_][a-zA-Z0-9_]*`. ASCII only, snake_case. Used for variable names, flag names, and enum case values.

- Dashes are not allowed: `{user-name}` is a parse error. Use `{user_name}`.
- Identifiers cannot start with a digit: `{1st_question}` is a parse error.
- Unicode identifiers are not supported.

**Reserved keywords (SPEC §2.1):** `if`, `else`, `end`, `switch`, `case`, `flags`. These cannot be used as flag names, variable names, or enum case values, anywhere. `flags` is reserved because it is the dedicated parameter name in `format()`.

**Why these rules?** They keep the syntax unambiguous for parsers and reviewers, prevent collisions with the format API, and make every prompt look the same in every codebase. `{user-Name}` / `{userName}` / `{UserName}` would all need to mean the same thing or all need to be errors; textprompts picks "all errors except `{user_name}`".

**Case rule inside tags (SPEC §2.3):** keywords must be lowercase. `{IF flag}` and `{If flag}` are parse errors.

**Whitespace rule inside tags (SPEC §2.3):** no leading or trailing whitespace inside braces. `{ if flag }` is a parse error. This is what lets prose like `{ x | x > 0 }` render literally without being mistaken for a tag.

**Escapes (SPEC §2.4):** `\{`, `\\`, `\}`. No other escape sequences. Legacy `{{...}}` double-brace escaping does **not** work.

**Removed in v2 (SPEC §1.1):** positional placeholders (`{0}`), empty placeholders (`{}`), `{{ ... }}` double-brace escaping.

---

## `{if}` vs `{switch}`

- Use `{if flag}` for a single boolean toggle: include something or not.
- Use `{if !flag}` for the negated form.
- Use `{switch flag}` with `{case X}` branches for a finite enum (e.g. `tier = "free" | "premium" | "enterprise"`).

Do **not** use `{if}` with comparisons. textprompts has no `{if tier == "premium"}` form — that is exactly what `{switch}` is for (SPEC §1.2).

Do **not** chain `{else if}` / `{elif}`. Use `{switch}`, or restructure (SPEC §1.2).

Do **not** combine flags inside the tag. There is no `{if a && b}` or `{if a || !b}`. If you need a combined condition, compute it in your application code and pass a single derived flag (SPEC §1.2):

```python
# in your code, not the prompt
flags = {"show_upgrade_cta": tier == "free" and not has_seen_cta}
```

```
{if show_upgrade_cta}
Tip: upgrade to premium.
{end}
```

---

## Block form vs inline form (SPEC §3.2, §3.3)

Every `{if}` or `{switch}` is **either** inline **or** block. The two cannot be mixed in one construct.

### Block form

Every control keyword tag — `{if}`, `{else}`, `{case}`, `{switch}`, `{end}` — is **alone on its own line**: whitespace allowed before and after, no other non-whitespace content on that line. Indentation is fine and encouraged for nesting.

A block-form keyword line is **removed entirely**, including its leading whitespace and the trailing newline (SPEC §3.3). Body lines are preserved exactly as written.

```
Items:
{if include_items}
  - Alpha
  - Beta
{end}
Done.
```

With `include_items = true` → `Items:\n  - Alpha\n  - Beta\nDone.\n`. With `include_items = false` → `Items:\nDone.\n`. The whole block (body + gating keyword lines) is removed when the branch does not render; no stray whitespace is left behind.

### Inline form

The entire construct — opener, body, optional `{else}` / `{case}` separators, and `{end}` — is on **one physical line**. Anything before the opener and after the closer on that line is **preserved verbatim** (SPEC §3.3):

```
You are a {role}{if is_admin} (administrator){end}.
```

With `is_admin = true`: `You are a Jan (administrator).`
With `is_admin = false`: `You are a Jan.`

The trailing `.` after `{end}` is content the author wrote; it stays in both cases.

### Mixed form is forbidden

All parse errors (SPEC §3.2):

```
prefix {if flag}
body
{end}

{if flag}
body {end}

{if flag} body
{else}
other
{end}
```

If the opener is alone on its line, the construct is block form and every related keyword must be alone on its line. If the opener shares its line with content, the construct is inline and the closer must be on the same line.

---

## All body variables are required (SPEC §5.2)

**Any flag or variable referenced anywhere in the prompt body must be passed at format time, regardless of which branch fires.**

This is the single most-broken assumption when porting habits from Jinja, Handlebars, or other template engines. Read this twice.

```
{if has_history}
Previous question: {last_question}
{end}
```

When you call `format()`, you must pass both `has_history` and `last_question`. Even when `has_history = false` and the branch does not render, `last_question` is still required.

**Why.** Inactive branches become active later when a flag flips. Requiring all body variables to be wired catches missing inputs **now** instead of when a flag flips in production.

**If a variable is genuinely optional from the caller's side, pass it as `""` or `None` explicitly.** That makes the optionality visible at the call site, where it belongs.

---

## Frontmatter (SPEC §4)

Frontmatter is optional in the default loader mode. When present, it is delimited by `---` lines and is parsed as TOML first, with YAML as a fallback. Use TOML unless you have a reason not to. `+++` delimiters are not accepted on purpose.

### Standard fields

```toml
title = "Support agent"
version = "1.3"
description = "Customer support system prompt"
```

Plus the optional `author` and `created`. **Any other top-level field is preserved as custom metadata** (SPEC §4.2, §5.8); see "Custom metadata" below.

### Declaring flags (SPEC §4.3)

Boolean flag, full form:

```toml
[flags.premium_tier]
type = "boolean"
description = "User is on the premium subscription tier"
```

Boolean flag, shorthand (`type` defaults to `"boolean"`):

```toml
[flags.premium_tier]
description = "User is on the premium subscription tier"
```

Enum flag:

```toml
[flags.tier]
type = "enum"
values = ["free", "premium", "enterprise"]
description = "User subscription tier"
```

Per-flag fields beyond `type` / `values` / `description` are preserved as custom metadata on the flag (SPEC §4.3.1). Common ones:

```toml
[flags.tier]
type = "enum"
values = ["free", "premium", "enterprise"]
description = "User subscription tier"
owner = "@product"
expires = "2026-12-01"
rollout = "100%"
jira_ticket = "PROD-1234"
```

### Declaring variables (SPEC §4.4)

Variable declarations are documentation. They are optional. A variable is required at format time **if and only if it appears in the body**, regardless of whether it is declared.

```toml
[variables.role]
description = "The expert role the assistant should adopt"

[variables.last_question]
description = "Previous user query, if any"
owner = "@support-eng"
```

Per-variable fields beyond `description` are preserved as custom metadata (SPEC §4.4.1).

### Implicit (no-frontmatter) mode (SPEC §4.5)

A prompt with no frontmatter is valid. `{name}` references become variables, `{if foo}` implicitly defines `foo` as a boolean flag, and `{switch foo}` implicitly defines `foo` as an enum with values inferred from the `{case X}` branches present. Implicit flags appear in `prompt.meta.flags`. Every flag and variable referenced in the body must still be passed.

---

## Metadata modes: `allow`, `strict`, `ignore` (SPEC §4.6)

The loader takes a `metadata` option:

### `metadata="allow"` (default)

- Frontmatter is optional.
- If present, it is parsed and validated.
- Implicit declarations (from body usage) are permitted.
- Use this for prototyping and most drop-in uses.

### `metadata="strict"`

- Frontmatter is **required**. No frontmatter, or empty frontmatter, is a load error.
- `title`, `description`, and `version` are required and must be non-empty.
- Every flag referenced in the body must be declared in `[flags.*]`, and every declared flag must have a non-empty `description`.
- Variables remain optional to declare even in strict mode. The goal is operational discipline around flags, which are the moving parts.
- Use this for production prompts and CI checks.

### `metadata="ignore"`

- **The entire file is treated as prompt body.** No header stripping, no schema, no frontmatter validation.
- No flags or variables are declared from frontmatter; flags are implicit, inferred from the full file body.
- The prompt's `title` defaults to the source filename stem.
- Use this as an **escape hatch** when frontmatter parsing itself is the problem: a file with a broken TOML/YAML header, a prompt maintained by another system that puts non-textprompts content above `---`, or an iteration session where you want to read the file as-is without validating its header.

If you find yourself unsure, leave it on `"allow"`. Switch to `"strict"` for production once you have frontmatter. Reach for `"ignore"` only when you are reading a file that is not really a textprompts file.

---

## Reading custom metadata (SPEC §5.8, §6.5)

All metadata — standard fields, flag declarations, variable declarations, and custom `extras` — lives under `prompt.meta`. Custom fields appear in three places:

```python
prompt = load_prompt("./prompts/support.txt")

# Standard fields
prompt.meta.title           # "Customer support agent"
prompt.meta.version         # "2.1"
prompt.meta.description     # ...

# Top-level custom fields (anything beyond title/version/description/author/created)
prompt.meta.extras["owner"]          # "@support-eng"
prompt.meta.extras["last_reviewed"]  # "2026-04-30"

# Per-flag declarations
prompt.meta.flags["tier"].kind         # "enum"
prompt.meta.flags["tier"].values       # ["free", "premium", "enterprise"]
prompt.meta.flags["tier"].description  # "User subscription tier"
prompt.meta.flags["tier"].extras["owner"]    # "@product"
prompt.meta.flags["tier"].extras["expires"]  # "2026-12-01"

# Per-variable declarations
prompt.meta.variables["last_question"].description  # "Previous question, if any"
prompt.meta.variables["last_question"].extras       # {}
```

Values preserve their original TOML/YAML types. Custom metadata never affects rendering — it is purely for callers to read (tooling, CI lint passes, ownership dashboards, expiry checks).

---

## Extra inputs at `format()` are silently ignored (SPEC §5.7)

Extra flags or variables passed to `format()` that the prompt does not reference are **silently ignored**. No warning, no error.

This is intentional: a real app routinely passes a broad context object to many prompts. Per-prompt trimming would be friction without a payoff.

**If you want unused-input detection**, diff your context against the prompt's declared/referenced flags and variables:

```python
context_vars = set(my_context.keys()) - {"flags"}
declared_vars = set(prompt.meta.variables.keys())
unused = context_vars - declared_vars
# Or, more strictly: compare against the set of variables actually referenced
# in the body (exposed once the engine lands; today, infer from prompt.meta).
```

---

## Common patterns

### Pattern 1: Gating a section with `{if}`

Include extra context only when a flag is on:

```
You are a customer support agent.

{if has_history}
The user previously asked: {last_question}
Reply consistently with that earlier exchange.
{end}

How can I help?
```

Frontmatter:

```toml
[flags.has_history]
description = "Whether prior conversation context is available"
```

`last_question` is required at format time **even when `has_history = false`** (SPEC §5.2).

### Pattern 2: Switch on a tier enum

Render different copy per subscription tier. Exhaustive switch, no `{else}` needed (SPEC §5.3):

```
{switch tier}
{case free}
You have standard support. Response times may vary.
{case premium}
You have priority support with response within 1 hour.
{case enterprise}
You have a dedicated account manager.
{end}
```

Frontmatter:

```toml
[flags.tier]
type = "enum"
values = ["free", "premium", "enterprise"]
description = "User subscription tier"
```

Add a `{case enterprise}` later? You must also add (or `{else}`) it in every prompt that switches on `tier` — that is exactly the silent drift exhaustiveness checks are meant to catch (SPEC §5.3).

### Pattern 3: Optional context block with nested switch

Mix `{if}` and `{switch}`. Indented block keywords are valid (SPEC §3.4):

```
{if is_authenticated}
Welcome back, {user_name}.
  {switch tier}
  {case free}
You are on the free plan.
  {case premium}
You are on premium. Priority support is active.
  {case enterprise}
Enterprise support is active.
  {end}
{else}
Please sign in.
{end}
```

Deep nesting is valid but discouraged; prefer a flatter structure or caller-side composition.

### Pattern 4: Small inline phrase insertion

Inline form is for short, in-sentence variants. Punctuation outside the tags stays put (SPEC §3.3):

```
You are a {role}{if is_admin} (administrator){end}.
The user is on the {if premium_tier}premium{else}free{end} plan.
```

With `role = "Julia expert"`, `is_admin = true`, `premium_tier = false`:

```
You are a Julia expert (administrator).
The user is on the free plan.
```

Use inline form when the surrounding sentence is the point. Reach for block form for anything that spans multiple lines.

---

## Anti-patterns

Each of these is rejected by the parser or the formatter. Memorize the errors.

### Anti-pattern 1: Boolean expressions inside `{if}` (pseudo-expressions)

```
{if tier == "premium" && has_history}
...
{end}
```

**Error.** `{if}` takes a single flag identifier (optionally negated with `!`), nothing else (SPEC §1.2, §2.2):

> *parse error: `{if tier == "premium" && has_history}` — `{if}` takes a single flag identifier; compose conditions in caller code and pass a derived flag*

**Fix.** Compute the condition in caller code; pass a single derived flag (`flags={"show_premium_history_note": tier == "premium" and has_history}`).

### Anti-pattern 2: Comments in the prompt body

```
{# this branch handles enterprise customers #}
{if tier_is_enterprise}
...
{end}
```

Or `<!-- ... -->`, or `// ...`. **None of these are comments in textprompts.** The `{# ... #}` form is a parse error because `#` is not a valid identifier start (SPEC §2.1):

> *parse error: `{# this branch handles enterprise customers #}` — malformed tag; tags are `{name}` or `{if name}` / `{switch name}` / `{case name}` / `{else}` / `{end}`*

`<!-- ... -->` and `// ...` are not errors — they render verbatim into the prompt body, which is almost certainly not what you want.

**Fix.** Put documentation in frontmatter (SPEC §1.2, §5.8). Use `description` fields on the prompt, on each flag, and on each variable, and add custom metadata fields (`owner`, `last_reviewed`, `jira_ticket`) for ownership and review state.

### Anti-pattern 3: Mixed inline / block form

```
{if flag} short body
{end}
```

**Error.** The opener shares its line with `short body`, making this inline, but `{end}` is on the next line. Mixed form is forbidden (SPEC §3.2):

> *parse error: construct mixes inline and block form; either keep everything on one line or put every keyword tag on its own line*

**Fix.** Pick one form: `{if flag} short body {end}` (inline) or all three tags on separate lines (block).

### Anti-pattern 4: Dashed or uppercase identifiers

```
{user-name}
{If flag}
```

**Errors.** Identifiers are `[a-zA-Z_][a-zA-Z0-9_]*` (SPEC §2.1) and keywords must be lowercase (SPEC §2.3):

> *parse error: `{user-name}` — invalid identifier; identifiers are snake_case ASCII (no dashes)*
> *parse error: `{If flag}` — control keywords must be lowercase*

Note: `{if Flag}` is **not** a keyword-case error — `if` is lowercase. But `Flag` (capital F) is a valid identifier, so the prompt loads and `Flag` becomes the flag name. This is almost never what the author meant. Stick to snake_case for all identifiers.

### Anti-pattern 5: Deep nesting and embedded caller logic

Three or more levels of nested `{if}` / `{switch}` is legal but a warning sign that prompt-level branching is doing work the caller should do. Refactor by computing the scenario flag in caller code (`scenario = "premium_with_unread"` etc.), passing a single derived flag, and flattening the prompt.

---

## Debugging errors

### "flag `X` required but not provided"

The body references `{if X}` or `{switch X}` but you did not pass `X` under `flags=`. Pass it explicitly. **Even if the branch will not render, the caller must still provide the flag value** (SPEC §5.6).

### "variable `Y` required but not provided"

The body references `{Y}` somewhere — possibly inside an inactive `{if}` branch — but you did not pass it. Pass `Y` explicitly, even as `""` or `None` if it is genuinely optional from your side (SPEC §5.2, §5.6).

### "prompt requires `flags` parameter but none was passed"

The body uses at least one `{if}` or `{switch}`, but you called `format()` with no `flags=` argument at all. Pass `flags={"name": value, ...}` (SPEC §5.6).

### "flag `tier` got value `trial`, expected one of [free, premium, enterprise]"

You passed an enum value that is not in the declared `values` list. Either add `"trial"` to the `[flags.tier]` `values` array (and a `{case trial}` branch in every switch that needs it), or pass a declared value (SPEC §5.5).

### "flag `premium_tier` got string, expected boolean"

You passed `"true"` (a string) instead of `True` / `true` (the language's actual boolean) for a boolean flag. There is no coercion (SPEC §5.5).

### "switch on `tier` missing cases: [enterprise]. Add `{case enterprise}` or `{else}`."

The flag declares more values than the switch covers. Either add the missing `{case X}` branches or add an `{else}` catch-all branch (SPEC §5.3).

### "prompt file is empty"

The file is zero bytes or whitespace-only after preprocessing. A prompt that produces no output is almost always a bug — likely a copy-paste error or a misconfigured loader (SPEC §2.5).

### "frontmatter parse error: ..."

The TOML (or YAML, in auto mode) parser rejected the header. Fix the header — or, as an escape hatch for files you do not control, load with `metadata="ignore"` to treat the whole file as body (SPEC §4.6).

### When in doubt: inspect `prompt.meta`

If `format()` complains about a flag or variable you swear you wired up, print `prompt.meta.flags` and `prompt.meta.variables`. The set of names the engine sees is exactly what the body references plus the frontmatter declarations. Anything missing from your call is the culprit.

---

## Reference files

Deeper material lives in `references/`:

- [Conditional syntax cheatsheet](references/conditional-syntax-cheatsheet.md) — one-page normative grammar reference.
- [TypeScript quickstart](references/typescript-quickstart.md) — `loadPrompt` to `format()` walkthrough for the TS reference implementation.
- [Python quickstart](references/python-quickstart.md) — `load_prompt` to `format()` walkthrough with runnable snippets (Python port).
- [Anti-patterns](references/anti-patterns.md) — longer-form catalogue of mistakes with rationale and parser errors.
- [Error debugging](references/error-debugging.md) — error class to cause to fix table, with stable error codes.
- [Migration from earlier releases](references/migration-from-v1.md) — concrete before/after diffs for placeholders, frontmatter, and `format()` calls.

---

## Quick author checklist

Before committing a prompt file, walk this list:

- Every `{if}` and `{switch}` has a matching `{end}`.
- Every keyword tag in block form is alone on its line (indentation OK).
- Inline constructs are fully on one line.
- Every variable that appears in the body is passed at `format()`, including in inactive branches.
- Every flag that appears in the body is passed under `flags=`, including in inactive branches.
- All identifiers are snake_case ASCII; no dashes, no leading digits, no reserved words (`if`, `else`, `end`, `switch`, `case`, `flags`).
- Switches on declared enums are exhaustive, or have an `{else}` catch-all.
- For production prompts: frontmatter has non-empty `title`, `description`, `version`, every referenced flag is declared, and every declared flag has a non-empty `description` (`metadata="strict"` will check this).
- No comments in the body. Documentation goes in frontmatter `description` fields and per-flag / per-variable `extras`.
