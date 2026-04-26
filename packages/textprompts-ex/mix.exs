defmodule TextPrompts.MixProject do
  use Mix.Project

  @version "0.1.0"
  @source_url "https://github.com/svilupp/textprompts"

  def project do
    [
      app: :text_prompts,
      version: @version,
      elixir: "~> 1.17",
      elixirc_options: [warnings_as_errors: true],
      start_permanent: Mix.env() == :prod,
      aliases: aliases(),
      deps: deps(),
      description: description(),
      package: package(),
      docs: docs(),
      escript: escript(),
      source_url: @source_url,
      homepage_url: @source_url,
      test_coverage: [tool: ExCoveralls],
      dialyzer: [
        ignore_warnings: ".dialyzer_ignore.exs",
        plt_add_apps: [:mix, :ex_unit]
      ]
    ]
  end

  def application do
    [extra_applications: [:logger]]
  end

  def cli do
    [
      preferred_envs: [
        check: :test,
        coveralls: :test,
        "coveralls.detail": :test,
        "coveralls.post": :test,
        "coveralls.html": :test,
        "coveralls.json": :test
      ]
    ]
  end

  defp aliases do
    [
      "examples.run": [
        "run examples/basic_load.exs",
        "run examples/format_with_placeholders.exs",
        "run examples/sections_toc.exs",
        "run examples/round_trip.exs"
      ],
      check: [
        "format --check-formatted",
        "compile --warnings-as-errors",
        "credo --strict",
        "test"
      ]
    ]
  end

  defp description do
    "Cross-language prompt file loader for Elixir: parse Markdown prompts with " <>
      "TOML/YAML frontmatter, named placeholders, and section anchors. Fixture-compatible " <>
      "with the Python, Go, TypeScript, and Julia ports."
  end

  defp deps do
    [
      # Runtime
      {:toml_elixir, "~> 2.0"},
      {:yaml_elixir, "~> 2.11"},
      {:jason, "~> 1.4", optional: true},
      {:telemetry, "~> 1.2"},

      # Dev / test
      {:ex_doc, "~> 0.34", only: :dev, runtime: false},
      {:credo, "~> 1.7", only: [:dev, :test], runtime: false},
      {:dialyxir, "~> 1.4", only: [:dev, :test], runtime: false},
      {:excoveralls, "~> 0.18", only: :test},
      {:stream_data, "~> 1.1", only: [:dev, :test]},
      {:mix_test_watch, "~> 1.2", only: [:dev, :test], runtime: false}
    ]
  end

  defp package do
    [
      name: "textprompts",
      description: description(),
      licenses: ["MIT"],
      maintainers: ["J S"],
      files: ~w(lib mix.exs README.md LICENSE CHANGELOG.md),
      links: %{
        "GitHub" => @source_url,
        "Changelog" => @source_url <> "/blob/main/packages/textprompts-ex/CHANGELOG.md",
        "Issues" => @source_url <> "/issues"
      }
    ]
  end

  defp docs do
    [
      main: "TextPrompts",
      source_url: @source_url,
      source_ref: "ex-v#{@version}",
      extras: [
        "README.md",
        "CHANGELOG.md"
      ],
      groups_for_modules: [
        "Public API": [
          TextPrompts,
          TextPrompts.Prompt,
          TextPrompts.PromptMeta,
          TextPrompts.PromptString,
          TextPrompts.Config,
          TextPrompts.MetadataMode,
          TextPrompts.Sigil
        ],
        Sections: [
          TextPrompts.Sections,
          TextPrompts.Sections.ParseResult,
          TextPrompts.Sections.Section,
          TextPrompts.Sections.Link,
          TextPrompts.Sections.FrontmatterBlock
        ],
        Frontmatter: [
          TextPrompts.Frontmatter,
          TextPrompts.Frontmatter.Parser,
          TextPrompts.Frontmatter.Toml,
          TextPrompts.Frontmatter.Yaml,
          TextPrompts.Loader,
          TextPrompts.Saver
        ],
        Errors: [
          TextPrompts.Error,
          TextPrompts.Error.FileMissing,
          TextPrompts.Error.Format,
          TextPrompts.Error.IO,
          TextPrompts.Error.MissingMetadata,
          TextPrompts.Error.InvalidMetadata,
          TextPrompts.Error.MalformedHeader,
          TextPrompts.Error.InvalidMetadataMode
        ]
      ]
    ]
  end

  defp escript do
    [
      main_module: TextPrompts.CLI,
      name: "textprompts"
    ]
  end
end
