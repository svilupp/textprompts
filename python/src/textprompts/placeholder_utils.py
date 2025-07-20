"""
Utility functions for extracting and validating placeholders in format strings.

This module provides robust placeholder extraction and validation for PromptString
formatting operations.
"""

import re
from typing import Any, Dict, Set, Tuple


def extract_placeholders(text: str) -> Set[str]:
    """
    Extract all placeholder names from a format string.

    Handles various placeholder formats including:
    - Named placeholders: {name}
    - Positional placeholders: {0}, {1}
    - Format specifiers: {value:02d}, {price:.2f}
    - Ignores escaped braces: {{literal}}

    Args:
        text: The format string to extract placeholders from

    Returns:
        Set of placeholder names found in the string

    Examples:
        >>> extract_placeholders("Hello {name}!")
        {'name'}
        >>> extract_placeholders("Item {0}: {name} costs ${price:.2f}")
        {'0', 'name', 'price'}
        >>> extract_placeholders("No placeholders here")
        set()
        >>> extract_placeholders("Escaped {{braces}} but {real} placeholder")
        {'real'}
    """
    # Replace escaped braces with temporary markers to avoid matching them
    temp_text = text.replace("{{", "\x00ESCAPED_OPEN\x00").replace(
        "}}", "\x00ESCAPED_CLOSE\x00"
    )

    # Find all placeholder patterns: {name}, {0}, {value:format}, {}
    # Pattern explanation:
    # \{           - literal opening brace
    # ([^}:]*)     - capture group 1: placeholder name (can be empty, stops at : or })
    # (?::[^}]*)?  - optional format specifier (non-capturing group)
    # \}           - literal closing brace
    pattern = r"\{([^}:]*)(?::[^}]*)?\}"

    matches = re.findall(pattern, temp_text)
    return set(matches)


def validate_format_args(
    placeholders: Set[str],
    args: Tuple[Any, ...],
    kwargs: Dict[str, Any],
    skip_validation: bool = False,
) -> None:
    """
    Validate that format arguments match the placeholders in the template.

    Args:
        placeholders: Set of placeholder names expected in the template
        args: Positional arguments passed to format()
        kwargs: Keyword arguments passed to format()
        skip_validation: If True, skip all validation checks

    Raises:
        ValueError: If there are missing placeholders or validation fails

    Examples:
        >>> validate_format_args({'name'}, (), {'name': 'Alice'})  # OK
        >>> validate_format_args({'name'}, (), {})  # Raises ValueError
        >>> validate_format_args({'name'}, (), {}, skip_validation=True)  # OK
    """
    if skip_validation:
        return

    # Convert positional args to keyword args using string indices
    all_kwargs = kwargs.copy()
    for i, arg in enumerate(args):
        all_kwargs[str(i)] = arg

    # Special handling for empty placeholders - they match positional args
    # If we have an empty placeholder and positional args, match them
    if "" in placeholders and args:
        all_kwargs[""] = args[0]

    # Check for missing placeholders
    provided_keys = set(str(k) for k in all_kwargs.keys())
    missing_keys = placeholders - provided_keys

    if missing_keys:
        raise ValueError(f"Missing format variables: {sorted(missing_keys)}")


def should_ignore_validation(ignore_flag: bool) -> bool:
    """
    Determine if placeholder validation should be ignored.

    This is a simple utility function that could be extended in the future
    to handle more complex validation logic or global settings.

    Args:
        ignore_flag: The _ignore_placeholders flag value

    Returns:
        True if validation should be bypassed, False otherwise
    """
    return ignore_flag


def get_placeholder_info(text: str) -> Dict[str, Any]:
    """
    Get detailed information about placeholders in a format string.

    Args:
        text: The format string to analyze

    Returns:
        Dictionary with placeholder analysis information

    Examples:
        >>> info = get_placeholder_info("Hello {name}, you have {count:d} items")
        >>> info['count']
        2
        >>> info['names']
        {'name', 'count'}
    """
    placeholders = extract_placeholders(text)

    return {
        "count": len(placeholders),
        "names": placeholders,
        "has_positional": any(p.isdigit() for p in placeholders),
        "has_named": any(not p.isdigit() for p in placeholders),
        "is_mixed": any(p.isdigit() for p in placeholders)
        and any(not p.isdigit() for p in placeholders),
    }
