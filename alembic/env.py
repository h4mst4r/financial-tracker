"""Alembic async environment (ARCH §5.5).

Targets `Base.metadata` from `backend.models` so autogenerate sees every registered
table. Uses `asyncio.run()` to drive an `AsyncEngine` because the app URL is
`sqlite+aiosqlite` (async driver) — the stock sync `env.py` would fail.
"""

import asyncio
import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# Project root on sys.path so `backend.*` imports resolve from any cwd.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.models import Base  # noqa: E402  # __init__ imports every entity → all tables on Base.metadata

config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def do_run_migrations(connection):
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        render_as_batch=True,  # SQLite ALTER safety for future revisions
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations():
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online():
    asyncio.run(run_async_migrations())


def run_migrations_offline():
    connectable = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=connectable,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
