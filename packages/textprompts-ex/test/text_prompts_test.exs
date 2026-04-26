defmodule TextPromptsTest do
  use ExUnit.Case, async: false

  doctest TextPrompts

  alias TextPrompts.{Prompt, PromptMeta, PromptString}

  describe "smoke test — load, format, sections, round-trip" do
    setup do
      tmp =
        Path.join(System.tmp_dir!(), "textprompts-smoke-#{System.unique_integer([:positive])}.md")

      on_exit(fn -> File.rm(tmp) end)
      {:ok, path: tmp}
    end

    test "load → format → parse_sections → save round-trip", %{path: path} do
      original = """
      ---
      title = "Greeting"
      description = "Smoke fixture"
      version = "1.0.0"
      ---
      # Intro

      Hello {name}, welcome to {place}.

      # Outro

      Bye, {name}.
      """

      File.write!(path, original)

      # 1. Load with strict mode — required fields are present.
      assert {:ok, %Prompt{} = prompt} = TextPrompts.load(path, meta: :strict)
      assert prompt.meta.title == "Greeting"
      assert prompt.meta.version == "1.0.0"

      # 2. Format placeholders via PromptString.
      ps = PromptString.new(prompt.prompt)
      assert MapSet.equal?(ps.placeholders, MapSet.new(["name", "place"]))

      {:ok, rendered} = PromptString.format(ps, name: "Ada", place: "Earth")
      assert rendered =~ "Hello Ada, welcome to Earth."
      assert rendered =~ "Bye, Ada."

      # 3. parse_sections — two top-level Markdown sections.
      result = TextPrompts.parse_sections(prompt.prompt)
      headings = Enum.map(result.sections, & &1.heading)
      assert "Intro" in headings
      assert "Outro" in headings
      anchors = Map.keys(result.anchors)
      assert "intro" in anchors
      assert "outro" in anchors

      # 4. get_section_text via the facade.
      assert {body, true} = TextPrompts.get_section_text(prompt.prompt, "intro")
      assert body =~ "Hello {name}"
      refute body =~ "Bye"

      # 5. render_toc returns a non-empty TOC.
      toc = TextPrompts.render_toc(result, path)
      assert toc =~ "[#intro]"
      assert toc =~ "[#outro]"

      # 6. Round-trip via Saver — load again and confirm equivalence.
      out_path =
        Path.join(
          System.tmp_dir!(),
          "textprompts-smoke-out-#{System.unique_integer([:positive])}.md"
        )

      try do
        :ok =
          TextPrompts.save(out_path, %Prompt{
            path: out_path,
            prompt: prompt.prompt,
            meta: %PromptMeta{
              title: prompt.meta.title,
              description: prompt.meta.description,
              version: prompt.meta.version
            }
          })

        {:ok, reloaded} = TextPrompts.load(out_path, meta: :strict)
        assert reloaded.meta.title == prompt.meta.title
        assert reloaded.meta.version == prompt.meta.version
        assert reloaded.prompt == prompt.prompt
      after
        File.rm(out_path)
      end
    end

    test "with_metadata scopes the metadata mode for the duration of the call" do
      assert :ignore =
               TextPrompts.with_metadata(:ignore, fn ->
                 TextPrompts.Config.metadata_mode()
               end)

      # Restored to default after the block exits.
      assert :allow == TextPrompts.Config.metadata_mode()
    end

    test "load_section!/3 returns the body for an explicit anchor", %{path: path} do
      File.write!(path, "# Intro\nbody-line\n")

      assert "body-line\n" == TextPrompts.load_section!(path, "intro", meta: :ignore)
    end
  end
end
