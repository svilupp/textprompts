# textprompts (TypeScript) — getting started

textprompts treats prompt files as first-class artifacts: text plus optional
TOML/YAML frontmatter, a small `{var}` placeholder language, and conditional
tags (`{if}`, `{switch}`) for branchy content. Files are loaded once, formatted
many times with typed inputs.

## v2 breaking changes

If you are coming from v1, four things to know up front:

- **Positional placeholders are gone.** `{0}`, `{1}`, … no longer parse.
- **Empty placeholders are gone.** `{}` no longer parses.
- **The double-brace escape is gone.** Use backslash escapes (`\{`, `\}`, `\\`) for
  literal braces.
- **`Prompt.format(args, kwargs, options)` is gone.** The only signature is
  `prompt.format({ flags, ...vars })`.
- **`PromptString` is no longer a public export.** Use `Prompt.fromString` for
  in-memory strings, or `loadPrompt` for files.

See the [migration section in the README](../README.md#migrating-from-v1) for
diff-style examples and the
[authoring skill](../../../docs/writing-prompts-with-textprompts/SKILL.md)
for the full v2 design rationale.

## Installation

```bash
npm install textprompts
# or
bun add textprompts
# or
pnpm add textprompts
```

## Your first prompt

Create `prompts/greeting.txt`:

```
---
title = "Customer Greeting"
version = "1.0.0"
description = "Friendly greeting template"

[variables.customer_name]
description = "Display name shown to the customer"

[variables.company_name]
description = "Company the greeting is on behalf of"
---
Hello {customer_name}!

Welcome to {company_name}.
```

Load and format it:

```typescript
import { loadPrompt } from "textprompts";

const prompt = await loadPrompt("prompts/greeting.txt");
const message = prompt.format({
  customer_name: "Alice",
  company_name: "ACME Corp",
});
console.log(message);
// Hello Alice!
//
// Welcome to ACME Corp.
```

## Add a conditional

Optional content goes inside `{if flag}...{end}`. Declare the flag in
`[flags.*]` so callers know it exists:

```
---
title = "Greeting with persona"
version = "1.1.0"
description = "Optional persona line gated by `persona` flag"

[flags.persona]
description = "Include the persona line"

[variables.customer_name]
description = "Display name"
---
Hello {customer_name}!
{if persona}
I am Aria, your assistant for today.
{end}
How can I help?
```

```typescript
const greeting = await loadPrompt("prompts/greeting.txt");

greeting.format({
  customer_name: "Alice",
  flags: { persona: true },
});
// Hello Alice!
// I am Aria, your assistant for today.
// How can I help?

greeting.format({
  customer_name: "Alice",
  flags: { persona: false },
});
// Hello Alice!
// How can I help?
```

The keyword lines (`{if persona}` and `{end}`) and the body line render or
disappear together. Whitespace stays exactly as you wrote it.

## In-memory prompts

When you cannot load from disk — bundlers, edge runtimes, tests — use
`Prompt.fromString`:

```typescript
import { Prompt } from "textprompts";

const prompt = Prompt.fromString("Hello {name}{if friendly}, friend{end}!");

prompt.format({ name: "Alice", flags: { friendly: true } });
// Hello Alice, friend!
```

Use `textprompts/core` for an entry point with zero `node:*` imports
(Cloudflare Workers, Deno Deploy, Vercel Edge, the browser).

## Metadata modes

The loader takes a `metadata` option (SPEC §4.6):

- `"allow"` (default) — parse frontmatter if present, fall back to implicit
  inference for flags referenced in the body.
- `"strict"` — require frontmatter, require non-empty descriptions on every
  declared flag, require `title`/`description`/`version`.
- `"ignore"` — the source is not inspected for frontmatter at all. The whole
  file is treated as the prompt body, including any leading `---...---` block.
  Useful for files that intentionally do not use the textprompts schema.

```typescript
const prompt = await loadPrompt("prompts/system.txt", {
  metadata: "strict",
  frontmatterFormat: "toml", // "auto" (default) | "toml" | "yaml"
});
```

## Where next

- [Authoring guide (skill)](../../../docs/writing-prompts-with-textprompts/SKILL.md)
  — full guidance for writing v2 prompts
- [File format reference](./file-format.md) — every recognized field and tag
- [API reference](./api.md) — every public export
- [Usage guide](./guide.md) — patterns, AI provider integrations
- [Examples](./examples.md) — rendered source/output pairs for each conditional form
