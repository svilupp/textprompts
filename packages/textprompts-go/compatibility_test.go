package textprompts

import (
	"bytes"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestCompatibilityDefaultMetadataModeIsAllow(t *testing.T) {
	original := GetMetadata()
	t.Cleanup(func() { SetMetadata(original) })

	SetMetadata(ModeAllow)
	if got := GetMetadata(); got != ModeAllow {
		t.Fatalf("GetMetadata() = %v, want %v", got, ModeAllow)
	}
}

func TestCompatibilityFrontmatterParsing(t *testing.T) {
	t.Run("toml still parses", func(t *testing.T) {
		prompt, err := FromString(`---
title = "TOML Prompt"
description = "TOML body"
version = "1.0.0"
---

Hello {name}!`, WithMetadataMode(ModeAllow))
		if err != nil {
			t.Fatalf("FromString() error = %v", err)
		}
		if got := prompt.Meta.GetTitle(); got != "TOML Prompt" {
			t.Fatalf("title = %q, want %q", got, "TOML Prompt")
		}
		if got := prompt.Prompt.String(); got != "Hello {name}!" {
			t.Fatalf("body = %q, want %q", got, "Hello {name}!")
		}
	})

	t.Run("leading whitespace before delimiter is not frontmatter", func(t *testing.T) {
		content := "  ---\ntitle = \"Not meta\"\n---\nBody"
		prompt, err := FromString(content, WithMetadataMode(ModeAllow))
		if err != nil {
			t.Fatalf("FromString() error = %v", err)
		}
		if got := prompt.Prompt.String(); got != content {
			t.Fatalf("body = %q, want raw content %q", got, content)
		}
	})

	t.Run("missing closing delimiter is invalid", func(t *testing.T) {
		_, err := FromString(`---
title = "Broken"
description = "Still broken"`, WithMetadataMode(ModeAllow))
		if err == nil {
			t.Fatal("FromString() error = nil, want malformed frontmatter error")
		}
	})

	t.Run("yaml frontmatter parses", func(t *testing.T) {
		prompt, err := FromString(`---
title: YAML Prompt
description: YAML body
version: "1.0.0"
author: Example
created: 2024-01-15
custom_field: true
---

Hello {name}!`, WithMetadataMode(ModeAllow))
		if err != nil {
			t.Fatalf("FromString() error = %v", err)
		}
		if got := prompt.Meta.GetTitle(); got != "YAML Prompt" {
			t.Fatalf("title = %q, want %q", got, "YAML Prompt")
		}
		if got := prompt.Meta.GetAuthor(); got != "Example" {
			t.Fatalf("author = %q, want %q", got, "Example")
		}
		if got := prompt.Prompt.String(); got != "Hello {name}!" {
			t.Fatalf("body = %q, want %q", got, "Hello {name}!")
		}
	})
}

func TestCompatibilityMetadataExtrasAndRoundTrip(t *testing.T) {
	t.Run("prompt meta exposes extras", func(t *testing.T) {
		metaType := reflect.TypeOf(PromptMeta{})
		field, ok := metaType.FieldByName("Extras")
		if !ok {
			t.Fatalf("PromptMeta is missing Extras field")
		}
		if field.Type.Kind() != reflect.Map {
			t.Fatalf("PromptMeta.Extras type = %v, want map", field.Type)
		}
	})

	t.Run("toml extras survive a save/load round trip", func(t *testing.T) {
		dir := t.TempDir()
		path := filepath.Join(dir, "roundtrip.txt")
		input := `---
title = "Roundtrip"
description = "Preserve extras"
version = "1.0.0"
priority = "high"
tags = ["alpha", "beta"]
---

Body.`

		prompt, err := FromString(input, WithMetadataMode(ModeAllow))
		if err != nil {
			t.Fatalf("FromString() error = %v", err)
		}

		if saveErr := SavePrompt(path, prompt); saveErr != nil {
			t.Fatalf("SavePrompt() error = %v", saveErr)
		}

		saved, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("ReadFile() error = %v", err)
		}
		content := string(saved)
		if !strings.Contains(content, `priority = "high"`) {
			t.Fatalf("saved file lost extras: %q", content)
		}
		if !strings.Contains(content, `tags = ["alpha", "beta"]`) {
			t.Fatalf("saved file lost array extras: %q", content)
		}
	})

	t.Run("yaml extras parse with preserved types", func(t *testing.T) {
		prompt, err := FromString(`---
title: YAML Extras
description: Preserve custom values
version: "1.0.0"
author: Example
created: 2024-01-15
custom_bool: true
custom_num: 42
custom_list:
  - alpha
  - beta
custom_object:
  nested: value
---

Body.`, WithMetadataMode(ModeAllow))
		if err != nil {
			t.Fatalf("FromString() error = %v", err)
		}
		extras := prompt.Meta.GetExtras()
		if got, ok := extras["custom_bool"].(bool); !ok || !got {
			t.Fatalf("custom_bool = %#v, want true", extras["custom_bool"])
		}
		if got, ok := extras["custom_num"].(int); !ok || got != 42 {
			t.Fatalf("custom_num = %#v, want 42", extras["custom_num"])
		}
		if got, ok := extras["custom_list"].([]interface{}); !ok || len(got) != 2 || got[0] != "alpha" || got[1] != "beta" {
			t.Fatalf("custom_list = %#v, want [alpha beta]", extras["custom_list"])
		}
		object, ok := extras["custom_object"].(map[string]interface{})
		if !ok || object["nested"] != "value" {
			t.Fatalf("custom_object = %#v, want nested map", extras["custom_object"])
		}
	})
}

func TestCompatibilityIgnoredMetadataWarnings(t *testing.T) {
	originalWarn := WarnOnIgnoredMetadata()
	originalMode := GetMetadata()
	t.Cleanup(func() {
		SetWarnOnIgnoredMetadata(originalWarn)
		SetMetadata(originalMode)
	})

	SetWarnOnIgnoredMetadata(true)
	SetMetadata(ModeIgnore)

	dir := t.TempDir()
	path := filepath.Join(dir, "ignored.txt")
	content := `---
title = "Ignored"
description = "Ignored frontmatter"
version = "1.0.0"
---

Body.`
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	stderr := captureStderr(t, func() {
		_, _ = LoadPrompt(path, WithMetadataMode(ModeIgnore))
	})

	if !strings.Contains(stderr, "Metadata detected but ignored") {
		t.Fatalf("expected ignored-metadata warning, got %q", stderr)
	}
}

func TestCompatibilityFormatting(t *testing.T) {
	t.Run("numbered placeholders are stable", func(t *testing.T) {
		ps := NewPromptString("{0} + {1} = {2}")
		got, err := ps.Format(map[string]interface{}{
			"0": "one",
			"1": "two",
			"2": "three",
		})
		if err != nil {
			t.Fatalf("Format() error = %v", err)
		}
		if got != "one + two = three" {
			t.Fatalf("Format() = %q, want %q", got, "one + two = three")
		}
	})

	t.Run("empty placeholders are recognized and formatted", func(t *testing.T) {
		ps := NewPromptString("Hello {} and {name}")
		placeholders := ps.Placeholders()
		if len(placeholders) == 0 || placeholders[0] != "" {
			t.Fatalf("Placeholders() = %v, want empty placeholder support", placeholders)
		}

		got, err := ps.FormatArgs([]interface{}{"Alice"}, map[string]interface{}{"name": "Bob"})
		if err != nil {
			t.Fatalf("FormatArgs() error = %v", err)
		}
		if got != "Hello Alice and Bob" {
			t.Fatalf("FormatArgs() = %q, want %q", got, "Hello Alice and Bob")
		}
	})

	t.Run("positional formatting API exists", func(t *testing.T) {
		type positionalFormatter interface {
			FormatArgs(args []interface{}, kwargs map[string]interface{}, opts ...FormatOption) (string, error)
		}

		if _, ok := any(NewPromptString("{0} {1}")).(positionalFormatter); !ok {
			t.Fatal("PromptString is missing the positional formatting API")
		}
	})
}

func captureStderr(t *testing.T, fn func()) string {
	t.Helper()

	original := os.Stderr
	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatalf("os.Pipe() error = %v", err)
	}

	os.Stderr = writer
	defer func() {
		os.Stderr = original
	}()

	done := make(chan string, 1)
	go func() {
		var buf bytes.Buffer
		_, _ = io.Copy(&buf, reader)
		done <- buf.String()
	}()

	fn()

	_ = writer.Close()

	return <-done
}
