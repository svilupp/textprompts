"""Token dataclass produced by :mod:`textprompts.syntax.lexer`.

A lexer Token is a flat record: kind, value, and 1-based ``line``/``column``
position in the prepared source (post BOM strip / CRLF normalize / dedent).
The optional ``alone_on_line`` flag is set on control tokens that were
emitted from a line containing only the control tag plus surrounding
whitespace; the body parser uses it to detect block vs inline form per
SPEC §3.2. ``negated`` is set on ``OPEN_IF_NOT`` tokens.

The lexer does not emit a separate NEWLINE token; newlines inside ``TEXT``
values are preserved verbatim.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final, Literal

TokenKind = Literal[
    "TEXT",
    "VAR",
    "OPEN_IF",
    "OPEN_IF_NOT",
    "ELSE",
    "END",
    "OPEN_SWITCH",
    "CASE",
]

# Kinds whose semantics are "structural control" rather than rendered content.
CONTROL_KINDS: Final[frozenset[str]] = frozenset(
    {"OPEN_IF", "OPEN_IF_NOT", "ELSE", "END", "OPEN_SWITCH", "CASE"}
)


@dataclass(frozen=True, slots=True)
class Token:
    """A single lexer token.

    Attributes:
        kind: Discriminator. One of :data:`TokenKind`.
        value: For ``TEXT``: the literal text. For ``VAR``, ``OPEN_IF``,
            ``OPEN_IF_NOT``, ``OPEN_SWITCH``, ``CASE``: the identifier
            (variable name, flag name, or case value). For ``ELSE`` / ``END``:
            empty string.
        line: 1-based line of the token's start in the prepared source.
        col: 1-based column of the token's start in the prepared source.
        alone_on_line: ``True`` when the token is a control token and was
            emitted from a line containing only the control tag plus
            surrounding whitespace. Best-effort; the parser may recompute
            from surrounding text tokens for robustness.
        negated: ``True`` for ``OPEN_IF_NOT`` tokens, else ``False``.
    """

    kind: TokenKind
    value: str
    line: int
    col: int
    alone_on_line: bool = False
    negated: bool = False


__all__ = ["Token", "TokenKind", "CONTROL_KINDS"]
