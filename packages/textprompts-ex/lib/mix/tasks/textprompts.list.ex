defmodule Mix.Tasks.Textprompts.List do
  @shortdoc "Recursively list prompt files in a directory."

  @moduledoc """
  Scan a directory for prompt files and print their `path / title /
  version`.

      mix textprompts.list <dir> [--json] [--mode strict|allow|ignore]

  Recognised extensions: `.txt`, `.md`, `.prompt`. Use `--json` for a
  machine-readable array. Exits 1 if any prompt fails to load.
  """

  use Mix.Task

  @impl Mix.Task
  def run(args), do: TextPrompts.CLI.main(["list" | args])
end
