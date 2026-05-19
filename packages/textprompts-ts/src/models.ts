import type { MetadataMode } from "./config";
import type { FlagDecl, VarDecl } from "./frontmatter-schema";
import { PromptString } from "./prompt-string";

export type FrontmatterFormat = "auto" | "toml" | "yaml";

/**
 * Loader/parser options accepted everywhere a prompt enters the system:
 * `loadPrompt`, `loadSection`, `Prompt.fromPath`, `Prompt.fromString`,
 * `parseFile`, `parseString`.
 */
export interface PromptLoadOptions {
  /** Metadata mode (SPEC §4.6): "allow" (default), "strict", or "ignore". */
  metadata?: MetadataMode | string | null;
  /** Frontmatter format (SPEC §4.1): "auto" (default), "toml", or "yaml". */
  frontmatterFormat?: FrontmatterFormat;
}

export interface PromptMeta {
  title?: string | null;
  version?: string | null;
  author?: string | null;
  created?: string | null;
  description?: string | null;
  /**
   * Additional frontmatter fields not part of the standard set. Preserves
   * original types (booleans, numbers, arrays, nested objects). Always
   * present (empty object when no custom fields are declared).
   */
  extras: Record<string, unknown>;
  /**
   * Validated flag declarations from `[flags.*]` (TOML) / `flags:` (YAML).
   * Always present (empty object when no flags declared).
   */
  flags: Record<string, FlagDecl>;
  /**
   * Validated variable declarations from `[variables.*]` (TOML) /
   * `variables:` (YAML). Always present (empty object when none declared).
   */
  variables: Record<string, VarDecl>;
}

/** Permissive input shape accepted by the `Prompt` constructor. */
export type PromptMetaInput = Partial<PromptMeta>;

export interface PromptInit {
  path: string;
  meta: PromptMetaInput | null;
  prompt: string | PromptString;
}

const normalizeMeta = (input: PromptMetaInput | null): PromptMeta => {
  if (input === null) {
    return { extras: {}, flags: {}, variables: {} };
  }
  return {
    ...input,
    extras: input.extras ?? {},
    flags: input.flags ?? {},
    variables: input.variables ?? {},
  };
};

export class Prompt {
  readonly path: string;
  readonly meta: PromptMeta;
  readonly prompt: PromptString;

  constructor(init: PromptInit) {
    this.path = init.path;
    this.meta = normalizeMeta(init.meta);
    this.prompt =
      init.prompt instanceof PromptString
        ? init.prompt
        : new PromptString(init.prompt, this.meta, init.path);
  }

  static async fromPath(path: string, options?: PromptLoadOptions): Promise<Prompt> {
    // Dynamic import kept opaque so bundlers don't inline node:fs into core.
    const mod = "./loaders";
    const { loadPrompt } = await import(/* @vite-ignore */ mod);
    return loadPrompt(path, options ?? {});
  }

  static fromString(content: string, options?: PromptLoadOptions & { path?: string }): Prompt {
    // require() keeps core safe from node:fs because parser-core has no fs deps.
    const { parseString } = require("./parser-core");
    const sourcePath = options?.path ?? "<string>";
    const { path: _ignored, ...rest } = options ?? {};
    return parseString(content, sourcePath, rest);
  }

  toString(): string {
    return this.prompt.toString();
  }

  valueOf(): string {
    return this.prompt.valueOf();
  }

  /**
   * Format the prompt with the given inputs. `flags` is a reserved key; every
   * other top-level field is a variable substitution.
   *
   * @example
   * ```ts
   * prompt.format({ role: "expert", flags: { tier: "premium" } });
   * ```
   */
  format(
    inputs: { flags?: Record<string, boolean | string> } & Record<string, unknown> = {},
  ): string {
    return this.prompt.format(inputs);
  }
}
