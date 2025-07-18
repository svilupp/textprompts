from typing import Any, Set

from pydantic import GetCoreSchemaHandler
from pydantic_core import core_schema

from .placeholder_utils import extract_placeholders, validate_format_args


class PromptString(str):
    """String subclass that validates ``format()`` calls."""

    placeholders: Set[str]

    def __new__(cls, value: str) -> "PromptString":
        instance = str.__new__(cls, value)
        instance.placeholders = extract_placeholders(value)
        return instance

    def format(self, *args: Any, **kwargs: Any) -> str:
        """Format with validation and optional partial formatting."""
        skip_validation = kwargs.pop("skip_validation", False)
        source = str(self).strip()
        if skip_validation:
            return self._partial_format(*args, source=source, **kwargs)
        validate_format_args(self.placeholders, args, kwargs, skip_validation=False)
        return str.format(source, *args, **kwargs)

    def _partial_format(
        self, *args: Any, source: str | None = None, **kwargs: Any
    ) -> str:
        """Partial formatting - replace placeholders that have values."""
        all_kwargs = kwargs.copy()
        for i, arg in enumerate(args):
            all_kwargs[str(i)] = arg

        result = source if source is not None else str(self)
        for placeholder in self.placeholders:
            if placeholder in all_kwargs:
                pattern = f"{{{placeholder}}}"
                if pattern in result:
                    try:
                        result = result.replace(pattern, str(all_kwargs[placeholder]))
                    except (KeyError, ValueError):  # pragma: no cover - defensive
                        pass
        return result

    def __repr__(self) -> str:
        return f"PromptString({str.__repr__(self)}, placeholders={self.placeholders})"

    @classmethod
    def __get_pydantic_core_schema__(
        cls, source_type: Any, handler: GetCoreSchemaHandler
    ) -> core_schema.CoreSchema:
        return core_schema.no_info_after_validator_function(
            cls, core_schema.str_schema()
        )


# Backwards compatibility alias
SafeString = PromptString
