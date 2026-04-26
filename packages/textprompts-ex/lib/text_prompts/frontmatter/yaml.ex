defmodule TextPrompts.Frontmatter.Yaml do
  @moduledoc """
  YAML frontmatter parser backed by `:yaml_elixir`.

  Returns `{:ok, map}` with string keys; date values are normalized to ISO
  date strings to match the Python reference (`PromptMeta` will coerce them
  back to `Date.t()` when appropriate). Parse errors are wrapped in
  `TextPrompts.Error.InvalidMetadata`.
  """

  @behaviour TextPrompts.Frontmatter.Parser

  alias TextPrompts.Error.InvalidMetadata

  @impl true
  def format, do: :yaml

  @impl true
  def detect?(text) when is_binary(text), do: String.contains?(text, ":")

  @impl true
  @spec parse(String.t()) :: {:ok, map()} | {:error, Exception.t()}
  def parse(text) when is_binary(text) do
    case YamlElixir.read_from_string(text) do
      {:ok, nil} ->
        {:ok, %{}}

      {:ok, map} when is_map(map) ->
        {:ok, normalize(map)}

      {:ok, other} ->
        {:error,
         %InvalidMetadata{
           reason: "YAML frontmatter must decode to a mapping, got: #{inspect(other)}"
         }}

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

  defp normalize(map) when is_map(map) do
    for {k, v} <- map, into: %{}, do: {to_string(k), normalize_value(v)}
  end

  defp normalize_value(%Date{} = d), do: Date.to_iso8601(d)

  defp normalize_value(%DateTime{} = dt), do: DateTime.to_iso8601(dt)

  defp normalize_value(%NaiveDateTime{} = ndt), do: NaiveDateTime.to_iso8601(ndt)

  defp normalize_value(map) when is_map(map), do: normalize(map)

  defp normalize_value(list) when is_list(list), do: Enum.map(list, &normalize_value/1)

  defp normalize_value(other), do: other
end
