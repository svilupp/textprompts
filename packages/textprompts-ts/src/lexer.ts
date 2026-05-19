/**
 * Body lexer for textprompts conditional syntax (SPEC v2 §2).
 *
 * Consumes the already-prepared body string (BOM-stripped, LF newlines, dedent
 * applied — see `prepareSource`) and produces a flat stream of tokens. The
 * body-parser turns tokens into the AST.
 *
 * Lexer order on `{` per SPEC §2.1:
 *   1. Control tag prefix (`if `, `switch `, `case `, `else}`, `end}`)
 *   2. Bare `identifier}` -> variable
 *   3. Else -> {@link ParseError} with a helpful diagnostic.
 *
 * Escapes (§2.4) are resolved here: `\{`, `\\`, `\}` -> `{`, `\`, `}`. Any
 * other `\X` sequence renders literally as two characters.
 */

import { ParseError, type ParseErrorOptions } from "./errors";

export type TokenKind =
  | "Text"
  | "Variable"
  | "OpenIf"
  | "OpenIfNot"
  | "Else"
  | "End"
  | "OpenSwitch"
  | "Case";

export interface Token {
  readonly kind: TokenKind;
  /**
   * For `Text`: the literal text.
   * For `Variable` / `OpenIf` / `OpenIfNot` / `OpenSwitch` / `Case`: the
   * identifier (variable name, flag name, or case value).
   * For `Else` / `End`: empty string.
   */
  readonly value: string;
  /** 1-based line in the prepared source. */
  readonly line: number;
  /** 1-based column of the token start in the prepared source. */
  readonly column: number;
}

/** Identifier rule: ASCII snake_case, must start with letter or underscore. */
export const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Reserved keywords. Cannot be used as identifiers anywhere — variable names,
 * flag names, enum case values. `flags` is reserved by the format API surface.
 */
export const RESERVED_KEYWORDS: ReadonlySet<string> = new Set([
  "if",
  "else",
  "end",
  "switch",
  "case",
  "flags",
]);

const isIdentifier = (s: string): boolean => IDENTIFIER_RE.test(s);

const isReserved = (s: string): boolean => RESERVED_KEYWORDS.has(s);

interface LexerState {
  readonly src: string;
  pos: number;
  line: number;
  /** Column of `pos` (1-based). */
  column: number;
  readonly path?: string;
  readonly tokens: Token[];
  /** Accumulated literal text since the last emitted token. */
  textBuf: string;
  /** Line of the first char of `textBuf` (1-based), or -1 when empty. */
  textLine: number;
  textColumn: number;
}

const makeError = (
  state: LexerState,
  message: string,
  code: string,
  line: number,
  column: number,
): ParseError => {
  const opts: ParseErrorOptions = { code, line, column };
  if (state.path !== undefined) opts.path = state.path;
  return new ParseError(message, opts);
};

const flushText = (state: LexerState): void => {
  if (state.textBuf.length === 0) return;
  state.tokens.push({
    kind: "Text",
    value: state.textBuf,
    line: state.textLine,
    column: state.textColumn,
  });
  state.textBuf = "";
  state.textLine = -1;
  state.textColumn = -1;
};

const appendChar = (state: LexerState, ch: string, line: number, column: number): void => {
  if (state.textBuf.length === 0) {
    state.textLine = line;
    state.textColumn = column;
  }
  state.textBuf += ch;
};

/**
 * Advance `state.pos` over `s.length` characters, updating line/column for any
 * embedded newlines. `s` must be a substring already known to start at
 * `state.pos`.
 */
const advance = (state: LexerState, n: number): void => {
  for (let i = 0; i < n; i += 1) {
    const ch = state.src[state.pos];
    state.pos += 1;
    if (ch === "\n") {
      state.line += 1;
      state.column = 1;
    } else {
      state.column += 1;
    }
  }
};

/**
 * Tag content = the substring between `{` and `}` (exclusive). Returns null
 * if no closing `}` is found before EOF.
 */
const findTagEnd = (src: string, start: number): number => {
  // start is index of `{`
  let i = start + 1;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "}") return i;
    if (ch === "\n" || ch === "{") return -1;
    i += 1;
  }
  return -1;
};

const validateIdentifier = (
  state: LexerState,
  name: string,
  context: string,
  line: number,
  column: number,
): void => {
  if (name.length === 0) {
    throw makeError(state, `Empty identifier in ${context}`, "E_BAD_TAG", line, column);
  }
  if (!isIdentifier(name)) {
    if (/-/.test(name)) {
      throw makeError(
        state,
        `Invalid identifier '${name}' in ${context}: dashes are not allowed (use snake_case)`,
        "E_INVALID_IDENTIFIER",
        line,
        column,
      );
    }
    if (/^[0-9]/.test(name)) {
      throw makeError(
        state,
        `Invalid identifier '${name}' in ${context}: identifiers must start with a letter or underscore`,
        "E_INVALID_IDENTIFIER",
        line,
        column,
      );
    }
    throw makeError(
      state,
      `Invalid identifier '${name}' in ${context}: must match [a-zA-Z_][a-zA-Z0-9_]*`,
      "E_INVALID_IDENTIFIER",
      line,
      column,
    );
  }
  if (isReserved(name)) {
    throw makeError(
      state,
      `Reserved keyword '${name}' cannot be used as an identifier in ${context}`,
      "E_RESERVED_IDENTIFIER",
      line,
      column,
    );
  }
};

const lexTag = (state: LexerState): void => {
  // state.pos points at `{`
  const openLine = state.line;
  const openCol = state.column;
  const tagEnd = findTagEnd(state.src, state.pos);
  if (tagEnd === -1) {
    throw makeError(state, "Unterminated tag: missing closing '}'", "E_BAD_TAG", openLine, openCol);
  }
  const inner = state.src.slice(state.pos + 1, tagEnd);

  // Surface specific legacy errors first.
  if (inner === "") {
    throw makeError(
      state,
      "Empty placeholder '{}' is not supported in v2 (use a named variable like {name})",
      "E_BAD_TAG",
      openLine,
      openCol,
    );
  }

  if (/^[0-9]/.test(inner) && /^[0-9]+$/.test(inner)) {
    throw makeError(
      state,
      `Positional placeholder '{${inner}}' is not supported in v2 (use a named variable)`,
      "E_BAD_TAG",
      openLine,
      openCol,
    );
  }

  // Inside-brace whitespace check: any leading/trailing whitespace forbidden.
  if (/^\s/.test(inner) || /\s$/.test(inner)) {
    throw makeError(
      state,
      `Whitespace inside braces is not allowed: '{${inner}}'`,
      "E_BAD_TAG",
      openLine,
      openCol,
    );
  }

  // Uppercase / mixed-case keyword detection. Only treat actual keyword forms
  // as keywords; variables like `{Ifx}` or `{EndUser}` are valid identifiers.
  const keywordHead = inner.split(/\s+/, 1)[0] ?? "";
  const looksLikeKeyword =
    (/^(if|switch|case)$/i.test(keywordHead) &&
      (inner.length === keywordHead.length || /\s/.test(inner[keywordHead.length] ?? ""))) ||
    /^(else|end)$/i.test(inner);
  if (looksLikeKeyword && keywordHead !== keywordHead.toLowerCase()) {
    throw makeError(
      state,
      `Keywords must be lowercase: '{${inner}}'`,
      "E_BAD_TAG",
      openLine,
      openCol,
    );
  }

  // Control tags.
  if (inner === "else") {
    advance(state, tagEnd - state.pos + 1);
    state.tokens.push({ kind: "Else", value: "", line: openLine, column: openCol });
    return;
  }
  if (inner === "end") {
    advance(state, tagEnd - state.pos + 1);
    state.tokens.push({ kind: "End", value: "", line: openLine, column: openCol });
    return;
  }
  if (inner === "if") {
    throw makeError(state, "Bare '{if}' is missing a flag name", "E_BAD_TAG", openLine, openCol);
  }
  if (inner === "switch") {
    throw makeError(
      state,
      "Bare '{switch}' is missing a flag name",
      "E_BAD_TAG",
      openLine,
      openCol,
    );
  }
  if (inner === "case") {
    throw makeError(state, "Bare '{case}' is missing a value", "E_BAD_TAG", openLine, openCol);
  }

  if (inner.startsWith("if ")) {
    // `inner.startsWith("if ")` already consumed exactly one space.
    const rest = inner.slice(3);
    // SPEC §2.3: For the negated form `{if !flag}`, exactly one space is
    // required between `if` and `!`. For the non-negated form, one-or-more
    // spaces between `if` and the identifier are accepted.
    let restTrimmed = rest;
    while (restTrimmed.startsWith(" ")) restTrimmed = restTrimmed.slice(1);
    if (restTrimmed.length === 0) {
      throw makeError(
        state,
        `Bare '{${inner}}' is missing a flag name`,
        "E_BAD_TAG",
        openLine,
        openCol,
      );
    }
    let negated = false;
    let name = restTrimmed;
    if (restTrimmed.startsWith("!")) {
      // Extra space(s) before `!` are forbidden — the initial space after
      // `if` already consumed; if `rest` itself starts with a space, that's
      // an additional one.
      if (rest.startsWith(" ")) {
        throw makeError(
          state,
          `Negation '{if !flag}' requires exactly one space after 'if': '{${inner}}'`,
          "E_BAD_TAG",
          openLine,
          openCol,
        );
      }
      negated = true;
      name = restTrimmed.slice(1);
      if (name.length === 0) {
        throw makeError(
          state,
          "Bare '{if !}' is missing a flag name",
          "E_BAD_TAG",
          openLine,
          openCol,
        );
      }
      if (/^\s/.test(name)) {
        throw makeError(
          state,
          `Negation '!' must be immediately adjacent to the identifier: '{${inner}}'`,
          "E_BAD_TAG",
          openLine,
          openCol,
        );
      }
    }
    validateIdentifier(state, name, `{if ${negated ? "!" : ""}${name}}`, openLine, openCol);
    advance(state, tagEnd - state.pos + 1);
    state.tokens.push({
      kind: negated ? "OpenIfNot" : "OpenIf",
      value: name,
      line: openLine,
      column: openCol,
    });
    return;
  }

  if (inner.startsWith("switch ")) {
    let name = inner.slice(7);
    while (name.startsWith(" ")) name = name.slice(1);
    if (name.length === 0) {
      throw makeError(
        state,
        `Bare '{${inner}}' is missing a flag name`,
        "E_BAD_TAG",
        openLine,
        openCol,
      );
    }
    validateIdentifier(state, name, `{switch ${name}}`, openLine, openCol);
    advance(state, tagEnd - state.pos + 1);
    state.tokens.push({ kind: "OpenSwitch", value: name, line: openLine, column: openCol });
    return;
  }

  if (inner.startsWith("case ")) {
    let value = inner.slice(5);
    while (value.startsWith(" ")) value = value.slice(1);
    if (value.length === 0) {
      throw makeError(
        state,
        `Bare '{${inner}}' is missing a value`,
        "E_BAD_TAG",
        openLine,
        openCol,
      );
    }
    if (value.startsWith("!")) {
      throw makeError(
        state,
        `Negation is not allowed in '{case}': '{${inner}}'`,
        "E_BAD_TAG",
        openLine,
        openCol,
      );
    }
    validateIdentifier(state, value, `{case ${value}}`, openLine, openCol);
    advance(state, tagEnd - state.pos + 1);
    state.tokens.push({ kind: "Case", value, line: openLine, column: openCol });
    return;
  }

  // No control-tag prefix matched -> must be a bare variable.
  validateIdentifier(state, inner, `{${inner}}`, openLine, openCol);
  advance(state, tagEnd - state.pos + 1);
  state.tokens.push({ kind: "Variable", value: inner, line: openLine, column: openCol });
};

/**
 * Tokenize a prompt body. `body` must be the output of {@link prepareSource}
 * (already BOM-stripped, LF newlines, optional dedent applied).
 */
export const tokenize = (body: string, sourcePath?: string): Token[] => {
  const state: LexerState = {
    src: body,
    pos: 0,
    line: 1,
    column: 1,
    tokens: [],
    textBuf: "",
    textLine: -1,
    textColumn: -1,
    ...(sourcePath !== undefined ? { path: sourcePath } : {}),
  };

  while (state.pos < state.src.length) {
    const ch = state.src[state.pos];

    if (ch === "\\") {
      // Escape sequences: \{ \} \\ -> literal char. Anything else: two chars.
      const next = state.src[state.pos + 1];
      if (next === "{" || next === "}" || next === "\\") {
        appendChar(state, next, state.line, state.column);
        advance(state, 2);
        continue;
      }
      appendChar(state, ch, state.line, state.column);
      advance(state, 1);
      continue;
    }

    if (ch === "{") {
      flushText(state);
      lexTag(state);
      continue;
    }

    appendChar(state, ch, state.line, state.column);
    advance(state, 1);
  }

  flushText(state);
  return state.tokens;
};
