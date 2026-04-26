# textprompts-ex

Elixir port of `textprompts`.

## Features (initial implementation)

- Load prompt files with optional TOML/YAML frontmatter.
- Save prompt text to disk.
- Parse Markdown headings and derive anchor slugs.
- Safe prompt formatting via `TextPrompts.PromptString`.

## Usage

```elixir
{:ok, prompt} = TextPrompts.load_prompt("prompt.txt")
ps = TextPrompts.PromptString.new(prompt.prompt)
{:ok, rendered} = TextPrompts.PromptString.format(ps, name: "Ada")
```

## Development

```bash
cd packages/textprompts-ex
mix deps.get
mix test
```
