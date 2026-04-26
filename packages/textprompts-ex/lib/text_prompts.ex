defmodule TextPrompts do
  @moduledoc """
  TextPrompts — load, format, and slice Markdown prompt files in Elixir.

  TextPrompts is the Elixir port of the cross-language `textprompts`
  toolkit (Python, Go, TypeScript, Julia). It speaks the same on-disk
  format and parses prompt documents into the same data shapes as the
  other ports, so a prompt authored once can be consumed identically
  from any supported language. Parity is verified against the shared
  fixtures in `testdata/sections/cases.json`.

  ## What you get

    * Strict, optional, or "ignored" frontmatter (TOML or YAML).
    * Validated, single-pass placeholder formatting (`{name}` syntax).
    * A section parser that recognises Markdown headings and XML-style
      `<tag>` blocks, with stable anchor ids, link extraction, and a
      table-of-contents renderer.
    * Round-trip save with TOML or YAML frontmatter.
    * Telemetry instrumentation on every load and save.
    * A compile-time `~P` sigil for inline templates.

  ## Quick start

      content = \"""
      ---
      title = "Greeting"
      version = "1.0.0"
      description = "Demo prompt"
      ---
      Hello {name}, welcome to {place}.
      \"""

      File.write!("greet.md", content)
      prompt = TextPrompts.load!("greet.md")
      ps = TextPrompts.PromptString.new(prompt.prompt)
      {:ok, rendered} = TextPrompts.PromptString.format(ps, name: "Ada", place: "Earth")
      File.rm!("greet.md")

  ## Metadata modes

  Loader behaviour is governed by a metadata mode, resolved (in order)
  from:

    1. The `:meta` option on the call.
    2. A process-local override set by `with_metadata/2`.
    3. The application env key `:text_prompts, :metadata_mode`.
    4. The default, `:allow`.

  Modes:

    * `:strict` — frontmatter is required; `title`, `description`, and
      `version` must be present and non-empty.
    * `:allow` — frontmatter is optional; when present it must parse.
    * `:ignore` — frontmatter is never parsed; if a `---…---` block is
      present at the top of the file it is stripped from the body
      (matching the Python reference). The prompt's title defaults to
      the filename stem.

  See `TextPrompts.MetadataMode` and `TextPrompts.Config`.

  ## Sections workflow

      {:ok, prompt} = TextPrompts.load("doc.md", meta: :ignore)
      result = TextPrompts.parse_sections(prompt.prompt)
      result.sections           # → [%TextPrompts.Sections.Section{}, ...]
      TextPrompts.render_toc(result, "doc.md")

  Each parsed `Section` has a deterministic `anchor_id` (lowercase,
  ASCII-alphanumeric, `_` separators). `get_section_text/2` looks one
  up by id; `inject_anchors/1` rewrites a document so every Markdown
  heading has an explicit `<a id="…"></a>` anchor.

  ## Sigil

      use TextPrompts.Sigil
      ps = ~P"Hello {name}"

  See `TextPrompts.Sigil` and `TextPrompts.PromptString`.

  ## Telemetry events

  Every loader and saver call emits a `:telemetry.span/3` triple:

    * `[:text_prompts, :load, :start | :stop | :exception]`
      — measurements: `%{system_time:, duration:}`. Metadata:
      `%{path:, mode:}`.
    * `[:text_prompts, :save, :start | :stop | :exception]`
      — measurements as above. Metadata: `%{path:, format:}`.

  Use `:telemetry.attach/4` to subscribe.

  ## Error contract

  All public functions return either `{:ok, value}` / `{:error, exception}`
  or have a `!` raising counterpart. Exceptions are typed structs under
  `TextPrompts.Error.*`:

    * `TextPrompts.Error.FileMissing`
    * `TextPrompts.Error.IO`
    * `TextPrompts.Error.MissingMetadata`
    * `TextPrompts.Error.InvalidMetadata`
    * `TextPrompts.Error.InvalidMetadataMode`
    * `TextPrompts.Error.MalformedHeader`
    * `TextPrompts.Error.Format`

  ## Cross-language parity

  This module mirrors the public surface of:

    * Python — `src/textprompts/`
    * Go — `packages/textprompts-go/`
    * TypeScript — `packages/textprompts-ts/`
    * Julia — `packages/TextPrompts.jl/`

  Names use Elixir conventions (snake_case) but carry the same
  semantics, and the section parser produces output that matches the
  shared `testdata/sections/cases.json` fixtures byte-for-byte.
  """

  alias TextPrompts.{Config, Loader, Prompt, Saver, Sections}

  @type meta_option :: {:meta, TextPrompts.MetadataMode.t() | binary() | nil}
  @type format_option :: {:format, :toml | :yaml | nil}
  @type load_options :: [meta_option()]
  @type save_options :: [format_option()]

  # ---------------------------------------------------------------------------
  # Loading
  # ---------------------------------------------------------------------------

  @doc """
  Load a prompt file. Returns `{:ok, %TextPrompts.Prompt{}}` or
  `{:error, exception}`.

  Delegates to `TextPrompts.Loader.load/2`.

  ## Options

    * `:meta` — explicit metadata-mode override (`:strict`, `:allow`,
      `:ignore`, or string equivalents).

  ## Examples

      iex> path = Path.join(System.tmp_dir!(), "tp_doc_load.md")
      iex> File.write!(path, "Hello world\\n")
      iex> {:ok, prompt} = TextPrompts.load(path, meta: :ignore)
      iex> File.rm!(path)
      iex> prompt.prompt
      "Hello world\\n"
  """
  @spec load(Path.t(), load_options()) :: {:ok, Prompt.t()} | {:error, Exception.t()}
  defdelegate load(path, opts \\ []), to: Loader

  @doc """
  Like `load/2` but raises on error.
  """
  @spec load!(Path.t(), load_options()) :: Prompt.t()
  defdelegate load!(path, opts \\ []), to: Loader

  @doc false
  # Back-compat alias retained for callers that pre-date the `load/2` rename.
  @spec load_prompt(Path.t(), load_options()) :: {:ok, Prompt.t()} | {:error, Exception.t()}
  defdelegate load_prompt(path, opts \\ []), to: Loader, as: :load

  @doc false
  @spec load_prompt!(Path.t(), load_options()) :: Prompt.t()
  defdelegate load_prompt!(path, opts \\ []), to: Loader, as: :load!

  # ---------------------------------------------------------------------------
  # Saving
  # ---------------------------------------------------------------------------

  @doc """
  Save a prompt (or a raw body string) to disk.

  Delegates to `TextPrompts.Saver.save/3`.

  ## Options

    * `:format` — `:toml` (default for non-YAML extensions) or `:yaml`.

  ## Examples

      iex> path = Path.join(System.tmp_dir!(), "tp_doc_save.md")
      iex> :ok = TextPrompts.save(path, "body only\\n")
      iex> body = File.read!(path)
      iex> File.rm!(path)
      iex> body
      "body only\\n"
  """
  @spec save(Path.t(), Prompt.t() | String.t(), save_options()) ::
          :ok | {:error, Exception.t()}
  defdelegate save(path, prompt, opts \\ []), to: Saver

  @doc """
  Like `save/3` but raises on error.
  """
  @spec save!(Path.t(), Prompt.t() | String.t(), save_options()) :: :ok
  defdelegate save!(path, prompt, opts \\ []), to: Saver

  @doc false
  @spec save_prompt(Path.t(), Prompt.t() | String.t(), save_options()) ::
          :ok | {:error, Exception.t()}
  defdelegate save_prompt(path, value, opts \\ []), to: Saver, as: :save

  @doc false
  @spec save_prompt!(Path.t(), Prompt.t() | String.t(), save_options()) :: :ok
  defdelegate save_prompt!(path, value, opts \\ []), to: Saver, as: :save!

  # ---------------------------------------------------------------------------
  # Sections
  # ---------------------------------------------------------------------------

  @doc """
  Parse a Markdown / XML-tagged document into a
  `TextPrompts.Sections.ParseResult`.

  Delegates to `TextPrompts.Sections.parse_sections/1`.

  ## Examples

      iex> result = TextPrompts.parse_sections("# Title\\nbody\\n")
      iex> [section] = result.sections
      iex> {section.heading, section.anchor_id}
      {"Title", "title"}
  """
  @spec parse_sections(String.t()) :: Sections.ParseResult.t()
  defdelegate parse_sections(text), to: Sections

  @doc """
  Slugify a heading into an anchor id (lowercase, ASCII-alphanumeric,
  `_` separators). Empty input becomes `"section"`.

  Delegates to `TextPrompts.Sections.generate_slug/1`.

  ## Examples

      iex> TextPrompts.generate_slug("**Hello**, World!")
      "hello_world"
  """
  @spec generate_slug(String.t()) :: String.t()
  defdelegate generate_slug(text), to: Sections

  @doc """
  Normalise a string into a stable anchor id. Empty input becomes
  `"section"`.

  Delegates to `TextPrompts.Sections.normalize_anchor_id/1`.

  ## Examples

      iex> TextPrompts.normalize_anchor_id("Hello World")
      "hello_world"
  """
  @spec normalize_anchor_id(String.t()) :: String.t()
  defdelegate normalize_anchor_id(text), to: Sections

  @doc """
  Locate a section by anchor id and return its body text. Returns
  `{text | nil, found?}`.

  Delegates to `TextPrompts.Sections.get_section_text/2`.

  ## Examples

      iex> {body, true} = TextPrompts.get_section_text("# Intro\\nhi\\n", "intro")
      iex> body
      "hi\\n"
  """
  @spec get_section_text(String.t(), String.t()) :: {String.t() | nil, boolean()}
  defdelegate get_section_text(text, anchor), to: Sections

  @doc """
  Render a Markdown table-of-contents string for a parsed result.

  Delegates to `TextPrompts.Sections.render_toc/2`.
  """
  @spec render_toc(Sections.ParseResult.t(), String.t()) :: String.t()
  defdelegate render_toc(result, path), to: Sections

  @doc """
  Idempotently insert `<a id="…"></a>` anchors before Markdown headings
  that lack an explicit anchor. Returns `{new_text, parse_result}`.

  Delegates to `TextPrompts.Sections.inject_anchors/1`.
  """
  @spec inject_anchors(String.t()) :: {String.t(), Sections.ParseResult.t()}
  defdelegate inject_anchors(text), to: Sections

  @doc """
  Convenience: load a prompt file and return the body of the named
  section.

  Delegates to `TextPrompts.Sections.load_section/3`.
  """
  @spec load_section(Path.t(), String.t(), load_options()) ::
          {:ok, String.t()} | {:error, Exception.t()}
  defdelegate load_section(path, anchor_id, opts \\ []), to: Sections

  @doc """
  Like `load_section/3` but raises on error.
  """
  @spec load_section!(Path.t(), String.t(), load_options()) :: String.t()
  defdelegate load_section!(path, anchor_id, opts \\ []), to: Sections

  # ---------------------------------------------------------------------------
  # Configuration
  # ---------------------------------------------------------------------------

  @doc """
  Run `fun` with the given metadata mode set as the process-local
  override, restoring the prior value on exit.

  Delegates to `TextPrompts.Config.with_metadata/2`.

  ## Examples

      iex> TextPrompts.with_metadata(:ignore, fn ->
      ...>   TextPrompts.Config.metadata_mode()
      ...> end)
      :ignore
  """
  @spec with_metadata(term(), (-> result)) :: result when result: var
  defdelegate with_metadata(mode, fun), to: Config
end
