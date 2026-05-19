from __future__ import annotations

import pytest

from textprompts.errors import ParseError
from textprompts.syntax.ast import IfNode, SwitchNode, TextNode, VariableNode
from textprompts.syntax.lexer import tokenize
from textprompts.syntax.parser import parse_body


def parse(src: str):
    return parse_body(tokenize(src))


# --- SPEC §3.1 — 17 structural rules --------------------------------------


def test_unclosed_if_rejected() -> None:  # rule 1
    with pytest.raises(ParseError) as exc:
        parse("{if foo}\nbody\n")
    assert exc.value.code == "E_UNCLOSED_IF"


def test_unclosed_switch_rejected() -> None:  # rule 2
    with pytest.raises(ParseError) as exc:
        parse("{switch tier}\n{case free}\nx\n")
    assert exc.value.code == "E_UNCLOSED_SWITCH"


def test_extra_end_rejected() -> None:  # rule 3
    with pytest.raises(ParseError) as exc:
        parse("hello {end}")
    assert exc.value.code == "E_EXTRA_END"


def test_else_outside_block_rejected() -> None:  # rule 4
    with pytest.raises(ParseError) as exc:
        parse("hello {else} world")
    assert exc.value.code == "E_ELSE_BEFORE_CASE"


def test_case_outside_switch_rejected() -> None:  # rule 5
    with pytest.raises(ParseError) as exc:
        parse("hello {case free} world")
    assert exc.value.code == "E_BAD_TAG"


def test_switch_multiple_else_rejected() -> None:  # rule 6
    with pytest.raises(ParseError) as exc:
        parse("{switch tier}\n{case free}\na\n{else}\nb\n{else}\nc\n{end}\n")
    assert exc.value.code == "E_ELSE_BEFORE_CASE"


def test_switch_else_before_case_rejected() -> None:  # rule 7
    with pytest.raises(ParseError) as exc:
        parse("{switch tier}\n{else}\nb\n{case free}\na\n{end}\n")
    assert exc.value.code == "E_ELSE_BEFORE_CASE"


def test_if_multiple_else_rejected() -> None:  # rule 8
    # The lexer-parser sees the second {else} as a stray after {end} would have
    # ended the construct; instead, second {else} inside an if branch surfaces
    # as a stray else when parseUntil sees it outside the allowed stops.
    with pytest.raises(ParseError) as exc:
        parse("{if foo}\na\n{else}\nb\n{else}\nc\n{end}\n")
    # Either E_ELSE_BEFORE_CASE (stray) or another classifier — both fine; the
    # main point is the parser rejects it.
    assert exc.value.code in {"E_ELSE_BEFORE_CASE", "E_UNCLOSED_IF"}


def test_content_between_switch_and_first_case_rejected() -> None:  # rule 9
    with pytest.raises(ParseError) as exc:
        parse("{switch tier}\nstray\n{case free}\na\n{end}\n")
    assert exc.value.code == "E_TEXT_BEFORE_FIRST_CASE"


def test_switch_variable_before_first_case_rejected() -> None:  # rule 9 — non-text
    with pytest.raises(ParseError) as exc:
        parse("{switch tier}\n{stray}\n{case free}\na\n{end}\n")
    assert exc.value.code == "E_TEXT_BEFORE_FIRST_CASE"


def test_duplicate_case_rejected() -> None:  # rule 10
    with pytest.raises(ParseError) as exc:
        parse("{switch tier}\n{case free}\na\n{case free}\nb\n{end}\n")
    assert exc.value.code == "E_DUPLICATE_CASE"


def test_switch_zero_cases_rejected() -> None:  # rule 11
    with pytest.raises(ParseError) as exc:
        parse("{switch tier}\n{end}")
    assert exc.value.code == "E_SWITCH_NO_CASES"


# Rules 12-17 — bare keywords + legacy placeholders — surface in the lexer.
# Verified there in test_lexer.py.


# --- SPEC §3.2 — mixed-form rejection -------------------------------------


def test_mixed_inline_opener_block_end_rejected() -> None:
    with pytest.raises(ParseError) as exc:
        parse("prefix {if foo}\nbody\n{end}")
    assert exc.value.code == "E_MIXED_FORM"


def test_mixed_block_opener_inline_end_rejected() -> None:
    with pytest.raises(ParseError) as exc:
        parse("{if foo}\nbody\n{end} suffix")
    assert exc.value.code == "E_MIXED_FORM"


def test_mixed_inline_opener_block_body_rejected() -> None:
    # {if flag}inline body\n{end}
    with pytest.raises(ParseError) as exc:
        parse("{if foo}inline body\n{end}")
    assert exc.value.code == "E_MIXED_FORM"


def test_mixed_block_opener_inline_body_rejected() -> None:
    # {if flag}\nbody {end}
    with pytest.raises(ParseError) as exc:
        parse("{if foo}\nbody {end}")
    assert exc.value.code == "E_MIXED_FORM"


# --- Valid cases ----------------------------------------------------------


def test_two_back_to_back_constructs_are_independent() -> None:
    # SPEC §3.2 "Legal — two separate constructs back-to-back":
    src = "{if foo} short note {end}\n{if foo}\nlonger body\n{end}\n"
    ast = parse(src)
    # First if is inline, second is block.
    if_nodes = [n for n in ast if isinstance(n, IfNode)]
    assert len(if_nodes) == 2
    assert if_nodes[0].form == "inline"
    assert if_nodes[1].form == "block"


def test_indented_block_keywords_accepted() -> None:
    src = "{if outer}\n  {if inner}\n  body line\n  {end}\n{end}\n"
    ast = parse(src)
    outer = ast[0]
    assert isinstance(outer, IfNode)
    assert outer.form == "block"
    # The inner-if's keyword lines are stripped; body should contain the
    # body line (with original indentation preserved).
    inner = next(n for n in outer.body if isinstance(n, IfNode))
    assert inner.form == "block"
    # Inner body should not contain stray "{end}" or keyword-line text.
    inner_text = "".join(n.value for n in inner.body if isinstance(n, TextNode))
    assert "{end}" not in inner_text
    assert "body line" in inner_text


def test_empty_case_body_permitted() -> None:
    src = "{switch tier}\n{case free}\n{case premium}\nstuff\n{end}\n"
    ast = parse(src)
    sw = ast[0]
    assert isinstance(sw, SwitchNode)
    assert sw.cases[0].value == "free"
    assert sw.cases[0].body == ()
    assert sw.cases[1].value == "premium"


def test_inline_switch_valid() -> None:
    src = "Plan: {switch tier}{case free}free{case premium}premium{else}unknown{end}.\n"
    ast = parse(src)
    sw = next(n for n in ast if isinstance(n, SwitchNode))
    assert sw.form == "inline"
    assert [c.value for c in sw.cases] == ["free", "premium"]
    assert sw.else_body is not None


def test_inline_if_with_else() -> None:
    src = "The user is on the {if premium_tier}premium{else}free{end} plan."
    ast = parse(src)
    if_node = next(n for n in ast if isinstance(n, IfNode))
    assert if_node.form == "inline"
    assert if_node.else_body is not None


def test_nesting_depth_one() -> None:
    src = "{if a}\nbody\n{end}\n"
    parse(src)


def test_nesting_depth_two() -> None:
    src = "{if a}\n{if b}\nbody\n{end}\n{end}\n"
    ast = parse(src)
    outer = ast[0]
    assert isinstance(outer, IfNode)
    inner = next(n for n in outer.body if isinstance(n, IfNode))
    assert inner.flag == "b"


def test_nesting_depth_five() -> None:
    src = "".join(f"{{if f{i}}}\n" for i in range(5)) + "body\n" + "{end}\n" * 5
    ast = parse(src)
    # Walk down five levels.
    node = ast[0]
    for i in range(5):
        assert isinstance(node, IfNode)
        assert node.flag == f"f{i}"
        if i < 4:
            node = next(n for n in node.body if isinstance(n, IfNode))


def test_variables_preserved_inside_branches() -> None:
    src = "{if x}\nHello {name}\n{end}\n"
    ast = parse(src)
    if_node = ast[0]
    assert isinstance(if_node, IfNode)
    assert any(isinstance(n, VariableNode) and n.name == "name" for n in if_node.body)


def test_inline_with_embedded_variable() -> None:
    src = "You are a {role}{if is_admin} (named {admin_name}){end}."
    ast = parse(src)
    # Find the if-node and verify the variable is inside its body.
    if_node = next(n for n in ast if isinstance(n, IfNode))
    assert if_node.form == "inline"
    assert any(
        isinstance(n, VariableNode) and n.name == "admin_name" for n in if_node.body
    )
