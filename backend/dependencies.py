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

from uuid import UUID

from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend import errors
from backend.config import get_settings
from backend.database import get_db
from backend.errors import problem
from backend.models.identity import Person
from backend.services.auth import (
    SESSION_COOKIE_NAME,
    SESSION_HEADER_NAME,
    set_session_cookie,
    validate_session,
)


async def get_or_404(
    db: AsyncSession,
    model: type,
    id: UUID | str,
    *,
    household_id: UUID | str,
) -> object:
    """Fetch an entity by PK, scoped to `household_id`.

    Raises 404 if entity is missing OR belongs to another household.
    """
    stmt = select(model).where(model.id == str(id), model.household_id == str(household_id))
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=404,
            detail=problem(
                type_="not_found",
                title="Not found",
                status=404,
                detail="Resource not found or not accessible",
            ),
        )
    return row


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
