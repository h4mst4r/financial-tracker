"""Test get_or_404 and DI dependencies (AC: 4).

get_or_404 returns in-scope entity and raises 404 for missing + cross-household ids.
"""

import tempfile
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import String, event
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from backend.dependencies import get_or_404


class _Base(DeclarativeBase):
    pass


class _TestEntity(_Base):
    __tablename__ = "test_entities"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    household_id: Mapped[str] = mapped_column(String(36), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)


@pytest.fixture
async def dep_session():
    """Create a temporary session for dependency tests."""
    tmp_dir = tempfile.mkdtemp()
    db_path = Path(tmp_dir) / "dep_test.db"
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
        yield factory, db_path
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_get_or_404_returns_in_scope_entity():
    """get_or_404 returns entity when id matches and household_id matches."""
    tmp_dir = tempfile.mkdtemp()
    db_path = Path(tmp_dir) / "scope_test.db"
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

        hh_id = str(uuid4())
        entity_id = str(uuid4())

        # Insert test entity
        async with factory() as session:
            entity = _TestEntity(id=entity_id, household_id=hh_id, name="Test")
            session.add(entity)
            await session.commit()

        # Fetch with matching household
        async with factory() as session:
            result = await get_or_404(session, _TestEntity, entity_id, household_id=hh_id)
            assert result.id == entity_id
            assert result.household_id == hh_id

    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_get_or_404_raises_404_for_missing_id():
    """get_or_404 raises 404 when entity doesn't exist."""
    tmp_dir = tempfile.mkdtemp()
    db_path = Path(tmp_dir) / "missing_test.db"
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

        hh_id = str(uuid4())
        missing_id = str(uuid4())

        async with factory() as session:
            with pytest.raises(Exception) as exc_info:
                await get_or_404(session, _TestEntity, missing_id, household_id=hh_id)
            # Should be HTTPException 404
            assert exc_info.value.status_code == 404

    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_get_or_404_raises_404_for_cross_household():
    """get_or_404 raises 404 when entity belongs to another household."""
    tmp_dir = tempfile.mkdtemp()
    db_path = Path(tmp_dir) / "cross_hh_test.db"
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

        hh_a = str(uuid4())
        hh_b = str(uuid4())
        entity_id = str(uuid4())

        # Insert entity in household A
        async with factory() as session:
            entity = _TestEntity(id=entity_id, household_id=hh_a, name="Test")
            session.add(entity)
            await session.commit()

        # Try to fetch from household B
        async with factory() as session:
            with pytest.raises(Exception) as exc_info:
                await get_or_404(session, _TestEntity, entity_id, household_id=hh_b)
            assert exc_info.value.status_code == 404

    finally:
        await engine.dispose()
