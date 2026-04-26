# Run from `packages/textprompts-ex/`:
#
#     mix run examples/round_trip.exs
#
# load → modify metadata → save → reload → assert.

tmp_dir = Path.join(File.cwd!(), "tmp")
File.mkdir_p!(tmp_dir)
path = Path.join(tmp_dir, "round_trip.md")

File.write!(path, """
---
title = "Round Trip"
version = "1.0.0"
description = "Demonstrates load → modify → save → reload."
---
Round-trip body.
""")

original = TextPrompts.load!(path)
IO.puts("loaded version: #{original.meta.version}")

updated_meta = %{original.meta | version: "1.1.0"}
updated_prompt = %{original | meta: updated_meta}

:ok = TextPrompts.save(path, updated_prompt)

reloaded = TextPrompts.load!(path)
IO.puts("reloaded version: #{reloaded.meta.version}")

unless reloaded.meta.version == "1.1.0" do
  raise "version did not round-trip: got #{inspect(reloaded.meta.version)}"
end

unless reloaded.meta.title == original.meta.title do
  raise "title did not round-trip: got #{inspect(reloaded.meta.title)}"
end

unless String.contains?(reloaded.prompt, "Round-trip body.") do
  raise "body did not round-trip; got #{inspect(reloaded.prompt)}"
end

IO.puts("round-trip ok")
