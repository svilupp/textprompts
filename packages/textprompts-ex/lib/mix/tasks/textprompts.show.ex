defmodule Mix.Tasks.Textprompts.Show do
  @shortdoc "Print a prompt's body (or its frontmatter with --meta)."

  @moduledoc """
  Print a TextPrompts prompt file.

      mix textprompts.show <path> [--meta] [--json] [--mode strict|allow|ignore]

  All flags and exit codes match `TextPrompts.CLI` directly — this task
  is a thin wrapper around `mix escript.build`'s `textprompts show` so
  behavior stays in one place.
  """

  use Mix.Task

  @impl Mix.Task
  def run(args), do: TextPrompts.CLI.main(["show" | args])
end
