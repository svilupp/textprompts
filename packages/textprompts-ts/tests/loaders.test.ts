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

    const expert = await loadSection(file, "expert-mode", { meta: MetadataMode.IGNORE });
    const user = await loadSection(file, "user-template", { meta: MetadataMode.IGNORE });

    expect(String(expert.prompt)).toBe("Be precise.");
    expect(String(user.prompt)).toBe("User: {question}");

    await rm(tempDir, { recursive: true, force: true });
  });
});
