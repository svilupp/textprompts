module Errors

export TextPromptsException, TextPromptsError, FileMissingError, MissingMetadataError,
       InvalidMetadataError, MalformedHeaderError

abstract type TextPromptsException <: Exception end

struct TextPromptsError <: TextPromptsException
    msg::String
end

Base.showerror(io::IO, err::TextPromptsError) = print(io, err.msg)

struct FileMissingError <: TextPromptsException
    path::String
end

Base.showerror(io::IO, err::FileMissingError) = print(io, "File not found: ", err.path)

struct MissingMetadataError <: TextPromptsException
    msg::String
end

Base.showerror(io::IO, err::MissingMetadataError) = print(io, err.msg)

struct InvalidMetadataError <: TextPromptsException
    msg::String
end

Base.showerror(io::IO, err::InvalidMetadataError) = print(io, err.msg)

struct MalformedHeaderError <: TextPromptsException
    msg::String
end

Base.showerror(io::IO, err::MalformedHeaderError) = print(io, err.msg)

end
