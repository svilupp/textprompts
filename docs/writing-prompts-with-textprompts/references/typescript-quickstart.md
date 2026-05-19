# TypeScript quickstart (v2.0)

Concrete walkthrough for the v2.0 TypeScript reference implementation
(`packages/textprompts-ts`). Pairs with the
[Conditional syntax cheatsheet](conditional-syntax-cheatsheet.md) and
[SPEC §6.1](../../specs/SPEC_conditional_syntax_v2.md).

> Bun, Node ≥ 20, Deno, and modern edge runtimes are supported. For Cloudflare
> Workers, Deno Deploy, Vercel Edge, or browser builds, import from
> `textprompts/core` — same surface minus `loadPrompt`, `loadSection`,
> `savePrompt`, and `parseFile`.

---

## Install

```bash
bun add textprompts
# or
npm install textprompts
```

---

## Load a prompt from disk

```ts
import { loadPrompt } from "textprompts";

const prompt = await loadPrompt("prompts/support.txt");
```

`loadPrompt` returns a `Prompt` whose `meta` carries standard fields, declared
`flags`, declared `variables`, and any custom `extras` (SPEC §6.5).

Loader options (SPEC §6.1):

```ts
await loadPrompt("prompts/support.txt", {
  metadata: "strict",          // "allow" | "strict" | "ignore"
  frontmatterFormat: "toml",   // "auto" | "toml" | "yaml"
});
```

- `metadata` (default `"allow"`) — see SKILL.md "Metadata modes".
- `frontmatterFormat` (default `"auto"`) — try TOML first, then YAML; or pin.

---

## Build a prompt from a string

For in-memory prompts (CLI tools, tests, generated prompts) use
`Prompt.fromString`:

```ts
import { Prompt } from "textprompts";

const prompt = Prompt.fromString(
  "Hello, {name}!{if formal} It is a pleasure to meet you.{end}",
);
```

`Prompt.fromString` accepts the same options as `loadPrompt`:

```ts
const prompt = Prompt.fromString(content, {
  metadata: "ignore",
  frontmatterFormat: "yaml",
});
```

> `PromptString` is **not** exported in v2. Use `Prompt.fromString`.

---

## Format

`format` takes one object: `flags` plus variables as siblings.

```ts
const text = prompt.format({
  name: "Alice",
  flags: { formal: true },
});
```

That is the complete signature. There is no positional overload, no `args`
argument, no `kwargs` keyword (SPEC §6.4).

Full example mirroring SPEC §8.2:

```ts
import { loadPrompt } from "textprompts";

const prompt = await loadPrompt("prompts/support.txt", { metadata: "strict" });

const text = prompt.format({
  user_name: "Jan",
  last_question: "How do I upgrade?",
  flags: {
    tier: "premium",
    has_history: true,
  },
});
```

---

## Inspect declared metadata

```ts
prompt.meta.title;                      // "Customer support agent"
prompt.meta.version;                    // "2.1"
prompt.meta.description;                // string

// Top-level custom fields
prompt.meta.extras.owner;               // "@support-eng"
prompt.meta.extras.last_reviewed;       // "2026-04-30"

// Per-flag declaration
prompt.meta.flags.tier.kind;            // "enum"
prompt.meta.flags.tier.values;          // ["free", "premium", "enterprise"]
prompt.meta.flags.tier.description;     // string
prompt.meta.flags.tier.extras.owner;    // "@product"

// Per-variable declaration
prompt.meta.variables.user_name.description;
prompt.meta.variables.user_name.extras; // {}
```

Every level preserves the original TOML/YAML value types (strings, numbers,
booleans, arrays, nested objects).

`JSON.stringify(prompt.meta)` round-trips losslessly — `meta` is plain
objects, no `Map`s or class instances.

---

## Save (round-trip frontmatter)

```ts
import { loadPrompt, savePrompt } from "textprompts";

const prompt = await loadPrompt("prompts/support.txt");

// Mutate, then write back.
prompt.meta.version = "2.2";

await savePrompt("prompts/support.txt", prompt);
```

`savePrompt` serializes flags, variables, and custom extras at all three
levels. Format is preserved from the source unless `frontmatterFormat` is
passed explicitly.

---

## Sections

Section helpers are unchanged from v1.

```ts
import { loadSection, parseSections, renderToc } from "textprompts";

// Load one named section as a standalone Prompt.
const intro = await loadSection("prompts/agents.txt", "introduction");

// Or get every section's text from an already-loaded Prompt.
const sections = parseSections(prompt.prompt);
const toc = renderToc(sections);
```

See `packages/textprompts-ts/docs/api.md` for the full section API.

---

## Detecting unused inputs (opt-in)

`format` silently ignores extra flags or variables (SPEC §5.7). To detect
unused keys in your context, diff against the declared shape:

```ts
const declaredVars = new Set(Object.keys(prompt.meta.variables));
const declaredFlags = new Set(Object.keys(prompt.meta.flags));

const ctx = { name: "Alice", role: "admin", flags: { formal: true, debug: true } };

const unusedVars = Object.keys(ctx).filter(
  (k) => k !== "flags" && !declaredVars.has(k),
);
const unusedFlags = Object.keys(ctx.flags ?? {}).filter(
  (k) => !declaredFlags.has(k),
);
```

This is a runtime check you choose to do; the library never raises on extras.

---

## Errors

Every thrown error extends `TextPromptsError` and carries a stable string
`code`:

```ts
import { FormatError } from "textprompts";

try {
  prompt.format({ flags: { tier: "trial" } });
} catch (err) {
  if (err instanceof FormatError) {
    console.error(err.code);      // "E_INVALID_FLAG_VALUE"
    console.error(err.message);
  }
}
```

Stable error codes appear in [`error-debugging.md`](error-debugging.md).
Match on `code`, not message, in tests.

---

## Common pitfalls

- **Passing `flags` as a string**: `prompt.format({ flags: "premium" })` →
  `E_BAD_FLAGS_TYPE`. `flags` is always an object.
- **Forgetting `flags` entirely**: `prompt.format({ name: "Alice" })` on a
  prompt that uses any flag → `E_MISSING_FLAGS_OBJECT` (distinct from the
  per-flag `E_MISSING_FLAG`).
- **String for boolean flag**: `flags: { show: "true" }` → `E_WRONG_FLAG_TYPE`.
  No coercion; convert in caller code.
- **Variable only in inactive branch**: passing `{ flags: { has_extra: false } }`
  without `extra` when the body says `{if has_extra}{extra}{end}` → still
  `E_MISSING_VARIABLE` (SPEC §5.2).
- **Reserved key as input**: `prompt.format({ if: "x" })` → `E_RESERVED_KEY`.
  Use a different name.
- **Importing `PromptString`**: it is no longer exported. Use
  `Prompt.fromString`.

---

## See also

- `packages/textprompts-ts/docs/api.md` — full API reference.
- `packages/textprompts-ts/docs/guide.md` — long-form authoring guide.
- `packages/textprompts-ts/docs/file-format.md` — file format spec, condensed.
- `packages/textprompts-ts/examples/` — runnable examples (`bun examples/basic-usage.ts`).
- [SPEC_conditional_syntax_v2.md](../../specs/SPEC_conditional_syntax_v2.md) — cross-language normative spec.
