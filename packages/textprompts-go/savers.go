package textprompts

import (
	"bytes"
	"os"
	"path/filepath"
	"time"

	"github.com/BurntSushi/toml"
	"gopkg.in/yaml.v3"
)

type saveOptions struct {
	format FrontmatterFormat
}

func defaultSaveOptions() *saveOptions {
	return &saveOptions{
		format: FrontmatterFormatTOML,
	}
}

// SaveOption configures prompt serialization.
type SaveOption func(*saveOptions)

// WithFrontmatterFormat overrides the default TOML frontmatter output format.
func WithFrontmatterFormat(format FrontmatterFormat) SaveOption {
	return func(o *saveOptions) {
		o.format = format
	}
}

// WithFrontMatterFormat is an exported alias matching the TypeScript/Python naming.
func WithFrontMatterFormat(format FrontMatterFormat) SaveOption {
	return WithFrontmatterFormat(format)
}

// SavePrompt writes a prompt to a file with TOML or YAML frontmatter.
func SavePrompt(path string, prompt *Prompt, opts ...SaveOption) error {
	options := defaultSaveOptions()
	for _, opt := range opts {
		opt(options)
	}

	content, err := formatPromptContent(prompt.Meta, prompt.Prompt.String(), options.format)
	if err != nil {
		return err
	}

	// Ensure directory exists
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return &Error{
			Message: "failed to create directory",
			Cause:   err,
		}
	}

	// Write file
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		return &Error{
			Message: "failed to write file",
			Cause:   err,
		}
	}

	return nil
}

// SavePromptContent writes prompt content with metadata to a file.
func SavePromptContent(path string, meta PromptMeta, content string, opts ...SaveOption) error {
	options := defaultSaveOptions()
	for _, opt := range opts {
		opt(options)
	}

	formatted, err := formatPromptContent(meta, content, options.format)
	if err != nil {
		return err
	}

	// Ensure directory exists
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return &Error{
			Message: "failed to create directory",
			Cause:   err,
		}
	}

	// Write file
	if err := os.WriteFile(path, []byte(formatted), 0o600); err != nil {
		return &Error{
			Message: "failed to write file",
			Cause:   err,
		}
	}

	return nil
}

// formatPromptContent formats metadata and content into a prompt file string.
func formatPromptContent(meta PromptMeta, content string, format FrontmatterFormat) (string, error) {
	var buf bytes.Buffer
	resolvedFormat, err := normalizeFrontmatterFormat(format)
	if err != nil {
		return "", &Error{
			Message: "failed to encode metadata",
			Cause:   err,
		}
	}

	// Check if metadata has any non-empty fields
	if !meta.IsEmpty() {
		metaMap := meta.toMap()
		buf.WriteString(FrontmatterDelimiter)
		buf.WriteString("\n")

		switch resolvedFormat {
		case FrontmatterFormatTOML:
			filtered := make(map[string]interface{}, len(metaMap))
			for key, value := range metaMap {
				cleaned, ok := normalizeTOMLValue(value)
				if !ok {
					continue
				}
				filtered[key] = cleaned
			}
			if len(filtered) == 0 {
				return content, nil
			}
			if err := toml.NewEncoder(&buf).Encode(filtered); err != nil {
				return "", &Error{
					Message: "failed to encode metadata",
					Cause:   err,
				}
			}
		case FrontmatterFormatYAML:
			payload, err := yaml.Marshal(metaMap)
			if err != nil {
				return "", &Error{
					Message: "failed to encode metadata",
					Cause:   err,
				}
			}
			buf.Write(payload)
			if len(payload) == 0 || payload[len(payload)-1] != '\n' {
				buf.WriteString("\n")
			}
		}
		buf.WriteString(FrontmatterDelimiter)
		buf.WriteString("\n")
	}

	buf.WriteString(content)

	return buf.String(), nil
}

// NewPrompt creates a new Prompt with the given metadata and content.
func NewPrompt(meta PromptMeta, content string) *Prompt {
	return &Prompt{
		Meta:   meta,
		Prompt: NewPromptString(content),
	}
}

// NewPromptWithTitle creates a new Prompt with just a title and content.
func NewPromptWithTitle(title, content string) *Prompt {
	return &Prompt{
		Meta: PromptMeta{
			Title: &title,
		},
		Prompt: NewPromptString(content),
	}
}

// NewPromptFull creates a new Prompt with all common metadata fields.
func NewPromptFull(title, version, description, author, content string) *Prompt {
	return &Prompt{
		Meta: PromptMeta{
			Title:       &title,
			Version:     &version,
			Description: &description,
			Author:      &author,
			Created:     TimePtr(time.Now()),
		},
		Prompt: NewPromptString(content),
	}
}
