"""Google OAuth 2.0 authentication module."""

import secrets
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from fastapi import Depends, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from . import config
from .database import get_db
from .models import Household, HouseholdMember, HouseholdRole, OAuthState, Session as SessionModel, User, UserRole


def _google_auth_url(state: str) -> str:
    """Generate Google OAuth 2.0 authorization URL."""
    redirect_uri = config.settings.GOOGLE_REDIRECT_URI
    params = {
        "client_id": config.settings.GOOGLE_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "prompt": "select_account",
    }
    base = "https://accounts.google.com/o/oauth2/v2/auth"
    return f"{base}?{urlencode(params)}"


def _exchange_code_for_tokens(code: str) -> dict:
    """Exchange authorization code for ID token and access token."""
    token_url = "https://oauth2.googleapis.com/token"
    payload = {
        "code": code,
        "client_id": config.settings.GOOGLE_CLIENT_ID,
        "client_secret": config.settings.GOOGLE_CLIENT_SECRET,
        "redirect_uri": config.settings.GOOGLE_REDIRECT_URI,
        "grant_type": "authorization_code",
    }
    resp = httpx.post(token_url, data=payload, timeout=10.0)
    resp.raise_for_status()
    return resp.json()


def _validate_id_token(id_token: str) -> dict:
    """Validate Google ID token using google-auth library."""
    from google.oauth2 import id_token as id_token_module
    from google.auth.transport import requests as transport_requests

    req = transport_requests.Request()
    # Allow 30 seconds clock skew to handle minor server time drift
    claims = id_token_module.verify_token(
        id_token, req,
        audience=config.settings.GOOGLE_CLIENT_ID,
        clock_skew_in_seconds=30
    )
    return claims


def _get_or_create_user(db: Session, email: str, name: str, picture_url: str | None = None) -> User:
    """Get existing user or create a new one."""
    user = db.query(User).filter(User.email == email).first()
    if user:
        return user

    user = User(
        id=uuid.uuid4(),
        email=email,
        name=name,
        picture_url=picture_url,
        role=UserRole.member,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _create_session(db: Session, user: User, ip_address: str | None, user_agent: str | None) -> SessionModel:
    """Create a new server-side session."""
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=config.settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    session = SessionModel(
        id=uuid.uuid4(),
        user_id=user.id,
        expires_at=expires_at,
        last_activity_at=now,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


async def generate_oauth_state() -> str:
    """Generate a random state for CSRF protection."""
    return secrets.token_urlsafe(32)


async def handle_google_login(request: Request, db: Session = Depends(get_db)) -> Response:
    """Initiate Google OAuth login flow."""
    state = await generate_oauth_state()
    
    # Store state in database for verification in callback
    # Use naive datetime for SQLite compatibility
    expires_at = datetime.now() + timedelta(minutes=5)
    oauth_state = OAuthState(
        id=uuid.uuid4(),
        state=state,
        expires_at=expires_at,
    )
    db.add(oauth_state)
    db.commit()
    
    auth_url = _google_auth_url(state)
    return RedirectResponse(url=auth_url, status_code=302)


async def handle_google_callback(
    request: Request,
    code: str = Query(...),
    state: str = Query(...),
    db: Session = Depends(get_db),
) -> Response:
    """Handle Google OAuth callback."""
    # Verify state (CSRF protection) - lookup from database
    oauth_state = db.query(OAuthState).filter(OAuthState.state == state).first()
    
    if not oauth_state or oauth_state.is_expired():
        return RedirectResponse(url=f"{config.FRONTEND_URL}/login?error=invalid_state", status_code=302)
    
    # Delete the used state token
    db.delete(oauth_state)
    db.commit()

    # Exchange code for tokens
    try:
        token_data = _exchange_code_for_tokens(code)
    except Exception:
        return RedirectResponse(url=f"{config.FRONTEND_URL}/login?error=token_exchange_failed", status_code=302)

    # Validate ID token
    id_token = token_data.get("id_token")
    if not id_token:
        return RedirectResponse(url=f"{config.FRONTEND_URL}/login?error=no_id_token", status_code=302)

    try:
        claims = _validate_id_token(id_token)
    except Exception as e:
        import logging
        logging.error(f"ID token validation failed: {e}")
        return RedirectResponse(url=f"{config.FRONTEND_URL}/login?error=invalid_token&detail={str(e)}", status_code=302)

    # Extract user info
    email = claims.get("email")
    name = claims.get("name", "")
    picture_url = claims.get("picture")

    if not email:
        return RedirectResponse(url=f"{config.FRONTEND_URL}/login?error=no_email", status_code=302)

    # Get or create user (use the db session already passed as parameter)
    try:
        user = _get_or_create_user(db, email, name, picture_url)

        # Create session
        ip_address = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent")
        session = _create_session(db, user, ip_address, user_agent)

        # Set session cookie and redirect to frontend dashboard
        # Pass session_id via URL parameter since cookies can't cross ports (8000 vs 5173)
        resp = RedirectResponse(
            url=f"{config.settings.FRONTEND_URL}/dashboard?session_id={session.id}",
            status_code=302,
        )
        resp.set_cookie(
            key="session_id",
            value=str(session.id),
            httponly=True,
            secure=False,  # Will be True in production with HTTPS
            samesite="lax",
            max_age=config.settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            path="/",
            domain="localhost",  # Share cookie across all localhost ports
        )
        return resp
    finally:
        db.close()


async def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """Get the current authenticated user from session cookie or header.
    
    Checks session expiration and inactivity timeout (30 minutes).
    Refreshes last_activity_at on successful authentication.
    """
    # Try cookie first, then fall back to X-Session-Id header (for cross-port communication)
    session_id = request.cookies.get("session_id") or request.headers.get("x-session-id")
    
    if not session_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    session = db.query(SessionModel).filter(SessionModel.id == uuid.UUID(session_id)).first()
    
    if not session:
        raise HTTPException(status_code=401, detail="Session expired")
    
    # Check absolute expiration
    if session.is_expired():
        raise HTTPException(status_code=401, detail="Session expired")
    
    # Check inactivity timeout (30 minutes)
    inactivity_timeout = timedelta(minutes=config.settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    now = datetime.now(timezone.utc)
    # Handle both timezone-aware and naive datetimes
    last_activity = session.last_activity_at
    if last_activity and last_activity.tzinfo is None:
        last_activity = last_activity.replace(tzinfo=timezone.utc)
    
    if last_activity and now - last_activity > inactivity_timeout:
        # Session expired due to inactivity
        raise HTTPException(status_code=401, detail="Session expired due to inactivity")
    
    # Refresh last activity timestamp
    session.last_activity_at = datetime.now(timezone.utc)
    db.commit()

    user = db.query(User).filter(User.id == session.user_id).first()
    
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user


async def logout(request: Request) -> Response:
    """Logout the current user by invalidating session."""
    session_id = request.cookies.get("session_id")
    if session_id:
        db = next(get_db())
        try:
            session = db.query(SessionModel).filter(SessionModel.id == uuid.UUID(session_id)).first()
            if session:
                db.delete(session)
                db.commit()
        finally:
            db.close()

    resp = RedirectResponse(url=f"{config.settings.FRONTEND_URL}/login", status_code=302)
    resp.delete_cookie(key="session_id", path="/")
    return resp


async def get_current_user_info(request: Request, db: Session = Depends(get_db)) -> dict:
    """Get current user info as JSON (for frontend auth check)."""
    user = await get_current_user(request, db)
    return {"user": user.to_dict()}
