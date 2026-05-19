/**
 * Format-time validation tests — SPEC §5.5–§5.7, §10.5.
 *
 * Asserts the right error code fires for every documented failure mode,
 * confirms variables in *inactive* branches are still required (§5.2),
 * confirms extra inputs are silently ignored (§5.7), and confirms reserved
 * keywords are forbidden as input keys but permitted as variable values
 * (§5.5 last paragraph).
 */

import { describe, expect, test } from "bun:test";
import { parseBody } from "../src/body-parser";
import { FormatError } from "../src/errors";
import { validateInputs, collectRequiredRefs } from "../src/format-validation";
import type { FlagDecl, VarDecl } from "../src/frontmatter-schema";
import { tokenize } from "../src/lexer";
import type { PromptMeta } from "../src/models";
import type { FormatInputs } from "../src/renderer";
import { prepareSource } from "../src/source";

const buildMeta = (
  flags: Record<string, FlagDecl> = {},
  variables: Record<string, VarDecl> = {},
): PromptMeta => ({
  extras: {},
  flags,
  variables,
});

const parse = (source: string) => {
  return parseBody(tokenize(prepareSource(source)));
};

const validate = (source: string, inputs: FormatInputs, meta?: PromptMeta): void => {
  const ast = parse(source);
  validateInputs(meta ?? buildMeta(), ast, inputs);
};

const expectFormatError = (fn: () => void, code: string): FormatError => {
  let caught: unknown;
  try {
    fn();
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(FormatError);
  const err = caught as FormatError;
  expect(err.code).toBe(code as never);
  return err;
};

describe("collectRequiredRefs — visits all branches (SPEC §5.2)", () => {
  test("collects variables from both if and else", () => {
    const ast = parse("{if has}{x}{else}{y}{end}");
    const refs = collectRequiredRefs(ast);
    expect(refs.variables.has("x")).toBe(true);
    expect(refs.variables.has("y")).toBe(true);
    expect(refs.flags.has("has")).toBe(true);
  });

  test("collects switch cases and else", () => {
    const ast = parse(
      "{switch tier}{case free}{a}{case premium}{b}{else}{c}{end}",
    );
    const refs = collectRequiredRefs(ast);
    expect(refs.variables.has("a")).toBe(true);
    expect(refs.variables.has("b")).toBe(true);
    expect(refs.variables.has("c")).toBe(true);
    const cases = refs.switches.get("tier");
    expect(cases?.has("free")).toBe(true);
    expect(cases?.has("premium")).toBe(true);
    expect(refs.switchesWithElse.has("tier")).toBe(true);
  });

  test("nested branches all walked", () => {
    const ast = parse("{if a}{if b}{x}{end}{end}");
    const refs = collectRequiredRefs(ast);
    expect(refs.flags.has("a")).toBe(true);
    expect(refs.flags.has("b")).toBe(true);
    expect(refs.variables.has("x")).toBe(true);
  });
});

describe("validateInputs — missing inputs", () => {
  test("E_MISSING_FLAG when an individual flag is not provided", () => {
    const err = expectFormatError(
      () =>
        validate("{if foo}body{end}", {
          flags: {},
          variables: {},
        }),
      "E_MISSING_FLAG",
    );
    expect(err.message).toContain("foo");
  });

  test("E_MISSING_VARIABLE for a referenced variable", () => {
    const err = expectFormatError(
      () => validate("Hello {name}", { flags: {}, variables: {} }),
      "E_MISSING_VARIABLE",
    );
    expect(err.message).toContain("name");
  });

  test("variable in inactive branch is still required (SPEC §5.2)", () => {
    const err = expectFormatError(
      () =>
        validate("{if has}{last}{end}", {
          flags: { has: false },
          variables: {},
        }),
      "E_MISSING_VARIABLE",
    );
    expect(err.message).toContain("last");
  });

  test("variable in switch else branch is still required even when matched case fires", () => {
    expectFormatError(
      () =>
        validate(
          "{switch t}{case a}plain{else}{fallback}{end}",
          { flags: { t: "a" }, variables: {} },
        ),
      "E_MISSING_VARIABLE",
    );
  });
});

describe("validateInputs — flags parameter shape", () => {
  test("E_MISSING_FLAGS_OBJECT when prompt uses flags and inputs.flags is null", () => {
    const err = expectFormatError(
      () =>
        validate(
          "{if foo}x{end}",
          { flags: null as unknown as Record<string, boolean | string>, variables: {} },
        ),
      "E_MISSING_FLAGS_OBJECT",
    );
    expect(err.message).toContain("foo");
  });

  test("E_BAD_FLAGS_TYPE when inputs.flags is a string", () => {
    expectFormatError(
      () =>
        validate(
          "{if foo}x{end}",
          { flags: "oops" as unknown as Record<string, boolean | string>, variables: {} },
        ),
      "E_BAD_FLAGS_TYPE",
    );
  });

  test("E_BAD_FLAGS_TYPE when inputs.flags is an array", () => {
    expectFormatError(
      () =>
        validate(
          "{if foo}x{end}",
          { flags: ["foo"] as unknown as Record<string, boolean | string>, variables: {} },
        ),
      "E_BAD_FLAGS_TYPE",
    );
  });

  test("no flags used → no flags object needed", () => {
    expect(() =>
      validate(
        "Hello {name}",
        { flags: undefined as unknown as Record<string, boolean | string>, variables: { name: "x" } },
      ),
    ).not.toThrow();
  });
});

describe("validateInputs — type checks (no coercion, SPEC §5.5)", () => {
  test("declared boolean flag rejects string '\"true\"'", () => {
    const meta = buildMeta({ foo: { kind: "boolean", extras: {} } });
    expectFormatError(
      () =>
        validate(
          "{if foo}x{end}",
          { flags: { foo: "true" }, variables: {} },
          meta,
        ),
      "E_WRONG_FLAG_TYPE",
    );
  });

  test("declared enum flag rejects boolean", () => {
    const meta = buildMeta({
      tier: { kind: "enum", values: ["free", "premium"], extras: {} },
    });
    expectFormatError(
      () =>
        validate(
          "{switch tier}{case free}f{case premium}p{end}",
          {
            flags: { tier: true as unknown as string },
            variables: {},
          },
          meta,
        ),
      "E_WRONG_FLAG_TYPE",
    );
  });

  test("declared enum flag with unenumerated value raises E_INVALID_FLAG_VALUE", () => {
    const meta = buildMeta({
      tier: { kind: "enum", values: ["free", "premium"], extras: {} },
    });
    const err = expectFormatError(
      () =>
        validate(
          "{switch tier}{case free}f{case premium}p{end}",
          { flags: { tier: "enterprise" }, variables: {} },
          meta,
        ),
      "E_INVALID_FLAG_VALUE",
    );
    expect(err.message).toContain("enterprise");
  });

  test("implicit boolean flag (no declaration, used in {if}) rejects string", () => {
    expectFormatError(
      () =>
        validate("{if foo}x{end}", {
          flags: { foo: "true" },
          variables: {},
        }),
      "E_WRONG_FLAG_TYPE",
    );
  });

  test("implicit switch with no {else}: unenumerated value rejected", () => {
    expectFormatError(
      () =>
        validate(
          "{switch tier}{case free}f{case premium}p{end}",
          { flags: { tier: "enterprise" }, variables: {} },
        ),
      "E_INVALID_FLAG_VALUE",
    );
  });

  test("implicit switch WITH {else}: unenumerated value is allowed", () => {
    expect(() =>
      validate(
        "{switch tier}{case free}f{case premium}p{else}u{end}",
        { flags: { tier: "enterprise" }, variables: {} },
      ),
    ).not.toThrow();
  });

  test("declared enum WITH body {else}: unenumerated value still errors (declared values authoritative)", () => {
    const meta = buildMeta({
      tier: { kind: "enum", values: ["free", "premium"], extras: {} },
    });
    expectFormatError(
      () =>
        validate(
          "{switch tier}{case free}f{case premium}p{else}u{end}",
          { flags: { tier: "enterprise" }, variables: {} },
          meta,
        ),
      "E_INVALID_FLAG_VALUE",
    );
  });
});

describe("validateInputs — reserved keys (SPEC §5.5)", () => {
  test("E_RESERVED_KEY when 'flags' appears as a variable key", () => {
    expectFormatError(
      () =>
        validate("Hello {name}", {
          flags: {},
          variables: { name: "ok", flags: "bad" },
        }),
      "E_RESERVED_KEY",
    );
  });

  test("E_RESERVED_KEY when 'end' appears as a flag key", () => {
    expectFormatError(
      () =>
        validate("hi", {
          flags: { end: true },
          variables: {},
        }),
      "E_RESERVED_KEY",
    );
  });

  test("reserved keyword as a variable VALUE is allowed and renders literally", () => {
    expect(() =>
      validate("Role is {role}.", {
        flags: {},
        variables: { role: "end" },
      }),
    ).not.toThrow();
  });
});

describe("validateInputs — extra inputs (SPEC §5.7)", () => {
  test("extra variables are silently ignored", () => {
    expect(() =>
      validate("Hello {name}", {
        flags: {},
        variables: { name: "x", unused: "y" },
      }),
    ).not.toThrow();
  });

  test("extra flags are silently ignored", () => {
    expect(() =>
      validate("{if foo}x{end}", {
        flags: { foo: true, bogus: true },
        variables: {},
      }),
    ).not.toThrow();
  });

  test("declared-but-unused variables and flags are not required", () => {
    const meta = buildMeta(
      { unused_flag: { kind: "boolean", extras: {} } },
      { unused_var: { extras: {} } },
    );
    expect(() => validate("just text", { flags: {}, variables: {} }, meta)).not.toThrow();
  });
});

describe("validateInputs — happy paths", () => {
  test("complete inputs validate cleanly", () => {
    expect(() =>
      validate(
        "{if has}{last}{end}",
        { flags: { has: true }, variables: { last: "q" } },
      ),
    ).not.toThrow();
  });

  test("inactive branch with var present validates cleanly", () => {
    expect(() =>
      validate(
        "{if has}{last}{end}",
        { flags: { has: false }, variables: { last: "q" } },
      ),
    ).not.toThrow();
  });

  test("declared enum flag with valid value validates", () => {
    const meta = buildMeta({
      tier: { kind: "enum", values: ["free", "premium"], extras: {} },
    });
    expect(() =>
      validate(
        "{switch tier}{case free}f{case premium}p{end}",
        { flags: { tier: "free" }, variables: {} },
        meta,
      ),
    ).not.toThrow();
  });
});
