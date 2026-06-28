"""Currency, FX, and Formula models (ARCH §3.8).

`Currency`, `FxRateHistory`, and `FxProvider` inherit `Base` (no audit block).
`Formula` inherits `BaseEntity` (system formulas + user-defined).
"""

from datetime import date, datetime
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    false,
)
from sqlalchemy.orm import Mapped, mapped_column

from backend.models.base import Base, BaseEntity


class Currency(Base):
    """Currency — household currency configuration."""

    __tablename__ = "currencies"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    household_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("households.id"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(3), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    symbol: Mapped[str] = mapped_column(String(5), nullable=False)
    is_base: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_display_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    rate_to_base: Mapped[Decimal] = mapped_column(Numeric(10, 6), nullable=False)
    fee_pct: Mapped[Decimal] = mapped_column(Numeric(6, 4), nullable=False, default=0)
    last_rate_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rate_source: Mapped[str | None] = mapped_column(String(100), nullable=True)
    colour: Mapped[str | None] = mapped_column(String(7), nullable=True)
    # Per-instance full-saturation fill opt-in (calm tint default; vivid = full-saturation fill).
    # Cross-entity column (also on categories/accounts) — ARCH §3.8, FR-SYS-016, Story 3.5.
    vivid: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )

    __table_args__ = (
        UniqueConstraint("household_id", "code", name="uq_currencies_household_id_code"),
    )


class FxRateHistory(Base):
    """FxRateHistory — historical FX rate snapshots."""

    __tablename__ = "fx_rate_history"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    currency_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("currencies.id"), nullable=False
    )
    rate_date: Mapped[date] = mapped_column(Date, nullable=False)
    rate_to_base: Mapped[Decimal] = mapped_column(Numeric(10, 6), nullable=False)
    source: Mapped[str | None] = mapped_column(String(100), nullable=True)

    __table_args__ = (
        UniqueConstraint(
            "currency_id", "rate_date", name="uq_fx_rate_history_currency_id_rate_date"
        ),
    )


class FxProvider(Base):
    """FxProvider — household-scoped FX data providers."""

    __tablename__ = "fx_providers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    household_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("households.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    provider_type: Mapped[str] = mapped_column(String(30), nullable=False)
    base_url: Mapped[str] = mapped_column(String(500), nullable=False)
    api_key_secret_ref: Mapped[str | None] = mapped_column(String(200), nullable=True)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_status: Mapped[str | None] = mapped_column(String(10), nullable=True)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Formula(BaseEntity):
    """Formula — system and user-defined computation formulas."""

    __tablename__ = "formulas"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    formula_key: Mapped[str] = mapped_column(String(100), nullable=False)
    expression: Mapped[str] = mapped_column(Text, nullable=False)
    applies_to: Mapped[str] = mapped_column(String(50), nullable=False)
    variables: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint(
            "household_id", "formula_key", name="uq_formulas_household_id_formula_key"
        ),
    )
