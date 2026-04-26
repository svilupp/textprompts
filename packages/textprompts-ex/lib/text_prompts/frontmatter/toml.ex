defmodule TextPrompts.Frontmatter.Toml do
  @moduledoc """
  TOML frontmatter parser backed by `:toml_elixir`.

  Returns `{:ok, map}` with string keys, leaving callers (e.g.
  `TextPrompts.PromptMeta`) responsible for promoting known fields to atoms.
  Parser errors are wrapped in `TextPrompts.Error.InvalidMetadata`.
  """

  @behaviour TextPrompts.Frontmatter.Parser

  alias TextPrompts.Error.InvalidMetadata

  @impl true
  def format, do: :toml

  @impl true
  def detect?(text) when is_binary(text), do: String.contains?(text, "=")

  @impl true
  @spec parse(String.t()) :: {:ok, map()} | {:error, Exception.t()}
  def parse(text) when is_binary(text) do
    # `:toml_elixir` is sensitive to a trailing newline at the end of the
    # input, so normalize before delegating.
    normalized = if String.ends_with?(text, "\n"), do: text, else: text <> "\n"

    case TomlElixir.parse(normalized) do
      {:ok, map} when is_map(map) ->
        {:ok, stringify_keys(map)}

      {:error, err} ->
        {:error, %InvalidMetadata{reason: safe_message(err)}}
    end
  rescue
    err ->
      {:error, %InvalidMetadata{reason: safe_message(err)}}
  end

  defp safe_message(err) do
    Exception.message(err)
  rescue
    _ -> inspect(err)
  end

  defp stringify_keys(map) when is_map(map) do
    for {k, v} <- map, into: %{}, do: {to_string(k), stringify_keys(v)}
  end

  defp stringify_keys(list) when is_list(list), do: Enum.map(list, &stringify_keys/1)
  defp stringify_keys(other), do: other
end
