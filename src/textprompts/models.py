from datetime import date
from pathlib import Path
from typing import Union

from pydantic import BaseModel, Field, field_validator

from .safe_string import SafeString


class PromptMeta(BaseModel):
    title: Union[str, None] = Field(default=None, description="Human-readable name")
    version: Union[str, None] = Field(default=None)
    author: Union[str, None] = Field(default=None)
    created: Union[date, None] = Field(default=None)
    description: Union[str, None] = Field(default=None)


class Prompt(BaseModel):
    path: Path
    meta: Union[PromptMeta, None]
    body: SafeString

    @field_validator("body")
    @classmethod
    def body_not_empty(cls, v: str) -> SafeString:
        if not v.strip():
            raise ValueError("Prompt body is empty")
        return SafeString(v)

    def __repr__(self) -> str:
        if self.meta and self.meta.title:
            if self.meta.version:
                return (
                    f"Prompt(title='{self.meta.title}', version='{self.meta.version}')"
                )
            else:
                return f"Prompt(title='{self.meta.title}')"
        else:
            return f"Prompt(path='{self.path}')"

    def __str__(self) -> str:
        return str(self.body)
