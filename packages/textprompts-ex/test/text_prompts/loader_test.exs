defmodule TextPrompts.LoaderTest do
  use ExUnit.Case, async: false

  alias TextPrompts.{Config, Loader}

  alias TextPrompts.Error.{
    FileMissing,
    InvalidMetadata,
    MalformedHeader,
    MissingMetadata
  }

  defp tmp_path(suffix \\ ".txt") do
    name = "textprompts-loader-#{System.unique_integer([:positive])}#{suffix}"
    Path.join(System.tmp_dir!(), name)
  end

  describe ":allow mode (default)" do
    test "loads prompt with TOML frontmatter" do
      path = tmp_path()

      File.write!(
        path,
        "---\ntitle = \"Greeting\"\nversion = \"1.0.0\"\n---\nHello {name}\n"
      )

      assert {:ok, prompt} = Loader.load(path)
      assert prompt.meta.title == "Greeting"
      assert prompt.meta.version == "1.0.0"
      assert prompt.prompt == "Hello {name}\n"
    end

    test "loads prompt with YAML frontmatter" do
      path = tmp_path()

      File.write!(
        path,
        "---\ntitle: Greeting\ndescription: A hello\nversion: \"1.0\"\n---\nHi {name}\n"
      )

      assert {:ok, prompt} = Loader.load(path)
      assert prompt.meta.title == "Greeting"
      assert prompt.meta.description == "A hello"
      assert prompt.prompt == "Hi {name}\n"
    end

    test "treats body-only file as a body, defaulting title to filename" do
      path = tmp_path()
      File.write!(path, "Just a body\n")

      assert {:ok, prompt} = Loader.load(path)
      assert prompt.prompt == "Just a body\n"
      assert prompt.meta.title == Path.basename(path, ".txt")
    end

    test "surfaces malformed header errors with the file path attached" do
      path = tmp_path()
      File.write!(path, "---\ntitle = \"x\"\nbody without close\n")

      assert {:error, %MalformedHeader{path: ^path}} = Loader.load(path)
    end
  end

  describe ":strict mode" do
    test "loads when title/description/version are present and non-empty" do
      path = tmp_path()

      File.write!(
        path,
        "---\ntitle = \"T\"\ndescription = \"D\"\nversion = \"1\"\n---\nbody\n"
      )

      assert {:ok, prompt} = Loader.load(path, meta: :strict)
      assert prompt.meta.title == "T"
    end

    test "rejects files without any frontmatter" do
      path = tmp_path()
      File.write!(path, "no metadata here\n")

      assert {:error, %MissingMetadata{path: ^path, field: nil}} =
               Loader.load(path, meta: :strict)
    end

    test "rejects frontmatter missing required fields" do
      path = tmp_path()
      File.write!(path, "---\ntitle = \"T\"\n---\nbody\n")

      assert {:error, %InvalidMetadata{path: ^path, field: field}} =
               Loader.load(path, meta: :strict)

      assert field in ~w(description version title)
    end

    test "rejects frontmatter with empty required fields" do
      path = tmp_path()

      File.write!(
        path,
        "---\ntitle = \"\"\ndescription = \"D\"\nversion = \"1\"\n---\nbody\n"
      )

      assert {:error, %InvalidMetadata{}} = Loader.load(path, meta: :strict)
    end
  end

  describe ":ignore mode" do
    test "strips a frontmatter block from the body" do
      path = tmp_path()

      File.write!(
        path,
        "---\ntitle = \"ignored\"\n---\nactual body\n"
      )

      assert {:ok, prompt} = Loader.load(path, meta: :ignore)
      assert prompt.prompt == "actual body\n"
      assert prompt.meta.title == Path.basename(path, ".txt")
    end

    test "passes whole file through when there is no frontmatter" do
      path = tmp_path()
      File.write!(path, "raw content")

      assert {:ok, prompt} = Loader.load(path, meta: :ignore)
      assert prompt.prompt == "raw content"
    end
  end

  describe "mode resolution" do
    test "process-local mode via Config.with_metadata/2 wins over app env" do
      path = tmp_path()
      File.write!(path, "no fm here\n")

      assert :strict ==
               Config.with_metadata(:strict, fn ->
                 case Loader.load(path) do
                   {:error, %MissingMetadata{}} -> :strict
                   _ -> :other
                 end
               end)
    end

    test "explicit :meta opt overrides process-local mode" do
      path = tmp_path()
      File.write!(path, "no fm here\n")

      Config.with_metadata(:strict, fn ->
        assert {:ok, _} = Loader.load(path, meta: :allow)
      end)
    end
  end

  describe "errors" do
    test "returns FileMissing for non-existent file" do
      assert {:error, %FileMissing{}} =
               Loader.load("/tmp/does-not-exist-loader-x.txt")
    end

    test "load!/2 raises on error" do
      assert_raise FileMissing, fn ->
        Loader.load!("/tmp/does-not-exist-loader-y.txt")
      end
    end
  end

  describe "telemetry" do
    test "emits :start and :stop events on success" do
      ref = make_ref()
      parent = self()

      :telemetry.attach_many(
        "loader-success-#{inspect(ref)}",
        [
          [:text_prompts, :load, :start],
          [:text_prompts, :load, :stop]
        ],
        fn event, measurements, metadata, _ ->
          send(parent, {ref, event, measurements, metadata})
        end,
        nil
      )

      try do
        path = tmp_path()
        File.write!(path, "body\n")
        assert {:ok, _} = Loader.load(path)

        assert_receive {^ref, [:text_prompts, :load, :start], %{}, %{path: ^path, mode: :allow}}

        assert_receive {^ref, [:text_prompts, :load, :stop], %{duration: _},
                        %{path: ^path, mode: :allow}}
      after
        :telemetry.detach("loader-success-#{inspect(ref)}")
      end
    end

    test "emits :exception event when File.read raises (e.g. directory)" do
      ref = make_ref()
      parent = self()

      :telemetry.attach(
        "loader-exception-#{inspect(ref)}",
        [:text_prompts, :load, :exception],
        fn event, measurements, metadata, _ ->
          send(parent, {ref, event, measurements, metadata})
        end,
        nil
      )

      try do
        # Pass a non-existent path: returns {:error, FileMissing} via the
        # normal stop path, so to trigger :exception we cause a real raise
        # by passing a value that crashes inside the span fun.
        assert_raise FunctionClauseError, fn ->
          Loader.load(nil)
        end

        assert_receive {^ref, [:text_prompts, :load, :exception], _, %{kind: :error}}
      after
        :telemetry.detach("loader-exception-#{inspect(ref)}")
      end
    end
  end
end
