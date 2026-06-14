"""Shared service helpers and generic entity template (ARCH §4.10).

This module holds ONLY genuinely shared helpers — not a generic CRUD base class.
The project uses one explicit service module + one router per entity, reproduced
from the template documented below.
"""

import logging
from typing import Any, TypeVar

from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend import errors

logger = logging.getLogger(__name__)

T = TypeVar("T")


# ─── Shared Helpers ───


def assert_can_modify(row: Any, actor_id: str, role: str) -> None:
    """Ownership check: Member edits only own rows; Admin/Owner edit any.

    'Own' = `created_by` (authoritative). Bypassed for Admin/Owner roles.
    """
    if role in ("admin", "owner"):
        return  # Admin/Owner can modify any row
    if row.created_by != actor_id:
        errors.forbidden("You can only modify your own records")


async def assert_no_dependencies(
    db: AsyncSession,
    referrers: list[tuple[Any, str]],
    entity_id: str,
    entity_type: str = "entity",
) -> None:
    """Check if entity has downstream references.

    Args:
        db: AsyncSession.
        referrers: List of (Model, column_name) tuples to check.
        entity_id: The entity ID being deleted.
        entity_type: Human-readable entity type for error message.

    Raises:
        HTTPException 409 if any referrer count is non-zero.
    """
    referrer_names = []
    for model, col_name in referrers:
        stmt = select(exists().where(getattr(model, col_name) == entity_id))
        result = await db.execute(stmt)
        if result.scalar_one():
            referrer_names.append(model.__tablename__)

    if referrer_names:
        errors.has_dependencies(
            entity_type=entity_type,
            referrers=referrer_names,
        )


# ─── Generic Entity Template (Reference) ───
#
# This is the canonical pattern every entity follows. Do NOT build a generic
# CRUD base class — each entity gets one explicit service module + one router.
#
# Service template:
#
# ```python
# async def create_<e>(db, household_id, actor_id, data: <E>Create) -> <E>:
#     # 1. Validate business rules
#     # 2. Build entity instance
#     obj = <E>(household_id=household_id, created_by=actor_id, **data.model_dump())
#     db.add(obj)
#     await db.flush()  # Get PK
#     await audit.log(db, household_id=household_id, actor_id=actor_id,
#                     action="create", entity_type="<e>", entity_id=str(obj.id),
#                     before=None, after=_scalar_snapshot(obj))
#     return obj
#
#
# async def update_<e>(db, household_id, actor_id, e_id, data: <E>Update) -> <E>:
#     obj = await get_or_404(db, <E>, e_id, household_id=household_id)
#     assert_can_modify(obj, actor_id, role)  # If role-based
#     before = _scalar_snapshot(obj)
#     for key, value in data.model_dump(exclude_unset=True).items():
#         setattr(obj, key, value)
#     await db.flush()
#     await audit.log(db, household_id=household_id, actor_id=actor_id,
#                     action="update", entity_type="<e>", entity_id=str(obj.id),
#                     before=before, after=_scalar_snapshot(obj))
#     return obj
#
#
# async def archive_<e>(db, household_id, actor_id, e_id) -> <E>:
#     obj = await get_or_404(db, <E>, e_id, household_id=household_id)
#     before = _scalar_snapshot(obj)
#     obj.status = "archived"
#     obj.archived = True
#     obj.archived_at = datetime.now(UTC)
#     obj.archived_by = actor_id
#     await db.flush()
#     await audit.log(db, household_id=household_id, actor_id=actor_id,
#                     action="archive", entity_type="<e>", entity_id=str(obj.id),
#                     before=before, after=_scalar_snapshot(obj))
#     return obj
#
#
# async def restore_<e>(db, household_id, actor_id, e_id) -> <E>:
#     obj = await get_or_404(db, <E>, e_id, household_id=household_id)
#     before = _scalar_snapshot(obj)
#     obj.status = "active"
#     obj.archived = False
#     obj.archived_at = None
#     obj.archived_by = None
#     await db.flush()
#     await audit.log(db, household_id=household_id, actor_id=actor_id,
#                     action="restore", entity_type="<e>", entity_id=str(obj.id),
#                     before=before, after=_scalar_snapshot(obj))
#     return obj
#
#
# async def delete_<e>(db, household_id, actor_id, e_id) -> None:
#     obj = await get_or_404(db, <E>, e_id, household_id=household_id)
#     # Check dependencies before hard delete
#     await assert_no_dependencies(db, [
#         (ReferrerModel, "referrer_column"),
#     ], str(e_id), entity_type="<e>")
#     await db.delete(obj)
#     await db.flush()
#     # Hard-delete: INFO log, NOT an audit row
#     logger.info(
#         "hard_delete_<e>",
#         extra={"household_id": str(household_id), "entity_id": str(e_id)},
#     )
# ```
#
# Router template (static paths BEFORE `/{id}`):
#
# ```
# GET    /api/<es>            -> {"items":[...], "total":N}
# POST   /api/<es>            -> 201 <E>Response
# GET    /api/<es>/{id}       -> <E>Response
# PATCH  /api/<es>/{id}       -> <E>Response
# POST   /api/<es>/{id}/archive | /restore
# DELETE /api/<es>/{id}       -> 204
# ```
#
# Schema convention (3 per entity):
# - `<Entity>Create` — all required fields
# - `<Entity>Update` — all optional, partial via `model_dump(exclude_unset=True)`
# - `<Entity>Response` — `model_config={"from_attributes": True}`
