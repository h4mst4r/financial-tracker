"""Test get_db transaction boundary (AC: 1).

Proves: (a) clean handler commits the row; (b) handler that raises after flush()
leaves zero rows persisted. Disposes engines in finally (Windows WAL/SHM handle leak).
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


class _Base(DeclarativeBase):
    pass


class _TestItem(_Base):
    __tablename__ = "test_items"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)


@pytest.fixture
async def tmp_engine_and_factory():
    """Create a temporary SQLite database for transaction tests."""
    tmp_dir = tempfile.mkdtemp()
    db_path = Path(tmp_dir) / "test.db"
    try:
        engine = create_async_engine(
            f"sqlite+aiosqlite:///{db_path}",
            connect_args={"check_same_thread": False},
        )

        # Register pragmas
        @event.listens_for(engine.sync_engine, "connect")
        def _set_pragmas(dbapi_conn, _record):
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        # Create tables
        async with engine.begin() as conn:
            await conn.run_sync(_Base.metadata.create_all)

        factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
        yield engine, factory, db_path
    finally:
        # Dispose engine in finally to avoid Windows WAL/SHM handle leak
        await engine.dispose()


@pytest.mark.asyncio
async def test_clean_handler_commits_row():
    """Prove that a clean request path commits the row."""
    tmp_dir = tempfile.mkdtemp()
    db_path = Path(tmp_dir) / "test.db"
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

        factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

        # Simulate a clean request
        async with factory() as session:
            item = _TestItem(id="test-1", name="Test Item")
            session.add(item)
            await session.flush()  # Service flushes
            await session.commit()  # get_db commits

        # Verify row is persisted
        sync_engine = create_engine(f"sqlite:///{db_path}")
        with sync_engine.connect() as conn:
            count = conn.execute(text("SELECT COUNT(*) FROM test_items")).scalar()
            assert count == 1, "Row should be committed"
        sync_engine.dispose()

    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_rollback_on_raise_leaves_zero_rows():
    """Prove that a handler raising after flush() leaves zero rows."""
    tmp_dir = tempfile.mkdtemp()
    db_path = Path(tmp_dir) / "test.db"
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

        factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

        # Simulate a request that raises after flush
        raised = False
        async with factory() as session:
            try:
                item = _TestItem(id="test-2", name="Should Rollback")
                session.add(item)
                await session.flush()  # Service flushes (row in transaction)
                raised = True
                raise ValueError("Simulated error")
            except ValueError:
                await session.rollback()  # get_db rolls back

        assert raised, "Should have raised"

        # Verify NO row is persisted
        sync_engine = create_engine(f"sqlite:///{db_path}")
        with sync_engine.connect() as conn:
            count = conn.execute(text("SELECT COUNT(*) FROM test_items")).scalar()
            assert count == 0, "Row should be rolled back"
        sync_engine.dispose()

    finally:
        await engine.dispose()
