package textprompts

import (
	"testing"
)

func TestMetadataModeString(t *testing.T) {
	tests := []struct {
		mode     MetadataMode
		expected string
	}{
		{ModeAllow, "allow"},
		{ModeStrict, "strict"},
		{ModeIgnore, "ignore"},
	}

	for _, tt := range tests {
		t.Run(tt.expected, func(t *testing.T) {
			if got := tt.mode.String(); got != tt.expected {
				t.Errorf("MetadataMode.String() = %q, want %q", got, tt.expected)
			}
		})
	}
}

func TestParseMetadataMode(t *testing.T) {
	tests := []struct {
		input    string
		expected MetadataMode
		wantErr  bool
	}{
		{"allow", ModeAllow, false},
		{"ALLOW", ModeAllow, false},
		{"Allow", ModeAllow, false},
		{"strict", ModeStrict, false},
		{"STRICT", ModeStrict, false},
		{"ignore", ModeIgnore, false},
		{"IGNORE", ModeIgnore, false},
		{"  allow  ", ModeAllow, false},
		{"invalid", ModeAllow, true},
		{"", ModeAllow, true},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got, err := ParseMetadataMode(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("ParseMetadataMode(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
				return
			}
			if !tt.wantErr && got != tt.expected {
				t.Errorf("ParseMetadataMode(%q) = %v, want %v", tt.input, got, tt.expected)
			}
		})
	}
}

func TestSetGetMetadata(t *testing.T) {
	// Save original mode
	original := GetMetadata()
	defer SetMetadata(original)

	// Test setting different modes
	modes := []MetadataMode{ModeStrict, ModeIgnore, ModeAllow}
	for _, mode := range modes {
		SetMetadata(mode)
		if got := GetMetadata(); got != mode {
			t.Errorf("GetMetadata() = %v, want %v", got, mode)
		}
	}
}

func TestSetMetadataFromString(t *testing.T) {
	// Save original mode
	original := GetMetadata()
	defer SetMetadata(original)

	tests := []struct {
		input    string
		expected MetadataMode
		wantErr  bool
	}{
		{"strict", ModeStrict, false},
		{"allow", ModeAllow, false},
		{"ignore", ModeIgnore, false},
		{"invalid", ModeAllow, true},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			err := SetMetadataFromString(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("SetMetadataFromString(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
				return
			}
			if !tt.wantErr {
				if got := GetMetadata(); got != tt.expected {
					t.Errorf("GetMetadata() after SetMetadataFromString(%q) = %v, want %v", tt.input, got, tt.expected)
				}
			}
		})
	}
}

func TestSkipMetadata(t *testing.T) {
	// Save original mode
	original := GetMetadata()
	defer SetMetadata(original)

	SkipMetadata()
	if got := GetMetadata(); got != ModeIgnore {
		t.Errorf("GetMetadata() after SkipMetadata() = %v, want %v", got, ModeIgnore)
	}
}

func TestWarnOnIgnoredMetadata(t *testing.T) {
	// Save original setting
	original := WarnOnIgnoredMetadata()
	defer SetWarnOnIgnoredMetadata(original)

	// Test setting to false
	SetWarnOnIgnoredMetadata(false)
	if got := WarnOnIgnoredMetadata(); got != false {
		t.Errorf("WarnOnIgnoredMetadata() = %v, want false", got)
	}

	// Test setting to true
	SetWarnOnIgnoredMetadata(true)
	if got := WarnOnIgnoredMetadata(); got != true {
		t.Errorf("WarnOnIgnoredMetadata() = %v, want true", got)
	}
}

func TestDefaultMetadataMode(t *testing.T) {
	// Save and restore original mode
	original := GetMetadata()
	defer SetMetadata(original)

	// Reset to default
	SetMetadata(ModeAllow)

	// Default should be ModeAllow
	if got := GetMetadata(); got != ModeAllow {
		t.Errorf("Default GetMetadata() = %v, want %v", got, ModeAllow)
	}
}
