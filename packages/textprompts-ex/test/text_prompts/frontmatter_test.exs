defmodule TextPrompts.FrontmatterTest do
  use ExUnit.Case, async: true

  alias TextPrompts.Error.{InvalidMetadata, MalformedHeader}
  alias TextPrompts.Frontmatter

  describe "extract/1 — happy paths" do
    test "parses TOML frontmatter wrapped in ---" do
      input = """
      ---
      title = "Greeting"
      version = "1.0.0"
      ---
      Hello {name}
      """

      assert {:ok, %{meta: meta, body: body, format: :toml} = result} =
               Frontmatter.extract(input)

      assert meta["title"] == "Greeting"
      assert meta["version"] == "1.0.0"
      assert body == "Hello {name}\n"
      assert is_integer(result.start_line) and result.start_line == 1
      assert is_integer(result.end_line) and result.end_line >= result.start_line
    end

    test "parses YAML frontmatter wrapped in --- and falls through TOML" do
      input = """
      ---
      title: Greeting
      version: 1.0.0
      tags:
        - greeting
        - demo
      ---
      Hello {name}
      """

      assert {:ok, %{meta: meta, body: body, format: :yaml}} =
               Frontmatter.extract(input)

      assert meta["title"] == "Greeting"
      assert meta["version"] == "1.0.0"
      assert meta["tags"] == ["greeting", "demo"]
      assert body == "Hello {name}\n"
    end

    test "TOML beats YAML when the header is valid TOML" do
      input = """
      ---
      title = "Greeting"
      ---
      body
      """

      assert {:ok, %{format: :toml, meta: %{"title" => "Greeting"}}} =
               Frontmatter.extract(input)
    end

    test "preserves YAML date fields as ISO strings" do
      input = """
      ---
      title: Greeting
      created: 2025-01-02
      ---
      body
      """

      assert {:ok, %{format: :yaml, meta: meta}} = Frontmatter.extract(input)
      assert meta["created"] == "2025-01-02"
    end

    test "handles trailing whitespace on delimiter lines" do
      input = "---  \ntitle = \"x\"\n---\t\nbody\n"

      assert {:ok, %{format: :toml, meta: %{"title" => "x"}, body: "body\n"}} =
               Frontmatter.extract(input)
    end

    test "empty header body decodes to an empty map (TOML default)" do
      input = "---\n---\nbody\n"

      assert {:ok, %{format: :toml, meta: %{}, body: "body\n"}} =
               Frontmatter.extract(input)
    end

    test "no leading delimiter is :no_frontmatter" do
      input = "Hello world\nNo frontmatter here.\n"
      assert :no_frontmatter = Frontmatter.extract(input)
    end

    test "+++ delimiters are rejected (only --- is recognized)" do
      input = """
      +++
      title = "Greeting"
      +++
      body
      """

      assert :no_frontmatter = Frontmatter.extract(input)
    end

    test "leading whitespace before --- is not frontmatter" do
      # Python is strict: must START with ---, no leading whitespace.
      input = " ---\ntitle = \"x\"\n---\nbody\n"
      assert :no_frontmatter = Frontmatter.extract(input)
    end
  end

  describe "extract/1 — sad paths" do
    test "unclosed --- raises MalformedHeader" do
      input = """
      ---
      title = "x"
      this file never closes
      """

      assert {:error, %MalformedHeader{reason: reason}} = Frontmatter.extract(input)
      assert is_binary(reason)
      assert reason =~ "closing delimiter"
    end

    test "invalid TOML and invalid YAML inside valid markers → InvalidMetadata" do
      # `:` makes it not valid TOML; the leading `:` makes it bad YAML too.
      input = """
      ---
      : this is neither toml nor yaml :
      ---
      body
      """

      assert {:error, %InvalidMetadata{reason: reason}} = Frontmatter.extract(input)
      assert is_binary(reason)
      assert reason =~ "TOML"
    end

    test "TOML scalar (not a table) is rejected as InvalidMetadata" do
      # Non-mapping YAML root: a top-level list-of-scalars after TOML fails.
      input = """
      ---
      - one
      - two
      ---
      body
      """

      assert {:error, %InvalidMetadata{}} = Frontmatter.extract(input)
    end
  end

  describe "split/1 — backward-compatible shim" do
    test "returns {meta_map, body} on success" do
      input = """
      ---
      title = "Greeting"
      ---
      Hello
      """

      assert {%{"title" => "Greeting"}, "Hello\n"} = Frontmatter.split(input)
    end

    test "returns {%{}, original_content} on no frontmatter" do
      input = "no frontmatter here\n"
      assert {%{}, ^input} = Frontmatter.split(input)
    end

    test "returns {%{}, original_content} on malformed header" do
      input = "---\nstill open\n"
      assert {%{}, ^input} = Frontmatter.split(input)
    end
  end
end
