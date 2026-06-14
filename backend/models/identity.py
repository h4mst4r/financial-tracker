"""Identity & Access models (ARCH §3.4).

`Household` inherits `Base` (no `household_id` — it IS the household).
`Person` inherits `BaseEntity` but overrides `household_id`/`created_by` to nullable
(a person exists before any household).
`Session` and `HouseholdInvitation` inherit `Base` (no audit block).
`ApprovedOwner` is global (no household).
"""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.models.base import Base, BaseEntity, _utcnow


class Household(Base):
    """Household — the top-level tenant container.

    Inherits `Base` (NOT `BaseEntity`) to avoid a circular `household_id → households` FK.
    `created_by` is a plain UUID string with NO FK (persons may not exist at bootstrap).
    """

    __tablename__ = "households"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    base_currency: Mapped[str] = mapped_column(String(3), nullable=False, default="SGD")
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Asia/Singapore")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    created_by: Mapped[str] = mapped_column(String(36), nullable=False)


class Person(BaseEntity):
    """Person — user identity, may exist before household assignment.

    Overrides `household_id` and `created_by` to nullable (a person is created at
    first login before any household — ARCH §3.3).
    """

    __tablename__ = "persons"

    # Override BaseEntity columns to nullable
    household_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("households.id"), nullable=True, index=True
    )
    created_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("persons.id"), nullable=True
    )

    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True)
    display_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    picture_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="member")
    display_currency: Mapped[str] = mapped_column(String(3), nullable=False, default="SGD")
    default_view: Mapped[str] = mapped_column(String(20), nullable=False, default="household")
    google_sub: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)
    last_active_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    can_create_household: Mapped[bool] = mapped_column(nullable=False, default=False)
    theme: Mapped[str] = mapped_column(String(20), nullable=False, default="base")
    colour: Mapped[str | None] = mapped_column(String(7), nullable=True)
    font: Mapped[str] = mapped_column(String(20), nullable=False, default="base")
    density: Mapped[str] = mapped_column(String(20), nullable=False, default="comfortable")
    reduce_motion: Mapped[bool] = mapped_column(nullable=False, default=False)
    notification_prefs: Mapped[str | None] = mapped_column(Text, nullable=True)
    dashboard_layout: Mapped[str | None] = mapped_column(Text, nullable=True)
    detachment_reason: Mapped[str | None] = mapped_column(String(30), nullable=True)
    detached_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (Index("ix_persons_household_id_email", "household_id", "email"),)


class Session(Base):
    """Session — server-side opaque session tokens (ARCH §2.14.A).

    Inherits `Base` (no audit block). No `household_id` — scopes via `person_id`.
    """

    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    person_id: Mapped[str] = mapped_column(String(36), ForeignKey("persons.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_activity_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    csrf_token: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)


class HouseholdInvitation(Base):
    """HouseholdInvitation — pending/accepted/declined invites."""

    __tablename__ = "household_invitations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    household_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("households.id"), nullable=False
    )
    invited_email: Mapped[str] = mapped_column(String(320), nullable=False)
    invited_by: Mapped[str] = mapped_column(String(36), ForeignKey("persons.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")


class ApprovedOwner(Base):
    """ApprovedOwner — global list of approved household creators."""

    __tablename__ = "approved_owners"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True)
    label: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(nullable=False, default=True)
    added_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("persons.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
