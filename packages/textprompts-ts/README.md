# textprompts-ts

> **So simple, it's not even worth vibing about coding yet it just makes so much sense.**

TypeScript/JavaScript companion to [textprompts](https://github.com/svilupp/textprompts) for loading and formatting prompt files.

Are you tired of vendors trying to sell you fancy UIs for prompt management that just make your system more confusing and harder to debug? Isn't it nice to just have your prompts **next to your code**?

But then you worry: *Did my formatter change my prompt? Are those spaces at the beginning actually part of the prompt or just indentation?*

**textprompts-ts** solves this elegantly: treat your prompts as **text files** and keep your linters and formatters away from them.

## Why textprompts-ts?

- ✅ **Prompts live next to your code** - no external systems to manage
- ✅ **Git is your version control** - diff, branch, and experiment with ease
- ✅ **No formatter headaches** - your prompts stay exactly as you wrote them
- ✅ **Minimal markup** - just TOML front-matter when you need metadata (or no metadata if you prefer!)
- ✅ **Lightweight dependencies** - minimal footprint with just fast-glob and TOML parser
- ✅ **Safe formatting** - catch missing variables before they cause problems
- ✅ **Works with everything** - OpenAI, Anthropic, local models, function calls
- ✅ **Node.js & Bun compatible** - works seamlessly with both runtimes

## Installation

```bash
# With npm
npm install @textprompts/textprompts-ts

# With Bun
bun add @textprompts/textprompts-ts

# With pnpm
pnpm add @textprompts/textprompts-ts
```

## Quick Start

**Super simple by default** - TextPrompts just loads text files with optional metadata:

1. **Create a prompt file** (`greeting.txt`):
```
---
title = "Customer Greeting"
version = "1.0.0"
description = "Friendly greeting for customer support"
---
Hello {customer_name}!

Welcome to {company_name}. We're here to help you with {issue_type}.

Best regards,
{agent_name}
```

2. **Load and use it** (no configuration needed):
```typescript
import { loadPrompt } from "@textprompts/textprompts-ts";

// Just load it - works with or without metadata
const prompt = await loadPrompt("greeting.txt");

// Or use the static method
const alt = await Prompt.fromPath("greeting.txt");

// Use it safely - all placeholders must be provided
const message = prompt.prompt.format({
  customer_name: "Alice",
  company_name: "ACME Corp",
  issue_type: "billing question",
  agent_name: "Sarah"
});

console.log(message);

// Or use partial formatting when needed
const partial = prompt.prompt.format(
  { customer_name: "Alice", company_name: "ACME Corp" },
  { skipValidation: true }
);
// Result: "Hello Alice!\n\nWelcome to ACME Corp. We're here to help you with {issue_type}.\n\nBest regards,\n{agent_name}"

// Prompt objects expose `.meta` and `.prompt`.
// Use `prompt.prompt.format()` for safe formatting or `String(prompt)` for raw text.
```

**Even simpler** - no metadata required:
```typescript
// simple_prompt.txt contains just: "Analyze this data: {data}"
const prompt = await loadPrompt("simple_prompt.txt");  // Just works!
const result = prompt.prompt.format({ data: "sales figures" });
```

## Core Features

### Safe String Formatting

Never ship a prompt with missing variables again:

```typescript
import { PromptString } from "@textprompts/textprompts-ts";

const template = new PromptString("Hello {name}, your order {order_id} is {status}");

// ✅ Strict formatting - all placeholders must be provided
const result = template.format({ name: "Alice", order_id: "12345", status: "shipped" });

// ❌ This catches the error by default
try {
  template.format({ name: "Alice" });  // Missing order_id and status
} catch (error) {
  console.error(error.message);  // Missing format variables: ["order_id", "status"]
}

// ✅ Partial formatting - replace only what you have
const partial = template.format(
  { name: "Alice" },
  { skipValidation: true }
);
console.log(partial);  // "Hello Alice, your order {order_id} is {status}"
```

### Bulk Loading

Load entire directories of prompts:

```typescript
import { loadPrompts } from "@textprompts/textprompts-ts";

// Load all prompts from a directory
const prompts = await loadPrompts("prompts/", { recursive: true });

// Create a lookup
const promptMap = new Map(
  prompts.map(p => [p.meta.title!, p])
);
const greeting = promptMap.get("Customer Greeting");
```

### Simple & Flexible Metadata Handling

TextPrompts is designed to be **super simple** by default - just load text files with optional metadata when available. No configuration needed!

```typescript
import { loadPrompt, setMetadata, MetadataMode } from "@textprompts/textprompts-ts";

// Default behavior: load metadata if available, otherwise just use the file content
const prompt = await loadPrompt("my_prompt.txt");  // Just works!

// Three modes available for different use cases:
// 1. IGNORE (default): Treat as simple text file, use filename as title
setMetadata(MetadataMode.IGNORE);  // Super simple file loading
const simple = await loadPrompt("prompt.txt");  // No metadata parsing
console.log(simple.meta.title);  // "prompt" (from filename)

// 2. ALLOW: Load metadata if present, don't worry if it's incomplete
setMetadata(MetadataMode.ALLOW);  // Flexible metadata loading
const flexible = await loadPrompt("prompt.txt");  // Loads any metadata found

// 3. STRICT: Require complete metadata for production use
setMetadata(MetadataMode.STRICT);  // Prevent errors in production
const strict = await loadPrompt("prompt.txt");  // Must have title, description, version

// Override per prompt when needed
const override = await loadPrompt("prompt.txt", { meta: "strict" });
```

**Why this design?**
- **Default = Simple**: No configuration needed, just load files
- **Flexible**: Add metadata when you want structure
- **Production-Safe**: Use strict mode to catch missing metadata before deployment

## Real-World Examples

### OpenAI Integration

```typescript
import OpenAI from "openai";
import { loadPrompt } from "@textprompts/textprompts-ts";

const systemPrompt = await loadPrompt("prompts/customer_support_system.txt");
const userPrompt = await loadPrompt("prompts/user_query_template.txt");

const openai = new OpenAI();

const response = await openai.chat.completions.create({
  model: "gpt-4",
  messages: [
    {
      role: "system",
      content: systemPrompt.prompt.format({
        company_name: "ACME Corp",
        support_level: "premium"
      })
    },
    {
      role: "user",
      content: userPrompt.prompt.format({
        query: "How do I return an item?",
        customer_tier: "premium"
      })
    }
  ]
});
```

### Anthropic Claude Integration

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { loadPrompt } from "@textprompts/textprompts-ts";

const systemPrompt = await loadPrompt("prompts/system.txt");

const anthropic = new Anthropic();

const message = await anthropic.messages.create({
  model: "claude-3-5-sonnet-20241022",
  max_tokens: 1024,
  system: systemPrompt.prompt.format({
    company_name: "ACME Corp",
    tone: "professional"
  }),
  messages: [
    { role: "user", content: "Hello!" }
  ]
});
```

### Environment-Specific Prompts

```typescript
import { loadPrompt } from "@textprompts/textprompts-ts";

const env = process.env.NODE_ENV || "development";
const systemPrompt = await loadPrompt(`prompts/${env}/system.txt`);

// prompts/development/system.txt - verbose logging
// prompts/production/system.txt - concise responses
```

### Prompt Versioning & Experimentation

```typescript
import { loadPrompt } from "@textprompts/textprompts-ts";

// Easy A/B testing
const promptVersion = "v2";  // or "v1", "experimental", etc.
const prompt = await loadPrompt(`prompts/${promptVersion}/system.txt`);

// Git handles the rest:
// git checkout experiment-branch
// git diff main -- prompts/
```

## File Format

TextPrompts uses TOML front-matter (optional) followed by your prompt content:

```
---
title = "My Prompt"
version = "1.0.0"
author = "Your Name"
description = "What this prompt does"
created = "2024-01-15"
---
Your prompt content goes here.

Use {variables} for templating.
```

### Metadata Modes

Choose the right level of strictness for your use case:

1. **IGNORE** (default) - Simple text file loading, filename becomes title
2. **ALLOW** - Load metadata if present, don't worry about completeness
3. **STRICT** - Require complete metadata (title, description, version) for production safety

You can also set the environment variable `TEXTPROMPTS_METADATA_MODE` to one of
`strict`, `allow`, or `ignore` before importing the library to configure the
default mode.

```typescript
import { setMetadata, MetadataMode } from "@textprompts/textprompts-ts";

// Set globally
setMetadata(MetadataMode.IGNORE);   // Default: simple file loading
setMetadata(MetadataMode.ALLOW);    // Flexible: load any metadata
setMetadata(MetadataMode.STRICT);   // Production: require complete metadata

// Or override per prompt
const prompt = await loadPrompt("file.txt", { meta: "strict" });
```

## API Reference

### `loadPrompt(path, options?)`

Load a single prompt file.

```typescript
async function loadPrompt(
  path: string,
  options?: {
    meta?: MetadataMode | string | null;
  }
): Promise<Prompt>
```

- `path`: Path to the prompt file
- `meta`: Metadata handling mode - `MetadataMode.STRICT`, `MetadataMode.ALLOW`, `MetadataMode.IGNORE`, or string equivalents. `null` uses global config.

Returns a `Prompt` object with:
- `prompt.meta`: Metadata from TOML front-matter (always present)
- `prompt.prompt`: The prompt content as a `PromptString`
- `prompt.path`: Path to the original file

### `loadPrompts(paths, options?)`

Load multiple prompts from files or directories.

```typescript
async function loadPrompts(
  paths: string | string[],
  options?: {
    recursive?: boolean;
    glob?: string;
    meta?: MetadataMode | string | null;
    maxFiles?: number | null;
  }
): Promise<Prompt[]>
```

- `paths`: File or directory path(s) to load
- `recursive`: Search directories recursively (default: `false`)
- `glob`: File pattern to match (default: `"*.txt"`)
- `meta`: Metadata handling mode
- `maxFiles`: Maximum files to process (default: `1000`)

### `setMetadata(mode)` / `getMetadata()`

Set or get the global metadata handling mode.

```typescript
function setMetadata(mode: MetadataMode | string): void
function getMetadata(): MetadataMode
```

- `mode`: `MetadataMode.STRICT`, `MetadataMode.ALLOW`, `MetadataMode.IGNORE`, or string equivalents

### `savePrompt(path, content)`

Save a prompt to a file.

```typescript
async function savePrompt(
  path: string,
  content: string | Prompt
): Promise<void>
```

- `path`: Path to save the prompt file
- `content`: Either a string (creates template with required fields) or a `Prompt` object

### `PromptString`

A string wrapper that validates `format()` calls:

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

interface FormatOptions {
  args?: unknown[];
  kwargs?: Record<string, unknown>;
  skipValidation?: boolean;
}
```

**Examples:**
```typescript
import { PromptString } from "@textprompts/textprompts-ts";

const template = new PromptString("Hello {name}, you are {role}");

// Strict formatting (default) - all placeholders required
const result = template.format({ name: "Alice", role: "admin" });  // ✅ Works
// template.format({ name: "Alice" });  // ❌ Throws Error

// Partial formatting - replace only available placeholders
const partial = template.format(
  { name: "Alice" },
  { skipValidation: true }
);  // ✅ "Hello Alice, you are {role}"

// Access placeholder information
console.log([...template.placeholders]);  // ['name', 'role']
```

### `Prompt`

The main prompt object:

```typescript
class Prompt {
  readonly path: string;
  readonly meta: PromptMeta | null;
  readonly prompt: PromptString;

  static async fromPath(path: string, options?: { meta?: MetadataMode | string | null }): Promise<Prompt>;

  toString(): string;
  valueOf(): string;
  strip(): string;
  format(options?: FormatOptions): string;
  format(args: unknown[], kwargs?: Record<string, unknown>, options?: FormatCallOptions): string;
  get length(): number;
  slice(start?: number, end?: number): string;
}

interface PromptMeta {
  title?: string | null;
  version?: string | null;
  author?: string | null;
  created?: string | null;
  description?: string | null;
}
```

## Error Handling

TextPrompts provides specific exception types:

```typescript
import {
  TextPromptsError,       // Base exception
  FileMissingError,       // File not found
  MissingMetadataError,   // No TOML front-matter when required
  InvalidMetadataError,   // Invalid TOML syntax
  MalformedHeaderError,   // Malformed front-matter structure
} from "@textprompts/textprompts-ts";
```

## Best Practices

1. **Organize by purpose**: Group related prompts in folders
   ```
   prompts/
   ├── customer-support/
   ├── content-generation/
   └── code-review/
   ```

2. **Use semantic versioning**: Version your prompts like code
   ```
   version = "1.2.0"  # major.minor.patch
   ```

3. **Document your variables**: List expected variables in descriptions
   ```
   description = "Requires: customer_name, issue_type, agent_name"
   ```

4. **Test your prompts**: Write unit tests for critical prompts
   ```typescript
   import { test, expect } from "bun:test";
   import { loadPrompt } from "@textprompts/textprompts-ts";

   test("greeting prompt formats correctly", async () => {
     const prompt = await loadPrompt("greeting.txt");
     const result = prompt.prompt.format({
       customer_name: "Test",
       company_name: "Test Corp",
       issue_type: "test",
       agent_name: "Bot"
     });
     expect(result).toContain("Test");
   });
   ```

5. **Use environment-specific prompts**: Different prompts for dev/prod
   ```typescript
   const env = process.env.NODE_ENV || "development";
   const prompt = await loadPrompt(`prompts/${env}/system.txt`);
   ```

## Why Not Just Use Template Strings?

You could, but then you lose:
- **Metadata tracking** (versions, authors, descriptions)
- **Safe formatting** (catch missing variables)
- **Organized storage** (searchable, documentable)
- **Version control benefits** (proper diffs, blame, history)
- **Tooling support** (CLI, validation, testing)

## Examples

See the [examples/](./examples/) directory for complete, runnable examples:

- **[basic-usage.ts](./examples/basic-usage.ts)** - Core functionality demo
- **[simple-format-demo.ts](./examples/simple-format-demo.ts)** - PromptString features
- **[openai-example.ts](./examples/openai-example.ts)** - OpenAI integration

Run them with:
```bash
bun examples/basic-usage.ts
```

## Documentation

Full documentation is available in the [docs/](./docs/) directory:

- [Getting Started](./docs/index.md)
- [API Reference](./docs/api.md)
- [Usage Guide](./docs/guide.md)
- [File Format](./docs/file-format.md)
- [Examples](./docs/examples.md)

## License

MIT License - see [LICENSE](../../LICENSE) for details.

---

**textprompts-ts** - Because your prompts deserve better than being buried in code strings. 🚀
