defmodule TextPrompts.MetadataModeTest do
  use ExUnit.Case, async: true

  alias TextPrompts.Error.InvalidMetadataMode
  alias TextPrompts.MetadataMode

  describe "valid?/1" do
    test "true for canonical atoms" do
      assert MetadataMode.valid?(:strict)
      assert MetadataMode.valid?(:allow)
      assert MetadataMode.valid?(:ignore)
    end

    test "false for strings (use cast/1 instead)" do
      refute MetadataMode.valid?("strict")
    end

    test "false for unknown atoms and other terms" do
      refute MetadataMode.valid?(:loose)
      refute MetadataMode.valid?(nil)
      refute MetadataMode.valid?(1)
    end
  end

  describe "cast/1" do
    test "accepts canonical atoms" do
      assert MetadataMode.cast(:strict) == {:ok, :strict}
      assert MetadataMode.cast(:allow) == {:ok, :allow}
      assert MetadataMode.cast(:ignore) == {:ok, :ignore}
    end

    test "accepts lowercase strings" do
      assert MetadataMode.cast("strict") == {:ok, :strict}
      assert MetadataMode.cast("allow") == {:ok, :allow}
      assert MetadataMode.cast("ignore") == {:ok, :ignore}
    end

    test "accepts mixed-case strings" do
      assert MetadataMode.cast("STRICT") == {:ok, :strict}
      assert MetadataMode.cast("Allow") == {:ok, :allow}
      assert MetadataMode.cast("Ignore") == {:ok, :ignore}
    end

    test "rejects unknown strings without polluting the atom table" do
      assert {:error, %InvalidMetadataMode{value: "loose"}} = MetadataMode.cast("loose")

      # The unknown string must not have been turned into an atom.
      assert_raise ArgumentError, fn -> String.to_existing_atom("loose-mode-zzzzz") end
    end

    test "rejects unknown atoms" do
      assert {:error, %InvalidMetadataMode{value: :loose}} = MetadataMode.cast(:loose)
    end

    test "rejects non-string non-atom values" do
      assert {:error, %InvalidMetadataMode{value: 1}} = MetadataMode.cast(1)
      assert {:error, %InvalidMetadataMode{value: nil}} = MetadataMode.cast(nil)
      assert {:error, %InvalidMetadataMode{value: %{}}} = MetadataMode.cast(%{})
    end
  end

  describe "cast!/1" do
    test "returns the atom on success" do
      assert MetadataMode.cast!(:strict) == :strict
      assert MetadataMode.cast!("Strict") == :strict
    end

    test "raises InvalidMetadataMode on miss" do
      assert_raise InvalidMetadataMode, ~r/invalid metadata mode/, fn ->
        MetadataMode.cast!("nope")
      end

      assert_raise InvalidMetadataMode, fn ->
        MetadataMode.cast!(7)
      end
    end
  end
end
