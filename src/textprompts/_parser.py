from datetime import date
from pathlib import Path
from typing import TYPE_CHECKING, Any, Literal, Optional

import yaml  # type: ignore[import-untyped]

if TYPE_CHECKING:  # pragma: no cover
    from .syntax.ast import Node

try:
    import tomllib
except ImportError:  # pragma: no cover - Python <3.11 fallback
    # ``tomli`` is only installed on Python <3.11; ty resolves modules against
    # the project's 3.11+ venv where the package is absent.
    import tomli as tomllib  # type: ignore[import-not-found, no-redef]  # ty: ignore[unresolved-import]

from .config import MetadataMode, warn_on_ignored_metadata
from .errors import (
    InvalidMetadataError,
    MalformedHeaderError,
    MissingMetadataError,
    ParseError,
)
from .frontmatter_schema import parse_flags_and_variables
from .models import FlagDecl, Prompt, PromptMeta, VariableDecl
from .prompt_string import PromptString
from .reconcile import reconcile
from .source import prepare_source
from .syntax.lexer import tokenize
from .syntax.parser import parse_body

DELIM = "---"
FrontmatterFormat = Literal["toml", "yaml", "auto"]

_KNOWN_FIELDS = frozenset({"title", "description", "version", "author", "created"})
_SCHEMA_KEYS = frozenset({"flags", "variables"})


def _split_front_matter(text: str) -> tuple[Optional[str], str]:
    """
    Returns (header, body). Header may be None.

    Strict parsing: only considers "---" at the very beginning of the file
    (no leading whitespace) as valid front matter delimiter.
    """
    # Must start exactly with "---" (no leading whitespace)
    if not text.startswith(DELIM):
        return None, text

    # Find second delimiter after the first
    second_delim = text.find(DELIM, len(DELIM))
    if second_delim == -1:
        raise MalformedHeaderError("Missing closing delimiter '---' for front matter")

    # Extract header and body
    header = text[len(DELIM) : second_delim].strip()
    # SPEC §4.1: consume the newline that terminates the closing '---' line,
    # then optionally consume EXACTLY ONE blank-separator line. Additional
    # blank lines beyond that are body content and must be preserved.
    body = text[second_delim + len(DELIM) :]
    if body.startswith("\n"):
        body = body[1:]
    if body.startswith("\n"):
        body = body[1:]

    return header, body


def _normalize_yaml_values(data: dict[str, Any]) -> dict[str, Any]:
    """Normalize YAML-parsed values.

    Converts Date instances to appropriate types. All other values
    (strings, booleans, numbers, arrays, nested objects) are preserved
    as-is — type coercion for known fields happens downstream in
    _ensure_prompt_meta.
    """
    normalized: dict[str, Any] = {}
    for key, value in data.items():
        if isinstance(value, date) and key in {"created"}:
            # Keep date objects for the 'created' field
            normalized[key] = value
        elif isinstance(value, date):
            # Convert dates in non-date fields to strings
            normalized[key] = str(value)
        else:
            normalized[key] = value
    return normalized


def _coerce_to_string(value: Any) -> Optional[str]:
    """Coerce a value to string for known PromptMeta fields."""
    if isinstance(value, str):
        return value
    if isinstance(value, date):
        return str(value)
    if value is None:
        return None
    return str(value)


def _ensure_prompt_meta(data: dict[str, Any]) -> PromptMeta:
    """Extract known fields, declarations, and extras from raw frontmatter."""
    known: dict[str, Any] = {}

    # Extract known fields with string coercion
    for key in _KNOWN_FIELDS:
        value = data.get(key)
        if value is None:
            continue
        if key == "created":
            if isinstance(value, date):
                known[key] = value
            else:
                known[key] = _coerce_to_string(value)
        else:
            known[key] = _coerce_to_string(value)

    # Parse [flags.*] / [variables.*] sections.
    flags, variables, _top_extras = parse_flags_and_variables(data)
    known["flags"] = flags
    known["variables"] = variables

    # Top-level extras: everything not in KNOWN_FIELDS or SCHEMA_KEYS.
    # Note: standard fields and schema sections are routed to their typed
    # homes; only the remainder lands in extras.
    extras: dict[str, Any] = {}
    for key, value in data.items():
        if key in _KNOWN_FIELDS or key in _SCHEMA_KEYS:
            continue
        extras[key] = value
    known["extras"] = extras

    return PromptMeta.model_validate(known)


def _parse_header(
    header_txt: str, *, frontmatter_format: FrontmatterFormat = "auto"
) -> dict[str, Any]:
    """Parse front matter header as TOML or YAML.

    ``frontmatter_format`` controls behavior:
        - ``"auto"`` (default): try TOML first, fall back to YAML.
        - ``"toml"``: TOML only; YAML is not attempted.
        - ``"yaml"``: YAML only; TOML is not attempted.
    """

    class _YamlParseError(Exception):
        """Internal marker: YAML parser raised a YAMLError (not a shape error)."""

    def _try_yaml() -> dict[str, Any]:
        try:
            result = yaml.safe_load(header_txt)
        except yaml.YAMLError as yaml_err:
            raise _YamlParseError(str(yaml_err)) from yaml_err
        if result is None:
            return {}
        if not isinstance(result, dict):
            raise InvalidMetadataError(
                f"Front matter must be a mapping, got {type(result).__name__}. "
                f"Use meta=MetadataMode.IGNORE to skip metadata parsing."
            )
        return _normalize_yaml_values(result)

    if frontmatter_format == "toml":
        try:
            return dict(tomllib.loads(header_txt))
        except tomllib.TOMLDecodeError as toml_err:
            raise InvalidMetadataError(
                f"Invalid TOML in front matter: {toml_err}. "
                f"Use meta=MetadataMode.IGNORE to skip metadata parsing."
            ) from toml_err

    if frontmatter_format == "yaml":
        try:
            return _try_yaml()
        except _YamlParseError as yaml_err:
            raise InvalidMetadataError(
                f"Invalid YAML in front matter: {yaml_err}. "
                f"Use meta=MetadataMode.IGNORE to skip metadata parsing."
            ) from yaml_err

    # "auto" — TOML first, YAML fallback.
    try:
        return dict(tomllib.loads(header_txt))
    except tomllib.TOMLDecodeError as toml_err:
        try:
            return _try_yaml()
        except _YamlParseError:
            # YAML parser also failed → report the original TOML error
            # (preserves v1 backwards compatibility).
            raise InvalidMetadataError(
                f"Invalid TOML in front matter: {toml_err}. "
                f"Use meta=MetadataMode.IGNORE to skip metadata parsing."
            ) from toml_err


def parse_file(
    path: Path,
    *,
    metadata_mode: MetadataMode,
    frontmatter_format: FrontmatterFormat = "auto",
) -> Prompt:
    """Parse a file according to the specified metadata mode."""

    try:
        raw = path.read_text(encoding="utf-8")
    except UnicodeDecodeError as e:
        from .errors import TextPromptsError

        raise TextPromptsError(f"Cannot decode {path} as UTF-8: {e}") from e

    # SPEC §2.5: line-ending + BOM normalization is the first step in every
    # mode. Body parsing later runs on the prepared source.
    normalized = prepare_source(raw, dedent=False)

    # IGNORE mode: full file becomes body, no header detection.
    if metadata_mode.value == MetadataMode.IGNORE.value:
        if (
            warn_on_ignored_metadata()
            and normalized.startswith(DELIM)
            and normalized.find(DELIM, len(DELIM)) != -1
        ):
            import warnings

            warnings.warn(
                "Metadata detected but ignored; use set_metadata('allow') or "
                "skip_metadata(skip_warning=True) to silence",
                stacklevel=2,
            )
        prepared_body = prepare_source(normalized, dedent=True)
        if prepared_body.strip() == "":
            raise ParseError(
                "prompt file is empty",
                code="E_EMPTY_PROMPT",
                path=str(path),
            )
        ignore_meta = PromptMeta(title=path.stem)
        # Body parsing still runs (no declarations, so reconciliation is
        # trivially limited to collision/{if vs switch} checks).
        ast, implicit_flags = _parse_and_reconcile_body(
            prepared_body,
            declared_flags=ignore_meta.flags,
            declared_variables=ignore_meta.variables,
            mode=metadata_mode,
            source_path=str(path),
        )
        # Snapshot validation meta BEFORE implicit-flag merge so format()
        # validation continues to use the declared-only view.
        validation_meta = _clone_meta_for_validation(ignore_meta)
        # IGNORE mode: surface body-only flags via meta.flags (SPEC §4.5).
        for _name, _decl in implicit_flags.items():
            if _name not in ignore_meta.flags:
                ignore_meta.flags[_name] = _decl
        prompt = Prompt.model_validate(
            {
                "path": path,
                "meta": ignore_meta,
                "prompt": PromptString(prepared_body),
            }
        )
        prompt._ast = ast
        prompt._validation_meta = validation_meta
        return prompt

    # STRICT / ALLOW modes: try to parse front matter.
    try:
        header_txt, body = _split_front_matter(normalized)
    except MalformedHeaderError as e:
        if normalized.startswith(DELIM):
            raise InvalidMetadataError(
                f"{e}. If this file has no metadata and starts with '---', "
                f"use meta=MetadataMode.IGNORE to skip metadata parsing."
            ) from e
        raise  # pragma: no cover - reraised to preserve stack

    meta: Optional[PromptMeta] = None
    if header_txt is not None and header_txt != "":
        try:
            data = _parse_header(header_txt, frontmatter_format=frontmatter_format)

            if metadata_mode.value == MetadataMode.STRICT.value:
                # STRICT mode: require title, description, version fields
                # and they must not be empty.
                required_fields = {"title", "description", "version"}
                missing_fields = required_fields - set(data.keys())
                if missing_fields:
                    raise InvalidMetadataError(
                        f"Missing required metadata fields: "
                        f"{', '.join(sorted(missing_fields))}. "
                        f"STRICT mode requires 'title', 'description', and "
                        f"'version' fields. Use meta=MetadataMode.ALLOW for "
                        f"less strict validation."
                    )

                empty_fields = [
                    field
                    for field in required_fields
                    if not data.get(field) or str(data.get(field)).strip() == ""
                ]
                if empty_fields:
                    raise InvalidMetadataError(
                        f"Empty required metadata fields: "
                        f"{', '.join(sorted(empty_fields))}. "
                        f"STRICT mode requires non-empty 'title', "
                        f"'description', and 'version' fields. Use "
                        f"meta=MetadataMode.ALLOW for less strict validation."
                    )

            meta = _ensure_prompt_meta(data)

        except (InvalidMetadataError, MissingMetadataError):
            raise
        except ParseError:
            raise
        except Exception as e:
            # FrontmatterError flows through unchanged.
            from .errors import FrontmatterError

            if isinstance(e, FrontmatterError):
                raise
            raise InvalidMetadataError(f"Invalid metadata: {e}") from e

    elif header_txt is not None and header_txt == "":
        # Empty frontmatter `---\n---` is equivalent to no frontmatter.
        if metadata_mode.value == MetadataMode.STRICT.value:
            raise MissingMetadataError(
                f"No metadata found in {path}. STRICT mode requires metadata "
                f"with title, description, and version fields. Use "
                f"meta=MetadataMode.ALLOW or meta=MetadataMode.IGNORE for "
                f"less strict validation."
            )
    else:
        # No frontmatter.
        if metadata_mode.value == MetadataMode.STRICT.value:
            raise MissingMetadataError(
                f"No metadata found in {path}. STRICT mode requires metadata "
                f"with title, description, and version fields. Use "
                f"meta=MetadataMode.ALLOW or meta=MetadataMode.IGNORE for "
                f"less strict validation."
            )
        meta = PromptMeta()

    if meta is None:  # pragma: no cover - defensive
        meta = PromptMeta()

    if meta.title is None:
        meta.title = path.stem

    prepared_body = prepare_source(body, dedent=True)
    if prepared_body.strip() == "":
        raise ParseError(
            "prompt file is empty",
            code="E_EMPTY_PROMPT",
            path=str(path),
        )

    ast, implicit_flags = _parse_and_reconcile_body(
        prepared_body,
        declared_flags=meta.flags,
        declared_variables=meta.variables,
        mode=metadata_mode,
        source_path=str(path),
    )
    # Snapshot validation meta BEFORE merging implicit decls.
    validation_meta = _clone_meta_for_validation(meta)
    # ALLOW only: merge body-only flag decls so callers can introspect them
    # (SPEC §4.5). STRICT rejects undeclared flags upstream, so the implicit
    # dict should be empty there — skip the merge defensively.
    if metadata_mode.value != MetadataMode.STRICT.value:
        for _name, _decl in implicit_flags.items():
            if _name not in meta.flags:
                meta.flags[_name] = _decl

    prompt = Prompt.model_validate(
        {
            "path": path,
            "meta": meta,
            "prompt": PromptString(prepared_body),
        }
    )
    prompt._ast = ast
    prompt._validation_meta = validation_meta
    return prompt


def _clone_meta_for_validation(meta: PromptMeta) -> PromptMeta:
    """Shallow-copy ``meta`` snapshotting ``flags`` and ``variables``.

    Mirrors the TS port's ``cloneMetaForValidation`` so that subsequent
    implicit-flag injection into ``meta.flags`` does not leak into the
    validation view used by :meth:`Prompt.format`.
    """
    return meta.model_copy(
        update={"flags": dict(meta.flags), "variables": dict(meta.variables)}
    )


def _parse_and_reconcile_body(
    prepared_body: str,
    *,
    declared_flags: dict[str, FlagDecl],
    declared_variables: dict[str, VariableDecl],
    mode: MetadataMode,
    source_path: str | None,
) -> tuple[tuple["Node", ...], dict[str, FlagDecl]]:
    """Tokenize + parse the body once and run the load-time reconciliation.

    Returns ``(ast, implicit_flags)`` where ``ast`` is the parsed body as a
    tuple (so callers can cache it on the Prompt) and ``implicit_flags`` is
    a mapping of synthesized :class:`FlagDecl` records for body-only flags
    (empty in STRICT mode where undeclared flags are rejected upstream).
    """
    tokens = tokenize(prepared_body)
    ast = parse_body(tokens)
    implicit = reconcile(
        ast,
        declared_flags,
        declared_variables,
        mode,
        source_path=source_path,
    )
    return tuple(ast), implicit


def parse_string(
    content: str,
    *,
    metadata_mode: MetadataMode,
    frontmatter_format: FrontmatterFormat = "auto",
    path: Optional[Path] = None,
) -> Prompt:
    """Parse a prompt from an in-memory string.

    Same option shape as ``parse_file``. The returned Prompt has
    ``path=path`` (default ``None``). Source preprocessing matches the file
    loader: BOM strip + CRLF normalize, then optional dedent.
    """
    source_path = str(path) if path is not None else None

    # SPEC §2.5: normalize first; dedent runs as part of body preparation.
    normalized = prepare_source(content, dedent=False)

    if metadata_mode.value == MetadataMode.IGNORE.value:
        prepared_body = prepare_source(normalized, dedent=True)
        if prepared_body.strip() == "":
            raise ParseError(
                "prompt file is empty",
                code="E_EMPTY_PROMPT",
                path=source_path,
            )
        title = path.stem if path is not None else None
        ignore_meta = PromptMeta(title=title)
        ast, implicit_flags = _parse_and_reconcile_body(
            prepared_body,
            declared_flags=ignore_meta.flags,
            declared_variables=ignore_meta.variables,
            mode=metadata_mode,
            source_path=source_path,
        )
        validation_meta = _clone_meta_for_validation(ignore_meta)
        for _name, _decl in implicit_flags.items():
            if _name not in ignore_meta.flags:
                ignore_meta.flags[_name] = _decl
        prompt = Prompt.model_validate(
            {
                "path": path,
                "meta": ignore_meta,
                "prompt": PromptString(prepared_body),
            }
        )
        prompt._ast = ast
        prompt._validation_meta = validation_meta
        return prompt

    # STRICT / ALLOW
    try:
        header_txt, body = _split_front_matter(normalized)
    except MalformedHeaderError as e:
        if normalized.startswith(DELIM):
            raise InvalidMetadataError(
                f"{e}. If this string has no metadata and starts with '---', "
                f"use metadata=MetadataMode.IGNORE to skip metadata parsing."
            ) from e
        raise

    meta: Optional[PromptMeta] = None
    if header_txt is not None and header_txt != "":
        try:
            data = _parse_header(header_txt, frontmatter_format=frontmatter_format)

            if metadata_mode.value == MetadataMode.STRICT.value:
                required_fields = {"title", "description", "version"}
                missing_fields = required_fields - set(data.keys())
                if missing_fields:
                    raise InvalidMetadataError(
                        f"Missing required metadata fields: "
                        f"{', '.join(sorted(missing_fields))}. "
                        f"STRICT mode requires 'title', 'description', and "
                        f"'version' fields."
                    )
                empty_fields = [
                    field
                    for field in required_fields
                    if not data.get(field) or str(data.get(field)).strip() == ""
                ]
                if empty_fields:
                    raise InvalidMetadataError(
                        f"Empty required metadata fields: "
                        f"{', '.join(sorted(empty_fields))}."
                    )

            meta = _ensure_prompt_meta(data)
        except (InvalidMetadataError, MissingMetadataError):
            raise
        except ParseError:
            raise
        except Exception as e:
            from .errors import FrontmatterError

            if isinstance(e, FrontmatterError):
                raise
            raise InvalidMetadataError(f"Invalid metadata: {e}") from e
    elif header_txt is not None and header_txt == "":
        if metadata_mode.value == MetadataMode.STRICT.value:
            raise MissingMetadataError(
                "No metadata found. STRICT mode requires metadata "
                "with title, description, and version fields."
            )
    else:
        if metadata_mode.value == MetadataMode.STRICT.value:
            raise MissingMetadataError(
                "No metadata found. STRICT mode requires metadata "
                "with title, description, and version fields."
            )
        meta = PromptMeta()

    if meta is None:
        meta = PromptMeta()
    if meta.title is None and path is not None:
        meta.title = path.stem

    prepared_body = prepare_source(body, dedent=True)
    if prepared_body.strip() == "":
        raise ParseError(
            "prompt file is empty",
            code="E_EMPTY_PROMPT",
            path=source_path,
        )

    ast, implicit_flags = _parse_and_reconcile_body(
        prepared_body,
        declared_flags=meta.flags,
        declared_variables=meta.variables,
        mode=metadata_mode,
        source_path=source_path,
    )
    validation_meta = _clone_meta_for_validation(meta)
    if metadata_mode.value != MetadataMode.STRICT.value:
        for _name, _decl in implicit_flags.items():
            if _name not in meta.flags:
                meta.flags[_name] = _decl

    prompt = Prompt.model_validate(
        {
            "path": path,
            "meta": meta,
            "prompt": PromptString(prepared_body),
        }
    )
    prompt._ast = ast
    prompt._validation_meta = validation_meta
    return prompt
