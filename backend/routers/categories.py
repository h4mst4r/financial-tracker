"""Category transport (ARCH §3.7, Stories 3.1 + 3.2).

`GET /api/categories` + `GET /api/categories/{id}` — household-scoped reads, any member
(FR-HH-002). `POST /api/categories` + `PATCH /api/categories/{id}` — create/edit, admin/owner only
(ARCH §2.8: admin manages categories). Story 3.2 adds `POST .../{id}/archive` (branch cascade,
FR-C-005), `.../restore`, `.../move` (promote/re-parent, FR-C-003) and `DELETE .../{id}`
(hard-delete-if-empty, FR-C-006) — all admin-gated. Scoping is always `get_household_id` (the
session's household, never the body); the service receives `(db, household_id, actor_id, …)`.

Bulk + merge (Story 3.4) and the "Create defaults" recovery button (Story 3.3) are deliberately
NOT here. Snake_case wire (generic-entity surface, not the §2.14.C camelCase exception).
"""

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.dependencies import get_household_id, require_role
from backend.models.budget import Category
from backend.models.identity import Person
from backend.schemas.category import (
    CategoryCreate,
    CategoryListOut,
    CategoryMove,
    CategoryResponse,
    CategoryUpdate,
)
from backend.services import category as category_service

router = APIRouter(prefix="/api", tags=["categories"])

# Module-level singleton so `require_role(...)` isn't a call in an argument default (ruff B008).
_require_admin = require_role("admin")


async def _to_response(db: AsyncSession, household_id: str, cat: Category) -> CategoryResponse:
    """Build a `CategoryResponse` with the computed `can_delete`/reason (UX §8.1) for one row."""
    reason = await category_service.single_delete_blocker(db, household_id, str(cat.id))
    return CategoryResponse.model_validate(cat).model_copy(
        update={"can_delete": reason is None, "delete_blocked_reason": reason}
    )


@router.get("/categories")
async def list_categories(
    include_archived: bool = False,
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> CategoryListOut:
    """The household's categories as a flat list (any member). Pass `?include_archived=true` to
    include archived rows; the frontend assembles the 2-level tree by `parent_id`. `can_delete` is
    computed from a single batched dependency scan (no per-row counts)."""
    categories = await category_service.list_categories(
        db, household_id, include_archived=include_archived
    )
    blockers = await category_service.delete_blockers(db, household_id)
    items = [
        CategoryResponse.model_validate(c).model_copy(
            update={
                "can_delete": str(c.id) not in blockers,
                "delete_blocked_reason": blockers.get(str(c.id)),
            }
        )
        for c in categories
    ]
    return CategoryListOut(items=items, total=len(items))


@router.post("/categories", status_code=201)
async def create_category(
    data: CategoryCreate,
    person: Person = Depends(_require_admin),
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> CategoryResponse:
    """Create a category/subcategory (admin/owner). 400 on bad type / grandchild nesting; 409 on a
    duplicate name; 404 on an unknown parent."""
    category = await category_service.create_category(db, household_id, person.id, data)
    return await _to_response(db, household_id, category)


@router.get("/categories/{category_id}")
async def get_category(
    category_id: str,
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> CategoryResponse:
    """A single household-scoped category (any member). 404 incl. cross-household."""
    category = await category_service.get_category(db, household_id, category_id)
    return await _to_response(db, household_id, category)


@router.patch("/categories/{category_id}")
async def patch_category(
    category_id: str,
    data: CategoryUpdate,
    person: Person = Depends(_require_admin),
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> CategoryResponse:
    """Edit a category (admin/owner). 404 cross-household; 400 bad type; 409 dup name."""
    category = await category_service.update_category(
        db, household_id, person.id, category_id, data
    )
    return await _to_response(db, household_id, category)


@router.post("/categories/{category_id}/archive")
async def archive_category(
    category_id: str,
    person: Person = Depends(_require_admin),
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> CategoryResponse:
    """Archive a category, cascading the whole branch (admin/owner; FR-C-005). 200, never 409."""
    category = await category_service.archive_category(db, household_id, person.id, category_id)
    return await _to_response(db, household_id, category)


@router.post("/categories/{category_id}/restore")
async def restore_category(
    category_id: str,
    person: Person = Depends(_require_admin),
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> CategoryResponse:
    """Restore an archived category and its branch (admin/owner; FR-C-005)."""
    category = await category_service.restore_category(db, household_id, person.id, category_id)
    return await _to_response(db, household_id, category)


@router.post("/categories/{category_id}/move")
async def move_category(
    category_id: str,
    data: CategoryMove,
    person: Person = Depends(_require_admin),
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> CategoryResponse:
    """Promote (`parent_id=null`) or re-parent (`parent_id=<top-level>`) a category (admin/owner;
    FR-C-003). 400 if it would create a 3rd level; 404 cross-household / unknown parent."""
    category = await category_service.move_category(
        db, household_id, person.id, category_id, data.parent_id
    )
    return await _to_response(db, household_id, category)


@router.delete("/categories/{category_id}", status_code=204)
async def delete_category(
    category_id: str,
    person: Person = Depends(_require_admin),
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Hard-delete an empty category (admin/owner; FR-C-006). 204 if no deps; 409 otherwise."""
    await category_service.delete_category(db, household_id, person.id, category_id)
    return Response(status_code=204)
