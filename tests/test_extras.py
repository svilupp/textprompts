"""Tests for extras support — custom frontmatter fields beyond the 5 known fields."""

from pathlib import Path

from textprompts import PromptString, load_prompt, save_prompt
from textprompts.models import Prompt, PromptMeta


class TestExtrasBasicCustomFields:
    """Test that simple custom fields end up in extras."""

    def test_simple_string_custom_fields(self, tmp_path: Path) -> None:
        fp = tmp_path / "test.txt"
        fp.write_text(
            '---\ntitle: My Skill\ndescription: Does things\nversion: "1.0.0"\n'
            "custom_field: hello\npriority: high\n---\n\nBody."
        )
        prompt = load_prompt(fp, meta="allow")
        assert prompt.meta is not None
        assert prompt.meta.title == "My Skill"
        assert prompt.meta.extras is not None
        assert prompt.meta.extras["custom_field"] == "hello"
        assert prompt.meta.extras["priority"] == "high"

    def test_boolean_custom_fields_preserve_type(self, tmp_path: Path) -> None:
        fp = tmp_path / "test.txt"
        fp.write_text(
            '---\ntitle: Test\ndescription: Test\nversion: "1.0.0"\n'
            "disable-model-invocation: true\nuser-invocable: false\n---\n\nBody."
        )
        prompt = load_prompt(fp, meta="allow")
        assert prompt.meta is not None
        assert prompt.meta.extras is not None
        assert prompt.meta.extras["disable-model-invocation"] is True
        assert prompt.meta.extras["user-invocable"] is False

    def test_numeric_custom_fields_preserve_type(self, tmp_path: Path) -> None:
        fp = tmp_path / "test.txt"
        fp.write_text(
            '---\ntitle: Test\ndescription: Test\nversion: "1.0.0"\n'
            "timeout: 30\nmax-retries: 3\n---\n\nBody."
        )
        prompt = load_prompt(fp, meta="allow")
        assert prompt.meta is not None
        assert prompt.meta.extras is not None
        assert prompt.meta.extras["timeout"] == 30
        assert prompt.meta.extras["max-retries"] == 3

    def test_no_extras_when_only_known_fields(self, tmp_path: Path) -> None:
        fp = tmp_path / "test.txt"
        fp.write_text(
            '---\ntitle: Test\ndescription: A desc\nversion: "1.0.0"\n'
            "author: Me\n---\n\nBody."
        )
        prompt = load_prompt(fp, meta="allow")
        assert prompt.meta is not None
        assert prompt.meta.extras is None

    def test_extras_absent_when_no_frontmatter(self, tmp_path: Path) -> None:
        fp = tmp_path / "test.txt"
        fp.write_text("Just body content")
        prompt = load_prompt(fp, meta="allow")
        assert prompt.meta is not None
        assert prompt.meta.extras is None


class TestExtrasArrays:
    """Test arrays in extras."""

    def test_simple_string_arrays(self, tmp_path: Path) -> None:
        fp = tmp_path / "test.txt"
        fp.write_text(
            '---\ntitle: Test\ndescription: Test\nversion: "1.0.0"\n'
            "permissions:\n  - read\n  - write\n  - admin\n---\n\nBody."
        )
        prompt = load_prompt(fp, meta="allow")
        assert prompt.meta is not None
        assert prompt.meta.extras is not None
        assert prompt.meta.extras["permissions"] == ["read", "write", "admin"]

    def test_arrays_of_objects(self, tmp_path: Path) -> None:
        fp = tmp_path / "test.txt"
        fp.write_text(
            '---\ntitle: Test\ndescription: Test\nversion: "1.0.0"\n'
            'triggers:\n  - cron: "0 9 * * 1"\n  - voice: "check inventory"\n---\n\nBody.'
        )
        prompt = load_prompt(fp, meta="allow")
        assert prompt.meta is not None
        assert prompt.meta.extras is not None
        assert prompt.meta.extras["triggers"] == [
            {"cron": "0 9 * * 1"},
            {"voice": "check inventory"},
        ]


class TestExtrasNestedObjects:
    """Test nested objects in extras."""

    def test_nested_object(self, tmp_path: Path) -> None:
        fp = tmp_path / "test.txt"
        fp.write_text(
            '---\ntitle: Test\ndescription: Test\nversion: "1.0.0"\n'
            "hooks:\n  pre-run: echo hello\n  post-run: echo done\n---\n\nBody."
        )
        prompt = load_prompt(fp, meta="allow")
        assert prompt.meta is not None
        assert prompt.meta.extras is not None
        assert prompt.meta.extras["hooks"] == {
            "pre-run": "echo hello",
            "post-run": "echo done",
        }

    def test_deeply_nested_object(self, tmp_path: Path) -> None:
        fp = tmp_path / "test.txt"
        fp.write_text(
            '---\ntitle: Test\ndescription: Test\nversion: "1.0.0"\n'
            "config:\n  deep:\n    nested:\n      value: 42\n---\n\nBody."
        )
        prompt = load_prompt(fp, meta="allow")
        assert prompt.meta is not None
        assert prompt.meta.extras is not None
        config = prompt.meta.extras["config"]
        assert config["deep"]["nested"]["value"] == 42


class TestExtrasClaudeCodeSkillFormat:
    """Test all official Claude Code skill frontmatter fields."""

    def test_full_skill_frontmatter(self, tmp_path: Path) -> None:
        fp = tmp_path / "SKILL.md"
        fp.write_text(
            """---
name: ast-grep
description: Use ast-grep for structural code search and safe codemods.
version: "1.0.0"
author: pidge-team
allowed-tools: "Read, Grep, Glob, Bash(bd:*)"
disable-model-invocation: true
user-invocable: false
model: sonnet
context: fork
agent: Explore
argument-hint: "[pattern] [language]"
license: MIT
compatibility: Requires ast-grep CLI installed
---

# AST Grep Skill

Use this skill to search code structurally."""
        )
        prompt = load_prompt(fp, meta="allow")
        assert prompt.meta is not None

        # Known fields
        assert prompt.meta.description == (
            "Use ast-grep for structural code search and safe codemods."
        )
        assert prompt.meta.version == "1.0.0"
        assert prompt.meta.author == "pidge-team"

        # Extras — Claude Code specific fields
        extras = prompt.meta.extras
        assert extras is not None
        assert extras["name"] == "ast-grep"
        assert extras["allowed-tools"] == "Read, Grep, Glob, Bash(bd:*)"
        assert extras["disable-model-invocation"] is True
        assert extras["user-invocable"] is False
        assert extras["model"] == "sonnet"
        assert extras["context"] == "fork"
        assert extras["agent"] == "Explore"
        assert extras["argument-hint"] == "[pattern] [language]"
        assert extras["license"] == "MIT"
        assert extras["compatibility"] == "Requires ast-grep CLI installed"

        # Body
        assert "AST Grep Skill" in prompt.prompt

    def test_skill_with_hooks_object(self, tmp_path: Path) -> None:
        fp = tmp_path / "SKILL.md"
        fp.write_text(
            """---
name: test-runner
description: Runs tests with hooks.
version: "1.0.0"
hooks:
  pre-tool-use:
    command: echo before
  post-tool-use:
    command: echo after
---

Run tests."""
        )
        prompt = load_prompt(fp, meta="allow")
        assert prompt.meta is not None
        assert prompt.meta.extras is not None
        hooks = prompt.meta.extras["hooks"]
        assert hooks["pre-tool-use"] == {"command": "echo before"}
        assert hooks["post-tool-use"] == {"command": "echo after"}

    def test_skill_with_permissions_array(self, tmp_path: Path) -> None:
        fp = tmp_path / "SKILL.md"
        fp.write_text(
            """---
name: shopify-check
description: Check Shopify inventory.
version: "1.0.0"
permissions:
  - shopify:read_products
  - shopify:read_inventory
---

Check inventory levels."""
        )
        prompt = load_prompt(fp, meta="allow")
        assert prompt.meta is not None
        assert prompt.meta.extras is not None
        assert prompt.meta.extras["permissions"] == [
            "shopify:read_products",
            "shopify:read_inventory",
        ]

    def test_skill_with_triggers_array_of_objects(self, tmp_path: Path) -> None:
        fp = tmp_path / "SKILL.md"
        fp.write_text(
            """---
name: scheduled-check
description: Runs on schedule or voice.
version: "1.0.0"
triggers:
  - cron: "0 9 * * 1"
  - voice: "check my inventory"
---

Instructions here."""
        )
        prompt = load_prompt(fp, meta="allow")
        assert prompt.meta is not None
        assert prompt.meta.extras is not None
        assert prompt.meta.extras["triggers"] == [
            {"cron": "0 9 * * 1"},
            {"voice": "check my inventory"},
        ]

    def test_minimal_skill(self, tmp_path: Path) -> None:
        fp = tmp_path / "SKILL.md"
        fp.write_text(
            """---
name: simple-skill
description: A simple skill.
---

Do the thing."""
        )
        prompt = load_prompt(fp, meta="allow")
        assert prompt.meta is not None
        assert prompt.meta.extras is not None
        assert prompt.meta.extras["name"] == "simple-skill"

    def test_skill_with_multiline_description(self, tmp_path: Path) -> None:
        fp = tmp_path / "SKILL.md"
        fp.write_text(
            """---
name: beads
description: >
  Tracks complex, multi-session work using the Beads issue tracker
  and dependency graphs.
version: "0.34.0"
author: "Steve Yegge <https://github.com/steveyegge>"
license: MIT
---

# Beads

Track issues."""
        )
        prompt = load_prompt(fp, meta="allow")
        assert prompt.meta is not None
        assert "Tracks complex" in (prompt.meta.description or "")
        assert prompt.meta.extras is not None
        assert prompt.meta.extras["name"] == "beads"
        assert prompt.meta.extras["license"] == "MIT"

    def test_skill_with_metadata_object(self, tmp_path: Path) -> None:
        """Agent Skills standard 'metadata' field (arbitrary key-value)."""
        fp = tmp_path / "SKILL.md"
        fp.write_text(
            """---
name: my-skill
description: A skill with metadata object.
version: "1.0.0"
metadata:
  category: utility
  difficulty: beginner
---

Body."""
        )
        prompt = load_prompt(fp, meta="allow")
        assert prompt.meta is not None
        assert prompt.meta.extras is not None
        assert prompt.meta.extras["metadata"] == {
            "category": "utility",
            "difficulty": "beginner",
        }

    def test_all_14_official_fields(self, tmp_path: Path) -> None:
        """Verify all 14 official Claude Code skill fields are preserved."""
        fp = tmp_path / "SKILL.md"
        fp.write_text(
            """---
name: full-skill
description: All official fields present.
version: "1.0.0"
author: test-author
license: MIT
compatibility: Requires Python 3.11+
metadata:
  category: testing
allowed-tools: "Read, Grep, Glob"
argument-hint: "[file] [format]"
disable-model-invocation: true
user-invocable: false
model: opus
context: fork
agent: Explore
hooks:
  PreToolUse:
    command: echo pre
---

Full skill body."""
        )
        prompt = load_prompt(fp, meta="allow")
        assert prompt.meta is not None
        extras = prompt.meta.extras
        assert extras is not None

        # Standard fields in known slots
        assert prompt.meta.description == "All official fields present."
        assert prompt.meta.version == "1.0.0"
        assert prompt.meta.author == "test-author"

        # Standard fields in extras
        assert extras["name"] == "full-skill"
        assert extras["license"] == "MIT"
        assert extras["compatibility"] == "Requires Python 3.11+"
        assert extras["metadata"] == {"category": "testing"}

        # Claude Code extension fields in extras
        assert extras["allowed-tools"] == "Read, Grep, Glob"
        assert extras["argument-hint"] == "[file] [format]"
        assert extras["disable-model-invocation"] is True
        assert extras["user-invocable"] is False
        assert extras["model"] == "opus"
        assert extras["context"] == "fork"
        assert extras["agent"] == "Explore"
        assert extras["hooks"] == {"PreToolUse": {"command": "echo pre"}}


class TestExtrasConstructorPassthrough:
    """Test that extras survive the Prompt constructor."""

    def test_extras_via_constructor(self, tmp_path: Path) -> None:
        fp = tmp_path / "test.txt"
        prompt = Prompt(
            path=fp,
            meta=PromptMeta(
                title="Test",
                extras={
                    "name": "my-skill",
                    "allowed-tools": "Read, Grep",
                    "disable-model-invocation": True,
                },
            ),
            prompt=PromptString("Body."),
        )
        assert prompt.meta is not None
        assert prompt.meta.extras is not None
        assert prompt.meta.extras["name"] == "my-skill"
        assert prompt.meta.extras["allowed-tools"] == "Read, Grep"
        assert prompt.meta.extras["disable-model-invocation"] is True


class TestExtrasYamlRoundTrip:
    """Test save + load round-trips with extras."""

    def test_simple_extras_roundtrip(self, tmp_path: Path) -> None:
        fp = tmp_path / "test.txt"
        prompt = Prompt(
            path=fp,
            meta=PromptMeta(
                title="Skill",
                description="A skill",
                version="1.0.0",
                extras={"name": "my-skill", "license": "MIT"},
            ),
            prompt=PromptString("Do the thing."),
        )
        save_prompt(fp, prompt, format="yaml")
        loaded = load_prompt(fp, meta="allow")
        assert loaded.meta is not None
        assert loaded.meta.extras is not None
        assert loaded.meta.extras["name"] == "my-skill"
        assert loaded.meta.extras["license"] == "MIT"

    def test_boolean_extras_roundtrip(self, tmp_path: Path) -> None:
        fp = tmp_path / "test.txt"
        prompt = Prompt(
            path=fp,
            meta=PromptMeta(
                title="Skill",
                description="A skill",
                version="1.0.0",
                extras={
                    "disable-model-invocation": True,
                    "user-invocable": False,
                },
            ),
            prompt=PromptString("Body."),
        )
        save_prompt(fp, prompt, format="yaml")
        loaded = load_prompt(fp, meta="allow")
        assert loaded.meta is not None
        assert loaded.meta.extras is not None
        assert loaded.meta.extras["disable-model-invocation"] is True
        assert loaded.meta.extras["user-invocable"] is False

    def test_array_extras_roundtrip(self, tmp_path: Path) -> None:
        fp = tmp_path / "test.txt"
        prompt = Prompt(
            path=fp,
            meta=PromptMeta(
                title="Skill",
                description="A skill",
                version="1.0.0",
                extras={"permissions": ["read", "write", "admin"]},
            ),
            prompt=PromptString("Body."),
        )
        save_prompt(fp, prompt, format="yaml")
        loaded = load_prompt(fp, meta="allow")
        assert loaded.meta is not None
        assert loaded.meta.extras is not None
        assert loaded.meta.extras["permissions"] == ["read", "write", "admin"]

    def test_nested_object_extras_roundtrip(self, tmp_path: Path) -> None:
        fp = tmp_path / "test.txt"
        prompt = Prompt(
            path=fp,
            meta=PromptMeta(
                title="Skill",
                description="A skill",
                version="1.0.0",
                extras={
                    "hooks": {"pre-run": "echo hello", "post-run": "echo done"},
                },
            ),
            prompt=PromptString("Body."),
        )
        save_prompt(fp, prompt, format="yaml")
        loaded = load_prompt(fp, meta="allow")
        assert loaded.meta is not None
        assert loaded.meta.extras is not None
        assert loaded.meta.extras["hooks"] == {
            "pre-run": "echo hello",
            "post-run": "echo done",
        }

    def test_toml_extras_roundtrip_simple_types(self, tmp_path: Path) -> None:
        fp = tmp_path / "test.txt"
        prompt = Prompt(
            path=fp,
            meta=PromptMeta(
                title="Skill",
                description="A skill",
                version="1.0.0",
                extras={
                    "name": "my-skill",
                    "flag": True,
                    "count": 42,
                    "tags": ["a", "b"],
                },
            ),
            prompt=PromptString("Body."),
        )
        save_prompt(fp, prompt, format="toml")
        loaded = load_prompt(fp, meta="allow")
        assert loaded.meta is not None
        assert loaded.meta.extras is not None
        assert loaded.meta.extras["name"] == "my-skill"
        assert loaded.meta.extras["flag"] is True
        assert loaded.meta.extras["count"] == 42
        assert loaded.meta.extras["tags"] == ["a", "b"]

    def test_saved_yaml_contains_extras(self, tmp_path: Path) -> None:
        fp = tmp_path / "test.txt"
        prompt = Prompt(
            path=fp,
            meta=PromptMeta(
                title="Skill",
                description="A skill",
                version="1.0.0",
                extras={
                    "name": "my-skill",
                    "disable-model-invocation": True,
                },
            ),
            prompt=PromptString("Body."),
        )
        save_prompt(fp, prompt, format="yaml")
        saved = fp.read_text()
        assert "my-skill" in saved
        assert "disable-model-invocation: true" in saved


class TestExtrasStrictMode:
    """Test that STRICT mode still captures extras."""

    def test_strict_mode_preserves_extras(self, tmp_path: Path) -> None:
        fp = tmp_path / "test.txt"
        fp.write_text(
            """---
title: Strict Skill
description: Has extras in strict mode
version: "1.0.0"
name: strict-test
allowed-tools: "Read, Grep"
---

Body."""
        )
        prompt = load_prompt(fp, meta="strict")
        assert prompt.meta is not None
        assert prompt.meta.extras is not None
        assert prompt.meta.extras["name"] == "strict-test"
        assert prompt.meta.extras["allowed-tools"] == "Read, Grep"


class TestExtrasKnownFieldCoercion:
    """Test that known fields are still coerced to strings (backward compat)."""

    def test_boolean_known_field_coerced(self, tmp_path: Path) -> None:
        fp = tmp_path / "test.txt"
        fp.write_text(
            '---\ntitle: true\ndescription: test\nversion: "1.0.0"\n---\n\nBody.'
        )
        prompt = load_prompt(fp, meta="allow")
        assert prompt.meta is not None
        assert prompt.meta.title == "True"

    def test_numeric_known_field_coerced(self, tmp_path: Path) -> None:
        fp = tmp_path / "test.txt"
        fp.write_text("---\ntitle: Test\ndescription: test\nversion: 2.0\n---\n\nBody.")
        prompt = load_prompt(fp, meta="allow")
        assert prompt.meta is not None
        assert prompt.meta.version == "2.0"

    def test_boolean_extras_not_coerced(self, tmp_path: Path) -> None:
        fp = tmp_path / "test.txt"
        fp.write_text(
            '---\ntitle: Test\ndescription: test\nversion: "1.0.0"\n'
            "flag: true\n---\n\nBody."
        )
        prompt = load_prompt(fp, meta="allow")
        assert prompt.meta is not None
        assert prompt.meta.extras is not None
        assert prompt.meta.extras["flag"] is True
        assert isinstance(prompt.meta.extras["flag"], bool)
