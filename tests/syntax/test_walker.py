from __future__ import annotations

import pytest

from textprompts.errors import SemanticError
from textprompts.syntax.lexer import tokenize
from textprompts.syntax.parser import parse_body
from textprompts.syntax.walker import collect_required_refs


def refs(src: str):
    return collect_required_refs(parse_body(tokenize(src)))


def test_collects_variables() -> None:
    r = refs("Hello {name}. {role}")
    assert r.variables == frozenset({"name", "role"})
    assert r.flags == {}
    assert r.enum_cases == {}


def test_walks_both_if_branches() -> None:
    r = refs("{if x}\n{a}\n{else}\n{b}\n{end}\n")
    assert r.flags == {"x": "if"}
    assert r.variables == frozenset({"a", "b"})


def test_walks_all_switch_cases_and_else() -> None:
    r = refs(
        "{switch tier}\n{case free}\n{a}\n{case premium}\n{b}\n{else}\n{c}\n{end}\n"
    )
    assert r.flags == {"tier": "switch"}
    assert r.enum_cases == {"tier": frozenset({"free", "premium"})}
    assert r.variables == frozenset({"a", "b", "c"})
    assert "tier" in r.switches_with_else


def test_switches_with_else_empty_when_no_else() -> None:
    r = refs("{switch tier}\n{case free}\na\n{case premium}\nb\n{end}\n")
    assert "tier" not in r.switches_with_else


def test_same_flag_as_if_and_switch_rejected() -> None:
    src = "{if foo}\nx\n{end}\n{switch foo}\n{case a}\nq\n{end}\n"
    with pytest.raises(SemanticError) as exc:
        refs(src)
    assert exc.value.code == "E_FLAG_USED_AS_BOTH_IF_AND_SWITCH"
    assert "foo" in str(exc.value)


def test_nested_blocks_walked_to_full_depth() -> None:
    src = (
        "{if outer}\n"
        "{switch tier}\n"
        "{case free}\n"
        "{inner_var}\n"
        "{case premium}\n"
        "{other_var}\n"
        "{end}\n"
        "{end}\n"
    )
    r = refs(src)
    assert r.flags == {"outer": "if", "tier": "switch"}
    assert r.variables == frozenset({"inner_var", "other_var"})
    assert r.enum_cases["tier"] == frozenset({"free", "premium"})


def test_property_variables_same_regardless_of_flag_value() -> None:
    # SPEC §5.2 — variables collected do NOT depend on which branches "would"
    # fire. The walker visits every branch.
    src = "{if x}\n{a}\n{else}\n{b}\n{end}\n"
    r = refs(src)
    # Property: variables include BOTH a and b regardless of x's value.
    assert "a" in r.variables
    assert "b" in r.variables


def test_repeated_variable_recorded_once() -> None:
    r = refs("{name} {name} {name}")
    assert r.variables == frozenset({"name"})


def test_empty_ast_yields_empty_refs() -> None:
    r = refs("just plain text")
    assert r.flags == {}
    assert r.enum_cases == {}
    assert r.variables == frozenset()
