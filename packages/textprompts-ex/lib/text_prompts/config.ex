defmodule TextPrompts.Config do
  @moduledoc false

  alias TextPrompts.MetadataMode

  @default :allow

  @spec metadata_mode(keyword()) :: MetadataMode.t()
  def metadata_mode(opts \\ []) do
    opts = Keyword.validate!(opts, meta: nil)

    with nil <- opts[:meta],
         nil <- Process.get(:textprompts_metadata_mode),
         nil <- Application.get_env(:textprompts, :metadata_mode) do
      @default
    else
      mode -> MetadataMode.cast!(mode)
    end
  end

  @spec with_metadata(MetadataMode.t(), (-> result)) :: result when result: var
  def with_metadata(mode, fun) when is_function(fun, 0) do
    mode = MetadataMode.cast!(mode)
    prev = Process.get(:textprompts_metadata_mode)
    Process.put(:textprompts_metadata_mode, mode)

    try do
      fun.()
    after
      if prev == nil,
        do: Process.delete(:textprompts_metadata_mode),
        else: Process.put(:textprompts_metadata_mode, prev)
    end
  end
end
