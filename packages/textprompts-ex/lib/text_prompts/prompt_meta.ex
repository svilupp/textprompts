defmodule TextPrompts.PromptMeta do
  @moduledoc "Prompt metadata container."

  @enforce_keys []
  defstruct title: nil, version: nil, author: nil, created: nil, description: nil, extras: %{}

  @type t :: %__MODULE__{
          title: String.t() | nil,
          version: String.t() | nil,
          author: String.t() | nil,
          created: Date.t() | String.t() | nil,
          description: String.t() | nil,
          extras: %{optional(String.t()) => term()}
        }

  @spec from_map(map()) :: t()
  def from_map(map) do
    normalized = for {k, v} <- map, into: %{}, do: {to_string(k), v}

    %__MODULE__{
      title: normalized["title"],
      version: normalized["version"],
      author: normalized["author"],
      created: normalized["created"],
      description: normalized["description"],
      extras: Map.drop(normalized, ["title", "version", "author", "created", "description"])
    }
  end
end
