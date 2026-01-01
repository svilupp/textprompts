package textprompts

import (
	"fmt"
	"regexp"
	"strings"
)

// Markers for escaped braces during formatting.
const (
	escapedOpenMarker  = "\x00OPEN\x00"
	escapedCloseMarker = "\x00CLOSE\x00"
)

// PromptString wraps a string with placeholder tracking and safe formatting.
type PromptString struct {
	content      string
	placeholders []string
}

// NewPromptString creates a PromptString, extracting placeholders from the content.
func NewPromptString(content string) PromptString {
	return PromptString{
		content:      content,
		placeholders: ExtractPlaceholders(content),
	}
}

// String returns the raw content.
func (ps PromptString) String() string {
	return ps.content
}

// Content returns the raw prompt content (alias for String).
func (ps PromptString) Content() string {
	return ps.content
}

// Placeholders returns a copy of the placeholder names found in the prompt.
// Returns nil if there are no placeholders.
func (ps PromptString) Placeholders() []string {
	if len(ps.placeholders) == 0 {
		return nil
	}
	result := make([]string, len(ps.placeholders))
	copy(result, ps.placeholders)

	return result
}

// FormatOption configures formatting behavior.
type FormatOption func(*formatOptions)

type formatOptions struct {
	skipValidation bool
}

// WithSkipValidation allows partial formatting without all placeholders.
func WithSkipValidation() FormatOption {
	return func(o *formatOptions) {
		o.skipValidation = true
	}
}

// Format replaces placeholders with provided values.
// Returns an error if required placeholders are missing (unless WithSkipValidation is used).
func (ps PromptString) Format(values map[string]interface{}, opts ...FormatOption) (string, error) {
	// Parse options
	options := &formatOptions{}
	for _, opt := range opts {
		opt(options)
	}

	// Validate unless skipped
	if !options.skipValidation {
		if err := ValidateFormatArgs(ps.placeholders, values); err != nil {
			return "", err
		}
	}

	// Perform replacement
	result := ps.content

	// First, replace escaped braces with markers
	result = strings.ReplaceAll(result, "{{", escapedOpenMarker)
	result = strings.ReplaceAll(result, "}}", escapedCloseMarker)

	// Replace each placeholder with its value
	for name, value := range values {
		// Handle {name} and {name:format} patterns
		pattern := regexp.MustCompile(`\{` + regexp.QuoteMeta(name) + `(?::[^{}]*)?\}`)
		strValue := formatValue(value)
		result = pattern.ReplaceAllString(result, strValue)
	}

	// Restore escaped braces
	result = strings.ReplaceAll(result, escapedOpenMarker, "{")
	result = strings.ReplaceAll(result, escapedCloseMarker, "}")

	return result, nil
}

// MustFormat is like Format but panics on error.
func (ps PromptString) MustFormat(values map[string]interface{}, opts ...FormatOption) string {
	result, err := ps.Format(values, opts...)
	if err != nil {
		panic(err)
	}

	return result
}

// formatValue converts a value to its string representation.
func formatValue(v interface{}) string {
	switch val := v.(type) {
	case string:
		return val
	case fmt.Stringer:
		return val.String()
	default:
		return fmt.Sprintf("%v", val)
	}
}
