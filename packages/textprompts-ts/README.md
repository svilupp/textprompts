# textprompts

> Prompts as text files, with typed variables, conditional logic, and zero configuration.

TypeScript/JavaScript port of [textprompts](https://github.com/svilupp/textprompts) for loading and formatting prompt files.

Are you tired of vendors trying to sell you fancy UIs for prompt management that just make your system more confusing and harder to debug? Isn't it nice to just have your prompts **next to your code**?

But then you worry: *Did my formatter change my prompt? Are those spaces at the beginning actually part of the prompt or just indentation?*

**textprompts** solves this elegantly: treat your prompts as **text files** and keep your linters and formatters away from them. v2 adds typed flags, `{if}` and `{switch}` conditionals, and AST-backed validation, while keeping the file-on-disk simplicity.

## Authoring guide

For deeper guidance on writing v2 prompts — `{if}` vs `{switch}`, flag patterns, anti-patterns, debugging, and v1 → v2 migration — see [`docs/writing-prompts-with-textprompts/SKILL.md`](../../docs/writing-prompts-with-textprompts/SKILL.md). The skill is also installable into Claude / Codex agents as `writing-prompts-with-textprompts`.

## Why textprompts?

- **Prompts live next to your code** — no external systems to manage
- **Git is your version control** — diff, branch, and experiment
- **No formatter headaches** — your prompts stay exactly as you wrote them
- **Typed flags and variables** — declared in TOML or YAML frontmatter
- **Conditional content** — `{if}`, `{switch}`, `{else}` with strict validation
- **Strict mode** — require flag descriptions on production prompts
- **Edge-ready** — `textprompts/core` has zero `node:*` imports for Cloudflare Workers, Deno Deploy, Vercel Edge, and the browser
- **Lightweight** — TOML and YAML parsers, nothing more

## Installation

```bash
npm install textprompts
# or
bun add textprompts
# or
pnpm add textprompts
```

## Quick start — flags + conditional

Create `prompts/support.txt`:

```
---
title = "Customer support agent"
version = "2.1.0"
description = "Customer support prompt with tier-based routing"

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

Load and format it:

```typescript
import { loadPrompt } from "textprompts";

const support = await loadPrompt("prompts/support.txt", { metadata: "strict" });

const message = support.format({
  user_name: "Jan",
  last_question: "How do I upgrade?",
  flags: { tier: "premium", has_urgent: true },
});
```

Output:

```
You are a helpful support agent assisting Jan.

You have priority support with guaranteed response within 1 hour.
This conversation has been flagged as urgent. The user previously asked: How do I upgrade?
How can I help today?
```

That's the full story. Variables go at the top level of `format()`. Flags go under a reserved `flags` key. Frontmatter declares both; missing inputs throw `FormatError` with a stable code; extra inputs are silently ignored.

## In-memory prompts

When you can't load from disk (bundlers, edge runtimes, tests), use `Prompt.fromString`:

```typescript
import { Prompt } from "textprompts";

const prompt = Prompt.fromString(
  "Hello {name}{if friendly}, friend{end}!",
);

prompt.format({ name: "Alice", flags: { friendly: true } });
// "Hello Alice, friend!"
```

With a bundler:

```typescript
// Vite — file is bundled as a string at build time
import content from "./prompt.txt?raw";
const prompt = Prompt.fromString(content, { path: "prompt.txt" });
```

## Edge runtimes

```typescript
// Cloudflare Workers, Deno Deploy, Vercel Edge, browser
import { Prompt, parseString } from "textprompts/core";
```

The `core` entry point has zero `node:*` imports. It exposes `Prompt`, `parseString`, `parseSections`, error classes, and `MetadataMode`. File-system entry points (`loadPrompt`, `loadSection`, `savePrompt`, `parseFile`) live in the default `textprompts` entry only.

## Conditional syntax at a glance

```
{var}                       — variable substitution
{if flag}...{end}           — block conditional (each tag alone on a line)
{if flag}...{else}...{end}  — with else branch
{if !flag}...{end}          — negation
{switch flag}{case x}...{case y}...{else}...{end}
\{ \} \\                    — escapes (no double-brace {{...}})
```

Inline form keeps everything on one line:

```
You are a {role}{if is_admin} (administrator){end}.
```

Block form puts each control tag alone on its own line:

```
{switch tier}
{case free}
Free plan.
{case premium}
Premium plan.
{end}
```

The keyword lines disappear; body line indentation is preserved exactly as written. See [`docs/file-format.md`](./docs/file-format.md) for the full grammar and [`docs/examples.md`](./docs/examples.md) for rendered examples.

## Metadata modes

```typescript
const prompt = await loadPrompt("prompts/support.txt", {
  metadata: "strict",          // "allow" (default) | "strict" | "ignore"
  frontmatterFormat: "toml",   // "auto" (default) | "toml" | "yaml"
});
```

- **`"allow"` (default)** — frontmatter optional; flags can be implicit.
- **`"strict"`** — frontmatter required; `title`/`description`/`version` required; every body-referenced flag must be declared in `[flags.*]`, and every declared flag needs a non-empty description.
- **`"ignore"`** — the source is not inspected for frontmatter at all; the whole file (including any leading `---...---` block) is treated as the prompt body. Title defaults to the filename stem.

You can also set `setMetadata(MetadataMode.STRICT)` as a process-global default, or the `TEXTPROMPTS_METADATA_MODE` env var.

## Migrating from v1

v2 is a breaking release. The substantive changes:

### Positional placeholders → named placeholders

```diff
- Hello {0}, your order {1} is {2}.
- prompt.format(["Alice", "12345", "shipped"]);
+ Hello {name}, your order {order_id} is {status}.
+ prompt.format({ name: "Alice", order_id: "12345", status: "shipped" });
```

### Conditional logic — was string concatenation, now declarative

```diff
- // Before: branching in the caller
- let body = baseTemplate;
- if (isAdmin) body = body.replace("{admin_note}", " (administrator)");
- else body = body.replace("{admin_note}", "");
+ // After: branching in the prompt
+ // You are a {role}{if is_admin} (administrator){end}.
+ prompt.format({ role: "analyst", flags: { is_admin: true } });
```

### Format call shape

```diff
- prompt.format({ name: "Alice", role: "admin" });
- prompt.format(["Alice", "admin"]);
- prompt.format({ name: "Alice" }, { item: "widget" }, { skipValidation: true });
+ prompt.format({ name: "Alice", role: "admin" });
+ prompt.format({ name: "Alice", role: "admin", flags: { premium: true } });
```

The new shape: one object, with optional reserved `flags` key, and every other top-level key is a variable.

### In-memory prompts: `PromptString` → `Prompt.fromString`

```diff
- import { PromptString } from "textprompts";
- const t = new PromptString("Hello {name}!");
- t.format({ name: "Alice" });
+ import { Prompt } from "textprompts";
+ const t = Prompt.fromString("Hello {name}!");
+ t.format({ name: "Alice" });
```

`PromptString` is internal in v2; it is not exported from `textprompts` or `textprompts/core`.

### Brace escapes

```diff
- Set the variable {{name}} to {value}.
+ Set the variable \{name\} to {value}.
```

### Loader option name

```diff
- await loadPrompt("file.txt", { meta: "strict" });
+ await loadPrompt("file.txt", { metadata: "strict" });
```

### `format` no longer takes `skipValidation`

Partial / multi-stage formatting is no longer a first-class feature. If you need it, render the prompt once with the variables you have and compose the rest at the call site, or split the prompt into two files. The required-input rule (SPEC §5.2) makes "leave variables behind for later" silently ambiguous.

For the full v2 design rationale and a longer-form migration walkthrough, see the [authoring skill](../../docs/writing-prompts-with-textprompts/SKILL.md) and the [cross-language SPEC](../../docs/specs/SPEC_conditional_syntax_v2.md).

## API surface

```typescript
import {
  // Loading
  loadPrompt,
  loadSection,
  parseFile,
  parseString,
  Prompt,                  // includes Prompt.fromPath, Prompt.fromString
  // Saving
  savePrompt,
  // Sections (Markdown / XML multi-section files)
  parseSections,
  getSectionText,
  sliceSectionContent,
  injectAnchors,
  renderToc,
  normalizeAnchorId,
  generateSlug,
  // Metadata mode control
  MetadataMode,
  setMetadata,
  getMetadata,
  skipMetadata,
  // Errors
  TextPromptsError,
  ParseError,
  FrontmatterError,
  SemanticError,
  FormatError,
  FileMissingError,
} from "textprompts";

// Edge-safe subset (no node:fs)
import { Prompt, parseString /* ... */ } from "textprompts/core";
```

Full details: [API reference](./docs/api.md).

## Documentation

- [Getting started](./docs/index.md)
- [Authoring guide](./docs/guide.md)
- [File format](./docs/file-format.md)
- [API reference](./docs/api.md)
- [Examples (rendered)](./docs/examples.md)
- [Runnable examples](./examples/)
- [Authoring skill (the canonical guide)](../../docs/writing-prompts-with-textprompts/SKILL.md)
- [Cross-language SPEC](../../docs/specs/SPEC_conditional_syntax_v2.md)

## License

MIT — see [LICENSE](../../LICENSE).
