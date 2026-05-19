# textprompts conformance corpus

This directory is the cross-port conformance corpus for textprompts (SPEC §9.2,
§10.6). Each fixture is one self-contained directory describing a single prompt,
its inputs, the loader options, and the expected outcome (rendered bytes for
success cases, structured error info for error cases).

Every language port (TS, Python, Julia, Go, Elixir) MUST run this corpus and
produce byte-identical output for success cases and a matching error class +
stable code for error cases. The TypeScript harness lives at
`packages/textprompts-ts/tests/conformance.test.ts`.

## Directory layout

```
docs/specs/fixtures/
  001-plain-variable/
    prompt.txt
    input.json
    options.json
    expected.txt
  500-unclosed-if/
    prompt.txt
    input.json
    options.json
    expected-error.json
  ...
```

A fixture name is `<NNN>-<kebab-case-slug>`:

- `001`–`199` — success fixtures. Must contain `expected.txt`.
- `500`–`699` — error fixtures. Must contain `expected-error.json`.

Every fixture always contains `prompt.txt`, `input.json`, and `options.json`,
even when those last two are empty (`{}`). This keeps the harness loop simple.

## File shapes

### `prompt.txt`

The prompt file contents, exactly as a user would author them. May include
frontmatter (`---` delimited TOML or YAML), and a body using `{var}`, `{if}`,
`{switch}`, etc. The body is required (SPEC §2.5: empty prompt files load-error
under all metadata modes).

### `input.json`

JSON object describing the inputs passed to `format()`:

```json
{
  "flags": { "tier": "premium" },
  "variables": { "user_name": "Jan" }
}
```

Both keys are optional:

- `flags` — object mapping flag name to value (`boolean` or `string`).
  Translates to SPEC §6.1's `flags` parameter.
- `variables` — object mapping variable name to value. Translates to SPEC §6.1's
  top-level variable arguments (e.g. in TS, these become top-level keys on the
  `format()` argument; in Python, kwargs).

If a prompt takes no inputs at all, write `{}`.

### `options.json`

JSON object of loader options (SPEC §6.1):

```json
{
  "metadata": "allow",
  "frontmatterFormat": "auto"
}
```

Both keys are optional with these defaults:

- `metadata` — `"allow"` | `"strict"` | `"ignore"`. Default `"allow"`.
- `frontmatterFormat` — `"auto"` | `"toml"` | `"yaml"`. Default `"auto"`.

If the fixture uses the defaults, write `{}`.

### `expected.txt` (success fixtures)

The exact bytes that `prompt.format(inputs)` must produce. The harness MUST
compare byte-for-byte (no trimming, no normalization). Include or exclude
trailing newlines deliberately — the renderer preserves them per source
(SPEC §2.5).

### `expected-error.json` (error fixtures)

```json
{
  "code": "E_UNCLOSED_IF",
  "category": "parse",
  "messageContains": "unclosed"
}
```

Fields:

- `code` — stable error code (SPEC §11.4). Required.
- `category` — one of `"parse"`, `"frontmatter"`, `"semantic"`, `"format"`.
  Required.
- `messageContains` — optional substring the human-readable message must
  contain. Used to pin down ambiguous codes.
- `line`, `column` — optional. Each port may include them; shared fixtures
  should not require exact values (SPEC §7).

## Category → error class mapping

| Category       | TypeScript class    | Python class        | Julia type           |
|----------------|---------------------|---------------------|----------------------|
| `parse`        | `ParseError`        | `ParseError`        | `ParseError`         |
| `frontmatter`  | `FrontmatterError`  | `FrontmatterError`  | `FrontmatterError`   |
| `semantic`     | `SemanticError`     | `SemanticError`     | `SemanticError`      |
| `format`       | `FormatError`       | `FormatError`       | `FormatError`        |

All four extend the port's `TextPromptsError` base class.

## How a port harness runs a fixture

Pseudocode any port can implement:

```
for dir in sorted(listdir("docs/specs/fixtures")):
    prompt_text = read(dir, "prompt.txt")
    input       = read_json(dir, "input.json")    # may be {}
    options     = read_json(dir, "options.json")  # may be {}

    if exists(dir, "expected.txt"):
        prompt = Prompt.fromString(prompt_text, options)
        actual = prompt.format(merge(input.flags or {}, input.variables or {}))
        assert actual == read(dir, "expected.txt")

    else:  # expected-error.json
        spec = read_json(dir, "expected-error.json")
        try:
            prompt = Prompt.fromString(prompt_text, options)
            output = prompt.format(merge(input.flags or {}, input.variables or {}))
            fail("expected an error, got output")
        except err:
            assert err.code == spec["code"]
            assert isinstance(err, class_for(spec["category"]))
            if "messageContains" in spec:
                assert spec["messageContains"] in err.message
```

The harness MUST treat `Prompt.fromString` (or equivalent) and `format` as the
only entry points. Loader options always come from `options.json`.

## Adding a new fixture

1. Pick the next free number in the success (`001`–`199`) or error
   (`500`–`699`) range.
2. Make a directory `NNN-kebab-case-slug/`.
3. Drop in `prompt.txt`, `input.json`, `options.json`, and either
   `expected.txt` or `expected-error.json`.
4. Run the TS harness locally:
   `cd packages/textprompts-ts && bun test tests/conformance.test.ts`.
5. Commit. Other ports will pick the fixture up on their next test run.

## Numbering conventions

- Reserve clear ranges for related fixture families when convenient
  (e.g. `030`–`039` for switch-with-else variants). Gaps are fine; never
  renumber an existing fixture.
- Errors are split by category for skimming:
  - `500`–`519` — parse errors.
  - `520`–`529` — frontmatter / schema errors.
  - `530`–`539` — semantic (load-time) errors.
  - `540`–`559` — format-time errors.

These ranges are guidelines, not enforced by the harness.
