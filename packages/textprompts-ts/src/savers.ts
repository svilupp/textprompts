import { writeFile } from "node:fs/promises";

import YAML from "yaml";

import { TextPromptsError } from "./errors";
import type { FlagDecl, VarDecl } from "./frontmatter-schema";
import { Prompt, type PromptMeta } from "./models";

export type FrontMatterFormat = "toml" | "yaml";

const escapeTomlString = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r");

const tomlString = (value: string | null | undefined): string =>
  `"${escapeTomlString(value ?? "")}"`;

const tomlValue = (value: unknown): string | null => {
  if (value == null) return null;
  if (typeof value === "string") return tomlString(value);
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v === "string")) {
      return `[${value.map((v) => tomlString(v as string)).join(", ")}]`;
    }
    if (value.every((v) => typeof v === "number")) {
      return `[${(value as number[]).map(String).join(", ")}]`;
    }
    if (value.every((v) => typeof v === "boolean")) {
      return `[${(value as boolean[]).map(String).join(", ")}]`;
    }
    return null;
  }
  return null;
};

const tomlInlineTable = (value: Record<string, unknown>): string | null => {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(value)) {
    const serialized = tomlValue(v);
    if (serialized === null) return null;
    parts.push(`${k} = ${serialized}`);
  }
  return `{ ${parts.join(", ")} }`;
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" &&
  v !== null &&
  !Array.isArray(v) &&
  !(v instanceof Date) &&
  Object.getPrototypeOf(v) === Object.prototype;

// ---------------------------------------------------------------------------
// TOML serializer for the full v2 meta object.
// ---------------------------------------------------------------------------

const serializeTomlExtraLine = (key: string, value: unknown): string | null => {
  if (value == null) return null;
  if (typeof value === "string") return `${key} = ${tomlString(value)}`;
  if (typeof value === "boolean") return `${key} = ${String(value)}`;
  if (typeof value === "number") return `${key} = ${String(value)}`;
  if (Array.isArray(value)) {
    const v = tomlValue(value);
    return v === null ? null : `${key} = ${v}`;
  }
  if (isPlainObject(value)) {
    const inline = tomlInlineTable(value);
    return inline === null ? null : `${key} = ${inline}`;
  }
  return null;
};

const serializeTomlFlag = (name: string, decl: FlagDecl): string[] => {
  const lines: string[] = [`[flags.${name}]`];
  // type: always emit explicit for clarity except boolean default is allowed
  if (decl.kind === "enum") {
    lines.push(`type = "enum"`);
    lines.push(`values = ${tomlValue(decl.values)}`);
  } else {
    lines.push(`type = "boolean"`);
  }
  if (decl.description !== undefined) {
    lines.push(`description = ${tomlString(decl.description)}`);
  }
  for (const [k, v] of Object.entries(decl.extras)) {
    const line = serializeTomlExtraLine(k, v);
    if (line === null) {
      throw new TextPromptsError(
        `Cannot serialize extras key '${k}' of flag '${name}' to TOML: unsupported value`,
      );
    }
    lines.push(line);
  }
  return lines;
};

const serializeTomlVariable = (name: string, decl: VarDecl): string[] => {
  const lines: string[] = [`[variables.${name}]`];
  if (decl.description !== undefined) {
    lines.push(`description = ${tomlString(decl.description)}`);
  }
  for (const [k, v] of Object.entries(decl.extras)) {
    const line = serializeTomlExtraLine(k, v);
    if (line === null) {
      throw new TextPromptsError(
        `Cannot serialize extras key '${k}' of variable '${name}' to TOML: unsupported value`,
      );
    }
    lines.push(line);
  }
  return lines;
};

const serializeTomlMeta = (meta: PromptMeta): string => {
  const lines: string[] = ["---"];
  lines.push(`title = ${tomlString(meta.title)}`);
  lines.push(`description = ${tomlString(meta.description)}`);
  lines.push(`version = ${tomlString(meta.version)}`);
  if (meta.author) lines.push(`author = ${tomlString(meta.author)}`);
  if (meta.created) lines.push(`created = ${tomlString(meta.created)}`);

  for (const [key, value] of Object.entries(meta.extras)) {
    const line = serializeTomlExtraLine(key, value);
    if (line === null) {
      throw new TextPromptsError(
        `Cannot serialize top-level extras key '${key}' to TOML: unsupported value`,
      );
    }
    lines.push(line);
  }

  const flagNames = Object.keys(meta.flags);
  for (const name of flagNames) {
    lines.push("");
    const decl = meta.flags[name];
    if (decl === undefined) continue;
    lines.push(...serializeTomlFlag(name, decl));
  }

  const varNames = Object.keys(meta.variables);
  for (const name of varNames) {
    lines.push("");
    const decl = meta.variables[name];
    if (decl === undefined) continue;
    lines.push(...serializeTomlVariable(name, decl));
  }

  lines.push("---");
  return lines.join("\n");
};

// ---------------------------------------------------------------------------
// YAML serializer (uses `yaml` package for complex values).
// ---------------------------------------------------------------------------

const serializeYamlObject = (obj: Record<string, unknown>): string => {
  // YAML.stringify emits a trailing newline; strip it so we can join manually.
  return YAML.stringify(obj).trimEnd();
};

const serializeYamlMeta = (meta: PromptMeta): string => {
  const root: Record<string, unknown> = {};
  if (meta.title != null) root.title = meta.title;
  if (meta.description != null) root.description = meta.description;
  if (meta.version != null) root.version = meta.version;
  if (meta.author != null) root.author = meta.author;
  if (meta.created != null) root.created = meta.created;
  for (const [k, v] of Object.entries(meta.extras)) {
    root[k] = v;
  }

  const flagNames = Object.keys(meta.flags);
  if (flagNames.length > 0) {
    const flagsObj: Record<string, unknown> = {};
    for (const name of flagNames) {
      const decl = meta.flags[name];
      if (decl === undefined) continue;
      const entry: Record<string, unknown> = {};
      entry.type = decl.kind;
      if (decl.kind === "enum") entry.values = decl.values;
      if (decl.description !== undefined) entry.description = decl.description;
      for (const [k, v] of Object.entries(decl.extras)) entry[k] = v;
      flagsObj[name] = entry;
    }
    root.flags = flagsObj;
  }

  const varNames = Object.keys(meta.variables);
  if (varNames.length > 0) {
    const varsObj: Record<string, unknown> = {};
    for (const name of varNames) {
      const decl = meta.variables[name];
      if (decl === undefined) continue;
      const entry: Record<string, unknown> = {};
      if (decl.description !== undefined) entry.description = decl.description;
      for (const [k, v] of Object.entries(decl.extras)) entry[k] = v;
      varsObj[name] = entry;
    }
    root.variables = varsObj;
  }

  // Fall back: emit minimal title/description/version even when nothing is set
  // (matches v1 saver behaviour and existing tests).
  if (!("title" in root)) root.title = "";
  if (!("description" in root)) root.description = "";
  if (!("version" in root)) root.version = "";

  const body = serializeYamlObject(root);
  return `---\n${body}\n---`;
};

// ---------------------------------------------------------------------------
// Public API.
// ---------------------------------------------------------------------------

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

  const meta: PromptMeta = content.meta ?? { extras: {}, flags: {}, variables: {} };

  // For YAML we need a meta with at least title/description/version represented
  // even if null, because parseString expects them as strings on round-trip
  // when no override is given. The existing behavior emits empty strings.
  const normalized: PromptMeta = {
    ...meta,
    title: meta.title ?? "",
    description: meta.description ?? "",
    version: meta.version ?? "",
  };

  let serialized: string;
  if (format === "yaml") {
    serialized = serializeYamlMeta(normalized);
  } else {
    serialized = serializeTomlMeta(normalized);
  }

  const body = content.prompt.toString();
  await writeFile(path, `${serialized}\n\n${body}`, { encoding: "utf8" });
};
