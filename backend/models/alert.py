"""Alert model for user notifications.

Tracks system-generated alerts (budget thresholds, missed payments, FX errors)
with read/unread status. Linked to optional entities for contextual navigation.

Models:
    Alert(BaseEntity)  — user notification alerts

References: ARCH §4.4
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import (
    Boolean,
    DateTime,
    String,
    Text,
)
from sqlalchemy.orm import (
    Mapped,
    mapped_column,
)

from backend.models.base import BaseEntity


# ---------------------------------------------------------------------------
# Alert — user notification alerts
# ---------------------------------------------------------------------------


class Alert(BaseEntity):
    """User-facing alert/notification record.

    Extends BaseEntity for full household audit trail. Alerts can be linked
    to specific entities (e.g., a budget or transaction) or be system-wide
    (entity_type and entity_id are nullable).

    Fields:
        alert_type:   "missed_payment" / "budget_threshold" / "budget_exceeded" /
                      "fx_fetch_failed" / "duplicate_detected" / "system_error".
        title:        Alert title.
        body:         Alert body text.
        entity_type:  Related entity type (nullable for system alerts).
        entity_id:    Related entity ID (nullable for system alerts).
        is_read:      Whether the alert has been read.
        read_at:      When the alert was marked as read.
    """

    __tablename__ = "alerts"

    alert_type: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    entity_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    entity_id: Mapped[Optional[UUID]] = mapped_column(nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    read_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
