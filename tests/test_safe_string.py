import pytest

from textprompts.safe_string import SafeString


def test_safe_string_basic_functionality() -> None:
    """Test SafeString behaves like a regular string."""
    s = SafeString("Hello world")
    assert str(s) == "Hello world"
    assert len(s) == 11
    assert s.upper() == "HELLO WORLD"
    assert s.lower() == "hello world"
    assert "world" in s


def test_safe_string_format_success() -> None:
    """Test successful formatting with all variables provided."""
    s = SafeString("Hello {name}, you are {age} years old")
    result = s.format(name="Alice", age=30)
    assert result == "Hello Alice, you are 30 years old"


def test_safe_string_format_positional_args() -> None:
    """Test formatting with positional arguments."""
    s = SafeString("Hello {0}, you are {1} years old")
    result = s.format("Bob", 25)
    assert result == "Hello Bob, you are 25 years old"


def test_safe_string_format_mixed_args() -> None:
    """Test formatting with mixed positional and keyword arguments."""
    s = SafeString("Hello {0}, you are {age} years old")
    result = s.format("Charlie", age=35)
    assert result == "Hello Charlie, you are 35 years old"


def test_safe_string_format_missing_variables() -> None:
    """Test that missing variables raise ValueError by default."""
    s = SafeString("Hello {name}, you are {age} years old")

    with pytest.raises(
        ValueError, match="Missing format variables: \\['age', 'name'\\]"
    ):
        s.format()

    with pytest.raises(ValueError, match="Missing format variables: \\['age'\\]"):
        s.format(name="Alice")

    # But with skip_validation=True, partial formatting works
    result = s.format(name="Alice", skip_validation=True)
    assert result == "Hello Alice, you are {age} years old"


def test_safe_string_format_extra_variables() -> None:
    """Test that extra variables are allowed."""
    s = SafeString("Hello {name}")
    result = s.format(name="Alice", extra="unused")
    assert result == "Hello Alice"


def test_safe_string_no_placeholders() -> None:
    """Test formatting string with no placeholders."""
    s = SafeString("Hello world")
    result = s.format(unused="value")
    assert result == "Hello world"


def test_safe_string_repr() -> None:
    """Test string representation for debugging."""
    s = SafeString("test")
    assert repr(s) == "SafeString('test', placeholders=set())"

    s_with_placeholders = SafeString("Hello {name}")
    assert (
        repr(s_with_placeholders) == "SafeString('Hello {name}', placeholders={'name'})"
    )


def test_safe_string_empty() -> None:
    """Test empty SafeString."""
    s = SafeString("")
    assert str(s) == ""
    assert len(s) == 0


def test_safe_string_complex_placeholders() -> None:
    """Test complex placeholder patterns."""
    s = SafeString("User: {user_name}, Score: {score}, Status: {status}")
    result = s.format(user_name="test_user", score=100, status="active")
    assert result == "User: test_user, Score: 100, Status: active"


def test_safe_string_inheritance() -> None:
    """Test that SafeString is properly a string subclass."""
    s = SafeString("test")
    assert isinstance(s, str)
    assert isinstance(s, SafeString)


# New tests for enhanced SafeString functionality


def test_safe_string_placeholders_attribute() -> None:
    """Test that placeholders are extracted and stored correctly."""
    s = SafeString("Hello {name}, you are {age} years old")
    assert s.placeholders == {"name", "age"}

    s_positional = SafeString("Hello {0}, you are {1}")
    assert s_positional.placeholders == {"0", "1"}

    s_mixed = SafeString("Hello {0}, you are {age} years old")
    assert s_mixed.placeholders == {"0", "age"}

    s_no_placeholders = SafeString("Hello world")
    assert s_no_placeholders.placeholders == set()


def test_safe_string_format_with_skip_validation() -> None:
    """Test formatting with skip_validation parameter."""
    s = SafeString("Hello {name}, you are {age} years old")

    # Should work with skip_validation=True even with missing args
    result = s.format(name="Alice", skip_validation=True)
    assert result == "Hello Alice, you are {age} years old"

    # Should work with skip_validation=True and no args
    result = s.format(skip_validation=True)
    assert result == "Hello {name}, you are {age} years old"

    # Should still work normally with all args provided
    result = s.format(name="Alice", age=30, skip_validation=True)
    assert result == "Hello Alice, you are 30 years old"


def test_safe_string_format_skip_validation_false() -> None:
    """Test that skip_validation=False still validates (default behavior)."""
    s = SafeString("Hello {name}")

    # Should raise with missing args even when explicitly set to False
    with pytest.raises(ValueError, match="Missing format variables: \\['name'\\]"):
        s.format(skip_validation=False)


def test_safe_string_format_specifiers() -> None:
    """Test formatting with format specifiers."""
    s = SafeString("Price: ${price:.2f}, Count: {count:d}")
    assert s.placeholders == {"price", "count"}

    result = s.format(price=19.99, count=5)
    assert result == "Price: $19.99, Count: 5"


def test_safe_string_escaped_braces() -> None:
    """Test that escaped braces are handled correctly."""
    s = SafeString("{{literal}} but {real} placeholder")
    assert s.placeholders == {"real"}

    result = s.format(real="actual")
    assert result == "{literal} but actual placeholder"


def test_safe_string_empty_placeholders() -> None:
    """Test handling of empty placeholders."""
    s = SafeString("Hello {}")
    assert s.placeholders == {""}

    result = s.format("world")
    assert result == "Hello world"


def test_safe_string_duplicate_placeholders() -> None:
    """Test that duplicate placeholders are handled correctly."""
    s = SafeString("{name} and {name} again")
    assert s.placeholders == {"name"}

    result = s.format(name="Alice")
    assert result == "Alice and Alice again"


def test_safe_string_complex_format_specifiers() -> None:
    """Test complex format specifiers."""
    s = SafeString("Aligned: {text:>10}, Padded: {num:0>5}")
    assert s.placeholders == {"text", "num"}

    result = s.format(text="hi", num=42)
    assert result == "Aligned:         hi, Padded: 00042"


def test_safe_string_performance_placeholders_cached() -> None:
    """Test that placeholders are extracted once, not on each format call."""
    s = SafeString("Hello {name}")

    # Store original placeholders
    original_placeholders = s.placeholders

    # Format multiple times
    s.format(name="Alice")
    s.format(name="Bob")

    # Placeholders should be the same object (cached)
    assert s.placeholders is original_placeholders


def test_safe_string_skip_validation_with_mixed_args() -> None:
    """Test skip_validation with mixed positional and keyword args."""
    s = SafeString("Hello {0}, you are {age} years old")

    # Should work with partial args when skipping validation
    result = s.format("Alice", skip_validation=True)
    assert result == "Hello Alice, you are {age} years old"

    # Should work with only keyword args when skipping validation
    result = s.format(age=30, skip_validation=True)
    assert result == "Hello {0}, you are 30 years old"


def test_safe_string_skip_validation_keyword_position() -> None:
    """Test that skip_validation works regardless of position in kwargs."""
    s = SafeString("Hello {name}")

    # skip_validation at the beginning
    result = s.format(skip_validation=True, extra="value")
    assert result == "Hello {name}"

    # skip_validation at the end
    result = s.format(extra="value", skip_validation=True)
    assert result == "Hello {name}"
