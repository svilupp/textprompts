defmodule TextPrompts do
  @moduledoc """
  Public facade for the TextPrompts Elixir port.
  """

  alias TextPrompts.{Loader, Prompt, Saver, Sections}

  @type option :: {:meta, TextPrompts.MetadataMode.t()}

  @spec load_prompt(Path.t(), keyword()) :: {:ok, Prompt.t()} | {:error, Exception.t()}
  defdelegate load_prompt(path, opts \\ []), to: Loader

  @spec load_prompt!(Path.t(), keyword()) :: Prompt.t()
  def load_prompt!(path, opts \\ []) do
    case load_prompt(path, opts) do
      {:ok, prompt} -> prompt
      {:error, error} -> raise error
    end
  end

  @spec save_prompt(Path.t(), Prompt.t() | String.t(), keyword()) :: :ok | {:error, Exception.t()}
  defdelegate save_prompt(path, prompt, opts \\ []), to: Saver

  @spec save_prompt!(Path.t(), Prompt.t() | String.t(), keyword()) :: :ok
  def save_prompt!(path, prompt, opts \\ []) do
    case save_prompt(path, prompt, opts) do
      :ok -> :ok
      {:error, error} -> raise error
    end
  end

  @spec parse_sections(String.t()) :: Sections.ParseResult.t()
  defdelegate parse_sections(text), to: Sections

  @spec generate_slug(String.t()) :: String.t()
  defdelegate generate_slug(text), to: Sections

  @spec normalize_anchor_id(String.t()) :: String.t()
  defdelegate normalize_anchor_id(text), to: Sections

  @spec get_section_text(String.t(), String.t()) :: {String.t() | nil, boolean()}
  defdelegate get_section_text(text, anchor), to: Sections
end
