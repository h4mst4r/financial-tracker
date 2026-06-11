"""CSRFMiddleware — token validation on non-safe HTTP methods.

Validates the ``X-CSRF-Token`` header against the session's stored
``csrf_token`` for POST, PUT, PATCH, DELETE requests.

Does **NOT** single-use invalidate — the token remains valid for the
entire session lifetime.

Skips GET/HEAD/OPTIONS (safe methods per RFC 7231) and auth/static/docs paths.
"""

from typing import Callable
from uuid import UUID

from sqlalchemy import select
from starlette.responses import JSONResponse

import backend.database
from backend.models.person import Session as SessionModel

from .auth_middleware import SESSION_COOKIE_NAME, _extract_cookie, _should_skip


# HTTP methods that are safe (idempotent read-only) per RFC 7231.
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def _extract_header(headers: list, name: str) -> str | None:
    """Parse a single header value from raw ASGI headers (case-insensitive)."""
    name_bytes = name.lower().encode("latin-1")
    for key, value in headers:
        if key.lower() == name_bytes:
            return value.decode("latin-1", errors="replace").strip()
    return None


class CSRFMiddleware:
    """Validate CSRF token on mutating requests.

    Reads the session from the session cookie (or X-Session-Token dev header)
    and compares the request's X-CSRF-Token against the session's stored token.
    Does NOT rely on scope["state"] — auth state is resolved by FastAPI
    dependencies, not middleware.
    """

    def __init__(self, app: Callable) -> None:
        self.app = app

    async def __call__(self, scope: dict, receive: Callable, send: Callable) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope["path"]
        method = scope.get("method", "GET").upper()

        # Skip auth / static / docs paths
        if _should_skip(path):
            await self.app(scope, receive, send)
            return

        # Skip safe methods entirely
        if method in SAFE_METHODS:
            await self.app(scope, receive, send)
            return

        # Mutating request: require a valid session + matching CSRF token.
        # Primary: HttpOnly cookie. Fallback: X-Session-Token header (dev bypass only).
        headers = scope.get("headers", [])
        cookie_session_id = _extract_cookie(headers, SESSION_COOKIE_NAME)
        header_session_id = _extract_header(headers, "x-session-token")

        # Cookie takes priority; header is the dev-bypass fallback.
        # _validate_csrf handles expiry and token comparison in one DB query.
        session_id = cookie_session_id or header_session_id

        if not session_id:
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

        csrf_header = _extract_header(headers, "x-csrf-token")
        valid = await self._validate_csrf(session_id, csrf_header)

        if not valid:
            response = JSONResponse(
                status_code=403,
                content={
                    "error": "CSRF token invalid",
                    "code": "CSRF_INVALID",
                    "detail": {},
                },
            )
            await response(scope, receive, send)
            return

        await self.app(scope, receive, send)

    async def _validate_csrf(self, session_id: str, csrf_header: str | None) -> bool:
        """Fetch the session once, check it hasn't expired, compare CSRF token."""
        if not csrf_header:
            return False

        try:
            session_uuid = UUID(session_id)
        except (ValueError, AttributeError):
            return False

        from datetime import datetime, timezone

        async with backend.database.async_session_factory() as s:
            result = await s.execute(
                select(SessionModel).where(SessionModel.id == session_uuid)
            )
            session_rec = result.scalar_one_or_none()
            if session_rec is None:
                return False

            # Reject expired sessions — an expired session with a valid token must not pass.
            expires_at = session_rec.expires_at
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at < datetime.now(timezone.utc):
                return False

            return session_rec.csrf_token == csrf_header
