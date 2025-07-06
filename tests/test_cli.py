import json
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from textprompts.cli import _make_parser, main
from textprompts.errors import TextPromptsError


class TestCLIParser:
    def test_parser_creation(self) -> None:
        """Test that argument parser is created correctly."""
        parser = _make_parser()
        assert (
            parser.description is not None
            and "Show prompt metadata/body" in parser.description
        )

    def test_parser_file_argument(self) -> None:
        """Test that file argument is parsed correctly."""
        parser = _make_parser()
        args = parser.parse_args(["test.txt"])
        assert args.file == Path("test.txt")
        assert args.json is False

    def test_parser_json_flag(self) -> None:
        """Test that --json flag is parsed correctly."""
        parser = _make_parser()
        args = parser.parse_args(["test.txt", "--json"])
        assert args.file == Path("test.txt")
        assert args.json is True


class TestCLIMain:
    def test_main_displays_body_by_default(self, tmp_path: Path, capsys: Any) -> None:
        """Test that main() displays prompt body by default."""
        test_file = tmp_path / "test.txt"
        test_file.write_text("Test content")

        with patch("sys.argv", ["textprompts", str(test_file)]):
            main()

        captured = capsys.readouterr()
        assert "Test content" in captured.out

    def test_main_displays_json_with_flag(self, tmp_path: Path, capsys: Any) -> None:
        """Test that main() displays JSON metadata with --json flag."""
        test_file = tmp_path / "test.txt"
        test_file.write_text("""---
title = "Test Title"
description = "Test Description"
---
Test content""")

        with patch("sys.argv", ["textprompts", str(test_file), "--json"]):
            main()

        captured = capsys.readouterr()
        output = json.loads(captured.out)
        assert output["title"] == "test"  # Uses filename since meta="ignore"

    def test_main_handles_missing_file(self, capsys: Any) -> None:
        """Test that main() handles missing file gracefully."""
        with patch("sys.argv", ["textprompts", "nonexistent.txt"]):
            with pytest.raises(SystemExit) as exc_info:
                main()
            assert exc_info.value.code == 1

        captured = capsys.readouterr()
        assert "Error:" in captured.err
        assert "nonexistent.txt" in captured.err

    def test_main_handles_textprompts_errors(self, tmp_path: Path, capsys: Any) -> None:
        """Test that main() handles TextPromptsError gracefully."""
        test_file = tmp_path / "test.txt"
        test_file.write_text("Test content")

        with patch("textprompts.cli.load_prompt") as mock_load:
            mock_load.side_effect = TextPromptsError("Test error message")

            with patch("sys.argv", ["textprompts", str(test_file)]):
                with pytest.raises(SystemExit) as exc_info:
                    main()
                assert exc_info.value.code == 1

        captured = capsys.readouterr()
        assert "Error: Test error message" in captured.err

    def test_main_uses_ignore_metadata_mode(self, tmp_path: Path) -> None:
        """Test that main() uses ignore metadata mode."""
        test_file = tmp_path / "test.txt"
        test_file.write_text("Test content")

        with patch("textprompts.cli.load_prompt") as mock_load:
            mock_load.return_value = MagicMock()

            with patch("sys.argv", ["textprompts", str(test_file)]):
                main()

            mock_load.assert_called_once_with(test_file, meta="ignore")

    def test_main_with_empty_metadata(self, tmp_path: Path, capsys: Any) -> None:
        """Test that main() handles empty metadata correctly for JSON output."""
        test_file = tmp_path / "test.txt"
        test_file.write_text("Test content")

        with patch("sys.argv", ["textprompts", str(test_file), "--json"]):
            main()

        captured = capsys.readouterr()
        output = json.loads(captured.out)
        assert isinstance(output, dict)
        assert output["title"] == "test"  # Should have filename as title
