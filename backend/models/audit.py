"""Audit log model for append-only entity change tracking.

Stores plain UUIDs with NO foreign key constraints — audit records must
survive entity and actor deletion. This table is append-only; no UPDATE
or DELETE operations should ever be performed.

Models:
    AuditLog(Base)  — append-only audit trail (EDP §13.2)

References: EDP §13.2, ARCH §4.4
"""

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import (
    DateTime,
    String,
    Text,
)
from sqlalchemy.orm import (
    Mapped,
    mapped_column,
)

from backend.database import Base


# ---------------------------------------------------------------------------
# AuditLog — append-only audit trail (NOT BaseEntity, NO FK constraints)
# ---------------------------------------------------------------------------


class AuditLog(Base):
    """Append-only audit log for entity lifecycle events.

    Inherits from Base directly (NOT BaseEntity) — stores plain UUIDs with
    NO foreign key constraints on household_id, actor_id, or entity_id.
    This ensures audit records survive even if the audited entity or actor
    is permanently deleted.

    CRITICAL: No ForeignKey on household_id, actor_id, or entity_id.
    These are plain UUID columns — audit trail integrity is paramount.

    Fields:
        id:            UUID primary key.
        household_id:  Plain UUID (no FK) — which household this event belongs to.
        actor_id:      Plain UUID (no FK) — who performed the action.
        action:        "create" / "update" / "archive" / "restore" / "delete".
        entity_type:   Entity type (e.g., "transaction", "account").
        entity_id:     Plain UUID (no FK) — which entity was affected.
        before_state:  JSON snapshot of the entity before the change.
        after_state:   JSON snapshot of the entity after the change.
        occurred_at:   When the action occurred.
        ip_address:    Actor's IP address.
        user_agent:    Actor's browser/client user agent.
    """

    __tablename__ = "audit_logs"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    household_id: Mapped[UUID] = mapped_column(nullable=False, index=True)
    actor_id: Mapped[UUID] = mapped_column(nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(20), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[UUID] = mapped_column(nullable=False, index=True)
    before_state: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    after_state: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
