"""AuthMiddleware — session cookie validation & person injection.

Reads the ``session_id`` cookie, looks up the ``Session`` record in the
database, validates expiry and staleness (30-minute sliding window), then
injects the authenticated ``Person`` into ``scope["state"].person``.

Skips requests to auth endpoints, static assets, and API documentation paths.
"""

from datetime import datetime, timezone
from typing import Callable
from uuid import UUID

from sqlalchemy import select
from starlette.datastructures import Headers
from starlette.responses import JSONResponse

from backend.database import async_session_factory
from backend.models.person import Person, Session as SessionModel


# ---------------------------------------------------------------------------
# Path skip list — these prefixes bypass ALL three middleware
# ---------------------------------------------------------------------------
PATH_SKIP_PREFIXES = (
    "/auth/",
    "/health",
    "/static/",
    "/assets/",
    "/docs/",
    "/redoc/",
    "/openapi.json",
)

SESSION_COOKIE_NAME = "session_id"

# Maximum idle time before a session is considered stale (30 minutes).
STALE_THRESHOLD_SECONDS = 30 * 60


def _should_skip(path: str) -> bool:
    """Return True if the path should bypass middleware."""
    return any(path.startswith(prefix) for prefix in PATH_SKIP_PREFIXES)


def _extract_cookie(headers: Headers, name: str) -> str | None:
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


class AuthMiddleware:
    """Validate session cookie and inject the authenticated person."""

    def __init__(self, app: Callable) -> None:
        self.app = app

    async def __call__(self, scope: dict, receive: Callable, send: Callable) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope["path"]

        # Skip auth / static / docs paths
        if _should_skip(path):
            await self.app(scope, receive, send)
            return

        session_id = _extract_cookie(Headers(scope.get("headers", [])), SESSION_COOKIE_NAME)

        person = await self._validate_session(session_id)

        if person is None:
            response = JSONResponse(
                status_code=401,
                content={
                    "error": "Authentication required",
                    "code": "UNAUTHORIZED",
                    "detail": {},
                },
            )
            await response(scope, receive, send)
            return

        # Inject authenticated person into request state
        scope["state"].person = person

        await self.app(scope, receive, send)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _validate_session(self, session_id: str | None) -> "Person | None":
        """Look up session, validate expiry + staleness, return Person or None."""
        if not session_id:
            return None

        # Parse UUID — reject malformed IDs early
        try:
            session_uuid = UUID(session_id)
        except (ValueError, AttributeError):
            return None

        async with async_session_factory() as s:
            session_rec = await s.execute(
                select(SessionModel).where(SessionModel.id == session_uuid)
            )
            session_rec = session_rec.scalar_one_or_none()

            if session_rec is None:
                return None

            now = datetime.now(timezone.utc)

            # Expiry check
            if session_rec.expires_at < now:
                return None

            # Stale guard — session inactive for >30 minutes
            if (now - session_rec.last_activity_at).total_seconds() > STALE_THRESHOLD_SECONDS:
                return None

            # Sliding window: refresh last_activity_at
            session_rec.last_activity_at = now
            await s.commit()

        # Load the Person — need a fresh session since the previous one closed
        async with async_session_factory() as s:
            person = await s.execute(
                select(Person).where(Person.id == session_rec.person_id)
            )
            return person.scalar_one_or_none()
            if session_rec.expires_at < now:
                return None

            # Stale guard — session inactive for >30 minutes
            if (now - session_rec.last_activity_at).total_seconds() > STALE_THRESHOLD_SECONDS:
                return None

            # Sliding window: refresh last_activity_at
            session_rec.last_activity_at = now
            await s.commit()

        # Load the Person — need a fresh session since the previous one closed
        async with async_session_factory() as s:
            person = await s.execute(
                select(Person).where(Person.id == session_rec.person_id)
            )
            return person.scalar_one_or_none()
