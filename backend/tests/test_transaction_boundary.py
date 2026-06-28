"""The real `get_db` request boundary (ARCH §4.3).

Drives `backend.database.get_db` itself — monkeypatching its module-global `async_session_factory`
onto a throwaway file DB — and proves the two behaviours services rely on:
  (a) clean resumption past the `yield` commits the row;
  (b) an exception thrown into the generator rolls back, leaving zero rows.

(The integration suites all *override* `get_db`, so this is the only coverage of the production
boundary.) Disposes the engine in `finally` (Windows WAL/SHM handle leak).
"""

import tempfile
from pathlib import Path

import pytest
from sqlalchemy import String, create_engine, event, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

import backend.database as database


class _Base(DeclarativeBase):
    pass


class _Item(_Base):
    __tablename__ = "boundary_items"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)


async def _temp_factory(db_path: Path):
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{db_path}", connect_args={"check_same_thread": False}
    )

    @event.listens_for(engine.sync_engine, "connect")
    def _pragmas(dbapi_conn, _record):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    async with engine.begin() as conn:
        await conn.run_sync(_Base.metadata.create_all)
    return engine, async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


def _row_count(db_path: Path) -> int:
    sync_engine = create_engine(f"sqlite:///{db_path}")
    try:
        with sync_engine.connect() as conn:
            return conn.execute(text("SELECT COUNT(*) FROM boundary_items")).scalar()
    finally:
        sync_engine.dispose()


@pytest.mark.asyncio
async def test_get_db_commits_on_clean_return(monkeypatch):
    """Resuming the generator past its `yield` (the clean-return path) commits the row."""
    db_path = Path(tempfile.mkdtemp()) / "boundary.db"
    engine, factory = await _temp_factory(db_path)
    monkeypatch.setattr(database, "async_session_factory", factory)
    try:
        gen = database.get_db()
        session = await gen.__anext__()
        session.add(_Item(id="ok-1", name="kept"))
        await session.flush()  # services flush, never commit
        with pytest.raises(StopAsyncIteration):
            await gen.__anext__()  # resume → get_db runs `await session.commit()`

        assert _row_count(db_path) == 1
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_get_db_rolls_back_on_exception(monkeypatch):
    """An exception thrown into the generator at the `yield` rolls back — zero rows persisted."""
    db_path = Path(tempfile.mkdtemp()) / "boundary.db"
    engine, factory = await _temp_factory(db_path)
    monkeypatch.setattr(database, "async_session_factory", factory)
    try:
        gen = database.get_db()
        session = await gen.__anext__()
        session.add(_Item(id="bad-1", name="rolled back"))
        await session.flush()
        with pytest.raises(ValueError):
            await gen.athrow(ValueError("handler blew up"))  # → except → rollback → re-raise

        assert _row_count(db_path) == 0
    finally:
        await engine.dispose()
