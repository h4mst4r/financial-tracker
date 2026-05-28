"""Smoke tests for MonetaryValueMixin imports and fx_delta computation.

These are pure Python tests — no database session required since the
@validates decorator fires on attribute assignment in-memory.

The _TestEntity class is a minimal SQLAlchemy-mapped model that mixes in
MonetaryValueMixin so the mapper registry is properly configured.
"""

from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base
from backend.models import MonetaryValueMixin


# ---------------------------------------------------------------------------
# Minimal test entity — inherits from Base + MonetaryValueMixin
# ---------------------------------------------------------------------------


class _TestEntity(Base, MonetaryValueMixin):  # type: ignore[misc]
    """Concrete test entity for in-memory fx_delta validation.

    This is a proper SQLAlchemy mapped class so @validates fires correctly.
    We only need id (from Base) + the 7 monetary columns from the mixin.
    """

    __tablename__ = "test_entities"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)


@pytest.mark.smoke
def test_import_monetary_value_mixin() -> None:
    """Importing MonetaryValueMixin should not raise."""
    assert MonetaryValueMixin is not None


@pytest.mark.smoke
def test_import_base_entity() -> None:
    """Importing BaseEntity should not raise."""
    from backend.models import BaseEntity

    assert BaseEntity is not None


@pytest.mark.smoke
def test_import_status_enum() -> None:
    """Importing StatusEnum should not raise and have correct values."""
    from backend.models import StatusEnum

    assert StatusEnum.active.value == "active"
    assert StatusEnum.inactive.value == "inactive"
    assert StatusEnum.archived.value == "archived"


@pytest.mark.unit
def test_fx_delta_computation() -> None:
    """fx_delta should be auto-computed when amount_base is set.

    Given amount_base_calculated = 100.50 and amount_base = 99.00,
    fx_delta should equal 1.50 (forex loss).
    """
    entity = _TestEntity()
    entity.currency = "SGD"
    entity.amount = Decimal("100.00")
    entity.fx_rate = Decimal("1.005")
    entity.amount_base_calculated = Decimal("100.50")
    entity.fee_amount = None

    # Setting amount_base should trigger fx_delta computation
    entity.amount_base = Decimal("99.00")

    assert entity.fx_delta == Decimal("1.50")


@pytest.mark.unit
def test_fx_delta_zero_when_no_override() -> None:
    """fx_delta should be 0 when amount_base equals amount_base_calculated."""
    entity = _TestEntity()
    entity.currency = "SGD"
    entity.amount = Decimal("100.00")
    entity.fx_rate = Decimal("1.00")
    entity.amount_base_calculated = Decimal("100.00")
    entity.fee_amount = None

    entity.amount_base = Decimal("100.00")

    assert entity.fx_delta == Decimal("0.00")


@pytest.mark.unit
def test_fx_delta_negative_when_user_gained() -> None:
    """fx_delta can be negative when the user got a better rate than the API."""
    entity = _TestEntity()
    entity.currency = "NZD"
    entity.amount = Decimal("200.00")
    entity.fx_rate = Decimal("0.85")
    entity.amount_base_calculated = Decimal("170.00")
    entity.fee_amount = None

    # User's bank gave a better rate — amount_base is higher
    entity.amount_base = Decimal("172.00")

    assert entity.fx_delta == Decimal("-2.00")
