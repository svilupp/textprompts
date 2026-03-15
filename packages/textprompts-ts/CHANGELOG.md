# Changelog

All notable changes to the textprompts TypeScript package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/svilupp/textprompts/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/svilupp/textprompts/releases/tag/v0.6.0
[0.5.0]: https://github.com/svilupp/textprompts/releases/tag/v0.5.0
[0.4.0]: https://github.com/svilupp/textprompts/releases/tag/v0.4.0
[0.3.0]: https://github.com/svilupp/textprompts/releases/tag/v0.3.0
[0.2.0]: https://github.com/svilupp/textprompts/releases/tag/v0.2.0
[0.1.0]: https://github.com/svilupp/textprompts/releases/tag/v0.1.0
