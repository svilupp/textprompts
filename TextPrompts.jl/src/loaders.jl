module Loaders

export load_prompt, load_prompts

using Glob: fnmatch
using ..Config: MetadataMode, resolve_metadata_mode
using ..Errors: FileMissingError, TextPromptsError
using ..Models: Prompt
using ..Parser: parse_file

function load_prompt(path; meta=nothing)
    filepath = String(path)
    if !isfile(filepath)
        throw(FileMissingError(filepath))
    end
    mode = resolve_metadata_mode(meta)
    return parse_file(filepath; metadata_mode=mode)
end

function _iter_directory(dir::AbstractString, pattern::AbstractString, recursive::Bool)
    files = String[]
    if recursive
        for (root, _, filenames) in walkdir(dir)
            for file in filenames
                fnmatch(pattern, file) || continue
                push!(files, joinpath(root, file))
            end
        end
    else
        for file in readdir(dir)
            full = joinpath(dir, file)
            if isfile(full) && fnmatch(pattern, file)
                push!(files, full)
            end
        end
    end
    sort!(files)
    return files
end

function load_prompts(paths...; recursive::Bool=false, glob::AbstractString="*.txt", meta=nothing, max_files::Union{Int,Nothing}=1000)
    collected = Prompt[]
    count = 0
    limit = max_files
    for path in paths
        filepath = String(path)
        if isdir(filepath)
            files = _iter_directory(filepath, glob, recursive)
            for file in files
                if limit !== nothing && count >= limit
                    throw(TextPromptsError("Exceeded max_files limit of $(limit)"))
                end
                push!(collected, load_prompt(file; meta=meta))
                count += 1
            end
        else
            if limit !== nothing && count >= limit
                throw(TextPromptsError("Exceeded max_files limit of $(limit)"))
            end
            push!(collected, load_prompt(filepath; meta=meta))
            count += 1
        end
    end
    return collected
end

end
