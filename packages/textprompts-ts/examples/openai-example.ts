#!/usr/bin/env bun
/**
 * Example: OpenAI integration with textprompts v2.
 *
 * Demonstrates how to:
 * - Compose system + user messages from textprompts files
 * - Switch prompt behavior per model tier with `{switch model_tier}`
 * - Pass `flags` through to `format()`
 *
 * The example prints the rendered prompts unconditionally and only calls the
 * OpenAI API if `OPENAI_API_KEY` is set, so it runs cleanly without an API key.
 */

import { join } from "node:path";
import { Prompt, loadPrompt } from "../src/index";

const PROMPTS_DIR = join(import.meta.dir, "prompts");

// Inline system prompt that picks per-tier guidance via `{switch model_tier}`.
const SYSTEM_TEMPLATE = `---
title = "OpenAI assistant system prompt"
version = "1.0.0"
description = "Routes by model tier and adopts the requested tone"

[flags.model_tier]
type = "enum"
values = ["fast", "balanced", "premium"]
description = "Which OpenAI model tier this prompt is being used with"

[variables.company_name]
description = "Company the assistant represents"

[variables.tone]
description = "Tone of voice the assistant should adopt"
---
You are a helpful customer support assistant for {company_name}.
Maintain a {tone} tone in every interaction.

{switch model_tier}
{case fast}
Keep replies short, factual, and easy to scan.
{case balanced}
Be helpful and thorough, but avoid long-winded preamble.
{case premium}
Take the time to reason carefully. Show step-by-step thinking where it helps.
{end}
`;

type ModelTier = "fast" | "balanced" | "premium";

const MODEL_FOR_TIER: Record<ModelTier, string> = {
  fast: "gpt-4o-mini",
  balanced: "gpt-4o",
  premium: "gpt-4o",
};

async function buildMessages(tier: ModelTier) {
  const system = Prompt.fromString(SYSTEM_TEMPLATE, { path: "openai-system.txt" });
  const greeting = await loadPrompt(join(PROMPTS_DIR, "greeting.txt"));

  const systemContent = system.format({
    company_name: "Tech Solutions Inc",
    tone: "friendly and professional",
    flags: { model_tier: tier },
  });
  const userContent = greeting.format({
    customer_name: "Alice Johnson",
    company_name: "Tech Solutions Inc",
  });

  return { systemContent, userContent };
}

async function main() {
  console.log("textprompts v2 + OpenAI");
  console.log("=".repeat(40));
  console.log();

  for (const tier of ["fast", "balanced", "premium"] as const) {
    const { systemContent, userContent } = await buildMessages(tier);
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

  // Live call (only runs when an API key is available).
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI();
  const { systemContent, userContent } = await buildMessages("balanced");
  const response = await client.chat.completions.create({
    model: MODEL_FOR_TIER.balanced,
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: userContent },
    ],
  });
  console.log("OpenAI reply:");
  console.log(response.choices[0]?.message?.content ?? "(no content)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
