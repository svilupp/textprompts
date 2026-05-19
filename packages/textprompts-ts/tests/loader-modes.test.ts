import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { FrontmatterError, MissingMetadataError, SemanticError } from "../src/errors";
import { loadPrompt } from "../src/loaders";
import { Prompt } from "../src/models";

const mkTmp = () => mkdtemp(join(tmpdir(), "textprompts-modes-"));

describe('metadata: "ignore"', () => {
  test("treats malformed header as body verbatim", async () => {
    const dir = await mkTmp();
    const file = join(dir, "p.txt");
    await writeFile(file, "---\n!!!not toml or yaml!!!\n---\nbody {var}\n");
    const p = await loadPrompt(file, { metadata: "ignore" });
    // SPEC §4.6: the whole file is the body — the `---` lines are preserved.
    expect(p.toString()).toBe("---\n!!!not toml or yaml!!!\n---\nbody {var}\n");
    expect(p.meta?.title).toBe("p");
    expect(p.meta?.flags).toEqual({});
    expect(p.meta?.variables).toEqual({});
    expect(p.meta?.extras).toEqual({});
    await rm(dir, { recursive: true, force: true });
  });

  test("file with frontmatter-looking block and no post-header bytes is not empty", async () => {
    const dir = await mkTmp();
    const file = join(dir, "p.txt");
    await writeFile(file, "---\nfoo\n---\n");
    // SPEC §2.5: in "ignore" mode the whole file is the body, so this file
    // is NOT empty — it loads successfully and renders verbatim.
    const p = await loadPrompt(file, { metadata: "ignore" });
    expect(p.toString()).toBe("---\nfoo\n---\n");
    await rm(dir, { recursive: true, force: true });
  });

  test("empty file throws empty-prompt error", async () => {
    const dir = await mkTmp();
    const file = join(dir, "p.txt");
    await writeFile(file, "");
    await expect(loadPrompt(file, { metadata: "ignore" })).rejects.toThrow(
      /prompt file is empty/i,
    );
    await rm(dir, { recursive: true, force: true });
  });

  test("whitespace-only file throws empty-prompt error", async () => {
    const dir = await mkTmp();
    const file = join(dir, "p.txt");
    await writeFile(file, "   \n  \n");
    await expect(loadPrompt(file, { metadata: "ignore" })).rejects.toThrow(
      /prompt file is empty/i,
    );
    await rm(dir, { recursive: true, force: true });
  });

  test("fromString ignore on implicit flag works", () => {
    const p = Prompt.fromString("Hello {if foo}friend{end}!", {
      metadata: "ignore",
    });
    expect(p.format({ flags: { foo: true } })).toBe("Hello friend!");
    expect(p.meta.flags.foo).toEqual({ kind: "boolean", extras: {} });
  });
});

describe('metadata: "strict"', () => {
  test("rejects missing frontmatter", async () => {
    const dir = await mkTmp();
    const file = join(dir, "p.txt");
    await writeFile(file, "no frontmatter here");
    await expect(loadPrompt(file, { metadata: "strict" })).rejects.toBeInstanceOf(
      MissingMetadataError,
    );
    await rm(dir, { recursive: true, force: true });
  });

  test("rejects undeclared flag in body", async () => {
    const dir = await mkTmp();
    const file = join(dir, "p.txt");
    await writeFile(
      file,
      '---\ntitle = "T"\ndescription = "D"\nversion = "1.0"\n---\n{if undeclared}x{end}',
    );
    await expect(loadPrompt(file, { metadata: "strict" })).rejects.toBeInstanceOf(
      SemanticError,
    );
    await rm(dir, { recursive: true, force: true });
  });

  test("rejects flag declared without description", async () => {
    const dir = await mkTmp();
    const file = join(dir, "p.txt");
    await writeFile(
      file,
      `---
title = "T"
description = "D"
version = "1.0"

[flags.foo]
type = "boolean"
---
{if foo}x{end}`,
    );
    await expect(loadPrompt(file, { metadata: "strict" })).rejects.toBeInstanceOf(
      FrontmatterError,
    );
    await rm(dir, { recursive: true, force: true });
  });

  test("rejects unused declared flag without description", async () => {
    const dir = await mkTmp();
    const file = join(dir, "p.txt");
    await writeFile(
      file,
      `---
title = "T"
description = "D"
version = "1.0"

[flags.unused]
type = "boolean"
---
Body.`,
    );
    await expect(loadPrompt(file, { metadata: "strict" })).rejects.toBeInstanceOf(
      FrontmatterError,
    );
    await rm(dir, { recursive: true, force: true });
  });

  test("rejects same implicit flag used as if and switch", async () => {
    const dir = await mkTmp();
    const file = join(dir, "p.txt");
    await writeFile(file, "{if mode}x{end}\n{switch mode}{case free}f{end}");
    await expect(loadPrompt(file, { metadata: "allow" })).rejects.toBeInstanceOf(
      SemanticError,
    );
    await rm(dir, { recursive: true, force: true });
  });

  test("accepts undeclared variable in body (variables not subject to strict)", async () => {
    const dir = await mkTmp();
    const file = join(dir, "p.txt");
    await writeFile(
      file,
      `---
title = "T"
description = "D"
version = "1.0"
---
Hello {who}.`,
    );
    const p = await loadPrompt(file, { metadata: "strict" });
    expect(p.format({ who: "Alice" })).toBe("Hello Alice.");
    await rm(dir, { recursive: true, force: true });
  });

  test("passes a fully-declared prompt", async () => {
    const dir = await mkTmp();
    const file = join(dir, "p.txt");
    await writeFile(
      file,
      `---
title = "T"
description = "D"
version = "1.0"

[flags.show_tips]
type = "boolean"
description = "Show tips"
---
{if show_tips}Tip!{end}
Body.`,
    );
    const p = await loadPrompt(file, { metadata: "strict" });
    expect(p.format({ flags: { show_tips: true } })).toContain("Tip!");
    await rm(dir, { recursive: true, force: true });
  });
});

describe("declared vs body reconciliation (§4.7)", () => {
  test("boolean flag used in switch errors", async () => {
    const dir = await mkTmp();
    const file = join(dir, "p.txt");
    await writeFile(
      file,
      `---
[flags.foo]
type = "boolean"
description = "B"
---
{switch foo}{case a}A{end}`,
    );
    await expect(loadPrompt(file, { metadata: "allow" })).rejects.toBeInstanceOf(
      SemanticError,
    );
    await rm(dir, { recursive: true, force: true });
  });

  test("enum flag used in if errors", async () => {
    const dir = await mkTmp();
    const file = join(dir, "p.txt");
    await writeFile(
      file,
      `---
[flags.tier]
type = "enum"
values = ["free", "premium"]
description = "T"
---
{if tier}x{end}`,
    );
    await expect(loadPrompt(file, { metadata: "allow" })).rejects.toBeInstanceOf(
      SemanticError,
    );
    await rm(dir, { recursive: true, force: true });
  });

  test("case value not in declared enum errors", async () => {
    const dir = await mkTmp();
    const file = join(dir, "p.txt");
    await writeFile(
      file,
      `---
[flags.tier]
type = "enum"
values = ["free", "premium"]
description = "T"
---
{switch tier}{case free}f{case bogus}?{case premium}p{end}`,
    );
    await expect(loadPrompt(file, { metadata: "allow" })).rejects.toBeInstanceOf(
      SemanticError,
    );
    await rm(dir, { recursive: true, force: true });
  });

  test("non-exhaustive switch without else errors", async () => {
    const dir = await mkTmp();
    const file = join(dir, "p.txt");
    await writeFile(
      file,
      `---
[flags.tier]
type = "enum"
values = ["free", "premium", "enterprise"]
description = "T"
---
{switch tier}{case free}f{case premium}p{end}`,
    );
    await expect(loadPrompt(file, { metadata: "allow" })).rejects.toThrow(
      /missing cases.*enterprise/,
    );
    await rm(dir, { recursive: true, force: true });
  });

  test("non-exhaustive switch WITH else passes", async () => {
    const dir = await mkTmp();
    const file = join(dir, "p.txt");
    await writeFile(
      file,
      `---
[flags.tier]
type = "enum"
values = ["free", "premium", "enterprise"]
description = "T"
---
{switch tier}{case free}f{case premium}p{else}?{end}`,
    );
    const p = await loadPrompt(file, { metadata: "allow" });
    expect(p.format({ flags: { tier: "enterprise" } })).toBe("?");
    await rm(dir, { recursive: true, force: true });
  });

  test("name used as both flag and variable in body errors", async () => {
    const dir = await mkTmp();
    const file = join(dir, "p.txt");
    await writeFile(file, "{if foo}body{end}{foo}");
    await expect(loadPrompt(file, { metadata: "allow" })).rejects.toBeInstanceOf(
      SemanticError,
    );
    await rm(dir, { recursive: true, force: true });
  });
});

describe("frontmatterFormat option", () => {
  test('"toml" rejects YAML-only header', async () => {
    const dir = await mkTmp();
    const file = join(dir, "p.txt");
    await writeFile(file, '---\ntitle: yaml only\n---\nbody');
    await expect(
      loadPrompt(file, { metadata: "allow", frontmatterFormat: "toml" }),
    ).rejects.toThrow(/Invalid TOML/);
    await rm(dir, { recursive: true, force: true });
  });

  test('"yaml" accepts YAML-only header', async () => {
    const dir = await mkTmp();
    const file = join(dir, "p.txt");
    await writeFile(file, '---\ntitle: yaml only\n---\nbody');
    const p = await loadPrompt(file, { metadata: "allow", frontmatterFormat: "yaml" });
    expect(p.meta?.title).toBe("yaml only");
    await rm(dir, { recursive: true, force: true });
  });

  test('"auto" tries both', async () => {
    const dir = await mkTmp();
    const file = join(dir, "p.txt");
    await writeFile(file, '---\ntitle: yaml only\n---\nbody');
    const p = await loadPrompt(file, { metadata: "allow", frontmatterFormat: "auto" });
    expect(p.meta?.title).toBe("yaml only");
    await rm(dir, { recursive: true, force: true });
  });
});
