import { resolve } from "path";

import { MetadataMode } from "./config";
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
    if (!value.strip()) {
      throw new Error("Prompt body is empty");
    }
    this.prompt = value;
  }

  static async fromPath(path: string, options?: { meta?: MetadataMode | string | null }) {
    const { loadPrompt } = await import("./loaders");
    return loadPrompt(path, { meta: options?.meta });
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

  format(options?: Parameters<PromptString["format"]>[0]): string;
  format(args: unknown[], kwargs?: Record<string, unknown>, options?: Parameters<PromptString["format"]>[2]): string;
  format(arg0?: unknown, arg1?: Record<string, unknown>, arg2?: unknown): string {
    // @ts-expect-error passthrough
    return this.prompt.format(arg0 as never, arg1 as never, arg2 as never);
  }

  get length(): number {
    return this.prompt.length;
  }

  slice(start?: number, end?: number): string {
    return this.prompt.slice(start, end);
  }
}
