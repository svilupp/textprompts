defmodule TextPrompts.Frontmatter.Yaml do
  @behaviour TextPrompts.Frontmatter.Parser

  @impl true
  def detect?(text), do: String.contains?(text, ":")

  @impl true
  def parse(text) do
    text
    |> String.split("\n", trim: true)
    |> Enum.reduce_while({:ok, %{}}, fn line, {:ok, acc} ->
      case String.split(line, ":", parts: 2) do
        [key, value] ->
          {:cont, {:ok, Map.put(acc, String.trim(key), String.trim(value))}}

        _ ->
          {:halt, {:error, ArgumentError.exception("invalid YAML frontmatter")}}
      end
    end)
  end
end
