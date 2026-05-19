#!/usr/bin/env bun
/**
 * Example: building prompts from in-memory strings (v2 API).
 *
 * `Prompt.fromString` is the documented way to create a prompt from a string,
 * whether that string came from a bundler `?raw` import, an HTTP response, a
 * database row, or test fixtures.
 *
 * Use cases:
 * - Frontend apps using Vite with `?raw` imports
 * - Webpack projects with `raw-loader`
 * - Loading prompts from APIs or databases
 * - Testing without filesystem access
 */

import { Prompt } from "../src/index";

function plainString() {
  console.log("1. Plain in-memory prompt");
  console.log("-".repeat(40));

  const prompt = Prompt.fromString("Analyze this {data_type}: {data}");

  console.log(`Title (default): ${prompt.meta.title ?? "(none)"}`);
  console.log(`Body: ${prompt.toString()}`);

  const rendered = prompt.format({
    data_type: "sales data",
    data: "Q1: $100k, Q2: $150k",
  });
  console.log(`\nRendered: ${rendered}`);
  console.log();
}

function frontmatterAndFlags() {
  console.log("2. Frontmatter declarations and `prompt.meta.flags`");
  console.log("-".repeat(40));

  // Simulate a Vite-style `?raw` import: full file contents in a string.
  const content = `---
title = "Tier-aware system prompt"
version = "1.0.0"
description = "System prompt with tier-based routing"

[flags.tier]
type = "enum"
values = ["free", "premium"]
description = "User subscription tier"

[variables.user_name]
description = "Display name shown to the model"
---
You are talking to {user_name}.

{switch tier}
{case free}
Politely mention upgrade options.
{case premium}
Greet them warmly and skip the upgrade pitch.
{end}
`;

  const prompt = Prompt.fromString(content, { path: "system.txt" });

  console.log("Standard metadata:");
  console.log(`  title:       ${prompt.meta.title}`);
  console.log(`  version:     ${prompt.meta.version}`);
  console.log(`  description: ${prompt.meta.description}`);

  console.log("\nFlag declarations:");
  for (const [name, decl] of Object.entries(prompt.meta.flags)) {
    if (decl.kind === "enum") {
      console.log(
        `  ${name}: enum, values=[${decl.values.join(", ")}], description="${decl.description ?? ""}"`,
      );
    } else {
      console.log(`  ${name}: boolean, description="${decl.description ?? ""}"`);
    }
  }

  console.log("\nVariable declarations:");
  for (const [name, decl] of Object.entries(prompt.meta.variables)) {
    console.log(`  ${name}: description="${decl.description ?? ""}"`);
  }

  const rendered = prompt.format({
    user_name: "Jan",
    flags: { tier: "premium" },
  });
  console.log("\nRendered output (tier = premium):");
  console.log(rendered);
  console.log();
}

function metadataModes() {
  console.log("3. Metadata modes");
  console.log("-".repeat(40));

  const content = `---
title = "Test prompt"
version = "1.0.0"
description = "Three-mode example"
---
Hello {name}!`;

  // "allow" (default) parses frontmatter if present.
  const allow = Prompt.fromString(content, { metadata: "allow" });
  console.log(`allow:  title="${allow.meta.title}"`);

  // "ignore" skips frontmatter parsing entirely; the whole file is body.
  const ignore = Prompt.fromString(content, { metadata: "ignore", path: "test.txt" });
  console.log(`ignore: title="${ignore.meta.title}" (filename stem)`);

  // "strict" requires title/description/version, declared body flags, and a
  // description on every declared flag.
  const strict = Prompt.fromString(content, { metadata: "strict" });
  console.log(`strict: title="${strict.meta.title}"`);

  console.log();
}

function whenToUseFromString() {
  console.log("4. When to use `fromString` vs `fromPath`");
  console.log("-".repeat(40));
  console.log("Use `loadPrompt` / `Prompt.fromPath` when:");
  console.log("  - You are in Node.js or Bun with filesystem access");
  console.log("  - You want hot-reloading from disk");
  console.log();
  console.log("Use `Prompt.fromString` when:");
  console.log("  - You import prompts with a bundler (`./prompt.txt?raw`)");
  console.log("  - Prompts come from an API, database, or test fixture");
  console.log("  - You run on an edge runtime without `node:fs`");
  console.log();
}

function main() {
  console.log("textprompts v2 — Prompt.fromString");
  console.log("=".repeat(40));
  console.log();

  plainString();
  frontmatterAndFlags();
  metadataModes();
  whenToUseFromString();
}

main();
