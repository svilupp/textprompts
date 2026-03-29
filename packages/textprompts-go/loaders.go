package textprompts

import (
	"fmt"
	"os"
	"path/filepath"
)

// loadOptions holds configuration for loading prompts.
type loadOptions struct {
	mode *MetadataMode
}

func defaultLoadOptions() *loadOptions {
	return &loadOptions{
		mode: nil, // Use global default
	}
}

// LoadOption configures loading behavior.
type LoadOption func(*loadOptions)

// WithMetadataMode overrides the global metadata mode for this load.
func WithMetadataMode(mode MetadataMode) LoadOption {
	return func(o *loadOptions) {
		o.mode = &mode
	}
}

// LoadPrompt loads a single prompt file.
func LoadPrompt(path string, opts ...LoadOption) (*Prompt, error) {
	options := defaultLoadOptions()
	for _, opt := range opts {
		opt(options)
	}

	mode := options.mode
	if mode == nil {
		m := GetMetadata()
		mode = &m
	}

	return parseFile(path, *mode)
}

// LoadSection loads a specific section from a prompt file by anchor ID.
func LoadSection(path, anchorID string, opts ...LoadOption) (*Prompt, error) {
	options := defaultLoadOptions()
	for _, opt := range opts {
		opt(options)
	}

	mode := options.mode
	if mode == nil {
		m := GetMetadata()
		mode = &m
	}

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

	absPath, err := filepath.Abs(path)
	if err != nil {
		absPath = path
	}

	sectionText, ok := GetSectionText(string(data), anchorID)
	if !ok {
		return nil, &Error{
			Message: fmt.Sprintf("section %q not found in %s", anchorID, absPath),
		}
	}

	return parseString(sectionText, *mode, absPath)
}
