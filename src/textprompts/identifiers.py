"""Identifier validation for textprompts v2 syntax (SPEC §2.1).

Shared rule source for every layer that touches variable/flag/case names: the
lexer, the frontmatter schema parser, and format-time input validation. Keeping
this in one module guarantees those layers cannot drift.
"""

from __future__ import annotations

import re
from typing import Final

from .errors import ParseError

# Reserved keywords. Cannot be used as variable names, flag names, or enum case
# values. `flags` is reserved by the format API surface (a variable named
# `flags` would collide with the dedicated `flags=` parameter).
RESERVED: Final[frozenset[str]] = frozenset(
    {"if", "else", "end", "switch", "case", "flags"}
)

# Identifier rule: ASCII snake_case. Must start with letter or underscore.
IDENTIFIER_RE: Final[re.Pattern[str]] = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")

# Sub-pattern used to give a more helpful error when an identifier starts with
# a digit.
_LEADING_DIGIT_RE: Final[re.Pattern[str]] = re.compile(r"^[0-9]")


def validate_identifier(name: str, *, role: str) -> None:
    """Validate ``name`` as a textprompts identifier.

    ``role`` is the human-facing noun describing where the identifier appears
    (for example ``"flag name"``, ``"variable name"``, ``"enum value"``,
    ``"{if flag}"``). It is included verbatim in the raised error message.

    Raises:
        ParseError: with a stable ``code``:

            * ``E_BAD_TAG`` when ``name`` is empty.
            * ``E_INVALID_IDENTIFIER`` when ``name`` does not match
              :data:`IDENTIFIER_RE`.
            * ``E_RESERVED_IDENTIFIER`` when ``name`` is in :data:`RESERVED`.
    """
    if name == "":
        raise ParseError(f"Empty identifier in {role}", code="E_BAD_TAG")
    if not IDENTIFIER_RE.match(name):
        if "-" in name:
            raise ParseError(
                f"Invalid identifier '{name}' in {role}: "
                "dashes are not allowed (use snake_case)",
                code="E_INVALID_IDENTIFIER",
            )
        if _LEADING_DIGIT_RE.match(name):
            raise ParseError(
                f"Invalid identifier '{name}' in {role}: "
                "identifiers must start with a letter or underscore",
                code="E_INVALID_IDENTIFIER",
            )
        raise ParseError(
            f"Invalid identifier '{name}' in {role}: must match [a-zA-Z_][a-zA-Z0-9_]*",
            code="E_INVALID_IDENTIFIER",
        )
    if name in RESERVED:
        raise ParseError(
            f"Reserved keyword '{name}' cannot be used as an identifier in {role}",
            code="E_RESERVED_IDENTIFIER",
        )


__all__ = ["RESERVED", "IDENTIFIER_RE", "validate_identifier"]
