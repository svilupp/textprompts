import { lstat } from "fs/promises";
import fg from "fast-glob";

import { type MetadataMode, resolveMetadataMode } from "./config";
import { FileMissingError, TextPromptsError } from "./errors";
import type { Prompt } from "./models";
import { parseFile } from "./parser";

export interface LoadPromptOptions {
  meta?: MetadataMode | string | null;
}

export const loadPrompt = async (
  path: string,
  options: LoadPromptOptions = {},
): Promise<Prompt> => {
  try {
    const stats = await lstat(path);
    if (!(stats.isFile() || stats.isSymbolicLink())) {
      throw new FileMissingError(path);
    }
  } catch (error) {
    if (error instanceof FileMissingError) {
      throw error;
    }
    // Any other error (e.g., ENOENT) means file is missing
    throw new FileMissingError(path);
  }

  const mode = resolveMetadataMode(options.meta ?? null);
  return parseFile(path, mode);
};

export interface LoadPromptsOptions extends LoadPromptOptions {
  recursive?: boolean;
  glob?: string;
  maxFiles?: number | null;
}

const extractPathsAndOptions = (
  first: string | string[] | undefined,
  rest: Array<string | LoadPromptsOptions>,
): { paths: string[]; options: LoadPromptsOptions } => {
  if (!first) {
    return { paths: [], options: {} };
  }

  if (Array.isArray(first)) {
    const maybeOptions = rest.at(-1);
    const options =
      maybeOptions && typeof maybeOptions === "object" && !Array.isArray(maybeOptions)
        ? (maybeOptions as LoadPromptsOptions)
        : {};
    const paths = [...first];
    // Note: We don't mutate rest array - caller should handle this
    return { paths, options };
  }

  const args = [first, ...rest];
  let options: LoadPromptsOptions = {};
  const last = args[args.length - 1];
  if (typeof last === "object" && last !== null && !Array.isArray(last)) {
    options = last as LoadPromptsOptions;
    args.pop();
  }
  const paths = args.filter((value): value is string => typeof value === "string");
  return { paths, options };
};

export async function loadPrompts(
  first: string | string[],
  ...rest: Array<string | LoadPromptsOptions>
): Promise<Prompt[]> {
  const { paths, options } = Array.isArray(first)
    ? { paths: first, options: (rest[0] as LoadPromptsOptions | undefined) ?? {} }
    : extractPathsAndOptions(first, rest);

  if (paths.length === 0) {
    return [];
  }

  const { recursive = false, glob = "*.txt", meta = null, maxFiles = 1000 } = options;
  const resolvedMode = resolveMetadataMode(meta ?? null);

  const prompts: Prompt[] = [];
  let processed = 0;

  for (const entry of paths) {
    let stats: Awaited<ReturnType<typeof lstat>>;
    try {
      stats = await lstat(entry);
    } catch {
      throw new FileMissingError(entry);
    }

    if (stats.isDirectory()) {
      const matches = await fg(glob, {
        cwd: entry,
        absolute: true,
        onlyFiles: true,
        dot: false,
        followSymbolicLinks: true,
        unique: true,
        deep: recursive ? Infinity : 1,
      });
      for (const file of matches) {
        if (maxFiles !== null && processed >= maxFiles) {
          throw new TextPromptsError(`Exceeded maxFiles limit of ${maxFiles}`);
        }
        prompts.push(await loadPrompt(file, { meta: resolvedMode }));
        processed += 1;
      }
    } else {
      if (maxFiles !== null && processed >= maxFiles) {
        throw new TextPromptsError(`Exceeded maxFiles limit of ${maxFiles}`);
      }
      prompts.push(await loadPrompt(entry, { meta: resolvedMode }));
      processed += 1;
    }
  }

  return prompts;
}
