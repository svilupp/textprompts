# Getting Started

This guide will help you get started with TextPrompts in just a few minutes.

## Installation

```bash
pip install textprompts
```

Or with uv:
```bash
uv add textprompts
```

## Your First Prompt

1. Create a simple prompt file `hello.txt`:

```
---
title = "Hello World"
description = "A simple greeting prompt"
---
Hello {name}! Welcome to TextPrompts.
```

2. Load and use it in Python:

```python
from textprompts import load_prompt

# Load the prompt
prompt = load_prompt("hello.txt")

# Access metadata
print(prompt.meta.title)  # "Hello World"

# Use the prompt
message = prompt.body.format(name="Alice")
print(message)  # "Hello Alice! Welcome to TextPrompts."
```

## Loading Multiple Prompts

Create a directory structure:
```
prompts/
├── greeting.txt
├── farewell.txt
└── support/
    ├── billing.txt
    └── technical.txt
```

Load all prompts:
```python
from textprompts import load_prompts

# Load all .txt files in prompts/
prompts = load_prompts("prompts/")

# Load recursively
prompts = load_prompts("prompts/", recursive=True)

# Load with custom pattern
prompts = load_prompts("prompts/", glob="*.prompt")
```

## Safe String Formatting

TextPrompts includes a `PromptString` class that prevents common formatting errors:

```python
from textprompts import PromptString

template = PromptString("Hello {name}, you are {age} years old")

# ✅ This works
result = template.format(name="Alice", age=30)

# ❌ This raises ValueError: Missing format variables: ['age']
result = template.format(name="Alice")
```

## Error Handling

TextPrompts provides detailed error messages:

```python
from textprompts import load_prompt, TextPromptsError

try:
    prompt = load_prompt("nonexistent.txt")
except TextPromptsError as e:
    print(f"Failed to load prompt: {e}")
```

## Common Patterns

### Environment-specific prompts
```python
import os
from textprompts import load_prompt

env = os.getenv("ENV", "development")
prompt = load_prompt(f"prompts/{env}/system.txt")
```

### Cached loading
```python
from functools import lru_cache
from textprompts import load_prompt

@lru_cache(maxsize=None)
def get_prompt(name):
    return load_prompt(f"prompts/{name}.txt")
```

### Validation
```python
from textprompts import load_prompts

# Load all prompts and validate they can be loaded
prompts = load_prompts("prompts/", recursive=True)
print(f"Successfully loaded {len(prompts)} prompts")
```

## Next Steps

- Learn about the [file format](file-format.md)
- Explore the [API reference](api-reference.md)
- Check out [integration examples](integrations.md)