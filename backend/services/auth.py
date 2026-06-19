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
import logging
import secrets
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from urllib.parse import urlencode
from uuid import UUID, uuid4

import httpx
from fastapi import Response
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import get_settings
from backend.models.currency import Currency
from backend.models.identity import ApprovedOwner, Household, HouseholdInvitation, Person, Session
from backend.services.category import seed_default_categories
from backend.services.profile import parse_notification_prefs

logger = logging.getLogger(__name__)

# ── Constants (ARCH §2.3/§2.5/§2.14) ──
SESSION_COOKIE_NAME = "session_id"
SESSION_HEADER_NAME = "X-Session-Token"
DEV_SESSION_ID_HEADER = "X-Session-Id"  # response header the SPA reads in dev (§2.5)
OAUTH_STATE_COOKIE = "oauth_state"
SESSION_TTL = timedelta(minutes=30)
OAUTH_STATE_TTL = timedelta(minutes=10)
DEV_SESSION_TTL = timedelta(hours=24)
DEV_USER_AGENT = "dev-bypass"
FIRST_LOGIN_WINDOW = timedelta(minutes=2)  # isFirstLogin window after household creation (§2.14.C)

# Dev-bypass synthetic identity (ARCH §2.5) — `google_sub` is spec-fixed; the email is locked here.
DEV_GOOGLE_SUB = "dev-bypass-user-001"
DEV_BYPASS_EMAIL = "dev@localhost"

GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"  # nosec B105 (URL, not a secret)
GOOGLE_SCOPES = "openid email profile"

# ── Middleware skip-list (ARCH §2.4 / §2.11) — single source of truth ──
# Prefixes that bypass ALL middleware (§2.11); paths that mint/need no session (§2.4 b);
# the machine-to-machine job prefix (§2.4 c). Consumed by the CSRF middleware.
ALL_MIDDLEWARE_SKIP_PREFIXES = (
    "/health",
    "/static/",
    "/assets/",
    "/docs/",
    "/redoc/",
    "/openapi.json",
)
PUBLIC_AUTH_PATHS = ("/auth/login", "/auth/callback", "/auth/dev-login", "/auth/config")
JOB_PATH_PREFIX = "/jobs/"


def is_csrf_exempt(path: str) -> bool:
    """Path-only CSRF/auth-middleware exemption test (ARCH §2.4 a/b/c, §2.11).

    `/auth/me` and `/auth/logout` are intentionally NOT exempt — they require auth and
    `/auth/logout` is CSRF-protected like any mutation. The method gate lives in the
    middleware, so safe methods to non-exempt paths still get their session validated.
    """
    return (
        path.startswith(ALL_MIDDLEWARE_SKIP_PREFIXES)
        or path in PUBLIC_AUTH_PATHS
        or path.startswith(JOB_PATH_PREFIX)
    )


def set_session_cookie(response: Response, session_id: str) -> None:
    """Re-send the sliding `session_id` cookie (ARCH §2.3) — the one place its attrs live.

    Called by the CSRF middleware (validated requests) and by `get_current_person`
    (its fallback path) so the browser cookie lifetime tracks the DB `expires_at`.
    """
    response.set_cookie(
        SESSION_COOKIE_NAME,
        session_id,
        max_age=int(SESSION_TTL.total_seconds()),
        httponly=True,
        samesite="lax",
        secure=not get_settings().debug,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    """Expire the `session_id` cookie on logout (ARCH §2.14.E step 3).

    Same attrs as `set_session_cookie` but an empty value + `max_age=0`, so the cookie clears
    deterministically with matching `HttpOnly`/`SameSite`/`Secure`. One source of cookie attrs.
    """
    response.set_cookie(
        SESSION_COOKIE_NAME,
        "",
        max_age=0,
        httponly=True,
        samesite="lax",
        secure=not get_settings().debug,
        path="/",
    )


async def logout_session(db: AsyncSession, session_id: str) -> None:
    """Hard-delete the session row (ARCH §2.14.E step 2) — immediate revocation, not a soft flag.

    Idempotent: deleting a missing row is a no-op. Flush-only; the request transaction commits.
    """
    await db.execute(delete(Session).where(Session.id == session_id))


class NotInvitedError(Exception):
    """Valid Google identity with no right to a household (ARCH §2.6 step 4).

    Carries the person's `detachment_reason` so the callback can pick the right redirect
    code: `household_deleted`/`removed` → their page, else `not_invited` (§2.6 step 4, §5.8).
    """

    def __init__(self, email: str, *, detachment_reason: str | None = None) -> None:
        super().__init__(email)
        self.email = email
        self.detachment_reason = detachment_reason


class AccountArchivedError(Exception):
    """An archived Person tried to authenticate (FR-P-007, Story 2.8).

    Archive keeps `household_id` (membership intact), so this is NOT a detachment — it gets its own
    `?error=account_archived` redirect (the Account Suspended page, §5.8), distinct from the
    `detachment_reason` codes. Raised in `complete_oauth_login` before a session is minted.
    """

    def __init__(self, email: str) -> None:
        super().__init__(email)
        self.email = email


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
    """The §2.6 seed decision tree (priority order is load-bearing).

    1. Already in a household → return.
    2. Active pending invitation for this email → return leaving `household_id=NULL`
       (the frontend shows the PendingInvitationDialog). **Priority over approval.**
    3. Email ∈ active `approved_owners` → create + seed a household, `role=owner`.
    4. Else → raise `NotInvitedError` (the Person row is still persisted; no session).
    """
    if person.household_id:
        return

    now = datetime.now(UTC)
    pending = await db.execute(
        select(HouseholdInvitation).where(
            func.lower(HouseholdInvitation.invited_email) == func.lower(person.email),
            HouseholdInvitation.status == "pending",
        )
    )
    for invitation in pending.scalars():
        if _as_utc(invitation.expires_at) > now:
            return  # NULL household — pending-invitation path takes priority (§2.6 step 2)

    approved = await db.execute(
        select(ApprovedOwner).where(
            func.lower(ApprovedOwner.email) == func.lower(person.email),
            ApprovedOwner.is_active.is_(True),
        )
    )
    if approved.scalars().first() is not None:
        await _create_and_seed_household(db, person)
        return

    raise NotInvitedError(person.email, detachment_reason=person.detachment_reason)


async def _create_and_seed_household(db: AsyncSession, person: Person) -> Household:
    """Create the owner's household + seed base SGD currency + 13 default categories (§2.6).

    `SGD` / `Asia/Singapore` are defaults the first-login New Household modal (Story 2.4c)
    overrides; the server-side callback cannot prompt. Clears detachment so the person is in
    a household again. `Household.created_by` has no DB FK, but the person's UUID is already
    pre-generated, so it is set directly; the household is flushed so `household.id` exists.
    """
    display_or_email = person.display_name or person.email
    household = Household(
        name=f"{display_or_email}'s Household",
        base_currency="SGD",
        timezone="Asia/Singapore",
        created_by=person.id,
    )
    db.add(household)
    await db.flush()

    person.household_id = household.id
    person.role = "owner"
    person.can_create_household = True
    person.detachment_reason = None
    person.detached_at = None

    db.add(
        Currency(
            household_id=household.id,
            code="SGD",
            name="Singapore Dollar",
            symbol="S$",
            is_base=True,
            is_display_active=True,
            rate_to_base=Decimal("1.0"),
            fee_pct=Decimal("0"),
        )
    )
    await seed_default_categories(db, household.id, person.id)
    await db.flush()
    return household


async def seed_bootstrap_owners(db: AsyncSession) -> None:
    """Insert any `BOOTSTRAP_OWNER_EMAILS` not already approved (idempotent, insert-only, §2.7).

    Never updates or removes existing rows — removing an email from the env does NOT revoke an
    already-seeded owner (deactivate via `is_active=false` instead). Called from the app lifespan.
    """
    raw = get_settings().bootstrap_owner_emails
    emails = [e.strip() for e in raw.split(",") if e.strip()]
    if not emails:
        return

    existing = await db.execute(select(func.lower(ApprovedOwner.email)))
    present = {email for email in existing.scalars()}
    for email in emails:
        if email.lower() in present:
            continue
        db.add(ApprovedOwner(email=email, is_active=True, added_by=None))
        present.add(email.lower())
    await db.flush()


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


async def ensure_dev_session(db: AsyncSession, *, ip: str | None = None) -> Session:
    """Upsert the dev person + household + a live dev session (ARCH §2.5).

    Auto-approves the synthetic email (so the normal `get_or_create_person` +
    `seed_household_if_needed` path seeds a real household instead of raising), then reuses an
    unexpired dev session if one exists or mints a fresh one. Flushes only; the caller commits.
    """
    approved = await db.execute(
        select(ApprovedOwner).where(func.lower(ApprovedOwner.email) == DEV_BYPASS_EMAIL)
    )
    if approved.scalar_one_or_none() is None:
        db.add(
            ApprovedOwner(email=DEV_BYPASS_EMAIL, is_active=True, label="Dev bypass", added_by=None)
        )
        await db.flush()

    person = await get_or_create_person(
        db,
        {
            "sub": DEV_GOOGLE_SUB,
            "email": DEV_BYPASS_EMAIL,
            "email_verified": True,
            "name": "Dev User",
            "picture": None,
        },
    )
    await seed_household_if_needed(db, person)

    found = await db.execute(
        select(Session)
        .where(Session.person_id == person.id, Session.user_agent == DEV_USER_AGENT)
        .order_by(Session.created_at.desc())
    )
    session = found.scalars().first()
    if session is not None and _as_utc(session.expires_at) > datetime.now(UTC):
        return session
    return await create_session(db, person, ip=ip, user_agent=None, dev=True)


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

    found_person = await db.execute(select(Person).where(Person.id == session.person_id))
    person = found_person.scalar_one_or_none()
    if person is None:
        return None
    # An archived person cannot authenticate (FR-P-007) — defense-in-depth: archive deletes their
    # sessions, this rejects any surviving/raced session. Checked BEFORE the slide so a session we
    # are rejecting is never extended.
    if person.archived:
        return None

    # Slide the window.
    session.last_activity_at = now
    if not is_dev:
        session.expires_at = now + SESSION_TTL

    await db.flush()
    return person, session


def household_payload(household: Household) -> dict:
    """The §2.14.C `household` object (camelCase). Shared by `build_auth_me` and
    `PATCH /api/household` so the two never drift."""
    return {
        "householdId": household.id,
        "name": household.name,
        "baseCurrency": household.base_currency,
        "timezone": household.timezone,
    }


def person_payload(person: Person) -> dict:
    """The §2.14.C `person` object (camelCase). Shared by `build_auth_me` and `PATCH /api/profile`
    (Story 2.9) so the two never drift. Carries the appearance preferences the SPA bootstraps into
    the Epic-1 theming engine; `notificationPrefs` is the parsed, default-completed six-key object.
    Stories 2.11 (`displayFormat`) and 3.9 (`displayCurrency` editability) extend this shape."""
    return {
        "personId": person.id,
        "displayName": person.display_name,
        "email": person.email,
        "role": person.role,
        "pictureUrl": person.picture_url,
        "defaultView": person.default_view,
        "displayCurrency": person.display_currency,
        "canCreateHousehold": person.can_create_household,
        "theme": person.theme,
        "font": person.font,
        "density": person.density,
        "reduceMotion": person.reduce_motion,
        "notificationPrefs": parse_notification_prefs(person.notification_prefs),
    }


async def build_auth_me(db: AsyncSession, person: Person, session: Session) -> dict:
    """Assemble the §2.14.C `/auth/me` payload (camelCase, lockstep with `types/auth.ts`).

    Depends only on the authenticated `(person, session)` — never on household scoping, so a
    NULL-household (pending-invite) session still resolves to `household: null` + the dialog
    payload (§2.8). `household` and `pendingInvitation` are independent fields: an in-household
    person with a cross-household pending invite gets both populated (ARCH §2.8a conflict-push,
    Story 2.6c). May be reused verbatim by `POST /auth/dev-login` in a later story.
    """
    household = None
    if person.household_id is not None:
        found = await db.execute(select(Household).where(Household.id == person.household_id))
        household = found.scalar_one_or_none()

    # Computed regardless of household: a NULL-household session surfaces the accept/decline dialog,
    # while an in-household session with a (necessarily cross-household) pending invite surfaces the
    # login-time HouseholdConflictDialog (ARCH §2.8a conflict-push, Story 2.6c).
    pending_invitation = await _build_pending_invitation(db, person)

    is_first_login = (
        person.role == "owner"
        and household is not None
        and (datetime.now(UTC) - _as_utc(household.created_at)) < FIRST_LOGIN_WINDOW
    )

    return {
        "person": person_payload(person),
        "household": household_payload(household) if household is not None else None,
        "csrfToken": session.csrf_token,
        "pendingInvitation": pending_invitation,
        "isFirstLogin": is_first_login,
    }


async def _build_pending_invitation(db: AsyncSession, person: Person) -> dict | None:
    """The first active pending invite for this person's email as the §2.14.C object, else None.

    Same predicate as `seed_household_if_needed` step 2 (§2.6) — `func.lower` email match, status
    pending, not expired. `token` is the invitation id (the `/join/:token` route consumes it).
    """
    now = datetime.now(UTC)
    found = await db.execute(
        select(HouseholdInvitation)
        .where(
            func.lower(HouseholdInvitation.invited_email) == func.lower(person.email),
            HouseholdInvitation.status == "pending",
        )
        .order_by(HouseholdInvitation.created_at)  # deterministic: oldest pending invite first
    )
    for invitation in found.scalars():
        if _as_utc(invitation.expires_at) <= now:
            continue
        household = await db.execute(
            select(Household).where(Household.id == invitation.household_id)
        )
        household = household.scalar_one_or_none()
        inviter = await db.execute(select(Person).where(Person.id == invitation.invited_by))
        inviter = inviter.scalar_one_or_none()
        return {
            "token": invitation.id,
            "householdId": invitation.household_id,
            "householdName": household.name if household is not None else None,
            "invitedByDisplayName": (inviter.display_name or inviter.email) if inviter else None,
            "invitedEmail": invitation.invited_email,
            "expiresAt": _as_utc(invitation.expires_at).isoformat(),
            "status": invitation.status,
        }
    return None


async def complete_oauth_login(
    db: AsyncSession, *, code: str, ip: str | None, user_agent: str | None
) -> Session:
    """Orchestrate callback: exchange → verify → person → seed → session (§2.2 step 2)."""
    tokens = await _exchange_code_for_tokens(code)
    claims = await asyncio.to_thread(_verify_id_token, tokens["id_token"])
    if claims.get("email_verified") is not True:
        raise OAuthError("email_not_verified")
    person = await get_or_create_person(db, claims)
    # An archived member keeps household_id (membership intact), so seed would return at step 1 and
    # mint a session — block before that (FR-P-007). Own redirect (not a detachment_reason).
    if person.archived:
        raise AccountArchivedError(person.email)
    await seed_household_if_needed(db, person)
    return await create_session(db, person, ip=ip, user_agent=user_agent)
