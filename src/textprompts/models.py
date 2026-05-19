from datetime import date
from pathlib import Path
from typing import TYPE_CHECKING, Any, Literal, Union

from pydantic import BaseModel, Field, PrivateAttr, field_validator

from .config import MetadataMode
from .prompt_string import PromptString

if TYPE_CHECKING:  # pragma: no cover
    from .syntax.ast import Node


class FlagDecl(BaseModel):
    """A declared flag from ``[flags.<name>]`` in frontmatter (SPEC §4.3).

    ``kind="boolean"`` flags have ``values=None``. ``kind="enum"`` flags
    have a non-empty tuple of identifier strings in declaration order.
    ``extras`` preserves any additional fields beyond the standard
    ``type``, ``values``, ``description`` set, keeping original parser
    types intact.
    """

    kind: Literal["boolean", "enum"]
    values: Union[tuple[str, ...], None] = Field(default=None)
    description: Union[str, None] = Field(default=None)
    extras: dict[str, Any] = Field(default_factory=dict)


class VariableDecl(BaseModel):
    """A declared variable from ``[variables.<name>]`` in frontmatter (SPEC §4.4)."""

    description: Union[str, None] = Field(default=None)
    extras: dict[str, Any] = Field(default_factory=dict)


class PromptMeta(BaseModel):
    title: Union[str, None] = Field(default=None, description="Human-readable name")
    version: Union[str, None] = Field(default=None)
    author: Union[str, None] = Field(default=None)
    created: Union[date, None] = Field(default=None)
    description: Union[str, None] = Field(default=None)
    extras: dict[str, Any] = Field(
        default_factory=dict,
        description="Additional top-level frontmatter fields not part of the "
        "standard set. Preserves original types (booleans, numbers, arrays, "
        "nested objects). Raw ``flags`` and ``variables`` keys are NOT copied "
        "here — they are parsed into the ``flags``/``variables`` fields.",
    )
    flags: dict[str, FlagDecl] = Field(
        default_factory=dict,
        description="Declared flags from ``[flags.*]`` sections (SPEC §4.3).",
    )
    variables: dict[str, VariableDecl] = Field(
        default_factory=dict,
        description="Declared variables from ``[variables.*]`` sections (SPEC §4.4).",
    )


class Prompt(BaseModel):
    path: Union[Path, None]
    meta: Union[PromptMeta, None]
    prompt: PromptString

    # Private cached parsed AST. Populated by the loader (``_parser.parse_file``)
    # and by ``Prompt.from_string``. ``format()`` re-parses on demand if the
    # cache is empty (e.g. when a Prompt is built manually via the constructor).
    _ast: Union[tuple["Node", ...], None] = PrivateAttr(default=None)
    # Validation snapshot taken before implicit-flag materialization (SPEC §4.5).
    # ``meta.flags`` is augmented with body-only flag decls for introspection,
    # but ``format()``'s value-set validation must continue to use the
    # declared-only view to preserve pre-implicit semantics (e.g. unknown enum
    # values still flow through the `{else}`-aware implicit-mode check).
    # Mirrors the TS port's ``cloneMetaForValidation`` in ``parser-core.ts``.
    _validation_meta: Union["PromptMeta", None] = PrivateAttr(default=None)

    @classmethod
    def from_path(
        cls,
        path: Union[str, Path],
        *,
        metadata: Union[MetadataMode, str, None] = None,
        frontmatter_format: Literal["toml", "yaml", "auto"] = "auto",
        **kwargs: Any,
    ) -> "Prompt":
        """Load a Prompt from ``path`` using ``load_prompt``.

        ``metadata`` is the canonical v2 spelling. ``meta`` is accepted as a
        deprecated alias for one major release; passing both is a ``TypeError``.
        """
        from .loaders import load_prompt

        return load_prompt(
            path,
            metadata=metadata,
            frontmatter_format=frontmatter_format,
            **kwargs,
        )

    @classmethod
    def from_string(
        cls,
        content: str,
        *,
        metadata: Union[MetadataMode, str, None] = None,
        frontmatter_format: Literal["toml", "yaml", "auto"] = "auto",
        path: Union[str, Path, None] = None,
        **kwargs: Any,
    ) -> "Prompt":
        """Build a Prompt from an in-memory string.

        Same option shape as ``load_prompt`` / ``from_path``. The resulting
        prompt has ``path=path`` (default ``None``). ``meta=`` is accepted as
        a deprecated alias for ``metadata=`` (via kwargs).
        """
        from ._parser import parse_string
        from .loaders import _normalize_meta_kwargs

        mode = _normalize_meta_kwargs(metadata=metadata, kwargs=kwargs)
        return parse_string(
            content,
            metadata_mode=mode,
            frontmatter_format=frontmatter_format,
            path=Path(path) if path is not None else None,
        )

    @field_validator("prompt")
    @classmethod
    def prompt_not_empty(cls, v: str) -> PromptString:
        if not v.strip():
            raise ValueError("Prompt body is empty")
        return PromptString(v)

    def __repr__(self) -> str:
        if self.meta and self.meta.title:
            if self.meta.version:
                return (
                    f"Prompt(title='{self.meta.title}', version='{self.meta.version}')"
                    " # use .format() or str()"
                )
            return f"Prompt(title='{self.meta.title}') # use .format() or str()"
        return f"Prompt(path='{self.path}') # use .format() or str()"

    def __str__(self) -> str:
        return str(self.prompt)

    def __len__(self) -> int:
        return len(self.prompt)

    def __getitem__(self, item: int | slice) -> str:
        return self.prompt[item]

    def __add__(self, other: str) -> str:
        return str(self.prompt) + str(other)

    def strip(self, *args: Any, **kwargs: Any) -> str:
        return self.prompt.strip(*args, **kwargs)

    def _get_ast(self) -> tuple["Node", ...]:
        """Return the cached AST, parsing on demand if missing."""
        if self._ast is not None:
            return self._ast
        from .syntax.lexer import tokenize
        from .syntax.parser import parse_body

        tokens = tokenize(str(self.prompt))
        ast = tuple(parse_body(tokens))
        self._ast = ast
        return ast

    def format(
        self,
        *args: Any,
        flags: Union[dict[str, Any], None] = None,
        **variables: Any,
    ) -> str:
        """Render the prompt with the given variables and flags.

        ``flags`` is a reserved kwarg: every other keyword argument is treated
        as a variable substitution. Positional arguments are not accepted
        (v2 dropped support for positional ``{0}`` placeholders).
        """
        if args:
            raise TypeError(
                "Prompt.format() does not accept positional arguments. "
                "Use named placeholders (e.g. prompt.format(name=...))."
            )
        from .syntax.renderer import render
        from .syntax.validator import validate_inputs

        # Prefer the pre-implicit validation snapshot when available so that
        # body-only flags do not gain declared value-set checks (SPEC §4.5).
        meta = self._validation_meta
        if meta is None:
            meta = self.meta if self.meta is not None else PromptMeta()
        ast = self._get_ast()
        validate_inputs(meta, ast, variables, flags)
        return render(ast, variables, flags)
