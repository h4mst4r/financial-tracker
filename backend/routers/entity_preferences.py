"""Entity-preference transport (ARCH §3 `entity_preferences`, FR-E-021, Story 4.12).

`GET /api/entity-preferences?entity_type=...` — the current person's favourite/sort rows for one
entity type (the first consumer is the accounts favourite star). `PUT /api/entity-preferences` —
partial-merge upsert of one row (CSRF-protected; `get_writable_person` so the write lands on the
route session). Per-PERSON, not household-scoped: `person_id` always comes from the session, never
the body (the per-person isolation guarantee, backend.md §1.4 / §2). Snake_case wire,
`{items, total}` list shape. The `/reorder` route the frontend hook also declares has no consumer
yet (no drag-reorder surface) — intentionally not built.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.dependencies import get_current_person, get_writable_person
from backend.models.identity import Person
from backend.schemas.entity_preference import (
    EntityPreferenceListOut,
    EntityPreferenceOut,
    EntityPreferenceUpsert,
)
from backend.services import entity_preference as entity_preference_service

router = APIRouter(prefix="/api", tags=["entity-preferences"])


@router.get("/entity-preferences")
async def list_entity_preferences(
    entity_type: str,
    person: Person = Depends(get_current_person),
    db: AsyncSession = Depends(get_db),
) -> EntityPreferenceListOut:
    """The current person's preference rows for `entity_type` (any member; per-person)."""
    rows = await entity_preference_service.list_for_person(db, person, entity_type)
    items = [EntityPreferenceOut.model_validate(r) for r in rows]
    return EntityPreferenceListOut(items=items, total=len(items))


@router.put("/entity-preferences")
async def upsert_entity_preference(
    data: EntityPreferenceUpsert,
    person: Person = Depends(get_writable_person),
    db: AsyncSession = Depends(get_db),
) -> EntityPreferenceOut:
    """Partial-merge upsert one favourite/sort row for the current person (CSRF-protected)."""
    row = await entity_preference_service.upsert(db, person, data)
    return EntityPreferenceOut.model_validate(row)
