# File Format

TextPrompts uses a simple file format with optional TOML or YAML frontmatter delimited by `---`.

Both TOML and YAML are supported automatically — the parser tries TOML first and falls back to YAML if TOML parsing fails. This means existing TOML files continue to work without changes.

## Basic Structure

### TOML (original format)

```
---
title = "Required: Human-readable name"
version = "Optional: Semantic version"
author = "Optional: Author name"
created = "Optional: Creation date (YYYY-MM-DD)"
description = "Optional: Description"
---
Your prompt content goes here.
You can use {variables} for string formatting.
```

### YAML (also supported)

```
---
title: Required - Human-readable name
version: "1.0.0"
author: Optional - Author name
created: 2024-01-15
description: Optional - Description
---
Your prompt content goes here.
You can use {variables} for string formatting.
```

## Metadata Fields

### Required Fields

- `title`: Human-readable name for the prompt

### Optional Fields

- `version`: Semantic version string (e.g., "1.0.0")
- `author`: Author name
- `created`: Creation date in YYYY-MM-DD format
- `description`: Description of the prompt's purpose

## Examples

### Full Metadata Example

```
---
title = "Customer Support Response"
version = "1.2.0"
author = "Support Team"
created = "2024-01-15"
description = "Standard response template for customer inquiries"
---
Dear {customer_name},

Thank you for contacting {company_name} regarding {issue_type}.

We have received your request and will respond within {response_time}.

Best regards,
{agent_name}
{company_name} Support Team
```

### Full Metadata Example (YAML)

```
---
title: Customer Support Response
version: "1.2.0"
author: Support Team
created: 2024-01-15
description: Standard response template for customer inquiries
---
Dear {customer_name},

Thank you for contacting {company_name} regarding {issue_type}.

We have received your request and will respond within {response_time}.

Best regards,
{agent_name}
{company_name} Support Team
```

### Minimal Example

```
---
title = "Simple Greeting"
---
Hello {name}!
```

### No Metadata Example

```
This is a simple prompt without any metadata.
Just use {variables} as needed.
```

To load prompts without metadata:
```python
from textprompts import load_prompt

prompt = load_prompt("simple.txt", meta="ignore")
```

## Format Rules

### Frontmatter Delimiters

- Must use exactly three dashes: `---`
- Must be on their own lines
- First delimiter must be at the start of the file
- Second delimiter marks the end of metadata

### TOML Syntax

The frontmatter can use standard TOML syntax:
- Strings must be quoted: `title = "My Prompt"`
- Dates use ISO format: `created = "2024-01-15"`
- Comments allowed: `# This is a comment`

### YAML Syntax

Alternatively, you can use YAML syntax:
- Strings can be unquoted: `title: My Prompt`
- Dates are auto-parsed: `created: 2024-01-15`
- Comments allowed: `# This is a comment`
- Quote strings with special characters: `description: "Has: colons"`

**Important YAML notes:**
- Nested objects are not supported (use flat key-value pairs only)
- Unquoted numbers are automatically converted to strings (e.g., `version: 1.0` becomes `"1.0"`)
- YAML boolean values (`yes`, `no`, `true`, `false`) are converted to strings
- For version numbers, always quote: `version: "1.0.0"`

### Format Detection

The parser uses a **try TOML first, fallback to YAML** strategy:
1. If the front matter is valid TOML, it is parsed as TOML
2. If TOML parsing fails, YAML parsing is attempted
3. If both fail, the TOML error is reported (for backward compatibility)

### Content Body

- Everything after the second `---` is the prompt content
- Leading/trailing whitespace is preserved
- Empty lines are preserved
- Use `{variable}` for string formatting placeholders

## Special Cases

### Triple Dashes in Content

If your prompt content contains `---`, it won't interfere with parsing:

```
---
title = "Code Example"
---

Here's a YAML frontmatter example:
---
title: "My Document"
---
This works fine!
```

### Empty Content

Prompts with empty content will raise a validation error:

```
---
title = "Empty Prompt"
---
```

This will raise: `ValueError: Prompt body is empty`

### Saving with Format Choice

You can choose the output format when saving prompts:

```python
from textprompts import save_prompt

# Save with TOML front matter (default)
save_prompt("prompt.txt", "Hello {name}")

# Save with YAML front matter
save_prompt("prompt.txt", "Hello {name}", format="yaml")
```

```typescript
import { savePrompt } from "textprompts";

// Save with TOML (default)
await savePrompt("prompt.txt", "Hello {name}");

// Save with YAML
await savePrompt("prompt.txt", "Hello {name}", { format: "yaml" });
```

### Malformed Frontmatter

Invalid TOML will raise an `InvalidMetadataError`:

```
---
title = "Unclosed quote
---
Content here
```

## Best Practices

1. **Always include a title** - even if metadata is optional
2. **Use semantic versioning** - helps track prompt changes
3. **Add descriptions** - document the prompt's purpose
4. **Keep variables descriptive** - use `{customer_name}` not `{name}`
5. **Test your prompts** - ensure all variables are provided

## Validation

TextPrompts validates:
- TOML or YAML syntax in frontmatter
- Required fields (title when metadata is present)
- Flat structure (nested YAML objects are rejected)
- Version format (if provided)
- Non-empty content body
- UTF-8 encoding

## File Extensions

TextPrompts looks for `.txt` files by default, but you can use any extension:

```python
# Load .prompt files
prompts = load_prompts("templates/", glob="*.prompt")

# Load .md files
prompts = load_prompts("docs/", glob="*.md")
```