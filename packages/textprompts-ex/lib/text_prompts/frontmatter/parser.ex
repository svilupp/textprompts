defmodule TextPrompts.Frontmatter.Parser do
  @callback detect?(String.t()) :: boolean()
  @callback parse(String.t()) :: {:ok, map()} | {:error, Exception.t()}
end
