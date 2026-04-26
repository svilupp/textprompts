defmodule TextPrompts.ErrorTest do
  use ExUnit.Case, async: true

  alias TextPrompts.Error.{
    FileMissing,
    Format,
    InvalidMetadata,
    InvalidMetadataMode,
    IO,
    MalformedHeader,
    MissingMetadata
  }

  describe "FileMissing" do
    test "renders the offending path" do
      err = FileMissing.exception(path: "prompts/x.md")
      assert Exception.message(err) =~ "prompt file not found"
      assert Exception.message(err) =~ "prompts/x.md"
    end
  end

  describe "Format" do
    test "lists missing keys" do
      err = Format.exception(missing_keys: ["id", "name"])
      msg = Exception.message(err)
      assert msg =~ "missing format variables"
      assert msg =~ "id"
      assert msg =~ "name"
    end

    test "defaults missing_keys to an empty list" do
      err = Format.exception([])
      assert err.missing_keys == []
    end
  end

  describe "IO" do
    test "renders action, path, and reason" do
      err = IO.exception(action: "read", path: "/tmp/x", reason: :enoent)
      msg = Exception.message(err)
      assert msg =~ "failed to read"
      assert msg =~ "/tmp/x"
      assert msg =~ ":enoent"
    end
  end

  describe "MissingMetadata" do
    test "messages without a field describe the entire frontmatter" do
      err = MissingMetadata.exception(path: "p.md")
      assert Exception.message(err) =~ "missing frontmatter"
      assert Exception.message(err) =~ "p.md"
    end

    test "messages with a field call out the missing key" do
      err = MissingMetadata.exception(path: "p.md", field: :title)
      msg = Exception.message(err)
      assert msg =~ "missing required metadata field"
      assert msg =~ ":title"
      assert msg =~ "p.md"
    end
  end

  describe "InvalidMetadata" do
    test "renders binary reason verbatim" do
      err = InvalidMetadata.exception(path: "p.md", reason: "boom")
      assert Exception.message(err) =~ "invalid frontmatter"
      assert Exception.message(err) =~ "boom"
    end

    test "renders field-scoped errors" do
      err = InvalidMetadata.exception(path: "p.md", field: :version, reason: :nan)
      msg = Exception.message(err)
      assert msg =~ "invalid frontmatter field"
      assert msg =~ ":version"
      assert msg =~ ":nan"
    end

    test "inspects non-binary reasons" do
      err = InvalidMetadata.exception(reason: {:bad, 1})
      assert Exception.message(err) =~ "{:bad, 1}"
    end
  end

  describe "MalformedHeader" do
    test "renders without a path" do
      err = MalformedHeader.exception(reason: "no closing delimiter")
      assert Exception.message(err) =~ "malformed frontmatter header"
      assert Exception.message(err) =~ "no closing delimiter"
    end

    test "renders with a path" do
      err = MalformedHeader.exception(path: "p.md", reason: "junk")
      msg = Exception.message(err)
      assert msg =~ "p.md"
      assert msg =~ "junk"
    end

    test "tolerates a nil reason" do
      err = MalformedHeader.exception([])
      assert is_binary(Exception.message(err))
    end
  end

  describe "InvalidMetadataMode" do
    test "renders the offending value and the valid set" do
      err = InvalidMetadataMode.exception(value: "loose")
      msg = Exception.message(err)
      assert msg =~ "invalid metadata mode"
      assert msg =~ "loose"
      assert msg =~ ":strict"
      assert msg =~ ":allow"
      assert msg =~ ":ignore"
    end

    test "is itself raisable" do
      assert_raise InvalidMetadataMode, fn ->
        raise InvalidMetadataMode, value: 7
      end
    end
  end

  describe "TextPrompts.Error type union" do
    test "module compiles and exposes a t/0 type without defining an exception" do
      # Ensure module is loaded. If this module ever (re)defines an exception,
      # `Exception.exception?/1` would change behavior — assert it does not.
      Code.ensure_loaded!(TextPrompts.Error)
      refute function_exported?(TextPrompts.Error, :exception, 1)
    end
  end
end
