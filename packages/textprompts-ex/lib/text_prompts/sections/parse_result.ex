defmodule TextPrompts.Sections.Section do
  @moduledoc """
  A parsed section of a text document.

  Mirrors the `Section` struct in the cross-language fixture
  (`testdata/sections/cases.json`).
  """

  @enforce_keys [
    :kind,
    :tag_name,
    :heading,
    :anchor_id,
    :level,
    :start_line,
    :end_line,
    :char_count,
    :parent_idx
  ]
  defstruct kind: "",
            tag_name: "",
            heading: "",
            anchor_id: "",
            level: 0,
            start_line: 0,
            end_line: 0,
            char_count: 0,
            parent_idx: -1,
            children: [],
            links: []

  @type kind :: :preamble | :markdown | :xml | binary()

  @type t :: %__MODULE__{
          kind: kind(),
          tag_name: binary(),
          heading: binary(),
          anchor_id: binary(),
          level: non_neg_integer(),
          start_line: non_neg_integer(),
          end_line: non_neg_integer(),
          char_count: non_neg_integer(),
          parent_idx: integer(),
          children: [non_neg_integer()],
          links: [TextPrompts.Sections.Link.t()]
        }
end

defmodule TextPrompts.Sections.Link do
  @moduledoc """
  A markdown cross-reference discovered inside a section's content.
  """

  @enforce_keys [:target, :fragment, :label, :line]
  defstruct [:target, :fragment, :label, :line]

  @type t :: %__MODULE__{
          target: binary(),
          fragment: binary(),
          label: binary(),
          line: pos_integer()
        }
end

defmodule TextPrompts.Sections.FrontmatterBlock do
  @moduledoc """
  Records the byte/line span of a parsed frontmatter block at the
  top of a document. Mirrors the JSON fixture's `frontmatter` field.
  """

  defstruct raw: "",
            format: "",
            start_line: 0,
            end_line: 0,
            title: ""

  @type t :: %__MODULE__{
          raw: binary(),
          format: binary(),
          start_line: pos_integer(),
          end_line: pos_integer(),
          title: binary()
        }
end

defmodule TextPrompts.Sections.ParseResult do
  @moduledoc """
  Container returned by `TextPrompts.Sections.parse_sections/1`.
  """

  alias TextPrompts.Sections.{FrontmatterBlock, Section}

  defstruct sections: [],
            anchors: %{},
            duplicate_anchors: %{},
            frontmatter: nil,
            total_chars: 0

  @type t :: %__MODULE__{
          sections: [Section.t()],
          anchors: %{optional(binary()) => non_neg_integer()},
          duplicate_anchors: %{optional(binary()) => [non_neg_integer()]},
          frontmatter: FrontmatterBlock.t() | nil,
          total_chars: non_neg_integer()
        }
end
