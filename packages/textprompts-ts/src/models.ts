import { resolve } from "path";

import type { MetadataMode } from "./config";
import { PromptString } from "./prompt-string";

export interface PromptMeta {
  title?: string | null;
  version?: string | null;
  author?: string | null;
  created?: string | null;
  description?: string | null;
}

export interface PromptInit {
  path: string;
  meta: PromptMeta | null;
  prompt: string | PromptString;
}

export class Prompt {
  readonly path: string;
  readonly meta: PromptMeta | null;
  readonly prompt: PromptString;

  constructor(init: PromptInit) {
    this.path = resolve(init.path);
    this.meta = init.meta;
    const value = init.prompt instanceof PromptString ? init.prompt : new PromptString(init.prompt);
    if (value.strip().length === 0) {
      throw new Error("Prompt body is empty");
    }
    this.prompt = value;
  }

  static async fromPath(path: string, options?: { meta?: MetadataMode | string | null }) {
    const { loadPrompt } = await import("./loaders");
    return loadPrompt(path, options?.meta !== undefined ? { meta: options.meta } : {});
  }

  toString(): string {
    return this.prompt.toString();
  }

  valueOf(): string {
    return this.prompt.valueOf();
  }

  strip(): string {
    return this.prompt.strip();
  }

  format(kwargs: Record<string, unknown>, options?: Parameters<PromptString["format"]>[1]): string;
  format(
    args: unknown[],
    kwargs?: Record<string, unknown>,
    options?: Parameters<PromptString["format"]>[2],
  ): string;
  format(
    arg0?: Record<string, unknown> | unknown[],
    arg1?: Record<string, unknown> | Parameters<PromptString["format"]>[1],
    arg2?: Parameters<PromptString["format"]>[2],
  ): string {
    return this.prompt.format(arg0 as any, arg1 as any, arg2);
  }

  get length(): number {
    return this.prompt.length;
  }

  slice(start?: number, end?: number): string {
    return this.prompt.slice(start, end);
  }
}
