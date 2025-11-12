module PromptStrings

export PromptString, format

using ..PlaceholderUtils: extract_placeholders, validate_format_args
using Printf: @sprintf
using Base: iterate

struct PromptString <: AbstractString
    text::String
    placeholders::Set{String}
    function PromptString(text::AbstractString)
        str = String(text)
        new(str, extract_placeholders(str))
    end
end

Base.length(ps::PromptString) = length(ps.text)
Base.ncodeunits(ps::PromptString) = ncodeunits(ps.text)
Base.codeunit(::Type{PromptString}) = UInt8
Base.iterate(ps::PromptString) = iterate(ps.text)
Base.iterate(ps::PromptString, state) = iterate(ps.text, state)
Base.getindex(ps::PromptString, i::Int) = ps.text[i]
Base.getindex(ps::PromptString, r::UnitRange{Int}) = ps.text[r]
Base.String(ps::PromptString) = ps.text
Base.convert(::Type{String}, ps::PromptString) = ps.text
Base.print(io::IO, ps::PromptString) = print(io, ps.text)
Base.show(io::IO, ps::PromptString) = print(io, ps.text)

function Base.strip(ps::PromptString; kwargs...)
    return PromptString(strip(ps.text; kwargs...))
end

function format(ps::PromptString, args...; skip_validation::Bool=false, kwargs...)
    kwdict = Dict{String,Any}(String(k) => v for (k, v) in pairs(kwargs))
    if skip_validation
        return _partial_format(ps, args, kwdict)
    end
    validate_format_args(ps.placeholders, args, kwdict; skip_validation=false)
    return _render(ps, args, kwdict; skip_missing=false)
end

function _partial_format(ps::PromptString, args, kwdict::Dict{String,Any})
    merged = _merge_args(args, kwdict, ps.placeholders)
    return _render(ps, (), merged; skip_missing=true)
end

function _merge_args(args, kwdict::Dict{String,Any}, placeholders)
    merged = copy(kwdict)
    for (idx, value) in enumerate(args)
        merged[string(idx - 1)] = value
    end
    if "" in placeholders && !isempty(args)
        merged[""] = args[1]
    end
    return merged
end

function _render(ps::PromptString, args, kwdict::Dict{String,Any}; skip_missing::Bool)
    data = _merge_args(args, kwdict, ps.placeholders)
    text = ps.text
    io = IOBuffer()
    i = firstindex(text)
    while i <= lastindex(text)
        ch = text[i]
        if ch == '{'
            next_i = nextind(text, i)
            if next_i <= lastindex(text) && text[next_i] == '{'
                write(io, '{')
                i = nextind(text, next_i)
                continue
            end
            placeholder, new_index = _consume_placeholder(text, next_i)
            name, spec = _split_placeholder(placeholder)
            key = String(name)
            if haskey(data, key)
                formatted = _apply_format(data[key], spec)
                write(io, formatted)
            elseif skip_missing
                write(io, "{" * placeholder * "}")
            else
                throw(KeyError("Missing format variable '$key'"))
            end
            i = new_index
        elseif ch == '}'
            next_i = nextind(text, i)
            if next_i <= lastindex(text) && text[next_i] == '}'
                write(io, '}')
                i = nextind(text, next_i)
                continue
            end
            throw(ArgumentError("Single '}' encountered in format string"))
        else
            write(io, text[i])
            i = nextind(text, i)
        end
    end
    return String(take!(io))
end

function _consume_placeholder(text::String, idx::Int)
    start = idx
    i = idx
    while i <= lastindex(text)
        if text[i] == '}'
            placeholder = text[start:prevind(text, i)]
            return placeholder, nextind(text, i)
        end
        i = nextind(text, i)
    end
    throw(ArgumentError("Missing closing '}' in format string"))
end

function _split_placeholder(placeholder::AbstractString)
    parts = split(String(placeholder), ":"; limit=2)
    if length(parts) == 1
        return parts[1], ""
    else
        return parts[1], parts[2]
    end
end

function _apply_format(value, spec::AbstractString)
    isempty(spec) && return string(value)
    if spec == "s"
        return string(value)
    elseif spec == "d"
        return string(Int(value))
    elseif occursin(r"^0\d+d$", spec)
        if (m = match(r"^0(\d+)d$", spec)) !== nothing
            width = parse(Int, m.captures[1])
            return lpad(string(Int(value)), width, '0')
        end
    elseif occursin(r"^\.\d+f$", spec)
        if (m = match(r"^\.(\d+)f$", spec)) !== nothing
            precision = parse(Int, m.captures[1])
            return @sprintf("%.${precision}f", float(value))
        end
    else
        return string(value)
    end
    return string(value)
end

end
