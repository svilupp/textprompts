import argparse
import json
import sys
from pathlib import Path

from .errors import TextPromptsError
from .loaders import load_prompt


def _make_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Show prompt metadata/body")
    p.add_argument("file", type=Path)
    p.add_argument("--json", action="store_true", help="Print metadata as JSON")
    p.add_argument(
        "--metadata",
        choices=["strict", "allow", "ignore"],
        default=None,
        help="Metadata handling mode (default: global config)",
    )
    p.add_argument(
        "--frontmatter-format",
        choices=["toml", "yaml", "auto"],
        default="auto",
        help="Frontmatter format (default: auto)",
    )
    return p


def main() -> None:
    args = _make_parser().parse_args()
    try:
        # If --metadata not given, default to "ignore" to match v1 CLI behavior
        # (the CLI dumps body without requiring valid metadata).
        metadata = args.metadata if args.metadata is not None else "ignore"
        prompt = load_prompt(
            args.file,
            metadata=metadata,
            frontmatter_format=args.frontmatter_format,
        )
        if args.json:
            print(
                json.dumps(
                    prompt.meta.model_dump() if prompt.meta else {},
                    indent=2,
                    default=str,
                )
            )
        else:
            print(prompt.prompt)
    except TextPromptsError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()  # pragma: no cover - simple CLI entry point
