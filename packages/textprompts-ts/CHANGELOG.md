# Changelog

All notable changes to the textprompts TypeScript package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]


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

[Unreleased]: https://github.com/svilupp/textprompts/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/svilupp/textprompts/releases/tag/v0.2.0
[0.1.0]: https://github.com/svilupp/textprompts/releases/tag/v0.1.0
