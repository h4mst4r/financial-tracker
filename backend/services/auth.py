"""Authentication service — OAuth flow, identity, sessions (ARCH §2.2/§2.3/§2.6/§2.14).

The single source of session truth (`validate_session`, §2.14.B) plus the OAuth
orchestration (token exchange → ID-token validation → person → seed → session). The
router layer (`backend/routers/auth.py`) is pure transport; all logic lives here.

`_exchange_code_for_tokens` and `_verify_id_token` are standalone so tests monkeypatch
them — no live Google call in the suite.
"""

import asyncio
import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode
from uuid import UUID, uuid4

import httpx
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import get_settings
from backend.models.identity import Person, Session

# ── Constants (ARCH §2.3/§2.5/§2.14) ──
SESSION_COOKIE_NAME = "session_id"
SESSION_HEADER_NAME = "X-Session-Token"
OAUTH_STATE_COOKIE = "oauth_state"
SESSION_TTL = timedelta(minutes=30)
OAUTH_STATE_TTL = timedelta(minutes=10)
DEV_SESSION_TTL = timedelta(hours=24)
DEV_USER_AGENT = "dev-bypass"

GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"  # nosec B105 (URL, not a secret)
GOOGLE_SCOPES = "openid email profile"


class NotInvitedError(Exception):
    """Valid Google identity with no right to a household (ARCH §2.6 step 4).

    Full seeding (approved-owners, pending-invite, bootstrap) lands in Story 2.3, which
    replaces the minimal `seed_household_if_needed` below with the §2.6 decision tree.
    """


class OAuthError(Exception):
    """Any recoverable OAuth callback failure → the router redirects ?error=oauth_error."""


# ── OAuth state (HMAC-signed cookie, §2.2 step 1) ──


def _secret_bytes() -> bytes:
    return get_settings().session_secret.encode()


def _state_sig(raw: str) -> str:
    return hmac.new(_secret_bytes(), raw.encode(), hashlib.sha256).hexdigest()


def sign_state() -> str:
    """Mint a random state and append its HMAC signature: `{raw}.{hexdigest}`."""
    raw = secrets.token_urlsafe(32)
    return f"{raw}.{_state_sig(raw)}"


def verify_state(value: str | None) -> str | None:
    """Return the raw state if the signature is valid (constant-time), else None."""
    if not value or "." not in value:
        return None
    raw, _, sig = value.rpartition(".")
    if not raw or not sig:
        return None
    if not hmac.compare_digest(sig, _state_sig(raw)):
        return None
    return raw


def build_authorization_url(state: str) -> str:
    settings = get_settings()
    params = {
        "response_type": "code",
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "scope": GOOGLE_SCOPES,
        "state": state,
        "prompt": "select_account",
    }
    return f"{GOOGLE_AUTH_ENDPOINT}?{urlencode(params)}"


# ── Google token exchange + ID-token validation (monkeypatched in tests) ──


async def _exchange_code_for_tokens(code: str) -> dict:
    settings = get_settings()
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            GOOGLE_TOKEN_ENDPOINT,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
    resp.raise_for_status()
    return resp.json()


def _verify_id_token(id_token_str: str) -> dict:
    """Validate audience + signature + expiry (10 s skew) via google-auth (§2.2 step 2)."""
    return google_id_token.verify_oauth2_token(
        id_token_str,
        google_requests.Request(),
        audience=get_settings().google_client_id,
        clock_skew_in_seconds=10,
    )


# ── Identity (ARCH §2.6) ──


async def get_or_create_person(db: AsyncSession, claims: dict) -> Person:
    """Match by `google_sub`; else merge on a verified email; else create (pre-gen UUID).

    The verified-email fallback is an intentional account merge so a user whose
    `google_sub` rotated but who kept the same verified email lands on their existing
    Person (its `google_sub` is updated) rather than a duplicate (§2.6, §2.12 inv. 4).
    """
    google_sub = claims["sub"]
    email = claims["email"]

    by_sub = await db.execute(select(Person).where(Person.google_sub == google_sub))
    person = by_sub.scalar_one_or_none()
    if person is not None:
        return person

    if claims.get("email_verified") is True:
        by_email = await db.execute(
            select(Person).where(func.lower(Person.email) == func.lower(email))
        )
        existing = by_email.scalar_one_or_none()
        if existing is not None:
            existing.google_sub = google_sub  # merge: rotate the sub onto the existing identity
            await db.flush()
            return existing

    # Pre-generated UUID (before flush) so the later Household.created_by FK ordering holds.
    person = Person(
        id=str(uuid4()),
        google_sub=google_sub,
        email=email,
        display_name=claims.get("name"),
        picture_url=claims.get("picture"),
    )
    db.add(person)
    await db.flush()
    return person


async def seed_household_if_needed(db: AsyncSession, person: Person) -> None:
    """MINIMAL (Story 2.1): §2.6 step 1 + step 4 only.

    Step 1 — already in a household → return. Otherwise raise NotInvitedError. The
    approved-owners seed, pending-invitation priority, bootstrap, currency/category
    seeding, and detachment-reason redirect mapping are **Story 2.3**.
    """
    if person.household_id:
        return
    raise NotInvitedError(person.email)


# ── Sessions (ARCH §2.3 / §2.14.B) ──


def _as_utc(dt: datetime) -> datetime:
    return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt.astimezone(UTC)


async def create_session(
    db: AsyncSession,
    person: Person,
    *,
    ip: str | None,
    user_agent: str | None,
    dev: bool = False,
) -> Session:
    """Insert a session row + mint the CSRF token (the only trust boundary, §2.4)."""
    now = datetime.now(UTC)
    session = Session(
        id=str(uuid4()),
        person_id=person.id,
        created_at=now,
        last_activity_at=now,
        expires_at=now + (DEV_SESSION_TTL if dev else SESSION_TTL),
        csrf_token=secrets.token_urlsafe(32),
        ip_address=ip,
        user_agent=DEV_USER_AGENT if dev else user_agent,
    )
    db.add(session)
    await db.flush()
    return session


async def validate_session(
    db: AsyncSession, session_id: str | None, *, bypass_enabled: bool
) -> tuple[Person, Session] | None:
    """The single source of session truth (§2.14.B) — slides the window, returns the pair.

    Steps 5 (absolute `expires_at` cutoff) and 7 (idle rule) are intentionally both kept
    as defense-in-depth. Flushes only — the request boundary (`get_db`, §4.3) commits.
    """
    if not session_id:
        return None
    try:
        UUID(session_id)
    except (ValueError, TypeError):
        return None

    found = await db.execute(select(Session).where(Session.id == session_id))
    session = found.scalar_one_or_none()
    if session is None:
        return None

    now = datetime.now(UTC)
    if _as_utc(session.expires_at) < now:
        return None

    is_dev = session.user_agent == DEV_USER_AGENT
    if is_dev and not bypass_enabled:
        return None  # fail-safe: stale dev cookie cannot authenticate once bypass is off

    if (
        not is_dev
        and session.last_activity_at is not None
        and (now - _as_utc(session.last_activity_at)) > SESSION_TTL
    ):
        return None

    # Slide the window.
    session.last_activity_at = now
    if not is_dev:
        session.expires_at = now + SESSION_TTL

    found_person = await db.execute(select(Person).where(Person.id == session.person_id))
    person = found_person.scalar_one_or_none()
    if person is None:
        return None

    await db.flush()
    return person, session


async def complete_oauth_login(
    db: AsyncSession, *, code: str, ip: str | None, user_agent: str | None
) -> Session:
    """Orchestrate callback: exchange → verify → person → seed → session (§2.2 step 2)."""
    tokens = await _exchange_code_for_tokens(code)
    claims = await asyncio.to_thread(_verify_id_token, tokens["id_token"])
    if claims.get("email_verified") is not True:
        raise OAuthError("email_not_verified")
    person = await get_or_create_person(db, claims)
    await seed_household_if_needed(db, person)
    return await create_session(db, person, ip=ip, user_agent=user_agent)
