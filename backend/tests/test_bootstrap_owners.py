"""Story 2.3 — `seed_bootstrap_owners` is idempotent + insert-only (ARCH §2.7).

`get_settings` is `@lru_cache`d, so each test sets `BOOTSTRAP_OWNER_EMAILS` then clears the cache.
Self-contained temp-DB engine (disposed in finally — Windows WAL/SHM leak).
"""

import tempfile
from pathlib import Path

from sqlalchemy import event, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.config import get_settings
from backend.models.base import Base
from backend.models.identity import ApprovedOwner
from backend.services import auth


async def _make_factory():
    tmp_dir = tempfile.mkdtemp()
    db_path = Path(tmp_dir) / "bootstrap_test.db"
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine.sync_engine, "connect")
    def _set_pragmas(dbapi_conn, _record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    return engine, factory


async def test_bootstrap_owners_idempotent_insert_only(monkeypatch):
    engine, factory = await _make_factory()
    try:
        # Blanks ignored; "A@X.com" dedups against an existing "a@x.com" case-insensitively.
        monkeypatch.setenv("BOOTSTRAP_OWNER_EMAILS", "a@x.com, b@x.com ,, A@X.com")
        get_settings.cache_clear()

        # Pre-existing row must NOT be updated (insert-only): seeded inactive, stays inactive.
        async with factory() as db:
            db.add(ApprovedOwner(email="a@x.com", is_active=False, label="preexisting"))
            await db.commit()

        # Run twice — must be a no-op the second time.
        for _ in range(2):
            async with factory() as db:
                await auth.seed_bootstrap_owners(db)
                await db.commit()

        async with factory() as db:
            rows = (await db.execute(select(ApprovedOwner))).scalars().all()
            assert sorted(r.email for r in rows) == ["a@x.com", "b@x.com"]
            a_row = next(r for r in rows if r.email == "a@x.com")
            assert a_row.is_active is False and a_row.label == "preexisting"  # untouched
    finally:
        get_settings.cache_clear()
        await engine.dispose()


async def test_bootstrap_owners_blank_is_noop(monkeypatch):
    engine, factory = await _make_factory()
    try:
        monkeypatch.setenv("BOOTSTRAP_OWNER_EMAILS", "  ")
        get_settings.cache_clear()
        async with factory() as db:
            await auth.seed_bootstrap_owners(db)
            await db.commit()
            assert (await db.execute(select(ApprovedOwner))).scalars().all() == []
    finally:
        get_settings.cache_clear()
        await engine.dispose()
