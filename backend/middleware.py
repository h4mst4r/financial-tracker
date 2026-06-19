"""ASGI middleware stack — security headers + CSRF (ARCH §2.1/§2.4/§2.9).

Registered in `create_app()` in the runtime order `SecurityHeaders → DevBypass → CSRF →
SlowAPI`. `SecurityHeadersMiddleware` is pure ASGI (it only appends response headers);
`CSRFMiddleware` and `DevBypassMiddleware` are `BaseHTTPMiddleware` because they need their
own DB session, `request` scope, and to mutate the response cookie.

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
    DEV_SESSION_ID_HEADER,
    SESSION_COOKIE_NAME,
    SESSION_HEADER_NAME,
    ensure_dev_session,
    is_csrf_exempt,
    set_session_cookie,
    validate_session,
)

CSRF_HEADER_NAME = "X-CSRF-Token"
MUTATING_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})

# Dev-bypass (ARCH §2.5) — Vite strips Set-Cookie in local dev, so the SPA reads X-Session-Id.
LOCALHOST_HOSTS = frozenset({"127.0.0.1", "::1", "localhost"})

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
        # Re-slide the validated session cookie — UNLESS the handler intentionally cleared it
        # (logout, §2.14.E): set_cookie appends, so re-sliding would add a fresh cookie after the
        # clearing one and the browser would keep the live session_id.
        if result is not None and not getattr(request.state, "session_cleared", False):
            set_session_cookie(response, valid_session_id)
        return response


class DevBypassMiddleware(BaseHTTPMiddleware):
    """Localhost-only, flag-gated dev auto-auth (ARCH §2.5).

    Inert unless ALL hold: `AUTH_BYPASS_ENABLED`, a localhost client, a non-exempt path (the full
    §2.11 skip-list — `/health`, static, `/docs`, `/jobs/`, and the public auth paths all bypass it,
    so a liveness ping or a Swagger visit never seeds a dev household), and no session already
    present. On activation it upserts the dev person/household/session
    (its own committed DB session, like CSRF), injects the id as an `X-Session-Token` REQUEST
    header so the inner CSRF + `get_current_person` resolve it this same request, and re-sends
    `Set-Cookie` + `X-Session-Id` on the response. The "rejected once the flag is off" half is
    already handled by `validate_session` (the §2.14.B step-6 fail-safe) — not re-checked here.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        settings = get_settings()
        client_host = request.client.host if request.client else None
        already_authed = bool(
            request.cookies.get(SESSION_COOKIE_NAME) or request.headers.get(SESSION_HEADER_NAME)
        )
        if (
            not settings.auth_bypass_enabled
            or client_host not in LOCALHOST_HOSTS
            or is_csrf_exempt(request.url.path)  # full §2.11 skip-list, not just the auth paths
            or already_authed
        ):
            return await call_next(request)

        async with async_session_factory() as db:
            session = await ensure_dev_session(db, ip=client_host)
            session_id = session.id
            await db.commit()

        # Inject the session on the REQUEST (lowercased ASGI header bytes) so the inner CSRF
        # middleware + get_current_person resolve it via the X-Session-Token fallback (§2.3).
        request.scope["headers"].append(
            (SESSION_HEADER_NAME.lower().encode("latin-1"), session_id.encode("latin-1"))
        )

        response = await call_next(request)
        set_session_cookie(response, session_id)
        response.headers[DEV_SESSION_ID_HEADER] = session_id
        return response


class MaintenanceMiddleware(BaseHTTPMiddleware):
    """503 short-circuit for the data + auth layer when MAINTENANCE_MODE is on (ARCH §5.4/§5.8).

    When the flag is set, `/api/*` and `/auth/*` get a 7807 503. Everything else passes through:
    the SPA document routes (so the shell boots and the React Maintenance page can render),
    `/health`, the static/asset prefixes (§2.11), and `/jobs/*`. Sits just inside SecurityHeaders
    and outside DevBypass/CSRF (§2.1), so the 503 still carries the §2.9 headers and no
    session/DB work runs during maintenance. Reads the flag per-request (settings are lru_cached).
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        if not get_settings().maintenance_mode:
            return await call_next(request)
        if request.url.path.startswith(("/api/", "/auth/")):
            return JSONResponse(
                status_code=503,
                content=problem(
                    type_="maintenance",
                    title="Service unavailable",
                    status=503,
                    detail="The service is temporarily down for maintenance.",
                    instance=request.url.path,
                ),
            )
        return await call_next(request)
