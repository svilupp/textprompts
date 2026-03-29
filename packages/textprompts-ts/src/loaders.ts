import { lstat, readFile } from "node:fs/promises";

import { type MetadataMode, resolveMetadataMode } from "./config";
import { FileMissingError, TextPromptsError } from "./errors";
import type { Prompt } from "./models";
import { parseFile, parseString } from "./parser";
import { getSectionText } from "./sections";

export interface LoadPromptOptions {
  meta?: MetadataMode | string | null;
}

/**
 * Load the body text of a specific XML section from a file as a Prompt.
 *
 * Useful for storing multiple prompt versions in one file using XML tags:
 * ```
 * <system>You are a helpful assistant.</system>
 * <system id="v2">You are an expert assistant.</system>
 * ```
 *
 * @param path - Path to the prompt file
 * @param anchorId - The XML tag name or `id` attribute value to extract
 * @param options - Optional metadata mode configuration
 */
export const loadSection = async (
  path: string,
  anchorId: string,
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
    throw new FileMissingError(path);
  }

  const content = await readFile(path, "utf8");
  const sectionText = getSectionText(content, anchorId);
  if (sectionText === null) {
    throw new TextPromptsError(`Section '${anchorId}' not found in ${path}`);
  }

  const mode = resolveMetadataMode(options.meta ?? null);
  return parseString(sectionText, path, mode);
};

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
