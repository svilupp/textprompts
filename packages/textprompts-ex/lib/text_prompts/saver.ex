defmodule TextPrompts.Saver do
  @moduledoc """
  Serialize a `TextPrompts.Prompt` (or a raw body string) back to disk
  with a TOML or YAML frontmatter block.

  ## Format selection

  Resolved in this order:

    1. Explicit `:format` option (`:toml` or `:yaml`).
    2. Inferred from the destination extension — `.yml` and `.yaml`
       both resolve to `:yaml`. Any other extension defaults to `:toml`.

  ## Emission scope

  Both emitters are tiny, hand-rolled, and intentionally limited to the
  shape `TextPrompts.PromptMeta` actually produces:

    * scalar values: `String.t()`, `integer()`, `float()`,
      `boolean()`, `nil` (YAML only — TOML has no null and these
      keys are omitted),
    * lists of those scalars,
    * the `extras` map is flattened into top-level keys (matching
      Python's saver).

  Nested maps and other complex shapes are not emitted: such values are
  silently skipped for TOML, and round-tripped via `inspect/1` for YAML
  only when the value is a plain map of scalars. Anything more complex
  belongs outside this minimal saver.

  ## Telemetry

    * `[:text_prompts, :save, :start | :stop | :exception]` — same
      shape as the loader events, with `metadata.format` recording the
      resolved frontmatter format.
  """

  alias TextPrompts.{Prompt, PromptMeta}

  @doc """
  Save `value` to `path`. `value` may be a `%TextPrompts.Prompt{}` or a
  bare string (in which case the file is written without frontmatter).

  ## Options

    * `:format` — `:toml` (default for non-YAML extensions) or `:yaml`.

  ## Examples

      iex> path = Path.join(System.tmp_dir!(), "tp_saver_doc.md")
      iex> :ok = TextPrompts.Saver.save(path, "body\\n")
      iex> body = File.read!(path)
      iex> File.rm!(path)
      iex> body
      "body\\n"
  """
  @spec save(Path.t(), Prompt.t() | String.t(), keyword()) ::
          :ok | {:error, Exception.t()}
  def save(path, value, opts \\ []) do
    opts = Keyword.validate!(opts, format: nil)
    format = resolve_format(path, opts[:format])
    start_meta = %{path: path, format: format}

    :telemetry.span(
      [:text_prompts, :save],
      start_meta,
      fn ->
        result = do_save(path, value, format)
        {result, start_meta}
      end
    )
  end

  @doc "Like `save/3` but raises on error."
  @spec save!(Path.t(), Prompt.t() | String.t(), keyword()) :: :ok
  def save!(path, value, opts \\ []) do
    case save(path, value, opts) do
      :ok -> :ok
      {:error, error} -> raise error
    end
  end

  # Backwards-compatible aliases.
  @doc false
  def save_prompt(path, value, opts \\ []), do: save(path, value, opts)
  @doc false
  def save_prompt!(path, value, opts \\ []), do: save!(path, value, opts)

  # ---------------------------------------------------------------------------
  # Internals
  # ---------------------------------------------------------------------------

  defp resolve_format(_path, format) when format in [:toml, :yaml], do: format

  defp resolve_format(path, nil) do
    case path |> Path.extname() |> String.downcase() do
      ext when ext in [".yml", ".yaml"] -> :yaml
      _ -> :toml
    end
  end

  defp resolve_format(_path, other) do
    raise ArgumentError,
          "format must be :toml or :yaml, got #{inspect(other)}"
  end

  defp do_save(path, %Prompt{} = prompt, format) do
    body = render_prompt(prompt, format)
    write(path, body)
  end

  defp do_save(path, body, _format) when is_binary(body) do
    write(path, body)
  end

  defp do_save(_path, other, _format) do
    {:error,
     %ArgumentError{
       message: "expected a %TextPrompts.Prompt{} or string, got: #{inspect(other)}"
     }}
  end

  defp write(path, body) do
    case File.write(path, body) do
      :ok ->
        :ok

      {:error, reason} ->
        {:error, %TextPrompts.Error.IO{action: "write", path: path, reason: reason}}
    end
  end

  defp render_prompt(%Prompt{prompt: body, meta: meta}, format) do
    meta_map = meta_to_ordered_pairs(meta || %PromptMeta{})

    if meta_map == [] do
      to_string(body || "")
    else
      header = render_header(meta_map, format)

      [
        "---\n",
        header,
        "---\n\n",
        to_string(body || "")
      ]
      |> IO.iodata_to_binary()
    end
  end

  # Produces an ordered list of `{key_string, value}` so output is stable
  # for round-trip tests.
  defp meta_to_ordered_pairs(%PromptMeta{} = meta) do
    base =
      [
        {"title", meta.title},
        {"description", meta.description},
        {"version", meta.version},
        {"author", meta.author},
        {"created", meta.created}
      ]
      |> Enum.reject(fn {_k, v} -> is_nil(v) end)

    extras =
      (meta.extras || %{})
      |> Enum.map(fn {k, v} -> {to_string(k), v} end)
      |> Enum.sort_by(fn {k, _} -> k end)

    base ++ extras
  end

  # ---------------------------------------------------------------------------
  # TOML emitter
  # ---------------------------------------------------------------------------

  defp render_header(pairs, :toml) do
    pairs
    |> Enum.map(&toml_line/1)
    |> Enum.reject(&is_nil/1)
    |> Enum.map(&[&1, "\n"])
    |> IO.iodata_to_binary()
  end

  defp render_header(pairs, :yaml) do
    pairs
    |> Enum.map(&yaml_line/1)
    |> Enum.reject(&is_nil/1)
    |> Enum.map(&[&1, "\n"])
    |> IO.iodata_to_binary()
  end

  defp toml_line({key, value}) do
    case toml_scalar(value) do
      :skip -> nil
      formatted -> "#{key} = #{formatted}"
    end
  end

  defp toml_scalar(nil), do: :skip
  defp toml_scalar(true), do: "true"
  defp toml_scalar(false), do: "false"
  defp toml_scalar(value) when is_integer(value), do: Integer.to_string(value)
  defp toml_scalar(value) when is_float(value), do: Float.to_string(value)

  defp toml_scalar(value) when is_binary(value) do
    "\"#{escape_toml(value)}\""
  end

  defp toml_scalar(%Date{} = date), do: "\"#{Date.to_iso8601(date)}\""
  defp toml_scalar(%DateTime{} = dt), do: "\"#{DateTime.to_iso8601(dt)}\""

  defp toml_scalar(list) when is_list(list) do
    if Enum.all?(list, &toml_primitive?/1) do
      items = Enum.map_join(list, ", ", &toml_scalar/1)
      "[#{items}]"
    else
      :skip
    end
  end

  defp toml_scalar(_), do: :skip

  defp toml_primitive?(value)
       when is_binary(value) or is_integer(value) or is_float(value) or is_boolean(value),
       do: true

  defp toml_primitive?(_), do: false

  defp escape_toml(text) do
    text
    |> String.replace("\\", "\\\\")
    |> String.replace("\"", "\\\"")
    |> String.replace("\n", "\\n")
    |> String.replace("\r", "\\r")
    |> String.replace("\t", "\\t")
  end

  # ---------------------------------------------------------------------------
  # YAML emitter
  # ---------------------------------------------------------------------------

  defp yaml_line({key, value}) do
    case yaml_value(value) do
      :skip -> nil
      formatted -> "#{key}: #{formatted}"
    end
  end

  defp yaml_value(nil), do: "null"
  defp yaml_value(true), do: "true"
  defp yaml_value(false), do: "false"
  defp yaml_value(value) when is_integer(value), do: Integer.to_string(value)
  defp yaml_value(value) when is_float(value), do: Float.to_string(value)
  defp yaml_value(%Date{} = d), do: quote_yaml_string(Date.to_iso8601(d))
  defp yaml_value(%DateTime{} = dt), do: quote_yaml_string(DateTime.to_iso8601(dt))
  defp yaml_value(value) when is_binary(value), do: quote_yaml_string(value)

  defp yaml_value(list) when is_list(list) do
    if Enum.all?(list, &yaml_primitive?/1) do
      items = Enum.map_join(list, ", ", &yaml_value/1)
      "[#{items}]"
    else
      :skip
    end
  end

  defp yaml_value(_), do: :skip

  defp yaml_primitive?(value)
       when is_binary(value) or is_integer(value) or is_float(value) or is_boolean(value) or
              is_nil(value),
       do: true

  defp yaml_primitive?(_), do: false

  # Always emit YAML strings as double-quoted to keep the emitter
  # bullet-proof for the bounded metadata shape.
  defp quote_yaml_string(text) do
    escaped =
      text
      |> String.replace("\\", "\\\\")
      |> String.replace("\"", "\\\"")
      |> String.replace("\n", "\\n")
      |> String.replace("\r", "\\r")
      |> String.replace("\t", "\\t")

    "\"#{escaped}\""
  end
end
