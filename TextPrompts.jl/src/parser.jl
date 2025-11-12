module Parser

export parse_file

using TOML
using Logging: @warn
using ..Config: MetadataMode, warn_on_ignored_metadata
using ..Errors: InvalidMetadataError, MalformedHeaderError, MissingMetadataError
using ..Models: Prompt, PromptMeta
using ..PromptStrings: PromptString
using Base: basename

const DELIM = "---"

function _dedent(text::String)
    lines = split(text, '\n'; keepempty=true)
    indents = Int[]
    for line in lines
        if isempty(strip(line))
            continue
        end
        spaces = findfirst(!=(' '), line)
        if spaces === nothing
            push!(indents, length(line))
        else
            push!(indents, spaces - 1)
        end
    end
    if isempty(indents)
        return text
    end
    trim = minimum(indents)
    if trim == 0
        return text
    end
    prefix = repeat(" ", trim)
    adjusted_lines = [startswith(line, prefix) ? line[length(prefix)+1:end] : line for line in lines]
    adjusted = join(adjusted_lines, "\n")
    return adjusted
end

function _stem(path::AbstractString)
    base = basename(String(path))
    dot = findlast(=='.', base)
    if dot === nothing
        return base
    end
    return base[1:dot-1]
end

function _split_front_matter(text::String)
    startswith(text, DELIM) || return nothing, text
    second_range = findnext(DELIM, text, length(DELIM)+1)
    if second_range === nothing
        throw(MalformedHeaderError("Missing closing delimiter '---' for front matter"))
    end
    second_start = first(second_range)
    header = strip(text[length(DELIM)+1:second_start-1])
    body = lstrip(text[last(second_range)+1:end], '\n')
    return header, body
end

function parse_file(path::AbstractString; metadata_mode::MetadataMode)
    raw = read(String(path), String)
    if metadata_mode == MetadataMode.IGNORE
        if warn_on_ignored_metadata() && startswith(raw, DELIM)
            second = findnext(DELIM, raw, length(DELIM)+1)
            if second !== nothing
                @warn "Metadata detected but ignored; call skip_metadata(skip_warning=true) to silence"
            end
        end
        meta = PromptMeta(title=_stem(path))
        return Prompt(path, meta, PromptString(_dedent(raw)))
    end
    try
        header, body = _split_front_matter(raw)
    catch e
        if isa(e, MalformedHeaderError) && startswith(raw, DELIM)
            throw(InvalidMetadataError("$(e.msg). Use meta=MetadataMode.IGNORE to skip metadata parsing."))
        else
            rethrow()
        end
    end
    meta = nothing
    if header !== nothing
        try
            data = TOML.parse(header)
            if metadata_mode == MetadataMode.STRICT
                required = ["title", "description", "version"]
                missing = filter(x -> !haskey(data, x) && !haskey(data, Symbol(x)), required)
                if !isempty(missing)
                    throw(InvalidMetadataError("Missing required metadata fields: $(join(missing, ", "))."))
                end
                empties = String[]
                for key in required
                    value = haskey(data, key) ? data[key] : data[Symbol(key)]
                    if value === nothing || isempty(strip(string(value)))
                        push!(empties, key)
                    end
                end
                if !isempty(empties)
                    throw(InvalidMetadataError("Empty required metadata fields: $(join(empties, ", "))."))
                end
            end
            meta = PromptMeta(data)
        catch err
            if err isa TOML.ParserError
                throw(InvalidMetadataError("Invalid TOML in front matter: $(err)"))
            elseif err isa InvalidMetadataError
                rethrow()
            else
                throw(InvalidMetadataError("Invalid metadata: $(err)"))
            end
        end
    else
        if metadata_mode == MetadataMode.STRICT
            throw(MissingMetadataError("No metadata found in $(path). STRICT mode requires title, description, and version."))
        end
        meta = PromptMeta()
    end
    if meta.title === nothing
        meta.title = _stem(path)
    end
    return Prompt(path, meta, PromptString(_dedent(body)))
end

end
