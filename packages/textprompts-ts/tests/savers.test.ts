import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import { MetadataMode } from "../src/config";
import { loadPrompt } from "../src/loaders";
import { Prompt } from "../src/models";
import { savePrompt } from "../src/savers";

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
      prompt: "Hello {name}",
    });

    await savePrompt(filePath, prompt);

    const loaded = await loadPrompt(filePath, { metadata: MetadataMode.ALLOW });
    expect(loaded.meta?.title).toBe("Test Prompt");
    expect(loaded.meta?.description).toBe("A test prompt");
    expect(loaded.meta?.version).toBe("1.0.0");
    expect(loaded.meta?.author).toBe("Test Author");
    expect(loaded.meta?.created).toBe("2023-01-01");
    expect(loaded.prompt.toString().trim()).toBe("Hello {name}");

    await cleanupTempDir();
  });

  test("saves Prompt with minimal metadata", async () => {
    await createTempDir();
    const filePath = join(tempDir, "minimal.txt");

    const prompt = new Prompt({
      path: filePath,
      meta: { title: "Minimal" },
      prompt: "Simple prompt.",
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
    await expect(savePrompt(filePath, 123 as any)).rejects.toThrow(
      "content must be string or Prompt",
    );

    await cleanupTempDir();
  });

  test("saves Prompt with null metadata", async () => {
    await createTempDir();
    const filePath = join(tempDir, "null-meta.txt");

    const prompt = new Prompt({
      path: filePath,
      meta: null,
      prompt: "Content only.",
    });

    await savePrompt(filePath, prompt);

    const saved = await readFile(filePath, "utf8");
    expect(saved).toContain('title = ""');
    expect(saved).toContain("Content only.");

    await cleanupTempDir();
  });
});

describe("savePrompt: v2 round-trip", () => {
  let tempDir: string;
  const setup = async () => {
    tempDir = await mkdtemp(join(tmpdir(), "textprompts-v2-saver-"));
  };
  const cleanup = async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  };

  test("TOML: boolean flag round-trips with description + extras", async () => {
    await setup();
    const filePath = join(tempDir, "bf.txt");
    const prompt = new Prompt({
      path: filePath,
      meta: {
        title: "T",
        description: "D",
        version: "1.0.0",
        flags: {
          show_tips: {
            kind: "boolean",
            description: "Show onboarding tips",
            extras: { owner: "@team", rollout: 50 },
          },
        },
      },
      prompt: "{if show_tips}Tip!{end}\nBody.",
    });

    await savePrompt(filePath, prompt);
    const loaded = await loadPrompt(filePath, { metadata: MetadataMode.ALLOW });
    const f = loaded.meta.flags?.show_tips;
    expect(f?.kind).toBe("boolean");
    expect(f?.description).toBe("Show onboarding tips");
    expect(f?.extras?.owner).toBe("@team");
    expect(f?.extras?.rollout).toBe(50);
    await cleanup();
  });

  test("TOML: enum flag preserves values order", async () => {
    await setup();
    const filePath = join(tempDir, "enum.txt");
    const prompt = new Prompt({
      path: filePath,
      meta: {
        title: "T",
        description: "D",
        version: "1.0.0",
        flags: {
          tier: {
            kind: "enum",
            values: ["free", "premium", "enterprise"],
            description: "Subscription tier",
            extras: { owner: "@product" },
          },
        },
      },
      prompt: "{switch tier}{case free}f{case premium}p{case enterprise}e{end}",
    });

    await savePrompt(filePath, prompt);
    const loaded = await loadPrompt(filePath, { metadata: MetadataMode.ALLOW });
    const f = loaded.meta.flags?.tier;
    expect(f?.kind).toBe("enum");
    if (f?.kind === "enum") {
      expect(f.values).toEqual(["free", "premium", "enterprise"]);
    }
    expect(f?.description).toBe("Subscription tier");
    expect(f?.extras?.owner).toBe("@product");
    await cleanup();
  });

  test("TOML: variable declarations with description + extras", async () => {
    await setup();
    const filePath = join(tempDir, "vars.txt");
    const prompt = new Prompt({
      path: filePath,
      meta: {
        title: "T",
        description: "D",
        version: "1.0.0",
        variables: {
          user_name: {
            description: "The user's display name",
            extras: { example: "Alice" },
          },
        },
      },
      prompt: "Hello {user_name}.",
    });

    await savePrompt(filePath, prompt);
    const loaded = await loadPrompt(filePath, { metadata: MetadataMode.ALLOW });
    const v = loaded.meta.variables?.user_name;
    expect(v?.description).toBe("The user's display name");
    expect(v?.extras?.example).toBe("Alice");
    await cleanup();
  });

  test("TOML: unsupported top-level extras fail instead of being dropped", async () => {
    await setup();
    const filePath = join(tempDir, "bad-extra.txt");
    const prompt = new Prompt({
      path: filePath,
      meta: {
        title: "T",
        description: "D",
        version: "1.0.0",
        extras: { complex: { nested: [{ unsupported: true }] } },
      },
      prompt: "Body.",
    });

    await expect(savePrompt(filePath, prompt, { format: "toml" })).rejects.toThrow(
      /Cannot serialize top-level extras key 'complex'/,
    );
    await cleanup();
  });

  test("YAML: enum flag with values preserves order", async () => {
    await setup();
    const filePath = join(tempDir, "enum.txt");
    const prompt = new Prompt({
      path: filePath,
      meta: {
        title: "T",
        description: "D",
        version: "1.0.0",
        flags: {
          tier: {
            kind: "enum",
            values: ["free", "premium"],
            description: "Tier",
            extras: { owner: "@p" },
          },
        },
      },
      prompt: "{switch tier}{case free}f{case premium}p{end}",
    });

    await savePrompt(filePath, prompt, { format: "yaml" });
    const loaded = await loadPrompt(filePath, { metadata: MetadataMode.ALLOW });
    const f = loaded.meta.flags?.tier;
    if (f?.kind === "enum") {
      expect(f.values).toEqual(["free", "premium"]);
    } else {
      throw new Error("expected enum");
    }
    expect(f.description).toBe("Tier");
    expect(f.extras?.owner).toBe("@p");
    await cleanup();
  });

  test("YAML: variable declaration round-trips", async () => {
    await setup();
    const filePath = join(tempDir, "vars.txt");
    const prompt = new Prompt({
      path: filePath,
      meta: {
        title: "T",
        description: "D",
        version: "1.0.0",
        variables: {
          who: {
            description: "Who is greeted",
            extras: {},
          },
        },
      },
      prompt: "Hi {who}",
    });
    await savePrompt(filePath, prompt, { format: "yaml" });
    const loaded = await loadPrompt(filePath, { metadata: MetadataMode.ALLOW });
    expect(loaded.meta.variables?.who?.description).toBe("Who is greeted");
    await cleanup();
  });

  test("top-level extras survive TOML save", async () => {
    await setup();
    const filePath = join(tempDir, "ex.txt");
    const prompt = new Prompt({
      path: filePath,
      meta: {
        title: "T",
        description: "D",
        version: "1.0.0",
        extras: { owner: "@me", count: 3 },
      },
      prompt: "Body.",
    });
    await savePrompt(filePath, prompt);
    const loaded = await loadPrompt(filePath, { metadata: MetadataMode.ALLOW });
    expect(loaded.meta.extras?.owner).toBe("@me");
    expect(loaded.meta.extras?.count).toBe(3);
    await cleanup();
  });
});
