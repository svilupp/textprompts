import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

import * as core from "../src/core";
import * as index from "../src/index";
import { MetadataMode } from "../src/config";
import { Prompt } from "../src/models";
import { PromptString } from "../src/prompt-string";
import { parseString } from "../src/parser-core";
import { basename, extname } from "../src/path-utils";

// ---------------------------------------------------------------------------
// 1. core exports are a subset of index exports
// ---------------------------------------------------------------------------
describe("core ↔ index contract", () => {
  test("core exports are a subset of index exports", () => {
    const coreKeys = Object.keys(core);
    const indexKeys = new Set(Object.keys(index));

    expect(coreKeys.length).toBeGreaterThan(0);

    for (const key of coreKeys) {
      expect(indexKeys.has(key)).toBe(true);
      expect((core as Record<string, unknown>)[key]).toBe(
        (index as Record<string, unknown>)[key],
      );
    }
  });

  // ---------------------------------------------------------------------------
  // 2. index exports are a superset of core plus fs-dependent APIs
  // ---------------------------------------------------------------------------
  test("index exports are a superset of core plus fs-dependent APIs", () => {
    const coreKeys = new Set(Object.keys(core));
    const indexKeys = Object.keys(index);

    const extras = indexKeys.filter((k) => !coreKeys.has(k)).sort();
    expect(extras).toEqual(["loadPrompt", "loadSection", "savePrompt"]);
  });
});

// ---------------------------------------------------------------------------
// 3. core module graph has no node: imports
// ---------------------------------------------------------------------------
describe("core purity", () => {
  const srcDir = resolve(__dirname, "..", "src");

  /** Extract relative import paths from a TS source file. */
  const extractLocalImports = (source: string): string[] => {
    const matches: string[] = [];
    // Match:  from "./foo"  or  from "./foo/bar"
    const re = /from\s+["'](\.[^"']+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      matches.push(m[1]);
    }
    // Also match dynamic require("./foo")
    const reqRe = /require\(["'](\.[^"']+)["']\)/g;
    while ((m = reqRe.exec(source)) !== null) {
      matches.push(m[1]);
    }
    return matches;
  };

  /** Extract any node: imports from a TS source file. */
  const extractNodeImports = (source: string): string[] => {
    const matches: string[] = [];
    const re = /(?:from|require\()\s*["'](node:[^"']+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      matches.push(m[1]);
    }
    return matches;
  };

  /** Recursively walk the import graph starting from a file. */
  const walkImportGraph = (entryFile: string): Map<string, string[]> => {
    const visited = new Map<string, string[]>(); // file -> node: imports
    const queue = [entryFile];

    while (queue.length > 0) {
      const file = queue.pop()!;
      if (visited.has(file)) continue;

      let source: string;
      try {
        source = readFileSync(file, "utf-8");
      } catch {
        // Try with .ts extension
        try {
          source = readFileSync(file + ".ts", "utf-8");
        } catch {
          continue;
        }
      }

      const nodeImports = extractNodeImports(source);
      visited.set(file, nodeImports);

      for (const imp of extractLocalImports(source)) {
        const resolved = resolve(dirname(file), imp);
        // Try exact path first, then with .ts
        const candidates = [resolved, resolved + ".ts"];
        for (const candidate of candidates) {
          try {
            readFileSync(candidate, "utf-8");
            if (!visited.has(candidate)) queue.push(candidate);
            break;
          } catch {
            // try next
          }
        }
      }
    }

    return visited;
  };

  test("core module graph has no node: imports", () => {
    const coreEntry = resolve(srcDir, "core.ts");
    const graph = walkImportGraph(coreEntry);

    const violations: { file: string; imports: string[] }[] = [];
    for (const [file, nodeImports] of graph) {
      if (nodeImports.length > 0) {
        violations.push({ file: file.replace(srcDir + "/", ""), imports: nodeImports });
      }
    }

    expect(violations).toEqual([]);
  });

  test("core imports only from allowlisted modules", () => {
    const allowlist = new Set([
      resolve(srcDir, "core.ts"),
      resolve(srcDir, "config.ts"),
      resolve(srcDir, "errors.ts"),
      resolve(srcDir, "models.ts"),
      resolve(srcDir, "parser-core.ts"),
      resolve(srcDir, "path-utils.ts"),
      resolve(srcDir, "placeholder-utils.ts"),
      resolve(srcDir, "prompt-string.ts"),
      resolve(srcDir, "sections.ts"),
      resolve(srcDir, "constants.ts"),
      resolve(srcDir, "toml.ts"),
      resolve(srcDir, "yaml.ts"),
    ]);

    const denylist = new Set([
      resolve(srcDir, "parser.ts"),
      resolve(srcDir, "loaders.ts"),
      resolve(srcDir, "savers.ts"),
      resolve(srcDir, "cli.ts"),
    ]);

    const coreEntry = resolve(srcDir, "core.ts");
    const graph = walkImportGraph(coreEntry);

    const deniedFiles: string[] = [];
    for (const file of graph.keys()) {
      if (denylist.has(file)) {
        deniedFiles.push(file.replace(srcDir + "/", ""));
      }
    }
    expect(deniedFiles).toEqual([]);

    // Every file in the graph should be in the allowlist
    const unknownFiles: string[] = [];
    for (const file of graph.keys()) {
      if (!allowlist.has(file)) {
        unknownFiles.push(file.replace(srcDir + "/", ""));
      }
    }
    expect(unknownFiles).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. core parseString works without node:fs
// ---------------------------------------------------------------------------
describe("core parseString", () => {
  test("parseString works with TOML frontmatter", () => {
    const content = `---
title = "Test Prompt"
description = "A test"
version = "1.0"
---
Hello {name}, welcome to {place}.`;

    const prompt = parseString(content, "<test>", MetadataMode.ALLOW);

    expect(prompt).toBeInstanceOf(Prompt);
    expect(prompt.meta?.title).toBe("Test Prompt");
    expect(prompt.meta?.description).toBe("A test");
    expect(prompt.meta?.version).toBe("1.0");
    expect(prompt.format({ name: "Alice", place: "Wonderland" })).toBe(
      "Hello Alice, welcome to Wonderland.",
    );
  });
});

// ---------------------------------------------------------------------------
// 5. core Prompt.fromString works without node:fs
// ---------------------------------------------------------------------------
describe("core Prompt.fromString", () => {
  test("Prompt.fromString returns a valid Prompt", () => {
    const prompt = Prompt.fromString("Hello {name}", {
      path: "test.txt",
      meta: "allow",
    });

    expect(prompt).toBeInstanceOf(Prompt);
    expect(prompt.format({ name: "world" })).toBe("Hello world");
  });
});

// ---------------------------------------------------------------------------
// 6. core PromptString.format works
// ---------------------------------------------------------------------------
describe("core PromptString.format", () => {
  test("PromptString.format substitutes placeholders", () => {
    const ps = new PromptString("Hello {name}");
    expect(ps.format({ name: "world" })).toBe("Hello world");
  });
});

// ---------------------------------------------------------------------------
// 7. path-utils basename matches node:path basename
// ---------------------------------------------------------------------------
describe("path-utils basename", () => {
  test("strips directory and extension", () => {
    expect(basename("foo/bar/baz.txt", ".txt")).toBe("baz");
  });

  test("strips directory only", () => {
    expect(basename("foo/bar/baz.txt")).toBe("baz.txt");
  });

  test("handles absolute paths", () => {
    expect(basename("/absolute/path.md", ".md")).toBe("path");
  });

  test("handles no directory", () => {
    expect(basename("no-dir.txt")).toBe("no-dir.txt");
  });

  test("handles Windows paths", () => {
    expect(basename("foo\\bar\\baz.txt")).toBe("baz.txt");
  });

  test("handles special path strings", () => {
    expect(basename("<string>")).toBe("<string>");
  });
});

// ---------------------------------------------------------------------------
// 8. path-utils extname matches node:path extname
// ---------------------------------------------------------------------------
describe("path-utils extname", () => {
  test("returns extension with dot", () => {
    expect(extname("foo.txt")).toBe(".txt");
  });

  test("returns last extension for multiple dots", () => {
    expect(extname("foo.bar.baz")).toBe(".baz");
  });

  test("returns empty for no extension", () => {
    expect(extname("noext")).toBe("");
  });

  test("returns empty for dotfiles", () => {
    expect(extname(".hidden")).toBe("");
  });

  test("handles paths with directories", () => {
    expect(extname("foo/bar.txt")).toBe(".txt");
  });
});
