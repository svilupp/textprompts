defmodule TextPrompts.Frontmatter do
  @moduledoc false

  alias TextPrompts.{Frontmatter.Toml, Frontmatter.Yaml}

  @parsers [Toml, Yaml]

  @spec split(String.t()) :: {map(), String.t()}
  def split(content) do
    case String.split(content, "---\n", parts: 3) do
      ["", meta, body] ->
        case parse_meta(meta) do
          {:ok, map} -> {map, String.trim_leading(body, "\n")}
          {:error, _} -> {%{}, content}
        end

      _ ->
        {%{}, content}
    end
  end

  defp parse_meta(raw) do
    parser = Enum.find(@parsers, Yaml, & &1.detect?(raw))
    parser.parse(raw)
  end
end
