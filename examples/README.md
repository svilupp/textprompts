# TextPrompts Examples

This directory contains practical examples showing how to use TextPrompts in real applications.

## Running the Examples

All examples are self-contained and can be run directly:

```bash
# Basic usage demonstration
python examples/basic_usage.py

# PromptString formatting demo
python examples/simple_format_demo.py

# Pydantic AI integration example
python examples/pydantic_ai_example.py
```

## Example Files

### `basic_usage.py`
Comprehensive demonstration of core TextPrompts functionality:
- Loading single prompts with metadata
- Loading multiple prompts from directories
- Using PromptString for safe formatting
- Loading prompts without metadata
- Error handling examples

### `simple_format_demo.py`
Focused demonstration of the PromptString feature:
- Shows the problem with regular string formatting
- Demonstrates how PromptString prevents silent failures
- Shows that PromptString works like a regular string

### `pydantic_ai_example.py`
Integration example with Pydantic AI:
- Customer support agent system
- Prompt templates for queries
- Safe formatting with validation
- Mock implementation (works without Pydantic AI installed)

## Key Concepts Demonstrated

### 1. Prompt File Format
```
---
title = "Example Prompt"
version = "1.0.0"
author = "Your Name"
description = "What this prompt does"
---
Your prompt content with {variables} goes here.
```

### 2. Safe String Formatting
```python
from textprompts import PromptString

# This validates all variables are provided
template = PromptString("Hello {name}, order {id} is {status}")
result = template.format(name="Alice", id="123", status="shipped")
```

### 3. Directory Loading
```python
from textprompts import load_prompts

# Load all prompts from a directory tree
prompts = load_prompts("prompts/", recursive=True)
prompt_dict = {p.meta.title: p for p in prompts if p.meta}
```

### 4. Error Prevention
```python
# Regular strings silently leave placeholders unfilled
regular = "Hello {name}"
result = regular.format()  # Returns "Hello {name}" - BAD!

# PromptString raises clear errors
safe = PromptString("Hello {name}")
result = safe.format()  # Raises ValueError - GOOD!
```

## Integration Patterns

### Environment-Based Loading
```python
import os
from textprompts import load_prompt

env = os.getenv("ENV", "development")
prompt = load_prompt(f"prompts/{env}/system.txt")
```

### Caching for Performance
```python
from functools import lru_cache

@lru_cache(maxsize=None)
def get_prompt(name):
    return load_prompt(f"prompts/{name}.txt")
```

### Validation Pipeline
```python
from textprompts import load_prompts

# Validate all prompts can be loaded
prompts = load_prompts("prompts/", recursive=True)
print(f"Successfully validated {len(prompts)} prompts")
```

## Best Practices Shown

1. **Organize prompts by domain** - customer/, internal/, etc.
2. **Use semantic versioning** - Track prompt changes over time
3. **Include descriptive metadata** - Document purpose and usage
4. **Validate variables** - Use PromptString to catch errors early
5. **Handle errors gracefully** - Provide fallbacks and clear messages

## Next Steps

After running these examples:

1. Read the [documentation](../docs/) for complete API reference
2. Look at the [integration guide](../docs/integrations.md) for your AI framework
3. Check out the [file format reference](../docs/file-format.md) for advanced features

## Contributing Examples

To add a new example:

1. Create a self-contained Python file
2. Include clear comments and documentation
3. Demonstrate a specific use case or integration
4. Update this README with a description
5. Test that it runs without external dependencies (use mocks if needed)