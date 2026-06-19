"""Profile transport (ARCH §2.14.C, Story 2.9).

`PATCH /api/profile` — the per-person self-edit of profile & appearance preferences. It mutates
ONLY the authenticated person (via `get_writable_person`, never a body-supplied id) and returns the
updated §2.14.C person object (`person_payload`, camelCase) so the SPA can refresh its store. No
household scoping and no role gate (a personal preference; any authenticated member edits own); the
PATCH is CSRF-protected by the middleware (mutating verb). Display currency (Story 3.9) and date
format (Story 2.11) are not writable here.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.dependencies import get_writable_person
from backend.models.identity import Person
from backend.schemas.profile import ProfileUpdate
from backend.services import profile as profile_service
from backend.services.auth import person_payload

router = APIRouter(prefix="/api", tags=["profile"])


@router.patch("/profile")
async def update_my_profile(
    data: ProfileUpdate,
    person: Person = Depends(get_writable_person),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Apply a partial profile update to the current person; return the §2.14.C person."""
    await profile_service.update_profile(db, person, data)
    return person_payload(person)
