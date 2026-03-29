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

func TestLoadSection(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "textprompts-section-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer func() { _ = os.RemoveAll(tmpDir) }()

	markdownPath := filepath.Join(tmpDir, "prompt.txt")
	markdownContent := `---
title = "Demo"
description = "Demo prompt"
version = "1.0.0"
---
Prelude line.

# Title Section
Alpha line.
Beta line.`
	if writeErr := os.WriteFile(markdownPath, []byte(markdownContent), 0o600); writeErr != nil {
		t.Fatalf("Failed to write prompt file: %v", writeErr)
	}

	markdownPrompt, err := LoadSection(markdownPath, "Title Section", WithMetadataMode(ModeAllow))
	if err != nil {
		t.Fatalf("LoadSection() markdown error = %v", err)
	}
	if markdownPrompt.Path == "" {
		t.Fatal("LoadSection() should set prompt path")
	}
	if markdownPrompt.Meta.Title == nil || *markdownPrompt.Meta.Title != "prompt" {
		t.Fatalf("LoadSection() title = %v, want prompt", markdownPrompt.Meta.Title)
	}
	if got := markdownPrompt.Prompt.String(); got != "Alpha line.\nBeta line." {
		t.Fatalf("LoadSection() markdown body = %q, want %q", got, "Alpha line.\nBeta line.")
	}

	xmlPath := filepath.Join(tmpDir, "xml.txt")
	xmlContent := `<callout id="Important Note">XML body</callout>`
	if writeErr := os.WriteFile(xmlPath, []byte(xmlContent), 0o600); writeErr != nil {
		t.Fatalf("Failed to write xml prompt file: %v", writeErr)
	}

	xmlPrompt, err := LoadSection(xmlPath, "Important Note", WithMetadataMode(ModeAllow))
	if err != nil {
		t.Fatalf("LoadSection() xml error = %v", err)
	}
	if got := xmlPrompt.Prompt.String(); got != "XML body" {
		t.Fatalf("LoadSection() xml body = %q, want %q", got, "XML body")
	}
}

func TestLoadSectionMissingSection(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "textprompts-section-missing-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer func() { _ = os.RemoveAll(tmpDir) }()

	path := filepath.Join(tmpDir, "prompt.txt")
	if err := os.WriteFile(path, []byte("# Heading\n\nBody."), 0o600); err != nil {
		t.Fatalf("Failed to write prompt file: %v", err)
	}

	if _, err := LoadSection(path, "missing", WithMetadataMode(ModeAllow)); err == nil {
		t.Fatal("LoadSection() should fail for missing section")
	}
}
