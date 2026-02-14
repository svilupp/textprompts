import { writeFile } from "node:fs/promises";

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
    lines.push("---", "", content.prompt.toString());
    await writeFile(path, lines.join("\n"), { encoding: "utf8" });
  }
};
