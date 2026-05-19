import { lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { FileMissingError, TextPromptsError } from "./errors";
import type { Prompt, PromptLoadOptions } from "./models";
import { parseFile, parseString } from "./parser";
import { getSectionText } from "./sections";

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
 * @param options - Optional loader options (`metadata`, `frontmatterFormat`)
 */
export const loadSection = async (
  path: string,
  anchorId: string,
  options: PromptLoadOptions = {},
): Promise<Prompt> => {
  path = resolve(path);
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

  return parseString(sectionText, path, options);
};

export const loadPrompt = async (
  path: string,
  options: PromptLoadOptions = {},
): Promise<Prompt> => {
  path = resolve(path);
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

  return parseFile(path, options);
};
