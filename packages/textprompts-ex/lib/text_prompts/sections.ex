defmodule TextPrompts.Sections do
  @moduledoc """
  Parse Markdown / XML-tagged prompt documents into a structured
  `TextPrompts.Sections.ParseResult`.

  ## Algorithm overview

    1. Detect a leading frontmatter block (`---…---` or `+++…+++`) and
       record it as a `TextPrompts.Sections.FrontmatterBlock` (with
       title extracted from `title:` / `name:`). The block is excluded
       from section parsing.
    2. Walk the body line-by-line, tracking 1-based line numbers and
       fenced-code-block state (` ``` ` and `~~~`). Lines inside an
       active fence are skipped for tokenisation.
    3. Tokenise:
         * Markdown headings — `^\#{1,6}\\s+TEXT(\\s\\{#anchor\\})?$`,
           with optional trailing closing-hash trim.
         * XML-style start tags `<tag …>` and end tags `</tag>`. Tags
           are paired in a first pass and their start/end line indexes
           used to dispatch in the main pass. `<a id="…">` and HTML
           comments `<!-- @id:foo -->` are treated as standalone
           anchor declarations and attach to the next section.
    4. Emit a `Section` per heading or open tag, with `parent_idx` set
       from the active stack and `level` computed from the heading
       level (Markdown) or parent depth (XML).
    5. After parsing, finalise each section's `char_count` and
       collected `links` over its content window (excluding nested
       child windows).
    6. Anchor ids are generated via `generate_slug/1`. When generated
       ids collide they get an `_2`, `_3`, … suffix; explicit ids
       collide into `duplicate_anchors`.

  Output is byte-for-byte equivalent to the Python, Go, TypeScript and
  Julia ports — tested against the shared fixtures in
  `testdata/sections/cases.json`.

  ## Public helpers

    * `parse_sections/1` — main entry point.
    * `generate_slug/1` and `normalize_anchor_id/1` — slug helpers.
    * `get_section_text/2` — fetch body text for a section by id.
    * `render_toc/2` — render a Markdown TOC string.
    * `inject_anchors/1` — rewrite a document with explicit anchors
      before Markdown headings.
    * `load_section/3` — `Loader.load!/2` + `get_section_text/2` in
      one call.

  ## Anchor rules

  Anchor ids are lowercase, ASCII alphanumeric, with `_` separators
  (no leading/trailing `_`). Empty input becomes `"section"`. Whitespace
  and punctuation runs collapse into a single `_`.
  """

  alias TextPrompts.Sections.{FrontmatterBlock, Link, ParseResult, Section}

  @kind_preamble "preamble"
  @kind_markdown "markdown"
  @kind_xml "xml"

  @re_heading ~r/^\s{0,3}(\#{1,6})[ \t]+(.+?)\s*$/u
  @re_attr_id ~r/\s+\{#([a-zA-Z0-9._-]+)\}\s*$/u
  @re_xml_comment ~r/^\s*<!--\s*@id:([a-zA-Z0-9._-]+)\s*-->\s*$/u
  @re_open_tag ~r/^\s*<([A-Za-z][A-Za-z0-9:._-]*)([^>]*)>/u
  @re_tag_attr ~r/([A-Za-z_:][A-Za-z0-9:._-]*)\s*=\s*("([^"]*)"|'([^']*)')/u
  @re_markdown_link ~r/\[([^\]]*)\]\(([^)]+)\)/u
  @re_md_formatting ~r/[*_~`]/u
  @re_link_inline ~r/\[([^\]]*)\]\([^)]+\)/u
  @re_html_tag ~r/<\/?[^>]+>/u
  @re_identifier_parts ~r/[-_:]|\s+/u

  ## ──────────────────────────────────────────────────────────────
  ## Public API
  ## ──────────────────────────────────────────────────────────────

  @doc """
  Parse a Markdown / XML prompt document into a `ParseResult`.

  ## Examples

      iex> result = TextPrompts.Sections.parse_sections("# Intro\\nbody\\n")
      iex> length(result.sections)
      1
      iex> hd(result.sections).anchor_id
      "intro"
  """
  @spec parse_sections(binary()) :: ParseResult.t()
  def parse_sections(text) when is_binary(text) do
    lines = String.split(text, "\n")
    lines_tup = List.to_tuple(lines)
    line_count = tuple_size(lines_tup)

    {fm_end, fm_block} = detect_frontmatter(lines_tup, line_count)
    body_start_line = max(fm_end + 1, 1)

    total_chars =
      compute_window_char_count(
        lines_tup,
        line_count,
        body_start_line,
        0,
        line_count,
        line_end_col(lines_tup, line_count, line_count)
      )

    result0 = %ParseResult{
      sections: [],
      anchors: %{},
      duplicate_anchors: %{},
      frontmatter: fm_block,
      total_chars: total_chars
    }

    {xml_blocks, unclosed_xml} = collect_xml_blocks(lines_tup, line_count, body_start_line)
    {xml_starts, xml_ends} = index_xml_blocks(xml_blocks)

    state = %{
      result: result0,
      lines: lines_tup,
      line_count: line_count,
      stack: [],
      pending: nil,
      gap_start: body_start_line,
      fence: %{active: false, marker: "", count: 0},
      anchor_only_lines: MapSet.new(),
      used_anchor_ids: MapSet.new(),
      xml_starts: xml_starts,
      xml_ends: xml_ends,
      unclosed_xml: unclosed_xml
    }

    state =
      Enum.reduce((body_start_line - 1)..(line_count - 1)//1, state, fn idx, st ->
        if idx < 0, do: st, else: process_line(st, idx + 1)
      end)

    state = finalize_remaining_stack(state)

    sections_count = length(state.result.sections)

    state =
      cond do
        sections_count == 0 ->
          {res, _gs} =
            maybe_append_preamble(
              state.result,
              state.lines,
              state.line_count,
              body_start_line,
              state.line_count,
              state.anchor_only_lines
            )

          %{state | result: res}

        state.gap_start <= state.line_count ->
          {res, _gs} =
            maybe_append_preamble(
              state.result,
              state.lines,
              state.line_count,
              state.gap_start,
              state.line_count,
              state.anchor_only_lines
            )

          %{state | result: res}

        true ->
          state
      end

    state.result
  end

  @doc """
  Generate a slug for a heading, stripping markdown link / HTML /
  formatting noise before normalising.

  ## Examples

      iex> TextPrompts.Sections.generate_slug("**Hello**, World!")
      "hello_world"

      iex> TextPrompts.Sections.generate_slug("[Click](url) here")
      "click_here"
  """
  @spec generate_slug(binary()) :: binary()
  def generate_slug(heading) when is_binary(heading) do
    heading
    |> then(&Regex.replace(@re_link_inline, &1, "\\1"))
    |> then(&Regex.replace(@re_html_tag, &1, ""))
    |> then(&Regex.replace(@re_md_formatting, &1, ""))
    |> normalize_anchor_id()
  end

  @doc """
  Normalise any string into a stable anchor id (lowercase, ascii-alphanumeric
  with `_` separators, no leading/trailing `_`). Empty input becomes `"section"`.

  ## Examples

      iex> TextPrompts.Sections.normalize_anchor_id("Hello World")
      "hello_world"

      iex> TextPrompts.Sections.normalize_anchor_id("---")
      "section"
  """
  @spec normalize_anchor_id(binary()) :: binary()
  def normalize_anchor_id(value) when is_binary(value) do
    normalized =
      value
      |> String.downcase()
      |> to_charlist()
      |> normalize_chars([], false)
      |> strip_trailing_underscores()

    if normalized == "", do: "section", else: normalized
  end

  @doc """
  Locate a section by anchor id and return its body text.

  Returns `{text, true}` when found, `{nil, false}` otherwise. Markdown
  headings are excluded from the returned body; XML opening and
  closing tag lines are stripped.

  ## Examples

      iex> TextPrompts.Sections.get_section_text("# Intro\\nhi\\n", "intro")
      {"hi\\n", true}

      iex> TextPrompts.Sections.get_section_text("# Intro\\nhi\\n", "missing")
      {nil, false}
  """
  @spec get_section_text(binary(), binary()) :: {binary() | nil, boolean()}
  def get_section_text(text, anchor_id) when is_binary(text) and is_binary(anchor_id) do
    result = parse_sections(text)
    normalized_query = normalize_anchor_id(anchor_id)
    lines = String.split(text, "\n")

    Enum.find_value(result.sections, {nil, false}, fn section ->
      if section.anchor_id == anchor_id or
           normalize_anchor_id(section.anchor_id) == normalized_query do
        {slice_section_body(lines, section), true}
      end
    end)
  end

  @doc """
  Render a human-readable table of contents for a parsed result.

  Output begins with a header line of the form
  `"<path> (<chars> chars, <n> sections)"`, followed by one indented
  line per non-preamble section.

  ## Examples

      iex> result = TextPrompts.Sections.parse_sections("# Intro\\nhi\\n")
      iex> toc = TextPrompts.Sections.render_toc(result, "doc.md")
      iex> String.starts_with?(toc, "doc.md")
      true
  """
  @spec render_toc(ParseResult.t(), binary()) :: binary()
  def render_toc(%ParseResult{sections: []}, _path), do: ""

  def render_toc(%ParseResult{} = result, path) when is_binary(path) do
    sections = result.sections
    sections_tup = List.to_tuple(sections)
    renderable = Enum.count(sections, fn s -> s.kind != @kind_preamble end)

    header = "#{path} (#{result.total_chars} chars, #{renderable} sections)"

    body_lines =
      sections
      |> Enum.with_index()
      |> Enum.flat_map(fn {section, idx} ->
        if section.kind == @kind_preamble do
          []
        else
          indent = String.duplicate("  ", section_depth(sections_tup, idx))
          prefix = render_section_prefix(section)

          [
            "#{indent}#{prefix} #{section.heading} [##{section.anchor_id}] " <>
              "(L#{section.start_line}-L#{section.end_line}, #{section.char_count} chars)"
          ]
        end
      end)

    Enum.join([header | body_lines], "\n") <> "\n"
  end

  @doc """
  Idempotently insert `<a id="..."></a>` anchors before Markdown headings
  that lack an explicit anchor. Returns `{new_text, parse_result}`,
  where `parse_result` is `parse_sections/1` re-run on `new_text`.

  Headings that already have a `{#id}` attribute or are immediately
  preceded by a standalone anchor tag are left untouched.

  ## Examples

      iex> {out, _result} = TextPrompts.Sections.inject_anchors("# Hello\\n")
      iex> String.starts_with?(out, "<a id=\\"hello\\"></a>")
      true
  """
  @spec inject_anchors(binary()) :: {binary(), ParseResult.t()}
  def inject_anchors(text) when is_binary(text) do
    result = parse_sections(text)
    lines = String.split(text, "\n")

    new_lines =
      result.sections
      |> Enum.reverse()
      |> Enum.reduce(lines, fn section, acc ->
        if section.kind != @kind_markdown do
          acc
        else
          inject_anchor_for_section(acc, section)
        end
      end)

    output = Enum.join(new_lines, "\n")
    {output, parse_sections(output)}
  end

  @doc """
  Convenience: load a prompt file and return the body text for the
  named section, or `{:error, _}` if it can't be resolved.

  Forwards `opts` (notably `:meta`) to `TextPrompts.Loader.load/2`.
  Missing sections produce an `ArgumentError`.
  """
  @spec load_section(Path.t(), binary(), keyword()) ::
          {:ok, binary()} | {:error, Exception.t()}
  def load_section(path, anchor_id, opts \\ []) do
    case TextPrompts.Loader.load(path, opts) do
      {:ok, prompt} ->
        case get_section_text(prompt.prompt, anchor_id) do
          {nil, _} ->
            {:error, ArgumentError.exception("section #{inspect(anchor_id)} not found")}

          {body, true} ->
            {:ok, body}
        end

      {:error, _} = err ->
        err
    end
  end

  @doc """
  Like `load_section/3` but raises on error.
  """
  @spec load_section!(Path.t(), binary(), keyword()) :: binary()
  def load_section!(path, anchor_id, opts \\ []) do
    case load_section(path, anchor_id, opts) do
      {:ok, body} -> body
      {:error, error} -> raise error
    end
  end

  ## ──────────────────────────────────────────────────────────────
  ## Per-line dispatch
  ## ──────────────────────────────────────────────────────────────

  defp process_line(state, line_num) do
    line = trim_right_cr(elem(state.lines, line_num - 1))

    {fence_changed, new_fence} = update_fence_state(line, state.fence)

    cond do
      fence_changed ->
        %{state | fence: new_fence, pending: nil}

      new_fence.active ->
        %{state | fence: new_fence, pending: nil}

      true ->
        state = %{state | fence: new_fence}
        process_line_content(state, line, line_num)
    end
  end

  defp process_line_content(state, line, line_num) do
    case parse_standalone_anchor_tag(line) do
      {anchor_id, true} ->
        %{
          state
          | anchor_only_lines: MapSet.put(state.anchor_only_lines, line_num),
            pending: merge_pending_anchor(state.pending, anchor_id, line_num)
        }

      _ ->
        case extract_xml_comment_anchor(line) do
          "" ->
            process_line_no_anchor(state, line, line_num)

          anchor ->
            %{
              state
              | anchor_only_lines: MapSet.put(state.anchor_only_lines, line_num),
                pending: merge_pending_anchor(state.pending, anchor, line_num)
            }
        end
    end
  end

  defp process_line_no_anchor(state, line, line_num) do
    case Map.get(state.unclosed_xml, line_num) do
      nil ->
        process_line_main(state, line, line_num)

      token ->
        case explicit_anchor_from_attrs(token.attrs) do
          "" ->
            process_line_main(state, line, line_num)

          anchor ->
            %{
              state
              | anchor_only_lines: MapSet.put(state.anchor_only_lines, line_num),
                pending: merge_pending_anchor(state.pending, anchor, line_num)
            }
        end
    end
  end

  defp process_line_main(state, line, line_num) do
    state =
      if String.trim(line) == "" do
        %{state | pending: nil}
      else
        state
      end

    state = handle_xml_starts(state, line_num)
    state = handle_markdown_heading(state, line, line_num)
    handle_xml_ends(state, line_num)
  end

  defp handle_xml_starts(state, line_num) do
    case Map.get(state.xml_starts, line_num, []) do
      [] ->
        state

      start_blocks ->
        was_top_level = state.stack == []

        event_start_line =
          case state.pending do
            nil -> line_num
            %{start_line: sl} -> sl
          end

        state =
          if was_top_level do
            {res, gap_start} =
              maybe_append_preamble(
                state.result,
                state.lines,
                state.line_count,
                state.gap_start,
                event_start_line - 1,
                state.anchor_only_lines
              )

            %{state | result: res, gap_start: gap_start}
          else
            state
          end

        state =
          start_blocks
          |> Enum.with_index()
          |> Enum.reduce(state, fn {block, block_idx}, st ->
            apply_xml_start_block(st, block, block_idx)
          end)

        state = %{state | pending: nil}

        if was_top_level do
          %{state | gap_start: state.line_count + 1}
        else
          state
        end
    end
  end

  defp apply_xml_start_block(state, block, block_idx) do
    start_line =
      case state.pending do
        %{start_line: sl} when block_idx == 0 -> sl
        _ -> block.start_line
      end

    heading = derive_xml_heading(block.tag_name, block.attrs)
    parent_idx = parent_index(state.stack)
    level = derive_xml_level(state.result, parent_idx)

    explicit_id =
      case explicit_anchor_from_attrs(block.attrs) do
        "" -> normalize_anchor_id(block.tag_name)
        v -> v
      end

    {anchor_id, explicit} =
      resolve_section_anchor(heading, state.pending, explicit_id, state.used_anchor_ids)

    section = %Section{
      kind: @kind_xml,
      tag_name: block.tag_name,
      heading: heading,
      anchor_id: anchor_id,
      level: level,
      start_line: start_line,
      end_line: block.end_line,
      char_count: 0,
      parent_idx: parent_idx
    }

    {result, section_idx} = append_section(state.result, section)

    {result, used} =
      register_anchor(result, state.used_anchor_ids, anchor_id, section_idx, explicit)

    stack_entry = %{
      idx: section_idx,
      kind: @kind_xml,
      tag_name: block.tag_name,
      markdown_level: level,
      start_line: start_line,
      content_start_line: block.start_line,
      content_start_col: block.open_end_col,
      source_start_line: block.start_line
    }

    %{state | result: result, used_anchor_ids: used, stack: state.stack ++ [stack_entry]}
  end

  defp handle_markdown_heading(state, line, line_num) do
    case parse_markdown_heading(line) do
      :nomatch ->
        state

      {:ok, level, heading, attr_id} ->
        was_top_level = state.stack == []

        event_start_line =
          case state.pending do
            nil -> line_num
            %{start_line: sl} -> sl
          end

        state =
          if was_top_level do
            {res, gap_start} =
              maybe_append_preamble(
                state.result,
                state.lines,
                state.line_count,
                state.gap_start,
                event_start_line - 1,
                state.anchor_only_lines
              )

            %{state | result: res, gap_start: gap_start}
          else
            state
          end

        {result, stack} =
          close_markdown_sections(
            state.result,
            state.lines,
            state.line_count,
            state.stack,
            level,
            line_num - 1,
            line_end_col(state.lines, state.line_count, line_num - 1)
          )

        state = %{state | result: result, stack: stack}

        start_line =
          case state.pending do
            %{start_line: sl} -> sl
            _ -> line_num
          end

        parent_idx = parent_index(state.stack)

        {anchor_id, explicit} =
          resolve_section_anchor(heading, state.pending, attr_id, state.used_anchor_ids)

        section = %Section{
          kind: @kind_markdown,
          tag_name: "",
          heading: heading,
          anchor_id: anchor_id,
          level: level,
          start_line: start_line,
          end_line: line_num,
          char_count: 0,
          parent_idx: parent_idx
        }

        {result, section_idx} = append_section(state.result, section)

        {result, used} =
          register_anchor(result, state.used_anchor_ids, anchor_id, section_idx, explicit)

        stack_entry = %{
          idx: section_idx,
          kind: @kind_markdown,
          tag_name: "",
          markdown_level: level,
          start_line: start_line,
          content_start_line: line_num + 1,
          content_start_col: 0,
          source_start_line: line_num
        }

        state = %{
          state
          | result: result,
            used_anchor_ids: used,
            stack: state.stack ++ [stack_entry],
            pending: nil
        }

        if was_top_level do
          %{state | gap_start: state.line_count + 1}
        else
          state
        end
    end
  end

  defp handle_xml_ends(state, line_num) do
    case Map.get(state.xml_ends, line_num, []) do
      [] ->
        state

      end_blocks ->
        state =
          Enum.reduce(end_blocks, state, fn block, st ->
            {result, stack} =
              close_xml_block(st.result, st.lines, st.line_count, st.stack, block)

            %{st | result: result, stack: stack}
          end)

        if state.stack == [] do
          %{state | gap_start: line_num + 1}
        else
          state
        end
    end
  end

  defp finalize_remaining_stack(state) do
    Enum.reduce(Enum.reverse(state.stack), %{state | stack: []}, fn entry, st ->
      result =
        finalize_section(
          st.result,
          st.lines,
          st.line_count,
          entry,
          st.line_count,
          line_end_col(st.lines, st.line_count, st.line_count)
        )

      %{st | result: result}
    end)
  end

  ## ──────────────────────────────────────────────────────────────
  ## Frontmatter detection
  ## ──────────────────────────────────────────────────────────────

  defp detect_frontmatter(_lines, 0), do: {0, nil}

  defp detect_frontmatter(lines, line_count) do
    first = String.trim(elem(lines, 0))

    case first do
      "---" -> find_frontmatter_close(lines, line_count, "---", "yaml")
      "+++" -> find_frontmatter_close(lines, line_count, "+++", "toml")
      _ -> {0, nil}
    end
  end

  defp find_frontmatter_close(lines, line_count, delimiter, format) do
    Enum.reduce_while(1..(line_count - 1)//1, {0, nil}, fn idx, _acc ->
      if String.trim(elem(lines, idx)) == delimiter do
        raw = Enum.map_join(1..(idx - 1)//1, "\n", &elem(lines, &1))

        block = %FrontmatterBlock{
          raw: raw,
          format: format,
          start_line: 1,
          end_line: idx + 1,
          title: extract_frontmatter_title(raw, format)
        }

        {:halt, {idx + 1, block}}
      else
        {:cont, {0, nil}}
      end
    end)
  end

  defp extract_frontmatter_title(raw, format) do
    raw
    |> String.split("\n")
    |> Enum.find_value("", fn line ->
      stripped = String.trim(line)

      Enum.find_value(["title", "name"], fn key ->
        case format do
          "yaml" ->
            prefix = "#{key}:"

            if String.starts_with?(stripped, prefix) do
              stripped
              |> String.replace_prefix(prefix, "")
              |> String.trim()
              |> String.trim("\"")
              |> String.trim("'")
            end

          "toml" ->
            Enum.find_value(["#{key} =", "#{key}="], fn prefix ->
              if String.starts_with?(stripped, prefix) do
                stripped
                |> String.replace_prefix(prefix, "")
                |> String.trim()
                |> String.trim("\"")
                |> String.trim("'")
              end
            end)
        end
      end)
    end)
  end

  ## ──────────────────────────────────────────────────────────────
  ## XML block collection (first pass)
  ## ──────────────────────────────────────────────────────────────

  defp collect_xml_blocks(lines, line_count, body_start_line) do
    init = %{
      blocks: [],
      stack: [],
      unclosed: %{},
      fence: %{active: false, marker: "", count: 0}
    }

    final =
      Enum.reduce((body_start_line - 1)..(line_count - 1)//1, init, fn idx, st ->
        if idx < 0, do: st, else: collect_xml_blocks_step(st, lines, idx)
      end)

    blocks =
      final.blocks
      |> Enum.sort_by(fn b -> {b.start_line, -b.end_line, b.open_end_col} end)

    {blocks, final.unclosed}
  end

  defp collect_xml_blocks_step(st, lines, idx) do
    line = trim_right_cr(elem(lines, idx))
    line_num = idx + 1

    {fence_changed, new_fence} = update_fence_state(line, st.fence)
    st = %{st | fence: new_fence}

    cond do
      fence_changed -> st
      new_fence.active -> st
      elem(parse_standalone_anchor_tag(line), 1) -> st
      extract_xml_comment_anchor(line) != "" -> st
      true -> collect_xml_blocks_advance(st, line, line_num)
    end
  end

  defp collect_xml_blocks_advance(st, line, line_num) do
    st =
      case parse_xml_start_token(line, line_num) do
        {:ok, token} ->
          if token_is_anchor(token) or token_is_self_closing(token) do
            st
          else
            case find_closing_tag_start(line, token.tag_name, token.open_end_col) do
              {:ok, close_start} ->
                block = %{
                  tag_name: token.tag_name,
                  attrs: token.attrs,
                  start_line: token.start_line,
                  end_line: line_num,
                  open_end_col: token.open_end_col,
                  close_start_col: close_start
                }

                %{st | blocks: [block | st.blocks]}

              :not_found ->
                %{
                  st
                  | stack: st.stack ++ [token],
                    unclosed: Map.put(st.unclosed, token.start_line, token)
                }
            end
          end

        :nomatch ->
          st
      end

    drain_open_xml_stack(st, line, line_num, 0)
  end

  defp drain_open_xml_stack(st, line, line_num, search_from) do
    case st.stack do
      [] ->
        st

      _ ->
        top = List.last(st.stack)

        case find_closing_tag_start(line, top.tag_name, search_from) do
          :not_found ->
            st

          {:ok, close_start} ->
            block = %{
              tag_name: top.tag_name,
              attrs: top.attrs,
              start_line: top.start_line,
              end_line: line_num,
              open_end_col: top.open_end_col,
              close_start_col: close_start
            }

            new_stack = Enum.drop(st.stack, -1)
            new_unclosed = Map.delete(st.unclosed, top.start_line)

            drain_open_xml_stack(
              %{st | stack: new_stack, unclosed: new_unclosed, blocks: [block | st.blocks]},
              line,
              line_num,
              close_start + 1
            )
        end
    end
  end

  defp index_xml_blocks(blocks) do
    starts =
      Enum.reduce(blocks, %{}, fn b, acc ->
        Map.update(acc, b.start_line, [b], &(&1 ++ [b]))
      end)

    ends =
      Enum.reduce(blocks, %{}, fn b, acc ->
        Map.update(acc, b.end_line, [b], &(&1 ++ [b]))
      end)

    starts =
      Map.new(starts, fn {k, list} ->
        {k, Enum.sort_by(list, fn b -> {b.start_line, -b.end_line, b.open_end_col} end)}
      end)

    ends =
      Map.new(ends, fn {k, list} ->
        {k, Enum.sort_by(list, fn b -> {b.end_line, -b.start_line, b.close_start_col} end)}
      end)

    {starts, ends}
  end

  ## ──────────────────────────────────────────────────────────────
  ## Heading / tag parsing
  ## ──────────────────────────────────────────────────────────────

  defp parse_markdown_heading(line) do
    case Regex.run(@re_heading, trim_right_cr(line)) do
      nil ->
        :nomatch

      [_, hashes, raw_heading] ->
        level = String.length(hashes)
        heading = strip_closing_heading_hashes(String.trim(raw_heading))

        {heading, attr_id} =
          case Regex.run(@re_attr_id, heading) do
            nil ->
              {heading, ""}

            [_, anchor_id] ->
              new_heading = String.trim(Regex.replace(@re_attr_id, heading, ""))
              {new_heading, normalize_anchor_id(anchor_id)}
          end

        heading = if heading == "", do: "section", else: heading
        {:ok, level, heading, attr_id}
    end
  end

  defp strip_closing_heading_hashes(heading) do
    trimmed = String.trim(heading)

    case last_index_of(trimmed, " #") do
      -1 ->
        trimmed

      idx ->
        suffix = String.trim(binary_part(trimmed, idx, byte_size(trimmed) - idx))

        if suffix != "" and String.trim(suffix, "#") == "" do
          String.trim(binary_part(trimmed, 0, idx))
        else
          trimmed
        end
    end
  end

  defp last_index_of(string, needle) do
    case :binary.matches(string, needle) do
      [] -> -1
      matches -> matches |> List.last() |> elem(0)
    end
  end

  defp parse_xml_start_token(line, line_num) do
    trimmed = String.trim(line)

    if trimmed == "" or
         String.starts_with?(trimmed, "</") or
         String.starts_with?(trimmed, "<!") or
         String.starts_with?(trimmed, "<?") do
      :nomatch
    else
      case Regex.run(@re_open_tag, line, return: :index) do
        nil ->
          :nomatch

        [{full_off, full_len}, {tag_off, tag_len}, attr_capture] ->
          {attr_off, attr_len} = attr_capture
          full_end = full_off + full_len
          tag_name = binary_part(line, tag_off, tag_len)

          attr_text =
            if attr_len > 0, do: binary_part(line, attr_off, attr_len), else: ""

          attr_text_trimmed = String.trim(attr_text)
          self_closing = String.ends_with?(attr_text_trimmed, "/")

          attr_text_clean =
            if self_closing do
              attr_text_trimmed
              |> String.trim_trailing("/")
              |> String.trim()
            else
              attr_text
            end

          attrs = parse_tag_attributes(attr_text_clean)

          attrs =
            if self_closing,
              do: Map.put(attrs, "__self_closing__", "true"),
              else: attrs

          {:ok,
           %{
             tag_name: tag_name,
             attrs: attrs,
             start_line: line_num,
             open_end_col: full_end
           }}
      end
    end
  end

  defp token_is_anchor(token), do: String.downcase(token.tag_name) == "a"

  defp token_is_self_closing(token),
    do: Map.get(token.attrs, "__self_closing__") == "true"

  defp parse_standalone_anchor_tag(line) do
    case parse_xml_start_token(line, 1) do
      :nomatch ->
        {"", false}

      {:ok, token} ->
        if String.downcase(token.tag_name) != "a" do
          {"", false}
        else
          standalone_anchor_check(line, token)
        end
    end
  end

  defp standalone_anchor_check(line, token) do
    anchor_id = explicit_anchor_from_attrs(token.attrs)

    if anchor_id == "" do
      {"", false}
    else
      remainder =
        line
        |> binary_part(token.open_end_col, byte_size(line) - token.open_end_col)
        |> String.trim()

      if Map.get(token.attrs, "__self_closing__") == "true" do
        {anchor_id, remainder == ""}
      else
        case find_closing_tag_range(line, token.tag_name, token.open_end_col) do
          :not_found ->
            {"", false}

          {:ok, close_start, close_end} ->
            inner =
              line
              |> binary_part(token.open_end_col, close_start - token.open_end_col)
              |> String.trim()

            tail =
              line
              |> binary_part(close_end, byte_size(line) - close_end)
              |> String.trim()

            if inner == "" and tail == "" do
              {anchor_id, true}
            else
              {"", false}
            end
        end
      end
    end
  end

  defp parse_tag_attributes(attr_text) do
    @re_tag_attr
    |> Regex.scan(attr_text)
    |> Enum.reduce(%{}, fn match, acc ->
      [name, dq, sq] =
        case match do
          [_, name, _quoted, dq, sq] -> [name, dq, sq]
          [_, name, _quoted, dq] -> [name, dq, ""]
          [_, name, _quoted] -> [name, "", ""]
        end

      value = if dq != "", do: dq, else: sq
      Map.put(acc, String.downcase(name), value)
    end)
  end

  defp explicit_anchor_from_attrs(attrs) do
    Enum.find_value(["id", "name"], "", fn key ->
      val = String.trim(Map.get(attrs, key, ""))
      if val != "", do: normalize_anchor_id(val)
    end)
  end

  defp extract_xml_comment_anchor(line) do
    case Regex.run(@re_xml_comment, trim_right_cr(line)) do
      nil -> ""
      [_, id] -> normalize_anchor_id(id)
    end
  end

  ## ──────────────────────────────────────────────────────────────
  ## Section helpers
  ## ──────────────────────────────────────────────────────────────

  defp merge_pending_anchor(nil, anchor_id, line_num),
    do: %{id: anchor_id, start_line: line_num, end_line: line_num}

  defp merge_pending_anchor(existing, anchor_id, line_num),
    do: %{id: anchor_id, start_line: existing.start_line, end_line: line_num}

  defp resolve_section_anchor(heading, pending, explicit_id, used) do
    cond do
      pending != nil and pending.id != "" ->
        {pending.id, true}

      explicit_id != "" ->
        {explicit_id, true}

      true ->
        {unique_generated_anchor(generate_slug(heading), used), false}
    end
  end

  defp unique_generated_anchor(base, used) do
    base = if base == "", do: "section", else: base

    if MapSet.member?(used, base) do
      next_suffix(base, used, 2)
    else
      base
    end
  end

  defp next_suffix(base, used, n) do
    candidate = "#{base}_#{n}"
    if MapSet.member?(used, candidate), do: next_suffix(base, used, n + 1), else: candidate
  end

  defp register_anchor(result, used, "", _idx, _explicit), do: {result, used}

  defp register_anchor(result, used, anchor_id, section_idx, explicit) do
    cond do
      not explicit ->
        {%{result | anchors: Map.put(result.anchors, anchor_id, section_idx)},
         MapSet.put(used, anchor_id)}

      not MapSet.member?(used, anchor_id) ->
        {%{result | anchors: Map.put(result.anchors, anchor_id, section_idx)},
         MapSet.put(used, anchor_id)}

      true ->
        dup = result.duplicate_anchors

        dup =
          if Map.has_key?(dup, anchor_id) do
            Map.update!(dup, anchor_id, &(&1 ++ [section_idx]))
          else
            Map.put(dup, anchor_id, [Map.fetch!(result.anchors, anchor_id), section_idx])
          end

        {%{result | duplicate_anchors: dup}, used}
    end
  end

  defp append_section(result, %Section{} = section) do
    sections = result.sections
    idx = length(sections)

    sections =
      if section.parent_idx >= 0 do
        List.update_at(sections, section.parent_idx, fn %Section{} = parent ->
          %Section{parent | children: parent.children ++ [idx]}
        end)
      else
        sections
      end

    {%{result | sections: sections ++ [section]}, idx}
  end

  defp parent_index([]), do: -1
  defp parent_index(stack), do: List.last(stack).idx

  defp derive_xml_level(_result, parent_idx) when parent_idx < 0, do: 1

  defp derive_xml_level(result, parent_idx) do
    parent = Enum.at(result.sections, parent_idx)

    cond do
      parent == nil -> 1
      parent.level <= 0 -> 1
      true -> parent.level + 1
    end
  end

  defp derive_xml_heading(tag_name, attrs) do
    found =
      Enum.find_value(["heading", "title", "label", "name"], fn k ->
        v = String.trim(Map.get(attrs, k, ""))
        if v != "", do: v
      end)

    case found do
      nil ->
        case String.trim(Map.get(attrs, "id", "")) do
          "" -> humanize_identifier(tag_name)
          id -> humanize_identifier(id)
        end

      v ->
        v
    end
  end

  defp humanize_identifier(value) do
    stripped = String.trim(value)

    if stripped == "" do
      "Section"
    else
      parts =
        @re_identifier_parts
        |> Regex.split(stripped)
        |> Enum.reject(&(&1 == ""))

      if parts == [] do
        "Section"
      else
        Enum.map_join(parts, " ", fn part ->
          lower = String.downcase(part)

          case lower do
            "" ->
              ""

            <<first::utf8, rest::binary>> ->
              String.upcase(<<first::utf8>>) <> rest
          end
        end)
      end
    end
  end

  defp maybe_append_preamble(result, lines, line_count, start_line, end_line, skip_lines) do
    start_line = if start_line <= 0, do: 1, else: start_line

    cond do
      end_line < start_line ->
        {result, start_line}

      not window_has_content(lines, line_count, start_line, end_line, skip_lines) ->
        {result, end_line + 1}

      true ->
        {chars, links} =
          compute_window_stats_skipping_lines(
            lines,
            line_count,
            start_line,
            0,
            end_line,
            line_end_col(lines, line_count, end_line),
            skip_lines
          )

        section = %Section{
          kind: @kind_preamble,
          tag_name: "",
          heading: "",
          anchor_id: "",
          level: 0,
          start_line: start_line,
          end_line: end_line,
          char_count: chars,
          parent_idx: -1,
          links: links
        }

        {result, _idx} = append_section(result, section)
        {result, end_line + 1}
    end
  end

  defp close_markdown_sections(result, lines, line_count, stack, new_level, end_line, end_col) do
    case stack do
      [] ->
        {result, stack}

      _ ->
        top = List.last(stack)

        if top.kind != @kind_markdown or top.markdown_level < new_level do
          {result, stack}
        else
          result = finalize_section(result, lines, line_count, top, end_line, end_col)

          close_markdown_sections(
            result,
            lines,
            line_count,
            Enum.drop(stack, -1),
            new_level,
            end_line,
            end_col
          )
        end
    end
  end

  defp close_xml_block(result, lines, line_count, stack, block) do
    case stack do
      [] ->
        {result, stack}

      _ ->
        top = List.last(stack)

        result =
          finalize_section(
            result,
            lines,
            line_count,
            top,
            block.end_line,
            block.close_start_col
          )

        new_stack = Enum.drop(stack, -1)

        if top.kind == @kind_xml and top.source_start_line == block.start_line and
             top.tag_name == block.tag_name do
          {result, new_stack}
        else
          close_xml_block(result, lines, line_count, new_stack, block)
        end
    end
  end

  defp finalize_section(result, lines, line_count, state, end_line, end_col) do
    {chars, links} =
      compute_window_stats(
        lines,
        line_count,
        state.content_start_line,
        state.content_start_col,
        end_line,
        end_col
      )

    sections =
      List.update_at(result.sections, state.idx, fn %Section{} = section ->
        %Section{section | end_line: end_line, char_count: chars, links: links}
      end)

    %{result | sections: sections}
  end

  ## ──────────────────────────────────────────────────────────────
  ## Window / char counting
  ## ──────────────────────────────────────────────────────────────

  defp compute_window_stats(lines, line_count, start_line, start_col, end_line, end_col) do
    compute_window_stats_skipping_lines(
      lines,
      line_count,
      start_line,
      start_col,
      end_line,
      end_col,
      nil
    )
  end

  defp compute_window_stats_skipping_lines(
         lines,
         line_count,
         start_line,
         start_col,
         end_line,
         end_col,
         skip_lines
       ) do
    if valid_window?(line_count, start_line, end_line) do
      {segments, segment_lines} =
        Enum.reduce(start_line..end_line//1, {[], []}, fn line_num, {segs, slines} ->
          if skip_lines != nil and MapSet.member?(skip_lines, line_num) do
            {segs, slines}
          else
            seg =
              slice_window_line(lines, line_num, start_line, start_col, end_line, end_col)

            {[seg | segs], [line_num | slines]}
          end
        end)

      segments = Enum.reverse(segments)
      segment_lines = Enum.reverse(segment_lines)

      if segments == [] do
        {0, []}
      else
        seg_count = length(segments)

        chars =
          segments
          |> Enum.with_index()
          |> Enum.reduce(0, fn {seg, idx}, acc ->
            acc + byte_size(seg) + if(idx < seg_count - 1, do: 1, else: 0)
          end)

        links =
          segments
          |> Enum.zip(segment_lines)
          |> Enum.flat_map(fn {seg, line_num} ->
            @re_markdown_link
            |> Regex.scan(seg)
            |> Enum.map(fn [_, label, href] ->
              fragment =
                case :binary.match(href, "#") do
                  :nomatch -> ""
                  {pos, _} -> binary_part(href, pos + 1, byte_size(href) - pos - 1)
                end

              %Link{target: href, fragment: fragment, label: label, line: line_num}
            end)
          end)

        {chars, links}
      end
    else
      {0, []}
    end
  end

  defp compute_window_char_count(lines, line_count, start_line, start_col, end_line, end_col) do
    {chars, _} =
      compute_window_stats(lines, line_count, start_line, start_col, end_line, end_col)

    chars
  end

  defp valid_window?(line_count, start_line, end_line) do
    line_count > 0 and start_line > 0 and end_line > 0 and start_line <= line_count and
      start_line <= end_line
  end

  defp slice_window_line(lines, line_num, start_line, start_col, end_line, end_col) do
    line_count = tuple_size(lines)

    if line_num <= 0 or line_num > line_count do
      ""
    else
      line = trim_right_cr(elem(lines, line_num - 1))
      len = byte_size(line)

      from_col =
        if line_num == start_line, do: clamp(start_col, 0, len), else: 0

      to_col =
        if line_num == end_line and end_col >= 0, do: clamp(end_col, 0, len), else: len

      to_col = if to_col < from_col, do: from_col, else: to_col
      binary_part(line, from_col, to_col - from_col)
    end
  end

  defp line_end_col(_lines, line_count, line_num) when line_num <= 0 or line_num > line_count,
    do: 0

  defp line_end_col(lines, _line_count, line_num),
    do: byte_size(trim_right_cr(elem(lines, line_num - 1)))

  defp clamp(value, min_v, _max_v) when value < min_v, do: min_v
  defp clamp(value, _min_v, max_v) when value > max_v, do: max_v
  defp clamp(value, _min_v, _max_v), do: value

  defp window_has_content(lines, line_count, start_line, end_line, skip_lines) do
    if valid_window?(line_count, start_line, end_line) do
      Enum.any?(start_line..end_line//1, fn ln ->
        if MapSet.member?(skip_lines, ln) do
          false
        else
          String.trim(trim_right_cr(elem(lines, ln - 1))) != ""
        end
      end)
    else
      false
    end
  end

  defp find_closing_tag_start(line, tag_name, from_col) do
    case find_closing_tag_range(line, tag_name, from_col) do
      :not_found -> :not_found
      {:ok, start, _end} -> {:ok, start}
    end
  end

  defp find_closing_tag_range(line, tag_name, from_col) do
    pattern = ~r/<\/\s*#{Regex.escape(tag_name)}\s*>/u
    haystack = binary_part(line, from_col, byte_size(line) - from_col)

    case Regex.run(pattern, haystack, return: :index) do
      nil -> :not_found
      [{s, l}] -> {:ok, from_col + s, from_col + s + l}
    end
  end

  ## ──────────────────────────────────────────────────────────────
  ## Code fence state
  ## ──────────────────────────────────────────────────────────────

  defp update_fence_state(line, state) do
    trimmed = String.trim_leading(line, " \t") |> String.trim_leading("\t")

    if trimmed == "" do
      {false, state}
    else
      first = String.first(trimmed)

      if first in ["`", "~"] do
        count = leading_marker_count(trimmed, first, 0)

        cond do
          count < 3 ->
            {false, state}

          not state.active ->
            {true, %{active: true, marker: first, count: count}}

          state.marker == first and count >= state.count ->
            {true, %{active: false, marker: "", count: 0}}

          true ->
            {false, state}
        end
      else
        {false, state}
      end
    end
  end

  defp leading_marker_count(<<>>, _m, n), do: n

  defp leading_marker_count(<<c::utf8, rest::binary>>, marker, n) do
    if <<c::utf8>> == marker, do: leading_marker_count(rest, marker, n + 1), else: n
  end

  ## ──────────────────────────────────────────────────────────────
  ## TOC / inject helpers
  ## ──────────────────────────────────────────────────────────────

  defp render_section_prefix(%Section{kind: @kind_xml, tag_name: tag}) do
    if tag == "", do: "<xml>", else: "<#{tag}>"
  end

  defp render_section_prefix(%Section{level: l}) when l <= 0, do: "-"
  defp render_section_prefix(%Section{level: l}), do: String.duplicate("#", l)

  defp section_depth(sections_tup, idx) do
    parent = elem(sections_tup, idx).parent_idx
    do_section_depth(sections_tup, parent, 0)
  end

  defp do_section_depth(_tup, parent, depth) when parent < 0, do: depth

  defp do_section_depth(sections_tup, parent, depth) do
    next = elem(sections_tup, parent).parent_idx
    do_section_depth(sections_tup, next, depth + 1)
  end

  defp inject_anchor_for_section(lines, %Section{} = section) do
    heading_idx_0 =
      find_markdown_heading_line(lines, section.start_line, section.end_line)

    cond do
      heading_idx_0 < 0 ->
        lines

      heading_idx_0 > 0 and previous_is_anchor?(Enum.at(lines, heading_idx_0 - 1)) ->
        lines

      true ->
        line_at = Enum.at(lines, heading_idx_0)

        case parse_markdown_heading(line_at) do
          :nomatch ->
            lines

          {:ok, _l, _h, attr_id} ->
            if attr_id != "" do
              lines
            else
              List.insert_at(
                lines,
                heading_idx_0,
                ~s(<a id="#{section.anchor_id}"></a>)
              )
            end
        end
    end
  end

  defp previous_is_anchor?(line) when is_binary(line) do
    stripped = String.trim(line)
    elem(parse_standalone_anchor_tag(stripped), 1) or extract_xml_comment_anchor(stripped) != ""
  end

  defp find_markdown_heading_line(lines, start_line, end_line) do
    start_line = if start_line < 1, do: 1, else: start_line
    end_line = min(end_line, length(lines))

    if start_line > end_line do
      -1
    else
      Enum.reduce_while((start_line - 1)..(end_line - 1)//1, -1, fn idx, _acc ->
        case parse_markdown_heading(Enum.at(lines, idx)) do
          {:ok, _, _, _} -> {:halt, idx}
          :nomatch -> {:cont, -1}
        end
      end)
    end
  end

  ## ──────────────────────────────────────────────────────────────
  ## Get section text helper
  ## ──────────────────────────────────────────────────────────────

  defp slice_section_body(lines, %Section{kind: @kind_markdown} = s) do
    do_slice_lines(lines, s.start_line + 1, s.end_line)
  end

  defp slice_section_body(lines, %Section{kind: @kind_xml} = s) do
    do_slice_lines(lines, s.start_line + 1, s.end_line - 1)
  end

  defp slice_section_body(lines, %Section{} = s) do
    do_slice_lines(lines, s.start_line, s.end_line)
  end

  defp do_slice_lines(lines, from, to) do
    cond do
      from > to ->
        ""

      from < 1 ->
        do_slice_lines(lines, 1, to)

      true ->
        lines
        |> Enum.slice((from - 1)..(to - 1))
        |> Enum.join("\n")
    end
  end

  ## ──────────────────────────────────────────────────────────────
  ## Anchor normalisation
  ## ──────────────────────────────────────────────────────────────

  defp normalize_chars([], acc, _last_was_underscore),
    do: acc |> Enum.reverse() |> List.to_string()

  defp normalize_chars([c | rest], acc, last_was_underscore) do
    cond do
      ascii_alnum?(c) ->
        normalize_chars(rest, [c | acc], false)

      acc == [] ->
        normalize_chars(rest, acc, last_was_underscore)

      not last_was_underscore ->
        normalize_chars(rest, [?_ | acc], true)

      true ->
        normalize_chars(rest, acc, last_was_underscore)
    end
  end

  defp ascii_alnum?(c) when c in ?a..?z, do: true
  defp ascii_alnum?(c) when c in ?0..?9, do: true
  defp ascii_alnum?(_), do: false

  defp strip_trailing_underscores(str), do: String.trim_trailing(str, "_")

  defp trim_right_cr(line) do
    if String.ends_with?(line, "\r") do
      binary_part(line, 0, byte_size(line) - 1)
    else
      line
    end
  end
end
