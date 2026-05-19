from datetime import date
from pathlib import Path

import pytest

from textprompts import PromptString
from textprompts.errors import TextPromptsError
from textprompts.loaders import load_prompt
from textprompts.models import FlagDecl, Prompt, PromptMeta, VariableDecl
from textprompts.savers import save_prompt


def test_save_prompt_string(tmp_path: Path) -> None:
    """Test saving a string prompt creates proper template"""
    file_path = tmp_path / "test.txt"
    content = "You are a helpful assistant."

    save_prompt(file_path, content)

    # Read back and verify structure
    saved_content = file_path.read_text()
    assert saved_content.startswith("---")
    assert 'title = ""' in saved_content
    assert 'description = ""' in saved_content
    assert 'version = ""' in saved_content
    assert content in saved_content

    # Verify it can be loaded back
    from textprompts.config import set_metadata

    set_metadata("ignore")
    import importlib

    import textprompts.loaders as loaders

    importlib.reload(loaders)
    prompt = loaders.load_prompt(file_path)
    assert prompt.meta is not None
    # title may come from filename depending on global config
    assert prompt.meta.title in {"test", ""}
    assert content in str(prompt.prompt)


def test_save_prompt_object(tmp_path: Path) -> None:
    """Test saving a Prompt object preserves metadata"""
    file_path = tmp_path / "test_prompt.txt"

    meta = PromptMeta(
        title="Test Prompt",
        description="A test prompt",
        version="1.0.0",
        author="Test Author",
        created=date(2023, 1, 1),
    )

    prompt = Prompt(
        path=file_path, meta=meta, prompt=PromptString("You are a helpful assistant.")
    )

    save_prompt(file_path, prompt)

    # Read back and verify
    loaded_prompt = load_prompt(file_path, meta="allow")
    assert loaded_prompt.meta is not None
    assert loaded_prompt.meta.title == "Test Prompt"
    assert loaded_prompt.meta.description == "A test prompt"
    assert loaded_prompt.meta.version == "1.0.0"
    assert loaded_prompt.meta.author == "Test Author"
    assert loaded_prompt.meta.created == date(2023, 1, 1)
    assert "You are a helpful assistant." in str(loaded_prompt.prompt)


def test_save_prompt_object_minimal_meta(tmp_path: Path) -> None:
    """Test saving a Prompt object with minimal metadata"""
    file_path = tmp_path / "minimal.txt"

    meta = PromptMeta(title="Minimal")
    prompt = Prompt(path=file_path, meta=meta, prompt=PromptString("Simple prompt."))

    save_prompt(file_path, prompt)

    # Read back and verify
    loaded_prompt = load_prompt(file_path, meta="allow")
    assert loaded_prompt.meta is not None
    assert loaded_prompt.meta.title == "Minimal"
    assert loaded_prompt.meta.description == ""
    assert loaded_prompt.meta.version == ""


def test_save_prompt_invalid_type(tmp_path: Path) -> None:
    """Test that invalid content type raises TypeError"""
    file_path = tmp_path / "invalid.txt"

    with pytest.raises(TypeError, match="content must be str or Prompt"):
        save_prompt(file_path, 123)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# v2 save round-trip: flags, variables, and per-decl extras.
# ---------------------------------------------------------------------------


def _full_v2_prompt(file_path: Path) -> Prompt:
    """Build a Prompt with boolean+enum flags, vars, and nested extras."""
    from textprompts.models import FlagDecl, VariableDecl

    meta = PromptMeta(
        title="Customer support agent",
        version="2.1",
        description="Customer support prompt",
        extras={"owner": "@support-eng", "last_reviewed": "2026-04-30"},
        flags={
            "tier": FlagDecl(
                kind="enum",
                values=("free", "premium", "enterprise"),
                description="User subscription tier",
                extras={"owner": "@product", "expires": "2026-12-01"},
            ),
            "has_history": FlagDecl(
                kind="boolean",
                description="Whether prior conversation context is available",
            ),
        },
        variables={
            "user_name": VariableDecl(description="The user's display name"),
            "last_question": VariableDecl(
                description="Previous question, if has_history is true"
            ),
        },
    )
    body = (
        "Hello {user_name}.\n"
        "{switch tier}\n"
        "{case free}\n"
        "Free.\n"
        "{case premium}\n"
        "Premium.\n"
        "{case enterprise}\n"
        "Enterprise.\n"
        "{end}\n"
        "{if has_history}\n"
        "Last: {last_question}\n"
        "{end}\n"
    )
    return Prompt(path=file_path, meta=meta, prompt=PromptString(body))


@pytest.mark.parametrize("fmt", ["toml", "yaml"])
def test_save_prompt_v2_round_trip(tmp_path: Path, fmt: str) -> None:
    file_path = tmp_path / f"prompt.{fmt}.txt"
    prompt = _full_v2_prompt(file_path)
    save_prompt(file_path, prompt, format=fmt)  # type: ignore[arg-type]
    loaded = load_prompt(file_path, metadata="allow")

    assert loaded.meta is not None
    assert loaded.meta.title == "Customer support agent"
    assert loaded.meta.version == "2.1"
    assert loaded.meta.description == "Customer support prompt"
    assert loaded.meta.extras["owner"] == "@support-eng"
    assert loaded.meta.extras["last_reviewed"] == "2026-04-30"

    # flags
    tier = loaded.meta.flags["tier"]
    assert tier.kind == "enum"
    assert tier.values == ("free", "premium", "enterprise")
    assert tier.description == "User subscription tier"
    assert tier.extras["owner"] == "@product"
    assert tier.extras["expires"] == "2026-12-01"

    has_history = loaded.meta.flags["has_history"]
    assert has_history.kind == "boolean"
    assert has_history.description == "Whether prior conversation context is available"

    # variables
    assert loaded.meta.variables["user_name"].description == "The user's display name"
    assert (
        loaded.meta.variables["last_question"].description
        == "Previous question, if has_history is true"
    )


@pytest.mark.parametrize("fmt", ["toml", "yaml"])
def test_save_prompt_v2_idempotent(tmp_path: Path, fmt: str) -> None:
    """Save -> load -> save produces the same bytes."""
    file_path = tmp_path / f"prompt.{fmt}.txt"
    prompt = _full_v2_prompt(file_path)
    save_prompt(file_path, prompt, format=fmt)  # type: ignore[arg-type]
    first = file_path.read_text(encoding="utf-8")

    loaded = load_prompt(file_path, metadata="allow")
    save_prompt(file_path, loaded, format=fmt)  # type: ignore[arg-type]
    second = file_path.read_text(encoding="utf-8")

    assert first == second


# ---------------------------------------------------------------------------
# SPEC §6.6: saving must not silently drop unrepresentable metadata.
# ---------------------------------------------------------------------------


def _make_prompt_with_extras(file_path: Path, extras: dict) -> Prompt:
    meta = PromptMeta(
        title="t",
        description="d",
        version="1",
        extras=extras,
    )
    return Prompt(path=file_path, meta=meta, prompt=PromptString("body"))


def _make_prompt_with_flag_extras(file_path: Path, extras: dict) -> Prompt:
    meta = PromptMeta(
        title="t",
        description="d",
        version="1",
        flags={
            "f": FlagDecl(kind="boolean", description="d", extras=extras),
        },
    )
    return Prompt(path=file_path, meta=meta, prompt=PromptString("body"))


def _make_prompt_with_var_extras(file_path: Path, extras: dict) -> Prompt:
    meta = PromptMeta(
        title="t",
        description="d",
        version="1",
        variables={
            "v": VariableDecl(description="d", extras=extras),
        },
    )
    return Prompt(path=file_path, meta=meta, prompt=PromptString("body"))


def test_save_toml_top_level_extras_none_raises(tmp_path: Path) -> None:
    file_path = tmp_path / "p.txt"
    prompt = _make_prompt_with_extras(file_path, {"bad": None})
    with pytest.raises(
        TextPromptsError,
        match=r"Cannot serialize top-level extras key 'bad' to TOML",
    ):
        save_prompt(file_path, prompt, format="toml")


def test_save_toml_top_level_extras_object_raises(tmp_path: Path) -> None:
    file_path = tmp_path / "p.txt"
    prompt = _make_prompt_with_extras(file_path, {"bad": object()})
    with pytest.raises(
        TextPromptsError,
        match=r"Cannot serialize top-level extras key 'bad' to TOML",
    ):
        save_prompt(file_path, prompt, format="toml")


def test_save_toml_top_level_extras_nested_dict_raises(tmp_path: Path) -> None:
    """Nested dict beyond inline-table depth cannot be serialized to TOML."""
    file_path = tmp_path / "p.txt"
    prompt = _make_prompt_with_extras(file_path, {"bad": {"a": {"b": {"c": 1}}}})
    with pytest.raises(
        TextPromptsError,
        match=r"Cannot serialize top-level extras key 'bad' to TOML",
    ):
        save_prompt(file_path, prompt, format="toml")


def test_save_toml_flag_extras_unrepresentable_raises(tmp_path: Path) -> None:
    file_path = tmp_path / "p.txt"
    prompt = _make_prompt_with_flag_extras(file_path, {"bad": object()})
    with pytest.raises(
        TextPromptsError,
        match=r"Cannot serialize extras key 'bad' of flag 'f' to TOML",
    ):
        save_prompt(file_path, prompt, format="toml")


def test_save_toml_variable_extras_unrepresentable_raises(tmp_path: Path) -> None:
    file_path = tmp_path / "p.txt"
    prompt = _make_prompt_with_var_extras(file_path, {"bad": object()})
    with pytest.raises(
        TextPromptsError,
        match=r"Cannot serialize extras key 'bad' of variable 'v' to TOML",
    ):
        save_prompt(file_path, prompt, format="toml")


def test_save_yaml_top_level_extras_none_succeeds(tmp_path: Path) -> None:
    """YAML path is permissive; None serializes fine."""
    file_path = tmp_path / "p.txt"
    prompt = _make_prompt_with_extras(file_path, {"maybe": None})
    save_prompt(file_path, prompt, format="yaml")
    assert file_path.exists()


def test_save_yaml_top_level_extras_nested_dict_succeeds(tmp_path: Path) -> None:
    file_path = tmp_path / "p.txt"
    prompt = _make_prompt_with_extras(file_path, {"nested": {"a": {"b": {"c": 1}}}})
    save_prompt(file_path, prompt, format="yaml")
    assert file_path.exists()


def test_save_yaml_flag_extras_nested_succeeds(tmp_path: Path) -> None:
    file_path = tmp_path / "p.txt"
    prompt = _make_prompt_with_flag_extras(file_path, {"nested": {"a": {"b": 1}}})
    save_prompt(file_path, prompt, format="yaml")
    assert file_path.exists()


def test_save_yaml_variable_extras_nested_succeeds(tmp_path: Path) -> None:
    file_path = tmp_path / "p.txt"
    prompt = _make_prompt_with_var_extras(file_path, {"nested": {"a": {"b": 1}}})
    save_prompt(file_path, prompt, format="yaml")
    assert file_path.exists()
