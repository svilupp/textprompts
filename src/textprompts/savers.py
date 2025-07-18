from pathlib import Path
from typing import Union

from .models import Prompt, PromptMeta


def save_prompt(path: Union[str, Path], content: Union[str, Prompt]) -> None:
    """
    Save a prompt to a file.

    Parameters
    ----------
    path : str | Path
        File path to save the prompt to.
    content : str | Prompt
        Either a string (prompt text only) or a Prompt object with metadata.
        If a string is provided, a template with required metadata fields will be created.

    Examples
    --------
    >>> # Save a simple prompt with metadata template
    >>> save_prompt("my_prompt.txt", "You are a helpful assistant.")

    >>> # Save a Prompt object with full metadata
    >>> prompt = Prompt(
    ...     path=Path("my_prompt.txt"),
    ...     meta=PromptMeta(title="Assistant", version="1.0.0", description="A helpful AI"),
    ...     prompt="You are a helpful assistant."
    ... )
    >>> save_prompt("my_prompt.txt", prompt)
    """
    path = Path(path)

    if isinstance(content, str):
        # Create template with required fields
        template = f"""---
title = ""
description = ""
version = ""
---

{content}"""
        path.write_text(template, encoding="utf-8")
    elif isinstance(content, Prompt):
        # Build the front matter
        lines = ["---"]

        # Always include required fields
        meta = content.meta or PromptMeta()
        lines.append(f'title = "{meta.title or ""}"')
        lines.append(f'description = "{meta.description or ""}"')
        lines.append(f'version = "{meta.version or ""}"')

        # Include optional fields if present
        if meta.author:
            lines.append(f'author = "{meta.author}"')
        if meta.created:
            lines.append(f'created = "{meta.created.isoformat()}"')

        lines.append("---")
        lines.append("")
        lines.append(str(content.prompt))

        path.write_text("\n".join(lines), encoding="utf-8")
    else:
        raise TypeError(f"content must be str or Prompt, not {type(content).__name__}")
