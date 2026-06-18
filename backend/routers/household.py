"""Household configuration transport (ARCH §2.8).

`PATCH /api/household` — owner-scoped, household-scoped name/timezone update (Story 2.4c). Reused by
the Settings → Management tab (Story 2.5). Mutating route → CSRF-protected by the middleware (not
exempt). Base-currency change is Epic 3 (FR-CU-005). First consumer of `get_household_id` /
`require_role`.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.dependencies import get_household_id, require_role
from backend.models.identity import Person
from backend.schemas.household import HouseholdUpdate
from backend.services import auth as auth_service
from backend.services import household as household_service

router = APIRouter(prefix="/api", tags=["household"])

# Module-level singleton so `require_role("owner")` isn't a call in an argument default (ruff B008).
_require_owner = require_role("owner")


@router.patch("/household")
async def patch_household(
    data: HouseholdUpdate,
    person: Person = Depends(_require_owner),
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update household name/timezone (owner only); return the §2.14.C household object (ARCH §2.8).

    Scoping is `get_household_id` (the session's household, never the body); the owner gate is
    `require_role`. A non-owner gets 403; a NULL-household session gets 401.
    """
    household = await household_service.update_household(db, household_id, person.id, data)
    return auth_service.household_payload(household)
