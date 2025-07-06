# Integration Guides

This page shows how to integrate TextPrompts with popular AI frameworks and libraries.

## Pydantic AI

[Pydantic AI](https://ai.pydantic.dev/) is a Python agent framework designed to make it less painful to build production-grade applications with generative AI.

### Basic Integration

```python
from textprompts import load_prompt
from pydantic_ai import Agent

# Load system prompt
system_prompt = load_prompt("prompts/customer_agent.txt")

# Create agent
agent = Agent(
    'openai:gpt-4',
    system_prompt=system_prompt.body.format(
        company_name="ACME Corp",
        support_level="premium"
    )
)

# Run agent
result = agent.run_sync("Help me with my order")
```

### Advanced Usage with Dependencies

```python
from textprompts import load_prompt
from pydantic_ai import Agent, RunContext
from pydantic import BaseModel

class CustomerContext(BaseModel):
    customer_id: str
    tier: str
    region: str

# Load prompt template
agent_prompt = load_prompt("prompts/contextual_agent.txt")

# Create agent with dependencies
agent = Agent(
    'openai:gpt-4',
    deps_type=CustomerContext,
    system_prompt=lambda ctx: agent_prompt.body.format(
        customer_tier=ctx.tier,
        region=ctx.region,
        policies=get_regional_policies(ctx.region)
    )
)

# Run with context
context = CustomerContext(
    customer_id="cust_123",
    tier="premium",
    region="US"
)
result = agent.run_sync("What's my refund policy?", deps=context)
```

## OpenAI

### Chat Completions

```python
import openai
from textprompts import load_prompt

# Load prompts
system_prompt = load_prompt("prompts/assistant_system.txt")
user_prompt_template = load_prompt("prompts/user_query.txt")

# Create completion
response = openai.chat.completions.create(
    model="gpt-4",
    messages=[
        {
            "role": "system",
            "content": system_prompt.body.format(
                domain="technical support",
                tone="helpful and detailed"
            )
        },
        {
            "role": "user",
            "content": user_prompt_template.body.format(
                query="How do I reset my password?",
                context="mobile app"
            )
        }
    ]
)
```

### Function Calling

```python
import openai
from textprompts import load_prompt

# Load function description prompt
function_prompt = load_prompt("prompts/function_descriptions.txt")

tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": function_prompt.body.format(
                function_name="get_weather",
                purpose="Get current weather for a location"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {"type": "string"}
                }
            }
        }
    }
]

response = openai.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "What's the weather in Paris?"}],
    tools=tools
)
```

## LangChain

### Prompt Templates

```python
from langchain.prompts import PromptTemplate
from langchain.llms import OpenAI
from textprompts import load_prompt

# Load template
template_prompt = load_prompt("prompts/analysis_template.txt")

# Create LangChain prompt
prompt = PromptTemplate(
    template=str(template_prompt.body),
    input_variables=["document", "question", "context"]
)

# Use with chain
llm = OpenAI()
chain = prompt | llm

result = chain.invoke({
    "document": "Financial report content...",
    "question": "What are the key risks?",
    "context": "Q4 2024 analysis"
})
```

### Chat Templates

```python
from langchain.prompts import ChatPromptTemplate
from langchain.schema import HumanMessage, SystemMessage
from textprompts import load_prompt

# Load system and user prompts
system_prompt = load_prompt("prompts/chat_system.txt")
user_prompt = load_prompt("prompts/chat_user.txt")

# Create chat template
chat_prompt = ChatPromptTemplate.from_messages([
    SystemMessage(content=str(system_prompt.body)),
    HumanMessage(content=str(user_prompt.body))
])

# Format and use
messages = chat_prompt.format_messages(
    role="helpful assistant",
    user_query="Explain quantum computing",
    difficulty_level="beginner"
)
```

## Anthropic Claude

### Direct API Usage

```python
import anthropic
from textprompts import load_prompt

# Load prompts
system_prompt = load_prompt("prompts/claude_system.txt")
user_prompt = load_prompt("prompts/claude_user.txt")

client = anthropic.Anthropic()

response = client.messages.create(
    model="claude-3-sonnet-20240229",
    max_tokens=1000,
    system=system_prompt.body.format(
        expertise="software engineering",
        communication_style="technical but accessible"
    ),
    messages=[
        {
            "role": "user",
            "content": user_prompt.body.format(
                task="code review",
                code_snippet="...",
                focus_areas="performance, security, maintainability"
            )
        }
    ]
)
```

## Hugging Face Transformers

### Text Generation

```python
from transformers import pipeline
from textprompts import load_prompt

# Load prompt template
prompt_template = load_prompt("prompts/text_generation.txt")

# Create generator
generator = pipeline("text-generation", model="gpt2")

# Generate text
prompt = prompt_template.body.format(
    topic="artificial intelligence",
    style="informative",
    length="medium"
)

result = generator(prompt, max_length=200, num_return_sequences=1)
```

### Chat Templates

```python
from transformers import AutoTokenizer
from textprompts import load_prompt

# Load chat template
chat_template = load_prompt("prompts/chat_template.txt")

tokenizer = AutoTokenizer.from_pretrained("microsoft/DialoGPT-medium")

# Apply chat template
conversation = chat_template.body.format(
    user_message="Hello, how are you?",
    context="friendly conversation",
    personality="helpful and engaging"
)

# Tokenize and generate
inputs = tokenizer.encode(conversation, return_tensors="pt")
```

## Ollama

### Local Model Integration

```python
import ollama
from textprompts import load_prompt

# Load system prompt
system_prompt = load_prompt("prompts/ollama_system.txt")

# Create conversation
response = ollama.chat(
    model='llama2',
    messages=[
        {
            'role': 'system',
            'content': system_prompt.body.format(
                domain="creative writing",
                tone="imaginative and engaging"
            )
        },
        {
            'role': 'user',
            'content': 'Write a short story about a robot learning to paint'
        }
    ]
)
```

## LlamaIndex

### Query Engine

```python
from llama_index import VectorStoreIndex, SimpleDirectoryReader
from textprompts import load_prompt

# Load query template
query_template = load_prompt("prompts/query_template.txt")

# Create index
documents = SimpleDirectoryReader("data").load_data()
index = VectorStoreIndex.from_documents(documents)

# Create query engine with custom prompt
query_engine = index.as_query_engine(
    text_qa_template=query_template.body.format(
        instruction="Answer based on the context provided",
        format="bullet points",
        tone="concise and informative"
    )
)

# Query
response = query_engine.query("What are the main benefits?")
```

## Streamlit

### Interactive Prompt Builder

```python
import streamlit as st
from textprompts import load_prompts, SafeString

# Load available prompts
prompts = load_prompts("prompts/", recursive=True)
prompt_dict = {p.meta.title: p for p in prompts if p.meta}

# UI
st.title("Prompt Builder")

# Select prompt
selected_prompt = st.selectbox(
    "Choose a prompt:",
    options=list(prompt_dict.keys())
)

if selected_prompt:
    prompt = prompt_dict[selected_prompt]
    
    # Show metadata
    st.subheader("Prompt Info")
    st.write(f"**Title:** {prompt.meta.title}")
    st.write(f"**Version:** {prompt.meta.version}")
    st.write(f"**Description:** {prompt.meta.description}")
    
    # Extract variables
    import re
    variables = re.findall(r'\{([^}]+)\}', prompt.body)
    
    # Input fields for variables
    st.subheader("Variables")
    values = {}
    for var in variables:
        values[var] = st.text_input(f"{var}:", key=var)
    
    # Generate output
    if st.button("Generate"):
        try:
            result = prompt.body.format(**values)
            st.subheader("Result")
            st.text_area("Generated prompt:", result, height=200)
        except ValueError as e:
            st.error(f"Error: {e}")
```

## FastAPI

### Prompt Management API

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from textprompts import load_prompts, TextPromptsError
from typing import Dict, Optional

app = FastAPI()

# Load prompts on startup
prompts = {}

@app.on_event("startup")
async def load_all_prompts():
    global prompts
    try:
        prompt_list = load_prompts("prompts/", recursive=True)
        prompts = {p.meta.title: p for p in prompt_list if p.meta}
    except TextPromptsError as e:
        print(f"Failed to load prompts: {e}")

class FormatRequest(BaseModel):
    prompt_name: str
    variables: Dict[str, str]

@app.post("/format")
async def format_prompt(request: FormatRequest):
    if request.prompt_name not in prompts:
        raise HTTPException(status_code=404, detail="Prompt not found")
    
    prompt = prompts[request.prompt_name]
    try:
        result = prompt.body.format(**request.variables)
        return {"result": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/prompts")
async def list_prompts():
    return {
        name: {
            "title": prompt.meta.title,
            "version": prompt.meta.version,
            "description": prompt.meta.description
        }
        for name, prompt in prompts.items()
    }
```

## Best Practices

### 1. Prompt Versioning
```python
from textprompts import load_prompts
from packaging import version

def get_prompt_version(name: str, version_req: str = "latest"):
    """Get specific version of a prompt."""
    prompts = load_prompts("prompts/", recursive=True)
    matching = [p for p in prompts if p.meta and p.meta.title == name]
    
    if version_req == "latest":
        return max(matching, key=lambda p: version.parse(p.meta.version or "0.0.0"))
    else:
        return next(p for p in matching if p.meta.version == version_req)
```

### 2. Environment Configuration
```python
import os
from textprompts import load_prompt

def load_environment_prompt(name: str):
    """Load prompt based on environment."""
    env = os.getenv("ENVIRONMENT", "development")
    try:
        # Try environment-specific prompt first
        return load_prompt(f"prompts/{env}/{name}.txt")
    except:
        # Fall back to default
        return load_prompt(f"prompts/default/{name}.txt")
```

### 3. Caching for Performance
```python
from functools import lru_cache
from textprompts import load_prompt

@lru_cache(maxsize=128)
def cached_prompt(path: str):
    """Cache frequently used prompts."""
    return load_prompt(path)
```

### 4. Validation Pipeline
```python
from textprompts import load_prompts
import re

def validate_prompt_collection(directory: str):
    """Validate all prompts in a directory."""
    prompts = load_prompts(directory, recursive=True)
    
    for prompt in prompts:
        # Check metadata
        if not prompt.meta or not prompt.meta.title:
            print(f"WARNING: {prompt.path} missing title")
        
        # Check for common issues
        if "{" in prompt.body and "}" in prompt.body:
            variables = re.findall(r'\{([^}]+)\}', prompt.body)
            print(f"INFO: {prompt.path} uses variables: {variables}")
```