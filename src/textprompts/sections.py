from __future__ import annotations

import re
from dataclasses import dataclass, field

SECTION_KIND_MARKDOWN = "markdown"
SECTION_KIND_PREAMBLE = "preamble"
SECTION_KIND_XML = "xml"


@dataclass(slots=True)
class Link:
    target: str
    fragment: str
    label: str
    line: int


@dataclass(slots=True)
class Section:
    kind: str
    tag_name: str
    heading: str
    anchor_id: str
    level: int
    start_line: int
    end_line: int
    char_count: int
    parent_idx: int
    children: list[int] = field(default_factory=list)
    links: list[Link] = field(default_factory=list)


@dataclass(slots=True)
class FrontmatterBlock:
    raw: str
    format: str
    start_line: int
    end_line: int
    title: str


@dataclass(slots=True)
class ParseResult:
    sections: list[Section] = field(default_factory=list)
    anchors: dict[str, int] = field(default_factory=dict)
    duplicate_anchors: dict[str, list[int]] = field(default_factory=dict)
    frontmatter: FrontmatterBlock | None = None
    total_chars: int = 0


@dataclass(slots=True)
class _PendingAnchor:
    id: str
    start_line: int
    end_line: int


@dataclass(slots=True)
class _SectionState:
    idx: int
    kind: str
    tag_name: str
    markdown_level: int
    start_line: int
    content_start_line: int
    content_start_col: int
    source_start_line: int


@dataclass(slots=True)
class _XMLStartToken:
    tag_name: str
    attrs: dict[str, str]
    start_line: int
    open_end_col: int


@dataclass(slots=True)
class _XMLBlock:
    tag_name: str
    attrs: dict[str, str]
    start_line: int
    end_line: int
    open_end_col: int
    close_start_col: int


@dataclass(slots=True)
class _FenceState:
    active: bool = False
    marker: str = ""
    count: int = 0


_RE_HEADING = re.compile(r"^\s{0,3}(#{1,6})[ \t]+(.+?)\s*$")
_RE_ATTR_ID = re.compile(r"\s+\{#([a-zA-Z0-9._-]+)\}\s*$")
_RE_XML_COMMENT = re.compile(r"^\s*<!--\s*@id:([a-zA-Z0-9._-]+)\s*-->\s*$")
_RE_OPEN_TAG = re.compile(r"^\s*<([A-Za-z][A-Za-z0-9:._-]*)([^>]*)>")
_RE_TAG_ATTR = re.compile(
    r"([A-Za-z_:][A-Za-z0-9:._-]*)\s*=\s*(\"([^\"]*)\"|'([^']*)')"
)
_RE_MARKDOWN_LINK = re.compile(r"\[([^\]]*)\]\(([^)]+)\)")
_RE_MD_FORMATTING = re.compile(r"[*_~`]")
_RE_LINK_INLINE = re.compile(r"\[([^\]]*)\]\([^)]+\)")
_RE_HTML_TAG = re.compile(r"</?[^>]+>")
_RE_IDENTIFIER_PARTS = re.compile(r"[-_:]|\s+")

__all__ = [
    "FrontmatterBlock",
    "Link",
    "ParseResult",
    "Section",
    "generate_slug",
    "inject_anchors",
    "parse_sections",
    "render_toc",
]


def parse_sections(text: str | bytes | bytearray) -> ParseResult:
    source = _coerce_text(text)
    lines = source.split("\n")
    result = ParseResult()

    fm_end = _detect_frontmatter(lines, result)
    body_start_line = fm_end + 1
    if body_start_line < 1:
        body_start_line = 1

    result.total_chars = _compute_window_char_count(
        lines,
        body_start_line,
        0,
        len(lines),
        _line_end_col(lines, len(lines)),
    )

    xml_blocks, unclosed_xml = _collect_xml_blocks(lines, body_start_line)
    xml_starts: dict[int, list[_XMLBlock]] = {}
    xml_ends: dict[int, list[_XMLBlock]] = {}
    for block in xml_blocks:
        xml_starts.setdefault(block.start_line, []).append(block)
        xml_ends.setdefault(block.end_line, []).append(block)

    for blocks in xml_starts.values():
        blocks.sort(
            key=lambda block: (block.start_line, -block.end_line, block.open_end_col)
        )
    for blocks in xml_ends.values():
        blocks.sort(
            key=lambda block: (block.end_line, -block.start_line, block.close_start_col)
        )

    anchor_only_lines: set[int] = set()
    used_anchor_ids: set[str] = set()
    stack: list[_SectionState] = []
    pending: _PendingAnchor | None = None
    gap_start = body_start_line
    fence = _FenceState()

    for line_idx in range(body_start_line - 1, len(lines)):
        line = _trim_right_cr(lines[line_idx])
        line_num = line_idx + 1

        if _update_fence_state(line, fence):
            pending = None
            continue
        if fence.active:
            pending = None
            continue

        anchor_id, ok = _parse_standalone_anchor_tag(line)
        if ok:
            anchor_only_lines.add(line_num)
            pending = _merge_pending_anchor(pending, anchor_id, line_num)
            continue

        comment_anchor = _extract_xml_comment_anchor(line)
        if comment_anchor:
            anchor_only_lines.add(line_num)
            pending = _merge_pending_anchor(pending, comment_anchor, line_num)
            continue

        token = unclosed_xml.get(line_num)
        if token is not None:
            token_anchor = _explicit_anchor_from_attrs(token.attrs)
            if token_anchor:
                anchor_only_lines.add(line_num)
                pending = _merge_pending_anchor(pending, token_anchor, line_num)
                continue

        if line.strip() == "":
            pending = None

        start_blocks = xml_starts.get(line_num, [])
        if start_blocks:
            was_top_level = not stack
            event_start_line = pending.start_line if pending is not None else line_num
            if was_top_level:
                gap_start = _maybe_append_preamble(
                    result,
                    lines,
                    gap_start,
                    event_start_line - 1,
                    anchor_only_lines,
                )

            for block_idx, block in enumerate(start_blocks):
                start_line = block.start_line
                if pending is not None and block_idx == 0:
                    start_line = pending.start_line

                heading = _derive_xml_heading(block.tag_name, block.attrs)
                parent_idx = _parent_index(stack)
                level = _derive_xml_level(result, parent_idx)
                explicit_id = _explicit_anchor_from_attrs(block.attrs)
                if explicit_id == "":
                    explicit_id = _normalize_anchor_id(block.tag_name)
                anchor_id, explicit = _resolve_section_anchor(
                    heading,
                    pending,
                    explicit_id,
                    used_anchor_ids,
                )
                section_idx = _append_section(
                    result,
                    Section(
                        kind=SECTION_KIND_XML,
                        tag_name=block.tag_name,
                        heading=heading,
                        anchor_id=anchor_id,
                        level=level,
                        start_line=start_line,
                        end_line=block.end_line,
                        char_count=0,
                        parent_idx=parent_idx,
                    ),
                )
                _register_anchor(
                    result, used_anchor_ids, anchor_id, section_idx, explicit
                )
                stack.append(
                    _SectionState(
                        idx=section_idx,
                        kind=SECTION_KIND_XML,
                        tag_name=block.tag_name,
                        markdown_level=level,
                        start_line=start_line,
                        content_start_line=block.start_line,
                        content_start_col=block.open_end_col,
                        source_start_line=block.start_line,
                    )
                )

            pending = None
            if was_top_level:
                gap_start = len(lines) + 1

        level, heading, attr_id, ok = _parse_markdown_heading(line)
        if ok:
            was_top_level = not stack
            event_start_line = pending.start_line if pending is not None else line_num
            if was_top_level:
                gap_start = _maybe_append_preamble(
                    result,
                    lines,
                    gap_start,
                    event_start_line - 1,
                    anchor_only_lines,
                )

            stack = _close_markdown_sections(
                result,
                lines,
                stack,
                level,
                line_num - 1,
                _line_end_col(lines, line_num - 1),
            )

            start_line = pending.start_line if pending is not None else line_num
            parent_idx = _parent_index(stack)
            anchor_id, explicit = _resolve_section_anchor(
                heading, pending, attr_id, used_anchor_ids
            )
            section_idx = _append_section(
                result,
                Section(
                    kind=SECTION_KIND_MARKDOWN,
                    tag_name="",
                    heading=heading,
                    anchor_id=anchor_id,
                    level=level,
                    start_line=start_line,
                    end_line=line_num,
                    char_count=0,
                    parent_idx=parent_idx,
                ),
            )
            _register_anchor(result, used_anchor_ids, anchor_id, section_idx, explicit)
            stack.append(
                _SectionState(
                    idx=section_idx,
                    kind=SECTION_KIND_MARKDOWN,
                    tag_name="",
                    markdown_level=level,
                    start_line=start_line,
                    content_start_line=line_num + 1,
                    content_start_col=0,
                    source_start_line=line_num,
                )
            )

            pending = None
            if was_top_level:
                gap_start = len(lines) + 1

        end_blocks = xml_ends.get(line_num, [])
        if end_blocks:
            for block in end_blocks:
                stack = _close_xml_block(result, lines, stack, block)
            if not stack:
                gap_start = line_num + 1

    while stack:
        top = stack.pop()
        _finalize_section(
            result, lines, top, len(lines), _line_end_col(lines, len(lines))
        )

    if not result.sections:
        _maybe_append_preamble(
            result, lines, body_start_line, len(lines), anchor_only_lines
        )
    elif gap_start <= len(lines):
        _maybe_append_preamble(result, lines, gap_start, len(lines), anchor_only_lines)

    return result


def generate_slug(heading: str) -> str:
    slug = _RE_LINK_INLINE.sub(r"\1", heading)
    slug = _RE_HTML_TAG.sub("", slug)
    slug = _RE_MD_FORMATTING.sub("", slug)
    return _normalize_anchor_id(slug)


def inject_anchors(text: str | bytes | bytearray) -> tuple[str, ParseResult]:
    source = _coerce_text(text)
    result = parse_sections(source)
    lines = source.split("\n")

    for section in reversed(result.sections):
        if section.kind != SECTION_KIND_MARKDOWN:
            continue

        heading_idx = _find_markdown_heading_line(
            lines, section.start_line, section.end_line
        )
        if heading_idx < 0:
            continue

        if heading_idx > 0:
            prev_line = lines[heading_idx - 1].strip()
            if _parse_standalone_anchor_tag(prev_line)[
                1
            ] or _extract_xml_comment_anchor(prev_line):
                continue

        _, _, attr_id, ok = _parse_markdown_heading(lines[heading_idx])
        if not ok or attr_id:
            continue

        lines.insert(heading_idx, f'<a id="{section.anchor_id}"></a>')

    output = "\n".join(lines)
    return output, parse_sections(output)


def render_toc(result: ParseResult, path: str) -> str:
    if not result.sections:
        return ""

    lines = [
        f"{path} ({result.total_chars} chars, {_count_renderable_sections(result)} sections)"
    ]
    for idx, section in enumerate(result.sections):
        if section.kind == SECTION_KIND_PREAMBLE:
            continue
        indent = "  " * _section_depth(result.sections, idx)
        prefix = _render_section_prefix(section)
        lines.append(
            f"{indent}{prefix} {section.heading} [#{section.anchor_id}] "
            f"(L{section.start_line}-L{section.end_line}, {section.char_count} chars)"
        )
    return "\n".join(lines) + "\n"


def _coerce_text(text: str | bytes | bytearray) -> str:
    if isinstance(text, str):
        return text
    return bytes(text).decode("utf-8")


def _detect_frontmatter(lines: list[str], result: ParseResult) -> int:
    if not lines:
        return 0

    first = lines[0].strip()
    delimiter = ""
    format_name = ""
    if first == "---":
        delimiter = "---"
        format_name = "yaml"
    elif first == "+++":
        delimiter = "+++"
        format_name = "toml"
    else:
        return 0

    for idx, line in enumerate(lines[1:], start=1):
        if line.strip() == delimiter:
            raw = "\n".join(lines[1:idx])
            result.frontmatter = FrontmatterBlock(
                raw=raw,
                format=format_name,
                start_line=1,
                end_line=idx + 1,
                title=_extract_frontmatter_title(raw, format_name),
            )
            return idx + 1
    return 0


def _extract_frontmatter_title(raw: str, format_name: str) -> str:
    for line in raw.split("\n"):
        stripped = line.strip()
        for key in ("title", "name"):
            if format_name == "yaml":
                prefix = f"{key}:"
                if stripped.startswith(prefix):
                    return stripped.removeprefix(prefix).strip().strip("\"'")
            if format_name == "toml":
                for prefix in (f"{key} =", f"{key}="):
                    if stripped.startswith(prefix):
                        return stripped.removeprefix(prefix).strip().strip("\"'")
    return ""


def _collect_xml_blocks(
    lines: list[str], body_start_line: int
) -> tuple[list[_XMLBlock], dict[int, _XMLStartToken]]:
    blocks: list[_XMLBlock] = []
    unclosed: dict[int, _XMLStartToken] = {}
    stack: list[_XMLStartToken] = []
    fence = _FenceState()

    for line_idx in range(body_start_line - 1, len(lines)):
        line = _trim_right_cr(lines[line_idx])
        line_num = line_idx + 1

        if _update_fence_state(line, fence):
            continue
        if fence.active:
            continue
        if _parse_standalone_anchor_tag(line)[1] or _extract_xml_comment_anchor(line):
            continue

        token, ok = _parse_xml_start_token(line, line_num)
        if ok and not _token_is_anchor(token) and not _token_is_self_closing(token):
            close_start, found = _find_closing_tag_start(
                line, token.tag_name, token.open_end_col
            )
            if found:
                blocks.append(
                    _XMLBlock(
                        tag_name=token.tag_name,
                        attrs=token.attrs,
                        start_line=token.start_line,
                        end_line=line_num,
                        open_end_col=token.open_end_col,
                        close_start_col=close_start,
                    )
                )
            else:
                stack.append(token)
                unclosed[token.start_line] = token

        search_from = 0
        while stack:
            top = stack[-1]
            close_start, found = _find_closing_tag_start(
                line, top.tag_name, search_from
            )
            if not found:
                break
            blocks.append(
                _XMLBlock(
                    tag_name=top.tag_name,
                    attrs=top.attrs,
                    start_line=top.start_line,
                    end_line=line_num,
                    open_end_col=top.open_end_col,
                    close_start_col=close_start,
                )
            )
            unclosed.pop(top.start_line, None)
            stack.pop()
            search_from = close_start + 1

    blocks.sort(
        key=lambda block: (block.start_line, -block.end_line, block.open_end_col)
    )
    return blocks, unclosed


def _parse_markdown_heading(line: str) -> tuple[int, str, str, bool]:
    match = _RE_HEADING.match(_trim_right_cr(line))
    if match is None:
        return 0, "", "", False

    level = len(match.group(1))
    heading = _strip_closing_heading_hashes(match.group(2).strip())
    attr_id = ""
    attr_match = _RE_ATTR_ID.search(heading)
    if attr_match is not None:
        attr_id = _normalize_anchor_id(attr_match.group(1))
        heading = _RE_ATTR_ID.sub("", heading).strip()

    if heading == "":
        heading = "section"
    return level, heading, attr_id, True


def _strip_closing_heading_hashes(heading: str) -> str:
    trimmed = heading.strip()
    idx = trimmed.rfind(" #")
    if idx >= 0:
        suffix = trimmed[idx:].strip()
        if suffix and suffix.strip("#") == "":
            return trimmed[:idx].strip()
    return trimmed


def _parse_xml_start_token(line: str, line_num: int) -> tuple[_XMLStartToken, bool]:
    trimmed = line.strip()
    if (
        trimmed == ""
        or trimmed.startswith("</")
        or trimmed.startswith("<!")
        or trimmed.startswith("<?")
    ):
        return _XMLStartToken("", {}, 0, 0), False

    match = _RE_OPEN_TAG.search(line)
    if match is None:
        return _XMLStartToken("", {}, 0, 0), False

    attr_text = match.group(2)
    self_closing = attr_text.strip().endswith("/")
    if self_closing:
        attr_text = attr_text.strip().removesuffix("/").strip()

    token = _XMLStartToken(
        tag_name=match.group(1),
        attrs=_parse_tag_attributes(attr_text),
        start_line=line_num,
        open_end_col=match.end(),
    )
    if self_closing:
        token.attrs["__self_closing__"] = "true"
    return token, True


def _token_is_anchor(token: _XMLStartToken) -> bool:
    return token.tag_name.lower() == "a"


def _token_is_self_closing(token: _XMLStartToken) -> bool:
    return token.attrs.get("__self_closing__") == "true"


def _parse_standalone_anchor_tag(line: str) -> tuple[str, bool]:
    token, ok = _parse_xml_start_token(line, 1)
    if not ok or token.tag_name.lower() != "a":
        return "", False

    anchor_id = _explicit_anchor_from_attrs(token.attrs)
    if anchor_id == "":
        return "", False

    remainder = line[token.open_end_col :].strip()
    if token.attrs.get("__self_closing__") == "true":
        return anchor_id, remainder == ""

    close_start, close_end, found = _find_closing_tag_range(
        line, token.tag_name, token.open_end_col
    )
    if not found:
        return "", False
    if line[token.open_end_col : close_start].strip() != "":
        return "", False
    if line[close_end:].strip() != "":
        return "", False
    return anchor_id, True


def _parse_tag_attributes(attr_text: str) -> dict[str, str]:
    attrs: dict[str, str] = {}
    for match in _RE_TAG_ATTR.finditer(attr_text):
        value = match.group(3) or match.group(4) or ""
        attrs[match.group(1).lower()] = value
    return attrs


def _explicit_anchor_from_attrs(attrs: dict[str, str]) -> str:
    for key in ("id", "name"):
        value = attrs.get(key, "").strip()
        if value:
            return _normalize_anchor_id(value)
    return ""


def _extract_xml_comment_anchor(line: str) -> str:
    match = _RE_XML_COMMENT.match(_trim_right_cr(line))
    return "" if match is None else _normalize_anchor_id(match.group(1))


def _merge_pending_anchor(
    existing: _PendingAnchor | None, anchor_id: str, line_num: int
) -> _PendingAnchor:
    if existing is None:
        return _PendingAnchor(id=anchor_id, start_line=line_num, end_line=line_num)
    return _PendingAnchor(
        id=anchor_id, start_line=existing.start_line, end_line=line_num
    )


def _resolve_section_anchor(
    heading: str,
    pending: _PendingAnchor | None,
    explicit_id: str,
    used_anchor_ids: set[str],
) -> tuple[str, bool]:
    if pending is not None and pending.id:
        return pending.id, True
    if explicit_id:
        return explicit_id, True
    return _unique_generated_anchor(generate_slug(heading), used_anchor_ids), False


def _unique_generated_anchor(base: str, used: set[str]) -> str:
    candidate = base or "section"
    if candidate not in used:
        return candidate
    suffix = 2
    while True:
        candidate = f"{base or 'section'}_{suffix}"
        if candidate not in used:
            return candidate
        suffix += 1


def _normalize_anchor_id(value: str) -> str:
    out: list[str] = []
    last_was_underscore = False
    for char in value.lower():
        if char.isascii() and char.isalnum():
            out.append(char)
            last_was_underscore = False
        elif out and not last_was_underscore:
            out.append("_")
            last_was_underscore = True

    while out and out[-1] == "_":
        out.pop()

    normalized = "".join(out)
    return normalized or "section"


def _register_anchor(
    result: ParseResult,
    used: set[str],
    anchor_id: str,
    section_idx: int,
    explicit: bool,
) -> None:
    if anchor_id == "":
        return
    if not explicit:
        result.anchors[anchor_id] = section_idx
        used.add(anchor_id)
        return

    if anchor_id not in used:
        result.anchors[anchor_id] = section_idx
        used.add(anchor_id)
        return

    if anchor_id not in result.duplicate_anchors:
        result.duplicate_anchors[anchor_id] = [result.anchors[anchor_id]]
    result.duplicate_anchors[anchor_id].append(section_idx)


def _append_section(result: ParseResult, section: Section) -> int:
    idx = len(result.sections)
    if section.parent_idx >= 0:
        result.sections[section.parent_idx].children.append(idx)
    result.sections.append(section)
    return idx


def _maybe_append_preamble(
    result: ParseResult,
    lines: list[str],
    start_line: int,
    end_line: int,
    skip_lines: set[int],
) -> int:
    if start_line <= 0:
        start_line = 1
    if end_line < start_line:
        return start_line
    if not _window_has_content(lines, start_line, end_line, skip_lines):
        return end_line + 1

    chars, links = _compute_window_stats_skipping_lines(
        lines,
        start_line,
        0,
        end_line,
        _line_end_col(lines, end_line),
        skip_lines,
    )
    _append_section(
        result,
        Section(
            kind=SECTION_KIND_PREAMBLE,
            tag_name="",
            heading="",
            anchor_id="",
            level=0,
            start_line=start_line,
            end_line=end_line,
            char_count=chars,
            parent_idx=-1,
            links=links,
        ),
    )
    return end_line + 1


def _close_markdown_sections(
    result: ParseResult,
    lines: list[str],
    stack: list[_SectionState],
    new_level: int,
    end_line: int,
    end_col: int,
) -> list[_SectionState]:
    while stack:
        top = stack[-1]
        if top.kind != SECTION_KIND_MARKDOWN or top.markdown_level < new_level:
            break
        _finalize_section(result, lines, top, end_line, end_col)
        stack.pop()
    return stack


def _close_xml_block(
    result: ParseResult,
    lines: list[str],
    stack: list[_SectionState],
    block: _XMLBlock,
) -> list[_SectionState]:
    while stack:
        top = stack[-1]
        _finalize_section(result, lines, top, block.end_line, block.close_start_col)
        stack.pop()
        if (
            top.kind == SECTION_KIND_XML
            and top.source_start_line == block.start_line
            and top.tag_name == block.tag_name
        ):
            break
    return stack


def _finalize_section(
    result: ParseResult,
    lines: list[str],
    state: _SectionState,
    end_line: int,
    end_col: int,
) -> None:
    section = result.sections[state.idx]
    section.end_line = end_line
    section.char_count, section.links = _compute_window_stats(
        lines,
        state.content_start_line,
        state.content_start_col,
        end_line,
        end_col,
    )


def _parent_index(stack: list[_SectionState]) -> int:
    if not stack:
        return -1
    return stack[-1].idx


def _derive_xml_level(result: ParseResult, parent_idx: int) -> int:
    if parent_idx < 0:
        return 1
    parent = result.sections[parent_idx]
    if parent.level <= 0:
        return 1
    return parent.level + 1


def _derive_xml_heading(tag_name: str, attrs: dict[str, str]) -> str:
    for key in ("heading", "title", "label", "name"):
        value = attrs.get(key, "").strip()
        if value:
            return value
    anchor_id = attrs.get("id", "").strip()
    if anchor_id:
        return _humanize_identifier(anchor_id)
    return _humanize_identifier(tag_name)


def _humanize_identifier(value: str) -> str:
    stripped = value.strip()
    if stripped == "":
        return "Section"
    fields = [part for part in _RE_IDENTIFIER_PARTS.split(stripped) if part]
    if not fields:
        return "Section"
    words: list[str] = []
    for part in fields:
        lowered = part.lower()
        words.append(lowered[:1].upper() + lowered[1:])
    return " ".join(words)


def _update_fence_state(line: str, state: _FenceState) -> bool:
    trimmed = line.lstrip(" \t")
    if trimmed == "":
        return False

    marker = trimmed[0]
    if marker not in {"`", "~"}:
        return False

    count = 0
    for char in trimmed:
        if char != marker:
            break
        count += 1
    if count < 3:
        return False

    if not state.active:
        state.active = True
        state.marker = marker
        state.count = count
        return True

    if state.marker == marker and count >= state.count:
        state.active = False
        state.marker = ""
        state.count = 0
        return True

    return False


def _compute_window_stats(
    lines: list[str], start_line: int, start_col: int, end_line: int, end_col: int
) -> tuple[int, list[Link]]:
    return _compute_window_stats_skipping_lines(
        lines, start_line, start_col, end_line, end_col, None
    )


def _compute_window_stats_skipping_lines(
    lines: list[str],
    start_line: int,
    start_col: int,
    end_line: int,
    end_col: int,
    skip_lines: set[int] | None,
) -> tuple[int, list[Link]]:
    if not _valid_window(lines, start_line, end_line):
        return 0, []

    segments: list[str] = []
    segment_lines: list[int] = []
    for line_num in range(start_line, end_line + 1):
        if skip_lines is not None and line_num in skip_lines:
            continue
        segment = _slice_window_line(
            lines, line_num, start_line, start_col, end_line, end_col
        )
        segments.append(segment)
        segment_lines.append(line_num)

    if not segments:
        return 0, []

    chars = 0
    for idx, segment in enumerate(segments):
        chars += len(segment.encode("utf-8"))
        if idx < len(segments) - 1:
            chars += 1

    links: list[Link] = []
    for idx, segment in enumerate(segments):
        for match in _RE_MARKDOWN_LINK.finditer(segment):
            href = match.group(2)
            hash_idx = href.find("#")
            fragment = href[hash_idx + 1 :] if hash_idx >= 0 else ""
            links.append(
                Link(
                    target=href,
                    fragment=fragment,
                    label=match.group(1),
                    line=segment_lines[idx],
                )
            )

    return chars, links


def _compute_window_char_count(
    lines: list[str], start_line: int, start_col: int, end_line: int, end_col: int
) -> int:
    chars, _ = _compute_window_stats(lines, start_line, start_col, end_line, end_col)
    return chars


def _valid_window(lines: list[str], start_line: int, end_line: int) -> bool:
    if not lines or start_line <= 0 or end_line <= 0:
        return False
    if start_line > len(lines):
        return False
    return start_line <= end_line


def _slice_window_line(
    lines: list[str],
    line_num: int,
    start_line: int,
    start_col: int,
    end_line: int,
    end_col: int,
) -> str:
    if line_num <= 0 or line_num > len(lines):
        return ""
    line = _trim_right_cr(lines[line_num - 1])
    from_col = 0
    to_col = len(line)

    if line_num == start_line:
        from_col = _clamp(start_col, 0, len(line))
    if line_num == end_line and end_col >= 0:
        to_col = _clamp(end_col, 0, len(line))
    if to_col < from_col:
        to_col = from_col
    return line[from_col:to_col]


def _line_end_col(lines: list[str], line_num: int) -> int:
    if line_num <= 0 or line_num > len(lines):
        return 0
    return len(_trim_right_cr(lines[line_num - 1]))


def _clamp(value: int, min_value: int, max_value: int) -> int:
    if value < min_value:
        return min_value
    if value > max_value:
        return max_value
    return value


def _window_has_content(
    lines: list[str], start_line: int, end_line: int, skip_lines: set[int]
) -> bool:
    if not _valid_window(lines, start_line, end_line):
        return False
    for line_num in range(start_line, end_line + 1):
        if line_num in skip_lines:
            continue
        if _trim_right_cr(lines[line_num - 1]).strip() != "":
            return True
    return False


def _find_closing_tag_start(
    line: str, tag_name: str, from_col: int
) -> tuple[int, bool]:
    start, _, found = _find_closing_tag_range(line, tag_name, from_col)
    return start, found


def _find_closing_tag_range(
    line: str, tag_name: str, from_col: int
) -> tuple[int, int, bool]:
    pattern = re.compile(rf"</\s*{re.escape(tag_name)}\s*>")
    match = pattern.search(line[from_col:])
    if match is None:
        return 0, 0, False
    return from_col + match.start(), from_col + match.end(), True


def _render_section_prefix(section: Section) -> str:
    if section.kind == SECTION_KIND_XML:
        return f"<{section.tag_name or 'xml'}>"
    if section.level <= 0:
        return "-"
    return "#" * section.level


def _section_depth(sections: list[Section], idx: int) -> int:
    depth = 0
    parent = sections[idx].parent_idx
    while parent >= 0:
        depth += 1
        parent = sections[parent].parent_idx
    return depth


def _count_renderable_sections(result: ParseResult) -> int:
    return sum(
        1 for section in result.sections if section.kind != SECTION_KIND_PREAMBLE
    )


def _find_markdown_heading_line(
    lines: list[str], start_line: int, end_line: int
) -> int:
    if start_line < 1:
        start_line = 1
    if end_line > len(lines):
        end_line = len(lines)
    for idx in range(start_line - 1, end_line):
        if _parse_markdown_heading(lines[idx])[3]:
            return idx
    return -1


def _trim_right_cr(line: str) -> str:
    return line[:-1] if line.endswith("\r") else line
