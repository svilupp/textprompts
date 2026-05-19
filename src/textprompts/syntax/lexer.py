"""Body lexer for textprompts conditional syntax (SPEC v2 §2).

Consumes an already-prepared body string (BOM-stripped, LF newlines, dedent
applied — see :func:`textprompts.source.prepare_source`) and produces a flat
stream of tokens. The body parser turns tokens into the AST.

Lexer order on ``{`` per SPEC §2.1:

1. Control tag prefix (``if ``, ``switch ``, ``case ``, ``else}``, ``end}``).
2. Bare ``identifier}`` -> variable.
3. Else -> :class:`~textprompts.errors.ParseError` with a helpful diagnostic.

Escapes (§2.4) are resolved here: ``\\{``, ``\\}``, ``\\\\`` -> literal char.
Any other ``\\X`` sequence renders as the two literal characters.
"""

from __future__ import annotations

import re
from dataclasses import replace
from typing import Final

from ..errors import ParseError
from ..identifiers import validate_identifier
from .tokens import Token

_DIGIT_ONLY_RE: Final[re.Pattern[str]] = re.compile(r"^[0-9]+$")
_LEADING_TRAILING_WS_RE: Final[re.Pattern[str]] = re.compile(r"^\s|\s$")
_PREFIX_KEYWORD_RE: Final[re.Pattern[str]] = re.compile(
    r"^(if|switch|case)(\s|$)", re.IGNORECASE
)
_EXACT_KEYWORD_RE: Final[re.Pattern[str]] = re.compile(r"^(else|end)$", re.IGNORECASE)


def _make_error(
    message: str,
    *,
    code: str,
    line: int,
    column: int,
) -> ParseError:
    return ParseError(message, code=code, line=line, column=column)


def _find_tag_end(src: str, start: int) -> int:
    """Return index of ``}`` ending the tag at ``src[start] == '{'``.

    Returns ``-1`` if no closing ``}`` is found before EOF, a newline, or a
    nested ``{``. Newlines and nested ``{`` inside a tag are not permitted by
    SPEC §2 and surface as ``E_BAD_TAG``.
    """
    i = start + 1
    while i < len(src):
        ch = src[i]
        if ch == "}":
            return i
        if ch == "\n" or ch == "{":
            return -1
        i += 1
    return -1


class _LexerState:
    __slots__ = (
        "src",
        "pos",
        "line",
        "column",
        "tokens",
        "text_buf",
        "text_line",
        "text_column",
    )

    def __init__(self, src: str) -> None:
        self.src: str = src
        self.pos: int = 0
        self.line: int = 1
        self.column: int = 1
        self.tokens: list[Token] = []
        self.text_buf: list[str] = []
        self.text_line: int = -1
        self.text_column: int = -1

    def flush_text(self) -> None:
        if not self.text_buf:
            return
        self.tokens.append(
            Token(
                kind="TEXT",
                value="".join(self.text_buf),
                line=self.text_line,
                col=self.text_column,
            )
        )
        self.text_buf = []
        self.text_line = -1
        self.text_column = -1

    def append_char(self, ch: str, line: int, column: int) -> None:
        if not self.text_buf:
            self.text_line = line
            self.text_column = column
        self.text_buf.append(ch)

    def advance(self, n: int) -> None:
        for _ in range(n):
            ch = self.src[self.pos]
            self.pos += 1
            if ch == "\n":
                self.line += 1
                self.column = 1
            else:
                self.column += 1


def _validate_in_tag(name: str, role: str, *, line: int, column: int) -> None:
    """Wrap :func:`validate_identifier` to re-stamp ``line``/``column``."""
    try:
        validate_identifier(name, role=role)
    except ParseError as exc:
        raise ParseError(
            str(exc),
            code=exc.code,
            path=exc.path,
            line=line,
            column=column,
        ) from None


def _lex_tag(state: _LexerState) -> None:  # noqa: C901, PLR0912, PLR0915
    """Lex a single ``{...}`` tag starting at ``state.pos``."""
    open_line = state.line
    open_col = state.column
    tag_end = _find_tag_end(state.src, state.pos)
    if tag_end == -1:
        raise _make_error(
            "Unterminated tag: missing closing '}'",
            code="E_BAD_TAG",
            line=open_line,
            column=open_col,
        )
    inner = state.src[state.pos + 1 : tag_end]

    # Empty placeholder `{}`.
    if inner == "":
        raise _make_error(
            "Empty placeholder '{}' is not supported in v2 "
            "(use a named variable like {name})",
            code="E_BAD_TAG",
            line=open_line,
            column=open_col,
        )

    # Positional placeholders `{0}`, `{12}`.
    if _DIGIT_ONLY_RE.match(inner):
        raise _make_error(
            f"Positional placeholder '{{{inner}}}' is not supported in v2 "
            "(use a named variable)",
            code="E_BAD_TAG",
            line=open_line,
            column=open_col,
        )

    # Inside-brace whitespace.
    if _LEADING_TRAILING_WS_RE.search(inner):
        raise _make_error(
            f"Whitespace inside braces is not allowed: '{{{inner}}}'",
            code="E_BAD_TAG",
            line=open_line,
            column=open_col,
        )

    # Uppercase/mixed-case keyword detection.
    #
    # `if`/`switch`/`case` are control tags only when followed by whitespace
    # (or end-of-tag, which is the bare-keyword case handled below). So
    # `{Ifx}` is a variable but `{If flag}` is an uppercase keyword error.
    #
    # `else`/`end` are control tags only when the entire inner equals exactly
    # `else` / `end` (case-insensitively for this detection). So `{Endpoint}`
    # is a variable but `{End}` / `{ELSE}` are uppercase keyword errors.
    prefix_match = _PREFIX_KEYWORD_RE.match(inner)
    exact_match = _EXACT_KEYWORD_RE.match(inner)
    if prefix_match and prefix_match.group(1) != prefix_match.group(1).lower():
        kw = prefix_match.group(1)
        fixed = kw.lower() + inner[len(kw) :]
        raise _make_error(
            f"Keywords must be lowercase: '{{{inner}}}' (use '{{{fixed}}}')",
            code="E_BAD_TAG",
            line=open_line,
            column=open_col,
        )
    if exact_match and inner != inner.lower():
        fixed = inner.lower()
        raise _make_error(
            f"Keywords must be lowercase: '{{{inner}}}' (use '{{{fixed}}}')",
            code="E_BAD_TAG",
            line=open_line,
            column=open_col,
        )

    # `{else}` and `{end}` control tags.
    if inner == "else":
        state.advance(tag_end - state.pos + 1)
        state.tokens.append(Token(kind="ELSE", value="", line=open_line, col=open_col))
        return
    if inner == "end":
        state.advance(tag_end - state.pos + 1)
        state.tokens.append(Token(kind="END", value="", line=open_line, col=open_col))
        return

    # Bare keywords.
    if inner == "if":
        raise _make_error(
            "Bare '{if}' is missing a flag name",
            code="E_BAD_TAG",
            line=open_line,
            column=open_col,
        )
    if inner == "switch":
        raise _make_error(
            "Bare '{switch}' is missing a flag name",
            code="E_BAD_TAG",
            line=open_line,
            column=open_col,
        )
    if inner == "case":
        raise _make_error(
            "Bare '{case}' is missing a value",
            code="E_BAD_TAG",
            line=open_line,
            column=open_col,
        )

    # `{if ...}` / `{if !...}`.
    if inner.startswith("if "):
        rest = inner[3:]
        # SPEC §2.3: For the negated form `{if !flag}`, exactly one space is
        # required between `if` and `!`, and `!` must be immediately adjacent
        # to the identifier. For the non-negated form, one-or-more spaces are
        # accepted between `if` and the identifier.
        rest_trimmed = rest.lstrip(" ")
        if rest_trimmed == "":
            raise _make_error(
                f"Bare '{{{inner}}}' is missing a flag name",
                code="E_BAD_TAG",
                line=open_line,
                column=open_col,
            )
        if rest_trimmed.startswith("!"):
            # Negated form must use exactly one space between `if` and `!`.
            # `inner.startswith("if ")` already consumed one; if `rest` itself
            # starts with another space, that is a parse error.
            if rest.startswith(" "):
                raise _make_error(
                    f"Negation '{{if !flag}}' requires exactly one space after 'if': '{{{inner}}}'",
                    code="E_BAD_TAG",
                    line=open_line,
                    column=open_col,
                )
            negated = True
            after_bang = rest_trimmed[1:]
            if after_bang == "":
                raise _make_error(
                    "Bare '{if !}' is missing a flag name",
                    code="E_BAD_TAG",
                    line=open_line,
                    column=open_col,
                )
            if after_bang[0].isspace():
                raise _make_error(
                    f"Negation '!' must be immediately adjacent to the identifier: '{{{inner}}}'",
                    code="E_BAD_TAG",
                    line=open_line,
                    column=open_col,
                )
            name = after_bang
        else:
            negated = False
            name = rest_trimmed
        _validate_in_tag(
            name,
            f"{{if {'!' if negated else ''}{name}}}",
            line=open_line,
            column=open_col,
        )
        state.advance(tag_end - state.pos + 1)
        state.tokens.append(
            Token(
                kind="OPEN_IF_NOT" if negated else "OPEN_IF",
                value=name,
                line=open_line,
                col=open_col,
                negated=negated,
            )
        )
        return

    # `{switch flag}`.
    if inner.startswith("switch "):
        name = inner[7:].lstrip(" ")
        if name == "":
            raise _make_error(
                f"Bare '{{{inner}}}' is missing a flag name",
                code="E_BAD_TAG",
                line=open_line,
                column=open_col,
            )
        _validate_in_tag(name, f"{{switch {name}}}", line=open_line, column=open_col)
        state.advance(tag_end - state.pos + 1)
        state.tokens.append(
            Token(kind="OPEN_SWITCH", value=name, line=open_line, col=open_col)
        )
        return

    # `{case value}`.
    if inner.startswith("case "):
        value = inner[5:].lstrip(" ")
        if value == "":
            raise _make_error(
                f"Bare '{{{inner}}}' is missing a value",
                code="E_BAD_TAG",
                line=open_line,
                column=open_col,
            )
        if value.startswith("!"):
            raise _make_error(
                f"Negation is not allowed in '{{case}}': '{{{inner}}}'",
                code="E_BAD_TAG",
                line=open_line,
                column=open_col,
            )
        _validate_in_tag(value, f"{{case {value}}}", line=open_line, column=open_col)
        state.advance(tag_end - state.pos + 1)
        state.tokens.append(
            Token(kind="CASE", value=value, line=open_line, col=open_col)
        )
        return

    # No control-tag prefix matched -> bare variable.
    _validate_in_tag(inner, f"{{{inner}}}", line=open_line, column=open_col)
    state.advance(tag_end - state.pos + 1)
    state.tokens.append(Token(kind="VAR", value=inner, line=open_line, col=open_col))


def _annotate_alone_on_line(tokens: list[Token]) -> list[Token]:
    """Set ``alone_on_line`` on control tokens whose surrounding text is whitespace-only on that line.

    Best-effort hint for downstream consumers; the parser's authoritative
    block-vs-inline detection looks at the same neighborhoods. Matches the
    TS body-parser ``isKeywordAloneOnLine`` rule.
    """
    out: list[Token] = []
    for i, tok in enumerate(tokens):
        if tok.kind == "TEXT" or tok.kind == "VAR":
            out.append(tok)
            continue

        # alone_before
        alone_before = True
        if i > 0:
            prev = tokens[i - 1]
            if prev.kind == "TEXT":
                v = prev.value
                last_nl = v.rfind("\n")
                tail = v if last_nl == -1 else v[last_nl + 1 :]
                if tail.strip() != "":
                    alone_before = False
                if last_nl == -1 and i - 1 == 0:
                    # No newline at all before this token: tail is the whole
                    # value. Already covered by the trim check above.
                    pass
                elif last_nl == -1:
                    # No newline in immediate prev; but a previous token might
                    # be a tag on the same line. We can't easily walk back
                    # further here — the parser does the authoritative check.
                    pass
            else:
                # Previous token is another tag with no text gap.
                alone_before = False

        # alone_after
        alone_after = True
        if i + 1 < len(tokens):
            nxt = tokens[i + 1]
            if nxt.kind == "TEXT":
                v = nxt.value
                first_nl = v.find("\n")
                head = v if first_nl == -1 else v[:first_nl]
                if head.strip() != "":
                    alone_after = False
            else:
                alone_after = False

        out.append(replace(tok, alone_on_line=alone_before and alone_after))
    return out


def tokenize(body: str) -> list[Token]:
    """Tokenize a prompt body.

    ``body`` must already have been processed by
    :func:`textprompts.source.prepare_source` (BOM stripped, LF newlines).

    Raises:
        ParseError: on any malformed tag with a stable ``code``.
    """
    state = _LexerState(body)
    while state.pos < len(state.src):
        ch = state.src[state.pos]

        if ch == "\\":
            nxt = state.src[state.pos + 1] if state.pos + 1 < len(state.src) else ""
            if nxt in ("{", "}", "\\"):
                state.append_char(nxt, state.line, state.column)
                state.advance(2)
                continue
            # Any other `\X`: emit the backslash literally and continue.
            state.append_char(ch, state.line, state.column)
            state.advance(1)
            continue

        if ch == "{":
            state.flush_text()
            _lex_tag(state)
            continue

        state.append_char(ch, state.line, state.column)
        state.advance(1)

    state.flush_text()
    return _annotate_alone_on_line(state.tokens)


__all__ = ["tokenize"]
