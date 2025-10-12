#!/usr/bin/env node
// Simple Node.js test to verify compatibility
import { loadPrompt, PromptString, MetadataMode } from "./dist/index.js";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const testDir = join(tmpdir(), `textprompts-node-test-${Date.now()}`);
mkdirSync(testDir, { recursive: true });

try {
  console.log("Testing Node.js compatibility...\n");

  // Test 1: PromptString
  console.log("1. Testing PromptString...");
  const template = new PromptString("Hello {name}, you are {role}");
  const result = template.format({ name: "Alice", role: "admin" });
  if (result !== "Hello Alice, you are admin") {
    throw new Error("PromptString format failed");
  }
  console.log("   ✓ PromptString works");

  // Test 2: Sequential empty placeholders
  console.log("2. Testing sequential empty placeholders...");
  const template2 = new PromptString("{} and {}");
  const result2 = template2.format(["A", "B"], {});
  if (result2 !== "A and B") {
    throw new Error(`Sequential placeholders failed: got "${result2}", expected "A and B"`);
  }
  console.log("   ✓ Sequential empty placeholders work");

  // Test 3: Load prompt with metadata
  console.log("3. Testing loadPrompt with metadata...");
  const testFile = join(testDir, "test.txt");
  writeFileSync(testFile, `---
title = "Test Prompt"
version = "1.0.0"
description = "A test"
---
Hello {user}!`);

  const prompt = await loadPrompt(testFile, { meta: MetadataMode.ALLOW });
  if (prompt.meta?.title !== "Test Prompt") {
    throw new Error("Metadata parsing failed");
  }
  if (!prompt.format({ user: "World" }).includes("Hello World!")) {
    throw new Error("Prompt formatting failed");
  }
  console.log("   ✓ loadPrompt with metadata works");

  // Test 4: Load prompt without metadata
  console.log("4. Testing loadPrompt without metadata...");
  const testFile2 = join(testDir, "simple.txt");
  writeFileSync(testFile2, "Simple prompt: {value}");

  const prompt2 = await loadPrompt(testFile2, { meta: MetadataMode.IGNORE });
  if (prompt2.meta?.title !== "simple") {
    throw new Error("Title should be filename");
  }
  if (prompt2.format({ value: "test" }) !== "Simple prompt: test") {
    throw new Error("Simple prompt formatting failed");
  }
  console.log("   ✓ loadPrompt without metadata works");

  console.log("\n✅ All Node.js tests passed!");
  process.exit(0);
} catch (error) {
  console.error("\n❌ Test failed:", error.message);
  console.error(error.stack);
  process.exit(1);
} finally {
  // Cleanup
  try {
    const { rmSync } = await import("fs");
    rmSync(testDir, { recursive: true, force: true });
  } catch (e) {
    // Ignore cleanup errors
  }
}
