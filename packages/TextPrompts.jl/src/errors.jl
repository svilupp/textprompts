"""
Custom exception types for TextPrompts.
"""

"""
    TextPromptsError <: Exception

Base exception type for all TextPrompts errors.
"""
abstract type TextPromptsError <: Exception end

"""
    FileMissingError <: TextPromptsError

Raised when a prompt file cannot be found.
"""
struct FileMissingError <: TextPromptsError
    path::String
    message::String
    function FileMissingError(path::AbstractString)
        new(string(path), "File not found: $(path)")
    end
end

Base.showerror(io::IO, e::FileMissingError) = print(io, "FileMissingError: ", e.message)

"""
    MissingMetadataError <: TextPromptsError

Raised when required metadata fields are missing in strict mode.
"""
struct MissingMetadataError <: TextPromptsError
    path::String
    missing_fields::Vector{String}
    message::String
    function MissingMetadataError(path::AbstractString, missing_fields::Vector{String})
        fields_str = join(missing_fields, ", ")
        msg = "Missing required metadata fields in $(path): $(fields_str). " *
              "Use meta=:allow or meta=:ignore to skip metadata validation."
        new(string(path), missing_fields, msg)
    end
    function MissingMetadataError(path::AbstractString)
        msg = "No metadata found in $(path). " *
              "Add TOML front-matter with title, description, and version fields, " *
              "or use meta=:allow or meta=:ignore."
        new(string(path), String[], msg)
    end
end

Base.showerror(io::IO, e::MissingMetadataError) = print(io, "MissingMetadataError: ", e.message)

"""
    InvalidMetadataError <: TextPromptsError

Raised when metadata cannot be parsed (invalid TOML).
"""
struct InvalidMetadataError <: TextPromptsError
    path::String
    message::String
    function InvalidMetadataError(path::AbstractString, parse_error::String)
        msg = "Invalid metadata in $(path): $(parse_error). " *
              "Check TOML syntax or use meta=:ignore to skip metadata parsing."
        new(string(path), msg)
    end
end

Base.showerror(io::IO, e::InvalidMetadataError) = print(io, "InvalidMetadataError: ", e.message)

"""
    MalformedHeaderError <: TextPromptsError

Raised when front-matter delimiter is started but not closed.
"""
struct MalformedHeaderError <: TextPromptsError
    path::String
    message::String
    function MalformedHeaderError(path::AbstractString)
        msg = "Malformed header in $(path): found opening '---' but no closing delimiter. " *
              "Add closing '---' or use meta=:ignore if the content starts with dashes."
        new(string(path), msg)
    end
end

Base.showerror(io::IO, e::MalformedHeaderError) = print(io, "MalformedHeaderError: ", e.message)

"""
    PlaceholderError <: TextPromptsError

Raised when formatting fails due to missing placeholders.
"""
struct PlaceholderError <: TextPromptsError
    missing_keys::Vector{String}
    message::String
    function PlaceholderError(missing_keys::Vector{String})
        keys_str = join(missing_keys, ", ")
        msg = "Missing values for placeholders: $(keys_str)"
        new(missing_keys, msg)
    end
end

Base.showerror(io::IO, e::PlaceholderError) = print(io, "PlaceholderError: ", e.message)

"""
    EmptyContentError <: TextPromptsError

Raised when a prompt file has no content.
"""
struct EmptyContentError <: TextPromptsError
    path::String
    message::String
    function EmptyContentError(path::AbstractString)
        new(string(path), "File has no content: $(path)")
    end
end

Base.showerror(io::IO, e::EmptyContentError) = print(io, "EmptyContentError: ", e.message)

"""
    FileReadError <: TextPromptsError

Raised when a file cannot be read.
"""
struct FileReadError <: TextPromptsError
    path::String
    message::String
    function FileReadError(path::AbstractString, reason::AbstractString)
        new(string(path), "Failed to read file $(path): $(reason)")
    end
end

Base.showerror(io::IO, e::FileReadError) = print(io, "FileReadError: ", e.message)

"""
    LoadError <: TextPromptsError

Raised when loading a prompt fails for an unexpected reason.
"""
struct LoadError <: TextPromptsError
    path::String
    message::String
    function LoadError(path::AbstractString, reason::AbstractString)
        new(string(path), "Failed to load $(path): $(reason)")
    end
end

Base.showerror(io::IO, e::LoadError) = print(io, "LoadError: ", e.message)
