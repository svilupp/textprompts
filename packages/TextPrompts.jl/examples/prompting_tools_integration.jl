# TextPrompts.jl + PromptingTools.jl Integration
#
# This example shows how to use TextPrompts with PromptingTools
# for building LLM applications.
#
# Prerequisites:
#   using Pkg
#   Pkg.add("PromptingTools")

using TextPrompts
using PromptingTools
using PromptingTools: SystemMessage, UserMessage

# Get the examples directory path
examples_dir = @__DIR__
prompts_dir = joinpath(examples_dir, "prompts")

# =============================================================================
# 1. Basic Integration - Load, Format, Create Messages
# =============================================================================

println("="^60)
println("1. Basic Integration")
println("="^60)

# Load prompt templates
system_template = load_prompt(joinpath(prompts_dir, "system.txt"))
user_template = load_prompt(joinpath(prompts_dir, "task.txt"))

println("\nLoaded templates:")
println("  System: ", system_template.meta.title)
println("  User: ", user_template.meta.title)

# Format and create messages - call the template as a function, then pipe to message type
system_msg = system_template(; role="Julia expert") |> SystemMessage
user_msg = user_template(; task="explain macros") |> UserMessage

println("\nCreated messages:")
println("  SystemMessage: ", system_msg.content)
println("  UserMessage: ", user_msg.content)

# =============================================================================
# 2. Calling the LLM (uncomment to run)
# =============================================================================

println("\n" * "="^60)
println("2. Calling the LLM")
println("="^60)

# Uncomment to actually call the LLM:
# response = aigenerate([system_msg, user_msg])
# println(response.content)

println("\nTo call the LLM, uncomment the lines above.")
println("Make sure you have OPENAI_API_KEY set in your environment.")

# =============================================================================
# 3. One-liner Alternative
# =============================================================================

println("\n" * "="^60)
println("3. One-liner Alternative")
println("="^60)

# Compact style using pipe operator
messages = [
    load_prompt(joinpath(prompts_dir, "system.txt"))(; role="Julia expert") |> SystemMessage,
    load_prompt(joinpath(prompts_dir, "task.txt"))(; task="explain macros") |> UserMessage
]

println("\nMessages created with pipe operator:")
for msg in messages
    println("  $(typeof(msg).name.name): $(msg.content)")
end

# Uncomment to call:
# response = aigenerate(messages)

println("\n" * "="^60)
println("Done!")
println("="^60)
