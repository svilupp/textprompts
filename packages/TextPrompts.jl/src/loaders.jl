"""
File loading utilities for TextPrompts.
"""

"""
    from_path(path; meta=nothing) -> Prompt

Load a prompt from a file path.

This is a convenience function equivalent to `load_prompt`.

# Arguments
- `path`: Path to the prompt file
- `meta`: Metadata mode (see `load_prompt` for details)

# Returns
A `Prompt` object.

# Examples
```julia
prompt = from_path("prompts/greeting.txt")
prompt = from_path("prompts/simple.txt"; meta=:ignore)
```
"""
function from_path(path; meta=nothing)::Prompt
    return load_prompt(path; meta=meta)
end

"""
    from_string(content; meta=nothing) -> Prompt

Parse a prompt from string content.

# Arguments
- `content`: The prompt content as a string
- `meta`: Metadata mode - can be `MetadataMode`, `Symbol` (`:strict`, `:allow`, `:ignore`),
  `String` ("strict", "allow", "ignore"), or `nothing` (uses global default)

# Returns
A `Prompt` object with `path="<string>"` and `title="untitled"` (unless specified in metadata).

# Examples
```julia
# Simple prompt without metadata
prompt = from_string("Hello, {name}!")
prompt.path  # "<string>"
prompt.meta.title  # "untitled"

# Prompt with TOML front-matter
content = \"\"\"
---
title = "Greeting"
version = "1.0.0"
---
Hello, {name}!
\"\"\"
prompt = from_string(content)
prompt.meta.title  # "Greeting"

# With specific metadata mode
prompt = from_string("Just the body"; meta=:ignore)
```
"""
function from_string(content; meta=nothing)::Prompt
    metadata_mode = parse_metadata_mode(meta)
    return parse_string(string(content); path="<string>", metadata_mode=metadata_mode)
end

"""
    load_prompt(path; meta=nothing) -> Prompt

Load a single prompt file.

# Arguments
- `path`: Path to the prompt file (String or AbstractString)
- `meta`: Metadata mode - can be `MetadataMode`, `Symbol` (`:strict`, `:allow`, `:ignore`),
  `String` ("strict", "allow", "ignore"), or `nothing` (uses global default)

# Returns
A `Prompt` object with parsed metadata and content. The returned `Prompt` is callable -
use `prompt(; kwargs...)` to substitute placeholders.

# Throws
- `FileMissingError`: If file doesn't exist
- `EmptyContentError`: If file has no content
- `MalformedHeaderError`: If front-matter is malformed
- `InvalidMetadataError`: If TOML parsing fails
- `MissingMetadataError`: If required fields missing in strict mode

# Examples
```julia
# Load with global default mode
prompt = load_prompt("prompts/greeting.txt")

# Load with specific mode
prompt = load_prompt("prompts/simple.txt"; meta=:ignore)

# Access prompt content
println(prompt.prompt)
println(prompt.meta.title)

# Format with placeholders - call the prompt as a function
result = prompt(; name="World")

# Use with PromptingTools
using PromptingTools
msg = prompt(; name="World") |> SystemMessage
```
"""
function load_prompt(path; meta = nothing)::Prompt
    metadata_mode = parse_metadata_mode(meta)
    return parse_file(string(path); metadata_mode = metadata_mode)
end

"""
    load_section(path, anchor_id::AbstractString; meta=nothing) -> Prompt

Load a specific section from a prompt file by its anchor ID.

# Arguments
- `path`: Path to the prompt file
- `anchor_id::AbstractString`: The anchor ID of the section to load
- `meta`: Metadata mode (see `load_prompt` for details)

# Returns
A `Prompt` object containing only the section's content.

# Throws
- `FileMissingError`: If file doesn't exist
- `TextPromptsError`: If the section is not found

# Examples
```julia
prompt = load_section("prompts/multi.txt", "system")
prompt = load_section("prompts/multi.txt", "examples"; meta=:ignore)
```
"""
function load_section(path, anchor_id::AbstractString; meta=nothing)::Prompt
    path_str = string(path)

    if !isfile(path_str)
        throw(FileMissingError(path_str))
    end

    content = try
        read(path_str, String)
    catch e
        throw(FileReadError(path_str, string(e)))
    end

    section_text = get_section_text(content, anchor_id)
    if isnothing(section_text)
        throw(PromptLoadError(path_str, "Section not found: $(anchor_id)"))
    end

    metadata_mode = parse_metadata_mode(meta)
    return parse_string(section_text; path=path_str, metadata_mode=metadata_mode)
end

