import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import { savePrompt } from "../src/savers";
import { Prompt } from "../src/models";
import { PromptString } from "../src/prompt-string";
import { loadPrompt } from "../src/loaders";
import { MetadataMode } from "../src/config";

describe("savePrompt", () => {
  let tempDir: string;

  const createTempDir = async () => {
    tempDir = await mkdtemp(join(tmpdir(), "textprompts-test-"));
  };

  const cleanupTempDir = async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  };

  test("saves string as prompt template", async () => {
    await createTempDir();
    const filePath = join(tempDir, "test.txt");
    const content = "You are a helpful assistant.";

    await savePrompt(filePath, content);

    const saved = await readFile(filePath, "utf8");
    expect(saved).toContain("---");
    expect(saved).toContain('title = ""');
    expect(saved).toContain('description = ""');
    expect(saved).toContain('version = ""');
    expect(saved).toContain(content);

    await cleanupTempDir();
  });

  test("saves Prompt object with full metadata", async () => {
    await createTempDir();
    const filePath = join(tempDir, "test.txt");

    const prompt = new Prompt({
      path: filePath,
      meta: {
        title: "Test Prompt",
        description: "A test prompt",
        version: "1.0.0",
        author: "Test Author",
        created: "2023-01-01",
      },
      prompt: new PromptString("Hello {name}"),
    });

    await savePrompt(filePath, prompt);

    const loaded = await loadPrompt(filePath, { meta: MetadataMode.ALLOW });
    expect(loaded.meta?.title).toBe("Test Prompt");
    expect(loaded.meta?.description).toBe("A test prompt");
    expect(loaded.meta?.version).toBe("1.0.0");
    expect(loaded.meta?.author).toBe("Test Author");
    expect(loaded.meta?.created).toBe("2023-01-01");
    expect(loaded.prompt.strip()).toBe("Hello {name}");

    await cleanupTempDir();
  });

  test("saves Prompt with minimal metadata", async () => {
    await createTempDir();
    const filePath = join(tempDir, "minimal.txt");

    const prompt = new Prompt({
      path: filePath,
      meta: { title: "Minimal" },
      prompt: new PromptString("Simple prompt."),
    });

    await savePrompt(filePath, prompt);

    const saved = await readFile(filePath, "utf8");
    expect(saved).toContain('title = "Minimal"');
    expect(saved).toContain('description = ""');
    expect(saved).toContain('version = ""');
    expect(saved).not.toContain("author =");
    expect(saved).not.toContain("created =");

    await cleanupTempDir();
  });

  test("throws TypeError for invalid content type", async () => {
    await createTempDir();
    const filePath = join(tempDir, "invalid.txt");

    await expect(savePrompt(filePath, 123 as any)).rejects.toThrow(TypeError);
    await expect(savePrompt(filePath, 123 as any)).rejects.toThrow("content must be string or Prompt");

    await cleanupTempDir();
  });

  test("saves Prompt with null metadata", async () => {
    await createTempDir();
    const filePath = join(tempDir, "null-meta.txt");

    const prompt = new Prompt({
      path: filePath,
      meta: null,
      prompt: new PromptString("Content only."),
    });

    await savePrompt(filePath, prompt);

    const saved = await readFile(filePath, "utf8");
    expect(saved).toContain('title = ""');
    expect(saved).toContain("Content only.");

    await cleanupTempDir();
  });
});
