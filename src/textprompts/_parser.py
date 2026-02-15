import textwrap
from datetime import date
from pathlib import Path
from typing import Any, Optional

import yaml

try:
    import tomllib
except ImportError:  # pragma: no cover - Python <3.11 fallback
    import tomli as tomllib  # type: ignore[import-not-found, no-redef]

from .config import MetadataMode, warn_on_ignored_metadata
from .errors import InvalidMetadataError, MalformedHeaderError, MissingMetadataError
from .models import Prompt, PromptMeta
from .prompt_string import PromptString

DELIM = "---"


def _split_front_matter(text: str) -> tuple[Optional[str], str]:
    """
    Returns (header, body). Header may be None.

    Strict parsing: only considers "---" at the very beginning of the file
    (no leading whitespace) as valid front matter delimiter.
    """
    # Must start exactly with "---" (no leading whitespace)
    if not text.startswith(DELIM):
        return None, text

    # Find second delimiter after the first
    second_delim = text.find(DELIM, len(DELIM))
    if second_delim == -1:
        raise MalformedHeaderError("Missing closing delimiter '---' for front matter")

    # Extract header and body
    header = text[len(DELIM) : second_delim].strip()
    body = text[second_delim + len(DELIM) :].lstrip("\n")

    return header, body


def _normalize_yaml_values(data: dict[str, Any]) -> dict[str, Any]:
    """Normalize YAML-parsed values to match expected types.

    YAML auto-converts some values (e.g. dates become date objects,
    unquoted numbers become floats). This normalizes them to strings
    where the metadata model expects strings.
    """
    normalized = {}
    for key, value in data.items():
        if isinstance(value, date) and key in {"created"}:
            # Keep date objects for the 'created' field
            normalized[key] = value
        elif isinstance(value, (date, bool)):
            # Convert dates in non-date fields and booleans to strings
            normalized[key] = str(value)
        elif isinstance(value, (int, float)):
            # Convert numbers to strings (e.g. version: 1.0 -> "1.0")
            normalized[key] = str(value)
        elif isinstance(value, dict):
            # Reject nested objects
            raise InvalidMetadataError(
                f"Nested objects not supported in front matter metadata: "
                f"'{key}' contains a nested object. "
                f"Use flat key-value pairs only."
            )
        elif isinstance(value, list):
            # Allow lists as-is (pydantic will validate)
            normalized[key] = value
        else:
            normalized[key] = value
    return normalized


def _parse_header(header_txt: str) -> dict[str, Any]:
    """Parse front matter header as TOML or YAML (try TOML first for backward compat).

    Uses a parse-then-fallback strategy:
    1. Try TOML first (backward compatible)
    2. If TOML fails, try YAML
    3. If both fail, report both errors
    """
    # Try TOML first (backward compatibility)
    try:
        return dict(tomllib.loads(header_txt))
    except tomllib.TOMLDecodeError as toml_err:
        # Try YAML as fallback
        try:
            result = yaml.safe_load(header_txt)
            if result is None:
                return {}
            if not isinstance(result, dict):
                raise InvalidMetadataError(
                    f"Front matter must be a mapping, got {type(result).__name__}. "
                    f"Use meta=MetadataMode.IGNORE to skip metadata parsing."
                )
            return _normalize_yaml_values(result)
        except yaml.YAMLError:
            # Both failed - report TOML error (original format) for backward compat
            raise InvalidMetadataError(
                f"Invalid TOML in front matter: {toml_err}. "
                f"Use meta=MetadataMode.IGNORE to skip metadata parsing."
            ) from toml_err
        except InvalidMetadataError:
            raise


def parse_file(path: Path, *, metadata_mode: MetadataMode) -> Prompt:
    """
    Parse a file according to the specified metadata mode.

    Parameters
    ----------
    path : Path
        The file to parse.
    metadata_mode : MetadataMode
        The metadata handling mode.
    """

    try:
        raw = path.read_text(encoding="utf-8")
    except UnicodeDecodeError as e:
        from .errors import TextPromptsError

        raise TextPromptsError(f"Cannot decode {path} as UTF-8: {e}") from e

    # Handle IGNORE mode - treat entire file as body
    if metadata_mode.value == MetadataMode.IGNORE.value:
        if (
            warn_on_ignored_metadata()
            and raw.startswith(DELIM)
            and raw.find(DELIM, len(DELIM)) != -1
        ):
            import warnings

            warnings.warn(
                "Metadata detected but ignored; use set_metadata('allow') or skip_metadata(skip_warning=True) to silence",
                stacklevel=2,
            )
        ignore_meta = PromptMeta(title=path.stem)
        return Prompt.model_validate(
            {
                "path": path,
                "meta": ignore_meta,
                "prompt": PromptString(textwrap.dedent(raw)),
            }
        )

    # For STRICT and ALLOW modes, try to parse front matter
    try:
        header_txt, body = _split_front_matter(raw)
    except MalformedHeaderError as e:
        # If parsing fails and file starts with "---", suggest using IGNORE mode
        if raw.startswith(DELIM):
            raise InvalidMetadataError(
                f"{e}. If this file has no metadata and starts with '---', "
                f"use meta=MetadataMode.IGNORE to skip metadata parsing."
            ) from e
        raise  # pragma: no cover - reraised to preserve stack

    meta: Optional[PromptMeta] = None
    if header_txt is not None:
        # We have front matter - parse it (tries TOML first, then YAML)
        try:
            data = _parse_header(header_txt)

            if metadata_mode.value == MetadataMode.STRICT.value:
                # STRICT mode: require title, description, version fields and they must not be empty
                required_fields = {"title", "description", "version"}
                missing_fields = required_fields - set(data.keys())
                if missing_fields:
                    raise InvalidMetadataError(
                        f"Missing required metadata fields: {', '.join(sorted(missing_fields))}. "
                        f"STRICT mode requires 'title', 'description', and 'version' fields. "
                        f"Use meta=MetadataMode.ALLOW for less strict validation."
                    )

                # Check for empty required fields
                empty_fields = [
                    field
                    for field in required_fields
                    if not data.get(field) or str(data.get(field)).strip() == ""
                ]
                if empty_fields:
                    raise InvalidMetadataError(
                        f"Empty required metadata fields: {', '.join(sorted(empty_fields))}. "
                        f"STRICT mode requires non-empty 'title', 'description', and 'version' fields. "
                        f"Use meta=MetadataMode.ALLOW for less strict validation."
                    )

            # For both STRICT and ALLOW modes, validate the data structure
            meta = PromptMeta.model_validate(data)

        except InvalidMetadataError:
            raise
        except Exception as e:  # pragma: no cover - unlikely generic error
            raise InvalidMetadataError(f"Invalid metadata: {e}") from e

    else:
        # No front matter found
        if metadata_mode.value == MetadataMode.STRICT.value:
            raise MissingMetadataError(
                f"No metadata found in {path}. "
                f"STRICT mode requires metadata with title, description, and version fields. "
                f"Use meta=MetadataMode.ALLOW or meta=MetadataMode.IGNORE for less strict validation."
            )
        # ALLOW mode: create empty metadata
        meta = PromptMeta()

    # Always ensure we have metadata with a title
    if not meta:  # pragma: no cover - meta is never falsy but kept for safety
        meta = PromptMeta()

    # Use filename as title if not provided
    if meta.title is None:
        meta.title = path.stem

    return Prompt.model_validate(
        {
            "path": path,
            "meta": meta,
            "prompt": PromptString(textwrap.dedent(body)),
        }
    )
