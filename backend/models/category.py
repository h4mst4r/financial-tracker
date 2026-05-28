"""Category model for income/expense classification.

Self-referencing hierarchy with max 2 levels (parent + subcategory).
Categories are used to classify transactions and define budgets.

Models:
    Category(BaseEntity)  — hierarchical category tree (EDP §9)

References: EDP §9, ARCH §4.4
"""

from typing import Optional
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    String,
)
from sqlalchemy.orm import (
    Mapped,
    mapped_column,
)

from backend.models.base import BaseEntity


# ---------------------------------------------------------------------------
# Category — hierarchical classification (max 2 levels)
# ---------------------------------------------------------------------------


class Category(BaseEntity):
    """Hierarchical category for income/expense classification.

    Extends BaseEntity for full household audit trail. Self-referencing FK
    on parent_id enables subcategories with a max depth of 1 (2 levels total).

    Fields:
        name:          Display name (e.g., "Food & Dining").
        color:         Hex color for UI display (e.g., "#4CAF50").
        icon:          Emoji or icon identifier.
        category_type: "income" / "expense" / "both".
        parent_id:     FK to categories.id (self-referencing, nullable).
        depth:         Hierarchy depth — 0 = top-level, 1 = subcategory.
    """

    __tablename__ = "categories"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    color: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)
    icon: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    category_type: Mapped[str] = mapped_column(String(10), nullable=False, default="expense")
    parent_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True
    )
    depth: Mapped[int] = mapped_column(Integer, default=0)

    # --- Constraints & Indexes ---
    __table_args__ = (
        CheckConstraint("depth <= 1", name="ck_category_max_depth"),
        Index("ix_categories_household_parent", "household_id", "parent_id"),
    )
