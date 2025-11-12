# API Reference

Complete API documentation for textprompts.

## Functions

### `loadPrompt()`

Load a single prompt file.

```typescript
async function loadPrompt(
  path: string,
  options?: LoadPromptOptions
): Promise<Prompt>
```

**Parameters:**
- `path: string` - Path to the prompt file (relative or absolute)
- `options?: LoadPromptOptions` - Optional configuration
  - `meta?: MetadataMode | string | null` - Metadata handling mode (default: uses global setting)

**Returns:** `Promise<Prompt>` - The loaded prompt object

**Throws:**
- `FileMissingError` - File does not exist or is not accessible
- `MissingMetadataError` - Metadata required but not found (in STRICT mode)
- `InvalidMetadataError` - TOML syntax error or invalid metadata
- `MalformedHeaderError` - Front-matter structure is incorrect

**Example:**
```typescript
import { loadPrompt } from "textprompts";

// Simple usage
const prompt = await loadPrompt("prompts/greeting.txt");

// With metadata mode
const strict = await loadPrompt("prompts/system.txt", { meta: "strict" });

// Alternative static method
const alt = await Prompt.fromPath("prompts/greeting.txt");
```

---

### `loadPrompts()`

Load multiple prompts from files or directories.

```typescript
async function loadPrompts(
  paths: string | string[],
  options?: LoadPromptsOptions
): Promise<Prompt[]>

// Alternative signature with multiple string arguments
async function loadPrompts(
  path: string,
  ...rest: Array<string | LoadPromptsOptions>
): Promise<Prompt[]>
```

**Parameters:**
- `paths: string | string[]` - Single path or array of paths to files/directories
- `options?: LoadPromptsOptions` - Optional configuration
  - `recursive?: boolean` - Search directories recursively (default: `false`)
  - `glob?: string` - File pattern to match (default: `"*.txt"`)
  - `meta?: MetadataMode | string | null` - Metadata handling mode
  - `maxFiles?: number | null` - Maximum files to process (default: `1000`)

**Returns:** `Promise<Prompt[]>` - Array of loaded prompts

**Throws:**
- `FileMissingError` - A specified path does not exist
- `TextPromptsError` - Max files limit exceeded

**Examples:**
```typescript
import { loadPrompts } from "textprompts";

// Load from directory
const prompts = await loadPrompts("prompts/");

// Load recursively with custom glob
const all = await loadPrompts("prompts/", {
  recursive: true,
  glob: "**/*.txt"
});

// Load specific files
const specific = await loadPrompts([
  "prompts/system.txt",
  "prompts/user.txt"
]);

// With file limit
const limited = await loadPrompts("prompts/", { maxFiles: 10 });
```

---

### `savePrompt()`

Save a prompt to a file.

```typescript
async function savePrompt(
  path: string,
  content: string | Prompt
): Promise<void>
```

**Parameters:**
- `path: string` - Path where the file will be saved
- `content: string | Prompt` - Content to save
  - If `string`: Creates a template with empty metadata fields
  - If `Prompt`: Saves with full metadata

**Returns:** `Promise<void>`

**Examples:**
```typescript
import { savePrompt, Prompt, PromptString } from "textprompts";

// Save simple string (creates template)
await savePrompt("new.txt", "Hello {name}!");

// Save Prompt object
const prompt = new Prompt({
  path: "greeting.txt",
  meta: {
    title: "Greeting",
    version: "1.0.0",
    description: "Simple greeting"
  },
  prompt: new PromptString("Hello {name}!")
});
await savePrompt("greeting.txt", prompt);
```

---

### `setMetadata()`

Set the global metadata handling mode.

```typescript
function setMetadata(mode: MetadataMode | string): void
```

**Parameters:**
- `mode: MetadataMode | string` - One of: `"strict"`, `"allow"`, `"ignore"`, or `MetadataMode` enum values

**Example:**
```typescript
import { setMetadata, MetadataMode } from "textprompts";

// Using enum
setMetadata(MetadataMode.STRICT);

// Using string
setMetadata("allow");
```

---

### `getMetadata()`

Get the current global metadata handling mode.
Defaults to `MetadataMode.ALLOW`, which parses metadata when present without requiring it.

```typescript
function getMetadata(): MetadataMode
```

**Returns:** `MetadataMode` - Current metadata mode

**Example:**
```typescript
import { getMetadata } from "textprompts";

const current = getMetadata();
console.log(current);  // "allow", "ignore", or "strict"
```

---

### `skipMetadata()`

Convenience function to set IGNORE mode with optional warning suppression.

```typescript
function skipMetadata(options?: { skipWarning?: boolean }): void
```

**Parameters:**
- `options?.skipWarning?: boolean` - Suppress warnings about ignored metadata (default: `false`)

**Example:**
```typescript
import { skipMetadata } from "textprompts";

// Skip metadata but still warn if present
skipMetadata();

// Skip metadata and suppress warnings
skipMetadata({ skipWarning: true });
```

---

### `extractPlaceholders()`

Extract placeholder names from a template string.

```typescript
function extractPlaceholders(text: string): Set<string>
```

**Parameters:**
- `text: string` - Template string with `{placeholder}` syntax

**Returns:** `Set<string>` - Set of unique placeholder names

**Example:**
```typescript
import { extractPlaceholders } from "textprompts";

const placeholders = extractPlaceholders("Hello {name}, you ordered {item}");
console.log([...placeholders]);  // ["name", "item"]
```

---

### `getPlaceholderInfo()`

Get detailed information about placeholders in a template.

```typescript
function getPlaceholderInfo(text: string): {
  count: number;
  names: Set<string>;
  hasPositional: boolean;
  hasNamed: boolean;
  isMixed: boolean;
}
```

**Parameters:**
- `text: string` - Template string

**Returns:** Object with:
- `count: number` - Total number of unique placeholders
- `names: Set<string>` - Set of placeholder names
- `hasPositional: boolean` - Has numeric placeholders like `{0}`, `{1}`
- `hasNamed: boolean` - Has named placeholders like `{name}`
- `isMixed: boolean` - Has both positional and named placeholders

**Example:**
```typescript
import { getPlaceholderInfo } from "textprompts";

const info = getPlaceholderInfo("User {0} ordered {item} on {1}");
console.log(info);
// {
//   count: 3,
//   names: Set(3) { "0", "item", "1" },
//   hasPositional: true,
//   hasNamed: true,
//   isMixed: true
// }
```

---

## Classes

### `Prompt`

The main prompt object containing metadata and content.

```typescript
class Prompt {
  readonly path: string;
  readonly meta: PromptMeta | null;
  readonly prompt: PromptString;

  constructor(init: PromptInit);

  static async fromPath(
    path: string,
    options?: { meta?: MetadataMode | string | null }
  ): Promise<Prompt>;

  toString(): string;
  valueOf(): string;
  strip(): string;
  format(options?: FormatOptions): string;
  format(args: unknown[], kwargs?: Record<string, unknown>, options?: FormatCallOptions): string;
  get length(): number;
  slice(start?: number, end?: number): string;
}
```

**Constructor Parameters:**
```typescript
interface PromptInit {
  path: string;
  meta: PromptMeta | null;
  prompt: string | PromptString;
}
```

**Methods:**

#### `Prompt.fromPath()` (static)
Alternative way to load a prompt.

```typescript
const prompt = await Prompt.fromPath("greeting.txt", { meta: "allow" });
```

#### `toString()` / `valueOf()`
Returns the raw prompt text.

```typescript
const text = prompt.toString();
const value = String(prompt);  // Uses valueOf()
```

#### `strip()`
Returns the prompt text with leading/trailing whitespace removed.

```typescript
const trimmed = prompt.strip();
```

#### `format()`
Format the prompt with variables (delegates to `PromptString.format()`).

```typescript
// Object syntax
const result = prompt.format({
  name: "Alice",
  role: "admin"
});

// Array syntax
const result = prompt.format(["Alice", "admin"]);

// With options
const partial = prompt.format(
  { name: "Alice" },
  { skipValidation: true }
);
```

#### `slice()`
Get a substring of the prompt.

```typescript
const preview = prompt.slice(0, 100);
```

---

### `PromptString`

Safe string wrapper with format validation.

```typescript
class PromptString {
  readonly value: string;
  readonly placeholders: Set<string>;

  constructor(value: string);

  format(options?: FormatOptions): string;
  format(args: unknown[], kwargs?: Record<string, unknown>, options?: FormatCallOptions): string;

  toString(): string;
  valueOf(): string;
  strip(): string;
  slice(start?: number, end?: number): string;
  get length(): number;
}
```

**Constructor:**
```typescript
const template = new PromptString("Hello {name}!");
```

**Properties:**
- `value: string` - The raw template string
- `placeholders: Set<string>` - Set of placeholder names found in the template

**Methods:**

#### `format()`
Format the template with values.

**Signatures:**
```typescript
// Object syntax
format(options?: {
  args?: unknown[];
  kwargs?: Record<string, unknown>;
  skipValidation?: boolean;
}): string

// Array + kwargs syntax
format(
  args: unknown[],
  kwargs?: Record<string, unknown>,
  options?: { skipValidation?: boolean }
): string
```

**Examples:**
```typescript
const template = new PromptString("Hello {name}, you are {role}");

// Object syntax with kwargs
template.format({ name: "Alice", role: "admin" });

// Array syntax (positional)
const t2 = new PromptString("Hello {0}, you are {1}");
t2.format(["Alice", "admin"]);

// Mixed
const t3 = new PromptString("{0} ordered {item}");
t3.format(["Alice"], { item: "widget" });

// Partial formatting
template.format({ name: "Alice" }, {}, { skipValidation: true });
// or
template.format({ name: "Alice" }, { skipValidation: true });
```

#### Other Methods
Same as `Prompt` methods: `toString()`, `valueOf()`, `strip()`, `slice()`, `length`.

---

## Interfaces

### `PromptMeta`

Metadata extracted from TOML front-matter.

```typescript
interface PromptMeta {
  title?: string | null;
  version?: string | null;
  author?: string | null;
  created?: string | null;
  description?: string | null;
}
```

**Example:**
```typescript
const meta: PromptMeta = {
  title: "Customer Greeting",
  version: "1.0.0",
  author: "Support Team",
  description: "Standard greeting template"
};
```

---

### `LoadPromptOptions`

Options for `loadPrompt()`.

```typescript
interface LoadPromptOptions {
  meta?: MetadataMode | string | null;
}
```

---

### `LoadPromptsOptions`

Options for `loadPrompts()`.

```typescript
interface LoadPromptsOptions extends LoadPromptOptions {
  recursive?: boolean;
  glob?: string;
  maxFiles?: number | null;
}
```

---

### `FormatOptions`

Options for `format()` method (object syntax).

```typescript
interface FormatOptions {
  args?: unknown[];
  kwargs?: Record<string, unknown>;
  skipValidation?: boolean;
}
```

---

### `FormatCallOptions`

Options for `format()` method (when using separate args parameter).

```typescript
interface FormatCallOptions {
  skipValidation?: boolean;
}
```

---

## Enums

### `MetadataMode`

Metadata handling modes.

```typescript
const MetadataMode = {
  STRICT: "strict",
  ALLOW: "allow",
  IGNORE: "ignore",
} as const;

type MetadataMode = (typeof MetadataMode)[keyof typeof MetadataMode];
```

**Values:**
- `MetadataMode.STRICT` (`"strict"`) - Require complete metadata with title, description, and version
- `MetadataMode.ALLOW` (`"allow"`) - Load metadata if present, don't require it
- `MetadataMode.IGNORE` (`"ignore"`) - Skip metadata parsing, use filename as title

**Usage:**
```typescript
import { MetadataMode } from "textprompts";

setMetadata(MetadataMode.STRICT);
// or
const prompt = await loadPrompt("file.txt", { meta: MetadataMode.ALLOW });
```

---

## Exceptions

All exceptions extend `TextPromptsError`.

### `TextPromptsError`

Base exception for all textprompts errors.

```typescript
class TextPromptsError extends Error {
  constructor(message: string);
}
```

---

### `FileMissingError`

Thrown when a file cannot be found or accessed.

```typescript
class FileMissingError extends TextPromptsError {
  constructor(path: string);
}
```

**Example:**
```typescript
try {
  await loadPrompt("missing.txt");
} catch (error) {
  if (error instanceof FileMissingError) {
    console.error("File not found:", error.message);
  }
}
```

---

### `MissingMetadataError`

Thrown when metadata is required but not present (STRICT mode).

```typescript
class MissingMetadataError extends TextPromptsError {
  constructor(message?: string);
}
```

---

### `InvalidMetadataError`

Thrown when metadata TOML is invalid or incomplete.

```typescript
class InvalidMetadataError extends TextPromptsError {
  constructor(message: string);
}
```

---

### `MalformedHeaderError`

Thrown when front-matter delimiters are incorrect.

```typescript
class MalformedHeaderError extends TextPromptsError {
  constructor(message: string);
}
```

---

## Type Guards

You can use `instanceof` checks for error handling:

```typescript
import {
  TextPromptsError,
  FileMissingError,
  InvalidMetadataError,
  MissingMetadataError,
  MalformedHeaderError,
} from "textprompts";

try {
  const prompt = await loadPrompt("file.txt", { meta: "strict" });
} catch (error) {
  if (error instanceof FileMissingError) {
    console.error("File not found");
  } else if (error instanceof MissingMetadataError) {
    console.error("Missing required metadata");
  } else if (error instanceof InvalidMetadataError) {
    console.error("Invalid TOML syntax");
  } else if (error instanceof MalformedHeaderError) {
    console.error("Malformed front-matter");
  } else if (error instanceof TextPromptsError) {
    console.error("Other textprompts error");
  } else {
    console.error("Unknown error");
  }
}
```

---

## Environment Variables

### `TEXTPROMPTS_METADATA_MODE`

Set the default metadata mode before the library is imported.

**Values:** `"strict"`, `"allow"`, `"ignore"`

**Example:**
```bash
# In your shell or .env file
export TEXTPROMPTS_METADATA_MODE=strict

# Or in Node.js before import
process.env.TEXTPROMPTS_METADATA_MODE = "strict";
```

```typescript
// Now all loads use strict mode by default
import { loadPrompt } from "textprompts";

const prompt = await loadPrompt("file.txt");  // Uses strict mode
```

---

## TypeScript Types

All types are fully exported and available for import:

```typescript
import type {
  Prompt,
  PromptMeta,
  PromptInit,
  PromptString,
  LoadPromptOptions,
  LoadPromptsOptions,
  FormatOptions,
  FormatCallOptions,
  MetadataMode,
  TextPromptsError,
  FileMissingError,
  MissingMetadataError,
  InvalidMetadataError,
  MalformedHeaderError,
} from "textprompts";
```

---

## See Also

- [Getting Started](./index.md) - Introduction and basic usage
- [Usage Guide](./guide.md) - Best practices and patterns
- [File Format](./file-format.md) - Prompt file format specification
- [Examples](./examples.md) - Real-world usage examples
