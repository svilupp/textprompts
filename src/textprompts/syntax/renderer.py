"""AST renderer (SPEC v2 §3.3 / §3.4).

Walks the AST produced by :func:`textprompts.syntax.parser.parse_body` and
emits the rendered string under the v2 whitespace rules. Format-time
validation lives in :mod:`textprompts.syntax.validator` and is expected to
have run first — the renderer trusts its inputs and does not surface
friendly errors for missing flags or variables.

For block form, the parser has already stripped control-keyword lines from
each branch body, so an active branch renders by concatenating its child
nodes verbatim. Inactive branches contribute nothing.

For inline form, the body nodes are substituted in place. Surrounding text
on adjacent sibling :class:`~textprompts.syntax.ast.TextNode` instances is
preserved without special whitespace handling.

Substitution is single-pass (cross-port invariant in ``CLAUDE.md``): a
variable value that itself contains ``{token}`` is **not** re-substituted.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from .ast import IfNode, Node, SwitchNode, TextNode, VariableNode


def _render_nodes(
    nodes: Sequence[Node],
    variables: Mapping[str, Any],
    flags: Mapping[str, Any] | None,
) -> str:
    parts: list[str] = []
    for node in nodes:
        parts.append(_render_node(node, variables, flags))
    return "".join(parts)


def _render_node(
    node: Node,
    variables: Mapping[str, Any],
    flags: Mapping[str, Any] | None,
) -> str:
    if isinstance(node, TextNode):
        return node.value
    if isinstance(node, VariableNode):
        # Validation should have caught missing variables. Fall through to
        # ``str(None)`` only as a defensive default.
        value = variables.get(node.name) if variables is not None else None
        return str(value)
    if isinstance(node, IfNode):
        raw = flags.get(node.flag) if flags is not None else None
        # Defensive: treat missing as falsy.
        if isinstance(raw, bool):
            truthy = raw
        else:
            truthy = raw is not None and raw != ""
        active = (not truthy) if node.negated else truthy
        if active:
            return _render_nodes(node.body, variables, flags)
        if node.else_body is not None:
            return _render_nodes(node.else_body, variables, flags)
        return ""
    if isinstance(node, SwitchNode):
        return _render_switch(node, variables, flags)
    # Unreachable for the union; keep mypy happy.
    raise TypeError(f"Unknown AST node: {type(node).__name__}")


def _render_switch(
    node: SwitchNode,
    variables: Mapping[str, Any],
    flags: Mapping[str, Any] | None,
) -> str:
    raw = flags.get(node.flag) if flags is not None else None
    # Cases match on string value. Booleans don't make sense in switch, but
    # tolerate by coercing to string for matching purposes — the validator
    # rejects bad declared-flag types before this point.
    if isinstance(raw, str):
        value = raw
    elif raw is None:
        value = ""
    else:
        value = str(raw)
    for case in node.cases:
        if case.value == value:
            return _render_nodes(case.body, variables, flags)
    if node.else_body is not None:
        return _render_nodes(node.else_body, variables, flags)
    return ""


def render(
    ast: Sequence[Node],
    variables: Mapping[str, Any],
    flags: Mapping[str, Any] | None,
) -> str:
    """Render an AST to a string given variable + flag inputs.

    Callers should invoke :func:`textprompts.syntax.validator.validate_inputs`
    first; the renderer trusts inputs and does not surface friendly errors
    for missing flags or variables.
    """
    return _render_nodes(ast, variables, flags)


__all__ = ["render"]
