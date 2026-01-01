// Example: Demonstrating different metadata modes
package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/svilupp/textprompts/packages/textprompts-go"
)

func main() {
	// Create temporary prompt files for this example
	tmpDir, err := os.MkdirTemp("", "textprompts-example-*")
	if err != nil {
		log.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	// Create a prompt with full metadata
	fullMetaContent := `---
title = "Full Metadata Prompt"
version = "1.0.0"
description = "A prompt with complete metadata"
author = "Example Author"
created = 2024-01-15
---
Hello {name}!
`
	fullMetaPath := filepath.Join(tmpDir, "full_meta.txt")
	os.WriteFile(fullMetaPath, []byte(fullMetaContent), 0644)

	// Create a prompt with partial metadata
	partialMetaContent := `---
title = "Partial Metadata"
---
Hello {name}!
`
	partialMetaPath := filepath.Join(tmpDir, "partial_meta.txt")
	os.WriteFile(partialMetaPath, []byte(partialMetaContent), 0644)

	// Create a simple prompt without metadata
	simpleContent := `Hello {name}!`
	simplePath := filepath.Join(tmpDir, "simple.txt")
	os.WriteFile(simplePath, []byte(simpleContent), 0644)

	fmt.Println("=== ALLOW Mode (Default) ===")
	fmt.Println("Parses metadata if present, allows missing fields")
	fmt.Println()

	// ALLOW mode - works with any file
	textprompts.SetMetadata(textprompts.ModeAllow)

	prompt, _ := textprompts.LoadPrompt(fullMetaPath)
	fmt.Printf("Full metadata - Title: %q, Version: %q\n",
		prompt.Meta.GetTitle(), prompt.Meta.GetVersion())

	prompt, _ = textprompts.LoadPrompt(partialMetaPath)
	fmt.Printf("Partial metadata - Title: %q, Version: %q\n",
		prompt.Meta.GetTitle(), prompt.Meta.GetVersion())

	prompt, _ = textprompts.LoadPrompt(simplePath)
	fmt.Printf("No metadata - Title: %q (from filename)\n",
		prompt.Meta.GetTitle())
	fmt.Println()

	fmt.Println("=== STRICT Mode ===")
	fmt.Println("Requires title, description, and version")
	fmt.Println()

	// STRICT mode - requires complete metadata
	textprompts.SetMetadata(textprompts.ModeStrict)

	prompt, err = textprompts.LoadPrompt(fullMetaPath)
	if err != nil {
		fmt.Printf("Full metadata: ERROR - %v\n", err)
	} else {
		fmt.Printf("Full metadata: OK - Title: %q\n", prompt.Meta.GetTitle())
	}

	prompt, err = textprompts.LoadPrompt(partialMetaPath)
	if err != nil {
		fmt.Printf("Partial metadata: ERROR - %v\n", err)
	} else {
		fmt.Printf("Partial metadata: OK\n")
	}

	prompt, err = textprompts.LoadPrompt(simplePath)
	if err != nil {
		fmt.Printf("No metadata: ERROR - %v\n", err)
	} else {
		fmt.Printf("No metadata: OK\n")
	}
	fmt.Println()

	fmt.Println("=== IGNORE Mode ===")
	fmt.Println("Treats entire file as content, uses filename as title")
	fmt.Println()

	// IGNORE mode - treats everything as content
	textprompts.SetMetadata(textprompts.ModeIgnore)

	prompt, _ = textprompts.LoadPrompt(fullMetaPath)
	fmt.Printf("Full metadata file - Title: %q (from filename)\n",
		prompt.Meta.GetTitle())
	fmt.Printf("Content starts with: %q...\n",
		prompt.Prompt.String()[:20])

	fmt.Println()
	fmt.Println("=== Per-Call Override ===")
	fmt.Println("Override global mode for specific loads")
	fmt.Println()

	// Even with global IGNORE, can override per-call
	prompt, _ = textprompts.LoadPrompt(fullMetaPath,
		textprompts.WithMetadataMode(textprompts.ModeAllow))
	fmt.Printf("With override - Title: %q (from metadata)\n",
		prompt.Meta.GetTitle())
}
