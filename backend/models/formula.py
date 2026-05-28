"""Formula model for computation expressions.

Registry of human-readable formula expressions applied to specific entity types.
System formulas (is_system=True) cannot be deleted by users.

Models:
    Formula(BaseEntity)  — computation expression registry (EDP §11)

References: EDP §11, ARCH §4.4
"""

from typing import Optional

from sqlalchemy import (
    Boolean,
    String,
    Text,
)
from sqlalchemy.orm import (
    Mapped,
    mapped_column,
)

from backend.models.base import BaseEntity


# ---------------------------------------------------------------------------
# Formula — computation expression registry
# ---------------------------------------------------------------------------


class Formula(BaseEntity):
    """Human-readable formula expression for computed values.

    Extends BaseEntity for full household audit trail. System formulas
    (is_system=True) are seeded by the application and cannot be deleted.

    Fields:
        name:        Display name (e.g., "Straight-Line Depreciation").
        expression:  Human-readable formula expression.
        applies_to:  Entity type this formula applies to (e.g., "asset").
        is_system:   System default — cannot be deleted by users.
        description: Free-text description of the formula.
    """

    __tablename__ = "formulas"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    expression: Mapped[str] = mapped_column(Text, nullable=False)
    applies_to: Mapped[str] = mapped_column(String(50), nullable=False)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
