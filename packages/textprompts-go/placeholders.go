package textprompts

import (
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// placeholderPattern matches {name}, {}, or {name:format} placeholders.
// Captures the placeholder name in group 1.
var placeholderPattern = regexp.MustCompile(`\{([^}:]*)(?::[^}]*)?\}`)

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
			if _, exists := seen[name]; !exists {
				seen[name] = struct{}{}
				placeholders = append(placeholders, name)
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
	return validateFormatBindings(placeholders, nil, values)
}

func validateFormatBindings(placeholders []string, args []interface{}, values map[string]interface{}) error {
	missing := make([]string, 0, len(placeholders))
	provided := make([]string, 0, len(values)+len(args))

	for k := range values {
		provided = append(provided, k)
	}
	for idx := range args {
		provided = append(provided, strconv.Itoa(idx))
	}
	if len(args) > 0 {
		provided = append(provided, "")
	}
	sort.Strings(provided)

	for _, ph := range placeholders {
		if ph == "" && len(args) > 0 {
			continue
		}
		if _, exists := values[ph]; exists {
			continue
		}
		if idx, err := strconv.Atoi(ph); err == nil && idx >= 0 && idx < len(args) {
			continue
		}
		missing = append(missing, ph)
	}

	if len(missing) > 0 {
		sort.Strings(missing)

		return NewFormatError(missing, provided)
	}

	return nil
}

func countEmptyPlaceholders(text string) int {
	temp := strings.ReplaceAll(text, "{{", "")
	temp = strings.ReplaceAll(temp, "}}", "")
	matches := placeholderPattern.FindAllStringSubmatch(temp, -1)

	count := 0
	for _, match := range matches {
		if len(match) >= 2 && strings.TrimSpace(match[1]) == "" {
			count++
		}
	}

	return count
}
