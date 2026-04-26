# Elixir Port Scope (textprompts-ex)

This document scopes a production-grade Elixir port for TextPrompts based on the existing cross-language contract and Elixir/OTP conventions.

## Goals

- Ship an idiomatic Elixir library under `packages/textprompts-ex/` with API parity for core behavior (loading, saving, parsing sections, placeholder formatting).
- Preserve compatibility with shared fixtures in `testdata/sections`.
- Keep runtime dependencies lean while providing strong docs, validation, and CI quality gates.

## Package Identity

- Folder: `packages/textprompts-ex/`
- OTP app: `:textprompts`
- Public namespace: `TextPrompts`
- Hex package name target: `textprompts` (fallback `text_prompts` if needed).
- Library-only package: no supervision tree/application process required beyond `extra_applications: [:logger]`.

## Proposed Module Layout

```text
packages/textprompts-ex/
├── mix.exs
├── .formatter.exs
├── .credo.exs
├── .dialyzer_ignore.exs
├── README.md  CHANGELOG.md  LICENSE
├── config/config.exs
├── lib/
│   ├── text_prompts.ex
│   └── text_prompts/
│       ├── config.ex
│       ├── metadata_mode.ex
│       ├── prompt.ex
│       ├── prompt_meta.ex
│       ├── prompt_string.ex
│       ├── sigil.ex
│       ├── placeholders.ex
│       ├── frontmatter.ex
│       ├── frontmatter/{parser,toml,yaml}.ex
│       ├── sections.ex
│       ├── sections/{section,link,parse_result,frontmatter_block}.ex
│       ├── loader.ex
│       ├── saver.ex
│       ├── error.ex
│       ├── error/{file_missing,missing_metadata,invalid_metadata,malformed_header,format}.ex
│       └── cli.ex
├── lib/mix/tasks/
│   ├── textprompts.show.ex
│   ├── textprompts.list.ex
│   └── textprompts.validate.ex
└── test/
```

## Public API Contract

Expose a small façade in `TextPrompts` and keep internals private.

- `load_prompt/2` and `load_prompt!/2`
- `load_section/3`
- `save_prompt/3`
- `parse_sections/1`
- `generate_slug/1`, `normalize_anchor_id/1`, `inject_anchors/1`, `render_toc/2`, `get_section_text/2`

Conventions:

- Non-bang variants return tagged tuples.
- Bang variants raise typed exceptions.
- Options validated with `Keyword.validate!/2`.

## Design Decisions

### 1) Metadata mode precedence

Implement explicit precedence:

1. Per-call `meta:` option
2. `with_metadata/2` process-scoped override
3. `Application.get_env(:textprompts, :metadata_mode)`
4. compile-time default (`Application.compile_env/3`)
5. env fallback
6. `:allow`

### 2) Frontmatter parsing behavior

Define `TextPrompts.Frontmatter.Parser` behaviour and default parser order in config:

- TOML parser first
- YAML parser fallback

### 3) PromptString ergonomics

- protocol implementations for `String.Chars` and `Inspect`
- optional `Jason.Encoder` only when `Jason` is available
- `~P` sigil for compile-time placeholder extraction

### 4) Errors

Use typed exceptions with structured fields (e.g. path, reason), avoiding generic runtime errors.

### 5) Observability

Emit optional telemetry around load/save:

- `[:textprompts, :load, :start|:stop|:exception]`
- `[:textprompts, :save, :start|:stop|:exception]`

## Dependencies

Runtime:

- `:toml`
- `:yaml_elixir`
- `:jason` (primarily for CLI JSON output)

Dev/test:

- `:ex_doc`, `:dialyxir`, `:credo`, `:excoveralls`, `:stream_data`, `:mix_test_watch`

## Delivery Plan (small PRs)

1. **Scaffold:** project skeleton + lint/format/dialyzer baseline.
2. **Core types:** errors, metadata mode, config, prompt structs.
3. **Frontmatter:** behaviour + TOML/YAML parsers + fixtures.
4. **I/O:** loader/saver + bang/non-bang + telemetry.
5. **Sections:** parity with `testdata/sections` snapshots.
6. **PromptString:** formatting + placeholders + `~P` sigil.
7. **CLI:** escript + mix tasks.
8. **CI/docs:** workflow, Makefile shortcuts, README + changelog.
9. **Release:** `0.1.0` and Hex publish workflow.

## Acceptance Criteria

- `mix format --check-formatted` passes.
- `mix compile --warnings-as-errors` passes.
- `mix test --cover` passes with parity checks against shared fixtures.
- `mix credo --strict` and `mix dialyzer` pass.
- `mix docs` succeeds and publishes module-grouped docs.

## Risks & Mitigations

- **Parser differences across TOML/YAML libs** → lock fixture parity tests early.
- **Global config leakage in tests** → isolate env-mutation tests with sync tags and cleanup.
- **API drift from other ports** → add cross-language compatibility guide + snapshots.

## Out of Scope for v0.1.0

- Phoenix integration helpers.
- Persistent processes (GenServer/ETS cache).
- Additional frontmatter formats beyond TOML/YAML.
