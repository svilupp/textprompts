import { writeFile } from "node:fs/promises";

import YAML from "yaml";

import { Prompt, type PromptMeta } from "./models";

export type FrontMatterFormat = "toml" | "yaml";

const serializeMetaValue = (value: string | null | undefined): string => {
  if (value == null) {
    return "";
  }
  // Escape special TOML characters
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
};

const quoteYaml = (value: string | null | undefined): string => {
  if (value == null || value === "") {
    return '""';
  }
  const needsQuoting =
    /[:#{}[\],&*?|<>=!%@\\\n\r"]/.test(value) ||
    value !== value.trim() ||
    ["true", "false", "yes", "no", "null", "on", "off"].includes(value.toLowerCase());
  if (needsQuoting) {
    const escaped = value
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r");
    return `"${escaped}"`;
  }
  return value;
};

/**
 * Serialize a single extras value for YAML frontmatter.
 * Uses the yaml library for complex values (arrays, objects).
 */
const serializeExtrasForYaml = (key: string, value: unknown): string => {
  if (value == null) {
    return `${key}: null`;
  }
  if (typeof value === "string") {
    return `${key}: ${quoteYaml(value)}`;
  }
  if (typeof value === "boolean" || typeof value === "number") {
    return `${key}: ${value}`;
  }
  // For arrays and objects, use the yaml library
  const serialized = YAML.stringify({ [key]: value }).trimEnd();
  return serialized;
};

/**
 * Serialize a single extras value for TOML frontmatter.
 * Only supports simple types (strings, numbers, booleans, string arrays).
 * Complex values (nested objects, mixed arrays) are serialized as
 * inline TOML tables/arrays where possible.
 */
const serializeExtrasForToml = (key: string, value: unknown): string | null => {
  if (value == null) {
    return null; // TOML has no null — skip
  }
  if (typeof value === "string") {
    return `${key} = "${serializeMetaValue(value)}"`;
  }
  if (typeof value === "boolean") {
    return `${key} = ${value}`;
  }
  if (typeof value === "number") {
    return `${key} = ${value}`;
  }
  if (Array.isArray(value)) {
    const allStrings = value.every((v) => typeof v === "string");
    if (allStrings) {
      const items = value.map((v) => `"${serializeMetaValue(v)}"`).join(", ");
      return `${key} = [${items}]`;
    }
    const allPrimitives = value.every(
      (v) => typeof v === "string" || typeof v === "number" || typeof v === "boolean",
    );
    if (allPrimitives) {
      const items = value
        .map((v) => (typeof v === "string" ? `"${serializeMetaValue(v)}"` : String(v)))
        .join(", ");
      return `${key} = [${items}]`;
    }
    // Complex arrays — skip for TOML, these need YAML format
    return null;
  }
  // Nested objects — skip for TOML
  return null;
};

export const savePrompt = async (
  path: string,
  content: string | Prompt,
  options?: { format?: FrontMatterFormat },
): Promise<void> => {
  const format = options?.format ?? "toml";

  if (typeof content === "string") {
    const template =
      format === "yaml"
        ? `---\ntitle: ""\ndescription: ""\nversion: ""\n---\n\n${content}`
        : `---\ntitle = ""\ndescription = ""\nversion = ""\n---\n\n${content}`;
    await writeFile(path, template, { encoding: "utf8" });
    return;
  }

  if (!(content instanceof Prompt)) {
    throw new TypeError(`content must be string or Prompt, received ${typeof content}`);
  }

  const meta: PromptMeta = content.meta ?? {};

  if (format === "yaml") {
    const lines = ["---"];
    lines.push(`title: ${quoteYaml(meta.title)}`);
    lines.push(`description: ${quoteYaml(meta.description)}`);
    lines.push(`version: ${quoteYaml(meta.version)}`);
    if (meta.author) {
      lines.push(`author: ${quoteYaml(meta.author)}`);
    }
    if (meta.created) {
      lines.push(`created: ${quoteYaml(meta.created)}`);
    }
    // Serialize extras
    if (meta.extras) {
      for (const [key, value] of Object.entries(meta.extras)) {
        lines.push(serializeExtrasForYaml(key, value));
      }
    }
    lines.push("---", "", content.prompt.toString());
    await writeFile(path, lines.join("\n"), { encoding: "utf8" });
  } else {
    const lines = ["---"];
    lines.push(`title = "${serializeMetaValue(meta.title)}"`);
    lines.push(`description = "${serializeMetaValue(meta.description)}"`);
    lines.push(`version = "${serializeMetaValue(meta.version)}"`);
    if (meta.author) {
      lines.push(`author = "${serializeMetaValue(meta.author)}"`);
    }
    if (meta.created) {
      lines.push(`created = "${serializeMetaValue(meta.created)}"`);
    }
    // Serialize extras (simple types only for TOML)
    if (meta.extras) {
      for (const [key, value] of Object.entries(meta.extras)) {
        const line = serializeExtrasForToml(key, value);
        if (line != null) {
          lines.push(line);
        }
      }
    }
    lines.push("---", "", content.prompt.toString());
    await writeFile(path, lines.join("\n"), { encoding: "utf8" });
  }
};
