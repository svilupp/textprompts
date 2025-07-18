import re
from pathlib import Path

import pytest

from textprompts.errors import (
    FileMissingError,
    InvalidMetadataError,
    MissingMetadataError,
)
from textprompts.loaders import load_prompt, load_prompts
from textprompts.models import Prompt, PromptMeta


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


def test_load_prompts_directory_processing(tmp_path: Path) -> None:
    """Test load_prompts processes directories correctly."""
    # Create test files
    (tmp_path / "test1.txt").write_text("---\ntitle = 'Test 1'\n---\nContent 1")
    (tmp_path / "test2.txt").write_text("---\ntitle = 'Test 2'\n---\nContent 2")
    (tmp_path / "other.md").write_text("Markdown content")  # Should be ignored

    # Test with default glob pattern
    prompts = load_prompts(tmp_path, meta="allow")
    assert len(prompts) == 2
    assert all(isinstance(p, Prompt) for p in prompts)

    # Test with custom glob pattern
    prompts = load_prompts(tmp_path, glob="*.md", meta="ignore")
    assert len(prompts) == 1
    assert prompts[0].meta is not None
    assert prompts[0].meta.title == "other"


def test_load_prompts_recursive_processing(tmp_path: Path) -> None:
    """Test load_prompts with recursive directory processing."""
    # Create nested directory structure
    subdir = tmp_path / "subdir"
    subdir.mkdir()

    (tmp_path / "root.txt").write_text("Root content")
    (subdir / "nested.txt").write_text("Nested content")

    # Test without recursive
    prompts = load_prompts(tmp_path, recursive=False, meta="ignore")
    assert len(prompts) == 1
    # Add null checks for all prompts and extract titles
    titles = []
    for p in prompts:
        assert p.meta is not None
        titles.append(p.meta.title)
    assert "root" in titles

    # Test with recursive
    prompts = load_prompts(tmp_path, recursive=True, meta="ignore")
    assert len(prompts) == 2
    # Add null checks for all prompts and extract titles
    titles = []
    for p in prompts:
        assert p.meta is not None
        titles.append(p.meta.title)
    assert "root" in titles
    assert "nested" in titles


def test_load_prompts_mixed_files_and_directories(tmp_path: Path) -> None:
    """Test load_prompts with mixed file and directory arguments."""
    # Create files and directories
    file1 = tmp_path / "file1.txt"
    file1.write_text("File 1 content")

    subdir = tmp_path / "subdir"
    subdir.mkdir()
    (subdir / "file2.txt").write_text("File 2 content")

    # Load both file and directory
    prompts = load_prompts(file1, subdir, meta="ignore")
    assert len(prompts) == 2
    # Add null checks for all prompts and extract titles
    titles = []
    for p in prompts:
        assert p.meta is not None
        titles.append(p.meta.title)
    assert "file1" in titles
    assert "file2" in titles


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


def test_body_property_deprecated(tmp_path: Path) -> None:
    test_file = tmp_path / "deprecated.txt"
    test_file.write_text("Hello")
    prompt = load_prompt(test_file, meta="ignore")
    with pytest.deprecated_call():
        _ = prompt.body


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
