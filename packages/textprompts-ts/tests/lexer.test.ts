import { describe, expect, test } from "bun:test";

import { ParseError } from "../src/errors";
import { tokenize } from "../src/lexer";
import { prepareSource } from "../src/source";

const tok = (src: string) => tokenize(prepareSource(src, { dedent: false }));

const expectParseError = (fn: () => unknown, code?: string) => {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(ParseError);
    if (code !== undefined) {
      expect((err as ParseError).code).toBe(code);
    }
    return;
  }
  throw new Error("expected ParseError to be thrown");
};

describe("lexer — variable tags", () => {
  test("plain variable", () => {
    expect(tok("hello {name}!")).toEqual([
      { kind: "Text", value: "hello ", line: 1, column: 1 },
      { kind: "Variable", value: "name", line: 1, column: 7 },
      { kind: "Text", value: "!", line: 1, column: 13 },
    ]);
  });

  test("variable starting with underscore", () => {
    const t = tok("{_name}");
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ kind: "Variable", value: "_name" });
  });

  test("variable with digits inside", () => {
    expect(tok("{x1y2}")[0]).toMatchObject({ kind: "Variable", value: "x1y2" });
  });

  test("variables may start with mixed-case keyword prefixes", () => {
    expect(tok("{Ifx}")[0]).toMatchObject({ kind: "Variable", value: "Ifx" });
    expect(tok("{EndUser}")[0]).toMatchObject({ kind: "Variable", value: "EndUser" });
    expect(tok("{CaseStudy}")[0]).toMatchObject({ kind: "Variable", value: "CaseStudy" });
  });
});

describe("lexer — control tags", () => {
  test("{if flag}", () => {
    const t = tok("{if flag}body{end}");
    expect(t).toEqual([
      { kind: "OpenIf", value: "flag", line: 1, column: 1 },
      { kind: "Text", value: "body", line: 1, column: 10 },
      { kind: "End", value: "", line: 1, column: 14 },
    ]);
  });

  test("{if !flag} carries negation", () => {
    const t = tok("{if !flag}body{end}");
    expect(t[0]).toMatchObject({ kind: "OpenIfNot", value: "flag" });
  });

  test("{else} and {end}", () => {
    const t = tok("{if a}x{else}y{end}");
    const kinds = t.map((x) => x.kind);
    expect(kinds).toEqual(["OpenIf", "Text", "Else", "Text", "End"]);
  });

  test("{switch} + {case}", () => {
    const t = tok("{switch tier}{case free}{end}");
    expect(t[0]).toMatchObject({ kind: "OpenSwitch", value: "tier" });
    expect(t[1]).toMatchObject({ kind: "Case", value: "free" });
    expect(t[2]).toMatchObject({ kind: "End" });
  });

  test("multiple spaces between keyword and identifier allowed", () => {
    const t = tok("{if   flag}{end}");
    expect(t[0]).toMatchObject({ kind: "OpenIf", value: "flag" });
  });
});

describe("lexer — escapes (§2.4)", () => {
  test("{{ and }} collapse to literal { and } in text", () => {
    expect(tok("a{{b}}c")).toEqual([{ kind: "Text", value: "a{b}c", line: 1, column: 1 }]);
  });

  test("backslash has no special meaning and renders literally", () => {
    // Source `a\b` (one backslash between two letters): one Text token,
    // value still `a\b` — the backslash is plain text.
    expect(tok("a\\b")).toEqual([{ kind: "Text", value: "a\\b", line: 1, column: 1 }]);
  });

  test("{{name}} renders as literal {name}, NOT a placeholder", () => {
    const t = tok("{{name}}");
    expect(t).toEqual([{ kind: "Text", value: "{name}", line: 1, column: 1 }]);
    // Key behavior: no Placeholder/Variable token is emitted.
    expect(t.some((x) => x.kind === "Variable")).toBe(false);
  });

  test("any backslash sequence stays literal (no \\n -> newline)", () => {
    expect(tok("a\\nb")).toEqual([{ kind: "Text", value: "a\\nb", line: 1, column: 1 }]);
  });
});

describe("lexer — errors (§10.1)", () => {
  test("uppercase keyword", () => {
    expectParseError(() => tok("{IF flag}{end}"), "E_BAD_TAG");
  });

  test("titlecase keyword", () => {
    expectParseError(() => tok("{If flag}{end}"), "E_BAD_TAG");
  });

  test("whitespace inside braces rejected", () => {
    expectParseError(() => tok("{ if flag }{end}"), "E_BAD_TAG");
  });

  test("trailing whitespace inside braces rejected", () => {
    expectParseError(() => tok("{name }"), "E_BAD_TAG");
  });

  test("bare {if} rejected", () => {
    expectParseError(() => tok("{if}{end}"), "E_BAD_TAG");
  });

  test("bare {switch} rejected", () => {
    expectParseError(() => tok("{switch}{end}"), "E_BAD_TAG");
  });

  test("bare {case} rejected", () => {
    expectParseError(() => tok("{switch t}{case}{end}"), "E_BAD_TAG");
  });

  test("{if !} rejected", () => {
    expectParseError(() => tok("{if !}{end}"), "E_BAD_TAG");
  });

  test("{if ! flag} rejected (space after !)", () => {
    expectParseError(() => tok("{if ! flag}{end}"), "E_BAD_TAG");
  });

  test("{if  !flag} rejected (two spaces before !)", () => {
    // SPEC §2.3: negated form requires exactly one space after `if`.
    try {
      tok("{if  !flag}body{end}");
      throw new Error("expected ParseError to be thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ParseError);
      expect((err as ParseError).code).toBe("E_BAD_TAG");
      expect((err as ParseError).message).toContain("exactly one space");
    }
  });

  test("{if   !flag} rejected (three spaces before !)", () => {
    try {
      tok("{if   !flag}body{end}");
      throw new Error("expected ParseError to be thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ParseError);
      expect((err as ParseError).code).toBe("E_BAD_TAG");
      expect((err as ParseError).message).toContain("exactly one space");
    }
  });

  test("{if !flag} (one space, regression)", () => {
    const t = tok("{if !flag}body{end}");
    expect(t[0]).toMatchObject({ kind: "OpenIfNot", value: "flag" });
  });

  test("{if flag} (one space, regression)", () => {
    const t = tok("{if flag}body{end}");
    expect(t[0]).toMatchObject({ kind: "OpenIf", value: "flag" });
  });

  test("{if  flag} (two spaces non-negated still accepted)", () => {
    const t = tok("{if  flag}body{end}");
    expect(t[0]).toMatchObject({ kind: "OpenIf", value: "flag" });
  });

  test("positional placeholder {0} rejected", () => {
    expectParseError(() => tok("{0}"), "E_BAD_TAG");
  });

  test("empty placeholder {} rejected", () => {
    expectParseError(() => tok("{}"), "E_BAD_TAG");
  });

  test("dash in identifier rejected", () => {
    expectParseError(() => tok("{my-var}"), "E_INVALID_IDENTIFIER");
  });

  test("identifier starting with digit rejected", () => {
    expectParseError(() => tok("{1abc}"), "E_INVALID_IDENTIFIER");
  });

  test("pure positional placeholder takes the E_BAD_TAG path", () => {
    expectParseError(() => tok("{42}"), "E_BAD_TAG");
  });

  test("identifier with weird non-ascii rejected", () => {
    expectParseError(() => tok("{naïve}"), "E_INVALID_IDENTIFIER");
  });

  test("reserved keyword as variable rejected (if)", () => {
    expectParseError(() => tok("{if}"), "E_BAD_TAG");
  });

  test("reserved keyword 'flags' as variable rejected", () => {
    expectParseError(() => tok("{flags}"), "E_RESERVED_IDENTIFIER");
  });

  test("bare reserved keyword 'switch' rejected", () => {
    // {end} alone is a valid End control tag, not a "reserved identifier" error.
    // {switch} (no flag) is the canonical bare-keyword reject case.
    expectParseError(() => tok("{switch}"), "E_BAD_TAG");
  });

  test("{case !free} rejected", () => {
    expectParseError(() => tok("{switch t}{case !free}{end}"), "E_BAD_TAG");
  });

  test("unterminated tag rejected", () => {
    expectParseError(() => tok("{name"), "E_BAD_TAG");
  });

  test("newline inside tag rejected (treated as unterminated)", () => {
    expectParseError(() => tok("{na\nme}"), "E_BAD_TAG");
  });
});

describe("lexer — token line/column tracking", () => {
  test("tokens on second line carry line=2", () => {
    const t = tok("first\n{name}");
    const v = t.find((x) => x.kind === "Variable");
    expect(v).toMatchObject({ kind: "Variable", value: "name", line: 2, column: 1 });
  });

  test("CRLF tokens equal LF tokens", () => {
    const lf = tokenize(prepareSource("a\n{x}\nb"));
    const crlf = tokenize(prepareSource("a\r\n{x}\r\nb"));
    expect(lf).toEqual(crlf);
  });
});
