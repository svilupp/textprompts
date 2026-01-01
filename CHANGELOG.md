# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Go implementation of textprompts (`packages/textprompts-go`)
- Go CI workflow with tests across Go 1.21, 1.22, 1.23

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
