"""End-to-end tests for the v2 ``Prompt.format`` engine.

Covers:

* ``Prompt.from_string`` parses in-memory content.
* ``Prompt.format`` invokes validate_inputs + render path.
* Positional ``Prompt.format(...)`` raises ``TypeError``.
* ``flags=`` is silently ignored on flagless prompts.
* ``PromptString.format`` and ``Prompt.format`` agree byte-for-byte.
* Legacy patterns (``{0}``, ``{}``) raise ``ParseError``.
* Smoke test: SPEC §8.2 example loads and renders correctly.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from textprompts import Prompt, PromptString
from textprompts.errors import FormatError, ParseError

# ---------------------------------------------------------------------------
# Prompt.from_string
# ---------------------------------------------------------------------------


def test_from_string_no_frontmatter() -> None:
    p = Prompt.from_string("Hello {name}")
    assert p.format(name="Alice") == "Hello Alice"
    assert p.path is None


def test_from_string_with_toml_frontmatter() -> None:
    src = (
        "---\n"
        'title = "Hi"\n'
        'description = "d"\n'
        'version = "1"\n'
        "[flags.vip]\n"
        'type = "boolean"\n'
        'description = "VIP customer"\n'
        "---\n"
        "Hello {name}{if vip}, VIP{end}!"
    )
    p = Prompt.from_string(src, metadata="allow")
    assert p.meta is not None
    assert "vip" in p.meta.flags
    assert p.format(name="Alice", flags={"vip": True}) == "Hello Alice, VIP!"
    assert p.format(name="Alice", flags={"vip": False}) == "Hello Alice!"


def test_from_string_strict_requires_metadata() -> None:
    from textprompts.errors import MissingMetadataError

    with pytest.raises(MissingMetadataError):
        Prompt.from_string("Hello {name}", metadata="strict")


def test_from_string_ignore_mode() -> None:
    src = "---\nfoo = bar\n---\nHello {name}"
    # Body should include the leading "---" lines verbatim under ignore mode.
    p = Prompt.from_string(src, metadata="ignore")
    assert "---" in str(p.prompt)


# ---------------------------------------------------------------------------
# Prompt.format
# ---------------------------------------------------------------------------


def _make_prompt(body: str) -> Prompt:
    return Prompt.from_string(body)


def test_format_invokes_validation() -> None:
    p = _make_prompt("Hello {name}")
    with pytest.raises(FormatError) as excinfo:
        p.format()
    assert excinfo.value.code == "E_MISSING_VARIABLE"


def test_format_rejects_positional_args() -> None:
    p = _make_prompt("Hello {name}")
    with pytest.raises(TypeError, match="positional"):
        p.format("Alice")


def test_format_flags_unused_silently_ignored() -> None:
    """SPEC §5.7: extra flag inputs on flagless prompts are silently ignored."""
    p = _make_prompt("Hello {name}")
    out_with = p.format(name="Alice", flags={"unused": True})
    out_without = p.format(name="Alice")
    assert out_with == out_without == "Hello Alice"


def test_format_caches_ast_across_calls() -> None:
    p = _make_prompt("Hello {name}")
    p.format(name="Alice")
    cached_ast = p._ast
    assert cached_ast is not None
    p.format(name="Bob")
    assert p._ast is cached_ast  # same tuple, not re-parsed


def test_format_loaded_prompt_uses_cached_ast() -> None:
    """Loader should attach the AST to the Prompt."""
    src = "---\ntitle = 't'\ndescription = 'd'\nversion = '1'\n---\nHello {name}"
    p = Prompt.from_string(src)
    assert p._ast is not None


# ---------------------------------------------------------------------------
# PromptString and Prompt.format parity.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "body,vars_,flags",
    [
        ("Hi {name}", {"name": "Alice"}, None),
        (
            "{switch tier}{case free}f{case pro}p{end}",
            {},
            {"tier": "free"},
        ),
        (
            "x{if vip} v{end}y",
            {},
            {"vip": True},
        ),
    ],
)
def test_prompt_and_promptstring_format_agree(
    body: str, vars_: dict, flags: dict
) -> None:
    p = Prompt.from_string(body)
    via_prompt = (
        p.format(flags=flags, **vars_) if flags is not None else p.format(**vars_)
    )
    via_ps = (
        PromptString(body).format(flags=flags, **vars_)
        if flags is not None
        else PromptString(body).format(**vars_)
    )
    assert via_prompt == via_ps


# ---------------------------------------------------------------------------
# Invalid placeholder forms.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "body",
    [
        "Hello {0}",
        "Hello {}",
        "{name:>10}",
    ],
)
def test_invalid_placeholder_forms_raise_parse_error(body: str) -> None:
    """Positional, empty, and format-spec placeholders raise ParseError."""
    with pytest.raises(ParseError):
        Prompt.from_string(body)


# ---------------------------------------------------------------------------
# Double-brace escape.
# ---------------------------------------------------------------------------


def test_double_brace_escape_renders_literally() -> None:
    """`{{literal}}` renders as the literal text `{literal}` — doubled
    braces collapse to single braces and the inner text is not a placeholder.
    """
    p = Prompt.from_string("{{literal}} and {real}")
    assert p.format(real="x") == "{literal} and x"


# ---------------------------------------------------------------------------
# Smoke test: SPEC §8.2 example.
# ---------------------------------------------------------------------------


_SPEC_82_PATH = (
    Path(__file__).parent.parent
    / "examples"
    / "conditional"
    / "02_full_frontmatter"
    / "prompt.txt"
)


def test_spec_82_smoke() -> None:
    from textprompts import load_prompt

    prompt = load_prompt(_SPEC_82_PATH, metadata="allow")
    out = prompt.format(
        user_name="X",
        last_question="?",
        flags={"tier": "premium", "has_history": True},
    )
    assert "assisting X" in out
    assert "priority support" in out
    assert "previously asked: ?" in out
    assert "How can I help today?" in out


def test_spec_82_free_tier_no_history() -> None:
    from textprompts import load_prompt

    prompt = load_prompt(_SPEC_82_PATH, metadata="allow")
    out = prompt.format(
        user_name="Jan",
        last_question="ignored",
        flags={"tier": "free", "has_history": False},
    )
    assert "standard support" in out
    assert "previously asked" not in out
