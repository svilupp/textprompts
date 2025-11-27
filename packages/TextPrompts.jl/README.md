# TextPrompts.jl

[![CI](https://github.com/svilupp/textprompts/actions/workflows/julia-ci.yml/badge.svg)](https://github.com/svilupp/textprompts/actions/workflows/julia-ci.yml)

A minimal, zero-complexity prompt loader with TOML front-matter metadata for Julia.

TextPrompts.jl is a Julia port of the [textprompts](https://github.com/svilupp/textprompts) Python package, allowing you to manage prompts as text files next to your code with optional metadata.

## Installation

```julia
using Pkg
Pkg.add("TextPrompts")
```

## Quick Start

```julia
using TextPrompts

# Load a prompt file
prompt = load_prompt("prompts/greeting.txt")

# Access content and metadata
println(prompt.prompt)        # The prompt text
println(prompt.meta.title)    # Metadata title

# Format with placeholders - call the prompt as a function
result = prompt(; name="World", day="Monday")
```

## File Format

Prompt files can optionally include TOML front-matter:

```
---
title = "Greeting Prompt"
version = "1.0.0"
description = "A friendly greeting"
author = "Your Name"
created = "2024-01-15"
---

Hello, {name}!

Today is {day} and the weather is {weather}.
```

Or just plain text:

```
Hello, {name}!

This is a simple prompt without metadata.
```

## Metadata Modes

TextPrompts supports three metadata handling modes:

| Mode | Description |
|------|-------------|
| `STRICT` | Requires title, description, and version fields |
| `ALLOW` | Parses metadata if present, doesn't require it (default) |
| `IGNORE` | Treats entire file as body, uses filename as title |

```julia
# Set global mode
set_metadata(:strict)

# Or per-file
prompt = load_prompt("simple.txt"; meta=:ignore)
```

## API Reference

### Loading Prompts

```julia
# Load single file
prompt = load_prompt("path/to/prompt.txt")
prompt = load_prompt("path/to/prompt.txt"; meta=:strict)

# Load multiple files/directories
prompts = load_prompts("prompts/")
prompts = load_prompts("prompts/"; recursive=true)
prompts = load_prompts("a.txt", "b.txt", "prompts/")
prompts = load_prompts("prompts/"; glob_pattern="*.prompt")
prompts = load_prompts("prompts/"; max_files=100)
```

### Formatting

Prompts are callable - call them as functions to substitute placeholders:

```julia
prompt = load_prompt("greeting.txt")

# Format with all placeholders - call the prompt as a function
result = prompt(; name="World", day="Monday")

# Partial formatting (skip validation)
result = prompt(; name="World", skip_validation=true)

# Direct access to placeholder names
println(prompt.placeholders)  # Set(["name", "day"])

# Alternative: use TextPrompts.format explicitly (not exported)
result = TextPrompts.format(prompt; name="World", day="Monday")
```

### Saving Prompts

```julia
# Save string with template metadata
save_prompt("new_prompt.txt", "Hello, {name}!")

# Save Prompt object (preserves metadata)
save_prompt("backup.txt", prompt)
```

### Configuration

```julia
# Set global metadata mode
set_metadata(:strict)   # or STRICT, "strict"
set_metadata(:allow)    # or ALLOW, "allow"
set_metadata(:ignore)   # or IGNORE, "ignore"

# Get current mode
mode = get_metadata()

# Convenience: skip metadata parsing
skip_metadata()

# Environment variable (set before using TextPrompts)
# TEXTPROMPTS_METADATA_MODE=strict
```

### Placeholder Utilities

```julia
# Extract placeholders from text
placeholders = extract_placeholders("Hello, {name}!")  # Set(["name"])

# Get detailed info
info = get_placeholder_info("{greeting}, {name}!")
# (count=2, names=Set(["greeting", "name"]), has_positional=false, has_named=true, is_mixed=false)
```

## Types

### Prompt

```julia
struct Prompt
    path::String           # Source file path
    meta::PromptMeta       # Metadata
    prompt::PromptString   # Content with placeholder tracking
end

# Convenience properties
prompt.placeholders  # Set of placeholder names
prompt.content       # String content
```

### PromptMeta

```julia
struct PromptMeta
    title::Union{String, Nothing}
    version::Union{String, Nothing}
    author::Union{String, Nothing}
    created::Union{Date, Nothing}
    description::Union{String, Nothing}
end
```

### PromptString

A string type that tracks placeholders (also callable):

```julia
ps = PromptString("Hello, {name}!")
ps.placeholders  # Set(["name"])
ps(; name="World")  # "Hello, World!"
```

## Error Handling

TextPrompts provides descriptive errors:

| Error | Description |
|-------|-------------|
| `FileMissingError` | File not found |
| `EmptyContentError` | File has no content |
| `MalformedHeaderError` | Invalid front-matter structure |
| `InvalidMetadataError` | Invalid TOML syntax |
| `MissingMetadataError` | Missing required fields (strict mode) |
| `PlaceholderError` | Missing values for placeholders |

All errors include helpful suggestions:

```julia
try
    load_prompt("missing.txt"; meta=:strict)
catch e
    println(e.message)
    # "Missing required metadata fields... Use meta=:allow or meta=:ignore..."
end
```

## Using with PromptingTools.jl

TextPrompts integrates seamlessly with [PromptingTools.jl](https://github.com/svilupp/PromptingTools.jl) for building LLM applications:

```julia
using TextPrompts
using PromptingTools

# Load prompt templates
system_template = load_prompt("prompts/system.txt")
user_template = load_prompt("prompts/task.txt")

# Format and create messages
system_msg = system_template(; role="Julia expert") |> SystemMessage
user_msg = user_template(; task="explain macros") |> UserMessage

# Call the LLM with a vector of messages
response = aigenerate([system_msg, user_msg])
```

Or as a shorter alternative:
```julia
response = aigenerate([
    load_prompt("prompts/system.txt")(; role="Julia expert") |> SystemMessage,
    load_prompt("prompts/task.txt")(; task="explain macros") |> UserMessage])
```


Example prompt files:

**prompts/system.txt**:
```
---
title = "System Prompt"
version = "1.0"
---
You are a {role}. Be concise and helpful.
```

**prompts/task.txt**:
```
---
title = "Task Prompt"
version = "1.0"
---
Please help me with the following task: {task}
```

## Advanced Features

### Escaped Braces

Use double braces for literal braces:

```
JSON template: {{"key": "{value}"}}
```

Formats to: `{"key": "actual_value"}`

### Format Specifiers

Format specifiers are recognized but passed through:

```
The price is {price:.2f} dollars.
```

The placeholder `price` is extracted; formatting is done by your application.

## License

MIT License - see [LICENSE](LICENSE) for details.
