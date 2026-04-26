defmodule TextPrompts.CLI do
  @moduledoc false

  alias TextPrompts.Loader

  def main(["show", path]) do
    case Loader.load_prompt(path) do
      {:ok, prompt} ->
        IO.puts(prompt.prompt)
        :ok

      {:error, error} ->
        IO.puts(:stderr, Exception.message(error))
        System.halt(1)
    end
  end

  def main(_args) do
    IO.puts("usage: textprompts show <path>")
  end
end
