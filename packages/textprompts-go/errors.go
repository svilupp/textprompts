// Package textprompts provides error types for prompt loading and formatting.
package textprompts

import (
	"errors"
	"fmt"
	"strings"
)

// Error is the base error type for all textprompts errors.
//
//nolint:govet // Field layout is acceptable for this small error type.
type Error struct {
	Message string
	Cause   error
}

func (e *Error) Error() string {
	if e.Cause != nil {
		return fmt.Sprintf("%s: %v", e.Message, e.Cause)
	}

	return e.Message
}

func (e *Error) Unwrap() error {
	return e.Cause
}

// FileMissingError indicates the specified file was not found.
type FileMissingError struct {
	Base Error
	Path string
}

func (e *FileMissingError) Error() string {
	return fmt.Sprintf("file not found: %s", e.Path)
}

func (e *FileMissingError) Unwrap() error {
	return e.Base.Cause
}

// NewFileMissingError creates a new FileMissingError.
func NewFileMissingError(path string, cause error) *FileMissingError {
	return &FileMissingError{
		Base: Error{
			Message: fmt.Sprintf("file not found: %s", path),
			Cause:   cause,
		},
		Path: path,
	}
}

// MissingMetadataError indicates required metadata is missing in strict mode.
type MissingMetadataError struct {
	Base Error
	Path string
}

func (e *MissingMetadataError) Error() string {
	if e.Path != "" {
		return fmt.Sprintf("missing required metadata in file: %s", e.Path)
	}

	return "missing required metadata"
}

func (e *MissingMetadataError) Unwrap() error {
	return e.Base.Cause
}

// NewMissingMetadataError creates a new MissingMetadataError.
func NewMissingMetadataError(path string) *MissingMetadataError {
	return &MissingMetadataError{
		Base: Error{
			Message: fmt.Sprintf("missing required metadata in file: %s", path),
		},
		Path: path,
	}
}

// InvalidMetadataError indicates malformed or invalid TOML metadata.
type InvalidMetadataError struct {
	Base   Error
	Path   string
	Detail string
}

func (e *InvalidMetadataError) Error() string {
	if e.Path != "" {
		return fmt.Sprintf("invalid metadata in file %s: %s", e.Path, e.Detail)
	}

	return fmt.Sprintf("invalid metadata: %s", e.Detail)
}

func (e *InvalidMetadataError) Unwrap() error {
	return e.Base.Cause
}

// NewInvalidMetadataError creates a new InvalidMetadataError.
func NewInvalidMetadataError(path, detail string, cause error) *InvalidMetadataError {
	return &InvalidMetadataError{
		Base: Error{
			Message: fmt.Sprintf("invalid metadata: %s", detail),
			Cause:   cause,
		},
		Path:   path,
		Detail: detail,
	}
}

// MalformedHeaderError indicates the frontmatter structure is invalid.
type MalformedHeaderError struct {
	Base Error
	Path string
}

func (e *MalformedHeaderError) Error() string {
	if e.Path != "" {
		return fmt.Sprintf("malformed header in file: %s", e.Path)
	}

	return "malformed header"
}

func (e *MalformedHeaderError) Unwrap() error {
	return e.Base.Cause
}

// NewMalformedHeaderError creates a new MalformedHeaderError.
func NewMalformedHeaderError(path string) *MalformedHeaderError {
	return &MalformedHeaderError{
		Base: Error{
			Message: fmt.Sprintf("malformed header in file: %s", path),
		},
		Path: path,
	}
}

// FormatError indicates a placeholder formatting error.
type FormatError struct {
	Base     Error
	Missing  []string
	Provided []string
}

func (e *FormatError) Error() string {
	return fmt.Sprintf("missing format variables: [%s]", strings.Join(e.Missing, ", "))
}

func (e *FormatError) Unwrap() error {
	return e.Base.Cause
}

// NewFormatError creates a new FormatError.
func NewFormatError(missing, provided []string) *FormatError {
	return &FormatError{
		Base: Error{
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
