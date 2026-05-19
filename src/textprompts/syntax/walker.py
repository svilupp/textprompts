"""Shared AST walker: collect every flag, switch, and variable reference.

Walks the full AST, visiting both branches of every ``{if}`` and every
``{case}`` plus any ``{else}`` of every ``{switch}``. This is the SPEC §5.2
critical rule in code form — required references are the union of every
branch, never short-circuited by a flag's runtime value.

Same flag name used as both ``{if}`` and ``{switch}`` is a load-time
:class:`~textprompts.errors.SemanticError` with code
``E_FLAG_USED_AS_BOTH_IF_AND_SWITCH``.

The result powers two downstream consumers:

1. PHASE-4 loader reconciliation (cross-check body refs vs
   ``[flags.*]`` / ``[variables.*]`` declarations).
2. PHASE-5 ``Prompt.format`` input validation.

Defining it here keeps "what does this prompt require?" in one place,
so the two consumers cannot drift.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Literal

from ..errors import SemanticError
from .ast import IfNode, Node, SwitchNode, VariableNode

FlagKind = Literal["if", "switch"]


@dataclass(frozen=True, slots=True)
class RequiredRefs:
    """Body references gathered from a prompt AST.

    Attributes:
        flags: Flag name -> usage kind (``"if"`` for boolean usage,
            ``"switch"`` for enum usage). A given flag is recorded under one
            kind; mixing both is rejected by :func:`collect_required_refs`.
        enum_cases: For each flag used in a ``{switch}``, the set of
            ``{case X}`` values that appear in the body. Defaults to an empty
            ``frozenset`` for flags used only in ``{if}``.
        variables: Variable names referenced anywhere in the body.
        switches_with_else: Flags used in a ``{switch}`` that has an
            ``{else}`` branch at least once. Used by the loader's
            exhaustiveness check.
    """

    flags: dict[str, FlagKind] = field(default_factory=dict)
    enum_cases: dict[str, frozenset[str]] = field(default_factory=dict)
    variables: frozenset[str] = field(default_factory=frozenset)
    switches_with_else: frozenset[str] = field(default_factory=frozenset)


def _walk(
    nodes: Sequence[Node],
    *,
    if_flags: set[str],
    switch_cases: dict[str, set[str]],
    switches_with_else: set[str],
    variables: set[str],
) -> None:
    for node in nodes:
        if isinstance(node, VariableNode):
            variables.add(node.name)
            continue
        if isinstance(node, IfNode):
            if_flags.add(node.flag)
            _walk(
                node.body,
                if_flags=if_flags,
                switch_cases=switch_cases,
                switches_with_else=switches_with_else,
                variables=variables,
            )
            if node.else_body is not None:
                _walk(
                    node.else_body,
                    if_flags=if_flags,
                    switch_cases=switch_cases,
                    switches_with_else=switches_with_else,
                    variables=variables,
                )
            continue
        if isinstance(node, SwitchNode):
            cases = switch_cases.setdefault(node.flag, set())
            for branch in node.cases:
                cases.add(branch.value)
                _walk(
                    branch.body,
                    if_flags=if_flags,
                    switch_cases=switch_cases,
                    switches_with_else=switches_with_else,
                    variables=variables,
                )
            if node.else_body is not None:
                switches_with_else.add(node.flag)
                _walk(
                    node.else_body,
                    if_flags=if_flags,
                    switch_cases=switch_cases,
                    switches_with_else=switches_with_else,
                    variables=variables,
                )
            continue
        # TextNode: no refs to collect.


def collect_required_refs(ast: Sequence[Node]) -> RequiredRefs:
    """Walk ``ast`` and collect every referenced flag, switch, and variable.

    Visits **all** branches — both the ``body`` and ``else_body`` of every
    ``{if}``, and the body of every ``{case}`` plus any ``{else}`` of every
    ``{switch}`` — per SPEC §5.2. Never short-circuits.

    Raises:
        SemanticError: with code ``E_FLAG_USED_AS_BOTH_IF_AND_SWITCH`` when
            the same flag name appears as both ``{if foo}`` and
            ``{switch foo}`` anywhere in the body.
    """
    if_flags: set[str] = set()
    switch_cases: dict[str, set[str]] = {}
    switches_with_else: set[str] = set()
    variables: set[str] = set()

    _walk(
        ast,
        if_flags=if_flags,
        switch_cases=switch_cases,
        switches_with_else=switches_with_else,
        variables=variables,
    )

    # A flag name may appear as either {if foo} or {switch foo}, never both.
    overlap = if_flags & switch_cases.keys()
    if overlap:
        name = sorted(overlap)[0]
        raise SemanticError(
            f"Flag '{name}' is used as both '{{if {name}}}' and '{{switch {name}}}' "
            "in the prompt body; a flag must be either boolean or enum, never both",
            code="E_FLAG_USED_AS_BOTH_IF_AND_SWITCH",
        )

    flags: dict[str, FlagKind] = {}
    for name in if_flags:
        flags[name] = "if"
    for name in switch_cases:
        flags[name] = "switch"

    enum_cases: dict[str, frozenset[str]] = {
        name: frozenset(values) for name, values in switch_cases.items()
    }

    return RequiredRefs(
        flags=flags,
        enum_cases=enum_cases,
        variables=frozenset(variables),
        switches_with_else=frozenset(switches_with_else),
    )


__all__ = ["RequiredRefs", "FlagKind", "collect_required_refs"]
