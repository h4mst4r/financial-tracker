"""Auth transport — OAuth login + callback (ARCH §2.2).

Thin transport only: build/verify the `oauth_state` cookie and the `session_id` cookie,
delegate all logic to `services/auth.py`. Both endpoints are rate-limited 20/min per IP
(§2.10) and the callback **never** returns a 500 — every failure 302s to
`?error=oauth_error` (§2.2). `/auth/dev-login`, `/auth/me`, `/auth/logout`, and the CSRF/
security middleware land in Stories 2.2/2.3/2.4a.
"""

import logging

from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import get_settings
from backend.database import get_db
from backend.rate_limit import AUTH_RATE_LIMIT, limiter
from backend.services import auth as auth_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


def _secure_cookies() -> bool:
    return not get_settings().debug


@router.get("/login")
@limiter.limit(AUTH_RATE_LIMIT)
async def login(request: Request) -> RedirectResponse:
    """Set the signed `oauth_state` cookie and 302 → Google (§2.2 step 1)."""
    state = auth_service.sign_state()
    response = RedirectResponse(auth_service.build_authorization_url(state), status_code=302)
    response.set_cookie(
        auth_service.OAUTH_STATE_COOKIE,
        state,
        max_age=int(auth_service.OAUTH_STATE_TTL.total_seconds()),
        httponly=True,
        samesite="lax",
        secure=_secure_cookies(),
        path="/auth/callback",
    )
    return response


@router.get("/callback")
@limiter.limit(AUTH_RATE_LIMIT)
async def callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    """Verify state → exchange → validate → person → seed → session (§2.2 step 2).

    Any failure 302s to `{FRONTEND_URL}/login?error=oauth_error` — never a 500.
    """
    settings = get_settings()
    cookie_state = request.cookies.get(auth_service.OAUTH_STATE_COOKIE)

    try:
        if (
            not code
            or not state
            or state != cookie_state
            or auth_service.verify_state(state) is None
        ):
            raise auth_service.OAuthError("invalid_state")

        session = await auth_service.complete_oauth_login(
            db,
            code=code,
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    except Exception as exc:
        # Never a 500 to the user (§2.2) — but log the cause (no PII) so failures aren't silent.
        logger.warning("oauth_callback_failed", extra={"error_type": type(exc).__name__})
        failure = RedirectResponse(
            f"{settings.frontend_url}/login?error=oauth_error", status_code=302
        )
        failure.delete_cookie(auth_service.OAUTH_STATE_COOKIE, path="/auth/callback")
        return failure

    response = RedirectResponse(settings.frontend_url, status_code=302)
    response.set_cookie(
        auth_service.SESSION_COOKIE_NAME,
        session.id,
        max_age=int(auth_service.SESSION_TTL.total_seconds()),
        httponly=True,
        samesite="lax",
        secure=_secure_cookies(),
        path="/",
    )
    response.delete_cookie(auth_service.OAUTH_STATE_COOKIE, path="/auth/callback")
    return response
