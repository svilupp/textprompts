# Go Package Implementation Plan for TextPrompts

## Executive Summary

This document outlines a comprehensive plan for implementing `textprompts-go`, a Go port of the TextPrompts library. The Go port will provide the same core functionality as existing Python, TypeScript, and Julia implementations: loading prompt files with optional TOML frontmatter metadata and safe string formatting with placeholder validation.

**Target Location:** `packages/textprompts-go/`

**Default Metadata Mode:** ALLOW (consistent with TypeScript and Julia ports)

---

## 1. Project Structure

### 1.1 Directory Layout

```
packages/textprompts-go/
├── textprompts.go           # Main package entry, public API exports
├── models.go                # Prompt, PromptMeta, PromptString types
├── config.go                # MetadataMode enum, global configuration
├── loaders.go               # LoadPrompt, LoadPrompts functions
├── parser.go                # ParseFile, ParseString, splitFrontMatter
├── placeholders.go          # ExtractPlaceholders, ValidateFormatArgs
├── prompt_string.go         # PromptString with Format method
├── savers.go                # SavePrompt function
├── errors.go                # Custom error types
├── doc.go                   # Package documentation
├── go.mod                   # Go module definition
├── go.sum                   # Dependency checksums
├── README.md                # Package documentation
├── LICENSE                  # MIT License
├── Makefile                 # Build, test, lint commands
├── .golangci.yml            # golangci-lint configuration
│
├── examples/
│   ├── basic_usage/
│   │   └── main.go          # Basic loading and formatting
│   ├── metadata_modes/
│   │   └── main.go          # Demonstrating STRICT/ALLOW/IGNORE
│   └── batch_loading/
│       └── main.go          # Loading multiple prompts
│
├── testdata/                # Test fixtures (Go convention)
│   ├── valid/
│   │   ├── simple.txt
│   │   ├── with_metadata.txt
│   │   ├── complex_placeholders.txt
│   │   └── nested/
│   │       └── prompt.txt
│   ├── invalid/
│   │   ├── malformed_toml.txt
│   │   └── missing_delimiter.txt
│   └── edge_cases/
│       ├── empty.txt
│       ├── no_body.txt
│       ├── escaped_braces.txt
│       └── unicode.txt
│
└── internal/                # Internal implementation details
    └── testutil/
        └── helpers.go       # Test helper functions
```

### 1.2 Module Path

```
module github.com/svilupp/textprompts/packages/textprompts-go
```

**Alternative (simpler import path for users):**
```
module github.com/svilupp/textprompts-go
```

*Recommendation:* Use the monorepo path to maintain consistency with the project structure, but consider publishing to a separate repository for cleaner import paths in the future.

---

## 2. Core Types and Interfaces

### 2.1 MetadataMode Enum

```go
// config.go

// MetadataMode defines how the parser handles TOML frontmatter
type MetadataMode int

const (
    // ModeAllow parses metadata if present, allows missing/empty fields (DEFAULT)
    ModeAllow MetadataMode = iota
    // ModeStrict requires title, description, and version to be non-empty
    ModeStrict
    // ModeIgnore treats entire file as body, uses filename as title
    ModeIgnore
)

// String returns the string representation of the mode
func (m MetadataMode) String() string

// ParseMetadataMode converts a string to MetadataMode
func ParseMetadataMode(s string) (MetadataMode, error)
```

### 2.2 PromptMeta Struct

```go
// models.go

// PromptMeta contains optional metadata from the TOML frontmatter
type PromptMeta struct {
    Title       *string    `toml:"title"`
    Version     *string    `toml:"version"`
    Author      *string    `toml:"author"`
    Created     *time.Time `toml:"created"`
    Description *string    `toml:"description"`
}

// IsEmpty returns true if all fields are nil or empty
func (m PromptMeta) IsEmpty() bool

// Validate checks required fields in strict mode
func (m PromptMeta) Validate() error
```

### 2.3 PromptString Type

```go
// prompt_string.go

// PromptString wraps a string with placeholder tracking and safe formatting
type PromptString struct {
    content      string
    placeholders map[string]struct{}
}

// NewPromptString creates a PromptString, extracting placeholders
func NewPromptString(content string) PromptString

// String returns the raw content
func (ps PromptString) String() string

// Content returns the raw prompt content (alias for String)
func (ps PromptString) Content() string

// Placeholders returns the set of placeholder names found in the prompt
func (ps PromptString) Placeholders() []string

// Format replaces placeholders with provided values
// Returns error if required placeholders are missing (unless skipValidation is true)
func (ps PromptString) Format(values map[string]interface{}, opts ...FormatOption) (string, error)

// MustFormat is like Format but panics on error
func (ps PromptString) MustFormat(values map[string]interface{}, opts ...FormatOption) string

// FormatOption configures formatting behavior
type FormatOption func(*formatOptions)

// WithSkipValidation allows partial formatting without all placeholders
func WithSkipValidation() FormatOption
```

### 2.4 Prompt Struct

```go
// models.go

// Prompt represents a loaded prompt file with metadata and content
type Prompt struct {
    Path   string       // Absolute path to the source file
    Meta   PromptMeta   // Parsed metadata (may be empty)
    Prompt PromptString // The prompt content with formatting support
}

// FromPath loads a prompt from a file path
func FromPath(path string, opts ...LoadOption) (*Prompt, error)

// FromString parses a prompt from string content
func FromString(content string, opts ...LoadOption) (*Prompt, error)

// Format is a convenience method that delegates to Prompt.Prompt.Format
func (p *Prompt) Format(values map[string]interface{}, opts ...FormatOption) (string, error)
```

---

## 3. Public API Functions

### 3.1 Loading Functions

```go
// loaders.go

// LoadPrompt loads a single prompt file
func LoadPrompt(path string, opts ...LoadOption) (*Prompt, error)

// LoadPrompts loads multiple prompts from paths, directories, or glob patterns
func LoadPrompts(paths []string, opts ...LoadOption) ([]*Prompt, error)

// LoadOption configures loading behavior
type LoadOption func(*loadOptions)

// WithMetadataMode overrides the global metadata mode for this load
func WithMetadataMode(mode MetadataMode) LoadOption

// WithRecursive enables recursive directory traversal
func WithRecursive() LoadOption

// WithGlob sets the glob pattern for file matching (default: "*.txt")
func WithGlob(pattern string) LoadOption

// WithMaxFiles limits the number of files loaded
func WithMaxFiles(n int) LoadOption
```

### 3.2 Configuration Functions

```go
// config.go

// SetMetadata sets the global default metadata mode
func SetMetadata(mode MetadataMode)

// GetMetadata returns the current global metadata mode
func GetMetadata() MetadataMode

// SkipMetadata is a convenience function that sets mode to ModeIgnore
func SkipMetadata()

// WarnOnIgnoredMetadata returns whether warnings are enabled for ignored metadata
func WarnOnIgnoredMetadata() bool

// SetWarnOnIgnoredMetadata enables/disables warnings
func SetWarnOnIgnoredMetadata(warn bool)
```

### 3.3 Saving Functions

```go
// savers.go

// SavePrompt writes a prompt to a file with TOML frontmatter
func SavePrompt(path string, prompt *Prompt) error

// SavePromptContent writes prompt content with metadata to a file
func SavePromptContent(path string, meta PromptMeta, content string) error
```

---

## 4. Error Types

```go
// errors.go

// TextPromptsError is the base error type for all textprompts errors
type TextPromptsError struct {
    Message string
    Cause   error
}

func (e *TextPromptsError) Error() string
func (e *TextPromptsError) Unwrap() error

// FileMissingError indicates the specified file was not found
type FileMissingError struct {
    TextPromptsError
    Path string
}

// MissingMetadataError indicates required metadata is missing in strict mode
type MissingMetadataError struct {
    TextPromptsError
    Path string
}

// InvalidMetadataError indicates malformed or invalid TOML metadata
type InvalidMetadataError struct {
    TextPromptsError
    Path   string
    Detail string
}

// MalformedHeaderError indicates the frontmatter structure is invalid
type MalformedHeaderError struct {
    TextPromptsError
    Path string
}

// FormatError indicates a placeholder formatting error
type FormatError struct {
    TextPromptsError
    Missing  []string
    Provided []string
}

// Error type checking helpers
func IsFileMissing(err error) bool
func IsMissingMetadata(err error) bool
func IsInvalidMetadata(err error) bool
func IsMalformedHeader(err error) bool
func IsFormatError(err error) bool
```

---

## 5. Implementation Details

### 5.1 Frontmatter Parsing

The parser follows the same logic as other ports:

1. Check for opening delimiter `---` on first line
2. Find closing delimiter `---`
3. Extract TOML content between delimiters
4. Parse TOML into PromptMeta struct
5. Extract body content after closing delimiter

```go
// parser.go

const (
    FrontmatterDelimiter = "---"
)

// splitFrontMatter separates metadata from body content
func splitFrontMatter(content string) (tomlContent, body string, hasFrontmatter bool)

// parseFile reads and parses a prompt file
func parseFile(path string, mode MetadataMode) (*Prompt, error)

// parseString parses prompt content from a string
func parseString(content string, mode MetadataMode, sourcePath string) (*Prompt, error)
```

### 5.2 Placeholder Extraction

Uses regex pattern matching identical to other ports:

```go
// placeholders.go

import "regexp"

var placeholderPattern = regexp.MustCompile(`\{([^{}:]+)(?::[^{}]*)?\}`)

// ExtractPlaceholders finds all placeholder names in a template string
func ExtractPlaceholders(text string) []string {
    // 1. Replace escaped braces {{ and }} with markers
    // 2. Find all matches of {name} or {name:format}
    // 3. Return unique placeholder names
}

// ValidateFormatArgs checks that all placeholders have values provided
func ValidateFormatArgs(placeholders []string, values map[string]interface{}) error
```

### 5.3 String Formatting

The `Format` method performs safe placeholder replacement:

```go
// prompt_string.go

func (ps PromptString) Format(values map[string]interface{}, opts ...FormatOption) (string, error) {
    // 1. Parse options
    // 2. Validate all placeholders have values (unless skipValidation)
    // 3. Replace {placeholder} with corresponding value
    // 4. Handle escaped braces {{ → { and }} → }
    // 5. Return formatted string
}
```

**Value Conversion:**
- `string` → used directly
- `int`, `float64`, etc. → `fmt.Sprintf("%v", value)`
- `fmt.Stringer` → `.String()` method
- Others → `fmt.Sprintf("%v", value)`

---

## 6. Dependencies

### 6.1 Required Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| `github.com/BurntSushi/toml` | v1.3+ | TOML parsing (most popular, well-maintained) |
| `github.com/bmatcuk/doublestar` | v4.6+ | Glob pattern matching with `**` support |

### 6.2 Development Dependencies

| Dependency | Purpose |
|------------|---------|
| `github.com/stretchr/testify` | Testing assertions (optional but recommended) |
| `golangci-lint` | Comprehensive linting |

### 6.3 go.mod

```go
module github.com/svilupp/textprompts/packages/textprompts-go

go 1.21

require (
    github.com/BurntSushi/toml v1.3.2
    github.com/bmatcuk/doublestar/v4 v4.6.1
)
```

**Minimum Go Version:** 1.21 (for `slices` and `maps` packages, modern error handling)

---

## 7. Testing Strategy

### 7.1 Test Structure

```
packages/textprompts-go/
├── textprompts_test.go      # Integration tests
├── models_test.go           # Prompt, PromptMeta tests
├── config_test.go           # Configuration tests
├── loaders_test.go          # Loading function tests
├── parser_test.go           # Parsing tests
├── placeholders_test.go     # Placeholder extraction tests
├── prompt_string_test.go    # Formatting tests
├── savers_test.go           # Save function tests
├── errors_test.go           # Error type tests
└── testdata/                # Shared test fixtures
```

### 7.2 Test Categories

1. **Unit Tests**
   - Placeholder extraction
   - Frontmatter parsing
   - Metadata validation
   - Format string replacement

2. **Integration Tests**
   - File loading end-to-end
   - Directory traversal
   - Glob pattern matching

3. **Edge Case Tests**
   - Empty files
   - Unicode content
   - Escaped braces
   - Large files
   - Deeply nested directories

4. **Error Condition Tests**
   - Missing files
   - Invalid TOML
   - Malformed frontmatter
   - Missing placeholders

### 7.3 Test Commands

```makefile
# Makefile

test:
	go test -v -race ./...

test-cover:
	go test -v -race -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out -o coverage.html

test-short:
	go test -short -v ./...

bench:
	go test -bench=. -benchmem ./...
```

---

## 8. CI/CD Pipeline

### 8.1 GitHub Actions Workflow

Create `.github/workflows/go-ci.yml`:

```yaml
name: Go CI

on:
  push:
    branches: [main]
    paths:
      - 'packages/textprompts-go/**'
      - '.github/workflows/go-ci.yml'
  pull_request:
    branches: [main]
    paths:
      - 'packages/textprompts-go/**'
      - '.github/workflows/go-ci.yml'

defaults:
  run:
    working-directory: packages/textprompts-go

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Go
        uses: actions/setup-go@v5
        with:
          go-version: '1.22'

      - name: Run golangci-lint
        uses: golangci/golangci-lint-action@v4
        with:
          version: latest
          working-directory: packages/textprompts-go

  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        go-version: ['1.21', '1.22', '1.23']
    steps:
      - uses: actions/checkout@v4

      - name: Set up Go
        uses: actions/setup-go@v5
        with:
          go-version: ${{ matrix.go-version }}

      - name: Download dependencies
        run: go mod download

      - name: Run tests
        run: go test -v -race -coverprofile=coverage.out ./...

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: packages/textprompts-go/coverage.out
          flags: go
          name: go-${{ matrix.go-version }}

  build:
    runs-on: ubuntu-latest
    needs: [lint, test]
    steps:
      - uses: actions/checkout@v4

      - name: Set up Go
        uses: actions/setup-go@v5
        with:
          go-version: '1.22'

      - name: Build
        run: go build -v ./...

      - name: Verify go.mod is tidy
        run: |
          go mod tidy
          git diff --exit-code go.mod go.sum
```

### 8.2 Release Workflow (Future)

For releases, consider adding automated tagging for the Go module:

```yaml
# .github/workflows/go-release.yml (future)

name: Go Release

on:
  push:
    tags:
      - 'go/v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Verify module version
        run: |
          TAG=${GITHUB_REF#refs/tags/go/}
          # Verify tag matches expected version

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          generate_release_notes: true
```

---

## 9. Documentation

### 9.1 Package Documentation (doc.go)

```go
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
```

### 9.2 README.md Structure

```markdown
# textprompts-go

Go implementation of TextPrompts - a minimal prompt management library.

## Installation

## Quick Start

## Features

## API Reference

## Metadata Modes

## Examples

## Contributing

## License
```

### 9.3 Integration with Docs Site

Update `.github/workflows/docs.yml` to include Go documentation:

1. Generate Go docs using `pkgsite` or `godoc`
2. Output to `site/go/` alongside Python and Julia docs
3. Add navigation links between language versions

---

## 10. Implementation Phases

### Phase 1: Core Foundation (Priority: Critical)

**Files to create:**
- [ ] `go.mod` - Module definition
- [ ] `errors.go` - Error types
- [ ] `config.go` - MetadataMode and global config
- [ ] `models.go` - PromptMeta struct
- [ ] `parser.go` - Frontmatter parsing

**Tests:**
- [ ] `errors_test.go`
- [ ] `config_test.go`
- [ ] `parser_test.go`
- [ ] Basic test fixtures in `testdata/`

### Phase 2: Placeholder System (Priority: Critical)

**Files to create:**
- [ ] `placeholders.go` - Extraction and validation
- [ ] `prompt_string.go` - PromptString type with Format

**Tests:**
- [ ] `placeholders_test.go`
- [ ] `prompt_string_test.go`

### Phase 3: Loading API (Priority: Critical)

**Files to create:**
- [ ] `loaders.go` - LoadPrompt, LoadPrompts
- [ ] `textprompts.go` - Public API re-exports

**Tests:**
- [ ] `loaders_test.go`
- [ ] `textprompts_test.go` (integration)

### Phase 4: Saving & Polish (Priority: High)

**Files to create:**
- [ ] `savers.go` - SavePrompt functions
- [ ] `doc.go` - Package documentation

**Tests:**
- [ ] `savers_test.go`

### Phase 5: CI/CD & Documentation (Priority: High)

**Files to create:**
- [ ] `.golangci.yml` - Linter configuration
- [ ] `Makefile` - Build commands
- [ ] `README.md` - Package documentation
- [ ] `.github/workflows/go-ci.yml` - CI pipeline

### Phase 6: Examples (Priority: Medium)

**Files to create:**
- [ ] `examples/basic_usage/main.go`
- [ ] `examples/metadata_modes/main.go`
- [ ] `examples/batch_loading/main.go`

### Phase 7: Integration (Priority: Medium)

**Updates:**
- [ ] Update root README.md with Go port info
- [ ] Add Go docs to docs site workflow
- [ ] Add Go badge to README

---

## 11. Design Decisions

### 11.1 Why ALLOW as Default?

Following TypeScript and Julia conventions (not Python):
- More intuitive for new users
- Gracefully handles files with or without metadata
- Strict mode available when needed via `WithMetadataMode(ModeStrict)`

### 11.2 Why Functional Options Pattern?

Go idiomatic approach for optional parameters:
```go
// Clean, extensible API
prompt, err := LoadPrompt("file.txt",
    WithMetadataMode(ModeStrict),
    WithRecursive())
```

### 11.3 Why Pointer Fields in PromptMeta?

Distinguishes between "not provided" (nil) and "empty string" (""):
```go
type PromptMeta struct {
    Title *string  // nil = not in TOML, "" = explicitly empty
}
```

### 11.4 Why Not Generics for Format?

Keep it simple with `map[string]interface{}`:
- Matches the dynamic nature of prompt formatting
- Avoids over-engineering
- Easy to use with any value type

### 11.5 Error Handling Approach

Follow Go conventions:
- Return errors, don't panic
- Provide `MustFormat` for cases where panicking is acceptable
- Use `errors.Is` and `errors.As` for error type checking
- Wrap errors with context using `fmt.Errorf`

---

## 12. API Comparison with Other Ports

| Feature | Python | TypeScript | Julia | Go (Planned) |
|---------|--------|------------|-------|--------------|
| **Default Mode** | IGNORE | ALLOW | ALLOW | ALLOW |
| **Load Single** | `load_prompt()` | `loadPrompt()` | `load_prompt()` | `LoadPrompt()` |
| **Load Multiple** | `load_prompts()` | `loadPrompts()` | `load_prompts()` | `LoadPrompts()` |
| **From String** | `Prompt(...)` | `Prompt.fromString()` | `from_string()` | `FromString()` |
| **Format Method** | `.format()` | `.format()` | `prompt()` callable | `.Format()` |
| **Partial Format** | `skip_validation=True` | `skipValidation: true` | `skip_validation=true` | `WithSkipValidation()` |
| **Config Set** | `set_metadata()` | `setMetadata()` | `set_metadata()` | `SetMetadata()` |
| **Config Get** | `get_metadata()` | `getMetadata()` | `get_metadata()` | `GetMetadata()` |
| **Async** | No | Yes (Promise) | No | No |

---

## 13. Future Considerations

### 13.1 CLI Tool (Future Phase)

Consider adding a CLI similar to Python/TypeScript:

```
textprompts-go validate prompts/
textprompts-go format prompts/greeting.txt --name="Alice"
textprompts-go list prompts/ --recursive
```

### 13.2 Template Caching

For high-performance use cases, consider:
- Caching parsed templates
- Pre-compiled placeholder patterns
- Sync.Pool for PromptString objects

### 13.3 Context Support

Add context.Context for cancellation:
```go
func LoadPromptWithContext(ctx context.Context, path string, opts ...LoadOption) (*Prompt, error)
```

### 13.4 Streaming Support

For large files:
```go
func LoadPromptReader(r io.Reader, opts ...LoadOption) (*Prompt, error)
```

---

## 14. Checklist Summary

### Must Have (MVP)
- [x] Core types (Prompt, PromptMeta, PromptString)
- [x] MetadataMode enum with ALLOW default
- [x] Frontmatter parsing
- [x] Placeholder extraction and formatting
- [x] LoadPrompt and LoadPrompts functions
- [x] Error types matching other ports
- [x] Unit tests with good coverage
- [x] CI pipeline (GitHub Actions)
- [x] README documentation
- [x] go.mod with dependencies

### Should Have
- [x] SavePrompt function
- [x] Examples directory
- [x] golangci-lint configuration
- [x] Makefile for common tasks
- [x] Test fixtures matching other ports

### Nice to Have
- [ ] CLI tool
- [ ] Integration with docs site
- [ ] Benchmarks
- [ ] Context support

---

## Appendix A: Code Snippets

### A.1 Example Usage

```go
package main

import (
    "fmt"
    "log"

    "github.com/svilupp/textprompts/packages/textprompts-go"
)

func main() {
    // Load a single prompt
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

    // Access metadata
    if prompt.Meta.Title != nil {
        fmt.Printf("Title: %s\n", *prompt.Meta.Title)
    }

    // Load multiple prompts
    prompts, err := textprompts.LoadPrompts(
        []string{"prompts/"},
        textprompts.WithRecursive(),
        textprompts.WithGlob("*.txt"),
    )
    if err != nil {
        log.Fatal(err)
    }

    for _, p := range prompts {
        fmt.Printf("Loaded: %s\n", p.Path)
    }
}
```

### A.2 Strict Mode Example

```go
// Require metadata
textprompts.SetMetadata(textprompts.ModeStrict)

// Or per-call
prompt, err := textprompts.LoadPrompt("file.txt",
    textprompts.WithMetadataMode(textprompts.ModeStrict))
if err != nil {
    var metaErr *textprompts.MissingMetadataError
    if errors.As(err, &metaErr) {
        log.Printf("Missing required metadata in: %s", metaErr.Path)
    }
}
```

### A.3 Partial Formatting Example

```go
// Format with only some placeholders
result, err := prompt.Format(
    map[string]interface{}{"name": "Alice"},
    textprompts.WithSkipValidation(),
)
// result: "Hello, Alice! Your role is {role}."
```

---

*Plan created: 2025*
*Target: TextPrompts Go v0.1.0*
