# Anti-patterns

Common mistakes that look reasonable, what the parser does about them, and what to write instead. Each entry cross-links to the relevant section of `docs/specs/SPEC_conditional_syntax_v2.md`.

> Error-message wording below is the SPEC's intended diagnostic (SPEC §7). Cross-language conformance matches on error category and key message tokens, not exact prose (SPEC §11.4), so an implementation may vary the wording. The error class (`ConditionalSyntaxError`, `FrontmatterSchemaError`, `ConditionalSemanticError`, `FormatValidationError`) is stable.

---

## 1. Deep nesting

**Anti-pattern.** Stacking three or more `{if}` / `{switch}` blocks inside each other to encode multi-dimensional branching in the prompt file.

```
{if is_authenticated}
  {if has_subscription}
    {switch tier}
    {case premium}
      {if has_unread}
You have {unread_count} unread messages.
      {end}
    {case enterprise}
      {if has_unread}
You have {unread_count} unread messages.
      {end}
    {end}
  {end}
{end}
```

**Why it's wrong.** The parser permits this (SPEC §3.5 — nesting is legal, SPEC §3.1 — style guidance only, not enforced), so there is no error. The problem is human: the prompt becomes unreadable, branch coverage is hard to reason about, and review diffs are noisy. SPEC §3.1 explicitly calls out deep nesting as discouraged in the authoring skill (SPEC §12).

**Error.** None at parse or format time. This is a review/authoring failure mode, not a parser failure mode.

**What to write instead.** Compose the conditions in caller code into one or two coarse flags, then keep the prompt flat. Or flatten the branching into one `{switch}` over a derived enum.

```python
# Caller composes the decision.
show_unread_banner = is_authenticated and has_subscription and tier in {"premium", "enterprise"} and has_unread

prompt.format(
    unread_count=unread_count,
    flags={"show_unread_banner": show_unread_banner},
)
```

```
{if show_unread_banner}
You have {unread_count} unread messages.
{end}
```

See SPEC §3.1 (style guidance) and SPEC §12 (authoring skill).

---

## 2. Boolean expressions in `{if}`

**Anti-pattern.** Treating `{if}` as a general boolean expression.

```
{if has_history && is_premium}
Previous question: {last_question}
{end}
```

**Why it's wrong.** `{if}` accepts exactly one identifier, optionally prefixed by `!`, and nothing else (SPEC §2.2, SPEC §2.3). Operators like `&&`, `||`, `!=` are not part of the grammar. SPEC §1.2 explicitly excludes boolean expressions in conditionals and instructs callers to compose flags in code.

**Error.** `ConditionalSyntaxError`. The lexer reads `has_history && is_premium` as a malformed flag name because the identifier rule rejects everything after the first invalid character. Expected diagnostic shape: *"invalid identifier in `{if}`: `has_history && is_premium`. `{if}` accepts a single flag name; compose boolean expressions in caller code."* (See SPEC §7.2 "bare keyword tags missing required arguments" and SPEC §1.2 for the rationale.) Exact wording is not pinned by the SPEC.

**What to write instead.** Compose in caller code; pass the result as one flag.

```python
prompt.format(
    last_question=last_question,
    flags={"show_history": has_history and is_premium},
)
```

```
{if show_history}
Previous question: {last_question}
{end}
```

See SPEC §1.2, §2.2, §2.3.

---

## 3. Value comparisons in `{if}`

**Anti-pattern.** Comparing a flag value to a literal inside `{if}`.

```
{if tier == "premium"}
You have priority support.
{end}
```

**Why it's wrong.** `{if}` takes a single boolean flag identifier (SPEC §2.2). Value comparisons are explicitly out of scope (SPEC §1.2). The construct designed for value branching is `{switch}` (SPEC §3, SPEC §5.3).

**Error.** `ConditionalSyntaxError`. The `==` and `"premium"` tokens are not valid in an `{if}` opener; the lexer reports an invalid identifier. Expected diagnostic shape: *"invalid identifier in `{if}`: `tier == \"premium\"`. Use `{switch tier}` with `{case premium}` for value branching."* See SPEC §7.2.

**What to write instead.** Use `{switch}` against the enum flag.

```toml
[flags.tier]
type = "enum"
values = ["free", "premium", "enterprise"]
description = "Subscription tier"
```

```
{switch tier}
{case premium}
You have priority support.
{else}
Standard support.
{end}
```

See SPEC §1.2, §3, §5.3.

---

## 4. Comments in the prompt body

**Anti-pattern.** Adding `# ...`, `<!-- ... -->`, or `{# ... #}` Jinja-style notes inside the prompt body to explain a flag or branch.

```
# This branch only fires on the premium tier.
{if premium_tier}
Priority support is active.
{end}
```

**Why it's wrong.** textprompts does not define a comment syntax in the prompt body (SPEC §1.2: "Comments in the prompt body" is explicitly out of scope; SPEC §13 rationale: "Prompt body is prompt content. Documentation belongs in frontmatter so it doesn't risk leaking into model-visible text"). `# This branch only fires on the premium tier.` is rendered verbatim into the model context.

**Error.** None. The line is treated as literal prompt text and sent to the model. The bug is silent leakage into output.

**What to write instead.** Move the documentation into frontmatter. Standard fields (`description`) carry the prompt-level summary; per-flag `description` and per-flag custom `extras` carry per-flag operational notes (SPEC §4.3, §5.8, §6.5).

```toml
---
title = "Support prompt"
version = "1.3"
description = "Support agent prompt. The premium_tier branch surfaces priority-support copy."

[flags.premium_tier]
description = "User is on the premium subscription tier."
owner = "@support-eng"
review_note = "This branch only fires on the premium tier. Do not remove without notifying @support-eng."
---
{if premium_tier}
Priority support is active.
{end}
```

The `review_note` field is preserved as `prompt.meta.flags["premium_tier"].extras["review_note"]` (SPEC §5.8, §6.5).

See SPEC §1.2, §4.3.1, §5.8.

---

## 5. Stripping `{var}` from a branch because "we don't need it when the flag is off"

**Anti-pattern.** Removing a variable from the caller payload because the branch that uses it is not active in the current call.

```
{if has_history}
Previous question: {last_question}
{end}
```

```python
# has_history is false today, so last_question feels unnecessary.
prompt.format(flags={"has_history": False})
```

**Why it's wrong.** This is the single most-violated rule in the SPEC: **every flag and variable referenced anywhere in the prompt body must be passed at format time, regardless of which branch fires** (SPEC §5.2). Inactive branches can become active later when a flag flips, and the design exists precisely to catch missing wiring before that happens (SPEC §13 rationale: "Why require variables in inactive branches?"). Allowing a "silent fallback" — treating missing variables as `""` — is forbidden (SPEC §1).

**Error.** `FormatValidationError`. Expected diagnostic shape: *"variable `last_question` required but not provided"* (SPEC §5.6, §7.4). The error fires even though `has_history = False` and the branch will not render.

**What to write instead.** Always pass every body reference. If the variable is genuinely optional from the caller's perspective, pass an explicit empty string or `None`-equivalent — that decision then lives visibly at the call site (SPEC §5.2 rationale).

```python
prompt.format(
    last_question=last_question or "",
    flags={"has_history": has_history},
)
```

See SPEC §5.2, §5.6, §7.4.

---

## 6. Mixing inline and block form for one construct

**Anti-pattern.** Starting a construct inline (the opener has surrounding text on the same line) and closing it block-style on a later line, or vice versa.

```
prefix {if flag}
multi-line body
{end}
```

```
{if flag}
body {end}
```

**Why it's wrong.** Each conditional must be either entirely inline (opener, body, separators, closer all on one physical line) or entirely block (every control keyword tag alone on its own line). Mixing the two is forbidden (SPEC §3.2).

**Error.** `ConditionalSyntaxError`. Expected diagnostic shape: *"mixed inline/block form: `{if flag}` opens inline (other content on the line) but its `{end}` is on a later line. Keep the entire construct on one line or put every keyword tag alone on its own line."* See SPEC §7.2 ("mixed inline/block form for one construct").

**What to write instead.** Pick a form per-construct (form is judged independently for each construct on the same line, SPEC §3.2). For multi-line bodies, use block form throughout.

```
{if flag}
multi-line body
{end}
```

For a single-line phrase, use inline throughout.

```
You are a {role}{if is_admin} (administrator){end}.
```

Two separate constructs on adjacent lines may legitimately use different forms (SPEC §3.2 "Legal" example).

See SPEC §3.2, §7.2.

---

## 7. Dashes in identifiers

**Anti-pattern.** Naming a flag, variable, or enum case value with a dash, kebab-case style.

```
{if my-flag}
...
{end}
```

```toml
[flags.my-flag]
description = "Whether to render the my-flag branch"
```

**Why it's wrong.** Identifiers are restricted to `[a-zA-Z_][a-zA-Z0-9_]*` — ASCII, snake_case, no dashes (SPEC §2.1). This rule applies uniformly to variable names, flag names, and enum case values.

**Error.**

- Body usage `{if my-flag}`: `ConditionalSyntaxError`. Expected diagnostic shape: *"invalid identifier `my-flag`: dashes are not allowed in textprompts identifiers. Use snake_case (`my_flag`)."* See SPEC §7.2 ("variable or flag name uses a dash").
- Frontmatter declaration `[flags.my-flag]`: `FrontmatterSchemaError`. Expected diagnostic shape: *"flag name `my-flag` is not a valid identifier: dashes are not allowed."* See SPEC §4.3.2 ("flag name is not a valid identifier") and §7.1 ("invalid identifier (e.g. dashes, digits at start, unicode)").

**What to write instead.** Use snake_case throughout.

```toml
[flags.my_flag]
description = "Whether to render the my_flag branch"
```

```
{if my_flag}
...
{end}
```

See SPEC §2.1, §4.3.2, §7.1, §7.2.

---

## 8. Using `flags` as a variable name (or any reserved keyword)

**Anti-pattern.** Naming a variable or flag using one of the six reserved keywords — `if`, `else`, `end`, `switch`, `case`, `flags`.

```toml
[variables.flags]
description = "The list of feature flags to mention"
```

```
The active flags are: {flags}.
```

Or:

```toml
[flags.case]
description = "Whether to use case-sensitive matching"
```

**Why it's wrong.** Reserved keywords cannot be used as variable names, flag names, or enum case values, anywhere identifiers appear (SPEC §2.1). `flags` is reserved everywhere identifiers are used, for consistency with the format API surface — the formatter accepts a dedicated `flags=` parameter (SPEC §6.1, §6.2, §6.3), so a variable named `flags` would collide with that field (SPEC §5.1, §7.4: "`flags` used as a variable name").

**Error.**

- Frontmatter declaration: `FrontmatterSchemaError`. Expected diagnostic shape: *"`flags` is reserved and cannot be used as a variable name."* See SPEC §4.3.2 ("flag name is a reserved keyword"), §7.1 ("reserved keyword as flag name", "reserved keyword as variable name").
- Body usage `{flags}`: `ConditionalSyntaxError`. Expected diagnostic shape: *"`flags` is a reserved keyword and cannot be used as a variable name."* See SPEC §7.2.
- Passing `flags` as a top-level variable at format time: `FormatValidationError`. Expected diagnostic shape: *"`flags` is reserved by the format API and cannot be used as a variable name."* See SPEC §7.4.

**What to write instead.** Pick a non-reserved name. The reserved set is small (`if`, `else`, `end`, `switch`, `case`, `flags`); anything else is fair game.

```toml
[variables.active_flag_summary]
description = "Human-readable summary of which feature flags are on"
```

```
The active flags are: {active_flag_summary}.
```

See SPEC §2.1, §5.1, §7.1, §7.2, §7.4.

---

## 9. Defaulting flag values in the prompt file

**Anti-pattern.** Trying to set a default value for a flag in frontmatter so callers can omit it.

```toml
[flags.premium_tier]
type = "boolean"
default = true
description = "User is on the premium subscription tier"
```

**Why it's wrong.** Default values for flags are explicitly excluded from the design (SPEC §1.2: "Default values for flags. The caller always passes flag values explicitly."). Flag values are runtime decisions made by caller code based on user context, rollout state, A/B bucket, etc. — burying them in the prompt file hides those decisions and makes rollouts harder to reason about (SPEC §13 rationale: "Why no defaults for flags?").

**Error.** Two distinct failure modes:

1. **The `default` field itself.** `default` is not a recognized flag-declaration field (SPEC §4.3.1 lists `type`, `values`, `description`). It is, however, preserved as custom metadata under `prompt.meta.flags["premium_tier"].extras["default"]` (SPEC §4.3.1, §5.8), so it does **not** produce a parse error — but it has no effect on rendering. This is the silent failure mode: authors think they set a default, the parser keeps the field as opaque metadata, the formatter ignores it, and the next caller hits the next error.
2. **The caller omits the flag.** `FormatValidationError`. Expected diagnostic shape: *"flag `premium_tier` required but not provided"* (SPEC §5.6, §7.4). Or, if no `flags` parameter is passed at all: *"prompt requires `flags` parameter but none was passed; expected flags: [premium_tier]"* (SPEC §5.6).

**What to write instead.** Set the default in caller code, where it is reviewable alongside the rest of the runtime decision.

```python
# Caller owns the default.
def render_support_prompt(user, *, premium_tier_default: bool = False):
    return prompt.format(
        flags={"premium_tier": user.is_premium if user else premium_tier_default},
    )
```

If the field carries operational intent (rollout state, owner, expiry), preserve it as documented custom metadata under a non-misleading key:

```toml
[flags.premium_tier]
description = "User is on the premium subscription tier"
rollout = "100%"
owner = "@billing"
```

These appear as `prompt.meta.flags["premium_tier"].extras["rollout"]` and `extras["owner"]` (SPEC §5.8, §6.5), available to CI and dashboards without changing render semantics.

See SPEC §1.2, §4.3.1, §5.6, §5.8, §7.4.

---

## Summary table

| Anti-pattern | Error class | Where SPEC pins it |
|---|---|---|
| Deep nesting | None (style only) | §3.1, §12 |
| Boolean expressions in `{if}` | `ConditionalSyntaxError` | §1.2, §2.2, §7.2 |
| Comparisons in `{if}` | `ConditionalSyntaxError` | §1.2, §3, §5.3 |
| Comments in prompt body | None (silent leakage) | §1.2, §4.3, §5.8 |
| Stripping `{var}` from inactive branch | `FormatValidationError` | §5.2, §5.6, §7.4 |
| Mixed inline/block form | `ConditionalSyntaxError` | §3.2, §7.2 |
| Dashes in identifiers | `ConditionalSyntaxError` / `FrontmatterSchemaError` | §2.1, §4.3.2, §7.1, §7.2 |
| Reserved keyword (e.g. `flags`) as name | `FrontmatterSchemaError` / `ConditionalSyntaxError` / `FormatValidationError` | §2.1, §5.1, §7.1, §7.2, §7.4 |
| Defaulting flag values in the file | Silent + `FormatValidationError` on caller omission | §1.2, §4.3.1, §5.6, §5.8, §7.4 |
