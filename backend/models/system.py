"""System models (ARCH §3.9).

`Alert` inherits `BaseEntity`. `AuditLog` and `EntityPreference` inherit `Base` (no audit
block). `AuditLog` has **no foreign keys** — it records survive entity/actor deletion.
"""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from backend.models.base import Base, BaseEntity


class Alert(BaseEntity):
    """Alert — household notifications and alerts."""

    __tablename__ = "alerts"

    alert_type: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    entity_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    dismissed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AuditLog(Base):
    """AuditLog — append-only audit trail.

    Inherits `Base` with **no foreign keys** — audit rows survive deletion of the
    entities/actors they describe (ARCH §3.3, §3.9).
    """

    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    household_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    actor_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(20), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    before_state: Mapped[str | None] = mapped_column(Text, nullable=True)
    after_state: Mapped[str | None] = mapped_column(Text, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)


class EntityPreference(Base):
    """EntityPreference — per-person entity preferences (favourites, sort order)."""

    __tablename__ = "entity_preferences"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    person_id: Mapped[str] = mapped_column(String(36), ForeignKey("persons.id"), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False)
    is_favourite: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int | None] = mapped_column(Integer, nullable=True)

    __table_args__ = (
        UniqueConstraint(
            "person_id",
            "entity_type",
            "entity_id",
            name="uq_entity_preferences_person_id_entity_type_entity_id",
        ),
        Index("ix_entity_preferences_person_id_entity_type", "person_id", "entity_type"),
    )
