# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.5.0] - 2026-03-19

### Changed
- Section anchors now normalize to underscore IDs, and generic XML sections default to tag-based anchors

## [1.4.0] - 2026-03-15

### Added
- Python section parsing APIs: `parse_sections()`, `generate_slug()`, `inject_anchors()`, and `render_toc()`
- Shared cross-language section parser corpus under `testdata/sections`

## [1.3.0] - 2026-03-01

### Added
- Custom frontmatter fields preserved in `prompt.meta.extras` dict (previously dropped silently)

## [1.2.0] - 2026-02-14

### Added
- **YAML front matter support**: Prompts can now use YAML syntax (`key: value`) in addition to TOML (`key = "value"`) for front matter metadata (parse-then-fallback detection: tries TOML first (backward compatible), falls back to YAML automatically)
- Nested object validation: YAML nested structures are rejected with clear error messages
- `save_prompt()` now accepts a `format` keyword argument (`"toml"` or `"yaml"`) to choose output format
- New dependency: `pyyaml>=6.0`

### Fixed
- Enum identity comparison in parser now uses `.value` to be resilient to module reloads

## [1.1.0] - 2025-10-12

### Removed
- Removed legacy alias `Prompt.body` - use `Prompt.prompt` instead.

## [1.0.0] - 2025-10-05

### Updated
- Clean up examples and dependencies for v1.0.0 release

## [0.0.4] - 2025-07-27

### Changed
- Added `Prompt.from_path()` convenience constructor.
- Cleaned up `Prompt` initialization logic and updated docs.

## [0.0.3] - 2025-07-22

### Added
- Metadata handling mode can be set via environment variable `TEXTPROMPTS_METADATA_MODE`.

## [0.0.1] - 2025-07-06

### Added
- Initial release of textprompts
- Core functionality for loading prompts with TOML front-matter
- Support for file-based and directory-based prompt loading
- Placeholder templating with `{{variable}}` syntax
- CLI tool for working with prompts
- Type annotations and full mypy support
- Comprehensive test suite
- Documentation and examples
