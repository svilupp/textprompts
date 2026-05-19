/**
 * Renderer tests — SPEC §3.4 worked examples, §10.4 bullets.
 *
 * Each rendering case is asserted byte-for-byte against the SPEC's expected
 * output. The block-form keyword lines must disappear entirely (no stray
 * indentation leaked from `{if}` / `{end}` lines), inline-form punctuation
 * outside the tag must be preserved, and inactive branches must contribute
 * exactly zero bytes.
 */

import { describe, expect, test } from "bun:test";
import { parseBody } from "../src/body-parser";
import { tokenize } from "../src/lexer";
import { render, type FormatInputs } from "../src/renderer";
import { prepareSource } from "../src/source";

const renderSource = (source: string, inputs: FormatInputs): string => {
  const prepared = prepareSource(source);
  const ast = parseBody(tokenize(prepared));
  return render(ast, inputs);
};

describe("renderer — block form (SPEC §3.4)", () => {
  test("block if=true preserves outer text, drops keyword lines", () => {
    const src = "Hello\n{if flag}\nWorld\n{end}\n!\n";
    expect(renderSource(src, { flags: { flag: true }, variables: {} })).toBe(
      "Hello\nWorld\n!\n",
    );
  });

  test("block if=false leaves no stray whitespace", () => {
    const src = "Hello\n{if flag}\nWorld\n{end}\n!\n";
    expect(renderSource(src, { flags: { flag: false }, variables: {} })).toBe(
      "Hello\n!\n",
    );
  });

  test("block if/else, true branch", () => {
    const src = "Hello\n{if flag}\nWorld\n{else}\nThere\n{end}\n!\n";
    expect(renderSource(src, { flags: { flag: true }, variables: {} })).toBe(
      "Hello\nWorld\n!\n",
    );
  });

  test("block if/else, false branch", () => {
    const src = "Hello\n{if flag}\nWorld\n{else}\nThere\n{end}\n!\n";
    expect(renderSource(src, { flags: { flag: false }, variables: {} })).toBe(
      "Hello\nThere\n!\n",
    );
  });

  test("body indentation is preserved when branch renders", () => {
    const src = "Items:\n{if include_items}\n  - Alpha\n  - Beta\n{end}\nDone.\n";
    expect(renderSource(src, { flags: { include_items: true }, variables: {} })).toBe(
      "Items:\n  - Alpha\n  - Beta\nDone.\n",
    );
  });

  test("block with blank lines inside body preserves blanks", () => {
    const src = "A\n{if flag}\n\nB\n\n{end}\nC\n";
    expect(renderSource(src, { flags: { flag: true }, variables: {} })).toBe(
      "A\n\nB\n\nC\n",
    );
  });

  test("block with blank lines inside body — false branch yields nothing", () => {
    const src = "A\n{if flag}\n\nB\n\n{end}\nC\n";
    expect(renderSource(src, { flags: { flag: false }, variables: {} })).toBe("A\nC\n");
  });
});

describe("renderer — nested blocks (SPEC §3.4 / §8.5)", () => {
  test("indented nested blocks drop keyword lines including indent, keep body indent", () => {
    const src = "{if outer}\n  {if inner}\n  body line\n  {end}\n{end}\n";
    expect(
      renderSource(src, { flags: { outer: true, inner: true }, variables: {} }),
    ).toBe("  body line\n");
  });

  test("nested inactive inner leaves nothing", () => {
    const src = "{if outer}\n  {if inner}\n  body line\n  {end}\n{end}\n";
    expect(
      renderSource(src, { flags: { outer: true, inner: false }, variables: {} }),
    ).toBe("");
  });

  test("nested inactive outer leaves nothing", () => {
    const src = "{if outer}\n  {if inner}\n  body line\n  {end}\n{end}\n";
    expect(
      renderSource(src, { flags: { outer: false, inner: true }, variables: {} }),
    ).toBe("");
  });

  test("3-level nesting renders correctly when all on", () => {
    const src = [
      "{if a}",
      "  {if b}",
      "    {if c}",
      "deep",
      "    {end}",
      "  {end}",
      "{end}",
      "",
    ].join("\n");
    expect(
      renderSource(src, {
        flags: { a: true, b: true, c: true },
        variables: {},
      }),
    ).toBe("deep\n");
  });

  test("3-level nesting middle false drops everything", () => {
    const src = [
      "{if a}",
      "  {if b}",
      "    {if c}",
      "deep",
      "    {end}",
      "  {end}",
      "{end}",
      "",
    ].join("\n");
    expect(
      renderSource(src, {
        flags: { a: true, b: false, c: true },
        variables: {},
      }),
    ).toBe("");
  });
});

describe("renderer — inline form (SPEC §3.4)", () => {
  test("inline if preserves surrounding sentence", () => {
    const src = "You are a {role}{if is_admin} (administrator){end}.";
    expect(
      renderSource(src, {
        flags: { is_admin: true },
        variables: { role: "Jan" },
      }),
    ).toBe("You are a Jan (administrator).");
  });

  test("inline if false drops only the tag content; trailing punctuation stays", () => {
    const src = "You are a {role}{if is_admin} (administrator){end}.";
    expect(
      renderSource(src, {
        flags: { is_admin: false },
        variables: { role: "Jan" },
      }),
    ).toBe("You are a Jan.");
  });

  test("inline if/else — true branch", () => {
    const src = "The user is on the {if premium_tier}premium{else}free{end} plan.";
    expect(
      renderSource(src, { flags: { premium_tier: true }, variables: {} }),
    ).toBe("The user is on the premium plan.");
  });

  test("inline if/else — false branch", () => {
    const src = "The user is on the {if premium_tier}premium{else}free{end} plan.";
    expect(
      renderSource(src, { flags: { premium_tier: false }, variables: {} }),
    ).toBe("The user is on the free plan.");
  });

  test("inline with embedded variable — variable still renders when branch active", () => {
    const src = "You are a {role}{if is_admin} (an administrator named {admin_name}){end}.";
    expect(
      renderSource(src, {
        flags: { is_admin: true },
        variables: { role: "Jan", admin_name: "Pat" },
      }),
    ).toBe("You are a Jan (an administrator named Pat).");
  });
});

describe("renderer — switch", () => {
  test("inline switch matches a case", () => {
    const src = "Plan: {switch tier}{case free}free{case premium}premium{else}unknown{end}.";
    expect(renderSource(src, { flags: { tier: "free" }, variables: {} })).toBe(
      "Plan: free.",
    );
  });

  test("inline switch with else catches unenumerated value", () => {
    const src = "Plan: {switch tier}{case free}free{case premium}premium{else}unknown{end}.";
    expect(renderSource(src, { flags: { tier: "trial" }, variables: {} })).toBe(
      "Plan: unknown.",
    );
  });

  test("block switch renders selected case body, drops keyword lines", () => {
    const src = "{switch tier}\n{case free}\nfree plan\n{case premium}\npremium plan\n{end}\n";
    expect(renderSource(src, { flags: { tier: "premium" }, variables: {} })).toBe(
      "premium plan\n",
    );
  });

  test("block switch with no matching case and no else yields empty", () => {
    const src = "{switch tier}\n{case free}\nfree plan\n{end}\n";
    expect(renderSource(src, { flags: { tier: "premium" }, variables: {} })).toBe("");
  });
});

describe("renderer — negation", () => {
  test("{if !flag} renders when flag is false", () => {
    expect(
      renderSource("{if !flag}off{end}", { flags: { flag: false }, variables: {} }),
    ).toBe("off");
  });

  test("{if !flag} renders nothing when flag is true", () => {
    expect(
      renderSource("{if !flag}off{end}", { flags: { flag: true }, variables: {} }),
    ).toBe("");
  });

  test("{if !flag} block form drops keyword lines on false", () => {
    const src = "before\n{if !flag}\noff\n{end}\nafter\n";
    expect(renderSource(src, { flags: { flag: false }, variables: {} })).toBe(
      "before\noff\nafter\n",
    );
  });

  test("{if !flag} block form on true leaves no whitespace", () => {
    const src = "before\n{if !flag}\noff\n{end}\nafter\n";
    expect(renderSource(src, { flags: { flag: true }, variables: {} })).toBe(
      "before\nafter\n",
    );
  });
});

describe("renderer — variable interpolation", () => {
  test("String(value) coerces booleans, numbers, null", () => {
    const src = "a={a}, b={b}, c={c}";
    expect(
      renderSource(src, {
        flags: {},
        variables: { a: 42, b: true, c: null },
      }),
    ).toBe("a=42, b=true, c=null");
  });

  test("reserved keyword as variable value renders literally", () => {
    const src = "Role is {role}.";
    expect(renderSource(src, { flags: {}, variables: { role: "end" } })).toBe(
      "Role is end.",
    );
  });
});
