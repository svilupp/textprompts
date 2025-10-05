export class TextPromptsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TextPromptsError";
  }
}

export class FileMissingError extends TextPromptsError {
  constructor(path: string) {
    super(`File not found: ${path}`);
    this.name = "FileMissingError";
  }
}

export class MissingMetadataError extends TextPromptsError {
  constructor(message = "Metadata is required but missing") {
    super(message);
    this.name = "MissingMetadataError";
  }
}

export class InvalidMetadataError extends TextPromptsError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMetadataError";
  }
}

export class MalformedHeaderError extends TextPromptsError {
  constructor(message: string) {
    super(message);
    this.name = "MalformedHeaderError";
  }
}
