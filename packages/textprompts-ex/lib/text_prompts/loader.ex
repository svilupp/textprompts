defmodule TextPrompts.Loader do
  @moduledoc false

  alias TextPrompts.{Config, Frontmatter, Prompt, PromptMeta}
  alias TextPrompts.Error.FileMissing

  @spec load_prompt(Path.t(), keyword()) :: {:ok, Prompt.t()} | {:error, Exception.t()}
  def load_prompt(path, opts \\ []) do
    opts = Keyword.validate!(opts, meta: nil)

    with {:ok, content} <- read(path) do
      {meta_map, body} = Frontmatter.split(content)
      mode = Config.metadata_mode(opts)

      prompt =
        case mode do
          :ignore ->
            %Prompt{
              path: path,
              prompt: content,
              meta: PromptMeta.from_map(%{"title" => Path.basename(path, ".txt")})
            }

          _ ->
            %Prompt{path: path, prompt: body, meta: PromptMeta.from_map(meta_map)}
        end

      {:ok, prompt}
    end
  end

  defp read(path) do
    case File.read(path) do
      {:ok, content} ->
        {:ok, content}

      {:error, :enoent} ->
        {:error, FileMissing.exception(path: path)}

      {:error, reason} ->
        {:error, TextPrompts.Error.IO.exception(reason: reason, action: "read", path: path)}
    end
  end
end
