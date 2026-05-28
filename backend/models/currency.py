"""Currency and FX rate history models.

Manages household currencies with historical FX rates. Currency does NOT
inherit from BaseEntity — it has a custom structure without created_by,
archived, or status fields.

Models:
    Currency(Base)         — household currency configuration (EDP §10)
    FxRateHistory(Base)    — historical FX rate records (EDP §10)

References: EDP §10, ARCH §4.4
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import (
    Mapped,
    mapped_column,
)

from backend.database import Base


# ---------------------------------------------------------------------------
# Currency — household currency configuration (NOT BaseEntity)
# ---------------------------------------------------------------------------


class Currency(Base):
    """Household currency with current FX rate to base currency.

    Inherits from Base directly (NOT BaseEntity) — has household_id FK but
    no created_by, archived, status, etc. Exactly one currency per household
    has is_base = true (enforced at application layer).

    Fields:
        id:                UUID primary key.
        household_id:      FK to households.id.
        code:              ISO 4217 code (e.g., "SGD").
        name:              Full name (e.g., "Singapore Dollar").
        symbol:            Display symbol (e.g., "S$").
        is_base:           True for the household's base currency.
        is_display_active: Shown in display switcher.
        rate_to_base:      Current rate to household base currency.
        fee_pct:           Default conversion fee percentage.
        last_rate_at:      When FX rate was last fetched.
        rate_source:       Data source (e.g., "ExchangeRate-API").
    """

    __tablename__ = "currencies"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    household_id: Mapped[UUID] = mapped_column(
        ForeignKey("households.id"), nullable=False, index=True
    )
    code: Mapped[str] = mapped_column(String(3), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    symbol: Mapped[str] = mapped_column(String(5), nullable=False)
    is_base: Mapped[bool] = mapped_column(Boolean, default=False)
    is_display_active: Mapped[bool] = mapped_column(Boolean, default=True)
    rate_to_base: Mapped[Decimal] = mapped_column(Numeric(10, 6), default=1.0)
    fee_pct: Mapped[Decimal] = mapped_column(Numeric(6, 4), default=0)
    last_rate_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    rate_source: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # --- Constraints ---
    __table_args__ = (
        UniqueConstraint("household_id", "code", name="uq_currencies_household_code"),
    )


# ---------------------------------------------------------------------------
# FxRateHistory — historical FX rate records (NOT BaseEntity)
# ---------------------------------------------------------------------------


class FxRateHistory(Base):
    """Historical FX rate snapshot for a currency on a specific date.

    Inherits from Base directly (NOT BaseEntity) — pure child tracking table
    with no household_id or audit fields.

    Fields:
        id:            UUID primary key.
        currency_id:   FK to currencies.id.
        rate_date:     Date of this rate record.
        rate_to_base:  Rate to base currency on this date.
        source:        Data source for this rate.
    """

    __tablename__ = "fx_rate_history"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    currency_id: Mapped[UUID] = mapped_column(
        ForeignKey("currencies.id"), nullable=False
    )
    rate_date: Mapped[date] = mapped_column(Date, nullable=False)
    rate_to_base: Mapped[Decimal] = mapped_column(Numeric(10, 6), nullable=False)
    source: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # --- Constraints ---
    __table_args__ = (
        UniqueConstraint("currency_id", "rate_date", name="uq_fx_rate_currency_date"),
    )
