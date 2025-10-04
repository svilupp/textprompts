module Models

export PromptMeta, Prompt, asdict

using Dates: Date
using Logging: @warn
using ..PromptStrings: PromptString
import ..TextPrompts

mutable struct PromptMeta
    title::Union{Nothing,String}
    version::Union{Nothing,String}
    author::Union{Nothing,String}
    created::Union{Nothing,Date,String}
    description::Union{Nothing,String}
    extras::Dict{String,Any}
    function PromptMeta(; title=nothing, version=nothing, author=nothing, created=nothing, description=nothing, extras=Dict{String,Any}(), kwargs...)
        extra_fields = Dict{String,Any}(extras)
        for (k, v) in pairs(kwargs)
            extra_fields[String(k)] = v
        end
        created_value = created
        if created isa Date
            created_value = created
        elseif created === nothing
            created_value = nothing
        elseif created isa AbstractString
            created_value = created
        else
            created_value = created
        end
        new(title, version, author, created_value, description, extra_fields)
    end
end

PromptMeta(data::AbstractDict{<:Any,<:Any}) = begin
    allowed = Set(["title", "version", "author", "created", "description"])
    function getvalue(key)
        if haskey(data, key)
            return data[key]
        end
        sym = Symbol(key)
        if haskey(data, sym)
            return data[sym]
        end
        return nothing
    end
    extras = Dict{String,Any}()
    for (k, v) in data
        key_str = String(k)
        if key_str ∉ allowed
            extras[key_str] = v
        end
    end
    return PromptMeta(
        title=getvalue("title"),
        version=getvalue("version"),
        author=getvalue("author"),
        created=getvalue("created"),
        description=getvalue("description"),
        extras=extras,
    )
end

Base.getindex(meta::PromptMeta, key::AbstractString) = get(meta.extras, key, nothing)
Base.setindex!(meta::PromptMeta, value, key::AbstractString) = (meta.extras[key] = value)

function Base.show(io::IO, meta::PromptMeta)
    fields = Dict(
        "title" => meta.title,
        "version" => meta.version,
        "author" => meta.author,
        "created" => meta.created,
        "description" => meta.description,
    )
    merged = merge(fields, meta.extras)
    print(io, "PromptMeta", merged)
end

mutable struct Prompt
    path::String
    meta::PromptMeta
    prompt::PromptString
    function Prompt(path::AbstractString, meta::PromptMeta, prompt::PromptString)
        str_prompt = String(prompt)
        if isempty(strip(str_prompt))
            throw(ArgumentError("Prompt body is empty"))
        end
        new(String(path), meta, prompt)
    end
end

function Prompt(path::AbstractString; meta::PromptMeta=PromptMeta(), prompt::Union{PromptString,AbstractString})
    ps = prompt isa PromptString ? prompt : PromptString(prompt)
    return Prompt(path, meta, ps)
end

Base.length(p::Prompt) = length(p.prompt)
Base.getindex(p::Prompt, idx::Int) = p.prompt[idx]
Base.getindex(p::Prompt, r::UnitRange{Int}) = p.prompt[r]
Base.string(p::Prompt) = string(p.prompt)

function Base.show(io::IO, p::Prompt)
    if p.meta.title !== nothing
        if p.meta.version !== nothing
            print(io, "Prompt(title='", p.meta.title, "', version='", p.meta.version, "')")
        else
            print(io, "Prompt(title='", p.meta.title, "')")
        end
    else
        print(io, "Prompt(path='", p.path, "')")
    end
end

function format(p::Prompt, args...; kwargs...)
    return format(p.prompt, args...; kwargs...)
end

function body(p::Prompt)
    @warn "Prompt.body is deprecated; use prompt field instead" maxlog=1
    return p.prompt
end

function asdict(meta::PromptMeta)
    base = Dict{String,Any}()
    meta.title !== nothing && (base["title"] = meta.title)
    meta.version !== nothing && (base["version"] = meta.version)
    meta.author !== nothing && (base["author"] = meta.author)
    meta.created !== nothing && (base["created"] = meta.created)
    meta.description !== nothing && (base["description"] = meta.description)
    return merge(base, meta.extras)
end

function asdict(p::Prompt)
    return Dict(
        "path" => p.path,
        "meta" => asdict(p.meta),
        "prompt" => String(p.prompt),
    )
end

function from_path(path; meta=nothing)
    return TextPrompts.load_prompt(path; meta=meta)
end

end
