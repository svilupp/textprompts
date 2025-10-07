# File Format Specification

Complete specification for textprompts file format.

## Overview

A textprompts file consists of:
1. **Optional TOML front-matter** (metadata)
2. **Prompt content** (the actual prompt text)

## File Structure

### Complete Example

```
---
title = "Customer Greeting"
version = "1.0.0"
author = "Support Team"
created = "2024-01-15"
description = "Friendly greeting for customer support interactions"
---
Hello {customer_name}!

Welcome to {company_name}. We're here to help you with {issue_type}.

Best regards,
{agent_name}
```

### Minimal Example (No Metadata)

```
Hello {name}!

This is a simple prompt without metadata.
```

## Front-Matter (Metadata)

### Delimiters

Front-matter is enclosed by `---` delimiters:

```
---
metadata goes here
---
prompt content goes here
```

**Rules:**
- Opening `---` must be the very first line (no whitespace before it)
- Closing `---` must be on its own line
- Content between delimiters must be valid TOML

### TOML Syntax

The front-matter uses [TOML](https://toml.io/) syntax.

**Strings:**
```toml
title = "My Prompt"
description = "A description"
```

**Multiline strings:**
```toml
description = """
This is a longer description
that spans multiple lines.
"""
```

**Dates:**
```toml
created = "2024-01-15"
# or ISO 8601
created = 2024-01-15T10:30:00Z
```

**Custom fields:**
```toml
title = "My Prompt"
custom_field = "custom value"
tags = ["support", "greeting"]
priority = 1
```

### Standard Fields

The following fields have special meaning:

| Field | Type | Required* | Description |
|-------|------|-----------|-------------|
| `title` | string | STRICT | Human-readable title |
| `version` | string | STRICT | Semantic version (e.g., "1.0.0") |
| `description` | string | STRICT | What the prompt does |
| `author` | string | No | Who created it |
| `created` | string | No | Creation date (ISO 8601 recommended) |

\* *Required in STRICT metadata mode*

### Custom Fields

You can add any custom fields:

```toml
---
title = "My Prompt"
version = "1.0.0"
description = "Example"
# Custom fields
category = "customer-support"
tier = "premium"
language = "en"
tags = ["greeting", "formal"]
estimated_tokens = 150
---
```

Custom fields are preserved but not validated by textprompts-ts.

## Prompt Content

### Placeholder Syntax

Use curly braces for placeholders:

```
Hello {name}!
```

**Named placeholders:**
```
User {username} ordered {item_name} on {order_date}.
```

**Positional placeholders:**
```
User {0} ordered {1} on {2}.
```

**Mixed placeholders:**
```
User {0} ordered {item_name} on {1}.
```

### Escaping Braces

To use literal braces, double them:

```
Set the variable {{name}} to {value}.
```

Formats to:
```
Set the variable {name} to 42.
```

### Whitespace Handling

**Leading/trailing whitespace** is automatically trimmed:

```
---
title = "Example"
---

  This has leading spaces

```

The prompt content will be dedented and trimmed.

**Internal whitespace** is preserved:

```
Line 1

Line 3 (with blank line above)
    Indented line
```

### Special Characters

All Unicode characters are supported:

```
Hello {name}! 👋

Welcome to our café ☕
Price: {price}€
```

### Multiline Content

Content can span multiple lines naturally:

```
---
title = "Long Prompt"
---
This is a long prompt
that spans multiple lines.

It can have paragraphs.

And lists:
- Item 1
- Item 2
```

## File Naming

### Recommendations

**Use descriptive, hyphenated names:**
- ✅ `customer-greeting.txt`
- ✅ `system-expert-mode.txt`
- ✅ `code-review-python.txt`
- ❌ `prompt1.txt`
- ❌ `temp.txt`

**Include version in name if maintaining multiple versions:**
- `greeting-v1.txt`
- `greeting-v2.txt`

**Use subdirectories for organization:**
```
prompts/
├── customer/
│   ├── greeting.txt
│   └── farewell.txt
├── system/
│   ├── base.txt
│   └── expert.txt
└── tools/
    └── search.txt
```

### File Extensions

Any text extension works:
- `.txt` (recommended, conventional)
- `.prompt`
- `.md`
- `.text`

The library doesn't enforce extensions, but `.txt` is recommended for consistency.

## Validation Rules

### IGNORE Mode

- No validation performed
- Metadata is not parsed
- Filename (without extension) becomes `title`

### ALLOW Mode

- Parses metadata if present
- Allows incomplete metadata
- Validates TOML syntax
- Falls back to filename for `title` if not provided

### STRICT Mode

- Requires front-matter delimiters
- Requires TOML syntax to be valid
- Requires these fields:
  - `title` (non-empty string)
  - `description` (non-empty string)
  - `version` (non-empty string)
- Throws error if any requirement fails

## Examples

### Customer Support Prompt

```
---
title = "Premium Customer Greeting"
version = "2.1.0"
author = "Customer Success Team"
created = "2024-01-15"
description = "Personalized greeting for premium tier customers. Variables: customer_name, account_tier, agent_name"
category = "customer-support"
tier = "premium"
---
Hello {customer_name}!

As a valued {account_tier} member, you have priority access to our support team.

I'm {agent_name}, and I'm here to assist you today.

How can I help you?
```

### System Prompt

```
---
title = "AI Assistant Base System"
version = "3.0.0"
description = "Base system prompt for AI assistant"
---
You are a helpful AI assistant for {company_name}.

Your core responsibilities:
- Answer questions clearly and accurately
- Maintain a {tone} tone
- Escalate to humans when appropriate
- Never make up information

Company values: {company_values}
```

### Code Review Prompt

```
---
title = "Code Review Assistant"
version = "1.0.0"
description = "AI code review prompt for pull requests"
language = "python"
---
Please review the following {language} code for:

1. **Correctness**: Does it work as intended?
2. **Performance**: Are there optimization opportunities?
3. **Security**: Any vulnerabilities?
4. **Style**: Follows {language} conventions?

Code:
```{language}
{code}
```

Focus areas: {focus_areas}
```

### Minimal Prompt

```
Analyze this {data_type}: {data}
```

No metadata needed for simple cases.

### Function/Tool Schema

```
---
title = "Weather API Tool"
version = "1.0.0"
description = "OpenAI function calling schema for weather API"
---
{
  "type": "function",
  "function": {
    "name": "get_weather",
    "description": "Get current weather for a location",
    "parameters": {
      "type": "object",
      "properties": {
        "location": {
          "type": "string",
          "description": "City name or ZIP code"
        },
        "units": {
          "type": "string",
          "enum": ["celsius", "fahrenheit"],
          "default": "celsius"
        }
      },
      "required": ["location"]
    }
  }
}
```

## Best Practices

### 1. Use Semantic Versioning

```toml
version = "1.0.0"  # Initial release
version = "1.1.0"  # Added new variable (backward compatible)
version = "2.0.0"  # Changed variable names (breaking)
```

### 2. Document Variables

Include variable requirements in description:

```toml
description = "Customer greeting. Required: customer_name, company_name. Optional: agent_name (defaults to 'Support Team')"
```

### 3. Keep Content Focused

One prompt per file. Use composition if you need complex prompts.

### 4. Use Consistent Formatting

**Choose a style and stick to it:**

```
---
title = "Example"
version = "1.0.0"
---
Content here
```

Not:

```
---
title="Example"
version="1.0.0"
---

Content here
```

### 5. Include Creation Date

Helps track prompt age:

```toml
created = "2024-01-15"
```

### 6. Use Descriptive Titles

```toml
# ✅ Good
title = "Premium Customer Support Greeting"

# ❌ Bad
title = "Prompt 1"
```

## Common Mistakes

### Missing Closing Delimiter

❌ **Wrong:**
```
---
title = "Example"
Hello {name}
```

✅ **Correct:**
```
---
title = "Example"
---
Hello {name}
```

### Whitespace Before Opening Delimiter

❌ **Wrong:**
```
  ---
title = "Example"
---
```

✅ **Correct:**
```
---
title = "Example"
---
```

### Invalid TOML

❌ **Wrong:**
```
---
title = Unquoted String
---
```

✅ **Correct:**
```
---
title = "Quoted String"
---
```

### Forgetting to Escape Braces

❌ **Wrong:**
```
Set {variable} to {value}
```

If you want literal `{variable}`:

✅ **Correct:**
```
Set {{variable}} to {value}
```

## Migration Guide

### From Python textprompts

The TypeScript version is fully compatible with Python textprompts files.

**No changes needed** - files work as-is:

```python
# Python
from textprompts import load_prompt
prompt = load_prompt("greeting.txt")
```

```typescript
// TypeScript
import { loadPrompt } from "@textprompts/textprompts-ts";
const prompt = await loadPrompt("greeting.txt");
```

### From Raw Strings

**Before:**
```typescript
const prompt = `Hello ${name}, welcome to ${company}!`;
```

**After:**
1. Create `prompts/greeting.txt`:
```
---
title = "Greeting"
version = "1.0.0"
description = "User greeting"
---
Hello {name}, welcome to {company}!
```

2. Load and use:
```typescript
import { loadPrompt } from "@textprompts/textprompts-ts";

const prompt = await loadPrompt("prompts/greeting.txt");
const message = prompt.format({ name: "Alice", company: "ACME" });
```

## See Also

- [API Reference](./api.md) - Complete API documentation
- [Examples](./examples.md) - Real-world usage examples
- [Usage Guide](./guide.md) - Best practices and patterns
- [TOML Specification](https://toml.io/) - Official TOML documentation
