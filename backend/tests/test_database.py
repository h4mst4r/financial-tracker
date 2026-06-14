from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.database import register_sqlite_pragmas


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


async def test_session_factory_disables_expire_on_commit(tmp_path):
    # Use a test-isolated engine, not the production one.
    db_path = tmp_path / "session_test.db"
    test_engine = create_async_engine(f"sqlite+aiosqlite:///{db_path.as_posix()}")
    test_factory = async_sessionmaker(test_engine, expire_on_commit=False, class_=AsyncSession)
    try:
        session = test_factory()
        try:
            assert session.sync_session.expire_on_commit is False
        finally:
            await session.rollback()
            await session.close()
    finally:
        await test_engine.dispose()
