import importlib
from pathlib import Path

import pytest  # type: ignore

from textprompts.models import Prompt


def test_prompt_init_loads_file(fixtures: Path) -> None:
    p = Prompt.from_path(fixtures / "no_meta.txt", meta="ignore")
    assert p.meta and p.meta.title == "no_meta"
    assert "plain text" in p.prompt


def test_prompt_init_with_metadata_mode(fixtures: Path) -> None:
    p = Prompt.from_path(fixtures / "good.txt", meta="allow")
    assert p.meta and p.meta.title == "Example"
    assert "Hello" in p.prompt


def test_env_var_overrides(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TEXTPROMPTS_METADATA_MODE", "strict")
    cfg = importlib.reload(importlib.import_module("textprompts.config"))
    assert cfg.get_metadata() == cfg.MetadataMode.STRICT

    monkeypatch.delenv("TEXTPROMPTS_METADATA_MODE")
    cfg = importlib.reload(cfg)
    assert cfg.get_metadata() == cfg.MetadataMode.IGNORE


def test_env_var_invalid_value(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TEXTPROMPTS_METADATA_MODE", "invalid_mode")
    cfg = importlib.reload(importlib.import_module("textprompts.config"))
    assert cfg.get_metadata() == cfg.MetadataMode.IGNORE
