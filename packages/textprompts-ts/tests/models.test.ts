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

describe("Prompt.fromString", () => {
  test("loads prompt from simple string without metadata", () => {
    const content = "Hello {name}, welcome!";
    const prompt = Prompt.fromString(content);

    expect(prompt.meta?.title).toBe("<string>");
    expect(prompt.format({ name: "Alice" })).toBe("Hello Alice, welcome!");
  });

  test("loads prompt with TOML front-matter", () => {
    const content = `---
title = "Greeting"
version = "1.0.0"
description = "A simple greeting"
---
Hello {name}, welcome to {place}!`;

    const prompt = Prompt.fromString(content, { meta: MetadataMode.ALLOW });

    expect(prompt.meta?.title).toBe("Greeting");
    expect(prompt.meta?.version).toBe("1.0.0");
    expect(prompt.meta?.description).toBe("A simple greeting");
    expect(prompt.format({ name: "Bob", place: "Paris" })).toBe("Hello Bob, welcome to Paris!");
  });

  test("uses custom path parameter for title when no metadata", () => {
    const content = "Simple prompt";
    const prompt = Prompt.fromString(content, { path: "custom-prompt.txt" });

    expect(prompt.meta?.title).toBe("custom-prompt");
    expect(prompt.path).toContain("custom-prompt.txt");
  });

  test("respects IGNORE metadata mode", () => {
    const content = `---
title = "Should Be Ignored"
---
Content here`;

    const prompt = Prompt.fromString(content, { meta: MetadataMode.IGNORE, path: "test.txt" });

    expect(prompt.meta?.title).toBe("test");
    expect(prompt.toString()).toContain("---");
  });

  test("respects ALLOW metadata mode", () => {
    const content = `---
title = "Partial Meta"
---
Content`;

    const prompt = Prompt.fromString(content, { meta: MetadataMode.ALLOW });

    expect(prompt.meta?.title).toBe("Partial Meta");
    expect(prompt.meta?.version).toBeUndefined();
  });

  test("respects STRICT metadata mode with complete metadata", () => {
    const content = `---
title = "Complete"
version = "1.0.0"
description = "Full metadata"
---
Content`;

    const prompt = Prompt.fromString(content, { meta: MetadataMode.STRICT });

    expect(prompt.meta?.title).toBe("Complete");
    expect(prompt.meta?.version).toBe("1.0.0");
    expect(prompt.meta?.description).toBe("Full metadata");
  });

  test("throws error in STRICT mode with incomplete metadata", () => {
    const content = `---
title = "Incomplete"
---
Content`;

    expect(() => {
      Prompt.fromString(content, { meta: MetadataMode.STRICT });
    }).toThrow("Missing required metadata fields");
  });

  test("throws error in STRICT mode without metadata", () => {
    const content = "Just content, no metadata";

    expect(() => {
      Prompt.fromString(content, { meta: MetadataMode.STRICT });
    }).toThrow("No metadata found");
  });

  test("handles placeholders correctly", () => {
    const content = "Order {order_id} status: {status}";
    const prompt = Prompt.fromString(content);

    expect(prompt.format({ order_id: "12345", status: "shipped" })).toBe("Order 12345 status: shipped");
  });

  test("throws error for empty content", () => {
    expect(() => Prompt.fromString("")).toThrow("Prompt body is empty");
    expect(() => Prompt.fromString("   ")).toThrow("Prompt body is empty");
  });

  test("handles multiline content with indentation", () => {
    const content = `
    Line 1
    Line 2
      Indented
    `;

    const prompt = Prompt.fromString(content);
    expect(prompt.toString()).toContain("Line 1");
    expect(prompt.toString()).toContain("Line 2");
  });

  test("handles malformed front-matter", () => {
    const content = `---
title = "Missing closing delimiter
Content`;

    expect(() => {
      Prompt.fromString(content, { meta: MetadataMode.ALLOW });
    }).toThrow();
  });

  test("handles invalid TOML syntax", () => {
    const content = `---
title = invalid toml syntax
---
Content`;

    expect(() => {
      Prompt.fromString(content, { meta: MetadataMode.ALLOW });
    }).toThrow("Invalid TOML");
  });

  test("default path is <string>", () => {
    const content = "Test content";
    const prompt = Prompt.fromString(content);

    expect(prompt.path).toContain("<string>");
  });

  test("supports all prompt methods", () => {
    const content = "Test content";
    const prompt = Prompt.fromString(content);

    expect(prompt.strip()).toBe("Test content");
    expect(prompt.slice(0, 4)).toBe("Test");
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt.valueOf()).toBe("Test content");
    expect(prompt.toString()).toBe("Test content");
  });
});
