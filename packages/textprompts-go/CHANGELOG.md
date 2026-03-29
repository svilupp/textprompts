# Changelog

All notable changes to this package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this package adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
- Added YAML frontmatter support, metadata extras, section extraction helpers, and positional formatting so Go now matches the shared textprompts format much more closely.
- `ModeAllow` remains the default, ignored-metadata warnings are wired up, and maintainer/docs coverage has been tightened.

## [0.3.0] - 2026-03-19
- Section anchors now normalize to underscore IDs, and generic XML sections default to tag-based anchors.

## [0.2.0] - 2026-03-15
- Added section parsing APIs plus shared mixed Markdown/XML coverage.
- Added a stricter maintainer workflow with formatting, lint, vuln, vet, and race-test checks.
