from __future__ import annotations

from textprompts.source import prepare_source


def test_strips_bom() -> None:
    assert prepare_source("﻿hello") == "hello"


def test_no_bom_preserved() -> None:
    assert prepare_source("hello") == "hello"


def test_normalizes_crlf() -> None:
    assert prepare_source("a\r\nb\r\nc") == "a\nb\nc"


def test_normalizes_bare_cr() -> None:
    assert prepare_source("a\rb\rc") == "a\nb\nc"


def test_mixed_line_endings() -> None:
    assert prepare_source("a\r\nb\rc\nd") == "a\nb\nc\nd"


def test_crlf_and_lf_produce_identical_output() -> None:
    crlf = "title: foo\r\n---\r\nbody\r\n"
    lf = "title: foo\n---\nbody\n"
    assert prepare_source(crlf) == prepare_source(lf)


def test_dedent_off_by_default() -> None:
    src = "    a\n    b\n"
    assert prepare_source(src) == src


def test_dedent_on_strips_minimum_leading() -> None:
    src = "    a\n      b\n    c\n"
    expected = "a\n  b\nc\n"
    assert prepare_source(src, dedent=True) == expected


def test_dedent_ignores_blank_lines() -> None:
    src = "  a\n\n  b\n"
    expected = "a\n\nb\n"
    assert prepare_source(src, dedent=True) == expected


def test_dedent_no_op_when_zero_min() -> None:
    src = "a\n  b\n"
    assert prepare_source(src, dedent=True) == src


def test_empty_content() -> None:
    assert prepare_source("") == ""
    assert prepare_source("", dedent=True) == ""


def test_bom_then_crlf() -> None:
    assert prepare_source("﻿a\r\nb") == "a\nb"
