"""Budget and Category models (ARCH §3.7).

`Category` uses a self-referential FK with `ondelete="SET NULL"` and a CHECK constraint
limiting depth to 1.
"""

from datetime import date
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column

from backend.models.base import BaseEntity


class Budget(BaseEntity):
    """Budget — household or personal budget periods."""

    __tablename__ = "budgets"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("categories.id"), nullable=True
    )
    owner_person_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("persons.id"), nullable=True
    )
    period_type: Mapped[str] = mapped_column(String(20), nullable=False)
    limit_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    limit_amount: Mapped[Decimal] = mapped_column(Numeric(15, 4), nullable=False)
    limit_amount_base: Mapped[Decimal] = mapped_column(Numeric(15, 4), nullable=False)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    alert_threshold_pct: Mapped[int] = mapped_column(Integer, nullable=False, default=80)
    rollover: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    __table_args__ = (
        Index(
            "ix_budgets_household_id_period_start_end", "household_id", "period_start", "period_end"
        ),
        Index("ix_budgets_category_id_period_start", "category_id", "period_start"),
    )


class Category(BaseEntity):
    """Category — two-level hierarchy (depth <= 1).

    Self-referential `parent_id` FK with `ondelete="SET NULL"`.
    CHECK constraint enforces depth <= 1.
    """

    __tablename__ = "categories"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    color: Mapped[str] = mapped_column(String(7), nullable=False)
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)
    category_type: Mapped[str] = mapped_column(String(10), nullable=False, default="expense")
    parent_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("categories.id", ondelete="SET NULL"),
        nullable=True,
    )
    depth: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    __table_args__ = (
        CheckConstraint("depth <= 1", name="ck_categories_depth_max_1"),
        Index("ix_categories_household_id_parent_id", "household_id", "parent_id"),
    )
