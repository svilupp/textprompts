import { describe, expect, test } from "bun:test";

import { PromptString } from "../src/prompt-string";

describe("PromptString", () => {
  test("validates placeholders", () => {
    const prompt = new PromptString("Hello {name}");
    expect(prompt.format({ name: "Alice" })).toBe("Hello Alice");
    expect(() => prompt.format({})).toThrow(/Missing format variables/);
  });

  test("allows partial formatting", () => {
    const prompt = new PromptString("Hello {name}, your code is {status}");
    const result = prompt.format({ name: "Bob" }, { skipValidation: true });
    expect(result).toContain("Bob");
    expect(result).toContain("{status}");
  });

  test("requires enough positional args for repeated empty placeholders", () => {
    const prompt = new PromptString("{} {}");
    expect(() => prompt.format(["Alice"])).toThrow(
      /Missing positional format variables for empty placeholders/,
    );
  });

  test("partial formatting fills empty placeholders from args in order", () => {
    const prompt = new PromptString("{} {} {name}");
    const result = prompt.format(["Alice"], { name: "Bob" }, { skipValidation: true });
    expect(result).toBe("Alice {} Bob");
  });
});
