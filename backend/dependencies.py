"""Dependency injection helpers (ARCH §4.4).

`get_or_404` — household-scoped entity lookup.
Auth dependencies (`get_current_person`, `get_household_id`, `require_role`)
land in Epic 2 (Stories 2.1, 2.2, 2.4a) — documented here, NOT stubbed.
"""

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.errors import problem


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
