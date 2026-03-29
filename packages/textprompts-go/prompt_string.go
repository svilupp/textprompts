package textprompts

import (
	"fmt"
	"strconv"
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
	return ps.formatWithBindings(nil, values, opts...)
}

// FormatArgs replaces placeholders with positional and keyword values.
func (ps PromptString) FormatArgs(args []interface{}, kwargs map[string]interface{}, opts ...FormatOption) (string, error) {
	return ps.formatWithBindings(args, kwargs, opts...)
}

func (ps PromptString) formatWithBindings(args []interface{}, kwargs map[string]interface{}, opts ...FormatOption) (string, error) {
	if kwargs == nil {
		kwargs = map[string]interface{}{}
	}

	// Parse options
	options := &formatOptions{}
	for _, opt := range opts {
		opt(options)
	}

	// Validate unless skipped
	if !options.skipValidation {
		if err := validateFormatBindings(ps.placeholders, args, kwargs); err != nil {
			return "", err
		}
		emptyPlaceholderCount := countEmptyPlaceholders(ps.content)
		if emptyPlaceholderCount > len(args) {
			if _, ok := kwargs[""]; ok {
				emptyPlaceholderCount = len(args)
			}
		}
		if emptyPlaceholderCount > len(args) {
			return "", fmt.Errorf(
				"missing positional format variables for empty placeholders: expected %d, received %d",
				countEmptyPlaceholders(ps.content),
				len(args),
			)
		}
	}

	// Perform replacement
	result := ps.content

	// First, replace escaped braces with markers
	result = strings.ReplaceAll(result, "{{", escapedOpenMarker)
	result = strings.ReplaceAll(result, "}}", escapedCloseMarker)

	emptyPlaceholderIndex := 0
	result = placeholderPattern.ReplaceAllStringFunc(result, func(match string) string {
		parts := placeholderPattern.FindStringSubmatch(match)
		if len(parts) < 2 {
			return match
		}

		key := strings.TrimSpace(parts[1])
		if key == "" {
			if emptyPlaceholderIndex >= len(args) {
				if value, exists := kwargs[""]; exists {
					if value == nil && options.skipValidation {
						return match
					}

					return formatValue(value)
				}

				return match
			}
			value := args[emptyPlaceholderIndex]
			emptyPlaceholderIndex++
			if value == nil && options.skipValidation {
				return match
			}

			return formatValue(value)
		}

		if value, exists := kwargs[key]; exists {
			if value == nil && options.skipValidation {
				return match
			}

			return formatValue(value)
		}

		if index, err := strconv.Atoi(key); err == nil && index >= 0 && index < len(args) {
			value := args[index]
			if value == nil && options.skipValidation {
				return match
			}

			return formatValue(value)
		}

		return match
	})

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

// MustFormatArgs is like FormatArgs but panics on error.
func (ps PromptString) MustFormatArgs(args []interface{}, kwargs map[string]interface{}, opts ...FormatOption) string {
	result, err := ps.FormatArgs(args, kwargs, opts...)
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
