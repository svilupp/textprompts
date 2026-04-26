defmodule TextPrompts.MixProject do
  use Mix.Project

  def project do
    [
      app: :textprompts,
      version: "0.1.0",
      elixir: "~> 1.18",
      elixirc_options: [warnings_as_errors: true],
      start_permanent: Mix.env() == :prod,
      deps: deps(),
      description: "Cross-language prompt file loader for Elixir",
      package: package()
    ]
  end

  def application do
    [extra_applications: [:logger]]
  end

  defp deps do
    []
  end

  defp package do
    [
      licenses: ["MIT"],
      links: %{"GitHub" => "https://github.com/svilupp/textprompts"}
    ]
  end
end
