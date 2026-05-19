from __future__ import annotations

import pytest

from textprompts.errors import ParseError
from textprompts.syntax.lexer import tokenize


def kinds(toks: list) -> list[str]:
    return [t.kind for t in toks]


def values(toks: list) -> list[str]:
    return [t.value for t in toks]


# --- Tag form coverage (SPEC §2.2) ----------------------------------------


def test_variable_tag() -> None:
    toks = tokenize("Hello {name}!")
    assert kinds(toks) == ["TEXT", "VAR", "TEXT"]
    assert values(toks) == ["Hello ", "name", "!"]


def test_if_tag() -> None:
    toks = tokenize("{if foo}body{end}")
    assert kinds(toks) == ["OPEN_IF", "TEXT", "END"]
    assert toks[0].value == "foo"
    assert toks[0].negated is False


def test_if_negated_tag() -> None:
    toks = tokenize("{if !foo}body{end}")
    assert kinds(toks) == ["OPEN_IF_NOT", "TEXT", "END"]
    assert toks[0].value == "foo"
    assert toks[0].negated is True


def test_if_extra_spaces_between_keyword_and_name() -> None:
    toks = tokenize("{if   foo}x{end}")
    assert toks[0].kind == "OPEN_IF"
    assert toks[0].value == "foo"


def test_switch_and_case() -> None:
    toks = tokenize("{switch tier}{case free}A{case premium}B{end}")
    assert kinds(toks) == ["OPEN_SWITCH", "CASE", "TEXT", "CASE", "TEXT", "END"]
    assert toks[0].value == "tier"
    assert toks[1].value == "free"
    assert toks[3].value == "premium"


def test_else_tag() -> None:
    toks = tokenize("{if x}a{else}b{end}")
    assert kinds(toks) == ["OPEN_IF", "TEXT", "ELSE", "TEXT", "END"]


# --- Block alone_on_line annotation ---------------------------------------


def test_block_keyword_alone_on_line() -> None:
    toks = tokenize("Hello\n{if foo}\nBody\n{end}\nDone\n")
    open_tok = next(t for t in toks if t.kind == "OPEN_IF")
    end_tok = next(t for t in toks if t.kind == "END")
    assert open_tok.alone_on_line is True
    assert end_tok.alone_on_line is True


def test_inline_keyword_not_alone_on_line() -> None:
    toks = tokenize("Hello {if foo}body{end}!")
    open_tok = next(t for t in toks if t.kind == "OPEN_IF")
    end_tok = next(t for t in toks if t.kind == "END")
    assert open_tok.alone_on_line is False
    assert end_tok.alone_on_line is False


def test_indented_block_keyword_alone_on_line() -> None:
    # Per SPEC §3.4, indented block keywords are valid; surrounding whitespace
    # on the same line does not disqualify "alone on its line".
    toks = tokenize("{if outer}\n  {if inner}\n  body\n  {end}\n{end}")
    inner_open = [t for t in toks if t.kind == "OPEN_IF" and t.value == "inner"][0]
    assert inner_open.alone_on_line is True


# --- Escapes (SPEC §2.4) --------------------------------------------------


def test_escape_brace_and_backslash() -> None:
    toks = tokenize(r"a \{b\} \\ c")
    assert kinds(toks) == ["TEXT"]
    assert toks[0].value == r"a {b} \ c"


def test_unknown_escape_passes_through() -> None:
    toks = tokenize(r"a \n b")
    assert kinds(toks) == ["TEXT"]
    assert toks[0].value == r"a \n b"


# --- Legacy / invalid placeholders (SPEC §1.1, §2.3) ----------------------


def test_empty_placeholder_rejected() -> None:
    with pytest.raises(ParseError) as exc:
        tokenize("hello {} world")
    assert exc.value.code == "E_BAD_TAG"
    assert "Empty" in str(exc.value)


def test_positional_placeholder_rejected() -> None:
    with pytest.raises(ParseError) as exc:
        tokenize("hello {0} world")
    assert exc.value.code == "E_BAD_TAG"
    assert "Positional" in str(exc.value)


def test_legacy_double_brace_is_unterminated_tag() -> None:
    # `{{name}}` -> opener `{` followed by `{` triggers E_BAD_TAG (unterminated)
    with pytest.raises(ParseError) as exc:
        tokenize("hello {{name}}")
    assert exc.value.code == "E_BAD_TAG"


def test_inside_brace_whitespace_rejected_leading() -> None:
    with pytest.raises(ParseError) as exc:
        tokenize("hello { name}")
    assert exc.value.code == "E_BAD_TAG"
    assert "Whitespace inside braces" in str(exc.value)


def test_inside_brace_whitespace_rejected_in_keyword() -> None:
    with pytest.raises(ParseError) as exc:
        tokenize("{ if foo}body{end}")
    assert exc.value.code == "E_BAD_TAG"


def test_uppercase_keyword_rejected() -> None:
    with pytest.raises(ParseError) as exc:
        tokenize("{IF foo}body{end}")
    assert exc.value.code == "E_BAD_TAG"
    assert "lowercase" in str(exc.value)


def test_dashed_identifier_rejected() -> None:
    with pytest.raises(ParseError) as exc:
        tokenize("hello {name-with-dash}")
    assert exc.value.code == "E_INVALID_IDENTIFIER"


def test_negation_with_space_rejected() -> None:
    with pytest.raises(ParseError) as exc:
        tokenize("{if ! foo}body{end}")
    assert exc.value.code == "E_BAD_TAG"
    assert "immediately adjacent" in str(exc.value)


def test_negation_with_double_space_before_bang_rejected() -> None:
    # SPEC §2.3: negated form requires exactly one space after `if`.
    with pytest.raises(ParseError) as exc:
        tokenize("{if  !foo}body{end}")
    assert exc.value.code == "E_BAD_TAG"
    assert "exactly one space" in str(exc.value)


def test_negation_with_triple_space_before_bang_rejected() -> None:
    with pytest.raises(ParseError) as exc:
        tokenize("{if   !foo}body{end}")
    assert exc.value.code == "E_BAD_TAG"
    assert "exactly one space" in str(exc.value)


def test_negation_single_space_accepted_regression() -> None:
    toks = tokenize("{if !foo}body{end}")
    assert toks[0].kind == "OPEN_IF_NOT"
    assert toks[0].value == "foo"
    assert toks[0].negated is True


def test_non_negated_single_space_accepted_regression() -> None:
    toks = tokenize("{if foo}body{end}")
    assert toks[0].kind == "OPEN_IF"
    assert toks[0].value == "foo"
    assert toks[0].negated is False


def test_non_negated_double_space_still_accepted() -> None:
    # SPEC §2.3: extra spaces allowed for non-negated form.
    toks = tokenize("{if  foo}body{end}")
    assert toks[0].kind == "OPEN_IF"
    assert toks[0].value == "foo"
    assert toks[0].negated is False


def test_negation_in_case_rejected() -> None:
    with pytest.raises(ParseError) as exc:
        tokenize("{switch tier}{case !free}x{end}")
    assert exc.value.code == "E_BAD_TAG"
    assert "Negation is not allowed" in str(exc.value)


def test_bare_if_rejected() -> None:
    with pytest.raises(ParseError) as exc:
        tokenize("{if}body{end}")
    assert exc.value.code == "E_BAD_TAG"


def test_bare_switch_rejected() -> None:
    with pytest.raises(ParseError) as exc:
        tokenize("{switch}{case x}a{end}")
    assert exc.value.code == "E_BAD_TAG"


def test_bare_case_rejected() -> None:
    with pytest.raises(ParseError) as exc:
        tokenize("{switch tier}{case}a{end}")
    assert exc.value.code == "E_BAD_TAG"


def test_bare_if_not_rejected() -> None:
    with pytest.raises(ParseError) as exc:
        tokenize("{if !}body{end}")
    assert exc.value.code == "E_BAD_TAG"


def test_reserved_keyword_as_variable_rejected() -> None:
    with pytest.raises(ParseError) as exc:
        tokenize("hello {flags}")
    assert exc.value.code == "E_RESERVED_IDENTIFIER"


def test_unterminated_tag_rejected() -> None:
    with pytest.raises(ParseError) as exc:
        tokenize("hello {name")
    assert exc.value.code == "E_BAD_TAG"


def test_newline_inside_tag_rejected() -> None:
    with pytest.raises(ParseError) as exc:
        tokenize("hello {name\n}")
    assert exc.value.code == "E_BAD_TAG"


# --- Keyword boundary detection (SPEC §2.1, §2.3) -------------------------
#
# Regression: the keyword-uppercase check previously matched any inner
# starting with `if`/`switch`/`case`/`else`/`end` (case-insensitive) and
# rejected mixed-case variants. That incorrectly rejected variables whose
# names happen to start with those letters (`Ifx`, `EndUser`, `CaseStudy`,
# `Endpoint`, `Switchable`). The rule is now boundary-aware:
#   - `if`/`switch`/`case` are keywords only when followed by whitespace
#     (or end-of-tag, which is the bare-keyword error path).
#   - `else`/`end` are keywords only when the entire inner equals exactly
#     `else` / `end` (case-insensitively for this detection).


class TestKeywordBoundary:
    @pytest.mark.parametrize(
        "name",
        ["Ifx", "EndUser", "CaseStudy", "Endpoint", "Switchable"],
    )
    def test_mixed_case_identifier_with_keyword_prefix_is_var(self, name: str) -> None:
        toks = tokenize("{" + name + "}")
        assert kinds(toks) == ["VAR"]
        assert toks[0].value == name

    @pytest.mark.parametrize(
        "src",
        ["{IF flag}", "{If flag}", "{Switch x}", "{Case x}"],
    )
    def test_uppercase_prefix_keyword_rejected(self, src: str) -> None:
        with pytest.raises(ParseError) as exc:
            tokenize(src)
        assert exc.value.code == "E_BAD_TAG"
        assert "lowercase" in str(exc.value)

    @pytest.mark.parametrize("src", ["{Else}", "{End}", "{ELSE}", "{END}"])
    def test_uppercase_exact_keyword_rejected(self, src: str) -> None:
        with pytest.raises(ParseError) as exc:
            tokenize(src)
        assert exc.value.code == "E_BAD_TAG"
        assert "lowercase" in str(exc.value)

    def test_lowercase_if_unchanged(self) -> None:
        toks = tokenize("{if flag}x{end}")
        assert kinds(toks) == ["OPEN_IF", "TEXT", "END"]
        assert toks[0].value == "flag"

    def test_lowercase_else_unchanged(self) -> None:
        toks = tokenize("{if x}a{else}b{end}")
        assert kinds(toks) == ["OPEN_IF", "TEXT", "ELSE", "TEXT", "END"]

    def test_lowercase_end_unchanged(self) -> None:
        toks = tokenize("{if x}a{end}")
        assert kinds(toks) == ["OPEN_IF", "TEXT", "END"]

    def test_lowercase_switch_unchanged(self) -> None:
        toks = tokenize("{switch x}{case a}A{end}")
        assert kinds(toks) == ["OPEN_SWITCH", "CASE", "TEXT", "END"]
        assert toks[0].value == "x"

    def test_lowercase_case_unchanged(self) -> None:
        toks = tokenize("{switch x}{case a}A{end}")
        case_tok = next(t for t in toks if t.kind == "CASE")
        assert case_tok.value == "a"


# --- Line/column tracking (best-effort) -----------------------------------


def test_line_column_tracking() -> None:
    toks = tokenize("a\nb{name}")
    var = next(t for t in toks if t.kind == "VAR")
    assert var.line == 2
    assert var.col == 2
