defmodule TextPrompts.Error.Format do
  defexception [:missing_keys]

  @impl true
  def message(%{missing_keys: keys}), do: "missing format variables: #{inspect(keys)}"
end
