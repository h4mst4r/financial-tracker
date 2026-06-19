"""Category transport (ARCH §3.7, Story 3.1).

`GET /api/categories` + `GET /api/categories/{id}` — household-scoped reads, any member
(FR-HH-002). `POST /api/categories` + `PATCH /api/categories/{id}` — create/edit, admin/owner only
(ARCH §2.8: admin manages categories). Scoping is always `get_household_id` (the session's
household, never the body); the service receives `(db, household_id, actor_id, …)`.

Archive/restore/promote/re-parent/delete (Story 3.2), bulk + merge (Story 3.4), and the
"Create defaults" recovery button (Story 3.3) are deliberately NOT here. Snake_case wire
(generic-entity surface, not the §2.14.C camelCase exception).
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.dependencies import get_household_id, require_role
from backend.models.identity import Person
from backend.schemas.category import (
    CategoryCreate,
    CategoryListOut,
    CategoryResponse,
    CategoryUpdate,
)
from backend.services import category as category_service

router = APIRouter(prefix="/api", tags=["categories"])

# Module-level singleton so `require_role(...)` isn't a call in an argument default (ruff B008).
_require_admin = require_role("admin")


@router.get("/categories")
async def list_categories(
    include_archived: bool = False,
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> CategoryListOut:
    """The household's categories as a flat list (any member). Pass `?include_archived=true` to
    include archived rows; the frontend assembles the 2-level tree by `parent_id`."""
    categories = await category_service.list_categories(
        db, household_id, include_archived=include_archived
    )
    items = [CategoryResponse.model_validate(c) for c in categories]
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
    return CategoryResponse.model_validate(category)


@router.get("/categories/{category_id}")
async def get_category(
    category_id: str,
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> CategoryResponse:
    """A single household-scoped category (any member). 404 incl. cross-household."""
    category = await category_service.get_category(db, household_id, category_id)
    return CategoryResponse.model_validate(category)


@router.patch("/categories/{category_id}")
async def patch_category(
    category_id: str,
    data: CategoryUpdate,
    person: Person = Depends(_require_admin),
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> CategoryResponse:
    """Edit a category (admin/owner). 404 cross-household; 400 bad type/parent; 409 dup name."""
    category = await category_service.update_category(
        db, household_id, person.id, category_id, data
    )
    return CategoryResponse.model_validate(category)
