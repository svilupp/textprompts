defmodule TextPrompts.PromptString do
  @moduledoc """
  Safe prompt formatting with placeholder validation.

  A `PromptString` wraps a raw template string and the set of placeholder
  names found in it. Placeholders are written `{name}` where `name` matches
  `[a-zA-Z_][a-zA-Z0-9_]*`.

  ## Examples

      iex> ps = TextPrompts.PromptString.new("Hello {name}")
      iex> {:ok, rendered} = TextPrompts.PromptString.format(ps, name: "Ada")
      iex> rendered
      "Hello Ada"

  Substitution is single-pass: a placeholder value containing another
  `{token}` is *not* re-substituted on a later pass.

      iex> ps = TextPrompts.PromptString.new("{a}{b}")
      iex> TextPrompts.PromptString.format!(ps, a: "{b}", b: "x")
      "{b}x"
  """

  alias TextPrompts.Error.Format

  defstruct [:raw, placeholders: MapSet.new()]

  @type t :: %__MODULE__{raw: String.t(), placeholders: MapSet.t(String.t())}

  @placeholder_re ~r/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/u

  @doc """
  Build a `PromptString` from a raw template, eagerly extracting placeholder
  names.
  """
  @spec new(String.t()) :: t()
  def new(raw) when is_binary(raw) do
    placeholders =
      @placeholder_re
      |> Regex.scan(raw, capture: :all_but_first)
      |> List.flatten()
      |> MapSet.new()

    %__MODULE__{raw: raw, placeholders: placeholders}
  end

  @doc """
  Format the template with the given bindings.

  ## Options

    * `:strict` (boolean, default `true`) — when `true`, returns
      `{:error, %TextPrompts.Error.Format{}}` if any placeholder in the
      template is missing from `bindings`. When `false`, missing
      placeholders are left as-is in the output.

  Extra keys in `bindings` that are not referenced by the template are
  silently ignored, matching Python's `validate_format_args` semantics.

  Substitution is performed in a single regex pass, so a value that itself
  contains `{token}` text will not be re-substituted.
  """
  @spec format(t(), map() | keyword(), keyword()) :: {:ok, String.t()} | {:error, Exception.t()}
  def format(%__MODULE__{} = ps, bindings, opts \\ []) do
    opts = Keyword.validate!(opts, strict: true)
    binding_map = Enum.into(bindings, %{}, fn {k, v} -> {to_string(k), v} end)
    strict? = Keyword.fetch!(opts, :strict)

    missing =
      ps.placeholders
      |> MapSet.difference(MapSet.new(Map.keys(binding_map)))
      |> MapSet.to_list()

    if strict? and missing != [] do
      {:error, Format.exception(missing_keys: Enum.sort(missing))}
    else
      rendered =
        Regex.replace(@placeholder_re, ps.raw, fn whole, key ->
          case Map.fetch(binding_map, key) do
            {:ok, value} -> to_string(value)
            :error -> whole
          end
        end)

      {:ok, rendered}
    end
  end

  @doc """
  Like `format/3` but raises on error.
  """
  @spec format!(t(), map() | keyword(), keyword()) :: String.t()
  def format!(ps, bindings, opts \\ []) do
    case format(ps, bindings, opts) do
      {:ok, rendered} -> rendered
      {:error, error} -> raise error
    end
  end
end

defimpl String.Chars, for: TextPrompts.PromptString do
  def to_string(ps), do: ps.raw
end

defimpl Inspect, for: TextPrompts.PromptString do
  import Inspect.Algebra

  def inspect(%TextPrompts.PromptString{raw: raw, placeholders: placeholders}, opts) do
    placeholder_list = placeholders |> MapSet.to_list() |> Enum.sort()

    concat([
      "#PromptString<",
      to_doc(raw, opts),
      ", placeholders: ",
      to_doc(placeholder_list, opts),
      ">"
    ])
  end
end

if Code.ensure_loaded?(Jason.Encoder) do
  defimpl Jason.Encoder, for: TextPrompts.PromptString do
    def encode(%TextPrompts.PromptString{raw: raw, placeholders: placeholders}, opts) do
      Jason.Encode.map(
        %{
          "raw" => raw,
          "placeholders" => placeholders |> MapSet.to_list() |> Enum.sort()
        },
        opts
      )
    end
  end
end
