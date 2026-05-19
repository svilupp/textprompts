"""Frontmatter schema for textprompts v2 (SPEC §4.3, §4.4).

Validates the ``[flags.*]`` and ``[variables.*]`` sections from already-parsed
frontmatter (TOML or YAML) and produces typed declaration records.

This module is intentionally narrow: it does **not** touch body parsing,
loader modes, or rendering. It receives a plain dict produced by the
frontmatter parser and returns validated declarations plus per-record
``extras`` for any unknown fields.

Error codes mirror the TypeScript port exactly — the cross-port conformance
contract (SPEC §7 / §11.4).
"""

from __future__ import annotations

from typing import Any

from .errors import FrontmatterError
from .identifiers import IDENTIFIER_RE, RESERVED
from .models import FlagDecl, VariableDecl

_FLAG_KNOWN_FIELDS: frozenset[str] = frozenset({"type", "values", "description"})
_VARIABLE_KNOWN_FIELDS: frozenset[str] = frozenset({"description"})


def _is_plain_object(value: Any) -> bool:
    """Mirror TS isPlainObject: dict-like, not array/list, not datetime."""
    return isinstance(value, dict)


def _assert_valid_identifier(name: str, path_label: str, role: str) -> None:
    if not IDENTIFIER_RE.match(name):
        raise FrontmatterError(
            f"invalid identifier {name!r} at {path_label}: "
            f"{role} must match [a-zA-Z_][a-zA-Z0-9_]*",
            code="E_INVALID_IDENTIFIER",
            path=path_label,
        )
    if name in RESERVED:
        raise FrontmatterError(
            f"reserved keyword {name!r} cannot be used as {role} at {path_label}",
            code="E_RESERVED_IDENTIFIER",
            path=path_label,
        )


def _type_label(value: Any) -> str:
    """A short type label used in error messages (mirrors JS ``typeof``)."""
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, str):
        return "string"
    if value is None:
        return "null"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    return type(value).__name__


def _parse_flag_decl(name: str, raw: Any) -> FlagDecl:
    path_label = f"flags.{name}"
    if not _is_plain_object(raw):
        raise FrontmatterError(
            f"flag {name!r} must be a table/object, got {_type_label(raw)}",
            code="E_BAD_SCHEMA_SHAPE",
            path=path_label,
        )

    raw_type = raw.get("type")
    if "type" not in raw:
        kind: str = "boolean"
    elif raw_type == "boolean" or raw_type == "enum":
        kind = raw_type
    else:
        raise FrontmatterError(
            f"flag {name!r} has invalid type {raw_type!r}: "
            'expected "boolean" or "enum"',
            code="E_INVALID_FLAG_TYPE",
            path=path_label,
        )

    description: str | None = None
    if "description" in raw and raw["description"] is not None:
        desc_raw = raw["description"]
        if not isinstance(desc_raw, str):
            raise FrontmatterError(
                f"flag {name!r} description must be a string",
                code="E_BAD_SCHEMA_SHAPE",
                path=f"{path_label}.description",
            )
        description = desc_raw

    extras: dict[str, Any] = {}
    for key, value in raw.items():
        if key not in _FLAG_KNOWN_FIELDS:
            extras[key] = value

    if kind == "boolean":
        if "values" in raw:
            raise FrontmatterError(
                f'boolean flag {name!r} must not declare "values"',
                code="E_INVALID_FLAG_VALUES",
                path=f"{path_label}.values",
            )
        return FlagDecl(
            kind="boolean", values=None, description=description, extras=extras
        )

    # enum
    if "values" not in raw:
        raise FrontmatterError(
            f'enum flag {name!r} requires non-empty "values" array',
            code="E_INVALID_FLAG_VALUES",
            path=f"{path_label}.values",
        )
    raw_values = raw["values"]
    if not isinstance(raw_values, list):
        raise FrontmatterError(
            f'enum flag {name!r} "values" must be an array',
            code="E_INVALID_FLAG_VALUES",
            path=f"{path_label}.values",
        )
    if len(raw_values) == 0:
        raise FrontmatterError(
            f'enum flag {name!r} "values" must not be empty',
            code="E_INVALID_FLAG_VALUES",
            path=f"{path_label}.values",
        )
    seen: set[str] = set()
    values: list[str] = []
    for v in raw_values:
        if not isinstance(v, str):
            raise FrontmatterError(
                f'enum flag {name!r} "values" entries must be identifier '
                f"strings, got {_type_label(v)}",
                code="E_INVALID_FLAG_VALUES",
                path=f"{path_label}.values",
            )
        if not IDENTIFIER_RE.match(v):
            raise FrontmatterError(
                f"enum flag {name!r} value {v!r} is not a valid identifier",
                code="E_INVALID_IDENTIFIER",
                path=f"{path_label}.values",
            )
        if v in RESERVED:
            raise FrontmatterError(
                f"enum flag {name!r} value {v!r} is a reserved keyword",
                code="E_RESERVED_IDENTIFIER",
                path=f"{path_label}.values",
            )
        if v in seen:
            raise FrontmatterError(
                f"enum flag {name!r} has duplicate value {v!r}",
                code="E_INVALID_FLAG_VALUES",
                path=f"{path_label}.values",
            )
        seen.add(v)
        values.append(v)

    return FlagDecl(
        kind="enum",
        values=tuple(values),
        description=description,
        extras=extras,
    )


def _parse_var_decl(name: str, raw: Any) -> VariableDecl:
    path_label = f"variables.{name}"
    if not _is_plain_object(raw):
        raise FrontmatterError(
            f"variable {name!r} must be a table/object, got {_type_label(raw)}",
            code="E_BAD_SCHEMA_SHAPE",
            path=path_label,
        )

    description: str | None = None
    if "description" in raw and raw["description"] is not None:
        desc_raw = raw["description"]
        if not isinstance(desc_raw, str):
            raise FrontmatterError(
                f"variable {name!r} description must be a string",
                code="E_BAD_SCHEMA_SHAPE",
                path=f"{path_label}.description",
            )
        description = desc_raw

    extras: dict[str, Any] = {}
    for key, value in raw.items():
        if key not in _VARIABLE_KNOWN_FIELDS:
            extras[key] = value

    return VariableDecl(description=description, extras=extras)


def parse_flags_and_variables(
    data: dict[str, Any],
) -> tuple[dict[str, FlagDecl], dict[str, VariableDecl], dict[str, Any]]:
    """Validate ``[flags.*]`` and ``[variables.*]`` sections.

    Returns a ``(flags, variables, top_level_extras)`` tuple. The third item
    is the original ``data`` dict with ``flags`` and ``variables`` keys
    removed (plus the standard PromptMeta fields filtered out by the caller).

    The caller (``_parser._ensure_prompt_meta``) is responsible for
    extracting standard fields (``title``, ``description``, ``version``,
    ``author``, ``created``) before or after this call — they remain in the
    returned ``top_level_extras`` dict only if the caller has not filtered
    them out.

    Raises:
        FrontmatterError: with stable ``code`` values
            ``E_INVALID_IDENTIFIER``, ``E_RESERVED_IDENTIFIER``,
            ``E_DUPLICATE_NAME``, ``E_INVALID_FLAG_TYPE``,
            ``E_INVALID_FLAG_VALUES``, ``E_BAD_SCHEMA_SHAPE``.
    """
    flags: dict[str, FlagDecl] = {}
    variables: dict[str, VariableDecl] = {}

    raw_flags = data.get("flags")
    if raw_flags is not None:
        if not _is_plain_object(raw_flags):
            raise FrontmatterError(
                f'"flags" section must be a table/object, got {_type_label(raw_flags)}',
                code="E_BAD_SCHEMA_SHAPE",
                path="flags",
            )
        for name, raw in raw_flags.items():
            _assert_valid_identifier(name, f"flags.{name}", "flag name")
            flags[name] = _parse_flag_decl(name, raw)

    raw_variables = data.get("variables")
    if raw_variables is not None:
        if not _is_plain_object(raw_variables):
            raise FrontmatterError(
                f'"variables" section must be a table/object, got '
                f"{_type_label(raw_variables)}",
                code="E_BAD_SCHEMA_SHAPE",
                path="variables",
            )
        for name, raw in raw_variables.items():
            _assert_valid_identifier(name, f"variables.{name}", "variable name")
            variables[name] = _parse_var_decl(name, raw)

    # Same name in flags and variables → E_DUPLICATE_NAME.
    for name in flags:
        if name in variables:
            raise FrontmatterError(
                f"name {name!r} is declared as both a flag and a variable",
                code="E_DUPLICATE_NAME",
                path=name,
            )

    # Build top-level extras: everything except flags/variables.
    top_level_extras: dict[str, Any] = {
        k: v for k, v in data.items() if k not in {"flags", "variables"}
    }

    return flags, variables, top_level_extras


__all__ = ["parse_flags_and_variables"]
