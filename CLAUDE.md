# textprompts

Cross-language prompt file toolkit. Plain text prompt files with optional TOML/YAML frontmatter, validated `{name}` placeholders, Markdown/XML section parsing. Five language implementations share one on-disk format and parse to the same data shape.

## Layout

```
textprompts/
  src/textprompts/                 Python (canonical)
  packages/
    textprompts-ex/                Elixir
    textprompts-go/                Go
    textprompts-ts/                TypeScript / Node (v2 reference)
    TextPrompts.jl/                Julia
  testdata/sections/cases.json     Cross-port section parser fixtures
  docs/                            Python docs (Jekyll)
  docs/specs/                      Cross-language v2 spec + fixture corpus
  docs/specs/SPEC_conditional_syntax_v2.md   Normative v2 spec
  docs/specs/fixtures/                       Conditional-syntax conformance corpus
  docs/writing-prompts-with-textprompts/     Authoring skill (SKILL.md + references)
  docs/elixir-port-scope.md        Cross-port scope notes
  examples/                        Python examples
  tests/                           Python tests
  Makefile                         Top-level dev commands (Python + ex-* targets)
```

## Per-package CLAUDE.md

Each package keeps its own light index. Read it before touching that language.

- `packages/textprompts-ex/CLAUDE.md` (Elixir)
- `packages/textprompts-ts/CLAUDE.md` (TypeScript / Node — v2 reference)

(Add one per package as they get touched.)

## Cross-language invariants

These hold across every port. Breaking any of them breaks fixture parity. The
normative source is `docs/specs/SPEC_conditional_syntax_v2.md`; the conformance
corpus lives at `docs/specs/fixtures/`.

- **File format**: optional `---...---` frontmatter (TOML first, YAML fallback), then body. `+++` delimiters are rejected on purpose. Source normalization (CRLF -> LF, leading UTF-8 BOM strip) runs before any parsing.
- **Placeholder syntax**: `{name}` where `name` matches `[a-zA-Z_][a-zA-Z0-9_]*`. Single-pass substitution: a value containing `{token}` is not re-substituted.
- **Conditional syntax (v2)**: `{if flag}...{end}`, `{if flag}...{else}...{end}`, `{if !flag}...{end}`, and `{switch flag}{case x}...{case y}...{else}...{end}`. Both inline and block forms are supported; in block form, control-keyword lines are stripped from each branch body and surrounding text is preserved verbatim.
- **Escapes**: `\{`, `\}`, `\\`. The old `{{...}}` double-brace escape, empty `{}`, and positional `{0}`/`{1}` placeholders are removed in v2.
- **Typed flag and variable namespaces**: `[flags.<name>]` / `[variables.<name>]` in TOML, `flags:` / `variables:` in YAML. Flags are either boolean (`{if}`) or enum with declared `values` (`{switch}`); a name cannot be used as both. Variables are declared as `[variables.<name>]`. Strict mode requires every body-referenced flag to be declared with a non-empty `description`; `allow` mode infers undeclared flags from body usage.
- **Switch exhaustiveness**: a `{switch}` on a declared enum must cover every declared value or include an `{else}` branch. Case values must be in the declared `values` list.
- **Strict mode requires** non-empty `title`, `description`, `version`. `ignore` mode does not inspect the source for frontmatter at all — the whole file is the body, and a malformed `---` block is not an error. `allow` is the default.
- **Anchor IDs**: lowercase, ASCII-alphanumeric, `_` separators, no leading/trailing `_`. Empty input becomes `"section"`. Applied uniformly to XML tag names, `id=` attrs, Markdown headings, and `<a id="">` anchors.
- **Section parser parity**: every port must round-trip `testdata/sections/cases.json` byte-for-byte. Each package has a fixture-driven test that asserts this.
- **Conditional-syntax parity**: every port that has adopted v2 must pass `docs/specs/fixtures/` end-to-end (success + error cases, with stable error `code`s).
- **Public API shape per language**: `load`/`save` (or `loadPrompt`/`savePrompt`), `parse_sections`, `get_section_text`, `render_toc`, `inject_anchors`, `load_section`. Names are idiomatic per language; semantics are identical. `format` accepts a single inputs object/dict; `flags` is reserved, every other top-level key is a variable.

## Canonical entry points

The TypeScript package (`packages/textprompts-ts/`) is the **v2 reference
implementation** for the conditional-syntax surface; it ships ahead of the
other ports and the fixture corpus is generated against it. The Python package
remains the canonical reference for everything else (sections, frontmatter
parsing, savers, CLI). When changing behaviour, update the TS reference plus
`docs/specs/` first, then Python, then the other ports.

Python (`src/textprompts/`):

- `loaders.py`              load + metadata mode dispatch
- `savers.py`               save with TOML/YAML emit
- `_parser.py`              frontmatter extract (TOML-first)
- `frontmatter_schema.py`   `[flags.*]` / `[variables.*]` validation
- `sections.py`             section parser (~1k LOC, canonical algorithm)
- `prompt_string.py`        `{name}` regex + format-time entry point
- `syntax/`                 v2 conditional pipeline: `lexer.py`, `parser.py`, `ast.py`, `renderer.py`, `validator.py`, `walker.py`, `tokens.py`
- `reconcile.py`            body-vs-declared flag/variable reconciliation
- `source.py`               CRLF/BOM normalization + dedent
- `identifiers.py`          identifier rules (placeholder names, anchors)
- `safe_string.py`          opt-in interpolation-safe wrapper
- `config.py`               metadata-mode resolution
- `errors.py`               typed exceptions
- `cli.py`                  CLI

TypeScript (`packages/textprompts-ts/src/`) — see `packages/textprompts-ts/CLAUDE.md`
for the per-file map; the conditional pipeline is `lexer.ts -> body-parser.ts ->
ast.ts -> format-validation.ts -> renderer.ts`, with `frontmatter-schema.ts`
validating typed declarations and `source.ts` doing CRLF/BOM/dedent up front.

## Commands

Python (default):

- `make test` / `make lint` / `make typecheck` / `make format`
- `make check` runs all of the above
- `make build` / `make publish`

Elixir:

- `make ex-test`
- `make ex-check` runs the full pre-release gate (format, compile, credo, tests, dialyzer)
- `make ex-docs`
- `make ex-test-examples`

Each package also has its own native commands (`go test ./...`, `bun test`, `mix test`, etc.) - see the package CLAUDE.md.

## Rules

- **No emojis** in code, docs, or generated output.
- **Fixtures are ground truth**. Section parser changes must keep `testdata/sections/cases.json` parity. Conditional-syntax changes must keep `docs/specs/fixtures/` parity (success bodies byte-for-byte; error cases by `code`).
- **Spec-first for the v2 surface**. Update `docs/specs/SPEC_conditional_syntax_v2.md` + `docs/specs/fixtures/` alongside the TS reference, then port to Python and the rest. Sections, savers, and CLI remain Python-first. Update the cross-port scope doc when the surface area changes.
- **Errors are typed structs/classes per language**, never bare strings or generic exceptions. Each port has its own `*Error` hierarchy mirroring the Python one.
- **Telemetry/observability is per-port**. Elixir uses `:telemetry.span/3`; other ports do not currently emit. Do not leak port-specific telemetry shape into the cross-language docs.
