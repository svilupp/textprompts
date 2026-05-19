import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import { loadPrompt } from "../src/loaders";
import { MetadataMode } from "../src/config";
import { InvalidMetadataError } from "../src/errors";

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

    await expect(loadPrompt(filePath, { metadata: MetadataMode.IGNORE })).rejects.toThrow("prompt file is empty");

    await cleanupTempDir();
  });

  test("whitespace-only file throws error", async () => {
    await createTempDir();
    const filePath = join(tempDir, "whitespace.txt");
    await writeFile(filePath, "   \n\n  \t  ");

    await expect(loadPrompt(filePath, { metadata: MetadataMode.IGNORE })).rejects.toThrow("prompt file is empty");

    await cleanupTempDir();
  });

  test("malformed header missing closing delimiter", async () => {
    await createTempDir();
    const filePath = join(tempDir, "malformed.txt");
    await writeFile(filePath, "---\ntitle = 'Test'\nno closing delimiter");

    await expect(loadPrompt(filePath, { metadata: MetadataMode.ALLOW })).rejects.toThrow(InvalidMetadataError);
    await expect(loadPrompt(filePath, { metadata: MetadataMode.ALLOW })).rejects.toThrow(/Missing closing delimiter/);

    await cleanupTempDir();
  });

  test("invalid TOML provides helpful error", async () => {
    await createTempDir();
    const filePath = join(tempDir, "invalid-toml.txt");
    await writeFile(filePath, '---\ntitle = "Missing quote\n---\nContent');

    await expect(loadPrompt(filePath, { metadata: MetadataMode.ALLOW })).rejects.toThrow(InvalidMetadataError);
    await expect(loadPrompt(filePath, { metadata: MetadataMode.ALLOW })).rejects.toThrow(/Invalid TOML/);

    await cleanupTempDir();
  });

  test("file starting with --- suggests IGNORE mode", async () => {
    await createTempDir();
    const filePath = join(tempDir, "starts-with-dash.txt");
    await writeFile(filePath, "---\ninvalid content without closing\nBody content");

    await expect(loadPrompt(filePath, { metadata: MetadataMode.ALLOW })).rejects.toThrow(/metadata: "ignore"/);

    await cleanupTempDir();
  });

  test("triple dashes in body are preserved", async () => {
    await createTempDir();
    const filePath = join(tempDir, "dashes.txt");
    await writeFile(filePath, "---\ntitle = 'Test'\n---\n\nSome content\n---\nMore dashes");

    const prompt = await loadPrompt(filePath, { metadata: MetadataMode.ALLOW });
    expect(prompt.prompt.toString()).toContain("---");
    expect(prompt.prompt.toString()).toContain("More dashes");

    await cleanupTempDir();
  });

  test("front-matter supports TOML values containing delimiter text", async () => {
    await createTempDir();
    const filePath = join(tempDir, "delimiter-in-toml-value.txt");
    await writeFile(
      filePath,
      '---\ntitle = "A --- B"\ndescription = "Contains delimiter"\nversion = "1.0.0"\n---\n\nBody.',
    );

    const prompt = await loadPrompt(filePath, { metadata: MetadataMode.ALLOW });
    expect(prompt.meta?.title).toBe("A --- B");
    expect(prompt.prompt.toString()).toBe("Body.");

    await cleanupTempDir();
  });

  test("front-matter supports YAML values containing delimiter text", async () => {
    await createTempDir();
    const filePath = join(tempDir, "delimiter-in-yaml-value.txt");
    await writeFile(
      filePath,
      '---\ntitle: "A --- B"\ndescription: Contains delimiter\nversion: "1.0.0"\n---\n\nBody.',
    );

    const prompt = await loadPrompt(filePath, { metadata: MetadataMode.ALLOW });
    expect(prompt.meta?.title).toBe("A --- B");
    expect(prompt.prompt.toString()).toBe("Body.");

    await cleanupTempDir();
  });

  test("header-only file throws error", async () => {
    await createTempDir();
    const filePath = join(tempDir, "header-only.txt");
    await writeFile(filePath, "---\ntitle = 'Test'\n---\n\n  \n");

    await expect(loadPrompt(filePath, { metadata: MetadataMode.ALLOW })).rejects.toThrow("prompt file is empty");

    await cleanupTempDir();
  });

  test("dedent removes common indentation", async () => {
    await createTempDir();
    const filePath = join(tempDir, "indented.txt");
    await writeFile(filePath, "    Line 1\n    Line 2\n    Line 3");

    const prompt = await loadPrompt(filePath, { metadata: MetadataMode.IGNORE });
    expect(prompt.prompt.toString()).toBe("Line 1\nLine 2\nLine 3");

    await cleanupTempDir();
  });

  test("dedent preserves relative indentation", async () => {
    await createTempDir();
    const filePath = join(tempDir, "relative-indent.txt");
    await writeFile(filePath, "  Line 1\n    Line 2\n  Line 3");

    const prompt = await loadPrompt(filePath, { metadata: MetadataMode.IGNORE });
    expect(prompt.prompt.toString()).toBe("Line 1\n  Line 2\nLine 3");

    await cleanupTempDir();
  });

  test("IGNORE mode preserves frontmatter-looking block as body (SPEC §4.6)", async () => {
    await createTempDir();
    const filePath = join(tempDir, "ignore-meta.txt");
    await writeFile(filePath, "---\ntitle = 'Test'\n---\nBody content");

    const prompt = await loadPrompt(filePath, { metadata: MetadataMode.IGNORE });
    // Whole file is the body — `---` lines are preserved verbatim.
    expect(prompt.prompt.toString()).toContain("title = 'Test'");
    expect(prompt.prompt.toString()).toContain("Body content");

    await cleanupTempDir();
  });

  test("IGNORE mode accepts malformed header without error", async () => {
    await createTempDir();
    const filePath = join(tempDir, "malformed-ignore.txt");
    await writeFile(filePath, "---\n!!!not toml or yaml!!!\n---\nbody {var}\n");

    const prompt = await loadPrompt(filePath, { metadata: MetadataMode.IGNORE });
    // SPEC §4.6: the whole file is body, including the `---` block.
    expect(prompt.prompt.toString()).toBe("---\n!!!not toml or yaml!!!\n---\nbody {var}\n");
    expect(prompt.meta?.title).toBe("malformed-ignore");
    await cleanupTempDir();
  });

  test("IGNORE mode header-only file is NOT empty (SPEC §2.5)", async () => {
    await createTempDir();
    const filePath = join(tempDir, "header-only-ignore.txt");
    await writeFile(filePath, "---\nrandom garbage\n---\n");

    // In ignore mode the `---` block IS the body, so this is non-empty.
    const prompt = await loadPrompt(filePath, { metadata: MetadataMode.IGNORE });
    expect(prompt.prompt.toString()).toBe("---\nrandom garbage\n---\n");
    await cleanupTempDir();
  });

  test("IGNORE mode truly empty file throws empty-prompt error", async () => {
    await createTempDir();
    const filePath = join(tempDir, "empty-ignore.txt");
    await writeFile(filePath, "");

    await expect(loadPrompt(filePath, { metadata: MetadataMode.IGNORE })).rejects.toThrow(
      /prompt file is empty/i,
    );
    await cleanupTempDir();
  });
});
