# Run from `packages/textprompts-ex/`:
#
#     mix run examples/format_with_placeholders.exs
#
# Loads a prompt with `{name}`-style placeholders, formats it strictly (the
# default), and demonstrates the error returned when a binding is missing.

alias TextPrompts.PromptString
alias TextPrompts.Error.Format

tmp_dir = Path.join(File.cwd!(), "tmp")
File.mkdir_p!(tmp_dir)
path = Path.join(tmp_dir, "format_demo.md")

File.write!(path, """
---
title = "Greeting"
version = "1.0.0"
description = "Two-placeholder demo."
---
Hello {name}, welcome to {place}.
""")

prompt = TextPrompts.load!(path)
ps = PromptString.new(prompt.prompt)

IO.puts("placeholders: #{inspect(MapSet.to_list(ps.placeholders) |> Enum.sort())}")

# Strict format (default): both placeholders supplied → ok.
{:ok, rendered} = PromptString.format(ps, name: "Ada", place: "Earth")
IO.puts("\n--- rendered (strict) ---")
IO.write(rendered)

# Strict format with a missing binding → {:error, %Format{}}.
{:error, %Format{} = err} = PromptString.format(ps, name: "Ada")
IO.puts("\n--- strict error ---")
IO.puts(Exception.message(err))

# Non-strict: missing placeholders are left as-is in the output.
{:ok, partial} = PromptString.format(ps, [name: "Ada"], strict: false)
IO.puts("\n--- rendered (non-strict, missing :place) ---")
IO.write(partial)
