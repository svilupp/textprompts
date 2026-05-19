# textprompts (TypeScript / Node)

TypeScript port of `textprompts`. Reference implementation for the
conditional-syntax surface (`{if}`, `{switch}`, typed flags + variables): the
spec at `../../docs/specs/SPEC_conditional_syntax_v2.md` and the fixture corpus
at `../../docs/specs/fixtures/` track this package. Section parsing matches the
other ports against `../../testdata/sections/cases.json`.

Two entry points are published from one source tree:

- `textprompts/core` — pure-string APIs, zero `node:*` imports. Safe for
  Cloudflare Workers, Vercel Edge, Deno Deploy, browsers.
- `textprompts` (root) — superset of `core` plus filesystem helpers
  (`loadPrompt`, `loadSection`, `parseFile`, `savePrompt`).

## Layout

```
packages/textprompts-ts/
  src/
    index.ts                Public Node entry (re-exports core + fs APIs)
    core.ts                 Pure-string entry, contract-tested for no node:*
    models.ts               Prompt, PromptMeta, PromptLoadOptions, FrontmatterFormat
    prompt-string.ts        Internal PromptString wrapper (NOT exported)
    config.ts               MetadataMode resolution (allow | strict | ignore)
    errors.ts               Typed errors + stable string `code`s
    source.ts               CRLF/BOM normalize + dedent (SPEC §2.5)
    lexer.ts                Tokenize body into TextToken / TagToken
    body-parser.ts          Token stream -> AST (~760 LOC, canonical algorithm)
    ast.ts                  AST node types (Text / Variable / If / Switch)
    renderer.ts             AST -> string (SPEC §3.3 / §3.4)
    format-validation.ts    collectRequiredRefs + validateInputs (§5.x)
    frontmatter-schema.ts   [flags.*] / [variables.*] decoder + validation
    parser-core.ts          parseString: frontmatter + reconciliation pipeline
    parser.ts               parseFile (thin fs wrapper around parseString)
    loaders.ts              loadPrompt, loadSection (node:fs)
    savers.ts               savePrompt with TOML/YAML emit
    sections.ts             Section parser (~1.3k LOC, cross-port fixture parity)
    toml.ts / yaml.ts       Frontmatter parsers
    path-utils.ts           basename / extname without node:path
    cli.ts                  CLI entry (./dist/cli.cjs bin)
  tests/                    bun test; conformance.test.ts drives spec fixtures
  docs/                     Per-package guide
  examples/                 Runnable .ts scripts
  biome.json                Formatter + linter config (enforced via format:check)
  tsup.config.ts            dual ESM/CJS build, three entry points
```

## Public API entry points

- `loadPrompt(path, options?)`        `src/loaders.ts`
- `loadSection(path, anchorId, options?)` `src/loaders.ts`
- `parseFile(path, options?)`         `src/parser.ts`
- `parseString(content, sourcePath, options?)` `src/parser-core.ts`
- `savePrompt(prompt, path, { format })` `src/savers.ts`
- `Prompt`, `Prompt.fromPath`, `Prompt.fromString` `src/models.ts`
- `Prompt.prototype.format(inputs)`   `src/models.ts` / `src/prompt-string.ts`
- Section APIs: `parseSections`, `getSectionText`, `renderToc`, `injectAnchors`,
  `generateSlug`, `normalizeAnchorId`, `sliceSectionContent` `src/sections.ts`
- Errors: `TextPromptsError`, `ParseError`, `FrontmatterError`, `SemanticError`,
  `FormatError`, `MalformedHeaderError`, `MissingMetadataError`,
  `InvalidMetadataError`, `FileMissingError` `src/errors.ts`
- Config: `MetadataMode`, `getMetadata`, `setMetadata`, `skipMetadata`,
  `warnOnIgnoredMetadata` `src/config.ts`

`PromptString` is intentionally NOT exported. Construct prompts via
`Prompt.fromString` or `loadPrompt`.

## Patterns and rules

- **v2 reference**. SPEC changes land here first, then `docs/specs/fixtures/`,
  then Python and the other ports. The conformance harness
  (`tests/conformance.test.ts`) walks every fixture directory; success cases
  must render byte-for-byte, error cases must surface the declared `code`.
- **Core contract**. `src/core.ts` is statically importable with zero `node:*`
  in its import graph. Enforced by `tests/core-contract.test.ts`. Anything
  needing fs lives behind `loaders.ts` / `parser.ts` / `savers.ts` and is only
  re-exported from `index.ts`.
- **Loader options are `metadata` and `frontmatterFormat`** on `PromptLoadOptions`.
  The legacy `meta:` option, `skipValidation`, positional `{0}` placeholders,
  and empty `{}` placeholders were removed in v2. Escapes use double braces:
  `{{` collapses to a literal `{` and `}}` to a literal `}` (so `{{name}}` is
  literal text `{name}`, not a placeholder). Backslash has no special meaning
  and renders literally.
- **`format(inputs)` takes a single object**: `flags` is reserved (typed
  `Record<string, boolean | string>`); all other top-level keys are variables.
- **Errors carry a stable string `code`** (e.g. `E_UNDECLARED_FLAG`,
  `E_NON_EXHAUSTIVE_SWITCH`, `E_EMPTY_PROMPT`). Treat the codes as part of the
  public contract; the conformance corpus pins them.
- **`prompt.meta` is a plain JSON-serializable object** with always-present
  `extras`, `flags`, `variables` records. No `Map`, no class instances.
- **Frontmatter is TOML-first, YAML-fallback** in `auto` mode; `frontmatterFormat`
  locks the parser. `+++` delimiters are rejected on purpose. `ignore` mode does
  not parse the header at all (SPEC §4.6) — the entire file is the body, a
  malformed `---` block is not an error, and title defaults to filename stem.
- **Strict mode requires `title`, `description`, `version` non-empty** AND every
  body-referenced flag declared in `[flags.*]` with a non-empty `description`.
  `allow` (default) auto-declares flags from body usage.
- **Switch exhaustiveness**: enum switches must cover every declared value or
  include `{else}`. Case values not in `values` are rejected.
- **Section parser parity** is enforced by `tests/yaml-support.test.ts` and the
  shared corpus at `../../testdata/sections/cases.json`. Do not divert.
- **No emojis** in code, docs, examples, or generated output.

## Commands

Prefer the root-Makefile `ts-*` wrappers (from the repo root) when running
checks during a session — they suppress stdout+stderr on exit 0 and dump the
full output only on failure, keeping the conversation context clean. Drop down
to the raw `bun run …` form when you need streaming output (e.g. debugging a
flaky test, watching `tsup` build progress).

Quiet wrappers (from repo root):

- `make ts-test` — `bun test`
- `make ts-typecheck` — `tsc --noEmit`
- `make ts-format-check` — `biome format .`
- `make ts-lint` — `biome lint` + oxlint
- `make ts-check` — typecheck + format:check + lint + tests (PR gate)

Raw scripts (streaming output, run from this package):

- `bun test` — full test suite (Bun runtime)
- `bun run typecheck` — `tsc --noEmit`
- `bun run format` / `format:check` — Biome formatter (enforced via `format:check`)
- `bun run lint` / `lint:check` — Biome lint + oxlint
- `bun run build` — `tsup` dual ESM/CJS build to `dist/`
- `bun run check` — typecheck + format:check + lint:check + tests (PR gate, streaming)

## Cross-language fixtures and spec

Shared with the other ports. Do not duplicate.

- v2 spec: `../../docs/specs/SPEC_conditional_syntax_v2.md`
- v2 conformance corpus: `../../docs/specs/fixtures/`
- Section parser parity: `../../testdata/sections/cases.json`
- Authoring skill: `../../docs/writing-prompts-with-textprompts/SKILL.md`
