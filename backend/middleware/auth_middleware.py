"""auth_middleware — session validation helpers, path skip list, dev bypass middleware.

Auth enforcement is handled entirely by the get_current_person FastAPI
dependency (dependencies.py). The functions and constants here are imported
by csrf_middleware.py and dependencies.py.

DevBypassMiddleware (ARCH §7.6) is also defined here and registered in main.py.
"""

import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select

import backend.database
from backend.models.person import Person, Session as SessionModel

logger = logging.getLogger(__name__)


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
# /auth/dev-login is pre-auth — it creates the session, so CSRF must be skipped.
PUBLIC_AUTH_PATHS = {"/auth/login", "/auth/callback", "/auth/dev-login"}

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

        # Dev sessions (user_agent='dev-bypass') are exempt from the 30-min staleness check.
        # They have a 24h expiry instead, which is the appropriate timeout for dev work.
        is_dev_session = session_rec.user_agent == "dev-bypass"
        if not is_dev_session and (now - last_activity).total_seconds() > STALE_THRESHOLD_SECONDS:
            return None

        session_rec.last_activity_at = now
        # Dev sessions keep their 24h expiry; real sessions get a 30-min sliding window.
        if not is_dev_session:
            session_rec.expires_at = now + timedelta(minutes=30)
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


def _extract_header(headers: list, name: str) -> str | None:
    """Parse a single header value from raw ASGI headers (case-insensitive name)."""
    name_bytes = name.lower().encode("latin-1")
    for key, value in headers:
        if key.lower() == name_bytes:
            return value.decode("latin-1", errors="replace").strip()
    return None


# ---------------------------------------------------------------------------
# DevBypassMiddleware — ARCH §7.6
# ---------------------------------------------------------------------------

# Paths that bypass the bypass (ironic but necessary):
# /auth/dev-login creates its own session; /auth/login+callback are real OAuth.
_BYPASS_EXCLUDED_PATHS = {"/auth/login", "/auth/callback", "/auth/dev-login"}

# Hosts considered localhost
_LOCALHOST_HOSTS = {"127.0.0.1", "::1", "localhost"}


class DevBypassMiddleware:
    """Pure ASGI middleware that auto-authenticates localhost requests in dev mode.

    When AUTH_BYPASS_ENABLED=true and the request comes from localhost with no
    existing session, creates/reuses a fixed dev session and:
      1. Injects X-Session-Token into the request so get_current_person picks it up.
      2. Adds Set-Cookie + X-Session-Id to the response.

    Completely inert when AUTH_BYPASS_ENABLED=false (default).
    """

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        from backend.config import settings  # late import avoids circular deps at module load

        if scope["type"] != "http" or not settings.AUTH_BYPASS_ENABLED:
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        if path in _BYPASS_EXCLUDED_PATHS:
            await self.app(scope, receive, send)
            return

        # Check client host — scope["client"] is (host, port) or None
        client = scope.get("client")
        if not client or client[0] not in _LOCALHOST_HOSTS:
            await self.app(scope, receive, send)
            return

        # Skip if request already carries a session (cookie or header)
        headers = list(scope.get("headers", []))
        if _extract_cookie(headers, SESSION_COOKIE_NAME) or _extract_header(headers, "x-session-token"):
            await self.app(scope, receive, send)
            return

        # --- All conditions met: create/reuse dev session ---
        from backend.services.auth_service import get_or_create_dev_session

        try:
            async with backend.database.async_session_factory() as db:
                dev_person, dev_session = await get_or_create_dev_session(db)
                # Capture ID before the session closes to avoid DetachedInstanceError
                session_id_str = str(dev_session.id)
                await db.commit()
        except Exception:
            logger.exception("dev_bypass_session_creation_failed")
            await self.app(scope, receive, send)
            return

        # Inject X-Session-Token so get_current_person / validate_session find the session
        scope["headers"] = headers + [(b"x-session-token", session_id_str.encode("latin-1"))]

        logger.debug("dev_bypass_applied", extra={"path": path})

        cookie_header = f"session_id={session_id_str}; HttpOnly; Path=/; SameSite=Lax"

        async def send_with_cookie(message):
            if message["type"] == "http.response.start":
                resp_headers = list(message.get("headers", []))
                resp_headers.append((b"set-cookie", cookie_header.encode("latin-1")))
                resp_headers.append((b"x-session-id", session_id_str.encode("latin-1")))
                message = {**message, "headers": resp_headers}
            await send(message)

        await self.app(scope, receive, send_with_cookie)
