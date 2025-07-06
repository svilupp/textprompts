# API Reference

## Core Functions

### `load_prompt(path, *, meta=None)`

Load a single prompt file.

**Parameters:**
- `path` (str | Path): Path to the prompt file
- `meta` (MetadataMode | str | None): Metadata handling mode - "strict", "allow", "ignore", or None (uses global config)

**Returns:** `Prompt` object

**Raises:** `TextPromptsError` subclasses on any failure

**Example:**
```python
from textprompts import load_prompt

prompt = load_prompt("prompts/greeting.txt")
print(prompt.meta.title)
print(prompt.body)
```

### `load_prompts(*paths, recursive=False, glob="*.txt", meta=None, max_files=1000)`

Load multiple prompt files from directories and/or individual files.

**Parameters:**
- `*paths` (str | Path): Files and directories to load
- `recursive` (bool): If True, search directories recursively
- `glob` (str): Glob pattern for finding files in directories
- `meta` (MetadataMode | str | None): Metadata handling mode - "strict", "allow", "ignore", or None (uses global config)
- `max_files` (int | None): Maximum number of files to process. None for no limit

**Returns:** `list[Prompt]`

**Raises:** `TextPromptsError` subclasses on any failure

**Example:**
```python
from textprompts import load_prompts

# Load all .txt files in a directory
prompts = load_prompts("prompts/")

# Load recursively with custom pattern
prompts = load_prompts("templates/", recursive=True, glob="*.prompt")

# Load specific files
prompts = load_prompts("file1.txt", "file2.txt")

# Load with specific metadata mode
prompts = load_prompts("prompts/", meta="allow")
```

### `save_prompt(path, content)`

Save a prompt to a file.

**Parameters:**
- `path` (str | Path): File path to save the prompt to
- `content` (str | Prompt): Either a string (creates template with required fields) or a Prompt object

**Example:**
```python
from textprompts import save_prompt, Prompt, PromptMeta

# Save a simple prompt with metadata template
save_prompt("my_prompt.txt", "You are a helpful assistant.")

# Save a Prompt object with full metadata
meta = PromptMeta(title="Assistant", version="1.0.0", description="A helpful AI")
prompt = Prompt(path=Path("my_prompt.txt"), meta=meta, body="You are a helpful assistant.")
save_prompt("my_prompt.txt", prompt)
```

## Data Classes

### `Prompt`

Represents a loaded prompt with metadata and content.

**Fields:**
- `path` (Path): Path to the source file
- `meta` (PromptMeta): Parsed metadata (always present, uses filename as title if no front-matter)
- `body` (SafeString): The prompt content as a SafeString

**Example:**
```python
prompt = load_prompt("example.txt")
print(prompt.path)  # PosixPath('example.txt')
print(prompt.meta.title)  # "Example Prompt"
print(prompt.body)  # SafeString("Hello {name}!")
```

### `PromptMeta`

Metadata extracted from the TOML frontmatter.

**Fields:**
- `title` (str | None): Human-readable name (required in front-matter, or filename if no front-matter)
- `version` (str | None): Version string (required in front-matter if present, can be empty)
- `author` (str | None): Author name (optional)
- `created` (date | None): Creation date (optional)
- `description` (str | None): Description (required in front-matter if present, can be empty)

**Example:**
```python
meta = prompt.meta
print(meta.title)  # "Customer Support"
print(meta.version)  # "1.0.0"
print(meta.author)  # "Support Team"
```

### `SafeString`

A string subclass that validates format() calls to ensure all placeholders are provided.

**Attributes:**
- `placeholders` (set[str]): Set of placeholder names found in the string

**Methods:**
- `format(*args, skip_validation=False, **kwargs)`: Format the string
  - By default, raises ValueError if any placeholder is missing
  - With `skip_validation=True`, performs partial formatting
- All standard string methods are available

**Example:**
```python
from textprompts import SafeString

template = SafeString("Hello {name}, you are {age} years old")
print(template.placeholders)  # {'name', 'age'}

# ✅ Strict formatting (default) - all placeholders required
result = template.format(name="Alice", age=30)

# ❌ This raises ValueError  
result = template.format(name="Alice")  # Missing 'age'

# ✅ Partial formatting with skip_validation
partial = template.format(name="Alice", skip_validation=True)
print(partial)  # "Hello Alice, you are {age} years old"
```

## Exception Classes

### `TextPromptsError`

Base exception class for all TextPrompts errors.

### `FileMissingError`

Raised when a requested file doesn't exist.

**Example:**
```python
try:
    prompt = load_prompt("nonexistent.txt")
except FileMissingError as e:
    print(f"File not found: {e}")
```

### `MissingMetadataError`

Raised when metadata is required but not found.

**Example:**
```python
try:
    prompt = load_prompt("no_metadata.txt", meta="strict")  # requires metadata
except MissingMetadataError as e:
    print(f"Missing metadata: {e}")
```

### `InvalidMetadataError`

Raised when metadata is malformed or contains invalid values.

**Example:**
```python
try:
    prompt = load_prompt("bad_toml.txt")
except InvalidMetadataError as e:
    print(f"Invalid metadata: {e}")
```

### `MalformedHeaderError`

Raised when the frontmatter delimiters are malformed.

**Example:**
```python
try:
    prompt = load_prompt("malformed.txt")
except MalformedHeaderError as e:
    print(f"Malformed header: {e}")
```

## CLI Interface

### `textprompts` command

Load and display prompts from the command line.

**Usage:**
```bash
textprompts [OPTIONS] PATHS...
```

**Options:**
- `--json`: Output JSON metadata instead of prompt body

**Examples:**
```bash
# Display a single prompt
textprompts prompts/greeting.txt

# Display prompt metadata as JSON
textprompts --json prompts/greeting.txt
```

## Type Hints

TextPrompts is fully typed and includes a `py.typed` marker file. All public APIs include comprehensive type hints for optimal IDE support.

```python
from textprompts import load_prompt, Prompt, PromptMeta
from pathlib import Path

# These are properly typed
prompt: Prompt = load_prompt("file.txt")
meta: PromptMeta | None = prompt.meta
path: Path = prompt.path
```

## Performance Considerations

### File Limits

By default, `load_prompts()` limits processing to 1000 files to prevent accidental loading of huge directories:

```python
# Raises error if more than 100 files found
prompts = load_prompts("huge_dir/", max_files=100)

# Disable limits (use with caution)
prompts = load_prompts("huge_dir/", max_files=None)
```

### Caching

For applications that load the same prompts repeatedly, consider caching:

```python
from functools import lru_cache

@lru_cache(maxsize=None)
def get_cached_prompt(path: str):
    return load_prompt(path)
```

### Memory Usage

Each `Prompt` object stores the full file content in memory. For very large prompt files, consider streaming approaches or lazy loading patterns.