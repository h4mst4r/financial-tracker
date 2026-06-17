"""ASGI middleware stack — security headers + CSRF (ARCH §2.1/§2.4/§2.9).

Registered in `create_app()` in the runtime order `SecurityHeaders → (DevBypass, 2.3) →
CSRF → SlowAPI`. `SecurityHeadersMiddleware` is pure ASGI (it only appends response
headers); `CSRFMiddleware` is a `BaseHTTPMiddleware` because it needs its own DB session,
`request.state`, and to mutate the response cookie.

The CSRF middleware is the single per-request `validate_session()` caller (§2.4): it
slides the window, stashes `(person, session)` on `request.state.auth` for
`get_current_person`, re-sends the sliding cookie, and enforces the synchronizer token on
mutations. `validate_session` only flushes, so the middleware owns its own session and
commits — a separate, sequential session from the route's `get_db` (no concurrent SQLite
write lock).
"""

import hmac

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from backend.config import get_settings
from backend.database import async_session_factory
from backend.errors import problem
from backend.services.auth import (
    SESSION_COOKIE_NAME,
    SESSION_HEADER_NAME,
    is_csrf_exempt,
    set_session_cookie,
    validate_session,
)

CSRF_HEADER_NAME = "X-CSRF-Token"
MUTATING_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})

# ── Security headers (ARCH §2.9) — exact values; CSP is one canonical constant ──
CSP = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline'; "  # required for Tailwind v4's injected CSS
    "img-src 'self' data: https://lh3.googleusercontent.com; "  # Google profile pictures
    "connect-src 'self'; "
    "frame-ancestors 'none'; "
    "base-uri 'self'; "
    "form-action 'self'"
)
SECURITY_HEADERS: tuple[tuple[bytes, bytes], ...] = (
    (b"strict-transport-security", b"max-age=31536000; includeSubDomains"),
    (b"x-frame-options", b"DENY"),
    (b"x-content-type-options", b"nosniff"),
    (b"referrer-policy", b"strict-origin-when-cross-origin"),
    (b"permissions-policy", b"camera=(), microphone=(), geolocation=(), payment=()"),
    (b"content-security-policy", CSP.encode()),
)
_SECURITY_HEADER_NAMES = frozenset(name for name, _ in SECURITY_HEADERS)


class SecurityHeadersMiddleware:
    """Pure-ASGI outermost layer — sets the §2.9 headers on every HTTP response."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                # Overwrite, not append: drop any same-name header a response already set
                # so the client never receives a duplicate (e.g. a second, weaker CSP).
                existing = message.setdefault("headers", [])
                headers = [
                    (name, value)
                    for name, value in existing
                    if name.lower() not in _SECURITY_HEADER_NAMES
                ]
                headers.extend(SECURITY_HEADERS)
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_with_headers)


class CSRFMiddleware(BaseHTTPMiddleware):
    """Single per-request session validation + synchronizer-token enforcement (§2.4)."""

    async def dispatch(self, request: Request, call_next) -> Response:
        if is_csrf_exempt(request.url.path):
            return await call_next(request)

        session_id = request.cookies.get(SESSION_COOKIE_NAME) or request.headers.get(
            SESSION_HEADER_NAME
        )

        # Own session, committed here: validate_session only flushes, and this runs fully
        # before the handler's get_db opens — sequential, so no SQLite write-lock collision.
        async with async_session_factory() as db:
            result = await validate_session(
                db, session_id, bypass_enabled=get_settings().auth_bypass_enabled
            )
            if result is not None:
                _, session = result
                csrf_token = session.csrf_token
                valid_session_id = session.id
            await db.commit()

        if result is not None:
            request.state.auth = result

        # CSRF gate: only a request carrying a VALID session can be a forged mutation
        # (the browser auto-sends the cookie). No session → fall through to 401 in
        # get_current_person. (§2.4, ARCH §4.6: 401 = no session, 403 = CSRF invalid.)
        if request.method in MUTATING_METHODS and result is not None:
            header_token = request.headers.get(CSRF_HEADER_NAME, "")
            # Compare as bytes: hmac.compare_digest raises TypeError on a non-ASCII str, and
            # Starlette decodes header values as latin-1 (so 0x80–0xFF round-trips cleanly).
            if not hmac.compare_digest(header_token.encode("latin-1"), csrf_token.encode()):
                return JSONResponse(
                    status_code=403,
                    content=problem(
                        type_="forbidden",
                        title="Permission denied",
                        status=403,
                        detail="CSRF token missing or invalid",
                        instance=request.url.path,
                    ),
                )

        response = await call_next(request)
        if result is not None:
            set_session_cookie(response, valid_session_id)
        return response
