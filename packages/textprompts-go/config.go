package textprompts

import (
	"fmt"
	"os"
	"strings"
	"sync"
)

// MetadataMode defines how the parser handles TOML frontmatter.
type MetadataMode int

const (
	// ModeAllow parses metadata if present, allows missing/empty fields (DEFAULT).
	ModeAllow MetadataMode = iota
	// ModeStrict requires title, description, and version to be non-empty.
	ModeStrict
	// ModeIgnore treats entire file as body, uses filename as title.
	ModeIgnore
)

// String returns the string representation of the mode.
func (m MetadataMode) String() string {
	switch m {
	case ModeAllow:
		return "allow"
	case ModeStrict:
		return "strict"
	case ModeIgnore:
		return "ignore"
	default:
		return fmt.Sprintf("MetadataMode(%d)", m)
	}
}

// ParseMetadataMode converts a string to MetadataMode.
// Accepts: "strict", "allow", "ignore" (case-insensitive).
func ParseMetadataMode(s string) (MetadataMode, error) {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "allow":
		return ModeAllow, nil
	case "strict":
		return ModeStrict, nil
	case "ignore":
		return ModeIgnore, nil
	default:
		return ModeAllow, fmt.Errorf("invalid metadata mode: %q (expected 'strict', 'allow', or 'ignore')", s)
	}
}

// Global configuration state.
var (
	globalMode            = ModeAllow
	globalModeMu          sync.RWMutex
	warnOnIgnoredMetadata = true
	warnMu                sync.RWMutex
)

func init() {
	// Check environment variable for default mode
	if envMode := os.Getenv("TEXTPROMPTS_METADATA_MODE"); envMode != "" {
		if mode, err := ParseMetadataMode(envMode); err == nil {
			globalMode = mode
		}
	}
}

// SetMetadata sets the global default metadata mode.
func SetMetadata(mode MetadataMode) {
	globalModeMu.Lock()
	defer globalModeMu.Unlock()
	globalMode = mode
}

// SetMetadataFromString sets the global default metadata mode from a string.
// Accepts: "strict", "allow", "ignore" (case-insensitive).
func SetMetadataFromString(s string) error {
	mode, err := ParseMetadataMode(s)
	if err != nil {
		return err
	}
	SetMetadata(mode)

	return nil
}

// GetMetadata returns the current global metadata mode.
func GetMetadata() MetadataMode {
	globalModeMu.RLock()
	defer globalModeMu.RUnlock()

	return globalMode
}

// SkipMetadata is a convenience function that sets mode to ModeIgnore.
func SkipMetadata() {
	SetMetadata(ModeIgnore)
}

// WarnOnIgnoredMetadata returns whether warnings are enabled for ignored metadata.
func WarnOnIgnoredMetadata() bool {
	warnMu.RLock()
	defer warnMu.RUnlock()

	return warnOnIgnoredMetadata
}

// SetWarnOnIgnoredMetadata enables/disables warnings for ignored metadata.
func SetWarnOnIgnoredMetadata(warn bool) {
	warnMu.Lock()
	defer warnMu.Unlock()
	warnOnIgnoredMetadata = warn
}
