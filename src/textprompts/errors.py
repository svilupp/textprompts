"""Typed errors for textprompts.

The v1 surface (``FileMissingError``, ``MissingMetadataError``,
``InvalidMetadataError``, ``MalformedHeaderError``) is preserved. v2 adds
four code-bearing error classes mirroring the TypeScript port:

* :class:`ParseError` — lexer / body-parser errors (malformed tags,
  structural mistakes, identifier-validity problems in the prompt body).
* :class:`FrontmatterError` — ``[flags.*]`` / ``[variables.*]`` schema errors.
* :class:`SemanticError` — load-time semantic disagreements between
  frontmatter declarations and body usage.
* :class:`FormatError` — format-time input validation errors.

Each carries a stable ``code`` (string literal) plus optional ``path``,
``line``, and ``column`` context. The codes are the cross-port conformance
contract (SPEC §7 / §11.4).
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal


class TextPromptsError(Exception):
    """Base class for every error raised by textprompts."""


class FileMissingError(TextPromptsError):
    def __init__(self, path: Path):
        super().__init__(f"File not found: {path}")


class MissingMetadataError(TextPromptsError):
    """Metadata required but missing (strict mode)."""


class InvalidMetadataError(TextPromptsError):
    """Frontmatter parsed but failed standard-field validation."""


class MalformedHeaderError(TextPromptsError):
    """Frontmatter delimiters are malformed (missing/misplaced ``---``)."""


# ---------------------------------------------------------------------------
# v2 error classes — code-bearing, line/column-bearing.
# ---------------------------------------------------------------------------


# Frontmatter schema validation codes. See ``frontmatter_schema`` (PHASE-4).
FrontmatterErrorCode = Literal[
    "E_INVALID_IDENTIFIER",
    "E_RESERVED_IDENTIFIER",
    "E_DUPLICATE_NAME",
    "E_INVALID_FLAG_TYPE",
    "E_INVALID_FLAG_VALUES",
    "E_BAD_SCHEMA_SHAPE",
]

# Format-time input validation codes. See ``format_validation`` (PHASE-5).
FormatErrorCode = Literal[
    "E_MISSING_FLAGS_OBJECT",
    "E_BAD_FLAGS_TYPE",
    "E_MISSING_FLAG",
    "E_MISSING_VARIABLE",
    "E_WRONG_FLAG_TYPE",
    "E_INVALID_FLAG_VALUE",
    "E_RESERVED_KEY",
]

# Load-time semantic validation codes. See ``parser_core`` (PHASE-4).
SemanticErrorCode = Literal[
    "E_UNDECLARED_FLAG",
    "E_FLAG_USED_AS_BOTH_IF_AND_SWITCH",
    "E_NON_EXHAUSTIVE_SWITCH",
    "E_INVALID_CASE_VALUE",
    "E_FLAG_AND_VARIABLE_COLLISION",
]


class ParseError(TextPromptsError):
    """Lexer / body-parser error.

    Carries a stable ``code`` (e.g. ``E_UNCLOSED_IF``, ``E_BAD_TAG``,
    ``E_DUPLICATE_CASE``) plus optional ``path``, ``line``, ``column``
    context. Line and column are 1-based positions in the *prepared* source
    (post BOM strip / CRLF normalize / dedent). Exact source mapping is
    best-effort and not part of the conformance contract.
    """

    code: str | None
    path: str | None
    line: int | None
    column: int | None

    def __init__(
        self,
        message: str,
        *,
        code: str | None = None,
        path: str | None = None,
        line: int | None = None,
        column: int | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.path = path
        self.line = line
        self.column = column


class FrontmatterError(TextPromptsError):
    """Frontmatter schema validation error (``[flags.*]`` / ``[variables.*]``)."""

    code: FrontmatterErrorCode | None
    path: str | None
    line: int | None
    column: int | None

    def __init__(
        self,
        message: str,
        *,
        code: FrontmatterErrorCode | None = None,
        path: str | None = None,
        line: int | None = None,
        column: int | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.path = path
        self.line = line
        self.column = column


class SemanticError(TextPromptsError):
    """Load-time semantic error: frontmatter and body usage disagree."""

    code: SemanticErrorCode | None
    path: str | None
    line: int | None
    column: int | None

    def __init__(
        self,
        message: str,
        *,
        code: SemanticErrorCode | None = None,
        path: str | None = None,
        line: int | None = None,
        column: int | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.path = path
        self.line = line
        self.column = column


class FormatError(TextPromptsError):
    """Format-time input validation error.

    Raised by ``Prompt.format`` (PHASE-6) when required inputs are missing,
    have the wrong type, or use a reserved keyword as their key. See SPEC
    §5.5–§5.7 and §7.4.
    """

    code: FormatErrorCode | None
    path: str | None
    line: int | None
    column: int | None

    def __init__(
        self,
        message: str,
        *,
        code: FormatErrorCode | None = None,
        path: str | None = None,
        line: int | None = None,
        column: int | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.path = path
        self.line = line
        self.column = column


__all__ = [
    "TextPromptsError",
    "FileMissingError",
    "MissingMetadataError",
    "InvalidMetadataError",
    "MalformedHeaderError",
    "ParseError",
    "FrontmatterError",
    "SemanticError",
    "FormatError",
    "FrontmatterErrorCode",
    "FormatErrorCode",
    "SemanticErrorCode",
]
