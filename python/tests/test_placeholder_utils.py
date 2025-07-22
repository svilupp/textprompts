import pytest

from textprompts.placeholder_utils import (
    extract_placeholders,
    get_placeholder_info,
    should_ignore_validation,
    validate_format_args,
)


class TestExtractPlaceholders:
    """Test the extract_placeholders function."""

    def test_no_placeholders(self) -> None:
        """Test text with no placeholders."""
        assert extract_placeholders("Hello world") == set()
        assert extract_placeholders("") == set()

    def test_simple_placeholders(self) -> None:
        """Test simple named placeholders."""
        assert extract_placeholders("Hello {name}") == {"name"}
        assert extract_placeholders("Hello {name}!") == {"name"}
        assert extract_placeholders("{greeting} {name}") == {"greeting", "name"}

    def test_positional_placeholders(self) -> None:
        """Test positional placeholders."""
        assert extract_placeholders("Hello {0}") == {"0"}
        assert extract_placeholders("{0} {1} {2}") == {"0", "1", "2"}
        assert extract_placeholders("Hello {0}, you are {1}") == {"0", "1"}

    def test_mixed_placeholders(self) -> None:
        """Test mixed positional and named placeholders."""
        assert extract_placeholders("Hello {0}, you are {age} years old") == {
            "0",
            "age",
        }
        assert extract_placeholders("{greeting} {0}, {name}") == {
            "greeting",
            "0",
            "name",
        }

    def test_format_specifiers(self) -> None:
        """Test placeholders with format specifiers."""
        assert extract_placeholders("Price: ${price:.2f}") == {"price"}
        assert extract_placeholders("Number: {value:02d}") == {"value"}
        assert extract_placeholders("Percentage: {percent:.1%}") == {"percent"}

    def test_escaped_braces(self) -> None:
        """Test that escaped braces are ignored."""
        assert extract_placeholders("{{not a placeholder}}") == set()
        assert extract_placeholders("{{escaped}} but {real}") == {"real"}
        assert extract_placeholders("Start {{literal}} {name} end") == {"name"}

    def test_complex_format_specifiers(self) -> None:
        """Test complex format specifiers."""
        assert extract_placeholders("Aligned: {text:>10}") == {"text"}
        assert extract_placeholders("Padded: {num:0>5}") == {"num"}
        assert extract_placeholders("Scientific: {val:e}") == {"val"}

    def test_nested_braces_in_format(self) -> None:
        """Test handling of nested braces in format specifiers."""
        # This is a complex edge case - format specifiers with nested braces
        assert extract_placeholders("Complex: {data}") == {"data"}

    def test_empty_placeholders(self) -> None:
        """Test handling of empty placeholders."""
        # Empty placeholders {} are typically used for positional args
        assert extract_placeholders("Hello {}") == {""}

    def test_multiple_same_placeholder(self) -> None:
        """Test that duplicate placeholders are deduplicated."""
        assert extract_placeholders("{name} and {name} again") == {"name"}
        assert extract_placeholders("{0} {1} {0}") == {"0", "1"}


class TestValidateFormatArgs:
    """Test the validate_format_args function."""

    def test_valid_args(self) -> None:
        """Test validation with valid arguments."""
        # Should not raise any exception
        validate_format_args({"name"}, (), {"name": "Alice"})
        validate_format_args({"0", "1"}, ("Alice", "Bob"), {})
        validate_format_args({"name", "age"}, (), {"name": "Alice", "age": 30})

    def test_missing_args(self) -> None:
        """Test validation with missing arguments."""
        with pytest.raises(ValueError, match="Missing format variables: \\['name'\\]"):
            validate_format_args({"name"}, (), {})

        with pytest.raises(
            ValueError, match="Missing format variables: \\['age', 'name'\\]"
        ):
            validate_format_args({"name", "age"}, (), {})

    def test_positional_args_conversion(self) -> None:
        """Test that positional args are converted to string keys."""
        # Should not raise - positional args are converted to string keys
        validate_format_args({"0", "1"}, ("Alice", "Bob"), {})
        validate_format_args({"0"}, ("Alice",), {"extra": "value"})

    def test_mixed_args(self) -> None:
        """Test validation with mixed positional and keyword args."""
        validate_format_args({"0", "name"}, ("Alice",), {"name": "Bob"})

        with pytest.raises(ValueError, match="Missing format variables: \\['name'\\]"):
            validate_format_args({"0", "name"}, ("Alice",), {})

    def test_skip_validation(self) -> None:
        """Test that validation is skipped when skip_validation=True."""
        # Should not raise even with missing args
        validate_format_args({"name"}, (), {}, skip_validation=True)
        validate_format_args({"name", "age"}, (), {}, skip_validation=True)

    def test_extra_args_allowed(self) -> None:
        """Test that extra arguments are allowed."""
        # Should not raise - extra args are allowed
        validate_format_args({"name"}, (), {"name": "Alice", "extra": "value"})
        validate_format_args(set(), (), {"unused": "value"})

    def test_empty_placeholders(self) -> None:
        """Test validation with no placeholders."""
        # Should not raise - no placeholders to validate
        validate_format_args(set(), (), {})
        validate_format_args(set(), (), {"unused": "value"})


class TestShouldIgnoreValidation:
    """Test the should_ignore_validation function."""

    def test_ignore_true(self) -> None:
        """Test when ignore flag is True."""
        assert should_ignore_validation(True) is True

    def test_ignore_false(self) -> None:
        """Test when ignore flag is False."""
        assert should_ignore_validation(False) is False


class TestGetPlaceholderInfo:
    """Test the get_placeholder_info function."""

    def test_no_placeholders(self) -> None:
        """Test text with no placeholders."""
        info = get_placeholder_info("Hello world")
        assert info == {
            "count": 0,
            "names": set(),
            "has_positional": False,
            "has_named": False,
            "is_mixed": False,
        }

    def test_named_placeholders(self) -> None:
        """Test text with only named placeholders."""
        info = get_placeholder_info("Hello {name}, you are {age}")
        assert info == {
            "count": 2,
            "names": {"name", "age"},
            "has_positional": False,
            "has_named": True,
            "is_mixed": False,
        }

    def test_positional_placeholders(self) -> None:
        """Test text with only positional placeholders."""
        info = get_placeholder_info("Hello {0}, you are {1}")
        assert info == {
            "count": 2,
            "names": {"0", "1"},
            "has_positional": True,
            "has_named": False,
            "is_mixed": False,
        }

    def test_mixed_placeholders(self) -> None:
        """Test text with mixed placeholder types."""
        info = get_placeholder_info("Hello {0}, you are {age} years old")
        assert info == {
            "count": 2,
            "names": {"0", "age"},
            "has_positional": True,
            "has_named": True,
            "is_mixed": True,
        }

    def test_with_format_specifiers(self) -> None:
        """Test text with format specifiers."""
        info = get_placeholder_info("Price: ${price:.2f}, Count: {count:d}")
        assert info == {
            "count": 2,
            "names": {"price", "count"},
            "has_positional": False,
            "has_named": True,
            "is_mixed": False,
        }
