#!/usr/bin/env bun
/**
 * Example: OpenAI Integration with TextPrompts
 *
 * This demonstrates how to use textprompts-ts with OpenAI's API
 * for safe, version-controlled prompt management.
 *
 * Prerequisites:
 * - OpenAI package (installed as dev dependency)
 * - OPENAI_API_KEY in .env file
 */

import { join } from "node:path";
import { loadPrompt } from "../src/index";
import OpenAI from "openai";

const PROMPTS_DIR = join(import.meta.dir, "prompts");

async function demonstrateBasicIntegration() {
  console.log("OpenAI Integration Example");
  console.log("=".repeat(40));
  console.log();

  // Load system and user prompts
  const systemPrompt = await loadPrompt(join(PROMPTS_DIR, "system.txt"), {
    meta: "allow",
  });
  const greetingPrompt = await loadPrompt(join(PROMPTS_DIR, "greeting.txt"), {
    meta: "allow",
  });

  console.log("1. Loaded Prompts");
  console.log("-".repeat(30));
  console.log(
    `System: ${systemPrompt.meta?.title ?? "Untitled"} (v${systemPrompt.meta?.version ?? "unknown"})`,
  );
  console.log(
    `User: ${greetingPrompt.meta?.title ?? "Untitled"} (v${greetingPrompt.meta?.version ?? "unknown"})`,
  );
  console.log();

  // Format the prompts with safe variable replacement
  const systemMessage = systemPrompt.prompt.format({
    company_name: "Tech Solutions Inc",
    tone: "friendly and professional",
  });

  const userMessage = greetingPrompt.prompt.format({
    customer_name: "Alice Johnson",
    company_name: "Tech Solutions Inc",
    issue_type: "cloud hosting setup",
    agent_name: "AI Assistant",
  });

  console.log("2. Formatted Messages");
  console.log("-".repeat(30));
  console.log("System message:");
  console.log(`${systemMessage.slice(0, 100)}...`);
  console.log("\nUser message:");
  console.log(`${userMessage.slice(0, 100)}...`);
  console.log();

  // Call OpenAI API
  const client = new OpenAI();
  const response = await client.chat.completions.create({
    model: "gpt-5-mini",
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: userMessage },
    ],
  });

  console.log("3. OpenAI Response");
  console.log("-".repeat(30));
  console.log(response.choices[0].message.content);
  console.log();
}

async function demonstrateErrorPrevention() {
  console.log("4. Error Prevention with PromptString");
  console.log("-".repeat(30));

  const greetingPrompt = await loadPrompt(join(PROMPTS_DIR, "greeting.txt"), {
    meta: "allow",
  });

  // This will fail because we're missing required variables
  try {
    const message = greetingPrompt.prompt.format({
      customer_name: "Bob Smith",
      // Missing: company_name, issue_type, agent_name
    });
    console.log("❌ This shouldn't succeed:", message);
  } catch (error) {
    if (error instanceof Error) {
      console.log("✅ Caught missing variables:", error.message);
      console.log("   ^ This prevents sending incomplete prompts to OpenAI!");
    }
  }

  console.log();
}

async function demonstratePartialFormatting() {
  console.log("5. Partial Formatting for Templates");
  console.log("-".repeat(30));

  const systemPrompt = await loadPrompt(join(PROMPTS_DIR, "system.txt"), {
    meta: "allow",
  });

  // Create a base system prompt with company info
  const baseSystem = systemPrompt.prompt.format(
    {
      company_name: "Tech Solutions Inc",
      // Leave {tone} for runtime customization
    },
    { skipValidation: true },
  );

  console.log("Base system prompt (partial):");
  console.log(`${baseSystem.slice(0, 150)}...`);
  console.log("\n^ Notice {tone} placeholder is preserved for later replacement");
  console.log();
}

async function main() {
  try {
    await demonstrateBasicIntegration();
    await demonstrateErrorPrevention();
    await demonstratePartialFormatting();

    console.log("=".repeat(40));
    console.log("✅ All examples completed!");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
