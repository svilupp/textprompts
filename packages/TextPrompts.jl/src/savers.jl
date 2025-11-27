"""
File saving utilities for TextPrompts.
"""

using Dates
using TOML

"""
    save_prompt(path, content::AbstractString)

Save a string as a prompt file with template metadata.

Creates a new file with empty TOML front-matter fields ready to be filled in.

# Arguments
- `path`: Path where to save the prompt file
- `content::AbstractString`: The prompt content to save

# Examples
```julia
save_prompt("prompts/new_prompt.txt", "Hello, {name}!")
```

This creates:
```
---
title = ""
description = ""
version = ""
---

Hello, {name}!
```
"""
function save_prompt(path, content::AbstractString)
    template = """
---
title = ""
description = ""
version = ""
---

$(strip(content))
"""
    mkpath(dirname(abspath(string(path))))
    write(string(path), template)
    return nothing
end

"""
    save_prompt(path, prompt::Prompt)

Save a Prompt object to a file, preserving its metadata.

# Arguments
- `path`: Path where to save the prompt file
- `prompt::Prompt`: The Prompt object to save

# Examples
```julia
# Load, modify, and save
prompt = load_prompt("prompts/greeting.txt")
save_prompt("prompts/greeting_backup.txt", prompt)
```
"""
function save_prompt(path, prompt::Prompt)
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
        # Serialize date to ISO format string
        meta_dict["created"] = Dates.format(meta.created, "yyyy-mm-dd")
    end

    # Generate TOML header
    header_io = IOBuffer()
    TOML.print(header_io, meta_dict)
    header = String(take!(header_io))

    # Build file content
    file_content = """
---
$(strip(header))
---

$(strip(String(prompt.prompt)))
"""

    mkpath(dirname(abspath(string(path))))
    write(string(path), file_content)
    return nothing
end
