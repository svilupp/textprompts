defmodule TextPrompts.Sigil do
  @moduledoc """
  Provides the `~P` sigil for building `TextPrompts.PromptString` values.

  ## Usage

      use TextPrompts.Sigil

      ~P"Hello {name}"
      #=> %TextPrompts.PromptString{raw: "Hello {name}", placeholders: MapSet.new(["name"])}

  ## Modifiers

  By default the sigil is "permissive": missing placeholders left in a
  later `format/3` call return an `{:error, ...}` only when `strict: true`
  is passed at format time.

  Pass the `s` modifier to mark the resulting prompt string as strict —
  this currently has no effect on the struct itself (the struct is
  format-mode agnostic), but is reserved for future compile-time
  metadata. The sigil simply returns a `PromptString`.
  """

  defmacro __using__(_opts) do
    quote do
      import TextPrompts.Sigil, only: [sigil_P: 2]
    end
  end

  @doc """
  Build a `TextPrompts.PromptString` from the sigil body.

  When the body has no interpolation the result is computed at compile
  time.

  ## Modifiers

    * `s` — reserved for "strict" annotation; currently a no-op.
  """
  defmacro sigil_P({:<<>>, _meta, [raw]}, _modifiers) when is_binary(raw) do
    ps = TextPrompts.PromptString.new(raw)
    Macro.escape(ps)
  end
end
