# Changelog

All notable changes to this package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this package adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-03-29

### Added
- YAML frontmatter support, metadata extras, section extraction helpers, and positional formatting.

### Changed
- Ignored-metadata warnings are configurable, docs/tests were tightened, and `ModeAllow` remains the default.

## [0.3.0] - 2026-03-19
- Section anchors now normalize to underscore IDs, and generic XML sections default to tag-based anchors.

## [0.2.0] - 2026-03-15
- Added section parsing APIs plus shared mixed Markdown/XML coverage.
- Added a stricter maintainer workflow with formatting, lint, vuln, vet, and race-test checks.
