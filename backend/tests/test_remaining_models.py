"""Smoke tests for remaining model definitions (BE-006).

Covers Budget, Category, Currency, FxRateHistory, Formula, AuditLog, and Alert.
Verifies inheritance, column presence, constraints, and indexes.
"""

import pytest
from sqlalchemy import inspect
from sqlalchemy.orm import class_mapper

# Models under test
from backend.models import (
    Alert,
    AuditLog,
    Budget,
    Category,
    Currency,
    Formula,
    FxRateHistory,
)
from backend.models.base import BaseEntity


# ============================================================================
# Import smoke tests
# ============================================================================

def test_import_all_remaining_models():
    """All 8 models import successfully from backend.models."""
    from backend.models import (
        Alert,
        AuditLog,
        Budget,
        Category,
        Currency,
        Formula,
        FxRateHistory,
    )
    assert Alert is not None
    assert AuditLog is not None
    assert Budget is not None
    assert Category is not None
    assert Currency is not None
    assert Formula is not None
    assert FxRateHistory is not None


# ============================================================================
# Inheritance verification
# ============================================================================

def test_budget_inherits_base_entity():
    """Budget extends BaseEntity for full audit trail."""
    assert issubclass(Budget, BaseEntity)


def test_category_inherits_base_entity():
    """Category extends BaseEntity for full audit trail."""
    assert issubclass(Category, BaseEntity)


def test_formula_inherits_base_entity():
    """Formula extends BaseEntity for full audit trail."""
    assert issubclass(Formula, BaseEntity)


def test_alert_inherits_base_entity():
    """Alert extends BaseEntity for full audit trail."""
    assert issubclass(Alert, BaseEntity)


def test_currency_inherits_base_not_base_entity():
    """Currency inherits from Base directly (NOT BaseEntity)."""
    from backend.database import Base
    assert issubclass(Currency, Base)
    assert not issubclass(Currency, BaseEntity)


def test_fx_rate_history_inherits_base_not_base_entity():
    """FxRateHistory inherits from Base directly (NOT BaseEntity)."""
    from backend.database import Base
    assert issubclass(FxRateHistory, Base)
    assert not issubclass(FxRateHistory, BaseEntity)


def test_audit_log_inherits_base_not_base_entity():
    """AuditLog inherits from Base directly (NOT BaseEntity)."""
    from backend.database import Base
    assert issubclass(AuditLog, Base)
    assert not issubclass(AuditLog, BaseEntity)


# ============================================================================
# Column presence — Budget
# ============================================================================

def test_budget_has_required_columns():
    """Budget has all expected columns."""
    columns = {c.key for c in class_mapper(Budget).columns}
    expected = {
        "id", "household_id", "created_at", "updated_at", "archived", "status",
        "name", "category_id", "owner_person_id", "period_type",
        "limit_currency", "limit_amount", "limit_amount_base",
        "period_start", "period_end", "alert_threshold_pct", "rollover",
    }
    assert expected.issubset(columns), f"Missing: {expected - columns}"


def test_budget_has_no_actual_spent_column():
    """Budget does NOT have actual_spent — computed at query time."""
    columns = {c.key for c in class_mapper(Budget).columns}
    assert "actual_spent" not in columns


# ============================================================================
# Column presence — Category
# ============================================================================

def test_category_has_required_columns():
    """Category has all expected columns including self-referencing FK."""
    columns = {c.key for c in class_mapper(Category).columns}
    expected = {
        "id", "household_id", "created_at", "updated_at", "archived", "status",
        "name", "color", "icon", "category_type", "parent_id", "depth",
    }
    assert expected.issubset(columns), f"Missing: {expected - columns}"


# ============================================================================
# Column presence — Currency & FxRateHistory
# ============================================================================

def test_currency_has_required_columns():
    """Currency has all expected columns."""
    columns = {c.key for c in class_mapper(Currency).columns}
    expected = {
        "id", "household_id", "code", "name", "symbol", "is_base",
        "is_display_active", "rate_to_base", "fee_pct", "last_rate_at", "rate_source",
    }
    assert expected.issubset(columns), f"Missing: {expected - columns}"


def test_fx_rate_history_has_required_columns():
    """FxRateHistory has all expected columns."""
    columns = {c.key for c in class_mapper(FxRateHistory).columns}
    expected = {"id", "currency_id", "rate_date", "rate_to_base", "source"}
    assert expected.issubset(columns), f"Missing: {expected - columns}"


# ============================================================================
# Column presence — Formula
# ============================================================================

def test_formula_has_required_columns():
    """Formula has all expected columns."""
    columns = {c.key for c in class_mapper(Formula).columns}
    expected = {
        "id", "household_id", "created_at", "updated_at", "archived", "status",
        "name", "expression", "applies_to", "is_system", "description",
    }
    assert expected.issubset(columns), f"Missing: {expected - columns}"


# ============================================================================
# Column presence — AuditLog
# ============================================================================

def test_audit_log_has_required_columns():
    """AuditLog has all expected columns."""
    columns = {c.key for c in class_mapper(AuditLog).columns}
    expected = {
        "id", "household_id", "actor_id", "action", "entity_type", "entity_id",
        "before_state", "after_state", "occurred_at", "ip_address", "user_agent",
    }
    assert expected.issubset(columns), f"Missing: {expected - columns}"


# ============================================================================
# Column presence — Alert
# ============================================================================

def test_alert_has_required_columns():
    """Alert has all expected columns."""
    columns = {c.key for c in class_mapper(Alert).columns}
    expected = {
        "id", "household_id", "created_at", "updated_at", "archived", "status",
        "alert_type", "title", "body", "entity_type", "entity_id",
        "is_read", "read_at",
    }
    assert expected.issubset(columns), f"Missing: {expected - columns}"


# ============================================================================
# Constraints verification
# ============================================================================

def test_category_has_max_depth_constraint():
    """Category has check constraint depth <= 1."""
    constraints = {c.name for c in Category.__table__.constraints if c.name}
    assert "ck_category_max_depth" in constraints


def test_currency_has_unique_household_code_constraint():
    """Currency has unique constraint on (household_id, code)."""
    constraints = {c.name for c in Currency.__table__.constraints if c.name}
    assert "uq_currencies_household_code" in constraints


def test_fx_rate_history_has_unique_currency_date_constraint():
    """FxRateHistory has unique constraint on (currency_id, rate_date)."""
    constraints = {c.name for c in FxRateHistory.__table__.constraints if c.name}
    assert "uq_fx_rate_currency_date" in constraints


# ============================================================================
# Index verification
# ============================================================================

def test_budget_has_compound_indexes():
    """Budget has compound indexes on household+period and category+period."""
    indexes = {idx.name for idx in Budget.__table__.indexes if idx.name}
    assert "ix_budgets_household_period" in indexes
    assert "ix_budgets_category_period" in indexes


def test_audit_log_has_no_fk_constraints():
    """AuditLog has NO foreign key constraints on household_id, actor_id, or entity_id."""
    fks = {col.key for col in AuditLog.__table__.columns if col.foreign_keys}
    assert "household_id" not in fks
    assert "actor_id" not in fks
    assert "entity_id" not in fks


# ============================================================================
# Table name verification
# ============================================================================

def test_all_table_names_correct():
    """All models have correct table names."""
    assert Budget.__tablename__ == "budgets"
    assert Category.__tablename__ == "categories"
    assert Currency.__tablename__ == "currencies"
    assert FxRateHistory.__tablename__ == "fx_rate_history"
    assert Formula.__tablename__ == "formulas"
    assert AuditLog.__tablename__ == "audit_logs"
    assert Alert.__tablename__ == "alerts"
