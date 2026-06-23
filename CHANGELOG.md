# Changelog

## [2.1.0] — 2026-06-23

### Added

- `textprompts.__version__` now exposes the installed package version.

## [2.0.0] — 2026-05-19

### BREAKING CHANGES

- Reserved keywords cannot be flag names, variable names, or enum case values: `if`, `else`, `end`, `switch`, `case`, `flags`.
- `flags` is reserved across the whole API surface.
- Removals above (`{0}`, `{}`, `skip_validation=`) raise `ParseError` / `TypeError` instead of silently working.
- Migration guide in the Agents skill: `docs/writing-prompts-with-textprompts` (details in `references/migration-from-v1.md`).

### Added

- Conditional rendering: `{if flag}`, `{if !flag}`, `{else}`, `{switch flag}` / `{case}` — block and inline forms.
- Typed `[flags.<name>]` and `[variables.<name>]` frontmatter; exhaustiveness + case-value checks at parse time.
- `Prompt.from_string(...)`; `frontmatter_format="auto"|"toml"|"yaml"`.
- Typed errors: `ParseError`, `FrontmatterError`, `SemanticError`, `FormatError` with stable codes.

### Changed

- `Prompt.format(name=..., flags={...})` is the canonical signature.

### Deprecated

- `meta=` loader kwarg. Use `metadata=`.

### Removed

- `{0}` positional placeholders.
- `{}` empty placeholders.
- `skip_validation=` on `format()`. Validator always runs.

## [1.6.0] — 2026-03-29

Default metadata mode `IGNORE` → `ALLOW`. Removed `load_prompts()` (roll your own glob).

## [1.5.0] — 2026-03-19

Section anchors normalise to underscore IDs.

## [1.4.0] — 2026-03-15

Section parsing: `parse_sections`, `generate_slug`, `inject_anchors`, `render_toc`.

## [1.3.0] — 2026-03-01

Custom frontmatter fields kept in `meta.extras`.

## [1.2.0] — 2026-02-14

YAML frontmatter alongside TOML. `save_prompt(format="yaml")`.

## [1.1.0] — 2025-10-12

Removed `Prompt.body`. Use `Prompt.prompt`.

## [1.0.0] — 2025-10-05

First stable release.

## [0.0.x] — 2025-07

Initial releases: loader, TOML frontmatter, `{var}` placeholders, CLI.
