#!/usr/bin/env node
/**
 * Example: Loading Prompts from Strings
 *
 * This demonstrates how to use Prompt.fromString() for scenarios where
 * you can't load files directly (e.g., bundled frontend code with Vite/Webpack).
 *
 * Use cases:
 * - Frontend apps using Vite with ?raw imports
 * - Webpack projects with raw-loader
 * - Loading prompts from APIs or databases
 * - Testing without file system access
 */

import { Prompt, MetadataMode } from "../src/index";

function demonstrateSimpleString() {
  console.log("1. Simple String Loading");
  console.log("-".repeat(40));

  // Load a simple prompt without metadata
  const content = "Analyze this {data_type}: {data}";
  const prompt = Prompt.fromString(content);

  console.log(`Title: ${prompt.meta?.title}`); // "<string>" (default)
  console.log(`Template: ${prompt.toString()}`);

  const result = prompt.format({
    data_type: "sales data",
    data: "Q1: $100k, Q2: $150k, Q3: $200k",
  });

  console.log(`Result: ${result}`);
  console.log();
}

function demonstrateWithMetadata() {
  console.log("2. Loading with TOML Metadata");
  console.log("-".repeat(40));

  // Simulate content from Vite import: `import content from "./prompt.txt?raw"`
  const content = `---
title = "Customer Greeting"
version = "2.0.0"
description = "Personalized customer support greeting"
author = "Support Team"
---
Hello {customer_name}!

Welcome to {company_name}. We're here to help you with {issue_type}.

Best regards,
{agent_name}`;

  const prompt = Prompt.fromString(content, {
    meta: MetadataMode.ALLOW,
    path: "greeting.txt", // Optional: for better error messages
  });

  console.log(`Title: ${prompt.meta?.title}`);
  console.log(`Version: ${prompt.meta?.version}`);
  console.log(`Author: ${prompt.meta?.author}`);
  console.log(`Description: ${prompt.meta?.description}`);

  const message = prompt.format({
    customer_name: "Alice Johnson",
    company_name: "Tech Solutions Inc",
    issue_type: "billing inquiry",
    agent_name: "Sarah",
  });

  console.log("\nFormatted message:");
  console.log(message);
  console.log();
}

function demonstrateVitePattern() {
  console.log("3. Vite/Webpack Bundle Pattern");
  console.log("-".repeat(40));

  // In a real Vite project, you would do:
  // import systemPromptContent from "./prompts/system.txt?raw";
  //
  // For this example, we'll simulate the imported content:
  const systemPromptContent = `---
title = "AI Assistant System Prompt"
version = "1.0.0"
description = "System prompt for customer support AI"
---
You are a helpful AI assistant for {company_name}.
Your tone should be {tone}.
Always be concise and accurate.`;

  // Load from the "imported" string
  const prompt = Prompt.fromString(systemPromptContent, {
    path: "system.txt",
    meta: "allow",
  });

  console.log("✅ Loaded prompt from bundled string");
  console.log(`   Title: ${prompt.meta?.title}`);
  console.log(`   Version: ${prompt.meta?.version}`);

  const formatted = prompt.format({
    company_name: "ACME Corp",
    tone: "professional and friendly",
  });

  console.log("\nFormatted system prompt:");
  console.log(formatted);
  console.log();
}

function demonstrateMetadataModes() {
  console.log("4. Different Metadata Modes");
  console.log("-".repeat(40));

  const contentWithMeta = `---
title = "Test Prompt"
version = "1.0.0"
---
Content here`;

  // IGNORE mode - treats everything as content
  const ignored = Prompt.fromString(contentWithMeta, {
    meta: MetadataMode.IGNORE,
    path: "test.txt",
  });
  console.log(`IGNORE mode - title from filename: ${ignored.meta?.title}`);

  // ALLOW mode - parses metadata but doesn't require completeness
  const allowed = Prompt.fromString(contentWithMeta, {
    meta: MetadataMode.ALLOW,
  });
  console.log(`ALLOW mode - parsed title: ${allowed.meta?.title}`);

  // STRICT mode - requires complete metadata
  try {
    Prompt.fromString(contentWithMeta, {
      meta: MetadataMode.STRICT, // Missing 'description' field
    });
    console.log("STRICT mode - should have failed");
  } catch (error) {
    if (error instanceof Error) {
      console.log(`STRICT mode - validation failed (expected): ${error.message.split(".")[0]}`);
    }
  }

  console.log();
}

function demonstrateComparison() {
  console.log("5. When to Use fromString vs fromPath");
  console.log("-".repeat(40));

  console.log("Use fromPath():");
  console.log("  ✓ Node.js/Bun server-side applications");
  console.log("  ✓ CLI tools and scripts");
  console.log("  ✓ When files are available at runtime");
  console.log();

  console.log("Use fromString():");
  console.log("  ✓ Frontend apps with Vite/Webpack/Rollup");
  console.log("  ✓ Loading prompts from APIs or databases");
  console.log("  ✓ Testing without file system");
  console.log("  ✓ Serverless/edge environments with bundled code");
  console.log();

  console.log("Example Vite import pattern:");
  console.log('  import promptContent from "./prompt.txt?raw";');
  console.log("  const prompt = Prompt.fromString(promptContent);");
  console.log();
}

function main() {
  console.log("TextPrompts fromString() Examples");
  console.log("=".repeat(40));
  console.log();

  demonstrateSimpleString();
  demonstrateWithMetadata();
  demonstrateVitePattern();
  demonstrateMetadataModes();
  demonstrateComparison();

  console.log("All examples completed successfully! 🎉");
}

main();
