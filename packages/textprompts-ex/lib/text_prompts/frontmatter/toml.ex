defmodule TextPrompts.Frontmatter.Toml do
  @behaviour TextPrompts.Frontmatter.Parser

  @impl true
  def detect?(text), do: String.contains?(text, "=")

  @impl true
  def parse(text) do
    text
    |> String.split("\n", trim: true)
    |> Enum.reduce_while({:ok, %{}}, fn line, {:ok, acc} ->
      case String.split(line, "=", parts: 2) do
        [key, value] ->
          clean =
            value |> String.trim() |> String.trim_leading("\"") |> String.trim_trailing("\"")

          {:cont, {:ok, Map.put(acc, String.trim(key), clean)}}

        _ ->
          {:halt, {:error, ArgumentError.exception("invalid TOML frontmatter")}}
      end
    end)
  end
end
