defmodule TextPrompts.Saver do
  @moduledoc false

  alias TextPrompts.Prompt

  @spec save_prompt(Path.t(), Prompt.t() | String.t(), keyword()) :: :ok | {:error, Exception.t()}
  def save_prompt(path, value, _opts \\ []) do
    body =
      case value do
        %Prompt{prompt: prompt} -> prompt
        str when is_binary(str) -> str
      end

    case File.write(path, body) do
      :ok ->
        :ok

      {:error, reason} ->
        {:error, TextPrompts.Error.IO.exception(reason: reason, action: "write", path: path)}
    end
  end
end
