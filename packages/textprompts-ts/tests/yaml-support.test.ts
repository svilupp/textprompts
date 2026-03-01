import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";

import { loadPrompt } from "../src/loaders";
import { savePrompt } from "../src/savers";
import { Prompt } from "../src/models";
import { PromptString } from "../src/prompt-string";
import { MetadataMode } from "../src/config";
import { InvalidMetadataError } from "../src/errors";
import { parseYaml } from "../src/yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => join(__dirname, "fixtures", name);

describe("YAML front matter parsing", () => {
  let tempDir: string;

  const setup = async () => {
    tempDir = await mkdtemp(join(tmpdir(), "textprompts-yaml-test-"));
  };

  const cleanup = async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  };

  test("loads YAML fixture with ALLOW mode", async () => {
    const prompt = await loadPrompt(fixture("with-yaml-meta.txt"), { meta: MetadataMode.ALLOW });
    expect(prompt.meta?.title).toBe("YAML Assistant");
    expect(prompt.meta?.description).toBe("A helpful assistant with YAML metadata");
    expect(prompt.meta?.version).toBe("1.0.0");
    expect(prompt.meta?.author).toBe("Example");
    expect(prompt.format({ name: "Alice" })).toContain("Alice");
  });

  test("loads YAML fixture with STRICT mode", async () => {
    const prompt = await loadPrompt(fixture("with-yaml-meta.txt"), { meta: MetadataMode.STRICT });
    expect(prompt.meta?.title).toBe("YAML Assistant");
    expect(prompt.meta?.version).toBe("1.0.0");
  });

  test("TOML fixtures still work", async () => {
    const prompt = await loadPrompt(fixture("with-meta.txt"), { meta: MetadataMode.ALLOW });
    expect(prompt.meta?.title).toBe("Assistant");
    expect(prompt.meta?.version).toBe("1.0.0");
  });

  test("basic YAML front matter", async () => {
    await setup();
    const filePath = join(tempDir, "basic.txt");
    await writeFile(
      filePath,
      "---\ntitle: My Prompt\ndescription: A test\nversion: \"1.0.0\"\n---\n\nHello world!",
    );

    const prompt = await loadPrompt(filePath, { meta: MetadataMode.STRICT });
    expect(prompt.meta?.title).toBe("My Prompt");
    expect(prompt.meta?.description).toBe("A test");
    expect(prompt.meta?.version).toBe("1.0.0");
    expect(prompt.prompt.toString()).toContain("Hello world!");

    await cleanup();
  });

  test("YAML with all metadata fields", async () => {
    await setup();
    const filePath = join(tempDir, "full.txt");
    await writeFile(
      filePath,
      '---\ntitle: Full Prompt\ndescription: All fields\nversion: "2.0.0"\nauthor: Jane Doe\ncreated: "2024-06-15"\n---\n\nContent here.',
    );

    const prompt = await loadPrompt(filePath, { meta: MetadataMode.STRICT });
    expect(prompt.meta?.title).toBe("Full Prompt");
    expect(prompt.meta?.version).toBe("2.0.0");
    expect(prompt.meta?.author).toBe("Jane Doe");
    expect(prompt.meta?.created).toBe("2024-06-15");

    await cleanup();
  });

  test("YAML with unquoted strings", async () => {
    await setup();
    const filePath = join(tempDir, "unquoted.txt");
    await writeFile(
      filePath,
      '---\ntitle: Unquoted Title\ndescription: Unquoted desc\nversion: "1.0.0"\n---\n\nContent.',
    );

    const prompt = await loadPrompt(filePath, { meta: MetadataMode.ALLOW });
    expect(prompt.meta?.title).toBe("Unquoted Title");
    expect(prompt.meta?.description).toBe("Unquoted desc");

    await cleanup();
  });

  test("YAML with numeric version gets stringified", async () => {
    await setup();
    const filePath = join(tempDir, "numeric.txt");
    await writeFile(
      filePath,
      "---\ntitle: Numeric\ndescription: Test\nversion: 1.0\n---\n\nContent.",
    );

    const prompt = await loadPrompt(filePath, { meta: MetadataMode.ALLOW });
    expect(prompt.meta?.version).toBe("1");

    await cleanup();
  });

  test("YAML with comments", async () => {
    await setup();
    const filePath = join(tempDir, "comments.txt");
    await writeFile(
      filePath,
      '---\n# A comment\ntitle: Commented  # inline\ndescription: Has comments\nversion: "1.0.0"\n---\n\nContent.',
    );

    const prompt = await loadPrompt(filePath, { meta: MetadataMode.ALLOW });
    expect(prompt.meta?.title).toBe("Commented");

    await cleanup();
  });

  test("YAML empty header gives empty metadata", async () => {
    await setup();
    const filePath = join(tempDir, "empty-header.txt");
    await writeFile(filePath, "---\n---\n\nContent here.");

    const prompt = await loadPrompt(filePath, { meta: MetadataMode.ALLOW });
    expect(prompt.meta?.title).toBe("empty-header"); // Uses filename

    await cleanup();
  });

  test("YAML minimal fails in STRICT mode", async () => {
    await setup();
    const filePath = join(tempDir, "minimal.txt");
    await writeFile(filePath, "---\ntitle: Only Title\n---\n\nBody.");

    await expect(loadPrompt(filePath, { meta: MetadataMode.STRICT })).rejects.toThrow(
      InvalidMetadataError,
    );
    await expect(loadPrompt(filePath, { meta: MetadataMode.STRICT })).rejects.toThrow(
      /Missing required/,
    );

    await cleanup();
  });

  test("YAML empty required fields fails in STRICT mode", async () => {
    await setup();
    const filePath = join(tempDir, "empty-fields.txt");
    await writeFile(
      filePath,
      '---\ntitle: ""\ndescription: ""\nversion: ""\n---\n\nBody.',
    );

    await expect(loadPrompt(filePath, { meta: MetadataMode.STRICT })).rejects.toThrow(
      InvalidMetadataError,
    );
    await expect(loadPrompt(filePath, { meta: MetadataMode.STRICT })).rejects.toThrow(
      /Empty required/,
    );

    await cleanup();
  });

  test("IGNORE mode skips YAML parsing", async () => {
    await setup();
    const filePath = join(tempDir, "ignored.txt");
    await writeFile(filePath, "---\ntitle: Ignored\n---\n\nBody content.");

    const prompt = await loadPrompt(filePath, { meta: MetadataMode.IGNORE });
    expect(prompt.meta?.title).toBe("ignored"); // Uses filename
    expect(prompt.prompt.toString()).toContain("title: Ignored");

    await cleanup();
  });

  test("TOML preferred over YAML when both valid", async () => {
    await setup();
    const filePath = join(tempDir, "ambiguous.txt");
    await writeFile(filePath, '---\ntitle = "TOML Wins"\n---\n\nContent.');

    const prompt = await loadPrompt(filePath, { meta: MetadataMode.ALLOW });
    expect(prompt.meta?.title).toBe("TOML Wins");

    await cleanup();
  });

  test("YAML fallback when TOML fails", async () => {
    await setup();
    const filePath = join(tempDir, "yaml-only.txt");
    await writeFile(
      filePath,
      '---\ntitle: YAML Only\ndescription: This is YAML\nversion: "1.0.0"\n---\n\nContent.',
    );

    const prompt = await loadPrompt(filePath, { meta: MetadataMode.STRICT });
    expect(prompt.meta?.title).toBe("YAML Only");
    expect(prompt.meta?.description).toBe("This is YAML");

    await cleanup();
  });
});

describe("parseYaml unit tests", () => {
  test("parses valid YAML mapping", () => {
    const result = parseYaml("title: Test\nversion: '1.0.0'");
    expect(result.title).toBe("Test");
    expect(result.version).toBe("1.0.0");
  });

  test("returns empty object for empty input", () => {
    const result = parseYaml("");
    expect(result).toEqual({});
  });

  test("rejects non-mapping YAML", () => {
    expect(() => parseYaml("- item1\n- item2")).toThrow(/must be a mapping/);
  });

  test("preserves nested objects", () => {
    const result = parseYaml("metadata:\n  title: nested");
    expect(result.metadata).toEqual({ title: "nested" });
  });

  test("preserves booleans", () => {
    const result = parseYaml("flag: true");
    expect(result.flag).toBe(true);
  });

  test("preserves numbers", () => {
    const result = parseYaml("count: 42");
    expect(result.count).toBe(42);
  });

  test("converts dates to strings", () => {
    const result = parseYaml("created: 2024-01-15");
    expect(typeof result.created).toBe("string");
    expect(result.created).toBe("2024-01-15");
  });

  test("preserves arrays of strings", () => {
    const result = parseYaml("tags:\n  - alpha\n  - beta");
    expect(result.tags).toEqual(["alpha", "beta"]);
  });

  test("preserves arrays of objects", () => {
    const result = parseYaml("triggers:\n  - cron: daily\n  - voice: check");
    expect(result.triggers).toEqual([{ cron: "daily" }, { voice: "check" }]);
  });
});

describe("YAML saver", () => {
  let tempDir: string;

  const setup = async () => {
    tempDir = await mkdtemp(join(tmpdir(), "textprompts-yaml-saver-"));
  };

  const cleanup = async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  };

  test("saves string as YAML template", async () => {
    await setup();
    const filePath = join(tempDir, "test.txt");
    await savePrompt(filePath, "You are helpful.", { format: "yaml" });

    const saved = await readFile(filePath, "utf8");
    expect(saved).toContain("---");
    expect(saved).toContain('title: ""');
    expect(saved).toContain('description: ""');
    expect(saved).toContain('version: ""');
    expect(saved).toContain("You are helpful.");
    // Should not contain TOML assignment
    expect(saved.split("---")[1]).not.toContain("=");

    await cleanup();
  });

  test("saves string as TOML template by default", async () => {
    await setup();
    const filePath = join(tempDir, "test.txt");
    await savePrompt(filePath, "Hello.");

    const saved = await readFile(filePath, "utf8");
    expect(saved).toContain('title = ""');

    await cleanup();
  });

  test("saves Prompt object with YAML format", async () => {
    await setup();
    const filePath = join(tempDir, "test.txt");
    const prompt = new Prompt({
      path: filePath,
      meta: {
        title: "YAML Prompt",
        description: "Saved as YAML",
        version: "1.0.0",
        author: "Tester",
        created: "2024-03-20",
      },
      prompt: new PromptString("Hello {name}!"),
    });

    await savePrompt(filePath, prompt, { format: "yaml" });
    const saved = await readFile(filePath, "utf8");
    expect(saved).toContain("title:");
    expect(saved).toContain("description:");
    expect(saved).toContain("version:");
    expect(saved).toContain("author:");
    expect(saved).toContain("created:");
    expect(saved).toContain("Hello {name}!");

    await cleanup();
  });

  test("YAML round-trip: save and reload", async () => {
    await setup();
    const filePath = join(tempDir, "roundtrip.txt");
    const prompt = new Prompt({
      path: filePath,
      meta: {
        title: "Roundtrip",
        description: "Testing round-trip",
        version: "2.0.0",
      },
      prompt: new PromptString("Roundtrip content."),
    });

    await savePrompt(filePath, prompt, { format: "yaml" });
    const loaded = await loadPrompt(filePath, { meta: MetadataMode.STRICT });
    expect(loaded.meta?.title).toBe("Roundtrip");
    expect(loaded.meta?.description).toBe("Testing round-trip");
    expect(loaded.meta?.version).toBe("2.0.0");
    expect(loaded.prompt.strip()).toBe("Roundtrip content.");

    await cleanup();
  });

  test("TOML round-trip still works", async () => {
    await setup();
    const filePath = join(tempDir, "toml-rt.txt");
    const prompt = new Prompt({
      path: filePath,
      meta: {
        title: "TOML Roundtrip",
        description: "Still works",
        version: "1.0.0",
      },
      prompt: new PromptString("TOML content."),
    });

    await savePrompt(filePath, prompt);
    const loaded = await loadPrompt(filePath, { meta: MetadataMode.STRICT });
    expect(loaded.meta?.title).toBe("TOML Roundtrip");
    expect(loaded.meta?.version).toBe("1.0.0");

    await cleanup();
  });

  test("YAML save with special characters round-trips", async () => {
    await setup();
    const filePath = join(tempDir, "special.txt");
    const prompt = new Prompt({
      path: filePath,
      meta: {
        title: "Title with: colon",
        description: "Has #hash and {braces}",
        version: "1.0.0",
      },
      prompt: new PromptString("Content."),
    });

    await savePrompt(filePath, prompt, { format: "yaml" });
    const loaded = await loadPrompt(filePath, { meta: MetadataMode.ALLOW });
    expect(loaded.meta?.title).toBe("Title with: colon");
    expect(loaded.meta?.description).toBe("Has #hash and {braces}");

    await cleanup();
  });
});

describe("mixed format directory loading", () => {
  test("loads directory with both TOML and YAML files", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "textprompts-mixed-"));
    const tomlContent =
      '---\ntitle = "TOML File"\ndescription = "In TOML"\nversion = "1.0.0"\n---\n\nTOML body.';
    const yamlContent =
      '---\ntitle: YAML File\ndescription: In YAML\nversion: "1.0.0"\n---\n\nYAML body.';

    await writeFile(join(tempDir, "toml.txt"), tomlContent);
    await writeFile(join(tempDir, "yaml.txt"), yamlContent);

    const { loadPrompts } = await import("../src/loaders");
    const prompts = await loadPrompts(tempDir, { meta: MetadataMode.STRICT });
    expect(prompts.length).toBe(2);

    const titles = prompts.map((p) => p.meta?.title).sort();
    expect(titles).toEqual(["TOML File", "YAML File"]);

    await rm(tempDir, { recursive: true, force: true });
  });
});

describe("YAML boolean keywords", () => {
  test("quoted yes/no preserved as strings", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "textprompts-bool-"));
    const filePath = join(tempDir, "bool.txt");
    await writeFile(
      filePath,
      '---\ntitle: "yes"\ndescription: "no"\nversion: "1.0.0"\n---\n\nBody.',
    );

    const prompt = await loadPrompt(filePath, { meta: MetadataMode.STRICT });
    expect(prompt.meta?.title).toBe("yes");
    expect(prompt.meta?.description).toBe("no");

    await rm(tempDir, { recursive: true, force: true });
  });
});

describe("TOML special characters", () => {
  test("TOML round-trip with quotes", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "textprompts-toml-"));
    const filePath = join(tempDir, "quotes.txt");
    const prompt = new Prompt({
      path: filePath,
      meta: {
        title: 'Title with "quotes"',
        description: "Normal",
        version: "1.0.0",
      },
      prompt: new PromptString("Content."),
    });

    await savePrompt(filePath, prompt);
    const loaded = await loadPrompt(filePath, { meta: MetadataMode.STRICT });
    expect(loaded.meta?.title).toBe('Title with "quotes"');

    await rm(tempDir, { recursive: true, force: true });
  });

  test("TOML round-trip with backslash", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "textprompts-toml-"));
    const filePath = join(tempDir, "backslash.txt");
    const prompt = new Prompt({
      path: filePath,
      meta: {
        title: "Path: C:\\Users\\test",
        description: "With backslash",
        version: "1.0.0",
      },
      prompt: new PromptString("Content."),
    });

    await savePrompt(filePath, prompt);
    const loaded = await loadPrompt(filePath, { meta: MetadataMode.STRICT });
    expect(loaded.meta?.title).toBe("Path: C:\\Users\\test");

    await rm(tempDir, { recursive: true, force: true });
  });

  test("TOML round-trip with newline", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "textprompts-toml-"));
    const filePath = join(tempDir, "newline.txt");
    const prompt = new Prompt({
      path: filePath,
      meta: {
        title: "Title",
        description: "Line one\nLine two",
        version: "1.0.0",
      },
      prompt: new PromptString("Content."),
    });

    await savePrompt(filePath, prompt);
    const loaded = await loadPrompt(filePath, { meta: MetadataMode.STRICT });
    expect(loaded.meta?.description).toBe("Line one\nLine two");

    await rm(tempDir, { recursive: true, force: true });
  });
});

describe("YAML nested object and array support", () => {
  test("nested objects are captured in extras", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "textprompts-nested-"));
    const filePath = join(tempDir, "nested.txt");
    await writeFile(
      filePath,
      '---\ntitle: Test\nmetadata:\n  nested: value\nversion: "1.0.0"\n---\n\nBody.',
    );

    const prompt = await loadPrompt(filePath, { meta: MetadataMode.ALLOW });
    expect(prompt.meta?.title).toBe("Test");
    expect(prompt.meta?.extras?.metadata).toEqual({ nested: "value" });

    await rm(tempDir, { recursive: true, force: true });
  });

  test("arrays with objects are captured in extras", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "textprompts-arr-"));
    const filePath = join(tempDir, "array-obj.txt");
    await writeFile(
      filePath,
      '---\ntitle: Test\nitems:\n  - name: item1\nversion: "1.0.0"\n---\n\nBody.',
    );

    const prompt = await loadPrompt(filePath, { meta: MetadataMode.ALLOW });
    expect(prompt.meta?.title).toBe("Test");
    expect(prompt.meta?.extras?.items).toEqual([{ name: "item1" }]);

    await rm(tempDir, { recursive: true, force: true });
  });
});
