# textprompts

Cross-language prompt file toolkit. Plain text prompt files with optional TOML/YAML frontmatter, validated `{name}` placeholders, Markdown/XML section parsing. Five language implementations share one on-disk format and parse to the same data shape.

## Layout

```
textprompts/
  src/textprompts/                 Python (canonical)
  packages/
    textprompts-ex/                Elixir
    textprompts-go/                Go
    textprompts-ts/                TypeScript / Node
    TextPrompts.jl/                Julia
  testdata/sections/cases.json     Cross-port parity fixtures
  docs/                            Python docs (Jekyll)
  docs/elixir-port-scope.md        Cross-port scope notes
  examples/                        Python examples
  tests/                           Python tests
  Makefile                         Top-level dev commands (Python + ex-* targets)
```

## Per-package CLAUDE.md

Each package keeps its own light index. Read it before touching that language.

- `packages/textprompts-ex/CLAUDE.md` (Elixir)

(Add one per package as they get touched.)

## Cross-language invariants

These hold across every port. Breaking any of them breaks fixture parity.

- **File format**: optional `---...---` frontmatter (TOML first, YAML fallback), then body. `+++` delimiters are rejected on purpose.
- **Placeholder syntax**: `{name}` where `name` matches `[a-zA-Z_][a-zA-Z0-9_]*`. Single-pass substitution: a value containing `{token}` is not re-substituted.
- **Strict mode requires** non-empty `title`, `description`, `version`. `:ignore` strips a leading `---` block and uses filename stem as title. `:allow` is the default.
- **Anchor IDs**: lowercase, ASCII-alphanumeric, `_` separators, no leading/trailing `_`. Empty input becomes `"section"`. Applied uniformly to XML tag names, `id=` attrs, Markdown headings, and `<a id="">` anchors.
- **Section parser parity**: every port must round-trip `testdata/sections/cases.json` byte-for-byte. Each package has a fixture-driven test that asserts this.
- **Public API shape per language**: `load`/`save` (or `loadPrompt`/`savePrompt`), `parse_sections`, `get_section_text`, `render_toc`, `inject_anchors`, `load_section`. Names are idiomatic per language; semantics are identical.

## Canonical Python entry points

The Python package is the reference. When changing behaviour, change Python first, then port. Key files:

- `src/textprompts/loaders.py`         load + metadata mode dispatch
- `src/textprompts/savers.py`          save with TOML/YAML emit
- `src/textprompts/_parser.py`         frontmatter extract (TOML-first)
- `src/textprompts/sections.py`        section parser (~1k LOC, canonical algorithm)
- `src/textprompts/prompt_string.py`   `{name}` regex + format validation
- `src/textprompts/config.py`          metadata-mode resolution
- `src/textprompts/errors.py`          typed exceptions
- `src/textprompts/cli.py`             CLI

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
- **Fixture is ground truth**. Any change to a sections parser must keep `testdata/sections/cases.json` parity green in every port that has been touched.
- **Add new behaviour to Python first**, then port. Update the cross-port scope doc when the surface area changes.
- **Errors are typed structs/classes per language**, never bare strings or generic exceptions. Each port has its own `*Error` hierarchy mirroring the Python one.
- **Telemetry/observability is per-port**. Elixir uses `:telemetry.span/3`; other ports do not currently emit. Do not leak port-specific telemetry shape into the cross-language docs.
