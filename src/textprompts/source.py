"""Source preprocessing for prompt bodies (SPEC §2.5, §11.1).

Single shared path every body reaches before lexing/parsing:

1. Strip a leading UTF-8 BOM (``\\ufeff``) if present.
2. Normalize line endings: ``\\r\\n`` and lone ``\\r`` both become ``\\n``.
3. Optionally apply common-leading-whitespace dedent. Off by default for
   file-loaded prompts (where line 1 has zero indent and dedent is a no-op);
   on for ``Prompt.from_string`` callers passing indented triple-quoted
   string literals.

This helper exists so the lexer, parser, and renderer never have to redo
these steps. The TypeScript port's ``prepareSource`` is the reference.
"""

from __future__ import annotations

import re
from typing import Final

_BOM: Final[str] = "﻿"
_CRLF_OR_CR: Final[re.Pattern[str]] = re.compile(r"\r\n?")
_LEADING_HTABS: Final[re.Pattern[str]] = re.compile(r"^[ \t]*")


def _strip_bom(text: str) -> str:
    if text.startswith(_BOM):
        return text[1:]
    return text


def _normalize_newlines(text: str) -> str:
    return _CRLF_OR_CR.sub("\n", text)


def _common_leading_whitespace(lines: list[str]) -> int:
    """Minimum leading-whitespace shared by all non-blank lines.

    Tabs and spaces both count as one column each (SPEC §2.5: no
    tab-vs-space significance for the dedent).
    """
    minimum: int | None = None
    for line in lines:
        if line.strip() == "":
            continue
        match = _LEADING_HTABS.match(line)
        indent = match.end() if match else 0
        if minimum is None or indent < minimum:
            minimum = indent
        if minimum == 0:
            return 0
    return minimum if minimum is not None else 0


def _dedent(text: str) -> str:
    lines = text.split("\n")
    minimum = _common_leading_whitespace(lines)
    if minimum == 0:
        return text
    return "\n".join("" if line.strip() == "" else line[minimum:] for line in lines)


def prepare_source(content: str, *, dedent: bool = False) -> str:
    """Apply BOM strip + CRLF normalize (+ optional dedent) exactly once.

    Args:
        content: Raw source text.
        dedent: When ``True``, strip the minimum common leading whitespace
            shared by all non-blank lines. Defaults to ``False`` — file-loaded
            content rarely needs this (line 1 has zero indent) and it would
            otherwise be a quiet correctness risk if line 1 happens to start
            with whitespace.

    Returns:
        Preprocessed text. Callers downstream must not redo any of these steps.
    """
    out = _strip_bom(content)
    out = _normalize_newlines(out)
    if dedent:
        out = _dedent(out)
    return out


__all__ = ["prepare_source"]
