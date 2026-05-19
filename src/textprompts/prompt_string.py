"""String-compatible prompt body wrapper (v2).

``PromptString`` is a :class:`str` subclass that delegates ``format()`` to the
v2 syntax engine: lex -> parse -> validate -> render. There is no second
placeholder grammar; ``{var}`` is the canonical syntax and legacy patterns
(``{0}``, ``{}``, ``{{...}}`` escape) raise :class:`ParseError`.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Union

from pydantic import GetCoreSchemaHandler
from pydantic_core import core_schema

if TYPE_CHECKING:  # pragma: no cover
    from .syntax.ast import Node


class PromptString(str):
    """String subclass that routes ``format()`` through the v2 engine."""

    _ast_cache: Union[tuple["Node", ...], None]

    def __new__(cls, value: str) -> "PromptString":
        instance = str.__new__(cls, value)
        # AST is parsed lazily on first ``.format()`` call so that constructing
        # a ``PromptString`` from invalid body never raises until render time.
        # This matches v1 behavior where a malformed format string raised at
        # ``.format()`` time, not at construction.
        instance._ast_cache = None
        return instance

    def _get_ast(self) -> tuple["Node", ...]:
        if self._ast_cache is not None:
            return self._ast_cache
        from .syntax.lexer import tokenize
        from .syntax.parser import parse_body

        tokens = tokenize(str(self))
        ast = tuple(parse_body(tokens))
        self._ast_cache = ast
        return ast

    # ``str.format`` is intentionally overridden with a narrower signature:
    # PromptString routes ``format()`` to the v2 syntax engine, which rejects
    # positional args and reserves ``flags=`` as a keyword. The LSP violation
    # is by design; PromptString is a typed wrapper, not a drop-in ``str``.
    def format(  # type: ignore[override]  # ty: ignore[invalid-method-override]
        self,
        *args: Any,
        flags: Union[dict[str, Any], None] = None,
        **variables: Any,
    ) -> str:
        """Render this prompt body with the given variables and flags.

        Positional arguments are not supported (use named placeholders).
        ``flags`` is reserved as a kwarg name and is routed to the v2 flag
        evaluation path.
        """
        if args:
            raise TypeError(
                "PromptString.format() does not accept positional arguments. "
                "Use named placeholders (e.g. s.format(name=...))."
            )
        from .models import PromptMeta
        from .syntax.renderer import render
        from .syntax.validator import validate_inputs

        ast = self._get_ast()
        meta = PromptMeta()
        validate_inputs(meta, ast, variables, flags)
        return render(ast, variables, flags)

    def __repr__(self) -> str:
        return f"PromptString({str.__repr__(self)})"

    @classmethod
    def __get_pydantic_core_schema__(
        cls, source_type: Any, handler: GetCoreSchemaHandler
    ) -> core_schema.CoreSchema:
        return core_schema.no_info_after_validator_function(
            cls, core_schema.str_schema()
        )


# Backwards compatibility alias
SafeString = PromptString
