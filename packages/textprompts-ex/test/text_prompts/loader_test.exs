defmodule TextPrompts.LoaderTest do
  use ExUnit.Case, async: true

  alias TextPrompts.Loader

  test "loads prompt with TOML frontmatter" do
    path =
      Path.join(System.tmp_dir!(), "textprompts-loader-#{System.unique_integer([:positive])}.txt")

    File.write!(path, "---\ntitle = \"Greeting\"\nversion = \"1.0.0\"\n---\nHello {name}\n")

    assert {:ok, prompt} = Loader.load_prompt(path)
    assert prompt.meta.title == "Greeting"
    assert prompt.prompt == "Hello {name}\n"
  end

  test "returns file missing error" do
    assert {:error, %TextPrompts.Error.FileMissing{}} =
             Loader.load_prompt("/tmp/does-not-exist-x.txt")
  end
end
