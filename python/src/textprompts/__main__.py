"""Command-line entry point for ``python -m textprompts``."""  # pragma: no cover

from textprompts.cli import main  # pragma: no cover

__all__ = ["main"]  # pragma: no cover

if __name__ == "__main__":  # pragma: no cover - small entrypoint wrapper
    main()  # pragma: no cover
