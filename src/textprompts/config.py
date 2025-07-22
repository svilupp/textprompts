"""
Global configuration for textprompts metadata handling.
"""

import os
from enum import Enum
from typing import Union


class MetadataMode(Enum):
    """
    Metadata handling modes for prompt loading.

    Attributes
    ----------
    STRICT : MetadataMode
        Requires metadata with title, description, version fields that are not empty.
        Throws error if metadata is missing or any required field is empty.
    ALLOW : MetadataMode
        Loads any metadata that exists, fields can be empty or None.
        Only throws error if TOML syntax is invalid.
    IGNORE : MetadataMode
        Doesn't parse metadata at all, treats entire file as prompt body.
        Uses filename (without extension) as title.
    """

    STRICT = "strict"
    ALLOW = "allow"
    IGNORE = "ignore"


# Global configuration variable
_env_mode = os.getenv("TEXTPROMPTS_METADATA_MODE")
try:
    _METADATA_MODE: MetadataMode = (
        MetadataMode(_env_mode.lower()) if _env_mode else MetadataMode.IGNORE
    )
except ValueError:
    _METADATA_MODE = MetadataMode.IGNORE
_WARN_ON_IGNORED_META: bool = True


def set_metadata(mode: Union[MetadataMode, str]) -> None:
    """
    Set the global metadata handling mode.

    Parameters
    ----------
    mode : MetadataMode or str
        The metadata handling mode to use globally.
        Can be MetadataMode enum or string: "strict", "allow", or "ignore".

    Examples
    --------
    >>> import textprompts
    >>> textprompts.set_metadata(textprompts.MetadataMode.STRICT)
    >>> textprompts.set_metadata("allow")  # Also works with strings

    Raises
    ------
    ValueError
        If mode is not a valid MetadataMode or string.
    """
    global _METADATA_MODE

    if isinstance(mode, str):
        try:
            mode = MetadataMode(mode.lower())
        except ValueError:
            valid_modes = [m.value for m in MetadataMode]
            raise ValueError(
                f"Invalid metadata mode: {mode}. Valid modes: {valid_modes}"
            )

    if not isinstance(mode, MetadataMode):
        raise ValueError(f"Mode must be MetadataMode enum or string, got {type(mode)}")

    _METADATA_MODE = mode


def get_metadata() -> MetadataMode:
    """
    Get the current global metadata handling mode.

    Returns
    -------
    MetadataMode
        The current global metadata handling mode.
    """
    return _METADATA_MODE


def skip_metadata(*, skip_warning: bool = False) -> None:
    """Convenience setter for ignoring metadata with optional warnings."""

    global _WARN_ON_IGNORED_META
    _WARN_ON_IGNORED_META = not skip_warning  # pragma: no cover
    set_metadata(MetadataMode.IGNORE)  # pragma: no cover - simple wrapper


def warn_on_ignored_metadata() -> bool:
    """Return whether warnings for ignored metadata are enabled."""

    return _WARN_ON_IGNORED_META


def _resolve_metadata_mode(meta: Union[MetadataMode, str, None]) -> MetadataMode:
    """
    Resolve the metadata mode from parameters and global config.

    Priority order:
    1. meta parameter (if provided)
    2. global configuration

    Parameters
    ----------
    meta : MetadataMode, str, or None
        Explicit metadata mode override.

    Returns
    -------
    MetadataMode
        The resolved metadata mode to use.
    """
    # Priority 1: explicit meta parameter
    if meta is not None:
        if isinstance(meta, str):
            return MetadataMode(meta.lower())
        return meta

    # Priority 2: global configuration
    return _METADATA_MODE
