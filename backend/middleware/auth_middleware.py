"""auth_middleware — session validation helpers and path skip list.

Auth enforcement is handled entirely by the get_current_person FastAPI
dependency (dependencies.py). The functions and constants here are imported
by csrf_middleware.py and dependencies.py.
"""

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select

import backend.database
from backend.models.person import Person, Session as SessionModel


# ---------------------------------------------------------------------------
# Path skip list — these prefixes bypass ALL three middleware
# ---------------------------------------------------------------------------
# Note: /auth/ is NOT in the skip list anymore — only /auth/login and
# /auth/callback are public. /auth/me and /auth/logout require auth.
PATH_SKIP_PREFIXES = (
    "/health",
    "/static/",
    "/assets/",
    "/docs/",
    "/redoc/",
    "/openapi.json",
)

# Public auth endpoints that don't require a valid session.
PUBLIC_AUTH_PATHS = {"/auth/login", "/auth/callback"}

SESSION_COOKIE_NAME = "session_id"

# Maximum idle time before a session is considered stale (30 minutes).
STALE_THRESHOLD_SECONDS = 30 * 60


def _should_skip(path: str) -> bool:
    """Return True if the path should bypass middleware."""
    if path in PUBLIC_AUTH_PATHS:
        return True
    return any(path.startswith(prefix) for prefix in PATH_SKIP_PREFIXES)


async def validate_session(session_id: str | None) -> "tuple[Person, SessionModel] | None":
    """Module-level session validator — used by both AuthMiddleware and get_current_person.

    Looks up session, validates expiry + staleness, slides the window, and
    returns (Person, Session) or None.
    """
    if not session_id:
        return None

    try:
        session_uuid = UUID(session_id)
    except (ValueError, AttributeError):
        return None

    async with backend.database.async_session_factory() as s:
        session_rec = await s.execute(
            select(SessionModel).where(SessionModel.id == session_uuid)
        )
        session_rec = session_rec.scalar_one_or_none()

        if session_rec is None:
            return None

        now = datetime.now(timezone.utc)

        expires_at = session_rec.expires_at
        last_activity = session_rec.last_activity_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if last_activity.tzinfo is None:
            last_activity = last_activity.replace(tzinfo=timezone.utc)

        if expires_at < now:
            return None

        if (now - last_activity).total_seconds() > STALE_THRESHOLD_SECONDS:
            return None

        session_rec.last_activity_at = now
        session_rec.expires_at = now + __import__("datetime").timedelta(minutes=30)
        person_id = session_rec.person_id
        await s.commit()

    async with backend.database.async_session_factory() as s:
        person_result = await s.execute(select(Person).where(Person.id == person_id))
        person_obj = person_result.scalar_one_or_none()
        if person_obj is None:
            return None

        session_result = await s.execute(
            select(SessionModel).where(SessionModel.id == session_uuid)
        )
        session_obj = session_result.scalar_one_or_none()
        if session_obj is None:
            return None

        return (person_obj, session_obj)


def _extract_cookie(headers: list, name: str) -> str | None:
    """Parse a cookie value from raw ASGI headers."""
    for key, value in headers:
        if key == b"cookie":
            for crumb in value.decode("latin-1", errors="replace").split(";"):
                crumb = crumb.strip()
                if "=" in crumb:
                    k, _, v = crumb.partition("=")
                    if k.strip() == name:
                        return v.strip()
    return None
