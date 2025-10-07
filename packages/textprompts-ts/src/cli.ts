#!/usr/bin/env node
import { argv, exit, stderr, stdout } from "process";

import { loadPrompt } from "./loaders";
import { TextPromptsError } from "./errors";

const parseArgs = () => {
  const args = argv.slice(2);
  let json = false;
  const files: string[] = [];
  for (const arg of args) {
    if (arg === "--json") {
      json = true;
    } else {
      files.push(arg);
    }
  }
  if (files.length !== 1) {
    stderr.write("Usage: textprompts-ts [--json] <file>\n");
    exit(1);
  }
  return { file: files[0], json };
};

(async () => {
  const { file, json } = parseArgs();
  try {
    const prompt = await loadPrompt(file, { meta: "ignore" });
    if (json) {
      stdout.write(`${JSON.stringify(prompt.meta ?? {}, null, 2)}\n`);
    } else {
      stdout.write(`${prompt.toString()}\n`);
    }
  } catch (error) {
    if (error instanceof TextPromptsError || error instanceof Error) {
      stderr.write(`Error: ${error.message}\n`);
    } else {
      stderr.write(`Unknown error: ${String(error)}\n`);
    }
    exit(1);
  }
})();
