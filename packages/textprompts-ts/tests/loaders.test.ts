import { describe, expect, test } from "bun:test";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";

import { MetadataMode } from "../src/config";
import { loadPrompt, loadSection } from "../src/loaders";
import { MissingMetadataError, FileMissingError } from "../src/errors";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => join(__dirname, "fixtures", name);

describe("loaders", () => {
  test("loads prompt with metadata", async () => {
    const prompt = await loadPrompt(fixture("with-meta.txt"), { metadata: MetadataMode.ALLOW });
    expect(prompt.meta?.title).toBe("Assistant");
    expect(prompt.format({ name: "Alice" })).toContain("Alice");
  });

  test("uses filename as title when ignoring metadata", async () => {
    const prompt = await loadPrompt(fixture("with-meta.txt"), { metadata: MetadataMode.IGNORE });
    expect(prompt.meta?.title).toBe("with-meta");
  });

  test("strict mode requires metadata", async () => {
    await expect(
      loadPrompt(fixture("no-meta.txt"), { metadata: MetadataMode.STRICT }),
    ).rejects.toBeInstanceOf(MissingMetadataError);
  });

  test("loadPrompt throws FileMissingError for non-existent file", async () => {
    await expect(loadPrompt("/non/existent/file.txt")).rejects.toBeInstanceOf(FileMissingError);
  });

  test("loadSection loads XML sections by normalized anchor id", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "textprompts-test-"));
    const file = join(tempDir, "agents.txt");
    await writeFile(
      file,
      "<system id=\"expert-mode\">\nBe precise.\n</system>\n\n<user_template>\nUser: {question}\n</user_template>\n",
    );

    const expert = await loadSection(file, "expert-mode", { metadata: MetadataMode.IGNORE });
    const user = await loadSection(file, "user-template", { metadata: MetadataMode.IGNORE });

    expect(String(expert.prompt)).toBe("Be precise.");
    expect(String(user.prompt)).toBe("User: {question}");

    await rm(tempDir, { recursive: true, force: true });
  });

  test("frontmatterFormat 'toml' surfaces TOML error directly", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "textprompts-fmt-"));
    const file = join(tempDir, "yaml-not-toml.txt");
    await writeFile(
      file,
      '---\ntitle: YAML Only\ndescription: This is YAML\nversion: "1.0.0"\n---\n\nBody.',
    );

    // Asking for toml on a YAML file should fail; with auto it would fall back.
    await expect(
      loadPrompt(file, { metadata: MetadataMode.ALLOW, frontmatterFormat: "toml" }),
    ).rejects.toThrow(/Invalid TOML/);

    await rm(tempDir, { recursive: true, force: true });
  });

  test("frontmatterFormat 'yaml' surfaces YAML error directly", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "textprompts-fmt-"));
    const file = join(tempDir, "toml-not-yaml.txt");
    await writeFile(
      file,
      "---\ntitle = \"TOML Only\"\ndescription = \"This is TOML\"\nversion = \"1.0.0\"\n---\n\nBody.",
    );

    await expect(
      loadPrompt(file, { metadata: MetadataMode.ALLOW, frontmatterFormat: "yaml" }),
    ).rejects.toThrow();

    await rm(tempDir, { recursive: true, force: true });
  });
});
