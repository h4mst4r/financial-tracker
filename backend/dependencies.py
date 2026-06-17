"""Dependency injection helpers (ARCH §4.4).

`get_or_404` — household-scoped entity lookup.
`get_current_person` — auth dependency (Story 2.1): validates the session, stashes the
`(person, session)` tuple on `request.state.auth`, and re-sends the sliding cookie.
`get_household_id` / `require_role` still land in later Epic-2 stories (2.4a / role work).
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
    SESSION_TTL,
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
    (Story 2.2); otherwise reads the session id from the cookie first, then the
    `X-Session-Token` header (the dev-bypass fallback), validates it, stashes the
    `(person, session)` tuple on `request.state.auth`, and re-sends the sliding
    session cookie so the browser lifetime tracks `expires_at`. Raises 401 if absent.
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
    response.set_cookie(
        SESSION_COOKIE_NAME,
        session.id,
        max_age=int(SESSION_TTL.total_seconds()),
        httponly=True,
        samesite="lax",
        secure=not get_settings().debug,
        path="/",
    )
    return person
