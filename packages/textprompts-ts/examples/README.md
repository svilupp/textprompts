# TextPrompts TypeScript Examples

This directory contains practical examples showing how to use textprompts in real applications.

## Running the Examples

All examples are self-contained and can be run directly with Bun:

```bash
# Basic usage demonstration
bun examples/basic-usage.ts

# PromptString formatting demo
bun examples/simple-format-demo.ts

# OpenAI integration example
bun examples/openai-example.ts

# AI SDK interactive chat example
bun examples/aisdk-example.ts
```

## Example Files

### `basic-usage.ts`
Comprehensive demonstration of core TextPrompts functionality:
- Loading single prompts with metadata
- Loading multiple prompts from directories
- Using PromptString for safe formatting
- Loading prompts without metadata
- Error handling examples

**Run it:**
```bash
bun examples/basic-usage.ts
```

### `simple-format-demo.ts`
Focused demonstration of the PromptString feature:
- Shows the problem with regular template strings
- Demonstrates how PromptString prevents silent failures
- Shows placeholder extraction and validation
- Demonstrates partial formatting

**Run it:**
```bash
bun examples/simple-format-demo.ts
```

### `openai-example.ts`
Integration example with OpenAI:
- System and user prompt templates
- Safe formatting with validation
- Real OpenAI API integration
- Error prevention patterns

**Prerequisites:**
- OpenAI package (already in devDependencies)
- `OPENAI_API_KEY` in `.env` file

**Run it:**
```bash
bun examples/openai-example.ts
```

### `aisdk-example.ts`
Interactive chat example with Vercel AI SDK:
- Streaming chat responses
- System prompt from file
- Version-controlled conversation setup
- Real-time interaction

**Prerequisites:**
- AI SDK packages (already in devDependencies)
- `OPENAI_API_KEY` in `.env` file

**Run it:**
```bash
bun examples/aisdk-example.ts
```

## Key Concepts Demonstrated

### 1. Prompt File Format
```
---
title = "Example Prompt"
version = "1.0.0"
author = "Your Name"
description = "What this prompt does"
---
Your prompt content with {variables} goes here.
```

### 2. Safe String Formatting
```typescript
import { PromptString } from "textprompts";

// This validates all variables are provided
const template = new PromptString("Hello {name}, order {id} is {status}");
const result = template.format({ name: "Alice", id: "123", status: "shipped" });
```

### 3. Directory Loading
```typescript
import { loadPrompts } from "textprompts";

// Load all prompts from a directory tree
const prompts = await loadPrompts("prompts/", { recursive: true });
const promptMap = new Map(prompts.map(p => [p.meta?.title ?? 'Untitled', p]));
```

### 4. Error Prevention
```typescript
// PromptString raises clear errors for missing variables
const safe = new PromptString("Hello {name}");
safe.format({}); // Throws: Missing format variables: ["name"]

// Partial formatting when needed
const partial = safe.format({}, { skipValidation: true });
// Returns: "Hello {name}" - placeholder preserved
```

## Integration Patterns

### Environment-Based Loading
```typescript
const env = process.env.NODE_ENV || "development";
const prompt = await loadPrompt(`prompts/${env}/system.txt`);
```

### Caching for Performance
```typescript
const promptCache = new Map<string, Prompt>();

async function getPrompt(name: string) {
  if (!promptCache.has(name)) {
    promptCache.set(name, await loadPrompt(`prompts/${name}.txt`));
  }
  return promptCache.get(name)!;
}
```

### Validation Pipeline
```typescript
import { loadPrompts } from "textprompts";

// Validate all prompts can be loaded
const prompts = await loadPrompts("prompts/", { recursive: true });
console.log(`Successfully validated ${prompts.length} prompts`);
```

## Best Practices Shown

1. **Organize prompts by domain** - Use subdirectories for different purposes
2. **Use semantic versioning** - Track prompt changes over time
3. **Include descriptive metadata** - Document purpose and usage
4. **Validate variables** - Use PromptString to catch errors early
5. **Handle errors gracefully** - Provide fallbacks and clear messages

## TypeScript Tips

All examples are fully typed. Key types to know:

```typescript
import type {
  Prompt,           // The main prompt object
  PromptMeta,       // Metadata interface
  PromptString,     // Safe formatting string
  LoadPromptOptions,
  LoadPromptsOptions,
} from "textprompts";
```

## Next Steps

After running these examples:

1. Read the [package README](../README.md) for complete API reference
2. Check out the [documentation](../docs/) for advanced features
3. Look at the [integration guide](../docs/guide.md) for your AI framework

## Contributing Examples

To add a new example:

1. Create a self-contained TypeScript file
2. Include clear comments and JSDoc documentation
3. Demonstrate a specific use case or integration
4. Make it executable with `#!/usr/bin/env bun`
5. Update this README with a description
6. Test that it runs without external dependencies (use mocks if needed)
