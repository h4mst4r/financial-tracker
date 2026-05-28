"""Household model — bootstrap entity (EDP §4).

Household inherits from Base directly, NOT BaseEntity.
Reason: household_id is a FK to households.id; inheriting BaseEntity would create a circular reference.
This is the ONLY entity with this exception. See EDP §4 and BE-002 dev notes.
"""

from datetime import datetime
from typing import Any
from typing import List
from uuid import UUID, uuid4

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base
from backend.models.base import utcnow


class Household(Base):
    """Bootstrap entity — represents a household / family unit.

    Fields:
        id:              UUID primary key, auto-generated.
        name:            Display name for the household.
        base_currency:   ISO 4217 code for the household's base currency.
        timezone:        IANA timezone identifier.
        created_at:      UTC creation timestamp.
        created_by:      Founding member UUID (no FK — persons don't exist yet at bootstrap).
    """

    __tablename__ = "households"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    base_currency: Mapped[str] = mapped_column(String(3), nullable=False, default=lambda: "SGD")
    timezone: Mapped[str] = mapped_column(String(50), nullable=False, default=lambda: "Asia/Singapore")
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    created_by: Mapped[UUID] = mapped_column(nullable=False)

    # Relationships — string targets to avoid circular imports with person.py
    persons: Mapped[List["Person"]] = relationship("Person", back_populates="household")
    invitations: Mapped[List["HouseholdInvitation"]] = relationship(
        "HouseholdInvitation", back_populates="household"
    )

    def __init__(self, **kwargs: Any) -> None:
        """Initialize with Python-level defaults for string columns.

        SQLAlchemy mapped_column(default=...) only applies at SQL INSERT time.
        This ensures the attributes are set immediately on instantiation.
        """
        kwargs.setdefault("base_currency", "SGD")
        kwargs.setdefault("timezone", "Asia/Singapore")
        super().__init__(**kwargs)
