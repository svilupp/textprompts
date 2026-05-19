import re
from pathlib import Path

import pytest

from textprompts.errors import (
    FileMissingError,
    InvalidMetadataError,
    MissingMetadataError,
)
from textprompts.loaders import load_prompt
from textprompts.models import PromptMeta


def test_good_prompt(fixtures: Path) -> None:
    prompt = load_prompt(fixtures / "good.txt", meta="allow")
    assert prompt.meta is not None
    assert prompt.meta.title == "Example"
    assert re.search(r"Hello, \{name}", prompt.prompt)


def test_no_meta_strict(fixtures: Path) -> None:
    with pytest.raises(MissingMetadataError):
        load_prompt(fixtures / "no_meta.txt", meta="strict")


def test_no_meta_relaxed(fixtures: Path) -> None:
    prompt = load_prompt(fixtures / "no_meta.txt", meta="ignore")
    assert prompt.meta is not None
    assert prompt.meta.title == "no_meta"  # Uses filename as title


@pytest.mark.parametrize("file", ["bad_meta.txt", "missing_fields.txt"])
def test_invalid_meta(fixtures: Path, file: str) -> None:
    with pytest.raises(InvalidMetadataError):
        load_prompt(fixtures / file, meta="strict")


def test_missing_fields_error_message(fixtures: Path) -> None:
    """Test that missing required fields shows helpful error message"""
    with pytest.raises(InvalidMetadataError) as exc_info:
        load_prompt(fixtures / "missing_fields.txt", meta="strict")
    error_msg = str(exc_info.value)
    assert "Missing required metadata fields" in error_msg
    assert "description" in error_msg
    assert "version" in error_msg
    assert "meta=MetadataMode.ALLOW" in error_msg


def test_starts_with_dash_suggests_ignore_meta(fixtures: Path) -> None:
    """Test that files starting with --- suggest using meta=ignore"""
    with pytest.raises(InvalidMetadataError) as exc_info:
        load_prompt(fixtures / "starts_with_dash.txt", meta="strict")
    error_msg = str(exc_info.value)
    assert "meta=MetadataMode.IGNORE" in error_msg


def test_starts_with_dash_ignore_meta_works(fixtures: Path) -> None:
    """Test that meta=ignore works for files starting with ---"""
    prompt = load_prompt(fixtures / "starts_with_dash.txt", meta="ignore")
    assert prompt.meta is not None
    assert prompt.meta.title == "starts_with_dash"
    assert "---" in prompt.prompt


def test_load_prompt_file_missing(tmp_path: Path) -> None:
    """Test that load_prompt raises FileMissingError for non-existent files."""
    nonexistent_file = tmp_path / "nonexistent.txt"
    with pytest.raises(FileMissingError):
        load_prompt(nonexistent_file)


def test_prompt_model_validation_edge_cases(tmp_path: Path) -> None:
    """Test edge cases for Prompt model validation."""
    # Test with minimal metadata
    test_file = tmp_path / "minimal.txt"
    test_file.write_text("Just content")

    prompt = load_prompt(test_file, meta="ignore")
    assert isinstance(prompt.meta, PromptMeta)
    assert prompt.meta is not None
    assert prompt.meta.title == "minimal"
    assert prompt.meta.version is None
    assert prompt.meta.author is None
    assert prompt.meta.created is None
    assert prompt.meta.description is None

    # Test Prompt repr methods
    assert "minimal" in repr(prompt)
    assert str(prompt) == "Just content"


def test_prompt_has_no_body_alias(tmp_path: Path) -> None:
    test_file = tmp_path / "deprecated.txt"
    test_file.write_text("Hello")
    prompt = load_prompt(test_file, meta="ignore")
    assert not hasattr(prompt, "body")
    with pytest.raises(AttributeError):
        getattr(prompt, "body")


def test_prompt_model_repr_with_version(tmp_path: Path) -> None:
    """Test Prompt repr with version information."""
    test_file = tmp_path / "versioned.txt"
    test_file.write_text("""---
title = "Test Title"
version = "1.0"
---
Content here""")

    prompt = load_prompt(test_file, meta="allow")
    assert prompt.meta is not None
    repr_str = repr(prompt)
    assert "Test Title" in repr_str
    assert "1.0" in repr_str


class TestFrontmatterFormat:
    """Tests for the new ``frontmatter_format`` loader option (PHASE-4 / SPEC §4.1)."""

    def test_toml_format_rejects_yaml_only_header(self, tmp_path: Path) -> None:
        fp = tmp_path / "p.txt"
        fp.write_text("---\ntitle: yaml only\n---\nbody")
        with pytest.raises(InvalidMetadataError, match="Invalid TOML"):
            load_prompt(fp, meta="allow", frontmatter_format="toml")

    def test_yaml_format_accepts_yaml_only_header(self, tmp_path: Path) -> None:
        fp = tmp_path / "p.txt"
        fp.write_text("---\ntitle: yaml only\n---\nbody")
        prompt = load_prompt(fp, meta="allow", frontmatter_format="yaml")
        assert prompt.meta is not None
        assert prompt.meta.title == "yaml only"

    def test_auto_format_tries_both(self, tmp_path: Path) -> None:
        fp = tmp_path / "p.txt"
        fp.write_text("---\ntitle: yaml only\n---\nbody")
        prompt = load_prompt(fp, meta="allow", frontmatter_format="auto")
        assert prompt.meta is not None
        assert prompt.meta.title == "yaml only"

    def test_auto_format_default_behavior_unchanged(self, tmp_path: Path) -> None:
        """No explicit format → "auto" — TOML-first-then-YAML still works."""
        fp = tmp_path / "p.txt"
        fp.write_text('---\ntitle = "toml here"\n---\nbody')
        prompt = load_prompt(fp, meta="allow")
        assert prompt.meta is not None
        assert prompt.meta.title == "toml here"
