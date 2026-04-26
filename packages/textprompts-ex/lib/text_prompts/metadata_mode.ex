defmodule TextPrompts.MetadataMode do
  @moduledoc """
  Helpers for validating and casting metadata-mode values.

  A metadata mode controls how `TextPrompts.Loader` reacts to frontmatter:

    * `:strict` — frontmatter is required; required fields must be present.
    * `:allow`  — frontmatter is parsed when present, ignored when absent.
    * `:ignore` — frontmatter is stripped from the body and never parsed.
  """

  alias TextPrompts.Error.InvalidMetadataMode

  @type t :: :strict | :allow | :ignore

  @valid [:strict, :allow, :ignore]

  @doc """
  Returns `true` when `value` is one of the canonical mode atoms.

  Note: this only accepts the canonical atom form. Use `cast/1` to coerce
  strings.

  ## Examples

      iex> TextPrompts.MetadataMode.valid?(:strict)
      true

      iex> TextPrompts.MetadataMode.valid?("strict")
      false
  """
  @spec valid?(term()) :: boolean()
  def valid?(value), do: value in @valid

  @doc """
  Casts `value` to a metadata mode atom.

  Accepts the atoms `:strict`, `:allow`, `:ignore` and any case variant of
  the strings `"strict"`, `"allow"`, `"ignore"`. Anything else returns
  `{:error, %InvalidMetadataMode{}}`.
  """
  @spec cast(term()) :: {:ok, t()} | {:error, InvalidMetadataMode.t()}
  def cast(:strict), do: {:ok, :strict}
  def cast(:allow), do: {:ok, :allow}
  def cast(:ignore), do: {:ok, :ignore}

  def cast(value) when is_binary(value) do
    case String.downcase(value) do
      "strict" -> {:ok, :strict}
      "allow" -> {:ok, :allow}
      "ignore" -> {:ok, :ignore}
      _ -> {:error, InvalidMetadataMode.exception(value: value)}
    end
  end

  def cast(value), do: {:error, InvalidMetadataMode.exception(value: value)}

  @doc """
  Same as `cast/1` but raises `TextPrompts.Error.InvalidMetadataMode` on a
  miss.
  """
  @spec cast!(term()) :: t()
  def cast!(value) do
    case cast(value) do
      {:ok, mode} -> mode
      {:error, error} -> raise error
    end
  end
end
