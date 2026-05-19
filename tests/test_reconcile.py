"""Tests for body-vs-declared reconciliation (PHASE-4 / SPEC §4.7)."""

from __future__ import annotations

from pathlib import Path

import pytest

from textprompts import Prompt, load_prompt
from textprompts.errors import FrontmatterError, SemanticError


def _write(tmp_path: Path, content: str, name: str = "p.txt") -> Path:
    fp = tmp_path / name
    fp.write_text(content)
    return fp


class TestTypeShapeDisagreement:
    def test_boolean_declared_used_in_switch(self, tmp_path: Path) -> None:
        fp = _write(
            tmp_path,
            """---
[flags.foo]
type = "boolean"
description = "B"
---
{switch foo}{case a}A{end}""",
        )
        with pytest.raises(SemanticError) as exc:
            load_prompt(fp, meta="allow")
        assert exc.value.code == "E_FLAG_USED_AS_BOTH_IF_AND_SWITCH"

    def test_enum_declared_used_in_if(self, tmp_path: Path) -> None:
        fp = _write(
            tmp_path,
            """---
[flags.tier]
type = "enum"
values = ["free", "premium"]
description = "T"
---
{if tier}x{end}""",
        )
        with pytest.raises(SemanticError) as exc:
            load_prompt(fp, meta="allow")
        assert exc.value.code == "E_FLAG_USED_AS_BOTH_IF_AND_SWITCH"


class TestCaseValueValidity:
    def test_case_value_not_in_declared_enum(self, tmp_path: Path) -> None:
        fp = _write(
            tmp_path,
            """---
[flags.tier]
type = "enum"
values = ["free", "premium"]
description = "T"
---
{switch tier}{case free}f{case bogus}?{case premium}p{end}""",
        )
        with pytest.raises(SemanticError) as exc:
            load_prompt(fp, meta="allow")
        assert exc.value.code == "E_INVALID_CASE_VALUE"


class TestSwitchExhaustiveness:
    def test_non_exhaustive_without_else(self, tmp_path: Path) -> None:
        fp = _write(
            tmp_path,
            """---
[flags.tier]
type = "enum"
values = ["free", "premium", "enterprise"]
description = "T"
---
{switch tier}{case free}f{case premium}p{end}""",
        )
        with pytest.raises(SemanticError) as exc:
            load_prompt(fp, meta="allow")
        assert exc.value.code == "E_NON_EXHAUSTIVE_SWITCH"
        # Names missing cases in the message.
        assert "enterprise" in str(exc.value)

    def test_non_exhaustive_with_else_passes(self, tmp_path: Path) -> None:
        fp = _write(
            tmp_path,
            """---
[flags.tier]
type = "enum"
values = ["free", "premium", "enterprise"]
description = "T"
---
{switch tier}{case free}f{case premium}p{else}?{end}""",
        )
        prompt = load_prompt(fp, meta="allow")
        assert prompt.meta is not None
        assert prompt.meta.flags["tier"].kind == "enum"


class TestNameCollision:
    def test_name_used_as_both_flag_and_variable_in_body(self, tmp_path: Path) -> None:
        fp = _write(tmp_path, "{if foo}body{end}{foo}")
        with pytest.raises(SemanticError) as exc:
            load_prompt(fp, meta="allow")
        assert exc.value.code == "E_FLAG_AND_VARIABLE_COLLISION"

    def test_declared_variable_used_as_body_flag(self, tmp_path: Path) -> None:
        fp = _write(
            tmp_path,
            """---
[variables.foo]
description = "Foo variable"
---
{if foo}body{end}""",
        )
        with pytest.raises(SemanticError) as exc:
            load_prompt(fp, metadata="allow")
        assert exc.value.code == "E_FLAG_AND_VARIABLE_COLLISION"

    def test_declared_flag_used_as_body_variable(self, tmp_path: Path) -> None:
        fp = _write(
            tmp_path,
            """---
[flags.foo]
description = "Foo flag"
---
Value: {foo}""",
        )
        with pytest.raises(SemanticError) as exc:
            load_prompt(fp, metadata="allow")
        assert exc.value.code == "E_FLAG_AND_VARIABLE_COLLISION"


class TestImplicitMode:
    def test_undeclared_body_flag_ok_in_allow(self, tmp_path: Path) -> None:
        # SPEC §8.1 minimal example — no frontmatter, body refs allowed.
        # Per SPEC §4.5, implicit flags are surfaced via prompt.meta.flags.
        fp = _write(tmp_path, "Hello {name}!\n{if vip}VIP{end}")
        prompt = load_prompt(fp, meta="allow")
        assert prompt.meta is not None
        assert set(prompt.meta.flags.keys()) == {"vip"}
        assert prompt.meta.flags["vip"].kind == "boolean"
        assert prompt.meta.flags["vip"].values is None
        assert prompt.meta.variables == {}


class TestStrictMode:
    def test_strict_rejects_undeclared_body_flag(self, tmp_path: Path) -> None:
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

    def test_strict_accepts_declared_body_flag_with_description(
        self, tmp_path: Path
    ) -> None:
        fp = _write(
            tmp_path,
            """---
title = "T"
description = "D"
version = "1"

[flags.vip]
description = "VIP customer"
---
{if vip}VIP{end}""",
        )
        prompt = load_prompt(fp, meta="strict")
        assert prompt.meta is not None
        assert prompt.meta.flags["vip"].kind == "boolean"

    def test_strict_rejects_undescribed_flag(self, tmp_path: Path) -> None:
        fp = _write(
            tmp_path,
            """---
title = "T"
description = "D"
version = "1"

[flags.vip]
---
{if vip}VIP{end}""",
        )
        with pytest.raises(FrontmatterError) as exc:
            load_prompt(fp, meta="strict")
        assert exc.value.code == "E_BAD_SCHEMA_SHAPE"

    def test_strict_allows_undeclared_variable_in_body(self, tmp_path: Path) -> None:
        # SPEC §4.6: variables are not required to be declared in strict mode.
        fp = _write(
            tmp_path,
            """---
title = "T"
description = "D"
version = "1"
---
Hello {name}!""",
        )
        prompt = load_prompt(fp, meta="strict")
        assert prompt.meta is not None
        assert prompt.meta.variables == {}


class TestStrictDeclaredFlagDescriptionRegression:
    """SPEC §4.6 regression: every declared flag must carry a non-empty
    ``description`` under strict mode — even if the body does not reference
    it. Guards the loop in ``reconcile._reconcile`` that walks
    ``declared_flags`` independently of body references.
    """

    _BASE_FRONTMATTER = (
        "---\n"
        'title = "T"\n'
        'description = "D"\n'
        'version = "1"\n'
        "\n"
        "[flags.unused]\n"
        'type = "boolean"\n'
    )

    def test_declared_unreferenced_flag_missing_description(self) -> None:
        # Declared in [flags.unused] with no description; body does NOT
        # reference it.
        src = self._BASE_FRONTMATTER + "---\nHello!\n"
        with pytest.raises(FrontmatterError) as exc:
            Prompt.from_string(src, metadata="strict")
        assert exc.value.code == "E_BAD_SCHEMA_SHAPE"
        assert exc.value.path == "flags.unused.description"

    def test_declared_referenced_flag_missing_description(self) -> None:
        # Same setup but the flag IS used in the body — still must raise.
        src = self._BASE_FRONTMATTER + "---\n{if unused}X{end}\n"
        with pytest.raises(FrontmatterError) as exc:
            Prompt.from_string(src, metadata="strict")
        assert exc.value.code == "E_BAD_SCHEMA_SHAPE"
        assert exc.value.path == "flags.unused.description"

    def test_declared_flag_empty_string_description(self) -> None:
        src = self._BASE_FRONTMATTER + 'description = ""\n' + "---\nHello!\n"
        with pytest.raises(FrontmatterError) as exc:
            Prompt.from_string(src, metadata="strict")
        assert exc.value.code == "E_BAD_SCHEMA_SHAPE"
        assert exc.value.path == "flags.unused.description"

    def test_declared_flag_whitespace_only_description(self) -> None:
        src = self._BASE_FRONTMATTER + 'description = "   "\n' + "---\nHello!\n"
        with pytest.raises(FrontmatterError) as exc:
            Prompt.from_string(src, metadata="strict")
        assert exc.value.code == "E_BAD_SCHEMA_SHAPE"
        assert exc.value.path == "flags.unused.description"

    def test_declared_flag_with_real_description_loads(self) -> None:
        src = self._BASE_FRONTMATTER + 'description = "Real desc"\n' + "---\nHello!\n"
        prompt = Prompt.from_string(src, metadata="strict")
        assert prompt.meta is not None
        assert prompt.meta.flags["unused"].kind == "boolean"
        assert prompt.meta.flags["unused"].description == "Real desc"
