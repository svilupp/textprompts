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
Call it as a function or use `TextPrompts.format` to substitute placeholders.

# Fields
- `content::String`: The string content
- `placeholders::Set{String}`: Set of placeholder names extracted from content

# Examples
```julia
ps = PromptString("Hello, {name}!")
ps(; name="World")  # "Hello, World!"
```
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
Base.iterate(s::PromptString, i::Integer) = iterate(s.content, i)
Base.length(s::PromptString) = length(s.content)
Base.sizeof(s::PromptString) = sizeof(s.content)
Base.lastindex(s::PromptString) = lastindex(s.content)
Base.firstindex(s::PromptString) = firstindex(s.content)
Base.getindex(s::PromptString, i::Integer) = getindex(s.content, i)
Base.getindex(s::PromptString, r::UnitRange) = getindex(s.content, r)
Base.SubString(s::PromptString, i::Integer) = SubString(s.content, i)
Base.SubString(s::PromptString, i::Int64, j::Int64) = SubString(s.content, i, j)
Base.SubString(s::PromptString, r::AbstractUnitRange{<:Integer}) = SubString(s.content, r)
Base.String(s::PromptString) = s.content

function Base.show(io::IO, s::PromptString)
    print(io, "PromptString(", repr(s.content), ")")
end

function Base.show(io::IO, ::MIME"text/plain", s::PromptString)
    print(io, s.content)
end

"""
    (s::PromptString)(; skip_validation::Bool=false, kwargs...) -> String
    format(s::PromptString; skip_validation::Bool=false, kwargs...) -> String

Format the prompt string by substituting placeholders with the given values.

The recommended way is to call the PromptString as a function. The `format`
function is also available but not exported to avoid clashes with other packages.

# Arguments
- `skip_validation::Bool=false`: If true, allows partial formatting with missing placeholders
- `kwargs...`: Keyword arguments matching placeholder names

# Returns
A formatted string with placeholders replaced.

# Throws
- `PlaceholderError`: If `skip_validation=false` and not all placeholders have values

# Examples
```julia
ps = PromptString("Hello, {name}!")

# Recommended: call as a function
ps(; name="World")  # "Hello, World!"

# Alternative: use format (not exported, use TextPrompts.format)
TextPrompts.format(ps; name="World")  # "Hello, World!"

# Partial formatting
ps2 = PromptString("Hello, {name}! Today is {day}.")
ps2(; name="World", skip_validation=true)  # "Hello, World! Today is {day}."
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

# Make PromptString callable
(s::PromptString)(; skip_validation::Bool = false, kwargs...) = format(s; skip_validation, kwargs...)

"""
    Prompt

A loaded prompt with metadata and content.

`Prompt` is callable - call it with keyword arguments to substitute placeholders
and get a formatted string.

# Fields
- `path::String`: Path to the source file
- `meta::PromptMeta`: Metadata extracted from front-matter
- `prompt::PromptString`: The prompt content

# Convenience Properties
- `placeholders`: Set of placeholder names (delegates to `prompt.placeholders`)
- `content`: Raw string content (delegates to `prompt.content`)

# Examples
```julia
prompt = load_prompt("greeting.txt")

# Call as a function to format (recommended)
result = prompt(; name="World", day="Monday")

# Access properties
prompt.placeholders  # Set(["name", "day"])
prompt.content       # Raw template string
prompt.meta.title    # Metadata
```
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
    (p::Prompt)(; skip_validation::Bool=false, kwargs...) -> String
    format(p::Prompt; skip_validation::Bool=false, kwargs...) -> String

Format the prompt by substituting placeholders with the given values.

The recommended way is to call the Prompt as a function. The `format`
function is also available but not exported to avoid clashes with other packages.

# Arguments
- `skip_validation::Bool=false`: If true, allows partial formatting with missing placeholders
- `kwargs...`: Keyword arguments matching placeholder names

# Returns
A formatted string with placeholders replaced.

# Examples
```julia
prompt = load_prompt("greeting.txt")  # Contains "Hello, {name}!"

# Recommended: call as a function
prompt(; name="World")  # "Hello, World!"

# Alternative: use format (not exported)
TextPrompts.format(prompt; name="World")  # "Hello, World!"

# Use with PromptingTools
using PromptingTools
msg = prompt(; name="World") |> SystemMessage
```
"""
function format(p::Prompt; skip_validation::Bool = false, kwargs...)
    return format(p.prompt; skip_validation = skip_validation, kwargs...)
end

# Make Prompt callable
(p::Prompt)(; skip_validation::Bool = false, kwargs...) = format(p; skip_validation, kwargs...)

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
