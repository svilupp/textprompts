# Examples

This page contains practical examples of using TextPrompts in real applications.

## Basic Usage

### Simple Prompt Loading

```python
from textprompts import load_prompt

# Load a single prompt
prompt = load_prompt("prompts/greeting.txt")
message = prompt.prompt.format(name="Alice")
print(message)
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
    'openai:gpt-4.1',
    system_prompt=system_prompt.prompt.format(
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
            "content": system_prompt.prompt.format(
                domain="customer service",
                tone="helpful and professional"
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

### LangChain Integration

```python
from langchain.prompts import PromptTemplate
from langchain.llms import OpenAI
from textprompts import load_prompt

# Load prompt template
template_prompt = load_prompt("prompts/analysis_template.txt")

# Create LangChain prompt
prompt = PromptTemplate(
    template=str(template_prompt.prompt),
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

### Prompt Registry

```python
from pathlib import Path
from typing import Dict

from textprompts import Prompt, load_prompt

class PromptRegistry:
    def __init__(self, directory: str):
        self.prompts: Dict[str, Prompt] = {}
        self._load_directory(directory)

    def _load_directory(self, directory: str):
        """Load all prompts from directory."""
        for path in Path(directory).rglob("*.txt"):
            prompt = load_prompt(path)
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
        return prompt.prompt.format(**kwargs)

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

## Testing Examples

### Unit Testing Prompts

```python
import unittest
from textprompts import load_prompt, PromptString

class TestPrompts(unittest.TestCase):
    def test_greeting_prompt(self):
        prompt = load_prompt("prompts/greeting.txt")
        
        # Test metadata
        self.assertEqual(prompt.meta.title, "Customer Greeting")
        self.assertIsNotNone(prompt.meta.version)
        
        # Test formatting
        result = prompt.prompt.format(name="Alice")
        self.assertIn("Alice", result)
        self.assertNotIn("{name}", result)
    
    def test_prompt_variables(self):
        prompt = load_prompt("prompts/customer_support.txt")
        
        # Test that all required variables are documented
        expected_vars = {"customer_name", "issue_type", "agent_name"}
        content = str(prompt.prompt)
        found_vars = set(re.findall(r'\{([^}]+)\}', content))
        
        self.assertEqual(found_vars, expected_vars)
    
    def test_safe_string_validation(self):
        template = PromptString("Hello {name}")
        
        # Should work with all variables
        result = template.format(name="Alice")
        self.assertEqual(result, "Hello Alice")
        
        # Should fail with missing variables
        with self.assertRaises(ValueError):
            template.format()
```

### Saving with YAML Front-Matter

```python
from textprompts import save_prompt, load_prompt

# Save a prompt with YAML front-matter instead of the default TOML
save_prompt("my_prompt.txt", "Analyze this: {data}", format="yaml")

# Loading auto-detects the format, no special handling needed
prompt = load_prompt("my_prompt.txt")
result = prompt.prompt.format(data="quarterly sales")
```