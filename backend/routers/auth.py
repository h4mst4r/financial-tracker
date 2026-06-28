"""Auth transport — OAuth login + callback + dev-login (ARCH §2.2/§2.5).

Thin transport only: build/verify the `oauth_state` cookie and the `session_id` cookie,
delegate all logic to `services/auth.py`. The OAuth endpoints are rate-limited 20/min per IP
(§2.10) and the callback **never** returns a 500 — a never-invited identity 302s to the
detachment-aware `?error=` code (§2.6 step 4), any other failure to `?error=oauth_error`.
`GET /auth/me` (the §2.14.C contract) and `POST /auth/logout` (the AppShell avatar "sign out",
§2.14.E) both land here (Stories 2.4a / 2.4d).
"""

import logging

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from backend import errors
from backend.config import get_settings
from backend.database import get_db
from backend.dependencies import get_current_person
from backend.models.identity import Person
from backend.rate_limit import AUTH_RATE_LIMIT, limiter
from backend.services import auth as auth_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

# Detachment reason (§3.4) → the public `?error=` code (§2.6 step 4, §5.8). Default: not_invited.
_DETACHMENT_ERROR_CODES = {"household_deleted": "household_deleted", "removed": "removed"}


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

    Never a 500: a `NotInvitedError` 302s to `?error=` chosen from `detachment_reason`
    (`not_invited`/`removed`/`household_deleted`, §2.6 step 4); an `AccountArchivedError` 302s to
    `?error=account_archived` (FR-P-007); any other failure → `?error=oauth_error`.
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
    except auth_service.NotInvitedError as exc:
        # Valid identity, no household rights (§2.6 step 4) — pick the page from detachment_reason.
        code_param = _DETACHMENT_ERROR_CODES.get(exc.detachment_reason, "not_invited")
        logger.warning("oauth_callback_not_invited", extra={"reason": exc.detachment_reason})
        failure = RedirectResponse(
            f"{settings.frontend_url}/login?error={code_param}", status_code=302
        )
        failure.delete_cookie(auth_service.OAUTH_STATE_COOKIE, path="/auth/callback")
        return failure
    except auth_service.AccountArchivedError:
        # Archived member, membership intact (FR-P-007) — own code, NOT a detachment (§2.8/§5.8).
        logger.warning("oauth_callback_account_archived")
        failure = RedirectResponse(
            f"{settings.frontend_url}/login?error=account_archived", status_code=302
        )
        failure.delete_cookie(auth_service.OAUTH_STATE_COOKIE, path="/auth/callback")
        return failure
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


@router.get("/me")
async def me(
    request: Request,
    person: Person = Depends(get_current_person),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return the §2.14.C auth payload for the current session (FR-P-001).

    `get_current_person` enforces auth (401 if no session) and sets `request.state.auth =
    (person, session)`; the session (for `csrfToken`) is read from there — no second validate.
    Depends only on `get_current_person`, so a NULL-household session still gets 200 (§2.8).
    """
    _, session = request.state.auth
    return await auth_service.build_auth_me(db, person, session)


@router.post("/logout")
async def logout(
    request: Request,
    person: Person = Depends(get_current_person),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Hard-delete the session and clear the cookie (ARCH §2.14.E).

    `get_current_person` enforces auth (401 if no session) and sets `request.state.auth =
    (person, session)`; CSRF-protected like any mutation (the middleware validated the token).
    Depends only on `get_current_person`, so a NULL-household session can still log out (§2.8).
    """
    _, session = request.state.auth
    await auth_service.logout_session(db, session.id)
    # Tell the CSRF middleware NOT to re-slide the session cookie — we are clearing it (§2.14.E).
    request.state.session_cleared = True
    response = Response(status_code=204)
    auth_service.clear_session_cookie(response)
    return response


@router.get("/config")
async def auth_config() -> dict:
    """Public, unauthenticated auth-surface config for the SPA's pre-login screen (ARCH §2.5).

    Just `authBypassEnabled`, so the Login page shows the dev-login control only when the backend
    bypass is genuinely on (UX §4.1), not on every dev build. No secrets. Exempt (in
    `PUBLIC_AUTH_PATHS`) so reading it never conjures a dev session.
    """
    return {"authBypassEnabled": get_settings().auth_bypass_enabled}


@router.post("/dev-login")
async def dev_login(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """Mint/return the dev session (ARCH §2.5). 404 when `AUTH_BYPASS_ENABLED` is off.

    Returns a minimal ack; the SPA fetches the full `/auth/me` payload afterward (§2.2). The
    `/auth/me`-shaped body and any refactor to share it land in Story 2.4a.
    """
    if not get_settings().auth_bypass_enabled:
        errors.not_found(instance=request.url.path)

    session = await auth_service.ensure_dev_session(
        db, ip=request.client.host if request.client else None
    )
    response = JSONResponse({"status": "ok", "personId": session.person_id})
    auth_service.set_session_cookie(response, session.id)
    response.headers[auth_service.DEV_SESSION_ID_HEADER] = session.id
    return response
