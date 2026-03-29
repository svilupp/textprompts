/*
Package textprompts provides a minimal, cross-language prompt management library.

# Status

This package is in alpha. The API is functional and tested but may change
before v1.0. Please report issues and feedback on GitHub.

# Overview

TextPrompts allows you to store prompts as text files with optional
frontmatter metadata, providing safe string formatting and organized loading
capabilities. This Go package is part of a cross-language family that
includes Python, TypeScript, and Julia implementations.

# File Format

Prompt files use a simple format with optional TOML or YAML frontmatter.
The Go parser tries TOML first for backward compatibility and falls back to
YAML when TOML parsing fails:

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

Three modes control how frontmatter is handled:

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

Positional formatting is available through FormatArgs:

	formatted, err := template.FormatArgs(
		[]interface{}{"Alice"},
		map[string]interface{}{"role": "admin"},
	)

# Extras And Sections

Additional frontmatter keys are preserved in PromptMeta.Extras / GetExtras:

	extras := prompt.Meta.GetExtras()
	fmt.Println(extras["tags"])

Section helpers allow extracting a subsection body from a larger prompt file:

	sectionPrompt, err := textprompts.LoadSection("prompts/catalog.txt", "system")
	body, ok := textprompts.GetSectionText("<system>Hello</system>", "system")
	slice := textprompts.SliceSectionContent(raw, &parsed.Sections[0])

# Error Handling

The package provides specific error types:

  - FileMissingError: File not found
  - MissingMetadataError: No frontmatter in strict mode
  - InvalidMetadataError: Malformed TOML/YAML or validation failure
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
