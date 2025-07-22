module TextPrompts

export load_prompt, load_prompts, save_prompt,
       Prompt, PromptMeta, PromptString, SafeString,
       MetadataMode, set_metadata, get_metadata, skip_metadata,
       warn_on_ignored_metadata,
       TextPromptsError, FileMissingError, MissingMetadataError,
       InvalidMetadataError, MalformedHeaderError

using Dates
using TOML

# Error types
abstract type TextPromptsError <: Exception end
struct FileMissingError <: TextPromptsError
    path::String
end
struct MissingMetadataError <: TextPromptsError; msg::String end
struct InvalidMetadataError <: TextPromptsError; msg::String end
struct MalformedHeaderError <: TextPromptsError; msg::String end

Base.showerror(io::IO, e::FileMissingError) = print(io, "File not found: ", e.path)
Base.showerror(io::IO, e::MissingMetadataError) = print(io, e.msg)
Base.showerror(io::IO, e::InvalidMetadataError) = print(io, e.msg)
Base.showerror(io::IO, e::MalformedHeaderError) = print(io, e.msg)

# Metadata mode enum
@enum MetadataMode IGNORE ALLOW STRICT

# configuration
const _METADATA_MODE = Ref(IGNORE)
const _WARN_ON_IGNORED_META = Ref(true)

set_metadata(mode::MetadataMode) = (_METADATA_MODE[] = mode)
set_metadata(mode::AbstractString) = set_metadata(MetadataMode(Symbol(lowercase(mode))))
get_metadata() = _METADATA_MODE[]
function skip_metadata(; skip_warning::Bool=false)
    _WARN_ON_IGNORED_META[] = !skip_warning
    set_metadata(IGNORE)
end
warn_on_ignored_metadata() = _WARN_ON_IGNORED_META[]

# models
struct PromptMeta
    title::Union{String,Nothing}
    version::Union{String,Nothing}
    author::Union{String,Nothing}
    created::Union{Date,Nothing}
    description::Union{String,Nothing}
end
PromptMeta() = PromptMeta(nothing,nothing,nothing,nothing,nothing)

struct Prompt
    path::String
    meta::Union{PromptMeta,Nothing}
    prompt::String
end

# PromptString with placeholder validation
struct PromptString
    value::String
    placeholders::Set{String}
end
SafeString = PromptString

function PromptString(v::String)
    regex = r"\{([^}:]*)(?::[^}]*)?\}"
    ps = Set{String}(m.captures[1] for m in eachmatch(regex, v))
    PromptString(v, ps)
end
Base.String(ps::PromptString) = ps.value
Base.getindex(ps::PromptString,i::Int) = ps.value[i]
Base.length(ps::PromptString) = length(ps.value)
Base.strip(ps::PromptString, args...; kws...) = strip(ps.value, args...; kws...)

function format(ps::PromptString, args...; kwargs..., skip_validation=false)
    mapping = Dict{String,Any}()
    for (i,a) in pairs(args); mapping[string(i-1)] = a; end
    merge!(mapping, Dict(Symbol(k)=>v for (k,v) in kwargs))
    if "" in ps.placeholders && !isempty(args)
        mapping[""] = args[1]
    end
    if !skip_validation
        missing = setdiff(ps.placeholders, Set(string(k) for k in keys(mapping)))
        if !isempty(missing)
            throw(ArgumentError("Missing format variables: $(collect(sort(missing)))"))
        end
    end
    result = ps.value
    for (k,v) in mapping
        result = replace(result, "{"*string(k)*"}" => string(v))
    end
    return result
end

PromptString(ps::PromptString) = ps

# util
function _split_front_matter(text)
    startswith(text, "---") || return nothing, text
    second = findnext("---", text, 4)
    second === nothing && throw(MalformedHeaderError("Missing closing delimiter '---' for front matter"))
    header = strip(text[4:second-1])
    body = lstrip(text[second+3:end], '\n')
    return header, body
end

function _resolve_mode(meta)
    meta === nothing && return get_metadata()
    meta isa MetadataMode && return meta
    return MetadataMode(Symbol(lowercase(String(meta))))
end

function load_prompt(path::AbstractString; meta=nothing)
    isfile(path) || throw(FileMissingError(String(path)))
    raw = read(path, String)
    mode = _resolve_mode(meta)
    if mode == IGNORE
        if warn_on_ignored_metadata() && startswith(raw, "---") && occursin("---", raw[4:end])
            @warn "Metadata detected but ignored; use set_metadata('allow') to parse"
        end
        pm = PromptMeta(title=split(basename(path), ".")[1], version=nothing, author=nothing, created=nothing, description=nothing)
        return Prompt(String(path), pm, raw)
    end
    header, body = _split_front_matter(raw)
    if header === nothing
        if mode == STRICT
            throw(MissingMetadataError("No metadata found in $path"))
        else
            meta_struct = PromptMeta()
        end
    else
        try
            data = TOML.parse(header)
        catch e
            throw(InvalidMetadataError("Invalid TOML in front matter: $(e.msg)"))
        end
        title = get(data, "title", nothing)
        version = get(data, "version", nothing)
        author = get(data, "author", nothing)
        created = let d=get(data,"created",nothing)
            d===nothing ? nothing : Date(d)
        end
        description = get(data,"description",nothing)
        meta_struct = PromptMeta(title, version, author, created, description)
        if mode == STRICT
            for fld in [title, description, version]
                (fld isa String && !isempty(strip(fld))) || throw(InvalidMetadataError("Empty required metadata fields"))
            end
        end
    end
    if meta_struct.title === nothing
        meta_struct = PromptMeta(basename(path)[1:end-4], meta_struct.version, meta_struct.author, meta_struct.created, meta_struct.description)
    end
    return Prompt(String(path), meta_struct, body)
end

function load_prompts(paths...; recursive=false, glob="*.txt", meta=nothing, max_files=1000)
    result = Prompt[]
    count=0
    for p in paths
        if isdir(p)
            itr = recursive ? walkdir(p) : ((p, [], readdir(p)),)
            for (dir, _, files) in itr
                for f in files
                    endswith(f, splitext(glob)[2]) || continue
                    full = joinpath(dir,f)
                    if max_files!==nothing && count>=max_files
                        throw(ErrorException("Exceeded max_files limit of $max_files"))
                    end
                    push!(result, load_prompt(full; meta=meta))
                    count+=1
                end
            end
        else
            if max_files!==nothing && count>=max_files
                throw(ErrorException("Exceeded max_files limit of $max_files"))
            end
            push!(result, load_prompt(p; meta=meta))
            count+=1
        end
    end
    return result
end

function save_prompt(path, content)
    io = open(path, "w")
    if content isa String
        write(io, "---\n", "title = \"\"\n", "description = \"\"\n", "version = \"\"\n", "---\n\n", content)
    elseif content isa Prompt
        m = content.meta === nothing ? PromptMeta() : content.meta
        println(io, "---")
        println(io, "title = \"", m.title===nothing ? "" : m.title, "\"")
        println(io, "description = \"", m.description===nothing ? "" : m.description, "\"")
        println(io, "version = \"", m.version===nothing ? "" : m.version, "\"")
        if m.author !== nothing
            println(io, "author = \"", m.author, "\"")
        end
        if m.created !== nothing
            println(io, "created = \"", Dates.format(m.created, dateformat"yyyy-mm-dd"), "\"")
        end
        println(io, "---\n")
        write(io, content.prompt)
    else
        close(io); rm(path)
        throw(ArgumentError("content must be String or Prompt"))
    end
    close(io)
end

end # module
