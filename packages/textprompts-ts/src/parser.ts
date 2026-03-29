import { readFile } from "node:fs/promises";

import type { MetadataMode } from "./config";
import { TextPromptsError } from "./errors";
import type { Prompt } from "./models";
import { parseString } from "./parser-core";

// Re-export so existing `import { parseString } from "./parser"` keeps working
export { parseString } from "./parser-core";

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
