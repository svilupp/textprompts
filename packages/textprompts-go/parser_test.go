package textprompts

import (
	"testing"
)

func TestSplitFrontMatter(t *testing.T) {
	tests := []struct {
		name               string
		content            string
		wantToml           string
		wantBody           string
		wantHasFrontmatter bool
	}{
		{
			name: "with frontmatter",
			content: `---
title = "Test"
version = "1.0.0"
---
Body content here.`,
			wantToml:           "title = \"Test\"\nversion = \"1.0.0\"",
			wantBody:           "Body content here.",
			wantHasFrontmatter: true,
		},
		{
			name:               "no frontmatter",
			content:            "Just body content.",
			wantToml:           "",
			wantBody:           "Just body content.",
			wantHasFrontmatter: false,
		},
		{
			name: "missing closing delimiter",
			content: `---
title = "Test"
No closing delimiter.`,
			wantToml:           "",
			wantBody:           "---\ntitle = \"Test\"\nNo closing delimiter.",
			wantHasFrontmatter: false,
		},
		{
			name:               "empty content",
			content:            "",
			wantToml:           "",
			wantBody:           "",
			wantHasFrontmatter: false,
		},
		{
			name: "frontmatter with empty body",
			content: `---
title = "Test"
---
`,
			wantToml:           "title = \"Test\"",
			wantBody:           "",
			wantHasFrontmatter: true,
		},
		{
			name: "multiline body",
			content: `---
title = "Test"
---
Line 1
Line 2
Line 3`,
			wantToml:           "title = \"Test\"",
			wantBody:           "Line 1\nLine 2\nLine 3",
			wantHasFrontmatter: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotToml, gotBody, gotHas := splitFrontMatter(tt.content)
			if gotToml != tt.wantToml {
				t.Errorf("splitFrontMatter() toml = %q, want %q", gotToml, tt.wantToml)
			}
			if gotBody != tt.wantBody {
				t.Errorf("splitFrontMatter() body = %q, want %q", gotBody, tt.wantBody)
			}
			if gotHas != tt.wantHasFrontmatter {
				t.Errorf("splitFrontMatter() hasFrontmatter = %v, want %v", gotHas, tt.wantHasFrontmatter)
			}
		})
	}
}

func TestFromString(t *testing.T) {
	tests := []struct {
		name        string
		content     string
		mode        MetadataMode
		wantTitle   string
		wantVersion string
		wantBody    string
		wantErr     bool
	}{
		{
			name: "with metadata allow mode",
			content: `---
title = "Test Prompt"
version = "1.0.0"
description = "A test"
---
Hello {name}!`,
			mode:        ModeAllow,
			wantTitle:   "Test Prompt",
			wantVersion: "1.0.0",
			wantBody:    "Hello {name}!",
		},
		{
			name:     "no metadata allow mode",
			content:  "Hello {name}!",
			mode:     ModeAllow,
			wantBody: "Hello {name}!",
		},
		{
			name:     "ignore mode ignores frontmatter",
			content:  "---\ntitle = \"Test\"\n---\nBody",
			mode:     ModeIgnore,
			wantBody: "---\ntitle = \"Test\"\n---\nBody",
		},
		{
			name:    "strict mode requires metadata",
			content: "Hello {name}!",
			mode:    ModeStrict,
			wantErr: true,
		},
		{
			name: "strict mode validates fields",
			content: `---
title = "Test"
---
Hello!`,
			mode:    ModeStrict,
			wantErr: true, // Missing description and version
		},
		{
			name: "strict mode accepts complete metadata",
			content: `---
title = "Test"
version = "1.0.0"
description = "A test prompt"
---
Hello!`,
			mode:        ModeStrict,
			wantTitle:   "Test",
			wantVersion: "1.0.0",
			wantBody:    "Hello!",
		},
		{
			name: "invalid toml",
			content: `---
title = "Missing quote
---
Body`,
			mode:    ModeAllow,
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			prompt, err := FromString(tt.content, WithMetadataMode(tt.mode))
			if (err != nil) != tt.wantErr {
				t.Errorf("FromString() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if tt.wantErr {
				return
			}

			if got := prompt.Prompt.String(); got != tt.wantBody {
				t.Errorf("FromString() body = %q, want %q", got, tt.wantBody)
			}
			if tt.wantTitle != "" {
				if prompt.Meta.Title == nil || *prompt.Meta.Title != tt.wantTitle {
					t.Errorf("FromString() title = %v, want %q", prompt.Meta.Title, tt.wantTitle)
				}
			}
			if tt.wantVersion != "" {
				if prompt.Meta.Version == nil || *prompt.Meta.Version != tt.wantVersion {
					t.Errorf("FromString() version = %v, want %q", prompt.Meta.Version, tt.wantVersion)
				}
			}
		})
	}
}
