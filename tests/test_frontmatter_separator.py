"""Tests for SPEC §4.1 frontmatter-separator handling.

After the closing ``---`` line we consume the line terminator plus AT MOST
one blank-separator line. Additional blank lines belong to the body and must
be preserved byte-for-byte.
"""

from __future__ import annotations

import pytest

from textprompts.models import Prompt

# Minimal valid TOML frontmatter (no required fields for ALLOW mode).
_META = 'title = "T"'


def _make(blank_lines: int, body: str = "Body") -> str:
    """Build a prompt source with ``blank_lines`` blank lines between the
    closing ``---`` and the body's first character."""
    return f"---\n{_META}\n---\n" + ("\n" * blank_lines) + body


@pytest.mark.parametrize(
    "blank_lines,expected_body",
    [
        (0, "Body"),
        (1, "Body"),
        (2, "\nBody"),
        (3, "\n\nBody"),
    ],
)
def test_separator_spacing_preserves_extra_blanks(
    blank_lines: int, expected_body: str
) -> None:
    """The first blank-separator line is consumed; the rest are body."""
    src = _make(blank_lines)
    prompt = Prompt.from_string(src, metadata="allow")
    assert str(prompt.prompt) == expected_body


@pytest.mark.parametrize(
    "blank_lines,expected_rendered",
    [
        (0, "Hello, X"),
        (1, "Hello, X"),
        (2, "\nHello, X"),
        (3, "\n\nHello, X"),
    ],
)
def test_separator_spacing_format_byte_exact(
    blank_lines: int, expected_rendered: str
) -> None:
    """``format()`` output must match the preserved body byte-for-byte."""
    src = _make(blank_lines, body="Hello, {name}")
    prompt = Prompt.from_string(src, metadata="allow")
    assert prompt.format(name="X") == expected_rendered


def test_separator_no_blank_no_trailing_newline_eaten() -> None:
    """A body that begins immediately after ``---\\n`` keeps its first
    character intact (no off-by-one consuming into ``Body``)."""
    prompt = Prompt.from_string("---\n" + _META + "\n---\nBody", metadata="allow")
    assert str(prompt.prompt) == "Body"


def test_separator_two_blank_preserves_one() -> None:
    """Two blank lines after ``---``: one is the separator, one is body."""
    prompt = Prompt.from_string("---\n" + _META + "\n---\n\n\nBody", metadata="allow")
    assert str(prompt.prompt) == "\nBody"


def test_frontmatter_delimiter_must_be_line() -> None:
    """A leading ``---`` substring is body text unless it is a delimiter line."""
    prompt = Prompt.from_string("---not frontmatter\nBody", metadata="allow")
    assert str(prompt.prompt) == "---not frontmatter\nBody"


def test_frontmatter_delimiter_inside_header_value_is_not_closing() -> None:
    prompt = Prompt.from_string(
        '---\ntitle = "a---b"\n---\nBody',
        metadata="allow",
    )

    assert prompt.meta is not None
    assert prompt.meta.title == "a---b"
    assert str(prompt.prompt) == "Body"
