"""Profile transport (ARCH §2.14.C, Story 2.9).

`PATCH /api/profile` — the per-person self-edit of profile & appearance preferences. It mutates
ONLY the authenticated person (via `get_writable_person`, never a body-supplied id) and returns the
updated §2.14.C person object (`person_payload`, camelCase) so the SPA can refresh its store. No
household scoping and no role gate (a personal preference; any authenticated member edits own); the
PATCH is CSRF-protected by the middleware (mutating verb). Display currency (Story 3.9, validated
against the household's display-active currencies) and date format (Story 2.11) are writable here.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.dependencies import get_current_person, get_writable_person
from backend.models.identity import Person
from backend.schemas.profile import ProfileUpdate, RecentGlyphPush, RecentGlyphsOut
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


@router.get("/profile/recent-glyphs")
async def get_recent_glyphs(
    person: Person = Depends(get_current_person),
) -> RecentGlyphsOut:
    """The current person's last-8 picked glyphs for the EmojiIconPicker Recent row (UX §8.3)."""
    return RecentGlyphsOut(glyphs=profile_service.get_recent_glyphs(person))


@router.post("/profile/recent-glyphs")
async def push_recent_glyph(
    data: RecentGlyphPush,
    person: Person = Depends(get_writable_person),
    db: AsyncSession = Depends(get_db),
) -> RecentGlyphsOut:
    """Push a picked glyph to the front of the person's Recent list (dedupe, cap 8). CSRF-protected
    (mutating). `get_writable_person` so the write lands on the route session (backend.md §1.4)."""
    glyphs = await profile_service.push_recent_glyph(db, person, data.glyph)
    return RecentGlyphsOut(glyphs=glyphs)
