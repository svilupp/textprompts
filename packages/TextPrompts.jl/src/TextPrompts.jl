"""
    TextPrompts

A minimal, zero-complexity prompt loader with TOML front-matter metadata.

TextPrompts allows you to manage prompts as text files with optional metadata,
providing safe string formatting and easy bulk loading.

# Quick Start

```julia
using TextPrompts

# Load a prompt file
prompt = load_prompt("prompts/greeting.txt")

# Access the content
println(prompt.prompt)  # The prompt text
println(prompt.meta.title)  # Metadata title

# Format with placeholders - call the prompt as a function
result = prompt(; name="World", day="Monday")
```

# Metadata Modes

- `STRICT`: Requires title, description, and version fields
- `ALLOW`: Parses metadata if present, doesn't require it (default)
- `IGNORE`: Treats entire file as body, uses filename as title

```julia
# Set global mode
set_metadata(:strict)

# Or per-file
prompt = load_prompt("file.txt"; meta=:ignore)
```

# File Format

```
---
title = "My Prompt"
version = "1.0.0"
description = "A helpful prompt"
author = "Your Name"
created = "2024-01-15"
---

Your prompt content here.
Use {placeholders} for templating.
```
"""
module TextPrompts

using Dates
using TOML

# Export types
export MetadataMode, STRICT, ALLOW, IGNORE
export PromptMeta, PromptString, Prompt

# Export functions
export from_path, from_string
export load_prompt, load_prompts, save_prompt
# Note: `format` is intentionally NOT exported to avoid clashes with Dates.format etc.
# Use the callable syntax instead: prompt(; name="value") or TextPrompts.format(...)
export set_metadata, get_metadata, skip_metadata, warn_on_ignored_metadata
export extract_placeholders, get_placeholder_info, validate_format_args

# Include source files in dependency order
include("errors.jl")
include("config.jl")
include("placeholders.jl")
include("types.jl")
include("parser.jl")
include("loaders.jl")
include("savers.jl")

# Initialize from environment on module load
function __init__()
    __init_config__()
end

end # module TextPrompts
