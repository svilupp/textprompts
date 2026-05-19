from __future__ import annotations

from textprompts.syntax.ast import (
    CaseBranch,
    IfNode,
    SwitchNode,
    TextNode,
    VariableNode,
)
from textprompts.syntax.lexer import tokenize
from textprompts.syntax.parser import parse_body
from textprompts.syntax.renderer import render


def test_render_text_only() -> None:
    ast = (TextNode("hello world"),)
    assert render(ast, {}, None) == "hello world"


def test_render_text_plus_variable() -> None:
    ast = (TextNode("hi "), VariableNode("name"), TextNode("!"))
    assert render(ast, {"name": "Ada"}, None) == "hi Ada!"


def test_variable_substitution_is_single_pass() -> None:
    ast = (VariableNode("role"),)
    # Value contains another {token} — must NOT be re-substituted.
    assert render(ast, {"role": "{name}"}, None) == "{name}"


def test_if_true_branch() -> None:
    ast = (
        IfNode(
            flag="x",
            negated=False,
            form="inline",
            body=(TextNode("yes"),),
            else_body=(TextNode("no"),),
        ),
    )
    assert render(ast, {}, {"x": True}) == "yes"


def test_if_false_branch() -> None:
    ast = (
        IfNode(
            flag="x",
            negated=False,
            form="inline",
            body=(TextNode("yes"),),
            else_body=(TextNode("no"),),
        ),
    )
    assert render(ast, {}, {"x": False}) == "no"


def test_if_negated() -> None:
    ast = (
        IfNode(
            flag="x",
            negated=True,
            form="inline",
            body=(TextNode("not-x"),),
            else_body=None,
        ),
    )
    assert render(ast, {}, {"x": False}) == "not-x"
    assert render(ast, {}, {"x": True}) == ""


def test_if_without_else_false_yields_empty() -> None:
    ast = (
        IfNode(
            flag="x",
            negated=False,
            form="inline",
            body=(TextNode("hi"),),
            else_body=None,
        ),
    )
    assert render(ast, {}, {"x": False}) == ""


def test_switch_matches_case() -> None:
    ast = (
        SwitchNode(
            flag="tier",
            form="inline",
            cases=(
                CaseBranch(value="free", body=(TextNode("F"),)),
                CaseBranch(value="premium", body=(TextNode("P"),)),
            ),
            else_body=None,
        ),
    )
    assert render(ast, {}, {"tier": "premium"}) == "P"
    assert render(ast, {}, {"tier": "free"}) == "F"


def test_switch_no_match_uses_else_body() -> None:
    ast = (
        SwitchNode(
            flag="tier",
            form="inline",
            cases=(CaseBranch(value="free", body=(TextNode("F"),)),),
            else_body=(TextNode("DEFAULT"),),
        ),
    )
    assert render(ast, {}, {"tier": "enterprise"}) == "DEFAULT"


def test_reserved_keyword_value_renders_literally() -> None:
    ast = (VariableNode("role"),)
    assert render(ast, {"role": "end"}, None) == "end"


def test_block_keyword_line_elision() -> None:
    src = "prefix\n{if x}\ninside\n{end}\nsuffix\n"
    ast = parse_body(tokenize(src))

    # With flag=True, keyword lines are elided; "inside" line remains.
    out_true = render(ast, {}, {"x": True})
    assert "inside" in out_true
    # Keyword line itself must not appear.
    assert "{if x}" not in out_true
    assert "{end}" not in out_true
    assert out_true.startswith("prefix\n")
    assert out_true.rstrip().endswith("suffix")

    # With flag=False, the whole block disappears; surrounding text is kept.
    out_false = render(ast, {}, {"x": False})
    assert "inside" not in out_false
    assert "prefix" in out_false
    assert "suffix" in out_false
