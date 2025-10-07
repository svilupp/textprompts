# Getting Started with textprompts-ts

Welcome to textprompts-ts! This guide will help you get started with managing your AI prompts as text files.

## What is textprompts-ts?

textprompts-ts is a TypeScript/JavaScript library that helps you manage AI prompts as simple text files with optional metadata. It provides:

- **Safe string formatting** - catch missing variables before they cause problems
- **Version control** - treat prompts like code with git
- **No formatter headaches** - your prompts stay exactly as you wrote them
- **Flexible metadata** - add structure when you need it, skip it when you don't
- **Type safety** - full TypeScript support

## Installation

Choose your package manager:

```bash
# npm
npm install @textprompts/textprompts-ts

# Bun
bun add @textprompts/textprompts-ts

# pnpm
pnpm add @textprompts/textprompts-ts

# yarn
yarn add @textprompts/textprompts-ts
```

## Your First Prompt

### 1. Create a prompt file

Create a file called `greeting.txt`:

```
---
title = "Customer Greeting"
version = "1.0.0"
description = "Friendly greeting template"
---
Hello {customer_name}!

Welcome to {company_name}.
```

### 2. Load and use it

```typescript
import { loadPrompt } from "@textprompts/textprompts-ts";

// Load the prompt
const prompt = await loadPrompt("greeting.txt");

// Use it with safe variable replacement
const message = prompt.prompt.format({
  customer_name: "Alice",
  company_name: "ACME Corp"
});

console.log(message);
// Output:
// Hello Alice!
//
// Welcome to ACME Corp.
```

That's it! You've created your first prompt.

## Key Concepts

### Prompts are Text Files

Your prompts live in `.txt` files (or any text file) alongside your code. This means:

- ✅ Git tracks every change
- ✅ Code review applies to prompts too
- ✅ Formatters don't touch them
- ✅ Easy to read and edit

### Metadata is Optional

You can include TOML front-matter for metadata:

```
---
title = "My Prompt"
version = "1.0.0"
description = "What this does"
---
Prompt content here...
```

Or skip it entirely:

```
Just the prompt content with {variables}.
```

Both work! The library adapts to your needs.

### Safe Formatting

Never ship a prompt with missing variables:

```typescript
import { PromptString } from "@textprompts/textprompts-ts";

const template = new PromptString("Hello {name}!");

// ✅ This works
template.format({ name: "Alice" });

// ❌ This throws an error
template.format({});  // Error: Missing format variables: ["name"]
```

## Common Use Cases

### Loading Multiple Prompts

```typescript
import { loadPrompts } from "@textprompts/textprompts-ts";

// Load all prompts from a directory
const prompts = await loadPrompts("prompts/", {
  recursive: true,
  glob: "*.txt"
});

// Create a lookup by title
const promptMap = new Map(
  prompts.map(p => [p.meta.title!, p])
);

const greeting = promptMap.get("Customer Greeting");
```

### Environment-Specific Prompts

```typescript
const env = process.env.NODE_ENV || "development";
const prompt = await loadPrompt(`prompts/${env}/system.txt`);
```

### Partial Formatting

Sometimes you want to fill in some variables now and others later:

```typescript
const template = new PromptString("Hello {name}, your {item} costs ${price}");

// Fill in what you know
const partial = template.format(
  { name: "Alice" },
  { skipValidation: true }
);
// Result: "Hello Alice, your {item} costs ${price}"

// Fill in the rest later
const final = new PromptString(partial).format({
  item: "widget",
  price: "29.99"
});
// Result: "Hello Alice, your widget costs $29.99"
```

### OpenAI Integration

```typescript
import OpenAI from "openai";
import { loadPrompt } from "@textprompts/textprompts-ts";

const systemPrompt = await loadPrompt("prompts/system.txt");
const openai = new OpenAI();

const response = await openai.chat.completions.create({
  model: "gpt-4",
  messages: [
    {
      role: "system",
      content: systemPrompt.prompt.format({
        company_name: "ACME Corp"
      })
    },
    {
      role: "user",
      content: "Hello!"
    }
  ]
});
```

## Metadata Modes

textprompts-ts has three modes for handling metadata:

### IGNORE (Default)

Simple mode - just loads text, uses filename as title:

```typescript
import { setMetadata, MetadataMode } from "@textprompts/textprompts-ts";

setMetadata(MetadataMode.IGNORE);
const prompt = await loadPrompt("simple.txt");
console.log(prompt.meta.title);  // "simple"
```

### ALLOW

Flexible mode - loads metadata if present, doesn't require it:

```typescript
setMetadata(MetadataMode.ALLOW);
const prompt = await loadPrompt("prompt.txt");
// Works with or without metadata
```

### STRICT

Production mode - requires complete metadata (title, description, version):

```typescript
setMetadata(MetadataMode.STRICT);
const prompt = await loadPrompt("prompt.txt");
// Throws error if metadata is missing or incomplete
```

You can also override the mode per-prompt:

```typescript
const prompt = await loadPrompt("prompt.txt", { meta: "strict" });
```

## Project Structure

A typical project might look like:

```
my-app/
├── src/
│   └── index.ts
├── prompts/
│   ├── system/
│   │   ├── base.txt
│   │   └── expert.txt
│   ├── user/
│   │   ├── query.txt
│   │   └── followup.txt
│   └── tools/
│       └── search.txt
└── package.json
```

## Next Steps

Now that you understand the basics:

1. **[Read the API Reference](./api.md)** - Learn about all available functions and types
2. **[Check out the Guide](./guide.md)** - Best practices and advanced patterns
3. **[View Examples](./examples.md)** - Real-world usage examples
4. **[Understand the File Format](./file-format.md)** - Deep dive into prompt files

## Quick Tips

### Use TypeScript for Type Safety

```typescript
import type { Prompt, PromptMeta } from "@textprompts/textprompts-ts";

const prompt: Prompt = await loadPrompt("greeting.txt");
const meta: PromptMeta = prompt.meta;
```

### Cache Prompts for Performance

```typescript
const cache = new Map<string, Prompt>();

async function getPrompt(name: string): Promise<Prompt> {
  if (!cache.has(name)) {
    cache.set(name, await loadPrompt(`prompts/${name}.txt`));
  }
  return cache.get(name)!;
}
```

### Validate at Build Time

```typescript
import { loadPrompts } from "@textprompts/textprompts-ts";

// In your build script or tests
const prompts = await loadPrompts("prompts/", {
  recursive: true,
  meta: "strict"  // Ensure all prompts have proper metadata
});

console.log(`✅ Validated ${prompts.length} prompts`);
```

## Getting Help

- **[Examples](../examples/)** - Runnable code examples
- **[API Reference](./api.md)** - Complete API documentation
- **[GitHub Issues](https://github.com/svilupp/textprompts/issues)** - Report bugs or request features

Happy prompting! 🚀
