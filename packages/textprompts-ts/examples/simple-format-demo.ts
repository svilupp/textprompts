#!/usr/bin/env bun
/**
 * Example: in-memory prompts with `Prompt.fromString` (v2 API).
 *
 * Demonstrates:
 * - Building a `Prompt` from a string at runtime (no file system needed)
 * - Using a `{var}` placeholder
 * - Using a `{if flag}` conditional
 * - Format-time validation: missing variables raise `FormatError`
 */

import { FormatError, Prompt } from "../src/index";

function plainVariable() {
  console.log("1. Plain variable substitution");
  console.log("-".repeat(40));

  const prompt = Prompt.fromString("Hello {name}!");
  const result = prompt.format({ name: "Alice" });

  console.log(`Source : ${prompt.toString()}`);
  console.log(`Output : ${result}`);
  console.log();
}

function inlineConditional() {
  console.log("2. Inline `{if}` conditional");
  console.log("-".repeat(40));

  // Implicit mode: the `{if friendly}` reference declares `friendly` as a
  // boolean flag with no extra setup.
  const prompt = Prompt.fromString("Hello {name}{if friendly}, friend{end}!");

  console.log(`Inferred flags: ${Object.keys(prompt.meta.flags).join(", ") || "(none declared)"}`);

  console.log(
    `\nfriendly = true  -> ${prompt.format({ name: "Alice", flags: { friendly: true } })}`,
  );
  console.log(
    `friendly = false -> ${prompt.format({ name: "Alice", flags: { friendly: false } })}`,
  );
  console.log();
}

function blockConditional() {
  console.log("3. Block `{if}` / `{else}`");
  console.log("-".repeat(40));

  const prompt = Prompt.fromString(
    [
      "Status report for {team}:",
      "{if blocked}",
      "  status: BLOCKED",
      "  next step: unblock the team",
      "{else}",
      "  status: on track",
      "{end}",
    ].join("\n"),
  );

  const blocked = prompt.format({
    team: "platform",
    flags: { blocked: true },
  });
  const ok = prompt.format({
    team: "platform",
    flags: { blocked: false },
  });

  console.log("blocked = true:");
  console.log(blocked);
  console.log("\nblocked = false:");
  console.log(ok);
  console.log();
}

function missingVariableError() {
  console.log("4. Missing variable -> FormatError");
  console.log("-".repeat(40));

  const prompt = Prompt.fromString("Hello {name}!");

  try {
    prompt.format({});
  } catch (error) {
    if (error instanceof FormatError) {
      console.log(`code:    ${error.code}`);
      console.log(`message: ${error.message}`);
    } else {
      throw error;
    }
  }
  console.log();
}

function main() {
  console.log("textprompts v2 — Prompt.fromString demo");
  console.log("=".repeat(40));
  console.log();

  plainVariable();
  inlineConditional();
  blockConditional();
  missingVariableError();
}

main();
