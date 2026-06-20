"""Dependency injection helpers (ARCH §4.4).

`get_or_404` — household-scoped entity lookup.
`get_current_person` — auth dependency. As of Story 2.2 the single per-request
`validate_session` + sliding-cookie re-send live in the CSRF middleware; this dependency
is primarily a `request.state.auth` reader, falling back to validate-and-set-cookie for
CSRF-exempt routes the middleware skipped.
`get_household_id` / `require_role` — household-scoping + role-gate seams (ARCH §2.8); first
consumers are Story 2.4c's `PATCH /api/household` (owner-scoped). Both depend only on
`get_current_person`.
"""

import asyncio
import hmac

from fastapi import Depends, Request, Response
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend import errors
from backend.config import get_settings
from backend.database import get_db
from backend.db_utils import get_or_404
from backend.models.identity import Person
from backend.services.auth import (
    SESSION_COOKIE_NAME,
    SESSION_HEADER_NAME,
    set_session_cookie,
    validate_session,
)

# Re-exported for transport-layer callers that import it from here (the historical home). The
# implementation now lives in `db_utils` so services can use it without an import cycle.
__all__ = [
    "get_or_404",
    "get_current_person",
    "get_writable_person",
    "get_household_id",
    "get_job_auth",
    "require_role",
]


async def get_current_person(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> Person:
    """Resolve the authenticated person (ARCH §2.1/§2.3/§2.4).

    Reads `request.state.auth` if the CSRF middleware already validated the session
    (the normal path, Story 2.2). On the fallback path — a CSRF-exempt request the
    middleware skipped — reads the session id from the cookie first, then the
    `X-Session-Token` header, validates it, stashes the `(person, session)` tuple on
    `request.state.auth`, and re-sends the sliding session cookie so the browser
    lifetime tracks `expires_at`. Raises 401 if absent.
    """
    cached = getattr(request.state, "auth", None)
    if cached is not None:
        return cached[0]

    session_id = request.cookies.get(SESSION_COOKIE_NAME) or request.headers.get(
        SESSION_HEADER_NAME
    )
    result = await validate_session(
        db, session_id, bypass_enabled=get_settings().auth_bypass_enabled
    )
    if result is None:
        errors.unauthorized(instance=request.url.path)

    person, session = result
    request.state.auth = result
    set_session_cookie(response, session.id)
    return person


async def get_writable_person(
    person: Person = Depends(get_current_person),
    db: AsyncSession = Depends(get_db),
) -> Person:
    """Re-load the current person on the route `db` so a route can **mutate** it (backend.md §1.4).

    `get_current_person` hands back a Person attached to the CSRF middleware's already-closed
    session (detached). Reads are fine, but `person.x = …; await db.flush()` silently no-ops on a
    detached object. A route that mutates the *current* person (Story 2.7 leave; future
    self-mutating routes) depends on this instead, so the write lands on the live transaction.
    """
    return (await db.execute(select(Person).where(Person.id == person.id))).scalar_one()


# Role hierarchy (ARCH §2.8): higher rank == more authority.
ROLE_RANK = {"member": 1, "admin": 2, "owner": 3}


async def get_household_id(person: Person = Depends(get_current_person)) -> str:
    """Return the authenticated person's `household_id`, raising 401 if NULL (ARCH §2.8).

    Household-scoped routes depend on this; services receive `household_id` as their first
    positional argument — never trust a request body for scoping. A NULL-household session
    (pending-invitation user, §2.6 step 2) correctly 401s here.
    """
    if person.household_id is None:
        errors.unauthorized(detail="No household for this session")
    return person.household_id


def require_role(min_role: str):
    """Dependency factory enforcing a minimum household role (ARCH §2.8); 403 below threshold."""

    async def _require_role(person: Person = Depends(get_current_person)) -> Person:
        if ROLE_RANK[person.role] < ROLE_RANK[min_role]:
            errors.forbidden(detail=f"This action requires the {min_role} role")
        return person

    return _require_role


def _verify_job_oidc(token: str) -> str | None:
    """Verify a Google-signed OIDC token for `/jobs/*`; return the `email` claim or None.

    Audience is the service's own URL (`SERVICE_URL`); google-auth checks signature + `aud` +
    expiry (10 s skew). Any failure (bad signature, wrong audience, expired, malformed) is a
    fall-through to the shared-bearer path — never a 500. The caller checks the email claim.
    """
    settings = get_settings()
    if not settings.service_url:
        return None
    try:
        claims = google_id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            audience=settings.service_url,
            clock_skew_in_seconds=10,
        )
    except Exception:  # noqa: BLE001 — any verification failure falls through to the bearer path
        return None
    return claims.get("email")


async def get_job_auth(request: Request) -> None:
    """Authorize a `/jobs/*` request — OIDC primary, shared-bearer fallback (ARCH §5.6).

    Unlike every other auth path this touches **no** session/CSRF/cookie/Person/household: the
    job invoker is Cloud Scheduler (OIDC) or a local/manual `curl` (shared bearer), not a member.
    The CSRF middleware already skip-lists `/jobs/*` (§2.4). Raises 401 if neither path authorizes.
    """
    settings = get_settings()
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        errors.unauthorized(instance=request.url.path)

    # OIDC (production): Google-signed token whose audience is SERVICE_URL and whose service
    # account email is JOB_INVOKER_SA. Verification runs off the event loop (CPU-bound crypto).
    email = await asyncio.to_thread(_verify_job_oidc, token)
    if email is not None and settings.job_invoker_sa and email == settings.job_invoker_sa:
        return

    # Shared bearer (local / manual trigger): constant-time match against SERVICE_ACCOUNT_KEY.
    # Compare as bytes — a non-ASCII header into hmac.compare_digest(str, str) raises TypeError.
    if settings.service_account_key and hmac.compare_digest(
        token.encode("utf-8"), settings.service_account_key.encode("utf-8")
    ):
        return

    errors.unauthorized(instance=request.url.path)
