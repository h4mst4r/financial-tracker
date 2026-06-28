"""Datetime helpers shared across services.

SQLite drops tzinfo on read, so `DateTime(timezone=True)` columns round-trip **naive**. Coerce to
aware UTC with `as_utc` before any comparison against `datetime.now(UTC)` — the single source of
this conversion (was duplicated in auth/invitation/fx_fetch as a private `_as_utc`).
"""

from datetime import UTC, datetime


def as_utc(dt: datetime) -> datetime:
    """Coerce a (possibly tz-naive, SQLite-sourced) datetime to aware UTC."""
    return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt.astimezone(UTC)
