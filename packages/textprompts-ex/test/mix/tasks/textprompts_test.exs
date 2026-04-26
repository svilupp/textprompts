defmodule Mix.Tasks.TextpromptsTest do
  use ExUnit.Case, async: false

  alias Mix.Tasks.Textprompts.List, as: ListTask
  alias Mix.Tasks.Textprompts.Show, as: ShowTask
  alias Mix.Tasks.Textprompts.Validate, as: ValidateTask

  # The mix tasks delegate directly to TextPrompts.CLI.main/1 which calls
  # System.halt by default. Calling `Mix.Task.run/2` from the test runner
  # would therefore halt ExUnit. We assert the plumbing instead: each task
  # is loaded and exposes `run/1` that forwards into the CLI.

  test "textprompts.show task is loaded and exposes run/1" do
    assert Code.ensure_loaded?(ShowTask)
    assert function_exported?(ShowTask, :run, 1)
    assert ShowTask.__info__(:attributes)[:shortdoc]
  end

  test "textprompts.list task is loaded and exposes run/1" do
    assert Code.ensure_loaded?(ListTask)
    assert function_exported?(ListTask, :run, 1)
    assert ListTask.__info__(:attributes)[:shortdoc]
  end

  test "textprompts.validate task is loaded and exposes run/1" do
    assert Code.ensure_loaded?(ValidateTask)
    assert function_exported?(ValidateTask, :run, 1)
    assert ValidateTask.__info__(:attributes)[:shortdoc]
  end
end
