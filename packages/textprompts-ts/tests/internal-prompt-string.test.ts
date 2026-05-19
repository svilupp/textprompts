import { describe, expect, test } from "bun:test";

import { PromptString } from "../src/prompt-string";

describe("PromptString (internal)", () => {
  test("substitutes named variables", () => {
    const ps = new PromptString("Hello {name}");
    expect(ps.format({ name: "Alice" })).toBe("Hello Alice");
  });

  test("renders boolean conditionals via flags", () => {
    const ps = new PromptString("Hello{if extra} there{end}!");
    expect(ps.format({ flags: { extra: true } })).toBe("Hello there!");
    expect(ps.format({ flags: { extra: false } })).toBe("Hello!");
  });

  test("renders enum switches via flags", () => {
    const ps = new PromptString(
      "{switch tier}{case free}f{case premium}p{else}?{end}",
    );
    expect(ps.format({ flags: { tier: "free" } })).toBe("f");
    expect(ps.format({ flags: { tier: "premium" } })).toBe("p");
    expect(ps.format({ flags: { tier: "other" } })).toBe("?");
  });

  test("caches AST so repeated format calls work", () => {
    const ps = new PromptString("Hello {name}");
    expect(ps.format({ name: "A" })).toBe("Hello A");
    expect(ps.format({ name: "B" })).toBe("Hello B");
  });

  test("empty source throws ParseError", () => {
    expect(() => new PromptString("")).toThrow(/prompt file is empty/i);
    expect(() => new PromptString("   ")).toThrow(/prompt file is empty/i);
  });

  test("toString and valueOf return the prepared source", () => {
    const ps = new PromptString("Hello");
    expect(ps.toString()).toBe("Hello");
    expect(ps.valueOf()).toBe("Hello");
  });

  test("missing flag raises FormatError", () => {
    const ps = new PromptString("{if foo}x{end}");
    // No flags object means E_MISSING_FLAGS_OBJECT; passing empty object means
    // the individual flag is missing.
    expect(() => ps.format({ flags: {} })).toThrow(/Flag 'foo' required/);
  });

  test("passing flags as a string throws", () => {
    const ps = new PromptString("{if foo}x{end}");
    // @ts-expect-error: flags must be an object
    expect(() => ps.format({ flags: "oops" })).toThrow(/flags/i);
  });
});
