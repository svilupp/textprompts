# Basic Usage of TextPrompts.jl
#
# This example demonstrates core TextPrompts functionality:
# - Loading prompts from files
# - Accessing metadata
# - Formatting with placeholders
# - Loading multiple prompts

using TextPrompts

# Get the examples directory path
examples_dir = @__DIR__
prompts_dir = joinpath(examples_dir, "prompts")

# =============================================================================
# 1. Loading a Single Prompt
# =============================================================================

println("=" ^ 60)
println("1. Loading a Single Prompt")
println("=" ^ 60)

prompt = load_prompt(joinpath(prompts_dir, "greeting.txt"))

# Access the raw content
println("\nRaw content:")
println(prompt.content)

# Access metadata
println("\nMetadata:")
println("  Title: ", prompt.meta.title)
println("  Version: ", prompt.meta.version)
println("  Author: ", prompt.meta.author)
println("  Description: ", prompt.meta.description)

# See available placeholders
println("\nPlaceholders: ", prompt.placeholders)

# =============================================================================
# 2. Formatting with Placeholders
# =============================================================================

println("\n" * "="^60)
println("2. Formatting with Placeholders")
println("="^60)

# Format the prompt by calling it as a function
formatted = prompt(; name="Julia", day="Monday", weather="sunny")
println("\nFormatted prompt:")
println(formatted)

# Partial formatting (skip validation for missing placeholders)
partial = prompt(; name="Julia", skip_validation=true)
println("\nPartial format (name only):")
println(partial)

# Alternative: use TextPrompts.format explicitly (not exported to avoid clashes)
formatted2 = TextPrompts.format(prompt; name="Julia", day="Monday", weather="sunny")
println("\nUsing TextPrompts.format explicitly:")
println(formatted2)

# =============================================================================
# 3. Loading Multiple Prompts
# =============================================================================

println("\n" * "=" ^ 60)
println("3. Loading Multiple Prompts")
println("=" ^ 60)

# Load all .txt files from the prompts directory
all_prompts = load_prompts(prompts_dir)

println("\nLoaded $(length(all_prompts)) prompts:")
for p in all_prompts
    println("  - $(p.meta.title) ($(basename(p.path)))")
end

# =============================================================================
# 4. Working with Prompt Strings Directly
# =============================================================================

println("\n" * "=" ^ 60)
println("4. Working with Prompt Strings Directly")
println("=" ^ 60)

# Create a prompt from a string (no file needed)
inline_prompt = from_string("""
---
title = "Inline Example"
version = "1.0"
---
Calculate {operation} of {a} and {b}.
""")

println("\nInline prompt placeholders: ", inline_prompt.placeholders)
println("Formatted: ", inline_prompt(; operation="the sum", a=5, b=3))

# =============================================================================
# 5. Metadata Modes
# =============================================================================

println("\n" * "=" ^ 60)
println("5. Metadata Modes")
println("=" ^ 60)

# IGNORE mode - treat file as plain text, use filename as title
ignored = load_prompt(joinpath(prompts_dir, "greeting.txt"); meta=:ignore)
println("\nWith meta=:ignore:")
println("  Title: ", ignored.meta.title, " (from filename)")
println("  Content includes TOML header: ", startswith(ignored.content, "---"))

println("\n" * "=" ^ 60)
println("Done!")
println("=" ^ 60)
