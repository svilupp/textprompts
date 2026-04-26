defmodule TextPrompts.Error.FileMissing do
  @moduledoc """
  Raised when a prompt file cannot be located on disk.
  """

  @type t :: %__MODULE__{path: Path.t() | nil}

  defexception [:path]

  @impl true
  def message(%{path: path}), do: "prompt file not found: #{inspect(path)}"
end
