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
A `Prompt` object with parsed metadata and content.

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

# Format with placeholders
result = format(prompt; name="World")
```
"""
function load_prompt(path; meta = nothing)::Prompt
    metadata_mode = parse_metadata_mode(meta)
    return parse_file(string(path); metadata_mode = metadata_mode)
end

"""
    load_prompts(paths...; recursive=false, glob_pattern="*.txt", meta=nothing, max_files=1000) -> Vector{Prompt}

Load multiple prompt files from directories and/or individual files.

# Arguments
- `paths...`: One or more paths to files or directories
- `recursive::Bool=false`: If true, search subdirectories recursively
- `glob_pattern::String="*.txt"`: Glob pattern for matching files in directories
- `meta`: Metadata mode (see `load_prompt`)
- `max_files::Union{Int, Nothing}=1000`: Maximum number of files to process.
  Set to `nothing` for unlimited.

# Returns
A `Vector{Prompt}` of loaded prompts.

# Throws
- Various errors from `load_prompt` for individual files

# Examples
```julia
# Load all .txt files from a directory
prompts = load_prompts("prompts/")

# Load recursively
prompts = load_prompts("prompts/"; recursive=true)

# Load specific files
prompts = load_prompts("greeting.txt", "farewell.txt")

# Mix files and directories
prompts = load_prompts("prompts/", "special/custom.txt")

# Custom glob pattern
prompts = load_prompts("prompts/"; glob_pattern="*.prompt")
```
"""
function load_prompts(
        paths...;
        recursive::Bool = false,
        glob_pattern::AbstractString = "*.txt",
        meta = nothing,
        max_files::Union{Int, Nothing} = 1000
)::Vector{Prompt}
    if isempty(paths)
        return Prompt[]
    end

    metadata_mode = parse_metadata_mode(meta)
    all_files = String[]

    for path in paths
        path_str = string(path)

        if isfile(path_str)
            push!(all_files, path_str)
        elseif isdir(path_str)
            # Collect files matching glob pattern
            pattern_regex = _glob_to_regex(glob_pattern)

            if recursive
                for (root, dirs, files) in walkdir(path_str)
                    for file in files
                        if occursin(pattern_regex, file)
                            push!(all_files, joinpath(root, file))
                        end
                    end
                end
            else
                for file in readdir(path_str)
                    if occursin(pattern_regex, file) && isfile(joinpath(path_str, file))
                        push!(all_files, joinpath(path_str, file))
                    end
                end
            end
        else
            throw(FileMissingError(path_str))
        end

        # Check max_files limit
        if !isnothing(max_files) && length(all_files) > max_files
            all_files = all_files[1:max_files]
            break
        end
    end

    # Apply max_files limit
    if !isnothing(max_files) && length(all_files) > max_files
        all_files = all_files[1:max_files]
    end

    # Load all files
    prompts = Prompt[]
    for file in all_files
        try
            push!(prompts, parse_file(file; metadata_mode = metadata_mode))
        catch e
            if e isa TextPromptsError
                rethrow()
            else
                throw(PromptLoadError(file, string(e)))
            end
        end
    end

    return prompts
end

"""
    _glob_to_regex(pattern::AbstractString) -> Regex

Convert a simple glob pattern to a regex.

Supports:
- `*` matches any characters except `/`
- `?` matches any single character except `/`
- `[...]` character classes
"""
function _glob_to_regex(pattern::AbstractString)::Regex
    # Escape regex special characters except * and ?
    regex_str = replace(pattern, r"[.+^${}()|\\]" => s"\\\0")

    # Convert glob wildcards to regex
    regex_str = replace(regex_str, "*" => ".*")
    regex_str = replace(regex_str, "?" => ".")

    # Anchor to match entire string
    return Regex("^" * regex_str * "\$")
end
