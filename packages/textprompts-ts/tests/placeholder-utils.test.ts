import { describe, expect, test } from "bun:test";

import { extractPlaceholders, getPlaceholderInfo, validateFormatArgs } from "../src/placeholder-utils";

describe("extractPlaceholders", () => {
  test("extracts simple placeholders", () => {
    expect(extractPlaceholders("Hello {name}")).toEqual(new Set(["name"]));
    expect(extractPlaceholders("{greeting} {name}")).toEqual(new Set(["greeting", "name"]));
  });

  test("extracts positional placeholders", () => {
    expect(extractPlaceholders("Hello {0}")).toEqual(new Set(["0"]));
    expect(extractPlaceholders("{0} {1} {2}")).toEqual(new Set(["0", "1", "2"]));
  });

  test("extracts placeholders with format specifiers", () => {
    expect(extractPlaceholders("Price: ${price:.2f}")).toEqual(new Set(["price"]));
    expect(extractPlaceholders("Number: {value:02d}")).toEqual(new Set(["value"]));
  });

  test("ignores escaped braces", () => {
    expect(extractPlaceholders("{{not a placeholder}}")).toEqual(new Set());
    expect(extractPlaceholders("{{escaped}} but {real}")).toEqual(new Set(["real"]));
  });

  test("handles empty placeholders", () => {
    expect(extractPlaceholders("Hello {}")).toEqual(new Set([""]));
  });

  test("handles no placeholders", () => {
    expect(extractPlaceholders("Hello world")).toEqual(new Set());
    expect(extractPlaceholders("")).toEqual(new Set());
  });

  test("deduplicates placeholders", () => {
    expect(extractPlaceholders("{name} and {name} again")).toEqual(new Set(["name"]));
  });
});

describe("validateFormatArgs", () => {
  test("validates successfully with correct args", () => {
    expect(() => validateFormatArgs(new Set(["name"]), [], { name: "Alice" })).not.toThrow();
    expect(() => validateFormatArgs(new Set(["0", "1"]), ["Alice", "Bob"], {})).not.toThrow();
  });

  test("throws on missing variables", () => {
    expect(() => validateFormatArgs(new Set(["name"]), [], {})).toThrow(/Missing format variables/);
    expect(() => validateFormatArgs(new Set(["name"]), [], {})).toThrow(/\["name"\]/);
  });

  test("allows extra variables", () => {
    expect(() => validateFormatArgs(new Set(["name"]), [], { name: "Alice", extra: "value" })).not.toThrow();
  });

  test("skips validation when requested", () => {
    expect(() => validateFormatArgs(new Set(["name"]), [], {}, true)).not.toThrow();
  });

  test("converts positional args to string keys", () => {
    expect(() => validateFormatArgs(new Set(["0", "1"]), ["Alice", "Bob"], {})).not.toThrow();
  });

  test("handles empty placeholder with positional arg", () => {
    expect(() => validateFormatArgs(new Set([""]), ["Alice"], {})).not.toThrow();
  });
});

describe("getPlaceholderInfo", () => {
  test("identifies named placeholders", () => {
    const info = getPlaceholderInfo("Hello {name}, you are {age}");
    expect(info.count).toBe(2);
    expect(info.names).toEqual(new Set(["name", "age"]));
    expect(info.hasPositional).toBe(false);
    expect(info.hasNamed).toBe(true);
    expect(info.isMixed).toBe(false);
  });

  test("identifies positional placeholders", () => {
    const info = getPlaceholderInfo("Hello {0}, you are {1}");
    expect(info.count).toBe(2);
    expect(info.names).toEqual(new Set(["0", "1"]));
    expect(info.hasPositional).toBe(true);
    expect(info.hasNamed).toBe(false);
    expect(info.isMixed).toBe(false);
  });

  test("identifies mixed placeholders", () => {
    const info = getPlaceholderInfo("Hello {0}, you are {age} years old");
    expect(info.count).toBe(2);
    expect(info.names).toEqual(new Set(["0", "age"]));
    expect(info.hasPositional).toBe(true);
    expect(info.hasNamed).toBe(true);
    expect(info.isMixed).toBe(true);
  });

  test("handles no placeholders", () => {
    const info = getPlaceholderInfo("Hello world");
    expect(info.count).toBe(0);
    expect(info.names).toEqual(new Set());
    expect(info.hasPositional).toBe(false);
    expect(info.hasNamed).toBe(false);
    expect(info.isMixed).toBe(false);
  });

  test("handles format specifiers", () => {
    const info = getPlaceholderInfo("Price: ${price:.2f}, Count: {count:d}");
    expect(info.count).toBe(2);
    expect(info.names).toEqual(new Set(["price", "count"]));
    expect(info.hasNamed).toBe(true);
  });

  test("handles empty placeholder", () => {
    const info = getPlaceholderInfo("Hello {}");
    expect(info.count).toBe(1);
    expect(info.names).toEqual(new Set([""]));
  });
});
