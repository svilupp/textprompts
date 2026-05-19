"""Tests for the frontmatter schema layer (PHASE-4 / SPEC §4.3, §4.4)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
import yaml  # type: ignore[import-untyped]

try:
    import tomllib
except ImportError:  # pragma: no cover
    import tomli as tomllib  # type: ignore[import-not-found, no-redef]

from textprompts import FlagDecl, VariableDecl, load_prompt
from textprompts.errors import FrontmatterError
from textprompts.frontmatter_schema import parse_flags_and_variables


def _toml_fm(text: str) -> dict[str, Any]:
    return dict(tomllib.loads(text))


def _yaml_fm(text: str) -> dict[str, Any]:
    return dict(yaml.safe_load(text))


class TestEmptyInput:
    def test_empty_object_returns_empty_records(self) -> None:
        flags, variables, extras = parse_flags_and_variables({})
        assert flags == {}
        assert variables == {}
        assert extras == {}

    def test_non_schema_fields_are_kept_in_extras(self) -> None:
        flags, variables, extras = parse_flags_and_variables(
            {"title": "Demo", "owner": "@team", "counts": [1, 2, 3]}
        )
        assert flags == {}
        assert variables == {}
        # extras preserves all non-schema keys; caller filters known fields.
        assert extras == {"title": "Demo", "owner": "@team", "counts": [1, 2, 3]}


class TestBooleanFlags:
    def test_explicit_type_boolean(self) -> None:
        data = _toml_fm(
            '[flags.premium_tier]\ntype = "boolean"\ndescription = "Premium user"'
        )
        flags, _, _ = parse_flags_and_variables(data)
        assert flags["premium_tier"] == FlagDecl(
            kind="boolean",
            values=None,
            description="Premium user",
            extras={},
        )

    def test_shorthand_no_type_defaults_to_boolean(self) -> None:
        data = _toml_fm('[flags.show_tips]\ndescription = "Show tips"')
        flags, _, _ = parse_flags_and_variables(data)
        assert flags["show_tips"].kind == "boolean"
        assert flags["show_tips"].description == "Show tips"
        assert flags["show_tips"].values is None

    def test_boolean_flag_with_no_description(self) -> None:
        data = _toml_fm('[flags.has_history]\ntype = "boolean"')
        flags, _, _ = parse_flags_and_variables(data)
        assert flags["has_history"].kind == "boolean"
        assert flags["has_history"].description is None
        assert flags["has_history"].extras == {}


class TestEnumFlags:
    def test_enum_flag_with_values(self) -> None:
        data = _toml_fm(
            '[flags.tier]\ntype = "enum"\nvalues = ["free", "premium", "enterprise"]\ndescription = "T"'
        )
        flags, _, _ = parse_flags_and_variables(data)
        assert flags["tier"].kind == "enum"
        assert flags["tier"].values == ("free", "premium", "enterprise")
        assert flags["tier"].description == "T"

    def test_enum_value_order_preserved(self) -> None:
        data = _toml_fm('[flags.tier]\ntype = "enum"\nvalues = ["c", "a", "b"]')
        flags, _, _ = parse_flags_and_variables(data)
        assert flags["tier"].values == ("c", "a", "b")


class TestVariables:
    def test_variable_with_description(self) -> None:
        data = _toml_fm('[variables.role]\ndescription = "Assistant role"')
        _, variables, _ = parse_flags_and_variables(data)
        assert variables["role"] == VariableDecl(
            description="Assistant role", extras={}
        )

    def test_variable_with_no_description(self) -> None:
        data = _toml_fm("[variables.user_name]")
        _, variables, _ = parse_flags_and_variables(data)
        assert variables["user_name"].description is None
        assert variables["user_name"].extras == {}


class TestTomlYamlParity:
    def test_identical_flags_from_equivalent_inputs(self) -> None:
        toml = _toml_fm(
            '[flags.tier]\ntype = "enum"\nvalues = ["free", "premium"]\n'
            'description = "Tier"\nowner = "@product"\n\n'
            '[flags.premium]\ndescription = "Premium toggle"\n\n'
            '[variables.user_name]\ndescription = "Name"'
        )
        yaml_data = _yaml_fm(
            "flags:\n  tier:\n    type: enum\n    values: [free, premium]\n"
            '    description: Tier\n    owner: "@product"\n'
            "  premium:\n    description: Premium toggle\n"
            "variables:\n  user_name:\n    description: Name\n"
        )
        flags_t, vars_t, _ = parse_flags_and_variables(toml)
        flags_y, vars_y, _ = parse_flags_and_variables(yaml_data)
        assert flags_t == flags_y
        assert vars_t == vars_y


class TestExtrasPreservation:
    def test_per_flag_extras_preserve_original_types(self) -> None:
        data = _toml_fm(
            '[flags.tier]\ntype = "enum"\nvalues = ["free", "premium"]\n'
            'description = "Tier"\nowner = "@product"\nexpires = "2026-12-01"\n'
            'rollout = 25\nactive = true\nteams = ["a", "b"]'
        )
        flags, _, _ = parse_flags_and_variables(data)
        decl = flags["tier"]
        assert decl.extras["owner"] == "@product"
        assert decl.extras["expires"] == "2026-12-01"
        assert decl.extras["rollout"] == 25
        assert decl.extras["active"] is True
        assert decl.extras["teams"] == ["a", "b"]
        # Standard fields should not appear in extras.
        assert "type" not in decl.extras
        assert "values" not in decl.extras
        assert "description" not in decl.extras

    def test_per_variable_extras_preserve_yaml_types(self) -> None:
        data = _yaml_fm(
            "variables:\n  last_question:\n    description: Prior question\n"
            '    owner: "@support"\n    pii: true\n    max_chars: 200\n'
        )
        _, variables, _ = parse_flags_and_variables(data)
        decl = variables["last_question"]
        assert decl.extras["owner"] == "@support"
        assert decl.extras["pii"] is True
        assert decl.extras["max_chars"] == 200
        assert "description" not in decl.extras

    def test_top_level_extras_via_loaded_prompt(self, tmp_path: Path) -> None:
        content = """---
title = "Demo"
owner = "@team"
last_reviewed = "2026-04-30"
priority = 7

[flags.tier]
type = "enum"
values = ["free", "premium"]
description = "Tier"
owner_flag = "@product"

[variables.role]
description = "Role"
notes = "internal"
---
Hello {role}.
"""
        fp = tmp_path / "p.txt"
        fp.write_text(content)
        prompt = load_prompt(fp, meta="allow")
        assert prompt.meta is not None
        # top-level extras
        assert prompt.meta.extras["owner"] == "@team"
        assert prompt.meta.extras["last_reviewed"] == "2026-04-30"
        assert prompt.meta.extras["priority"] == 7
        # schema sections NOT in extras
        assert "flags" not in prompt.meta.extras
        assert "variables" not in prompt.meta.extras
        # per-flag / per-variable extras
        assert prompt.meta.flags["tier"].extras["owner_flag"] == "@product"
        assert prompt.meta.variables["role"].extras["notes"] == "internal"


class TestRawFlagsVariablesExcluded:
    def test_raw_keys_excluded_from_meta_extras(self, tmp_path: Path) -> None:
        content = """---
title = "Demo"

[flags.t]
description = "T"

[variables.v]
description = "V"
---
Body {v}.
"""
        fp = tmp_path / "p.txt"
        fp.write_text(content)
        prompt = load_prompt(fp, meta="allow")
        assert prompt.meta is not None
        assert prompt.meta.extras == {}
        assert prompt.meta.flags["t"] is not None
        assert prompt.meta.variables["v"] is not None


class TestIdentifierErrors:
    def test_invalid_flag_name(self) -> None:
        data = {"flags": {"bad-name": {"description": "x"}}}
        with pytest.raises(FrontmatterError) as exc:
            parse_flags_and_variables(data)
        assert exc.value.code == "E_INVALID_IDENTIFIER"

    def test_reserved_keyword_as_flag_name(self) -> None:
        data = {"flags": {"if": {"description": "x"}}}
        with pytest.raises(FrontmatterError) as exc:
            parse_flags_and_variables(data)
        assert exc.value.code == "E_RESERVED_IDENTIFIER"

    def test_reserved_flags_as_flag_name(self) -> None:
        data = {"flags": {"flags": {"description": "x"}}}
        with pytest.raises(FrontmatterError) as exc:
            parse_flags_and_variables(data)
        assert exc.value.code == "E_RESERVED_IDENTIFIER"

    def test_invalid_variable_name(self) -> None:
        data = {"variables": {"1bad": {"description": "x"}}}
        with pytest.raises(FrontmatterError) as exc:
            parse_flags_and_variables(data)
        assert exc.value.code == "E_INVALID_IDENTIFIER"

    def test_reserved_variable_name(self) -> None:
        data = {"variables": {"switch": {"description": "x"}}}
        with pytest.raises(FrontmatterError) as exc:
            parse_flags_and_variables(data)
        assert exc.value.code == "E_RESERVED_IDENTIFIER"


class TestFlagTypeErrors:
    def test_invalid_type_string(self) -> None:
        data = {"flags": {"foo": {"type": "string", "description": "x"}}}
        with pytest.raises(FrontmatterError) as exc:
            parse_flags_and_variables(data)
        assert exc.value.code == "E_INVALID_FLAG_TYPE"


class TestFlagValueErrors:
    def test_enum_missing_values(self) -> None:
        data = {"flags": {"tier": {"type": "enum", "description": "T"}}}
        with pytest.raises(FrontmatterError) as exc:
            parse_flags_and_variables(data)
        assert exc.value.code == "E_INVALID_FLAG_VALUES"

    def test_enum_empty_values(self) -> None:
        data = {"flags": {"tier": {"type": "enum", "values": []}}}
        with pytest.raises(FrontmatterError) as exc:
            parse_flags_and_variables(data)
        assert exc.value.code == "E_INVALID_FLAG_VALUES"

    def test_enum_values_not_array(self) -> None:
        data = {"flags": {"tier": {"type": "enum", "values": "free,premium"}}}
        with pytest.raises(FrontmatterError) as exc:
            parse_flags_and_variables(data)
        assert exc.value.code == "E_INVALID_FLAG_VALUES"

    def test_enum_value_non_string(self) -> None:
        data = {"flags": {"tier": {"type": "enum", "values": ["free", 42]}}}
        with pytest.raises(FrontmatterError) as exc:
            parse_flags_and_variables(data)
        assert exc.value.code == "E_INVALID_FLAG_VALUES"

    def test_enum_value_not_identifier(self) -> None:
        data = {"flags": {"tier": {"type": "enum", "values": ["free-tier"]}}}
        with pytest.raises(FrontmatterError) as exc:
            parse_flags_and_variables(data)
        assert exc.value.code == "E_INVALID_IDENTIFIER"

    def test_enum_value_reserved_keyword(self) -> None:
        data = {"flags": {"tier": {"type": "enum", "values": ["free", "end"]}}}
        with pytest.raises(FrontmatterError) as exc:
            parse_flags_and_variables(data)
        assert exc.value.code == "E_RESERVED_IDENTIFIER"

    def test_enum_duplicate_values(self) -> None:
        data = {"flags": {"tier": {"type": "enum", "values": ["free", "free"]}}}
        with pytest.raises(FrontmatterError) as exc:
            parse_flags_and_variables(data)
        assert exc.value.code == "E_INVALID_FLAG_VALUES"

    def test_boolean_with_values(self) -> None:
        data = {"flags": {"foo": {"type": "boolean", "values": ["a"]}}}
        with pytest.raises(FrontmatterError) as exc:
            parse_flags_and_variables(data)
        assert exc.value.code == "E_INVALID_FLAG_VALUES"

    def test_shorthand_with_values(self) -> None:
        data = {"flags": {"foo": {"values": ["a"]}}}
        with pytest.raises(FrontmatterError) as exc:
            parse_flags_and_variables(data)
        assert exc.value.code == "E_INVALID_FLAG_VALUES"


class TestSchemaShapeErrors:
    def test_flags_is_array(self) -> None:
        data = {"flags": ["nope"]}
        with pytest.raises(FrontmatterError) as exc:
            parse_flags_and_variables(data)
        assert exc.value.code == "E_BAD_SCHEMA_SHAPE"

    def test_variables_is_string(self) -> None:
        data = {"variables": "not a table"}
        with pytest.raises(FrontmatterError) as exc:
            parse_flags_and_variables(data)
        assert exc.value.code == "E_BAD_SCHEMA_SHAPE"

    def test_flag_entry_not_object(self) -> None:
        data = {"flags": {"foo": "boolean"}}
        with pytest.raises(FrontmatterError) as exc:
            parse_flags_and_variables(data)
        assert exc.value.code == "E_BAD_SCHEMA_SHAPE"

    def test_flag_description_not_string(self) -> None:
        data = {"flags": {"foo": {"description": 42}}}
        with pytest.raises(FrontmatterError) as exc:
            parse_flags_and_variables(data)
        assert exc.value.code == "E_BAD_SCHEMA_SHAPE"

    def test_variable_description_not_string(self) -> None:
        data = {"variables": {"v": {"description": True}}}
        with pytest.raises(FrontmatterError) as exc:
            parse_flags_and_variables(data)
        assert exc.value.code == "E_BAD_SCHEMA_SHAPE"


class TestDuplicateName:
    def test_same_name_in_flags_and_variables(self) -> None:
        data = {
            "flags": {"tier": {"type": "enum", "values": ["a", "b"]}},
            "variables": {"tier": {"description": "x"}},
        }
        with pytest.raises(FrontmatterError) as exc:
            parse_flags_and_variables(data)
        assert exc.value.code == "E_DUPLICATE_NAME"
