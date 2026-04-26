defmodule TextPrompts.PromptStringTest do
  use ExUnit.Case, async: true

  alias TextPrompts.PromptString

  describe "format/3" do
    test "formats with strict validation" do
      ps = PromptString.new("Hello {name}")
      assert {:ok, "Hello Ada"} = PromptString.format(ps, name: "Ada")
    end

    test "returns error for missing placeholders in strict mode" do
      ps = PromptString.new("Hello {name} {id}")

      assert {:error, %TextPrompts.Error.Format{missing_keys: ["id"]}} =
               PromptString.format(ps, name: "Ada")
    end

    test "strict mode missing-keys error lists every missing key, sorted" do
      ps = PromptString.new("{a} {b} {c} {d}")

      assert {:error, %TextPrompts.Error.Format{missing_keys: ["b", "d"]} = err} =
               PromptString.format(ps, a: "1", c: "3")

      assert Exception.message(err) =~ "missing format variables"
      assert Exception.message(err) =~ "b"
      assert Exception.message(err) =~ "d"
    end

    test "allows partial formatting in non-strict mode" do
      ps = PromptString.new("Hello {name} {id}")
      assert {:ok, "Hello Ada {id}"} = PromptString.format(ps, [name: "Ada"], strict: false)
    end

    test "single-pass substitution: a value containing {x} is not re-substituted" do
      # Order-dependent reentrancy bug regression test:
      # naive per-key replace would substitute {b} inside the value of `a`,
      # producing "xx". Single-pass regex preserves the literal "{b}".
      ps = PromptString.new("{a}{b}")
      assert {:ok, "{b}x"} = PromptString.format(ps, a: "{b}", b: "x")
    end

    test "single-pass substitution with multiple placeholders containing braces" do
      ps = PromptString.new("[{x}][{y}][{z}]")

      assert {:ok, "[{y}][{z}][done]"} =
               PromptString.format(ps, x: "{y}", y: "{z}", z: "done")
    end

    test "extra/unknown bindings are silently ignored (Python parity)" do
      ps = PromptString.new("Hi {name}")
      # Caller supplies a key the template does not reference — Python's
      # validate_format_args only checks for *missing* keys, not extras.
      assert {:ok, "Hi Ada"} = PromptString.format(ps, name: "Ada", unused: "x")
      assert {:ok, "Hi Ada"} = PromptString.format(ps, [name: "Ada", unused: "x"], strict: true)
    end

    test "accepts map bindings with string or atom keys" do
      ps = PromptString.new("{greeting} {name}")
      assert {:ok, "hi Ada"} = PromptString.format(ps, %{greeting: "hi", name: "Ada"})
      assert {:ok, "hi Ada"} = PromptString.format(ps, %{"greeting" => "hi", "name" => "Ada"})
    end
  end

  describe "format!/3" do
    test "raises Format error in strict mode when keys are missing" do
      ps = PromptString.new("{a} {b}")

      assert_raise TextPrompts.Error.Format, fn ->
        PromptString.format!(ps, a: "1")
      end
    end

    test "returns rendered string on success" do
      ps = PromptString.new("Hello {name}")
      assert "Hello Ada" = PromptString.format!(ps, name: "Ada")
    end
  end

  describe "Inspect protocol" do
    test "renders compact form, does not dump entire body" do
      ps = PromptString.new("Hello {name}")
      out = inspect(ps)
      assert out =~ "#PromptString<"
      assert out =~ "Hello {name}"
      assert out =~ "placeholders:"
      assert out =~ "name"
    end

    test "placeholder list is sorted in inspect output" do
      ps = PromptString.new("{b}{a}{c}")
      assert inspect(ps) =~ ~s(placeholders: ["a", "b", "c"])
    end
  end

  describe "Jason.Encoder protocol" do
    test "round-trips raw and placeholders" do
      ps = PromptString.new("Hello {name} {id}")
      json = Jason.encode!(ps)
      decoded = Jason.decode!(json)

      assert decoded["raw"] == "Hello {name} {id}"
      assert Enum.sort(decoded["placeholders"]) == ["id", "name"]
    end
  end

  describe "String.Chars protocol" do
    test "to_string returns the raw template" do
      ps = PromptString.new("Hello {name}")
      assert to_string(ps) == "Hello {name}"
    end
  end
end
