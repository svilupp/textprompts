from pathlib import Path
from typing import Literal, Union

from .models import Prompt, PromptMeta


def _escape_toml(value: str) -> str:
    """Escape a string for TOML output (for use inside double quotes)."""
    if not value:
        return ""
    # TOML escape sequences: backslash, quotes, and control characters
    return (
        value.replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("\n", "\\n")
        .replace("\r", "\\r")
        .replace("\t", "\\t")
    )


def _quote_yaml(value: str) -> str:
    """Quote a string for YAML output if it contains special characters."""
    if not value:
        return '""'
    # Quote if contains characters that could be misinterpreted
    needs_quoting = any(
        c in value
        for c in (
            ":",
            "#",
            "{",
            "}",
            "[",
            "]",
            ",",
            "&",
            "*",
            "?",
            "|",
            "-",
            "<",
            ">",
            "=",
            "!",
            "%",
            "@",
            "\\",
            "\n",
            "\r",
            '"',
        )
    )
    if (
        needs_quoting
        or value != value.strip()
        or value.lower()
        in (
            "true",
            "false",
            "yes",
            "no",
            "null",
            "on",
            "off",
        )
    ):
        escaped = (
            value.replace("\\", "\\\\")
            .replace('"', '\\"')
            .replace("\n", "\\n")
            .replace("\r", "\\r")
        )
        return f'"{escaped}"'
    return value


def save_prompt(
    path: Union[str, Path],
    content: Union[str, Prompt],
    *,
    format: Literal["toml", "yaml"] = "toml",
) -> None:
    """
    Save a prompt to a file.

    Parameters
    ----------
    path : str | Path
        File path to save the prompt to.
    content : str | Prompt
        Either a string (prompt text only) or a Prompt object with metadata.
        If a string is provided, a template with required metadata fields will be created.
    format : "toml" | "yaml", default "toml"
        The front matter format to use. Defaults to "toml" for backward compatibility.

    Examples
    --------
    >>> # Save with TOML front matter (default)
    >>> save_prompt("my_prompt.txt", "You are a helpful assistant.")

    >>> # Save with YAML front matter
    >>> save_prompt("my_prompt.txt", "You are a helpful assistant.", format="yaml")

    >>> # Save a Prompt object with full metadata
    >>> prompt = Prompt(
    ...     path=Path("my_prompt.txt"),
    ...     meta=PromptMeta(title="Assistant", version="1.0.0", description="A helpful AI"),
    ...     prompt="You are a helpful assistant."
    ... )
    >>> save_prompt("my_prompt.txt", prompt, format="yaml")
    """
    path = Path(path)

    if isinstance(content, str):
        if format == "yaml":
            template = f'---\ntitle: ""\ndescription: ""\nversion: ""\n---\n\n{content}'
        else:
            template = (
                f'---\ntitle = ""\ndescription = ""\nversion = ""\n---\n\n{content}'
            )
        path.write_text(template, encoding="utf-8")
    elif isinstance(content, Prompt):
        # Build the front matter
        meta = content.meta or PromptMeta()

        if format == "yaml":
            lines = ["---"]
            lines.append(f"title: {_quote_yaml(meta.title or '')}")
            lines.append(f"description: {_quote_yaml(meta.description or '')}")
            lines.append(f"version: {_quote_yaml(meta.version or '')}")
            if meta.author:
                lines.append(f"author: {_quote_yaml(meta.author)}")
            if meta.created:
                lines.append(f"created: {_quote_yaml(meta.created.isoformat())}")
            lines.append("---")
            lines.append("")
            lines.append(str(content.prompt))
        else:
            lines = ["---"]
            lines.append(f'title = "{_escape_toml(meta.title or "")}"')
            lines.append(f'description = "{_escape_toml(meta.description or "")}"')
            lines.append(f'version = "{_escape_toml(meta.version or "")}"')
            if meta.author:
                lines.append(f'author = "{_escape_toml(meta.author)}"')
            if meta.created:
                lines.append(f'created = "{_escape_toml(meta.created.isoformat())}"')
            lines.append("---")
            lines.append("")
            lines.append(str(content.prompt))

        path.write_text("\n".join(lines), encoding="utf-8")
    else:
        raise TypeError(f"content must be str or Prompt, not {type(content).__name__}")
