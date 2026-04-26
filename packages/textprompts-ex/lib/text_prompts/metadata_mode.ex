defmodule TextPrompts.MetadataMode do
  @moduledoc false

  @type t :: :strict | :allow | :ignore
  @valid [:strict, :allow, :ignore]

  @spec valid?(term()) :: boolean()
  def valid?(value), do: value in @valid

  @spec cast(term()) :: {:ok, t()} | {:error, ArgumentError.t()}
  def cast(value) when is_atom(value) and value in @valid, do: {:ok, value}

  def cast(value) when is_binary(value) do
    value
    |> String.downcase()
    |> String.to_existing_atom()
    |> cast()
  rescue
    ArgumentError -> {:error, ArgumentError.exception("invalid metadata mode: #{inspect(value)}")}
  end

  def cast(value),
    do: {:error, ArgumentError.exception("invalid metadata mode: #{inspect(value)}")}

  @spec cast!(term()) :: t()
  def cast!(value) do
    case cast(value) do
      {:ok, mode} -> mode
      {:error, error} -> raise error
    end
  end
end
