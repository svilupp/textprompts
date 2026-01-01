package textprompts

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestSavePrompt(t *testing.T) {
	// Create temp directory
	tmpDir, err := os.MkdirTemp("", "textprompts-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer func() { _ = os.RemoveAll(tmpDir) }()

	t.Run("save with metadata", func(t *testing.T) {
		prompt := NewPromptFull(
			"Test Prompt",
			"1.0.0",
			"A test prompt",
			"Test Author",
			"Hello {name}!",
		)

		path := filepath.Join(tmpDir, "test.txt")
		if err := SavePrompt(path, prompt); err != nil {
			t.Fatalf("SavePrompt() error = %v", err)
		}

		// Read back and verify
		content, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("Failed to read saved file: %v", err)
		}

		contentStr := string(content)
		if !strings.Contains(contentStr, "---") {
			t.Error("Saved file should contain frontmatter delimiters")
		}
		if !strings.Contains(contentStr, `title = "Test Prompt"`) {
			t.Error("Saved file should contain title")
		}
		if !strings.Contains(contentStr, "Hello {name}!") {
			t.Error("Saved file should contain body")
		}
	})

	t.Run("save without metadata", func(t *testing.T) {
		prompt := &Prompt{
			Prompt: NewPromptString("Hello world!"),
		}

		path := filepath.Join(tmpDir, "no_meta.txt")
		if err := SavePrompt(path, prompt); err != nil {
			t.Fatalf("SavePrompt() error = %v", err)
		}

		content, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("Failed to read saved file: %v", err)
		}

		contentStr := string(content)
		if strings.Contains(contentStr, "---") {
			t.Error("Saved file without metadata should not contain frontmatter")
		}
		if contentStr != "Hello world!" {
			t.Errorf("Content = %q, want %q", contentStr, "Hello world!")
		}
	})

	t.Run("save creates directories", func(t *testing.T) {
		prompt := NewPromptWithTitle("Test", "Content")
		path := filepath.Join(tmpDir, "subdir", "nested", "test.txt")

		if err := SavePrompt(path, prompt); err != nil {
			t.Fatalf("SavePrompt() error = %v", err)
		}

		if _, err := os.Stat(path); os.IsNotExist(err) {
			t.Error("SavePrompt() should create nested directories")
		}
	})

	t.Run("roundtrip", func(t *testing.T) {
		original := NewPromptFull(
			"Roundtrip Test",
			"2.0.0",
			"Testing save and load",
			"Author",
			"Hello {user}!",
		)

		path := filepath.Join(tmpDir, "roundtrip.txt")
		if err := SavePrompt(path, original); err != nil {
			t.Fatalf("SavePrompt() error = %v", err)
		}

		loaded, err := LoadPrompt(path, WithMetadataMode(ModeAllow))
		if err != nil {
			t.Fatalf("LoadPrompt() error = %v", err)
		}

		if loaded.Meta.GetTitle() != "Roundtrip Test" {
			t.Errorf("Title = %q, want %q", loaded.Meta.GetTitle(), "Roundtrip Test")
		}
		if loaded.Meta.GetVersion() != "2.0.0" {
			t.Errorf("Version = %q, want %q", loaded.Meta.GetVersion(), "2.0.0")
		}
		if loaded.Prompt.String() != "Hello {user}!" {
			t.Errorf("Body = %q, want %q", loaded.Prompt.String(), "Hello {user}!")
		}
	})
}

func TestSavePromptContent(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "textprompts-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer func() { _ = os.RemoveAll(tmpDir) }()

	meta := PromptMeta{
		Title:   StringPtr("Content Test"),
		Version: StringPtr("1.0.0"),
	}

	path := filepath.Join(tmpDir, "content.txt")
	if saveErr := SavePromptContent(path, meta, "Test content"); saveErr != nil {
		t.Fatalf("SavePromptContent() error = %v", saveErr)
	}

	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("Failed to read saved file: %v", err)
	}

	contentStr := string(content)
	if !strings.Contains(contentStr, `title = "Content Test"`) {
		t.Error("Saved file should contain title")
	}
	if !strings.Contains(contentStr, "Test content") {
		t.Error("Saved file should contain body")
	}
}

func TestNewPrompt(t *testing.T) {
	meta := PromptMeta{
		Title: StringPtr("Test"),
	}
	prompt := NewPrompt(meta, "Hello!")

	if prompt.Meta.GetTitle() != "Test" {
		t.Errorf("Title = %q, want %q", prompt.Meta.GetTitle(), "Test")
	}
	if prompt.Prompt.String() != "Hello!" {
		t.Errorf("Content = %q, want %q", prompt.Prompt.String(), "Hello!")
	}
}

func TestNewPromptWithTitle(t *testing.T) {
	prompt := NewPromptWithTitle("My Title", "Content here")

	if prompt.Meta.GetTitle() != "My Title" {
		t.Errorf("Title = %q, want %q", prompt.Meta.GetTitle(), "My Title")
	}
	if prompt.Prompt.String() != "Content here" {
		t.Errorf("Content = %q, want %q", prompt.Prompt.String(), "Content here")
	}
}

func TestNewPromptFull(t *testing.T) {
	prompt := NewPromptFull(
		"Full Title",
		"1.2.3",
		"Full description",
		"Full Author",
		"Full content",
	)

	if prompt.Meta.GetTitle() != "Full Title" {
		t.Errorf("Title = %q, want %q", prompt.Meta.GetTitle(), "Full Title")
	}
	if prompt.Meta.GetVersion() != "1.2.3" {
		t.Errorf("Version = %q, want %q", prompt.Meta.GetVersion(), "1.2.3")
	}
	if prompt.Meta.GetDescription() != "Full description" {
		t.Errorf("Description = %q, want %q", prompt.Meta.GetDescription(), "Full description")
	}
	if prompt.Meta.GetAuthor() != "Full Author" {
		t.Errorf("Author = %q, want %q", prompt.Meta.GetAuthor(), "Full Author")
	}
	if prompt.Meta.Created == nil {
		t.Error("Created should be set")
	}
	if time.Since(prompt.Meta.Created.Time) > time.Minute {
		t.Error("Created time should be recent")
	}
	if prompt.Prompt.String() != "Full content" {
		t.Errorf("Content = %q, want %q", prompt.Prompt.String(), "Full content")
	}
}
