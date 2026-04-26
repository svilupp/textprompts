defmodule TextPrompts.Sections do
  @moduledoc false

  alias TextPrompts.Sections.ParseResult

  @heading_re ~r/^(#+)\s+(.+)$/u

  @spec parse_sections(String.t()) :: ParseResult.t()
  def parse_sections(text) do
    headings =
      text
      |> String.split("\n")
      |> Enum.flat_map(fn line ->
        case Regex.run(@heading_re, line) do
          [_, hashes, title] ->
            [
              %{
                level: String.length(hashes),
                title: String.trim(title),
                slug: generate_slug(title)
              }
            ]

          _ ->
            []
        end
      end)

    %ParseResult{headings: headings}
  end

  @spec generate_slug(String.t()) :: String.t()
  def generate_slug(text) do
    text
    |> String.downcase()
    |> String.replace(~r/[^\p{L}\p{N}\s-]/u, "")
    |> String.trim()
    |> String.replace(~r/\s+/u, "-")
  end

  @spec normalize_anchor_id(String.t()) :: String.t()
  def normalize_anchor_id(text), do: generate_slug(text)

  @spec get_section_text(String.t(), String.t()) :: {String.t() | nil, boolean()}
  def get_section_text(text, anchor) do
    normalized_anchor = normalize_anchor_id(anchor)
    lines = String.split(text, "\n")

    with {start_idx, level} <- find_start(lines, normalized_anchor),
         {section_lines, found} <- collect_until_next_heading(lines, start_idx, level) do
      {Enum.join(section_lines, "\n"), found}
    else
      nil -> {nil, false}
    end
  end

  defp find_start(lines, anchor) do
    lines
    |> Enum.with_index()
    |> Enum.find_value(fn {line, idx} ->
      case Regex.run(@heading_re, line) do
        [_, hashes, title] ->
          if generate_slug(title) == anchor, do: {idx, String.length(hashes)}, else: nil

        _ ->
          nil
      end
    end)
  end

  defp collect_until_next_heading(lines, start_idx, level) do
    slice = Enum.drop(lines, start_idx)

    kept =
      Enum.take_while(Enum.with_index(slice), fn {line, idx} ->
        if idx == 0 do
          true
        else
          case Regex.run(@heading_re, line) do
            [_, hashes, _] -> String.length(hashes) > level
            _ -> true
          end
        end
      end)
      |> Enum.map(&elem(&1, 0))

    {kept, true}
  end
end
