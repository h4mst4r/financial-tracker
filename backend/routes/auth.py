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

from backend.config import settings
from backend.database import get_db
from backend.dependencies import get_current_person
from backend.models.household import Household
from backend.models.person import HouseholdInvitation, Person, Session as SessionModel
from backend.models.base import utcnow
from backend.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


# ---------------------------------------------------------------------------
# GET /auth/login — Redirect to Google OAuth
# ---------------------------------------------------------------------------


@router.get("/login")
async def login() -> Response:
    """Generate OAuth state and redirect to Google authorization endpoint."""
    state = auth_service.generate_oauth_state()
    signed_state = auth_service.sign_state(state)

    redirect_uri = settings.GOOGLE_REDIRECT_URI
    auth_url = auth_service.build_google_auth_url(state, redirect_uri)

    # Store signed state in cookie (short-lived, httpOnly).
    # The HTML page uses a dark background to avoid a white flash before the JS
    # redirect fires (the page has no stylesheet of its own).
    response = Response(
        content=(
            '<!DOCTYPE html><html><head><meta charset="UTF-8">'
            '<style>html,body{margin:0;background:#09090f}</style></head>'
            f'<body><script>window.location.href="{auth_url}"</script></body></html>'
        ),
        media_type="text/html",
    )
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
async def callback(
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    oauth_state: Optional[str] = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Exchange authorization code for tokens, validate ID token, create session."""
    # Check for OAuth error from Google
    if error:
        error_description = request.query_params.get("error_description", "Unknown error")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "type": "oauth_error",
                "title": "OAuth authorization failed",
                "status": 400,
                "detail": error_description,
                "instance": str(request.url),
            },
        )

    if not code or not state:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "type": "missing_params",
                "title": "Missing authorization code or state",
                "status": 400,
                "detail": "The OAuth callback is missing required parameters.",
                "instance": str(request.url),
            },
        )

    # Verify signed state from cookie
    if not oauth_state:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "type": "invalid_state",
                "title": "OAuth state verification failed",
                "status": 403,
                "detail": "No OAuth state cookie found.",
                "instance": str(request.url),
            },
        )

    original_state = auth_service.verify_state(oauth_state)
    if not original_state or original_state != state:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "type": "invalid_state",
                "title": "OAuth state verification failed",
                "status": 403,
                "detail": "The OAuth state does not match the expected value.",
                "instance": str(request.url),
            },
        )

    # Exchange code for tokens
    redirect_uri = settings.GOOGLE_REDIRECT_URI
    try:
        tokens = await auth_service.exchange_code_for_tokens(code, redirect_uri)
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "type": "token_exchange_failed",
                "title": "Token exchange failed",
                "status": 400,
                "detail": f"Google token endpoint returned {e.response.status_code}.",
                "instance": str(request.url),
            },
        )

    # Validate ID token
    id_token_str = tokens.get("id_token")
    if not id_token_str:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "type": "missing_id_token",
                "title": "No ID token in response",
                "status": 400,
                "detail": "Google token response did not include an ID token.",
                "instance": str(request.url),
            },
        )

    try:
        claims = auth_service.validate_id_token(id_token_str)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "type": "invalid_id_token",
                "title": "ID token validation failed",
                "status": 400,
                "detail": str(e),
                "instance": str(request.url),
            },
        )

    # Get or create Person
    person = await auth_service.get_or_create_person(db, claims)

    # Seed household on first login (invitation-only guard)
    try:
        await auth_service.seed_household_if_needed(db, person)
    except auth_service.NotInvitedError:
        await db.rollback()
        frontend_url = getattr(settings, "FRONTEND_URL", None) or "http://localhost:5173"
        response = Response(
            content=f'<script>window.location.href="{frontend_url}/login?error=not_invited"</script>',
            media_type="text/html",
        )
        return response

    # Create session
    session = await auth_service.create_session(db, person, request)

    # Redirect to frontend with session token in URL hash.
    # Vite's dev proxy strips Set-Cookie headers, so we pass the session ID
    # via hash fragment instead. The frontend reads it from window.location.hash
    # and stores it in sessionStorage, then sends it as X-Session-Token on all
    # API requests. The backend accepts it in get_current_person as a fallback.
    frontend_url = getattr(settings, "FRONTEND_URL", None) or "http://localhost:5173"
    response = Response(
        content=f'<script>window.location.href="{frontend_url}#session={session.id}"</script>',
        media_type="text/html",
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

    # If this person was added to a household via invitation but hasn't explicitly
    # accepted yet (status still "pending"), surface the token so the frontend can
    # redirect them to /join/:token regardless of how they arrived (direct login or
    # via the join link flow).
    pending_inv_result = await db.execute(
        select(HouseholdInvitation).where(
            HouseholdInvitation.invited_email == person.email,
            HouseholdInvitation.household_id == person.household_id,
            HouseholdInvitation.status == "pending",
            HouseholdInvitation.expires_at > utcnow(),
        )
    )
    pending_inv = pending_inv_result.scalar_one_or_none()

    # Compute isFirstLogin: owner who was created within the last 2 minutes
    # SQLite may store naive datetimes; normalize to UTC-aware before comparing.
    created_at = person.created_at
    if created_at is not None and created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    is_first_login = (
        person.role == "owner"
        and created_at is not None
        and (utcnow() - created_at) < timedelta(minutes=2)
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
        },
        "household": {
            "householdId": str(person.household_id),
            "name": household.name if household else None,
            "baseCurrency": household.base_currency if household else None,
            "timezone": household.timezone if household else None,
        },
        "csrfToken": session_obj.csrf_token,
        "pendingInvitationToken": str(pending_inv.id) if pending_inv else None,
        "isFirstLogin": is_first_login,
    }


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
