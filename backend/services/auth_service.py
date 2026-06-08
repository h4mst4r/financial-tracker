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

# Dev bypass sentinels — fixed, not configurable.
DEV_GOOGLE_SUB = "dev-bypass-user-001"
DEV_EMAIL = "dev@localhost"
DEV_DISPLAY_NAME = "Dev User"
DEV_HOUSEHOLD_NAME = "Dev Household"
DEV_SESSION_HOURS = 24


# ---------------------------------------------------------------------------
# Default category seeds — delegated to category_service.seed_default_categories()
# ---------------------------------------------------------------------------


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
        # Bootstrap: first-ever REAL person in the DB gets can_create_household=True.
        # Exclude the dev-bypass sentinel so the first Google OAuth user still gets
        # bootstrap rights even when AUTH_BYPASS_ENABLED=true created the dev user first.
        count_result = await db.execute(
            select(func.count()).select_from(Person).where(
                Person.google_sub != DEV_GOOGLE_SUB
            )
        )
        is_first = count_result.scalar() == 0

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
            can_create_household=is_first,
        )
        db.add(person)

    elif not person.can_create_household and person.household_id is None:
        # Existing person without household or creation rights — recheck bootstrap.
        # Handles the case where Person was created before this exclusion logic existed
        # and was incorrectly denied bootstrap rights (e.g., dev user was created first).
        recheck_result = await db.execute(
            select(func.count()).select_from(Person).where(
                Person.google_sub != DEV_GOOGLE_SUB,
                Person.id != person.id,
            )
        )
        if recheck_result.scalar() == 0:
            person.can_create_household = True

    return person


# ---------------------------------------------------------------------------
# Household Seeding (shared helper)
# ---------------------------------------------------------------------------


async def _unique_household_name(db: AsyncSession, base_name: str) -> str:
    """Return base_name if globally unique, otherwise base_name (2), (3), …"""
    candidate = base_name
    counter = 2
    while True:
        result = await db.execute(
            select(func.count()).select_from(Household).where(
                func.lower(Household.name) == func.lower(candidate)
            )
        )
        if result.scalar() == 0:
            return candidate
        candidate = f"{base_name} ({counter})"
        counter += 1


async def _create_and_seed_household(
    db: AsyncSession,
    person: Person,
) -> Household:
    """Create a new household for a person with default currency and categories.

    Shared by seed_household_if_needed (first login) and decline_invitation/leave_household.
    """
    household_id = uuid4()
    unique_name = await _unique_household_name(db, f"{person.display_name}'s Household")
    household = Household(
        id=household_id,
        name=unique_name,
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

    # Seed default categories (delegated to category domain)
    from backend.services.category_service import seed_default_categories

    await seed_default_categories(db, household_id, person.id)

    await db.flush()
    return household


# ---------------------------------------------------------------------------
# First-Login Household Seeding
# ---------------------------------------------------------------------------


async def seed_household_if_needed(
    db: AsyncSession,
    person: Person,
) -> None:
    """If person has no household, check for pending invitation or create one.

    Priority order:
    1. Pending invitation found → leave person without household; frontend will
       show the PendingInvitationDialog for explicit acceptance.
    2. can_create_household = True → create a fresh household.
    3. can_create_household = False → raise NotInvitedError.

    The invitation check MUST run before the flag check: invited members
    typically have can_create_household=False and must still be able to log in.
    """
    if person.household_id is not None:
        return

    # 1. Pending invitation check — case-insensitive, expiry-aware
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
        # Pending invitation exists — do NOT auto-assign the household.
        # The frontend will show the PendingInvitationDialog (Scenario 1: no household)
        # and the user must explicitly accept via /join/:token flow.
        # This keeps the person without a household so the dialog can render correctly.
        return

    # 2. Flag check — only authorised persons may auto-create a household
    if not person.can_create_household:
        raise NotInvitedError("User is not authorised to create a household")

    # 3. Create household — flush person row first so the FK from
    # Household.created_by to persons.id is satisfied before the INSERT.
    await db.flush()
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
# Dev Auth Bypass (ARCH §7.6)
# ---------------------------------------------------------------------------


async def get_or_create_dev_session(
    db: AsyncSession,
) -> "tuple[Person, SessionModel]":
    """Find-or-create the fixed dev Person + Session for AUTH_BYPASS_ENABLED mode.

    Idempotent: subsequent calls reuse the existing dev person and session.
    Does NOT commit — the caller is responsible via get_db context manager.
    """
    # Step 1 — find or create dev person + household
    result = await db.execute(
        select(Person).where(Person.google_sub == DEV_GOOGLE_SUB)
    )
    dev_person = result.scalar_one_or_none()

    if dev_person is None:
        # Bootstrap follows the same two-phase pattern as seed_household_if_needed.
        # Pre-generate person UUID so household.created_by can reference it immediately.
        person_id = uuid4()
        household_id = uuid4()

        household = Household(
            id=household_id,
            name=DEV_HOUSEHOLD_NAME,
            base_currency="SGD",
            timezone="Asia/Singapore",
            created_by=person_id,
        )
        db.add(household)
        await db.flush()

        dev_person = Person(
            id=person_id,
            google_sub=DEV_GOOGLE_SUB,
            email=DEV_EMAIL,
            display_name=DEV_DISPLAY_NAME,
            role="owner",
            household_id=household_id,
            display_currency="SGD",
            default_view="household",
            can_create_household=True,
        )
        db.add(dev_person)
        await db.flush()

        # Seed default currency so the dev household is fully functional
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

        # Seed default categories so the dev household is fully functional
        from backend.services.category_service import seed_default_categories

        await seed_default_categories(db, household_id, person_id)
        await db.flush()

        logger.info("dev_session_person_created", extra={"person_id": str(person_id)})
    elif dev_person.household_id is None:
        # Dev person exists but has no household (e.g., household was deleted).
        # Recreate the dev household so the dev user can continue working.
        household_id = uuid4()

        household = Household(
            id=household_id,
            name=DEV_HOUSEHOLD_NAME,
            base_currency="SGD",
            timezone="Asia/Singapore",
            created_by=dev_person.id,
        )
        db.add(household)
        await db.flush()

        dev_person.household_id = household_id
        dev_person.role = "owner"
        dev_person.can_create_household = True

        # Seed default currency
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

        # Seed default categories
        from backend.services.category_service import seed_default_categories

        await seed_default_categories(db, household_id, dev_person.id)
        await db.flush()

        logger.info("dev_household_recreated", extra={"person_id": str(dev_person.id), "household_id": str(household_id)})

    # Step 2 — find or create dev session
    now = utcnow()
    session_result = await db.execute(
        select(SessionModel)
        .where(
            SessionModel.person_id == dev_person.id,
            SessionModel.expires_at > now,
        )
        .order_by(SessionModel.last_activity_at.desc())
        .limit(1)
    )
    dev_session = session_result.scalar_one_or_none()

    if dev_session is None:
        dev_session = SessionModel(
            person_id=dev_person.id,
            expires_at=now + timedelta(hours=DEV_SESSION_HOURS),
            last_activity_at=now,
            csrf_token=secrets.token_urlsafe(32),
            ip_address="127.0.0.1",
            user_agent="dev-bypass",
        )
        db.add(dev_session)
        await db.flush()
        logger.info("dev_session_created", extra={"session_id": str(dev_session.id)})
    else:
        dev_session.last_activity_at = now

    return dev_person, dev_session


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
