defmodule TextPrompts.Error.InvalidMetadata do
  @moduledoc """
  Raised when a frontmatter block is present but cannot be turned into a
  valid `TextPrompts.PromptMeta`.

  Fields:

    * `:path` — the prompt file path being loaded (when known).
    * `:field` — the offending field, when the violation is field-scoped.
    * `:reason` — a human-readable description of what went wrong, or the
      underlying parser error.
  """

  @type t :: %__MODULE__{
          path: Path.t() | nil,
          field: atom() | String.t() | nil,
          reason: term()
        }

  defexception [:path, :field, :reason]

  @impl true
  def message(%{path: path, field: nil, reason: reason}) do
    "invalid frontmatter in #{inspect(path)}: #{format_reason(reason)}"
  end

  def message(%{path: path, field: field, reason: reason}) do
    "invalid frontmatter field #{inspect(field)} in #{inspect(path)}: #{format_reason(reason)}"
  end

  defp format_reason(reason) when is_binary(reason), do: reason
  defp format_reason(reason), do: inspect(reason)
end
