# Usage Guide

Best practices and advanced patterns for textprompts.

## Table of Contents

- [Project Organization](#project-organization)
- [Metadata Strategies](#metadata-strategies)
- [String Formatting Patterns](#string-formatting-patterns)
- [Performance Optimization](#performance-optimization)
- [Error Handling](#error-handling)
- [Testing Prompts](#testing-prompts)
- [Version Control](#version-control)
- [AI Framework Integration](#ai-framework-integration)

## Project Organization

### Directory Structure

Organize prompts by purpose, not by format:

```
project/
├── src/
│   └── index.ts
├── prompts/
│   ├── system/              # System prompts
│   │   ├── base.txt
│   │   ├── expert.txt
│   │   └── creative.txt
│   ├── customer/            # Customer-facing
│   │   ├── greeting.txt
│   │   ├── support.txt
│   │   └── farewell.txt
│   ├── internal/            # Internal tools
│   │   ├── code-review.txt
│   │   └── summarization.txt
│   └── tools/               # Function schemas
│       ├── search.txt
│       └── calculator.txt
└── package.json
```

### Naming Conventions

Use descriptive, hyphenated names:

✅ **Good:**
- `customer-greeting-v2.txt`
- `code-review-python.txt`
- `system-expert-mode.txt`

❌ **Bad:**
- `prompt1.txt`
- `test.txt`
- `GREETING_FINAL_FINAL_v3.txt`

### Environment-Specific Prompts

Organize by environment when prompts differ:

```
prompts/
├── development/
│   ├── system.txt  # Verbose, helpful
│   └── error.txt   # Detailed errors
├── production/
│   ├── system.txt  # Concise, efficient
│   └── error.txt   # User-friendly
└── staging/
    ├── system.txt
    └── error.txt
```

Load based on environment:

```typescript
import { loadPrompt } from "textprompts";

const env = process.env.NODE_ENV || "development";
const systemPrompt = await loadPrompt(`prompts/${env}/system.txt`);
```

## Metadata Strategies

### When to Use Each Mode

#### ALLOW Mode (Default)

Best for:
- Quick prototyping
- Mixed projects (some prompts have metadata, some don't)
- Gradual migration to metadata
- Removing friction for newcomers

```typescript
import { setMetadata, MetadataMode } from "textprompts";

setMetadata(MetadataMode.ALLOW);
```

#### IGNORE Mode

Best for:
- Treating prompts as plain text without metadata parsing
- Avoiding TOML parsing for legacy files
- Quickly bypassing metadata validation during migrations

```typescript
setMetadata(MetadataMode.IGNORE);
```

#### STRICT Mode

Best for:
- Production applications
- Team environments
- Regulated industries
- When prompt versioning is critical

```typescript
setMetadata(MetadataMode.STRICT);
```

### Semantic Versioning

Use semantic versioning for prompts:

```
---
version = "1.2.3"
---
```

- **Major** (1.x.x): Breaking changes to variables or output format
- **Minor** (x.2.x): New features, backward compatible
- **Patch** (x.x.3): Bug fixes, clarifications

### Metadata Best Practices

Include enough information for future you:

```
---
title = "Customer Support Greeting"
version = "2.1.0"
author = "Support Team"
description = "Greeting for premium tier customers. Requires: customer_name, tier, agent_name"
created = "2024-01-15"
---
```

Document:
- Required variables in description
- Purpose and use case
- Any special conditions

## String Formatting Patterns

### Basic Formatting

```typescript
import { PromptString } from "textprompts";

const template = new PromptString("Hello {name}!");
const result = template.format({ name: "Alice" });
```

### Positional Arguments

```typescript
const template = new PromptString("User {0} ordered {1}");
const result = template.format(["Alice", "Widget"]);
```

### Mixed Arguments

```typescript
const template = new PromptString("{0} ordered {item} on {1}");
const result = template.format(
  ["Alice", "2024-01-15"],
  { item: "Widget" }
);
```

### Partial Formatting

Build templates in stages:

```typescript
// Stage 1: Fill in company info
const baseTemplate = new PromptString(
  "Welcome to {company}! {user_greeting}"
);

const withCompany = baseTemplate.format(
  { company: "ACME Corp" },
  { skipValidation: true }
);

// Stage 2: Fill in user info later
const final = new PromptString(withCompany).format({
  user_greeting: "Hello Alice!"
});
```

### Escaping Braces

To use literal braces, double them:

```typescript
const template = new PromptString("Set {{variable}} to {value}");
const result = template.format({ value: "42" });
// Result: "Set {variable} to 42"
```

## Performance Optimization

### Caching Prompts

Cache loaded prompts to avoid repeated file I/O:

```typescript
import { Prompt, loadPrompt } from "textprompts";

class PromptCache {
  private cache = new Map<string, Prompt>();

  async get(path: string): Promise<Prompt> {
    if (!this.cache.has(path)) {
      this.cache.set(path, await loadPrompt(path));
    }
    return this.cache.get(path)!;
  }

  clear(): void {
    this.cache.clear();
  }

  invalidate(path: string): void {
    this.cache.delete(path);
  }
}

// Usage
const cache = new PromptCache();
const prompt = await cache.get("prompts/greeting.txt");
```

### Preloading Prompts

Load prompts at startup for better runtime performance:

```typescript
import { loadPrompts } from "textprompts";

class PromptManager {
  private prompts = new Map<string, Prompt>();

  async initialize(): Promise<void> {
    const loaded = await loadPrompts("prompts/", { recursive: true });

    for (const prompt of loaded) {
      if (prompt.meta?.title) {
        this.prompts.set(prompt.meta.title, prompt);
      }
    }

    console.log(`Loaded ${this.prompts.size} prompts`);
  }

  get(title: string): Prompt | undefined {
    return this.prompts.get(title);
  }
}

// At app startup
const manager = new PromptManager();
await manager.initialize();
```

### Lazy Loading

For large prompt sets, load on demand:

```typescript
class LazyPromptLoader {
  private cache = new Map<string, Promise<Prompt>>();

  load(name: string): Promise<Prompt> {
    if (!this.cache.has(name)) {
      this.cache.set(name, loadPrompt(`prompts/${name}.txt`));
    }
    return this.cache.get(name)!;
  }
}
```

## Error Handling

### Graceful Degradation

Provide fallbacks for missing prompts:

```typescript
import { loadPrompt, FileMissingError } from "textprompts";

async function getPromptWithFallback(
  path: string,
  fallback: string
): Promise<Prompt> {
  try {
    return await loadPrompt(path);
  } catch (error) {
    if (error instanceof FileMissingError) {
      console.warn(`Prompt not found: ${path}, using fallback`);
      return new Prompt({
        path: "fallback",
        meta: { title: "Fallback" },
        prompt: new PromptString(fallback)
      });
    }
    throw error;
  }
}
```

### Validation Errors

Handle missing variables clearly:

```typescript
import { PromptString } from "textprompts";

function safeFormat(
  template: PromptString,
  vars: Record<string, unknown>
): string | null {
  try {
    return template.format(vars);
  } catch (error) {
    if (error instanceof Error && error.message.includes("Missing format variables")) {
      console.error("Template validation failed:", error.message);
      return null;
    }
    throw error;
  }
}
```

### Type-Safe Error Handling

```typescript
import {
  TextPromptsError,
  FileMissingError,
  InvalidMetadataError,
  MissingMetadataError,
} from "textprompts";

async function loadPromptSafe(path: string) {
  try {
    return await loadPrompt(path, { meta: "strict" });
  } catch (error) {
    if (error instanceof FileMissingError) {
      console.error("File not found:", path);
    } else if (error instanceof MissingMetadataError) {
      console.error("Missing required metadata:", path);
    } else if (error instanceof InvalidMetadataError) {
      console.error("Invalid TOML:", path);
    } else if (error instanceof TextPromptsError) {
      console.error("Prompt error:", error.message);
    } else {
      console.error("Unknown error:", error);
    }
    throw error;
  }
}
```

## Testing Prompts

### Unit Testing

Test prompt loading and formatting:

```typescript
import { test, expect } from "bun:test";
import { loadPrompt } from "textprompts";

test("greeting prompt loads correctly", async () => {
  const prompt = await loadPrompt("prompts/greeting.txt");

  expect(prompt.meta?.title).toBe("Customer Greeting");
  expect(prompt.meta?.version).toBe("1.0.0");
});

test("greeting prompt formats correctly", async () => {
  const prompt = await loadPrompt("prompts/greeting.txt");

  const result = prompt.format({
    customer_name: "Alice",
    company_name: "ACME",
    issue_type: "billing",
    agent_name: "Bob"
  });

  expect(result).toContain("Alice");
  expect(result).toContain("ACME");
  expect(result).toContain("billing");
});

test("greeting prompt requires all variables", async () => {
  const prompt = await loadPrompt("prompts/greeting.txt");

  expect(() => {
    prompt.format({ customer_name: "Alice" });
  }).toThrow(/Missing format variables/);
});
```

### Validation Tests

Validate all prompts at build time:

```typescript
import { loadPrompts } from "textprompts";

test("all prompts are valid", async () => {
  const prompts = await loadPrompts("prompts/", {
    recursive: true,
    meta: "strict"
  });

  expect(prompts.length).toBeGreaterThan(0);

  for (const prompt of prompts) {
    expect(prompt.meta?.title).toBeTruthy();
    expect(prompt.meta?.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(prompt.meta?.description).toBeTruthy();
  }
});
```

### Snapshot Testing

Test prompt output doesn't change unexpectedly:

```typescript
import { test, expect } from "bun:test";
import { loadPrompt } from "textprompts";

test("greeting prompt output matches snapshot", async () => {
  const prompt = await loadPrompt("prompts/greeting.txt");

  const result = prompt.format({
    customer_name: "Test User",
    company_name: "Test Corp",
    issue_type: "test issue",
    agent_name: "Test Agent"
  });

  expect(result).toMatchSnapshot();
});
```

## Version Control

### .gitignore

Don't ignore your prompts! They're part of your code:

```gitignore
# Don't add prompts/ to .gitignore
# DO commit them

# But you might ignore generated/cached prompts
generated-prompts/
.prompt-cache
```

### Git Hooks

Validate prompts before commit:

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Validate all prompts
bun run validate-prompts || {
  echo "Prompt validation failed!"
  exit 1
}
```

```typescript
// scripts/validate-prompts.ts
import { loadPrompts } from "textprompts";

const prompts = await loadPrompts("prompts/", {
  recursive: true,
  meta: "strict"
});

console.log(`✅ Validated ${prompts.length} prompts`);
process.exit(0);
```

### Branching Strategy

- `main` - Production prompts
- `develop` - Development prompts
- `experiment/*` - Experimental prompt variations

### Diffing Prompts

Git shows prompt changes clearly:

```bash
git diff prompts/system.txt
```

```diff
---
-version = "1.0.0"
+version = "1.1.0"
---
 You are a helpful assistant.
-Be concise.
+Be concise and friendly.
```

## AI Framework Integration

### OpenAI

```typescript
import OpenAI from "openai";
import { loadPrompt } from "textprompts";

const openai = new OpenAI();
const systemPrompt = await loadPrompt("prompts/system.txt");

async function chat(userMessage: string) {
  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      {
        role: "system",
        content: systemPrompt.format({ company: "ACME" })
      },
      { role: "user", content: userMessage }
    ]
  });

  return response.choices[0].message.content;
}
```

### Anthropic Claude

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { loadPrompt } from "textprompts";

const anthropic = new Anthropic();
const systemPrompt = await loadPrompt("prompts/system.txt");

async function chat(userMessage: string) {
  const response = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1024,
    system: systemPrompt.format({ company: "ACME" }),
    messages: [{ role: "user", content: userMessage }]
  });

  return response.content[0].text;
}
```

### Vercel AI SDK

```typescript
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { loadPrompt } from "textprompts";

const systemPrompt = await loadPrompt("prompts/system.txt");

const { text } = await generateText({
  model: openai("gpt-4"),
  system: systemPrompt.format({ company: "ACME" }),
  prompt: "Hello!"
});
```

### LangChain

```typescript
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { loadPrompt } from "textprompts";

const systemPrompt = await loadPrompt("prompts/system.txt");
const model = new ChatOpenAI();

const response = await model.invoke([
  new SystemMessage(systemPrompt.format({ company: "ACME" })),
  new HumanMessage("Hello!")
]);
```

## Advanced Patterns

### Prompt Composition

Build complex prompts from smaller pieces:

```typescript
const baseSystem = await loadPrompt("prompts/base-system.txt");
const expertMode = await loadPrompt("prompts/expert-addon.txt");

const combinedPrompt = new PromptString(
  baseSystem.toString() + "\n\n" + expertMode.toString()
);

const formatted = combinedPrompt.format({
  company: "ACME",
  expertise_level: "advanced"
});
```

### Dynamic Prompt Loading

Load prompts based on user tier or context:

```typescript
async function getSystemPrompt(userTier: string) {
  const promptMap: Record<string, string> = {
    free: "prompts/system-basic.txt",
    premium: "prompts/system-premium.txt",
    enterprise: "prompts/system-enterprise.txt"
  };

  const path = promptMap[userTier] || promptMap.free;
  return await loadPrompt(path);
}
```

### A/B Testing

Test different prompt variants:

```typescript
function selectPromptVariant(userId: string): string {
  const hash = hashCode(userId);
  return hash % 2 === 0 ? "prompts/variant-a.txt" : "prompts/variant-b.txt";
}

const variant = selectPromptVariant(user.id);
const prompt = await loadPrompt(variant);
```

## See Also

- [API Reference](./api.md) - Complete API documentation
- [Examples](./examples.md) - Real-world code examples
- [File Format](./file-format.md) - Prompt file format specification
