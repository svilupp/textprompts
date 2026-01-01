package textprompts

import (
	"os"
	"path/filepath"

	"github.com/bmatcuk/doublestar/v4"
)

// loadOptions holds configuration for loading prompts.
type loadOptions struct {
	mode      *MetadataMode
	recursive bool
	glob      string
	maxFiles  int
}

func defaultLoadOptions() *loadOptions {
	return &loadOptions{
		mode:      nil, // Use global default
		recursive: false,
		glob:      "*.txt",
		maxFiles:  1000,
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

// WithRecursive enables recursive directory traversal.
func WithRecursive() LoadOption {
	return func(o *loadOptions) {
		o.recursive = true
	}
}

// WithGlob sets the glob pattern for file matching (default: "*.txt").
func WithGlob(pattern string) LoadOption {
	return func(o *loadOptions) {
		o.glob = pattern
	}
}

// WithMaxFiles limits the number of files loaded.
func WithMaxFiles(n int) LoadOption {
	return func(o *loadOptions) {
		o.maxFiles = n
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

// LoadPrompts loads multiple prompts from paths, directories, or glob patterns.
func LoadPrompts(paths []string, opts ...LoadOption) ([]*Prompt, error) {
	options := defaultLoadOptions()
	for _, opt := range opts {
		opt(options)
	}

	mode := options.mode
	if mode == nil {
		m := GetMetadata()
		mode = &m
	}

	var allFiles []string

	for _, path := range paths {
		files, err := resolvePath(path, options)
		if err != nil {
			return nil, err
		}
		allFiles = append(allFiles, files...)
	}

	// Deduplicate files
	seen := make(map[string]struct{})
	var uniqueFiles []string
	for _, f := range allFiles {
		absPath, err := filepath.Abs(f)
		if err != nil {
			absPath = f
		}
		if _, exists := seen[absPath]; !exists {
			seen[absPath] = struct{}{}
			uniqueFiles = append(uniqueFiles, f)
		}
	}

	// Apply max files limit
	if options.maxFiles > 0 && len(uniqueFiles) > options.maxFiles {
		uniqueFiles = uniqueFiles[:options.maxFiles]
	}

	// Load all prompts
	prompts := make([]*Prompt, 0, len(uniqueFiles))
	for _, file := range uniqueFiles {
		prompt, err := parseFile(file, *mode)
		if err != nil {
			return nil, err
		}
		prompts = append(prompts, prompt)
	}

	return prompts, nil
}

// resolvePath resolves a path to a list of files.
// Handles directories, glob patterns, and individual files.
func resolvePath(path string, options *loadOptions) ([]string, error) {
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			// Try as glob pattern
			return resolveGlob(path)
		}
		return nil, &TextPromptsError{
			Message: "failed to access path",
			Cause:   err,
		}
	}

	if !info.IsDir() {
		// Single file
		return []string{path}, nil
	}

	// Directory - find matching files
	return findFilesInDir(path, options)
}

// findFilesInDir finds files matching the glob pattern in a directory.
func findFilesInDir(dir string, options *loadOptions) ([]string, error) {
	var pattern string
	if options.recursive {
		pattern = filepath.Join(dir, "**", options.glob)
	} else {
		pattern = filepath.Join(dir, options.glob)
	}

	// Use doublestar for glob matching
	matches, err := doublestar.FilepathGlob(pattern)
	if err != nil {
		return nil, &TextPromptsError{
			Message: "invalid glob pattern",
			Cause:   err,
		}
	}

	// Filter out directories
	var files []string
	for _, match := range matches {
		info, err := os.Stat(match)
		if err != nil {
			continue
		}
		if !info.IsDir() {
			files = append(files, match)
		}
	}

	return files, nil
}

// resolveGlob resolves a glob pattern to matching files.
func resolveGlob(pattern string) ([]string, error) {
	matches, err := doublestar.FilepathGlob(pattern)
	if err != nil {
		return nil, &TextPromptsError{
			Message: "invalid glob pattern",
			Cause:   err,
		}
	}

	// Filter out directories
	var files []string
	for _, match := range matches {
		info, err := os.Stat(match)
		if err != nil {
			continue
		}
		if !info.IsDir() {
			files = append(files, match)
		}
	}

	return files, nil
}
