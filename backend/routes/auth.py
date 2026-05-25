"""Authentication routes."""

import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from ..database import get_db
from .. import auth
from .. import config
from ..models import CsrfToken, Household, HouseholdMember, HouseholdRole, Session as SessionModel, User, UserRole

router = APIRouter(prefix="/auth", tags=["authentication"])

# Dev-login router — mounted conditionally in main.py based on DEV_MODE
dev_login_router = APIRouter(prefix="/auth", tags=["dev-auth"])


class DevLoginRequest(BaseModel):
    """Simple local login for development testing."""
    email: str
    household_name: str = "Dev Household"


@dev_login_router.post("/dev-login")
async def dev_login(body: DevLoginRequest, request: Request, db: Session = Depends(get_db)):
    """Local dev-only login — creates user + household if they don't exist, then returns a session.
    
    WARNING: This endpoint is for local development only. Never expose in production.
    """
    # Get or create user
    user = db.query(User).filter(User.email == body.email).first()
    if not user:
        user = User(
            id=uuid.uuid4(),
            email=body.email,
            name=body.email.split("@")[0],
            role=UserRole.member,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    # Get or create household
    existing_membership = db.query(HouseholdMember).filter(
        HouseholdMember.user_id == user.id
    ).first()

    if existing_membership:
        household = existing_membership.household
    else:
        # Check if user created a household before
        household = db.query(Household).filter(
            Household.created_by == user.id,
            Household.name == body.household_name
        ).first()
        if not household:
            household = Household(
                id=uuid.uuid4(),
                name=body.household_name,
                created_by=user.id,
            )
            db.add(household)
            db.commit()
            db.refresh(household)

        # Create membership
        membership = HouseholdMember(
            id=uuid.uuid4(),
            household_id=household.id,
            user_id=user.id,
            role=HouseholdRole.owner,
        )
        db.add(membership)
        db.commit()

    # Create session
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=config.settings.DEV_SESSION_EXPIRE_MINUTES)
    session = SessionModel(
        id=uuid.uuid4(),
        user_id=user.id,
        expires_at=expires_at,
        last_activity_at=now,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    return {
        "session_id": str(session.id),
        "user": user.to_dict(),
        "household": household.to_dict(),
    }


@router.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    """Render login page with Google sign-in button."""
    error = request.query_params.get("error", "")
    error_messages = {
        "invalid_state": "Login attempt expired. Please try again.",
        "token_exchange_failed": "Authentication failed. Please try again.",
        "invalid_token": "Authentication failed. Please try again.",
        "no_id_token": "Authentication failed. Please try again.",
        "no_email": "No email found. Please try again.",
    }
    error_message = error_messages.get(error, "An unexpected error occurred.")

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sign in — Financial Tracker</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #0a0a0f;
            color: #e0e0e0;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
        }}
        .login-card {{
            background: #12121a;
            border: 1px solid #1e1e2e;
            border-radius: 12px;
            padding: 48px 40px;
            text-align: center;
            max-width: 400px;
            width: 100%;
        }}
        .logo {{
            font-size: 28px;
            font-weight: 700;
            color: #4fc3f7;
            margin-bottom: 8px;
        }}
        .subtitle {{
            font-size: 14px;
            color: #888;
            margin-bottom: 32px;
        }}
        .error-msg {{
            background: #2a1a1a;
            border: 1px solid #4a2a2a;
            color: #ff8a80;
            padding: 12px 16px;
            border-radius: 8px;
            margin-bottom: 24px;
            font-size: 14px;
        }}
        .google-btn {{
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            background: #4285F4;
            color: #fff;
            border: none;
            border-radius: 8px;
            padding: 14px 32px;
            font-size: 16px;
            font-weight: 500;
            cursor: pointer;
            text-decoration: none;
            transition: background 0.2s;
            min-height: 44px;
            width: 100%;
        }}
        .google-btn:hover {{ background: #3367d6; }}
        .google-btn svg {{ width: 20px; height: 20px; }}
        .footer {{
            margin-top: 32px;
            font-size: 12px;
            color: #555;
        }}
    </style>
</head>
<body>
    <div class="login-card">
        <div class="logo">Financial Tracker</div>
        <div class="subtitle">Sign in to your account</div>
        {'<div class="error-msg">' + error_message + '</div>' if error else ''}
        <a href="/auth/google" class="google-btn">
            <svg viewBox="0 0 24 24">
                <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v3.53h3.53c2.06-1.9 3.28-4.72 3.28-7.86z"/>
                <path fill="#fff" d="M12 23c2.8 0 5.14-.94 6.86-2.55l-3.53-3.53c-1.1.74-2.5 1.18-3.33 1.18-2.54 0-4.7-1.72-5.47-4.03H3.03v3.7C4.53 20.7 8.1 23 12 23z"/>
                <path fill="#fff" d="M6.53 14.05a5.63 5.63 0 0 1 0-3.6V6.75H3.03a11.14 11.14 0 0 0 0 9.9l3.5-2.6z"/>
                <path fill="#fff" d="M12 5.38c1.52 0 2.8.52 3.84 1.53l2.86-2.86C16.86 2.6 14.38 1.5 12 1.5 8.1 1.5 4.53 3.7 3.03 6.75l3.5 2.6c.77-2.3 2.93-4.03 5.47-4.03z"/>
            </svg>
            Sign in with Google
        </a>
        <div class="footer">&copy; 2026 Financial Tracker</div>
    </div>
</body>
</html>"""
    return html


@router.get("/google")
async def google_login(request: Request, db: Session = Depends(get_db)):
    """Redirect to Google OAuth."""
    return await auth.handle_google_login(request, db)


@router.get("/google/callback")
async def google_callback(request: Request, code: str, state: str, db: Session = Depends(get_db)):
    """Handle Google OAuth callback."""
    return await auth.handle_google_callback(request, code=code, state=state, db=db)


@router.get("/logout")
async def logout(request: Request):
    """Logout the current user."""
    return await auth.logout(request)


@router.get("/me")
async def get_me(request: Request, db: Session = Depends(get_db)):
    """Get current user info."""
    return await auth.get_current_user_info(request, db)


@router.get("/csrf-token")
async def get_csrf_token(request: Request, db: Session = Depends(get_db)):
    """Generate and return a CSRF token for the current user."""
    user = await auth.get_current_user(request, db)
    
    # Generate a new token
    token = secrets.token_urlsafe(32)
    
    # Delete any existing unused tokens for this user
    db.query(CsrfToken).filter(
        CsrfToken.user_id == user.id,
        CsrfToken.used == False
    ).delete()
    db.commit()
    
    # Create new token
    csrf_token = CsrfToken(
        user_id=user.id,
        token=token,
        expires_at=datetime.now() + timedelta(hours=1),
    )
    db.add(csrf_token)
    db.commit()
    
    return {"csrf_token": token}


@router.post("/csrf-token/validate")
async def validate_csrf_token(request: Request, db: Session = Depends(get_db)):
    """Validate a CSRF token and mark it as used."""
    token = request.headers.get("x-csrf-token")
    
    if not token:
        raise HTTPException(status_code=403, detail="CSRF token missing")
    
    csrf_record = db.query(CsrfToken).filter(
        CsrfToken.token == token,
        CsrfToken.used == False
    ).first()
    
    if not csrf_record:
        raise HTTPException(status_code=403, detail="Invalid CSRF token")
    
    if csrf_record.expires_at < datetime.now():
        raise HTTPException(status_code=403, detail="CSRF token expired")
    
    # Mark token as used
    csrf_record.used = True
    db.commit()
    
    return {"valid": True}
