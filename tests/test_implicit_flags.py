"""Tests for implicit-flag introspection (SPEC §4.5).

Body-only flags (referenced via ``{if}`` or ``{switch}`` but not declared in
``[flags.*]``) are materialized into ``prompt.meta.flags`` so callers can
introspect what flags a prompt uses. Mirrors the TypeScript port's
``addImplicitFlagDecls`` behavior in ``parser-core.ts``.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from textprompts import Prompt, load_prompt
from textprompts.errors import SemanticError
from textprompts.models import FlagDecl

_REPO_ROOT = Path(__file__).resolve().parents[1]


def _write(tmp_path: Path, content: str, name: str = "p.txt") -> Path:
    fp = tmp_path / name
    fp.write_text(content)
    return fp


class TestImplicitBoolean:
    def test_minimal_implicit_example_file(self) -> None:
        """Loading examples/conditional/01_minimal_implicit/prompt.txt
        surfaces include_examples as a boolean implicit flag."""
        path = (
            _REPO_ROOT
            / "examples"
            / "conditional"
            / "01_minimal_implicit"
            / "prompt.txt"
        )
        prompt = load_prompt(path, meta="allow")
        assert prompt.meta is not None
        assert "include_examples" in prompt.meta.flags
        decl = prompt.meta.flags["include_examples"]
        assert isinstance(decl, FlagDecl)
        assert decl.kind == "boolean"
        assert decl.values is None
        assert decl.description is None
        assert decl.extras == {}

    def test_from_string_implicit_boolean(self) -> None:
        prompt = Prompt.from_string(
            "{if vip}VIP{end}",
            metadata="allow",
        )
        assert prompt.meta is not None
        assert prompt.meta.flags["vip"].kind == "boolean"
        assert prompt.meta.flags["vip"].values is None
        assert prompt.meta.flags["vip"].description is None
        assert prompt.meta.flags["vip"].extras == {}


class TestImplicitEnum:
    def test_from_string_implicit_enum_preserves_body_values(self) -> None:
        prompt = Prompt.from_string(
            "{switch tier}{case free}A{case premium}B{end}",
            metadata="allow",
        )
        assert prompt.meta is not None
        assert prompt.meta.flags["tier"].kind == "enum"
        values = prompt.meta.flags["tier"].values
        assert values is not None
        assert set(values) == {"free", "premium"}
        # NOTE: Python's frozenset has no insertion order; values are emitted
        # in sorted order for determinism. This is a known minor deviation
        # from the TS reference, which preserves body order via Set<string>.
        assert prompt.meta.flags["tier"].description is None
        assert prompt.meta.flags["tier"].extras == {}


class TestMixedDeclaredAndImplicit:
    def test_declared_enum_plus_implicit_boolean(self, tmp_path: Path) -> None:
        fp = _write(
            tmp_path,
            """---
[flags.tier]
type = "enum"
values = ["free", "premium"]
description = "Customer tier"
---
{switch tier}{case free}A{case premium}B{end}
{if other}X{end}""",
        )
        prompt = load_prompt(fp, meta="allow")
        assert prompt.meta is not None
        # Both flags present.
        assert set(prompt.meta.flags.keys()) == {"tier", "other"}
        # Declared flag retains its declared description (no clobber).
        assert prompt.meta.flags["tier"].kind == "enum"
        assert prompt.meta.flags["tier"].values == ("free", "premium")
        assert prompt.meta.flags["tier"].description == "Customer tier"
        # Implicit flag is boolean with no description.
        assert prompt.meta.flags["other"].kind == "boolean"
        assert prompt.meta.flags["other"].values is None
        assert prompt.meta.flags["other"].description is None
        assert prompt.meta.flags["other"].extras == {}


class TestStrictMode:
    def test_strict_with_declared_flag_only_declared_appears(
        self, tmp_path: Path
    ) -> None:
        fp = _write(
            tmp_path,
            """---
title = "T"
description = "D"
version = "1"
[flags.vip]
type = "boolean"
description = "VIP flag"
---
{if vip}VIP{end}""",
        )
        prompt = load_prompt(fp, meta="strict")
        assert prompt.meta is not None
        assert set(prompt.meta.flags.keys()) == {"vip"}
        # Declared description survives.
        assert prompt.meta.flags["vip"].description == "VIP flag"

    def test_strict_rejects_undeclared_body_flag(self, tmp_path: Path) -> None:
        """Strict has no implicits because undeclared flags raise upstream."""
        fp = _write(
            tmp_path,
            """---
title = "T"
description = "D"
version = "1"
---
{if vip}VIP{end}""",
        )
        with pytest.raises(SemanticError) as exc:
            load_prompt(fp, meta="strict")
        assert exc.value.code == "E_UNDECLARED_FLAG"


class TestIgnoreMode:
    def test_ignore_mode_implicit_only_prompt(self, tmp_path: Path) -> None:
        # IGNORE mode skips frontmatter parsing; the whole file is body.
        fp = _write(tmp_path, "{if include}X{end}")
        prompt = load_prompt(fp, meta="ignore")
        assert prompt.meta is not None
        assert prompt.meta.flags["include"].kind == "boolean"
        assert prompt.meta.flags["include"].values is None


class TestDeclaredDescriptionPreserved:
    def test_declared_with_description_is_not_clobbered(self, tmp_path: Path) -> None:
        fp = _write(
            tmp_path,
            """---
[flags.show]
type = "boolean"
description = "Show extra content"
---
{if show}EXTRA{end}""",
        )
        prompt = load_prompt(fp, meta="allow")
        assert prompt.meta is not None
        # Declared flag, body usage matches: description must survive the
        # implicit-flag merge step (which should not touch declared names).
        assert prompt.meta.flags["show"].description == "Show extra content"
        assert prompt.meta.flags["show"].kind == "boolean"


class TestImplicitIfSwitchConflictViaFromString:
    """Regression for the ``Prompt.from_string`` integration path.

    The walker raises ``E_FLAG_USED_AS_BOTH_IF_AND_SWITCH`` for implicit
    body-only conflicts (covered in ``tests/syntax/test_walker.py``), and
    ``test_reconcile.py`` covers declared-vs-body conflicts. This test
    guards the end-to-end ``Prompt.from_string`` pipeline for an
    implicit-only conflict (no frontmatter declaration).
    """

    def test_from_string_implicit_if_and_switch_on_same_name(self) -> None:
        with pytest.raises(SemanticError) as exc:
            Prompt.from_string(
                "{if foo}A{end}{switch foo}{case x}B{end}",
                metadata="allow",
            )
        assert exc.value.code == "E_FLAG_USED_AS_BOTH_IF_AND_SWITCH"
        assert "foo" in str(exc.value)


class TestMixedCaseIdentifierIntegration:
    """SPEC: identifiers are case-sensitive and may include keyword-like
    prefixes (e.g. ``Ifx``, ``EndUser``). Complements the lexer-level
    test by exercising the full Prompt pipeline."""

    def test_from_string_mixed_case_keyword_like_variables(self) -> None:
        prompt = Prompt.from_string("Hello {Ifx} and {EndUser}.")
        assert prompt.format(Ifx="A", EndUser="B") == "Hello A and B."


class TestFormatStillWorks:
    """Implicit flag injection must not change format-time validation
    semantics — body-only flags continue to use the implicit-mode
    validator path (which respects ``{else}`` exhaustiveness)."""

    def test_implicit_enum_with_else_accepts_unenumerated_value(
        self, tmp_path: Path
    ) -> None:
        prompt = Prompt.from_string(
            "{switch tier}{case free}F{else}X{end}",
            metadata="allow",
        )
        # Even though meta.flags["tier"] is now declared as enum=[free],
        # the validator must use the pre-implicit snapshot and accept
        # "premium" because the body has an {else} branch.
        assert prompt.format(flags={"tier": "premium"}) == "X"
