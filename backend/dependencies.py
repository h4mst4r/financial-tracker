"""FastAPI dependency injection functions.

Provides reusable dependencies for authentication, authorization,
and entity lookups that can be composed in route handlers.
"""

from uuid import UUID

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .database import get_db as _get_db_session
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

def get_db() -> AsyncSession:
    """Alias for the async DB session dependency.

    Returns:
        AsyncSession yielding a transaction-scoped session.
    """
    return _get_db_session()


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------

async def get_current_person(
    db: AsyncSession = Depends(get_db),
) -> Person:
    """Return the authenticated person from request state.

    Raises:
        HTTPException: 401 if no person is attached to the request.
    """
    # Import here to avoid circular imports at module load time.
    from starlette.requests import Request

    # This dependency is called inside a request context — we need access
    # to request.state.person which was set by AuthMiddleware.
    # FastAPI's Depends chain doesn't give us the Request directly, so we
    # use a workaround: inject Request as a dependency.
    raise NotImplementedError(
        "Use get_current_person_with_request() instead."
    )


async def get_current_person_with_request(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Person:
    """Return the authenticated person injected by AuthMiddleware.

    Args:
        request: FastAPI request (provides access to request.state).
        db: Database session (reserved for future use).

    Raises:
        HTTPException: 401 if person is missing from request state.
    """
    person = getattr(request.state, "person", None)
    if person is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return person


# ---------------------------------------------------------------------------
# Household context
# ---------------------------------------------------------------------------

async def get_household_id(
    person: Person = Depends(get_current_person_with_request),
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
        person: Person = Depends(get_current_person_with_request),
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
    model_type: type,
    entity_id: UUID,
) -> object:
    """Fetch an entity by primary key or raise 404.

    Args:
        db: Active database session.
        model_type: SQLAlchemy ORM model class.
        entity_id: Primary key UUID to look up.

    Returns:
        The loaded model instance.

    Raises:
        HTTPException: 404 if entity doesn't exist.
    """
    result = await db.execute(
        select(model_type).where(model_type.id == entity_id)
    )
    instance = result.scalar_one_or_none()
    if instance is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{model_type.__name__} {entity_id} not found",
        )
    return instance
