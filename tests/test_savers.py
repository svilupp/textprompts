from datetime import date
from pathlib import Path

import pytest

from textprompts.loaders import load_prompt
from textprompts.models import Prompt, PromptMeta
from textprompts import PromptString, PromptString
from textprompts.savers import save_prompt


def test_save_prompt_string(tmp_path: Path) -> None:
    """Test saving a string prompt creates proper template"""
    file_path = tmp_path / "test.txt"
    content = "You are a helpful assistant."

    save_prompt(file_path, content)

    # Read back and verify structure
    saved_content = file_path.read_text()
    assert saved_content.startswith("---")
    assert 'title = ""' in saved_content
    assert 'description = ""' in saved_content
    assert 'version = ""' in saved_content
    assert content in saved_content

    # Verify it can be loaded back
    prompt = load_prompt(file_path)
    assert prompt.meta is not None
    assert prompt.meta.title == "test"  # Uses filename
    assert content in str(prompt.prompt)


def test_save_prompt_object(tmp_path: Path) -> None:
    """Test saving a Prompt object preserves metadata"""
    file_path = tmp_path / "test_prompt.txt"

    meta = PromptMeta(
        title="Test Prompt",
        description="A test prompt",
        version="1.0.0",
        author="Test Author",
        created=date(2023, 1, 1),
    )

    prompt = Prompt(
        path=file_path, meta=meta, prompt=PromptString("You are a helpful assistant.")
    )

    save_prompt(file_path, prompt)

    # Read back and verify
    loaded_prompt = load_prompt(file_path, meta="allow")
    assert loaded_prompt.meta is not None
    assert loaded_prompt.meta.title == "Test Prompt"
    assert loaded_prompt.meta.description == "A test prompt"
    assert loaded_prompt.meta.version == "1.0.0"
    assert loaded_prompt.meta.author == "Test Author"
    assert loaded_prompt.meta.created == date(2023, 1, 1)
    assert "You are a helpful assistant." in str(loaded_prompt.prompt)


def test_save_prompt_object_minimal_meta(tmp_path: Path) -> None:
    """Test saving a Prompt object with minimal metadata"""
    file_path = tmp_path / "minimal.txt"

    meta = PromptMeta(title="Minimal")
    prompt = Prompt(path=file_path, meta=meta, prompt=PromptString("Simple prompt."))

    save_prompt(file_path, prompt)

    # Read back and verify
    loaded_prompt = load_prompt(file_path, meta="allow")
    assert loaded_prompt.meta is not None
    assert loaded_prompt.meta.title == "Minimal"
    assert loaded_prompt.meta.description == ""
    assert loaded_prompt.meta.version == ""


def test_save_prompt_invalid_type(tmp_path: Path) -> None:
    """Test that invalid content type raises TypeError"""
    file_path = tmp_path / "invalid.txt"

    with pytest.raises(TypeError, match="content must be str or Prompt"):
        save_prompt(file_path, 123)  # type: ignore[arg-type]
