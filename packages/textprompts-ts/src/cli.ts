#!/usr/bin/env node
import { argv, exit, stderr, stdout } from "node:process";

import { TextPromptsError } from "./errors";
import { loadPrompt } from "./loaders";
import type { FrontmatterFormat, PromptLoadOptions } from "./models";

const USAGE = `Usage: textprompts [--json] [--metadata allow|strict|ignore] [--frontmatter-format auto|toml|yaml] <file>`;

const parseArgs = () => {
  const args = argv.slice(2);
  let json = false;
  let metadata: PromptLoadOptions["metadata"];
  let frontmatterFormat: FrontmatterFormat | undefined;
  const files: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] as string;
    if (arg === "--json") {
      json = true;
    } else if (arg === "--metadata") {
      const next = args[i + 1];
      if (next === undefined) {
        stderr.write(`Missing value for --metadata\n${USAGE}\n`);
        exit(1);
      }
      metadata = next as PromptLoadOptions["metadata"];
      i += 1;
    } else if (arg.startsWith("--metadata=")) {
      metadata = arg.slice("--metadata=".length) as PromptLoadOptions["metadata"];
    } else if (arg === "--frontmatter-format") {
      const next = args[i + 1];
      if (next === undefined) {
        stderr.write(`Missing value for --frontmatter-format\n${USAGE}\n`);
        exit(1);
      }
      frontmatterFormat = next as FrontmatterFormat;
      i += 1;
    } else if (arg.startsWith("--frontmatter-format=")) {
      frontmatterFormat = arg.slice("--frontmatter-format=".length) as FrontmatterFormat;
    } else {
      files.push(arg);
    }
  }
  if (files.length !== 1) {
    stderr.write(`${USAGE}\n`);
    exit(1);
  }
  return { file: files[0] as string, json, metadata, frontmatterFormat };
};

(async () => {
  const { file, json, metadata, frontmatterFormat } = parseArgs();
  try {
    const opts: PromptLoadOptions = { metadata: metadata ?? "ignore" };
    if (frontmatterFormat !== undefined) opts.frontmatterFormat = frontmatterFormat;
    const prompt = await loadPrompt(file, opts);
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
