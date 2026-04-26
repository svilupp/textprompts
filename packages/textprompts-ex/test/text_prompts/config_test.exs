defmodule TextPrompts.ConfigTest do
  # Not async: this test mutates the application environment.
  use ExUnit.Case, async: false

  alias TextPrompts.Config
  alias TextPrompts.Error.InvalidMetadataMode

  @process_key :text_prompts_metadata_mode

  setup do
    # Snapshot and reset every entry point that feeds Config.
    prev_app_env = Application.get_env(:text_prompts, :metadata_mode)
    prev_proc = Process.get(@process_key)

    Application.delete_env(:text_prompts, :metadata_mode)
    Process.delete(@process_key)

    on_exit(fn ->
      if prev_app_env == nil,
        do: Application.delete_env(:text_prompts, :metadata_mode),
        else: Application.put_env(:text_prompts, :metadata_mode, prev_app_env)

      if prev_proc == nil,
        do: Process.delete(@process_key),
        else: Process.put(@process_key, prev_proc)
    end)

    :ok
  end

  describe "metadata_mode/1 default" do
    test "is :allow when nothing is configured" do
      assert Config.metadata_mode() == :allow
    end
  end

  describe "metadata_mode/1 sources" do
    test ":meta option wins over everything" do
      Application.put_env(:text_prompts, :metadata_mode, :ignore)
      Process.put(@process_key, :allow)
      assert Config.metadata_mode(meta: :strict) == :strict
      assert Config.metadata_mode(meta: "ignore") == :ignore
    end

    test "process-local override beats application env" do
      Application.put_env(:text_prompts, :metadata_mode, :ignore)
      Process.put(@process_key, :strict)
      assert Config.metadata_mode() == :strict
    end

    test "application env is used when no process override is set" do
      Application.put_env(:text_prompts, :metadata_mode, :strict)
      assert Config.metadata_mode() == :strict
    end

    test "string-shaped values from app env are coerced" do
      Application.put_env(:text_prompts, :metadata_mode, "STRICT")
      assert Config.metadata_mode() == :strict
    end

    test "invalid :meta option raises" do
      assert_raise InvalidMetadataMode, fn ->
        Config.metadata_mode(meta: :loose)
      end
    end
  end

  describe "with_metadata/2" do
    test "sets the mode for the duration of the function and restores nil after" do
      assert Process.get(@process_key) == nil

      result =
        Config.with_metadata(:strict, fn ->
          assert Process.get(@process_key) == :strict
          assert Config.metadata_mode() == :strict
          :inner
        end)

      assert result == :inner
      # Critical: must be nil, not the literal value `:nil` left behind.
      assert Process.get(@process_key) == nil
    end

    test "restores a previous process value rather than deleting" do
      Process.put(@process_key, :allow)

      Config.with_metadata(:strict, fn ->
        assert Process.get(@process_key) == :strict
      end)

      assert Process.get(@process_key) == :allow
    end

    test "restores the prior value even when the function raises" do
      Process.put(@process_key, :allow)

      assert_raise RuntimeError, fn ->
        Config.with_metadata(:strict, fn -> raise "boom" end)
      end

      assert Process.get(@process_key) == :allow
    end

    test "accepts string-shaped modes" do
      Config.with_metadata("Ignore", fn ->
        assert Process.get(@process_key) == :ignore
      end)
    end

    test "rejects unknown modes before mutating state" do
      Process.put(@process_key, :allow)

      assert_raise InvalidMetadataMode, fn ->
        Config.with_metadata(:loose, fn -> flunk("must not run") end)
      end

      assert Process.get(@process_key) == :allow
    end
  end
end
