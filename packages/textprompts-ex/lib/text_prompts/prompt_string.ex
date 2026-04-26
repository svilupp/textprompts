defmodule TextPrompts.PromptString do
  @moduledoc """
  Safe prompt formatting with placeholder validation.
  """

  alias TextPrompts.Error.Format

  defstruct [:raw, placeholders: MapSet.new()]

  @type t :: %__MODULE__{raw: String.t(), placeholders: MapSet.t(String.t())}

  @placeholder_re ~r/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/u

  @spec new(String.t()) :: t()
  def new(raw) when is_binary(raw) do
    placeholders =
      Regex.scan(@placeholder_re, raw, capture: :all_but_first)
      |> List.flatten()
      |> MapSet.new()

    %__MODULE__{raw: raw, placeholders: placeholders}
  end

  @spec format(t(), map() | keyword(), keyword()) :: {:ok, String.t()} | {:error, Exception.t()}
  def format(%__MODULE__{} = ps, bindings, opts \\ []) do
    opts = Keyword.validate!(opts, strict: true)
    binding_map = Enum.into(bindings, %{}, fn {k, v} -> {to_string(k), v} end)

    missing =
      MapSet.difference(ps.placeholders, MapSet.new(Map.keys(binding_map))) |> MapSet.to_list()

    cond do
      opts[:strict] and missing != [] ->
        {:error, Format.exception(missing_keys: Enum.sort(missing))}

      true ->
        rendered =
          Enum.reduce(binding_map, ps.raw, fn {k, v}, acc ->
            String.replace(acc, "{#{k}}", to_string(v))
          end)

        {:ok, rendered}
    end
  end

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
