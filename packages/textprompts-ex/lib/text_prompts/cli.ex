defmodule TextPrompts.CLI do
  @moduledoc """
  Command-line interface for TextPrompts. Built as an escript via
  `mix escript.build`, and surfaced as `mix textprompts.*` tasks.

  ## Subcommands

      textprompts show <path> [--meta] [--json] [--mode strict|allow|ignore]
      textprompts validate <path> [--mode strict|allow|ignore]
      textprompts list <dir> [--json] [--mode strict|allow|ignore]

  ## Exit codes

    * `0` — success
    * `1` — user error (bad path, bad metadata)
    * `2` — internal error / unknown subcommand
  """

  alias TextPrompts.{Loader, PromptMeta}

  @type opts :: [
          io: pid(),
          err_io: pid() | atom(),
          exit_fun: (non_neg_integer() -> any())
        ]

  @doc """
  Entrypoint. Accepts argv and an optional keyword list (mainly for tests).

  ## Options

    * `:io` — IO device for stdout (default `:stdio`).
    * `:err_io` — IO device for stderr (default `:stderr`).
    * `:exit_fun` — `1`-arity function called with the exit code (default
      `&System.halt/1`). Tests can pass `&throw({:exit, &1})` to avoid halting.
  """
  @spec main([String.t()], opts()) :: any()
  def main(argv, opts \\ []) do
    io = Keyword.get(opts, :io, :stdio)
    err_io = Keyword.get(opts, :err_io, :stderr)
    exit_fun = Keyword.get(opts, :exit_fun, &System.halt/1)

    ctx = %{io: io, err_io: err_io, exit_fun: exit_fun}

    case argv do
      [] ->
        print_help_and_exit(ctx, 2)

      ["--help"] ->
        print_help_and_exit(ctx, 0)

      ["-h"] ->
        print_help_and_exit(ctx, 0)

      ["help"] ->
        print_help_and_exit(ctx, 0)

      ["show" | rest] ->
        run_show(rest, ctx)

      ["validate" | rest] ->
        run_validate(rest, ctx)

      ["list" | rest] ->
        run_list(rest, ctx)

      [other | _] ->
        IO.puts(err_io, "textprompts: unknown subcommand: #{other}")
        IO.puts(err_io, usage_text())
        exit_fun.(2)
    end
  end

  # ---------------------------------------------------------------------------
  # show
  # ---------------------------------------------------------------------------

  @show_switches [meta: :boolean, json: :boolean, mode: :string, help: :boolean]
  @show_aliases [h: :help]

  defp run_show(args, ctx) do
    case OptionParser.parse(args, strict: @show_switches, aliases: @show_aliases) do
      {_opts, _, [_ | _] = invalid} ->
        bad_options(ctx, "show", invalid)

      {[help: true], _, _} ->
        IO.puts(ctx.io, show_help())
        ctx.exit_fun.(0)

      {opts, [path], []} ->
        do_show(path, opts, ctx)

      {_, [], _} ->
        IO.puts(ctx.err_io, "textprompts show: missing <path>")
        IO.puts(ctx.err_io, show_help())
        ctx.exit_fun.(1)

      {_, [_ | _] = positional, _} ->
        IO.puts(
          ctx.err_io,
          "textprompts show: too many positional arguments: #{Enum.join(positional, " ")}"
        )

        IO.puts(ctx.err_io, show_help())
        ctx.exit_fun.(1)
    end
  end

  defp do_show(path, opts, ctx) do
    load_opts = mode_load_opts(opts[:mode])

    case Loader.load(path, load_opts) do
      {:error, error} ->
        IO.puts(ctx.err_io, "textprompts: #{Exception.message(error)}")
        ctx.exit_fun.(1)

      {:ok, prompt} ->
        cond do
          opts[:json] ->
            IO.puts(ctx.io, encode_json!(prompt_to_payload(prompt, !!opts[:meta])))
            ctx.exit_fun.(0)

          opts[:meta] ->
            IO.puts(ctx.io, render_meta_text(prompt.meta))
            ctx.exit_fun.(0)

          true ->
            IO.write(ctx.io, prompt.prompt)

            unless String.ends_with?(prompt.prompt, "\n") do
              IO.write(ctx.io, "\n")
            end

            ctx.exit_fun.(0)
        end
    end
  end

  # ---------------------------------------------------------------------------
  # validate
  # ---------------------------------------------------------------------------

  @validate_switches [mode: :string, help: :boolean]
  @validate_aliases [h: :help]

  defp run_validate(args, ctx) do
    case OptionParser.parse(args, strict: @validate_switches, aliases: @validate_aliases) do
      {_opts, _, [_ | _] = invalid} ->
        bad_options(ctx, "validate", invalid)

      {[help: true], _, _} ->
        IO.puts(ctx.io, validate_help())
        ctx.exit_fun.(0)

      {opts, [path], []} ->
        do_validate(path, opts, ctx)

      {_, [], _} ->
        IO.puts(ctx.err_io, "textprompts validate: missing <path>")
        IO.puts(ctx.err_io, validate_help())
        ctx.exit_fun.(1)

      {_, [_ | _] = positional, _} ->
        IO.puts(
          ctx.err_io,
          "textprompts validate: too many positional arguments: #{Enum.join(positional, " ")}"
        )

        IO.puts(ctx.err_io, validate_help())
        ctx.exit_fun.(1)
    end
  end

  defp do_validate(path, opts, ctx) do
    load_opts = mode_load_opts(opts[:mode])

    case Loader.load(path, load_opts) do
      {:ok, _prompt} ->
        IO.puts(ctx.io, "OK #{path}")
        ctx.exit_fun.(0)

      {:error, error} ->
        IO.puts(ctx.err_io, "FAIL #{path}: #{Exception.message(error)}")
        ctx.exit_fun.(1)
    end
  end

  # ---------------------------------------------------------------------------
  # list
  # ---------------------------------------------------------------------------

  @list_switches [json: :boolean, mode: :string, help: :boolean]
  @list_aliases [h: :help]

  defp run_list(args, ctx) do
    case OptionParser.parse(args, strict: @list_switches, aliases: @list_aliases) do
      {_opts, _, [_ | _] = invalid} ->
        bad_options(ctx, "list", invalid)

      {[help: true], _, _} ->
        IO.puts(ctx.io, list_help())
        ctx.exit_fun.(0)

      {opts, [dir], []} ->
        do_list(dir, opts, ctx)

      {_, [], _} ->
        IO.puts(ctx.err_io, "textprompts list: missing <dir>")
        IO.puts(ctx.err_io, list_help())
        ctx.exit_fun.(1)

      {_, [_ | _] = positional, _} ->
        IO.puts(
          ctx.err_io,
          "textprompts list: too many positional arguments: #{Enum.join(positional, " ")}"
        )

        IO.puts(ctx.err_io, list_help())
        ctx.exit_fun.(1)
    end
  end

  defp do_list(dir, opts, ctx) do
    case File.stat(dir) do
      {:error, reason} ->
        IO.puts(ctx.err_io, "textprompts list: cannot read #{dir}: #{:file.format_error(reason)}")
        ctx.exit_fun.(1)

      {:ok, %File.Stat{type: :regular}} ->
        # Allow a single file too.
        entries = list_entries([dir], opts)
        emit_list(entries, opts, ctx)

      {:ok, _} ->
        files =
          Path.wildcard(Path.join(dir, "**/*.{txt,md,prompt}"))
          |> Enum.sort()

        entries = list_entries(files, opts)
        emit_list(entries, opts, ctx)
    end
  end

  defp list_entries(paths, opts) do
    load_opts = mode_load_opts(opts[:mode])

    Enum.map(paths, fn path ->
      case Loader.load(path, load_opts) do
        {:ok, prompt} ->
          %{
            path: path,
            ok: true,
            title: prompt.meta.title,
            version: prompt.meta.version,
            description: prompt.meta.description,
            error: nil
          }

        {:error, error} ->
          %{
            path: path,
            ok: false,
            title: nil,
            version: nil,
            description: nil,
            error: Exception.message(error)
          }
      end
    end)
  end

  defp emit_list(entries, opts, ctx) do
    if opts[:json] do
      IO.puts(ctx.io, encode_json!(entries))
    else
      Enum.each(entries, fn e ->
        line =
          if e.ok do
            "#{e.path}\t#{e.title || ""}\t#{e.version || ""}"
          else
            "#{e.path}\tERROR\t#{e.error}"
          end

        IO.puts(ctx.io, line)
      end)
    end

    if Enum.any?(entries, &(not &1.ok)) do
      ctx.exit_fun.(1)
    else
      ctx.exit_fun.(0)
    end
  end

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp bad_options(ctx, sub, invalid) do
    rendered =
      Enum.map_join(invalid, ", ", fn
        {flag, nil} -> flag
        {flag, val} -> "#{flag}=#{val}"
      end)

    IO.puts(ctx.err_io, "textprompts #{sub}: invalid option(s): #{rendered}")
    IO.puts(ctx.err_io, usage_text())
    ctx.exit_fun.(1)
  end

  defp mode_load_opts(nil), do: []
  defp mode_load_opts(""), do: []

  defp mode_load_opts(mode) when is_binary(mode) do
    [meta: mode]
  end

  defp prompt_to_payload(prompt, meta_only?) do
    base = %{
      "path" => prompt.path,
      "meta" => meta_to_map(prompt.meta)
    }

    if meta_only?, do: base, else: Map.put(base, "prompt", prompt.prompt)
  end

  defp meta_to_map(%PromptMeta{} = meta) do
    %{
      "title" => meta.title,
      "version" => meta.version,
      "author" => meta.author,
      "created" => stringify(meta.created),
      "description" => meta.description,
      "extras" => meta.extras
    }
  end

  defp stringify(nil), do: nil
  defp stringify(%Date{} = d), do: Date.to_iso8601(d)
  defp stringify(other), do: other

  defp render_meta_text(%PromptMeta{} = meta) do
    [
      "title: #{meta.title || ""}",
      "version: #{meta.version || ""}",
      "author: #{meta.author || ""}",
      "created: #{stringify(meta.created) || ""}",
      "description: #{meta.description || ""}"
    ]
    |> maybe_append_extras(meta.extras)
    |> Enum.join("\n")
  end

  defp maybe_append_extras(lines, extras) when extras == %{} or is_nil(extras), do: lines

  defp maybe_append_extras(lines, extras) do
    extra_lines =
      extras
      |> Enum.sort_by(fn {k, _} -> to_string(k) end)
      |> Enum.map(fn {k, v} -> "#{k}: #{format_extra(v)}" end)

    lines ++ extra_lines
  end

  defp format_extra(v) when is_binary(v), do: v
  defp format_extra(v) when is_number(v), do: to_string(v)
  defp format_extra(v) when is_boolean(v), do: to_string(v)
  defp format_extra(nil), do: ""
  defp format_extra(v), do: inspect(v)

  defp encode_json!(term) do
    if Code.ensure_loaded?(Jason) do
      Jason.encode!(term, pretty: true)
    else
      raise "JSON output requires the optional :jason dependency"
    end
  end

  # ---------------------------------------------------------------------------
  # Help text
  # ---------------------------------------------------------------------------

  defp print_help_and_exit(ctx, code) do
    target = if code == 0, do: ctx.io, else: ctx.err_io
    IO.puts(target, usage_text())
    ctx.exit_fun.(code)
  end

  defp usage_text do
    """
    textprompts — load and inspect Markdown/TOML/YAML prompt files.

    Usage:
      textprompts show <path> [--meta] [--json] [--mode strict|allow|ignore]
      textprompts validate <path> [--mode strict|allow|ignore]
      textprompts list <dir> [--json] [--mode strict|allow|ignore]

    Global flags:
      -h, --help    Show this message.

    Exit codes:
      0  success
      1  user error (bad path, invalid metadata)
      2  internal error / unknown subcommand
    """
    |> String.trim_trailing()
  end

  defp show_help do
    """
    Usage: textprompts show <path> [--meta] [--json] [--mode strict|allow|ignore]

    Print a prompt's body. With --meta, print only its frontmatter.
    With --json, emit a JSON object including path, meta, and prompt body
    (or just path+meta when combined with --meta).
    """
    |> String.trim_trailing()
  end

  defp validate_help do
    """
    Usage: textprompts validate <path> [--mode strict|allow|ignore]

    Load <path> and exit 0 on success, 1 on failure. Errors are written to
    stderr.
    """
    |> String.trim_trailing()
  end

  defp list_help do
    """
    Usage: textprompts list <dir> [--json] [--mode strict|allow|ignore]

    Recursively scan <dir> for *.txt, *.md, and *.prompt files. Prints a
    tab-separated table (path, title, version) by default, or a JSON array
    with --json.
    """
    |> String.trim_trailing()
  end
end
