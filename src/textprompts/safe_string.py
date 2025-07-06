from typing import Any, Set

from pydantic import GetCoreSchemaHandler
from pydantic_core import core_schema

from .placeholder_utils import extract_placeholders, validate_format_args


class SafeString(str):
    """
    A string subclass that validates format() calls to ensure all placeholders are provided.

    This prevents common errors where format variables are missing, making prompt templates
    more reliable and easier to debug.

    Attributes:
        placeholders: Set of placeholder names found in the string
    """

    placeholders: Set[str]

    def __new__(cls, value: str) -> "SafeString":
        """Create a new SafeString instance with extracted placeholders."""
        instance = str.__new__(cls, value)
        instance.placeholders = extract_placeholders(value)
        return instance

    def format(self, *args: Any, **kwargs: Any) -> str:
        """
        Format the string with configurable validation behavior.

        By default (skip_validation=False), this method validates that all placeholders
        have corresponding values and raises ValueError if any are missing.

        When skip_validation=True, it performs partial formatting, replacing only
        the placeholders for which values are provided.

        Args:
            *args: Positional arguments for formatting
            skip_validation: If True, perform partial formatting without validation
            **kwargs: Keyword arguments for formatting

        Returns:
            The formatted string

        Raises:
            ValueError: If skip_validation=False and any placeholder is missing
        """
        skip_validation = kwargs.pop("skip_validation", False)
        if skip_validation:
            # Partial formatting - replace only available placeholders
            return self._partial_format(*args, **kwargs)
        else:
            # Strict formatting - validate all placeholders are provided
            validate_format_args(self.placeholders, args, kwargs, skip_validation=False)
            return str.format(self, *args, **kwargs)

    def _partial_format(self, *args: Any, **kwargs: Any) -> str:
        """
        Perform partial formatting, replacing only the placeholders that have values.

        Args:
            *args: Positional arguments for formatting
            **kwargs: Keyword arguments for formatting

        Returns:
            The partially formatted string
        """
        # Convert positional args to keyword args
        all_kwargs = kwargs.copy()
        for i, arg in enumerate(args):
            all_kwargs[str(i)] = arg

        # Build a format string with only available placeholders
        result = str(self)

        # Replace placeholders one by one if they have values
        for placeholder in self.placeholders:
            if placeholder in all_kwargs:
                # Create a single-placeholder format string
                placeholder_pattern = f"{{{placeholder}}}"
                if placeholder_pattern in result:
                    try:
                        # Replace this specific placeholder
                        result = result.replace(
                            placeholder_pattern, str(all_kwargs[placeholder])
                        )
                    except (KeyError, ValueError):
                        # If replacement fails, leave the placeholder as is
                        pass

        return result

    def __str__(self) -> str:
        """Return the string representation."""
        return str.__str__(self)

    def __repr__(self) -> str:
        """Return the string representation for debugging."""
        return f"SafeString({str.__repr__(self)}, placeholders={self.placeholders})"

    @classmethod
    def __get_pydantic_core_schema__(
        cls, source_type: Any, handler: GetCoreSchemaHandler
    ) -> core_schema.CoreSchema:
        """Support for Pydantic v2 schema generation."""
        return core_schema.no_info_after_validator_function(
            cls,
            core_schema.str_schema(),
        )
