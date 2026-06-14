"""Async SQLite engine, connection pragmas, and session factory (ARCH §4.3, §5.5).

WAL + foreign_keys are set per-connection via a SQLAlchemy `connect` event listener.
The listener is attached to the engine's underlying *sync* engine because DBAPI-level
events fire there, not on the async wrapper — attaching to the async engine would
silently never run, leaving FK enforcement off.
"""

from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from backend.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    connect_args={"check_same_thread": False},  # required for aiosqlite
    pool_pre_ping=True,
)


def register_sqlite_pragmas(async_engine: AsyncEngine) -> None:
    @event.listens_for(async_engine.sync_engine, "connect")
    def _set_sqlite_pragmas(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


register_sqlite_pragmas(engine)

# expire_on_commit=False keeps ORM attributes readable after get_db commits (§4.3).
async_session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_db():
    """Per-request transaction boundary (ARCH §4.3).

    One session per request: commits once on clean return, rolls back on any exception.
    Services call `await db.flush()` but **never** `commit()` or `rollback()`.
    """
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
