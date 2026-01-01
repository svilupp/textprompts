package textprompts

import (
	"testing"
	"time"
)

func TestPromptMetaIsEmpty(t *testing.T) {
	tests := []struct { //nolint:govet // table field order is for readability
		name     string
		meta     PromptMeta
		expected bool
	}{
		{
			name:     "all nil",
			meta:     PromptMeta{},
			expected: true,
		},
		{
			name: "empty strings",
			meta: PromptMeta{
				Title:       StringPtr(""),
				Version:     StringPtr(""),
				Description: StringPtr(""),
				Author:      StringPtr(""),
			},
			expected: true,
		},
		{
			name: "with title",
			meta: PromptMeta{
				Title: StringPtr("Test"),
			},
			expected: false,
		},
		{
			name: "with version",
			meta: PromptMeta{
				Version: StringPtr("1.0.0"),
			},
			expected: false,
		},
		{
			name: "with created",
			meta: PromptMeta{
				Created: TimePtr(time.Now()),
			},
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.meta.IsEmpty(); got != tt.expected {
				t.Errorf("PromptMeta.IsEmpty() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestPromptMetaValidate(t *testing.T) {
	tests := []struct { //nolint:govet // table field order is for readability
		name    string
		meta    PromptMeta
		wantErr bool
	}{
		{
			name: "complete metadata",
			meta: PromptMeta{
				Title:       StringPtr("Test"),
				Version:     StringPtr("1.0.0"),
				Description: StringPtr("A test prompt"),
			},
			wantErr: false,
		},
		{
			name:    "all empty",
			meta:    PromptMeta{},
			wantErr: true,
		},
		{
			name: "missing title",
			meta: PromptMeta{
				Version:     StringPtr("1.0.0"),
				Description: StringPtr("A test prompt"),
			},
			wantErr: true,
		},
		{
			name: "missing version",
			meta: PromptMeta{
				Title:       StringPtr("Test"),
				Description: StringPtr("A test prompt"),
			},
			wantErr: true,
		},
		{
			name: "missing description",
			meta: PromptMeta{
				Title:   StringPtr("Test"),
				Version: StringPtr("1.0.0"),
			},
			wantErr: true,
		},
		{
			name: "empty title string",
			meta: PromptMeta{
				Title:       StringPtr(""),
				Version:     StringPtr("1.0.0"),
				Description: StringPtr("A test prompt"),
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.meta.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("PromptMeta.Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestPromptMetaGetters(t *testing.T) {
	now := time.Now()
	meta := PromptMeta{
		Title:       StringPtr("Test"),
		Version:     StringPtr("1.0.0"),
		Author:      StringPtr("Author"),
		Description: StringPtr("Description"),
		Created:     TimePtr(now),
	}

	if got := meta.GetTitle(); got != "Test" {
		t.Errorf("GetTitle() = %q, want %q", got, "Test")
	}
	if got := meta.GetVersion(); got != "1.0.0" {
		t.Errorf("GetVersion() = %q, want %q", got, "1.0.0")
	}
	if got := meta.GetAuthor(); got != "Author" {
		t.Errorf("GetAuthor() = %q, want %q", got, "Author")
	}
	if got := meta.GetDescription(); got != "Description" {
		t.Errorf("GetDescription() = %q, want %q", got, "Description")
	}
	if got := meta.GetCreated(); !got.Equal(now) {
		t.Errorf("GetCreated() = %v, want %v", got, now)
	}
}

func TestPromptMetaGettersNil(t *testing.T) {
	meta := PromptMeta{}

	if got := meta.GetTitle(); got != "" {
		t.Errorf("GetTitle() = %q, want empty", got)
	}
	if got := meta.GetVersion(); got != "" {
		t.Errorf("GetVersion() = %q, want empty", got)
	}
	if got := meta.GetAuthor(); got != "" {
		t.Errorf("GetAuthor() = %q, want empty", got)
	}
	if got := meta.GetDescription(); got != "" {
		t.Errorf("GetDescription() = %q, want empty", got)
	}
	if got := meta.GetCreated(); !got.IsZero() {
		t.Errorf("GetCreated() = %v, want zero time", got)
	}
}

func TestPromptFormat(t *testing.T) {
	prompt := &Prompt{
		Prompt: NewPromptString("Hello {name}!"),
	}

	result, err := prompt.Format(map[string]interface{}{"name": "Alice"})
	if err != nil {
		t.Fatalf("Prompt.Format() error = %v", err)
	}
	if result != "Hello Alice!" {
		t.Errorf("Prompt.Format() = %q, want %q", result, "Hello Alice!")
	}
}

func TestPromptMustFormat(t *testing.T) {
	prompt := &Prompt{
		Prompt: NewPromptString("Hello {name}!"),
	}

	result := prompt.MustFormat(map[string]interface{}{"name": "Alice"})
	if result != "Hello Alice!" {
		t.Errorf("Prompt.MustFormat() = %q, want %q", result, "Hello Alice!")
	}
}

func TestPromptString(t *testing.T) {
	prompt := &Prompt{
		Prompt: NewPromptString("Hello world!"),
	}

	if got := prompt.String(); got != "Hello world!" {
		t.Errorf("Prompt.String() = %q, want %q", got, "Hello world!")
	}
}
