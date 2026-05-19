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
