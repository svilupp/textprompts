import { describe, expect, test } from "bun:test";
import { join } from "path";

import { Prompt, PromptMeta } from "../src/models";
import { PromptString } from "../src/prompt-string";
import { MetadataMode } from "../src/config";

describe("Prompt", () => {
  test("constructor validates empty prompt body", () => {
    expect(() => new Prompt({ path: "/test.txt", meta: null, prompt: "" })).toThrow("Prompt body is empty");
    expect(() => new Prompt({ path: "/test.txt", meta: null, prompt: "   " })).toThrow("Prompt body is empty");
  });

  test("constructor accepts string or PromptString", () => {
    const p1 = new Prompt({ path: "/test.txt", meta: null, prompt: "Hello" });
    expect(p1.prompt).toBeInstanceOf(PromptString);

    const p2 = new Prompt({ path: "/test.txt", meta: null, prompt: new PromptString("Hello") });
    expect(p2.prompt).toBeInstanceOf(PromptString);
  });

  test("fromPath loads prompt from file", async () => {
    const prompt = await Prompt.fromPath(join(__dirname, "fixtures", "with-meta.txt"), { meta: MetadataMode.ALLOW });
    expect(prompt.meta?.title).toBe("Assistant");
    expect(prompt.format({ name: "Alice" })).toContain("Alice");
  });

  test("toString returns prompt string", () => {
    const prompt = new Prompt({ path: "/test.txt", meta: null, prompt: "Hello world" });
    expect(prompt.toString()).toBe("Hello world");
  });

  test("valueOf returns prompt string", () => {
    const prompt = new Prompt({ path: "/test.txt", meta: null, prompt: "Hello world" });
    expect(prompt.valueOf()).toBe("Hello world");
  });

  test("strip trims whitespace", () => {
    const prompt = new Prompt({ path: "/test.txt", meta: null, prompt: "  Hello  " });
    expect(prompt.strip()).toBe("Hello");
  });

  test("slice returns substring", () => {
    const prompt = new Prompt({ path: "/test.txt", meta: null, prompt: "Hello world" });
    expect(prompt.slice(0, 5)).toBe("Hello");
    expect(prompt.slice(6)).toBe("world");
  });

  test("length property", () => {
    const prompt = new Prompt({ path: "/test.txt", meta: null, prompt: "Hello" });
    expect(prompt.length).toBe(5);
  });

  test("format delegates to PromptString with object syntax", () => {
    const prompt = new Prompt({ path: "/test.txt", meta: null, prompt: "Hello {name}" });
    expect(prompt.format({ name: "Alice" })).toBe("Hello Alice");
  });

  test("format delegates to PromptString with args/kwargs syntax", () => {
    const prompt = new Prompt({ path: "/test.txt", meta: null, prompt: "Hello {0}, you are {age}" });
    expect(prompt.format(["Bob"], { age: 30 })).toBe("Hello Bob, you are 30");
  });

  test("path is resolved to absolute", () => {
    const prompt = new Prompt({ path: "test.txt", meta: null, prompt: "Hello" });
    expect(prompt.path).toContain("test.txt");
    expect(prompt.path.startsWith("/")).toBe(true);
  });
});
