"""Generic schema conventions (ARCH §4.5).

`ListResponse` — the canonical envelope for list endpoints.
Every list endpoint returns `{"items": [...], "total": N}` — never a bare array.
"""

from typing import TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class ListResponse(BaseModel, type_params=T):
    """Generic list envelope for all list endpoints.

    Every list response uses this shape — never return a bare array.
    """

    items: list[T]
    total: int
