#!/usr/bin/env node
// Simple Node.js test to verify compatibility with the built dist.
import { loadPrompt, MetadataMode, Prompt } from "./dist/index.js";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const testDir = join(tmpdir(), `textprompts-node-test-${Date.now()}`);
mkdirSync(testDir, { recursive: true });

try {
  console.log("Testing Node.js compatibility...\n");

  // Test 1: Prompt.fromString
  console.log("1. Testing Prompt.fromString...");
  const inMem = Prompt.fromString("Hello {name}, you are {role}");
  const result = inMem.format({ name: "Alice", role: "admin" });
  if (result !== "Hello Alice, you are admin") {
    throw new Error(`Prompt.fromString format failed: got "${result}"`);
  }
  console.log("   ok Prompt.fromString works");

  // Test 2: conditional rendering
  console.log("2. Testing conditional rendering...");
  const cond = Prompt.fromString("Hi{if extra} there{end}!");
  if (cond.format({ flags: { extra: true } }) !== "Hi there!") {
    throw new Error("conditional rendering failed (true)");
  }
  if (cond.format({ flags: { extra: false } }) !== "Hi!") {
    throw new Error("conditional rendering failed (false)");
  }
  console.log("   ok conditional rendering works");

  // Test 3: Load prompt with metadata
  console.log("3. Testing loadPrompt with metadata...");
  const testFile = join(testDir, "test.txt");
  writeFileSync(testFile, `---
title = "Test Prompt"
version = "1.0.0"
description = "A test"
---
Hello {user}!`);

  const prompt = await loadPrompt(testFile, { metadata: MetadataMode.ALLOW });
  if (prompt.meta?.title !== "Test Prompt") {
    throw new Error("Metadata parsing failed");
  }
  if (!prompt.format({ user: "World" }).includes("Hello World!")) {
    throw new Error("Prompt formatting failed");
  }
  console.log("   ok loadPrompt with metadata works");

  // Test 4: Load prompt without metadata
  console.log("4. Testing loadPrompt without metadata...");
  const testFile2 = join(testDir, "simple.txt");
  writeFileSync(testFile2, "Simple prompt: {value}");

  const prompt2 = await loadPrompt(testFile2, { metadata: MetadataMode.IGNORE });
  if (prompt2.meta?.title !== "simple") {
    throw new Error("Title should be filename");
  }
  if (prompt2.format({ value: "test" }) !== "Simple prompt: test") {
    throw new Error("Simple prompt formatting failed");
  }
  console.log("   ok loadPrompt without metadata works");

  console.log("\nAll Node.js tests passed.");
  process.exit(0);
} catch (error) {
  console.error("\nTest failed:", error.message);
  console.error(error.stack);
  process.exit(1);
} finally {
  try {
    const { rmSync } = await import("fs");
    rmSync(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}
