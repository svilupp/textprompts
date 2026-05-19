# textprompts

Cross-language prompt-file toolkit. Plain text + optional TOML/YAML frontmatter, `{name}` placeholders, v2 conditional rendering (`{if}` / `{switch}`), Markdown/XML section parsing. Five language ports share one on-disk format.

## Layout

```
src/textprompts/                 Python (canonical for sections, savers, CLI)
packages/textprompts-ts/         TypeScript / Node — v2 reference implementation
packages/textprompts-ex/         Elixir
packages/textprompts-go/         Go
packages/TextPrompts.jl/         Julia
testdata/sections/cases.json     Section-parser fixtures (all ports)
docs/specs/                      v2 spec + conditional-syntax fixture corpus
docs/writing-prompts-with-textprompts/   Authoring skill
```

Each package has its own `CLAUDE.md`. Read it before touching that port.

## Cross-language invariants

Normative source: `docs/specs/SPEC_conditional_syntax_v2.md`. Conformance corpus: `docs/specs/fixtures/`.

- TS is the v2 reference. Spec + fixtures update first, then Python, then the rest.
- Section-parser parity: every port round-trips `testdata/sections/cases.json` byte-for-byte.
- Conditional-syntax parity: every v2-adopting port passes `docs/specs/fixtures/` (success bodies byte-identical; errors by `code`).
- Public API shape is the same across ports; names are idiomatic per language.

## Commands

- Python: `make test` / `make lint` / `make typecheck` / `make check` / `make build`
- Elixir: `make ex-test` / `make ex-check` / `make ex-docs`
- Other ports: native (`bun test`, `go test ./...`, `mix test`, ...). See each package's `CLAUDE.md`.

## Rules

- No emojis in code, docs, or generated output.
- Fixtures are ground truth. Don't break parity without updating fixtures + spec first.
- Typed error classes per port. No bare strings, no generic exceptions.
- Telemetry is per-port. Don't leak port-specific shape into cross-language docs.
