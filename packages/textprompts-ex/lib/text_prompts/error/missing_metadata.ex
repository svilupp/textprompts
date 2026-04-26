defmodule TextPrompts.Error.MissingMetadata do
  @moduledoc """
  Raised in `:strict` metadata mode when a prompt file lacks frontmatter or
  is missing a required field (`title`, `version`, `author`, ...).

  Fields:

    * `:path` — the prompt file path being loaded (when known).
    * `:field` — the specific required field that was absent. `nil` indicates
      the entire frontmatter block is missing.
  """

  @type t :: %__MODULE__{
          path: Path.t() | nil,
          field: atom() | String.t() | nil
        }

  defexception [:path, :field]

  @impl true
  def message(%{path: path, field: nil}) do
    "missing frontmatter in #{inspect(path)}"
  end

  def message(%{path: path, field: field}) do
    "missing required metadata field #{inspect(field)} in #{inspect(path)}"
  end
end
