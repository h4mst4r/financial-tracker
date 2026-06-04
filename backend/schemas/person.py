"""Pydantic schemas for Person, Invitation, and Role endpoints."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class PersonResponse(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        alias_generator=to_camel,
    )

    id: UUID
    display_name: str
    email: str
    role: str
    display_currency: str
    default_view: str
    picture_url: Optional[str] = None
    created_at: datetime


class PersonUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    display_name: Optional[str] = None
    display_currency: Optional[str] = None
    default_view: Optional[str] = None


class InvitationCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    invited_email: str


class InvitationResponse(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        alias_generator=to_camel,
    )

    id: UUID
    household_id: UUID
    invited_email: str
    invited_by: UUID
    created_at: datetime
    expires_at: datetime
    accepted_at: Optional[datetime] = None
    status: str


class RoleUpdate(BaseModel):
    role: str  # validated in service: must be "admin" or "member"
