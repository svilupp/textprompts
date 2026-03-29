from pathlib import Path
from typing import Union

from ._parser import parse_file
from .config import MetadataMode, _resolve_metadata_mode
from .errors import FileMissingError
from .models import Prompt


def load_prompt(
    path: Union[str, Path], *, meta: Union[MetadataMode, str, None] = None
) -> Prompt:
    """
    Load a single prompt file.

    Parameters
    ----------
    path : str | Path
        File to load.
    meta : MetadataMode, str, or None, default None
        Metadata handling mode. Can be:
        - MetadataMode.STRICT: Requires metadata with title, description, version (not empty)
        - MetadataMode.ALLOW: Loads any metadata, can be empty, only errors on TOML parse failure
        - MetadataMode.IGNORE: No metadata parsing, uses filename as title
        - String: "strict", "allow", or "ignore"
        - None: Use global configuration

    Raises
    ------
    TextPromptsError subclasses on any failure.

    Examples
    --------
    >>> # Using global configuration
    >>> import textprompts
    >>> textprompts.set_metadata(textprompts.MetadataMode.STRICT)
    >>> prompt = textprompts.load_prompt("example.txt")

    >>> # Override with parameter
    >>> prompt = textprompts.load_prompt("example.txt", meta=textprompts.MetadataMode.ALLOW)
    >>> prompt = textprompts.load_prompt("example.txt", meta="ignore")  # String also works
    """
    fp = Path(path)
    if not fp.is_file():
        raise FileMissingError(fp)

    # Resolve metadata mode from parameters and global config
    mode = _resolve_metadata_mode(meta)

    return parse_file(fp, metadata_mode=mode)
