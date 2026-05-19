"""Public prompt loader entry points (SPEC §6.2).

``load_prompt`` accepts the canonical v2 option shape: ``metadata=`` for the
metadata mode and ``frontmatter_format=`` for the parser selection. ``meta=``
is accepted as a deprecated alias for the previous major release.
"""

from __future__ import annotations

import warnings
from pathlib import Path
from typing import Any, Literal, Union

from ._parser import parse_file
from .config import MetadataMode, _resolve_metadata_mode
from .errors import FileMissingError
from .models import Prompt

FrontmatterFormat = Literal["toml", "yaml", "auto"]


def _normalize_meta_kwargs(
    *,
    metadata: Union[MetadataMode, str, None],
    kwargs: dict[str, Any],
) -> MetadataMode:
    """Resolve the metadata mode from the canonical ``metadata`` kwarg and the
    deprecated ``meta=`` alias.

    Rules:
        - Passing both ``metadata=`` and ``meta=`` raises ``TypeError``.
        - ``meta=`` is accepted but emits a ``DeprecationWarning``.
        - Either argument may be ``None`` to fall back to the global config.
    """
    if "meta" in kwargs:
        meta_alias = kwargs.pop("meta")
        if metadata is not None:
            raise TypeError(
                "Cannot pass both 'metadata=' and 'meta=' — 'meta=' is the "
                "deprecated alias for 'metadata='. Use 'metadata=' only."
            )
        warnings.warn(
            "'meta=' is deprecated; use 'metadata=' instead.",
            DeprecationWarning,
            stacklevel=4,
        )
        if kwargs:
            raise TypeError(f"Unexpected keyword arguments: {sorted(kwargs.keys())}")
        return _resolve_metadata_mode(meta_alias)
    if kwargs:
        raise TypeError(f"Unexpected keyword arguments: {sorted(kwargs.keys())}")
    return _resolve_metadata_mode(metadata)


def load_prompt(
    path: Union[str, Path],
    *,
    metadata: Union[MetadataMode, str, None] = None,
    frontmatter_format: FrontmatterFormat = "auto",
    **kwargs: Any,
) -> Prompt:
    """
    Load a single prompt file.

    Parameters
    ----------
    path : str | Path
        File to load.
    metadata : MetadataMode, str, or None, default None
        Metadata handling mode (canonical v2 spelling). Can be:

        - ``MetadataMode.STRICT``: requires metadata with non-empty
          ``title``, ``description``, ``version`` fields.
        - ``MetadataMode.ALLOW``: loads any metadata that exists.
        - ``MetadataMode.IGNORE``: no metadata parsing.
        - String: ``"strict"``, ``"allow"``, or ``"ignore"``.
        - ``None``: use the global configuration.
    frontmatter_format : {"toml", "yaml", "auto"}, default "auto"
        Selects the frontmatter parser.
    meta : deprecated alias for ``metadata`` (accepted via kwargs only).

    Raises
    ------
    TextPromptsError subclasses on any failure.
    TypeError if both ``metadata`` and ``meta`` are passed.
    """
    fp = Path(path)
    if not fp.is_file():
        raise FileMissingError(fp)

    mode = _normalize_meta_kwargs(metadata=metadata, kwargs=kwargs)

    return parse_file(fp, metadata_mode=mode, frontmatter_format=frontmatter_format)
