"""Smoke test: every documented public name imports from `textprompts`."""

from __future__ import annotations


def test_public_imports() -> None:
    from textprompts import (  # noqa: F401
        FormatErrorCode,
        FrontmatterErrorCode,
        FrontmatterFormat,
        SemanticErrorCode,
        normalize_anchor_id,
        parse_file,
        parse_string,
    )


def test_normalize_anchor_id_is_callable() -> None:
    from textprompts import normalize_anchor_id

    assert normalize_anchor_id("Hello World!") == "hello_world"
    assert normalize_anchor_id("") == "section"
