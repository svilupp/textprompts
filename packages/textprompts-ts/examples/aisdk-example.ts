#!/usr/bin/env bun
/**
 * Example: Vercel AI SDK + textprompts v2.
 *
 * Demonstrates:
 * - Composing a system prompt with `{switch model_tier}`
 * - Passing `flags` through `prompt.format`
 * - Routing to a different AI SDK model per tier
 *
 * The example prints rendered prompts unconditionally. The live `streamText`
 * call only runs when `OPENAI_API_KEY` is set, so you can read through the
 * output without any provider credentials.
 */

import { join } from "node:path";
import { Prompt, loadPrompt } from "../src/index";

const PROMPTS_DIR = join(import.meta.dir, "prompts");

const SYSTEM_TEMPLATE = `---
title = "AI SDK assistant"
version = "1.0.0"
description = "Routes by model tier"

[flags.model_tier]
type = "enum"
values = ["fast", "premium"]
description = "Vercel AI SDK model tier (gpt-4o-mini vs gpt-4o)"

[variables.company_name]
description = "Company the assistant represents"
---
You are an assistant for {company_name}.

{switch model_tier}
{case fast}
Reply in one or two short sentences.
{case premium}
Reply with thoughtful, structured detail. Use bullet points when listing.
{end}
`;

type ModelTier = "fast" | "premium";

const MODEL_FOR_TIER: Record<ModelTier, string> = {
  fast: "gpt-4o-mini",
  premium: "gpt-4o",
};

async function buildSystemMessage(tier: ModelTier) {
  const system = Prompt.fromString(SYSTEM_TEMPLATE, { path: "aisdk-system.txt" });
  return system.format({
    company_name: "Tech Solutions Inc",
    flags: { model_tier: tier },
  });
}

async function buildUserMessage() {
  // Reuse the file-based greeting prompt to show the file + string mix.
  const greeting = await loadPrompt(join(PROMPTS_DIR, "greeting.txt"));
  return greeting.format({
    customer_name: "Alice Johnson",
    company_name: "Tech Solutions Inc",
  });
}

async function main() {
  console.log("textprompts v2 + Vercel AI SDK");
  console.log("=".repeat(40));
  console.log();

  for (const tier of ["fast", "premium"] as const) {
    const systemContent = await buildSystemMessage(tier);
    const userContent = await buildUserMessage();
    console.log(`--- model_tier = ${tier} (model = ${MODEL_FOR_TIER[tier]}) ---`);
    console.log("System message:");
    console.log(systemContent);
    console.log("User message:");
    console.log(userContent);
    console.log();
  }

  if (!process.env.OPENAI_API_KEY) {
    console.log("OPENAI_API_KEY not set; skipping live call. Rendered prompts above.");
    return;
  }

  // Live streaming call.
  const { openai } = await import("@ai-sdk/openai");
  const { streamText } = await import("ai");

  const systemContent = await buildSystemMessage("fast");
  const userContent = await buildUserMessage();

  const result = streamText({
    model: openai(MODEL_FOR_TIER.fast),
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: userContent },
    ],
  });

  process.stdout.write("Assistant: ");
  for await (const delta of result.textStream) {
    process.stdout.write(delta);
  }
  process.stdout.write("\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
