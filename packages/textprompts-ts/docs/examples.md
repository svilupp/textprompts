# Examples

Real-world code examples for common use cases.

## Table of Contents

- [Basic Usage](#basic-usage)
- [OpenAI Integration](#openai-integration)
- [Vercel AI SDK Integration](#vercel-ai-sdk-integration)
- [Anthropic Claude Integration](#anthropic-claude-integration)
- [Caching & Performance](#caching--performance)
- [Error Handling](#error-handling)
- [Environment-Specific Prompts](#environment-specific-prompts)
- [A/B Testing](#ab-testing)
- [Function Calling / Tools](#function-calling--tools)
- [Prompt Composition](#prompt-composition)

## Basic Usage

### Loading a Single Prompt

```typescript
import { loadPrompt } from "@textprompts/textprompts-ts";

const prompt = await loadPrompt("prompts/greeting.txt");

console.log(`Title: ${prompt.meta.title}`);
console.log(`Version: ${prompt.meta.version}`);

const message = prompt.format({
  customer_name: "Alice",
  company_name: "ACME Corp",
  issue_type: "billing",
  agent_name: "Sarah"
});

console.log(message);
```

### Loading Multiple Prompts

```typescript
import { loadPrompts } from "@textprompts/textprompts-ts";

// Load all prompts from a directory
const prompts = await loadPrompts("prompts/", { recursive: true });

// Create a lookup by title
const promptMap = new Map(
  prompts.map(p => [p.meta.title!, p])
);

// Use by title
const greeting = promptMap.get("Customer Greeting");
if (greeting) {
  console.log(greeting.format({ customer_name: "Bob" }));
}
```

### Safe String Formatting

```typescript
import { PromptString } from "@textprompts/textprompts-ts";

const template = new PromptString("Order {order_id} is {status}");

// ✅ This works
const result = template.format({
  order_id: "12345",
  status: "shipped"
});

// ❌ This throws an error
try {
  template.format({ order_id: "12345" }); // Missing 'status'
} catch (error) {
  console.error(error.message); // "Missing format variables: ["status"]"
}

// ✅ Partial formatting
const partial = template.format(
  { order_id: "12345" },
  { skipValidation: true }
);
console.log(partial); // "Order 12345 is {status}"
```

## OpenAI Integration

### Basic Chat

```typescript
import OpenAI from "openai";
import { loadPrompt } from "@textprompts/textprompts-ts";

const systemPrompt = await loadPrompt("prompts/system.txt");

const client = new OpenAI();
const response = await client.chat.completions.create({
  model: "gpt-5-mini",
  messages: [
    {
      role: "system",
      content: systemPrompt.format({
        company_name: "ACME Corp",
        tone: "professional"
      })
    },
    { role: "user", content: "Hello!" }
  ]
});

console.log(response.choices[0].message.content);
```

### Streaming Responses

```typescript
import OpenAI from "openai";
import { loadPrompt } from "@textprompts/textprompts-ts";

const openai = new OpenAI();
const systemPrompt = await loadPrompt("prompts/system.txt");

async function streamChat(userMessage: string) {
  const stream = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [
      {
        role: "system",
        content: systemPrompt.format({ company: "ACME" })
      },
      { role: "user", content: userMessage }
    ],
    stream: true
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || "";
    process.stdout.write(content);
  }
}
```

### Conversation History

```typescript
import OpenAI from "openai";
import { loadPrompt } from "@textprompts/textprompts-ts";

const openai = new OpenAI();
const systemPrompt = await loadPrompt("prompts/system.txt");

class ChatSession {
  private messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];

  constructor(systemContext: Record<string, string>) {
    this.messages.push({
      role: "system",
      content: systemPrompt.format(systemContext)
    });
  }

  async sendMessage(content: string): Promise<string> {
    this.messages.push({ role: "user", content });

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: this.messages
    });

    const assistantMessage = response.choices[0].message.content!;
    this.messages.push({ role: "assistant", content: assistantMessage });

    return assistantMessage;
  }
}

// Usage
const session = new ChatSession({ company: "ACME Corp" });
await session.sendMessage("Hello!");
await session.sendMessage("What are your hours?");
```

## Vercel AI SDK Integration

### Streaming Text

```typescript
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { loadPrompt } from "@textprompts/textprompts-ts";

const systemPrompt = await loadPrompt("prompts/system.txt");

const result = streamText({
  model: openai('gpt-4o-mini'),
  messages: [
    {
      role: 'system',
      content: systemPrompt.format({
        company_name: "ACME Corp",
        tone: "friendly"
      })
    },
    { role: 'user', content: 'Hello!' }
  ]
});

// Stream to stdout
for await (const delta of result.textStream) {
  process.stdout.write(delta);
}
```

### Interactive Chat

```typescript
import { openai } from '@ai-sdk/openai';
import { CoreMessage, streamText } from 'ai';
import * as readline from 'node:readline/promises';
import { loadPrompt } from "@textprompts/textprompts-ts";

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const systemPrompt = await loadPrompt("prompts/system.txt");

const messages: CoreMessage[] = [
  {
    role: 'system',
    content: systemPrompt.format({
      company_name: 'Tech Solutions Inc',
      tone: 'friendly and professional',
    })
  },
];

while (true) {
  const userInput = await terminal.question('You: ');
  messages.push({ role: 'user', content: userInput });

  const result = streamText({
    model: openai('gpt-4o-mini'),
    messages,
  });

  let fullResponse = '';
  process.stdout.write('\nAssistant: ');
  for await (const delta of result.textStream) {
    fullResponse += delta;
    process.stdout.write(delta);
  }
  process.stdout.write('\n\n');

  messages.push({ role: 'assistant', content: fullResponse });
}
```

### Generate Text (Non-Streaming)

```typescript
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { loadPrompt } from "@textprompts/textprompts-ts";

const systemPrompt = await loadPrompt("prompts/system.txt");

const { text } = await generateText({
  model: openai('gpt-4o-mini'),
  messages: [
    {
      role: 'system',
      content: systemPrompt.format({ company: "ACME" })
    },
    { role: 'user', content: 'Hello!' }
  ]
});

console.log(text);
```

## Anthropic Claude Integration

### Basic Message

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { loadPrompt } from "@textprompts/textprompts-ts";

const anthropic = new Anthropic();
const systemPrompt = await loadPrompt("prompts/system.txt");

async function chat(userMessage: string) {
  const message = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1024,
    system: systemPrompt.format({
      company_name: "ACME Corp",
      tone: "friendly"
    }),
    messages: [
      { role: "user", content: userMessage }
    ]
  });

  return message.content[0].text;
}
```

### Streaming

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { loadPrompt } from "@textprompts/textprompts-ts";

const anthropic = new Anthropic();
const systemPrompt = await loadPrompt("prompts/system.txt");

async function streamChat(userMessage: string) {
  const stream = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1024,
    system: systemPrompt.format({ company: "ACME" }),
    messages: [{ role: "user", content: userMessage }],
    stream: true
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      process.stdout.write(event.delta.text);
    }
  }
}
```

## Caching & Performance

### Simple Prompt Cache

```typescript
import { Prompt, loadPrompt } from "@textprompts/textprompts-ts";

class PromptCache {
  private cache = new Map<string, Prompt>();

  async get(path: string): Promise<Prompt> {
    if (!this.cache.has(path)) {
      this.cache.set(path, await loadPrompt(path));
    }
    return this.cache.get(path)!;
  }

  invalidate(path: string): void {
    this.cache.delete(path);
  }

  clear(): void {
    this.cache.clear();
  }
}

// Usage
const cache = new PromptCache();
const prompt = await cache.get("prompts/system.txt");
```

### Preloading All Prompts

```typescript
import { loadPrompts, Prompt } from "@textprompts/textprompts-ts";

class PromptManager {
  private prompts = new Map<string, Prompt>();

  async initialize(): Promise<void> {
    const loaded = await loadPrompts("prompts/", {
      recursive: true,
      meta: "allow"
    });

    for (const prompt of loaded) {
      if (prompt.meta.title) {
        this.prompts.set(prompt.meta.title, prompt);
      }
    }

    console.log(`Loaded ${this.prompts.size} prompts`);
  }

  get(title: string): Prompt | undefined {
    return this.prompts.get(title);
  }

  has(title: string): boolean {
    return this.prompts.has(title);
  }

  list(): string[] {
    return Array.from(this.prompts.keys());
  }
}

// At app startup
const manager = new PromptManager();
await manager.initialize();

// Later
const greeting = manager.get("Customer Greeting");
```

### LRU Cache

```typescript
class LRUPromptCache {
  private cache = new Map<string, Prompt>();
  private maxSize: number;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  async get(path: string): Promise<Prompt> {
    if (this.cache.has(path)) {
      // Move to end (most recently used)
      const prompt = this.cache.get(path)!;
      this.cache.delete(path);
      this.cache.set(path, prompt);
      return prompt;
    }

    const prompt = await loadPrompt(path);

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }

    this.cache.set(path, prompt);
    return prompt;
  }
}
```

## Error Handling

### Graceful Fallbacks

```typescript
import { loadPrompt, FileMissingError, Prompt, PromptString } from "@textprompts/textprompts-ts";

async function loadPromptWithFallback(
  path: string,
  fallbackText: string
): Promise<Prompt> {
  try {
    return await loadPrompt(path);
  } catch (error) {
    if (error instanceof FileMissingError) {
      console.warn(`Prompt not found: ${path}, using fallback`);
      return new Prompt({
        path: "fallback",
        meta: { title: "Fallback" },
        prompt: new PromptString(fallbackText)
      });
    }
    throw error;
  }
}

// Usage
const prompt = await loadPromptWithFallback(
  "prompts/custom.txt",
  "Default greeting: Hello {name}!"
);
```

### Comprehensive Error Handling

```typescript
import {
  loadPrompt,
  TextPromptsError,
  FileMissingError,
  MissingMetadataError,
  InvalidMetadataError,
  MalformedHeaderError
} from "@textprompts/textprompts-ts";

async function safeLoadPrompt(path: string) {
  try {
    return await loadPrompt(path, { meta: "strict" });
  } catch (error) {
    if (error instanceof FileMissingError) {
      console.error(`File not found: ${path}`);
      // Maybe check alternative locations
    } else if (error instanceof MissingMetadataError) {
      console.error(`Missing metadata in: ${path}`);
      // Try loading with ALLOW mode instead
      return await loadPrompt(path, { meta: "allow" });
    } else if (error instanceof InvalidMetadataError) {
      console.error(`Invalid TOML in: ${path}`);
      // Log for fixing
    } else if (error instanceof MalformedHeaderError) {
      console.error(`Malformed front-matter in: ${path}`);
    } else if (error instanceof TextPromptsError) {
      console.error(`TextPrompts error: ${error.message}`);
    } else {
      console.error(`Unknown error:`, error);
    }
    throw error;
  }
}
```

### Validation with Error Collection

```typescript
import { loadPrompts } from "@textprompts/textprompts-ts";

async function validateAllPrompts(dir: string) {
  const errors: Array<{ path: string; error: Error }> = [];

  try {
    const prompts = await loadPrompts(dir, {
      recursive: true,
      meta: "strict"
    });

    console.log(`✅ All ${prompts.length} prompts are valid`);
    return { success: true, prompts, errors: [] };
  } catch (error) {
    if (error instanceof Error) {
      errors.push({ path: dir, error });
    }
    return { success: false, prompts: [], errors };
  }
}
```

## Environment-Specific Prompts

### Simple Environment Switching

```typescript
import { loadPrompt } from "@textprompts/textprompts-ts";

const env = process.env.NODE_ENV || "development";

const systemPrompt = await loadPrompt(`prompts/${env}/system.txt`);
const errorPrompt = await loadPrompt(`prompts/${env}/error.txt`);
```

### Environment Config Class

```typescript
import { loadPrompt, Prompt } from "@textprompts/textprompts-ts";

class EnvironmentPrompts {
  private env: string;
  private cache = new Map<string, Prompt>();

  constructor(env?: string) {
    this.env = env || process.env.NODE_ENV || "development";
  }

  async load(name: string): Promise<Prompt> {
    const key = `${this.env}:${name}`;

    if (!this.cache.has(key)) {
      const path = `prompts/${this.env}/${name}.txt`;
      this.cache.set(key, await loadPrompt(path));
    }

    return this.cache.get(key)!;
  }
}

// Usage
const prompts = new EnvironmentPrompts("production");
const system = await prompts.load("system");
```

## A/B Testing

### Simple Variant Selection

```typescript
import { loadPrompt } from "@textprompts/textprompts-ts";

function selectVariant(userId: string): "a" | "b" {
  // Simple hash-based selection
  const hash = userId.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return hash % 2 === 0 ? "a" : "b";
}

async function getPromptForUser(userId: string) {
  const variant = selectVariant(userId);
  return await loadPrompt(`prompts/greeting-${variant}.txt`);
}

// Usage
const prompt = await getPromptForUser("user-123");
```

### A/B Test Framework

```typescript
import { loadPrompt, Prompt } from "@textprompts/textprompts-ts";

interface Experiment {
  name: string;
  variants: Record<string, string>; // variant name -> prompt path
  trafficSplit: Record<string, number>; // variant name -> percentage
}

class ABTestManager {
  private experiments: Map<string, Experiment> = new Map();

  registerExperiment(experiment: Experiment): void {
    this.experiments.set(experiment.name, experiment);
  }

  getVariant(experimentName: string, userId: string): string | null {
    const experiment = this.experiments.get(experimentName);
    if (!experiment) return null;

    // Hash user ID to get consistent variant
    const hash = this.hashUserId(userId);
    let cumulative = 0;

    for (const [variant, percentage] of Object.entries(experiment.trafficSplit)) {
      cumulative += percentage;
      if (hash < cumulative) {
        return variant;
      }
    }

    return Object.keys(experiment.variants)[0]; // Default to first
  }

  async getPrompt(experimentName: string, userId: string): Promise<Prompt | null> {
    const experiment = this.experiments.get(experimentName);
    if (!experiment) return null;

    const variant = this.getVariant(experimentName, userId);
    if (!variant) return null;

    const path = experiment.variants[variant];
    return await loadPrompt(path);
  }

  private hashUserId(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = ((hash << 5) - hash) + userId.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash % 100); // 0-99
  }
}

// Usage
const abTest = new ABTestManager();

abTest.registerExperiment({
  name: "greeting-test",
  variants: {
    control: "prompts/greeting-control.txt",
    friendly: "prompts/greeting-friendly.txt",
    formal: "prompts/greeting-formal.txt"
  },
  trafficSplit: {
    control: 33.3,
    friendly: 33.3,
    formal: 33.4
  }
});

const prompt = await abTest.getPrompt("greeting-test", "user-456");
```

## Function Calling / Tools

### Tool Schema in Prompts

Create a file `prompts/tools/search.txt`:

```
---
title = "Product Search Tool"
version = "1.0.0"
description = "Search products in catalog"
---
{
  "type": "function",
  "function": {
    "name": "search_products",
    "description": "Search for products",
    "parameters": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Search query"
        },
        "category": {
          "type": "string",
          "enum": ["electronics", "clothing", "books"]
        }
      },
      "required": ["query"]
    }
  }
}
```

Load and use:

```typescript
import OpenAI from "openai";
import { loadPrompt } from "@textprompts/textprompts-ts";

const openai = new OpenAI();
const toolPrompt = await loadPrompt("prompts/tools/search.txt");
const toolSchema = JSON.parse(toolPrompt.toString());

const response = await openai.chat.completions.create({
  model: "gpt-4",
  messages: [{ role: "user", content: "Find electronics" }],
  tools: [toolSchema]
});
```

## Prompt Composition

### Combining Multiple Prompts

```typescript
import { loadPrompt, PromptString } from "@textprompts/textprompts-ts";

const baseSystem = await loadPrompt("prompts/base-system.txt");
const expertMode = await loadPrompt("prompts/expert-mode.txt");
const safetyGuidelines = await loadPrompt("prompts/safety.txt");

// Compose them
const fullSystem = new PromptString(
  [
    baseSystem.toString(),
    "",
    expertMode.toString(),
    "",
    safetyGuidelines.toString()
  ].join("\n")
);

// Format the composed prompt
const formatted = fullSystem.format({
  company: "ACME",
  expertise_level: "advanced"
});
```

### Dynamic Composition

```typescript
import { loadPrompt, PromptString } from "@textprompts/textprompts-ts";

async function buildSystemPrompt(options: {
  base: string;
  addons?: string[];
  context: Record<string, string>;
}): Promise<string> {
  const parts: string[] = [];

  // Load base
  const base = await loadPrompt(`prompts/${options.base}.txt`);
  parts.push(base.toString());

  // Load addons
  if (options.addons) {
    for (const addon of options.addons) {
      const part = await loadPrompt(`prompts/addons/${addon}.txt`);
      parts.push(part.toString());
    }
  }

  // Combine and format
  const combined = new PromptString(parts.join("\n\n"));
  return combined.format(options.context, {}, { skipValidation: true });
}

// Usage
const systemPrompt = await buildSystemPrompt({
  base: "system-base",
  addons: ["expert-mode", "code-assistance"],
  context: { company: "ACME", tone: "professional" }
});
```

## See Also

- [API Reference](./api.md) - Complete API documentation
- [Usage Guide](./guide.md) - Best practices and patterns
- [File Format](./file-format.md) - Prompt file format specification
- [Runnable Examples](../examples/) - Try these examples yourself
