# textprompts (Elixir)

Elixir port of `textprompts`. Loads Markdown prompt files with TOML/YAML frontmatter, validates `{name}` placeholders, parses Markdown/XML sections, round-trips back to disk. Output matches the Python/Go/TS/Julia ports against `testdata/sections/cases.json` (repo root).

## Layout

```
packages/textprompts-ex/
  lib/text_prompts.ex                  Public facade (delegates only)
  lib/text_prompts/
    loader.ex                          Load + frontmatter dispatch + telemetry
    saver.ex                           Save with TOML/YAML emit
    config.ex                          Metadata mode resolution
    metadata_mode.ex                   :strict | :allow | :ignore cast
    prompt.ex / prompt_meta.ex         Structs
    prompt_string.ex                   {name} regex, single-pass format
    sigil.ex                           ~P sigil (compile-time)
    frontmatter.ex                     extract/split, TOML-first / YAML fallback
    frontmatter/{toml,yaml,parser}.ex  Format-specific parsers
    sections.ex                        Headings + XML tags + anchors (~1.7k LOC)
    sections/parse_result.ex           Result struct
    error.ex + error/*.ex              Typed exception structs
    cli.ex                             escript + mix tasks entry
  test/                                ExUnit, fixture parity tests
  examples/                            Runnable .exs scripts
```

## Key entry points (file:line)

- `TextPrompts.load/2`              `lib/text_prompts/loader.ex:64`
- `TextPrompts.save/3`              `lib/text_prompts/saver.ex:59`
- `TextPrompts.PromptString.new/1`  `lib/text_prompts/prompt_string.ex:37`
- `TextPrompts.PromptString.format/3` `lib/text_prompts/prompt_string.ex:64`
- `TextPrompts.parse_sections/1`    `lib/text_prompts/sections.ex:88`
- `TextPrompts.get_section_text/2`  `lib/text_prompts/sections.ex:237`
- `TextPrompts.render_toc/2`        `lib/text_prompts/sections.ex:267`
- `TextPrompts.inject_anchors/1`    `lib/text_prompts/sections.ex:309`
- `TextPrompts.generate_slug/1`     `lib/text_prompts/sections.ex:189`
- `TextPrompts.normalize_anchor_id/1` `lib/text_prompts/sections.ex:210`
- `TextPrompts.Frontmatter.extract/1` `lib/text_prompts/frontmatter.ex:66`
- `TextPrompts.Config.metadata_mode/1` `lib/text_prompts/config.ex:36`
- `TextPrompts.Config.with_metadata/2` `lib/text_prompts/config.ex:64`
- `~P` sigil                        `lib/text_prompts/sigil.ex:40`
- CLI dispatch (`main/2`)           `lib/text_prompts/cli.ex:38`

## Patterns and rules

- **Public surface lives in `lib/text_prompts.ex`** as `defdelegate` only. Real logic stays in submodules. Add new public functions there too, never expose internals directly.
- **`{:ok, _}` / `{:error, %Exception{}}` everywhere**, plus a `!` raising twin. Errors are typed structs in `TextPrompts.Error.*`. Do not return ad-hoc tuples or strings.
- **Metadata mode is resolved every call** via `Config.metadata_mode/1`. Order: `:meta` opt -> `with_metadata/2` process key -> `:text_prompts, :metadata_mode` app env -> `:allow`. Never read the app env directly.
- **Frontmatter is TOML-first, YAML-fallback** (`Frontmatter.extract/1`). `+++` delimiters are rejected on purpose (Python parity). Unknown keys go to `meta.extras`.
- **Placeholder format is `{name}` not `{{name}}`**, `name` matches `[a-zA-Z_][a-zA-Z0-9_]*`. Substitution is a single regex pass: a value containing `{token}` is not re-substituted (`prompt_string.ex:78`).
- **Sigil body must be a literal**. Interpolated `~P"..."` would defeat compile-time placeholder extraction; current macro raises a CompileError (`sigil.ex:40`).
- **Telemetry is mandatory on load/save**. Wrap new IO entry points in `:telemetry.span([:text_prompts, :<op>], meta, fn ...)`. Event names use `:text_prompts` (atom prefix), not the package name.
- **Sections parity is fixture-driven**. Any change to `sections.ex` must keep `test/text_prompts/sections/fixture_test.exs` green against `../../testdata/sections/cases.json`. Algorithm overview in the moduledoc (`sections.ex:6`).
- **Anchor IDs are normalized** to lowercase ASCII alphanumeric with `_` separators, no leading/trailing `_`, empty input becomes `"section"`. Apply `normalize_anchor_id/1` to XML tags, `id=` attrs, headings, and `<a id="">` uniformly.
- **Saver emit is minimal**. Scalars + scalar lists + extras flattened. Nested maps are skipped for TOML, best-effort for YAML. Anything more complex belongs outside the saver.
- **Strict mode requires `title`, `description`, `version`** non-empty (`loader.ex:43`). The list lives in `@required_strict_fields`; keep in sync with the other ports if it ever changes.
- **`:ignore` mode strips a leading `---...---` block** even if malformed (`loader.ex:225`). Title defaults to filename stem.
- **No emojis in code, docs, or generated output.**
- **Doctest-driven**. Public functions in the docs groups (`Public API`, `Sections`, `Frontmatter`, `Errors`) carry runnable doctests; `mix docs` must build with no warnings.

## Commands

- `mix test` (or `make ex-test` from root)
- `mix format --check-formatted`
- `mix compile --warnings-as-errors`
- `mix credo --strict`
- `mix dialyzer`
- `mix docs`
- `make ex-check` runs the full pre-release gate
- `make ex-test-examples` runs every script under `examples/`

## Cross-language fixtures

Shared with the other ports. Do not duplicate.

- Section parser parity: `../../testdata/sections/cases.json`
- Cross-port scope: `../../docs/elixir-port-scope.md`
