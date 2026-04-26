defmodule TextPrompts.SigilTest do
  use ExUnit.Case, async: true

  use TextPrompts.Sigil

  alias TextPrompts.PromptString

  describe "~P sigil" do
    test "returns a PromptString struct for a literal body" do
      ps = ~P"Hello {name}"
      assert %PromptString{raw: "Hello {name}"} = ps
      assert MapSet.equal?(ps.placeholders, MapSet.new(["name"]))
    end

    test "extracts multiple placeholders" do
      ps = ~P"{a} + {b} = {c}"
      assert MapSet.equal?(ps.placeholders, MapSet.new(["a", "b", "c"]))
    end

    test "handles a body without placeholders" do
      ps = ~P"no placeholders"
      assert ps.raw == "no placeholders"
      assert MapSet.equal?(ps.placeholders, MapSet.new())
    end

    test "result composes with PromptString.format/3" do
      ps = ~P"Hi {name}"
      assert {:ok, "Hi Ada"} = PromptString.format(ps, name: "Ada")
    end

    test "supports modifiers (s) without changing the struct shape" do
      ps = ~P"Hello {name}"s
      assert %PromptString{} = ps
      assert MapSet.equal?(ps.placeholders, MapSet.new(["name"]))
    end

    test "literal placeholder names are extracted at compile time" do
      # The sigil materializes the placeholder set at compile time.
      ps = ~P"{first} and {second}"
      assert MapSet.equal?(ps.placeholders, MapSet.new(["first", "second"]))
    end
  end
end
