# textprompts-go

[![Go Reference](https://pkg.go.dev/badge/github.com/svilupp/textprompts/packages/textprompts-go.svg)](https://pkg.go.dev/github.com/svilupp/textprompts/packages/textprompts-go)
[![Go CI](https://github.com/svilupp/textprompts/actions/workflows/go-ci.yml/badge.svg)](https://github.com/svilupp/textprompts/actions/workflows/go-ci.yml)

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

Prompt files use optional TOML frontmatter followed by the prompt content:

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

## Metadata Modes

Three modes control how TOML frontmatter is handled:

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

// Load multiple prompts from a directory
prompts, err := textprompts.LoadPrompts(
    []string{"prompts/"},
    textprompts.WithRecursive(),
    textprompts.WithGlob("*.txt"),
    textprompts.WithMaxFiles(100),
)

// Create from string content
prompt, err := textprompts.FromString(content)
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

// Get placeholder names
placeholders := prompt.Prompt.Placeholders() // []string{"name", "role"}
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
        // Malformed TOML or validation failure
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
- **Julia**: Coming soon
- **Go**: This package

All implementations share the same file format and core functionality, allowing you to use the same prompt files across your entire stack.

## License

MIT License - see [LICENSE](../../LICENSE) for details.
