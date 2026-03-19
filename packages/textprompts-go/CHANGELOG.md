# Changelog

All notable changes to this package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this package adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-03-19

### Changed
- Section anchors now normalize to underscore IDs, and generic XML sections default to tag-based anchors

## [0.2.0] - 2026-03-15

### Added
- Section parsing APIs: `ParseSections`, `GenerateSlug`, `InjectAnchors`, and `RenderTOC`
- Shared and package-level tests for mixed Markdown/XML section parsing
- Strict maintainer Makefile with setup, format checks, vet, lint, vuln scan, and race-test `check`
