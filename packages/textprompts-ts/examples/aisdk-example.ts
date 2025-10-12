#!/usr/bin/env bun
/**
 * Example: AI SDK Integration with TextPrompts
 *
 * This demonstrates how to use textprompts-ts with Vercel AI SDK
 * for streaming chat interactions with version-controlled prompts.
 *
 * Prerequisites:
 * - AI SDK packages (installed as dev dependencies)
 * - OPENAI_API_KEY in .env file
 */

import { openai } from "@ai-sdk/openai";
import { type CoreMessage, streamText } from "ai";
import { join } from "node:path";
import * as readline from "node:readline/promises";
import { loadPrompt } from "../src/index";

const PROMPTS_DIR = join(import.meta.dir, "prompts");

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function main() {
  console.log("AI SDK + TextPrompts Chat Example");
  console.log("=".repeat(40));
  console.log("Type your messages (Ctrl+C to exit)\n");

  // Load system prompt from file
  const systemPrompt = await loadPrompt(join(PROMPTS_DIR, "system.txt"), {
    meta: "allow",
  });

  // Format system prompt with variables
  const systemMessage = systemPrompt.prompt.format({
    company_name: "Tech Solutions Inc",
    tone: "friendly and professional",
  });

  console.log(`Loaded: ${systemPrompt.meta?.title ?? 'Untitled'} (v${systemPrompt.meta?.version ?? 'unknown'})\n`);

  const messages: CoreMessage[] = [{ role: "system", content: systemMessage }];

  while (true) {
    const userInput = await terminal.question("You: ");

    if (!userInput.trim()) continue;

    messages.push({ role: "user", content: userInput });

    const result = streamText({
      model: openai("gpt-5-mini"),
      messages,
    });

    let fullResponse = "";
    process.stdout.write("\nAssistant: ");
    for await (const delta of result.textStream) {
      fullResponse += delta;
      process.stdout.write(delta);
    }
    process.stdout.write("\n\n");

    messages.push({ role: "assistant", content: fullResponse });
  }
}

main().catch(console.error);
