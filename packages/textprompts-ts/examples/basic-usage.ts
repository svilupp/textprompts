#!/usr/bin/env bun
/**
 * Example: Basic textprompts usage (v2 API).
 *
 * Demonstrates the v2 public surface:
 * - `loadPrompt` with file-based prompts
 * - `Prompt.format({ flags, ...vars })` with named variables and flags
 * - Reading declared `meta.flags` and `meta.variables`
 */

import { join } from "node:path";
import { loadPrompt } from "../src/index";

const PROMPTS_DIR = join(import.meta.dir, "prompts");

async function loadGreeting() {
  console.log("1. Plain variables (no conditionals)");
  console.log("-".repeat(40));

  const greeting = await loadPrompt(join(PROMPTS_DIR, "greeting.txt"));

  console.log(`Title:   ${greeting.meta.title}`);
  console.log(`Version: ${greeting.meta.version}`);
  console.log(`Declared variables: ${Object.keys(greeting.meta.variables).join(", ")}`);

  const message = greeting.format({
    customer_name: "Alice Johnson",
    company_name: "Tech Solutions Inc",
  });

  console.log("\nFormatted output:");
  console.log(message);
  console.log();
}

async function loadSystemWithPersona() {
  console.log("2. Conditional block with `{if flag}`");
  console.log("-".repeat(40));

  const system = await loadPrompt(join(PROMPTS_DIR, "system.txt"));

  console.log(`Title:   ${system.meta.title}`);
  console.log(`Declared flags: ${Object.keys(system.meta.flags).join(", ")}`);

  // With the persona flag ON the optional line is included.
  const withPersona = system.format({
    company_name: "Tech Solutions Inc",
    tone: "friendly",
    flags: { persona: true },
  });
  console.log("\nWith persona flag = true:\n");
  console.log(withPersona);

  // With the persona flag OFF the optional line is removed entirely
  // (including the keyword line indentation and trailing newline).
  const withoutPersona = system.format({
    company_name: "Tech Solutions Inc",
    tone: "friendly",
    flags: { persona: false },
  });
  console.log("\nWith persona flag = false:\n");
  console.log(withoutPersona);
}

async function loadSupportWithSwitch() {
  console.log("\n3. `{switch}` over an enum flag");
  console.log("-".repeat(40));

  const support = await loadPrompt(join(PROMPTS_DIR, "support.txt"));

  console.log(`Declared flags: ${Object.keys(support.meta.flags).join(", ")}`);
  console.log(`Custom metadata (extras): ${JSON.stringify(support.meta.extras)}`);

  for (const tier of ["free", "premium", "enterprise"] as const) {
    const rendered = support.format({
      user_name: "Jan",
      last_question: "How do I upgrade?",
      flags: { tier, has_urgent: tier === "enterprise" },
    });
    console.log(`\n--- tier = ${tier} ---`);
    console.log(rendered);
  }
}

async function main() {
  console.log("textprompts v2 — basic usage");
  console.log("=".repeat(40));
  console.log();

  await loadGreeting();
  await loadSystemWithPersona();
  await loadSupportWithSwitch();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
