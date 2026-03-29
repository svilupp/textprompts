package textprompts

import (
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/BurntSushi/toml"
	"gopkg.in/yaml.v3"
)

const (
	// FrontmatterDelimiter marks the start and end of prompt frontmatter.
	FrontmatterDelimiter = "---"

	ignoredMetadataWarningMessage = "Metadata detected but ignored; use SetMetadata(ModeAllow) or SetWarnOnIgnoredMetadata(false) to silence"
)

// FrontmatterFormat controls how metadata is serialized on save.
type FrontmatterFormat string

const (
	// FrontmatterFormatTOML writes TOML frontmatter between --- delimiters.
	FrontmatterFormatTOML FrontmatterFormat = "toml"
	// FrontmatterFormatYAML writes YAML frontmatter between --- delimiters.
	FrontmatterFormatYAML FrontmatterFormat = "yaml"
)

// FrontMatterFormat is an exported alias matching the TypeScript/Python terminology.
type FrontMatterFormat = FrontmatterFormat

const (
	// FrontMatterTOML is an exported alias for FrontmatterFormatTOML.
	FrontMatterTOML = FrontmatterFormatTOML
	// FrontMatterYAML is an exported alias for FrontmatterFormatYAML.
	FrontMatterYAML = FrontmatterFormatYAML
)

func splitFrontMatter(content string) (header, body string, hasFrontmatter bool, err error) {
	normalized := normalizeNewlines(content)
	if !strings.HasPrefix(normalized, FrontmatterDelimiter) {
		return "", normalized, false, nil
	}
	if len(normalized) > len(FrontmatterDelimiter) && normalized[len(FrontmatterDelimiter)] != '\n' {
		return "", "", false, NewMalformedHeaderError("", "Opening delimiter '---' must be on its own line")
	}

	lines := strings.Split(normalized, "\n")
	closingIdx := -1
	for idx, line := range lines {
		if idx == 0 {
			continue
		}
		if line == FrontmatterDelimiter {
			closingIdx = idx
			break
		}
	}
	if closingIdx == -1 {
		return "", "", false, NewMalformedHeaderError("", "Missing closing delimiter '---' for front matter")
	}

	header = strings.TrimSpace(strings.Join(lines[1:closingIdx], "\n"))
	body = strings.Join(lines[closingIdx+1:], "\n")
	body = strings.TrimPrefix(body, "\n")

	return header, body, true, nil
}

func parseHeader(headerText string) (map[string]interface{}, error) {
	data, err := parseTOMLHeader(headerText)
	if err == nil {
		return data, nil
	}
	tomlErr := err

	data, err = parseYAMLHeader(headerText)
	if err == nil {
		return data, nil
	}

	var invalid *InvalidMetadataError
	if errors.As(err, &invalid) {
		return nil, invalid
	}

	return nil, fmt.Errorf(
		"invalid TOML in front matter: %w; use ModeIgnore to skip metadata parsing",
		tomlErr,
	)
}

func parseTOMLHeader(headerText string) (map[string]interface{}, error) {
	if strings.TrimSpace(headerText) == "" {
		return map[string]interface{}{}, nil
	}

	var data map[string]interface{}
	if _, err := toml.Decode(headerText, &data); err != nil {
		return nil, fmt.Errorf("decode TOML header: %w", err)
	}

	return normalizeStringMap(data), nil
}

func parseYAMLHeader(headerText string) (map[string]interface{}, error) {
	var parsed interface{}
	if err := yaml.Unmarshal([]byte(headerText), &parsed); err != nil {
		return nil, fmt.Errorf("decode YAML header: %w", err)
	}
	if parsed == nil {
		return map[string]interface{}{}, nil
	}

	normalized := normalizeFrontmatterValue(parsed)
	mapping, ok := normalized.(map[string]interface{})
	if !ok {
		return nil, &InvalidMetadataError{
			Base: Error{
				Message: "front matter must be a mapping",
			},
			Detail: "Front matter must be a mapping; use ModeIgnore to skip metadata parsing",
		}
	}

	return mapping, nil
}

func normalizeFrontmatterValue(value interface{}) interface{} {
	switch v := value.(type) {
	case map[string]interface{}:
		return normalizeStringMap(v)
	case map[interface{}]interface{}:
		normalized := make(map[string]interface{}, len(v))
		for key, nested := range v {
			normalized[fmt.Sprint(key)] = normalizeFrontmatterValue(nested)
		}

		return normalized
	case []interface{}:
		normalized := make([]interface{}, len(v))
		for idx, nested := range v {
			normalized[idx] = normalizeFrontmatterValue(nested)
		}

		return normalized
	case []map[string]interface{}:
		normalized := make([]interface{}, len(v))
		for idx, nested := range v {
			normalized[idx] = normalizeStringMap(nested)
		}

		return normalized
	case time.Time:
		return formatTimeValue(v)
	default:
		return value
	}
}

func normalizeStringMap(input map[string]interface{}) map[string]interface{} {
	if len(input) == 0 {
		return map[string]interface{}{}
	}

	normalized := make(map[string]interface{}, len(input))
	for key, value := range input {
		normalized[key] = normalizeFrontmatterValue(value)
	}

	return normalized
}

func sanitizeForTOML(value interface{}) (interface{}, bool) {
	switch v := value.(type) {
	case nil:
		return nil, false
	case map[string]interface{}:
		out := make(map[string]interface{}, len(v))
		for key, nested := range v {
			sanitized, ok := sanitizeForTOML(nested)
			if ok {
				out[key] = sanitized
			}
		}

		return out, true
	case []interface{}:
		out := make([]interface{}, 0, len(v))
		for _, nested := range v {
			sanitized, ok := sanitizeForTOML(nested)
			if !ok {
				return nil, false
			}
			out = append(out, sanitized)
		}

		return out, true
	default:
		return normalizeFrontmatterValue(value), true
	}
}

func normalizeFrontmatterFormat(format FrontmatterFormat) (FrontmatterFormat, error) {
	switch strings.ToLower(strings.TrimSpace(string(format))) {
	case "", string(FrontmatterFormatTOML):
		return FrontmatterFormatTOML, nil
	case string(FrontmatterFormatYAML):
		return FrontmatterFormatYAML, nil
	default:
		return "", fmt.Errorf("unsupported frontmatter format: %q", format)
	}
}

func normalizeTOMLValue(value interface{}) (interface{}, bool) {
	return sanitizeForTOML(value)
}

func formatTimeValue(t time.Time) string {
	if t.Hour() == 0 && t.Minute() == 0 && t.Second() == 0 && t.Nanosecond() == 0 {
		return t.Format("2006-01-02")
	}

	return t.Format(time.RFC3339)
}

func looksLikeFrontmatter(content string) bool {
	_, _, hasFrontmatter, err := splitFrontMatter(content)
	return err == nil && hasFrontmatter
}

func normalizeNewlines(input string) string {
	normalized := strings.ReplaceAll(input, "\r\n", "\n")

	return strings.ReplaceAll(normalized, "\r", "\n")
}

func dedent(input string) string {
	normalized := normalizeNewlines(input)
	lines := strings.Split(normalized, "\n")
	minIndent := -1

	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		indent := leadingWhitespaceWidth(line)
		if minIndent == -1 || indent < minIndent {
			minIndent = indent
		}
	}

	if minIndent <= 0 {
		return normalized
	}

	for idx, line := range lines {
		if strings.TrimSpace(line) == "" {
			lines[idx] = ""
			continue
		}
		lines[idx] = trimLeadingWhitespace(line, minIndent)
	}

	return strings.Join(lines, "\n")
}

func leadingWhitespaceWidth(line string) int {
	width := 0
	for _, r := range line {
		if r != ' ' && r != '\t' {
			break
		}
		width++
	}

	return width
}

func trimLeadingWhitespace(line string, width int) string {
	consumed := 0
	for idx, r := range line {
		if consumed >= width {
			return line[idx:]
		}
		if r != ' ' && r != '\t' {
			return line[idx:]
		}
		consumed++
	}

	return ""
}

func ignoredMetadataWarner(message string) {
	_, _ = fmt.Fprintln(os.Stderr, message)
}
