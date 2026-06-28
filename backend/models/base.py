"""Shared ORM base layer (ARCH §3.1/§3.2).

`Base` is the single declarative registry/metadata root every model — and the
Alembic `env.py` (Story 1.2c) — imports. `BaseEntity` is the abstract 10-column
identity/audit contract every household-scoped entity inherits; it maps no table of
its own. `MonetaryValueMixin` is the money column block mixed into `financial_events`
only — a pure column mixin that does not inherit `Base`.
"""

from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Numeric, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def _utcnow() -> datetime:
    # Callable default: evaluated per-row at insert, not frozen at import time.
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class BaseEntity(Base):
    """The 10 shared identity/audit columns (ARCH §3.1).

    Abstract: re-emits its columns onto each concrete subclass's table rather than
    mapping a table itself. `persons` overrides `household_id`/`created_by` to nullable
    when it is defined (Story 1.2c); this contract stays strict NOT NULL.
    """

    __abstract__ = True

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    household_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("households.id"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("persons.id"), nullable=False)
    updated_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("persons.id"), nullable=True
    )
    archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    archived_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("persons.id"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", index=True)


class MonetaryValueMixin:
    """The money column block (ARCH §3.2) — mixed into `financial_events` only.

    Pure column mixin: does NOT inherit `Base`. SQLAlchemy applies these columns to the
    `Base` subclass that mixes it in. Money is `Decimal`/`Numeric`, never `Float`.
    """

    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 4), nullable=False)
    fx_rate: Mapped[Decimal] = mapped_column(Numeric(10, 6), nullable=False)
    amount_base_calculated: Mapped[Decimal] = mapped_column(Numeric(15, 4), nullable=False)
    amount_base: Mapped[Decimal] = mapped_column(Numeric(15, 4), nullable=False)
    fx_delta: Mapped[Decimal | None] = mapped_column(Numeric(15, 4), nullable=True)
    fee_amount: Mapped[Decimal | None] = mapped_column(Numeric(15, 4), nullable=True)
    fx_rate_date: Mapped[date | None] = mapped_column(Date, nullable=True)
