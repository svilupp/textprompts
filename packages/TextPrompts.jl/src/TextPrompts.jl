"""
    TextPrompts

A minimal, zero-complexity prompt loader with TOML/YAML front-matter metadata
and section parsing.

TextPrompts allows you to manage prompts as text files with optional metadata,
providing safe string formatting, section extraction, and flexible loading.

# Quick Start

```julia
using TextPrompts

# Load a prompt file
prompt = load_prompt("prompts/greeting.txt")

# Format with placeholders
result = prompt(; name="World", day="Monday")

# Load a specific section
section = load_section("prompts/multi.txt", "system")

# Parse sections from a document
result = parse_sections(read("doc.md", String))
```
"""
module TextPrompts

using Dates
using TOML
using YAML

# Export types
export MetadataMode, STRICT, ALLOW, IGNORE
export PromptMeta, PromptString, Prompt
export Section, Link, FrontmatterBlock, ParseResult

# Export functions
export from_path, from_string
export load_prompt, load_section, save_prompt
# Note: `format` is intentionally NOT exported to avoid clashes with Dates.format etc.
# Use the callable syntax instead: prompt(; name="value") or TextPrompts.format(...)
export set_metadata, get_metadata, skip_metadata, warn_on_ignored_metadata
export extract_placeholders, get_placeholder_info, validate_format_args
export parse_sections, generate_slug, normalize_anchor_id
export inject_anchors, render_toc, get_section_text

# Include source files in dependency order
include("errors.jl")
include("config.jl")
include("placeholders.jl")
include("types.jl")
include("parser.jl")
include("sections.jl")
include("loaders.jl")
include("savers.jl")

# Initialize from environment on module load
function __init__()
    __init_config__()
end

end # module TextPrompts
