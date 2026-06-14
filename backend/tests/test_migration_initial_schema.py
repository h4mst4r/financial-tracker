"""Round-trip + idempotency test for the 0001_initial_schema migration (AC 8).

Runs Alembic programmatically against a throwaway file DB, then introspects the
resulting schema to verify:
- All 19 tables exist
- BaseEntity tables carry the 10 §3.1 audit columns
- STI discriminators are present (account_type, event_type)
- CHECK constraints are rendered (depth <= 1, shared_expense_outflow_only)
- persons.household_id and persons.created_by are nullable
- audit_logs has zero foreign keys
- Idempotent teardown: downgrade(base) leaves zero app tables
"""

import contextlib
from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import create_engine, inspect

from alembic import command

EXPECTED_TABLES = {
    # Identity & Access (§3.4)
    "households",
    "persons",
    "sessions",
    "household_invitations",
    "approved_owners",
    # Accounts (§3.5)
    "accounts",
    "account_owners",
    "account_snapshots",
    # Events (§3.6)
    "financial_events",
    "occurrence_records",
    # Budgets & Categories (§3.7)
    "budgets",
    "categories",
    # Currencies & Formulas (§3.8)
    "currencies",
    "fx_rate_history",
    "fx_providers",
    "formulas",
    # System (§3.9)
    "alerts",
    "audit_logs",
    "entity_preferences",
}

BASE_ENTITY_COLUMNS = {
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
}


def _sync_url(cfg) -> str:
    """Convert aiosqlite URL to sync sqlite URL for introspection."""
    return cfg.get_main_option("sqlalchemy.url").replace("sqlite+aiosqlite:///", "sqlite:///")


@pytest.fixture
def migration_cfg(tmp_path: Path):
    """Alembic Config pointing at a throwaway SQLite file (async driver)."""
    db_file = tmp_path / "test.db"
    cfg = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    # Use aiosqlite because env.py builds an AsyncEngine
    cfg.set_main_option("sqlalchemy.url", f"sqlite+aiosqlite:///{db_file}")
    return cfg


def _upgrade(cfg) -> None:
    command.upgrade(cfg, "head")


def _downgrade(cfg) -> None:
    command.downgrade(cfg, "base")


@contextlib.contextmanager
def _inspector(cfg):
    """Return a sync inspector for the migrated DB."""
    engine = create_engine(_sync_url(cfg))
    try:
        yield inspect(engine)
    finally:
        engine.dispose()


def test_migration_creates_all_19_tables(migration_cfg) -> None:
    _upgrade(migration_cfg)
    with _inspector(migration_cfg) as inspector:
        tables = set(inspector.get_table_names()) - {"alembic_version"}
        assert tables == EXPECTED_TABLES, (
            f"Missing: {EXPECTED_TABLES - tables}, Extra: {tables - EXPECTED_TABLES}"
        )


def test_base_entity_columns_present(migration_cfg) -> None:
    """Verify a BaseEntity table (accounts) has all 10 §3.1 columns."""
    _upgrade(migration_cfg)
    with _inspector(migration_cfg) as inspector:
        columns = {c["name"] for c in inspector.get_columns("accounts")}
        assert BASE_ENTITY_COLUMNS.issubset(columns), (
            f"Missing BaseEntity columns on accounts: {BASE_ENTITY_COLUMNS - columns}"
        )


def test_persons_nullable_override(migration_cfg) -> None:
    """persons.household_id and persons.created_by must be nullable."""
    _upgrade(migration_cfg)
    with _inspector(migration_cfg) as inspector:
        columns = {c["name"]: c for c in inspector.get_columns("persons")}
        assert columns["household_id"]["nullable"] is True
        assert columns["created_by"]["nullable"] is True


def test_sti_discriminators_present(migration_cfg) -> None:
    """accounts has account_type, financial_events has event_type."""
    _upgrade(migration_cfg)
    with _inspector(migration_cfg) as inspector:
        account_cols = {c["name"] for c in inspector.get_columns("accounts")}
        assert "account_type" in account_cols

        event_cols = {c["name"] for c in inspector.get_columns("financial_events")}
        assert "event_type" in event_cols


def test_check_constraints_rendered(migration_cfg) -> None:
    """Both CHECK constraints (depth <= 1, shared_expense) exist."""
    _upgrade(migration_cfg)
    with _inspector(migration_cfg) as inspector:
        # categories: ck_categories_depth_max_1
        cat_checks = {c["name"] for c in inspector.get_check_constraints("categories")}
        assert "ck_categories_depth_max_1" in cat_checks, (
            f"Missing depth CHECK, found: {cat_checks}"
        )

        # financial_events: ck_shared_expense_outflow_only
        fe_checks = {c["name"] for c in inspector.get_check_constraints("financial_events")}
        assert "ck_shared_expense_outflow_only" in fe_checks, (
            f"Missing shared_expense CHECK, found: {fe_checks}"
        )


def test_audit_logs_has_no_foreign_keys(migration_cfg) -> None:
    """audit_logs survives entity/actor deletion — no FKs."""
    _upgrade(migration_cfg)
    with _inspector(migration_cfg) as inspector:
        fks = inspector.get_foreign_keys("audit_logs")
        assert len(fks) == 0, f"audit_logs should have no FKs, found: {fks}"


def test_financial_events_has_money_columns(migration_cfg) -> None:
    """financial_events has MonetaryValueMixin columns (amount, currency, etc.)."""
    _upgrade(migration_cfg)
    with _inspector(migration_cfg) as inspector:
        columns = {c["name"] for c in inspector.get_columns("financial_events")}
        money_cols = {"amount", "currency", "fx_rate", "amount_base"}
        assert money_cols.issubset(columns), f"Missing money columns: {money_cols - columns}"


def test_downgrade_removes_all_tables(migration_cfg) -> None:
    """Idempotent teardown: downgrade(base) leaves zero app tables."""
    _upgrade(migration_cfg)
    _downgrade(migration_cfg)

    engine = create_engine(_sync_url(migration_cfg))
    try:
        inspector = inspect(engine)
        tables = set(inspector.get_table_names()) - {"alembic_version"}
        assert len(tables) == 0, f"Tables remaining after downgrade: {tables}"
    finally:
        engine.dispose()
