"""Async SQLAlchemy engine, session factory, and base model."""

from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from .config import settings


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    connect_args={"check_same_thread": False},  # required for aiosqlite
)


@event.listens_for(engine.sync_engine, "connect")
def _set_sqlite_pragmas(dbapi_connection, connection_record):  # noqa: ARG001
    """Enable WAL journal mode and foreign-key enforcement on every new conn."""
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


# ---------------------------------------------------------------------------
# Session
# ---------------------------------------------------------------------------

async_session_factory = async_sessionmaker(engine, class_=AsyncSession)


async def get_db() -> AsyncSession:
    """FastAPI dependency that yields an async DB session.

    Commits on success, rolls back on exception, and always closes.
    """
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ---------------------------------------------------------------------------
# Declarative base (for model inheritance)
# ---------------------------------------------------------------------------

class Base(DeclarativeBase):
    """Base class for all ORM models."""
    pass
