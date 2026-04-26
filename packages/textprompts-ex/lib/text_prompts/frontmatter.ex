defmodule TextPrompts.Frontmatter do
  @moduledoc """
  Frontmatter detection and parsing for prompt files.

  The format mirrors the Python reference (`src/textprompts/_parser.py`):

    * The opening delimiter must be the literal `---` at the very start of
      the file (optionally followed by trailing whitespace before the newline).
    * The closing delimiter is the next line containing only `---`.
    * The header body between the two delimiters is parsed first as TOML and,
      on parse failure, as YAML — matching Python's parse-then-fallback
      strategy.
    * The `+++` delimiter used by some other tools is intentionally rejected;
      such files are treated as having no frontmatter.

  ## Public surface

    * `extract/1` — full inspection: returns the parsed metadata map, the
      remaining body, the resolved format, and the line range covered by the
      header.
    * `split/1` — backward-compatible helper for callers that only need the
      `{meta_map, body}` tuple. Errors are not raised; on malformed/invalid
      input the caller receives `{%{}, original_content}`.
  """

  alias TextPrompts.Error.{InvalidMetadata, MalformedHeader}
  alias TextPrompts.Frontmatter.{Toml, Yaml}

  @delim "---"
  @reject_delim "+++"

  @type extract_ok :: %{
          meta: map(),
          body: String.t(),
          format: :toml | :yaml,
          raw: String.t(),
          start_line: pos_integer(),
          end_line: pos_integer()
        }

  @doc """
  Inspect the leading frontmatter block of `content`.

  Returns one of:

    * `{:ok, %{meta:, body:, format:, raw:, start_line:, end_line:}}` —
      a well-formed header and its parsed map.
    * `:no_frontmatter` — the content does not start with a `---` delimiter.
    * `{:error, %TextPrompts.Error.MalformedHeader{}}` — opening delimiter
      present but no matching closing delimiter, or other structural problem.
    * `{:error, %TextPrompts.Error.InvalidMetadata{}}` — header was found and
      structurally valid, but neither TOML nor YAML accepted its body.

  ## Examples

      iex> {:ok, %{meta: meta, format: format}} =
      ...>   TextPrompts.Frontmatter.extract("---\\ntitle = \\"Hi\\"\\n---\\nbody\\n")
      iex> {meta["title"], format}
      {"Hi", :toml}

      iex> TextPrompts.Frontmatter.extract("no header here\\n")
      :no_frontmatter
  """
  @spec extract(String.t()) ::
          {:ok, extract_ok()} | {:error, Exception.t()} | :no_frontmatter
  def extract(content) when is_binary(content) do
    cond do
      String.starts_with?(content, @delim) ->
        do_extract(content)

      String.starts_with?(content, @reject_delim) ->
        # Mirror the Python reference: only `---` is recognized.
        :no_frontmatter

      true ->
        :no_frontmatter
    end
  end

  @doc """
  Backward-compatible helper used by the loader. Returns
  `{meta_map, body}`. On any malformed/invalid header, the original content
  is returned with an empty metadata map.
  """
  @spec split(String.t()) :: {map(), String.t()}
  def split(content) when is_binary(content) do
    case extract(content) do
      {:ok, %{meta: meta, body: body}} -> {meta, body}
      :no_frontmatter -> {%{}, content}
      {:error, _} -> {%{}, content}
    end
  end

  # ---------------------------------------------------------------------------
  # Internals
  # ---------------------------------------------------------------------------

  defp do_extract(content) do
    case open_delim(content) do
      {:ok, opener_consumed, rest_after_opener} ->
        case find_close(rest_after_opener) do
          {:ok, header_text, body, header_lines, closer_lines} ->
            case parse_header(header_text) do
              {:ok, format, meta} ->
                start_line = 1
                # opener (1 line) + header lines (consumed inside) + closing (closer_lines)
                end_line =
                  start_line + opener_lines(opener_consumed) + header_lines + closer_lines - 1

                {:ok,
                 %{
                   meta: meta,
                   body: body,
                   format: format,
                   raw: header_text,
                   start_line: start_line,
                   end_line: end_line
                 }}

              {:error, exception} ->
                {:error, exception}
            end

          {:error, exception} ->
            {:error, exception}
        end

      :no_open ->
        :no_frontmatter
    end
  end

  # Recognize the opening `---` delimiter. The first line must be exactly
  # `---` followed by optional trailing whitespace and a newline (or EOF).
  defp open_delim(content) do
    {first_line, rest} = take_line(content)

    if delim_line?(first_line) do
      {:ok, first_line, rest}
    else
      :no_open
    end
  end

  defp opener_lines(_opener), do: 1

  # Walk lines until we find a `---` close delimiter. Returns:
  # {:ok, header_text, body, header_line_count, closer_line_count}
  # where header_text is the joined content between the delimiters
  # (no trailing newline) and body is what remains after the closing
  # delimiter (with one leading `\n` stripped, like Python).
  defp find_close(rest) do
    do_find_close(rest, [], 0)
  end

  defp do_find_close("", _acc, _count) do
    {:error,
     %MalformedHeader{
       reason: "missing closing delimiter `---` for frontmatter header"
     }}
  end

  defp do_find_close(text, acc, count) do
    {line, rest} = take_line(text)

    if delim_line?(line) do
      header_text = acc |> Enum.reverse() |> Enum.join("\n")
      body = lstrip_newline(rest)
      {:ok, header_text, body, count, 1}
    else
      do_find_close(rest, [line | acc], count + 1)
    end
  end

  # Pull a single line off `text`, dropping the trailing newline. Returns
  # {line_without_newline, remainder_after_newline}. If there is no
  # newline the remainder is "" and the whole input is the line.
  defp take_line(text) do
    case :binary.split(text, "\n") do
      [line, rest] -> {line, rest}
      [line] -> {line, ""}
    end
  end

  defp lstrip_newline("\n" <> rest), do: rest
  defp lstrip_newline(other), do: other

  # A delimiter line is exactly the literal `---` followed only by optional
  # whitespace. (Python uses `text.startswith("---")` for the opener and
  # locates the closer via `text.find("---", len(DELIM))`; we are slightly
  # stricter on the closer line to keep things deterministic, while still
  # accepting trailing whitespace before the newline.)
  defp delim_line?(line) do
    case line do
      @delim -> true
      @delim <> rest -> only_whitespace?(rest)
      _ -> false
    end
  end

  defp only_whitespace?(""), do: true
  defp only_whitespace?(<<c, rest::binary>>) when c in [?\s, ?\t, ?\r], do: only_whitespace?(rest)
  defp only_whitespace?(_), do: false

  # Try TOML first, fall back to YAML. Mirrors Python `_parser.py` lines
  # 115-135. If both parsers fail, surface a single InvalidMetadata that
  # quotes the TOML error and hints at YAML.
  defp parse_header(""), do: {:ok, :toml, %{}}

  defp parse_header(text) do
    case Toml.parse(text) do
      {:ok, map} ->
        {:ok, :toml, map}

      {:error, %InvalidMetadata{reason: toml_reason}} ->
        case Yaml.parse(text) do
          {:ok, map} ->
            {:ok, :yaml, map}

          {:error, %InvalidMetadata{}} ->
            {:error,
             %InvalidMetadata{
               reason:
                 "Invalid TOML in frontmatter: #{toml_reason}. " <>
                   "YAML fallback also failed. " <>
                   "Use `meta: :ignore` to skip metadata parsing."
             }}
        end
    end
  end
end
