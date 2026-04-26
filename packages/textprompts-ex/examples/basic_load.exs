# Run from `packages/textprompts-ex/`:
#
#     mix run examples/basic_load.exs
#
# Loads a prompt file with frontmatter and prints its body and metadata.

tmp_dir = Path.join(File.cwd!(), "tmp")
File.mkdir_p!(tmp_dir)
path = Path.join(tmp_dir, "basic_load.md")

File.write!(path, """
---
title = "Greeting"
version = "1.0.0"
description = "Hello-world prompt for the basic_load example."
---
Hello, world! Welcome to TextPrompts for Elixir.
""")

prompt = TextPrompts.load!(path)

IO.puts("--- meta ---")
IO.puts("title:       #{prompt.meta.title}")
IO.puts("version:     #{prompt.meta.version}")
IO.puts("description: #{prompt.meta.description}")

IO.puts("\n--- body ---")
IO.write(prompt.prompt)
