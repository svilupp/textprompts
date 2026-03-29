# textprompts-go

[![Go Reference](https://pkg.go.dev/badge/github.com/svilupp/textprompts/packages/textprompts-go.svg)](https://pkg.go.dev/github.com/svilupp/textprompts/packages/textprompts-go)
[![Go CI](https://github.com/svilupp/textprompts/actions/workflows/go-ci.yml/badge.svg)](https://github.com/svilupp/textprompts/actions/workflows/go-ci.yml)

> **Alpha Release**: This package is functional but the API may change before v1.0. Please report issues and feedback!

Go implementation of TextPrompts - a minimal, cross-language prompt management library.

## Installation

```bash
go get github.com/svilupp/textprompts/packages/textprompts-go
```

## Quick Start

```go
package main

import (
    "fmt"
    "log"

    "github.com/svilupp/textprompts/packages/textprompts-go"
)

func main() {
    // Load a prompt file
    prompt, err := textprompts.LoadPrompt("prompts/greeting.txt")
    if err != nil {
        log.Fatal(err)
    }

    // Format with values
    result, err := prompt.Format(map[string]interface{}{
        "name": "Alice",
        "role": "Engineer",
    })
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println(result)
}
```

## File Format

Prompt files use optional frontmatter followed by the prompt content. Go accepts TOML first for backward compatibility and falls back to YAML when TOML parsing fails.

```
---
title = "Customer Greeting"
version = "1.0.0"
description = "Friendly greeting for customers"
author = "Your Name"
created = 2024-01-15
---
Hello {customer_name}!

Welcome to {company_name}. We're here to help you with {issue_type}.

Best regards,
{agent_name}
```

YAML frontmatter works as well:

```yaml
---
title: Customer Greeting
version: "1.0.0"
description: Friendly greeting for customers
author: Your Name
created: 2024-01-15
tags:
  - support
  - onboarding
settings:
  tone: warm
---
Hello {customer_name}!
```

## Metadata Modes

Three modes control how frontmatter is handled:

| Mode | Description | When to Use |
|------|-------------|-------------|
| `ModeAllow` | Parse metadata if present, allow missing fields (default) | General use |
| `ModeStrict` | Require title, description, and version | Production |
| `ModeIgnore` | Treat entire file as content, use filename as title | Simple files |

```go
// Set globally
textprompts.SetMetadata(textprompts.ModeStrict)

// Or per-call
prompt, err := textprompts.LoadPrompt("file.txt",
    textprompts.WithMetadataMode(textprompts.ModeStrict))
```

## API Reference

### Loading Prompts

```go
// Load a single prompt
prompt, err := textprompts.LoadPrompt("prompts/greeting.txt")

// Load with options
prompt, err := textprompts.LoadPrompt("prompts/greeting.txt",
    textprompts.WithMetadataMode(textprompts.ModeStrict))

// Create from string content
prompt, err := textprompts.FromString(content)

// Load a single section body from a larger prompt file
prompt, err := textprompts.LoadSection("prompts/catalog.txt", "system")
```

### Formatting

```go
// Safe formatting - all placeholders must be provided
result, err := prompt.Format(map[string]interface{}{
    "name": "Alice",
    "role": "admin",
})

// Partial formatting - only replace provided values
result, err := prompt.Format(
    map[string]interface{}{"name": "Alice"},
    textprompts.WithSkipValidation(),
)
// result: "Hello Alice, your role is {role}"

// Panic on error (useful in templates)
result := prompt.MustFormat(map[string]interface{}{"name": "Alice"})

// Positional + named formatting
result, err := prompt.FormatArgs(
    []interface{}{"Alice"},
    map[string]interface{}{"role": "admin"},
)
```

### Extras And Metadata

```go
extras := prompt.Meta.GetExtras()
if extras != nil {
    fmt.Println(extras["tags"])
    fmt.Println(extras["settings"])
}
```

### Accessing Prompt Data

```go
// Get the raw content
content := prompt.String()

// Access metadata
title := prompt.Meta.GetTitle()
version := prompt.Meta.GetVersion()
description := prompt.Meta.GetDescription()
author := prompt.Meta.GetAuthor()
created := prompt.Meta.GetCreated() // time.Time
extras := prompt.Meta.GetExtras()   // map[string]interface{}

// Get placeholder names
placeholders := prompt.Prompt.Placeholders() // []string{"name", "role"}
```

### Section Parsing

```go
result := textprompts.ParseSections([]byte("## Intro\n\nBody."))
fmt.Println(result.Sections[0].AnchorID) // intro

anchored, parsed := textprompts.InjectAnchors([]byte("## Intro\n\nBody."))
fmt.Println(string(anchored))

fmt.Println(textprompts.RenderTOC(parsed, "prompt.txt"))

// Normalize anchor IDs (lowercase, non-alphanumeric runs → "_")
fmt.Println(textprompts.NormalizeAnchorID("My-Section")) // "my_section"
fmt.Println(textprompts.GenerateSlug("My Section"))      // "my_section"

// Extract a section body from a parsed document or raw file content
body, ok := textprompts.GetSectionText("<system>Hello</system>", "system")
fmt.Println(body, ok) // Hello true
```

#### Anchor ID normalization

All anchor IDs use a single canonical form: lowercase, non-alphanumeric runs collapsed to `_`, leading/trailing `_` stripped. `NormalizeAnchorID` is applied universally to XML tag names, `id=` attributes, Markdown headings, and `<a id="">` anchors.

## Development

```bash
make setup
make check
```

### Saving Prompts

```go
// Create a new prompt
prompt := textprompts.NewPromptFull(
    "Greeting",           // title
    "1.0.0",              // version
    "A friendly greeting", // description
    "Author Name",        // author
    "Hello {name}!",      // content
)

// Save to file
err := textprompts.SavePrompt("prompts/greeting.txt", prompt)

// Save using YAML frontmatter
err = textprompts.SavePrompt(
    "prompts/greeting.yaml.txt",
    prompt,
    textprompts.WithFrontmatterFormat(textprompts.FrontmatterFormatYAML),
)
```

### Configuration

```go
// Set global metadata mode
textprompts.SetMetadata(textprompts.ModeStrict)
textprompts.SetMetadataFromString("strict") // or "allow", "ignore"

// Get current mode
mode := textprompts.GetMetadata()

// Convenience function for ignore mode
textprompts.SkipMetadata()
textprompts.SkipMetadata(true) // also disable ignored-metadata warnings

// Control ignored-metadata warnings directly
textprompts.SetWarnOnIgnoredMetadata(false)

// Environment variable (checked at init)
// export TEXTPROMPTS_METADATA_MODE=strict
```

## Error Handling

```go
prompt, err := textprompts.LoadPrompt("file.txt")
if err != nil {
    if textprompts.IsFileMissing(err) {
        // File not found
    }
    if textprompts.IsMissingMetadata(err) {
        // No frontmatter in strict mode
    }
    if textprompts.IsInvalidMetadata(err) {
        // Malformed TOML/YAML or validation failure
    }
    if textprompts.IsFormatError(err) {
        // Missing placeholder values
    }
}
```

## Real-World Example

```go
package main

import (
    "fmt"
    "log"

    "github.com/svilupp/textprompts/packages/textprompts-go"
)

func main() {
    // Load system prompt
    systemPrompt, err := textprompts.LoadPrompt("prompts/system.txt")
    if err != nil {
        log.Fatal(err)
    }

    // Load user prompt template
    userPrompt, err := textprompts.LoadPrompt("prompts/query.txt")
    if err != nil {
        log.Fatal(err)
    }

    // Format prompts
    system, _ := systemPrompt.Format(map[string]interface{}{
        "company": "ACME Corp",
        "role":    "customer support",
    })

    user, _ := userPrompt.Format(map[string]interface{}{
        "query": "How do I reset my password?",
    })

    // Use with your LLM client
    fmt.Printf("System: %s\n", system)
    fmt.Printf("User: %s\n", user)
}
```

## Cross-Language Compatibility

This Go package is part of the TextPrompts family:

- **Python**: `pip install textprompts`
- **TypeScript/Node**: `npm install textprompts`
- **Julia**: Available in `packages/TextPrompts.jl`
- **Go**: This package (alpha)

All implementations share the same file format and core functionality, allowing you to use the same prompt files across your entire stack.

## License

MIT License - see [LICENSE](../../LICENSE) for details.
