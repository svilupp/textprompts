import { describe, expect, test } from "bun:test";
import { join } from "path";

import { MetadataMode } from "../src/config";
import { Prompt } from "../src/models";

describe("Prompt", () => {
  test("constructor accepts a string body", () => {
    const p = new Prompt({ path: "/test.txt", meta: null, prompt: "Hello" });
    expect(p.prompt.toString()).toBe("Hello");
  });

  test("constructor rejects empty body", () => {
    expect(() => new Prompt({ path: "/test.txt", meta: null, prompt: "" })).toThrow(
      /prompt file is empty/i,
    );
    expect(() => new Prompt({ path: "/test.txt", meta: null, prompt: "   " })).toThrow(
      /prompt file is empty/i,
    );
  });

  test("fromPath loads prompt from file", async () => {
    const prompt = await Prompt.fromPath(join(__dirname, "fixtures", "with-meta.txt"), {
      metadata: MetadataMode.ALLOW,
    });
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

  test("format substitutes named variables", () => {
    const prompt = new Prompt({ path: "/test.txt", meta: null, prompt: "Hello {name}" });
    expect(prompt.format({ name: "Alice" })).toBe("Hello Alice");
  });

  test("format with flags renders conditional", () => {
    const prompt = new Prompt({
      path: "/test.txt",
      meta: null,
      prompt: "Hello{if extra} there{end}!",
    });
    expect(prompt.format({ flags: { extra: true } })).toBe("Hello there!");
    expect(prompt.format({ flags: { extra: false } })).toBe("Hello!");
  });

  test("format throws E_MISSING_FLAGS_OBJECT when flags key entirely omitted", () => {
    // SPEC §5.6: distinct error when caller passes no `flags` key at all
    // (vs. an empty flags object, which falls through to per-flag E_MISSING_FLAG).
    const prompt = new Prompt({
      path: "/test.txt",
      meta: null,
      prompt: "Hi{if extra} there{end}",
    });
    try {
      prompt.format({});
      throw new Error("expected error");
    } catch (err) {
      const e = err as { code?: string; message: string };
      expect(e.code).toBe("E_MISSING_FLAGS_OBJECT");
      expect(e.message).toContain("extra");
    }
  });

  test("format throws E_MISSING_FLAG (not _FLAGS_OBJECT) when flags is present but empty", () => {
    const prompt = new Prompt({
      path: "/test.txt",
      meta: null,
      prompt: "Hi{if extra} there{end}",
    });
    try {
      prompt.format({ flags: {} });
      throw new Error("expected error");
    } catch (err) {
      const e = err as { code?: string };
      expect(e.code).toBe("E_MISSING_FLAG");
    }
  });

  test("path is stored as-is", () => {
    const prompt = new Prompt({ path: "test.txt", meta: null, prompt: "Hello" });
    expect(prompt.path).toBe("test.txt");
  });
});

describe("Prompt.fromString", () => {
  test("loads prompt from simple string without metadata", () => {
    const content = "Hello {name}, welcome!";
    const prompt = Prompt.fromString(content);

    expect(prompt.meta?.title).toBe("<string>");
    expect(prompt.format({ name: "Alice" })).toBe("Hello Alice, welcome!");
  });

  test("adds implicit flag declarations to metadata", () => {
    const prompt = Prompt.fromString(
      "{if friendly}Hi{end}\n{switch tier}{case free}F{case premium}P{end}",
    );

    expect(prompt.meta.flags.friendly).toEqual({ kind: "boolean", extras: {} });
    expect(prompt.meta.flags.tier).toEqual({
      kind: "enum",
      values: ["free", "premium"],
      extras: {},
    });
  });

  test("loads prompt with TOML front-matter", () => {
    const content = `---
title = "Greeting"
version = "1.0.0"
description = "A simple greeting"
---
Hello {name}, welcome to {place}!`;

    const prompt = Prompt.fromString(content, { metadata: MetadataMode.ALLOW });

    expect(prompt.meta?.title).toBe("Greeting");
    expect(prompt.meta?.version).toBe("1.0.0");
    expect(prompt.meta?.description).toBe("A simple greeting");
    expect(prompt.format({ name: "Bob", place: "Paris" })).toBe(
      "Hello Bob, welcome to Paris!",
    );
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

    const prompt = Prompt.fromString(content, {
      metadata: MetadataMode.IGNORE,
      path: "test.txt",
    });

    expect(prompt.meta?.title).toBe("test");
    // SPEC §4.6: in "ignore" mode the entire file is the body — the `---` block
    // is NOT stripped.
    expect(prompt.toString()).toBe('---\ntitle = "Should Be Ignored"\n---\nContent here');
  });

  test("respects ALLOW metadata mode", () => {
    const content = `---
title = "Partial Meta"
---
Content`;

    const prompt = Prompt.fromString(content, { metadata: MetadataMode.ALLOW });

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

    const prompt = Prompt.fromString(content, { metadata: MetadataMode.STRICT });

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
      Prompt.fromString(content, { metadata: MetadataMode.STRICT });
    }).toThrow("Missing required metadata fields");
  });

  test("throws error in STRICT mode without metadata", () => {
    const content = "Just content, no metadata";

    expect(() => {
      Prompt.fromString(content, { metadata: MetadataMode.STRICT });
    }).toThrow("No metadata found");
  });

  test("handles placeholders correctly", () => {
    const content = "Order {order_id} status: {status}";
    const prompt = Prompt.fromString(content);

    expect(prompt.format({ order_id: "12345", status: "shipped" })).toBe(
      "Order 12345 status: shipped",
    );
  });

  test("throws error for empty content", () => {
    expect(() => Prompt.fromString("")).toThrow(/prompt file is empty/i);
    expect(() => Prompt.fromString("   ")).toThrow(/prompt file is empty/i);
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
      Prompt.fromString(content, { metadata: MetadataMode.ALLOW });
    }).toThrow();
  });

  test("handles invalid TOML syntax", () => {
    const content = `---
title = invalid toml syntax
---
Content`;

    expect(() => {
      Prompt.fromString(content, { metadata: MetadataMode.ALLOW });
    }).toThrow(/Invalid TOML/);
  });

  test("default path is <string>", () => {
    const content = "Test content";
    const prompt = Prompt.fromString(content);

    expect(prompt.path).toContain("<string>");
  });
});
