/**
 * Format-time input validation (SPEC §5.5–§5.7, §7.4).
 *
 * Runs before `render`. Walks the AST once to collect every flag, variable,
 * and switch-case reference — including those inside inactive branches per
 * §5.2 — then checks them against the caller's `FormatInputs`.
 *
 * Surfaces typed `FormatError`s with stable codes:
 *
 * - `E_MISSING_FLAGS_OBJECT`  — flags used by prompt, no `flags` passed.
 * - `E_BAD_FLAGS_TYPE`        — `flags` was present but not a plain object.
 * - `E_MISSING_FLAG`          — individual flag not present in `inputs.flags`.
 * - `E_MISSING_VARIABLE`      — variable not present in `inputs.variables`.
 * - `E_WRONG_FLAG_TYPE`       — wrong runtime type for a flag.
 * - `E_INVALID_FLAG_VALUE`    — string passed for enum flag is not in the
 *                               allowed value set.
 * - `E_RESERVED_KEY`          — reserved keyword used as an *input key*
 *                               (variable or flag). Reserved keyword *values*
 *                               are allowed (§5.5 last paragraph).
 *
 * Extra inputs (flags or variables not referenced by the prompt) are silently
 * ignored per §5.7.
 */

import type { Node } from "./ast";
import { FormatError } from "./errors";
import type { FlagDecl } from "./frontmatter-schema";
import type { PromptMeta } from "./models";
import type { FormatInputs } from "./renderer";

const RESERVED_KEYWORDS: ReadonlySet<string> = new Set([
  "if",
  "else",
  "end",
  "switch",
  "case",
  "flags",
]);

export interface RequiredRefs {
  /** Flags referenced via `{if foo}` (boolean usage). */
  readonly flags: Set<string>;
  /**
   * Flags referenced via `{switch foo}` (enum usage). Maps flag name to the
   * union of `{case X}` values that appear in the body for that switch. Also
   * records whether at least one occurrence has an `{else}` branch (allowed
   * to catch unenumerated values).
   */
  readonly switches: Map<string, Set<string>>;
  /** Switches that have an `{else}` branch somewhere. */
  readonly switchesWithElse: Set<string>;
  /** Variable names referenced via `{var}`. */
  readonly variables: Set<string>;
}

const walk = (nodes: ReadonlyArray<Node>, refs: RequiredRefs): void => {
  for (const node of nodes) {
    switch (node.kind) {
      case "text":
        break;
      case "variable":
        refs.variables.add(node.name);
        break;
      case "if":
        refs.flags.add(node.flag);
        walk(node.body, refs);
        if (node.elseBody !== undefined) walk(node.elseBody, refs);
        break;
      case "switch": {
        let cases = refs.switches.get(node.flag);
        if (cases === undefined) {
          cases = new Set<string>();
          refs.switches.set(node.flag, cases);
        }
        for (const c of node.cases) {
          cases.add(c.value);
          walk(c.body, refs);
        }
        if (node.elseBody !== undefined) {
          refs.switchesWithElse.add(node.flag);
          walk(node.elseBody, refs);
        }
        break;
      }
    }
  }
};

/**
 * Walk the AST and collect every referenced flag, switch flag (with case
 * values), and variable. Visits **all** branches — both the `body` and
 * `elseBody` of every `{if}` and the body of every `{case}` plus any
 * `{else}` branch of every `{switch}` — per SPEC §5.2.
 *
 * Used by `validateInputs` and re-exported for Phase 4's loader-modes pass
 * to reconcile body usage against frontmatter declarations.
 */
export const collectRequiredRefs = (ast: ReadonlyArray<Node>): RequiredRefs => {
  const refs: RequiredRefs = {
    flags: new Set<string>(),
    switches: new Map<string, Set<string>>(),
    switchesWithElse: new Set<string>(),
    variables: new Set<string>(),
  };
  walk(ast, refs);
  return refs;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date)
  );
};

const hasOwn = (obj: Record<string, unknown>, key: string): boolean => Object.hasOwn(obj, key);

/**
 * Validate inputs against the prompt's AST + declared metadata. Throws a
 * `FormatError` on the first problem found (no error aggregation).
 *
 * Order:
 *   1. Reserved-key check on caller-supplied input keys (variables + flags).
 *   2. Flag presence and type check (using declared `meta.flags` when
 *      available, falling back to inferred kind from body usage).
 *   3. Variable presence check.
 */
export const validateInputs = (
  meta: PromptMeta,
  ast: ReadonlyArray<Node>,
  inputs: FormatInputs,
): void => {
  const refs = collectRequiredRefs(ast);
  const allFlagRefs = new Set<string>([...refs.flags, ...refs.switches.keys()]);
  const usesFlags = allFlagRefs.size > 0;

  // 1. Reserved-key check on input *keys*. Reserved string *values* are OK.
  // Variables: top-level keys.
  if (isPlainObject(inputs.variables)) {
    for (const key of Object.keys(inputs.variables)) {
      if (RESERVED_KEYWORDS.has(key)) {
        throw new FormatError(`Reserved keyword '${key}' cannot be used as a variable input key`, {
          code: "E_RESERVED_KEY",
        });
      }
    }
  }
  // Flags: keys inside `inputs.flags` (when it is an object).
  if (inputs.flags !== null && inputs.flags !== undefined && isPlainObject(inputs.flags)) {
    for (const key of Object.keys(inputs.flags)) {
      if (RESERVED_KEYWORDS.has(key)) {
        throw new FormatError(`Reserved keyword '${key}' cannot be used as a flag input key`, {
          code: "E_RESERVED_KEY",
        });
      }
    }
  }

  // 2. Flag presence and types.
  if (usesFlags) {
    if (inputs.flags === null || inputs.flags === undefined) {
      const names = [...allFlagRefs].sort();
      throw new FormatError(
        `Prompt requires 'flags' parameter but none was passed; expected flags: [${names.join(", ")}]`,
        { code: "E_MISSING_FLAGS_OBJECT" },
      );
    }
    if (!isPlainObject(inputs.flags)) {
      throw new FormatError(
        `'flags' parameter must be a plain object mapping flag name to value, got ${typeof inputs.flags}`,
        { code: "E_BAD_FLAGS_TYPE" },
      );
    }

    const flagsObj = inputs.flags as Record<string, unknown>;

    // Boolean-usage flags ({if foo}).
    for (const name of refs.flags) {
      if (!hasOwn(flagsObj, name)) {
        throw new FormatError(`Flag '${name}' required but not provided`, {
          code: "E_MISSING_FLAG",
        });
      }
      checkFlagValue(name, flagsObj[name], meta.flags?.[name], "if", refs);
    }

    // Switch-usage flags ({switch foo}).
    for (const [name, _cases] of refs.switches) {
      if (!hasOwn(flagsObj, name)) {
        throw new FormatError(`Flag '${name}' required but not provided`, {
          code: "E_MISSING_FLAG",
        });
      }
      checkFlagValue(name, flagsObj[name], meta.flags?.[name], "switch", refs);
    }
  } else {
    // Prompt uses no flags. If caller passed `flags` anyway and it's not an
    // object, that's still a type error (and §5.7 says extras are ignored,
    // but a malformed parameter is not "extra inputs"). We tolerate it: a
    // non-object `flags` when no flags are used is treated as "no flags" and
    // silently ignored, mirroring §5.7. Keep simple.
  }

  // 3. Variable presence.
  if (refs.variables.size > 0) {
    if (!isPlainObject(inputs.variables)) {
      // Variables container missing entirely — treat as missing for every var.
      const first = refs.variables.values().next().value as string;
      throw new FormatError(`Variable '${first}' required but not provided`, {
        code: "E_MISSING_VARIABLE",
      });
    }
    for (const name of refs.variables) {
      if (!hasOwn(inputs.variables as Record<string, unknown>, name)) {
        throw new FormatError(`Variable '${name}' required but not provided`, {
          code: "E_MISSING_VARIABLE",
        });
      }
    }
  }
};

const checkFlagValue = (
  name: string,
  value: unknown,
  decl: FlagDecl | undefined,
  usage: "if" | "switch",
  refs: RequiredRefs,
): void => {
  // Declared kind, if present, takes precedence over usage-inferred kind.
  if (decl !== undefined) {
    if (decl.kind === "boolean") {
      if (typeof value !== "boolean") {
        throw new FormatError(`Flag '${name}' got ${describeType(value)}, expected boolean`, {
          code: "E_WRONG_FLAG_TYPE",
        });
      }
      return;
    }
    // enum
    if (typeof value !== "string") {
      throw new FormatError(
        `Flag '${name}' got ${describeType(value)}, expected string (one of [${decl.values.join(", ")}])`,
        { code: "E_WRONG_FLAG_TYPE" },
      );
    }
    if (!decl.values.includes(value)) {
      throw new FormatError(
        `Flag '${name}' got value '${value}', expected one of [${decl.values.join(", ")}]`,
        { code: "E_INVALID_FLAG_VALUE" },
      );
    }
    return;
  }

  // Implicit mode (no declared flag). Infer from usage.
  if (usage === "if") {
    if (typeof value !== "boolean") {
      throw new FormatError(
        `Flag '${name}' got ${describeType(value)}, expected boolean (used in '{if ${name}}')`,
        { code: "E_WRONG_FLAG_TYPE" },
      );
    }
    return;
  }
  // switch usage
  if (typeof value !== "string") {
    throw new FormatError(
      `Flag '${name}' got ${describeType(value)}, expected string (used in '{switch ${name}}')`,
      { code: "E_WRONG_FLAG_TYPE" },
    );
  }
  const cases = refs.switches.get(name);
  if (cases !== undefined && !cases.has(value) && !refs.switchesWithElse.has(name)) {
    throw new FormatError(
      `Flag '${name}' got value '${value}', expected one of [${[...cases].join(", ")}] (no '{else}' branch in '{switch ${name}}')`,
      { code: "E_INVALID_FLAG_VALUE" },
    );
  }
};

const describeType = (value: unknown): string => {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return "array";
  if (typeof value === "string") return `string '${value}'`;
  if (typeof value === "boolean") return `boolean ${String(value)}`;
  if (typeof value === "number") return `number ${String(value)}`;
  return typeof value;
};
