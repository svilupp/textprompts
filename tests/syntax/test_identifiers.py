from __future__ import annotations

import pytest

from textprompts.errors import ParseError
from textprompts.identifiers import RESERVED, validate_identifier


def test_valid_identifier_simple() -> None:
    validate_identifier("foo", role="variable")
    validate_identifier("_underscore", role="variable")
    validate_identifier("Camel_Case_42", role="variable")


def test_leading_digit_rejected() -> None:
    with pytest.raises(ParseError) as exc:
        validate_identifier("9lives", role="flag name")
    assert exc.value.code == "E_INVALID_IDENTIFIER"
    assert "flag name" in str(exc.value)
    assert "9lives" in str(exc.value)


def test_dash_rejected() -> None:
    with pytest.raises(ParseError) as exc:
        validate_identifier("name-with-dash", role="variable name")
    assert exc.value.code == "E_INVALID_IDENTIFIER"
    assert "dashes" in str(exc.value)
    assert "snake_case" in str(exc.value)


def test_reserved_keywords_rejected() -> None:
    for kw in RESERVED:
        with pytest.raises(ParseError) as exc:
            validate_identifier(kw, role="enum value")
        assert exc.value.code == "E_RESERVED_IDENTIFIER"
        assert kw in str(exc.value)
        assert "enum value" in str(exc.value)


def test_empty_rejected() -> None:
    with pytest.raises(ParseError) as exc:
        validate_identifier("", role="variable reference")
    assert exc.value.code == "E_BAD_TAG"
    assert "variable reference" in str(exc.value)


def test_unicode_letter_rejected() -> None:
    with pytest.raises(ParseError) as exc:
        validate_identifier("café", role="variable")
    assert exc.value.code == "E_INVALID_IDENTIFIER"


def test_flags_is_reserved() -> None:
    # "flags" is reserved by the format API surface.
    with pytest.raises(ParseError) as exc:
        validate_identifier("flags", role="variable")
    assert exc.value.code == "E_RESERVED_IDENTIFIER"
