/*
Package textprompts provides a minimal, cross-language prompt management library.

# Overview

TextPrompts allows you to store prompts as text files with optional TOML
metadata (frontmatter), providing safe string formatting and organized
loading capabilities. This Go package is part of a cross-language family
that includes Python, TypeScript, and Julia implementations.

# File Format

Prompt files use a simple format with optional TOML frontmatter:

	---
	title = "Customer Greeting"
	version = "1.0.0"
	description = "Friendly greeting for customer support"
	author = "Your Name"
	created = 2024-01-15
	---
	Hello {customer_name}!

	Welcome to {company_name}. We're here to help you with {issue_type}.

	Best regards,
	{agent_name}

# Quick Start

Load and format a prompt:

	prompt, err := textprompts.LoadPrompt("greeting.txt")
	if err != nil {
		log.Fatal(err)
	}

	result, err := prompt.Format(map[string]interface{}{
		"customer_name": "Alice",
		"company_name":  "ACME Corp",
		"issue_type":    "billing question",
		"agent_name":    "Sarah",
	})

# Metadata Modes

Three modes control how TOML frontmatter is handled:

  - ModeAllow (default): Parse metadata if present, allow missing/empty fields
  - ModeStrict: Require title, description, and version to be non-empty
  - ModeIgnore: Treat entire file as content, use filename as title

Set the mode globally or per-call:

	// Global setting
	textprompts.SetMetadata(textprompts.ModeStrict)

	// Per-call override
	prompt, err := textprompts.LoadPrompt("file.txt",
		textprompts.WithMetadataMode(textprompts.ModeIgnore))

# Safe Formatting

PromptString validates that all placeholders have values:

	template := textprompts.NewPromptString("Hello {name}, you are {role}")

	// This returns an error - missing 'role'
	_, err := template.Format(map[string]interface{}{"name": "Alice"})

	// Use WithSkipValidation for partial formatting
	partial, _ := template.Format(
		map[string]interface{}{"name": "Alice"},
		textprompts.WithSkipValidation(),
	)
	// partial = "Hello Alice, you are {role}"

# Bulk Loading

Load multiple prompts from a directory:

	prompts, err := textprompts.LoadPrompts(
		[]string{"prompts/"},
		textprompts.WithRecursive(),
		textprompts.WithGlob("*.txt"),
	)

# Error Handling

The package provides specific error types:

  - FileMissingError: File not found
  - MissingMetadataError: No frontmatter in strict mode
  - InvalidMetadataError: Malformed TOML or validation failure
  - MalformedHeaderError: Invalid frontmatter structure
  - FormatError: Missing placeholder values

Use the Is* helper functions or errors.As for type checking:

	if textprompts.IsFileMissing(err) {
		// Handle missing file
	}

# Environment Variables

Set TEXTPROMPTS_METADATA_MODE to configure the default mode:

	export TEXTPROMPTS_METADATA_MODE=strict

Valid values: "strict", "allow", "ignore"
*/
package textprompts
