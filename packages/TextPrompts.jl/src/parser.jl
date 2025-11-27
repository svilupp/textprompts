"""
TOML front-matter parsing utilities.
"""

using TOML
using Dates

const FRONT_MATTER_DELIMITER = "---"

"""
    _split_front_matter(text::AbstractString) -> Tuple{Union{String, Nothing}, String}

Split a text file into front-matter header and body.

# Returns
A tuple of (header_text, body_text) where header_text is `nothing` if no front-matter found.

# Throws
- Returns `(nothing, text)` if text doesn't start with "---"
- Raises error if "---" at start but no closing delimiter
"""
function _split_front_matter(text::AbstractString)::Tuple{Union{String, Nothing}, String}
    # Must start exactly with "---" (no leading whitespace)
    if !startswith(text, FRONT_MATTER_DELIMITER)
        return (nothing, text)
    end

    # Find the second "---" after the first line
    first_line_end = findfirst('\n', text)
    if isnothing(first_line_end)
        # File is just "---" with no newline
        return (nothing, text)
    end

    # Search for closing delimiter starting after first line
    rest = text[first_line_end+1:end]

    # Loop to find a valid closing delimiter (must be at start of line)
    search_start = 1
    closing_start = nothing
    while true
        closing_match = findnext(FRONT_MATTER_DELIMITER, rest, search_start)

        if isnothing(closing_match)
            # No more --- found
            return (nothing, text)
        end

        match_start = first(closing_match)

        # Check that --- is at the start of a line
        if match_start == 1 || rest[prevind(rest, match_start)] == '\n'
            # Valid closing delimiter found
            closing_start = match_start
            break
        end

        # Not at start of line, continue searching after this match
        search_start = last(closing_match) + 1
        if search_start > lastindex(rest)
            return (nothing, text)
        end
    end

    # Extract header and body
    header = strip(rest[1:prevind(rest, closing_start)])
    body_start = closing_start + length(FRONT_MATTER_DELIMITER)

    # Skip optional newline after closing ---
    if body_start <= lastindex(rest) && rest[body_start] == '\n'
        body_start = nextind(rest, body_start)
    end

    body = body_start <= lastindex(rest) ? rest[body_start:end] : ""

    return (string(header), string(body))
end

"""
    _dedent(text::AbstractString) -> String

Remove common leading whitespace from all lines (equivalent to Python's textwrap.dedent).
"""
function _dedent(text::AbstractString)::String
    lines = split(text, '\n')

    # Find minimum indentation of non-empty lines
    min_indent = typemax(Int)
    for line in lines
        stripped = lstrip(line)
        if !isempty(stripped)
            indent = length(line) - length(stripped)
            min_indent = min(min_indent, indent)
        end
    end

    if min_indent == typemax(Int) || min_indent == 0
        return string(text)
    end

    # Remove common indentation
    result = String[]
    for line in lines
        if isempty(strip(line))
            push!(result, "")
        else
            push!(result, line[nextind(line, 0, min_indent+1):end])
        end
    end

    return join(result, '\n')
end

"""
    _parse_toml_header(header::AbstractString, path::AbstractString) -> Dict{String, Any}

Parse TOML header content.

# Throws
- `InvalidMetadataError`: If TOML parsing fails
"""
function _parse_toml_header(header::AbstractString, path::AbstractString)::Dict{String, Any}
    try
        return TOML.parse(header)
    catch e
        throw(InvalidMetadataError(path, string(e)))
    end
end

"""
    _dict_to_meta(d::Dict{String, Any}, path::AbstractString) -> PromptMeta

Convert a dictionary to PromptMeta.

Handles date parsing from ISO format strings.
"""
function _dict_to_meta(d::Dict{String, Any}, path::AbstractString)::PromptMeta
    title = get(d, "title", nothing)
    version = get(d, "version", nothing)
    author = get(d, "author", nothing)
    description = get(d, "description", nothing)

    # Parse created date
    created_raw = get(d, "created", nothing)
    created = nothing
    if !isnothing(created_raw)
        if created_raw isa Date
            created = created_raw
        elseif created_raw isa String
            try
                created = Date(created_raw, "yyyy-mm-dd")
            catch
                # Try alternate format or leave as nothing
                try
                    created = Date(created_raw)
                catch
                    # Ignore invalid dates
                end
            end
        end
    end

    return PromptMeta(;
        title = isnothing(title) ? nothing : string(title),
        version = isnothing(version) ? nothing : string(version),
        author = isnothing(author) ? nothing : string(author),
        created = created,
        description = isnothing(description) ? nothing : string(description)
    )
end

"""
    _validate_strict_meta(meta::PromptMeta, path::AbstractString)

Validate that required fields are present in strict mode.

# Throws
- `MissingMetadataError`: If title, description, or version are missing/empty
"""
function _validate_strict_meta(meta::PromptMeta, path::AbstractString)
    missing_fields = String[]

    if isnothing(meta.title) || isempty(meta.title)
        push!(missing_fields, "title")
    end
    if isnothing(meta.description) || isempty(meta.description)
        push!(missing_fields, "description")
    end
    if isnothing(meta.version) || isempty(meta.version)
        push!(missing_fields, "version")
    end

    if !isempty(missing_fields)
        throw(MissingMetadataError(path, missing_fields))
    end
end

"""
    parse_file(path::AbstractString; metadata_mode::MetadataMode) -> Prompt

Parse a prompt file with the specified metadata mode.

# Arguments
- `path::AbstractString`: Path to the prompt file
- `metadata_mode::MetadataMode`: How to handle metadata

# Returns
A `Prompt` object with parsed metadata and content.

# Throws
- `FileMissingError`: If file doesn't exist
- `EmptyContentError`: If file has no content
- `MalformedHeaderError`: If front-matter is malformed
- `InvalidMetadataError`: If TOML parsing fails
- `MissingMetadataError`: If required fields missing in strict mode
"""
function parse_file(path::AbstractString; metadata_mode::MetadataMode)::Prompt
    path_str = string(path)

    # Check file exists
    if !isfile(path)
        throw(FileMissingError(path))
    end

    # Read file content
    content = try
        read(path, String)
    catch e
        throw(FileReadError(path, string(e)))
    end

    # Check for empty content
    if isempty(strip(content))
        throw(EmptyContentError(path))
    end

    # Get filename stem for default title
    filename_stem = splitext(basename(path))[1]

    # Handle based on metadata mode
    if metadata_mode == IGNORE
        # Treat entire file as body
        body = _dedent(strip(content))
        meta = PromptMeta(title = filename_stem)
        return Prompt(path_str, meta, body)
    end

    # Try to split front-matter
    header, body = _split_front_matter(content)

    # Check for malformed header (starts with --- but no closing)
    if isnothing(header) && startswith(content, FRONT_MATTER_DELIMITER)
        # Check if there's really no closing delimiter
        lines = split(content, '\n')
        if length(lines) > 1
            has_closing = any(startswith(strip(line), FRONT_MATTER_DELIMITER)
                             for line in lines[2:end])
            if !has_closing && metadata_mode == STRICT
                throw(MalformedHeaderError(path))
            end
        end
    end

    body = _dedent(strip(body))

    # Check for empty body after extracting metadata
    if isempty(body)
        throw(EmptyContentError(path))
    end

    if isnothing(header)
        # No front-matter found
        if metadata_mode == STRICT
            throw(MissingMetadataError(path))
        end
        # ALLOW mode: use defaults
        meta = PromptMeta(title = filename_stem)
        return Prompt(path_str, meta, body)
    end

    # Parse TOML header
    header_dict = _parse_toml_header(header, path)
    meta = _dict_to_meta(header_dict, path)

    # Use filename as title if not specified
    if isnothing(meta.title) || isempty(meta.title)
        meta = PromptMeta(
            title = filename_stem,
            version = meta.version,
            author = meta.author,
            created = meta.created,
            description = meta.description
        )
    end

    # Validate in strict mode
    if metadata_mode == STRICT
        _validate_strict_meta(meta, path)
    end

    return Prompt(path_str, meta, body)
end

"""
    parse_string(content::AbstractString; path::AbstractString="<string>", metadata_mode::MetadataMode) -> Prompt

Parse a prompt from string content.

# Arguments
- `content::AbstractString`: The prompt content to parse
- `path::AbstractString="<string>"`: Optional path for error messages and identification
- `metadata_mode::MetadataMode`: How to handle metadata

# Returns
A `Prompt` object with parsed metadata and content.

# Throws
- `EmptyContentError`: If content is empty
- `MalformedHeaderError`: If front-matter is malformed
- `InvalidMetadataError`: If TOML parsing fails
- `MissingMetadataError`: If required fields missing in strict mode
"""
function parse_string(content::AbstractString; path::AbstractString="<string>", metadata_mode::MetadataMode)::Prompt
    # Check for empty content
    if isempty(strip(content))
        throw(EmptyContentError(path))
    end

    # Get filename stem for default title
    filename_stem = path == "<string>" ? "untitled" : splitext(basename(path))[1]

    # Handle based on metadata mode
    if metadata_mode == IGNORE
        # Treat entire content as body
        body = _dedent(strip(content))
        meta = PromptMeta(title=filename_stem)
        return Prompt(path, meta, body)
    end

    # Try to split front-matter
    header, body = _split_front_matter(content)

    # Check for malformed header (starts with --- but no closing)
    if isnothing(header) && startswith(content, FRONT_MATTER_DELIMITER)
        lines = split(content, '\n')
        if length(lines) > 1
            has_closing = any(startswith(strip(line), FRONT_MATTER_DELIMITER)
                             for line in lines[2:end])
            if !has_closing && metadata_mode == STRICT
                throw(MalformedHeaderError(path))
            end
        end
    end

    body = _dedent(strip(body))

    # Check for empty body after extracting metadata
    if isempty(body)
        throw(EmptyContentError(path))
    end

    if isnothing(header)
        # No front-matter found
        if metadata_mode == STRICT
            throw(MissingMetadataError(path))
        end
        # ALLOW mode: use defaults
        meta = PromptMeta(title=filename_stem)
        return Prompt(path, meta, body)
    end

    # Parse TOML header
    header_dict = _parse_toml_header(header, path)
    meta = _dict_to_meta(header_dict, path)

    # Use filename as title if not specified
    if isnothing(meta.title) || isempty(meta.title)
        meta = PromptMeta(
            title=filename_stem,
            version=meta.version,
            author=meta.author,
            created=meta.created,
            description=meta.description
        )
    end

    # Validate in strict mode
    if metadata_mode == STRICT
        _validate_strict_meta(meta, path)
    end

    return Prompt(path, meta, body)
end
