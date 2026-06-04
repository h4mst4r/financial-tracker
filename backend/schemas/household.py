"""Pydantic schemas for Household endpoints."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class HouseholdResponse(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        alias_generator=to_camel,
    )

    id: UUID
    name: str
    base_currency: str
    timezone: str
    created_at: datetime


class HouseholdUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    name: Optional[str] = None
    timezone: Optional[str] = None


class InvitationPreviewResponse(BaseModel):
    """Public invitation preview — returned to unauthenticated users."""

    model_config = ConfigDict(
        from_attributes=False,
        populate_by_name=True,
        alias_generator=to_camel,
    )

    household_name: str
    invited_by_display_name: str
    invited_email: str
    expires_at: datetime
    status: str


class HouseholdDelete(BaseModel):
    """Household deletion — requires CSRF token in header.

    confirm_name must match the household name (case-insensitive) before deletion proceeds.
    """

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    confirm_name: str
