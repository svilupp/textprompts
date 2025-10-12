import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import { loadPrompt } from "../src/loaders";
import { MetadataMode } from "../src/config";
import { InvalidMetadataError, MalformedHeaderError } from "../src/errors";

describe("parser edge cases", () => {
  let tempDir: string;

  const createTempDir = async () => {
    tempDir = await mkdtemp(join(tmpdir(), "textprompts-test-"));
  };

  const cleanupTempDir = async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  };

  test("empty file throws error", async () => {
    await createTempDir();
    const filePath = join(tempDir, "empty.txt");
    await writeFile(filePath, "");

    await expect(loadPrompt(filePath, { meta: MetadataMode.IGNORE })).rejects.toThrow("Prompt body is empty");

    await cleanupTempDir();
  });

  test("whitespace-only file throws error", async () => {
    await createTempDir();
    const filePath = join(tempDir, "whitespace.txt");
    await writeFile(filePath, "   \n\n  \t  ");

    await expect(loadPrompt(filePath, { meta: MetadataMode.IGNORE })).rejects.toThrow("Prompt body is empty");

    await cleanupTempDir();
  });

  test("malformed header missing closing delimiter", async () => {
    await createTempDir();
    const filePath = join(tempDir, "malformed.txt");
    await writeFile(filePath, "---\ntitle = 'Test'\nno closing delimiter");

    await expect(loadPrompt(filePath, { meta: MetadataMode.ALLOW })).rejects.toThrow(InvalidMetadataError);
    await expect(loadPrompt(filePath, { meta: MetadataMode.ALLOW })).rejects.toThrow(/Missing closing delimiter/);

    await cleanupTempDir();
  });

  test("invalid TOML provides helpful error", async () => {
    await createTempDir();
    const filePath = join(tempDir, "invalid-toml.txt");
    await writeFile(filePath, '---\ntitle = "Missing quote\n---\nContent');

    await expect(loadPrompt(filePath, { meta: MetadataMode.ALLOW })).rejects.toThrow(InvalidMetadataError);
    await expect(loadPrompt(filePath, { meta: MetadataMode.ALLOW })).rejects.toThrow(/Invalid metadata/);

    await cleanupTempDir();
  });

  test("file starting with --- suggests IGNORE mode", async () => {
    await createTempDir();
    const filePath = join(tempDir, "starts-with-dash.txt");
    await writeFile(filePath, "---\ninvalid content without closing\nBody content");

    await expect(loadPrompt(filePath, { meta: MetadataMode.ALLOW })).rejects.toThrow(/meta=MetadataMode.IGNORE/);

    await cleanupTempDir();
  });

  test("triple dashes in body are preserved", async () => {
    await createTempDir();
    const filePath = join(tempDir, "dashes.txt");
    await writeFile(filePath, "---\ntitle = 'Test'\n---\n\nSome content\n---\nMore dashes");

    const prompt = await loadPrompt(filePath, { meta: MetadataMode.ALLOW });
    expect(prompt.prompt.toString()).toContain("---");
    expect(prompt.prompt.toString()).toContain("More dashes");

    await cleanupTempDir();
  });

  test("header-only file throws error", async () => {
    await createTempDir();
    const filePath = join(tempDir, "header-only.txt");
    await writeFile(filePath, "---\ntitle = 'Test'\n---\n\n  \n");

    await expect(loadPrompt(filePath, { meta: MetadataMode.ALLOW })).rejects.toThrow("Prompt body is empty");

    await cleanupTempDir();
  });

  test("dedent removes common indentation", async () => {
    await createTempDir();
    const filePath = join(tempDir, "indented.txt");
    await writeFile(filePath, "    Line 1\n    Line 2\n    Line 3");

    const prompt = await loadPrompt(filePath, { meta: MetadataMode.IGNORE });
    expect(prompt.prompt.toString()).toBe("Line 1\nLine 2\nLine 3");

    await cleanupTempDir();
  });

  test("dedent preserves relative indentation", async () => {
    await createTempDir();
    const filePath = join(tempDir, "relative-indent.txt");
    await writeFile(filePath, "  Line 1\n    Line 2\n  Line 3");

    const prompt = await loadPrompt(filePath, { meta: MetadataMode.IGNORE });
    expect(prompt.prompt.toString()).toBe("Line 1\n  Line 2\nLine 3");

    await cleanupTempDir();
  });

  test("IGNORE mode includes metadata in body", async () => {
    await createTempDir();
    const filePath = join(tempDir, "ignore-meta.txt");
    await writeFile(filePath, "---\ntitle = 'Test'\n---\nBody content");

    const prompt = await loadPrompt(filePath, { meta: MetadataMode.IGNORE });
    expect(prompt.prompt.toString()).toContain("title = 'Test'");
    expect(prompt.prompt.toString()).toContain("Body content");

    await cleanupTempDir();
  });
});
