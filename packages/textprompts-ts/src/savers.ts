import { writeFile } from "node:fs/promises";

import { Prompt, type PromptMeta } from "./models";

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

export const savePrompt = async (path: string, content: string | Prompt): Promise<void> => {
  if (typeof content === "string") {
    const template = `---\ntitle = ""\ndescription = ""\nversion = ""\n---\n\n${content}`;
    await writeFile(path, template, { encoding: "utf8" });
    return;
  }

  if (!(content instanceof Prompt)) {
    throw new TypeError(`content must be string or Prompt, received ${typeof content}`);
  }

  const meta: PromptMeta = content.meta ?? {};
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
};
