package textprompts

import (
	"fmt"
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

// PromptMeta contains optional metadata from the TOML frontmatter.
type PromptMeta struct {
	Title       *string   `toml:"title"`
	Version     *string   `toml:"version"`
	Author      *string   `toml:"author"`
	Created     *TomlDate `toml:"created"`
	Description *string   `toml:"description"`
}

// IsEmpty returns true if all fields are nil or empty.
func (m PromptMeta) IsEmpty() bool {
	return (m.Title == nil || *m.Title == "") &&
		(m.Version == nil || *m.Version == "") &&
		(m.Author == nil || *m.Author == "") &&
		(m.Description == nil || *m.Description == "") &&
		m.Created == nil
}

// Validate checks required fields for strict mode.
// Returns an error if title, description, or version is missing or empty.
func (m PromptMeta) Validate() error {
	var missing []string

	if m.Title == nil || *m.Title == "" {
		missing = append(missing, "title")
	}
	if m.Description == nil || *m.Description == "" {
		missing = append(missing, "description")
	}
	if m.Version == nil || *m.Version == "" {
		missing = append(missing, "version")
	}

	if len(missing) > 0 {
		return fmt.Errorf("missing required metadata fields: %v", missing)
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
