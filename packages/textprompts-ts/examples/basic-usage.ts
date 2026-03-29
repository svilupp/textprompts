#!/usr/bin/env node
/**
 * Example: Basic TextPrompts Usage
 *
 * This example demonstrates the core functionality of textprompts
 * including loading single prompts, multiple prompts, and using PromptString.
 */

import { join } from "node:path";
import { loadPrompt, PromptString } from "../src/index";

const PROMPTS_DIR = join(import.meta.dir, "prompts");

async function demonstrateSinglePromptLoading() {
  console.log("1. Single Prompt Loading");
  console.log("-".repeat(30));

  // Load greeting prompt
  const greetingPath = join(PROMPTS_DIR, "greeting.txt");
  const greeting = await loadPrompt(greetingPath, { meta: "allow" });

  console.log(`Loaded: ${greeting.meta?.title ?? "Untitled"}`);
  console.log(`Version: ${greeting.meta?.version ?? "unknown"}`);
  console.log(`Author: ${greeting.meta?.author ?? "unknown"}`);
  console.log(`Description: ${greeting.meta?.description ?? "No description"}`);

  // Use the prompt
  const message = greeting.prompt.format({
    customer_name: "Alice Johnson",
    company_name: "Tech Solutions Inc",
    issue_type: "cloud hosting",
    agent_name: "Sarah",
  });

  console.log("\nFormatted message:");
  console.log(message);
  console.log();
}

function demonstratePromptString() {
  console.log("3. PromptString Validation");
  console.log("-".repeat(30));

  // Create a template with variables
  const template = new PromptString(
    "Order {order_id} for {customer} is {status}. Total: ${amount}",
  );

  console.log("Template:", template.toString());
  console.log("Placeholders:", Array.from(template.placeholders));

  // Successful formatting (all placeholders provided)
  try {
    const result = template.format({
      order_id: "12345",
      customer: "Alice",
      status: "shipped",
      amount: "99.99",
    });
    console.log(`✅ Success: ${result}`);
  } catch (error) {
    console.log(`❌ Error: ${error}`);
  }

  // Failed formatting - missing variables
  try {
    const result = template.format({
      order_id: "12345",
      customer: "Bob",
      // Missing: status, amount
    });
    console.log(`✅ Success: ${result}`);
  } catch (error) {
    if (error instanceof Error) {
      console.log(`❌ Error (expected): ${error.message}`);
    }
  }

  // Partial formatting with skipValidation
  try {
    const partial = template.format(
      {
        order_id: "12345",
        customer: "Bob",
      },
      { skipValidation: true },
    );
    console.log(`✅ Partial format: ${partial}`);
    console.log("   ^ Notice {status} and {amount} remain as placeholders");
  } catch (error) {
    console.log(`❌ Error: ${error}`);
  }

  // Alternative format signature with args array
  try {
    const argsTemplate = new PromptString("Item {0}: {1} - ${2}");
    const result = argsTemplate.format(["Widget", "In Stock", "29.99"]);
    console.log(`✅ Array args format: ${result}`);
  } catch (error) {
    console.log(`❌ Error: ${error}`);
  }

  console.log();
}

async function demonstrateNoMetadataLoading() {
  console.log("4. No Metadata Loading");
  console.log("-".repeat(30));

  const simplePath = join(PROMPTS_DIR, "simple.txt");

  // Load with metadata ignored
  try {
    const simple = await loadPrompt(simplePath, { meta: "ignore" });
    console.log(`✅ Loaded simple prompt`);
    console.log(`   Title (from filename): ${simple.meta?.title ?? "Untitled"}`);

    // Use the prompt
    const result = simple.prompt.format({
      data_type: "sales data",
      data: "Q1: $100k, Q2: $150k",
    });
    console.log(`   Result: ${result.slice(0, 50)}...`);
  } catch (error) {
    if (error instanceof Error) {
      console.log(`❌ Error: ${error.message}`);
    }
  }

  console.log();
}

async function demonstrateErrorHandling() {
  console.log("5. Error Handling");
  console.log("-".repeat(30));

  // Try to load non-existent file
  try {
    await loadPrompt(join(PROMPTS_DIR, "nonexistent.txt"));
  } catch (error) {
    if (error instanceof Error) {
      console.log(`❌ File not found: ${error.message}`);
    }
  }

  console.log();
}

async function main() {
  console.log("TextPrompts Basic Usage Examples");
  console.log("=".repeat(40));
  console.log();

  await demonstrateSinglePromptLoading();
  demonstratePromptString();
  await demonstrateNoMetadataLoading();
  await demonstrateErrorHandling();

  console.log("All examples completed successfully! 🎉");
}

main().catch(console.error);
