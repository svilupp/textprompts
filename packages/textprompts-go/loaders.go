package textprompts

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
