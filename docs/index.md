# TextPrompts Documentation

A minimal, zero-dependency prompt loader for Python that keeps your prompts close to your code but out of your source files.

## Overview

TextPrompts solves the common problem of managing prompts in AI applications. Instead of embedding prompts in your source code (where they get mangled by formatters) or using complex prompt management systems, TextPrompts lets you store prompts in simple `.txt` files with optional metadata.

## Key Features

- **Zero runtime dependencies** (except Pydantic v2)
- **Simple TOML frontmatter** with `---` delimiters
- **SafeString** class prevents format() errors
- **Recursive directory loading** with glob patterns
- **Performance safeguards** with configurable limits
- **Comprehensive error handling**
- **Full type hints** and IDE support

## Quick Example

**prompt.txt**:
```
---
title = "Customer Support"
version = "1.0.0"
---

Hello {customer_name},

Thank you for contacting us about {issue_type}.
We'll resolve this promptly.

Best regards,
{agent_name}
```

**Python code**:
```python
from textprompts import load_prompt

prompt = load_prompt("prompt.txt")
response = prompt.body.format(
    customer_name="Alice",
    issue_type="billing",
    agent_name="Bob"
)
```

## Installation

```bash
pip install textprompts
# or
uv add textprompts
```

## Next Steps

- [Getting Started Guide](getting-started.md)
- [File Format Reference](file-format.md)
- [API Reference](api-reference.md)
- [Examples](examples.md)
- [Integration Guides](integrations.md)