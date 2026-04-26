defmodule TextPrompts.Error.MalformedHeader do
  @moduledoc """
  Raised when the `---` frontmatter delimiter opens but never closes, or when
  there is junk before the opening delimiter / between the closing delimiter
  and the body.

  Fields:

    * `:path` — the prompt file path being loaded (when known).
    * `:reason` — short description of the structural problem.
  """

  @type t :: %__MODULE__{
          path: Path.t() | nil,
          reason: term()
        }

  defexception [:path, :reason]

  @impl true
  def message(%{path: nil, reason: reason}) do
    "malformed frontmatter header: #{format_reason(reason)}"
  end

  def message(%{path: path, reason: reason}) do
    "malformed frontmatter header in #{inspect(path)}: #{format_reason(reason)}"
  end

  defp format_reason(nil), do: "unspecified reason"
  defp format_reason(reason) when is_binary(reason), do: reason
  defp format_reason(reason), do: inspect(reason)
end
