"""Person, Session, and HouseholdInvitation models (EDP §5).

Person inherits BaseEntity (full audit trail + household scoping).
Session and HouseholdInvitation inherit Base directly (technical entities with their own lifecycles).
"""

from datetime import datetime
from typing import Any
from typing import List, Optional
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base
from backend.models.base import BaseEntity, utcnow


class Person(BaseEntity):
    """Unified user + household member entity (EDP §5).

    Inherits all 10 BaseEntity fields (id, household_id, created_at, updated_at,
    created_by, updated_by, archived, archived_at, archived_by, status).

    Additional fields:
        email:             Google OAuth email — unique identifier.
        display_name:      Preferred display name.
        picture_url:       Google profile picture URL.
        role:              Household role (owner / admin / member).
        display_currency:  Preferred display currency (ISO 4217).
        default_view:      Default dashboard view (household / personal).
        google_sub:        Google OAuth subject identifier — unique.
        last_active_at:    Last activity timestamp.
    """

    __tablename__ = "persons"

    __table_args__ = (
        Index("ix_persons_household_email", "household_id", "email"),
    )

    # Override BaseEntity fields — Person can exist before Household (first login)
    household_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("households.id"), nullable=True, index=True
    )
    created_by: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("persons.id"), nullable=True
    )

    # Person-specific fields
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    picture_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default=lambda: "member")
    display_currency: Mapped[str] = mapped_column(String(3), nullable=False, default=lambda: "SGD")
    default_view: Mapped[str] = mapped_column(String(20), nullable=False, default=lambda: "household")
    google_sub: Mapped[str] = mapped_column(String(200), nullable=False, unique=True, index=True)
    last_active_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    can_create_household: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    # Relationships — string targets to avoid circular imports with household.py
    household: Mapped["Household"] = relationship("Household", back_populates="persons")
    sessions: Mapped[List["Session"]] = relationship("Session", back_populates="person")
    invitations_sent: Mapped[List["HouseholdInvitation"]] = relationship(
        "HouseholdInvitation", back_populates="invited_by_person"
    )


class Session(Base):
    """Authentication session — technical entity (no household scoping, no audit trail).

    Fields:
        id:                UUID primary key, auto-generated.
        person_id:         FK to persons.id.
        created_at:        UTC creation timestamp.
        expires_at:        UTC expiration timestamp.
        last_activity_at:  UTC last activity (for sliding window expiry).
        csrf_token:        Unique CSRF token — one per session lifetime.
        ip_address:        Client IP (supports IPv6 via String(45)).
        user_agent:        Client user agent string.
    """

    __tablename__ = "sessions"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    person_id: Mapped[UUID] = mapped_column(ForeignKey("persons.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_activity_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    csrf_token: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    person: Mapped["Person"] = relationship("Person", back_populates="sessions")


class HouseholdInvitation(Base):
    """Invitation tracking — technical entity (own lifecycle: pending/accepted/expired/cancelled).

    Fields:
        id:              UUID primary key, auto-generated.
        household_id:    FK to households.id.
        invited_email:   Email address of the invitee.
        invited_by:      FK to persons.id — who sent the invitation.
        created_at:      UTC creation timestamp.
        expires_at:      UTC expiration timestamp (typically 48h).
        accepted_at:     UTC acceptance timestamp (null until accepted).
        status:          Lifecycle status (pending / accepted / expired / cancelled).
    """

    __tablename__ = "household_invitations"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    household_id: Mapped[UUID] = mapped_column(ForeignKey("households.id"), nullable=False)
    invited_email: Mapped[str] = mapped_column(String(320), nullable=False)
    invited_by: Mapped[UUID] = mapped_column(ForeignKey("persons.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    accepted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=lambda: "pending")

    # Relationships — string targets to avoid circular imports
    household: Mapped["Household"] = relationship("Household", back_populates="invitations")
    invited_by_person: Mapped["Person"] = relationship("Person", back_populates="invitations_sent")

    def __init__(self, **kwargs: Any) -> None:
        """Initialize with Python-level defaults for string columns.

        SQLAlchemy mapped_column(default=...) only applies at SQL INSERT time.
        This ensures the attributes are set immediately on instantiation.
        """
        kwargs.setdefault("status", "pending")
        super().__init__(**kwargs)
