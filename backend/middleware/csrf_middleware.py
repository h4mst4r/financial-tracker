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

from backend.database import async_session_factory
from backend.models.person import Session as SessionModel

from .auth_middleware import _should_skip


# HTTP methods that are safe (idempotent read-only) per RFC 7231.
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


class CSRFMiddleware:
    """Validate CSRF token on mutating requests."""

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

        person = getattr(scope.get("state"), "person", None)

        if person is None:
            # AuthMiddleware should have already rejected; defensive fallback.
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

        # Extract CSRF token from request headers
        csrf_header = None
        for key, value in scope.get("headers", []):
            if key == b"x-csrf-token":
                csrf_header = value.decode("latin-1", errors="replace").strip()
                break

        valid = await self._validate_csrf(person.id, csrf_header)

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

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _validate_csrf(self, person_id: str, csrf_header: str | None) -> bool:
        """Look up the session for this person and compare CSRF tokens."""
        if not csrf_header:
            return False

        async with async_session_factory() as s:
            # Find the active session belonging to this person
            result = await s.execute(
                __import__("sqlalchemy", fromlist=["select"]).select(SessionModel).where(
                    SessionModel.person_id == person_id
                )
            )
            session_rec = result.scalar_one_or_none()

            if session_rec is None:
                return False

            return session_rec.csrf_token == csrf_header
