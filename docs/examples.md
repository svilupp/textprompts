# Examples

This page contains practical examples of using TextPrompts in real applications.

## Basic Usage

### Simple Prompt Loading

```python
from textprompts import load_prompt

# Load a single prompt
prompt = load_prompt("prompts/greeting.txt")
message = prompt.body.format(name="Alice")
print(message)
```

### Directory Loading

```python
from textprompts import load_prompts

# Load all prompts from a directory
prompts = load_prompts("prompts/", recursive=True)

# Create a prompt lookup
prompt_dict = {p.meta.title: p for p in prompts}
greeting = prompt_dict["Customer Greeting"]
```

## Integration Examples

### Pydantic AI Integration

```python
from textprompts import load_prompt
from pydantic_ai import Agent

# Load system prompt
system_prompt = load_prompt("prompts/customer_support_system.txt")

# Create agent with formatted prompt
agent = Agent(
    'openai:gpt-4',
    system_prompt=system_prompt.body.format(
        company_name="ACME Corp",
        support_level="premium",
        response_time="24 hours"
    )
)

# Use the agent
result = agent.run_sync("I need help with my order")
```

### OpenAI Integration

```python
import openai
from textprompts import load_prompt

# Load prompts
system_prompt = load_prompt("prompts/assistant_system.txt")
user_prompt = load_prompt("prompts/user_query.txt")

# Create completion
response = openai.chat.completions.create(
    model="gpt-4",
    messages=[
        {
            "role": "system", 
            "content": system_prompt.body.format(
                domain="customer service",
                tone="helpful and professional"
            )
        },
        {
            "role": "user",
            "content": user_prompt.body.format(
                query="How do I return an item?",
                customer_tier="premium"
            )
        }
    ]
)
```

### LangChain Integration

```python
from langchain.prompts import PromptTemplate
from langchain.llms import OpenAI
from textprompts import load_prompt

# Load prompt template
template_prompt = load_prompt("prompts/analysis_template.txt")

# Create LangChain prompt
prompt = PromptTemplate(
    template=str(template_prompt.body),
    input_variables=["document", "question"]
)

# Use with LangChain
llm = OpenAI()
chain = prompt | llm
result = chain.invoke({
    "document": "...",
    "question": "What are the key findings?"
})
```

## Advanced Patterns

### Environment-Specific Prompts

```python
import os
from textprompts import load_prompt

def get_system_prompt():
    env = os.getenv("ENVIRONMENT", "development")
    return load_prompt(f"prompts/{env}/system.txt")

# Load different prompts based on environment
system_prompt = get_system_prompt()
```

### Prompt Versioning

```python
from textprompts import load_prompts
from packaging import version

def get_latest_prompt(name: str):
    """Get the latest version of a named prompt."""
    prompts = load_prompts("prompts/", recursive=True)
    
    # Filter by name and sort by version
    named_prompts = [p for p in prompts if p.meta and p.meta.title == name]
    if not named_prompts:
        raise ValueError(f"No prompts found with name: {name}")
    
    # Sort by version (latest first)
    named_prompts.sort(
        key=lambda p: version.parse(p.meta.version or "0.0.0"),
        reverse=True
    )
    
    return named_prompts[0]

# Get latest version
latest_prompt = get_latest_prompt("Customer Support")
```

### Prompt Registry

```python
from textprompts import load_prompts
from typing import Dict

class PromptRegistry:
    def __init__(self, directory: str):
        self.prompts: Dict[str, Prompt] = {}
        self.load_prompts(directory)
    
    def load_prompts(self, directory: str):
        """Load all prompts from directory."""
        prompts = load_prompts(directory, recursive=True)
        for prompt in prompts:
            if prompt.meta and prompt.meta.title:
                self.prompts[prompt.meta.title] = prompt
    
    def get(self, name: str) -> Prompt:
        """Get prompt by name."""
        if name not in self.prompts:
            raise KeyError(f"Prompt '{name}' not found")
        return self.prompts[name]
    
    def format(self, name: str, **kwargs) -> str:
        """Get and format prompt."""
        prompt = self.get(name)
        return prompt.body.format(**kwargs)

# Usage
registry = PromptRegistry("prompts/")
response = registry.format("Customer Greeting", name="Alice")
```

### Caching with TTL

```python
import time
from functools import wraps
from textprompts import load_prompt

def cached_prompt(ttl_seconds: int = 300):
    """Cache prompt with TTL."""
    cache = {}
    
    def decorator(func):
        @wraps(func)
        def wrapper(path: str):
            now = time.time()
            if path in cache:
                prompt, timestamp = cache[path]
                if now - timestamp < ttl_seconds:
                    return prompt
            
            prompt = load_prompt(path)
            cache[path] = (prompt, now)
            return prompt
        return wrapper
    return decorator

@cached_prompt(ttl_seconds=60)
def get_prompt(path: str):
    return load_prompt(path)
```

## Error Handling Examples

### Graceful Degradation

```python
from textprompts import load_prompt, TextPromptsError

def get_prompt_with_fallback(primary_path: str, fallback_path: str):
    """Try to load primary prompt, fall back to secondary."""
    try:
        return load_prompt(primary_path)
    except TextPromptsError:
        return load_prompt(fallback_path)

# Usage
prompt = get_prompt_with_fallback(
    "prompts/v2/greeting.txt",
    "prompts/v1/greeting.txt"
)
```

### Validation

```python
from textprompts import load_prompts, SafeString
import re

def validate_prompts(directory: str):
    """Validate all prompts in directory."""
    prompts = load_prompts(directory, recursive=True)
    errors = []
    
    for prompt in prompts:
        # Check for required metadata
        if not prompt.meta or not prompt.meta.title:
            errors.append(f"{prompt.path}: Missing title")
        
        # Check for unsafe placeholders
        placeholders = re.findall(r'\{([^}]+)\}', prompt.body)
        unsafe = [p for p in placeholders if not p.isidentifier()]
        if unsafe:
            errors.append(f"{prompt.path}: Unsafe placeholders: {unsafe}")
    
    return errors

# Usage
errors = validate_prompts("prompts/")
if errors:
    for error in errors:
        print(f"ERROR: {error}")
```

## Testing Examples

### Unit Testing Prompts

```python
import unittest
from textprompts import load_prompt, SafeString

class TestPrompts(unittest.TestCase):
    def test_greeting_prompt(self):
        prompt = load_prompt("prompts/greeting.txt")
        
        # Test metadata
        self.assertEqual(prompt.meta.title, "Customer Greeting")
        self.assertIsNotNone(prompt.meta.version)
        
        # Test formatting
        result = prompt.body.format(name="Alice")
        self.assertIn("Alice", result)
        self.assertNotIn("{name}", result)
    
    def test_prompt_variables(self):
        prompt = load_prompt("prompts/customer_support.txt")
        
        # Test that all required variables are documented
        expected_vars = {"customer_name", "issue_type", "agent_name"}
        content = str(prompt.body)
        found_vars = set(re.findall(r'\{([^}]+)\}', content))
        
        self.assertEqual(found_vars, expected_vars)
    
    def test_safe_string_validation(self):
        template = SafeString("Hello {name}")
        
        # Should work with all variables
        result = template.format(name="Alice")
        self.assertEqual(result, "Hello Alice")
        
        # Should fail with missing variables
        with self.assertRaises(ValueError):
            template.format()
```

### Integration Testing

```python
import tempfile
import os
from textprompts import load_prompts

def test_prompt_loading():
    """Test prompt loading in isolated environment."""
    with tempfile.TemporaryDirectory() as temp_dir:
        # Create test prompts
        prompt_content = """---
title = "Test Prompt"
version = "1.0.0"
---

Hello {name}!"""
        
        prompt_path = os.path.join(temp_dir, "test.txt")
        with open(prompt_path, "w") as f:
            f.write(prompt_content)
        
        # Load and test
        prompts = load_prompts(temp_dir)
        assert len(prompts) == 1
        assert prompts[0].meta.title == "Test Prompt"
        
        # Test formatting
        result = prompts[0].body.format(name="Test")
        assert result == "Hello Test!"
```