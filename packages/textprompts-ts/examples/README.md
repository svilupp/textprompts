# textprompts (TypeScript) — examples

Runnable examples for the v2 API. Every script uses the new `format({ flags, ...vars })`
call shape and demonstrates at least one conditional form (`{if}`, `{switch}`, or
strict-mode loading).

## Running

All examples are written for [Bun](https://bun.sh):

```bash
bun examples/basic-usage.ts
bun examples/simple-format-demo.ts
bun examples/fromstring-example.ts
bun examples/sections-usage.ts
bun examples/openai-example.ts
bun examples/aisdk-example.ts
```

OpenAI and AI SDK examples print rendered prompts unconditionally and only
make a live API call when `OPENAI_API_KEY` is available.

## Example files

### `basic-usage.ts`

Loads three prompt files from `prompts/` and shows the v2 surface:

- Variables (`{customer_name}`) with declared `[variables.*]` frontmatter
- Block `{if flag}` for an optional persona line
- `{switch tier}` over an enum flag (`free` / `premium` / `enterprise`)
- Reading `prompt.meta.flags`, `prompt.meta.variables`, and `prompt.meta.extras`

### `simple-format-demo.ts`

In-memory prompts built with `Prompt.fromString`:

- Plain `{var}` substitution
- Inline `{if flag}...{end}`
- Block `{if}` / `{else}` / `{end}`
- Format-time validation: missing variables raise a typed `FormatError`

### `fromstring-example.ts`

End-to-end `Prompt.fromString` walkthrough:

- Default behavior (no frontmatter)
- Full frontmatter with `[flags.*]` and `[variables.*]`
- Inspecting `prompt.meta.flags[name]` and `prompt.meta.variables[name]`
- Comparing `metadata: "allow"`, `"strict"`, `"ignore"`

### `sections-usage.ts`

Parsing and extracting Markdown/XML sections from a multi-section prompt
file using `parseSections`, `getSectionText`, `sliceSectionContent`,
`loadSection`, and `normalizeAnchorId`.

### `openai-example.ts`

OpenAI integration: builds a system prompt with `{switch model_tier}` and a
user message from a file-based greeting prompt. Different model tiers map to
different OpenAI models. The rendered messages always print; the live API call
only happens when `OPENAI_API_KEY` is set.

### `aisdk-example.ts`

The same idea via the Vercel AI SDK. Streams the assistant response when
`OPENAI_API_KEY` is set.

## Prompt files

The example prompts live in `examples/prompts/`:

- `greeting.txt` — plain variables, no conditionals
- `system.txt` — `{if persona}` for an optional persona detail (boolean flag)
- `support.txt` — full SPEC §8.2 worked example: `{switch tier}` enum +
  `{if has_urgent}` boolean, with declared variables and custom metadata
- `agents.txt` — multi-section file used by `sections-usage.ts`
- `simple.txt` — a metadata-free template

## Authoring guide

For deeper guidance on the v2 file format — `{if}` vs `{switch}`, flag
declaration patterns, anti-patterns, debugging tips, and migration from v1 —
see the authoring skill:

[`docs/writing-prompts-with-textprompts/SKILL.md`](../../../docs/writing-prompts-with-textprompts/SKILL.md)

## See also

- Package README: [`../README.md`](../README.md)
- Docs: [`../docs/`](../docs/)
- Cross-language SPEC: [`../../../docs/specs/SPEC_conditional_syntax_v2.md`](../../../docs/specs/SPEC_conditional_syntax_v2.md)
