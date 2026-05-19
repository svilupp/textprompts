"""Recursive-descent body parser: tokens -> AST.

Enforces SPEC §3.1 (structural rules), §3.2 (inline vs block form,
mixed-form forbidden), and §3.5 (nesting). Does not render — that is
PHASE-5.

Form rules (§3.2):

* **Inline:** the opener has non-whitespace content on its line either
  before or after it (or both). Every related keyword (``{else}``,
  ``{case}``, closing ``{end}``) must be on the same line as the opener.
* **Block:** the opener is alone on its line (only whitespace before, only
  whitespace + newline after). Every related keyword must also be alone
  on its line. For block form the parser strips the keyword lines from
  each branch body so the renderer doesn't need to re-parse leading
  trivia.
* Mixed forms are a parse error (``E_MIXED_FORM``).

Codes mirror the TypeScript port (``packages/textprompts-ts``) — the
fixture corpus is the cross-port contract.
"""

from __future__ import annotations

from collections.abc import Sequence

from ..errors import ParseError
from .ast import CaseBranch, IfNode, Node, SwitchNode, TextNode, VariableNode
from .tokens import Token, TokenKind


def _make_error(
    message: str,
    *,
    code: str,
    line: int | None = None,
    column: int | None = None,
) -> ParseError:
    return ParseError(message, code=code, line=line, column=column)


def _describe(tok: Token) -> str:
    match tok.kind:
        case "OPEN_IF":
            return f"{{if {tok.value}}}"
        case "OPEN_IF_NOT":
            return f"{{if !{tok.value}}}"
        case "OPEN_SWITCH":
            return f"{{switch {tok.value}}}"
        case "CASE":
            return f"{{case {tok.value}}}"
        case "ELSE":
            return "{else}"
        case "END":
            return "{end}"
        case "VAR":
            return f"{{{tok.value}}}"
        case "TEXT":
            return "<text>"
        case _:
            return f"<{tok.kind}>"


def _is_keyword_alone_on_line(
    tokens: Sequence[Token], index: int
) -> tuple[bool, bool, bool]:
    """Return ``(alone_before, alone_after, alone)`` for ``tokens[index]``.

    Matches the TS body-parser ``isKeywordAloneOnLine`` rule exactly:
    inspect the tail of the previous TEXT token (after the last newline) and
    the head of the next TEXT token (up to the first newline). If either side
    has another non-text tag with no text in between, the keyword is not
    alone.
    """
    alone_before = True
    if index > 0:
        prev = tokens[index - 1]
        if prev.kind == "TEXT":
            v = prev.value
            last_nl = v.rfind("\n")
            tail = v if last_nl == -1 else v[last_nl + 1 :]
            if tail != "" and tail.strip() != "":
                alone_before = False
        else:
            alone_before = False

    alone_after = True
    if index + 1 < len(tokens):
        nxt = tokens[index + 1]
        if nxt.kind == "TEXT":
            v = nxt.value
            first_nl = v.find("\n")
            head = v if first_nl == -1 else v[:first_nl]
            if head.strip() != "":
                alone_after = False
        else:
            alone_after = False

    return alone_before, alone_after, alone_before and alone_after


def _drop_trailing_whitespace_line(text: str) -> str:
    """Strip everything after the last newline. Used for block-form trims."""
    last_nl = text.rfind("\n")
    if last_nl == -1:
        return ""
    return text[: last_nl + 1]


def _drop_leading_trailing_newline(text: str) -> str:
    """Strip everything up to and including the first newline."""
    first_nl = text.find("\n")
    if first_nl == -1:
        return ""
    return text[first_nl + 1 :]


def _trim_last_text_trailing_whitespace(nodes: list[Node]) -> list[Node]:
    """For block form: strip the trailing whitespace on the keyword's line."""
    if not nodes:
        return nodes
    last = nodes[-1]
    if not isinstance(last, TextNode):
        return nodes
    trimmed = _drop_trailing_whitespace_line(last.value)
    if trimmed == last.value:
        return nodes
    if trimmed == "":
        return nodes[:-1]
    return nodes[:-1] + [TextNode(value=trimmed)]


class _ParserState:
    __slots__ = ("tokens", "i")

    def __init__(self, tokens: Sequence[Token]) -> None:
        # Mutable copy: we may need to rewrite a few Text tokens during
        # block-form trimming.
        self.tokens: list[Token] = list(tokens)
        self.i: int = 0


def _replace_text(state: _ParserState, index: int, new_value: str) -> None:
    tok = state.tokens[index]
    state.tokens[index] = Token(
        kind=tok.kind,
        value=new_value,
        line=tok.line,
        col=tok.col,
        alone_on_line=tok.alone_on_line,
        negated=tok.negated,
    )


def _parse_until(
    state: _ParserState,
    stops: frozenset[TokenKind],
    *,
    preceding_text_override: str | None = None,
) -> tuple[list[Node], Token | None]:
    """Parse nodes until a token kind in ``stops`` or EOF.

    The stopping token is NOT consumed. ``preceding_text_override`` seeds the
    first text node (used to inject block-form trim remainders).
    """
    nodes: list[Node] = []
    pending_text: str | None = preceding_text_override

    def flush_pending() -> None:
        nonlocal pending_text
        if pending_text is not None and pending_text != "":
            nodes.append(TextNode(value=pending_text))
        pending_text = None

    while state.i < len(state.tokens):
        tok = state.tokens[state.i]

        if tok.kind in stops:
            flush_pending()
            return nodes, tok

        if tok.kind == "TEXT":
            pending_text = (pending_text or "") + tok.value
            state.i += 1
            continue

        if tok.kind == "VAR":
            flush_pending()
            nodes.append(VariableNode(name=tok.value))
            state.i += 1
            continue

        if tok.kind in ("OPEN_IF", "OPEN_IF_NOT", "OPEN_SWITCH"):
            flush_pending()
            block_node, preceding_trim, trailing_text = _parse_block_construct(state)
            if preceding_trim and nodes:
                last = nodes[-1]
                if isinstance(last, TextNode):
                    trimmed = _drop_trailing_whitespace_line(last.value)
                    if trimmed == "":
                        nodes.pop()
                    else:
                        nodes[-1] = TextNode(value=trimmed)
            nodes.append(block_node)
            pending_text = trailing_text
            continue

        if tok.kind == "END":
            raise _make_error(
                "Unexpected '{end}' with no matching '{if}' or '{switch}'",
                code="E_EXTRA_END",
                line=tok.line,
                column=tok.col,
            )
        if tok.kind == "ELSE":
            raise _make_error(
                "Unexpected '{else}' outside any '{if}' or '{switch}'",
                code="E_ELSE_BEFORE_CASE",
                line=tok.line,
                column=tok.col,
            )
        if tok.kind == "CASE":
            raise _make_error(
                f"Unexpected '{{case {tok.value}}}' outside any '{{switch}}'",
                code="E_BAD_TAG",
                line=tok.line,
                column=tok.col,
            )

        # Unreachable.
        raise _make_error(
            f"unreachable token kind: {tok.kind}",
            code="E_BAD_TAG",
            line=tok.line,
            column=tok.col,
        )

    flush_pending()
    return nodes, None


def _check_form_at(
    state: _ParserState,
    tok: Token,
    index: int,
    form: str,
    context: str,
) -> None:
    """Verify a keyword token's surroundings match ``form``."""
    alone_before, _alone_after, alone = _is_keyword_alone_on_line(state.tokens, index)
    if form == "block" and not alone:
        raise _make_error(
            f"Mixed inline/block form in {context}: block-form '{_describe(tok)}' must be alone on its line",
            code="E_MIXED_FORM",
            line=tok.line,
            column=tok.col,
        )
    if form == "inline":
        # Inline: every related keyword must be on the same line as the opener.
        # If the preceding text token contains a newline, the keyword is on a
        # later line.
        if index > 0:
            prev = state.tokens[index - 1]
            if prev.kind == "TEXT" and "\n" in prev.value:
                raise _make_error(
                    f"Mixed inline/block form in {context}: inline-form '{_describe(tok)}' must be on the same line as the opener",
                    code="E_MIXED_FORM",
                    line=tok.line,
                    column=tok.col,
                )


def _parse_block_construct(state: _ParserState) -> tuple[Node, bool, str | None]:
    """Parse a single ``{if}`` or ``{switch}`` construct.

    Returns ``(node, preceding_trim, trailing_text)``:

    * ``preceding_trim`` signals the caller to strip trailing whitespace on
      the opener's line from the text preceding this construct (block form).
    * ``trailing_text`` seeds the next sibling text node (block form: the
      post-``{end}`` remainder with the trailing newline stripped).
    """
    opener = state.tokens[state.i]
    _alone_b, _alone_a, alone = _is_keyword_alone_on_line(state.tokens, state.i)
    form = "block" if alone else "inline"

    if opener.kind == "OPEN_SWITCH":
        return _parse_switch(state, opener, form)
    return _parse_if(state, opener, form)


def _parse_if(
    state: _ParserState, opener: Token, form: str
) -> tuple[Node, bool, str | None]:
    negated = opener.kind == "OPEN_IF_NOT"
    state.i += 1

    # Block form: strip leading-up-to-and-including-\n from the next text.
    if form == "block" and state.i < len(state.tokens):
        nxt = state.tokens[state.i]
        if nxt.kind == "TEXT":
            _replace_text(state, state.i, _drop_leading_trailing_newline(nxt.value))

    stops: frozenset[TokenKind] = frozenset({"ELSE", "END"})
    body_nodes, stop_tok = _parse_until(state, stops)
    context = f"{{if {'!' if negated else ''}{opener.value}}}"

    if stop_tok is None:
        raise _make_error(
            f"Unclosed '{context}': missing '{{end}}'",
            code="E_UNCLOSED_IF",
            line=opener.line,
            column=opener.col,
        )

    _check_form_at(state, stop_tok, state.i, form, context)

    body_list = body_nodes
    if form == "block":
        body_list = _trim_last_text_trailing_whitespace(body_list)

    else_body_list: list[Node] | None = None
    if stop_tok.kind == "ELSE":
        state.i += 1
        if form == "block" and state.i < len(state.tokens):
            nxt = state.tokens[state.i]
            if nxt.kind == "TEXT":
                _replace_text(state, state.i, _drop_leading_trailing_newline(nxt.value))
        else_stops: frozenset[TokenKind] = frozenset({"END"})
        else_nodes, else_stop = _parse_until(state, else_stops)
        if else_stop is None:
            raise _make_error(
                f"Unclosed '{context}': missing '{{end}}' after '{{else}}'",
                code="E_UNCLOSED_IF",
                line=opener.line,
                column=opener.col,
            )
        _check_form_at(state, else_stop, state.i, form, context)
        else_body_list = (
            _trim_last_text_trailing_whitespace(else_nodes)
            if form == "block"
            else else_nodes
        )

    end_tok = state.tokens[state.i] if state.i < len(state.tokens) else None
    if end_tok is None or end_tok.kind != "END":
        raise _make_error(
            f"Unclosed '{context}': missing '{{end}}'",
            code="E_UNCLOSED_IF",
            line=opener.line,
            column=opener.col,
        )
    state.i += 1

    trailing_text: str | None = None
    if form == "block" and state.i < len(state.tokens):
        after = state.tokens[state.i]
        if after.kind == "TEXT":
            trailing_text = _drop_leading_trailing_newline(after.value)
            state.i += 1

    node = IfNode(
        flag=opener.value,
        negated=negated,
        form="inline" if form == "inline" else "block",
        body=tuple(body_list),
        else_body=tuple(else_body_list) if else_body_list is not None else None,
    )
    return node, form == "block", trailing_text


def _parse_switch(
    state: _ParserState, opener: Token, form: str
) -> tuple[Node, bool, str | None]:
    state.i += 1
    context = f"{{switch {opener.value}}}"

    # Between {switch} and first {case}: only whitespace text allowed.
    while state.i < len(state.tokens):
        tok = state.tokens[state.i]
        if tok.kind in ("CASE", "ELSE", "END"):
            break
        if tok.kind == "TEXT":
            if tok.value.strip() != "":
                raise _make_error(
                    f"Content between '{context}' and first '{{case}}': "
                    "only '{case}' branches are allowed inside a switch",
                    code="E_TEXT_BEFORE_FIRST_CASE",
                    line=tok.line,
                    column=tok.col,
                )
            state.i += 1
            continue
        # Non-text, non-case: variables, nested blocks, etc., are forbidden here.
        raise _make_error(
            f"Unexpected {_describe(tok)} between '{context}' and first '{{case}}': "
            "only '{case}' branches are allowed inside a switch",
            code="E_TEXT_BEFORE_FIRST_CASE",
            line=tok.line,
            column=tok.col,
        )

    first_after = state.tokens[state.i] if state.i < len(state.tokens) else None
    if first_after is None or first_after.kind == "END":
        raise _make_error(
            f"Switch on '{opener.value}' has no cases; remove the switch or add cases",
            code="E_SWITCH_NO_CASES",
            line=opener.line,
            column=opener.col,
        )
    if first_after.kind == "ELSE":
        raise _make_error(
            f"'{{else}}' before any '{{case}}' in switch on '{opener.value}'",
            code="E_ELSE_BEFORE_CASE",
            line=first_after.line,
            column=first_after.col,
        )
    if first_after.kind != "CASE":
        raise _make_error(
            f"Unexpected {_describe(first_after)} inside '{context}'",
            code="E_BAD_TAG",
            line=first_after.line,
            column=first_after.col,
        )

    cases: list[CaseBranch] = []
    seen_cases: set[str] = set()
    else_body_list: list[Node] | None = None

    while state.i < len(state.tokens):
        tok = state.tokens[state.i]

        if tok.kind == "END":
            break

        if tok.kind == "CASE":
            if else_body_list is not None:
                raise _make_error(
                    f"'{{case {tok.value}}}' appears after '{{else}}' in switch on '{opener.value}': "
                    "the '{else}' branch must come last",
                    code="E_ELSE_BEFORE_CASE",
                    line=tok.line,
                    column=tok.col,
                )
            _check_form_at(state, tok, state.i, form, context)
            if tok.value in seen_cases:
                raise _make_error(
                    f"Duplicate '{{case {tok.value}}}' in switch on '{opener.value}'",
                    code="E_DUPLICATE_CASE",
                    line=tok.line,
                    column=tok.col,
                )
            seen_cases.add(tok.value)
            case_value = tok.value
            state.i += 1
            if form == "block" and state.i < len(state.tokens):
                nxt = state.tokens[state.i]
                if nxt.kind == "TEXT":
                    _replace_text(
                        state, state.i, _drop_leading_trailing_newline(nxt.value)
                    )
            case_stops: frozenset[TokenKind] = frozenset({"CASE", "ELSE", "END"})
            case_nodes, _case_stop = _parse_until(state, case_stops)
            body_list = (
                _trim_last_text_trailing_whitespace(case_nodes)
                if form == "block"
                else case_nodes
            )
            cases.append(CaseBranch(value=case_value, body=tuple(body_list)))
            continue

        if tok.kind == "ELSE":
            if else_body_list is not None:
                raise _make_error(
                    f"Multiple '{{else}}' branches in switch on '{opener.value}'",
                    code="E_ELSE_BEFORE_CASE",
                    line=tok.line,
                    column=tok.col,
                )
            _check_form_at(state, tok, state.i, form, context)
            state.i += 1
            if form == "block" and state.i < len(state.tokens):
                nxt = state.tokens[state.i]
                if nxt.kind == "TEXT":
                    _replace_text(
                        state, state.i, _drop_leading_trailing_newline(nxt.value)
                    )
            else_stops: frozenset[TokenKind] = frozenset({"END", "CASE", "ELSE"})
            else_nodes, else_stop = _parse_until(state, else_stops)
            if else_stop is None:
                raise _make_error(
                    f"Unclosed '{context}': missing '{{end}}'",
                    code="E_UNCLOSED_SWITCH",
                    line=opener.line,
                    column=opener.col,
                )
            if else_stop.kind == "CASE":
                raise _make_error(
                    f"'{{case {else_stop.value}}}' appears after '{{else}}' in switch on '{opener.value}': "
                    "the '{else}' branch must come last",
                    code="E_ELSE_BEFORE_CASE",
                    line=else_stop.line,
                    column=else_stop.col,
                )
            if else_stop.kind == "ELSE":
                raise _make_error(
                    f"Multiple '{{else}}' branches in switch on '{opener.value}'",
                    code="E_ELSE_BEFORE_CASE",
                    line=else_stop.line,
                    column=else_stop.col,
                )
            else_body_list = (
                _trim_last_text_trailing_whitespace(else_nodes)
                if form == "block"
                else else_nodes
            )
            continue

        raise _make_error(
            f"Unexpected {_describe(tok)} inside '{context}'",
            code="E_BAD_TAG",
            line=tok.line,
            column=tok.col,
        )

    end_tok = state.tokens[state.i] if state.i < len(state.tokens) else None
    if end_tok is None or end_tok.kind != "END":
        raise _make_error(
            f"Unclosed '{context}': missing '{{end}}'",
            code="E_UNCLOSED_SWITCH",
            line=opener.line,
            column=opener.col,
        )
    _check_form_at(state, end_tok, state.i, form, context)
    state.i += 1

    if not cases:
        raise _make_error(
            f"Switch on '{opener.value}' has no cases; remove the switch or add cases",
            code="E_SWITCH_NO_CASES",
            line=opener.line,
            column=opener.col,
        )

    trailing_text: str | None = None
    if form == "block" and state.i < len(state.tokens):
        after = state.tokens[state.i]
        if after.kind == "TEXT":
            trailing_text = _drop_leading_trailing_newline(after.value)
            state.i += 1

    node = SwitchNode(
        flag=opener.value,
        form="inline" if form == "inline" else "block",
        cases=tuple(cases),
        else_body=tuple(else_body_list) if else_body_list is not None else None,
    )
    return node, form == "block", trailing_text


def parse_body(tokens: Sequence[Token]) -> tuple[Node, ...]:
    """Parse a flat token stream into a tuple of AST nodes.

    Raises:
        ParseError: on any structural violation with a stable ``code``.
    """
    state = _ParserState(tokens)
    nodes, _stop = _parse_until(state, frozenset())

    if state.i < len(state.tokens):
        stray = state.tokens[state.i]
        if stray.kind == "END":
            raise _make_error(
                "Unexpected '{end}' with no matching '{if}' or '{switch}'",
                code="E_EXTRA_END",
                line=stray.line,
                column=stray.col,
            )
        if stray.kind == "ELSE":
            raise _make_error(
                "Unexpected '{else}' outside any '{if}' or '{switch}'",
                code="E_ELSE_BEFORE_CASE",
                line=stray.line,
                column=stray.col,
            )
        if stray.kind == "CASE":
            raise _make_error(
                f"Unexpected '{{case {stray.value}}}' outside any '{{switch}}'",
                code="E_BAD_TAG",
                line=stray.line,
                column=stray.col,
            )

    return tuple(nodes)


__all__ = ["parse_body"]
