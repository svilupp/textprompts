defmodule TextPrompts.Config do
  @moduledoc """
  Runtime configuration helpers for `TextPrompts`.

  The active metadata mode is resolved in priority order:

    1. The `:meta` keyword option passed to the calling function.
    2. The process-local override set via `with_metadata/2`.
    3. The application environment key `:text_prompts, :metadata_mode`.
    4. The default, `:allow`.
  """

  alias TextPrompts.MetadataMode

  @default :allow
  @process_key :text_prompts_metadata_mode
  @app_key :text_prompts

  @doc """
  Resolves the metadata mode that should govern the current call.

  ## Options

    * `:meta` — explicit override (atom or string). Takes precedence over
      every other source.

  ## Examples

      iex> TextPrompts.Config.metadata_mode(meta: :strict)
      :strict

      iex> TextPrompts.Config.metadata_mode(meta: "Ignore")
      :ignore
  """
  @spec metadata_mode(keyword()) :: MetadataMode.t()
  def metadata_mode(opts \\ []) do
    opts = Keyword.validate!(opts, meta: nil)

    with nil <- opts[:meta],
         nil <- Process.get(@process_key),
         nil <- Application.get_env(@app_key, :metadata_mode) do
      @default
    else
      mode -> MetadataMode.cast!(mode)
    end
  end

  @doc """
  Runs `fun` with `mode` set as the process-local metadata mode, restoring
  any previous value (including the absence of one) on exit.

  ## Examples

      iex> TextPrompts.Config.with_metadata(:strict, fn ->
      ...>   TextPrompts.Config.metadata_mode()
      ...> end)
      :strict

      iex> TextPrompts.Config.with_metadata(:ignore, fn -> :ok end)
      iex> TextPrompts.Config.metadata_mode()
      :allow
  """
  @spec with_metadata(term(), (-> result)) :: result when result: var
  def with_metadata(mode, fun) when is_function(fun, 0) do
    mode = MetadataMode.cast!(mode)
    prev = Process.get(@process_key)
    Process.put(@process_key, mode)

    try do
      fun.()
    after
      if prev == nil,
        do: Process.delete(@process_key),
        else: Process.put(@process_key, prev)
    end
  end
end
