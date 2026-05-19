import { describe, expect, test } from "bun:test";

import { dedent, prepareSource } from "../src/source";

describe("prepareSource", () => {
  test("strips a UTF-8 BOM at file start", () => {
    const withBom = "﻿hello\n";
    expect(prepareSource(withBom)).toBe("hello\n");
  });

  test("does not strip a BOM mid-string", () => {
    const mid = "hello﻿world";
    expect(prepareSource(mid)).toBe("hello﻿world");
  });

  test("normalizes CRLF to LF", () => {
    expect(prepareSource("a\r\nb\r\nc")).toBe("a\nb\nc");
  });

  test("normalizes lone CR to LF", () => {
    expect(prepareSource("a\rb\rc")).toBe("a\nb\nc");
  });

  test("CRLF and LF inputs produce identical output", () => {
    const lf = "line one\nline two\n";
    const crlf = "line one\r\nline two\r\n";
    expect(prepareSource(crlf)).toBe(prepareSource(lf));
  });

  test("dedent removes the minimum common leading whitespace", () => {
    const input = ["    one", "      two", "    three"].join("\n");
    expect(prepareSource(input)).toBe(["one", "  two", "three"].join("\n"));
  });

  test("dedent ignores blank lines for minimum calculation", () => {
    const input = ["  a", "", "  b"].join("\n");
    expect(prepareSource(input)).toBe(["a", "", "b"].join("\n"));
  });

  test("dedent is a no-op when any non-blank line has zero indent", () => {
    const input = "first\n  second\n";
    expect(prepareSource(input)).toBe("first\n  second\n");
  });

  test("dedent can be disabled", () => {
    const input = "  a\n  b";
    expect(prepareSource(input, { dedent: false })).toBe("  a\n  b");
  });

  test("standalone dedent helper matches prepareSource behaviour", () => {
    const input = "  a\n  b";
    expect(dedent(input)).toBe("a\nb");
  });

  test("BOM + CRLF combine correctly", () => {
    const input = "﻿a\r\nb";
    expect(prepareSource(input)).toBe("a\nb");
  });
});
