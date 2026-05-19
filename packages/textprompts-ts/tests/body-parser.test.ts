import { describe, expect, test } from "bun:test";

import type { IfNode, Node, SwitchNode, TextNode, VariableNode } from "../src/ast";
import { parseBody } from "../src/body-parser";
import { ParseError } from "../src/errors";
import { tokenize } from "../src/lexer";
import { prepareSource } from "../src/source";

const parse = (src: string): Node[] => parseBody(tokenize(prepareSource(src, { dedent: false })));

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

const asText = (n: Node | undefined): TextNode => {
  if (!n || n.kind !== "text") throw new Error(`expected text, got ${n?.kind}`);
  return n;
};

const asIf = (n: Node | undefined): IfNode => {
  if (!n || n.kind !== "if") throw new Error(`expected if, got ${n?.kind}`);
  return n;
};

const asSwitch = (n: Node | undefined): SwitchNode => {
  if (!n || n.kind !== "switch") throw new Error(`expected switch, got ${n?.kind}`);
  return n;
};

const asVar = (n: Node | undefined): VariableNode => {
  if (!n || n.kind !== "variable") throw new Error(`expected variable, got ${n?.kind}`);
  return n;
};

describe("body-parser — basics", () => {
  test("plain text", () => {
    const nodes = parse("hello");
    expect(nodes).toEqual([{ kind: "text", value: "hello" }]);
  });

  test("variable", () => {
    const nodes = parse("hi {name}!");
    expect(nodes).toHaveLength(3);
    expect(asText(nodes[0]).value).toBe("hi ");
    expect(asVar(nodes[1]).name).toBe("name");
    expect(asText(nodes[2]).value).toBe("!");
  });
});

describe("body-parser — inline if (§3.2 / §3.4)", () => {
  test("simple inline if", () => {
    const nodes = parse("x {if f}a{end} y");
    expect(nodes).toHaveLength(3);
    const ifNode = asIf(nodes[1]);
    expect(ifNode.form).toBe("inline");
    expect(ifNode.flag).toBe("f");
    expect(ifNode.negated).toBe(false);
    expect(ifNode.body).toEqual([{ kind: "text", value: "a" }]);
    expect(ifNode.elseBody).toBeUndefined();
  });

  test("inline if/else", () => {
    const nodes = parse("x {if f}a{else}b{end} y");
    const ifNode = asIf(nodes[1]);
    expect(ifNode.form).toBe("inline");
    expect(ifNode.body).toEqual([{ kind: "text", value: "a" }]);
    expect(ifNode.elseBody).toEqual([{ kind: "text", value: "b" }]);
  });

  test("inline negated if", () => {
    const ifNode = asIf(parse("{if !f}a{end}")[0]);
    expect(ifNode.negated).toBe(true);
    expect(ifNode.form).toBe("inline");
  });

  test("inline with embedded variable in branch", () => {
    const ifNode = asIf(parse("a{if f} ({x}){end}.")[1]);
    expect(ifNode.body).toHaveLength(3);
    expect(asText(ifNode.body[0]).value).toBe(" (");
    expect(asVar(ifNode.body[1]).name).toBe("x");
    expect(asText(ifNode.body[2]).value).toBe(")");
  });
});

describe("body-parser — block if (§3.2 / §3.4)", () => {
  test("simple block if, keyword lines stripped from bodies", () => {
    const src = "Hello\n{if flag}\nWorld\n{end}\n!\n";
    const nodes = parse(src);
    // Expected: ["Hello\n", IfNode(form=block, body=[Text("World\n")]), "!\n"]
    expect(nodes).toHaveLength(3);
    expect(asText(nodes[0]).value).toBe("Hello\n");
    const ifNode = asIf(nodes[1]);
    expect(ifNode.form).toBe("block");
    expect(ifNode.body).toEqual([{ kind: "text", value: "World\n" }]);
    expect(asText(nodes[2]).value).toBe("!\n");
  });

  test("block if with else", () => {
    const src = "A\n{if f}\nB\n{else}\nC\n{end}\nD\n";
    const nodes = parse(src);
    const ifNode = asIf(nodes[1]);
    expect(ifNode.form).toBe("block");
    expect(ifNode.body).toEqual([{ kind: "text", value: "B\n" }]);
    expect(ifNode.elseBody).toEqual([{ kind: "text", value: "C\n" }]);
    expect(asText(nodes[2]).value).toBe("D\n");
  });

  test("block if with indented keyword lines", () => {
    const src = "{if outer}\n  {if inner}\n  body line\n  {end}\n{end}\n";
    const nodes = parse(src);
    const outer = asIf(nodes[0]);
    expect(outer.form).toBe("block");
    expect(outer.body).toHaveLength(1);
    const inner = asIf(outer.body[0]);
    expect(inner.form).toBe("block");
    expect(inner.body).toEqual([{ kind: "text", value: "  body line\n" }]);
  });

  test("body indentation preserved when keyword is at column 0", () => {
    const src = "Items:\n{if include}\n  - Alpha\n  - Beta\n{end}\nDone.\n";
    const nodes = parse(src);
    const ifNode = asIf(nodes[1]);
    expect(ifNode.body).toEqual([{ kind: "text", value: "  - Alpha\n  - Beta\n" }]);
  });
});

describe("body-parser — switch", () => {
  test("simple block switch", () => {
    const src = "{switch tier}\n{case free}\nfree text\n{case premium}\npremium text\n{end}\n";
    const nodes = parse(src);
    const sw = asSwitch(nodes[0]);
    expect(sw.flag).toBe("tier");
    expect(sw.form).toBe("block");
    expect(sw.cases).toHaveLength(2);
    expect(sw.cases[0]).toEqual({ value: "free", body: [{ kind: "text", value: "free text\n" }] });
    expect(sw.cases[1]).toEqual({
      value: "premium",
      body: [{ kind: "text", value: "premium text\n" }],
    });
  });

  test("switch with else", () => {
    const src = "{switch t}\n{case a}\nA\n{else}\nOther\n{end}\n";
    const sw = asSwitch(parse(src)[0]);
    expect(sw.cases).toHaveLength(1);
    expect(sw.elseBody).toEqual([{ kind: "text", value: "Other\n" }]);
  });

  test("inline switch", () => {
    const nodes = parse("Plan: {switch tier}{case free}free{case premium}premium{else}unknown{end}.");
    const sw = asSwitch(nodes[1]);
    expect(sw.form).toBe("inline");
    expect(sw.cases).toEqual([
      { value: "free", body: [{ kind: "text", value: "free" }] },
      { value: "premium", body: [{ kind: "text", value: "premium" }] },
    ]);
    expect(sw.elseBody).toEqual([{ kind: "text", value: "unknown" }]);
  });

  test("empty case body permitted", () => {
    const src = "{switch t}\n{case a}\n{case b}\nB\n{end}\n";
    const sw = asSwitch(parse(src)[0]);
    expect(sw.cases[0]).toEqual({ value: "a", body: [] });
    expect(sw.cases[1]).toEqual({ value: "b", body: [{ kind: "text", value: "B\n" }] });
  });
});

describe("body-parser — structural errors (§3.1)", () => {
  test("unclosed if", () => {
    expectParseError(() => parse("{if a}body"), "E_UNCLOSED_IF");
  });

  test("unclosed switch", () => {
    expectParseError(() => parse("{switch t}{case a}a"), "E_UNCLOSED_SWITCH");
  });

  test("stray {end}", () => {
    expectParseError(() => parse("hello {end}"), "E_EXTRA_END");
  });

  test("stray {else}", () => {
    expectParseError(() => parse("hello {else}"), "E_ELSE_BEFORE_CASE");
  });

  test("switch with zero cases", () => {
    expectParseError(() => parse("{switch t}\n{end}\n"), "E_SWITCH_NO_CASES");
  });

  test("text between switch and first case", () => {
    expectParseError(
      () => parse("{switch t} stuff {case a}{end}"),
      "E_TEXT_BEFORE_FIRST_CASE",
    );
  });

  test("variable between switch and first case", () => {
    expectParseError(
      () => parse("{switch t}{x}{case a}{end}"),
      "E_TEXT_BEFORE_FIRST_CASE",
    );
  });

  test("duplicate case", () => {
    expectParseError(
      () => parse("{switch t}\n{case a}\nA\n{case a}\nA2\n{end}\n"),
      "E_DUPLICATE_CASE",
    );
  });

  test("multiple else in switch", () => {
    expectParseError(
      () => parse("{switch t}\n{case a}\nA\n{else}\nx\n{else}\ny\n{end}\n"),
      "E_ELSE_BEFORE_CASE",
    );
  });

  test("case after else in switch", () => {
    expectParseError(
      () => parse("{switch t}\n{case a}\nA\n{else}\nx\n{case b}\nB\n{end}\n"),
      "E_ELSE_BEFORE_CASE",
    );
  });

  test("else before any case in switch", () => {
    expectParseError(() => parse("{switch t}\n{else}\nx\n{end}\n"), "E_ELSE_BEFORE_CASE");
  });
});

describe("body-parser — form rules (§3.2)", () => {
  test("mixed: prefix text + block-style end on separate line", () => {
    // {if flag} on a line with content -> inline. {end} on a different line
    // -> mixed-form error.
    const src = "prefix {if flag}\nmulti\n{end}\n";
    expectParseError(() => parse(src), "E_MIXED_FORM");
  });

  test("mixed: block opener, inline end on suffix line", () => {
    const src = "{if flag}\nbody {end} suffix\n";
    expectParseError(() => parse(src), "E_MIXED_FORM");
  });

  test("mixed: inline opener, block end", () => {
    const src = "{if flag}inline body\n{end}\n";
    expectParseError(() => parse(src), "E_MIXED_FORM");
  });

  test("mixed: block opener, inline-style end", () => {
    const src = "{if flag}\nbody {end}\n";
    expectParseError(() => parse(src), "E_MIXED_FORM");
  });

  test("legal: two adjacent constructs, one inline + one block", () => {
    const src = "{if flag} short note {end}\n{if flag}\nlonger body\n{end}\n";
    const nodes = parse(src);
    const inline = asIf(nodes[0]);
    expect(inline.form).toBe("inline");
    expect(inline.body).toEqual([{ kind: "text", value: " short note " }]);
    // there's a "\n" text node between, then block if
    const blockIdx = nodes.findIndex((n) => n.kind === "if" && (n as IfNode).form === "block");
    expect(blockIdx).toBeGreaterThan(0);
    const block = asIf(nodes[blockIdx]);
    expect(block.form).toBe("block");
    expect(block.body).toEqual([{ kind: "text", value: "longer body\n" }]);
  });
});

describe("body-parser — deep nesting (§10.2)", () => {
  test("5-level nested block ifs round-trip into AST", () => {
    const src = "{if a}\n{if b}\n{if c}\n{if d}\n{if e}\nleaf\n{end}\n{end}\n{end}\n{end}\n{end}\n";
    const nodes = parse(src);
    const a = asIf(nodes[0]);
    expect(a.form).toBe("block");
    const b = asIf(a.body[0]);
    const c = asIf(b.body[0]);
    const d = asIf(c.body[0]);
    const e = asIf(d.body[0]);
    expect(e.body).toEqual([{ kind: "text", value: "leaf\n" }]);
  });

  test("20-level nested block ifs parse without crash", () => {
    let src = "";
    for (let i = 0; i < 20; i += 1) src += `{if a${i}}\n`;
    src += "leaf\n";
    for (let i = 0; i < 20; i += 1) src += "{end}\n";
    const nodes = parse(src);
    expect(nodes).toHaveLength(1);
    let cur = asIf(nodes[0]);
    for (let i = 0; i < 19; i += 1) {
      cur = asIf(cur.body[0]);
    }
    expect(cur.body).toEqual([{ kind: "text", value: "leaf\n" }]);
  });
});

describe("body-parser — multiple inline constructs on one line", () => {
  test("two inline ifs side by side", () => {
    const nodes = parse("{if a}A{end}{if b}B{end}");
    expect(nodes).toHaveLength(2);
    expect(asIf(nodes[0]).form).toBe("inline");
    expect(asIf(nodes[1]).form).toBe("inline");
  });
});
