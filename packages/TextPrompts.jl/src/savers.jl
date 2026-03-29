"""
File saving utilities for TextPrompts.
"""

using Dates
using TOML

# Characters that require quoting in YAML values
const _YAML_SPECIAL_CHARS = Set([':', '#', '{', '}', '[', ']', ',', '&', '*', '?', '|', '-', '<', '>', '=', '!', '%', '@', '\\', '"', '\'', '\n', '\r'])
const _YAML_BOOL_STRINGS = Set(["true", "false", "yes", "no", "on", "off", "null", "True", "False", "Yes", "No", "On", "Off", "NULL", "Null"])

"""
    _quote_yaml(val::AbstractString) -> String

Quote a YAML string value if it contains special characters or looks like a boolean/null.
"""
function _quote_yaml(val::AbstractString)::String
    s = string(val)
    needs_quoting = false
    if isempty(s) || s in _YAML_BOOL_STRINGS
        needs_quoting = true
    elseif !isempty(s) && (s[1] == ' ' || s[end] == ' ')
        needs_quoting = true
    else
        for c in s
            if c in _YAML_SPECIAL_CHARS
                needs_quoting = true
                break
            end
        end
    end
    if needs_quoting
        escaped = replace(s, "\\" => "\\\\", "\"" => "\\\"", "\n" => "\\n", "\r" => "\\r")
        return "\"$(escaped)\""
    end
    return s
end

"""
    _serialize_yaml_value(value) -> String

Serialize a value for YAML output.
"""
function _serialize_yaml_value(value)::String
    if isnothing(value)
        return "null"
    elseif value isa Bool
        return value ? "true" : "false"
    elseif value isa Number
        return string(value)
    elseif value isa AbstractString
        return _quote_yaml(value)
    else
        # For complex types, fall back to repr
        return _quote_yaml(repr(value))
    end
end

"""
    save_prompt(path, content::AbstractString; format::Symbol=:toml)

Save a string as a prompt file with template metadata.

# Arguments
- `path`: Path where to save the prompt file
- `content::AbstractString`: The prompt content to save
- `format::Symbol=:toml`: Output format for front-matter (`:toml` or `:yaml`)
"""
function save_prompt(path, content::AbstractString; format::Symbol=:toml)
    if format == :toml
        template = """
---
title = ""
description = ""
version = ""
---

$(strip(content))
"""
    elseif format == :yaml
        template = """
---
title: ""
description: ""
version: ""
---

$(strip(content))
"""
    else
        throw(ArgumentError("Invalid format: $(format). Use :toml or :yaml."))
    end
    mkpath(dirname(abspath(string(path))))
    write(string(path), template)
    return nothing
end

"""
    save_prompt(path, prompt::Prompt; format::Symbol=:toml)

Save a Prompt object to a file, preserving its metadata.

# Arguments
- `path`: Path where to save the prompt file
- `prompt::Prompt`: The Prompt object to save
- `format::Symbol=:toml`: Output format for front-matter (`:toml` or `:yaml`)
"""
function save_prompt(path, prompt::Prompt; format::Symbol=:toml)
    meta = prompt.meta

    if format == :toml
        _save_prompt_toml(path, prompt)
    elseif format == :yaml
        _save_prompt_yaml(path, prompt)
    else
        throw(ArgumentError("Invalid format: $(format). Use :toml or :yaml."))
    end
    return nothing
end

function _save_prompt_toml(path, prompt::Prompt)
    meta = prompt.meta

    # Build metadata dictionary (only include non-nothing values)
    meta_dict = Dict{String, Any}()

    if !isnothing(meta.title)
        meta_dict["title"] = meta.title
    end
    if !isnothing(meta.description)
        meta_dict["description"] = meta.description
    end
    if !isnothing(meta.version)
        meta_dict["version"] = meta.version
    end
    if !isnothing(meta.author)
        meta_dict["author"] = meta.author
    end
    if !isnothing(meta.created)
        meta_dict["created"] = Dates.format(meta.created, "yyyy-mm-dd")
    end
    if !isnothing(meta.extras)
        for (k, v) in meta.extras
            meta_dict[k] = v
        end
    end

    # Generate TOML header
    header_io = IOBuffer()
    TOML.print(header_io, meta_dict)
    header = String(take!(header_io))

    file_content = """
---
$(strip(header))
---

$(strip(String(prompt.prompt)))
"""

    mkpath(dirname(abspath(string(path))))
    write(string(path), file_content)
end

function _save_prompt_yaml(path, prompt::Prompt)
    meta = prompt.meta

    lines = String[]
    if !isnothing(meta.title)
        push!(lines, "title: $(_quote_yaml(meta.title))")
    end
    if !isnothing(meta.description)
        push!(lines, "description: $(_quote_yaml(meta.description))")
    end
    if !isnothing(meta.version)
        push!(lines, "version: $(_quote_yaml(meta.version))")
    end
    if !isnothing(meta.author)
        push!(lines, "author: $(_quote_yaml(meta.author))")
    end
    if !isnothing(meta.created)
        push!(lines, "created: $(Dates.format(meta.created, "yyyy-mm-dd"))")
    end
    if !isnothing(meta.extras)
        for (k, v) in sort(collect(meta.extras); by=first)
            push!(lines, "$(k): $(_serialize_yaml_value(v))")
        end
    end

    header = join(lines, "\n")

    file_content = """
---
$(header)
---

$(strip(String(prompt.prompt)))
"""

    mkpath(dirname(abspath(string(path))))
    write(string(path), file_content)
end
