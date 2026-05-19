"""AST node types produced by :mod:`textprompts.syntax.parser`.

Internal to the package. Deliberately small: not a lossless CST, not a
compiler IR — just enough structure to drive the SPEC §3.3 rendering rules
and collect referenced flags / variables for §5.2 validation.

Frozen dataclasses with tuple-typed child collections. AST is immutable
post-parse so the renderer (PHASE-5) and the required-refs walker can share
references without defensive copies.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Union


@dataclass(frozen=True, slots=True)
class TextNode:
    """Literal text between tags."""

    value: str


@dataclass(frozen=True, slots=True)
class VariableNode:
    """``{name}`` variable interpolation."""

    name: str


@dataclass(frozen=True, slots=True)
class CaseBranch:
    """One ``{case value}`` arm inside a ``{switch}`` node."""

    value: str
    body: tuple["Node", ...]


@dataclass(frozen=True, slots=True)
class IfNode:
    """``{if flag}...{end}`` or ``{if !flag}...{else}...{end}``.

    ``form`` records whether the construct was authored inline or as a block
    so the renderer can apply SPEC §3.3 whitespace rules without re-inspecting
    source. For block form, the parser strips control-keyword lines from each
    branch body; the renderer concatenates them as-is. ``else_body`` is
    ``None`` when no ``{else}`` was present.
    """

    flag: str
    negated: bool
    form: Literal["inline", "block"]
    body: tuple["Node", ...]
    else_body: tuple["Node", ...] | None


@dataclass(frozen=True, slots=True)
class SwitchNode:
    """``{switch flag}{case x}...{case y}...{else}...{end}``."""

    flag: str
    form: Literal["inline", "block"]
    cases: tuple[CaseBranch, ...]
    else_body: tuple["Node", ...] | None


Node = Union[TextNode, VariableNode, IfNode, SwitchNode]


__all__ = ["TextNode", "VariableNode", "CaseBranch", "IfNode", "SwitchNode", "Node"]
