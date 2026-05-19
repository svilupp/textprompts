# Migrating from v1 to v2

> **Target:** textprompts v2.0. The TypeScript reference implementation ships
> in `packages/textprompts-ts` (v2.0.0). The Python engine ships once the TS
> reference and the `docs/specs/fixtures/` conformance corpus stabilize.
> v1 means the `1.x` line currently published on PyPI / npm; v2 means the
> major-version release described by
> [`docs/specs/SPEC_conditional_syntax_v2.md`](../../specs/SPEC_conditional_syntax_v2.md).

This page is a diff-style reference for moving an existing v1 prompt + caller to v2. Every breaking change called out in SPEC §1.1 has a code-level before/after below. When a v1 pattern hits the v2 parser, the exception you get is documented in [`error-debugging.md`](./error-debugging.md).

## 0. TypeScript caller diffs (v2.0.0)

The TypeScript port is the v2 reference. Every diff below works in
`textprompts@2.0.0`.

**Positional → named placeholders + single-object `format`:**

```diff
- // v1
- const prompt = await loadPrompt("prompts/greet.txt");
- prompt.format("Alice", { greeting: "Hello" });
+ // v2
+ const prompt = await loadPrompt("prompts/greet.txt");
+ prompt.format({ name: "Alice", greeting: "Hello" });
```

**`new PromptString(...)` → `Prompt.fromString(...)`:**

```diff
- import { PromptString } from "textprompts";
- const p = new PromptString("Hello {name}");
+ import { Prompt } from "textprompts";
+ const p = Prompt.fromString("Hello {name}");
```

`PromptString` is no longer exported in v2.

**Double-brace escape → backslash escape:**

```diff
- // v1 prompt body
- Return JSON like {{"answer": 42}}.
+ // v2 prompt body
+ Return JSON like \{"answer": 42\}.
```

**`meta:` → `metadata:` loader option:**

```diff
- await loadPrompt("file.txt", { meta: "ignore" });
+ await loadPrompt("file.txt", { metadata: "ignore" });
```

**Removed: `skipValidation` option:**

```diff
- prompt.format(args, { skipValidation: true });
+ prompt.format(args);
+ // Validation is AST-driven and always-on.
```

**Match errors by `code`, not message:**

```diff
- try { prompt.format(args); }
- catch (err) {
-   if (err.message.includes("missing")) { /* ... */ }
- }
+ import { FormatError } from "textprompts";
+ try { prompt.format(args); }
+ catch (err) {
+   if (err instanceof FormatError && err.code === "E_MISSING_VARIABLE") { /* ... */ }
+ }
```

For a full TS walkthrough see
[typescript-quickstart.md](typescript-quickstart.md).

The rest of this page uses Python snippets; the Python migration story is
identical in shape (the keyword vocabulary differs slightly — Python uses
`load_prompt(metadata=...)` and `format(name=..., flags={...})`).

## 1. Breaking changes at a glance

Mapped from SPEC §1.1 ("Major-version posture"):

| v1 pattern | v2 status | Exception when v2 sees it |
|------------|-----------|----------------------------|
| `{0}`, `{1}`, ... positional placeholders | Removed (§1.1, §3.1 rule 16) | `ConditionalSyntaxError` |
| `{}` empty placeholder | Removed (§1.1, §3.1 rule 17) | `ConditionalSyntaxError` |
| `{{literal}}` double-brace escape | Removed (§1.1, §2.4) | `ConditionalSyntaxError` |
| Variable named `if` / `else` / `end` / `switch` / `case` / `flags` | Removed (§1.1, §2.1) | `FrontmatterSchemaError` (declaration) or `ConditionalSyntaxError` (body use) |
| `Prompt.prompt.format(...)` as the canonical entry | Still works for plain prompts; `Prompt.format(..., flags=...)` is now canonical (§6) | n/a (back-compat retained) |
| `load_prompt(path, meta=...)` keyword | Renamed to `metadata=` (legacy `meta=` accepted for one major) | `DeprecationWarning` then removal in v3 |
| `metadata="strict"` accepts empty `title`/`description`/`version` | Now requires all three non-empty, plus every referenced flag must declare a non-empty `description` (§4.6) | `MissingMetadataError` / `FrontmatterSchemaError` |

The rest of this page walks each row with a paste-ready before/after.

## 2. Positional placeholders → named (SPEC §1.1, §3.1 rule 16)

v1's `PromptString` inherited `str.format` and silently accepted positional substitution. v2 requires every `{...}` tag to be a named identifier matching `[a-zA-Z_][a-zA-Z0-9_]*`.

**Prompt file — before/after:**

```text
# v1 — prompts/greet.txt
Hello {0}, welcome to {1}.
```

```text
# v2 — prompts/greet.txt
Hello {name}, welcome to {product}.
```

**Caller — before/after:**

```python
# v1
from textprompts import load_prompt

p = load_prompt("prompts/greet.txt")
print(p.prompt.format("Ada", "textprompts"))
```

```python
# v2
from textprompts import load_prompt

p = load_prompt("prompts/greet.txt")
print(p.format(name="Ada", product="textprompts"))
```

If you leave `{0}` in the body, the v2 loader raises `ConditionalSyntaxError` at parse time — see [`error-debugging.md`](./error-debugging.md#conditionalsyntaxerror).

## 3. Empty placeholders → named (SPEC §1.1, §3.1 rule 17)

v1 accepted bare `{}` and substituted by next positional argument. v2 rejects it; pick a name.

```text
# v1 — prompts/sum.txt
The answer is {}.
```

```text
# v2 — prompts/sum.txt
The answer is {answer}.
```

```python
# v1
p.prompt.format(42)

# v2
p.format(answer=42)
```

## 4. Double-brace escaping → backslash escape (SPEC §1.1, §2.4)

v1 used `{{` and `}}` (inherited from `str.format`) to emit literal braces. v2 reserves single-brace tags as the only meta-syntax and escapes with `\{` and `\}`.

```text
# v1 — prompts/json-example.txt
Return JSON like {{"answer": 42}}.
```

```text
# v2 — prompts/json-example.txt
Return JSON like \{"answer": 42\}.
```

A leftover `{{...}}` in v2 raises `ConditionalSyntaxError` because the inner `{...}` is parsed as a tag and the outer `{` is unmatched.

Backslash escape rules in full (SPEC §2.4):

- `\{` → literal `{`
- `\\` → literal `\`
- `\}` → literal `}` (symmetric; raw `}` outside a tag also renders literally)
- No other escapes are recognized — `\n` / `\t` etc. render as the two literal source characters.

## 5. `prompt.prompt.format(...)` → `prompt.format(...)` (canonical, supports `flags=`)

v1 routed through the inner `PromptString` because `Prompt.format` did not exist as a first-class method on every release. v2 adds `Prompt.format(**variables, flags=None)` as the canonical render entry; the old call path still works for plain prompts without `{if}` or `{switch}`.

```python
# v1 — both spellings worked
p = load_prompt("prompts/greet.txt")
p.prompt.format(name="Ada")
str(p).format(name="Ada")
```

```python
# v2 — canonical
p = load_prompt("prompts/greet.txt")
p.format(name="Ada")

# v2 — with flags (only available on Prompt.format, not on str.format)
p.format(name="Ada", flags={"verbose": True})
```

`p.prompt.format(...)` is still a `PromptString.format(...)` call and continues to work on prompts that contain no conditional tags. As soon as the body contains `{if}` / `{switch}`, you must call `Prompt.format(...)` so the conditional engine runs — calling the inner `str` path on a conditional prompt is an `AttributeError` in practice because `PromptString.format` does not accept `flags=`.

## 6. `meta=` → `metadata=` (SPEC §6.2)

`load_prompt(path, meta=...)` is renamed to `load_prompt(path, metadata=...)` for symmetry with the SPEC vocabulary ("metadata mode"). The old keyword is accepted for one major release with a `DeprecationWarning`; it will be removed in v3.

```python
# v1
prompt = load_prompt("prompts/system.txt", meta="ignore")
prompt = load_prompt("prompts/system.txt", meta="strict")
prompt = load_prompt("prompts/system.txt", meta=MetadataMode.ALLOW)
```

```python
# v2
prompt = load_prompt("prompts/system.txt", metadata="ignore")
prompt = load_prompt("prompts/system.txt", metadata="strict")
prompt = load_prompt("prompts/system.txt", metadata=MetadataMode.ALLOW)
```

`metadata="ignore"` semantics are unchanged: the entire file is treated as the body and the filename stem becomes the title (SPEC §6.2).

```python
# v1 and v2 — same behavior, only the keyword name differs
load_prompt("notes.txt", meta="ignore")        # v1
load_prompt("notes.txt", metadata="ignore")    # v2
```

## 7. `metadata="strict"` now requires non-empty title/description/version + flag descriptions (SPEC §4.6)

v1 strict mode accepted any frontmatter that parsed as TOML/YAML, even if `title`, `description`, and `version` were empty strings. v2 strict mode requires all three to be present and non-empty, and additionally requires every flag referenced in the body to be declared in frontmatter with a non-empty `description`.

**Prompt file — before/after:**

```text
# v1 — passes strict mode
---
title = ""
description = ""
version = ""
---
Hello {name}.
```

```text
# v2 — passes strict mode
---
title = "Greeting"
description = "Greets a user by name."
version = "1.0.0"
---
Hello {name}.
```

**Adding a flag under strict mode (v2-only requirement):**

```text
# v2 — strict + conditional, fails
---
title = "Greeting"
description = "Greets a user by name."
version = "1.0.0"

[flags.verbose]
type = "boolean"
---
Hello {name}.{if verbose} Welcome back.{end}
```

The above raises `FrontmatterSchemaError` under `metadata="strict"`: `flags.verbose` is missing a non-empty `description`. Add it:

```text
# v2 — strict + conditional, passes
---
title = "Greeting"
description = "Greets a user by name."
version = "1.0.0"

[flags.verbose]
type = "boolean"
description = "Append a second sentence welcoming returning users."
---
Hello {name}.{if verbose} Welcome back.{end}
```

See [`error-debugging.md`](./error-debugging.md#missingmetadataerror) for the exact exceptions raised in each case.

## 8. Reserved keywords as identifiers (SPEC §1.1, §2.1)

`if`, `else`, `end`, `switch`, `case`, and `flags` are reserved everywhere identifiers appear — flag names, variable names, enum case values. v1 had no such restriction.

```text
# v1 — accepted
Hello {if}, please {switch} the lights.
```

```text
# v2 — rename
Hello {greeting}, please {action} the lights.
```

`flags` as a variable name is also rejected because it collides with the format-API keyword argument:

```python
# v1
p.prompt.format(flags="optional")

# v2 — rename the placeholder
p.format(extra_flags="optional")
```

## 9. Adding `{if}` to an existing v1 prompt without breaking callers

This is the most common migration. You have a v1 prompt in production, callers already pass a fixed set of `**kwargs`, and you want to add an optional, gated paragraph. The rules:

1. Add the new tag using v2 syntax (`{if flag}` ... `{end}`).
2. Declare the flag in frontmatter (`[flags.<name>]` with `type = "boolean"` and a `description`).
3. Update every call site to pass `flags={...}` — flags have no defaults (SPEC §4.6, §1.2). A missing flag is a `FormatValidationError`, not silent `false`.
4. Variables referenced inside the new branch must still be passed even if the branch is gated off (SPEC §5.2). This is the rule most v1 authors trip on; see anti-patterns.

**Starting point — a working v1 prompt:**

```text
# prompts/support.txt — v1
---
title = "Support reply"
description = "Reply to a customer support ticket."
version = "1.0.0"
---
Hi {customer_name},

Thanks for reaching out about {issue_summary}. We're looking into it now.
```

```python
# v1 caller
p = load_prompt("prompts/support.txt", meta="strict")
print(p.prompt.format(
    customer_name="Ada",
    issue_summary="login failure",
))
```

**Step 1 — migrate the caller to v2 vocabulary, body unchanged:**

```python
# v2 caller, no behavior change yet
p = load_prompt("prompts/support.txt", metadata="strict")
print(p.format(
    customer_name="Ada",
    issue_summary="login failure",
))
```

At this point the prompt still works exactly as before and no flags are involved.

**Step 2 — add the gated paragraph:**

```text
# prompts/support.txt — v2 with new optional paragraph
---
title = "Support reply"
description = "Reply to a customer support ticket."
version = "1.0.0"

[flags.is_premium]
type = "boolean"
description = "Customer is on the premium tier; mention SLA and direct line."
---
Hi {customer_name},

Thanks for reaching out about {issue_summary}. We're looking into it now.
{if is_premium}
As a premium customer, you have a 4-hour response SLA. If you need to escalate, reply to this email with the word URGENT and {direct_line} will page on-call.
{end}
```

**Step 3 — update every caller to pass `flags=`:**

```python
# v2 caller — flags required, no defaults
p = load_prompt("prompts/support.txt", metadata="strict")

# Free-tier customer
print(p.format(
    customer_name="Ada",
    issue_summary="login failure",
    direct_line="+1-555-0100",          # still required even though gated
    flags={"is_premium": False},
))

# Premium customer
print(p.format(
    customer_name="Ada",
    issue_summary="login failure",
    direct_line="+1-555-0100",
    flags={"is_premium": True},
))
```

Notes specific to this workflow:

- `direct_line` must be passed in both calls. SPEC §5.2: every body reference is required at format time, even from an inactive branch. Stripping the variable from the false branch raises `FormatValidationError`; see [`error-debugging.md`](./error-debugging.md#formatvalidationerror).
- `flags={"is_premium": False}` must be passed explicitly. There is no implicit default (SPEC §1.2 — "Default values for flags ... are excluded"). Omitting it raises `FormatValidationError`.
- The flag declaration carries a non-empty `description` so the prompt loads under `metadata="strict"` (SPEC §4.6).
- The `{if is_premium}` opener is alone on its line, so this is **block form** (SPEC §3.2); the `{end}` consumes its own line and the inactive branch leaves no whitespace behind (SPEC §3.3). If you want the SLA sentence to render inline at the end of the second paragraph instead, switch to inline form on one physical line: `... now.{if is_premium} As a premium customer ... on-call.{end}`.

## 10. How to verify a migrated prompt

Run the loader twice — once strict, once allow — to surface the maximum number of errors:

```python
from textprompts import load_prompt

# Catches missing frontmatter fields and undeclared flags
load_prompt("prompts/support.txt", metadata="strict")

# Smoke test: confirms parse + flag declarations + variable references all resolve
load_prompt("prompts/support.txt", metadata="allow")
```

Then format with every combination of flag values you intend to ship:

```python
p = load_prompt("prompts/support.txt", metadata="strict")
for is_premium in (True, False):
    p.format(
        customer_name="test",
        issue_summary="test",
        direct_line="test",
        flags={"is_premium": is_premium},
    )
```

If any combination raises `FormatValidationError`, the body references a variable you did not pass; fix the caller, not the prompt.

## 11. Pointer

- Full normative spec: [`docs/specs/SPEC_conditional_syntax_v2.md`](../../specs/SPEC_conditional_syntax_v2.md)
- Exception reference: [`error-debugging.md`](./error-debugging.md)
- Anti-patterns that look like v1 but are not: [`anti-patterns.md`](./anti-patterns.md)
- Syntax lookup card: [`conditional-syntax-cheatsheet.md`](./conditional-syntax-cheatsheet.md)
