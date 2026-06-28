"""Entity-preference schemas (ARCH §3 `entity_preferences`, FR-E-021, Story 4.12).

Per-person favourite + manual sort for any EntityCard list. Snake_case wire (generic-entity surface,
like `category.py`). **`person_id` is NEVER on the wire** — the server derives it from the session
and scopes the `UNIQUE(person_id, entity_type, entity_id)` row to it (the per-person isolation
guarantee, backend.md §1.4). The upsert is a **partial merge**: an omitted field leaves the stored
value unchanged (a full-row replace would wipe the user's sort when they favourite).
"""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints

# Non-empty, whitespace-stripped key — a blank entity_type/entity_id would persist a junk row the
# UNIQUE constraint can't catch (empty strings are distinct valid keys). Capped at the wider of the
# two backing columns (entity_type String(50); entity_id String(36) ⊂ 50) so an oversized key 422s.
_Key = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]


class EntityPreferenceUpsert(BaseModel):
    entity_type: _Key
    entity_id: _Key
    is_favourite: bool | None = None
    sort_order: int | None = None


class EntityPreferenceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    entity_type: str
    entity_id: str
    is_favourite: bool
    sort_order: int | None


class EntityPreferenceListOut(BaseModel):
    items: list[EntityPreferenceOut]
    total: int
