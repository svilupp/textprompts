module Savers

export save_prompt

using Dates
using TOML
using ..Models: Prompt, PromptMeta, asdict

function _stringify_date(value)
    if value isa Date
        return Dates.format(value, dateformat"yyyy-mm-dd")
    elseif value isa DateTime
        return Dates.format(value, dateformat"yyyy-mm-ddTHH:MM:SS")
    else
        return value
    end
end

function save_prompt(path, content)
    filepath = String(path)
    if content isa AbstractString
        template = """---
title = ""
description = ""
version = ""
---

$content"""
        open(filepath, "w") do io
            write(io, template)
        end
    elseif content isa Prompt
        meta = content.meta
        meta === nothing && (meta = PromptMeta())
        data = Dict{String,Any}()
        data["title"] = meta.title === nothing ? "" : meta.title
        data["description"] = meta.description === nothing ? "" : meta.description
        data["version"] = meta.version === nothing ? "" : meta.version
        meta.author !== nothing && (data["author"] = meta.author)
        if meta.created !== nothing
            data["created"] = _stringify_date(meta.created)
        end
        for (k, v) in meta.extras
            data[k] = v
        end
        io = IOBuffer()
        TOML.print(io, data)
        header = String(take!(io))
        open(filepath, "w") do io2
            write(io2, "---\n")
            write(io2, header)
            if !endswith(header, "\n")
                write(io2, "\n")
            end
            write(io2, "---\n\n")
            write(io2, String(content.prompt))
        end
    elseif content isa PromptMeta
        # Allow saving metadata template with no prompt
        data = asdict(content)
        io = IOBuffer()
        TOML.print(io, data)
        header = String(take!(io))
        open(filepath, "w") do io2
            write(io2, "---\n")
            write(io2, header)
            if !endswith(header, "\n")
                write(io2, "\n")
            end
            write(io2, "---\n")
        end
    else
        throw(ArgumentError("content must be string, Prompt, or PromptMeta"))
    end
    return nothing
end

end
