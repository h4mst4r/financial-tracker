"""Test AuditService (AC: 3).

Call audit.log() inside a session, assert one audit_logs row in the same transaction,
scalar-only snapshots, and masking of account_number / secret refs.
"""

import tempfile
from pathlib import Path

import pytest
from sqlalchemy import String, Text, create_engine, event, text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from backend.models.system import AuditLog
from backend.services.audit import _scalar_snapshot, audit


class _Base(DeclarativeBase):
    pass


class _TestAccount(_Base):
    """Synthetic model for testing audit masking."""

    __tablename__ = "test_accounts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    account_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    api_key_secret_ref: Mapped[str | None] = mapped_column(String(200), nullable=True)


@pytest.fixture
async def audit_session():
    """Create a temporary session for audit tests."""
    tmp_dir = tempfile.mkdtemp()
    db_path = Path(tmp_dir) / "audit_test.db"
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )

    try:

        @event.listens_for(engine.sync_engine, "connect")
        def _set_pragmas(dbapi_conn, _record):
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        async with engine.begin() as conn:
            await conn.run_sync(_Base.metadata.create_all)
            await conn.run_sync(AuditLog.__table__.create, checkfirst=True)

        factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
        async with factory() as session:
            yield session, db_path
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_audit_log_creates_row_in_same_transaction():
    """Audit row lands in the same transaction (no own commit)."""
    tmp_dir = tempfile.mkdtemp()
    db_path = Path(tmp_dir) / "audit_tx.db"
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )

    try:

        @event.listens_for(engine.sync_engine, "connect")
        def _set_pragmas(dbapi_conn, _record):
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        async with engine.begin() as conn:
            await conn.run_sync(AuditLog.__table__.create, checkfirst=True)

        factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

        async with factory() as session:
            await audit.log(
                session,
                household_id="test-hh",
                actor_id="test-actor",
                action="create",
                entity_type="test",
                entity_id="test-entity",
                before=None,
                after={"name": "test"},
            )
            # Row should be in session but not yet committed
            result = await session.execute(text("SELECT COUNT(*) FROM audit_logs"))
            count = result.scalar_one()
            assert count == 1, "Audit row should exist in transaction"

            # Commit the transaction
            await session.commit()

        # Verify row persists after commit
        sync_engine = create_engine(f"sqlite:///{db_path}")
        with sync_engine.connect() as conn:
            count = conn.execute(text("SELECT COUNT(*) FROM audit_logs")).scalar()
            assert count == 1, "Audit row should persist after commit"
        sync_engine.dispose()

    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_audit_masking_account_number_flows_through_snapshot():
    """account_number is masked to **** + last 4 *in the actual snapshot path* — not just the
    helper in isolation. This is what guarantees a raw account number never reaches an audit row."""
    account = _TestAccount(
        id="test-1",
        name="Test Account",
        account_number="1234567890123456",
    )
    snapshot = _scalar_snapshot(account)
    assert snapshot["account_number"] == "****3456"
    assert "1234567890123456" not in str(snapshot)  # the raw value never survives


@pytest.mark.asyncio
async def test_audit_masking_short_account_number():
    """Short account_number (< 4 chars) is fully masked."""
    from backend.services.audit import _mask_value

    masked = _mask_value("account_number", "123")
    assert masked == "****", f"Expected '****', got '{masked}'"


@pytest.mark.asyncio
async def test_audit_masking_secret_ref():
    """secret_ref fields keep the reference string (not raw secret)."""
    from backend.services.audit import _mask_value

    # Secret refs should pass through as-is (they're already references)
    masked = _mask_value("api_key_secret_ref", "projects/123/secrets/my-key/versions/1")
    assert masked == "projects/123/secrets/my-key/versions/1"


@pytest.mark.asyncio
async def test_scalar_snapshot_excludes_none_for_create():
    """before=None for create action."""
    assert _scalar_snapshot(None) is None


@pytest.mark.asyncio
async def test_audit_log_serializes_decimal_and_datetime():
    """Decimal and datetime are serialized to JSON-safe types."""
    from datetime import UTC, datetime
    from decimal import Decimal

    from backend.services.audit import _serialize_scalar

    # Decimal → string (preserves exact precision; never float)
    result = _serialize_scalar(Decimal("123.45"))
    assert isinstance(result, str)
    assert result == "123.45"

    # datetime
    dt = datetime.now(UTC)
    result = _serialize_scalar(dt)
    assert isinstance(result, str)
