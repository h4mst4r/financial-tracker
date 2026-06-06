"""Category CRUD and hierarchy endpoints.

Endpoints:
    GET    /api/categories                  — Flat list with filters
    GET    /api/categories/tree             — Nested tree structure
    POST   /api/categories                  — Create category
    GET    /api/categories/{id}/spending-summary — Spending totals (stub)
    PATCH  /api/categories/{id}/reassign-children — Bulk reassign subcategories
    PATCH  /api/categories/{id}             — Update category
    POST   /api/categories/{id}/archive     — Soft-delete + promote children
    POST   /api/categories/{id}/restore     — Restore archived category
    DELETE /api/categories/{id}             — Hard delete

Route ordering: static paths (/tree) are declared BEFORE parameterized /{id}
to prevent FastAPI matching static segments as UUID values.
"""

from datetime import date
from typing import Any, Dict, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.dependencies import get_current_person, get_household_id
from backend.models.category import Category
from backend.models.person import Person
from backend.schemas.category import CategoryCreate, CategoryResponse, CategoryUpdate, ReassignChildrenRequest
from backend.services.category_service import (
    archive_category,
    create_category,
    delete_category,
    restore_category,
    update_category,
)

router = APIRouter(tags=["categories"])


# ---------------------------------------------------------------------------
# List Endpoints — static paths BEFORE /{id}
# ---------------------------------------------------------------------------


@router.get("/categories")
async def list_categories(
    include_archived: bool = Query(False),
    top_level: bool = Query(False),
    parent_id: UUID | None = Query(None),
    household_id: UUID = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Flat list of categories with optional filters."""
    conditions = [Category.household_id == household_id]

    if not include_archived:
        conditions.append(Category.archived == False)

    if top_level:
        conditions.append(Category.parent_id.is_(None))

    if parent_id is not None:
        conditions.append(Category.parent_id == parent_id)

    # Fetch all matching categories (sorted alphabetically, case-insensitive)
    stmt = select(Category).where(*conditions).order_by(func.lower(Category.name))
    result = await db.execute(stmt)
    categories = result.scalars().all()

    # Compute children_count via single aggregated query — scoped to household
    count_conditions = [Category.parent_id.isnot(None), Category.household_id == household_id]
    if not include_archived:
        count_conditions.append(Category.archived == False)
    counts_result = await db.execute(
        select(Category.parent_id, func.count()).where(*count_conditions).group_by(Category.parent_id)
    )
    children_counts: Dict[UUID, int] = dict(counts_result.all())

    # Build parent lookup for parent_name — start with current result set
    parent_lookup: Dict[UUID, str] = {cat.id: cat.name for cat in categories}

    # If filtering by parent_id, the parent is NOT in the result set — fetch it
    if parent_id is not None:
        parent_result = await db.execute(
            select(Category.name).where(
                Category.id == parent_id,
                Category.household_id == household_id,
            )
        )
        parent_name = parent_result.scalar()
        if parent_name is not None:
            parent_lookup[parent_id] = parent_name

    items: List[Dict[str, Any]] = []
    for cat in categories:
        cat_dict = CategoryResponse.model_validate(cat).model_dump()
        cat_dict["children_count"] = children_counts.get(cat.id, 0)
        if cat.parent_id is not None:
            cat_dict["parent_name"] = parent_lookup.get(cat.parent_id)
        items.append(cat_dict)

    return {"items": items, "total": len(items)}


@router.get("/categories/tree")
async def get_category_tree(
    include_archived: bool = Query(False),
    household_id: UUID = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> List[Dict[str, Any]]:
    """Nested tree structure — O(n) single-pass assembly (max depth = 1)."""
    conditions = [Category.household_id == household_id]
    if not include_archived:
        conditions.append(Category.archived == False)

    # Single query: parents first (NULL parent_id = top-level), then children
    # NULLS FIRST puts parents (parent_id=NULL) before children
    from sqlalchemy import nulls_first

    stmt = select(Category).where(*conditions).order_by(
        nulls_first(Category.parent_id.asc()),
        func.lower(Category.name),
    )
    result = await db.execute(stmt)
    categories = result.scalars().all()

    # Build lookup dict
    by_id: Dict[UUID, Dict[str, Any]] = {}
    for cat in categories:
        cat_dict = CategoryResponse.model_validate(cat).model_dump()
        by_id[cat.id] = cat_dict

    # Compute children_count
    children_counts: Dict[UUID, int] = {}
    for cat in categories:
        if cat.parent_id is not None:
            children_counts[cat.parent_id] = children_counts.get(cat.parent_id, 0) + 1

    # Build parent lookup for parent_name
    parent_lookup: Dict[UUID, str] = {cat.id: cat.name for cat in categories}

    # Apply computed fields
    for cat_id, cat_dict in by_id.items():
        cat_dict["children_count"] = children_counts.get(cat_id, 0)

    # Group children under parents in single pass; orphaned children (archived parent not in result)
    # are promoted to top-level rather than silently dropped
    tree: List[Dict[str, Any]] = []
    for cat in categories:
        cat_dict = by_id[cat.id]
        if cat.parent_id is None:
            tree.append(cat_dict)
        else:
            parent = by_id.get(cat.parent_id)
            if parent:
                parent.setdefault("children", []).append(cat_dict)
            else:
                tree.append(cat_dict)

    return tree


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


@router.post("/categories", status_code=status.HTTP_201_CREATED, response_model=CategoryResponse)
async def create_category_route(
    data: CategoryCreate,
    person: Person = Depends(get_current_person),
    household_id: UUID = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> CategoryResponse:
    category = await create_category(db, household_id, person.id, data)
    return CategoryResponse.model_validate(category)


# ---------------------------------------------------------------------------
# Parameterized routes — /{id} and sub-routes
# Static sub-routes (/spending-summary, /reassign-children, /archive, /restore)
# are declared BEFORE the generic /{id} PATCH/DELETE
# ---------------------------------------------------------------------------


@router.get("/categories/{category_id}/spending-summary")
async def spending_summary(
    category_id: UUID,
    from_date: date = Query(alias="from"),
    to_date: date = Query(alias="to"),
    household_id: UUID = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Spending totals for category + period (stub — replaced in Epic 6)."""
    # Verify category exists and belongs to household
    result = await db.execute(
        select(Category).where(
            Category.id == category_id,
            Category.household_id == household_id,
            Category.archived == False,
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "NOT_FOUND", "detail": "Category not found"},
        )

    return {"total": 0, "from": from_date.isoformat(), "to": to_date.isoformat()}


@router.patch("/categories/{category_id}/reassign-children")
async def reassign_children(
    category_id: UUID,
    data: ReassignChildrenRequest,
    person: Person = Depends(get_current_person),
    household_id: UUID = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, int]:
    """Bulk reassign subcategories to a new parent (or promote to top-level)."""
    # Verify source category exists
    source_result = await db.execute(
        select(Category).where(
            Category.id == category_id,
            Category.household_id == household_id,
            Category.archived == False,
        )
    )
    source = source_result.scalar_one_or_none()
    if source is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "NOT_FOUND", "detail": "Category not found"},
        )

    new_parent_id = data.new_parent_id

    # If new_parent_id provided, validate it exists and is top-level
    if new_parent_id is not None:
        parent_result = await db.execute(
            select(Category).where(
                Category.id == new_parent_id,
                Category.household_id == household_id,
                Category.archived == False,
            )
        )
        parent = parent_result.scalar_one_or_none()
        if parent is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "PARENT_NOT_FOUND", "detail": "Target parent not found"},
            )
        if parent.depth != 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": "MAX_DEPTH_EXCEEDED", "detail": "Target parent must be top-level"},
            )

    # Find and reassign children — scoped to household
    children_result = await db.execute(
        select(Category).where(
            Category.parent_id == category_id,
            Category.household_id == household_id,
            Category.archived == False,
        )
    )
    children = children_result.scalars().all()

    for child in children:
        child.parent_id = new_parent_id
        child.depth = 1 if new_parent_id is not None else 0

    await db.flush()

    return {"reassigned": len(children)}


@router.patch("/categories/{category_id}", response_model=CategoryResponse)
async def update_category_route(
    category_id: UUID,
    data: CategoryUpdate,
    person: Person = Depends(get_current_person),
    household_id: UUID = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> CategoryResponse:
    category = await update_category(db, household_id, person.id, category_id, data)
    return CategoryResponse.model_validate(category)


@router.post("/categories/{category_id}/archive")
async def archive_category_route(
    category_id: UUID,
    person: Person = Depends(get_current_person),
    household_id: UUID = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    result = await archive_category(db, household_id, person.id, category_id)
    return {
        "archived": CategoryResponse.model_validate(result["archived"]).model_dump(),
        "promoted_children": result["promoted_children"],
    }


@router.post("/categories/{category_id}/restore", response_model=CategoryResponse)
async def restore_category_route(
    category_id: UUID,
    person: Person = Depends(get_current_person),
    household_id: UUID = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> CategoryResponse:
    category = await restore_category(db, household_id, person.id, category_id)
    return CategoryResponse.model_validate(category)


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category_route(
    category_id: UUID,
    person: Person = Depends(get_current_person),
    household_id: UUID = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> None:
    await delete_category(db, household_id, person.id, category_id)
