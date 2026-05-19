"""Cross-port conformance harness.

Iterates every fixture directory under ``docs/specs/fixtures/`` and asserts
either byte-for-byte equality with ``expected.txt`` (success fixtures) or the
structured error info in ``expected-error.json`` (error fixtures).

See ``docs/specs/fixtures/README.md`` for the fixture schema.
"""

from __future__ import annotations

import json
import pathlib
from typing import Any

import pytest

from textprompts import (
    FormatError,
    FrontmatterError,
    ParseError,
    Prompt,
    SemanticError,
)

FIXTURES_DIR = (
    pathlib.Path(__file__).resolve().parent.parent / "docs" / "specs" / "fixtures"
)

CATEGORY_TO_CLASS: dict[str, type[Exception]] = {
    "parse": ParseError,
    "frontmatter": FrontmatterError,
    "semantic": SemanticError,
    "format": FormatError,
}


def _list_fixture_dirs() -> list[pathlib.Path]:
    if not FIXTURES_DIR.is_dir():
        return []
    return sorted(p for p in FIXTURES_DIR.iterdir() if p.is_dir())


FIXTURE_DIRS = _list_fixture_dirs()


def _read_json_if_present(path: pathlib.Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    raw = path.read_text(encoding="utf-8")
    if raw.strip() == "":
        return {}
    return json.loads(raw)


def test_corpus_directory_is_non_empty() -> None:
    """Catches the bug where the fixtures dir disappears and every fixture
    silently passes because there is nothing to iterate over."""
    assert len(FIXTURE_DIRS) > 0, f"No fixtures discovered under {FIXTURES_DIR}"


@pytest.mark.parametrize(
    "fixture_dir",
    FIXTURE_DIRS,
    ids=lambda p: p.name,
)
def test_fixture(fixture_dir: pathlib.Path) -> None:
    prompt_text = (fixture_dir / "prompt.txt").read_text(encoding="utf-8")
    input_data = _read_json_if_present(fixture_dir / "input.json")
    options_data = _read_json_if_present(fixture_dir / "options.json")

    options: dict[str, Any] = {}
    if "metadata" in options_data:
        options["metadata"] = options_data["metadata"]
    if "frontmatterFormat" in options_data:
        options["frontmatter_format"] = options_data["frontmatterFormat"]

    variables: dict[str, Any] = dict(input_data.get("variables") or {})
    # ``flags`` is *deliberately* allowed to be missing — the validator
    # distinguishes "key absent" (None) from "{}" (present but empty).
    flags: Any = input_data["flags"] if "flags" in input_data else None

    expected_path = fixture_dir / "expected.txt"
    error_path = fixture_dir / "expected-error.json"

    if expected_path.exists():
        prompt = Prompt.from_string(prompt_text, **options)
        actual = prompt.format(flags=flags, **variables)
        expected = expected_path.read_text(encoding="utf-8")
        assert actual == expected, (
            f"{fixture_dir.name}: byte mismatch\n"
            f"--- expected ---\n{expected!r}\n--- actual ---\n{actual!r}"
        )
        return

    assert error_path.exists(), (
        f"{fixture_dir.name}: missing both expected.txt and expected-error.json"
    )
    spec = json.loads(error_path.read_text(encoding="utf-8"))
    expected_class = CATEGORY_TO_CLASS[spec["category"]]

    with pytest.raises(expected_class) as excinfo:
        prompt = Prompt.from_string(prompt_text, **options)
        prompt.format(flags=flags, **variables)

    err = excinfo.value
    actual_code = getattr(err, "code", None)
    assert actual_code == spec["code"], (
        f"{fixture_dir.name}: expected code {spec['code']!r}, "
        f"got {actual_code!r} on {type(err).__name__}: {err}"
    )
    if "messageContains" in spec:
        assert spec["messageContains"] in str(err), (
            f"{fixture_dir.name}: expected message to contain "
            f"{spec['messageContains']!r}, got {str(err)!r}"
        )
