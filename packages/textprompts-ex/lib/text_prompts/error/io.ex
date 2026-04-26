defmodule TextPrompts.Error.IO do
  @moduledoc """
  Raised when an underlying file-system call fails (read or write).
  """

  @type t :: %__MODULE__{
          action: String.t() | nil,
          path: Path.t() | nil,
          reason: term()
        }

  defexception [:action, :path, :reason]

  @impl true
  def message(%{action: action, path: path, reason: reason}) do
    "failed to #{action} #{inspect(path)}: #{inspect(reason)}"
  end
end
