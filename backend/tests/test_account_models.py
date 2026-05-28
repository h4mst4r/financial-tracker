"""Smoke tests for Account STI model and related tables."""

from datetime import date
from decimal import Decimal

from backend.models import (
    Account,
    AccountOwner,
    RecurringConfig,
    ValuationRecord,
)


def test_import_all_account_models():
    """All four account models importable from backend.models without error."""
    assert Account is not None
    assert AccountOwner is not None
    assert ValuationRecord is not None
    assert RecurringConfig is not None


def test_account_inherits_mixin_and_entity_columns():
    """Account has ~39 columns: 5 base + 17 subtype + 7 mixin + 10 entity."""
    columns = Account.__table__.columns
    column_names = {c.name for c in columns}

    # Base account fields (5)
    for field in ("name", "account_type", "institution", "month_year", "notes"):
        assert field in column_names, f"Missing base field: {field}"

    # MonetaryValueMixin fields (7)
    for field in (
        "currency",
        "amount",
        "fx_rate",
        "amount_base_calculated",
        "amount_base",
        "fx_delta",
        "fee_amount",
    ):
        assert field in column_names, f"Missing mixin field: {field}"

    # BaseEntity fields (10)
    for field in (
        "id",
        "household_id",
        "created_at",
        "updated_at",
        "created_by",
        "updated_by",
        "archived",
        "archived_at",
        "archived_by",
        "status",
    ):
        assert field in column_names, f"Missing entity field: {field}"

    # Subtype fields (17)
    subtype_fields = [
        "account_number",
        "interest_rate",
        "interest_frequency",
        "credit_limit",
        "billing_day",
        "due_day",
        "reward_points",
        "annual_fee",
        "investment_type",
        "cost_basis",
        "current_value",
        "asset_type",
        "purchase_date",
        "purchase_value",
        "depreciation_formula_id",
        "policy_type",
        "coverage_types",
        "premium_frequency",
        "coverage_amount",
        "insurer",
    ]
    for field in subtype_fields:
        assert field in column_names, f"Missing subtype field: {field}"

    # Total should be at least 39 (5 + 7 + 10 + 17)
    assert len(column_names) >= 39, f"Expected >= 39 columns, got {len(column_names)}"


def test_account_type_has_index():
    """Account.account_type column has an index."""
    col = Account.__table__.columns.account_type
    assert col.index, "account_type should be indexed"


def test_account_compound_index_household_type():
    """Account has compound index on (household_id, account_type)."""
    indexes = {idx.name for idx in Account.__table__.indexes}
    assert "ix_accounts_household_type" in indexes, (
        f"Missing compound index ix_accounts_household_type. Found: {indexes}"
    )


def test_account_owner_composite_primary_key():
    """AccountOwner has composite primary key (account_id, person_id)."""
    pk_cols = [c.name for c in AccountOwner.__table__.primary_key]
    assert "account_id" in pk_cols, "account_id should be in composite PK"
    assert "person_id" in pk_cols, "person_id should be in composite PK"
    assert len(pk_cols) == 2, f"Expected 2 PK columns, got {len(pk_cols)}"


def test_valuation_record_extends_base_entity():
    """ValuationRecord inherits BaseEntity fields (id, household_id, etc.)."""
    columns = {c.name for c in ValuationRecord.__table__.columns}

    for field in ("id", "household_id", "created_at", "updated_at", "status"):
        assert field in columns, f"ValuationRecord missing BaseEntity field: {field}"


def test_recurring_config_account_id_unique():
    """RecurringConfig.account_id has unique constraint (one config per account)."""
    col = RecurringConfig.__table__.columns.account_id
    assert col.unique, "account_id should be unique in recurring_configs"


def test_account_owners_relationship_cascade():
    """Account.owners relationship has cascade='all, delete-orphan'."""
    rel = Account.owners.property
    # Check cascade contains delete and delete-orphan
    cascade_args = {str(c) for c in rel.cascade}
    assert "delete" in cascade_args, "owners relationship should cascade delete"
    assert "delete-orphan" in cascade_args, (
        "owners relationship should cascade delete-orphan"
    )


def test_account_recurring_config_uselist_false():
    """Account.recurring_config relationship has uselist=False (single object)."""
    rel = Account.recurring_config.property
    assert not rel.uselist, (
        "recurring_config should be a single object (uselist=False), not a list"
    )


def test_valuation_record_compound_index():
    """ValuationRecord has compound index on (asset_id, valuation_date)."""
    indexes = {idx.name for idx in ValuationRecord.__table__.indexes}
    assert "ix_valuations_asset_date" in indexes, (
        f"Missing compound index ix_valuations_asset_date. Found: {indexes}"
    )


def test_account_instantiation_with_required_fields():
    """Account can be instantiated with required fields."""
    account = Account(
        name="Test Account",
        account_type="bank",
        currency="SGD",
        amount=Decimal("1000.00"),
        fx_rate=Decimal("1.0"),
        amount_base_calculated=Decimal("1000.00"),
        amount_base=Decimal("1000.00"),
    )
    assert account.name == "Test Account"
    assert account.account_type == "bank"
    assert account.currency == "SGD"
    # Note: archived defaults to None at Python level (server_default applies at INSERT time)


def test_account_subtype_fields_nullable():
    """All subtype-specific fields are nullable (STI pattern)."""
    from uuid import uuid4

    account = Account(
        name="Bank Only",
        account_type="bank",
        currency="SGD",
        amount=Decimal("100.00"),
        fx_rate=Decimal("1.0"),
        amount_base_calculated=Decimal("100.00"),
        amount_base=Decimal("100.00"),
    )
    # CreditCard fields should be None for a bank account
    assert account.credit_limit is None
    assert account.billing_day is None
    # Asset fields should be None
    assert account.asset_type is None
    assert account.purchase_date is None


def test_valuation_record_required_fields():
    """ValuationRecord can be instantiated with required fields."""
    from uuid import uuid4

    record = ValuationRecord(
        asset_id=uuid4(),
        valuation_date=date(2026, 5, 28),
        value=Decimal("500000.00"),
        value_currency="SGD",
        value_base=Decimal("500000.00"),
        source="manual",
    )
    assert record.valuation_date == date(2026, 5, 28)
    assert record.value == Decimal("500000.00")
    assert record.source == "manual"


def test_recurring_config_defaults():
    """RecurringConfig can be instantiated with required fields."""
    from uuid import uuid4

    config = RecurringConfig(
        account_id=uuid4(),
        frequency_text="1st of every month",
        frequency_rule='{"freq": "monthly", "byweekday": 1}',
    )
    assert config.frequency_text == "1st of every month"
    # Note: enabled defaults to None at Python level (server_default applies at INSERT time)


def test_account_owner_fields():
    """AccountOwner has all expected fields."""
    columns = {c.name for c in AccountOwner.__table__.columns}
    assert "account_id" in columns
    assert "person_id" in columns
    assert "is_primary" in columns
    assert "added_at" in columns


def test_account_owner_inherits_base_not_base_entity():
    """AccountOwner inherits from Base directly (not BaseEntity)."""
    # Should NOT have BaseEntity fields like household_id, created_by, etc.
    columns = {c.name for c in AccountOwner.__table__.columns}
    assert "household_id" not in columns, (
        "AccountOwner should NOT inherit BaseEntity (no household_id)"
    )
    assert "created_by" not in columns, (
        "AccountOwner should NOT inherit BaseEntity (no created_by)"
    )


def test_account_owner_person_relationship_exists():
    """AccountOwner has a 'person' relationship (no back_populates on Person side)."""
    rels = {key for key in AccountOwner.__mapper__.relationships.keys()}
    assert "person" in rels, "AccountOwner should have 'person' relationship"
    assert "account" in rels, "AccountOwner should have 'account' relationship"


def test_valuation_record_source_field():
    """ValuationRecord.source is a required string field."""
    col = ValuationRecord.__table__.columns.source
    assert not col.nullable, "source should be non-nullable"


def test_recurring_config_frequency_fields():
    """RecurringConfig has both frequency_text and frequency_rule."""
    columns = {c.name for c in RecurringConfig.__table__.columns}
    assert "frequency_text" in columns
    assert "frequency_rule" in columns


def test_account_valuation_records_cascade():
    """Account.valuation_records relationship has cascade='all, delete-orphan'."""
    rel = Account.valuation_records.property
    cascade_args = {str(c) for c in rel.cascade}
    assert "delete" in cascade_args
    assert "delete-orphan" in cascade_args


def test_account_recurring_config_cascade():
    """Account.recurring_config relationship has cascade='all, delete-orphan'."""
    rel = Account.recurring_config.property
    cascade_args = {str(c) for c in rel.cascade}
    assert "delete" in cascade_args
    assert "delete-orphan" in cascade_args


def test_account_fx_delta_validator_inherited():
    """Account inherits fx_delta auto-computation from MonetaryValueMixin."""
    from uuid import uuid4

    account = Account(
        name="FX Test",
        account_type="bank",
        currency="USD",
        amount=Decimal("100.00"),
        fx_rate=Decimal("1.35"),
        amount_base_calculated=Decimal("135.00"),
        amount_base=Decimal("130.00"),  # User override — bank charged less
    )
    # fx_delta = amount_base_calculated - amount_base = 135 - 130 = 5
    assert account.fx_delta == Decimal("5.00"), (
        f"Expected fx_delta=5.00, got {account.fx_delta}"
    )


def test_account_table_name():
    """Account uses correct table name."""
    assert Account.__tablename__ == "accounts"


def test_account_owner_table_name():
    """AccountOwner uses correct table name."""
    assert AccountOwner.__tablename__ == "account_owners"


def test_valuation_record_table_name():
    """ValuationRecord uses correct table name."""
    assert ValuationRecord.__tablename__ == "valuation_records"


def test_recurring_config_table_name():
    """RecurringConfig uses correct table name."""
    assert RecurringConfig.__tablename__ == "recurring_configs"
