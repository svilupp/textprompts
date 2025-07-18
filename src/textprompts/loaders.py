from pathlib import Path
from typing import Iterable, Union

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


def load_prompts(
    *paths: Union[str, Path],
    recursive: bool = False,
    glob: str = "*.txt",
    meta: Union[MetadataMode, str, None] = None,
    max_files: Union[int, None] = 1000,
) -> list[Prompt]:
    """
    Convenience loader for many files / directories.

    Parameters
    ----------
    *paths : str | Path
        Files and directories to load.
    recursive : bool, default False
        If True, search directories recursively.
    glob : str, default "*.txt"
        Glob pattern for finding files in directories.
    meta : MetadataMode, str, or None, default None
        Metadata handling mode. Can be:
        - MetadataMode.STRICT: Requires metadata with title, description, version (not empty)
        - MetadataMode.ALLOW: Loads any metadata, can be empty, only errors on TOML parse failure
        - MetadataMode.IGNORE: No metadata parsing, uses filename as title
        - String: "strict", "allow", or "ignore"
        - None: Use global configuration
    max_files : int | None, default 1000
        Maximum number of files to process. None for no limit.

    Examples
    --------
    >>> # Using global configuration
    >>> import textprompts
    >>> textprompts.set_metadata(textprompts.MetadataMode.ALLOW)
    >>> prompts = textprompts.load_prompts("prompts/", recursive=True)

    >>> # Override with parameter
    >>> prompts = textprompts.load_prompts("prompts/", meta="strict")
    """
    collected: list[Prompt] = []
    file_count = 0

    for p in paths:
        pth = Path(p)
        if pth.is_dir():
            itr: Iterable[Path] = pth.rglob(glob) if recursive else pth.glob(glob)
            for f in itr:
                if (
                    max_files and file_count >= max_files
                ):  # pragma: no cover - boundary check
                    from .errors import TextPromptsError

                    raise TextPromptsError(
                        f"Exceeded max_files limit of {max_files}"
                    )  # pragma: no cover - boundary check
                collected.append(load_prompt(f, meta=meta))
                file_count += 1
        else:
            if (
                max_files and file_count >= max_files
            ):  # pragma: no cover - boundary check
                from .errors import TextPromptsError

                raise TextPromptsError(
                    f"Exceeded max_files limit of {max_files}"
                )  # pragma: no cover - boundary check
            collected.append(load_prompt(pth, meta=meta))
            file_count += 1

    return collected
