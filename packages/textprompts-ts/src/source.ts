/**
 * Source preprocessing for prompt bodies.
 *
 * Single shared path that every body reaches before lexing/parsing:
 *
 * 1. Strip a leading UTF-8 BOM (`﻿`) if present.
 * 2. Normalize line endings: `\r\n` and lone `\r` both become `\n`.
 * 3. Optionally apply common-leading-whitespace dedent. Defaults to enabled —
 *    safe no-op for file-loaded prompts where line 1 has zero indent, useful
 *    for `Prompt.fromString()` callers passing indented template literals.
 *
 * This helper exists so the lexer, parser, and any future renderer never have
 * to re-do these steps. SPEC §2.5 / §11.1.
 */

const BOM = "﻿";

const stripBom = (input: string): string =>
  input.length > 0 && input.charCodeAt(0) === BOM.charCodeAt(0) ? input.slice(1) : input;

const normalizeNewlines = (input: string): string => input.replace(/\r\n?/g, "\n");

/**
 * Compute the minimum leading-whitespace shared by every non-blank line.
 * Tabs and spaces are both counted as one column each (SPEC §2.5: no
 * tab-vs-space significance for the dedent).
 */
const commonLeadingWhitespace = (lines: string[]): number => {
  let min = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    if (line.trim() === "") continue;
    const match = line.match(/^[ \t]*/);
    const indent = match ? match[0].length : 0;
    if (indent < min) min = indent;
    if (min === 0) return 0;
  }
  return Number.isFinite(min) ? min : 0;
};

export const dedent = (input: string): string => {
  const lines = input.split("\n");
  const min = commonLeadingWhitespace(lines);
  if (min === 0) return input;
  return lines.map((line) => (line.trim() === "" ? "" : line.slice(min))).join("\n");
};

export interface PrepareSourceOptions {
  /** Apply common-leading-whitespace dedent. Default `true`. */
  dedent?: boolean;
}

/**
 * Apply BOM strip + CRLF normalize (+ optional dedent) exactly once.
 *
 * Callers downstream must not redo any of these steps.
 */
export const prepareSource = (content: string, options: PrepareSourceOptions = {}): string => {
  const shouldDedent = options.dedent ?? true;
  let out = stripBom(content);
  out = normalizeNewlines(out);
  if (shouldDedent) out = dedent(out);
  return out;
};
