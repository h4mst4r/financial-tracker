"""Smoke tests for bootstrap entity models (Household, Person, Session, HouseholdInvitation).

Validates:
- All four models importable from backend.models without circular imports
- Household default values (base_currency, timezone)
- Person inherits BaseEntity columns + has own columns
- Session csrf_token uniqueness
- HouseholdInvitation default status
"""

from uuid import uuid4

from sqlalchemy import inspect


def test_import_all_bootstrap_models() -> None:
    """All four models importable from backend.models without error."""
    from backend.models import Household, HouseholdInvitation, Person, Session

    assert Household is not None
    assert Person is not None
    assert Session is not None
    assert HouseholdInvitation is not None


def test_household_default_values() -> None:
    """Household instantiates with correct default currency and timezone."""
    from backend.models import Household

    hh = Household(name="Test Household")

    assert hh.base_currency == "SGD"
    assert hh.timezone == "Asia/Singapore"


def test_person_inherits_base_entity_columns() -> None:
    """Person table contains both BaseEntity columns and Person-specific columns."""
    from backend.models import Person

    column_names = {c.name for c in Person.__table__.columns}

    # BaseEntity inherited columns
    for col in ("id", "household_id", "created_at", "updated_at", "archived", "status"):
        assert col in column_names, f"Missing BaseEntity column: {col}"

    # Person-specific columns
    for col in ("email", "display_name", "google_sub", "role"):
        assert col in column_names, f"Missing Person column: {col}"


def test_session_csrf_token_unique() -> None:
    """Session.csrf_token has unique=True in the column definition."""
    from backend.models import Session

    csrf_col = inspect(Session).columns["csrf_token"]
    assert csrf_col.unique is True


def test_household_invitation_default_status() -> None:
    """HouseholdInvitation defaults to 'pending' status."""
    from backend.models import HouseholdInvitation

    dummy_uuid = uuid4()
    inv = HouseholdInvitation(
        household_id=dummy_uuid,
        invited_email="invite@example.com",
        invited_by=dummy_uuid,
    )

    assert inv.status == "pending"
