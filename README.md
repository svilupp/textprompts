# textprompts

[![PyPI version](https://img.shields.io/pypi/v/textprompts.svg)](https://pypi.org/project/textprompts/)
[![Python versions](https://img.shields.io/pypi/pyversions/textprompts.svg)](https://pypi.org/project/textprompts/)
[![CI status](https://github.com/svilupp/textprompts/workflows/CI/badge.svg)](https://github.com/svilupp/textprompts/actions)
[![Coverage](https://img.shields.io/codecov/c/github/svilupp/textprompts)](https://codecov.io/gh/svilupp/textprompts)
[![License](https://img.shields.io/pypi/l/textprompts.svg)](https://github.com/svilupp/textprompts/blob/main/LICENSE)


> **So simple, it's not even worth vibing about coding yet it just makes so much sense.**

Are you tired of vendors trying to sell you fancy UIs for prompt management that just make your system more confusing and harder to debug? Isn't it nice to just have your prompts **next to your code**? 

But then you worry: *Did my formatter change my prompt? Are those spaces at the beginning actually part of the prompt or just indentation?*

**textprompts** solves this elegantly: treat your prompts as **text files** and keep your linters and formatters away from them.

## Why textprompts?

- ✅ **Prompts live next to your code** - no external systems to manage
- ✅ **Git is your version control** - diff, branch, and experiment with ease  
- ✅ **No formatter headaches** - your prompts stay exactly as you wrote them
- ✅ **Minimal markup** - just TOML front-matter when you need metadata (or no metadata if you prefer!)
- ✅ **Zero dependencies** - well, almost (just Pydantic)
- ✅ **Safe formatting** - catch missing variables before they cause problems
- ✅ **Works with everything** - OpenAI, Anthropic, local models, function calls

## Installation

```bash
uv add textprompts # or pip install textprompts
```

## Quick Start

**Super simple by default** - TextPrompts just loads text files with optional metadata:

1. **Create a prompt file** (`greeting.txt`):
```
---
title = "Customer Greeting"
version = "1.0.0"
description = "Friendly greeting for customer support"
---
Hello {customer_name}!

Welcome to {company_name}. We're here to help you with {issue_type}.

Best regards,
{agent_name}
```

2. **Load and use it** (no configuration needed):
```python
import textprompts

# Just load it - works with or without metadata
prompt = textprompts.load_prompt("greeting.txt")
# Or simply
alt = textprompts.Prompt("greeting.txt")

# Use it safely - all placeholders must be provided
message = prompt.prompt.format(
    customer_name="Alice",
    company_name="ACME Corp", 
    issue_type="billing question",
    agent_name="Sarah"
)

print(message)

# Or use partial formatting when needed
partial = prompt.prompt.format(
    customer_name="Alice",
    company_name="ACME Corp",
    skip_validation=True
)
# Result: "Hello Alice!\n\nWelcome to ACME Corp. We're here to help you with {issue_type}.\n\nBest regards,\n{agent_name}"

# Prompt objects expose `.meta` and `.prompt`.
# Use `prompt.prompt.format()` for safe formatting or `str(prompt)` for raw text.
```

**Even simpler** - no metadata required:
```python
# simple_prompt.txt contains just: "Analyze this data: {data}"
prompt = textprompts.load_prompt("simple_prompt.txt")  # Just works!
result = prompt.prompt.format(data="sales figures")
```

## Core Features

### Safe String Formatting

Never ship a prompt with missing variables again:

```python
from textprompts import PromptString

template = PromptString("Hello {name}, your order {order_id} is {status}")

# ✅ Strict formatting - all placeholders must be provided
result = template.format(name="Alice", order_id="12345", status="shipped")

# ❌ This catches the error by default
try:
    result = template.format(name="Alice")  # Missing order_id and status
except ValueError as e:
    print(f"Error: {e}")  # Missing format variables: ['order_id', 'status']

# ✅ Partial formatting - replace only what you have
partial = template.format(name="Alice", skip_validation=True)
print(partial)  # "Hello Alice, your order {order_id} is {status}"
```

### Bulk Loading

Load entire directories of prompts:

```python
from textprompts import load_prompts

# Load all prompts from a directory
prompts = load_prompts("prompts/", recursive=True)

# Create a lookup
prompt_dict = {p.meta.title: p for p in prompts if p.meta}
greeting = prompt_dict["Customer Greeting"]
```

### Simple & Flexible Metadata Handling

TextPrompts is designed to be **super simple** by default - just load text files with optional metadata when available. No configuration needed!

```python
import textprompts

# Default behavior: load metadata if available, otherwise just use the file content
prompt = textprompts.load_prompt("my_prompt.txt")  # Just works!

# Three modes available for different use cases:
# 1. IGNORE (default): Treat as simple text file, use filename as title
textprompts.set_metadata("ignore")  # Super simple file loading
prompt = textprompts.load_prompt("prompt.txt")  # No metadata parsing
print(prompt.meta.title)  # "prompt" (from filename)

# 2. ALLOW: Load metadata if present, don't worry if it's incomplete
textprompts.set_metadata("allow")  # Flexible metadata loading  
prompt = textprompts.load_prompt("prompt.txt")  # Loads any metadata found

# 3. STRICT: Require complete metadata for production use
textprompts.set_metadata("strict")  # Prevent errors in production
prompt = textprompts.load_prompt("prompt.txt")  # Must have title, description, version

# Override per prompt when needed
prompt = textprompts.load_prompt("prompt.txt", meta="strict")
```

**Why this design?**
- **Default = Simple**: No configuration needed, just load files
- **Flexible**: Add metadata when you want structure  
- **Production-Safe**: Use strict mode to catch missing metadata before deployment

## Real-World Examples

### OpenAI Integration

```python
import openai
from textprompts import load_prompt

system_prompt = load_prompt("prompts/customer_support_system.txt")
user_prompt = load_prompt("prompts/user_query_template.txt")

response = openai.chat.completions.create(
    model="gpt-4.1-mini",
    messages=[
        {
            "role": "system",
            "content": system_prompt.prompt.format(
                company_name="ACME Corp",
                support_level="premium"
            )
        },
        {
            "role": "user", 
            "content": user_prompt.prompt.format(
                query="How do I return an item?",
                customer_tier="premium"
            )
        }
    ]
)
```

### Function Calling (Tool Definitions)

Yes, you can version control your whole tool schemas too:

```python
# tools/search_products.txt
---
title = "Product Search Tool"
version = "2.1.0"
description = "Search our product catalog"
---
{
    "type": "function",
    "function": {
        "name": "search_products",
        "description": "Search for products in our catalog",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query for products"
                },
                "category": {
                    "type": "string", 
                    "enum": ["electronics", "clothing", "books"],
                    "description": "Product category to search within"
                },
                "max_results": {
                    "type": "integer",
                    "default": 10,
                    "description": "Maximum number of results to return"
                }
            },
            "required": ["query"]
        }
    }
}
```

```python
import json
from textprompts import load_prompt

# Load and parse the tool definition
tool_prompt = load_prompt("tools/search_products.txt")
tool_schema = json.loads(tool_prompt.prompt)

# Use with OpenAI
response = openai.chat.completions.create(
    model="gpt-4.1-mini",
    messages=[{"role": "user", "content": "Find me some electronics"}],
    tools=[tool_schema]
)
```

### Environment-Specific Prompts

```python
import os
from textprompts import load_prompt

env = os.getenv("ENVIRONMENT", "development")
system_prompt = load_prompt(f"prompts/{env}/system.txt")

# prompts/development/system.txt - verbose logging
# prompts/production/system.txt - concise responses
```

### Prompt Versioning & Experimentation

```python
from textprompts import load_prompt

# Easy A/B testing
prompt_version = "v2"  # or "v1", "experimental", etc.
prompt = load_prompt(f"prompts/{prompt_version}/system.txt")

# Git handles the rest:
# git checkout experiment-branch
# git diff main -- prompts/
```

## File Format

TextPrompts uses TOML front-matter (optional) followed by your prompt content:

```
---
title = "My Prompt"
version = "1.0.0"
author = "Your Name"
description = "What this prompt does"
created = "2024-01-15"
tags = ["customer-support", "greeting"]
---
Your prompt content goes here.

Use {variables} for templating.
```

### Metadata Modes

Choose the right level of strictness for your use case:

1. **IGNORE** (default) - Simple text file loading, filename becomes title
2. **ALLOW** - Load metadata if present, don't worry about completeness  
3. **STRICT** - Require complete metadata (title, description, version) for production safety

You can also set the environment variable `TEXTPROMPTS_METADATA_MODE` to one of
`strict`, `allow`, or `ignore` before importing the library to configure the
default mode.

```python
# Set globally
textprompts.set_metadata("ignore")   # Default: simple file loading
textprompts.set_metadata("allow")    # Flexible: load any metadata  
textprompts.set_metadata("strict")   # Production: require complete metadata

# Or override per prompt
prompt = textprompts.load_prompt("file.txt", meta="strict")
```

## API Reference

### `load_prompt(path, *, meta=None)`

Load a single prompt file.

- `path`: Path to the prompt file
- `meta`: Metadata handling mode - `MetadataMode.STRICT`, `MetadataMode.ALLOW`, `MetadataMode.IGNORE`, or string equivalents. None uses global config.

Returns a `Prompt` object with:
- `prompt.meta`: Metadata from TOML front-matter (always present)
- `prompt.prompt`: The prompt content as a `PromptString`
- `prompt.path`: Path to the original file

### `load_prompts(*paths, recursive=False, glob="*.txt", meta=None, max_files=1000)`

Load multiple prompts from files or directories.

- `*paths`: Files or directories to load
- `recursive`: Search directories recursively (default: False)
- `glob`: File pattern to match (default: "*.txt")
- `meta`: Metadata handling mode - `MetadataMode.STRICT`, `MetadataMode.ALLOW`, `MetadataMode.IGNORE`, or string equivalents. None uses global config.
- `max_files`: Maximum files to process (default: 1000)

### `set_metadata(mode)` / `get_metadata()`

Set or get the global metadata handling mode.

- `mode`: `MetadataMode.STRICT`, `MetadataMode.ALLOW`, `MetadataMode.IGNORE`, or string equivalents

```python
import textprompts

# Set global mode
textprompts.set_metadata(textprompts.MetadataMode.STRICT)
textprompts.set_metadata("allow")  # String also works

# Get current mode
current_mode = textprompts.get_metadata()
```

### `save_prompt(path, content)`

Save a prompt to a file.

- `path`: Path to save the prompt file
- `content`: Either a string (creates template with required fields) or a `Prompt` object

```python
from textprompts import save_prompt

# Save a simple prompt with metadata template
save_prompt("my_prompt.txt", "You are a helpful assistant.")

# Save a Prompt object with full metadata
save_prompt("my_prompt.txt", prompt_object)
```

### `PromptString`

A string subclass that validates `format()` calls:

```python
from textprompts import PromptString

template = PromptString("Hello {name}, you are {role}")

# Strict formatting (default) - all placeholders required
result = template.format(name="Alice", role="admin")  # ✅ Works
result = template.format(name="Alice")  # ❌ Raises ValueError

# Partial formatting - replace only available placeholders  
partial = template.format(name="Alice", skip_validation=True)  # ✅ "Hello Alice, you are {role}"

# Access placeholder information
print(template.placeholders)  # {'name', 'role'}
```

## Error Handling

TextPrompts provides specific exception types:

```python
from textprompts import (
    TextPromptsError,       # Base exception
    FileMissingError,       # File not found
    MissingMetadataError,   # No TOML front-matter when required
    InvalidMetadataError,   # Invalid TOML syntax
    MalformedHeaderError,   # Malformed front-matter structure
    MetadataMode,           # Metadata handling mode enum
    set_metadata,           # Set global metadata mode
    get_metadata            # Get global metadata mode
)
```

## CLI Tool

TextPrompts includes a CLI for quick prompt inspection:

```bash
# View a single prompt
textprompts show greeting.txt

# List all prompts in a directory
textprompts list prompts/ --recursive

# Validate prompts
textprompts validate prompts/
```

## Best Practices

1. **Organize by purpose**: Group related prompts in folders
   ```
   prompts/
   ├── customer-support/
   ├── content-generation/
   └── code-review/
   ```

2. **Use semantic versioning**: Version your prompts like code
   ```
   version = "1.2.0"  # major.minor.patch
   ```

3. **Document your variables**: List expected variables in descriptions
   ```
   description = "Requires: customer_name, issue_type, agent_name"
   ```

4. **Test your prompts**: Write unit tests for critical prompts
   ```python
   def test_greeting_prompt():
    prompt = load_prompt("greeting.txt")
    result = prompt.prompt.format(customer_name="Test")
       assert "Test" in result
   ```

5. **Use environment-specific prompts**: Different prompts for dev/prod
   ```python
   env = os.getenv("ENV", "development")
   prompt = load_prompt(f"prompts/{env}/system.txt")
   ```

## Why Not Just Use String Templates?

You could, but then you lose:
- **Metadata tracking** (versions, authors, descriptions)
- **Safe formatting** (catch missing variables)
- **Organized storage** (searchable, documentable)
- **Version control benefits** (proper diffs, blame, history)
- **Tooling support** (CLI, validation, testing)

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](LICENSE) for details.

---

**textprompts** - Because your prompts deserve better than being buried in code strings. 🚀