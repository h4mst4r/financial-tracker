"""Entity-preference service (ARCH §3, FR-E-021, Story 4.12).

Per-person favourite + manual sort for any EntityCard list. Everything is scoped to `person.id`
(never the request body — backend.md §1.4). The upsert is a **partial merge** keyed on
`model_fields_set`: only the fields the client actually sent are applied, so `setFavourite` can't
wipe a stored `sort_order` and vice-versa. `sort_order=None` is a real value (no manual order),
which is exactly why the merge keys on *which fields were sent*, not on null-ness.
"""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.identity import Person
from backend.models.system import EntityPreference
from backend.schemas.entity_preference import EntityPreferenceUpsert


async def list_for_person(
    db: AsyncSession, person: Person, entity_type: str
) -> list[EntityPreference]:
    """Every preference row this person has set for `entity_type`."""
    result = await db.execute(
        select(EntityPreference)
        .where(EntityPreference.person_id == person.id)
        .where(EntityPreference.entity_type == entity_type)
    )
    return list(result.scalars().all())


async def _find(
    db: AsyncSession, person: Person, data: EntityPreferenceUpsert
) -> EntityPreference | None:
    return (
        await db.execute(
            select(EntityPreference)
            .where(EntityPreference.person_id == person.id)
            .where(EntityPreference.entity_type == data.entity_type)
            .where(EntityPreference.entity_id == data.entity_id)
        )
    ).scalar_one_or_none()


async def upsert(
    db: AsyncSession, person: Person, data: EntityPreferenceUpsert
) -> EntityPreference:
    """Insert or partial-merge the `(person, entity_type, entity_id)` row, applying ONLY the fields
    the client sent (`exclude_unset`). Favourite + sort are mutated independently."""
    provided = data.model_dump(exclude_unset=True, exclude={"entity_type", "entity_id"})
    row = await _find(db, person, data)
    if row is not None:
        for field, value in provided.items():
            setattr(row, field, value)
        await db.commit()
        await db.refresh(row)
        return row

    row = EntityPreference(
        person_id=person.id,
        entity_type=data.entity_type,
        entity_id=data.entity_id,
        is_favourite=False,
    )
    for field, value in provided.items():
        setattr(row, field, value)
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        # A concurrent first-write (e.g. a double-clicked star) won the INSERT race on the UNIQUE
        # (person, entity_type, entity_id) key — merge into the now-existing row instead of 500ing.
        await db.rollback()
        row = await _find(db, person, data)
        for field, value in provided.items():
            setattr(row, field, value)
        await db.commit()
    await db.refresh(row)
    return row
