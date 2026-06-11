"""Auth routes — Google OAuth login, callback, session management.

Endpoints:
    GET  /auth/login      — Redirect to Google OAuth (public)
    GET  /auth/callback   — Handle OAuth callback, create session (public)
    GET  /auth/me         — Get current person + household (requires auth)
    POST /auth/logout     — Delete session (requires auth)
"""

from datetime import timedelta, timezone

import httpx
from typing import Optional

from sqlalchemy import select
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi.responses import JSONResponse, RedirectResponse

from backend.config import settings
from backend.database import get_db
from backend.dependencies import get_current_person
from backend.limiter import limiter
from backend.models.household import Household
from backend.models.person import HouseholdInvitation, Person, Session as SessionModel
from backend.models.base import utcnow
from backend.services import auth_service
from backend.services.auth_service import NotInvitedError

router = APIRouter(prefix="/auth", tags=["auth"])


# ---------------------------------------------------------------------------
# GET /auth/login — Redirect to Google OAuth
# ---------------------------------------------------------------------------


@router.get("/login")
@limiter.limit("20/minute")
async def login(request: Request) -> RedirectResponse:
    """Generate OAuth state and redirect to Google authorization endpoint."""
    state = auth_service.generate_oauth_state()
    signed_state = auth_service.sign_state(state)

    redirect_uri = settings.GOOGLE_REDIRECT_URI
    auth_url = auth_service.build_google_auth_url(state, redirect_uri)

    response = RedirectResponse(url=auth_url, status_code=302)
    response.set_cookie(
        key="oauth_state",
        value=signed_state,
        max_age=600,  # 10 minutes — enough for OAuth flow
        httponly=True,
        samesite="lax",
        secure=not settings.DEBUG,
        path="/auth/callback",
    )

    return response


# ---------------------------------------------------------------------------
# GET /auth/callback — Handle OAuth callback
# ---------------------------------------------------------------------------


@router.get("/callback")
@limiter.limit("20/minute")
async def callback(
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    oauth_state: Optional[str] = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    """Exchange authorization code for tokens, validate ID token, create session."""
    frontend_url = getattr(settings, "FRONTEND_URL", None) or "http://localhost:5173"

    def _oauth_error_redirect() -> RedirectResponse:
        return RedirectResponse(
            url=f"{frontend_url}/login?error=oauth_error",
            status_code=302,
        )

    # Check for OAuth error from Google (e.g. user denied access)
    if error:
        return _oauth_error_redirect()

    if not code or not state:
        return _oauth_error_redirect()

    # Verify signed state from cookie — missing cookie means the flow was broken
    # (e.g. cookie expired, wrong port/domain, cross-site navigation).
    if not oauth_state:
        return _oauth_error_redirect()

    original_state = auth_service.verify_state(oauth_state)
    if not original_state or original_state != state:
        return _oauth_error_redirect()

    # Exchange code for tokens
    redirect_uri = settings.GOOGLE_REDIRECT_URI
    try:
        tokens = await auth_service.exchange_code_for_tokens(code, redirect_uri)
    except httpx.HTTPStatusError:
        return _oauth_error_redirect()

    # Validate ID token
    id_token_str = tokens.get("id_token")
    if not id_token_str:
        return _oauth_error_redirect()

    try:
        claims = auth_service.validate_id_token(id_token_str)
    except Exception:
        return _oauth_error_redirect()

    # Get or create Person
    person = await auth_service.get_or_create_person(db, claims)

    # Seed household — may raise NotInvitedError for uninvited users
    try:
        await auth_service.seed_household_if_needed(db, person)
    except NotInvitedError:
        # Person row is intentionally persisted (valid Google account, no rights).
        # No session created — redirect to login with error code.
        return RedirectResponse(
            url=f"{frontend_url}/login?error=not_invited",
            status_code=302,
        )

    # Create session
    session = await auth_service.create_session(db, person, request)

    # Redirect to frontend and set the session as an HttpOnly cookie.
    # The OAuth callback is called directly by the browser (not via Vite proxy),
    # so Set-Cookie lands correctly regardless of the dev proxy setup.
    # HttpOnly prevents JavaScript from reading the token — XSS cannot steal it.
    response = RedirectResponse(url=f"{frontend_url}/", status_code=302)
    response.set_cookie(
        key=auth_service.SESSION_COOKIE_NAME,
        value=str(session.id),
        httponly=True,
        samesite="lax",
        secure=not settings.DEBUG,
        path="/",
        max_age=auth_service.SESSION_EXPIRY_MINUTES * 60,
    )
    return response


# ---------------------------------------------------------------------------
# GET /auth/me — Current person + household (requires auth)
# ---------------------------------------------------------------------------


@router.get("/me")
async def me(
    request: Request,
    person: Person = Depends(get_current_person),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return current person and household data for frontend authStore hydration.

    Response shape is versioned — changes here require updating authStore.setAuth().
    Ref: ARCH §7.2a
    """
    session_obj: SessionModel = getattr(request.state, "session", None)

    if session_obj is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "type": "no_session",
                "title": "No active session",
                "status": 401,
                "detail": "Session object not found in request state.",
                "instance": str(request.url),
            },
        )

    # Load household for name/currency/timezone (person may be detached from its session)
    hh_result = await db.execute(
        select(Household).where(Household.id == person.household_id)
    )
    household = hh_result.scalar_one_or_none()

    # If this person has any pending invitation (to any household), surface the token
    # so the frontend can notify them. Remove the `household_id == person.household_id`
    # filter — invitations to a DIFFERENT household are the common case (user already
    # in Household A gets invited to Household B).
    # Multiple invitations can exist — take the most recent one.
    pending_inv_result = await db.execute(
        select(HouseholdInvitation)
        .where(
            HouseholdInvitation.invited_email == person.email,
            HouseholdInvitation.status == "pending",
            HouseholdInvitation.expires_at > utcnow(),
        )
        .order_by(HouseholdInvitation.created_at.desc())
        .limit(1)
    )
    pending_inv = pending_inv_result.scalar_one_or_none()

    # If there's a pending invitation, load the target household and inviter details
    pending_invitation = None
    if pending_inv:
        target_hh_result = await db.execute(
            select(Household).where(Household.id == pending_inv.household_id)
        )
        target_hh = target_hh_result.scalar_one_or_none()
        inviter_result = await db.execute(
            select(Person).where(Person.id == pending_inv.invited_by)
        )
        inviter = inviter_result.scalar_one_or_none()

        pending_invitation = {
            "token": str(pending_inv.id),
            "householdId": str(pending_inv.household_id),
            "householdName": target_hh.name if target_hh else "Unknown Household",
            "invitedByDisplayName": inviter.display_name if inviter else "Unknown",
            "invitedEmail": pending_inv.invited_email,
            "expiresAt": pending_inv.expires_at.isoformat(),
            "status": pending_inv.status,
        }

    # Compute isFirstLogin: owner whose household was created within the last 2 minutes.
    # Using household.created_at (not person.created_at) so the welcome toast fires
    # for owners who deleted their household and created a new one on re-login.
    hh_created_at = household.created_at if household else None
    if hh_created_at is not None and hh_created_at.tzinfo is None:
        hh_created_at = hh_created_at.replace(tzinfo=timezone.utc)
    is_first_login = (
        person.role == "owner"
        and hh_created_at is not None
        and (utcnow() - hh_created_at) < timedelta(minutes=2)
    )

    return {
        "person": {
            "personId": str(person.id),
            "displayName": person.display_name,
            "email": person.email,
            "role": person.role,
            "pictureUrl": person.picture_url,
            "defaultView": person.default_view,
            "displayCurrency": person.display_currency,
            "canCreateHousehold": person.can_create_household,
        },
        "household": None if person.household_id is None else {
            "householdId": str(person.household_id),
            "name": household.name if household else None,
            "baseCurrency": household.base_currency if household else None,
            "timezone": household.timezone if household else None,
        },
        "csrfToken": session_obj.csrf_token,
        "pendingInvitation": pending_invitation,
        "isFirstLogin": is_first_login,
    }


# ---------------------------------------------------------------------------
# POST /auth/dev-login — Dev bypass login (ARCH §7.6)
# ---------------------------------------------------------------------------


@router.post("/dev-login")
@limiter.limit("20/minute")
async def dev_login(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """Create/reuse the fixed dev session and return /auth/me-shaped payload.

    Returns 404 when AUTH_BYPASS_ENABLED=false — the endpoint doesn't
    conceptually exist in production.
    """
    if not settings.AUTH_BYPASS_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "Not found", "code": "NOT_FOUND", "detail": {}},
        )

    person, session = await auth_service.get_or_create_dev_session(db)

    # Load household (created during get_or_create_dev_session)
    hh_result = await db.execute(
        select(Household).where(Household.id == person.household_id)
    )
    household = hh_result.scalar_one_or_none()

    payload = {
        "person": {
            "personId": str(person.id),
            "displayName": person.display_name,
            "email": person.email,
            "role": person.role,
            "pictureUrl": person.picture_url,
            "defaultView": person.default_view,
            "displayCurrency": person.display_currency,
            "canCreateHousehold": person.can_create_household,
        },
        "household": None if household is None else {
            "householdId": str(household.id),
            "name": household.name,
            "baseCurrency": household.base_currency,
            "timezone": household.timezone,
        },
        "csrfToken": session.csrf_token,
        "pendingInvitation": None,
        "isFirstLogin": False,
    }

    session_id_str = str(session.id)
    response = JSONResponse(content=payload, status_code=200)
    response.headers["Set-Cookie"] = (
        f"session_id={session_id_str}; HttpOnly; Path=/; SameSite=Lax"
    )
    response.headers["X-Session-Id"] = session_id_str
    return response


# ---------------------------------------------------------------------------
# POST /auth/logout — Clear session (requires auth)
# ---------------------------------------------------------------------------


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    person: Person = Depends(get_current_person),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Delete the current session and clear the session cookie."""
    # Get session object injected by middleware
    session_obj: SessionModel = getattr(request.state, "session", None)

    if session_obj:
        await auth_service.delete_session(db, session_obj.id)

    # Clear session cookie
    response.delete_cookie(
        key=auth_service.SESSION_COOKIE_NAME,
        path="/",
    )

    return {
        "status": "ok",
        "message": "Logged out successfully",
    }
