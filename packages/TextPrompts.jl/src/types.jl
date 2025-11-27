"""
Core types for TextPrompts.
"""

using Dates

"""
    PromptMeta

Metadata for a prompt file.

# Fields
- `title::Union{String, Nothing}`: Title of the prompt
- `version::Union{String, Nothing}`: Semantic version string
- `author::Union{String, Nothing}`: Author of the prompt
- `created::Union{Date, Nothing}`: Creation date
- `description::Union{String, Nothing}`: Description of the prompt
"""
Base.@kwdef struct PromptMeta
    title::Union{String, Nothing} = nothing
    version::Union{String, Nothing} = nothing
    author::Union{String, Nothing} = nothing
    created::Union{Date, Nothing} = nothing
    description::Union{String, Nothing} = nothing
end

function Base.show(io::IO, meta::PromptMeta)
    fields = String[]
    !isnothing(meta.title) && push!(fields, "title=$(repr(meta.title))")
    !isnothing(meta.version) && push!(fields, "version=$(repr(meta.version))")
    !isnothing(meta.author) && push!(fields, "author=$(repr(meta.author))")
    !isnothing(meta.created) && push!(fields, "created=$(meta.created)")
    !isnothing(meta.description) && push!(fields, "description=$(repr(meta.description))")
    print(io, "PromptMeta(", join(fields, ", "), ")")
end

"""
    PromptString

A string type that tracks placeholders for safe formatting.

PromptString wraps a string and extracts placeholder names from it.
The `format` method validates that all placeholders are provided.

# Fields
- `content::String`: The string content
- `placeholders::Set{String}`: Set of placeholder names extracted from content
"""
struct PromptString <: AbstractString
    content::String
    placeholders::Set{String}

    function PromptString(content::AbstractString)
        placeholders = extract_placeholders(content)
        new(string(content), placeholders)
    end
end

# AbstractString interface
Base.ncodeunits(s::PromptString) = ncodeunits(s.content)
Base.codeunit(s::PromptString) = codeunit(s.content)
Base.codeunit(s::PromptString, i::Integer) = codeunit(s.content, i)
Base.isvalid(s::PromptString, i::Integer) = isvalid(s.content, i)
Base.iterate(s::PromptString) = iterate(s.content)
Base.iterate(s::PromptString, state) = iterate(s.content, state)
Base.length(s::PromptString) = length(s.content)
Base.sizeof(s::PromptString) = sizeof(s.content)
Base.lastindex(s::PromptString) = lastindex(s.content)
Base.firstindex(s::PromptString) = firstindex(s.content)
Base.getindex(s::PromptString, i::Integer) = getindex(s.content, i)
Base.getindex(s::PromptString, r::UnitRange) = getindex(s.content, r)
Base.SubString(s::PromptString, args...) = SubString(s.content, args...)
Base.String(s::PromptString) = s.content

function Base.show(io::IO, s::PromptString)
    print(io, "PromptString(", repr(s.content), ")")
end

function Base.show(io::IO, ::MIME"text/plain", s::PromptString)
    print(io, s.content)
end

"""
    format(s::PromptString; skip_validation::Bool=false, kwargs...) -> String

Format the prompt string with the given keyword arguments.

# Arguments
- `s::PromptString`: The prompt string to format
- `skip_validation::Bool=false`: If true, allows partial formatting with missing placeholders
- `kwargs...`: Keyword arguments matching placeholder names

# Returns
A formatted string with placeholders replaced.

# Throws
- `PlaceholderError`: If `skip_validation=false` and not all placeholders have values

# Examples
```julia
ps = PromptString("Hello, {name}!")
format(ps; name="World")  # "Hello, World!"

ps2 = PromptString("Hello, {name}! Today is {day}.")
format(ps2; name="World", skip_validation=true)  # "Hello, World! Today is {day}."
```
"""
function format(s::PromptString; skip_validation::Bool = false, kwargs...)
    # Convert kwargs to Dict{String, Any}
    provided = Dict{String, Any}(string(k) => v for (k, v) in kwargs)

    if !skip_validation
        validate_format_args(s.placeholders, provided)
    end

    return _substitute_placeholders(s.content, provided)
end

"""
    Prompt

A loaded prompt with metadata and content.

# Fields
- `path::String`: Path to the source file
- `meta::PromptMeta`: Metadata extracted from front-matter
- `prompt::PromptString`: The prompt content
"""
struct Prompt
    path::String
    meta::PromptMeta
    prompt::PromptString
end

function Prompt(path::AbstractString, meta::PromptMeta, prompt::AbstractString)
    Prompt(string(path), meta, PromptString(prompt))
end

# Delegate string methods to prompt field
Base.length(p::Prompt) = length(p.prompt)
Base.String(p::Prompt) = String(p.prompt)

# Custom getproperty to provide convenient access
function Base.getproperty(p::Prompt, name::Symbol)
    if name === :placeholders
        return p.prompt.placeholders
    elseif name === :content
        return p.prompt.content
    else
        return getfield(p, name)
    end
end

function Base.propertynames(::Prompt)
    return (:path, :meta, :prompt, :placeholders, :content)
end

"""
    format(p::Prompt; skip_validation::Bool=false, kwargs...) -> String

Format the prompt with the given keyword arguments.
See `format(::PromptString; ...)` for details.
"""
function format(p::Prompt; skip_validation::Bool = false, kwargs...)
    return format(p.prompt; skip_validation = skip_validation, kwargs...)
end

function Base.show(io::IO, p::Prompt)
    print(io, "Prompt(path=$(repr(p.path)), meta=$(p.meta))")
end

function Base.show(io::IO, ::MIME"text/plain", p::Prompt)
    println(io, "Prompt:")
    println(io, "  path: ", p.path)
    println(io, "  meta: ", p.meta)
    println(io, "  content:")
    for line in split(p.prompt.content, '\n')
        println(io, "    ", line)
    end
end

# String concatenation
Base.:+(p::Prompt, s::AbstractString) = String(p) * s
Base.:+(s::AbstractString, p::Prompt) = s * String(p)
Base.:+(p1::Prompt, p2::Prompt) = String(p1) * String(p2)
