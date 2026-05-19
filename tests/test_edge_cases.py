from pathlib import Path

import pytest

from textprompts._parser import _split_front_matter, parse_file
from textprompts.config import MetadataMode
from textprompts.errors import InvalidMetadataError, TextPromptsError
from textprompts.loaders import load_prompt


def test_empty_file(fixtures: Path) -> None:
    """Test loading an empty file should fail due to empty body validation."""
    from textprompts.errors import ParseError

    with pytest.raises((ParseError, ValueError), match="empty"):
        load_prompt(fixtures / "empty.txt", meta="ignore")


def test_whitespace_only_file(fixtures: Path) -> None:
    """Test loading a file with only whitespace should fail."""
    from textprompts.errors import ParseError

    with pytest.raises((ParseError, ValueError), match="empty"):
        load_prompt(fixtures / "whitespace_only.txt", meta="ignore")


def test_triple_dash_in_body(fixtures: Path) -> None:
    """Test that triple dashes in body content are preserved."""
    prompt = load_prompt(fixtures / "triple_dash_body.txt", meta="allow")
    assert "---" in prompt.prompt
    assert "triple dashes in the body" in prompt.prompt
    assert "more dashes" in prompt.prompt


def test_header_only_file(fixtures: Path) -> None:
    """Test file with header but no body content should fail."""
    from textprompts.errors import ParseError

    with pytest.raises((ParseError, ValueError), match="empty"):
        load_prompt(fixtures / "header_only.txt", meta="allow")


def test_cli_error_handling_missing_file(tmp_path: Path) -> None:
    """Test CLI error handling for missing files."""
    import sys
    from io import StringIO

    from textprompts.cli import main

    # Mock sys.argv and stderr
    old_argv = sys.argv
    old_stderr = sys.stderr

    try:
        sys.argv = ["textprompts", str(tmp_path / "nonexistent.txt")]
        sys.stderr = StringIO()

        with pytest.raises(SystemExit) as exc_info:
            main()

        assert exc_info.value.code == 1
        assert "Error:" in sys.stderr.getvalue()
    finally:
        sys.argv = old_argv
        sys.stderr = old_stderr


def test_split_front_matter_edge_cases() -> None:
    """Test edge cases in _split_front_matter function."""
    from textprompts.errors import MalformedHeaderError

    # Test text starting with --- but no closing delimiter
    text_no_close = "---\ntitle = 'test'\nno closing delimiter"
    with pytest.raises(MalformedHeaderError):
        _split_front_matter(text_no_close)

    # Test text with --- in middle (should not be treated as front matter)
    text_middle = "Some content\n---\ntitle = 'test'\n---\nMore content"
    header, body = _split_front_matter(text_middle)
    assert header is None
    assert body == text_middle

    # Test text with leading whitespace before ---
    text_leading_space = "  ---\ntitle = 'test'\n---\nContent"
    header, body = _split_front_matter(text_leading_space)
    assert header is None
    assert body == text_leading_space


def test_parse_file_unicode_decode_error(tmp_path: Path) -> None:
    """Test parse_file handles unicode decode errors."""
    # Create a file with invalid UTF-8 bytes
    test_file = tmp_path / "invalid_utf8.txt"
    test_file.write_bytes(b"\x80\x81\x82\x83")  # Invalid UTF-8 sequence

    with pytest.raises(TextPromptsError, match="Cannot decode .* as UTF-8"):
        parse_file(test_file, metadata_mode=MetadataMode.IGNORE)


def test_parse_file_malformed_header_with_dashes(tmp_path: Path) -> None:
    """Test parse_file provides helpful error for malformed headers starting with dashes."""
    test_file = tmp_path / "malformed.txt"
    test_file.write_text("---\ninvalid toml [[\n\nContent")  # Missing closing ---

    with pytest.raises(
        InvalidMetadataError, match="If this file has no metadata and starts with '---'"
    ):
        parse_file(test_file, metadata_mode=MetadataMode.ALLOW)
