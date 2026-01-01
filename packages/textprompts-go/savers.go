package textprompts

import (
	"bytes"
	"os"
	"path/filepath"
	"time"

	"github.com/BurntSushi/toml"
)

// SavePrompt writes a prompt to a file with TOML frontmatter.
func SavePrompt(path string, prompt *Prompt) error {
	content, err := formatPromptContent(prompt.Meta, prompt.Prompt.String())
	if err != nil {
		return err
	}

	// Ensure directory exists
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return &TextPromptsError{
			Message: "failed to create directory",
			Cause:   err,
		}
	}

	// Write file
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		return &TextPromptsError{
			Message: "failed to write file",
			Cause:   err,
		}
	}

	return nil
}

// SavePromptContent writes prompt content with metadata to a file.
func SavePromptContent(path string, meta PromptMeta, content string) error {
	formatted, err := formatPromptContent(meta, content)
	if err != nil {
		return err
	}

	// Ensure directory exists
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return &TextPromptsError{
			Message: "failed to create directory",
			Cause:   err,
		}
	}

	// Write file
	if err := os.WriteFile(path, []byte(formatted), 0644); err != nil {
		return &TextPromptsError{
			Message: "failed to write file",
			Cause:   err,
		}
	}

	return nil
}

// formatPromptContent formats metadata and content into a prompt file string.
func formatPromptContent(meta PromptMeta, content string) (string, error) {
	var buf bytes.Buffer

	// Check if metadata has any non-empty fields
	if !meta.IsEmpty() {
		buf.WriteString(FrontmatterDelimiter)
		buf.WriteString("\n")

		// Build a map for TOML encoding (only non-nil fields)
		metaMap := make(map[string]interface{})

		if meta.Title != nil && *meta.Title != "" {
			metaMap["title"] = *meta.Title
		}
		if meta.Version != nil && *meta.Version != "" {
			metaMap["version"] = *meta.Version
		}
		if meta.Author != nil && *meta.Author != "" {
			metaMap["author"] = *meta.Author
		}
		if meta.Description != nil && *meta.Description != "" {
			metaMap["description"] = *meta.Description
		}
		if meta.Created != nil {
			// Format as date only (YYYY-MM-DD) for TOML
			metaMap["created"] = meta.Created.Time.Format("2006-01-02")
		}

		if err := toml.NewEncoder(&buf).Encode(metaMap); err != nil {
			return "", &TextPromptsError{
				Message: "failed to encode metadata",
				Cause:   err,
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
