import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import { loadPrompt } from "../src/loaders";
import { savePrompt } from "../src/savers";
import { Prompt } from "../src/models";
import { PromptString } from "../src/prompt-string";
import { MetadataMode } from "../src/config";

describe("extras: basic custom fields", () => {
  let tempDir: string;

  const setup = async () => {
    tempDir = await mkdtemp(join(tmpdir(), "textprompts-extras-"));
  };

  const cleanup = async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  };

  test("simple string custom fields go to extras", async () => {
    await setup();
    const filePath = join(tempDir, "test.txt");
    await writeFile(
      filePath,
      '---\ntitle: My Skill\ndescription: Does things\nversion: "1.0.0"\ncustom_field: hello\npriority: high\n---\n\nBody.',
    );

    const prompt = await loadPrompt(filePath, { meta: MetadataMode.ALLOW });
    expect(prompt.meta?.title).toBe("My Skill");
    expect(prompt.meta?.extras?.custom_field).toBe("hello");
    expect(prompt.meta?.extras?.priority).toBe("high");

    await cleanup();
  });

  test("boolean custom fields preserve type in extras", async () => {
    await setup();
    const filePath = join(tempDir, "test.txt");
    await writeFile(
      filePath,
      '---\ntitle: Test\ndescription: Test\nversion: "1.0.0"\ndisable-model-invocation: true\nuser-invocable: false\n---\n\nBody.',
    );

    const prompt = await loadPrompt(filePath, { meta: MetadataMode.ALLOW });
    expect(prompt.meta?.extras?.["disable-model-invocation"]).toBe(true);
    expect(prompt.meta?.extras?.["user-invocable"]).toBe(false);

    await cleanup();
  });

  test("numeric custom fields preserve type in extras", async () => {
    await setup();
    const filePath = join(tempDir, "test.txt");
    await writeFile(
      filePath,
      '---\ntitle: Test\ndescription: Test\nversion: "1.0.0"\ntimeout: 30\nmax-retries: 3\n---\n\nBody.',
    );

    const prompt = await loadPrompt(filePath, { meta: MetadataMode.ALLOW });
    expect(prompt.meta?.extras?.timeout).toBe(30);
    expect(prompt.meta?.extras?.["max-retries"]).toBe(3);

    await cleanup();
  });

  test("no extras when only known fields present", async () => {
    await setup();
    const filePath = join(tempDir, "test.txt");
    await writeFile(
      filePath,
      '---\ntitle: Test\ndescription: A desc\nversion: "1.0.0"\nauthor: Me\n---\n\nBody.',
    );

    const prompt = await loadPrompt(filePath, { meta: MetadataMode.ALLOW });
    expect(prompt.meta?.extras).toBeUndefined();

    await cleanup();
  });

  test("extras absent when no frontmatter", () => {
    const prompt = Prompt.fromString("Just body content");
    expect(prompt.meta?.extras).toBeUndefined();
  });
});

describe("extras: arrays", () => {
  let tempDir: string;

  const setup = async () => {
    tempDir = await mkdtemp(join(tmpdir(), "textprompts-extras-arr-"));
  };

  const cleanup = async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  };

  test("simple string arrays", async () => {
    await setup();
    const filePath = join(tempDir, "test.txt");
    await writeFile(
      filePath,
      '---\ntitle: Test\ndescription: Test\nversion: "1.0.0"\npermissions:\n  - read\n  - write\n  - admin\n---\n\nBody.',
    );

    const prompt = await loadPrompt(filePath, { meta: MetadataMode.ALLOW });
    expect(prompt.meta?.extras?.permissions).toEqual(["read", "write", "admin"]);

    await cleanup();
  });

  test("arrays of objects", async () => {
    await setup();
    const filePath = join(tempDir, "test.txt");
    await writeFile(
      filePath,
      '---\ntitle: Test\ndescription: Test\nversion: "1.0.0"\ntriggers:\n  - cron: "0 9 * * 1"\n  - voice: "check inventory"\n---\n\nBody.',
    );

    const prompt = await loadPrompt(filePath, { meta: MetadataMode.ALLOW });
    expect(prompt.meta?.extras?.triggers).toEqual([
      { cron: "0 9 * * 1" },
      { voice: "check inventory" },
    ]);

    await cleanup();
  });

  test("mixed arrays", async () => {
    await setup();
    const filePath = join(tempDir, "test.txt");
    await writeFile(
      filePath,
      '---\ntitle: Test\ndescription: Test\nversion: "1.0.0"\ntags:\n  - alpha\n  - 42\n  - true\n---\n\nBody.',
    );

    const prompt = await loadPrompt(filePath, { meta: MetadataMode.ALLOW });
    const tags = prompt.meta?.extras?.tags as unknown[];
    expect(tags).toContain("alpha");
    expect(tags).toContain(42);
    expect(tags).toContain(true);

    await cleanup();
  });
});

describe("extras: nested objects", () => {
  let tempDir: string;

  const setup = async () => {
    tempDir = await mkdtemp(join(tmpdir(), "textprompts-extras-nested-"));
  };

  const cleanup = async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  };

  test("nested object in extras", async () => {
    await setup();
    const filePath = join(tempDir, "test.txt");
    await writeFile(
      filePath,
      '---\ntitle: Test\ndescription: Test\nversion: "1.0.0"\nhooks:\n  pre-run: echo hello\n  post-run: echo done\n---\n\nBody.',
    );

    const prompt = await loadPrompt(filePath, { meta: MetadataMode.ALLOW });
    expect(prompt.meta?.extras?.hooks).toEqual({
      "pre-run": "echo hello",
      "post-run": "echo done",
    });

    await cleanup();
  });

  test("deeply nested object in extras", async () => {
    await setup();
    const filePath = join(tempDir, "test.txt");
    await writeFile(
      filePath,
      '---\ntitle: Test\ndescription: Test\nversion: "1.0.0"\nconfig:\n  deep:\n    nested:\n      value: 42\n---\n\nBody.',
    );

    const prompt = await loadPrompt(filePath, { meta: MetadataMode.ALLOW });
    const config = prompt.meta?.extras?.config as Record<string, unknown>;
    expect((config?.deep as Record<string, unknown>)?.nested).toEqual({ value: 42 });

    await cleanup();
  });
});

describe("extras: Claude Code skill format", () => {
  let tempDir: string;

  const setup = async () => {
    tempDir = await mkdtemp(join(tmpdir(), "textprompts-skill-"));
  };

  const cleanup = async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  };

  test("full Claude Code skill frontmatter", async () => {
    await setup();
    const filePath = join(tempDir, "SKILL.md");
    await writeFile(
      filePath,
      `---
name: ast-grep
description: Use ast-grep for structural code search and safe codemods.
version: "1.0.0"
author: pidge-team
allowed-tools: "Read, Grep, Glob, Bash(bd:*)"
disable-model-invocation: true
user-invocable: false
model: sonnet
context: fork
agent: Explore
argument-hint: "[pattern] [language]"
license: MIT
compatibility: Requires ast-grep CLI installed
---

# AST Grep Skill

Use this skill to search code structurally.`,
    );

    const prompt = await loadPrompt(filePath, { meta: MetadataMode.ALLOW });

    // Known fields
    expect(prompt.meta?.description).toBe(
      "Use ast-grep for structural code search and safe codemods.",
    );
    expect(prompt.meta?.version).toBe("1.0.0");
    expect(prompt.meta?.author).toBe("pidge-team");

    // Extras — Claude Code specific fields
    const extras = prompt.meta?.extras;
    expect(extras?.name).toBe("ast-grep");
    expect(extras?.["allowed-tools"]).toBe("Read, Grep, Glob, Bash(bd:*)");
    expect(extras?.["disable-model-invocation"]).toBe(true);
    expect(extras?.["user-invocable"]).toBe(false);
    expect(extras?.model).toBe("sonnet");
    expect(extras?.context).toBe("fork");
    expect(extras?.agent).toBe("Explore");
    expect(extras?.["argument-hint"]).toBe("[pattern] [language]");
    expect(extras?.license).toBe("MIT");
    expect(extras?.compatibility).toBe("Requires ast-grep CLI installed");

    // Body
    expect(prompt.prompt.toString()).toContain("AST Grep Skill");
    expect(prompt.prompt.toString()).toContain("search code structurally");

    await cleanup();
  });

  test("skill with hooks object", async () => {
    await setup();
    const filePath = join(tempDir, "SKILL.md");
    await writeFile(
      filePath,
      `---
name: test-runner
description: Runs tests with hooks.
version: "1.0.0"
hooks:
  pre-tool-use:
    command: echo "before"
  post-tool-use:
    command: echo "after"
---

Run tests.`,
    );

    const prompt = await loadPrompt(filePath, { meta: MetadataMode.ALLOW });
    const hooks = prompt.meta?.extras?.hooks as Record<string, unknown>;
    expect(hooks?.["pre-tool-use"]).toEqual({ command: 'echo "before"' });
    expect(hooks?.["post-tool-use"]).toEqual({ command: 'echo "after"' });

    await cleanup();
  });

  test("skill with permissions array", async () => {
    await setup();
    const filePath = join(tempDir, "SKILL.md");
    await writeFile(
      filePath,
      `---
name: shopify-check
description: Check Shopify inventory.
version: "1.0.0"
permissions:
  - shopify:read_products
  - shopify:read_inventory
---

Check inventory levels.`,
    );

    const prompt = await loadPrompt(filePath, { meta: MetadataMode.ALLOW });
    expect(prompt.meta?.extras?.permissions).toEqual([
      "shopify:read_products",
      "shopify:read_inventory",
    ]);

    await cleanup();
  });

  test("skill with triggers array of objects", async () => {
    await setup();
    const filePath = join(tempDir, "SKILL.md");
    await writeFile(
      filePath,
      `---
name: scheduled-check
description: Runs on schedule or voice.
version: "1.0.0"
triggers:
  - cron: "0 9 * * 1"
  - voice: "check my inventory"
---

Instructions here.`,
    );

    const prompt = await loadPrompt(filePath, { meta: MetadataMode.ALLOW });
    expect(prompt.meta?.extras?.triggers).toEqual([
      { cron: "0 9 * * 1" },
      { voice: "check my inventory" },
    ]);

    await cleanup();
  });

  test("minimal skill (name + description only)", async () => {
    await setup();
    const filePath = join(tempDir, "SKILL.md");
    await writeFile(
      filePath,
      `---
name: simple-skill
description: A simple skill.
---

Do the thing.`,
    );

    const prompt = await loadPrompt(filePath, { meta: MetadataMode.ALLOW });
    expect(prompt.meta?.extras?.name).toBe("simple-skill");
    expect(prompt.meta?.description).toBe("A simple skill.");
    expect(prompt.meta?.extras?.version).toBeUndefined(); // Not in extras if not present

    await cleanup();
  });

  test("skill with multi-line description (YAML block scalar)", async () => {
    await setup();
    const filePath = join(tempDir, "SKILL.md");
    await writeFile(
      filePath,
      `---
name: beads
description: >
  Tracks complex, multi-session work using the Beads issue tracker
  and dependency graphs.
version: "0.34.0"
author: "Steve Yegge <https://github.com/steveyegge>"
license: MIT
---

# Beads

Track issues.`,
    );

    const prompt = await loadPrompt(filePath, { meta: MetadataMode.ALLOW });
    expect(prompt.meta?.description).toContain("Tracks complex");
    expect(prompt.meta?.description).toContain("dependency graphs");
    expect(prompt.meta?.extras?.name).toBe("beads");
    expect(prompt.meta?.extras?.license).toBe("MIT");

    await cleanup();
  });
});

describe("extras: Prompt.fromString", () => {
  test("extras from YAML frontmatter via fromString", () => {
    const content = `---
title: Test
description: A test
version: "1.0.0"
custom: value
flag: true
count: 42
tags:
  - a
  - b
---

Body content.`;

    const prompt = Prompt.fromString(content, { meta: MetadataMode.ALLOW });
    expect(prompt.meta?.title).toBe("Test");
    expect(prompt.meta?.extras?.custom).toBe("value");
    expect(prompt.meta?.extras?.flag).toBe(true);
    expect(prompt.meta?.extras?.count).toBe(42);
    expect(prompt.meta?.extras?.tags).toEqual(["a", "b"]);
  });

  test("extras from TOML frontmatter via fromString", () => {
    const content = `---
title = "Test"
description = "A test"
version = "1.0.0"
custom = "value"
flag = true
count = 42
tags = ["a", "b"]
---

Body content.`;

    const prompt = Prompt.fromString(content, { meta: MetadataMode.ALLOW });
    expect(prompt.meta?.title).toBe("Test");
    expect(prompt.meta?.extras?.custom).toBe("value");
    expect(prompt.meta?.extras?.flag).toBe(true);
    expect(prompt.meta?.extras?.count).toBe(42);
    expect(prompt.meta?.extras?.tags).toEqual(["a", "b"]);
  });
});

describe("extras: constructor passthrough", () => {
  test("extras survive Prompt constructor", () => {
    const prompt = new Prompt({
      path: "/test.txt",
      meta: {
        title: "Test",
        extras: {
          name: "my-skill",
          "allowed-tools": "Read, Grep",
          "disable-model-invocation": true,
        },
      },
      prompt: new PromptString("Body."),
    });

    expect(prompt.meta?.extras?.name).toBe("my-skill");
    expect(prompt.meta?.extras?.["allowed-tools"]).toBe("Read, Grep");
    expect(prompt.meta?.extras?.["disable-model-invocation"]).toBe(true);
  });
});

describe("extras: YAML save round-trip", () => {
  let tempDir: string;

  const setup = async () => {
    tempDir = await mkdtemp(join(tmpdir(), "textprompts-extras-rt-"));
  };

  const cleanup = async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  };

  test("simple extras round-trip via YAML", async () => {
    await setup();
    const filePath = join(tempDir, "test.txt");
    const prompt = new Prompt({
      path: filePath,
      meta: {
        title: "Skill",
        description: "A skill",
        version: "1.0.0",
        extras: {
          name: "my-skill",
          license: "MIT",
        },
      },
      prompt: new PromptString("Do the thing."),
    });

    await savePrompt(filePath, prompt, { format: "yaml" });
    const loaded = await loadPrompt(filePath, { meta: MetadataMode.ALLOW });
    expect(loaded.meta?.title).toBe("Skill");
    expect(loaded.meta?.extras?.name).toBe("my-skill");
    expect(loaded.meta?.extras?.license).toBe("MIT");

    await cleanup();
  });

  test("boolean extras round-trip via YAML", async () => {
    await setup();
    const filePath = join(tempDir, "test.txt");
    const prompt = new Prompt({
      path: filePath,
      meta: {
        title: "Skill",
        description: "A skill",
        version: "1.0.0",
        extras: {
          "disable-model-invocation": true,
          "user-invocable": false,
        },
      },
      prompt: new PromptString("Body."),
    });

    await savePrompt(filePath, prompt, { format: "yaml" });
    const loaded = await loadPrompt(filePath, { meta: MetadataMode.ALLOW });
    expect(loaded.meta?.extras?.["disable-model-invocation"]).toBe(true);
    expect(loaded.meta?.extras?.["user-invocable"]).toBe(false);

    await cleanup();
  });

  test("array extras round-trip via YAML", async () => {
    await setup();
    const filePath = join(tempDir, "test.txt");
    const prompt = new Prompt({
      path: filePath,
      meta: {
        title: "Skill",
        description: "A skill",
        version: "1.0.0",
        extras: {
          permissions: ["read", "write", "admin"],
        },
      },
      prompt: new PromptString("Body."),
    });

    await savePrompt(filePath, prompt, { format: "yaml" });
    const loaded = await loadPrompt(filePath, { meta: MetadataMode.ALLOW });
    expect(loaded.meta?.extras?.permissions).toEqual(["read", "write", "admin"]);

    await cleanup();
  });

  test("string extras that look numeric stay strings in YAML round-trip", async () => {
    await setup();
    const filePath = join(tempDir, "test.txt");
    const prompt = new Prompt({
      path: filePath,
      meta: {
        title: "Skill",
        description: "A skill",
        version: "1.0.0",
        extras: {
          code: "42",
          zip: "00123",
          decimal: "3.14",
        },
      },
      prompt: new PromptString("Body."),
    });

    await savePrompt(filePath, prompt, { format: "yaml" });
    const loaded = await loadPrompt(filePath, { meta: MetadataMode.ALLOW });
    expect(loaded.meta?.extras?.code).toBe("42");
    expect(loaded.meta?.extras?.zip).toBe("00123");
    expect(loaded.meta?.extras?.decimal).toBe("3.14");
    expect(typeof loaded.meta?.extras?.code).toBe("string");
    expect(typeof loaded.meta?.extras?.zip).toBe("string");
    expect(typeof loaded.meta?.extras?.decimal).toBe("string");

    await cleanup();
  });

  test("nested object extras round-trip via YAML", async () => {
    await setup();
    const filePath = join(tempDir, "test.txt");
    const prompt = new Prompt({
      path: filePath,
      meta: {
        title: "Skill",
        description: "A skill",
        version: "1.0.0",
        extras: {
          hooks: {
            "pre-run": "echo hello",
            "post-run": "echo done",
          },
        },
      },
      prompt: new PromptString("Body."),
    });

    await savePrompt(filePath, prompt, { format: "yaml" });
    const loaded = await loadPrompt(filePath, { meta: MetadataMode.ALLOW });
    expect(loaded.meta?.extras?.hooks).toEqual({
      "pre-run": "echo hello",
      "post-run": "echo done",
    });

    await cleanup();
  });

  test("TOML extras round-trip for simple types", async () => {
    await setup();
    const filePath = join(tempDir, "test.txt");
    const prompt = new Prompt({
      path: filePath,
      meta: {
        title: "Skill",
        description: "A skill",
        version: "1.0.0",
        extras: {
          name: "my-skill",
          flag: true,
          count: 42,
          tags: ["a", "b"],
        },
      },
      prompt: new PromptString("Body."),
    });

    await savePrompt(filePath, prompt); // default TOML format
    const loaded = await loadPrompt(filePath, { meta: MetadataMode.ALLOW });
    expect(loaded.meta?.extras?.name).toBe("my-skill");
    expect(loaded.meta?.extras?.flag).toBe(true);
    expect(loaded.meta?.extras?.count).toBe(42);
    expect(loaded.meta?.extras?.tags).toEqual(["a", "b"]);

    await cleanup();
  });

  test("TOML save skips mixed-type extras arrays", async () => {
    await setup();
    const filePath = join(tempDir, "test.txt");
    const prompt = new Prompt({
      path: filePath,
      meta: {
        title: "Skill",
        description: "A skill",
        version: "1.0.0",
        extras: {
          mixed: ["alpha", 42, true],
          keep: ["x", "y"],
        },
      },
      prompt: new PromptString("Body."),
    });

    await savePrompt(filePath, prompt); // default TOML format
    const loaded = await loadPrompt(filePath, { meta: MetadataMode.ALLOW });
    expect(loaded.meta?.extras?.mixed).toBeUndefined();
    expect(loaded.meta?.extras?.keep).toEqual(["x", "y"]);

    await cleanup();
  });

  test("saved YAML file has extras in frontmatter", async () => {
    await setup();
    const filePath = join(tempDir, "test.txt");
    const prompt = new Prompt({
      path: filePath,
      meta: {
        title: "Skill",
        description: "A skill",
        version: "1.0.0",
        extras: {
          name: "my-skill",
          "disable-model-invocation": true,
        },
      },
      prompt: new PromptString("Body."),
    });

    await savePrompt(filePath, prompt, { format: "yaml" });
    const saved = await readFile(filePath, "utf8");
    expect(saved).toContain("my-skill");
    expect(saved).toContain("disable-model-invocation: true");

    await cleanup();
  });
});

describe("extras: STRICT mode preserves extras", () => {
  let tempDir: string;

  const setup = async () => {
    tempDir = await mkdtemp(join(tmpdir(), "textprompts-extras-strict-"));
  };

  const cleanup = async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  };

  test("STRICT mode still captures extras", async () => {
    await setup();
    const filePath = join(tempDir, "test.txt");
    await writeFile(
      filePath,
      `---
title: Strict Skill
description: Has extras in strict mode
version: "1.0.0"
name: strict-test
allowed-tools: "Read, Grep"
---

Body.`,
    );

    const prompt = await loadPrompt(filePath, { meta: MetadataMode.STRICT });
    expect(prompt.meta?.title).toBe("Strict Skill");
    expect(prompt.meta?.extras?.name).toBe("strict-test");
    expect(prompt.meta?.extras?.["allowed-tools"]).toBe("Read, Grep");

    await cleanup();
  });
});

describe("extras: known field type coercion backward compat", () => {
  test("boolean known field coerced to string", () => {
    // If someone writes `title: true` (weird but possible), it should be coerced
    const content = `---
title: true
description: test
version: "1.0.0"
---

Body.`;

    const prompt = Prompt.fromString(content, { meta: MetadataMode.ALLOW });
    expect(prompt.meta?.title).toBe("true");
  });

  test("numeric known field coerced to string", () => {
    const content = `---
title: Test
description: test
version: 2.0
---

Body.`;

    const prompt = Prompt.fromString(content, { meta: MetadataMode.ALLOW });
    expect(prompt.meta?.version).toBe("2");
  });

  test("boolean extras NOT coerced to string", () => {
    const content = `---
title: Test
description: test
version: "1.0.0"
flag: true
---

Body.`;

    const prompt = Prompt.fromString(content, { meta: MetadataMode.ALLOW });
    expect(prompt.meta?.extras?.flag).toBe(true);
    expect(typeof prompt.meta?.extras?.flag).toBe("boolean");
  });
});
