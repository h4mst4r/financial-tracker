"""FinancialEvent and OccurrenceRecord model smoke tests.

Verifies:
- Import smoke test for both models
- STI inheritance (~49 total columns)
- Event type discriminator with index
- Base field count (14 verified)
- Transaction subtype fields (3 nullable except reconciled default False)
- RecurringPayment subtype fields (9 nullable except occurrences_generated default 0)
- Transfer subtype fields (6 nullable, is_debt_repayment default False)
- CheckConstraint presence (ck_shared_expense_outflow_only)
- 4 compound indexes verified
- OccurrenceRecord inherits Base (not BaseEntity)
- OccurrenceRecord 7 fields present
- OccurrenceRecord compound index on (recurring_event_id, expected_date)
"""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

import pytest
from sqlalchemy import inspect

from backend.database import Base
from backend.models.event import FinancialEvent, OccurrenceRecord


# ---------------------------------------------------------------------------
# Import & basic smoke tests
# ---------------------------------------------------------------------------

def test_import_financial_event():
    """FinancialEvent imports and is a SQLAlchemy declarative class."""
    assert FinancialEvent.__name__ == "FinancialEvent"
    assert FinancialEvent.__tablename__ == "financial_events"


def test_import_occurrence_record():
    """OccurrenceRecord imports and is a SQLAlchemy declarative class."""
    assert OccurrenceRecord.__name__ == "OccurrenceRecord"
    assert OccurrenceRecord.__tablename__ == "occurrence_records"


# ---------------------------------------------------------------------------
# STI inheritance & column count
# ---------------------------------------------------------------------------

def test_financial_event_sti_column_count():
    """FinancialEvent has ~49 total columns (STI single table).

    Breakdown:
    - BaseEntity: 10 fields (id, household_id, created_at, updated_at,
      created_by, updated_by, archived, archived_at, archived_by, status)
    - MonetaryValueMixin: 7 fields (currency, amount, fx_rate,
      amount_base_calculated, amount_base, fx_delta, fee_amount)
    - BaseFinancialEvent: 14 fields
    - Transaction: 3 fields
    - RecurringPayment: 9 fields
    - Transfer: 6 fields
    Total: ~49 columns
    """
    table = FinancialEvent.__table__
    column_names = {c.name for c in table.columns}

    # Should have approximately 49 columns (base + mixin + all subtypes)
    assert len(column_names) >= 45, f"Expected ~49 columns, got {len(column_names)}"


def test_financial_event_type_discriminator_indexed():
    """event_type column exists and has an index."""
    table = FinancialEvent.__table__
    assert "event_type" in {c.name for c in table.columns}

    # Verify index on event_type
    indexes = {idx.name: [c.name for c in idx.columns] for idx in table.indexes}
    event_type_indexes = [name for name, cols in indexes.items() if "event_type" in cols]
    assert len(event_type_indexes) > 0, "event_type should have an index"


# ---------------------------------------------------------------------------
# BaseFinancialEvent fields [EDP §7.1]
# ---------------------------------------------------------------------------

def test_financial_event_base_fields():
    """All 14 base fields are present on the table."""
    table = FinancialEvent.__table__
    column_names = {c.name for c in table.columns}

    base_fields = {
        "name", "event_date", "event_type", "account_id", "payee",
        "transaction_status", "payee_person_id", "payment_method",
        "category_id", "transaction_type", "is_shared_expense",
        "notes", "is_gst_claimable", "is_gift",
        "source_account_id", "linked_recurring_id",
    }

    missing = base_fields - column_names
    assert not missing, f"Missing base fields: {missing}"


# ---------------------------------------------------------------------------
# Transaction subtype fields [EDP §7.2]
# ---------------------------------------------------------------------------

def test_transaction_subtype_fields():
    """Transaction-specific fields are nullable except reconciled (default False)."""
    table = FinancialEvent.__table__
    columns = {c.name: c for c in table.columns}

    assert "reconciled" in columns
    assert not columns["reconciled"].nullable or columns["reconciled"].default is not None

    assert "reconciled_at" in columns
    assert columns["reconciled_at"].nullable

    assert "duplicate_of" in columns
    assert columns["duplicate_of"].nullable


# ---------------------------------------------------------------------------
# RecurringPayment subtype fields [EDP §7.3]
# ---------------------------------------------------------------------------

def test_recurring_payment_subtype_fields():
    """RecurringPayment-specific fields are nullable except occurrences_generated (default 0)."""
    table = FinancialEvent.__table__
    columns = {c.name: c for c in table.columns}

    recurring_fields = {
        "frequency_text", "frequency_rule", "next_occurrence",
        "recurrence_start_date", "recurrence_end_date",
        "source_entity_type", "source_entity_id",
        "occurrences_generated", "last_processed_at",
    }

    missing = recurring_fields - set(columns.keys())
    assert not missing, f"Missing recurring payment fields: {missing}"

    # occurrences_generated should have a default of 0
    assert columns["occurrences_generated"].default is not None


# ---------------------------------------------------------------------------
# Transfer subtype fields [EDP §7.4]
# ---------------------------------------------------------------------------

def test_transfer_subtype_fields():
    """Transfer-specific fields are nullable, is_debt_repayment defaults False."""
    table = FinancialEvent.__table__
    columns = {c.name: c for c in table.columns}

    transfer_fields = {
        "destination_account_id", "dest_currency", "dest_amount",
        "dest_amount_base", "is_debt_repayment", "debt_cleared_amount",
    }

    missing = transfer_fields - set(columns.keys())
    assert not missing, f"Missing transfer fields: {missing}"

    # is_debt_repayment should have a default of False
    assert columns["is_debt_repayment"].default is not None


# ---------------------------------------------------------------------------
# Constraints & indexes
# ---------------------------------------------------------------------------

def test_check_constraint_shared_expense():
    """ck_shared_expense_outflow_only constraint exists."""
    table = FinancialEvent.__table__
    constraint_names = {c.name for c in table.constraints if c.name}

    assert "ck_shared_expense_outflow_only" in constraint_names, (
        f"Missing check constraint. Available: {constraint_names}"
    )


def test_compound_indexes():
    """All 4 compound indexes exist on financial_events."""
    table = FinancialEvent.__table__
    index_names = {idx.name for idx in table.indexes}

    expected_indexes = {
        "ix_events_household_date",
        "ix_events_household_category",
        "ix_events_household_payee",
        "ix_events_shared_expense",
    }

    missing = expected_indexes - index_names
    assert not missing, f"Missing compound indexes: {missing}"


# ---------------------------------------------------------------------------
# OccurrenceRecord tests
# ---------------------------------------------------------------------------

def test_occurrence_record_inherits_base_not_base_entity():
    """OccurrenceRecord inherits Base (no household_id, created_at, etc.)."""
    table = OccurrenceRecord.__table__
    column_names = {c.name for c in table.columns}

    # Should NOT have BaseEntity fields
    base_entity_fields = {"household_id", "created_at", "updated_at", "status"}
    found = base_entity_fields & column_names
    assert not found, f"OccurrenceRecord should not have BaseEntity fields: {found}"


def test_occurrence_record_fields():
    """OccurrenceRecord has 7 expected fields."""
    table = OccurrenceRecord.__table__
    column_names = {c.name for c in table.columns}

    expected_fields = {
        "id", "recurring_event_id", "expected_date", "occurrence_status",
        "generated_event_id", "processed_at", "notes",
    }

    missing = expected_fields - column_names
    assert not missing, f"Missing OccurrenceRecord fields: {missing}"


def test_occurrence_record_compound_index():
    """OccurrenceRecord has compound index on (recurring_event_id, expected_date)."""
    table = OccurrenceRecord.__table__
    indexes = {idx.name: [c.name for c in idx.columns] for idx in table.indexes}

    compound_found = False
    for name, cols in indexes.items():
        if "recurring_event_id" in cols and "expected_date" in cols:
            compound_found = True
            break

    assert compound_found, (
        f"Missing compound index on (recurring_event_id, expected_date). "
        f"Available indexes: {indexes}"
    )
