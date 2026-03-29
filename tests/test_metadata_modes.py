from pathlib import Path

import pytest

from textprompts import (
    MetadataMode,
    get_metadata,
    load_prompt,
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
        with pytest.raises(InvalidMetadataError):
            load_prompt(file_path)


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
        assert 'title = "Test Title"' in prompt.prompt
        assert "Test content here." in prompt.prompt

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
        assert prompt.prompt == "Just content, no metadata"

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
        assert 'title = "Test Title' in prompt.prompt


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
        assert 'title = "Test Title"' in prompt.prompt
