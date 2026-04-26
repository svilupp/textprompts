defmodule TextPrompts.Sections.CasesParityTest do
  @moduledoc """
  Fixture-driven parity test against `testdata/sections/cases.json`.

  Every case in the shared fixture set must produce a `ParseResult` whose
  serialised camelCase representation matches the expected JSON exactly.
  Any divergence is a parser bug — never adjust the fixtures.
  """

  use ExUnit.Case, async: true

  alias TextPrompts.Sections

  @moduletag :parity

  @cases_path Path.expand(
                "../../../../testdata/sections/cases.json",
                __DIR__
              )

  @cases @cases_path
         |> File.read!()
         |> Jason.decode!()

  defp to_camel_section(section) do
    %{
      "kind" => section.kind,
      "tagName" => section.tag_name,
      "heading" => section.heading,
      "anchorId" => section.anchor_id,
      "level" => section.level,
      "startLine" => section.start_line,
      "endLine" => section.end_line,
      "parentIdx" => section.parent_idx,
      "children" => section.children,
      "charCount" => section.char_count,
      "links" => Enum.map(section.links, &to_camel_link/1)
    }
  end

  defp to_camel_link(link) do
    %{
      "target" => link.target,
      "fragment" => link.fragment,
      "label" => link.label,
      "line" => link.line
    }
  end

  defp to_camel_frontmatter(nil), do: nil

  defp to_camel_frontmatter(fm) do
    %{
      "raw" => fm.raw,
      "format" => fm.format,
      "startLine" => fm.start_line,
      "endLine" => fm.end_line,
      "title" => fm.title
    }
  end

  defp to_camel_result(result) do
    %{
      "sections" => Enum.map(result.sections, &to_camel_section/1),
      "anchors" => result.anchors,
      "duplicateAnchors" => result.duplicate_anchors,
      "frontmatter" => to_camel_frontmatter(result.frontmatter),
      "totalChars" => result.total_chars
    }
  end

  for {case_data, idx} <- Enum.with_index(@cases) do
    name = case_data["name"]
    document = case_data["document"]
    expected = case_data["expected"]

    test "fixture: #{name} (idx #{idx})" do
      result = Sections.parse_sections(unquote(document))
      actual = to_camel_result(result)

      expected = unquote(Macro.escape(expected))
      assert actual == expected
    end
  end
end
