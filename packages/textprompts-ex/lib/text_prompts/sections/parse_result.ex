defmodule TextPrompts.Sections.ParseResult do
  defstruct headings: []

  @type heading :: %{level: pos_integer(), title: String.t(), slug: String.t()}
  @type t :: %__MODULE__{headings: [heading()]}
end
