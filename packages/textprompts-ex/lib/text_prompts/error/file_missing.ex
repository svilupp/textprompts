defmodule TextPrompts.Error.FileMissing do
  defexception [:path]

  @impl true
  def message(%{path: path}), do: "prompt file not found: #{inspect(path)}"
end
