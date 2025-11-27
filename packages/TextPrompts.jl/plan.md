# Plan: TextPromptsPromptingToolsExt Extension

## Overview

Create a Julia package extension **in TextPrompts.jl** that integrates with PromptingTools.jl, enabling text-based prompts to be loaded directly as PromptingTools message types.

## Key Design Considerations

### Placeholder Format Difference

**Important**: TextPrompts and PromptingTools use different placeholder syntax:

| Package | Syntax | Example |
|---------|--------|---------|
| TextPrompts | Single braces | `Hello, {name}!` |
| PromptingTools | Double braces (handlebar) | `Hello, {{name}}!` |

The extension converts `{name}` → `{{name}}` when loading prompts as PT messages.

### Message Type Mapping
- One `TextPrompts.Prompt` = one PromptingTools message
- Use `load_prompt(SystemMessage, path)` for `SystemMessage`
- Use `load_prompt(UserMessage, path)` for `UserMessage`
- Use `load_prompt(AIMessage, path)` for `AIMessage`

## Implementation Plan

### 1. TextPrompts.jl: Add Base Method Signature

In `TextPrompts.jl/src/loaders.jl`, add a base method that can be extended:

```julia
"""
    load_prompt(::Type{T}, path::AbstractString; kwargs...) -> T

Load a prompt file and convert to type `T`.

This is a generic method that can be extended by other packages
(e.g., PromptingTools.jl) to return specific message types.

See also: `load_prompt(path)` for loading as `Prompt` type.
"""
function load_prompt(::Type{T}, path::AbstractString; kwargs...) where T
    error("load_prompt(::Type{$T}, ...) not implemented. " *
          "Load PromptingTools.jl for message type support.")
end
```

### 2. TextPrompts.jl: Create Extension File

**File**: `TextPrompts.jl/ext/PromptingToolsExt.jl`

```julia
module PromptingToolsExt

using TextPrompts
using PromptingTools
const PT = PromptingTools

"""
    convert_placeholders(content::AbstractString) -> String

Convert TextPrompts single-brace placeholders `{name}` to
PromptingTools double-brace placeholders `{{name}}`.

Note: TextPrompts uses `{{` for literal braces, which become `{` after conversion.
"""
function convert_placeholders(content::AbstractString)
    # First, protect escaped braces {{ -> temporary marker
    # Then convert {name} -> {{name}}
    # Finally, restore escaped braces
    result = replace(content, "{{" => "\x00ESCAPED_OPEN\x00")
    result = replace(result, "}}" => "\x00ESCAPED_CLOSE\x00")
    result = replace(result, r"\{([^}]+)\}" => s"{{\1}}")
    result = replace(result, "\x00ESCAPED_OPEN\x00" => "{")
    result = replace(result, "\x00ESCAPED_CLOSE\x00" => "}")
    return result
end

# Extend load_prompt for PromptingTools message types

function TextPrompts.load_prompt(::Type{PT.SystemMessage}, path::AbstractString; kwargs...)
    prompt = TextPrompts.load_prompt(path; kwargs...)
    content = convert_placeholders(prompt.content)
    return PT.SystemMessage(content)
end

function TextPrompts.load_prompt(::Type{PT.UserMessage}, path::AbstractString; kwargs...)
    prompt = TextPrompts.load_prompt(path; kwargs...)
    content = convert_placeholders(prompt.content)
    return PT.UserMessage(content)
end

function TextPrompts.load_prompt(::Type{PT.AIMessage}, path::AbstractString; kwargs...)
    prompt = TextPrompts.load_prompt(path; kwargs...)
    content = convert_placeholders(prompt.content)
    return PT.AIMessage(; content)
end

end # module
```

### 3. TextPrompts.jl: Update Project.toml

```toml
[weakdeps]
PromptingTools = "670122d1-24a8-4d70-bfce-740807c42192"

[extensions]
PromptingToolsExt = ["PromptingTools"]
```

## Usage Examples

```julia
using PromptingTools
using TextPrompts

# Load prompts as specific message types
system = load_prompt(SystemMessage, "prompts/system.txt")
user = load_prompt(UserMessage, "prompts/task.txt")

# Compose and call - placeholders use {{handlebar}} syntax now
response = aigenerate([system, user]; task="explain macros")
```

### Example Prompt File

**prompts/system.txt**:
```
---
title = "Julia Expert"
version = "1.0"
---
You are an expert Julia programmer.
Help the user with: {task}
```

After loading with `load_prompt(SystemMessage, "prompts/system.txt")`:
- Content becomes: `You are an expert Julia programmer.\nHelp the user with: {{task}}`
- Placeholders are converted for PromptingTools compatibility

## Implementation Checklist

**In TextPrompts.jl:**
- [ ] Add base `load_prompt(::Type{T}, path; kwargs...)` method signature
- [ ] Create `ext/PromptingToolsExt.jl`
- [ ] Add PromptingTools to `[weakdeps]` in Project.toml
- [ ] Add extension to `[extensions]` in Project.toml
- [ ] Implement `convert_placeholders` function
- [ ] Implement `load_prompt(::Type{SystemMessage}, ...)`
- [ ] Implement `load_prompt(::Type{UserMessage}, ...)`
- [ ] Implement `load_prompt(::Type{AIMessage}, ...)`
- [ ] Add tests
- [ ] Update documentation

## File Structure

```
TextPrompts.jl/
├── src/
│   ├── TextPrompts.jl
│   └── loaders.jl          # add base load_prompt(::Type, ...) method
├── ext/
│   └── PromptingToolsExt.jl  # NEW - extension for PT integration
├── test/
│   └── prompting_tools_ext.jl  # NEW - tests
└── Project.toml              # add weakdeps + extensions
```

## Design Decisions

1. **Extension lives in TextPrompts.jl**: TextPrompts extends itself when PromptingTools is loaded
2. **One file = one message**: Simple, no multi-role parsing
3. **Type dispatch**: `load_prompt(MessageType, path)` - idiomatic Julia
4. **Placeholder conversion**: `{name}` → `{{name}}` for PT compatibility
5. **Single braces in source files**: Users write `{name}` in their prompt files (TextPrompts style)
