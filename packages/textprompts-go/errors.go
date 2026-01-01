// Package textprompts provides error types for prompt loading and formatting.
package textprompts

import (
	"errors"
	"fmt"
	"strings"
)

// TextPromptsError is the base error type for all textprompts errors.
type TextPromptsError struct {
	Message string
	Cause   error
}

func (e *TextPromptsError) Error() string {
	if e.Cause != nil {
		return fmt.Sprintf("%s: %v", e.Message, e.Cause)
	}
	return e.Message
}

func (e *TextPromptsError) Unwrap() error {
	return e.Cause
}

// FileMissingError indicates the specified file was not found.
type FileMissingError struct {
	TextPromptsError
	Path string
}

func (e *FileMissingError) Error() string {
	return fmt.Sprintf("file not found: %s", e.Path)
}

// NewFileMissingError creates a new FileMissingError.
func NewFileMissingError(path string, cause error) *FileMissingError {
	return &FileMissingError{
		TextPromptsError: TextPromptsError{
			Message: fmt.Sprintf("file not found: %s", path),
			Cause:   cause,
		},
		Path: path,
	}
}

// MissingMetadataError indicates required metadata is missing in strict mode.
type MissingMetadataError struct {
	TextPromptsError
	Path string
}

func (e *MissingMetadataError) Error() string {
	if e.Path != "" {
		return fmt.Sprintf("missing required metadata in file: %s", e.Path)
	}
	return "missing required metadata"
}

// NewMissingMetadataError creates a new MissingMetadataError.
func NewMissingMetadataError(path string) *MissingMetadataError {
	return &MissingMetadataError{
		TextPromptsError: TextPromptsError{
			Message: fmt.Sprintf("missing required metadata in file: %s", path),
		},
		Path: path,
	}
}

// InvalidMetadataError indicates malformed or invalid TOML metadata.
type InvalidMetadataError struct {
	TextPromptsError
	Path   string
	Detail string
}

func (e *InvalidMetadataError) Error() string {
	if e.Path != "" {
		return fmt.Sprintf("invalid metadata in file %s: %s", e.Path, e.Detail)
	}
	return fmt.Sprintf("invalid metadata: %s", e.Detail)
}

// NewInvalidMetadataError creates a new InvalidMetadataError.
func NewInvalidMetadataError(path, detail string, cause error) *InvalidMetadataError {
	return &InvalidMetadataError{
		TextPromptsError: TextPromptsError{
			Message: fmt.Sprintf("invalid metadata: %s", detail),
			Cause:   cause,
		},
		Path:   path,
		Detail: detail,
	}
}

// MalformedHeaderError indicates the frontmatter structure is invalid.
type MalformedHeaderError struct {
	TextPromptsError
	Path string
}

func (e *MalformedHeaderError) Error() string {
	if e.Path != "" {
		return fmt.Sprintf("malformed header in file: %s", e.Path)
	}
	return "malformed header"
}

// NewMalformedHeaderError creates a new MalformedHeaderError.
func NewMalformedHeaderError(path string) *MalformedHeaderError {
	return &MalformedHeaderError{
		TextPromptsError: TextPromptsError{
			Message: fmt.Sprintf("malformed header in file: %s", path),
		},
		Path: path,
	}
}

// FormatError indicates a placeholder formatting error.
type FormatError struct {
	TextPromptsError
	Missing  []string
	Provided []string
}

func (e *FormatError) Error() string {
	return fmt.Sprintf("missing format variables: [%s]", strings.Join(e.Missing, ", "))
}

// NewFormatError creates a new FormatError.
func NewFormatError(missing, provided []string) *FormatError {
	return &FormatError{
		TextPromptsError: TextPromptsError{
			Message: fmt.Sprintf("missing format variables: [%s]", strings.Join(missing, ", ")),
		},
		Missing:  missing,
		Provided: provided,
	}
}

// Error type checking helpers

// IsFileMissing checks if the error is a FileMissingError.
func IsFileMissing(err error) bool {
	var e *FileMissingError
	return errors.As(err, &e)
}

// IsMissingMetadata checks if the error is a MissingMetadataError.
func IsMissingMetadata(err error) bool {
	var e *MissingMetadataError
	return errors.As(err, &e)
}

// IsInvalidMetadata checks if the error is an InvalidMetadataError.
func IsInvalidMetadata(err error) bool {
	var e *InvalidMetadataError
	return errors.As(err, &e)
}

// IsMalformedHeader checks if the error is a MalformedHeaderError.
func IsMalformedHeader(err error) bool {
	var e *MalformedHeaderError
	return errors.As(err, &e)
}

// IsFormatError checks if the error is a FormatError.
func IsFormatError(err error) bool {
	var e *FormatError
	return errors.As(err, &e)
}
