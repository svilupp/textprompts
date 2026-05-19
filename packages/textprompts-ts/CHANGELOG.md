# Changelog

All notable changes to the textprompts TypeScript package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## v1.0.0 — Conditional syntax (BREAKING) — 2026-05-19

Breaking release. Adds conditional syntax (`{if}`, `{switch}`), a typed flag
namespace, AST-based parsing, and stable error codes. Removes positional
placeholders, empty placeholders, and double-brace escapes.

### Added

- `{if flag}` / `{else}` / `{end}` blocks (inline and block forms).
- `{if !flag}` negated conditional.
- `{switch flag}` / `{case X}` / `{else}` / `{end}` enum dispatch (inline and block forms).
- Typed flags namespace via `[flags.*]` TOML / `flags:` YAML.
- Typed variables namespace via `[variables.*]` / `variables:`.
- `metadata: "allow" | "strict" | "ignore"` loader option (replaces `meta:`).
- `frontmatterFormat: "auto" | "toml" | "yaml"` loader option.
- Exhaustiveness checks on enum switches against declared flag `values`.
- AST-backed lexer + parser + renderer; per-error stable string `code`.
- New typed error classes: `ParseError`, `FrontmatterError`, `SemanticError`, `FormatError` (all extend `TextPromptsError`).
- Conformance corpus at `docs/specs/fixtures/` (success + error fixtures); harness at `tests/conformance.test.ts`.
- Per-flag, per-variable, and top-level custom `extras` preserved on `prompt.meta`.
- `prompt.meta` is plain-object and JSON-serializable (no `Map`, no class instances).
- Authoring skill at `docs/writing-prompts-with-textprompts/SKILL.md` with five reference files.
- `parseFile` is now surfaced from the public index alongside `loadPrompt` (previously internal).

### Removed

- Positional placeholders `{0}`, `{1}`, ...
- Empty placeholders `{}`.
- `{{...}}` double-brace escape (use `\{` / `\}` / `\\`).
- `args` overload on `Prompt.format` / `PromptString.format`.
- Public `PromptString` export — use `Prompt.fromString`.
- `meta:` loader option (renamed to `metadata:`).
- `skipValidation` option (validation is AST-driven and always-on).
- `extractPlaceholders` helper (was exported from the now-deleted `src/placeholder-utils.ts`).
- `getPlaceholderInfo` helper (was exported from the now-deleted `src/placeholder-utils.ts`).

### Kept

- `MetadataMode.IGNORE` mode (now also accepts string `"ignore"`). Per SPEC
  §4.6 the source is not inspected for frontmatter at all in this mode — the
  entire file (including any leading `---...---` block) is treated as the
  prompt body; a malformed `---` block is not an error because there is no
  header parsing.
- `loadPrompt`, `savePrompt`, `Prompt.fromPath`, `Prompt.fromString`, `parseFile`, `parseString`.
- Section APIs: `parseSections`, `loadSection`, `getSectionText`, `renderToc`, `injectAnchors`.

### Migration

See [`docs/writing-prompts-with-textprompts/references/migration-from-v1.md`](../../docs/writing-prompts-with-textprompts/references/migration-from-v1.md)
for concrete diffs.

## [0.8.0] - 2026-03-29

### BREAKING CHANGES

**`loadPrompts()` has been removed.** Multi-file/directory scanning and the `fast-glob` dependency have been dropped entirely — they were too platform-specific to maintain cross-compatibility across Node.js, edge runtimes, and browsers. If you relied on `loadPrompts()`, implement your own file discovery and call `loadPrompt()` for each file.

### Added
- `textprompts/core` entry point — pure-string APIs with zero `node:` imports, safe for edge runtimes

### Removed
- `loadPrompts()` function and `LoadPromptsOptions` type
- `fast-glob` dependency (and all its transitive `node:fs` imports)

## [0.7.0] - 2026-03-19

### Changed
- Section anchors now normalize to underscore IDs, generic XML sections use tag-based anchors, and TypeScript adds section body loading helpers

## [0.6.0] - 2026-03-15

### Added
- Section parsing APIs: `parseSections()`, `generateSlug()`, `injectAnchors()`, and `renderToc()`
- Shared cross-language section parser corpus under `testdata/sections`

## [0.5.0] - 2026-03-01

### Added
- Custom frontmatter fields preserved in `prompt.meta.extras` record (previously dropped silently)

## [0.4.0] - 2026-02-14

### Added
- **YAML front matter support**: Prompts can now use YAML syntax (`key: value`) in addition to TOML (`key = "value"`) for front matter metadata
- Parse-then-fallback detection in `parser.ts`: tries TOML first (backward compatible), falls back to YAML automatically
- `savePrompt()` now accepts an optional `{ format: "toml" | "yaml" }` options parameter
- New dependency: `yaml` (^2.4.0)

## [0.3.0] - 2025-11-12

### Changed
- **BREAKING:** Default metadata mode changed from `IGNORE` to `ALLOW` for better out-of-box experience (previously was `IGNORE` for faster onboarding but it led to confusion)

### Added
- Dual ESM/CJS build support with separate `.mjs` and `.cjs` outputs using Bun build system

## [0.2.0] - 2025-10-16

### Added
- `Prompt.fromString()` static method for loading prompts from string content
- Support for bundlers (Vite, Webpack) via `?raw` imports
- Improved documentation with bundler examples

### Changed
- Enhanced error messages with better context

## [0.1.0] - 2025-10-12

### Added
- Initial TypeScript implementation
- Core features: `loadPrompt`, `loadPrompts`, `savePrompt`
- `PromptString` class for safe string formatting
- TOML front-matter support for metadata
- Three metadata modes: STRICT, ALLOW, IGNORE
- CLI tool for prompt inspection
- Comprehensive test suite
- Examples for OpenAI, Anthropic, and Vercel AI SDK

[Unreleased]: https://github.com/svilupp/textprompts/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/svilupp/textprompts/compare/v0.8.0...v1.0.0
[0.8.0]: https://github.com/svilupp/textprompts/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/svilupp/textprompts/releases/tag/v0.7.0
[0.6.0]: https://github.com/svilupp/textprompts/releases/tag/v0.6.0
[0.5.0]: https://github.com/svilupp/textprompts/releases/tag/v0.5.0
[0.4.0]: https://github.com/svilupp/textprompts/releases/tag/v0.4.0
[0.3.0]: https://github.com/svilupp/textprompts/releases/tag/v0.3.0
[0.2.0]: https://github.com/svilupp/textprompts/releases/tag/v0.2.0
[0.1.0]: https://github.com/svilupp/textprompts/releases/tag/v0.1.0
