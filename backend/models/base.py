"""Base entity, monetary value mixin, and shared enums.

This module defines the reusable building blocks for every financial entity:

- StatusEnum: lifecycle status (active / inactive / archived) — EDP §3.4
- BaseEntity: abstract SQLAlchemy 2.0 model with 10 audit/lifecycle fields — EDP §3.1
- MonetaryValueMixin: 7-column monetary block with fx_delta auto-computation — EDP §3.2

Household is the **only** exception to BaseEntity — it inherits from Base directly
because household_id would be a circular FK. See EDP §4.
"""

from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import ForeignKey, Numeric, String
from sqlalchemy.orm import (
    Mapped,
    mapped_column,
    validates,
)

from backend.database import Base


# ---------------------------------------------------------------------------
# UTC helper
# ---------------------------------------------------------------------------


def utcnow() -> datetime:
    """Current UTC now — deterministic for tests via monkeypatch."""
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# StatusEnum — EDP §3.4
# ---------------------------------------------------------------------------


class StatusEnum(str, Enum):
    """Entity lifecycle status.

    Active -> Inactive -> Archived -> (Permanently Deleted)
                 ^___________v (restore)

    - active:     normal operating state, visible in default views
    - inactive:   paused / suspended, visible with indicator
    - archived:   soft-deleted, excluded from default queries
    """

    active = "active"
    inactive = "inactive"
    archived = "archived"


# ---------------------------------------------------------------------------
# BaseEntity — EDP §3.1
# ---------------------------------------------------------------------------


class BaseEntity(Base):
    """Abstract base with 10 audit / lifecycle fields.

    Every financial entity inherits from this class except Household
    (which uses Base directly to avoid a circular FK).

    Fields:
        id:              UUID primary key, auto-generated.
        household_id:    Owning household — enforced on every query.
        created_at:      Record creation timestamp (UTC).
        updated_at:      Last modification timestamp (UTC).
        created_by:      Person who created this record.
        updated_by:      Person who last modified this record.
        archived:        Soft-delete flag — excluded from default queries.
        archived_at:     When archived (null if active).
        archived_by:     Who archived (null if active).
        status:          Lifecycle status (active / inactive / archived).
    """

    __abstract__ = True

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    household_id: Mapped[UUID] = mapped_column(
        ForeignKey("households.id"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)
    created_by: Mapped[UUID] = mapped_column(
        ForeignKey("persons.id"), nullable=False
    )
    updated_by: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("persons.id"), nullable=True
    )
    archived: Mapped[bool] = mapped_column(default=False, index=True)
    archived_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    archived_by: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("persons.id"), nullable=True
    )
    status: Mapped[StatusEnum] = mapped_column(default=StatusEnum.active, index=True)


# ---------------------------------------------------------------------------
# MonetaryValueMixin — EDP §3.2
# ---------------------------------------------------------------------------


class MonetaryValueMixin:
    """Reusable mixin with 7 inline monetary columns and fx_delta auto-computation.

    Override flow:
        1. User enters amount and currency.
        2. System auto-fills amount_base_calculated using today's FX rate.
        3. amount_base defaults to amount_base_calculated.
        4. User may override amount_base with the exact bank statement figure.
        5. fx_delta is recomputed automatically: amount_base_calculated - amount_base.

    Rules:
        - amount_base_calculated is system-generated and read-only.
        - fx_delta is always displayed (transparency commitment).
        - When currency == base_currency: fx_rate=1, fx_delta=0.

    This is a pure mixin — it does NOT inherit from Base or BaseEntity.
    Concrete models mix it in via multiple inheritance:
        class Account(BaseEntity, MonetaryValueMixin): ...
    """

    # Pure column-contributing mixin — no __tablename__, no __abstract__.
    # The mapper registry is inherited from the concrete subclass.

    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 4), nullable=False)
    fx_rate: Mapped[Decimal] = mapped_column(Numeric(10, 6), nullable=False)
    amount_base_calculated: Mapped[Decimal] = mapped_column(
        Numeric(15, 4), nullable=False
    )
    amount_base: Mapped[Decimal] = mapped_column(Numeric(15, 4), nullable=False)
    fx_delta: Mapped[Decimal] = mapped_column(Numeric(15, 4), nullable=True)
    fee_amount: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(15, 4), nullable=True
    )

    @validates("amount_base")
    def _compute_fx_delta(self, key: str, value: Decimal) -> Decimal:  # noqa: ARG002
        """Auto-recompute fx_delta whenever amount_base is set or changed.

        fx_delta = amount_base_calculated - amount_base
        Positive delta means the bank charged more than the API rate (forex loss).
        """
        if self.amount_base_calculated is not None:
            self.fx_delta = self.amount_base_calculated - value
        return value
