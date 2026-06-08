"""FastAPI dependency injection functions.

Provides reusable dependencies for authentication, authorization,
and entity lookups that can be composed in route handlers.
"""

from typing import AsyncGenerator
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .database import async_session_factory
from .models.person import Person


# Role hierarchy — higher number = more privilege.
_ROLE_HIERARCHY = {
    "member": 1,
    "admin": 2,
    "owner": 3,
}


# ---------------------------------------------------------------------------
# Database session
# ---------------------------------------------------------------------------

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Async generator dependency — yields a committed (or rolled-back) session."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------

async def get_current_person(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Person:
    """Validate the session cookie and return the authenticated person.

    Performs the DB lookup directly rather than reading from request.state,
    avoiding ASGI scope/state propagation issues across middleware layers.

    Raises:
        HTTPException: 401 if no session, invalid/expired session, or person archived.
    """
    from .middleware.auth_middleware import validate_session, SESSION_COOKIE_NAME

    # Cookie takes priority over header, matching CSRFMiddleware's resolution order.
    # The X-Session-Token header is a dev-mode fallback (Vite proxy strips Set-Cookie).
    # In production: cookie always used, header never sent.
    # In dev: if cookie exists (OAuth login), use it. Fall back to header only when
    # no cookie is present (pure dev-bypass flow where proxy stripped the cookie).
    cookie_session_id = request.cookies.get(SESSION_COOKIE_NAME)
    header_session_id = request.headers.get("X-Session-Token")
    result = await validate_session(cookie_session_id) if cookie_session_id else None
    if result is None and header_session_id:
        result = await validate_session(header_session_id)

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    person, session_obj = result

    # Stash session on request.state so route handlers can read the CSRF token
    if "state" not in request.scope:
        request.scope["state"] = {}
    request.scope["state"]["session"] = session_obj

    if getattr(person, "archived", False):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is disabled",
        )
    return person


# ---------------------------------------------------------------------------
# Household context
# ---------------------------------------------------------------------------

async def get_household_id(
    person: Person = Depends(get_current_person),
) -> UUID:
    """Return the household ID of the authenticated person.

    Raises:
        HTTPException: 401 if person has no household assigned.
    """
    if person.household_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No household context",
        )
    return person.household_id


# ---------------------------------------------------------------------------
# Authorization
# ---------------------------------------------------------------------------

def require_role(minimum_role: str):
    """Factory: dependency that enforces a minimum role level.

    Args:
        minimum_role: Required role — "member", "admin", or "owner".

    Returns:
        Dependency that returns the current Person if authorized.

    Raises:
        HTTPException: 403 if person's role is below the threshold.
    """
    min_level = _ROLE_HIERARCHY.get(minimum_role, 1)

    async def _check_role(
        person: Person = Depends(get_current_person),
    ) -> Person:
        person_level = _ROLE_HIERARCHY.get(person.role, 0)
        if person_level < min_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{minimum_role}' or higher required",
            )
        return person

    return _check_role


# ---------------------------------------------------------------------------
# Entity lookup helper
# ---------------------------------------------------------------------------

async def _get_or_404(
    db: AsyncSession,
    household_id: UUID,
    entity_id: UUID,
    model_type: type,
) -> object:
    """Fetch a household-scoped entity by primary key or raise 404.

    Args:
        db: Active database session.
        household_id: Owning household — entity must belong to this household.
        entity_id: Primary key UUID to look up.
        model_type: SQLAlchemy ORM model class.

    Returns:
        The loaded model instance.

    Raises:
        HTTPException: 404 if entity doesn't exist or belongs to another household.
    """
    result = await db.execute(
        select(model_type).where(
            model_type.id == entity_id,
            model_type.household_id == household_id,
        )
    )
    instance = result.scalar_one_or_none()
    if instance is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{model_type.__name__} {entity_id} not found",
        )
    return instance
