"""Budget model for spending limits per category/period.

Tracks budget caps with optional rollover and alert thresholds. Actual spent
amounts are computed at query time from FinancialEvent records — this table
only stores the limit configuration.

Models:
    Budget(BaseEntity)  — spending cap per category/period (EDP §8)

References: EDP §8, ARCH §4.4
"""

from datetime import date
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy import (
    Boolean,
    Date,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
)
from sqlalchemy.orm import (
    Mapped,
    mapped_column,
)

from backend.models.base import BaseEntity


# ---------------------------------------------------------------------------
# Budget — spending cap per category/period
# ---------------------------------------------------------------------------


class Budget(BaseEntity):
    """Budget limit configuration for a category and time period.

    Extends BaseEntity for full household audit trail. Actual spent amounts
    are computed at query time from FinancialEvent records — there is NO
    actual_spent column on this model.

    Fields:
        name:              Display name of the budget.
        category_id:       FK to categories.id — which category this budget applies to.
        owner_person_id:   FK to persons.id (nullable) — specific person; null = household-wide.
        period_type:       "monthly" / "yearly".
        limit_currency:    ISO 4217 code for the limit currency.
        limit_amount:      Spending cap in limit_currency.
        limit_amount_base: Spending cap in household base currency.
        period_start:      Start date of the budget period.
        period_end:        End date of the budget period.
        alert_threshold_pct: Warning threshold percentage (default 80).
        rollover:          Unspent balance carries forward (default False).
    """

    __tablename__ = "budgets"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category_id: Mapped[UUID] = mapped_column(
        ForeignKey("categories.id"), nullable=False, index=True
    )
    owner_person_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("persons.id"), nullable=True
    )
    period_type: Mapped[str] = mapped_column(String(20), nullable=False)
    limit_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    limit_amount: Mapped[Decimal] = mapped_column(Numeric(15, 4), nullable=False)
    limit_amount_base: Mapped[Decimal] = mapped_column(Numeric(15, 4), nullable=False)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    alert_threshold_pct: Mapped[int] = mapped_column(Integer, default=80)
    rollover: Mapped[bool] = mapped_column(Boolean, default=False)

    # --- Indexes ---
    __table_args__ = (
        Index("ix_budgets_household_period", "household_id", "period_start", "period_end"),
        Index("ix_budgets_category_period", "category_id", "period_start"),
    )
