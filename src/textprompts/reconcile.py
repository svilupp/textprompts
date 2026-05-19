"""Body-vs-declared reconciliation (SPEC §4.7).

Load-time check that body usage of flags/variables agrees with the
frontmatter declarations. Walks the AST once via the shared
:func:`textprompts.syntax.walker.collect_required_refs` (no second walker
is defined here).

Error codes mirror the TypeScript port exactly.
"""

from __future__ import annotations

from collections.abc import Sequence

from .config import MetadataMode
from .errors import FrontmatterError, SemanticError
from .models import FlagDecl, VariableDecl
from .syntax.ast import Node
from .syntax.walker import collect_required_refs


def reconcile(
    ast: Sequence[Node],
    declared_flags: dict[str, FlagDecl],
    declared_variables: dict[str, VariableDecl],
    mode: MetadataMode,
    *,
    source_path: str | None = None,
) -> dict[str, FlagDecl]:
    """Check that body usage agrees with declarations.

    Args:
        ast: The parsed body AST (output of ``parse_body``).
        declared_flags: ``[flags.*]`` declarations.
        declared_variables: ``[variables.*]`` declarations (used only for
            collision detection — body variables are never required to be
            declared, even in strict mode, per SPEC §4.6).
        mode: The active :class:`MetadataMode`. ``STRICT`` adds two extra
            requirements:

            * every flag referenced in the body must be declared, and
            * every declared flag must have a non-empty ``description``.
        source_path: Optional source path for error context.

    Returns:
        A mapping of synthesized :class:`FlagDecl` records for flags that are
        referenced in the body but not declared in ``[flags.*]``. Boolean
        usage (``{if name}``) produces ``FlagDecl(kind="boolean")`` with
        ``values=None``; enum usage (``{switch name}``) produces
        ``FlagDecl(kind="enum", values=...)`` with the observed case values.
        Names already in ``declared_flags`` are NOT included (no override).
        Validation behavior is unchanged.

    Raises:
        SemanticError: with stable ``code`` values
            ``E_FLAG_USED_AS_BOTH_IF_AND_SWITCH``,
            ``E_NON_EXHAUSTIVE_SWITCH``, ``E_INVALID_CASE_VALUE``,
            ``E_FLAG_AND_VARIABLE_COLLISION``, ``E_UNDECLARED_FLAG``.
        FrontmatterError: ``E_BAD_SCHEMA_SHAPE`` when strict mode finds a
            declared flag without a non-empty description.
    """
    refs = collect_required_refs(ast)

    # Same name as variable AND flag in body usage → semantic error.
    for name in refs.variables:
        if name in refs.flags:
            raise SemanticError(
                f"Name '{name}' is used as both a flag and a variable "
                "in the prompt body",
                code="E_FLAG_AND_VARIABLE_COLLISION",
                path=source_path,
            )

    _ = declared_variables  # Reserved for future use; currently no check fires.

    if getattr(mode, "value", mode) == MetadataMode.STRICT.value:
        # Every flag referenced in body must be declared.
        for name in refs.flags:
            if name not in declared_flags:
                raise SemanticError(
                    f"Flag '{name}' used in body but not declared in "
                    "[flags.*] (strict mode)",
                    code="E_UNDECLARED_FLAG",
                    path=source_path,
                )
        # Every declared flag must have a non-empty description.
        for name, decl in declared_flags.items():
            desc = decl.description
            if desc is None or desc.strip() == "":
                raise FrontmatterError(
                    f"Flag '{name}' is declared without a non-empty "
                    "description (strict mode)",
                    code="E_BAD_SCHEMA_SHAPE",
                    path=f"flags.{name}.description",
                )

    # Type-shape disagreements (apply under both "allow" and "strict" when a
    # declaration is present).
    for name, kind in refs.flags.items():
        decl_t: FlagDecl | None = declared_flags.get(name)
        if decl_t is None:
            continue
        if kind == "if" and decl_t.kind == "enum":
            raise SemanticError(
                f"Flag '{name}' is declared as enum but used in "
                f"'{{if {name}}}'; switch on it instead",
                code="E_FLAG_USED_AS_BOTH_IF_AND_SWITCH",
                path=source_path,
            )
        if kind == "switch" and decl_t.kind == "boolean":
            raise SemanticError(
                f"Flag '{name}' is declared as boolean but used in '{{switch {name}}}'",
                code="E_FLAG_USED_AS_BOTH_IF_AND_SWITCH",
                path=source_path,
            )

    # Enum case-value validity + exhaustiveness.
    for name, case_values in refs.enum_cases.items():
        decl_e: FlagDecl | None = declared_flags.get(name)
        if decl_e is None or decl_e.kind != "enum":
            continue
        declared_values = decl_e.values or ()
        # Each case value must be in declared values.
        for v in case_values:
            if v not in declared_values:
                raise SemanticError(
                    f"'{{case {v}}}' is not a declared value of enum flag "
                    f"'{name}' (declared: [{', '.join(declared_values)}])",
                    code="E_INVALID_CASE_VALUE",
                    path=source_path,
                )
        # Exhaustiveness: every declared value must appear in cases, unless
        # an {else} branch is present.
        if name in refs.switches_with_else:
            continue
        missing = [v for v in declared_values if v not in case_values]
        if missing:
            raise SemanticError(
                f"Switch on '{name}' missing cases: [{', '.join(missing)}]. "
                "Add a '{case}' for each, or add '{else}'.",
                code="E_NON_EXHAUSTIVE_SWITCH",
                path=source_path,
            )

    # Materialize implicit FlagDecls for body-only flags so callers can
    # introspect them via ``prompt.meta.flags`` (SPEC §4.5). Mirrors the
    # TypeScript port's ``addImplicitFlagDecls`` (see
    # ``packages/textprompts-ts/src/parser-core.ts``). Names that already
    # appear in ``declared_flags`` are NOT included — declared records win.
    #
    # Ordering note: TS uses ``Set<string>`` which preserves insertion order
    # for switch cases. Python's ``frozenset`` does not, so case values are
    # emitted in sorted order for determinism. This is a known minor
    # deviation from the TS reference's body-order ordering.
    implicit: dict[str, FlagDecl] = {}
    for name, kind in refs.flags.items():
        if name in declared_flags:
            continue
        if kind == "if":
            implicit[name] = FlagDecl(
                kind="boolean", values=None, description=None, extras={}
            )
        elif kind == "switch":
            values = refs.enum_cases.get(name, frozenset())
            implicit[name] = FlagDecl(
                kind="enum",
                values=tuple(sorted(values)),
                description=None,
                extras={},
            )
    return implicit


__all__ = ["reconcile"]
