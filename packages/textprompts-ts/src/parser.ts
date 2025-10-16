import { basename, extname } from "node:path";
import { readFile } from "node:fs/promises";

import { MetadataMode, warnOnIgnoredMetadata } from "./config";
import {
  InvalidMetadataError,
  MalformedHeaderError,
  MissingMetadataError,
  TextPromptsError,
} from "./errors";
import { Prompt, type PromptMeta } from "./models";
import { PromptString } from "./prompt-string";
import { parseToml } from "./toml";

const DELIM = "---";

const dedent = (input: string): string => {
  const normalized = input.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  let minIndent = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    const match = line.match(/^\s*/);
    const indent = match ? match[0].length : 0;
    if (indent < minIndent) {
      minIndent = indent;
    }
  }
  if (!Number.isFinite(minIndent) || minIndent === 0) {
    return normalized;
  }
  return lines
    .map((line) => {
      if (!line.trim()) {
        return "";
      }
      return line.slice(minIndent);
    })
    .join("\n");
};

const splitFrontMatter = (text: string): { header: string | null; body: string } => {
  if (!text.startsWith(DELIM)) {
    return { header: null, body: text };
  }
  const secondIndex = text.indexOf(DELIM, DELIM.length);
  if (secondIndex === -1) {
    throw new MalformedHeaderError("Missing closing delimiter '---' for front matter");
  }
  const header = text.slice(DELIM.length, secondIndex).trim();
  let body = text.slice(secondIndex + DELIM.length);
  body = body.replace(/^\r?\n/, "");
  return { header, body };
};

const ensurePromptMeta = (data: Record<string, unknown>): PromptMeta => {
  const meta: PromptMeta = {};
  if (typeof data.title === "string") meta.title = data.title;
  if (typeof data.description === "string") meta.description = data.description;
  if (typeof data.version === "string") meta.version = data.version;
  if (typeof data.author === "string") meta.author = data.author;
  if (typeof data.created === "string") meta.created = data.created;
  return meta;
};

const enforceStrictRequirements = (meta: PromptMeta): void => {
  const required = ["title", "description", "version"] as const;
  const missing = required.filter((key) => {
    const value = meta[key];
    return value == null;
  });
  if (missing.length > 0) {
    throw new InvalidMetadataError(
      `Missing required metadata fields: ${missing.join(", ")}. STRICT mode requires 'title', 'description', and 'version' fields. Use meta=MetadataMode.ALLOW for less strict validation.`,
    );
  }
  const empty = required.filter((key) => {
    const value = meta[key];
    return value != null && String(value).trim() === "";
  });
  if (empty.length > 0) {
    throw new InvalidMetadataError(
      `Empty required metadata fields: ${empty.join(", ")}. STRICT mode requires non-empty 'title', 'description', and 'version' fields. Use meta=MetadataMode.ALLOW for less strict validation.`,
    );
  }
};

/**
 * Parse a prompt from a string with optional TOML front-matter.
 *
 * @param content - The raw content to parse (may include TOML front-matter)
 * @param sourcePath - The source path for metadata and error messages
 * @param metadataMode - How to handle metadata (IGNORE, ALLOW, or STRICT)
 * @returns A Prompt instance
 */
export const parseString = (
  content: string,
  sourcePath: string,
  metadataMode: MetadataMode,
): Prompt => {
  if (metadataMode === MetadataMode.IGNORE) {
    if (
      warnOnIgnoredMetadata() &&
      content.startsWith(DELIM) &&
      content.indexOf(DELIM, DELIM.length) !== -1
    ) {
      console.warn(
        "Metadata detected but ignored; use setMetadata('allow') or skipMetadata({ skipWarning: true }) to silence",
      );
    }
    const title = basename(sourcePath, extname(sourcePath));
    return new Prompt({
      path: sourcePath,
      meta: { title },
      prompt: new PromptString(dedent(content)),
    });
  }

  let header: string | null;
  let body: string;
  try {
    ({ header, body } = splitFrontMatter(content));
  } catch (error) {
    if (content.startsWith(DELIM) && error instanceof MalformedHeaderError) {
      throw new InvalidMetadataError(
        `${error.message}. If this content has no metadata and starts with '---', use meta=MetadataMode.IGNORE to skip metadata parsing.`,
      );
    }
    throw error;
  }

  let meta: PromptMeta | null = null;

  if (header !== null) {
    try {
      const data = parseToml(header);
      meta = ensurePromptMeta(data);
      if (metadataMode === MetadataMode.STRICT) {
        enforceStrictRequirements(meta);
      }
    } catch (error) {
      if (error instanceof InvalidMetadataError) {
        throw error;
      }
      if (error instanceof MalformedHeaderError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      if (/TOML/i.test(message)) {
        throw new InvalidMetadataError(
          `Invalid TOML in front matter: ${message}. Use meta=MetadataMode.IGNORE to skip metadata parsing.`,
        );
      }
      throw new InvalidMetadataError(`Invalid metadata: ${message}`);
    }
  } else {
    if (metadataMode === MetadataMode.STRICT) {
      throw new MissingMetadataError(
        `No metadata found in ${sourcePath}. STRICT mode requires metadata with title, description, and version fields. Use meta=MetadataMode.ALLOW or meta=MetadataMode.IGNORE for less strict validation.`,
      );
    }
    meta = {};
  }

  if (!meta.title) {
    meta.title = basename(sourcePath, extname(sourcePath));
  }

  return new Prompt({
    path: sourcePath,
    meta,
    prompt: new PromptString(dedent(body)),
  });
};

export const parseFile = async (path: string, metadataMode: MetadataMode): Promise<Prompt> => {
  let raw: string;
  try {
    raw = await readFile(path, { encoding: "utf8" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new TextPromptsError(`Cannot read ${path}: ${message}`);
  }

  return parseString(raw, path, metadataMode);
};
