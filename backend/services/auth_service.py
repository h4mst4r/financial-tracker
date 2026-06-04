"""Auth service — Google OAuth 2.0 PKCE flow, session management, household seeding.

Handles:
    - Generating OAuth state (stored as signed cookie)
    - Exchanging authorization code for tokens via httpx
    - Validating Google ID tokens via google-auth
    - Creating/fetching Person by google_sub
    - First-login household creation with default categories
    - Session creation with CSRF token
"""

import hashlib
import hmac
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from urllib.parse import urlencode, urlparse, urlunparse
from uuid import UUID, uuid4

import httpx
from fastapi import Request
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.database import async_session_factory
from backend.models.base import utcnow
from backend.models.category import Category
from backend.models.currency import Currency
from backend.models.household import Household
from backend.models.person import HouseholdInvitation, Person, Session as SessionModel

logger = logging.getLogger(__name__)


class NotInvitedError(Exception):
    """Raised when an uninvited user tries to sign in to an existing household."""

    pass

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
SESSION_COOKIE_NAME = "session_id"
SESSION_EXPIRY_MINUTES = 30


# ---------------------------------------------------------------------------
# Default category seeds (first-login)
# ---------------------------------------------------------------------------

DEFAULT_CATEGORIES = [
    {"name": "Food & Drink", "type": "expense", "color": "#ef4444", "icon": "🍕"},
    {"name": "Shopping", "type": "expense", "color": "#6366f1", "icon": "🛍️"},
    {"name": "Housing", "type": "expense", "color": "#f59e0b", "icon": "🏠"},
    {"name": "Transport", "type": "expense", "color": "#64748b", "icon": "🚗"},
    {"name": "Vehicle", "type": "expense", "color": "#14b8a6", "icon": "⛽"},
    {"name": "Life & Entertainment", "type": "expense", "color": "#10b981", "icon": "🎬"},
    {"name": "Health & Fitness", "type": "expense", "color": "#ec4899", "icon": "🏥"},
    {"name": "Communication", "type": "expense", "color": "#06b6d4", "icon": "📱"},
    {"name": "Financial Expenses", "type": "expense", "color": "#8b5cf6", "icon": "💳"},
    {"name": "Income", "type": "income", "color": "#84cc16", "icon": "💰"},
    {"name": "Savings & Investments", "type": "income", "color": "#10b981", "icon": "🏦"},
    {"name": "Other", "type": "both", "color": "#94a3b8", "icon": "📦"},
]


# ---------------------------------------------------------------------------
# OAuth State (signed cookie)
# ---------------------------------------------------------------------------


def generate_oauth_state() -> str:
    """Generate a cryptographically random OAuth state value."""
    return secrets.token_urlsafe(32)


def sign_state(state: str) -> str:
    """HMAC-sign the state value using SESSION_SECRET for tamper-proofing."""
    mac = hmac.new(
        settings.SESSION_SECRET.encode("utf-8"),
        state.encode("utf-8"),
        hashlib.sha256,
    )
    return f"{state}.{mac.hexdigest()}"


def verify_state(signed_state: str) -> Optional[str]:
    """Verify HMAC signature and return the original state, or None if invalid."""
    parts = signed_state.rsplit(".", 1)
    if len(parts) != 2:
        return None
    state = parts[0]
    expected = sign_state(state)
    if not hmac.compare_digest(expected, signed_state):
        return None
    return state


# ---------------------------------------------------------------------------
# OAuth URL Building
# ---------------------------------------------------------------------------


def build_google_auth_url(state: str, redirect_uri: str) -> str:
    """Build the Google authorization URL (Authorization Code flow, no PKCE)."""
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "prompt": "select_account",
        "access_type": "offline",
    }
    query = urlencode(params, doseq=False)
    return f"{GOOGLE_AUTH_URL}?{query}"


# ---------------------------------------------------------------------------
# Token Exchange & ID Token Validation
# ---------------------------------------------------------------------------


async def exchange_code_for_tokens(code: str, redirect_uri: str) -> dict[str, Any]:
    """Exchange authorization code for access/ID tokens via Google token endpoint."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(GOOGLE_TOKEN_URL, data={
            "code": code,
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        })
        resp.raise_for_status()
        return resp.json()


def validate_id_token(id_token_str: str) -> dict[str, Any]:
    """Validate Google ID token signature, expiry, audience, issuer.

    Returns the decoded claims dict.
    Raises google.auth.exceptions.GoogleAuthError on failure.
    """
    return id_token.verify_oauth2_token(
        id_token_str,
        google_requests.Request(),
        audience=settings.GOOGLE_CLIENT_ID,
        clock_skew_in_seconds=10,
    )


# ---------------------------------------------------------------------------
# Person Lookup / Creation
# ---------------------------------------------------------------------------


async def get_or_create_person(
    db: AsyncSession,
    claims: dict[str, Any],
) -> Person:
    """Find existing Person by google_sub, or create from ID token claims."""
    google_sub = claims.get("sub")
    email = claims.get("email", "")
    name = claims.get("name", email.split("@")[0] if "@" in email else "User")
    picture = claims.get("picture")

    if not google_sub:
        raise ValueError("ID token missing 'sub' claim")

    # Try by google_sub first (unique, stable)
    result = await db.execute(
        select(Person).where(Person.google_sub == google_sub)
    )
    person = result.scalar_one_or_none()

    if person is None:
        # Fallback: case-insensitive email match.
        # Intentional account merge: if a different Google account signs in with the
        # same email as an existing Person, they receive that Person record. This prevents
        # duplicate accounts when a user rotates Google accounts but keeps their email.
        result = await db.execute(
            select(Person).where(
                func.lower(Person.email) == func.lower(email)
            )
        )
        person = result.scalar_one_or_none()

    if person is None:
        # Pre-generate UUID so person.id is available immediately in Python,
        # before any flush — needed because seed_household_if_needed passes it
        # to Household(created_by=person.id) before the person is inserted.
        person = Person(
            id=uuid4(),
            google_sub=google_sub,
            email=email,
            display_name=name,
            picture_url=picture,
            role="owner",
            display_currency="SGD",
            default_view="household",
        )
        db.add(person)

    return person


# ---------------------------------------------------------------------------
# Household Seeding (shared helper)
# ---------------------------------------------------------------------------


async def _create_and_seed_household(
    db: AsyncSession,
    person: Person,
) -> Household:
    """Create a new household for a person with default currency and categories.

    Shared by seed_household_if_needed (first login) and decline_invitation/leave_household.
    """
    household_id = uuid4()
    household = Household(
        id=household_id,
        name=f"{person.display_name}'s Household",
        base_currency="SGD",
        timezone="Asia/Singapore",
        created_by=person.id,
    )
    db.add(household)
    await db.flush()

    person.household_id = household_id
    person.role = "owner"

    currency = Currency(
        household_id=household_id,
        code="SGD",
        name="Singapore Dollar",
        symbol="S$",
        is_base=True,
        is_display_active=True,
        rate_to_base=1.0,
    )
    db.add(currency)

    for cat_data in DEFAULT_CATEGORIES:
        cat = Category(
            household_id=household_id,
            name=cat_data["name"],
            category_type=cat_data["type"],
            color=cat_data["color"],
            icon=cat_data["icon"],
            depth=0,
            created_by=person.id,
        )
        db.add(cat)

    await db.flush()
    return household


# ---------------------------------------------------------------------------
# First-Login Household Seeding
# ---------------------------------------------------------------------------


async def seed_household_if_needed(
    db: AsyncSession,
    person: Person,
) -> None:
    """If person has no household, create one with defaults.

    Checks for pending invitations first — if one exists, join that household
    instead of creating a new one.
    """
    if person.household_id is not None:
        return

    # Check for pending invitation — if found, join that household instead
    # Case-insensitive email match + expiry check + .limit(1) for determinism
    now = utcnow()
    inv_result = await db.execute(
        select(HouseholdInvitation).where(
            func.lower(HouseholdInvitation.invited_email) == func.lower(person.email),
            HouseholdInvitation.status == "pending",
            HouseholdInvitation.expires_at > now,
        ).limit(1)
    )
    pending_inv = inv_result.scalar_one_or_none()

    if pending_inv is not None:
        # Assign to invited household — do NOT accept yet.
        # Acceptance is explicit: the user must visit /join/:token and click
        # "Accept Invitation". The accept_invitation service is idempotent when
        # the person is already in the target household, so it will just mark
        # the invitation accepted without changing household_id again.
        person.household_id = pending_inv.household_id
        person.role = "member"
        await db.flush()
        return

    # Invitation-only guard: if any household exists, block uninvited signups.
    count_result = await db.execute(select(func.count(Household.id)))
    if count_result.scalar() > 0:
        raise NotInvitedError()

    # Step 1: flush person with household_id=NULL (nullable since migration a2064ba6d028).
    # person.id is already set (pre-generated uuid4 in get_or_create_person),
    # so this INSERT succeeds and satisfies households.created_by FK below.
    await db.flush()

    # Step 2: create household and seed defaults.
    await _create_and_seed_household(db, person)


# ---------------------------------------------------------------------------
# Session Management
# ---------------------------------------------------------------------------


async def create_session(
    db: AsyncSession,
    person: Person,
    request: Optional[Request] = None,
) -> SessionModel:
    """Create a new Session record with CSRF token."""
    now = utcnow()
    session = SessionModel(
        person_id=person.id,
        expires_at=now + timedelta(minutes=SESSION_EXPIRY_MINUTES),
        last_activity_at=now,
        csrf_token=secrets.token_urlsafe(32),
        ip_address=_get_client_ip(request) if request else None,
        user_agent=_get_user_agent(request) if request else None,
    )
    db.add(session)
    await db.flush()
    return session


async def delete_session(db: AsyncSession, session_id: UUID) -> None:
    """Delete a session record."""
    session = await db.get(SessionModel, session_id)
    if session:
        await db.delete(session)
        await db.flush()


async def get_session_by_id(db: AsyncSession, session_id: UUID) -> Optional[SessionModel]:
    """Look up a session by ID."""
    result = await db.execute(
        select(SessionModel).where(SessionModel.id == session_id)
    )
    return result.scalar_one_or_none()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_client_ip(request: Optional[Request]) -> Optional[str]:
    """Extract client IP from request headers."""
    if not request:
        return None
    # Check X-Forwarded-For first (proxy), then client host
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


def _get_user_agent(request: Optional[Request]) -> Optional[str]:
    """Extract User-Agent from request."""
    if not request:
        return None
    return request.headers.get("user-agent")
