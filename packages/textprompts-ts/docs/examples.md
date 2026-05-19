# Examples

Rendered source → output pairs for every conditional form, plus a few
end-to-end integration recipes. Every example uses the v2 API
(`prompt.format({ flags, ...vars })`); none use positional placeholders,
double-brace escapes, or `PromptString`.

For runnable scripts, see [`../examples/`](../examples/).

## v2 breaking changes

- Positional placeholders, empty placeholders, and `{{...}}` escapes are gone.
- `Prompt.format(args, kwargs, options)` overloads are gone.
- `PromptString` is no longer a public export — use `Prompt.fromString`.

See [Migrating from v1](../README.md#migrating-from-v1) for diffs.

---

## Plain variables

Source:

```
Hello {customer_name}!

Welcome to {company_name}.
```

Call:

```typescript
prompt.format({
  customer_name: "Alice",
  company_name: "ACME Corp",
});
```

Output:

```
Hello Alice!

Welcome to ACME Corp.
```

---

## Inline `{if flag}`

Source:

```
You are a {role}{if is_admin} (administrator){end}.
```

With `is_admin = true`:

```
You are a Jan (administrator).
```

With `is_admin = false`:

```
You are a Jan.
```

The trailing `.` outside the tag is preserved either way.

---

## Inline `{if !flag}` (negation)

Source:

```
{role}{if !is_admin} (read-only){end}
```

With `is_admin = false`:

```
analyst (read-only)
```

With `is_admin = true`:

```
analyst
```

---

## Inline `{if} / {else}`

Source:

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

---

## Inline switch

Source:

```
Plan: {switch tier}{case free}free{case premium}premium{else}unknown{end}.
```

With `flags.tier = "premium"`:

```
Plan: premium.
```

With `flags.tier = "free"`:

```
Plan: free.
```

If the renderer encounters a value not enumerated by `{case}` (and the prompt
has not declared an enum), `{else}` catches it. With a declared enum,
exhaustiveness is enforced at load time.

---

## Block `{if}`

Source:

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

Both keyword lines (`{if flag}` and `{end}`) and the body line render or
disappear together. No stray whitespace.

---

## Block `{if} / {else}`

Source:

```
{if include_diagnostics}
Diagnostics:
  - Latency: {latency_ms} ms
  - Error rate: {error_rate}%
{else}
Diagnostics not collected.
{end}
```

With `include_diagnostics = true, latency_ms = 42, error_rate = 0`:

```
Diagnostics:
  - Latency: 42 ms
  - Error rate: 0%
```

With `include_diagnostics = false`:

```
Diagnostics not collected.
```

Note: `latency_ms` and `error_rate` are required in **both** calls, because
they appear anywhere in the body (SPEC §5.2).

---

## Block with body indentation preserved

Source:

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

The body lines keep their two-space indent. The keyword lines disappear.

---

## Block switch

Source:

```
{switch tier}
{case free}
You have standard support. Response times may vary.
{case premium}
You have priority support with guaranteed response within 1 hour.
{case enterprise}
You have a dedicated account manager. Their name is on file.
{end}
```

With `flags.tier = "premium"`:

```
You have priority support with guaranteed response within 1 hour.
```

With `flags.tier = "enterprise"`:

```
You have a dedicated account manager. Their name is on file.
```

---

## Block switch with `{else}`

Source:

```
{switch tier}
{case free}
Free plan.
{case premium}
Premium plan.
{else}
Unknown tier — escalate to support.
{end}
```

With `flags.tier = "enterprise"` (not enumerated):

```
Unknown tier — escalate to support.
```

---

## Indented nested blocks

Source:

```
{if outer}
  {if inner}
  body line
  {end}
{end}
```

With `outer = true, inner = true`:

```
  body line
```

With `outer = true, inner = false`:

(empty output)

The inner `{if inner}` and `{end}` keyword lines are removed including their
two-space indent. The body line `  body line` keeps its leading two spaces.

---

## Escapes

Source:

```
JSON spec: \{"name": "{value}"\}
```

With `value = "Alice"`:

```
JSON spec: {"name": "Alice"}
```

The backslash escapes (`\{`, `\}`, `\\`) are the only escapes the lexer
recognizes.

---

## Full SPEC §8.2 — frontmatter + switch + if

Source (also lives at [`../examples/prompts/support.txt`](../examples/prompts/support.txt)):

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

Call:

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

With `flags: { tier: "free", has_urgent: false }`, `last_question` is still
required (it appears in the body), but the urgent line disappears:

```
You are a helpful support agent assisting Jan.

You have standard support. Response times may vary.
How can I help today?
```

---

## In-memory: `Prompt.fromString`

```typescript
import { Prompt } from "textprompts";

const prompt = Prompt.fromString(
  "Hello {name}{if friendly}, friend{end}!",
);

prompt.format({ name: "Alice", flags: { friendly: true } });
// "Hello Alice, friend!"

prompt.format({ name: "Alice", flags: { friendly: false } });
// "Hello Alice!"
```

The same options as `loadPrompt` work — pass `metadata` and
`frontmatterFormat` to enforce the strict schema on bundled prompt strings.

---

## OpenAI integration

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

A full runnable version (with per-tier model routing) lives at
[`../examples/openai-example.ts`](../examples/openai-example.ts).

---

## Vercel AI SDK integration

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

See [`../examples/aisdk-example.ts`](../examples/aisdk-example.ts) for the
streaming variant.

---

## Anthropic integration

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

## Error handling

```typescript
import { FormatError, loadPrompt } from "textprompts";

const prompt = await loadPrompt("prompts/support.txt");

try {
  prompt.format({ user_name: "Jan", flags: { tier: "premium", has_urgent: false } });
  // Missing: last_question (required because it appears in the body)
} catch (error) {
  if (error instanceof FormatError && error.code === "E_MISSING_VARIABLE") {
    console.warn("Variable missing:", error.message);
  }
}
```

Every error class extends `TextPromptsError` and carries a stable
`code` string. See [the API reference](./api.md#errors) for the full list.

---

## See also

- [Authoring skill](../../../docs/writing-prompts-with-textprompts/SKILL.md)
- [File format](./file-format.md)
- [API reference](./api.md)
- [Usage guide](./guide.md)
- [Runnable examples](../examples/)
