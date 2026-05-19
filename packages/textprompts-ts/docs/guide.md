# Authoring guide

This is the practical guide to writing v2 textprompts files: variables,
conditional tags, flags, metadata modes, and provider integrations. For the
formal grammar, see [file-format.md](./file-format.md) and the
[cross-language SPEC](../../../docs/specs/SPEC_conditional_syntax_v2.md).

For an LLM-friendly cheat sheet aimed at agent skill loading, see the
[authoring skill](../../../docs/writing-prompts-with-textprompts/SKILL.md).

## v2 breaking changes

- Positional placeholders (`{0}`, `{1}`) are gone — use named placeholders.
- Empty placeholders (`{}`) are gone.
- The double-brace escape `{{...}}` is gone — use `\{`, `\}`, `\\`.
- `Prompt.format(args, kwargs, options)` is gone — use `prompt.format({ flags, ...vars })`.
- `PromptString` is no longer exported — use `Prompt.fromString` or `loadPrompt`.

---

## Variables: `{name}`

```
Hello {customer_name}!
```

- Identifier rule: `[a-zA-Z_][a-zA-Z0-9_]*` (ASCII, snake_case, no dashes).
- Every variable referenced in the body must be passed at `format()` time.
- Reserved keywords (`if`, `else`, `end`, `switch`, `case`, `flags`) cannot be
  variable **names**, but they **are** allowed as variable **values**. Passing
  `{ role: "end" }` renders the literal text `end`.
- Whitespace inside braces is a parse error: `{ name }` does not parse.

Declare variables for documentation (and to make them appear in
`prompt.meta.variables`) — declarations are optional:

```toml
[variables.customer_name]
description = "Display name shown to the customer"
```

Variables are never required to be declared; declaring them just gives the
prompt's consumers a discovery surface (`Object.keys(prompt.meta.variables)`).

---

## Inline `{if flag}`

Inline form keeps everything on one line:

```
You are a {role}{if is_admin} (administrator){end}.
```

- `is_admin = true` → `You are a Jan (administrator).`
- `is_admin = false` → `You are a Jan.`

The text outside the tag (the trailing `.`) is preserved untouched. Inline
`{if}` is for short phrase-level insertions.

### Negation: `{if !flag}`

```
You are a {role}{if !is_admin} (read-only){end}.
```

There must be **no space** between `!` and the flag: `{if !is_admin}` parses,
`{if ! is_admin}` is a parse error. Keep the negated form as `{if !flag}`;
extra spaces between `if` and `!` are intentionally rejected.

### Inline `{else}`

```
The user is on the {if premium_tier}premium{else}free{end} plan.
```

Both branches sit between `{if}` and `{end}`, separated by `{else}`. The same
form works for `{switch}` (see below).

---

## Block `{if flag}`

Block form puts the opener, `{else}`, and `{end}` each alone on their own
lines:

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

Rules:

- Each keyword line is removed in its entirety — leading whitespace included.
- Body line indentation is preserved exactly as authored.
- Inactive branches contribute zero bytes — no stray whitespace.

### Block with `{else}`

```
{if include_diagnostics}
Diagnostics:
  - Latency: {latency_ms} ms
  - Error rate: {error_rate}%
{else}
Diagnostics not collected.
{end}
```

### Indented nested blocks

Block tags can sit at any indentation level; the entire keyword line is
removed regardless of leading whitespace:

```
{if outer}
  {if inner}
  body line
  {end}
{end}
```

`body line` keeps its two-space indent; the inner `{if}` / `{end}` keyword
lines disappear with their indents.

Keep nesting shallow. Two levels is usually fine; three is a hint to refactor
into separate prompts or compose at the call site.

---

## `{switch flag}` over an enum

Block form (recommended):

```
{switch tier}
{case free}
Free plan. Mention upgrade options.
{case premium}
Premium plan. Skip the upgrade pitch.
{case enterprise}
Enterprise plan. Connect to a dedicated account manager.
{end}
```

Inline form (allowed but discouraged):

```
Plan: {switch tier}{case free}free{case premium}premium{else}unknown{end}.
```

Rules:

- At least one `{case}` is required.
- No content between `{switch}` and the first `{case}`.
- Duplicate `{case X}` values fail to parse.
- `{else}` is optional and must come last.
- Case order is cosmetic — matching is by value, not position.

### Exhaustiveness for declared enums

When you declare an enum and `{switch}` over it, you must either:

1. Cover every declared value with a `{case}`, **or**
2. End with `{else}`.

Otherwise the loader throws `SemanticError(code: "E_NON_EXHAUSTIVE_SWITCH")`
naming the missing cases.

---

## Escapes

| Source | Renders as |
|---|---|
| `\{` | `{` |
| `\}` | `}` |
| `\\` | `\` |

No other escape sequences. `\n`, `\t`, and friends render as two literal
characters; use real newlines or tabs if you need them.

---

## Frontmatter

### Standard fields

```toml
title = "Customer support agent"
version = "2.1.0"
description = "Customer support prompt with tier-based routing"
author = "@support-eng"
created = "2026-04-30"
```

YAML equivalent uses `:` separators (`title: ...`). The library auto-detects
TOML first, then YAML, unless you pin `frontmatterFormat`.

### Flag declarations

Boolean (shorthand — `type` defaults to `"boolean"`):

```toml
[flags.persona]
description = "Include the persona line"
```

Boolean (full form):

```toml
[flags.persona]
type = "boolean"
description = "Include the persona line"
```

Enum:

```toml
[flags.tier]
type = "enum"
values = ["free", "premium", "enterprise"]
description = "User subscription tier"
```

Any field beyond `type`, `values`, and `description` is preserved on
`prompt.meta.flags[name].extras`:

```toml
[flags.tier]
type = "enum"
values = ["free", "premium", "enterprise"]
description = "User subscription tier"
owner = "@product"
expires = "2026-12-01"
jira_ticket = "PROD-1234"
```

```typescript
const tier = prompt.meta.flags.tier;
if (tier.kind === "enum") {
  console.log(tier.values);          // ["free", "premium", "enterprise"]
  console.log(tier.extras.owner);    // "@product"
}
```

### Variable declarations

```toml
[variables.user_name]
description = "Display name shown to the model"
```

Variables are documentation, not enforcement. Declared variables never become
required at format time — but every variable **referenced in the body** is
required (see below).

Any field beyond `description` lands in
`prompt.meta.variables[name].extras`.

---

## Metadata modes

The loader's `metadata` option:

### `"allow"` (default)

- Frontmatter is optional.
- Body-referenced flags can be undeclared — implicit declarations are derived
  from the body (`{if flag}` → boolean flag, `{switch flag}` → enum with the
  inferred value set).
- Use during prototyping.

### `"strict"`

- Frontmatter is **required**.
- `title`, `description`, `version` must be non-empty.
- Every flag referenced in the body **must** be declared in `[flags.*]` with a
  non-empty `description`.
- Every declared flag must have a non-empty `description`, even if the current
  body does not reference it.
- Variables are still not required to be declared.
- Use in production / CI.

### `"ignore"`

- Frontmatter is **not parsed at all** — the whole file is body.
- Useful for files that intentionally do not use the textprompts schema, or
  to bypass a malformed header you want to keep verbatim.
- `prompt.meta.title` defaults to the filename stem.

```typescript
await loadPrompt("prompts/legacy.txt", { metadata: "ignore" });
```

---

## The required-input rule (the one that bites)

> Every variable and flag **referenced anywhere in the body** must be passed
> to `format()`, regardless of which branch fires (SPEC §5.2).

```
{if has_history}
Previous question: {last_question}
{end}
```

`has_history` and `last_question` are **both** required at format time. Even
when `has_history = false` and the body never renders, `last_question` must
still be passed.

This is intentional. The alternative is a bug that hides until a flag flips
later in production and a previously unreachable branch becomes reachable.
If a variable is genuinely optional from the caller's perspective, pass an
empty string explicitly — that decision belongs at the call site.

---

## Reading metadata at runtime

```typescript
const prompt = await loadPrompt("prompts/support.txt");

console.log(prompt.meta.title);          // "Customer support agent"
console.log(prompt.meta.version);        // "2.1.0"
console.log(prompt.meta.extras.owner);   // "@support-eng"

// Flag introspection
for (const [name, decl] of Object.entries(prompt.meta.flags)) {
  if (decl.kind === "enum") {
    console.log(`${name} enum: ${decl.values.join(", ")}`);
  } else {
    console.log(`${name} boolean: ${decl.description}`);
  }
}

// Detect unused inputs yourself (extras at format time are silently ignored)
const myInputs = { user_name: "Jan", flags: { tier: "premium", legacy: true } };
const declared = new Set(Object.keys(prompt.meta.flags));
const unused = Object.keys(myInputs.flags).filter((f) => !declared.has(f));
if (unused.length) console.warn(`Unused flags: ${unused.join(", ")}`);
```

---

## Project organization

```
my-app/
├── src/
│   └── ...
├── prompts/
│   ├── system/
│   │   ├── base.txt
│   │   └── expert.txt
│   ├── support/
│   │   └── support.txt
│   └── tools/
│       └── search.txt
└── package.json
```

Cache loaded prompts — `loadPrompt` is async and reads from disk:

```typescript
import { Prompt, loadPrompt } from "textprompts";

class PromptCache {
  private cache = new Map<string, Promise<Prompt>>();

  load(path: string): Promise<Prompt> {
    if (!this.cache.has(path)) {
      this.cache.set(path, loadPrompt(path));
    }
    return this.cache.get(path)!;
  }
}
```

For per-environment prompts, split by directory:

```typescript
const env = process.env.NODE_ENV ?? "development";
const prompt = await loadPrompt(`prompts/${env}/system.txt`);
```

---

## Error handling

```typescript
import {
  FormatError,
  FrontmatterError,
  ParseError,
  SemanticError,
  TextPromptsError,
  loadPrompt,
} from "textprompts";

try {
  const prompt = await loadPrompt("prompts/support.txt", { metadata: "strict" });
  prompt.format({
    user_name: "Jan",
    last_question: "How do I upgrade?",
    flags: { tier: "premium", has_urgent: false },
  });
} catch (error) {
  if (error instanceof FormatError) {
    console.error(`format-time error [${error.code}]:`, error.message);
  } else if (error instanceof SemanticError) {
    console.error(`semantic error [${error.code}]:`, error.message);
  } else if (error instanceof FrontmatterError) {
    console.error(`frontmatter error [${error.code}]:`, error.message);
  } else if (error instanceof ParseError) {
    console.error(`parse error [${error.code}]:`, error.message);
  } else if (error instanceof TextPromptsError) {
    console.error("textprompts error:", error.message);
  } else {
    throw error;
  }
}
```

Stable `code` strings let you pattern-match without parsing English messages.

---

## AI provider integration

### OpenAI

```typescript
import OpenAI from "openai";
import { loadPrompt } from "textprompts";

const system = await loadPrompt("prompts/support.txt", { metadata: "strict" });
const client = new OpenAI();

const response = await client.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [
    {
      role: "system",
      content: system.format({
        user_name: "Jan",
        last_question: "How do I upgrade?",
        flags: { tier: "premium", has_urgent: false },
      }),
    },
    { role: "user", content: "Hi!" },
  ],
});
```

### Vercel AI SDK

```typescript
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { loadPrompt } from "textprompts";

const system = await loadPrompt("prompts/support.txt");

const result = streamText({
  model: openai("gpt-4o-mini"),
  messages: [
    {
      role: "system",
      content: system.format({
        user_name: "Jan",
        last_question: "How do I upgrade?",
        flags: { tier: "premium", has_urgent: false },
      }),
    },
    { role: "user", content: "Hello!" },
  ],
});

for await (const delta of result.textStream) {
  process.stdout.write(delta);
}
```

### Anthropic

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { loadPrompt } from "textprompts";

const system = await loadPrompt("prompts/support.txt");
const anthropic = new Anthropic();

const message = await anthropic.messages.create({
  model: "claude-3-5-sonnet-20241022",
  max_tokens: 1024,
  system: system.format({
    user_name: "Jan",
    last_question: "How do I upgrade?",
    flags: { tier: "premium", has_urgent: false },
  }),
  messages: [{ role: "user", content: "Hello!" }],
});
```

---

## Edge runtimes

`textprompts/core` has zero `node:*` imports, safe for Cloudflare Workers,
Deno Deploy, Vercel Edge, and the browser:

```typescript
import { Prompt, parseString } from "textprompts/core";

const prompt = Prompt.fromString("Hello {name}!");
prompt.format({ name: "Alice" });
```

The `core` entry point excludes `loadPrompt`, `loadSection`, `savePrompt`, and
`parseFile`. Use bundler raw imports (Vite `?raw`, Webpack `raw-loader`) to
get prompt text into the runtime.

---

## See also

- [Authoring skill](../../../docs/writing-prompts-with-textprompts/SKILL.md) — the canonical guide
- [File format](./file-format.md)
- [API reference](./api.md)
- [Examples](./examples.md)
- [Cross-language SPEC](../../../docs/specs/SPEC_conditional_syntax_v2.md)
