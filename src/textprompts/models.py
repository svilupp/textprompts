from datetime import date
from pathlib import Path
from typing import Any, Union

from pydantic import BaseModel, Field, field_validator

from .config import MetadataMode
from .prompt_string import PromptString


class PromptMeta(BaseModel):
    title: Union[str, None] = Field(default=None, description="Human-readable name")
    version: Union[str, None] = Field(default=None)
    author: Union[str, None] = Field(default=None)
    created: Union[date, None] = Field(default=None)
    description: Union[str, None] = Field(default=None)


class Prompt(BaseModel):
    path: Path
    meta: Union[PromptMeta, None]
    prompt: PromptString

    @classmethod
    def from_path(
        cls, path: Union[str, Path], *, meta: Union[MetadataMode, str, None] = None
    ) -> "Prompt":
        """Load a Prompt from ``path`` using ``load_prompt``."""
        from .loaders import load_prompt

        return load_prompt(path, meta=meta)

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

    @property
    def body(self) -> PromptString:
        import warnings

        warnings.warn(
            "Prompt.body is deprecated; use .prompt instead",
            DeprecationWarning,
            stacklevel=2,
        )
        return self.prompt

    def __len__(self) -> int:
        return len(self.prompt)

    def __getitem__(self, item: int | slice) -> str:
        return self.prompt[item]

    def __add__(self, other: str) -> str:
        return str(self.prompt) + str(other)

    def strip(self, *args: Any, **kwargs: Any) -> str:
        return self.prompt.strip(*args, **kwargs)

    def format(self, *args: Any, **kwargs: Any) -> str:
        return self.prompt.format(*args, **kwargs)
