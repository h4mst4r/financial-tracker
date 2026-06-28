from sqlalchemy.ext.asyncio import create_async_engine

from backend.database import async_session_factory, register_sqlite_pragmas


async def test_pragmas_set_on_connect(tmp_path):
    # WAL is reported as "memory" for :memory: DBs, so prove it against a file DB.
    db_path = tmp_path / "pragma_test.db"
    test_engine = create_async_engine(f"sqlite+aiosqlite:///{db_path.as_posix()}")
    register_sqlite_pragmas(test_engine)
    try:
        async with test_engine.connect() as conn:
            journal_mode = (await conn.exec_driver_sql("PRAGMA journal_mode")).scalar()
            foreign_keys = (await conn.exec_driver_sql("PRAGMA foreign_keys")).scalar()
    finally:
        await test_engine.dispose()

    assert str(journal_mode).lower() == "wal"
    assert str(foreign_keys).strip() == "1"


async def test_production_session_factory_disables_expire_on_commit():
    # Assert the PRODUCTION factory's config (§4.3 — ORM attrs stay readable after get_db commits),
    # not a throwaway factory built with the kwarg in the test (that would assert nothing).
    session = async_session_factory()
    try:
        assert session.sync_session.expire_on_commit is False
    finally:
        await session.close()
