defmodule TextPrompts.Frontmatter.Parser do
  @moduledoc """
  Behaviour shared by concrete frontmatter parsers (TOML, YAML).

  Implementations return `{:ok, map}` with string keys; key promotion to
  `TextPrompts.PromptMeta` atoms is the caller's responsibility.
  """

  @callback format() :: :toml | :yaml
  @callback detect?(String.t()) :: boolean()
  @callback parse(String.t()) :: {:ok, map()} | {:error, Exception.t()}
end
