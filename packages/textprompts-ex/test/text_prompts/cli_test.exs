defmodule TextPrompts.CLITest do
  use ExUnit.Case, async: false

  import ExUnit.CaptureIO

  alias TextPrompts.CLI

  # Tests pass exit_fun: &throw({:exit, &1}) so the CLI never halts the
  # ExUnit runner. We catch the throw and inspect the captured IO.
  defp run(argv) do
    {captured_stdout, exit_code} =
      with_captured_exit(fn -> CLI.main(argv, exit_fun: &throw({:exit, &1})) end)

    %{stdout: captured_stdout, exit_code: exit_code, stderr: ""}
  end

  defp run_with_stderr(argv) do
    parent = self()

    capture_stderr_fn = fn ->
      stderr =
        capture_io(:stderr, fn ->
          stdout =
            capture_io(fn ->
              code =
                try do
                  CLI.main(argv, exit_fun: &throw({:exit, &1}))
                  0
                catch
                  {:exit, code} -> code
                end

              send(parent, {:exit_code, code})
            end)

          send(parent, {:stdout, stdout})
        end)

      send(parent, {:stderr, stderr})
    end

    capture_stderr_fn.()

    stdout =
      receive do
        {:stdout, s} -> s
      after
        500 -> ""
      end

    stderr =
      receive do
        {:stderr, s} -> s
      after
        500 -> ""
      end

    code =
      receive do
        {:exit_code, c} -> c
      after
        500 -> nil
      end

    %{stdout: stdout, stderr: stderr, exit_code: code}
  end

  defp with_captured_exit(fun) do
    parent = self()

    stdout =
      capture_io(fn ->
        code =
          try do
            fun.()
            0
          catch
            {:exit, code} -> code
          end

        send(parent, {:code, code})
      end)

    code =
      receive do
        {:code, c} -> c
      after
        500 -> nil
      end

    {stdout, code}
  end

  defp tmp_path(suffix \\ ".txt") do
    name = "textprompts-cli-#{System.unique_integer([:positive])}#{suffix}"
    Path.join(System.tmp_dir!(), name)
  end

  describe "show" do
    test "happy path prints body and exits 0" do
      path = tmp_path()

      File.write!(
        path,
        "---\ntitle = \"Demo\"\nversion = \"1.0\"\n---\nHello world\n"
      )

      result = run(["show", path])
      assert result.exit_code == 0
      assert result.stdout == "Hello world\n"
    end

    test "--meta prints frontmatter only" do
      path = tmp_path()

      File.write!(
        path,
        "---\ntitle = \"Demo\"\nversion = \"1.0\"\nauthor = \"Ada\"\n---\nbody here\n"
      )

      result = run(["show", path, "--meta"])
      assert result.exit_code == 0
      assert result.stdout =~ "title: Demo"
      assert result.stdout =~ "version: 1.0"
      assert result.stdout =~ "author: Ada"
      refute result.stdout =~ "body here"
    end

    test "--json emits valid JSON with prompt + meta" do
      path = tmp_path()

      File.write!(
        path,
        "---\ntitle = \"Demo\"\nversion = \"1.0\"\n---\nthe body\n"
      )

      result = run(["show", path, "--json"])
      assert result.exit_code == 0

      decoded = Jason.decode!(result.stdout)
      assert decoded["meta"]["title"] == "Demo"
      assert decoded["meta"]["version"] == "1.0"
      assert decoded["prompt"] == "the body\n"
      assert decoded["path"] == path
    end

    test "--meta --json omits the prompt body" do
      path = tmp_path()
      File.write!(path, "---\ntitle = \"Demo\"\n---\nbody\n")

      result = run(["show", path, "--meta", "--json"])
      assert result.exit_code == 0
      decoded = Jason.decode!(result.stdout)
      assert decoded["meta"]["title"] == "Demo"
      refute Map.has_key?(decoded, "prompt")
    end

    test "--mode strict rejects file without required fields" do
      path = tmp_path()
      File.write!(path, "---\ntitle = \"Only\"\n---\nbody\n")

      result = run_with_stderr(["show", path, "--mode", "strict"])
      assert result.exit_code == 1
      assert result.stderr =~ "textprompts:"
    end

    test "missing path prints help to stderr and exits 1" do
      result = run_with_stderr(["show"])
      assert result.exit_code == 1
      assert result.stderr =~ "missing <path>"
    end
  end

  describe "validate" do
    test "succeeds for well-formed prompt" do
      path = tmp_path()

      File.write!(
        path,
        "---\ntitle = \"Demo\"\nversion = \"1.0\"\n---\nbody\n"
      )

      result = run(["validate", path])
      assert result.exit_code == 0
      assert result.stdout =~ "OK #{path}"
    end

    test "fails on missing file with exit code 1" do
      missing = "/tmp/textprompts-missing-#{System.unique_integer([:positive])}.txt"

      result = run_with_stderr(["validate", missing])
      assert result.exit_code == 1
      assert result.stderr =~ "FAIL #{missing}"
    end

    test "fails in --mode strict when fields are missing" do
      path = tmp_path()
      File.write!(path, "no frontmatter here\n")

      result = run_with_stderr(["validate", path, "--mode", "strict"])
      assert result.exit_code == 1
      assert result.stderr =~ "FAIL #{path}"
    end
  end

  describe "list" do
    test "emits JSON array with title + version + path" do
      dir =
        Path.join(System.tmp_dir!(), "textprompts-cli-list-#{System.unique_integer([:positive])}")

      File.mkdir_p!(dir)
      a = Path.join(dir, "a.txt")
      b = Path.join(dir, "b.md")

      File.write!(
        a,
        "---\ntitle = \"A\"\nversion = \"1\"\n---\nbody-a\n"
      )

      File.write!(
        b,
        "---\ntitle = \"B\"\nversion = \"2\"\n---\nbody-b\n"
      )

      result = run(["list", dir, "--json"])
      assert result.exit_code == 0

      decoded = Jason.decode!(result.stdout)
      assert is_list(decoded)
      titles = decoded |> Enum.map(& &1["title"]) |> Enum.sort()
      assert titles == ["A", "B"]
      assert Enum.all?(decoded, & &1["ok"])
    end

    test "tab-separated default output" do
      dir =
        Path.join(System.tmp_dir!(), "textprompts-cli-list-#{System.unique_integer([:positive])}")

      File.mkdir_p!(dir)
      a = Path.join(dir, "only.txt")

      File.write!(
        a,
        "---\ntitle = \"Only\"\nversion = \"9\"\n---\nx\n"
      )

      result = run(["list", dir])
      assert result.exit_code == 0
      assert result.stdout =~ ~r/only\.txt\tOnly\t9/
    end
  end

  describe "help / unknown" do
    test "no args prints usage to stderr and exits 2" do
      result = run_with_stderr([])
      assert result.exit_code == 2
      assert result.stderr =~ "Usage:"
    end

    test "--help prints usage to stdout and exits 0" do
      result = run(["--help"])
      assert result.exit_code == 0
      assert result.stdout =~ "Usage:"
    end

    test "unknown subcommand prints help to stderr and exits 2" do
      result = run_with_stderr(["frobnicate"])
      assert result.exit_code == 2
      assert result.stderr =~ "unknown subcommand"
    end
  end
end
