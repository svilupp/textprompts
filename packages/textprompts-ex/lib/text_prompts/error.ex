defmodule TextPrompts.Error do
  @moduledoc """
  Union typespec for every exception raised by `TextPrompts`.

  This module intentionally does **not** define an exception of its own. It
  exists solely to provide a `t/0` type for callers that want to pattern match
  on or document a `TextPrompts`-shaped error.
  """

  alias TextPrompts.Error.{
    FileMissing,
    Format,
    InvalidMetadata,
    InvalidMetadataMode,
    IO,
    MalformedHeader,
    MissingMetadata
  }

  @type t ::
          FileMissing.t()
          | Format.t()
          | InvalidMetadata.t()
          | InvalidMetadataMode.t()
          | IO.t()
          | MalformedHeader.t()
          | MissingMetadata.t()
end
