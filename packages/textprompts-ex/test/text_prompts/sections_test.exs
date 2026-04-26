defmodule TextPrompts.SectionsTest do
  use ExUnit.Case, async: true

  alias TextPrompts.Sections

  test "parses headings and slugs" do
    text = "# Top\n\n## Child Node\ncontent"
    result = Sections.parse_sections(text)

    assert [%{slug: "top"}, %{slug: "child-node"}] = result.headings
  end

  test "extracts section text for anchor" do
    text = "# Top\nA\n## Child\nB\n# Next\nC"
    assert {section, true} = Sections.get_section_text(text, "top")
    assert section == "# Top\nA\n## Child\nB"
  end
end
