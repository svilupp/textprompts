defmodule TextPrompts.Error.InvalidMetadataMode do
  @moduledoc """
  Raised when an unknown value is supplied where a metadata mode is expected.

  Valid metadata modes are `:strict`, `:allow`, and `:ignore` (or their
  case-insensitive string equivalents).

  Fields:

    * `:value` — the offending input.
  """

  @type t :: %__MODULE__{value: term()}

  defexception [:value]

  @impl true
  def message(%{value: value}) do
    "invalid metadata mode: #{inspect(value)} (expected one of :strict, :allow, :ignore)"
  end
end
