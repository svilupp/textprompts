"""
Section parsing for TextPrompts.

Parses markdown headings and XML-style sections from prompt documents.
Produces a structured ParseResult matching the cross-language test corpus.
"""

# ─── Types ────────────────────────────────────────────────────────────────────

struct Link
    target::String
    fragment::String
    label::String
    line::Int
end

mutable struct Section
    kind::String          # "preamble", "markdown", "xml"
    tag_name::String
    heading::String
    anchor_id::String
    level::Int
    start_line::Int       # 1-based
    end_line::Int         # 1-based
    char_count::Int
    parent_idx::Int       # 0-based, -1 for top-level
    children::Vector{Int} # 0-based indices
    links::Vector{Link}
end

struct FrontmatterBlock
    raw::String
    format::String        # "yaml" or "toml"
    title::String
    start_line::Int
    end_line::Int
end

struct ParseResult
    sections::Vector{Section}
    anchors::Dict{String, Int}              # anchor_id -> 0-based section index
    duplicate_anchors::Dict{String, Vector{Int}}
    frontmatter::Union{FrontmatterBlock, Nothing}
    total_chars::Int
end

# ─── Constants ────────────────────────────────────────────────────────────────

const SECTION_KIND_PREAMBLE = "preamble"
const SECTION_KIND_MARKDOWN = "markdown"
const SECTION_KIND_XML = "xml"

const _RE_HEADING = r"^\s{0,3}(#{1,6})[ \t]+(.+?)\s*$"
const _RE_ATTR_ID = r"\s+\{#([a-zA-Z0-9._-]+)\}\s*$"
const _RE_XML_COMMENT = r"^\s*<!--\s*@id:([a-zA-Z0-9._-]+)\s*-->\s*$"
const _RE_OPEN_TAG = r"^\s*<([A-Za-z][A-Za-z0-9:._-]*)([^>]*)>"
const _RE_CLOSE_TAG = r"</([A-Za-z][A-Za-z0-9:._-]*)\s*>"
const _RE_TAG_ATTR = r"([A-Za-z_:][A-Za-z0-9:._-]*)\s*=\s*(\"([^\"]*)\"|'([^']*)')"
const _RE_LINK_INLINE = r"\[([^\]]*)\]\([^)]+\)"
const _RE_HTML_TAG = r"</?[^>]+>"
const _RE_MD_FORMATTING = r"[*_~`]"
const _RE_TRAILING_HASHES = r"\s+#+\s*$"

# ─── Public utilities ─────────────────────────────────────────────────────────

"""
    normalize_anchor_id(id::AbstractString) -> String

Normalize a string into a canonical anchor ID.
Lowercases, keeps [a-z0-9], replaces runs of other chars with underscore,
strips trailing underscores. Returns "section" if result is empty.
"""
function normalize_anchor_id(id::AbstractString)::String
    out = Char[]
    last_was_underscore = false
    for c in lowercase(id)
        if isletter(c) && isascii(c) && c >= 'a' && c <= 'z'
            push!(out, c)
            last_was_underscore = false
        elseif isdigit(c) && isascii(c)
            push!(out, c)
            last_was_underscore = false
        elseif !isempty(out) && !last_was_underscore
            push!(out, '_')
            last_was_underscore = true
        end
    end
    while !isempty(out) && out[end] == '_'
        pop!(out)
    end
    result = String(out)
    return isempty(result) ? "section" : result
end

"""
    generate_slug(heading::AbstractString) -> String

Generate a URL-friendly slug from a heading string.
Strips markdown links, HTML tags, and formatting characters, then normalizes.
"""
function generate_slug(heading::AbstractString)::String
    slug = replace(heading, _RE_LINK_INLINE => s"\1")
    slug = replace(slug, _RE_HTML_TAG => "")
    slug = replace(slug, _RE_MD_FORMATTING => "")
    return normalize_anchor_id(slug)
end

# ─── Internal helpers ─────────────────────────────────────────────────────────

function _coerce_text(text::AbstractString)::String
    return string(text)
end

function _coerce_text(text::Vector{UInt8})::String
    return String(copy(text))
end

"""Parse tag attributes from the attribute portion of an XML tag."""
function _parse_tag_attrs(attrs_str::AbstractString)::Dict{String, String}
    result = Dict{String, String}()
    for m in eachmatch(_RE_TAG_ATTR, attrs_str)
        key = lowercase(m[1])
        # Value is in group 3 (double-quoted) or group 4 (single-quoted)
        value = !isnothing(m[3]) ? m[3] : m[4]
        result[key] = value
    end
    return result
end

"""Parse a markdown heading line. Returns (level, heading_text, attr_id, ok)."""
function _parse_markdown_heading(line::AbstractString)
    m = match(_RE_HEADING, line)
    if isnothing(m)
        return (0, "", "", false)
    end
    level = length(m[1])
    heading = m[2]

    # Check for {#id} attribute
    attr_id = ""
    attr_m = match(_RE_ATTR_ID, heading)
    if !isnothing(attr_m)
        attr_id = attr_m[1]
        heading = heading[1:prevind(heading, attr_m.offset)]
    end

    # Strip trailing # sequences (e.g., "## Heading ##" -> "Heading")
    heading = replace(heading, _RE_TRAILING_HASHES => "")
    heading = strip(heading)

    return (level, string(heading), attr_id, true)
end

"""Check if a line is a standalone anchor tag like <a id="..."></a>.
Returns (anchor_id, found)."""
function _parse_standalone_anchor_tag(line::AbstractString)
    stripped = strip(line)

    # Must start with <a and contain </a> or />
    m = match(r"^\s*<a\b([^>]*)>(.*)</a\s*>\s*$"i, stripped)
    if isnothing(m)
        # Try self-closing
        m = match(r"^\s*<a\b([^>]*)/>\s*$"i, stripped)
        if isnothing(m)
            return ("", false)
        end
    end

    attrs = _parse_tag_attrs(m[1])
    id = get(attrs, "id", get(attrs, "name", ""))
    if isempty(id)
        return ("", false)
    end
    return (normalize_anchor_id(id), true)
end

"""Extract anchor ID from an XML comment like <!-- @id:xxx -->."""
function _extract_xml_comment_anchor(line::AbstractString)::String
    m = match(_RE_XML_COMMENT, line)
    if isnothing(m)
        return ""
    end
    return m[1]
end

"""Humanize an identifier: split on - and _, titlecase each word."""
function _humanize_id(id::AbstractString)::String
    parts = split(id, r"[-_]")
    return join([uppercasefirst(p) for p in parts if !isempty(p)], " ")
end

"""Derive heading for an XML section from tag attributes and name."""
function _derive_xml_heading(tag_name::String, attrs::Dict{String, String})::String
    # Priority: heading, title, label, name, then id (humanized), then tag_name (humanized)
    for key in ["heading", "title", "label", "name"]
        val = get(attrs, key, "")
        if !isempty(val)
            return val
        end
    end
    id = get(attrs, "id", "")
    if !isempty(id)
        return _humanize_id(id)
    end
    return uppercasefirst(tag_name)
end

"""Derive anchor ID for an XML section from attributes and tag name."""
function _derive_xml_anchor_id(tag_name::String, attrs::Dict{String, String})::String
    id = get(attrs, "id", "")
    if !isempty(id)
        return normalize_anchor_id(id)
    end
    return tag_name
end

"""Detect frontmatter at the start of the document.
Returns (FrontmatterBlock or nothing, first_content_line)."""
function _detect_frontmatter(lines::Vector{<:AbstractString})
    nlines = length(lines)
    if nlines == 0 || strip(lines[1]) != "---"
        return (nothing, 1)
    end

    # Find closing delimiter
    for i in 2:nlines
        if strip(lines[i]) == "---"
            raw = join(lines[2:i-1], "\n")
            # Detect format: try to find key: value pattern (YAML) vs key = "value" (TOML)
            fmt = occursin(r"^\s*\w+\s*=", raw) ? "toml" : "yaml"
            # Extract title
            title = ""
            for line in lines[2:i-1]
                # YAML: title: value
                tm = match(r"^title\s*[:=]\s*[\"']?([^\"'\n]*)[\"']?\s*$", line)
                if !isnothing(tm)
                    title = strip(tm[1])
                    break
                end
            end
            fm = FrontmatterBlock(raw, fmt, title, 1, i)
            # Content starts after frontmatter
            return (fm, i + 1)
        end
    end
    return (nothing, 1)
end

"""Find the line of a markdown heading within a range."""
function _find_markdown_heading_line(lines::Vector{<:AbstractString}, start_line::Int, end_line::Int)::Int
    for i in start_line:min(end_line, length(lines))
        _, _, _, ok = _parse_markdown_heading(lines[i])
        if ok
            return i
        end
    end
    return -1
end

# ─── Pre-scan for XML pairs ──────────────────────────────────────────────────

struct _XmlOpenInfo
    line::Int
    tag_name::String
    attrs::Dict{String, String}
    raw_tag::String  # The opening tag text (e.g., `<section id="...">`)
end

"""Pre-scan lines to find matched XML open/close pairs.
Returns (xml_pairs, xml_opens) where:
- xml_pairs: Dict mapping open_line -> close_line
- xml_opens: Vector of _XmlOpenInfo for each opening tag found"""
function _prescan_xml(lines::Vector{<:AbstractString}, content_start::Int)
    xml_pairs = Dict{Int, Int}()  # open_line -> close_line
    all_opens = _XmlOpenInfo[]
    stack = Tuple{String, Int, _XmlOpenInfo}[]  # (tag, line, info)

    in_code_fence = false
    fence_char = ' '
    fence_len = 0

    for line_num in content_start:length(lines)
        line = lines[line_num]

        # Handle code fences
        if !in_code_fence
            fm = match(r"^(`{3,}|~{3,})", line)
            if !isnothing(fm)
                in_code_fence = true
                fence_char = fm[1][1]
                fence_len = length(fm[1])
                continue
            end
        else
            stripped = strip(line)
            if !isempty(stripped) && all(c -> c == fence_char, stripped) && length(stripped) >= fence_len
                in_code_fence = false
            end
            continue
        end

        # Check for opening tags (not <a> tags)
        open_m = match(_RE_OPEN_TAG, line)
        if !isnothing(open_m)
            tag = lowercase(open_m[1])
            attrs_str = open_m[2]

            # Skip <a> tags and self-closing tags
            if tag != "a" && !occursin(r"/\s*>", open_m.match * (endswith(line, "/>") ? "" : ""))
                # Check for self-closing in the full matched portion
                full_tag_end = open_m.offset + length(open_m.match) - 1
                remaining = line[min(full_tag_end+1, lastindex(line)):end]

                is_self_closing = endswith(strip(attrs_str), "/") || occursin("/>", open_m.match)
                if !is_self_closing
                    attrs = _parse_tag_attrs(attrs_str)
                    raw_tag = open_m.match
                    info = _XmlOpenInfo(line_num, string(open_m[1]), attrs, raw_tag)
                    push!(all_opens, info)
                    push!(stack, (tag, line_num, info))

                    # Check for closing tag on same line
                    close_pattern = Regex("</$(open_m[1])\\s*>")
                    if occursin(close_pattern, line)
                        pop!(stack)
                        xml_pairs[line_num] = line_num
                    end
                end
            end
        end

        # Check for closing tags (only if not already handled by same-line close)
        if !haskey(xml_pairs, line_num) || true  # always check for closing tags
            for cm in eachmatch(_RE_CLOSE_TAG, line)
                close_tag = lowercase(cm[1])
                if close_tag == "a"
                    continue
                end
                # Find matching open on stack (search from top)
                for i in length(stack):-1:1
                    if stack[i][1] == close_tag
                        open_line = stack[i][2]
                        if !haskey(xml_pairs, open_line)
                            xml_pairs[open_line] = line_num
                        end
                        deleteat!(stack, i)
                        break
                    end
                end
            end
        end
    end

    return xml_pairs, all_opens
end

# ─── Main section builder ────────────────────────────────────────────────────

"""Allocate a unique anchor ID, appending _2, _3, etc. for duplicates."""
function _unique_anchor!(used::Dict{String, Int}, base_id::String)::String
    if !haskey(used, base_id)
        used[base_id] = 1
        return base_id
    end
    count = used[base_id] + 1
    used[base_id] = count
    new_id = "$(base_id)_$(count)"
    # Ensure the numbered version is also unique
    while haskey(used, new_id)
        count += 1
        used[base_id] = count
        new_id = "$(base_id)_$(count)"
    end
    used[new_id] = 1
    return new_id
end

"""
    parse_sections(text::Union{AbstractString, Vector{UInt8}}) -> ParseResult

Parse a document into sections, detecting markdown headings, XML tags, and frontmatter.
"""
function parse_sections(text::Union{AbstractString, Vector{UInt8}})::ParseResult
    source = _coerce_text(text)
    lines = split(source, "\n")
    nlines = length(lines)

    if nlines == 0
        return ParseResult(Section[], Dict{String,Int}(), Dict{String,Vector{Int}}(), nothing, 0)
    end

    # Step 1: Detect frontmatter
    fm, content_start = _detect_frontmatter(lines)

    # Step 2: Pre-scan for XML open/close pairs
    xml_pairs, xml_opens = _prescan_xml(lines, content_start)

    # Identify which XML opens are matched (closed)
    matched_opens = Set{Int}()  # line numbers of matched opens
    for (open_line, _) in xml_pairs
        push!(matched_opens, open_line)
    end

    # Step 3: Build sections
    sections = Section[]
    used_anchors = Dict{String, Int}()
    pending_anchor_id = ""
    pending_anchor_line = 0

    in_code_fence = false
    fence_char = ' '
    fence_len = 0

    # Track open markdown sections by level for proper closing
    # Each entry: (section_index_0based, level)
    md_open_stack = Tuple{Int, Int}[]

    # Track which lines are covered by sections
    covered = falses(nlines)

    # Mark frontmatter lines as covered
    if !isnothing(fm)
        for i in fm.start_line:fm.end_line
            covered[i] = true
        end
    end

    for line_num in content_start:nlines
        line = lines[line_num]

        # Handle code fences
        if !in_code_fence
            fm_match = match(r"^(`{3,}|~{3,})", line)
            if !isnothing(fm_match)
                in_code_fence = true
                fence_char = fm_match[1][1]
                fence_len = length(fm_match[1])
                continue
            end
        else
            stripped = strip(line)
            if !isempty(stripped) && all(c -> c == fence_char, stripped) && length(stripped) >= fence_len
                in_code_fence = false
            end
            continue
        end

        # Check for XML comment anchor: <!-- @id:xxx -->
        comment_anchor = _extract_xml_comment_anchor(line)
        if !isempty(comment_anchor)
            pending_anchor_id = comment_anchor
            pending_anchor_line = line_num
            continue
        end

        # Check for standalone anchor tag: <a id="..."></a>
        anchor_id, anchor_found = _parse_standalone_anchor_tag(line)
        if anchor_found
            pending_anchor_id = anchor_id
            pending_anchor_line = line_num
            continue
        end

        # Check for markdown heading
        level, heading, attr_id, is_heading = _parse_markdown_heading(line)
        if is_heading
            # Close any markdown sections at same or higher level
            while !isempty(md_open_stack) && md_open_stack[end][2] >= level
                idx = md_open_stack[end][1]
                sections[idx + 1].end_line = line_num - 1  # close at previous line
                pop!(md_open_stack)
            end

            # Determine anchor ID
            section_anchor = ""
            section_start = line_num

            # Check for pending anchor (from <a> tag, XML comment, or unclosed XML)
            if !isempty(pending_anchor_id)
                section_anchor = pending_anchor_id
                if pending_anchor_line > 0
                    section_start = pending_anchor_line
                end
                pending_anchor_id = ""
                pending_anchor_line = 0
            elseif !isempty(attr_id)
                section_anchor = normalize_anchor_id(attr_id)
            else
                # Check if there's an unmatched XML open tag nearby (previous non-blank line)
                check_line = line_num - 1
                while check_line >= content_start && isempty(strip(lines[check_line]))
                    check_line -= 1
                end
                if check_line >= content_start
                    for info in xml_opens
                        if info.line == check_line && !(info.line in matched_opens)
                            id_attr = get(info.attrs, "id", "")
                            if !isempty(id_attr)
                                section_anchor = normalize_anchor_id(id_attr)
                                section_start = info.line
                            end
                            break
                        end
                    end
                end
            end

            if isempty(section_anchor)
                section_anchor = generate_slug(heading)
            end

            unique_id = _unique_anchor!(used_anchors, section_anchor)

            section = Section(
                SECTION_KIND_MARKDOWN, "", heading, unique_id, level,
                section_start, nlines, 0, -1, Int[], Link[]
            )
            push!(sections, section)
            push!(md_open_stack, (length(sections) - 1, level))

            # Mark covered lines
            for i in section_start:line_num
                covered[i] = true
            end
            continue
        end

        # Check for matched XML opening tag
        open_m = match(_RE_OPEN_TAG, line)
        if !isnothing(open_m)
            tag = string(open_m[1])
            tag_lower = lowercase(tag)

            if tag_lower != "a"
                attrs_str = open_m[2]
                is_self_closing = endswith(strip(attrs_str), "/") || occursin("/>", open_m.match)

                if !is_self_closing && line_num in matched_opens
                    close_line = xml_pairs[line_num]
                    attrs = _parse_tag_attrs(attrs_str)
                    heading_text = _derive_xml_heading(tag_lower, attrs)
                    anchor = _derive_xml_anchor_id(tag_lower, attrs)
                    unique_id = _unique_anchor!(used_anchors, anchor)

                    section = Section(
                        SECTION_KIND_XML, tag_lower, heading_text, unique_id, 0,
                        line_num, close_line, 0, -1, Int[], Link[]
                    )
                    push!(sections, section)

                    for i in line_num:close_line
                        covered[i] = true
                    end
                end
            end
        end

        # Reset pending anchor if line is not blank and not consumed
        if !isempty(strip(line)) && !isempty(pending_anchor_id)
            # If this line didn't consume the pending anchor and isn't blank,
            # check if it's the XML open tag that produced the anchor
            is_anchor_source = false
            if pending_anchor_line == line_num
                is_anchor_source = true
            end
            if !is_anchor_source
                pending_anchor_id = ""
                pending_anchor_line = 0
            end
        end
    end

    # Close remaining open markdown sections at end of document
    for (idx, _) in md_open_stack
        sections[idx + 1].end_line = nlines
    end

    # Mark remaining section lines as covered
    for s in sections
        for i in s.start_line:s.end_line
            if i <= nlines
                covered[i] = true
            end
        end
    end

    # Step 4: Create preamble sections for uncovered gaps
    _add_preambles!(sections, lines, content_start, covered)

    # Step 5: Sort sections by start_line, then by kind (xml before markdown for same line)
    sort!(sections, by=s -> (s.start_line, s.kind == SECTION_KIND_XML ? 0 : s.kind == SECTION_KIND_PREAMBLE ? -1 : 1))

    # Step 6: Assign levels to XML sections and build parent-child hierarchy
    _build_hierarchy!(sections)

    # Step 7: Compute charCounts
    _compute_char_counts!(sections, lines)

    # Step 8: Build anchors map (0-based indices)
    anchors = Dict{String, Int}()
    duplicate_anchors = Dict{String, Vector{Int}}()
    for (i, s) in enumerate(sections)
        idx = i - 1  # 0-based
        if isempty(s.anchor_id)
            continue
        end
        if !haskey(anchors, s.anchor_id)
            anchors[s.anchor_id] = idx
        else
            if !haskey(duplicate_anchors, s.anchor_id)
                duplicate_anchors[s.anchor_id] = Int[]
            end
            push!(duplicate_anchors[s.anchor_id], idx)
        end
    end

    # Step 9: Compute totalChars
    total_chars = if content_start <= nlines
        length(join(lines[content_start:nlines], "\n"))
    else
        0
    end

    return ParseResult(sections, anchors, duplicate_anchors, fm, total_chars)
end

"""Add preamble sections for uncovered line ranges."""
function _add_preambles!(sections::Vector{Section}, lines::Vector{<:AbstractString},
                         content_start::Int, covered::BitVector)
    nlines = length(lines)
    i = content_start
    while i <= nlines
        if !covered[i] && !isempty(strip(lines[i]))
            # Found uncovered non-blank line - start of preamble
            preamble_start = i
            # Extend to include preceding blank lines
            while preamble_start > content_start && !covered[preamble_start - 1]
                preamble_start -= 1
            end
            # Find end of this uncovered region
            preamble_end = i
            while preamble_end < nlines && !covered[preamble_end + 1]
                preamble_end += 1
            end
            # Trim trailing blank lines
            while preamble_end > preamble_start && isempty(strip(lines[preamble_end]))
                preamble_end -= 1
            end

            # Include trailing blank lines up to next covered line
            while preamble_end < nlines && !covered[preamble_end + 1]
                preamble_end += 1
            end

            if preamble_end >= preamble_start
                section = Section(
                    SECTION_KIND_PREAMBLE, "", "", "", 0,
                    preamble_start, preamble_end, 0, -1, Int[], Link[]
                )
                push!(sections, section)
                for j in preamble_start:preamble_end
                    covered[j] = true
                end
            end
            i = preamble_end + 1
        else
            i += 1
        end
    end
end

"""Build parent-child hierarchy and assign XML section levels."""
function _build_hierarchy!(sections::Vector{Section})
    n = length(sections)
    if n == 0
        return
    end

    # Assign parent_idx based on containment
    for i in 1:n
        sections[i].parent_idx = -1
        sections[i].children = Int[]
    end

    for i in 1:n
        # Find the innermost section that contains this one
        best_parent = -1
        best_span = typemax(Int)
        for j in 1:n
            if j == i
                continue
            end
            if sections[j].start_line <= sections[i].start_line &&
               sections[i].end_line <= sections[j].end_line
                span = sections[j].end_line - sections[j].start_line
                if span < best_span
                    best_span = span
                    best_parent = j
                end
            end
        end

        if best_parent > 0
            # Check: for markdown sections, parent must be same kind or XML,
            # and must have lower level (for markdown) or be XML
            parent = sections[best_parent]
            child = sections[i]

            is_valid_parent = false
            if parent.kind == SECTION_KIND_XML
                is_valid_parent = true
            elseif parent.kind == SECTION_KIND_MARKDOWN && child.kind == SECTION_KIND_MARKDOWN
                is_valid_parent = parent.level < child.level
            elseif parent.kind == SECTION_KIND_MARKDOWN && child.kind == SECTION_KIND_XML
                is_valid_parent = true
            end

            if is_valid_parent
                sections[i].parent_idx = best_parent - 1  # 0-based
                push!(sections[best_parent].children, i - 1)  # 0-based
            end
        end
    end

    # Assign levels to XML sections based on nesting depth
    for i in 1:n
        if sections[i].kind == SECTION_KIND_XML
            depth = 1
            parent_idx = sections[i].parent_idx
            while parent_idx >= 0
                if sections[parent_idx + 1].kind == SECTION_KIND_XML
                    depth += 1
                end
                parent_idx = sections[parent_idx + 1].parent_idx
            end
            sections[i].level = depth
        end
    end
end

"""Compute char_count for each section."""
function _compute_char_counts!(sections::Vector{Section}, lines::Vector{<:AbstractString})
    for s in sections
        if s.kind == SECTION_KIND_PREAMBLE
            s.char_count = length(join(lines[s.start_line:s.end_line], "\n"))

        elseif s.kind == SECTION_KIND_MARKDOWN
            # Find the heading line within the section
            heading_line = _find_markdown_heading_line(lines, s.start_line, s.end_line)
            if heading_line > 0
                content_start = heading_line + 1
                content_end = s.end_line
                xml_adjustment = 0

                # If last line is a standalone closing XML tag, exclude it
                # but account for the trailing newline
                if content_end <= length(lines)
                    stripped = strip(lines[content_end])
                    if startswith(stripped, "</") && endswith(stripped, ">")
                        content_end -= 1
                        xml_adjustment = 1
                    end
                end

                if content_start <= content_end
                    s.char_count = length(join(lines[content_start:content_end], "\n")) + xml_adjustment
                else
                    s.char_count = content_start <= s.end_line ? xml_adjustment : 0
                end
            else
                s.char_count = length(join(lines[s.start_line:s.end_line], "\n"))
            end

        elseif s.kind == SECTION_KIND_XML
            # charCount = full section text - opening tag text - closing tag text
            full_text = join(lines[s.start_line:s.end_line], "\n")

            # Extract opening tag length
            open_m = match(_RE_OPEN_TAG, lines[s.start_line])
            open_len = isnothing(open_m) ? 0 : length(open_m.match)

            # Extract closing tag length
            close_m = match(_RE_CLOSE_TAG, lines[s.end_line])
            close_len = isnothing(close_m) ? 0 : length(close_m.match)

            s.char_count = max(0, length(full_text) - open_len - close_len)
        end
    end
end

# ─── inject_anchors ──────────────────────────────────────────────────────────

"""
    inject_anchors(text::Union{AbstractString, Vector{UInt8}}) -> Tuple{String, ParseResult}

Insert `<a id="..."></a>` tags before markdown headings that don't have anchors.
Returns the modified text and a fresh ParseResult.
"""
function inject_anchors(text::Union{AbstractString, Vector{UInt8}})::Tuple{String, ParseResult}
    source = _coerce_text(text)
    result = parse_sections(source)
    lines = split(source, "\n")

    for s in reverse(result.sections)
        if s.kind != SECTION_KIND_MARKDOWN
            continue
        end

        heading_idx = _find_markdown_heading_line(lines, s.start_line, s.end_line)
        if heading_idx < 0
            continue
        end

        # Check if previous line already has an anchor
        if heading_idx > 1
            prev = strip(lines[heading_idx - 1])
            _, prev_found = _parse_standalone_anchor_tag(prev)
            if prev_found || !isempty(_extract_xml_comment_anchor(prev))
                continue
            end
        end

        # Check if heading has {#id} attribute
        _, _, attr_id, ok = _parse_markdown_heading(lines[heading_idx])
        if !ok || !isempty(attr_id)
            continue
        end

        # Insert anchor before heading
        anchor_tag = "<a id=\"$(s.anchor_id)\"></a>"
        insert!(lines, heading_idx, anchor_tag)
    end

    output = join(lines, "\n")
    return (output, parse_sections(output))
end

# ─── render_toc ──────────────────────────────────────────────────────────────

"""
    render_toc(result::ParseResult, path::AbstractString) -> String

Render a table of contents from a ParseResult.
"""
function render_toc(result::ParseResult, path::AbstractString)::String
    if isempty(result.sections)
        return ""
    end

    renderable_count = count(s -> s.kind != SECTION_KIND_PREAMBLE, result.sections)

    out = String[]
    push!(out, "$(path) ($(result.total_chars) chars, $(renderable_count) sections)")

    for (i, s) in enumerate(result.sections)
        if s.kind == SECTION_KIND_PREAMBLE
            continue
        end

        # Compute indent based on depth
        depth = _section_depth(result.sections, i)
        indent = "  " ^ depth

        # Prefix
        prefix = _render_section_prefix(s)

        push!(out, "$(indent)$(prefix) $(s.heading) [#$(s.anchor_id)] (L$(s.start_line)-L$(s.end_line), $(s.char_count) chars)")
    end

    return join(out, "\n") * "\n"
end

function _section_depth(sections::Vector{Section}, idx::Int)::Int
    depth = 0
    parent = sections[idx].parent_idx
    while parent >= 0
        depth += 1
        parent = sections[parent + 1].parent_idx
    end
    return depth
end

function _render_section_prefix(s::Section)::String
    if s.kind == SECTION_KIND_XML
        return "<$(s.tag_name)>"
    elseif s.kind == SECTION_KIND_MARKDOWN
        return "#" ^ s.level
    else
        return "-"
    end
end

# ─── get_section_text ────────────────────────────────────────────────────────

"""
    get_section_text(text::Union{AbstractString, Vector{UInt8}}, anchor_id::AbstractString) -> Union{String, Nothing}

Extract the body text of a section identified by its anchor ID.
Returns `nothing` if the section is not found.
"""
function get_section_text(text::Union{AbstractString, Vector{UInt8}}, anchor_id::AbstractString)::Union{String, Nothing}
    source = _coerce_text(text)
    result = parse_sections(source)
    lines = split(source, "\n")

    normalized = normalize_anchor_id(anchor_id)

    # Find section by anchor_id
    idx = get(result.anchors, normalized, nothing)
    if isnothing(idx)
        return nothing
    end

    s = result.sections[idx + 1]  # 0-based to 1-based

    if s.kind == SECTION_KIND_XML
        # Content between opening and closing tags
        open_m = match(_RE_OPEN_TAG, lines[s.start_line])
        open_end = isnothing(open_m) ? 0 : length(open_m.match)

        if s.start_line == s.end_line
            # Single line: extract between opening and closing tags
            line = lines[s.start_line]
            close_m = match(_RE_CLOSE_TAG, line)
            close_start = isnothing(close_m) ? lastindex(line) : close_m.offset - 1
            body = line[nextind(line, 0, open_end + 1):close_start]
        else
            # Multi-line: content is from after opening tag to before closing tag
            first_line_rest = lines[s.start_line][nextind(lines[s.start_line], 0, open_end + 1):end]
            middle = s.start_line + 1 <= s.end_line - 1 ? lines[s.start_line+1:s.end_line-1] : String[]
            close_m = match(_RE_CLOSE_TAG, lines[s.end_line])
            last_line_part = if !isnothing(close_m) && close_m.offset > 1
                lines[s.end_line][1:prevind(lines[s.end_line], close_m.offset)]
            else
                ""
            end

            parts = String[]
            if !isempty(first_line_rest)
                push!(parts, first_line_rest)
            end
            append!(parts, middle)
            if !isempty(last_line_part)
                push!(parts, last_line_part)
            elseif isempty(first_line_rest)
                # Content starts on next line
                body_lines = lines[s.start_line+1:s.end_line-1]
                return strip(join(body_lines, "\n"))
            end
            body = join(parts, "\n")
        end
        return strip(body)
    elseif s.kind == SECTION_KIND_MARKDOWN
        # Content after heading line
        heading_line = _find_markdown_heading_line(lines, s.start_line, s.end_line)
        if heading_line > 0 && heading_line < s.end_line
            content = join(lines[heading_line+1:s.end_line], "\n")
            return strip(content)
        end
        return ""
    else
        # Preamble
        return strip(join(lines[s.start_line:s.end_line], "\n"))
    end
end
