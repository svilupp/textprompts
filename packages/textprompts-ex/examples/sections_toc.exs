# Run from `packages/textprompts-ex/`:
#
#     mix run examples/sections_toc.exs
#
# Parses a multi-section Markdown document, prints the section anchors,
# slices one section by anchor id, and renders a markdown TOC.

tmp_dir = Path.join(File.cwd!(), "tmp")
File.mkdir_p!(tmp_dir)
path = Path.join(tmp_dir, "sections_demo.md")

File.write!(path, """
---
title = "Sections Demo"
version = "1.0.0"
description = "Multi-section prompt for sections_toc.exs."
---

# Overview

This document demonstrates `parse_sections/1`, `get_section_text/2`, and
`render_toc/2`.

## Setup

Run `mix deps.get` and then `mix test`.

## Usage

Call `TextPrompts.load!/1` and pass the result to `parse_sections/1`.

### Tips

Anchors are derived from headings via `generate_slug/1`.
""")

prompt = TextPrompts.load!(path)
result = TextPrompts.parse_sections(prompt.prompt)

IO.puts("--- sections ---")

Enum.each(result.sections, fn s ->
  IO.puts(
    "#{String.duplicate("  ", s.level - 1)}#{s.heading} [##{s.anchor_id}] " <>
      "(L#{s.start_line}-L#{s.end_line}, #{s.char_count} chars)"
  )
end)

IO.puts("\n--- get_section_text(\"setup\") ---")
{body, true} = TextPrompts.get_section_text(prompt.prompt, "setup")
IO.write(body)

IO.puts("\n--- render_toc ---")
IO.write(TextPrompts.render_toc(result, Path.basename(path)))
