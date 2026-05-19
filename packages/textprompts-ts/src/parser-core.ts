import { MetadataMode, resolveMetadataMode } from "./config";
import {
  FrontmatterError,
  InvalidMetadataError,
  MalformedHeaderError,
  MissingMetadataError,
  ParseError,
  SemanticError,
} from "./errors";
import { collectRequiredRefs, type RequiredRefs } from "./format-validation";
import type { FlagDecl } from "./frontmatter-schema";
import { parseFlagsAndVariables } from "./frontmatter-schema";
import { type FrontmatterFormat, Prompt, type PromptLoadOptions, type PromptMeta } from "./models";
import { basename, extname } from "./path-utils";
import { PromptString } from "./prompt-string";
import { prepareSource } from "./source";
import { parseToml } from "./toml";
import { parseYaml } from "./yaml";

const DELIM = "---";

const splitFrontMatter = (text: string): { header: string | null; body: string } => {
  if (!text.startsWith(DELIM)) {
    return { header: null, body: text };
  }
  if (text.length > DELIM.length && text[DELIM.length] !== "\n") {
    throw new MalformedHeaderError("Opening delimiter '---' must be on its own line");
  }
  const lines = text.split("\n");
  const closingLineIndex = lines.findIndex((line, index) => index > 0 && line === DELIM);
  if (closingLineIndex === -1) {
    throw new MalformedHeaderError("Missing closing delimiter '---' for front matter");
  }
  const header = lines.slice(1, closingLineIndex).join("\n").trim();
  let body = lines.slice(closingLineIndex + 1).join("\n");
  if (body.startsWith("\n")) {
    body = body.slice(1);
  }
  return { header, body };
};

const KNOWN_FIELDS = new Set(["title", "description", "version", "author", "created"]);
const SCHEMA_KEYS = new Set(["flags", "variables"]);

const coerceToString = (value: unknown): string | null => {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString().split("T")[0] as string;
  if (value == null) return null;
  return String(value);
};

const ensurePromptMeta = (data: Record<string, unknown>): PromptMeta => {
  const meta: PromptMeta = { extras: {}, flags: {}, variables: {} };
  for (const key of KNOWN_FIELDS) {
    const value = data[key];
    if (value == null) continue;
    const str = coerceToString(value);
    if (str != null) {
      (meta as unknown as Record<string, unknown>)[key] = str;
    }
  }
  const { flags, variables } = parseFlagsAndVariables(data);
  meta.flags = flags;
  meta.variables = variables;

  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (KNOWN_FIELDS.has(key) || SCHEMA_KEYS.has(key)) continue;
    extras[key] = value;
  }
  meta.extras = extras;
  return meta;
};

const enforceStrictStandardFields = (meta: PromptMeta): void => {
  const required = ["title", "description", "version"] as const;
  const missing = required.filter((key) => {
    const value = meta[key];
    return value == null;
  });
  if (missing.length > 0) {
    throw new InvalidMetadataError(
      `Missing required metadata fields: ${missing.join(", ")}. STRICT mode requires 'title', 'description', and 'version' fields.`,
    );
  }
  const empty = required.filter((key) => {
    const value = meta[key];
    return value != null && String(value).trim() === "";
  });
  if (empty.length > 0) {
    throw new InvalidMetadataError(
      `Empty required metadata fields: ${empty.join(", ")}. STRICT mode requires non-empty 'title', 'description', and 'version' fields.`,
    );
  }
};

const parseHeader = (headerText: string, format: FrontmatterFormat): Record<string, unknown> => {
  if (format === "toml") {
    try {
      return parseToml(headerText);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new InvalidMetadataError(`Invalid TOML in front matter: ${msg}`);
    }
  }
  if (format === "yaml") {
    try {
      return parseYaml(headerText);
    } catch (error) {
      if (error instanceof InvalidMetadataError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      throw new InvalidMetadataError(`Invalid YAML in front matter: ${msg}`);
    }
  }
  // "auto" — TOML first, YAML fallback.
  try {
    return parseToml(headerText);
  } catch (tomlError) {
    try {
      return parseYaml(headerText);
    } catch (yamlError) {
      if (yamlError instanceof InvalidMetadataError) throw yamlError;
      const tomlMsg = tomlError instanceof Error ? tomlError.message : String(tomlError);
      throw new InvalidMetadataError(`Invalid TOML in front matter: ${tomlMsg}`);
    }
  }
};

// ---------------------------------------------------------------------------
// Body-vs-declared reconciliation (SPEC §4.7, §5.1, §5.3).
// ---------------------------------------------------------------------------

const reconcileBodyAndDecls = (
  body: string,
  sourcePath: string,
  meta: PromptMeta,
  mode: MetadataMode,
): RequiredRefs => {
  // We parse the body once for reconciliation. PromptString parses again when
  // constructed; that's the price of validating before constructing the
  // wrapper. The cost is negligible for any real-sized prompt.
  const { parseBody } = require("./body-parser") as typeof import("./body-parser");
  const { tokenize } = require("./lexer") as typeof import("./lexer");
  const ast = parseBody(tokenize(body, sourcePath), sourcePath);
  const refs = collectRequiredRefs(ast);

  // Same name as variable AND flag in body usage.
  for (const name of refs.variables) {
    if (refs.flags.has(name) || refs.switches.has(name)) {
      throw new SemanticError(
        `Name '${name}' is used as both a flag and a variable in the prompt body`,
        { code: "E_FLAG_AND_VARIABLE_COLLISION", path: sourcePath },
      );
    }
  }
  for (const name of refs.flags) {
    if (refs.switches.has(name)) {
      throw new SemanticError(
        `Flag '${name}' is used as both a boolean '{if}' flag and an enum '{switch}' flag`,
        { code: "E_FLAG_USED_AS_BOTH_IF_AND_SWITCH", path: sourcePath },
      );
    }
  }

  // Reconcile against declarations.
  const declFlags = meta.flags;

  if (mode === MetadataMode.STRICT) {
    // Every body flag must be declared.
    const allBodyFlags = new Set<string>([...refs.flags, ...refs.switches.keys()]);
    for (const name of allBodyFlags) {
      if (!Object.hasOwn(declFlags, name)) {
        throw new SemanticError(
          `Flag '${name}' used in body but not declared in [flags.*] (strict mode)`,
          { code: "E_UNDECLARED_FLAG", path: sourcePath },
        );
      }
    }
    // Every declared flag must have a non-empty description.
    for (const [name, decl] of Object.entries(declFlags)) {
      const desc = decl.description;
      if (desc === undefined || desc.trim() === "") {
        throw new FrontmatterError(
          `Flag '${name}' is declared without a non-empty description (strict mode)`,
          { code: "E_BAD_SCHEMA_SHAPE", path: `flags.${name}.description` },
        );
      }
    }
  }

  // Type-shape disagreements (apply under both "allow" and "strict" when a
  // declaration is present).
  for (const name of refs.flags) {
    const decl: FlagDecl | undefined = declFlags[name];
    if (decl === undefined) continue;
    if (decl.kind === "enum") {
      throw new SemanticError(
        `Flag '${name}' is declared as enum but used in '{if ${name}}'; switch on it instead`,
        { code: "E_FLAG_USED_AS_BOTH_IF_AND_SWITCH", path: sourcePath },
      );
    }
  }

  for (const [name, caseValues] of refs.switches) {
    const decl: FlagDecl | undefined = declFlags[name];
    if (decl === undefined) continue;
    if (decl.kind === "boolean") {
      throw new SemanticError(
        `Flag '${name}' is declared as boolean but used in '{switch ${name}}'`,
        { code: "E_FLAG_USED_AS_BOTH_IF_AND_SWITCH", path: sourcePath },
      );
    }
    // enum: check each case value is in declared values.
    for (const v of caseValues) {
      if (!decl.values.includes(v)) {
        throw new SemanticError(
          `'{case ${v}}' is not a declared value of enum flag '${name}' (declared: [${decl.values.join(", ")}])`,
          { code: "E_INVALID_CASE_VALUE", path: sourcePath },
        );
      }
    }
    // Exhaustiveness: every declared value must appear in cases, unless an
    // {else} branch is present.
    const hasElse = refs.switchesWithElse.has(name);
    if (!hasElse) {
      const missing = decl.values.filter((v) => !caseValues.has(v));
      if (missing.length > 0) {
        throw new SemanticError(
          `Switch on '${name}' missing cases: [${missing.join(", ")}]. Add a '{case}' for each, or add '{else}'.`,
          { code: "E_NON_EXHAUSTIVE_SWITCH", path: sourcePath },
        );
      }
    }
  }

  return refs;
};

const addImplicitFlagDecls = (meta: PromptMeta, refs: RequiredRefs): void => {
  for (const name of refs.flags) {
    if (meta.flags[name] === undefined) {
      meta.flags[name] = { kind: "boolean", extras: {} };
    }
  }
  for (const [name, caseValues] of refs.switches) {
    if (meta.flags[name] === undefined) {
      meta.flags[name] = {
        kind: "enum",
        values: [...caseValues],
        extras: {},
      };
    }
  }
};

const cloneMetaForValidation = (meta: PromptMeta): PromptMeta => ({
  ...meta,
  extras: meta.extras,
  flags: { ...meta.flags },
  variables: { ...meta.variables },
});

// ---------------------------------------------------------------------------
// Top-level parseString.
// ---------------------------------------------------------------------------

export const parseString = (
  content: string,
  sourcePath: string,
  options: PromptLoadOptions | MetadataMode | string | null = {},
): Prompt => {
  // Backwards-tolerant: accept a bare MetadataMode string as the legacy
  // positional shape some internal callers used. Public users pass an object.
  let opts: PromptLoadOptions;
  if (typeof options === "string" || options === null) {
    opts = { metadata: options };
  } else {
    opts = options;
  }
  const mode = resolveMetadataMode(opts.metadata ?? null);
  const format: FrontmatterFormat = opts.frontmatterFormat ?? "auto";

  // SPEC §2.5: line ending + BOM normalization is the very first step.
  const normalized = content.replace(/\r\n?/g, "\n").replace(/^﻿/, "");

  if (mode === MetadataMode.IGNORE) {
    // SPEC §4.6: the source is NOT inspected for frontmatter at all. The
    // entire file is the prompt body. A malformed `---` block is not an error
    // because there is no header in this mode.
    // SPEC §2.5: empty-prompt only fires when the entire file (after newline +
    // BOM normalization) is whitespace-only. A file containing only a
    // frontmatter-looking block IS the body and is therefore non-empty.
    const prepared = prepareSource(normalized, { dedent: true });
    if (prepared.trim().length === 0) {
      throw new ParseError("prompt file is empty", {
        code: "E_EMPTY_PROMPT",
        path: sourcePath,
      });
    }
    const title = basename(sourcePath, extname(sourcePath));
    const meta: PromptMeta = { title, extras: {}, flags: {}, variables: {} };
    const refs = reconcileBodyAndDecls(prepared, sourcePath, meta, mode);
    const validationMeta = cloneMetaForValidation(meta);
    addImplicitFlagDecls(meta, refs);
    // PromptString re-applies prepareSource defensively; pass already-prepared
    // body so reconciliation and construction see the same text.
    const ps = new PromptString(prepared, validationMeta, sourcePath);
    return new Prompt({ path: sourcePath, meta, prompt: ps });
  }

  let header: string | null;
  let body: string;
  try {
    ({ header, body } = splitFrontMatter(normalized));
  } catch (error) {
    if (normalized.startsWith(DELIM) && error instanceof MalformedHeaderError) {
      throw new InvalidMetadataError(
        `${error.message}. If this content has no metadata and starts with '---', use metadata: "ignore" to skip metadata parsing.`,
      );
    }
    throw error;
  }

  let meta: PromptMeta = { extras: {}, flags: {}, variables: {} };

  if (header !== null && header.length > 0) {
    try {
      const data = parseHeader(header, format);
      meta = ensurePromptMeta(data);
      if (mode === MetadataMode.STRICT) {
        enforceStrictStandardFields(meta);
      }
    } catch (error) {
      if (
        error instanceof InvalidMetadataError ||
        error instanceof MalformedHeaderError ||
        error instanceof FrontmatterError
      ) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new InvalidMetadataError(`Invalid metadata: ${message}`);
    }
  } else if (header !== null && header.length === 0) {
    // Empty frontmatter `---\n---` is equivalent to no frontmatter (§4.1).
    if (mode === MetadataMode.STRICT) {
      throw new MissingMetadataError(
        `No metadata found in ${sourcePath}. STRICT mode requires metadata with title, description, and version fields.`,
      );
    }
  } else {
    if (mode === MetadataMode.STRICT) {
      throw new MissingMetadataError(
        `No metadata found in ${sourcePath}. STRICT mode requires metadata with title, description, and version fields.`,
      );
    }
  }

  if (!meta.title) {
    meta.title = basename(sourcePath, extname(sourcePath));
  }

  // Empty-body check before reconciliation.
  const preparedBody = prepareSource(body, { dedent: true });
  if (preparedBody.trim().length === 0) {
    throw new ParseError("prompt file is empty", {
      code: "E_EMPTY_PROMPT",
      path: sourcePath,
    });
  }

  // Reconcile body refs vs declared flags.
  const refs = reconcileBodyAndDecls(preparedBody, sourcePath, meta, mode);
  const validationMeta = cloneMetaForValidation(meta);
  if (mode !== MetadataMode.STRICT) {
    addImplicitFlagDecls(meta, refs);
  }

  const ps = new PromptString(preparedBody, validationMeta, sourcePath);
  return new Prompt({ path: sourcePath, meta, prompt: ps });
};
