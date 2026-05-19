"""Format-time input validation (SPEC v2 §5.5-§5.7, §7.4).

Runs before :func:`textprompts.syntax.renderer.render`. Walks the AST once
to collect every flag, variable, and switch-case reference — including
those inside inactive branches per §5.2 — then checks them against the
caller-supplied variables and flags.

Surfaces typed :class:`~textprompts.errors.FormatError` instances with
stable codes:

- ``E_MISSING_FLAGS_OBJECT``  — flags used by prompt, no ``flags`` passed.
- ``E_BAD_FLAGS_TYPE``        — ``flags`` was present but not a mapping.
- ``E_MISSING_FLAG``          — individual flag not present in ``flags``.
- ``E_MISSING_VARIABLE``      — variable not present in ``variables``.
- ``E_WRONG_FLAG_TYPE``       — wrong runtime type for a flag.
- ``E_INVALID_FLAG_VALUE``    — string passed for enum flag is not in the
                                 allowed value set.
- ``E_RESERVED_KEY``          — reserved keyword used as an *input key*
                                 (variable or flag). Reserved keyword
                                 *values* are allowed (§5.5 last paragraph).

Extra inputs (flags or variables not referenced by the prompt) are silently
ignored per §5.7.

Order of checks mirrors the TypeScript port ``format-validation.ts`` so the
cross-port conformance corpus stays byte-identical.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from ..errors import FormatError
from ..identifiers import RESERVED
from ..models import FlagDecl, PromptMeta
from .ast import Node
from .walker import FlagKind, RequiredRefs, collect_required_refs


def _is_mapping(value: object) -> bool:
    """True iff ``value`` is a mapping (dict-like) but not None."""
    return isinstance(value, Mapping)


def _describe_type(value: Any) -> str:
    if value is None:
        return "None"
    if isinstance(value, bool):
        return f"boolean {value!s}"
    if isinstance(value, str):
        return f"string '{value}'"
    if isinstance(value, (int, float)):
        return f"number {value!s}"
    if isinstance(value, (list, tuple)):
        return "array"
    return type(value).__name__


def validate_inputs(
    meta: PromptMeta,
    ast: Sequence[Node],
    variables: Mapping[str, Any] | None,
    flags: Mapping[str, Any] | None,
) -> None:
    """Validate ``variables`` and ``flags`` against the prompt AST.

    Throws a :class:`~textprompts.errors.FormatError` on the first problem
    found (no error aggregation).

    Order of checks:

      1. Reserved-key check on caller-supplied input *keys*
         (``variables`` + ``flags``). Reserved string *values* are allowed.
      2. Flag presence and type check, using declared ``meta.flags`` when
         available, falling back to inferred kind from body usage.
      3. Variable presence check.
    """
    refs = collect_required_refs(ast)
    all_flag_refs: set[str] = set(refs.flags.keys())
    uses_flags = len(all_flag_refs) > 0

    # 1. Reserved-key check on input *keys*. Reserved string *values* are OK.
    if variables is not None and _is_mapping(variables):
        for key in variables.keys():
            if key in RESERVED:
                raise FormatError(
                    f"Reserved keyword '{key}' cannot be used as a variable input key",
                    code="E_RESERVED_KEY",
                )
    if flags is not None and _is_mapping(flags):
        for key in flags.keys():
            if key in RESERVED:
                raise FormatError(
                    f"Reserved keyword '{key}' cannot be used as a flag input key",
                    code="E_RESERVED_KEY",
                )

    # 2. Flag presence and types.
    if uses_flags:
        if flags is None:
            names = ", ".join(sorted(all_flag_refs))
            raise FormatError(
                "Prompt requires 'flags' parameter but none was passed; "
                f"expected flags: [{names}]",
                code="E_MISSING_FLAGS_OBJECT",
            )
        if not _is_mapping(flags):
            raise FormatError(
                "'flags' parameter must be a mapping from flag name to value, "
                f"got {type(flags).__name__}",
                code="E_BAD_FLAGS_TYPE",
            )

        for name, kind in refs.flags.items():
            if name not in flags:
                raise FormatError(
                    f"Flag '{name}' required but not provided",
                    code="E_MISSING_FLAG",
                )
            _check_flag_value(
                name=name,
                value=flags[name],
                decl=meta.flags.get(name) if meta is not None else None,
                usage=kind,
                refs=refs,
            )

    # 3. Variable presence.
    if refs.variables:
        if variables is None or not _is_mapping(variables):
            # Variables container missing entirely — treat as missing for
            # every var.
            first = sorted(refs.variables)[0]
            raise FormatError(
                f"Variable '{first}' required but not provided",
                code="E_MISSING_VARIABLE",
            )
        for name in refs.variables:
            if name not in variables:
                raise FormatError(
                    f"Variable '{name}' required but not provided",
                    code="E_MISSING_VARIABLE",
                )


def _check_flag_value(
    *,
    name: str,
    value: Any,
    decl: FlagDecl | None,
    usage: FlagKind,
    refs: RequiredRefs,
) -> None:
    # Declared kind, if present, takes precedence over usage-inferred kind.
    if decl is not None:
        if decl.kind == "boolean":
            if type(value) is not bool:
                raise FormatError(
                    f"Flag '{name}' got {_describe_type(value)}, expected boolean",
                    code="E_WRONG_FLAG_TYPE",
                )
            return
        # enum
        values = decl.values or ()
        if not isinstance(value, str) or isinstance(value, bool):
            raise FormatError(
                f"Flag '{name}' got {_describe_type(value)}, "
                f"expected string (one of [{', '.join(values)}])",
                code="E_WRONG_FLAG_TYPE",
            )
        if value not in values:
            raise FormatError(
                f"Flag '{name}' got value '{value}', "
                f"expected one of [{', '.join(values)}]",
                code="E_INVALID_FLAG_VALUE",
            )
        return

    # Implicit mode (no declared flag). Infer from usage.
    if usage == "if":
        if type(value) is not bool:
            raise FormatError(
                f"Flag '{name}' got {_describe_type(value)}, "
                f"expected boolean (used in '{{if {name}}}')",
                code="E_WRONG_FLAG_TYPE",
            )
        return
    # switch usage
    if not isinstance(value, str) or isinstance(value, bool):
        raise FormatError(
            f"Flag '{name}' got {_describe_type(value)}, "
            f"expected string (used in '{{switch {name}}}')",
            code="E_WRONG_FLAG_TYPE",
        )
    cases = refs.enum_cases.get(name)
    if cases is not None and value not in cases and name not in refs.switches_with_else:
        raise FormatError(
            f"Flag '{name}' got value '{value}', "
            f"expected one of [{', '.join(sorted(cases))}] "
            f"(no '{{else}}' branch in '{{switch {name}}}')",
            code="E_INVALID_FLAG_VALUE",
        )


__all__ = ["validate_inputs"]
