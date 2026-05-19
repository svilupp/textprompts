from __future__ import annotations

import pytest

from textprompts.errors import FormatError
from textprompts.models import FlagDecl, PromptMeta
from textprompts.syntax.lexer import tokenize
from textprompts.syntax.parser import parse_body
from textprompts.syntax.validator import validate_inputs


def _ast(src: str):
    return parse_body(tokenize(src))


def _meta(**flags: FlagDecl) -> PromptMeta:
    return PromptMeta(flags=dict(flags))


def test_plain_prompt_only_variables_flags_none_ok() -> None:
    ast = _ast("Hello {name}.")
    validate_inputs(_meta(), ast, {"name": "Ada"}, None)


def test_missing_flags_object() -> None:
    ast = _ast("{if x}hi{end}")
    with pytest.raises(FormatError) as ei:
        validate_inputs(_meta(), ast, {}, None)
    assert ei.value.code == "E_MISSING_FLAGS_OBJECT"


def test_bad_flags_type_list() -> None:
    ast = _ast("{if x}hi{end}")
    with pytest.raises(FormatError) as ei:
        validate_inputs(_meta(), ast, {}, [1, 2, 3])  # type: ignore[arg-type]
    assert ei.value.code == "E_BAD_FLAGS_TYPE"


def test_missing_required_flag() -> None:
    ast = _ast("{if x}hi{end}")
    with pytest.raises(FormatError) as ei:
        validate_inputs(_meta(), ast, {}, {})
    assert ei.value.code == "E_MISSING_FLAG"
    assert "x" in str(ei.value)


def test_missing_required_variable_in_inactive_branch() -> None:
    # `{y}` lives inside `{if x}` body. Even when x=False at format time,
    # validator must visit all branches per SPEC §5.2 and require `y`.
    ast = _ast("{if x}{y}{end}")
    with pytest.raises(FormatError) as ei:
        validate_inputs(_meta(), ast, {}, {"x": False})
    assert ei.value.code == "E_MISSING_VARIABLE"
    assert "y" in str(ei.value)


def test_boolean_flag_wrong_type_string() -> None:
    ast = _ast("{if x}hi{end}")
    with pytest.raises(FormatError) as ei:
        validate_inputs(_meta(), ast, {}, {"x": "true"})
    assert ei.value.code == "E_WRONG_FLAG_TYPE"


def test_enum_flag_wrong_type_bool() -> None:
    ast = _ast("{switch tier}{case free}F{case premium}P{end}")
    meta = _meta(
        tier=FlagDecl(kind="enum", values=("free", "premium")),
    )
    with pytest.raises(FormatError) as ei:
        validate_inputs(meta, ast, {}, {"tier": True})
    assert ei.value.code == "E_WRONG_FLAG_TYPE"


def test_enum_flag_wrong_value() -> None:
    ast = _ast("{switch tier}{case free}F{case premium}P{end}")
    meta = _meta(
        tier=FlagDecl(kind="enum", values=("free", "premium")),
    )
    with pytest.raises(FormatError) as ei:
        validate_inputs(meta, ast, {}, {"tier": "enterprise"})
    assert ei.value.code == "E_INVALID_FLAG_VALUE"


def test_extras_silently_ignored() -> None:
    ast = _ast("{if x}{y}{end}")
    # Extra flag `bogus` and extra variable `extra` must NOT error.
    validate_inputs(
        _meta(),
        ast,
        {"y": "v", "extra": "e"},
        {"x": True, "bogus": True},
    )


def test_reserved_keyword_as_variables_key() -> None:
    ast = _ast("Hello.")
    with pytest.raises(FormatError) as ei:
        validate_inputs(_meta(), ast, {"end": "x"}, None)
    assert ei.value.code == "E_RESERVED_KEY"


def test_reserved_keyword_as_variable_value_ok() -> None:
    ast = _ast("Hello {role}.")
    # Reserved keyword as a value is allowed.
    validate_inputs(_meta(), ast, {"role": "end"}, None)


def test_reserved_keyword_as_flags_key() -> None:
    ast = _ast("Hello.")
    with pytest.raises(FormatError) as ei:
        validate_inputs(_meta(), ast, None, {"if": True})
    assert ei.value.code == "E_RESERVED_KEY"
