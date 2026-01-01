package textprompts

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadPrompt(t *testing.T) {
	tests := []struct { //nolint:govet // table field order is for readability
		name      string
		file      string
		mode      MetadataMode
		wantTitle string
		wantBody  string
		wantErr   bool
		errType   string
	}{
		{
			name:      "simple file",
			file:      "testdata/valid/simple.txt",
			mode:      ModeAllow,
			wantTitle: "simple",
			wantBody:  "Hello {name}! Welcome to our service.",
		},
		{
			name:      "with metadata",
			file:      "testdata/valid/with_metadata.txt",
			mode:      ModeAllow,
			wantTitle: "Customer Greeting",
		},
		{
			name:      "partial metadata",
			file:      "testdata/valid/partial_metadata.txt",
			mode:      ModeAllow,
			wantTitle: "Partial Metadata",
		},
		{
			name:    "missing file",
			file:    "testdata/nonexistent.txt",
			mode:    ModeAllow,
			wantErr: true,
			errType: "FileMissingError",
		},
		{
			name:    "malformed toml",
			file:    "testdata/invalid/malformed_toml.txt",
			mode:    ModeAllow,
			wantErr: true,
			errType: "InvalidMetadataError",
		},
		{
			name:      "ignore mode",
			file:      "testdata/valid/with_metadata.txt",
			mode:      ModeIgnore,
			wantTitle: "with_metadata",
		},
		{
			name:    "strict mode missing metadata",
			file:    "testdata/valid/simple.txt",
			mode:    ModeStrict,
			wantErr: true,
			errType: "MissingMetadataError",
		},
		{
			name:    "strict mode partial metadata",
			file:    "testdata/valid/partial_metadata.txt",
			mode:    ModeStrict,
			wantErr: true,
			errType: "InvalidMetadataError",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			prompt, err := LoadPrompt(tt.file, WithMetadataMode(tt.mode))
			if (err != nil) != tt.wantErr {
				t.Errorf("LoadPrompt() error = %v, wantErr %v", err, tt.wantErr)

				return
			}

			if tt.wantErr {
				switch tt.errType {
				case "FileMissingError":
					if !IsFileMissing(err) {
						t.Errorf("LoadPrompt() error type = %T, want FileMissingError", err)
					}
				case "InvalidMetadataError":
					if !IsInvalidMetadata(err) {
						t.Errorf("LoadPrompt() error type = %T, want InvalidMetadataError", err)
					}
				case "MissingMetadataError":
					if !IsMissingMetadata(err) {
						t.Errorf("LoadPrompt() error type = %T, want MissingMetadataError", err)
					}
				}

				return
			}

			if tt.wantTitle != "" {
				if prompt.Meta.Title == nil || *prompt.Meta.Title != tt.wantTitle {
					got := ""
					if prompt.Meta.Title != nil {
						got = *prompt.Meta.Title
					}
					t.Errorf("LoadPrompt() title = %q, want %q", got, tt.wantTitle)
				}
			}

			if tt.wantBody != "" {
				if prompt.Prompt.String() != tt.wantBody {
					t.Errorf("LoadPrompt() body = %q, want %q", prompt.Prompt.String(), tt.wantBody)
				}
			}

			// Check that path is set
			if prompt.Path == "" {
				t.Error("LoadPrompt() path should be set")
			}
		})
	}
}

func TestLoadPrompts(t *testing.T) {
	t.Run("load directory", func(t *testing.T) {
		prompts, err := LoadPrompts([]string{"testdata/valid"}, WithMetadataMode(ModeAllow))
		if err != nil {
			t.Fatalf("LoadPrompts() error = %v", err)
		}
		if len(prompts) == 0 {
			t.Error("LoadPrompts() returned no prompts")
		}
	})

	t.Run("load directory recursive", func(t *testing.T) {
		prompts, err := LoadPrompts([]string{"testdata/valid"}, WithRecursive(), WithMetadataMode(ModeAllow))
		if err != nil {
			t.Fatalf("LoadPrompts() error = %v", err)
		}

		// Should include nested/prompt.txt
		foundNested := false
		for _, p := range prompts {
			if filepath.Base(filepath.Dir(p.Path)) == "nested" {
				foundNested = true
				break
			}
		}
		if !foundNested {
			t.Error("LoadPrompts() should find nested prompts with recursive option")
		}
	})

	t.Run("load with glob pattern", func(t *testing.T) {
		prompts, err := LoadPrompts([]string{"testdata/valid"}, WithGlob("*.txt"), WithMetadataMode(ModeAllow))
		if err != nil {
			t.Fatalf("LoadPrompts() error = %v", err)
		}
		if len(prompts) == 0 {
			t.Error("LoadPrompts() returned no prompts")
		}
	})

	t.Run("load with max files", func(t *testing.T) {
		prompts, err := LoadPrompts([]string{"testdata/valid"}, WithMaxFiles(2), WithRecursive(), WithMetadataMode(ModeAllow))
		if err != nil {
			t.Fatalf("LoadPrompts() error = %v", err)
		}
		if len(prompts) > 2 {
			t.Errorf("LoadPrompts() returned %d prompts, want <= 2", len(prompts))
		}
	})

	t.Run("load single file", func(t *testing.T) {
		prompts, err := LoadPrompts([]string{"testdata/valid/simple.txt"}, WithMetadataMode(ModeAllow))
		if err != nil {
			t.Fatalf("LoadPrompts() error = %v", err)
		}
		if len(prompts) != 1 {
			t.Errorf("LoadPrompts() returned %d prompts, want 1", len(prompts))
		}
	})

	t.Run("load multiple paths", func(t *testing.T) {
		prompts, err := LoadPrompts(
			[]string{"testdata/valid/simple.txt", "testdata/valid/with_metadata.txt"},
			WithMetadataMode(ModeAllow),
		)
		if err != nil {
			t.Fatalf("LoadPrompts() error = %v", err)
		}
		if len(prompts) != 2 {
			t.Errorf("LoadPrompts() returned %d prompts, want 2", len(prompts))
		}
	})

	t.Run("deduplicate files", func(t *testing.T) {
		prompts, err := LoadPrompts(
			[]string{"testdata/valid/simple.txt", "testdata/valid/simple.txt"},
			WithMetadataMode(ModeAllow),
		)
		if err != nil {
			t.Fatalf("LoadPrompts() error = %v", err)
		}
		if len(prompts) != 1 {
			t.Errorf("LoadPrompts() returned %d prompts, want 1 (deduplicated)", len(prompts))
		}
	})
}

func TestLoadPromptEdgeCases(t *testing.T) {
	t.Run("empty file", func(t *testing.T) {
		prompt, err := LoadPrompt("testdata/edge_cases/empty.txt", WithMetadataMode(ModeAllow))
		if err != nil {
			t.Fatalf("LoadPrompt() error = %v", err)
		}
		if prompt.Prompt.String() != "" {
			t.Errorf("LoadPrompt() body = %q, want empty", prompt.Prompt.String())
		}
	})

	t.Run("no body", func(t *testing.T) {
		prompt, err := LoadPrompt("testdata/edge_cases/no_body.txt", WithMetadataMode(ModeAllow))
		if err != nil {
			t.Fatalf("LoadPrompt() error = %v", err)
		}
		if prompt.Meta.Title == nil || *prompt.Meta.Title != "No Body" {
			t.Error("LoadPrompt() should parse metadata even with empty body")
		}
	})

	t.Run("escaped braces", func(t *testing.T) {
		prompt, err := LoadPrompt("testdata/edge_cases/escaped_braces.txt", WithMetadataMode(ModeAllow))
		if err != nil {
			t.Fatalf("LoadPrompt() error = %v", err)
		}
		placeholders := prompt.Prompt.Placeholders()
		// Should find "name" and "placeholder", but not escaped {{literal}} or {{name}}
		if len(placeholders) != 2 {
			t.Errorf("LoadPrompt() placeholders = %v, want [name, placeholder]", placeholders)
		}
	})

	t.Run("unicode content", func(t *testing.T) {
		prompt, err := LoadPrompt("testdata/edge_cases/unicode.txt", WithMetadataMode(ModeAllow))
		if err != nil {
			t.Fatalf("LoadPrompt() error = %v", err)
		}
		if prompt.Meta.Author == nil || *prompt.Meta.Author != "作者名" {
			t.Error("LoadPrompt() should handle unicode in metadata")
		}
		placeholders := prompt.Prompt.Placeholders()
		if len(placeholders) != 2 {
			t.Errorf("LoadPrompt() placeholders count = %d, want 2", len(placeholders))
		}
	})
}

func TestFromPath(t *testing.T) {
	prompt, err := FromPath("testdata/valid/simple.txt", WithMetadataMode(ModeAllow))
	if err != nil {
		t.Fatalf("FromPath() error = %v", err)
	}
	if prompt.Path == "" {
		t.Error("FromPath() should set path")
	}
}

func TestLoadPromptWithGlobalMode(t *testing.T) {
	// Save and restore original mode
	original := GetMetadata()
	defer SetMetadata(original)

	SetMetadata(ModeIgnore)

	prompt, err := LoadPrompt("testdata/valid/with_metadata.txt")
	if err != nil {
		t.Fatalf("LoadPrompt() error = %v", err)
	}

	// In ignore mode, the frontmatter should be part of the body
	if prompt.Meta.Title == nil || *prompt.Meta.Title != "with_metadata" {
		t.Error("LoadPrompt() should use filename as title in ignore mode")
	}
}

func TestLoadPromptAbsolutePath(t *testing.T) {
	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("os.Getwd() error = %v", err)
	}

	absPath := filepath.Join(wd, "testdata", "valid", "simple.txt")
	prompt, err := LoadPrompt(absPath, WithMetadataMode(ModeAllow))
	if err != nil {
		t.Fatalf("LoadPrompt() error = %v", err)
	}
	if prompt.Path != absPath {
		t.Errorf("LoadPrompt() path = %q, want %q", prompt.Path, absPath)
	}
}
