"""Shared test fixtures.

`temp_db` centralises the throwaway file-backed SQLite engine that most unit tests need: the
production pragmas (WAL + `foreign_keys=ON`), `expire_on_commit=False`, and — critically on
Windows — disposing every engine in teardown (an undisposed engine keeps WAL/SHM handles open).
"""

import tempfile
from collections.abc import Awaitable, Callable
from pathlib import Path

import pytest
from sqlalchemy import MetaData, event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

# (engine, sessionmaker) for a freshly-created throwaway DB.
TempDb = tuple[AsyncEngine, async_sessionmaker[AsyncSession]]


@pytest.fixture
async def temp_db() -> Callable[..., Awaitable[TempDb]]:
    """Yield `make(metadata=None)` → a fresh (engine, sessionmaker) on a temp file DB.

    Pass a `MetaData` to have its tables created up front; omit it to create tables yourself.
    Every engine handed out is disposed on teardown, so callers skip the try/finally dispose dance.
    """
    engines: list[AsyncEngine] = []

    async def make(metadata: MetaData | None = None) -> TempDb:
        db_path = Path(tempfile.mkdtemp()) / "test.db"
        engine = create_async_engine(
            f"sqlite+aiosqlite:///{db_path}",
            connect_args={"check_same_thread": False},
        )

        @event.listens_for(engine.sync_engine, "connect")
        def _set_pragmas(dbapi_conn, _record):  # noqa: ANN001, ANN202
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        if metadata is not None:
            async with engine.begin() as conn:
                await conn.run_sync(metadata.create_all)

        engines.append(engine)
        return engine, async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    yield make

    for engine in engines:
        await engine.dispose()
