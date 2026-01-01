// Package textprompts provides a minimal prompt management library.
//
// TextPrompts allows you to store prompts as text files with optional TOML
// metadata (frontmatter), providing safe string formatting and organized
// loading capabilities.
//
// # File Format
//
// Prompt files can optionally include TOML frontmatter:
//
//	---
//	title = "Greeting Prompt"
//	version = "1.0.0"
//	description = "A friendly greeting template"
//	author = "Your Name"
//	created = 2024-01-15
//	---
//	Hello, {name}! Welcome to {place}.
//
// # Basic Usage
//
//	prompt, err := textprompts.LoadPrompt("prompts/greeting.txt")
//	if err != nil {
//	    log.Fatal(err)
//	}
//
//	result, err := prompt.Format(map[string]interface{}{
//	    "name":  "Alice",
//	    "place": "Wonderland",
//	})
//	fmt.Println(result) // "Hello, Alice! Welcome to Wonderland."
//
// # Metadata Modes
//
// Three modes control how frontmatter is handled:
//
//   - ModeAllow (default): Parse metadata if present, allow missing fields
//   - ModeStrict: Require title, description, and version fields
//   - ModeIgnore: Treat entire file as content, ignore any frontmatter
//
// # Configuration
//
//	// Set global default
//	textprompts.SetMetadata(textprompts.ModeStrict)
//
//	// Override per-call
//	prompt, err := textprompts.LoadPrompt("file.txt",
//	    textprompts.WithMetadataMode(textprompts.ModeIgnore))
package textprompts

// Version is the current version of the textprompts-go package.
const Version = "0.1.0"
