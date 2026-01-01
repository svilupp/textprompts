package textprompts

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/BurntSushi/toml"
)

const (
	// FrontmatterDelimiter marks the start and end of TOML frontmatter.
	FrontmatterDelimiter = "---"
)

// splitFrontMatter separates metadata from body content.
// Returns the TOML content, body content, and whether frontmatter was found.
func splitFrontMatter(content string) (tomlContent, body string, hasFrontmatter bool) {
	lines := strings.Split(content, "\n")

	// Check for opening delimiter on first line
	if len(lines) == 0 || strings.TrimSpace(lines[0]) != FrontmatterDelimiter {
		return "", content, false
	}

	// Find closing delimiter
	closingIdx := -1
	for i := 1; i < len(lines); i++ {
		if strings.TrimSpace(lines[i]) == FrontmatterDelimiter {
			closingIdx = i
			break
		}
	}

	if closingIdx == -1 {
		// No closing delimiter found - treat as no frontmatter
		return "", content, false
	}

	// Extract TOML content (between delimiters)
	tomlContent = strings.Join(lines[1:closingIdx], "\n")

	// Extract body (after closing delimiter)
	if closingIdx+1 < len(lines) {
		body = strings.Join(lines[closingIdx+1:], "\n")
		// Trim leading newline from body if present
		body = strings.TrimPrefix(body, "\n")
	} else {
		body = ""
	}

	return tomlContent, body, true
}

// parseFile reads and parses a prompt file.
func parseFile(path string, mode MetadataMode) (*Prompt, error) {
	// Read file contents
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, NewFileMissingError(path, err)
		}
		return nil, &TextPromptsError{
			Message: "failed to read file",
			Cause:   err,
		}
	}

	// Get absolute path
	absPath, err := filepath.Abs(path)
	if err != nil {
		absPath = path
	}

	return parseString(string(data), mode, absPath)
}

// parseString parses prompt content from a string.
func parseString(content string, mode MetadataMode, sourcePath string) (*Prompt, error) {
	prompt := &Prompt{
		Path: sourcePath,
	}

	// Handle IGNORE mode - treat entire content as body
	if mode == ModeIgnore {
		prompt.Prompt = NewPromptString(content)
		// Set title from filename if available
		if sourcePath != "" {
			baseName := filepath.Base(sourcePath)
			ext := filepath.Ext(baseName)
			title := strings.TrimSuffix(baseName, ext)
			prompt.Meta.Title = &title
		}
		return prompt, nil
	}

	// Try to split frontmatter
	tomlContent, body, hasFrontmatter := splitFrontMatter(content)

	if !hasFrontmatter {
		// No frontmatter found
		if mode == ModeStrict {
			return nil, NewMissingMetadataError(sourcePath)
		}
		// ALLOW mode - use content as body, set title from filename
		prompt.Prompt = NewPromptString(content)
		if sourcePath != "" {
			baseName := filepath.Base(sourcePath)
			ext := filepath.Ext(baseName)
			title := strings.TrimSuffix(baseName, ext)
			prompt.Meta.Title = &title
		}
		return prompt, nil
	}

	// Parse TOML metadata
	var meta PromptMeta
	if _, err := toml.Decode(tomlContent, &meta); err != nil {
		return nil, NewInvalidMetadataError(sourcePath, err.Error(), err)
	}

	// Validate in strict mode
	if mode == ModeStrict {
		if err := meta.Validate(); err != nil {
			return nil, NewInvalidMetadataError(sourcePath, err.Error(), nil)
		}
	}

	prompt.Meta = meta
	prompt.Prompt = NewPromptString(body)

	return prompt, nil
}

// FromPath loads a prompt from a file path.
func FromPath(path string, opts ...LoadOption) (*Prompt, error) {
	return LoadPrompt(path, opts...)
}

// FromString parses a prompt from string content.
// Useful for bundled content or testing.
func FromString(content string, opts ...LoadOption) (*Prompt, error) {
	options := defaultLoadOptions()
	for _, opt := range opts {
		opt(options)
	}

	mode := options.mode
	if mode == nil {
		m := GetMetadata()
		mode = &m
	}

	return parseString(content, *mode, "")
}
