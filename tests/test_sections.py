import json
from pathlib import Path
from typing import Any

import pytest

from textprompts.sections import (
    ParseResult,
    generate_slug,
    inject_anchors,
    parse_sections,
    render_toc,
)


def _shared_cases() -> list[dict[str, Any]]:
    fixture_path = Path(__file__).resolve().parents[1] / "testdata" / "sections" / "cases.json"
    return json.loads(fixture_path.read_text(encoding="utf-8"))


def _normalize_result(result: ParseResult) -> dict[str, Any]:
    return {
        "sections": [
            {
                "kind": section.kind,
                "tagName": section.tag_name,
                "heading": section.heading,
                "anchorId": section.anchor_id,
                "level": section.level,
                "startLine": section.start_line,
                "endLine": section.end_line,
                "parentIdx": section.parent_idx,
                "children": list(section.children),
                "charCount": section.char_count,
                "links": [
                    {
                        "target": link.target,
                        "fragment": link.fragment,
                        "label": link.label,
                        "line": link.line,
                    }
                    for link in section.links
                ],
            }
            for section in result.sections
        ],
        "anchors": dict(result.anchors),
        "duplicateAnchors": dict(result.duplicate_anchors),
        "frontmatter": None
        if result.frontmatter is None
        else {
            "raw": result.frontmatter.raw,
            "format": result.frontmatter.format,
            "startLine": result.frontmatter.start_line,
            "endLine": result.frontmatter.end_line,
            "title": result.frontmatter.title,
        },
        "totalChars": result.total_chars,
    }


def _assert_parser_invariants(result: ParseResult) -> None:
    for idx, section in enumerate(result.sections):
        assert section.start_line > 0
        assert section.end_line >= section.start_line

        if idx > 0:
            prev = result.sections[idx - 1]
            assert section.start_line >= prev.start_line
            if section.start_line == prev.start_line:
                assert section.end_line <= prev.end_line

        if section.parent_idx >= 0:
            assert section.parent_idx < idx
            parent = result.sections[section.parent_idx]
            assert parent.start_line <= section.start_line
            assert parent.end_line >= section.end_line

        for child_idx in section.children:
            assert idx < child_idx < len(result.sections)
            assert result.sections[child_idx].parent_idx == idx

        if section.anchor_id:
            assert section.anchor_id in result.anchors
            first_idx = result.anchors[section.anchor_id]
            duplicates = result.duplicate_anchors.get(section.anchor_id)
            if duplicates:
                assert first_idx == duplicates[0]
            else:
                assert first_idx == idx


@pytest.mark.parametrize("case", _shared_cases(), ids=lambda case: case["name"])
def test_parse_sections_matches_shared_corpus(case: dict[str, Any]) -> None:
    result = parse_sections(case["document"])
    _assert_parser_invariants(result)
    assert _normalize_result(result) == case["expected"]


def test_parse_sections_accepts_bytes() -> None:
    doc = "## Unicode\n\nCafé\n"
    assert _normalize_result(parse_sections(doc)) == _normalize_result(
        parse_sections(doc.encode("utf-8"))
    )


def test_generate_slug() -> None:
    cases = [
        ("Hello World", "hello-world"),
        ("GCP Projects", "gcp-projects"),
        ("Memory Architecture Design", "memory-architecture-design"),
        ("**Bold** and *italic*", "bold-and-italic"),
        ("`code` blocks", "code-blocks"),
        ("[Link Text](http://example.com)", "link-text"),
        ("<em>Inline HTML</em>", "inline-html"),
        ("Multiple   Spaces", "multiple-spaces"),
        ("Special!@#$%^&*()chars", "specialchars"),
        ("  Leading/Trailing  ", "leadingtrailing"),
        ("123 Numbers First", "123-numbers-first"),
        ("---dashes---", "dashes"),
        ("", "section"),
    ]
    for raw, expected in cases:
        assert generate_slug(raw) == expected


def test_parse_sections_duplicate_explicit_anchors_are_reported() -> None:
    doc = "<a id=\"dup\"></a>\n## One\n\n<a id='dup'></a>\n## Two"
    result = parse_sections(doc)
    _assert_parser_invariants(result)

    assert len(result.sections) == 2
    assert result.sections[0].anchor_id == "dup"
    assert result.sections[1].anchor_id == "dup"
    assert result.anchors["dup"] == 0
    assert result.duplicate_anchors == {"dup": [0, 1]}


def test_inject_anchors_is_idempotent_and_markdown_only() -> None:
    doc = (
        "<instructions>\n"
        "Body.\n"
        "</instructions>\n\n"
        "## First Section\n\n"
        "Content.\n\n"
        "## Existing {#custom-id}\n\n"
        "More."
    )

    output, result = inject_anchors(doc)
    _assert_parser_invariants(result)

    assert '<a id="first-section"></a>' in output
    assert '<a id="instructions"></a>' not in output
    assert output.count('<a id="first-section"></a>') == 1

    output2, result2 = inject_anchors(output)
    _assert_parser_invariants(result2)
    assert output2 == output


def test_render_toc_uses_hierarchy_depth_for_mixed_sections() -> None:
    doc = "<instructions>\n# Root\n## Child\n</instructions>"
    result = parse_sections(doc)
    _assert_parser_invariants(result)

    toc = render_toc(result, "prompt.xml")
    assert "prompt.xml" in toc
    assert "<instructions> Instructions [#instructions]" in toc
    assert "  # Root [#root]" in toc
    assert "    ## Child [#child]" in toc


def test_parse_sections_adversarial_corpus() -> None:
    cases = [
        {
            "doc": (
                "<a id=\"explicit-one\"></a>\n"
                "## First\n\n"
                "## Second {#attr-two}\n\n"
                "<!-- @id:comment-three -->\n"
                "## Third\n\n"
                "## Fourth"
            ),
            "anchors": ["explicit-one", "attr-two", "comment-three", "fourth"],
            "kinds": ["markdown", "markdown", "markdown", "markdown"],
        },
        {
            "doc": "<example>Body.</example>\n\n## Markdown",
            "anchors": ["example", "markdown"],
            "kinds": ["xml", "markdown"],
        },
        {
            "doc": (
                "<prompt>\n"
                "## Overview\n"
                "<examples id=\"worked-examples\">\n"
                "Example.\n"
                "</examples>\n"
                "</prompt>"
            ),
            "anchors": ["prompt", "overview", "worked-examples"],
            "kinds": ["xml", "markdown", "xml"],
        },
    ]

    for case in cases:
        result = parse_sections(case["doc"])
        _assert_parser_invariants(result)
        assert [section.anchor_id for section in result.sections] == case["anchors"]
        assert [section.kind for section in result.sections] == case["kinds"]


def test_parse_sections_counts_utf8_bytes() -> None:
    result = parse_sections("## Unicode\n\nCafé\n")
    _assert_parser_invariants(result)

    assert result.total_chars == 18
    assert len(result.sections) == 1
    assert result.sections[0].char_count == 7


def test_parse_sections_extracts_links_and_lines() -> None:
    doc = (
        "## Links\n\n"
        "See [Docs](https://example.com/path#frag) and [Local](#local).\n\n"
        "### Local\n\n"
        "Done.\n"
    )
    result = parse_sections(doc)
    _assert_parser_invariants(result)

    assert result.total_chars == 91
    assert [link.line for link in result.sections[0].links] == [3, 3]
    assert [link.label for link in result.sections[0].links] == ["Docs", "Local"]
    assert [link.target for link in result.sections[0].links] == [
        "https://example.com/path#frag",
        "#local",
    ]
    assert [link.fragment for link in result.sections[0].links] == ["frag", "local"]
