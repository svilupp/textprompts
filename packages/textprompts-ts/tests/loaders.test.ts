import { describe, expect, test } from "bun:test";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";

import { MetadataMode } from "../src/config";
import { loadPrompt, loadPrompts } from "../src/loaders";
import { MissingMetadataError, FileMissingError, TextPromptsError } from "../src/errors";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => join(__dirname, "fixtures", name);

describe("loaders", () => {
  test("loads prompt with metadata", async () => {
    const prompt = await loadPrompt(fixture("with-meta.txt"), { meta: MetadataMode.ALLOW });
    expect(prompt.meta?.title).toBe("Assistant");
    expect(prompt.format({ name: "Alice" })).toContain("Alice");
  });

  test("uses filename as title when ignoring metadata", async () => {
    const prompt = await loadPrompt(fixture("with-meta.txt"), { meta: MetadataMode.IGNORE });
    expect(prompt.meta?.title).toBe("with-meta");
  });

  test("strict mode requires metadata", async () => {
    await expect(loadPrompt(fixture("no-meta.txt"), { meta: MetadataMode.STRICT })).rejects.toBeInstanceOf(
      MissingMetadataError,
    );
  });

  test("loadPrompts handles directories", async () => {
    const prompts = await loadPrompts(join(__dirname, "fixtures"), { glob: "*.txt" });
    expect(prompts.length).toBeGreaterThanOrEqual(2);
  });

  test("loadPrompt throws FileMissingError for non-existent file", async () => {
    await expect(loadPrompt("/non/existent/file.txt")).rejects.toBeInstanceOf(FileMissingError);
  });

  test("loadPrompts with array syntax", async () => {
    const paths = [fixture("with-meta.txt"), fixture("no-meta.txt")];
    const prompts = await loadPrompts(paths, { meta: MetadataMode.ALLOW });
    expect(prompts.length).toBe(2);
  });

  test("loadPrompts enforces recursive depth", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "textprompts-test-"));
    await writeFile(join(tempDir, "root.txt"), "Root content");

    const nonRecursive = await loadPrompts(tempDir, { recursive: false, meta: MetadataMode.IGNORE });
    expect(nonRecursive.length).toBe(1);

    await rm(tempDir, { recursive: true, force: true });
  });

  test("loadPrompts enforces maxFiles limit", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "textprompts-test-"));
    await Bun.write(join(tempDir, "file1.txt"), "Content 1");
    await Bun.write(join(tempDir, "file2.txt"), "Content 2");

    await expect(
      loadPrompts(tempDir, { maxFiles: 1, meta: MetadataMode.IGNORE })
    ).rejects.toThrow(TextPromptsError);

    await rm(tempDir, { recursive: true, force: true });
  });

  test("loadPrompts with maxFiles=null allows unlimited", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "textprompts-test-"));
    await Bun.write(join(tempDir, "file1.txt"), "Content 1");
    await Bun.write(join(tempDir, "file2.txt"), "Content 2");
    await Bun.write(join(tempDir, "file3.txt"), "Content 3");

    const prompts = await loadPrompts(tempDir, { maxFiles: null, meta: MetadataMode.IGNORE });
    expect(prompts.length).toBe(3);

    await rm(tempDir, { recursive: true, force: true });
  });

  test("loadPrompts handles file path argument", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "textprompts-test-"));
    const file1 = join(tempDir, "file1.txt");
    await writeFile(file1, "File 1");

    const prompts = await loadPrompts(file1, { meta: MetadataMode.IGNORE });
    expect(prompts.length).toBe(1);

    await rm(tempDir, { recursive: true, force: true });
  });
});
