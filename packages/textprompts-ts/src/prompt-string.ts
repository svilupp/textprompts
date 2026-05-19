/**
 * Internal `PromptString` wrapper (v2 — SPEC §6, Phase 4).
 *
 * NOT exported from `src/index.ts` or `src/core.ts`. The only supported public
 * paths to construct a prompt are `Prompt.fromString` and `loadPrompt`.
 *
 * Responsibilities:
 *   1. Hold the original source string (for `toString` / `valueOf`).
 *   2. Hold the parsed AST so repeated `format()` calls don't re-parse.
 *   3. Run format-time validation (variables, flags, types) and render.
 *
 * Empty body after preprocessing raises a `ParseError` (SPEC §2.5).
 */
import type { Node } from "./ast";
import { parseBody } from "./body-parser";
import { ParseError } from "./errors";
import { validateInputs } from "./format-validation";
import { tokenize } from "./lexer";
import type { PromptMeta } from "./models";
import { type FormatInputs, render } from "./renderer";
import { prepareSource } from "./source";

const EMPTY_META: PromptMeta = { extras: {}, flags: {}, variables: {} };

export class PromptString {
  readonly source: string;
  readonly meta: PromptMeta;
  private readonly ast: Node[];

  constructor(source: string, meta?: PromptMeta, sourcePath?: string) {
    const prepared = prepareSource(source, { dedent: true });
    if (prepared.trim().length === 0) {
      throw new ParseError("prompt file is empty", {
        code: "E_EMPTY_PROMPT",
        ...(sourcePath !== undefined ? { path: sourcePath } : {}),
      });
    }
    this.source = prepared;
    this.meta = meta ?? EMPTY_META;
    this.ast = parseBody(tokenize(prepared, sourcePath), sourcePath);
  }

  /**
   * Format the prompt with the given inputs. `flags` is a reserved input key:
   * any other top-level keys are treated as variables.
   */
  format(
    inputs: { flags?: Record<string, boolean | string> } & Record<string, unknown> = {},
  ): string {
    // Preserve the distinction between "flags key entirely missing" and
    // "flags: {}". `validateInputs` needs the `undefined` signal to fire
    // E_MISSING_FLAGS_OBJECT (SPEC §5.6); a present-but-empty object falls
    // through to per-flag E_MISSING_FLAG errors.
    const flagsProvided = Object.hasOwn(inputs, "flags");
    const { flags, ...variables } = inputs;
    const fi: FormatInputs = {
      variables: variables as Record<string, unknown>,
      // Keep the raw value (may be undefined, a plain object, or any other
      // mistaken type) so validation can surface E_MISSING_FLAGS_OBJECT vs
      // E_BAD_FLAGS_TYPE distinctly.
      flags: (flagsProvided ? flags : undefined) as unknown as Record<string, boolean | string>,
    };
    validateInputs(this.meta, this.ast, fi);
    // After validation: if flags was omitted (and prompt uses no flags),
    // default to an empty object so the renderer can index into it safely.
    if (fi.flags === undefined || fi.flags === null) {
      fi.flags = {} as Record<string, boolean | string>;
    }
    return render(this.ast, fi);
  }

  toString(): string {
    return this.source;
  }

  valueOf(): string {
    return this.source;
  }
}
