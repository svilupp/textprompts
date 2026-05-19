// Cross-port conformance harness.
//
// Globs `docs/specs/fixtures/*/`. For each fixture, loads the prompt via
// `Prompt.fromString` with the options in `options.json`, calls `format` with
// the inputs in `input.json`, and asserts either byte-for-byte equality with
// `expected.txt` (success fixtures) or the structured error info in
// `expected-error.json` (error fixtures).
//
// See `docs/specs/fixtures/README.md` for the fixture schema.

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import {
  FormatError,
  FrontmatterError,
  ParseError,
  SemanticError,
  TextPromptsError,
} from "../src/errors";
import { Prompt } from "../src/models";

const FIXTURES_DIR = path.resolve(import.meta.dir, "../../../docs/specs/fixtures");

const readJsonIfPresent = (file: string): Record<string, unknown> | null => {
  try {
    const stat = statSync(file);
    if (!stat.isFile()) return null;
  } catch {
    return null;
  }
  const raw = readFileSync(file, "utf8");
  if (raw.trim() === "") return {};
  return JSON.parse(raw) as Record<string, unknown>;
};

interface InputJson {
  flags?: Record<string, boolean | string>;
  variables?: Record<string, unknown>;
}

interface OptionsJson {
  metadata?: "allow" | "strict" | "ignore";
  frontmatterFormat?: "auto" | "toml" | "yaml";
}

interface ExpectedError {
  code: string;
  category: "parse" | "frontmatter" | "semantic" | "format";
  messageContains?: string;
}

const CATEGORY_CLASS: Record<ExpectedError["category"], typeof TextPromptsError> = {
  parse: ParseError,
  frontmatter: FrontmatterError,
  semantic: SemanticError,
  format: FormatError,
};

const buildFormatArgs = (input: InputJson): Record<string, unknown> => {
  const args: Record<string, unknown> = {};
  if (input.variables !== undefined) {
    for (const [k, v] of Object.entries(input.variables)) {
      args[k] = v;
    }
  }
  if (input.flags !== undefined) {
    args.flags = input.flags;
  }
  return args;
};

const listFixtureDirs = (): string[] => {
  let entries: string[];
  try {
    entries = readdirSync(FIXTURES_DIR);
  } catch {
    return [];
  }
  const dirs: string[] = [];
  for (const entry of entries) {
    const full = path.join(FIXTURES_DIR, entry);
    try {
      if (statSync(full).isDirectory()) {
        dirs.push(entry);
      }
    } catch {
      // skip
    }
  }
  return dirs.sort();
};

const fixtureDirs = listFixtureDirs();

describe("conformance corpus", () => {
  test("corpus directory is non-empty", () => {
    // Catches the bug where the fixtures dir disappears and every fixture
    // silently passes because there is nothing to iterate over.
    expect(fixtureDirs.length).toBeGreaterThan(0);
  });

  for (const name of fixtureDirs) {
    const dir = path.join(FIXTURES_DIR, name);
    const promptFile = path.join(dir, "prompt.txt");
    const inputFile = path.join(dir, "input.json");
    const optionsFile = path.join(dir, "options.json");
    const expectedFile = path.join(dir, "expected.txt");
    const expectedErrorFile = path.join(dir, "expected-error.json");

    test(name, () => {
      const promptText = readFileSync(promptFile, "utf8");
      const input = (readJsonIfPresent(inputFile) as InputJson | null) ?? {};
      const options = (readJsonIfPresent(optionsFile) as OptionsJson | null) ?? {};

      let expectError: ExpectedError | null = null;
      let expectedOutput: string | null = null;
      try {
        const stat = statSync(expectedErrorFile);
        if (stat.isFile()) {
          expectError = readJsonIfPresent(expectedErrorFile) as ExpectedError;
        }
      } catch {
        // not an error fixture
      }
      if (expectError === null) {
        expectedOutput = readFileSync(expectedFile, "utf8");
      }

      const args = buildFormatArgs(input);

      if (expectError !== null) {
        let caught: unknown = null;
        try {
          const prompt = Prompt.fromString(promptText, options);
          prompt.format(args);
        } catch (e) {
          caught = e;
        }
        if (caught === null) {
          throw new Error(
            `Expected error code ${expectError.code} (${expectError.category}); got successful render`,
          );
        }
        const ExpectedClass = CATEGORY_CLASS[expectError.category];
        expect(caught).toBeInstanceOf(ExpectedClass);
        const err = caught as { code?: string; message?: string };
        expect(err.code).toBe(expectError.code);
        if (expectError.messageContains !== undefined) {
          expect(err.message ?? "").toContain(expectError.messageContains);
        }
        return;
      }

      const prompt = Prompt.fromString(promptText, options);
      const actual = prompt.format(args);
      expect(actual).toBe(expectedOutput!);
    });
  }
});
