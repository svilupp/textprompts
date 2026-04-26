defmodule TextPrompts.PromptStringTest do
  use ExUnit.Case, async: true

  alias TextPrompts.PromptString

  test "formats with strict validation" do
    ps = PromptString.new("Hello {name}")
    assert {:ok, "Hello Ada"} = PromptString.format(ps, name: "Ada")
  end

  test "returns error for missing placeholders in strict mode" do
    ps = PromptString.new("Hello {name} {id}")

    assert {:error, %TextPrompts.Error.Format{missing_keys: ["id"]}} =
             PromptString.format(ps, name: "Ada")
  end

  test "allows partial formatting in non-strict mode" do
    ps = PromptString.new("Hello {name} {id}")
    assert {:ok, "Hello Ada {id}"} = PromptString.format(ps, [name: "Ada"], strict: false)
  end
end
