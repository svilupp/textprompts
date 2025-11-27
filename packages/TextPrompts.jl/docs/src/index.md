# TextPrompts.jl

A minimal, zero-complexity prompt loader with TOML front-matter metadata for Julia.

TextPrompts.jl allows you to manage prompts as text files next to your code with optional metadata, providing safe string formatting and easy bulk loading.

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

# Format with placeholders
result = format(prompt; name="World", day="Monday")
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

## Key Features

- **Zero complexity**: Simple text files with optional TOML metadata
- **Safe formatting**: Catches missing placeholder values
- **Flexible modes**: Strict validation or relaxed parsing
- **Bulk loading**: Load entire directories of prompts
- **Git-friendly**: Text files work well with version control

