defmodule TextPrompts.Prompt do
  @moduledoc "Prompt container with metadata and body content."

  alias TextPrompts.PromptMeta

  defstruct [:path, :prompt, :meta]

  @type t :: %__MODULE__{
          path: Path.t() | nil,
          prompt: String.t(),
          meta: PromptMeta.t()
        }
end
