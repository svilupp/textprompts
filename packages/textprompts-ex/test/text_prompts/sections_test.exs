defmodule TextPrompts.SectionsTest do
  use ExUnit.Case, async: true

  alias TextPrompts.Sections
  alias TextPrompts.Sections.{ParseResult, Section}

  describe "parse_sections/1" do
    test "parses a markdown hierarchy into nested sections" do
      text = "# Top\n\n## Child Node\ncontent"
      assert %ParseResult{sections: sections, anchors: anchors} = Sections.parse_sections(text)

      assert [
               %Section{
                 kind: "markdown",
                 heading: "Top",
                 level: 1,
                 anchor_id: "top",
                 parent_idx: -1
               },
               %Section{
                 kind: "markdown",
                 heading: "Child Node",
                 level: 2,
                 anchor_id: "child_node",
                 parent_idx: 0
               }
             ] = sections

      assert anchors == %{"top" => 0, "child_node" => 1}
    end

    test "uses underscore (not hyphen) as the slug separator" do
      assert "section_one" = Sections.generate_slug("Section One")
      assert "child_node" = Sections.generate_slug("Child Node")
      assert "section" = Sections.generate_slug("")
    end

    test "normalises explicit ids by collapsing non-alphanumerics to single underscore" do
      assert "data_flow" = Sections.normalize_anchor_id("data-flow")
      assert "named_anchor" = Sections.normalize_anchor_id("named-anchor")
      assert "custom_id" = Sections.normalize_anchor_id("custom-id")
      assert "section" = Sections.normalize_anchor_id("")
    end

    test "treats content before the first heading as a preamble section" do
      text = "Some content before any heading.\n\nMore preamble.\n\n## First\n\nBody."

      assert %ParseResult{sections: [preamble, heading]} = Sections.parse_sections(text)
      assert preamble.kind == "preamble"
      assert preamble.heading == ""
      assert preamble.anchor_id == ""
      assert preamble.parent_idx == -1
      assert heading.kind == "markdown"
      assert heading.anchor_id == "first"
    end

    test "captures frontmatter span and excludes it from total_chars" do
      text = "---\ntitle: Doc\n---\n\n## Body\n\nHello."

      result = Sections.parse_sections(text)

      assert %ParseResult{frontmatter: fm, sections: [section]} = result
      assert fm.format == "yaml"
      assert fm.title == "Doc"
      assert fm.start_line == 1
      assert fm.end_line == 3
      assert section.kind == "markdown"
      assert section.anchor_id == "body"
    end
  end

  describe "get_section_text/2" do
    test "returns the body of a named markdown section" do
      text = "# Top\nA\n## Child\nB\n## Other\nC"

      assert {"A\n## Child\nB\n## Other\nC", true} = Sections.get_section_text(text, "top")
      assert {"B", true} = Sections.get_section_text(text, "child")
    end

    test "returns {nil, false} when the anchor is unknown" do
      assert {nil, false} = Sections.get_section_text("# A\nbody", "missing")
    end
  end

  describe "render_toc/2" do
    test "produces a table of contents indented by depth" do
      text = "# Top\n\n## Child\n\nbody"
      result = Sections.parse_sections(text)

      toc = Sections.render_toc(result, "doc.md")

      assert String.starts_with?(toc, "doc.md (")
      assert toc =~ "# Top [#top]"
      assert toc =~ "  ## Child [#child]"
    end

    test "returns an empty string when there are no sections" do
      assert "" = Sections.render_toc(%ParseResult{}, "x.md")
    end
  end

  describe "inject_anchors/1" do
    test "adds anchor tags before headings that lack one" do
      text = "## Hello"
      {output, %ParseResult{}} = Sections.inject_anchors(text)
      assert output == ~s(<a id="hello"></a>\n## Hello)
    end

    test "is idempotent when an anchor already precedes the heading" do
      text = ~s(<a id="hello"></a>\n## Hello)
      {output, _} = Sections.inject_anchors(text)
      assert output == text
    end
  end
end
