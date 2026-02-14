"""Tests for YAML front matter support in textprompts."""

from datetime import date
from pathlib import Path

import pytest

from textprompts import (
    PromptString,
    load_prompt,
    save_prompt,
    set_metadata,
)
from textprompts._parser import _normalize_yaml_values, _parse_header
from textprompts.errors import InvalidMetadataError
from textprompts.models import Prompt, PromptMeta


class TestYamlParsing:
    """Test parsing YAML front matter from fixture files."""

    def setup_method(self) -> None:
        set_metadata("ignore")

    def test_yaml_fixture_allow_mode(self, fixtures: Path) -> None:
        """Test loading a YAML fixture with ALLOW mode."""
        prompt = load_prompt(fixtures / "good_yaml.txt", meta="allow")
        assert prompt.meta is not None
        assert prompt.meta.title == "Example YAML"
        assert prompt.meta.version == "1.0.0"
        assert prompt.meta.author == "Test Author"
        assert prompt.meta.description == "A test prompt with YAML front matter"
        assert "{name}" in prompt.prompt

    def test_yaml_fixture_strict_mode(self, fixtures: Path) -> None:
        """Test loading a YAML fixture with STRICT mode."""
        prompt = load_prompt(fixtures / "good_yaml.txt", meta="strict")
        assert prompt.meta is not None
        assert prompt.meta.title == "Example YAML"
        assert prompt.meta.version == "1.0.0"

    def test_yaml_unquoted_strings(self, fixtures: Path) -> None:
        """Test that unquoted YAML strings are parsed correctly."""
        prompt = load_prompt(fixtures / "yaml_unquoted.txt", meta="allow")
        assert prompt.meta is not None
        assert prompt.meta.title == "Example Unquoted"
        assert prompt.meta.version == "2.0.0"
        assert prompt.meta.description == "A prompt with unquoted YAML strings"

    def test_yaml_with_date(self, fixtures: Path) -> None:
        """Test that YAML date values are handled correctly."""
        prompt = load_prompt(fixtures / "yaml_with_date.txt", meta="allow")
        assert prompt.meta is not None
        assert prompt.meta.title == "Date Test"
        assert prompt.meta.created == date(2024, 1, 15)

    def test_yaml_minimal(self, fixtures: Path) -> None:
        """Test loading a YAML fixture with minimal metadata."""
        prompt = load_prompt(fixtures / "yaml_minimal.txt", meta="allow")
        assert prompt.meta is not None
        assert prompt.meta.title == "Minimal YAML"
        assert prompt.meta.description is None
        assert prompt.meta.version is None

    def test_yaml_minimal_strict_mode_fails(self, fixtures: Path) -> None:
        """Test that minimal YAML fails in STRICT mode (missing required fields)."""
        with pytest.raises(InvalidMetadataError, match="Missing required metadata"):
            load_prompt(fixtures / "yaml_minimal.txt", meta="strict")


class TestYamlInlineContent:
    """Test parsing YAML front matter from inline content."""

    def setup_method(self) -> None:
        set_metadata("ignore")

    def test_yaml_basic(self, tmp_path: Path) -> None:
        """Test basic YAML front matter parsing."""
        content = """---
title: My Prompt
description: A test prompt
version: "1.0.0"
---

Hello world!"""
        fp = tmp_path / "test.txt"
        fp.write_text(content)
        prompt = load_prompt(fp, meta="allow")
        assert prompt.meta is not None
        assert prompt.meta.title == "My Prompt"
        assert prompt.meta.description == "A test prompt"
        assert prompt.meta.version == "1.0.0"
        assert "Hello world!" in prompt.prompt

    def test_yaml_with_all_fields(self, tmp_path: Path) -> None:
        """Test YAML front matter with all metadata fields."""
        content = """---
title: Full Prompt
description: All fields present
version: "2.0.0"
author: Jane Doe
created: 2024-06-15
---

Content here."""
        fp = tmp_path / "test.txt"
        fp.write_text(content)
        prompt = load_prompt(fp, meta="strict")
        assert prompt.meta is not None
        assert prompt.meta.title == "Full Prompt"
        assert prompt.meta.description == "All fields present"
        assert prompt.meta.version == "2.0.0"
        assert prompt.meta.author == "Jane Doe"
        assert prompt.meta.created == date(2024, 6, 15)

    def test_yaml_quoted_strings(self, tmp_path: Path) -> None:
        """Test YAML with quoted strings."""
        content = """---
title: "Quoted Title"
description: "Description with: colons and #special chars"
version: "1.0.0"
---

Content."""
        fp = tmp_path / "test.txt"
        fp.write_text(content)
        prompt = load_prompt(fp, meta="allow")
        assert prompt.meta is not None
        assert prompt.meta.title == "Quoted Title"
        assert (
            prompt.meta.description == "Description with: colons and #special chars"
        )

    def test_yaml_boolean_coercion(self, tmp_path: Path) -> None:
        """Test that YAML booleans are coerced to strings in non-date fields."""
        # In YAML, bare 'yes'/'no'/'true'/'false' are booleans
        # Our normalizer should convert them to strings for metadata fields
        content = """---
title: Bool Test
description: Testing boolean handling
version: "1.0.0"
---

Content."""
        fp = tmp_path / "test.txt"
        fp.write_text(content)
        prompt = load_prompt(fp, meta="allow")
        assert prompt.meta is not None
        assert prompt.meta.title == "Bool Test"

    def test_yaml_numeric_version(self, tmp_path: Path) -> None:
        """Test that numeric YAML values are coerced to strings."""
        content = """---
title: Numeric Version
description: Version is a number
version: 1.0
---

Content."""
        fp = tmp_path / "test.txt"
        fp.write_text(content)
        prompt = load_prompt(fp, meta="allow")
        assert prompt.meta is not None
        assert prompt.meta.version == "1.0"
        assert isinstance(prompt.meta.version, str)

    def test_yaml_with_comments(self, tmp_path: Path) -> None:
        """Test YAML front matter with comments."""
        content = """---
# This is a comment
title: Commented Prompt  # inline comment
description: Has comments
version: "1.0.0"
---

Content."""
        fp = tmp_path / "test.txt"
        fp.write_text(content)
        prompt = load_prompt(fp, meta="allow")
        assert prompt.meta is not None
        assert prompt.meta.title == "Commented Prompt"

    def test_yaml_empty_header(self, tmp_path: Path) -> None:
        """Test YAML with empty header content."""
        content = """---
---

Content here."""
        fp = tmp_path / "test.txt"
        fp.write_text(content)
        prompt = load_prompt(fp, meta="allow")
        assert prompt.meta is not None
        # Empty header -> empty meta, title from filename
        assert prompt.meta.title == "test"


class TestTomlYamlDetection:
    """Test that TOML vs YAML detection works correctly."""

    def setup_method(self) -> None:
        set_metadata("ignore")

    def test_toml_still_works(self, tmp_path: Path) -> None:
        """Test that standard TOML front matter still works."""
        content = """---
title = "TOML Prompt"
description = "Standard TOML format"
version = "1.0.0"
---

TOML content."""
        fp = tmp_path / "test.txt"
        fp.write_text(content)
        prompt = load_prompt(fp, meta="strict")
        assert prompt.meta is not None
        assert prompt.meta.title == "TOML Prompt"
        assert prompt.meta.description == "Standard TOML format"
        assert prompt.meta.version == "1.0.0"

    def test_toml_preferred_over_yaml(self, tmp_path: Path) -> None:
        """Test that valid TOML is parsed as TOML, not YAML."""
        # This is valid TOML and also valid YAML
        content = """---
title = "Ambiguous"
---

Content."""
        fp = tmp_path / "test.txt"
        fp.write_text(content)
        prompt = load_prompt(fp, meta="allow")
        assert prompt.meta is not None
        assert prompt.meta.title == "Ambiguous"

    def test_yaml_fallback_when_toml_fails(self, tmp_path: Path) -> None:
        """Test that YAML is used when TOML parsing fails."""
        # title: value is invalid TOML but valid YAML
        content = """---
title: YAML Only
description: This is YAML syntax
version: "1.0.0"
---

Content."""
        fp = tmp_path / "test.txt"
        fp.write_text(content)
        prompt = load_prompt(fp, meta="strict")
        assert prompt.meta is not None
        assert prompt.meta.title == "YAML Only"
        assert prompt.meta.description == "This is YAML syntax"

    def test_existing_toml_fixtures_still_work(self, fixtures: Path) -> None:
        """Test that all existing TOML fixtures still parse correctly."""
        prompt = load_prompt(fixtures / "good.txt", meta="allow")
        assert prompt.meta is not None
        assert prompt.meta.title == "Example"
        assert prompt.meta.version == "1.0.0"


class TestParseHeaderUnit:
    """Unit tests for the _parse_header function."""

    def test_valid_toml(self) -> None:
        data = _parse_header('title = "Test"\nversion = "1.0.0"')
        assert data["title"] == "Test"
        assert data["version"] == "1.0.0"

    def test_valid_yaml(self) -> None:
        data = _parse_header("title: Test\nversion: '1.0.0'")
        assert data["title"] == "Test"
        assert data["version"] == "1.0.0"

    def test_empty_string(self) -> None:
        data = _parse_header("")
        assert data == {}

    def test_both_invalid_raises_toml_error(self) -> None:
        """When both TOML and YAML fail, error references TOML."""
        with pytest.raises(InvalidMetadataError, match="Invalid TOML"):
            _parse_header("{{invalid: [both formats")

    def test_nested_yaml_object_rejected(self) -> None:
        """Nested YAML objects are rejected."""
        with pytest.raises(InvalidMetadataError, match="Nested objects"):
            _parse_header("metadata:\n  title: nested")

    def test_yaml_non_mapping_rejected(self) -> None:
        """YAML that parses to a non-mapping is rejected."""
        with pytest.raises(InvalidMetadataError, match="must be a mapping"):
            _parse_header("- item1\n- item2")


class TestNormalizeYamlValues:
    """Unit tests for _normalize_yaml_values."""

    def test_string_passthrough(self) -> None:
        result = _normalize_yaml_values({"title": "hello"})
        assert result == {"title": "hello"}

    def test_date_in_created_field_kept(self) -> None:
        d = date(2024, 1, 15)
        result = _normalize_yaml_values({"created": d})
        assert result["created"] == d
        assert isinstance(result["created"], date)

    def test_date_in_other_field_stringified(self) -> None:
        d = date(2024, 1, 15)
        result = _normalize_yaml_values({"version": d})
        assert result["version"] == "2024-01-15"
        assert isinstance(result["version"], str)

    def test_boolean_stringified(self) -> None:
        result = _normalize_yaml_values({"flag": True})
        assert result["flag"] == "True"

    def test_int_stringified(self) -> None:
        result = _normalize_yaml_values({"count": 42})
        assert result["count"] == "42"

    def test_float_stringified(self) -> None:
        result = _normalize_yaml_values({"version": 1.0})
        assert result["version"] == "1.0"

    def test_nested_dict_rejected(self) -> None:
        with pytest.raises(InvalidMetadataError, match="Nested objects"):
            _normalize_yaml_values({"meta": {"title": "nested"}})

    def test_list_passthrough(self) -> None:
        result = _normalize_yaml_values({"tags": ["a", "b"]})
        assert result["tags"] == ["a", "b"]

    def test_none_passthrough(self) -> None:
        result = _normalize_yaml_values({"empty": None})
        assert result["empty"] is None


class TestYamlSaver:
    """Test saving prompts with YAML front matter."""

    def test_save_string_yaml(self, tmp_path: Path) -> None:
        """Test saving a string prompt with YAML template."""
        fp = tmp_path / "test.txt"
        save_prompt(fp, "You are helpful.", format="yaml")
        saved = fp.read_text()
        assert saved.startswith("---")
        assert 'title: ""' in saved
        assert 'description: ""' in saved
        assert 'version: ""' in saved
        assert "You are helpful." in saved
        # Verify it's YAML not TOML
        assert "=" not in saved.split("---")[1]

    def test_save_string_toml_default(self, tmp_path: Path) -> None:
        """Test that default format is still TOML."""
        fp = tmp_path / "test.txt"
        save_prompt(fp, "Hello.")
        saved = fp.read_text()
        assert 'title = ""' in saved

    def test_save_prompt_object_yaml(self, tmp_path: Path) -> None:
        """Test saving a Prompt object with YAML format."""
        fp = tmp_path / "test.txt"
        meta = PromptMeta(
            title="YAML Prompt",
            description="Saved as YAML",
            version="1.0.0",
            author="Tester",
            created=date(2024, 3, 20),
        )
        prompt = Prompt(
            path=fp, meta=meta, prompt=PromptString("Hello {name}!")
        )
        save_prompt(fp, prompt, format="yaml")
        saved = fp.read_text()
        assert "title:" in saved
        assert "description:" in saved
        assert "version:" in saved
        assert "author:" in saved
        assert "created:" in saved
        assert "Hello {name}!" in saved

    def test_save_and_reload_yaml_roundtrip(self, tmp_path: Path) -> None:
        """Test that YAML saved files can be loaded back correctly."""
        fp = tmp_path / "roundtrip.txt"
        meta = PromptMeta(
            title="Roundtrip Test",
            description="Testing round-trip",
            version="2.0.0",
        )
        prompt = Prompt(
            path=fp, meta=meta, prompt=PromptString("Roundtrip content.")
        )
        save_prompt(fp, prompt, format="yaml")

        # Load it back
        loaded = load_prompt(fp, meta="strict")
        assert loaded.meta is not None
        assert loaded.meta.title == "Roundtrip Test"
        assert loaded.meta.description == "Testing round-trip"
        assert loaded.meta.version == "2.0.0"
        assert "Roundtrip content." in loaded.prompt

    def test_save_and_reload_toml_roundtrip(self, tmp_path: Path) -> None:
        """Verify TOML roundtrip still works after changes."""
        fp = tmp_path / "roundtrip_toml.txt"
        meta = PromptMeta(
            title="TOML Roundtrip",
            description="Still works",
            version="1.0.0",
        )
        prompt = Prompt(
            path=fp, meta=meta, prompt=PromptString("TOML content.")
        )
        save_prompt(fp, prompt, format="toml")

        loaded = load_prompt(fp, meta="strict")
        assert loaded.meta is not None
        assert loaded.meta.title == "TOML Roundtrip"
        assert loaded.meta.version == "1.0.0"

    def test_save_prompt_yaml_minimal_meta(self, tmp_path: Path) -> None:
        """Test saving with minimal metadata in YAML format."""
        fp = tmp_path / "minimal.txt"
        meta = PromptMeta(title="Minimal")
        prompt = Prompt(path=fp, meta=meta, prompt=PromptString("Simple."))
        save_prompt(fp, prompt, format="yaml")

        saved = fp.read_text()
        assert "author:" not in saved
        assert "created:" not in saved

    def test_save_prompt_yaml_special_chars(self, tmp_path: Path) -> None:
        """Test saving YAML with special characters in metadata."""
        fp = tmp_path / "special.txt"
        meta = PromptMeta(
            title="Title with: colon",
            description="Has #hash and {braces}",
            version="1.0.0",
        )
        prompt = Prompt(
            path=fp, meta=meta, prompt=PromptString("Content.")
        )
        save_prompt(fp, prompt, format="yaml")

        # Verify it can be loaded back correctly
        loaded = load_prompt(fp, meta="allow")
        assert loaded.meta is not None
        assert loaded.meta.title == "Title with: colon"
        assert loaded.meta.description == "Has #hash and {braces}"


class TestYamlEdgeCases:
    """Test edge cases specific to YAML support."""

    def setup_method(self) -> None:
        set_metadata("ignore")

    def test_yaml_strict_missing_fields(self, tmp_path: Path) -> None:
        """YAML with missing required fields fails in STRICT mode."""
        content = """---
title: Only Title
---

Body."""
        fp = tmp_path / "test.txt"
        fp.write_text(content)
        with pytest.raises(InvalidMetadataError, match="Missing required"):
            load_prompt(fp, meta="strict")

    def test_yaml_strict_empty_fields(self, tmp_path: Path) -> None:
        """YAML with empty required fields fails in STRICT mode."""
        content = """---
title: ""
description: ""
version: ""
---

Body."""
        fp = tmp_path / "test.txt"
        fp.write_text(content)
        with pytest.raises(InvalidMetadataError, match="Empty required"):
            load_prompt(fp, meta="strict")

    def test_yaml_ignore_mode_skips_parsing(self, tmp_path: Path) -> None:
        """IGNORE mode doesn't parse YAML front matter."""
        content = """---
title: Ignored
---

Body content."""
        fp = tmp_path / "test.txt"
        fp.write_text(content)
        prompt = load_prompt(fp, meta="ignore")
        assert prompt.meta is not None
        assert prompt.meta.title == "test"  # Uses filename
        assert "title: Ignored" in prompt.prompt

    def test_yaml_with_multiline_description(self, tmp_path: Path) -> None:
        """Test YAML front matter with a quoted multiline value."""
        content = """---
title: Multiline
description: "Line one and line two"
version: "1.0.0"
---

Body."""
        fp = tmp_path / "test.txt"
        fp.write_text(content)
        prompt = load_prompt(fp, meta="allow")
        assert prompt.meta is not None
        assert prompt.meta.description == "Line one and line two"

    def test_mixed_format_directory_loading(self, tmp_path: Path) -> None:
        """Test loading a directory with both TOML and YAML files."""
        from textprompts import load_prompts

        toml_content = """---
title = "TOML File"
description = "Written in TOML"
version = "1.0.0"
---

TOML body."""

        yaml_content = """---
title: YAML File
description: Written in YAML
version: "1.0.0"
---

YAML body."""

        (tmp_path / "toml_prompt.txt").write_text(toml_content)
        (tmp_path / "yaml_prompt.txt").write_text(yaml_content)

        prompts = load_prompts(tmp_path, meta="strict")
        assert len(prompts) == 2
        titles = {p.meta.title for p in prompts if p.meta}
        assert "TOML File" in titles
        assert "YAML File" in titles
