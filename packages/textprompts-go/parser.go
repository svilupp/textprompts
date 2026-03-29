package textprompts

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// parseFile reads and parses a prompt file.
func parseFile(path string, mode MetadataMode) (*Prompt, error) {
	// Read file contents
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, NewFileMissingError(path, err)
		}

		return nil, &Error{
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
	normalizedContent := normalizeNewlines(content)
	prompt := &Prompt{
		Path: sourcePath,
	}

	// Handle IGNORE mode - treat entire content as body
	if mode == ModeIgnore {
		if WarnOnIgnoredMetadata() && looksLikeFrontmatter(normalizedContent) {
			ignoredMetadataWarner(ignoredMetadataWarningMessage)
		}
		prompt.Prompt = NewPromptString(dedent(normalizedContent))
		// Set title from filename if available
		if sourcePath != "" {
			title := titleFromSourcePath(sourcePath)
			prompt.Meta.Title = &title
		}

		return prompt, nil
	}

	// Try to split frontmatter
	headerText, body, hasFrontmatter, err := splitFrontMatter(normalizedContent)
	if err != nil {
		detail := err.Error()
		if strings.HasPrefix(normalizedContent, FrontmatterDelimiter) {
			detail = fmt.Sprintf(
				"%s. If this content has no metadata and starts with '---', use ModeIgnore to skip metadata parsing",
				detail,
			)
		}

		return nil, NewInvalidMetadataError(sourcePath, detail, err)
	}

	if !hasFrontmatter {
		// No frontmatter found
		if mode == ModeStrict {
			return nil, NewMissingMetadataError(sourcePath)
		}
		// ALLOW mode - use content as body, set title from filename
		prompt.Prompt = NewPromptString(dedent(normalizedContent))
		if sourcePath != "" {
			title := titleFromSourcePath(sourcePath)
			prompt.Meta.Title = &title
		}

		return prompt, nil
	}

	data, err := parseHeader(headerText)
	if err != nil {
		return nil, NewInvalidMetadataError(sourcePath, err.Error(), err)
	}

	meta, err := promptMetaFromMap(data)
	if err != nil {
		return nil, NewInvalidMetadataError(sourcePath, err.Error(), err)
	}

	if mode == ModeStrict {
		if err := validateStrictMetadata(meta); err != nil {
			return nil, NewInvalidMetadataError(sourcePath, err.Error(), nil)
		}
	}

	prompt.Meta = meta
	if prompt.Meta.Title == nil && sourcePath != "" {
		title := titleFromSourcePath(sourcePath)
		prompt.Meta.Title = &title
	}
	prompt.Prompt = NewPromptString(dedent(body))

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

func titleFromSourcePath(sourcePath string) string {
	baseName := filepath.Base(sourcePath)
	ext := filepath.Ext(baseName)

	return strings.TrimSuffix(baseName, ext)
}
