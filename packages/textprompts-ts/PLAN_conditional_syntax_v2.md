# Conditional Syntax v2 — Implementation Plan (TypeScript reference)

**Date**: 2026-05-19
**Based on**: `docs/specs/SPEC_conditional_syntax_v2.md`
**Scope**: 7 phases, ~31 tasks. TypeScript implementation only; other ports out of scope for this PR.

---

## Overview

Implement SPEC v2.0 in `packages/textprompts-ts` as a single coherent breaking release. The release ships conditional syntax (`{if}`, `{switch}`), a typed flag namespace, stricter variable validation, and a new authoring skill. Legacy positional placeholders (`{0}`), empty placeholders (`{}`), and `{{ ... }}` double-brace escapes are removed in the same release. Conformance fixtures live under `docs/specs/fixtures/` for cross-port reuse.

Phases are sliced **vertically** wherever possible — each phase ends with something testable end-to-end, even if the next phase widens the surface. The exception is Phase 1 (source preprocessing, lexer, AST), which is a structural prerequisite for everything else.

| Phase | Focus | Dependencies |
|-------|-------|--------------|
| **PHASE-1** | Source preprocessing + lexer + AST + body parser (no rendering yet) | None |
| **PHASE-2** | Frontmatter v2 schema (flags / variables / modes) | Partial — `loader-modes` task blocks on PHASE-1 body parser |
| **PHASE-3** | Renderer + format-time validation (variables, flags, exhaustiveness, types) | PHASE-1, PHASE-2 |
| **PHASE-4** | Public API rewrite (remove legacy + positional args, expose `flags`, new loader options, errors) | PHASE-3 |
| **PHASE-5** | Conformance corpus under `docs/specs/fixtures/` + harness | PHASE-4 |
| **PHASE-6** | Docs + examples + README in `packages/textprompts-ts` | PHASE-4 |
| **PHASE-7** | Authoring skill in `docs/writing-prompts-with-textprompts/` + cross-references, CHANGELOG, final validation | PHASE-5, PHASE-6 |

---

# PHASE-1: Source preprocessing, lexer, AST, body parser

**Repository**: `packages/textprompts-ts/`
**Dependencies**: None

## Overview

Replace the regex-based placeholder engine (`PLACEHOLDER_PATTERN` in `src/constants.ts`, `extractPlaceholders` in `src/placeholder-utils.ts`) with a small lexer + recursive-descent parser that produces a render-ready AST. Keep this deliberately pragmatic: the goal is correct structure, helpful errors, and predictable rendering, not a lossless syntax tree or compiler-grade diagnostics. No rendering yet — Phase 3 turns AST + inputs into output. Frontmatter handling (`src/parser-core.ts`) is mostly untouched in this phase; the shared preprocessing helper is introduced here because every body path needs it.

### source-preprocessing

One shared preprocessing path for all prompt bodies.

**Files to create:**
- `src/source.ts` — **CREATE** — `prepareSource(content: string, options?: { dedent?: boolean }): string`, plus tiny helpers for CRLF normalization, BOM stripping, and common-leading-whitespace dedent.

**Implementation guidance:**
- Apply UTF-8 BOM stripping, CRLF/CR normalization to LF, and optional common-leading-whitespace dedent exactly once before body parsing.
- File-loaded prompts and `Prompt.fromString()` both use this helper. The default should be sensible: normalize/BOM-strip always; dedent enabled for body strings before parsing, where it is a no-op for normal file content.
- Do not duplicate a second `dedent()` in `parser-core` or `PromptString`; delete/move the existing helper from `src/parser-core.ts`.
- Error messages may refer to the prepared source. Exact original-file line/column mapping is explicitly out of scope.

**Definition of Done:**
- [ ] `parser-core`, `Prompt.fromString`, `loadPrompt`, and `loadSection` all reach body parsing through `prepareSource`.
- [ ] CRLF and LF versions of the same prompt render byte-identically.
- [ ] BOM at file start is stripped.
- [ ] Dedent is applied once, not once in the loader and again in `PromptString`.

---

### lexer-core

Tokenize the body string into a stream of tokens: `Text`, `Variable`, `OpenIf`, `OpenIfNot`, `Else`, `End`, `OpenSwitch`, `Case`, `Escape`.

**Files to create:**
- `src/lexer.ts` — **CREATE** — token types, `tokenize(body: string, sourcePath: string): Token[]`

**Implementation guidance:**
- Implement the §2.1 lexer order-of-operations: on `{`, peek for control-tag prefix (`if `, `switch `, `case `, `else}`, `end}`); else try `identifier}`; else emit a clear diagnostic.
- Identifier regex: `^[a-zA-Z_][a-zA-Z0-9_]*$` (ASCII only, snake_case, no dashes).
- Keep enough token context for helpful messages: token kind, value, source path, and optionally line/column or character offset if easy. Exact source locations are not a conformance requirement.
- Handle escapes per §2.4: `\{` → `{`, `\\` → `\`, `\}` → `}`. No other escape sequences. `\n`, `\t` render literally as two chars.
- Reject inside-brace whitespace (`{ if flag }`), uppercase keywords (`{IF flag}`), bare keywords (`{if}`, `{switch}`, `{case}`, `{if !}`), `{0}`, `{}`, and `{if ! flag}`.
- Expect input from `prepareSource`; the lexer should not redo newline normalization, BOM stripping, or dedent.
- Reserved keywords (`if`, `else`, `end`, `switch`, `case`, `flags`) cannot appear as identifiers.

**Definition of Done:**
- [ ] Every tag form in §2.2 produces the right token type and value.
- [ ] All §2.3 errors (uppercase, whitespace-in-braces, bare keyword, dashed identifier, etc.) raise a typed `ParseError` with a helpful message.
- [ ] CRLF input produces the same tokens as LF input.
- [ ] Tokens for `{var}` carry the identifier; tokens for `{if !flag}` carry both negation and identifier.
- [ ] Escape sequences are resolved at token level (so the parser sees clean text).
- [ ] Unit tests in `tests/lexer.test.ts` cover every bullet in SPEC §10.1.

---

### ast-shape

Define the AST node types the body parser will produce.

**Files to create:**
- `src/ast.ts` — **CREATE** — discriminated-union node types and helpers.

**Implementation guidance:**
- Nodes: `TextNode { value }`, `VariableNode { name }`, `IfNode { flag, negated, form, body, elseBody? }`, `SwitchNode { flag, form, cases: SwitchCase[], elseBody? }`, `SwitchCase { value, body }`.
- Use arrays for switch cases, not `Map`. This preserves author order, makes duplicate-case detection straightforward, serializes naturally in debug output, and keeps the AST shape close to the cross-port model.
- The AST is **internal** to parser/renderer and intentionally simple. Do not make it a lossless CST. Optional token context (`at?: TokenContext`) is fine if it improves messages, but do not build complicated source-span machinery.
- A `form` field on `IfNode`/`SwitchNode` records `"inline" | "block"`.
- For block form, the parser should construct branch bodies with control keyword lines already excluded. That lets the renderer concatenate active branch bodies without needing to understand leading trivia or source slices.

**Definition of Done:**
- [ ] Node types compile and are exhaustively switchable (`never` check in default branch).
- [ ] `form` plus parser-normalized branch bodies are enough to drive §3.3 rendering without re-inspecting the original source.

---

### body-parser

Recursive-descent parser: tokens → AST. Enforces all of §3.1, §3.2, §3.5.

**Files to create:**
- `src/body-parser.ts` — **CREATE** — `parseBody(tokens: Token[], sourcePath: string): Node[]`.

**Files to modify:**
- `src/placeholder-utils.ts` — repurposed or deleted in Phase 4 once `extractPlaceholders` callers are gone. Leave alone in Phase 1.

**Implementation guidance:**
- Stack-based matching: push on `{if}`/`{switch}`, pop on `{end}`.
- Form detection per §3.2: track whether opener is alone on its line; require closer / `{else}` / `{case}` to obey the same form. Reject mixed-form constructs with a helpful parse error.
- Keep whitespace handling simple and robust: for block-form constructs, treat control-keyword lines as parser delimiters and do not include them in any branch body. Body text nodes keep exactly the prepared-source text between control lines.
- Switch-specific rules (§3.1.9–11): no text/var/nested block between `{switch}` and first `{case}`; at least one case; no duplicate `{case X}`; at most one `{else}` and only after all cases.
- Empty case bodies are valid (§5.3 "empty `{case X}` body is permitted and renders nothing").
- Empty prompt → error (§2.5, §3.1.17 effectively): caller surfaces this once it has the body.

**Definition of Done:**
- [ ] Every §3.1 structural rule produces a typed error with the relevant tag/flag/case name in the message where applicable.
- [ ] §3.2 inline-vs-block detection works for the legal and forbidden examples in the SPEC.
- [ ] Nested blocks (5 levels) parse and round-trip into a faithful AST.
- [ ] Unit tests in `tests/body-parser.test.ts` cover every bullet in SPEC §10.2.

---

# PHASE-2: Frontmatter v2 schema

**Repository**: `packages/textprompts-ts/`
**Dependencies**: None (parallel-safe with Phase 1)

## Overview

Extend frontmatter parsing in `src/parser-core.ts` to recognize `[flags.*]` / `[variables.*]`, validate them per §4, and surface a typed `Schema` to downstream consumers. The existing `KNOWN_FIELDS` path (title/version/description/author/created) is preserved; only the schema sections are new.

---

### frontmatter-schema

Validate flags and variables from parsed frontmatter and attach them to `prompt.meta`. SPEC §6.5 puts everything — standard fields, flags, variables, extras — under a single `meta` object; there is no separate `prompt.schema`.

Keep schema scanning pragmatic: use the TOML/YAML parser output as a plain object, pull off `flags` and `variables` sections by key, validate only the documented fields, and preserve the rest as `extras`. Do not build a secondary schema language or deep generic validator.

**Files to create:**
- `src/frontmatter-schema.ts` — **CREATE** — flag/variable types + `parseFlagsAndVariables(data: Record<string, unknown>): { flags, variables }` + per-field validators.

**Files to modify:**
- `src/parser-core.ts:59-227` — call `parseFlagsAndVariables` after `ensurePromptMeta`; attach `flags` and `variables` onto the returned `PromptMeta`.
- `src/models.ts:8-21` — extend `PromptMeta`: add `extras: Record<string, unknown>`, `flags: Record<string, FlagDecl>`, `variables: Record<string, VarDecl>`. All three default to empty object/dict, never `null` (simpler caller code: `prompt.meta.flags.tier` always reachable when declared, absent when not).

**Implementation guidance:**
- Use plain objects (`Record<string, ...>`) not `Map`. Rationale: JSON-serializable, idiomatic in TS, mirrors Python `dict` / Julia `Dict` for cross-port parity. Map's only win — non-string keys — doesn't apply here.
- Types:
  ```ts
  type BooleanFlag = { kind: "boolean"; description?: string; extras: Record<string, unknown> };
  type EnumFlag = { kind: "enum"; values: string[]; description?: string; extras: Record<string, unknown> };
  type FlagDecl = BooleanFlag | EnumFlag;
  type VarDecl = { description?: string; extras: Record<string, unknown> };

  interface PromptMeta {
    title?: string | null;
    version?: string | null;
    description?: string | null;
    author?: string | null;
    created?: string | null;
    extras: Record<string, unknown>;
    flags: Record<string, FlagDecl>;
    variables: Record<string, VarDecl>;
  }
  ```
- Field validation per §4.3.2: identifier check (reuse Phase 1 regex), reserved-keyword check (`if/else/end/switch/case/flags`), `type` ∈ {`"boolean"`, `"enum"`}, `values` required+non-empty+unique+all-identifiers only for `enum`, `values` forbidden on `"boolean"`.
- Variable validation per §4.4: variable names must be valid non-reserved identifiers; only `description` is recognized; everything else goes into the variable's `extras`.
- Reject same name in `[flags.*]` and `[variables.*]` (§5.1).
- Empty frontmatter equivalent to no frontmatter (§4.1).
- Schema sections must be objects. If `flags` or `variables` is present but not an object, fail with a `FrontmatterError`.
- `ensurePromptMeta` must not copy raw `flags` / `variables` sections into `meta.extras`. Standard fields stay at top level, parsed declarations go to `meta.flags` / `meta.variables`, and only unrelated custom fields go to `meta.extras`.
- Do not over-normalize custom metadata. Preserve parser output types for extras and avoid inventing recursive coercion rules beyond the conformance subset.

**Definition of Done:**
- [ ] Every §4.3.2 frontmatter error fires with a clear message.
- [ ] Invalid/reserved variable declaration names are rejected.
- [ ] TOML and YAML both produce identical `flags`/`variables`/`extras` for equivalent inputs.
- [ ] Custom fields are preserved in `extras` at all three levels (top-level on `meta`, per-flag, per-variable) with original TOML/YAML types.
- [ ] Raw top-level `flags` / `variables` parser output does not appear in `prompt.meta.extras`.
- [ ] `prompt.meta.flags` and `prompt.meta.variables` are plain objects (JSON-serializable) — verified by `JSON.stringify(prompt.meta)` round-tripping the declarations.
- [ ] Tests in `tests/frontmatter-schema.test.ts` cover SPEC §10.3.

---

### loader-modes

Wire the spec's `metadata: "allow" | "strict" | "ignore"` modes through the loader.

**Blocked by:** frontmatter-schema, body-parser

**Files to modify:**
- `src/parser-core.ts` — branch on mode:
  - `"ignore"` — strip a leading `---`-delimited block (if present) without parsing its contents; treat its body as the prompt; `meta.flags`/`meta.variables`/`meta.extras` default to empty objects; default `meta.title` to filename stem.
  - `"allow"` — parse and validate frontmatter if present, allow implicit body declarations, no error on missing frontmatter.
  - `"strict"` — require frontmatter, require every body-referenced flag to be declared with a non-empty `description`, reconcile body vs declared per §4.7.
- `src/config.ts:1-7` — `MetadataMode` keeps all three values (`STRICT`, `ALLOW`, `IGNORE`). Update `normalizeMode` if needed; existing API stays compatible.

**Implementation guidance:**
- For `"ignore"`: do NOT call the TOML/YAML parsers. A malformed header is **not** an error in this mode — it is part of the skipped block. Body parsing (Phase 1) still runs. The §2.5 empty-prompt-file rule still fires: a file that is empty after stripping the header → load error.
- For `"allow"` / `"strict"`: after body-parser produces an AST, walk it to gather referenced flags + variables (`{if foo}` / `{switch foo}` → flag refs; `{case X}` → enum value refs; `{var}` → variable refs).
- Reject a name used as both a body variable and body flag, e.g. `{if foo}{foo}{end}`. A name is either a flag or a variable in one prompt file, never both (§5.1 / §7.3).
- Reconcile against the declared `meta.flags` / `meta.variables` per §4.7:
  - boolean flag used in `{switch}` → error.
  - enum flag used in `{if}` → error.
  - `{case X}` value not in declared enum values → error.
  - switch on declared enum without exhaustive `{case}`s and without `{else}` → error with the missing-cases list (see SPEC §5.3 example).
- In implicit mode (and in `"ignore"`), infer the enum value set from cases that appear in body. Then trivially exhaustive.
- The existing `skipMetadata()` helper and `warnOnIgnoredMetadata` flag stay — they're the v1 entry points to ignore-mode and don't conflict with v2 semantics.

**Definition of Done:**
- [ ] `metadata: "strict"` rejects: missing frontmatter, undeclared flag used in body, declared flag with empty description.
- [ ] `metadata: "strict"` accepts: undeclared variable used in body (per §4.6, variables are not subject to strict declaration).
- [ ] `metadata: "ignore"` accepts a file with a malformed TOML/YAML header — the header block is skipped, body renders normally.
- [ ] `metadata: "ignore"` on a file that becomes empty after the header is stripped → load error per §2.5.
- [ ] `metadata: "ignore"` produces a prompt with `meta.title` equal to the filename stem and `meta.flags`/`meta.variables`/`meta.extras` empty objects (NOT `null` — keeps caller code simple).
- [ ] Body/declared disagreements all fire at load time with helpful semantic errors (§4.7) under `"allow"` and `"strict"`.
- [ ] Tests cover SPEC §10.3 plus a dedicated `ignore-mode` test file.

---

# PHASE-3: Renderer + format-time validation

**Repository**: `packages/textprompts-ts/`
**Dependencies**: PHASE-1, PHASE-2

## Overview

Walk the AST given variables + flags, emit a rendered string per §3.3 whitespace rules, and surface every format-time error in §5.5–5.7 with clear messages.

---

### renderer

AST + inputs → string.

**Files to create:**
- `src/renderer.ts` — **CREATE** — `render(nodes: Node[], inputs: FormatInputs): string`.

**Implementation guidance:**
- `FormatInputs = { variables: Record<string, unknown>; flags: Record<string, boolean | string> }`.
- §3.3 block form: a control-keyword line — opener, `{else}`, `{case}`, `{end}` alone-on-line — is removed entirely **including** its leading whitespace and trailing newline. Branch body lines render as-is. Inactive branches contribute nothing.
- §3.3 inline form: only the content between opener and closer is substituted. Text before opener and after closer on the same line stays put.
- Variables (`{var}`) interpolate via `String(value)`; reserved-keyword *values* are allowed (§5.5 last paragraph).
- Switch dispatch is by value; `{else}` catches unenumerated values.
- Negated `{if !flag}` inverts the boolean.

**Definition of Done:**
- [ ] All §3.4 worked examples render byte-for-byte to the expected output.
- [ ] Block keyword lines never leak into output (property §10.7.3).
- [ ] Inactive branches produce zero bytes, including no stray whitespace.
- [ ] Body indentation is preserved exactly as authored.
- [ ] Trailing-newline-at-EOF behavior matches source (§2.5).

---

### format-validation

All inputs are checked up front; errors come out before any output is produced.

**Files to create:**
- `src/format-validation.ts` — **CREATE** — `validateInputs(meta: PromptMeta, ast: Node[], inputs: FormatInputs): void`.

**Implementation guidance:**
- Walk AST once to collect required flag names and required variable names — **everywhere they appear, regardless of branch** (§5.2).
- Missing `flags` parameter when prompt uses any flag → distinct error mentioning expected flag names (§5.6).
- Missing individual flag → "flag `X` required but not provided". Include source context if readily available, but do not make exact location mandatory.
- Missing individual variable → "variable `X` required but not provided". Include source context if readily available, but do not make exact location mandatory.
- Type check per §5.5: boolean flag accepts only `true`/`false`; enum flag accepts only its declared value strings. No coercion.
- Reserved keyword as **input key** → error; reserved keyword as **string value** of a variable → allowed.
- Extra flags / variables passed at format time → **silently ignored**, per SPEC §5.7. No warning, no diagnostic, no error. Callers that want unused-input detection can diff their context against `prompt.meta.flags` / `prompt.meta.variables` themselves (reachable from the public API per §6.5).

**Definition of Done:**
- [ ] Every §5.5 / §5.6 error fires with the right category/code and a message naming the missing or invalid input.
- [ ] Required-variable rule fires even when the only reference is in a branch that wouldn't render.
- [ ] Extra format-time inputs do not error, do not warn, and do not affect output bytes.
- [ ] Tests cover SPEC §10.5.

---

# PHASE-4: Public API rewrite

**Repository**: `packages/textprompts-ts/`
**Dependencies**: PHASE-3

## Overview

Replace the existing string-format API with the SPEC §6 shape. Remove positional args, empty placeholders, double-brace escapes, and `MetadataMode.IGNORE` if SPEC does not preserve it. Update errors, loader signature, and exports.

---

### prompt-string-internal

`PromptString` becomes an **internal** implementation detail — no public constructor, no module-level export. The only supported public entry points for getting a prompt are `loadPrompt(path, options)` and `Prompt.fromString(content, options)`. `Prompt.format()` is the only public format surface.

**Files to modify:**
- `src/prompt-string.ts:27-140` — rewrite as a thin internal wrapper around AST + schema. Drop positional/empty/double-brace handling entirely. New shape (rough): `class PromptString { constructor(source: string, schema: Schema | null) { ... }  format(inputs: FormatInputs): string }`. Not exported from `src/index.ts` or `src/core.ts`.
- `src/models.ts:74-94` — `Prompt.format` has one signature only: `format(inputs: { flags?: Record<string, boolean | string>; [varName: string]: unknown }): string`. No `args` overload. No positional path.
- `src/placeholder-utils.ts:1-60` — delete the file; its consumers move to AST-based ref collection.
- `src/constants.ts` — remove `PLACEHOLDER_PATTERN`, `ESCAPED_OPEN`, `ESCAPED_CLOSE`.
- `src/index.ts` — drop `PromptString` export. Public surface: `loadPrompt`, `savePrompt`, `Prompt`, `MetadataMode`, error classes, `parseSections`/section utilities (untouched).
- `src/core.ts` — same. Mirrors `index.ts` minus the Node-only entry points.

**Implementation guidance:**
- `PromptString`'s constructor caches the parsed AST once, so repeated `format()` calls don't re-parse. The AST is created from the already prepared body source; preprocessing belongs in `src/source.ts` and is not duplicated here.
- `Prompt.fromString` is the documented way to create a prompt from an in-memory string. Implicit mode applies — flags inferred from `{if}`/`{switch}` references, enum values inferred from `{case}` branches.
- `flags` is a reserved input key. Passing `{ flags: "x" }` as a variable → error.
- Source string is preserved on `Prompt.toString()` / `valueOf()` for callers who want the raw text.

**Definition of Done:**
- [ ] `prompt.format({ role: "x", flags: { tier: "premium" } })` renders correctly.
- [ ] `prompt.format({ flags: "oops" })` — flags passed as a string — throws a `FormatError`.
- [ ] `Prompt.format` has no `args` overload at the type level; passing an array as the first argument fails to compile.
- [ ] `PromptString` is not exported from `src/index.ts`, `src/core.ts`, or `dist/`. A type test asserts this.
- [ ] All existing tests are migrated or deleted; no test asserts old positional behavior or constructs `new PromptString(...)` directly from outside the package.
- [ ] `tests/prompt-string.test.ts` is renamed to `tests/internal-prompt-string.test.ts` (or folded into model tests) and only exercises the internal wrapper. `tests/models.test.ts` covers the public surface. `tests/placeholder-utils.test.ts` is deleted.

---

### loader-api

`loadPrompt` and `Prompt.fromString` accept `frontmatterFormat` and `metadata` per SPEC §6.1.

**Files to modify:**
- `src/loaders.ts` — accept `{ frontmatterFormat?: "toml" | "yaml" | "auto"; metadata?: "allow" | "strict" | "ignore" }`.
- `src/parser.ts` — update `parseFile` to accept the full loader options object, not only a `MetadataMode`, and pass options through to `parseString`.
- `src/parser-core.ts` — honor explicit `frontmatterFormat` (currently always "TOML first, then YAML"). For `"toml"` / `"yaml"`, skip the fallback and surface that parser's error directly. Route `metadata: "ignore"` straight to the body-only path (Phase 2 / loader-modes).
- `src/models.ts:44-60` — update `Prompt.fromPath` / `Prompt.fromString` option types. Expose `prompt.meta.flags`, `prompt.meta.variables`, and `prompt.meta.extras` per SPEC §6.5.
- `src/cli.ts` — replace `{ meta: "ignore" }` with `{ metadata: "ignore" }`; consider adding `--metadata allow|strict|ignore` and `--frontmatter-format auto|toml|yaml` if keeping the CLI as a useful inspection tool.

**Implementation guidance:**
- Drop the `meta` option name in favor of `metadata` per SPEC §6.1. Hard break — no alias.
- Apply the same option shape everywhere: `loadPrompt`, `loadSection`, `Prompt.fromPath`, `Prompt.fromString`, `parseFile`, and `parseString`. Avoid an adapter layer where some APIs still use `meta`.
- Empty prompt body → load error (§2.5). Applies under all modes, including `"ignore"` after the header is stripped.
- Empty frontmatter (`---\n---`) → equivalent to no frontmatter (§4.1).
- `MetadataMode.IGNORE` is **kept** as a first-class mode (SPEC §4.6). Malformed header in `"ignore"` mode is not an error.

**Definition of Done:**
- [ ] All three `frontmatterFormat` values behave per SPEC.
- [ ] All three `metadata` modes (`"allow"`, `"strict"`, `"ignore"`) work per SPEC §4.6.
- [ ] `loadPrompt`, `loadSection`, `Prompt.fromPath`, `Prompt.fromString`, `parseFile`, and `parseString` all accept and propagate the same option shape.
- [ ] `metadata: "strict"` enforces frontmatter presence AND flag-description rule.
- [ ] `metadata: "ignore"` accepts a file with malformed TOML/YAML header without error.
- [ ] `metadata: "ignore"` on an empty-body file still errors per §2.5.
- [ ] `prompt.meta.flags` and `prompt.meta.variables` are reachable plain objects on every loaded prompt.
- [ ] `prompt.meta.extras` exposes top-level custom frontmatter fields with original TOML/YAML types preserved.
- [ ] Per-flag `extras` and per-variable `extras` are reachable as plain objects on each declaration record.
- [ ] `JSON.stringify(prompt.meta)` round-trips all schema data (no `Map` or class instances in the output).
- [ ] `tests/loaders.test.ts`, `tests/config.test.ts` updated.

---

### save-api-v2

`savePrompt` remains public and must round-trip v2 metadata.

**Files to modify:**
- `src/savers.ts` — serialize `prompt.meta.flags`, `prompt.meta.variables`, and nested `extras` for TOML and YAML output.
- `tests/savers.test.ts` — add v2 round-trip cases for boolean flags, enum flags, variable declarations, and custom extras.

**Implementation guidance:**
- Keep the public `savePrompt(path, content, options)` shape unless a small additive option is needed. This is not a new templating feature; it is persistence for the v2 `Prompt` model.
- When saving a `Prompt`, write standard metadata fields, top-level `meta.extras`, `[flags.*]` / `flags:` declarations, and `[variables.*]` / `variables:` declarations.
- For TOML, support the conformance subset cleanly: strings, integers, booleans, arrays, and simple nested objects where existing serializer support is reliable. If a TOML value cannot be represented safely, prefer a clear `TextPromptsError` over silently dropping it.
- For YAML, use the `yaml` package for complex extras rather than hand-rolling indentation.
- Do not write raw schema parser output from `meta.extras.flags` / `meta.extras.variables`; those keys should not exist after load.
- Saving a raw `string` can continue to create a minimal prompt template, but the generated frontmatter should be valid v2 frontmatter with empty `flags` / `variables` omitted.

**Definition of Done:**
- [ ] Saving and re-loading a prompt with boolean flags preserves `kind`, `description`, and per-flag extras.
- [ ] Saving and re-loading a prompt with enum flags preserves `values` order.
- [ ] Saving and re-loading variable declarations preserves descriptions and per-variable extras.
- [ ] TOML and YAML save paths both have v2 tests.
- [ ] No v2 schema metadata is silently dropped during save.

---

### errors-hierarchy

Typed error subclasses per SPEC §7.

**Files to modify:**
- `src/errors.ts:1-34` — add `ParseError`, `FrontmatterError`, `SemanticError`, `FormatError`. Keep `TextPromptsError` as the common base. Each carries `{ code?, path?, line?, column? }`, with line/column optional.

**Implementation guidance:**
- Map every error in SPEC §7.1–7.4 to one of the four new classes. Use `code` strings (`"E_UNCLOSED_IF"`, `"E_WRONG_FLAG_TYPE"`, …) so future cross-port conformance can compare stable codes (§11.4).
- Do not spend implementation complexity chasing perfect locations. Good error category + stable code + message naming the relevant tag/flag/variable is sufficient.
- Keep `FileMissingError`, `MalformedHeaderError`, `MissingMetadataError`, `InvalidMetadataError` for the file-IO path; mark `MalformedHeaderError` as legacy if `ParseError` subsumes it.

**Definition of Done:**
- [ ] Every error path raises a subclass of `TextPromptsError` with a stable category/code and helpful message.
- [ ] Error `code` strings are stable + documented in `src/errors.ts`.

---

# PHASE-5: Conformance corpus

**Repository**: repo root, `docs/specs/fixtures/`
**Dependencies**: PHASE-4

## Overview

Build the cross-port conformance corpus the SPEC §9.2 / §10.6 specifies. Lives under `docs/specs/fixtures/` per user direction. Each port ships a harness that loads each fixture, runs `format`, and asserts the result.

---

### corpus-layout

Lay out the fixture directory and define the fixture schema.

**Files to create:**
- `docs/specs/fixtures/README.md` — **CREATE** — directory contract + JSON shapes.
- `docs/specs/fixtures/001-plain-variable/{prompt.txt,input.json,options.json,expected.txt}` — first fixture.
- … additional fixtures (see corpus-content below).

**Implementation guidance:**
- Mirror SPEC §9.2: `prompt.txt`, `input.json`, `options.json`, `expected.txt` for success cases; `expected-error.json` (with `{ code, category, messageContains?, line?, column? }`) for error cases. Shared fixtures should not require exact line/column values.
- `input.json` always uses `{ "flags": { ... }, ...vars }` — the harness maps to native call shape per language.
- Categories: `parse`, `frontmatter`, `semantic`, `format`. Numbered 001–199 for success, 500–699 for errors.

**Definition of Done:**
- [ ] `README.md` documents the schema and how to add a fixture.
- [ ] First fixture passes when loaded by the TS harness.

---

### corpus-content

Populate the corpus with enough fixtures to exercise every Section §10 test bullet.

**Implementation guidance:**
- At least one fixture per:
  - All inline-form rendering examples (§3.4).
  - All block-form rendering examples (§3.4).
  - Indented nested block (§3.4 / §8.5).
  - Frontmatter modes (no-frontmatter implicit, full frontmatter, strict mode).
  - Each §10.3 frontmatter error.
  - Each §10.2 parser error.
  - Each §10.4 formatter behavior including required-variable-in-inactive-branch.
  - Each §10.5 format-time validation error.
- Aim for ~40 success fixtures and ~30 error fixtures by phase end.

**Definition of Done:**
- [ ] Every SPEC §3.4 worked example has a matching fixture.
- [ ] Every error in SPEC §7 has at least one fixture.
- [ ] TS harness runs all fixtures and passes.

---

### ts-corpus-harness

The TS test harness that runs the corpus.

**Files to create:**
- `packages/textprompts-ts/tests/conformance.test.ts` — **CREATE** — globs `docs/specs/fixtures/`, loads each fixture, calls `format`, asserts bytes-or-error.

**Implementation guidance:**
- Use Bun's filesystem APIs to enumerate `docs/specs/fixtures/*/`.
- Path the fixtures dir via `path.resolve(import.meta.dir, "../../../docs/specs/fixtures")`.
- Translate `input.json.flags` → the SPEC §6.1 `flags` argument.
- For error fixtures, assert the thrown error's `code` and category match `expected-error.json`. If `messageContains` is present, assert the message includes it. Only assert line/column when the fixture explicitly includes those fields.

**Definition of Done:**
- [ ] `bun test tests/conformance.test.ts` passes for every fixture.
- [ ] A deliberately wrong `expected.txt` makes a fixture fail (sanity).

---

# PHASE-6: Docs + examples + README (textprompts-ts)

**Repository**: `packages/textprompts-ts/`
**Dependencies**: PHASE-4

## Overview

Rewrite the package-level docs and examples for v2 syntax. The existing docs talk about positional args and don't mention flags — they need substantive updates, not cosmetic edits.

---

### docs-rewrite

Update each doc file in `packages/textprompts-ts/docs/` for v2.

**Files to modify:**
- `packages/textprompts-ts/docs/index.md` — short overview of v2 syntax.
- `packages/textprompts-ts/docs/guide.md` — full authoring guide including conditional syntax, flags namespace, modes.
- `packages/textprompts-ts/docs/api.md` — new API surface (post-Phase-4).
- `packages/textprompts-ts/docs/file-format.md` — SPEC §2–§5 condensed for users.
- `packages/textprompts-ts/docs/examples.md` — new examples (see examples-rewrite).

**Implementation guidance:**
- Lean on SPEC §3.4 / §8 worked examples — re-use them.
- Each doc gets a "v2 breaking changes" callout near the top: positional args gone, empty placeholders gone, double-brace gone.

**Definition of Done:**
- [ ] No doc mentions positional args / empty placeholders / `{{...}}` except in the breaking-changes callout.
- [ ] `file-format.md` covers frontmatter schema for flags and variables.
- [ ] Every conditional form has at least one rendered example.

---

### examples-rewrite

Replace the example prompts + scripts.

**Files to modify:**
- `packages/textprompts-ts/examples/prompts/greeting.txt` — keep as a simple no-conditional example.
- `packages/textprompts-ts/examples/prompts/system.txt` — add `{if}` for an optional persona detail.
- `packages/textprompts-ts/examples/prompts/agents.txt` — keep section example.
- `packages/textprompts-ts/examples/prompts/support.txt` — **CREATE** — full SPEC §8.2 worked example.
- `packages/textprompts-ts/examples/basic-usage.ts` — call `format` with `flags`.
- `packages/textprompts-ts/examples/simple-format-demo.ts` — rewrite for v2 surface.
- `packages/textprompts-ts/examples/fromstring-example.ts` — same.
- `packages/textprompts-ts/examples/openai-example.ts`, `aisdk-example.ts` — pass `flags` where it improves the demo.
- `packages/textprompts-ts/examples/README.md` — update.

**Definition of Done:**
- [ ] `bun examples/basic-usage.ts` runs without error.
- [ ] Every example script exercises at least one of `{if}`, `{switch}`, or strict-mode loading.
- [ ] Examples README links to the new authoring skill (Phase 7).

---

### readme-rewrite-ts

`packages/textprompts-ts/README.md` becomes a v2 README.

**Files to modify:**
- `packages/textprompts-ts/README.md` — quickstart with `flags`, breaking-changes block, link to authoring skill, link to SPEC.

**Implementation guidance:**
- Keep the "Why textprompts?" framing — it's good.
- Replace the "Real-World Examples" / "Best Practices" sections with examples that exercise conditionals.
- Add a "Migrating from v1" section with a small diff-style block: before (positional `{0}` style) vs after (named + flags).

**Definition of Done:**
- [ ] First code sample in README uses `flags` and a conditional.
- [ ] "Migrating from v1" section is present and accurate.
- [ ] Link to `docs/writing-prompts-with-textprompts/` is present.

---

# PHASE-7: Authoring skill, CHANGELOG, final validation

**Repository**: repo root
**Dependencies**: PHASE-5, PHASE-6

## Overview

Wrap up the release: author a Claude/Codex skill at `docs/writing-prompts-with-textprompts/` that teaches humans and LLMs to write conditional prompts; cut the v2.0.0 CHANGELOG and version bump; run final end-to-end validation.

SKILL.md uses YAML frontmatter so the file is drop-in installable as an agent skill. References live under `references/` and are linked from SKILL.md.

---

### skill-main

Write the canonical authoring skill.

**Files to modify:**
- `docs/writing-prompts-with-textprompts/SKILL.md` — currently empty (0 bytes).

**Files to create:**
- `docs/writing-prompts-with-textprompts/references/conditional-syntax-cheatsheet.md`
- `docs/writing-prompts-with-textprompts/references/anti-patterns.md`
- `docs/writing-prompts-with-textprompts/references/typescript-quickstart.md`
- `docs/writing-prompts-with-textprompts/references/error-debugging.md`
- `docs/writing-prompts-with-textprompts/references/migration-from-v1.md`

**Implementation guidance:**
- SKILL.md frontmatter (per Claude/Codex skill conventions):
  ```yaml
  ---
  name: writing-prompts-with-textprompts
  description: Author and edit textprompts prompt files. Use when writing or editing files that use the textprompts format — frontmatter, {var} placeholders, {if}/{switch} conditionals, flags, and strict mode.
  ---
  ```
- Body covers SPEC §12 bullets:
  - When to use `{if}` vs `{switch}`.
  - How to declare flags with descriptions + custom metadata.
  - Why all body variables must be wired even in inactive branches.
  - Why block keywords are alone on their lines.
  - Why dashes are not allowed in identifiers.
  - Why prompt-body comments are not supported.
  - Common patterns (gating, variants, optional context, inline phrase insertion).
  - Anti-patterns (deep nesting, embedded caller logic, comments, pseudo-expressions).
  - When to use `metadata: "allow"` vs `"strict"` vs `"ignore"` (incl. ignore-mode as the escape hatch for unparseable headers).
  - How to use custom metadata: reading `prompt.meta.extras`, per-flag `extras` (owner, expiry, rollout, ticket), per-variable `extras`.
  - That extra format-time inputs are silently ignored — and how to detect unused inputs by diffing context against `prompt.meta.flags` / `prompt.meta.variables`.
  - Debugging missing-flag / missing-variable errors.
- Use short rendered examples copied from SPEC §3.4 / §8.
- The reference files are deep dives: cheatsheet (one-page grammar reference), anti-patterns (longer-form with rationale), typescript-quickstart (loadPrompt → format walkthrough), error-debugging (each error code with explanation), migration-from-v1 (concrete diffs).
- Skill should explicitly call out LLM importing of Handlebars/Jinja habits and steer authors away.

**Definition of Done:**
- [ ] SKILL.md frontmatter validates as YAML and matches the Claude/Codex skill schema.
- [ ] Every SPEC §12 bullet is covered, either inline or via a `references/` link.
- [ ] Every reference file is linked from SKILL.md.
- [ ] No emojis (per project CLAUDE.md rules).

---

### readme-root-reference

Add a reference to the authoring skill in the project root README + the ts package README.

**Files to modify:**
- `README.md` (repo root) — add link under the existing "Node/TypeScript" bullet near line 37, plus a new "Authoring guide" sub-bullet.
- `packages/textprompts-ts/README.md` — link in the docs section AND once near the top of the README so LLM-driven editors discover it.

**Definition of Done:**
- [ ] Root README references `docs/writing-prompts-with-textprompts/SKILL.md`.
- [ ] ts package README has a "Writing prompts" / "Authoring guide" callout linking to the skill.
- [ ] Link works (relative paths from each README resolve).

---

### changelog

Document the breaking release. Lives in Phase 7 with the skill + final validation, since they all wrap up the release together.

**Files to modify:**
- `packages/textprompts-ts/CHANGELOG.md` — add a v2.0.0 section.
- `packages/textprompts-ts/package.json` — bump `version` to `2.0.0`.

**Implementation guidance:**
- Section structure:
  - Headline: "v2.0.0 — Conditional syntax (BREAKING)"
  - Added: `{if}`, `{else}`, `{end}`, `{switch}`, `{case}`, `{if !flag}`, typed flags namespace declared in `[flags.*]` frontmatter, exhaustiveness checks, AST-backed parser, conformance corpus.
  - Removed: positional placeholders `{0}`, empty placeholders `{}`, `{{...}}` double-brace escape, `args` overload on `Prompt.format` / `PromptString.format`, public `PromptString` export (now internal — use `Prompt.fromString`).
  - Kept: `MetadataMode.IGNORE` mode, `loadPrompt`, `savePrompt`, section APIs.
  - Migration link to `docs/writing-prompts-with-textprompts/references/migration-from-v1.md`.
- Root `CHANGELOG.md` covers multi-language. Add a brief pointer entry noting "textprompts-ts 2.0.0 — see package CHANGELOG"; don't duplicate the full changelog there.

**Definition of Done:**
- [ ] Changelog entry follows existing repo style.
- [ ] `package.json` version bumped to `2.0.0`.
- [ ] Migration link resolves.
- [ ] No mention of cross-port v2 status (out of scope).

---

### final-validation

End-to-end sanity passes.

**Implementation guidance:**
- `bun test` in `packages/textprompts-ts` must pass: every existing + new test green.
- `bun examples/basic-usage.ts` and at least two other examples run cleanly.
- Spot-check: load a SPEC §8.2 example file from a fresh script and confirm the rendered output matches the SPEC text byte-for-byte.
- Type-check clean.
- Re-read SKILL.md as an LLM might: can someone author a new prompt from scratch using only the skill + cheatsheet? If no, fix the skill.

**Definition of Done:**
- [ ] All tests green in `packages/textprompts-ts`.
- [ ] All conformance fixtures green.
- [ ] All examples run.
- [ ] No type errors.
- [ ] CHANGELOG, version, README, skill all cross-link correctly.

---

### final-bug-review

Targeted second-pass review for the kinds of bugs that "build passes" misses.

**Implementation guidance:**
- Wiring: confirm `Prompt.format` actually calls `validateInputs` (Phase 3) before rendering — not just defines it.
- Wiring: confirm the loader actually attaches `meta.flags` / `meta.variables` to `Prompt` — not just constructs them.
- Logic: confirm the AST walker that collects required vars/flags visits both branches of every `{if}` and all branches of every `{switch}`.
- Indentation: feed a deeply-indented nested-block prompt; confirm the keyword lines really are removed including their leading whitespace.
- Edge: empty `{case X}` body, `{if !flag}` with both branches, switch with exhaustive cases AND `{else}` (legal per §5.3).
- Persistence: save and reload a v2 prompt with flags, variables, and extras; confirm no schema metadata is lost.
- Loaders: exercise `metadata` and `frontmatterFormat` through `loadPrompt`, `loadSection`, `Prompt.fromPath`, `Prompt.fromString`, `parseFile`, and `parseString`.
- Cross-platform: a prompt authored on Windows (CRLF) and one on Unix (LF) produce byte-identical output.
- Surface check: `PromptString` is **not** present in the published `dist/` exports (Phase 4 internal-only decision).

**Definition of Done:**
- [ ] Each bullet above has a corresponding passing test in `tests/` or a fixture in the corpus.
- [ ] Walk the public API one more time vs SPEC §6.1 — every documented call shape works.
- [ ] `PromptString` is not exported from the package.

---

# Dependency Map

```
PHASE-1 (lexer, AST, body parser) ─┐
                                   ├─→ PHASE-3 (renderer + validation) ─→ PHASE-4 (public API) ─┬─→ PHASE-5 (corpus) ───┐
PHASE-2 (frontmatter schema) ──────┘                                                            └─→ PHASE-6 (docs) ─────┴─→ PHASE-7 (skill + changelog + final validation)
```

**Critical path**: PHASE-1 / PHASE-2 → PHASE-3 → PHASE-4 → PHASE-6 → PHASE-7.

PHASE-5 (corpus) can begin as soon as PHASE-4 lands and runs in parallel with PHASE-6.

---

# Decisions Made

| Decision | Choice | Rationale | Who | Source |
|----------|--------|-----------|-----|--------|
| Release shape | Hard break, v2.0, one PR | Matches SPEC §1.1 and §9.1; user wants a clean break with clear CHANGELOG. | [User] | PLAN |
| Fixtures location | `docs/specs/fixtures/` | Shared across ports under the existing `docs/specs/` tree; user-directed. | [User] | PLAN |
| Skill format | Claude/Codex SKILL.md + `references/*.md` | Drop-in for agent skill directories; user-directed. | [User] | PLAN |
| Port scope | TypeScript only — no cross-port stubs, no tracking artifacts | User-directed: "ignore ports". Python/Julia/Go/Elixir will catch up on their own time using the SPEC + fixtures as the source of truth. | [User] | PLAN |
| Replace placeholder regex with lexer+AST | Yes, but keep it small | Spec requires escape handling (`\{`, `\\`, `\}`), control tags, and nested block structure. A small lexer/parser is simpler and safer than stretching regexes into a template engine. | [AI] | PLAN |
| Error locations | Best-effort only | Helpful category/code/message matters more than exact line/column. Exact source mapping would add complexity and is not needed for this release. | [User] | PLAN, SPEC §7 |
| Keep `MetadataMode.IGNORE` | Yes — first-class mode that skips frontmatter parsing entirely | SPEC §4.6 (updated). Avoids the budge where unparseable headers block body iteration. | [User] | SPEC §4.6, Appendix A |
| Extras posture | Silently ignore extra format-time inputs; expose custom frontmatter fields as data (`extras` on `meta`, on each flag, on each variable). | SPEC §5.7 / §5.8 (updated). Warnings on extras would be noise; discarded custom fields would lose operational metadata. | [User] | SPEC §5.7, §5.8, §6.5 |
| All metadata under `prompt.meta` | Yes — no separate `prompt.schema` object | User-directed: simpler surface. `prompt.meta` carries standard fields, `extras`, `flags`, `variables`. | [User] | SPEC §5.8, §6.5 |
| Container shape for `flags` / `variables` | Plain object (`Record<string, FlagDecl>`) not `Map` | User-directed: pick the most natural implementation. Objects are JSON-serializable, mirror Python `dict` / Julia `Dict`, and are idiomatic in TS for string keys. | [User] | PLAN |
| `PromptString` visibility | Internal — not exported from `index.ts` / `core.ts` | User-directed: public path is `Prompt.fromString` and `loadPrompt`. Reduces surface area and makes implicit-mode-only-from-fromString unambiguous. | [User] | PLAN |
| Positional args | Removed entirely from `Prompt.format` and `PromptString.format` | User-directed: "remove positional args across the board to reduce errors". Already in SPEC §1.1 / §6.4 for the format syntax; this extends the removal to the runtime API shape. | [User] | PLAN, SPEC §6.4 |
| Save API | `savePrompt` must support v2 metadata | `savePrompt` stays public, so it must preserve flags, variables, and extras instead of dropping schema data. | [User] | PLAN |
| Loader options | Propagate one option shape everywhere | `loadPrompt`, `loadSection`, `Prompt.fromPath`, `Prompt.fromString`, `parseFile`, and `parseString` should all use `{ metadata, frontmatterFormat }`; no lingering `meta` option. | [User] | PLAN |
| Source preprocessing | Centralize in `src/source.ts` | BOM stripping, line-ending normalization, and dedent should happen exactly once before body parsing. | [User] | SPEC §2.5 |
| Stable error codes | Yes (e.g. `E_UNCLOSED_IF`) | SPEC §11.4 calls for cross-language conformance on category + stable code; cheaper to add now than retrofit. | [AI] | PLAN |

---

# Verification Strategy

## Acceptance Criteria (as test signatures)

```
// Lexer
test_tokenizes_negated_if:
  Given: source "{if !flag}body{end}"
  When: tokenize() runs
  Then: emits [OpenIf{negated=true, name="flag"}, Text("body"), End].

test_rejects_inside_brace_whitespace:
  Given: source "{ if flag }"
  When: tokenize() runs
  Then: throws ParseError with code E_BAD_TAG and a message mentioning whitespace inside braces.

// Body parser
test_block_form_alone_on_line:
  Given: tokens for "{if flag}\nbody\n{end}\n"
  When: parseBody() runs
  Then: AST has IfNode{form: "block", body: [Text("body\n")]}.

test_inline_with_else:
  Given: tokens for "x {if f}a{else}b{end} y"
  When: parseBody() runs
  Then: AST has IfNode{form: "inline", body: [Text("a")], elseBody: [Text("b")]} between two Text nodes.

test_switch_requires_at_least_one_case:
  Given: tokens for "{switch tier}\n{end}"
  When: parseBody() runs
  Then: throws ParseError code E_SWITCH_NO_CASES and a message mentioning `tier` or the missing cases.

// Frontmatter
test_enum_flag_rejects_dashed_value:
  Given: TOML "[flags.tier]\ntype=\"enum\"\nvalues=[\"free-tier\"]"
  When: parseSchema() runs
  Then: throws FrontmatterError code E_INVALID_IDENTIFIER.

test_strict_requires_flag_description:
  Given: TOML with [flags.show_tips] but no description
  When: load() runs with metadata: "strict"
  Then: throws FrontmatterError code E_STRICT_MISSING_DESCRIPTION.

// Renderer
test_block_keyword_line_removed_with_leading_whitespace:
  Given: AST for "A\n  {if flag}\n  body\n  {end}\nB" with flag=true
  When: render() runs
  Then: output is "A\n  body\nB" — the keyword lines' two-space indent is gone, body's two-space indent is kept.

test_inactive_branch_leaves_no_whitespace:
  Given: same AST with flag=false
  When: render() runs
  Then: output is "A\nB" exactly.

// Format-time validation
test_required_var_in_inactive_branch:
  Given: prompt "{if has}{last}{end}" with flags.has=false but no `last` variable passed
  When: format() runs
  Then: throws FormatError code E_MISSING_VARIABLE.

test_flags_passed_as_string_rejected:
  Given: format({ role: "x", flags: "premium" })
  When: validateInputs runs
  Then: throws FormatError code E_BAD_FLAGS_TYPE.

test_extra_flag_is_silently_ignored:
  Given: prompt with only `tier`, caller passes flags.tier and flags.bogus
  When: format() runs
  Then: completes successfully, output is the same as if `bogus` were not passed, no warning emitted.

test_ignore_mode_skips_malformed_header:
  Given: a file beginning with "---\n!!!not toml or yaml!!!\n---\nbody {var}\n"
  When: loadPrompt(path, { metadata: "ignore" }) runs
  Then: returns a Prompt with title = filename stem, body = "body {var}\n", no schema, no error thrown.

test_extras_reachable_on_loaded_prompt:
  Given: frontmatter with `owner = "@team"` at top level and `[flags.tier]` carrying `expires = "2026-12-01"`
  When: loadPrompt(path) runs
  Then: prompt.meta.extras.owner === "@team" and prompt.meta.flags.tier.extras.expires === "2026-12-01".

test_meta_is_json_serializable:
  Given: any prompt loaded with frontmatter declaring flags and variables
  When: JSON.stringify(prompt.meta) runs
  Then: returns a non-empty string round-trippable via JSON.parse with all flags/variables/extras preserved.

test_promptstring_not_exported:
  Given: the published package surface
  When: import { PromptString } from "textprompts" (or "textprompts/core") runs
  Then: TypeScript type error AND runtime undefined import.

test_promptstring_internal_handles_implicit_mode:
  Given: Prompt.fromString("Hello {if foo}friend{end}!", { metadata: "ignore" })
  When: format({ flags: { foo: true } }) runs
  Then: returns "Hello friend!" (flag inferred from body in implicit mode).

test_empty_body_after_ignore_strip_errors:
  Given: file content "---\nrandom garbage\n---\n"
  When: loadPrompt(path, { metadata: "ignore" }) runs
  Then: throws a load error per SPEC §2.5.

// Conformance
test_every_fixture_passes:
  Given: every directory under docs/specs/fixtures/
  When: harness runs each through load() + format()
  Then: output matches expected.txt byte-for-byte (or thrown error matches expected-error.json).
```

## Wiring Verification

| Component | Created By | Called By | Verification Test |
|-----------|------------|-----------|-------------------|
| `tokenize` | `body-parser.parseBody` | `Prompt` constructor (via `parseString`) | `test_prompt_construct_tokenizes_body` |
| `parseFlagsAndVariables` | `parser-core.parseString` | `loadPrompt` & `Prompt.fromString` | `test_flags_attached_to_meta` |
| `validateInputs` | called from `PromptString.format` (internal) | `Prompt.format` | `test_format_calls_validate_before_render` |
| `collectRequiredRefs` (AST walker) | invoked by `validateInputs` | walks both `if.body` AND `if.elseBody` AND all switch branches | `test_required_var_collection_visits_all_branches` |
| `Conformance harness` | `tests/conformance.test.ts` | Bun test runner | runs in CI |

## Interface Contracts

| Interface | Implementer | Compile Check |
|-----------|-------------|---------------|
| `FlagDecl = BooleanFlag \| EnumFlag` | `parseFlagsAndVariables` output | TS discriminated union; exhaustive switch in renderer with `never` default. |
| `Node = TextNode \| VariableNode \| IfNode \| SwitchNode` | `parseBody` output | Same — exhaustive switch in `render`, `collectRequiredRefs`. |
| `TextPromptsError` | every thrown error | All thrown errors `extends TextPromptsError`; test enforces with type-only assertion `const _: TextPromptsError = err`. |
| `prompt.meta` shape | always present, plain object | `JSON.stringify(prompt.meta)` round-trips losslessly via `JSON.parse`. |

---

# Key Behaviors to Verify

1. **All body references are required at format time, regardless of branch** — the single most important semantic rule (§5.2). Test by passing `flag=false` and omitting a var that's only used inside that branch; must error.
2. **Block keyword lines disappear entirely, including indentation** (§3.3). Test with deeply indented nested blocks.
3. **Inline tags preserve everything outside the tag** (§3.3). Test by including punctuation immediately after `{end}`.
4. **Exhaustive switch is enforced against declared enum values** (§5.3). Test by adding a new enum value to a flag declaration and confirming load-time error if a `{switch}` lacks the new case.
5. **Type checks have no coercion** (§5.5). Test passing `"true"` (string) for a boolean flag — must error, not coerce.
6. **Strict mode requires flag descriptions but not variable descriptions** (§4.6, §10.3). Both directions tested.
7. **`metadata: "ignore"` skips frontmatter parsing entirely** (§4.6). A malformed `---` block does not fail to load in this mode.
8. **Reserved keyword values render literally** (§5.5 last paragraph). Passing `role="end"` renders the text `end`.
9. **CRLF and LF inputs produce byte-identical output** (§11.1).
10. **Extra inputs at format time are silently ignored** (§5.7). No warning, no error, no diagnostic on the return value.
11. **Custom metadata reaches the caller as data** (§5.8, §6.5). Top-level, per-flag, per-variable extras all reachable via `prompt.meta.extras`, `prompt.meta.flags.<name>.extras`, `prompt.meta.variables.<name>.extras` with original TOML/YAML types preserved.
12. **`prompt.meta` is JSON-serializable** — plain objects everywhere, no `Map` or class instances in the persisted shape (low-priority but verified).
13. **`savePrompt` round-trips v2 metadata** — flags, variables, and extras survive save/load.
14. **`PromptString` is internal** — not importable from the package; `Prompt.fromString` is the only string-to-prompt path.
15. **Authoring skill is sufficient to write a new prompt from scratch** (§12). Manual verification during Phase 7.
16. **Public API in `packages/textprompts-ts/README.md` matches reality** (§6.1). Diff README code samples against an actual run.

---

*End of plan.*
