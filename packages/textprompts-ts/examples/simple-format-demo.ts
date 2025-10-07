#!/usr/bin/env node
/**
 * Simple demonstration of the core TextPrompts formatting feature.
 *
 * This shows how PromptString prevents the common problem of missing variables
 * in prompt templates, making your AI applications more reliable.
 */

import { PromptString } from "../src/index";

function main() {
  console.log("TextPrompts PromptString Demo");
  console.log("=".repeat(30));
  console.log();

  // The problem with regular template strings
  console.log("❌ Problem with regular template strings:");
  const regularTemplate = "Hello {name}, your order #{order_id} is {status}";

  // Template strings don't have a format method like Python
  // But if we tried to use string replacement, we'd have issues
  console.log(`   Template: "${regularTemplate}"`);
  console.log("   ^ If you forget to replace {order_id}, it stays in the string!");
  console.log();

  // The solution with PromptString
  console.log("✅ Solution with PromptString:");
  const safeTemplate = new PromptString(
    "Hello {name}, your order #{order_id} is {status}"
  );

  try {
    // This fails fast with a clear error message
    const result = safeTemplate.format({
      name: "Alice",
      status: "shipped",
      // Missing: order_id
    });
    console.log(`   PromptString result: '${result}'`);
  } catch (error) {
    if (error instanceof Error) {
      console.log(`   ValueError: ${error.message}`);
      console.log("   ^ Clear error message about missing variables!");
    }
  }

  console.log();

  // Partial formatting with skipValidation
  console.log("✅ Partial formatting (skipValidation: true):");
  const partialResult = safeTemplate.format(
    { name: "Alice" },
    { skipValidation: true }
  );
  console.log(`   Partial result: '${partialResult}'`);
  console.log("   ^ Only {name} was replaced, others remain as placeholders!");

  console.log();

  // Correct usage
  console.log("✅ Correct usage (all placeholders provided):");
  try {
    const result = safeTemplate.format({
      name: "Alice",
      order_id: "12345",
      status: "shipped",
    });
    console.log(`   Correct result: '${result}'`);
  } catch (error) {
    if (error instanceof Error) {
      console.log(`   Error: ${error.message}`);
    }
  }

  console.log();

  // PromptString has string-like properties
  console.log("✅ PromptString properties:");
  console.log(`   Length: ${safeTemplate.length}`);
  console.log(`   Contains 'order': ${safeTemplate.value.includes("order")}`);
  console.log(`   Type: ${typeof safeTemplate}`);
  console.log(`   Placeholders: ${JSON.stringify([...safeTemplate.placeholders])}`);

  console.log();

  // Demonstrate mixed positional and named placeholders
  console.log("✅ Mixed placeholders:");
  const mixedTemplate = new PromptString("User {0} ordered {item} on {1}");

  try {
    const result = mixedTemplate.format(["Alice", "2024-01-15"], { item: "Widget" });
    console.log(`   Result: '${result}'`);
  } catch (error) {
    if (error instanceof Error) {
      console.log(`   Error: ${error.message}`);
    }
  }

  console.log();
  console.log("Use textprompts to load prompts from files and get PromptString automatically!");
}

main();
