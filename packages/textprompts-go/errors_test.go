package textprompts

import (
	"errors"
	"testing"
)

func TestTextPromptsError(t *testing.T) {
	cause := errors.New("underlying error")
	err := &TextPromptsError{
		Message: "test error",
		Cause:   cause,
	}

	if got := err.Error(); got != "test error: underlying error" {
		t.Errorf("Error() = %q, want %q", got, "test error: underlying error")
	}

	if unwrapped := err.Unwrap(); unwrapped != cause {
		t.Errorf("Unwrap() = %v, want %v", unwrapped, cause)
	}
}

func TestTextPromptsErrorNoCause(t *testing.T) {
	err := &TextPromptsError{
		Message: "test error",
	}

	if got := err.Error(); got != "test error" {
		t.Errorf("Error() = %q, want %q", got, "test error")
	}

	if unwrapped := err.Unwrap(); unwrapped != nil {
		t.Errorf("Unwrap() = %v, want nil", unwrapped)
	}
}

func TestFileMissingError(t *testing.T) {
	err := NewFileMissingError("/path/to/file.txt", nil)

	if got := err.Error(); got != "file not found: /path/to/file.txt" {
		t.Errorf("Error() = %q", got)
	}

	if err.Path != "/path/to/file.txt" {
		t.Errorf("Path = %q, want %q", err.Path, "/path/to/file.txt")
	}
}

func TestMissingMetadataError(t *testing.T) {
	err := NewMissingMetadataError("/path/to/file.txt")

	if got := err.Error(); got != "missing required metadata in file: /path/to/file.txt" {
		t.Errorf("Error() = %q", got)
	}

	if err.Path != "/path/to/file.txt" {
		t.Errorf("Path = %q, want %q", err.Path, "/path/to/file.txt")
	}
}

func TestInvalidMetadataError(t *testing.T) {
	cause := errors.New("parse error")
	err := NewInvalidMetadataError("/path/to/file.txt", "bad TOML", cause)

	expected := "invalid metadata in file /path/to/file.txt: bad TOML"
	if got := err.Error(); got != expected {
		t.Errorf("Error() = %q, want %q", got, expected)
	}

	if err.Path != "/path/to/file.txt" {
		t.Errorf("Path = %q, want %q", err.Path, "/path/to/file.txt")
	}

	if err.Detail != "bad TOML" {
		t.Errorf("Detail = %q, want %q", err.Detail, "bad TOML")
	}
}

func TestMalformedHeaderError(t *testing.T) {
	err := NewMalformedHeaderError("/path/to/file.txt")

	if got := err.Error(); got != "malformed header in file: /path/to/file.txt" {
		t.Errorf("Error() = %q", got)
	}
}

func TestFormatError(t *testing.T) {
	err := NewFormatError([]string{"name", "status"}, []string{"age"})

	expected := "missing format variables: [name, status]"
	if got := err.Error(); got != expected {
		t.Errorf("Error() = %q, want %q", got, expected)
	}

	if len(err.Missing) != 2 {
		t.Errorf("Missing length = %d, want 2", len(err.Missing))
	}

	if len(err.Provided) != 1 {
		t.Errorf("Provided length = %d, want 1", len(err.Provided))
	}
}

func TestIsFileMissing(t *testing.T) {
	err := NewFileMissingError("/path", nil)
	if !IsFileMissing(err) {
		t.Error("IsFileMissing() should return true for FileMissingError")
	}

	if IsFileMissing(errors.New("other error")) {
		t.Error("IsFileMissing() should return false for other errors")
	}
}

func TestIsMissingMetadata(t *testing.T) {
	err := NewMissingMetadataError("/path")
	if !IsMissingMetadata(err) {
		t.Error("IsMissingMetadata() should return true for MissingMetadataError")
	}

	if IsMissingMetadata(errors.New("other error")) {
		t.Error("IsMissingMetadata() should return false for other errors")
	}
}

func TestIsInvalidMetadata(t *testing.T) {
	err := NewInvalidMetadataError("/path", "detail", nil)
	if !IsInvalidMetadata(err) {
		t.Error("IsInvalidMetadata() should return true for InvalidMetadataError")
	}

	if IsInvalidMetadata(errors.New("other error")) {
		t.Error("IsInvalidMetadata() should return false for other errors")
	}
}

func TestIsMalformedHeader(t *testing.T) {
	err := NewMalformedHeaderError("/path")
	if !IsMalformedHeader(err) {
		t.Error("IsMalformedHeader() should return true for MalformedHeaderError")
	}

	if IsMalformedHeader(errors.New("other error")) {
		t.Error("IsMalformedHeader() should return false for other errors")
	}
}

func TestIsFormatError(t *testing.T) {
	err := NewFormatError([]string{"name"}, nil)
	if !IsFormatError(err) {
		t.Error("IsFormatError() should return true for FormatError")
	}

	if IsFormatError(errors.New("other error")) {
		t.Error("IsFormatError() should return false for other errors")
	}
}

func TestErrorWrapping(t *testing.T) {
	cause := errors.New("root cause")
	err := NewFileMissingError("/path", cause)

	if !errors.Is(err, cause) {
		t.Error("errors.Is() should find wrapped cause")
	}
}
