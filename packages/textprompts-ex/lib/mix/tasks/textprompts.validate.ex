defmodule Mix.Tasks.Textprompts.Validate do
  @shortdoc "Validate a prompt file (exits non-zero on failure)."

  @moduledoc """
  Load a prompt and verify it parses under the chosen metadata mode.

      mix textprompts.validate <path> [--mode strict|allow|ignore]

  Exits 0 on success, 1 on validation failure. Errors are written to
  stderr.
  """

  use Mix.Task

  @impl Mix.Task
  def run(args), do: TextPrompts.CLI.main(["validate" | args])
end
