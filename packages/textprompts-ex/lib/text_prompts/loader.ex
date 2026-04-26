defmodule TextPrompts.Loader do
  @moduledoc """
  Load prompt files into `TextPrompts.Prompt` structs.

  ## Metadata modes

  Resolved via `TextPrompts.Config.metadata_mode/1` (priority: explicit
  `:meta` option → process-local override → application env → default
  `:allow`).

    * `:strict` — frontmatter is required and must contain non-empty
      `title`, `description`, and `version` fields. Missing frontmatter
      raises `TextPrompts.Error.MissingMetadata`; missing required fields
      raise `TextPrompts.Error.InvalidMetadata`.
    * `:allow` — frontmatter is optional; when present it must parse
      cleanly. A malformed header surfaces
      `TextPrompts.Error.MalformedHeader` /
      `TextPrompts.Error.InvalidMetadata`.
    * `:ignore` — frontmatter is never parsed. If a `---…---` block is
      present at the top of the file it is **stripped from the body**
      (Python parity), and the prompt's title defaults to the filename
      stem.

  ## Telemetry

    * `[:text_prompts, :load, :start]` — `%{system_time: integer}`,
      metadata `%{path:, mode:}`.
    * `[:text_prompts, :load, :stop]` — `%{duration: integer}`,
      metadata `%{path:, mode:}`.
    * `[:text_prompts, :load, :exception]` — `%{duration: integer}`,
      metadata `%{path:, mode:, kind:, reason:, stacktrace:}`.
  """

  alias TextPrompts.{Config, Frontmatter, Prompt, PromptMeta}

  alias TextPrompts.Error.{
    FileMissing,
    InvalidMetadata,
    MalformedHeader,
    MissingMetadata
  }

  @required_strict_fields ~w(title description version)

  @doc """
  Load a prompt file. Returns `{:ok, %TextPrompts.Prompt{}}` or
  `{:error, exception}`.

  ## Options

    * `:meta` — explicit metadata mode override (`:strict`, `:allow`,
      `:ignore`, or string equivalents).

  ## Examples

      iex> path = Path.join(System.tmp_dir!(), "tp_loader_doc.md")
      iex> File.write!(path, "Hello world\\n")
      iex> {:ok, prompt} = TextPrompts.Loader.load(path, meta: :ignore)
      iex> File.rm!(path)
      iex> prompt.prompt
      "Hello world\\n"
  """
  @spec load(Path.t(), keyword()) :: {:ok, Prompt.t()} | {:error, Exception.t()}
  def load(path, opts \\ []) do
    opts = Keyword.validate!(opts, meta: nil)
    mode = Config.metadata_mode(meta: opts[:meta])
    start_meta = %{path: path, mode: mode}

    :telemetry.span(
      [:text_prompts, :load],
      start_meta,
      fn ->
        result = do_load(path, mode)
        {result, start_meta}
      end
    )
  end

  @doc """
  Like `load/2` but raises on error.
  """
  @spec load!(Path.t(), keyword()) :: Prompt.t()
  def load!(path, opts \\ []) do
    case load(path, opts) do
      {:ok, prompt} -> prompt
      {:error, error} -> raise error
    end
  end

  # Backwards-compatible names used by the public facade.
  @doc false
  def load_prompt(path, opts \\ []), do: load(path, opts)
  @doc false
  def load_prompt!(path, opts \\ []), do: load!(path, opts)

  # ---------------------------------------------------------------------------
  # Internals
  # ---------------------------------------------------------------------------

  defp do_load(path, mode) do
    with {:ok, content} <- read(path) do
      case mode do
        :ignore -> handle_ignore(path, content)
        :strict -> handle_strict(path, content)
        :allow -> handle_allow(path, content)
      end
    end
  end

  defp handle_ignore(path, content) do
    body =
      case Frontmatter.extract(content) do
        {:ok, %{body: body}} -> body
        # Even a malformed header is stripped naively below (Python parity:
        # the user explicitly asked to ignore metadata).
        {:error, _} -> strip_naive_frontmatter(content)
        :no_frontmatter -> content
      end

    title = Path.basename(path, Path.extname(path))

    {:ok,
     %Prompt{
       path: path,
       prompt: body,
       meta: %PromptMeta{title: title}
     }}
  end

  defp handle_strict(path, content) do
    case Frontmatter.extract(content) do
      :no_frontmatter ->
        {:error, %MissingMetadata{path: path, field: nil}}

      {:ok, %{meta: meta_map, body: body}} ->
        with :ok <- validate_strict(meta_map, path) do
          {:ok, build_prompt(path, body, meta_map)}
        end

      {:error, %MalformedHeader{} = e} ->
        {:error, %{e | path: path}}

      {:error, %InvalidMetadata{} = e} ->
        {:error, %{e | path: path}}
    end
  end

  defp handle_allow(path, content) do
    case Frontmatter.extract(content) do
      :no_frontmatter ->
        {:ok,
         %Prompt{
           path: path,
           prompt: content,
           meta: %PromptMeta{title: Path.basename(path, Path.extname(path))}
         }}

      {:ok, %{meta: meta_map, body: body}} ->
        {:ok, build_prompt(path, body, meta_map)}

      {:error, %MalformedHeader{} = e} ->
        {:error, %{e | path: path}}

      {:error, %InvalidMetadata{} = e} ->
        {:error, %{e | path: path}}
    end
  end

  defp build_prompt(path, body, meta_map) do
    meta = PromptMeta.from_map(meta_map)

    meta =
      if meta.title in [nil, ""] do
        %{meta | title: Path.basename(path, Path.extname(path))}
      else
        meta
      end

    %Prompt{path: path, prompt: body, meta: meta}
  end

  defp validate_strict(meta_map, path) do
    normalized =
      for {k, v} <- meta_map, into: %{}, do: {to_string(k), v}

    missing =
      for f <- @required_strict_fields,
          empty_value?(Map.get(normalized, f)),
          do: f

    case missing do
      [] ->
        :ok

      [field | _] ->
        {:error,
         %InvalidMetadata{
           path: path,
           field: field,
           reason:
             "missing or empty required field(s): #{Enum.join(missing, ", ")}. " <>
               "Strict mode requires non-empty 'title', 'description', and 'version'."
         }}
    end
  end

  defp empty_value?(nil), do: true
  defp empty_value?(""), do: true

  defp empty_value?(value) when is_binary(value) do
    String.trim(value) == ""
  end

  defp empty_value?(_), do: false

  # Best-effort strip of a leading `---…---` block when the user asked for
  # `:ignore` mode and the header is malformed. We mirror Python's behavior
  # of "if it looks like frontmatter, drop it from the body" without raising.
  defp strip_naive_frontmatter("---" <> _ = text) do
    case :binary.match(text, "\n---") do
      {idx, _} ->
        rest = binary_part(text, idx + 4, byte_size(text) - (idx + 4))

        case rest do
          "\n" <> body -> body
          "" -> ""
          other -> other
        end

      :nomatch ->
        text
    end
  end

  defp strip_naive_frontmatter(text), do: text

  defp read(path) do
    case File.read(path) do
      {:ok, content} ->
        {:ok, content}

      {:error, :enoent} ->
        {:error, %FileMissing{path: path}}

      {:error, reason} ->
        {:error, %TextPrompts.Error.IO{action: "read", path: path, reason: reason}}
    end
  end
end
