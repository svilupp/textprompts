from pathlib import Path

import pytest

from textprompts import (
    MetadataMode,
    get_metadata,
    load_prompt,
    load_prompts,
    set_metadata,
)
from textprompts.errors import (
    InvalidMetadataError,
    MissingMetadataError,
)


class TestMetadataModes:
    """Test the three metadata modes: STRICT, ALLOW, IGNORE"""

    def setup_method(self) -> None:
        """Reset global config before each test"""
        set_metadata(MetadataMode.IGNORE)  # Reset to default

    def test_global_metadata_mode_setting(self) -> None:
        """Test setting and getting global metadata mode"""
        # Test enum
        set_metadata(MetadataMode.STRICT)
        assert get_metadata() == MetadataMode.STRICT

        set_metadata(MetadataMode.ALLOW)
        assert get_metadata() == MetadataMode.ALLOW

        set_metadata(MetadataMode.IGNORE)
        assert get_metadata() == MetadataMode.IGNORE

        # Test string values
        set_metadata("strict")
        assert get_metadata() == MetadataMode.STRICT

        set_metadata("allow")
        assert get_metadata() == MetadataMode.ALLOW

        set_metadata("ignore")
        assert get_metadata() == MetadataMode.IGNORE

    def test_invalid_metadata_mode(self) -> None:
        """Test invalid metadata mode raises ValueError"""
        with pytest.raises(ValueError, match="Invalid metadata mode"):
            set_metadata("invalid")

        with pytest.raises(ValueError, match="Mode must be MetadataMode"):
            set_metadata(123)  # type: ignore[arg-type]


class TestStrictMode:
    """Test STRICT metadata mode"""

    def setup_method(self) -> None:
        """Reset global config before each test"""
        set_metadata(MetadataMode.IGNORE)  # Reset to default

    def test_strict_mode_with_complete_metadata(self, tmp_path: Path) -> None:
        """Test STRICT mode with complete metadata"""
        content = """---
title = "Test Title"
description = "Test Description"
version = "1.0.0"
---

Test content here."""

        file_path = tmp_path / "test.txt"
        file_path.write_text(content)

        # Test with global config
        set_metadata(MetadataMode.STRICT)
        prompt = load_prompt(file_path)
        assert prompt.meta is not None
        assert prompt.meta.title == "Test Title"
        assert prompt.meta.description == "Test Description"
        assert prompt.meta.version == "1.0.0"

        # Test with parameter override
        set_metadata(MetadataMode.IGNORE)
        prompt = load_prompt(file_path, meta=MetadataMode.STRICT)
        assert prompt.meta is not None
        assert prompt.meta.title == "Test Title"

        # Test with string parameter
        prompt = load_prompt(file_path, meta="strict")
        assert prompt.meta is not None
        assert prompt.meta.title == "Test Title"

    def test_strict_mode_missing_metadata(self, tmp_path: Path) -> None:
        """Test STRICT mode with missing metadata"""
        content = "Just content, no metadata"

        file_path = tmp_path / "test.txt"
        file_path.write_text(content)

        # Test with global config
        set_metadata(MetadataMode.STRICT)
        with pytest.raises(MissingMetadataError) as exc_info:
            load_prompt(file_path)
        assert "STRICT mode requires metadata" in str(exc_info.value)

        # Test with parameter override
        set_metadata(MetadataMode.IGNORE)
        with pytest.raises(MissingMetadataError) as exc_info:
            load_prompt(file_path, meta=MetadataMode.STRICT)
        assert "STRICT mode requires metadata" in str(exc_info.value)

    def test_strict_mode_missing_required_fields(self, tmp_path: Path) -> None:
        """Test STRICT mode with missing required fields"""
        content = """---
title = "Test Title"
# Missing description and version
---

Test content here."""

        file_path = tmp_path / "test.txt"
        file_path.write_text(content)

        set_metadata(MetadataMode.STRICT)
        with pytest.raises(InvalidMetadataError) as exc_info:
            load_prompt(file_path)
        error_msg = str(exc_info.value)
        assert "Missing required metadata fields" in error_msg
        assert "description" in error_msg
        assert "version" in error_msg

    def test_strict_mode_empty_required_fields(self, tmp_path: Path) -> None:
        """Test STRICT mode with empty required fields"""
        content = """---
title = ""
description = "Test Description"
version = "   "
---

Test content here."""

        file_path = tmp_path / "test.txt"
        file_path.write_text(content)

        set_metadata(MetadataMode.STRICT)
        with pytest.raises(InvalidMetadataError) as exc_info:
            load_prompt(file_path)
        error_msg = str(exc_info.value)
        assert "Empty required metadata fields" in error_msg
        assert "title" in error_msg
        assert "version" in error_msg


class TestAllowMode:
    """Test ALLOW metadata mode"""

    def setup_method(self) -> None:
        """Reset global config before each test"""
        set_metadata(MetadataMode.IGNORE)  # Reset to default

    def test_allow_mode_with_complete_metadata(self, tmp_path: Path) -> None:
        """Test ALLOW mode with complete metadata"""
        content = """---
title = "Test Title"
description = "Test Description"
version = "1.0.0"
author = "Test Author"
---

Test content here."""

        file_path = tmp_path / "test.txt"
        file_path.write_text(content)

        # Test with global config
        set_metadata(MetadataMode.ALLOW)
        prompt = load_prompt(file_path)
        assert prompt.meta is not None
        assert prompt.meta.title == "Test Title"
        assert prompt.meta.description == "Test Description"
        assert prompt.meta.version == "1.0.0"
        assert prompt.meta.author == "Test Author"

        # Test with parameter override
        set_metadata(MetadataMode.IGNORE)
        prompt = load_prompt(file_path, meta=MetadataMode.ALLOW)
        assert prompt.meta is not None
        assert prompt.meta.title == "Test Title"

    def test_allow_mode_with_partial_metadata(self, tmp_path: Path) -> None:
        """Test ALLOW mode with partial metadata"""
        content = """---
title = "Test Title"
# Only title provided
---

Test content here."""

        file_path = tmp_path / "test.txt"
        file_path.write_text(content)

        set_metadata(MetadataMode.ALLOW)
        prompt = load_prompt(file_path)
        assert prompt.meta is not None
        assert prompt.meta.title == "Test Title"
        assert prompt.meta.description is None
        assert prompt.meta.version is None

    def test_allow_mode_with_empty_metadata(self, tmp_path: Path) -> None:
        """Test ALLOW mode with empty metadata"""
        content = """---
title = ""
description = ""
version = ""
---

Test content here."""

        file_path = tmp_path / "test.txt"
        file_path.write_text(content)

        set_metadata(MetadataMode.ALLOW)
        prompt = load_prompt(file_path)
        assert prompt.meta is not None
        assert prompt.meta.title == ""
        assert prompt.meta.description == ""
        assert prompt.meta.version == ""

    def test_allow_mode_no_metadata(self, tmp_path: Path) -> None:
        """Test ALLOW mode with no metadata"""
        content = "Just content, no metadata"

        file_path = tmp_path / "test.txt"
        file_path.write_text(content)

        set_metadata(MetadataMode.ALLOW)
        prompt = load_prompt(file_path)
        assert prompt.meta is not None
        assert prompt.meta.title == "test"  # Uses filename
        assert prompt.meta.description is None
        assert prompt.meta.version is None

    def test_allow_mode_invalid_toml(self, tmp_path: Path) -> None:
        """Test ALLOW mode with invalid TOML"""
        content = """---
title = "Test Title
# Invalid TOML - missing closing quote
---

Test content here."""

        file_path = tmp_path / "test.txt"
        file_path.write_text(content)

        set_metadata(MetadataMode.ALLOW)
        with pytest.raises(InvalidMetadataError) as exc_info:
            load_prompt(file_path)
        assert "Invalid TOML" in str(exc_info.value)


class TestIgnoreMode:
    """Test IGNORE metadata mode"""

    def setup_method(self) -> None:
        """Reset global config before each test"""
        set_metadata(MetadataMode.IGNORE)  # Reset to default

    def test_ignore_mode_with_metadata(self, tmp_path: Path) -> None:
        """Test IGNORE mode ignores metadata"""
        content = """---
title = "Test Title"
description = "Test Description"
version = "1.0.0"
---

Test content here."""

        file_path = tmp_path / "test.txt"
        file_path.write_text(content)

        # Test with global config (default)
        prompt = load_prompt(file_path)
        assert prompt.meta is not None
        assert prompt.meta.title == "test"  # Uses filename
        assert prompt.meta.description is None
        assert prompt.meta.version is None
        # Content includes the metadata as part of the body
        assert 'title = "Test Title"' in prompt.body
        assert "Test content here." in prompt.body

        # Test with parameter override
        set_metadata(MetadataMode.STRICT)
        prompt = load_prompt(file_path, meta=MetadataMode.IGNORE)
        assert prompt.meta is not None
        assert prompt.meta.title == "test"  # Uses filename

    def test_ignore_mode_without_metadata(self, tmp_path: Path) -> None:
        """Test IGNORE mode with no metadata"""
        content = "Just content, no metadata"

        file_path = tmp_path / "test.txt"
        file_path.write_text(content)

        # Test with global config (default)
        prompt = load_prompt(file_path)
        assert prompt.meta is not None
        assert prompt.meta.title == "test"  # Uses filename
        assert prompt.meta.description is None
        assert prompt.meta.version is None
        assert prompt.body == "Just content, no metadata"

    def test_ignore_mode_with_invalid_toml(self, tmp_path: Path) -> None:
        """Test IGNORE mode doesn't parse invalid TOML"""
        content = """---
title = "Test Title
# Invalid TOML - but should be ignored
---

Test content here."""

        file_path = tmp_path / "test.txt"
        file_path.write_text(content)

        # Should not raise error in IGNORE mode
        prompt = load_prompt(file_path)
        assert prompt.meta is not None
        assert prompt.meta.title == "test"  # Uses filename
        assert 'title = "Test Title' in prompt.body


class TestParameterPriority:
    """Test parameter priority: meta parameter > global config"""

    def setup_method(self) -> None:
        """Reset global config before each test"""
        set_metadata(MetadataMode.IGNORE)  # Reset to default

    def test_meta_parameter_overrides_global(self, tmp_path: Path) -> None:
        """Test meta parameter overrides global configuration"""
        content = """---
title = "Test Title"
description = "Test Description"
version = "1.0.0"
---

Test content here."""

        file_path = tmp_path / "test.txt"
        file_path.write_text(content)

        # Global is IGNORE, but meta parameter is STRICT
        set_metadata(MetadataMode.IGNORE)
        prompt = load_prompt(file_path, meta=MetadataMode.STRICT)
        assert prompt.meta is not None
        assert prompt.meta.title == "Test Title"  # Metadata was parsed
        assert prompt.meta.description == "Test Description"
        assert prompt.meta.version == "1.0.0"

    def test_global_config_used_when_no_meta_parameter(self, tmp_path: Path) -> None:
        """Test global configuration is used when no meta parameter is provided"""
        content = """---
title = "Test Title"
description = "Test Description"
version = "1.0.0"
---

Test content here."""

        file_path = tmp_path / "test.txt"
        file_path.write_text(content)

        # Global is STRICT, no meta parameter provided
        set_metadata(MetadataMode.STRICT)
        prompt = load_prompt(file_path)
        assert prompt.meta is not None
        assert prompt.meta.title == "Test Title"  # Metadata was parsed
        assert prompt.meta.description == "Test Description"
        assert prompt.meta.version == "1.0.0"

        # Global is IGNORE, no meta parameter provided
        set_metadata(MetadataMode.IGNORE)
        prompt = load_prompt(file_path)
        assert prompt.meta is not None
        assert prompt.meta.title == "test"  # Uses filename, metadata ignored
        assert 'title = "Test Title"' in prompt.body


class TestLoadPrompts:
    """Test load_prompts function with metadata modes"""

    def setup_method(self) -> None:
        """Reset global config before each test"""
        set_metadata(MetadataMode.IGNORE)  # Reset to default

    def test_load_prompts_with_global_config(self, tmp_path: Path) -> None:
        """Test load_prompts respects global metadata configuration"""
        # Create test files
        content1 = """---
title = "Prompt 1"
description = "First prompt"
version = "1.0.0"
---

Content 1"""

        content2 = """---
title = "Prompt 2"
description = "Second prompt"
version = "2.0.0"
---

Content 2"""

        (tmp_path / "prompt1.txt").write_text(content1)
        (tmp_path / "prompt2.txt").write_text(content2)

        # Test with STRICT mode
        set_metadata(MetadataMode.STRICT)
        prompts = load_prompts(tmp_path)
        assert len(prompts) == 2
        assert prompts[0].meta is not None
        assert prompts[1].meta is not None
        assert prompts[0].meta.title in ["Prompt 1", "Prompt 2"]
        assert prompts[1].meta.title in ["Prompt 1", "Prompt 2"]

    def test_load_prompts_with_meta_parameter(self, tmp_path: Path) -> None:
        """Test load_prompts with meta parameter override"""
        # Create test files
        content1 = """---
title = "Prompt 1"
description = "First prompt"
version = "1.0.0"
---

Content 1"""

        content2 = "Just content, no metadata"

        (tmp_path / "prompt1.txt").write_text(content1)
        (tmp_path / "prompt2.txt").write_text(content2)

        # Global is IGNORE, but override with ALLOW
        set_metadata(MetadataMode.IGNORE)
        prompts = load_prompts(tmp_path, meta=MetadataMode.ALLOW)
        assert len(prompts) == 2

        # Find the prompts by their expected titles
        # Add null checks for all prompts
        for p in prompts:
            assert p.meta is not None
        
        # Find prompts with explicit null checks
        prompt1 = None
        prompt2 = None
        for p in prompts:
            assert p.meta is not None  # Additional null check in loop
            if p.meta.title == "Prompt 1":
                prompt1 = p
            elif p.meta.title == "prompt2":
                prompt2 = p
        
        assert prompt1 is not None
        assert prompt2 is not None

        assert prompt1.meta is not None
        assert prompt2.meta is not None
        assert prompt1.meta.description == "First prompt"
        assert prompt2.meta.description is None  # No metadata for second file
