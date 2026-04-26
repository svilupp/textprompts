defmodule TextPrompts.Error.IO do
  defexception [:action, :path, :reason]

  @impl true
  def message(%{action: action, path: path, reason: reason}) do
    "failed to #{action} #{inspect(path)}: #{inspect(reason)}"
  end
end
