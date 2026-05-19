# API reference

Complete v2 API surface. For Cloudflare Workers, Deno Deploy, Vercel Edge, or
browser builds, import from `textprompts/core` — it has zero `node:*` imports
but excludes `loadPrompt`, `loadSection`, `savePrompt`, and `parseFile`.

## v2 breaking changes

- `Prompt.format(args, kwargs, options)` overloads are gone. The only
  signature is `prompt.format({ flags?, ...vars })`.
- `PromptString` is no longer exported. Use `Prompt.fromString` (or
  `loadPrompt`) instead.
- The loader option is `metadata` (not `meta`).
- New top-level error classes: `ParseError`, `FrontmatterError`,
  `SemanticError`, `FormatError`. Each carries a stable string `code`.

See [Migrating from v1](../README.md#migrating-from-v1) for a diff-style guide.

---

## Loading prompts

### `loadPrompt(path, options?)`

```typescript
async function loadPrompt(
  path: string,
  options?: PromptLoadOptions,
): Promise<Prompt>
```

Loads a prompt file from disk and returns a `Prompt`.

```typescript
interface PromptLoadOptions {
  metadata?: "allow" | "strict" | "ignore" | MetadataMode | null;
  frontmatterFormat?: "auto" | "toml" | "yaml";
}
```

- `metadata` (default `"allow"`) — see [File format §4.6](./file-format.md#metadata-modes).
- `frontmatterFormat` (default `"auto"`) — try TOML then YAML; or pin to one.

Throws (all extend `TextPromptsError`): `FileMissingError`, `ParseError`,
`FrontmatterError`, `SemanticError`, `MissingMetadataError`,
`InvalidMetadataError`, `MalformedHeaderError`.

```typescript
import { loadPrompt } from "textprompts";

const prompt = await loadPrompt("prompts/system.txt", {
  metadata: "strict",
  frontmatterFormat: "toml",
});
```

### `loadSection(path, anchorId, options?)`

```typescript
async function loadSection(
  path: string,
  anchorId: string,
  options?: PromptLoadOptions,
): Promise<Prompt>
```

Loads one named XML/Markdown section from a multi-section file and returns it
as a `Prompt`. Anchor lookup tolerates `-` vs `_` and case differences.

### `parseFile(path, options?)` / `parseString(content, options?)`

Lower-level entry points that bypass the existence check. `parseFile` reads
from disk; `parseString` reads from an in-memory string. Both accept the same
`PromptLoadOptions`. `parseString` also takes the source path as its second
positional argument (used in error messages); use `Prompt.fromString` for the
ergonomic form.

---

## The `Prompt` class

```typescript
class Prompt {
  readonly path: string;
  readonly meta: PromptMeta;

  static fromPath(path: string, options?: PromptLoadOptions): Promise<Prompt>;
  static fromString(content: string, options?: PromptLoadOptions & { path?: string }): Prompt;

  format(inputs?: { flags?: Record<string, boolean | string> } & Record<string, unknown>): string;

  toString(): string;
  valueOf(): string;
}
```

### `Prompt.fromPath(path, options?)`

Async alternative to `loadPrompt`. Internally dynamically imports the file
system entry points so `textprompts/core` stays node-free.

### `Prompt.fromString(content, options?)`

Builds a prompt from an in-memory string. Frontmatter, conditional tags, and
metadata modes work exactly like `loadPrompt`. Pass `path` for nicer error
messages (defaults to `"<string>"`).

```typescript
import { Prompt } from "textprompts";

const prompt = Prompt.fromString(
  "Hello {name}{if friendly}, friend{end}!",
);
prompt.format({ name: "Alice", flags: { friendly: true } });
// "Hello Alice, friend!"
```

### `prompt.format(inputs)`

One signature, no overloads:

```typescript
prompt.format({
  // Optional reserved key — every flag the body references must appear here.
  flags: { tier: "premium", has_urgent: true },

  // Every other top-level key is a variable substitution. Every variable
  // referenced anywhere in the body must be present, regardless of branch.
  user_name: "Jan",
  last_question: "How do I upgrade?",
});
```

Extra keys (variables or flags that the body never references) are silently
ignored (SPEC §5.7). If you want to detect unused inputs, diff your keys
against `prompt.meta.flags` and `prompt.meta.variables` yourself.

Throws `FormatError` for missing required inputs, wrong flag types,
unrecognized enum values, or reserved keywords used as input keys.

### `toString()` / `valueOf()`

Return the prompt's raw source text (after BOM / CRLF normalization). Useful
when you want to pipe the unformatted prompt elsewhere or when you embed a
`Prompt` in a template literal.

---

## `PromptMeta`

```typescript
interface PromptMeta {
  title?: string | null;
  version?: string | null;
  description?: string | null;
  author?: string | null;
  created?: string | null;

  // Any top-level frontmatter field that isn't one of the standard ones above.
  // Original TOML/YAML types preserved.
  extras: Record<string, unknown>;

  // Parsed [flags.*] / flags: declarations plus implicit body-referenced flags.
  flags: Record<string, FlagDecl>;

  // Parsed [variables.*] / variables: declarations.
  variables: Record<string, VarDecl>;
}

type FlagDecl = BooleanFlag | EnumFlag;

interface BooleanFlag {
  kind: "boolean";
  description?: string;
  extras: Record<string, unknown>;
}

interface EnumFlag {
  kind: "enum";
  values: string[];
  description?: string;
  extras: Record<string, unknown>;
}

interface VarDecl {
  description?: string;
  extras: Record<string, unknown>;
}
```

`extras` is always a plain object (never `null`). Same for `flags` and
`variables`. That means `prompt.meta.flags` is safe to iterate over without
null-guards.

```typescript
const expected = new Set(Object.keys(prompt.meta.flags));
const passed = new Set(Object.keys(myFlags));
const unused = [...passed].filter((f) => !expected.has(f));
if (unused.length) {
  console.warn(`Passing flags the prompt does not use: ${unused.join(", ")}`);
}
```

---

## Saving prompts

### `savePrompt(path, content, options?)`

```typescript
async function savePrompt(
  path: string,
  content: string | Prompt,
  options?: { format?: "toml" | "yaml" },
): Promise<void>
```

- `content: string` — writes a minimal template with empty `title` /
  `description` / `version` placeholders followed by the body.
- `content: Prompt` — round-trips standard fields, `meta.extras`,
  `[flags.*]` (kind, values, description, extras), and `[variables.*]`
  (description, extras).
- `format` (default `"toml"`) — output frontmatter format.

```typescript
import { savePrompt, Prompt } from "textprompts";

const prompt = Prompt.fromString(`---
title = "Saved"
version = "1.0.0"
description = "Round-trip test"
---
Hi {name}!`);

await savePrompt("output.txt", prompt, { format: "yaml" });
```

---

## Sections (Markdown / XML)

```typescript
function parseSections(text: string | Uint8Array): ParseResult;
function generateSlug(heading: string): string;
function normalizeAnchorId(id: string): string;
function getSectionText(text: string | Uint8Array, anchorId: string): string | null;
function sliceSectionContent(text: string | Uint8Array, section: Section): string;
function injectAnchors(text: string | Uint8Array): { text: string; result: ParseResult };
function renderToc(result: ParseResult, path: string): string;
```

These cover the multi-section file pattern (`<system id="default">…</system>`,
`<system id="expert">…</system>`). Anchor IDs are normalized: lowercase,
non-alphanumeric runs collapsed to `_`, leading/trailing `_` stripped. That
means `loadSection(file, "my-section")`, `"my_section"`, and `"MY_SECTION"`
all resolve to the same section.

See [`examples/sections-usage.ts`](../examples/sections-usage.ts) for a full
walk-through.

---

## Metadata mode helpers

```typescript
function setMetadata(mode: MetadataMode | string): void;
function getMetadata(): MetadataMode;
function skipMetadata(options?: { skipWarning?: boolean }): void;
function warnOnIgnoredMetadata(): boolean;

const MetadataMode: {
  STRICT: "strict";
  ALLOW: "allow";
  IGNORE: "ignore";
};
type MetadataMode = "strict" | "allow" | "ignore";
```

These adjust the **process-global** default. The per-call `metadata` option
on `loadPrompt` / `Prompt.fromString` always takes precedence.

Environment variable override: set `TEXTPROMPTS_METADATA_MODE` to `"strict"`,
`"allow"`, or `"ignore"` before importing the library.

---

## Errors

All errors extend `TextPromptsError`. Each carries a stable string `code`
where applicable, plus optional `path` / `line` / `column` context.

```typescript
class TextPromptsError extends Error {}

// Lexer / body parser
class ParseError extends TextPromptsError {
  readonly code?: string;       // "E_BAD_TAG", "E_UNCLOSED_IF", "E_DUPLICATE_CASE", ...
  readonly path?: string;
  readonly line?: number;
  readonly column?: number;
}

// Frontmatter schema validation
class FrontmatterError extends TextPromptsError {
  readonly code?: FrontmatterErrorCode;
  // E_INVALID_IDENTIFIER | E_RESERVED_IDENTIFIER | E_DUPLICATE_NAME |
  // E_INVALID_FLAG_TYPE | E_INVALID_FLAG_VALUES | E_BAD_SCHEMA_SHAPE
}

// Body-vs-declaration mismatches at load time
class SemanticError extends TextPromptsError {
  readonly code?: SemanticErrorCode;
  // E_UNDECLARED_FLAG | E_FLAG_USED_AS_BOTH_IF_AND_SWITCH |
  // E_NON_EXHAUSTIVE_SWITCH | E_INVALID_CASE_VALUE |
  // E_FLAG_AND_VARIABLE_COLLISION
}

// Format-time input validation
class FormatError extends TextPromptsError {
  readonly code?: FormatErrorCode;
  // E_MISSING_FLAGS_OBJECT | E_BAD_FLAGS_TYPE | E_MISSING_FLAG |
  // E_MISSING_VARIABLE | E_WRONG_FLAG_TYPE | E_INVALID_FLAG_VALUE |
  // E_RESERVED_KEY
}

// File IO
class FileMissingError extends TextPromptsError {}

// Legacy frontmatter errors (kept for backwards compatibility)
class MissingMetadataError extends TextPromptsError {}
class InvalidMetadataError extends TextPromptsError {}
class MalformedHeaderError extends TextPromptsError {}
```

Stable code reference: see [File format → stable error codes](./file-format.md#stable-error-codes).

Example:

```typescript
import { FormatError, loadPrompt } from "textprompts";

try {
  const prompt = await loadPrompt("prompts/system.txt");
  prompt.format({});
} catch (error) {
  if (error instanceof FormatError && error.code === "E_MISSING_VARIABLE") {
    console.warn("Caller forgot a variable:", error.message);
  } else {
    throw error;
  }
}
```

---

## See also

- [Authoring skill](../../../docs/writing-prompts-with-textprompts/SKILL.md)
- [File format](./file-format.md)
- [Usage guide](./guide.md)
- [Examples](./examples.md)
- [Cross-language SPEC](../../../docs/specs/SPEC_conditional_syntax_v2.md)
