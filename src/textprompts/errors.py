from pathlib import Path


class TextPromptsError(Exception): ...


class FileMissingError(TextPromptsError):
    def __init__(self, path: Path):
        super().__init__(f"File not found: {path}")


class MissingMetadataError(TextPromptsError): ...


class InvalidMetadataError(TextPromptsError): ...


class MalformedHeaderError(TextPromptsError): ...
