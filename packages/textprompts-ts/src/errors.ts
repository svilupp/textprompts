export class TextPromptsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TextPromptsError";
  }
}

export class FileMissingError extends TextPromptsError {
  constructor(path: string) {
    super(`File not found: ${path}`);
    this.name = "FileMissingError";
  }
}

export class MissingMetadataError extends TextPromptsError {
  constructor(message = "Metadata is required but missing") {
    super(message);
    this.name = "MissingMetadataError";
  }
}

export class InvalidMetadataError extends TextPromptsError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMetadataError";
  }
}

export class MalformedHeaderError extends TextPromptsError {
  constructor(message: string) {
    super(message);
    this.name = "MalformedHeaderError";
  }
}

/**
 * Options for constructing a {@link ParseError}.
 *
 * `code` is the stable cross-port error code (see SPEC §7 / §11.4 — e.g.
 * `E_UNCLOSED_IF`, `E_BAD_TAG`, `E_DUPLICATE_CASE`). `line` and `column` are
 * 1-based positions in the *prepared* source (post BOM strip / CRLF normalize /
 * dedent). Exact source mapping is best-effort, not part of the conformance
 * contract.
 */
export interface ParseErrorOptions {
  code?: string;
  path?: string;
  line?: number;
  column?: number;
}

/**
 * Lexer / body-parser error. Raised for malformed tags, structural mistakes,
 * and identifier-validity problems in the prompt body. Frontmatter errors use
 * a different class (added in Phase 2).
 */
export class ParseError extends TextPromptsError {
  readonly code?: string;
  readonly path?: string;
  readonly line?: number;
  readonly column?: number;

  constructor(message: string, options: ParseErrorOptions = {}) {
    super(message);
    this.name = "ParseError";
    if (options.code !== undefined) this.code = options.code;
    if (options.path !== undefined) this.path = options.path;
    if (options.line !== undefined) this.line = options.line;
    if (options.column !== undefined) this.column = options.column;
  }
}

/**
 * Stable error codes raised by frontmatter schema validation (`[flags.*]` /
 * `[variables.*]`). See `frontmatter-schema.ts`.
 *
 * - `E_INVALID_IDENTIFIER` — flag/variable/enum-value name fails the
 *   identifier regex `[a-zA-Z_][a-zA-Z0-9_]*`.
 * - `E_RESERVED_IDENTIFIER` — name is one of the reserved keywords
 *   (`if`, `else`, `end`, `switch`, `case`, `flags`).
 * - `E_DUPLICATE_NAME` — the same name appears in both `[flags.*]` and
 *   `[variables.*]`.
 * - `E_INVALID_FLAG_TYPE` — flag `type` is set and not `"boolean"`/`"enum"`.
 * - `E_INVALID_FLAG_VALUES` — enum `values` missing/empty/non-array, or
 *   contains a duplicate or non-string entry; or a boolean flag has `values`.
 * - `E_BAD_SCHEMA_SHAPE` — `flags`/`variables` top-level is not an object,
 *   a single flag/variable entry is not an object, or a per-field shape
 *   violation (e.g. non-string description).
 */
export type FrontmatterErrorCode =
  | "E_INVALID_IDENTIFIER"
  | "E_RESERVED_IDENTIFIER"
  | "E_DUPLICATE_NAME"
  | "E_INVALID_FLAG_TYPE"
  | "E_INVALID_FLAG_VALUES"
  | "E_BAD_SCHEMA_SHAPE";

export interface FrontmatterErrorOptions {
  code?: FrontmatterErrorCode;
  path?: string;
  line?: number;
  column?: number;
}

/**
 * Frontmatter schema validation error. Raised by `parseFlagsAndVariables` for
 * invalid `[flags.*]` / `[variables.*]` declarations. Carries a stable `code`
 * plus optional `path`/`line`/`column` context.
 */
export class FrontmatterError extends TextPromptsError {
  readonly code?: FrontmatterErrorCode;
  readonly path?: string;
  readonly line?: number;
  readonly column?: number;

  constructor(message: string, options: FrontmatterErrorOptions = {}) {
    super(message);
    this.name = "FrontmatterError";
    if (options.code !== undefined) this.code = options.code;
    if (options.path !== undefined) this.path = options.path;
    if (options.line !== undefined) this.line = options.line;
    if (options.column !== undefined) this.column = options.column;
  }
}

/**
 * Stable error codes raised by format-time input validation (see
 * `format-validation.ts`).
 *
 * - `E_MISSING_FLAGS_OBJECT` — prompt references flags but caller passed no
 *   `flags` parameter (or `null`/`undefined`).
 * - `E_BAD_FLAGS_TYPE` — `flags` parameter was present but not a plain object
 *   (e.g. a string, number, or array).
 * - `E_MISSING_FLAG` — an individual flag referenced in the prompt body was
 *   not present in `inputs.flags`.
 * - `E_MISSING_VARIABLE` — a variable referenced anywhere in the prompt body
 *   was not present in `inputs.variables`. Fires even when the only reference
 *   is inside a branch that wouldn't render (SPEC §5.2).
 * - `E_WRONG_FLAG_TYPE` — caller passed the wrong runtime type for a flag
 *   (e.g. a string for a boolean flag, a boolean for an enum flag, a number
 *   for any flag).
 * - `E_INVALID_FLAG_VALUE` — caller passed a string for an enum flag that is
 *   not one of the declared / inferred values.
 * - `E_RESERVED_KEY` — caller used a reserved keyword (`if`, `else`, `end`,
 *   `switch`, `case`, `flags`) as a variable or flag *input key*. Reserved
 *   keywords are still permitted as variable *values*.
 */
export type FormatErrorCode =
  | "E_MISSING_FLAGS_OBJECT"
  | "E_BAD_FLAGS_TYPE"
  | "E_MISSING_FLAG"
  | "E_MISSING_VARIABLE"
  | "E_WRONG_FLAG_TYPE"
  | "E_INVALID_FLAG_VALUE"
  | "E_RESERVED_KEY";

export interface FormatErrorOptions {
  code?: FormatErrorCode;
  path?: string;
  line?: number;
  column?: number;
}

/**
 * Format-time input validation error. Raised by `validateInputs` (and
 * therefore by `Prompt.format`) when required inputs are missing, have the
 * wrong type, or use a reserved keyword as their key. See SPEC §5.5–§5.7 and
 * §7.4.
 */
export class FormatError extends TextPromptsError {
  readonly code?: FormatErrorCode;
  readonly path?: string;
  readonly line?: number;
  readonly column?: number;

  constructor(message: string, options: FormatErrorOptions = {}) {
    super(message);
    this.name = "FormatError";
    if (options.code !== undefined) this.code = options.code;
    if (options.path !== undefined) this.path = options.path;
    if (options.line !== undefined) this.line = options.line;
    if (options.column !== undefined) this.column = options.column;
  }
}

/**
 * Stable error codes raised by load-time semantic validation (reconciling
 * frontmatter declarations against body usage — see SPEC §4.7, §5.1, §5.3).
 * Wiring lives in Phase 4 (loader-modes); the class is declared here so
 * downstream callers and tests can already reference it.
 *
 * - `E_UNDECLARED_FLAG` — strict mode: a flag is referenced in the body but
 *   not declared in `[flags.*]`.
 * - `E_FLAG_USED_AS_BOTH_IF_AND_SWITCH` — declared boolean flag used in
 *   `{switch}`, or declared enum flag used in `{if}`. Also covers the
 *   implicit-mode case where the body itself uses the same name as both
 *   an `{if}` flag and a `{switch}` flag.
 * - `E_NON_EXHAUSTIVE_SWITCH` — `{switch}` on a declared enum is missing
 *   `{case}`s for some declared values and has no `{else}` branch.
 * - `E_INVALID_CASE_VALUE` — `{case X}` value is not in the declared enum's
 *   `values` list.
 * - `E_FLAG_AND_VARIABLE_COLLISION` — the same identifier is used as both a
 *   flag and a variable in the body (or declared as both in frontmatter).
 */
export type SemanticErrorCode =
  | "E_UNDECLARED_FLAG"
  | "E_FLAG_USED_AS_BOTH_IF_AND_SWITCH"
  | "E_NON_EXHAUSTIVE_SWITCH"
  | "E_INVALID_CASE_VALUE"
  | "E_FLAG_AND_VARIABLE_COLLISION";

export interface SemanticErrorOptions {
  code?: SemanticErrorCode;
  path?: string;
  line?: number;
  column?: number;
}

/**
 * Semantic load-time error. Raised when frontmatter declarations and body
 * usage disagree, or when the body uses a name in two incompatible roles.
 * Class declared in Phase 3; wired into the loader in Phase 4.
 */
export class SemanticError extends TextPromptsError {
  readonly code?: SemanticErrorCode;
  readonly path?: string;
  readonly line?: number;
  readonly column?: number;

  constructor(message: string, options: SemanticErrorOptions = {}) {
    super(message);
    this.name = "SemanticError";
    if (options.code !== undefined) this.code = options.code;
    if (options.path !== undefined) this.path = options.path;
    if (options.line !== undefined) this.line = options.line;
    if (options.column !== undefined) this.column = options.column;
  }
}
