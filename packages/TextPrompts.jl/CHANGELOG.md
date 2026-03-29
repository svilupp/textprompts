# Changelog

All notable changes to the TextPrompts.jl package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this package adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-03-29

**BREAKING: `load_prompts()` removed** -- use your own file discovery + `load_prompt()` per file.

YAML frontmatter support, custom metadata in `extras`, section parsing & extraction, YAML save format.

## [0.1.0] - 2025-10-12

### Added
- Initial Julia implementation
- Core features: `load_prompt`, `load_prompts`, `save_prompt`, `from_path`, `from_string`
- `PromptString` type for safe string formatting with placeholders
- TOML front-matter support for metadata
- Three metadata modes: STRICT, ALLOW, IGNORE
- Comprehensive test suite with Aqua.jl code quality checks
- PromptingTools.jl integration examples

[0.2.0]: https://github.com/svilupp/textprompts/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/svilupp/textprompts/releases/tag/v0.1.0
