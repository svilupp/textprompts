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
    return p


def main() -> None:
    args = _make_parser().parse_args()
    try:
        prompt = load_prompt(args.file, meta="ignore")
        if args.json:
            print(json.dumps(prompt.meta.model_dump() if prompt.meta else {}, indent=2))
        else:
            print(prompt.body)
    except TextPromptsError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()  # pragma: no cover - simple CLI entry point
