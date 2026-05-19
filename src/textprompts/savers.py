"""Prompt file serializer (SPEC §6, save side).

Emits a Prompt's metadata and body back to disk. Both TOML and YAML output
paths round-trip the full v2 schema: standard fields, top-level extras,
``[flags.*]`` declarations, ``[variables.*]`` declarations, and per-decl
extras. ``meta.extras`` MUST NOT contain raw ``flags``/``variables`` keys —
the loader routes those to ``meta.flags`` / ``meta.variables`` already.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Literal, Union

import yaml as yaml_lib  # type: ignore[import-untyped]

from .errors import TextPromptsError
from .models import FlagDecl, Prompt, PromptMeta, VariableDecl

# ---------------------------------------------------------------------------
# TOML primitives.
# ---------------------------------------------------------------------------


def _escape_toml(value: str) -> str:
    """Escape a string for TOML output (for use inside double quotes)."""
    if not value:
        return ""
    return (
        value.replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("\n", "\\n")
        .replace("\r", "\\r")
        .replace("\t", "\\t")
    )


def _toml_string(value: Union[str, None]) -> str:
    return f'"{_escape_toml(value or "")}"'


def _toml_value(value: Any) -> Union[str, None]:
    """Serialize a primitive TOML value, or return None if unsupported."""
    if value is None:
        return None  # TOML has no null
    if isinstance(value, bool):  # bool must come before int check
        return str(value).lower()
    if isinstance(value, str):
        return _toml_string(value)
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, (list, tuple)):
        items: list[str] = []
        for v in value:
            s = _toml_value(v)
            if s is None:
                return None
            items.append(s)
        return f"[{', '.join(items)}]"
    return None  # nested objects, dates, etc.


def _toml_extra_line(key: str, value: Any) -> Union[str, None]:
    """Serialize a single extras key/value as a top-level TOML line."""
    serialized = _toml_value(value)
    if serialized is None:
        # Fallback: try inline table for plain dicts.
        if isinstance(value, dict):
            parts: list[str] = []
            for k, v in value.items():
                s = _toml_value(v)
                if s is None:
                    return None
                parts.append(f"{k} = {s}")
            return f"{key} = {{ {', '.join(parts)} }}"
        return None
    return f"{key} = {serialized}"


def _toml_flag_lines(name: str, decl: FlagDecl) -> list[str]:
    lines: list[str] = [f"[flags.{name}]"]
    if decl.kind == "enum":
        lines.append('type = "enum"')
        values_serialized = _toml_value(list(decl.values or ()))
        lines.append(f"values = {values_serialized}")
    else:
        lines.append('type = "boolean"')
    if decl.description is not None:
        lines.append(f"description = {_toml_string(decl.description)}")
    for k, v in decl.extras.items():
        line = _toml_extra_line(k, v)
        if line is None:
            raise TextPromptsError(
                f"Cannot serialize extras key '{k}' of flag '{name}' to TOML: "
                f"unsupported value type {type(v).__name__}"
            )
        lines.append(line)
    return lines


def _toml_variable_lines(name: str, decl: VariableDecl) -> list[str]:
    lines: list[str] = [f"[variables.{name}]"]
    if decl.description is not None:
        lines.append(f"description = {_toml_string(decl.description)}")
    for k, v in decl.extras.items():
        line = _toml_extra_line(k, v)
        if line is None:
            raise TextPromptsError(
                f"Cannot serialize extras key '{k}' of variable '{name}' to TOML: "
                f"unsupported value type {type(v).__name__}"
            )
        lines.append(line)
    return lines


def _serialize_toml_meta(meta: PromptMeta) -> str:
    lines: list[str] = ["---"]
    lines.append(f"title = {_toml_string(meta.title)}")
    lines.append(f"description = {_toml_string(meta.description)}")
    lines.append(f"version = {_toml_string(meta.version)}")
    if meta.author:
        lines.append(f"author = {_toml_string(meta.author)}")
    if meta.created:
        lines.append(f"created = {_toml_string(meta.created.isoformat())}")
    for key, value in meta.extras.items():
        if key in {"flags", "variables"}:
            # Should never happen: loader routes these to typed fields.
            continue
        line = _toml_extra_line(key, value)
        if line is None:
            raise TextPromptsError(
                f"Cannot serialize top-level extras key '{key}' to TOML: "
                f"unsupported value type {type(value).__name__}"
            )
        lines.append(line)

    for flag_name, flag_decl in meta.flags.items():
        lines.append("")
        lines.extend(_toml_flag_lines(flag_name, flag_decl))

    for var_name, var_decl in meta.variables.items():
        lines.append("")
        lines.extend(_toml_variable_lines(var_name, var_decl))

    lines.append("---")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# YAML.
# ---------------------------------------------------------------------------


def _serialize_yaml_meta(meta: PromptMeta) -> str:
    root: dict[str, Any] = {}
    # Always emit title/description/version (even when empty) to preserve v1
    # round-trip behavior.
    root["title"] = meta.title or ""
    root["description"] = meta.description or ""
    root["version"] = meta.version or ""
    if meta.author is not None:
        root["author"] = meta.author
    if meta.created is not None:
        root["created"] = meta.created.isoformat()
    for k, v in meta.extras.items():
        if k in {"flags", "variables"}:
            continue
        root[k] = v

    if meta.flags:
        flags_obj: dict[str, Any] = {}
        for flag_name, flag_decl in meta.flags.items():
            entry: dict[str, Any] = {"type": flag_decl.kind}
            if flag_decl.kind == "enum":
                entry["values"] = list(flag_decl.values or ())
            if flag_decl.description is not None:
                entry["description"] = flag_decl.description
            for k, v in flag_decl.extras.items():
                entry[k] = v
            flags_obj[flag_name] = entry
        root["flags"] = flags_obj

    if meta.variables:
        vars_obj: dict[str, Any] = {}
        for var_name, var_decl in meta.variables.items():
            var_entry: dict[str, Any] = {}
            if var_decl.description is not None:
                var_entry["description"] = var_decl.description
            for k, v in var_decl.extras.items():
                var_entry[k] = v
            vars_obj[var_name] = var_entry
        root["variables"] = vars_obj

    body = yaml_lib.dump(root, default_flow_style=False, sort_keys=False).rstrip("\n")
    return f"---\n{body}\n---"


# ---------------------------------------------------------------------------
# Public API.
# ---------------------------------------------------------------------------


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
        Either a raw string body or a Prompt with full v2 metadata.
    format : "toml" | "yaml", default "toml"
        Frontmatter format.

    Examples
    --------
    >>> save_prompt("my_prompt.txt", "You are a helpful assistant.")
    >>> save_prompt("my_prompt.txt", "You are a helpful assistant.", format="yaml")
    >>> save_prompt("my_prompt.txt", prompt_obj, format="yaml")
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
        return

    if not isinstance(content, Prompt):
        raise TypeError(f"content must be str or Prompt, not {type(content).__name__}")

    meta = content.meta or PromptMeta()
    if format == "yaml":
        serialized = _serialize_yaml_meta(meta)
    else:
        serialized = _serialize_toml_meta(meta)

    body = str(content.prompt)
    path.write_text(f"{serialized}\n\n{body}", encoding="utf-8")
