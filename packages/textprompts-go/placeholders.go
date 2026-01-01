package textprompts

import (
	"regexp"
	"sort"
	"strings"
)

// placeholderPattern matches {name} or {name:format} placeholders.
// Captures the placeholder name in group 1.
var placeholderPattern = regexp.MustCompile(`\{([^{}:]+)(?::[^{}]*)?\}`)

// ExtractPlaceholders finds all placeholder names in a template string.
// Returns a sorted slice of unique placeholder names.
func ExtractPlaceholders(text string) []string {
	// Remove escaped braces so they don't interfere with placeholder matching
	// {{ becomes empty, }} becomes empty
	// This correctly handles cases like {{{key}}} -> {key}
	temp := strings.ReplaceAll(text, "{{", "")
	temp = strings.ReplaceAll(temp, "}}", "")

	// Find all matches
	matches := placeholderPattern.FindAllStringSubmatch(temp, -1)

	// Collect unique placeholder names
	seen := make(map[string]struct{})
	var placeholders []string

	for _, match := range matches {
		if len(match) >= 2 {
			name := strings.TrimSpace(match[1])
			if name != "" {
				if _, exists := seen[name]; !exists {
					seen[name] = struct{}{}
					placeholders = append(placeholders, name)
				}
			}
		}
	}

	// Sort for consistent ordering
	sort.Strings(placeholders)

	return placeholders
}

// ValidateFormatArgs checks that all placeholders have values provided.
// Returns a FormatError if any placeholders are missing.
func ValidateFormatArgs(placeholders []string, values map[string]interface{}) error {
	var missing []string
	provided := make([]string, 0, len(values))

	for k := range values {
		provided = append(provided, k)
	}
	sort.Strings(provided)

	for _, ph := range placeholders {
		if _, exists := values[ph]; !exists {
			missing = append(missing, ph)
		}
	}

	if len(missing) > 0 {
		sort.Strings(missing)

		return NewFormatError(missing, provided)
	}

	return nil
}
