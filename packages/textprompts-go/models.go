package textprompts

import (
	"fmt"
	"strings"
	"time"
)

// TomlDate wraps time.Time to handle TOML local date parsing (YYYY-MM-DD format).
type TomlDate struct {
	time.Time
}

// UnmarshalText implements encoding.TextUnmarshaler for TOML date parsing.
// Supports both local date (YYYY-MM-DD) and RFC3339 formats.
func (d *TomlDate) UnmarshalText(text []byte) error {
	s := string(text)

	// Try local date format first (most common in prompts)
	t, err := time.Parse("2006-01-02", s)
	if err == nil {
		d.Time = t
		return nil
	}

	// Try RFC3339 format (what TOML library sometimes produces)
	t, err = time.Parse(time.RFC3339, s)
	if err == nil {
		d.Time = t
		return nil
	}

	// Return original error
	return fmt.Errorf("parsing time %q: expected YYYY-MM-DD format", s)
}

// MarshalText implements encoding.TextMarshaler for TOML date encoding.
func (d TomlDate) MarshalText() ([]byte, error) {
	return []byte(d.Time.Format("2006-01-02")), nil
}

// PromptMeta contains optional metadata from prompt frontmatter.
type PromptMeta struct {
	Title       *string                `toml:"title"`
	Version     *string                `toml:"version"`
	Author      *string                `toml:"author"`
	Created     *TomlDate              `toml:"created"`
	Description *string                `toml:"description"`
	Extras      map[string]interface{} `toml:"-" yaml:"-"`
}

// IsEmpty returns true if all fields are nil or empty.
func (m PromptMeta) IsEmpty() bool {
	return (m.Title == nil || *m.Title == "") &&
		(m.Version == nil || *m.Version == "") &&
		(m.Author == nil || *m.Author == "") &&
		(m.Description == nil || *m.Description == "") &&
		m.Created == nil &&
		len(m.Extras) == 0
}

// Validate checks required fields for strict mode.
// Returns an error if title, description, or version is missing or empty.
func (m PromptMeta) Validate() error {
	return validateStrictMetadata(m)
}

func validateStrictMetadata(m PromptMeta) error {
	var missing []string
	var empty []string

	if m.Title == nil || *m.Title == "" {
		if m.Title == nil {
			missing = append(missing, "title")
		} else {
			empty = append(empty, "title")
		}
	}
	if m.Description == nil || *m.Description == "" {
		if m.Description == nil {
			missing = append(missing, "description")
		} else {
			empty = append(empty, "description")
		}
	}
	if m.Version == nil || *m.Version == "" {
		if m.Version == nil {
			missing = append(missing, "version")
		} else {
			empty = append(empty, "version")
		}
	}

	if len(missing) > 0 {
		return fmt.Errorf("missing required metadata fields: %v", missing)
	}
	if len(empty) > 0 {
		return fmt.Errorf("empty required metadata fields: %v", empty)
	}

	return nil
}

// GetTitle returns the title or empty string if nil.
func (m PromptMeta) GetTitle() string {
	if m.Title == nil {
		return ""
	}

	return *m.Title
}

// GetVersion returns the version or empty string if nil.
func (m PromptMeta) GetVersion() string {
	if m.Version == nil {
		return ""
	}

	return *m.Version
}

// GetAuthor returns the author or empty string if nil.
func (m PromptMeta) GetAuthor() string {
	if m.Author == nil {
		return ""
	}

	return *m.Author
}

// GetDescription returns the description or empty string if nil.
func (m PromptMeta) GetDescription() string {
	if m.Description == nil {
		return ""
	}

	return *m.Description
}

// GetCreated returns the created time or zero time if nil.
func (m PromptMeta) GetCreated() time.Time {
	if m.Created == nil {
		return time.Time{}
	}

	return m.Created.Time
}

// GetExtras returns a shallow copy of the extras map.
func (m PromptMeta) GetExtras() map[string]interface{} {
	if len(m.Extras) == 0 {
		return nil
	}

	extras := make(map[string]interface{}, len(m.Extras))
	for key, value := range m.Extras {
		extras[key] = value
	}

	return extras
}

func (m PromptMeta) toMap() map[string]interface{} {
	metaMap := make(map[string]interface{})
	if m.Title != nil {
		metaMap["title"] = *m.Title
	}
	if m.Version != nil {
		metaMap["version"] = *m.Version
	}
	if m.Author != nil {
		metaMap["author"] = *m.Author
	}
	if m.Description != nil {
		metaMap["description"] = *m.Description
	}
	if m.Created != nil {
		metaMap["created"] = m.Created.Time.Format("2006-01-02")
	}
	for key, value := range m.Extras {
		metaMap[key] = normalizeFrontmatterValue(value)
	}

	return metaMap
}

func promptMetaFromMap(data map[string]interface{}) (PromptMeta, error) {
	meta := PromptMeta{}
	if len(data) == 0 {
		return meta, nil
	}

	extras := make(map[string]interface{})
	for key, value := range data {
		switch key {
		case "title":
			meta.Title = coerceToStringPtr(value)
		case "version":
			meta.Version = coerceToStringPtr(value)
		case "author":
			meta.Author = coerceToStringPtr(value)
		case "description":
			meta.Description = coerceToStringPtr(value)
		case "created":
			created, err := coerceToTomlDate(value)
			if err != nil {
				return PromptMeta{}, fmt.Errorf("invalid created metadata: %w", err)
			}
			meta.Created = created
		default:
			extras[key] = normalizeFrontmatterValue(value)
		}
	}

	if len(extras) > 0 {
		meta.Extras = extras
	}

	return meta, nil
}

func coerceToStringPtr(value interface{}) *string {
	if value == nil {
		return nil
	}

	switch v := value.(type) {
	case string:
		return StringPtr(v)
	case []byte:
		return StringPtr(string(v))
	case time.Time:
		return StringPtr(formatTimeValue(v))
	case TomlDate:
		return StringPtr(v.Time.Format("2006-01-02"))
	case *TomlDate:
		if v == nil {
			return nil
		}

		return StringPtr(v.Time.Format("2006-01-02"))
	default:
		return StringPtr(fmt.Sprint(value))
	}
}

func coerceToTomlDate(value interface{}) (*TomlDate, error) {
	if value == nil {
		return nil, nil
	}

	switch v := value.(type) {
	case *TomlDate:
		return v, nil
	case TomlDate:
		date := v
		return &date, nil
	case time.Time:
		return &TomlDate{Time: v}, nil
	}

	raw := strings.TrimSpace(fmt.Sprint(value))
	if raw == "" {
		return nil, nil
	}

	date := &TomlDate{}
	if err := date.UnmarshalText([]byte(raw)); err != nil {
		return nil, err
	}

	return date, nil
}

// Prompt represents a loaded prompt file with metadata and content.
type Prompt struct {
	Path   string       // Absolute path to the source file (empty for string-based prompts)
	Meta   PromptMeta   // Parsed metadata (may be empty)
	Prompt PromptString // The prompt content with formatting support
}

// Format is a convenience method that delegates to Prompt.Prompt.Format.
func (p *Prompt) Format(values map[string]interface{}, opts ...FormatOption) (string, error) {
	return p.Prompt.Format(values, opts...)
}

// MustFormat is a convenience method that delegates to Prompt.Prompt.MustFormat.
func (p *Prompt) MustFormat(values map[string]interface{}, opts ...FormatOption) string {
	return p.Prompt.MustFormat(values, opts...)
}

// FormatArgs formats with positional args, keyword args, or a mix of both.
func (p *Prompt) FormatArgs(args []interface{}, kwargs map[string]interface{}, opts ...FormatOption) (string, error) {
	return p.Prompt.FormatArgs(args, kwargs, opts...)
}

// MustFormatArgs is like FormatArgs but panics on error.
func (p *Prompt) MustFormatArgs(args []interface{}, kwargs map[string]interface{}, opts ...FormatOption) string {
	return p.Prompt.MustFormatArgs(args, kwargs, opts...)
}

// String returns the raw prompt content.
func (p *Prompt) String() string {
	return p.Prompt.String()
}

// Helper functions for creating pointer values

// StringPtr returns a pointer to the given string.
func StringPtr(s string) *string {
	return &s
}

// TimePtr returns a pointer to a TomlDate wrapping the given time.
func TimePtr(t time.Time) *TomlDate {
	return &TomlDate{Time: t}
}

// DatePtr creates a TomlDate pointer from a date string (YYYY-MM-DD).
func DatePtr(dateStr string) *TomlDate {
	t, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		return nil
	}

	return &TomlDate{Time: t}
}
