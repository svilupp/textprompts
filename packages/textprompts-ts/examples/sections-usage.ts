#!/usr/bin/env node
/**
 * XML Sections — store multiple prompt variants in one file and extract by ID.
 *
 * Section API:
 *   getSectionText(text, anchorId) → string | null
 *     Extract the body of a named section from a string.
 *
 *   sliceSectionContent(text, section) → string
 *     Extract the body given a Section object from parseSections().
 *
 *   loadSection(path, anchorId, options?) → Promise<Prompt>
 *     Load a section directly from a file as a Prompt.
 *
 *   parseSections(text) → ParseResult
 *     Parse all sections; each Section has startLine/endLine and
 *     contentStartLine/contentEndLine but NO content field.
 *     Use getSectionText() or sliceSectionContent() to get the text.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getSectionText, loadSection, parseSections, sliceSectionContent } from "../src/index";

const PROMPTS_DIR = join(import.meta.dir, "prompts");
const agentsFile = join(PROMPTS_DIR, "agents.txt");

// ── 1. Extract a section from text ──────────────────────────────────────────
const text = readFileSync(agentsFile, "utf8");

const defaultSystem = getSectionText(text, "default");
const expertSystem = getSectionText(text, "expert");
const conciseSystem = getSectionText(text, "concise");

console.log("default:", defaultSystem);
console.log("expert:", expertSystem);
console.log("concise:", conciseSystem);
console.log("missing:", getSectionText(text, "nonexistent")); // null

// ── 2. List all sections and extract each body ───────────────────────────────
const { sections } = parseSections(text);

console.log("\nAll sections:");
for (const section of sections) {
  if (section.kind === "preamble") continue;
  // Section has no .content field — use sliceSectionContent to get the text
  const body = sliceSectionContent(text, section);
  console.log(`  [${section.anchorId}] ${section.heading}: "${body.slice(0, 40)}..."`);
}

// ── 3. Load a section from a file as a Prompt (supports format/placeholders) ─
// Works with underscore, hyphen, or either — tag name is the anchor ID
const userTemplate = await loadSection(agentsFile, "user_template"); // or "user-template"
const message = userTemplate.prompt.format({ question: "What is TypeScript?" });
console.log("\nFormatted user message:", message);
