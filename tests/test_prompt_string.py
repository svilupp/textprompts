"""Tests for the v2 ``PromptString`` wrapper.

``PromptString`` is a thin ``str`` subclass whose ``.format()`` delegates to
the v2 syntax engine (lex/parse/validate/render). v1 patterns (positional
``{0}``, empty ``{}``, ``{{...}}`` escape, ``skip_validation``) are removed.
"""

from __future__ import annotations

import pytest

from textprompts import PromptString
from textprompts.errors import FormatError, ParseError


def test_prompt_string_basic_functionality() -> None:
    s = PromptString("Hello world")
    assert str(s) == "Hello world"
    assert len(s) == 11
    assert s.upper() == "HELLO WORLD"
    assert "world" in s


def test_prompt_string_format_success() -> None:
    s = PromptString("Hello {name}, you are {age} years old")
    result = s.format(name="Alice", age=30)
    assert result == "Hello Alice, you are 30 years old"


def test_prompt_string_format_rejects_positional() -> None:
    s = PromptString("Hello {name}")
    with pytest.raises(TypeError, match="positional"):
        s.format("Alice")


def test_prompt_string_format_missing_variables() -> None:
    s = PromptString("Hello {name}, you are {age} years old")
    with pytest.raises(FormatError) as excinfo:
        s.format()
    assert excinfo.value.code == "E_MISSING_VARIABLE"

    with pytest.raises(FormatError) as excinfo:
        s.format(name="Alice")
    assert excinfo.value.code == "E_MISSING_VARIABLE"


def test_prompt_string_format_extra_variables_silently_ignored() -> None:
    s = PromptString("Hello {name}")
    assert s.format(name="Alice", extra="unused") == "Hello Alice"


def test_prompt_string_no_placeholders() -> None:
    s = PromptString("Hello world")
    assert s.format(unused="value") == "Hello world"


def test_prompt_string_repr() -> None:
    s = PromptString("test")
    assert repr(s) == "PromptString('test')"


def test_prompt_string_complex_placeholders() -> None:
    s = PromptString("User: {user_name}, Score: {score}, Status: {status}")
    assert s.format(user_name="test_user", score=100, status="active") == (
        "User: test_user, Score: 100, Status: active"
    )


def test_prompt_string_inheritance() -> None:
    s = PromptString("test")
    assert isinstance(s, str)
    assert isinstance(s, PromptString)


def test_prompt_string_duplicate_placeholders() -> None:
    s = PromptString("{name} and {name} again")
    assert s.format(name="Alice") == "Alice and Alice again"


# ---------------------------------------------------------------------------
# v1 legacy syntax patterns now raise ParseError.
# ---------------------------------------------------------------------------


def test_legacy_positional_placeholder_rejected() -> None:
    """Positional `{0}` is no longer valid syntax."""
    s = PromptString("Hello {0}")
    with pytest.raises(ParseError):
        s.format(name="ignored")


def test_legacy_empty_placeholder_rejected() -> None:
    """Empty `{}` is no longer valid syntax."""
    s = PromptString("Hello {}")
    with pytest.raises(ParseError):
        s.format()


def test_legacy_format_specifier_rejected() -> None:
    """Format specifiers like `{name:>10}` are not supported in v2."""
    s = PromptString("Aligned: {text:>10}")
    with pytest.raises(ParseError):
        s.format(text="hi")


def test_double_brace_is_literal_not_escape() -> None:
    """`{{literal}}` was a v1 escape for `{literal}`. In v2 it is two
    consecutive `{` chars followed by a variable token; the lexer rejects it.
    """
    s = PromptString("{{literal}} but {real}")
    with pytest.raises(ParseError):
        s.format(real="actual")


def test_flags_kwarg_is_reserved() -> None:
    """Passing flags=... on a flagless prompt is silently ignored per SPEC §5.7."""
    s = PromptString("Hello {name}")
    assert s.format(name="Alice", flags={"unused": True}) == "Hello Alice"


def test_format_with_conditional_block() -> None:
    s = PromptString("Greetings.\n{if vip}\nWelcome back, {name}.\n{end}\n")
    out = s.format(name="Alice", flags={"vip": True})
    assert "Welcome back, Alice." in out
    out_off = s.format(name="Alice", flags={"vip": False})
    assert "Welcome back" not in out_off
