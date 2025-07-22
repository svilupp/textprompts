# File Format

TextPrompts uses a simple file format with optional TOML frontmatter delimited by `---`.

## Basic Structure

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
prompt = load_prompt("simple.txt", skip_meta=True)
```

## Format Rules

### Frontmatter Delimiters

- Must use exactly three dashes: `---`
- Must be on their own lines
- First delimiter must be at the start of the file
- Second delimiter marks the end of metadata

### TOML Syntax

The frontmatter uses standard TOML syntax:
- Strings must be quoted: `title = "My Prompt"`
- Dates use ISO format: `created = "2024-01-15"`
- Comments allowed: `# This is a comment`

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
- TOML syntax in frontmatter
- Required fields (title when metadata is present)
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