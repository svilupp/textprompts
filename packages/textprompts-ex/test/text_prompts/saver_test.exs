defmodule TextPrompts.SaverTest do
  use ExUnit.Case, async: false

  alias TextPrompts.{Loader, Prompt, PromptMeta, Saver}

  defp tmp_path(suffix \\ ".txt") do
    name = "textprompts-saver-#{System.unique_integer([:positive])}#{suffix}"
    Path.join(System.tmp_dir!(), name)
  end

  describe "format selection" do
    test ":format option wins over the extension" do
      path = tmp_path(".yml")

      prompt = %Prompt{
        path: path,
        prompt: "body\n",
        meta: %PromptMeta{title: "T", description: "D", version: "1"}
      }

      assert :ok = Saver.save(path, prompt, format: :toml)
      content = File.read!(path)
      # TOML uses `=` while YAML uses `:`.
      assert content =~ "title = \"T\""
    end

    test "infers :yaml from .yaml extension" do
      path = tmp_path(".yaml")

      prompt = %Prompt{
        path: path,
        prompt: "body\n",
        meta: %PromptMeta{title: "T", description: "D", version: "1"}
      }

      assert :ok = Saver.save(path, prompt)
      content = File.read!(path)
      assert content =~ ~s(title: "T")
      refute content =~ "title = "
    end

    test "infers :yaml from .yml extension" do
      path = tmp_path(".yml")
      prompt = %Prompt{path: path, prompt: "body\n", meta: %PromptMeta{title: "T"}}

      assert :ok = Saver.save(path, prompt)
      assert File.read!(path) =~ ~s(title: "T")
    end

    test "defaults to TOML for .txt and other extensions" do
      path = tmp_path(".txt")
      prompt = %Prompt{path: path, prompt: "body\n", meta: %PromptMeta{title: "T"}}

      assert :ok = Saver.save(path, prompt)
      assert File.read!(path) =~ ~s(title = "T")
    end

    test "rejects an unknown format option" do
      path = tmp_path()
      prompt = %Prompt{path: path, prompt: "body", meta: %PromptMeta{title: "T"}}

      assert_raise ArgumentError, fn ->
        Saver.save(path, prompt, format: :json)
      end
    end
  end

  describe "round trip" do
    test "TOML frontmatter survives load → save → load" do
      path1 = tmp_path()
      path2 = tmp_path()

      File.write!(
        path1,
        "---\ntitle = \"Greeting\"\ndescription = \"Says hi\"\nversion = \"1.0.0\"\nauthor = \"Ada\"\n---\nHello {name}\n"
      )

      prompt1 = Loader.load!(path1)
      assert :ok = Saver.save(path2, prompt1, format: :toml)
      prompt2 = Loader.load!(path2)

      assert prompt2.meta.title == "Greeting"
      assert prompt2.meta.description == "Says hi"
      assert prompt2.meta.version == "1.0.0"
      assert prompt2.meta.author == "Ada"
      assert prompt2.prompt == "Hello {name}\n"
    end

    test "YAML frontmatter survives load → save → load" do
      path1 = tmp_path(".yaml")
      path2 = tmp_path(".yaml")

      File.write!(
        path1,
        "---\ntitle: Greeting\ndescription: Says hi\nversion: \"1.0.0\"\nauthor: Ada\n---\nHello {name}\n"
      )

      prompt1 = Loader.load!(path1)
      assert :ok = Saver.save(path2, prompt1)
      prompt2 = Loader.load!(path2)

      assert prompt2.meta.title == "Greeting"
      assert prompt2.meta.description == "Says hi"
      assert prompt2.meta.version == "1.0.0"
      assert prompt2.meta.author == "Ada"
      assert prompt2.prompt == "Hello {name}\n"
    end

    test "extras keys round-trip in TOML" do
      path = tmp_path()

      prompt = %Prompt{
        path: path,
        prompt: "body\n",
        meta: %PromptMeta{
          title: "T",
          description: "D",
          version: "1",
          extras: %{"tags" => ["a", "b"], "lucky" => 7, "shipped" => true}
        }
      }

      assert :ok = Saver.save(path, prompt, format: :toml)
      reloaded = Loader.load!(path)
      assert reloaded.meta.extras["tags"] == ["a", "b"]
      assert reloaded.meta.extras["lucky"] == 7
      assert reloaded.meta.extras["shipped"] == true
    end

    test "extras keys round-trip in YAML" do
      path = tmp_path(".yaml")

      prompt = %Prompt{
        path: path,
        prompt: "body\n",
        meta: %PromptMeta{
          title: "T",
          description: "D",
          version: "1",
          extras: %{"tags" => ["a", "b"], "lucky" => 7}
        }
      }

      assert :ok = Saver.save(path, prompt)
      reloaded = Loader.load!(path)
      assert reloaded.meta.extras["tags"] == ["a", "b"]
      assert reloaded.meta.extras["lucky"] == 7
    end
  end

  describe "save bare strings" do
    test "writes string body without frontmatter" do
      path = tmp_path()
      assert :ok = Saver.save(path, "just a body")
      assert File.read!(path) == "just a body"
    end
  end

  describe "telemetry" do
    test "emits :start and :stop events" do
      ref = make_ref()
      parent = self()

      :telemetry.attach_many(
        "saver-success-#{inspect(ref)}",
        [
          [:text_prompts, :save, :start],
          [:text_prompts, :save, :stop]
        ],
        fn event, measurements, metadata, _ ->
          send(parent, {ref, event, measurements, metadata})
        end,
        nil
      )

      try do
        path = tmp_path()
        prompt = %Prompt{path: path, prompt: "x", meta: %PromptMeta{title: "T"}}

        assert :ok = Saver.save(path, prompt, format: :toml)

        assert_receive {^ref, [:text_prompts, :save, :start], %{}, %{path: ^path, format: :toml}}

        assert_receive {^ref, [:text_prompts, :save, :stop], %{duration: _},
                        %{path: ^path, format: :toml}}
      after
        :telemetry.detach("saver-success-#{inspect(ref)}")
      end
    end
  end
end
