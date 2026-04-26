defmodule TextPrompts.Error.Format do
  @moduledoc """
  Raised when `TextPrompts.PromptString` cannot satisfy a strict format call.

  The `:missing_keys` field lists the placeholder names that were required but
  not provided in `bindings`.
  """

  @type t :: %__MODULE__{missing_keys: [String.t()]}

  defexception missing_keys: []

  @impl true
  def message(%{missing_keys: keys}), do: "missing format variables: #{inspect(keys)}"
end
