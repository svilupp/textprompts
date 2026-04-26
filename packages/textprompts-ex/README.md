# textprompts

[![Hex.pm](https://img.shields.io/hexpm/v/textprompts.svg)](https://hex.pm/packages/textprompts)
[![HexDocs](https://img.shields.io/badge/hex-docs-blue.svg)](https://hexdocs.pm/textprompts)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/svilupp/textprompts/blob/main/packages/textprompts-ex/LICENSE)

Elixir port of the cross-language [`textprompts`](https://github.com/svilupp/textprompts) toolkit. Load Markdown prompt files with TOML or YAML frontmatter, validate placeholders at format time, slice documents into anchored sections, and save them back. Output matches the Python, Go, TypeScript, and Julia ports against the shared `testdata/sections/cases.json` fixtures.

## Install

```elixir
def deps do
  [{:textprompts, "~> 0.1"}]
end
```

Optional default mode in `config/config.exs`:

```elixir
config :text_prompts, metadata_mode: :allow
```

## Quickstart

```elixir
File.write!("greet.md", """
---
title = "Greeting"
version = "1.0.0"
description = "Demo prompt"
---
Hello {name}, welcome to {place}.
""")

prompt = TextPrompts.load!("greet.md")
ps     = TextPrompts.PromptString.new(prompt.prompt)
{:ok, out} = TextPrompts.PromptString.format(ps, name: "Ada", place: "Earth")
# "Hello Ada, welcome to Earth.\n"
```

## Sections and TOC

```elixir
doc = """
# Overview
Intro.

## Setup
Run `mix deps.get`.

## Usage
Call `TextPrompts.load!/1`.
"""

result = TextPrompts.parse_sections(doc)
Enum.map(result.sections, & &1.anchor_id)
# ["overview", "setup", "usage"]

{body, true} = TextPrompts.get_section_text(doc, "setup")
IO.puts(TextPrompts.render_toc(result, "doc.md"))
```

`TextPrompts.load_section/3` chains the loader with `get_section_text/2`.

## Frontmatter

TOML is tried first, YAML is the fallback. Unknown keys land in `meta.extras`. Force a format on save with `format: :yaml | :toml`.

```elixir
"""
---
title: Greeting
version: 1.0.0
tags: [demo, example]
---
Hi {name}.
"""
```

## Metadata modes

| Mode      | Behaviour                                                                     |
|-----------|-------------------------------------------------------------------------------|
| `:strict` | Frontmatter required; `title`, `version`, `description` must be non-empty.    |
| `:allow`  | Default. Frontmatter optional; parsed when present.                           |
| `:ignore` | Never parses frontmatter; strips a leading `---` block; title from filename.  |

```elixir
{:ok, _}  = TextPrompts.load("no_meta.md", meta: :allow)
{:error, %TextPrompts.Error.MissingMetadata{}} =
  TextPrompts.load("no_meta.md", meta: :strict)

TextPrompts.with_metadata(:ignore, fn -> TextPrompts.load!("doc.md") end)
```

## Save

```elixir
prompt  = TextPrompts.load!("greet.md")
updated = put_in(prompt.meta.version, "1.1.0")
:ok     = TextPrompts.save("greet.md", updated)
```

`save/3` accepts a `%TextPrompts.Prompt{}` (emits frontmatter when metadata is non-empty) or a raw string (writes body only). Default emit format is the source format if known, else `:toml`.

## `~P` sigil

```elixir
defmodule MyPrompts do
  use TextPrompts.Sigil

  def greet, do: ~P"Hello {name}, welcome to {place}."
end
```

The sigil compiles the `PromptString` (raw template + placeholder set) at compile time when the body is a literal.

## Cross-language compatibility

| Language    | Package                                                                                      |
|-------------|----------------------------------------------------------------------------------------------|
| Python      | [`textprompts`](https://github.com/svilupp/textprompts/tree/main/src/textprompts) (canonical)|
| Elixir      | [`textprompts`](https://github.com/svilupp/textprompts/tree/main/packages/textprompts-ex)    |
| Go          | [`textprompts-go`](https://github.com/svilupp/textprompts/tree/main/packages/textprompts-go) |
| TypeScript  | [`textprompts-ts`](https://github.com/svilupp/textprompts/tree/main/packages/textprompts-ts) |
| Julia       | [`TextPrompts.jl`](https://github.com/svilupp/textprompts/tree/main/packages/TextPrompts.jl) |

Shared fixtures: [`testdata/sections/cases.json`](https://github.com/svilupp/textprompts/blob/main/testdata/sections/cases.json). The fixture parity test in `test/text_prompts/sections/fixture_test.exs` asserts deep equality with the canonical JSON output.

## Telemetry

Every load and save runs through `:telemetry.span/3`:

| Event                                 | Measurements                     | Metadata                                   |
|---------------------------------------|----------------------------------|--------------------------------------------|
| `[:text_prompts, :load, :start]`      | `system_time`, `monotonic_time`  | `path`, `mode`                             |
| `[:text_prompts, :load, :stop]`       | `duration`, `monotonic_time`     | `path`, `mode`                             |
| `[:text_prompts, :load, :exception]`  | `duration`, `monotonic_time`     | `path`, `mode`, `kind`, `reason`, `stacktrace` |
| `[:text_prompts, :save, :start]`      | `system_time`, `monotonic_time`  | `path`, `format`                           |
| `[:text_prompts, :save, :stop]`       | `duration`, `monotonic_time`     | `path`, `format`                           |
| `[:text_prompts, :save, :exception]`  | `duration`, `monotonic_time`     | `path`, `format`, `kind`, `reason`, `stacktrace` |

```elixir
:telemetry.attach(
  "tp-load-logger",
  [:text_prompts, :load, :stop],
  fn _event, %{duration: d}, %{path: p}, _ ->
    IO.puts("loaded #{p} in #{System.convert_time_unit(d, :native, :microsecond)}µs")
  end,
  nil
)
```

## CLI and Mix tasks

Build the escript:

```bash
mix escript.build
./textprompts show prompts/greet.md
./textprompts validate prompts/*.md --mode strict
./textprompts list prompts --json
```

Mix tasks (no escript build):

```bash
mix textprompts.show prompts/greet.md
mix textprompts.list "prompts/**/*.md"
mix textprompts.validate "prompts/**/*.md"
```

Global flags: `--mode strict|allow|ignore`, `--json` (requires `:jason`).

## Examples

Runnable scripts under [`examples/`](https://github.com/svilupp/textprompts/tree/main/packages/textprompts-ex/examples) create their own fixtures in `tmp/`:

```bash
cd packages/textprompts-ex
mix run examples/basic_load.exs
mix run examples/format_with_placeholders.exs
mix run examples/sections_toc.exs
mix run examples/round_trip.exs
```

Or from the repo root: `make ex-test-examples`.

## Development

```bash
cd packages/textprompts-ex
mix deps.get
mix test
mix docs
mix format
```

Pre-release gate (matches CI): `make ex-check`.

## Documentation

- HexDocs: <https://hexdocs.pm/textprompts>
- [CHANGELOG](CHANGELOG.md)
- Cross-language scope: [`docs/elixir-port-scope.md`](https://github.com/svilupp/textprompts/blob/main/docs/elixir-port-scope.md)

## License

MIT - see [LICENSE](https://github.com/svilupp/textprompts/blob/main/packages/textprompts-ex/LICENSE).
