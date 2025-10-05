import { describe, expect, test } from "bun:test";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { MetadataMode } from "../src/config";
import { loadPrompt, loadPrompts } from "../src/loaders";
import { MissingMetadataError } from "../src/errors";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => join(__dirname, "fixtures", name);

describe("loaders", () => {
  test("loads prompt with metadata", async () => {
    const prompt = await loadPrompt(fixture("with-meta.txt"), { meta: MetadataMode.ALLOW });
    expect(prompt.meta?.title).toBe("Assistant");
    expect(prompt.format({ kwargs: { name: "Alice" } })).toContain("Alice");
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
});
