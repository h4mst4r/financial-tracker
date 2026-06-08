"""Pydantic schemas for Category CRUD operations.

Schemas:
    CategoryCreate  — request body for creating a category
    CategoryUpdate  — request body for partial updates
    CategoryResponse — response body (includes computed fields)
"""

import re
from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

_HEX_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")
_CATEGORY_TYPE_VALUES = ("income", "expense", "both")


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class CategoryCreate(BaseModel):
    """Request body for creating a new category."""

    name: str = Field(..., min_length=1, max_length=100)
    color: str = Field(..., description="Hex colour, e.g. #4CAF50")
    icon: Optional[str] = None
    parent_id: Optional[UUID] = None
    category_type: str = Field(..., description="income | expense | both")

    @field_validator("color")
    @classmethod
    def _validate_color(cls, v: str) -> str:
        if not _HEX_COLOR_RE.match(v):
            raise ValueError("color must be a hex value like #4CAF50")
        return v

    @field_validator("category_type")
    @classmethod
    def _validate_category_type(cls, v: str) -> str:
        if v not in _CATEGORY_TYPE_VALUES:
            raise ValueError("category_type must be 'income', 'expense', or 'both'")
        return v


class ReassignChildrenRequest(BaseModel):
    """Request body for bulk-reassigning subcategories."""

    new_parent_id: Optional[UUID] = None


class CategoryUpdate(BaseModel):
    """Request body for partial category updates — all fields optional."""

    name: Optional[str] = Field(None, min_length=1, max_length=100)
    color: Optional[str] = None
    icon: Optional[str] = None
    parent_id: Optional[UUID] = None
    category_type: Optional[str] = None

    @field_validator("color")
    @classmethod
    def _validate_color(cls, v):
        if v is not None and not _HEX_COLOR_RE.match(v):
            raise ValueError("color must be a hex value like #4CAF50")
        return v

    @field_validator("category_type")
    @classmethod
    def _validate_category_type(cls, v):
        if v is not None and v not in _CATEGORY_TYPE_VALUES:
            raise ValueError("category_type must be 'income', 'expense', or 'both'")
        return v


# ---------------------------------------------------------------------------
# Response schema
# ---------------------------------------------------------------------------


class CategoryResponse(BaseModel):
    """Response body for category data — includes computed fields."""

    model_config = {"from_attributes": True}

    id: UUID
    household_id: UUID
    name: str
    color: Optional[str] = None
    icon: Optional[str] = None
    category_type: str
    parent_id: Optional[UUID] = None
    depth: int = 0
    archived: bool = False
    archived_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    children_count: int = 0
    parent_name: Optional[str] = None


# ---------------------------------------------------------------------------
# Merge request schema
# ---------------------------------------------------------------------------


class MergeCategoriesRequest(BaseModel):
    """Request body for merging source categories into a target category."""

    target_id: UUID
    source_ids: list[UUID] = Field(..., min_length=1)

    @field_validator("source_ids")
    @classmethod
    def _no_duplicate_sources(cls, v: list[UUID]) -> list[UUID]:
        if len(v) != len(set(v)):
            raise ValueError("source_ids must not contain duplicates")
        return v

    @model_validator(mode="after")
    def _target_not_in_source_ids(self):
        if self.target_id in self.source_ids:
            raise ValueError("target_id must not be in source_ids")
        return self


# ---------------------------------------------------------------------------
# Duplicate detection response schemas
# ---------------------------------------------------------------------------


class DuplicateCategoryResponse(BaseModel):
    """Single category within a duplicate group."""

    id: UUID
    name: str
    color: Optional[str] = None
    icon: Optional[str] = None
    transaction_count: int = 0


class DuplicateGroupResponse(BaseModel):
    """Group of potential duplicate categories."""

    group_id: str
    match_type: Literal["exact", "fuzzy"]
    match_score: float
    categories: list[DuplicateCategoryResponse]


class DuplicateGroupsResponse(BaseModel):
    """Top-level response for duplicate detection endpoint."""

    groups: list[DuplicateGroupResponse]


# ---------------------------------------------------------------------------
# Merge response schema
# ---------------------------------------------------------------------------


class MergeSourceCategoryResponse(BaseModel):
    """Per-source-category result within merge response."""

    id: UUID
    name: str
    transactions_reassigned: int
    subcategories_reassigned: int


class MergeResponse(BaseModel):
    """Response body for category merge endpoint."""

    success: bool
    target_id: UUID
    source_categories: list[MergeSourceCategoryResponse]
    total_transactions_reassigned: int
    total_subcategories_reassigned: int
    message: str


# ---------------------------------------------------------------------------
# Import preview schemas
# ---------------------------------------------------------------------------


class ImportPreviewRequest(BaseModel):
    """Request body for import category mapping preview."""

    category_values: list[str] = Field(..., min_length=1, max_length=500)


class ImportMappingResponse(BaseModel):
    """Single mapping suggestion for one input name."""

    original_name: str
    mapped_to_id: UUID | None = None
    mapped_to_name: str | None = None
    match_type: Literal["exact", "trimmed", "fuzzy", "unmapped"]
    transaction_count: int = 0
    suggested_action: Literal["map", "create_new"] = "map"


class ImportPreviewResponse(BaseModel):
    """Response body for import preview endpoint."""

    mappings: list[ImportMappingResponse]
