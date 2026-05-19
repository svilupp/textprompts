/**
 * Recursive-descent body parser. Tokens -> AST.
 *
 * Enforces SPEC §3.1 (structural rules), §3.2 (inline vs block form,
 * mixed-form forbidden), and §3.5 (nesting). Does not render — that is
 * Phase 3.
 *
 * Form rules (§3.2):
 *  - Inline: the opener has non-whitespace content on its line either before
 *    or after it (or both). Every related keyword (`{else}`, `{case}`,
 *    closing `{end}`) must be on the same line as the opener.
 *  - Block: opener is alone on its line (only whitespace before, only
 *    whitespace + newline after). Every related keyword must also be alone
 *    on its line. For block form the parser strips the keyword lines from
 *    each branch body so the renderer doesn't need to re-parse leading
 *    trivia.
 *  - Mixed forms are a parse error.
 */

import type { IfNode, Node, SwitchCase, SwitchNode } from "./ast";
import { ParseError, type ParseErrorOptions } from "./errors";
import type { Token, TokenKind } from "./lexer";

interface ParserState {
  tokens: Token[];
  i: number;
  readonly path?: string;
}

const makeError = (
  state: ParserState,
  message: string,
  code: string,
  line?: number,
  column?: number,
): ParseError => {
  const opts: ParseErrorOptions = { code };
  if (state.path !== undefined) opts.path = state.path;
  if (line !== undefined) opts.line = line;
  if (column !== undefined) opts.column = column;
  return new ParseError(message, opts);
};

/**
 * Determine whether the keyword token at `state.tokens[index]` is "alone on
 * its line" — only whitespace between the previous newline (or stream start)
 * and the token, and only whitespace + newline (or stream end) after the
 * token until the next newline.
 *
 * Used both for form detection on openers and for verifying that block-form
 * separators / closers comply with §3.2.
 */
const isKeywordAloneOnLine = (
  tokens: ReadonlyArray<Token>,
  index: number,
): { aloneBefore: boolean; aloneAfter: boolean; alone: boolean } => {
  // Look at preceding Text token, if any.
  let aloneBefore = true;
  if (index > 0) {
    const prev = tokens[index - 1];
    if (prev !== undefined && prev.kind === "Text") {
      // Find content after the last newline in prev.value.
      const v = prev.value;
      const lastNl = v.lastIndexOf("\n");
      const tail = lastNl === -1 ? v : v.slice(lastNl + 1);
      if (tail.length > 0 && tail.trim().length > 0) aloneBefore = false;
    } else if (prev !== undefined) {
      // Previous token was another tag on the same line.
      aloneBefore = false;
    }
  }

  let aloneAfter = true;
  const next = tokens[index + 1];
  if (next !== undefined) {
    if (next.kind === "Text") {
      const v = next.value;
      const firstNl = v.indexOf("\n");
      const head = firstNl === -1 ? v : v.slice(0, firstNl);
      if (head.trim().length > 0) aloneAfter = false;
    } else {
      // Another tag follows with no text between -> not alone.
      aloneAfter = false;
    }
  }

  return { aloneBefore, aloneAfter, alone: aloneBefore && aloneAfter };
};

/**
 * For block form: rewrite the Text token to the left of `index` to drop the
 * trailing whitespace on the opener/separator/closer's line. Mutates a copy
 * — returns the new text value, or null when the previous token is not a
 * Text token or has no trailing-newline whitespace to drop.
 */
const dropTrailingWhitespaceLine = (text: string): string => {
  // text ends right before the keyword tag. We need to remove the trailing
  // whitespace following the last newline, if any (e.g. "abc\n  " -> "abc\n").
  // If there's no newline, the keyword is on the same line as prior content
  // — but we only call this after confirming aloneBefore, so the entire tail
  // is whitespace and removing it is correct.
  const lastNl = text.lastIndexOf("\n");
  if (lastNl === -1) return "";
  return text.slice(0, lastNl + 1);
};

/**
 * For block form: rewrite the Text token to the right of the keyword to drop
 * leading whitespace + the keyword's trailing newline. Removes everything
 * up to and including the first newline.
 */
const dropLeadingTrailingNewline = (text: string): string => {
  const firstNl = text.indexOf("\n");
  if (firstNl === -1) return "";
  return text.slice(firstNl + 1);
};

/**
 * Parse a sequence of body nodes until a "stop" token kind is reached, or
 * until EOF. Returns the nodes; the caller decides what to do with the stop
 * token.
 *
 * `form` controls how block-form keyword line trimming is applied to text
 * nodes that abut a kept-by-caller keyword. The caller is responsible for
 * passing already-trimmed boundary text in via `seedText`.
 */
// We use a different strategy: parseBlock walks tokens, builds branches as
// arrays of {Text | Variable | If | Switch} nodes, and applies form-aware
// trimming around keyword tokens as we encounter them.

/**
 * Parse the body until one of the stop kinds is encountered (or EOF). On
 * stop, the stop token is NOT consumed. Used for both top-level body and
 * branch bodies. `form` is "block" or "inline"; inline branches must not
 * contain newlines in their text content and may not nest block-form
 * constructs. `form === null` means "top-level body" — both forms allowed
 * per-construct.
 *
 * `precedingTextOverride` lets the caller seed the first text node (used to
 * inject the trimmed remainder of a text token that straddled a keyword
 * line in block form).
 */
const parseUntil = (
  state: ParserState,
  stops: ReadonlySet<TokenKind>,
  form: "inline" | "block" | null,
  precedingTextOverride: string | null,
): { nodes: Node[]; stoppedAt: Token | null } => {
  const nodes: Node[] = [];
  let pendingText = precedingTextOverride;

  const pushPendingText = (): void => {
    if (pendingText !== null && pendingText.length > 0) {
      nodes.push({ kind: "text", value: pendingText });
    }
    pendingText = null;
  };

  while (state.i < state.tokens.length) {
    const tok = state.tokens[state.i];
    if (tok === undefined) break;

    if (stops.has(tok.kind)) {
      pushPendingText();
      return { nodes, stoppedAt: tok };
    }

    if (tok.kind === "Text") {
      // Merge into pendingText (may already contain block-trim remainder).
      pendingText = (pendingText ?? "") + tok.value;
      state.i += 1;
      continue;
    }

    if (tok.kind === "Variable") {
      pushPendingText();
      nodes.push({ kind: "variable", name: tok.value });
      state.i += 1;
      continue;
    }

    // Control token that isn't a stop: must be a new {if}/{switch}, or an
    // unmatched closer/separator (error surfaced by caller below).
    if (tok.kind === "OpenIf" || tok.kind === "OpenIfNot" || tok.kind === "OpenSwitch") {
      pushPendingText();
      const inner = parseBlockConstruct(state, form);
      // parseBlockConstruct may have trimmed the preceding text — but we
      // already flushed it. For block form, we additionally need to remove
      // any trailing whitespace on the opener's line from the just-emitted
      // text node, and the post-closer leading newline. This is handled by
      // parseBlockConstruct returning a `precedingTrim`/`trailingText` pair.
      if (inner.precedingTrim && nodes.length > 0) {
        const last = nodes[nodes.length - 1];
        if (last !== undefined && last.kind === "text") {
          const trimmed = dropTrailingWhitespaceLine(last.value);
          if (trimmed.length === 0) {
            nodes.pop();
          } else {
            nodes[nodes.length - 1] = { kind: "text", value: trimmed };
          }
        }
      }
      nodes.push(inner.node);
      // Seed the next text with trailingText (for block form: post-keyword
      // newline-stripped remainder).
      pendingText = inner.trailingText;
      continue;
    }

    // Stray Else / End / Case at this level.
    if (tok.kind === "End") {
      throw makeError(
        state,
        "Unexpected '{end}' with no matching '{if}' or '{switch}'",
        "E_EXTRA_END",
        tok.line,
        tok.column,
      );
    }
    if (tok.kind === "Else") {
      throw makeError(
        state,
        "Unexpected '{else}' outside any '{if}' or '{switch}'",
        "E_ELSE_BEFORE_CASE",
        tok.line,
        tok.column,
      );
    }
    if (tok.kind === "Case") {
      throw makeError(
        state,
        `Unexpected '{case ${tok.value}}' outside any '{switch}'`,
        "E_BAD_TAG",
        tok.line,
        tok.column,
      );
    }
    // Unreachable — but keep TS happy.
    throw new Error(`unreachable token kind: ${tok.kind as string}`);
  }

  pushPendingText();
  return { nodes, stoppedAt: null };
};

interface BlockParseResult {
  node: IfNode | SwitchNode;
  /**
   * For block form: signals the caller to strip trailing whitespace on the
   * opener's line from the text that precedes this construct.
   */
  precedingTrim: boolean;
  /**
   * Initial text to seed the next sibling text node with. For block form:
   * the post-`{end}` remainder with the trailing newline stripped. For
   * inline form: the next Text token is consumed unchanged.
   */
  trailingText: string | null;
}

/**
 * Parse a single `{if}` or `{switch}` construct starting at `state.tokens[state.i]`
 * (which is the opener token). Consumes through the matching `{end}`.
 *
 * `parentForm` is the form of the surrounding construct, or null at top
 * level. We do not propagate any constraint from parentForm — each construct
 * judges its own form per §3.2. The argument exists so we can later add
 * sanity diagnostics if needed.
 */
const parseBlockConstruct = (
  state: ParserState,
  _parentForm: "inline" | "block" | null,
): BlockParseResult => {
  const opener = state.tokens[state.i];
  if (opener === undefined) {
    throw new ParseError("parseBlockConstruct called past EOF", { code: "E_UNCLOSED_IF" });
  }

  // Form detection per §3.2 — opener alone on its line?
  const openerSurround = isKeywordAloneOnLine(state.tokens, state.i);
  const form: "inline" | "block" = openerSurround.alone ? "block" : "inline";

  if (opener.kind === "OpenSwitch") {
    return parseSwitch(state, opener, form);
  }
  return parseIf(state, opener, form);
};

/**
 * Verify a keyword token's line-form matches the construct's chosen form.
 * Throws `E_MIXED_FORM` when block form is established and a related
 * keyword is not alone on its line (or vice versa).
 */
const checkFormAt = (
  state: ParserState,
  tok: Token,
  index: number,
  form: "inline" | "block",
  context: string,
): void => {
  const surround = isKeywordAloneOnLine(state.tokens, index);
  if (form === "block" && !surround.alone) {
    throw makeError(
      state,
      `Mixed inline/block form in ${context}: block-form '${describeToken(tok)}' must be alone on its line`,
      "E_MIXED_FORM",
      tok.line,
      tok.column,
    );
  }
  if (form === "inline") {
    // Inline: every related keyword must be on the same line as the opener.
    // If the preceding text token contains a newline, the keyword is on a
    // later line.
    if (index > 0) {
      const prev = state.tokens[index - 1];
      if (prev !== undefined && prev.kind === "Text" && prev.value.includes("\n")) {
        throw makeError(
          state,
          `Mixed inline/block form in ${context}: inline-form '${describeToken(tok)}' must be on the same line as the opener`,
          "E_MIXED_FORM",
          tok.line,
          tok.column,
        );
      }
    }
  }
};

const describeToken = (tok: Token): string => {
  switch (tok.kind) {
    case "OpenIf":
      return `{if ${tok.value}}`;
    case "OpenIfNot":
      return `{if !${tok.value}}`;
    case "OpenSwitch":
      return `{switch ${tok.value}}`;
    case "Case":
      return `{case ${tok.value}}`;
    case "Else":
      return "{else}";
    case "End":
      return "{end}";
    case "Variable":
      return `{${tok.value}}`;
    case "Text":
      return "<text>";
  }
};

const parseIf = (state: ParserState, opener: Token, form: "inline" | "block"): BlockParseResult => {
  const negated = opener.kind === "OpenIfNot";
  // Consume opener.
  state.i += 1;

  // Block form: strip the trailing whitespace on opener's line from any
  // preceding text (the caller handles this for top-level via precedingTrim).
  // And from the next text token: strip leading text-up-to-and-including-\n.
  let seedText: string | null = null;
  if (form === "block") {
    const next = state.tokens[state.i];
    if (next !== undefined && next.kind === "Text") {
      const trimmed = dropLeadingTrailingNewline(next.value);
      // Replace the next text token with the trimmed value.
      state.tokens = withReplaced(state.tokens, state.i, { ...next, value: trimmed });
      seedText = null; // already in token stream
    }
  }

  const stops: ReadonlySet<TokenKind> = new Set<TokenKind>(["Else", "End"]);
  const branchResult = parseUntil(state, stops, form, seedText);
  const stopTok = branchResult.stoppedAt;
  if (stopTok === null) {
    throw makeError(
      state,
      `Unclosed '{if ${negated ? "!" : ""}${opener.value}}': missing '{end}'`,
      "E_UNCLOSED_IF",
      opener.line,
      opener.column,
    );
  }

  checkFormAt(state, stopTok, state.i, form, `{if ${negated ? "!" : ""}${opener.value}}`);

  // Block-form: trim trailing whitespace on stopTok's line from the last
  // text node of this branch.
  let body = branchResult.nodes;
  if (form === "block") {
    body = trimLastTextTrailingWhitespace(body);
  }

  let elseBody: Node[] | undefined;
  if (stopTok.kind === "Else") {
    state.i += 1;
    if (form === "block") {
      const next = state.tokens[state.i];
      if (next !== undefined && next.kind === "Text") {
        state.tokens = withReplaced(state.tokens, state.i, {
          ...next,
          value: dropLeadingTrailingNewline(next.value),
        });
      }
    }
    const elseStops: ReadonlySet<TokenKind> = new Set<TokenKind>(["End"]);
    const elseResult = parseUntil(state, elseStops, form, null);
    if (elseResult.stoppedAt === null) {
      throw makeError(
        state,
        `Unclosed '{if ${negated ? "!" : ""}${opener.value}}': missing '{end}' after '{else}'`,
        "E_UNCLOSED_IF",
        opener.line,
        opener.column,
      );
    }
    // Disallow second {else}: parseUntil only stops on End for elseStops, so
    // a stray second {else} would surface as an error inside parseUntil.
    checkFormAt(
      state,
      elseResult.stoppedAt,
      state.i,
      form,
      `{if ${negated ? "!" : ""}${opener.value}}`,
    );
    elseBody =
      form === "block" ? trimLastTextTrailingWhitespace(elseResult.nodes) : elseResult.nodes;
  }

  // Consume the End.
  const endTok = state.tokens[state.i];
  if (endTok === undefined || endTok.kind !== "End") {
    throw makeError(
      state,
      `Unclosed '{if ${negated ? "!" : ""}${opener.value}}': missing '{end}'`,
      "E_UNCLOSED_IF",
      opener.line,
      opener.column,
    );
  }
  state.i += 1;

  // Compute trailingText for block form: strip leading-up-to-and-including-\n
  // from the next text token (which is now at state.i, if any).
  let trailingText: string | null = null;
  if (form === "block") {
    const after = state.tokens[state.i];
    if (after !== undefined && after.kind === "Text") {
      trailingText = dropLeadingTrailingNewline(after.value);
      // Consume the after-text token because we've absorbed its trimmed form
      // into trailingText (the caller will use it as pendingText seed).
      state.i += 1;
    }
  }

  const node: IfNode =
    elseBody !== undefined
      ? { kind: "if", flag: opener.value, negated, form, body, elseBody }
      : { kind: "if", flag: opener.value, negated, form, body };
  return { node, precedingTrim: form === "block", trailingText };
};

const parseSwitch = (
  state: ParserState,
  opener: Token,
  form: "inline" | "block",
): BlockParseResult => {
  state.i += 1;

  // Between {switch} and first {case}: only whitespace text allowed.
  // For block form, also strip the trailing whitespace on opener's line
  // from the next text token.
  while (state.i < state.tokens.length) {
    const tok = state.tokens[state.i];
    if (tok === undefined) break;
    if (tok.kind === "Case" || tok.kind === "Else" || tok.kind === "End") break;
    if (tok.kind === "Text") {
      // Only whitespace text is permitted between {switch} and the first {case}.
      if (tok.value.trim().length > 0) {
        throw makeError(
          state,
          `Content between '{switch ${opener.value}}' and first '{case}': only '{case}' branches are allowed inside a switch`,
          "E_TEXT_BEFORE_FIRST_CASE",
          tok.line,
          tok.column,
        );
      }
      state.i += 1;
      continue;
    }
    // Non-text, non-case: variables, nested blocks, etc., are forbidden here.
    throw makeError(
      state,
      `Unexpected ${describeToken(tok)} between '{switch ${opener.value}}' and first '{case}': only '{case}' branches are allowed inside a switch`,
      "E_TEXT_BEFORE_FIRST_CASE",
      tok.line,
      tok.column,
    );
  }

  // Require at least one case.
  const firstAfterInter = state.tokens[state.i];
  if (firstAfterInter === undefined || firstAfterInter.kind === "End") {
    throw makeError(
      state,
      `Switch on '${opener.value}' has no cases; remove the switch or add cases`,
      "E_SWITCH_NO_CASES",
      opener.line,
      opener.column,
    );
  }
  if (firstAfterInter.kind === "Else") {
    throw makeError(
      state,
      `'{else}' before any '{case}' in switch on '${opener.value}'`,
      "E_ELSE_BEFORE_CASE",
      firstAfterInter.line,
      firstAfterInter.column,
    );
  }
  if (firstAfterInter.kind !== "Case") {
    throw makeError(
      state,
      `Unexpected ${describeToken(firstAfterInter)} inside '{switch ${opener.value}}'`,
      "E_BAD_TAG",
      firstAfterInter.line,
      firstAfterInter.column,
    );
  }

  const cases: SwitchCase[] = [];
  const seenCases = new Set<string>();
  let elseBody: Node[] | undefined;

  while (state.i < state.tokens.length) {
    const tok = state.tokens[state.i];
    if (tok === undefined) break;

    if (tok.kind === "End") break;

    if (tok.kind === "Case") {
      if (elseBody !== undefined) {
        throw makeError(
          state,
          `'{case ${tok.value}}' appears after '{else}' in switch on '${opener.value}': the '{else}' branch must come last`,
          "E_ELSE_BEFORE_CASE",
          tok.line,
          tok.column,
        );
      }
      checkFormAt(state, tok, state.i, form, `{switch ${opener.value}}`);
      if (seenCases.has(tok.value)) {
        throw makeError(
          state,
          `Duplicate '{case ${tok.value}}' in switch on '${opener.value}'`,
          "E_DUPLICATE_CASE",
          tok.line,
          tok.column,
        );
      }
      seenCases.add(tok.value);
      const caseValue = tok.value;
      state.i += 1;
      if (form === "block") {
        const next = state.tokens[state.i];
        if (next !== undefined && next.kind === "Text") {
          state.tokens = withReplaced(state.tokens, state.i, {
            ...next,
            value: dropLeadingTrailingNewline(next.value),
          });
        }
      }
      const stops: ReadonlySet<TokenKind> = new Set<TokenKind>(["Case", "Else", "End"]);
      const caseResult = parseUntil(state, stops, form, null);
      const body =
        form === "block" ? trimLastTextTrailingWhitespace(caseResult.nodes) : caseResult.nodes;
      cases.push({ value: caseValue, body });
      continue;
    }

    if (tok.kind === "Else") {
      if (elseBody !== undefined) {
        throw makeError(
          state,
          `Multiple '{else}' branches in switch on '${opener.value}'`,
          "E_ELSE_BEFORE_CASE",
          tok.line,
          tok.column,
        );
      }
      checkFormAt(state, tok, state.i, form, `{switch ${opener.value}}`);
      state.i += 1;
      if (form === "block") {
        const next = state.tokens[state.i];
        if (next !== undefined && next.kind === "Text") {
          state.tokens = withReplaced(state.tokens, state.i, {
            ...next,
            value: dropLeadingTrailingNewline(next.value),
          });
        }
      }
      const stops: ReadonlySet<TokenKind> = new Set<TokenKind>(["End", "Case", "Else"]);
      const elseResult = parseUntil(state, stops, form, null);
      if (elseResult.stoppedAt === null) {
        throw makeError(
          state,
          `Unclosed '{switch ${opener.value}}': missing '{end}'`,
          "E_UNCLOSED_SWITCH",
          opener.line,
          opener.column,
        );
      }
      if (elseResult.stoppedAt.kind === "Case") {
        throw makeError(
          state,
          `'{case ${elseResult.stoppedAt.value}}' appears after '{else}' in switch on '${opener.value}': the '{else}' branch must come last`,
          "E_ELSE_BEFORE_CASE",
          elseResult.stoppedAt.line,
          elseResult.stoppedAt.column,
        );
      }
      if (elseResult.stoppedAt.kind === "Else") {
        throw makeError(
          state,
          `Multiple '{else}' branches in switch on '${opener.value}'`,
          "E_ELSE_BEFORE_CASE",
          elseResult.stoppedAt.line,
          elseResult.stoppedAt.column,
        );
      }
      elseBody =
        form === "block" ? trimLastTextTrailingWhitespace(elseResult.nodes) : elseResult.nodes;
      continue;
    }

    throw makeError(
      state,
      `Unexpected ${describeToken(tok)} inside '{switch ${opener.value}}'`,
      "E_BAD_TAG",
      tok.line,
      tok.column,
    );
  }

  const endTok = state.tokens[state.i];
  if (endTok === undefined || endTok.kind !== "End") {
    throw makeError(
      state,
      `Unclosed '{switch ${opener.value}}': missing '{end}'`,
      "E_UNCLOSED_SWITCH",
      opener.line,
      opener.column,
    );
  }
  checkFormAt(state, endTok, state.i, form, `{switch ${opener.value}}`);
  state.i += 1;

  if (cases.length === 0) {
    throw makeError(
      state,
      `Switch on '${opener.value}' has no cases; remove the switch or add cases`,
      "E_SWITCH_NO_CASES",
      opener.line,
      opener.column,
    );
  }

  // Compute trailingText for block form.
  let trailingText: string | null = null;
  if (form === "block") {
    const after = state.tokens[state.i];
    if (after !== undefined && after.kind === "Text") {
      trailingText = dropLeadingTrailingNewline(after.value);
      state.i += 1;
    }
  }

  const node: SwitchNode =
    elseBody !== undefined
      ? { kind: "switch", flag: opener.value, form, cases, elseBody }
      : { kind: "switch", flag: opener.value, form, cases };
  return { node, precedingTrim: form === "block", trailingText };
};

/**
 * Replace token at index in an immutable-ish way (returns a new array).
 * Used to in-place adjust Text tokens during block-form trimming without
 * mutating shared token references.
 */
const withReplaced = (tokens: ReadonlyArray<Token>, index: number, next: Token): Token[] => {
  const arr = tokens.slice();
  arr[index] = next;
  return arr;
};

/**
 * For block form: when the branch body ended at a keyword-line, the last
 * Text node in the body still has the trailing whitespace on the keyword's
 * line. Strip it so the renderer doesn't emit it.
 */
const trimLastTextTrailingWhitespace = (nodes: Node[]): Node[] => {
  if (nodes.length === 0) return nodes;
  const last = nodes[nodes.length - 1];
  if (last === undefined || last.kind !== "text") return nodes;
  const trimmed = dropTrailingWhitespaceLine(last.value);
  if (trimmed === last.value) return nodes;
  const out = nodes.slice();
  if (trimmed.length === 0) {
    out.pop();
  } else {
    out[out.length - 1] = { kind: "text", value: trimmed };
  }
  return out;
};

/**
 * Parse the entire token stream into a flat list of AST nodes.
 */
export const parseBody = (tokens: ReadonlyArray<Token>, sourcePath?: string): Node[] => {
  // We may need to mutate Text tokens that abut keyword lines (block-form
  // trimming). Work off a local mutable copy of the token stream.
  const state: ParserState = {
    tokens: tokens.slice(),
    i: 0,
    ...(sourcePath !== undefined ? { path: sourcePath } : {}),
  };

  const stops: ReadonlySet<TokenKind> = new Set<TokenKind>();
  const result = parseUntil(state, stops, null, null);

  if (state.i < state.tokens.length) {
    const stray = state.tokens[state.i];
    if (stray !== undefined) {
      if (stray.kind === "End") {
        throw makeError(
          state,
          "Unexpected '{end}' with no matching '{if}' or '{switch}'",
          "E_EXTRA_END",
          stray.line,
          stray.column,
        );
      }
      if (stray.kind === "Else") {
        throw makeError(
          state,
          "Unexpected '{else}' outside any '{if}' or '{switch}'",
          "E_ELSE_BEFORE_CASE",
          stray.line,
          stray.column,
        );
      }
      if (stray.kind === "Case") {
        throw makeError(
          state,
          `Unexpected '{case ${stray.value}}' outside any '{switch}'`,
          "E_BAD_TAG",
          stray.line,
          stray.column,
        );
      }
    }
  }

  return result.nodes;
};
