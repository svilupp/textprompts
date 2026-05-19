// Frontmatter schema for textprompts v2:
// validate [flags.*] and [variables.*] sections from parsed frontmatter
// and produce typed declaration records.
//
// This module is intentionally narrow. It does not touch body parsing,
// loader modes, or rendering. It receives a plain object produced by the
// frontmatter parser (TOML or YAML) and returns validated declarations
// plus per-record `extras` for any unknown fields. All other top-level
// frontmatter fields are the caller's responsibility — see
// `parser-core.ts:ensurePromptMeta` for how they roll into `meta.extras`.

import { FrontmatterError } from "./errors";

const IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const RESERVED_KEYWORDS = new Set(["if", "else", "end", "switch", "case", "flags"]);

const FLAG_KNOWN_FIELDS = new Set(["type", "values", "description"]);
const VARIABLE_KNOWN_FIELDS = new Set(["description"]);

export interface BooleanFlag {
  kind: "boolean";
  description?: string;
  extras: Record<string, unknown>;
}

export interface EnumFlag {
  kind: "enum";
  values: string[];
  description?: string;
  extras: Record<string, unknown>;
}

export type FlagDecl = BooleanFlag | EnumFlag;

export interface VarDecl {
  description?: string;
  extras: Record<string, unknown>;
}

export interface ParsedFrontmatterSchema {
  flags: Record<string, FlagDecl>;
  variables: Record<string, VarDecl>;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date)
  );
};

const assertValidIdentifier = (
  name: string,
  pathLabel: string,
  errorClass: string = "name",
): void => {
  if (!IDENTIFIER_PATTERN.test(name)) {
    throw new FrontmatterError(
      `invalid identifier ${JSON.stringify(name)} at ${pathLabel}: ${errorClass} must match [a-zA-Z_][a-zA-Z0-9_]*`,
      { code: "E_INVALID_IDENTIFIER", path: pathLabel },
    );
  }
  if (RESERVED_KEYWORDS.has(name)) {
    throw new FrontmatterError(
      `reserved keyword ${JSON.stringify(name)} cannot be used as ${errorClass} at ${pathLabel}`,
      { code: "E_RESERVED_IDENTIFIER", path: pathLabel },
    );
  }
};

const parseFlagDecl = (name: string, raw: unknown): FlagDecl => {
  const pathLabel = `flags.${name}`;
  if (!isPlainObject(raw)) {
    throw new FrontmatterError(
      `flag ${JSON.stringify(name)} must be a table/object, got ${typeof raw}`,
      { code: "E_BAD_SCHEMA_SHAPE", path: pathLabel },
    );
  }

  const rawType = raw.type;
  let kind: "boolean" | "enum";
  if (rawType === undefined) {
    kind = "boolean";
  } else if (rawType === "boolean" || rawType === "enum") {
    kind = rawType;
  } else {
    throw new FrontmatterError(
      `flag ${JSON.stringify(name)} has invalid type ${JSON.stringify(rawType)}: expected "boolean" or "enum"`,
      { code: "E_INVALID_FLAG_TYPE", path: pathLabel },
    );
  }

  let description: string | undefined;
  if (raw.description !== undefined) {
    if (typeof raw.description !== "string") {
      throw new FrontmatterError(`flag ${JSON.stringify(name)} description must be a string`, {
        code: "E_BAD_SCHEMA_SHAPE",
        path: `${pathLabel}.description`,
      });
    }
    description = raw.description;
  }

  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!FLAG_KNOWN_FIELDS.has(key)) {
      extras[key] = value;
    }
  }

  if (kind === "boolean") {
    if (raw.values !== undefined) {
      throw new FrontmatterError(`boolean flag ${JSON.stringify(name)} must not declare "values"`, {
        code: "E_INVALID_FLAG_VALUES",
        path: `${pathLabel}.values`,
      });
    }
    const decl: BooleanFlag = { kind: "boolean", extras };
    if (description !== undefined) {
      decl.description = description;
    }
    return decl;
  }

  // enum
  if (raw.values === undefined) {
    throw new FrontmatterError(
      `enum flag ${JSON.stringify(name)} requires non-empty "values" array`,
      { code: "E_INVALID_FLAG_VALUES", path: `${pathLabel}.values` },
    );
  }
  if (!Array.isArray(raw.values)) {
    throw new FrontmatterError(`enum flag ${JSON.stringify(name)} "values" must be an array`, {
      code: "E_INVALID_FLAG_VALUES",
      path: `${pathLabel}.values`,
    });
  }
  if (raw.values.length === 0) {
    throw new FrontmatterError(`enum flag ${JSON.stringify(name)} "values" must not be empty`, {
      code: "E_INVALID_FLAG_VALUES",
      path: `${pathLabel}.values`,
    });
  }
  const seen = new Set<string>();
  const values: string[] = [];
  for (const v of raw.values) {
    if (typeof v !== "string") {
      throw new FrontmatterError(
        `enum flag ${JSON.stringify(name)} "values" entries must be identifier strings, got ${typeof v}`,
        { code: "E_INVALID_FLAG_VALUES", path: `${pathLabel}.values` },
      );
    }
    if (!IDENTIFIER_PATTERN.test(v)) {
      throw new FrontmatterError(
        `enum flag ${JSON.stringify(name)} value ${JSON.stringify(v)} is not a valid identifier`,
        { code: "E_INVALID_IDENTIFIER", path: `${pathLabel}.values` },
      );
    }
    if (RESERVED_KEYWORDS.has(v)) {
      throw new FrontmatterError(
        `enum flag ${JSON.stringify(name)} value ${JSON.stringify(v)} is a reserved keyword`,
        { code: "E_RESERVED_IDENTIFIER", path: `${pathLabel}.values` },
      );
    }
    if (seen.has(v)) {
      throw new FrontmatterError(
        `enum flag ${JSON.stringify(name)} has duplicate value ${JSON.stringify(v)}`,
        { code: "E_INVALID_FLAG_VALUES", path: `${pathLabel}.values` },
      );
    }
    seen.add(v);
    values.push(v);
  }

  const decl: EnumFlag = { kind: "enum", values, extras };
  if (description !== undefined) {
    decl.description = description;
  }
  return decl;
};

const parseVarDecl = (name: string, raw: unknown): VarDecl => {
  const pathLabel = `variables.${name}`;
  if (!isPlainObject(raw)) {
    throw new FrontmatterError(
      `variable ${JSON.stringify(name)} must be a table/object, got ${typeof raw}`,
      { code: "E_BAD_SCHEMA_SHAPE", path: pathLabel },
    );
  }

  let description: string | undefined;
  if (raw.description !== undefined) {
    if (typeof raw.description !== "string") {
      throw new FrontmatterError(`variable ${JSON.stringify(name)} description must be a string`, {
        code: "E_BAD_SCHEMA_SHAPE",
        path: `${pathLabel}.description`,
      });
    }
    description = raw.description;
  }

  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!VARIABLE_KNOWN_FIELDS.has(key)) {
      extras[key] = value;
    }
  }

  const decl: VarDecl = { extras };
  if (description !== undefined) {
    decl.description = description;
  }
  return decl;
};

/**
 * Validate `[flags.*]` and `[variables.*]` sections from parsed frontmatter
 * and return typed declaration records.
 *
 * Errors:
 * - `E_INVALID_IDENTIFIER` — flag/var/enum-value name fails the identifier regex.
 * - `E_RESERVED_IDENTIFIER` — name is a reserved keyword.
 * - `E_DUPLICATE_NAME` — same name appears in both `[flags.*]` and `[variables.*]`.
 * - `E_INVALID_FLAG_TYPE` — flag `type` is set and not `"boolean"`/`"enum"`.
 * - `E_INVALID_FLAG_VALUES` — enum `values` missing/empty/wrong type/duplicate;
 *   boolean has `values`.
 * - `E_BAD_SCHEMA_SHAPE` — `flags` or `variables` (or one of their children)
 *   is not an object, or `description` is not a string.
 *
 * Empty frontmatter (no `flags` or `variables` keys) returns empty records.
 */
export const parseFlagsAndVariables = (data: Record<string, unknown>): ParsedFrontmatterSchema => {
  const flags: Record<string, FlagDecl> = {};
  const variables: Record<string, VarDecl> = {};

  const rawFlags = data.flags;
  if (rawFlags !== undefined) {
    if (!isPlainObject(rawFlags)) {
      throw new FrontmatterError(
        `"flags" section must be a table/object, got ${Array.isArray(rawFlags) ? "array" : typeof rawFlags}`,
        { code: "E_BAD_SCHEMA_SHAPE", path: "flags" },
      );
    }
    for (const [name, raw] of Object.entries(rawFlags)) {
      assertValidIdentifier(name, `flags.${name}`, "flag name");
      flags[name] = parseFlagDecl(name, raw);
    }
  }

  const rawVariables = data.variables;
  if (rawVariables !== undefined) {
    if (!isPlainObject(rawVariables)) {
      throw new FrontmatterError(
        `"variables" section must be a table/object, got ${Array.isArray(rawVariables) ? "array" : typeof rawVariables}`,
        { code: "E_BAD_SCHEMA_SHAPE", path: "variables" },
      );
    }
    for (const [name, raw] of Object.entries(rawVariables)) {
      assertValidIdentifier(name, `variables.${name}`, "variable name");
      variables[name] = parseVarDecl(name, raw);
    }
  }

  for (const name of Object.keys(flags)) {
    if (name in variables) {
      throw new FrontmatterError(
        `name ${JSON.stringify(name)} is declared as both a flag and a variable`,
        { code: "E_DUPLICATE_NAME", path: name },
      );
    }
  }

  return { flags, variables };
};
