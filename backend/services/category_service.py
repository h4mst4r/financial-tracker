"""Category service — CRUD operations, seeding, hierarchy enforcement.

Services:
    seed_default_categories  — idempotent household seeding (12 defaults)
    create_category          — create with name uniqueness + hierarchy validation
    update_category          — partial update with re-validation
    archive_category         — soft-delete; auto-promotes children to top-level
    delete_category          — hard-delete; blocked if downstream references exist
    restore_category         — unarchive archived category

References: EDP §9, ARCH §4.4
"""

import logging
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.base import StatusEnum, utcnow
from backend.models.category import Category
from backend.models.budget import Budget
from backend.schemas.category import CategoryCreate, CategoryUpdate
from backend.services.audit_service import AuditService

logger = logging.getLogger(__name__)

audit = AuditService()

# ---------------------------------------------------------------------------
# Default category seeds (first-login)
# ---------------------------------------------------------------------------

DEFAULT_CATEGORIES: List[Dict[str, str]] = [
    {"name": "Food & Drink", "type": "expense", "color": "#ef4444", "icon": "🍕"},
    {"name": "Shopping", "type": "expense", "color": "#6366f1", "icon": "🛍️"},
    {"name": "Housing", "type": "expense", "color": "#f59e0b", "icon": "🏠"},
    {"name": "Transport", "type": "expense", "color": "#64748b", "icon": "🚗"},
    {"name": "Vehicle", "type": "expense", "color": "#14b8a6", "icon": "⛽"},
    {"name": "Life & Entertainment", "type": "expense", "color": "#10b981", "icon": "🎬"},
    {"name": "Health & Fitness", "type": "expense", "color": "#ec4899", "icon": "🏥"},
    {"name": "Communication", "type": "expense", "color": "#06b6d4", "icon": "📱"},
    {"name": "Financial Expenses", "type": "expense", "color": "#8b5cf6", "icon": "💳"},
    {"name": "Income", "type": "income", "color": "#84cc16", "icon": "💰"},
    {"name": "Savings & Investments", "type": "income", "color": "#10b981", "icon": "🏦"},
    {"name": "Other", "type": "both", "color": "#94a3b8", "icon": "📦"},
]


# ---------------------------------------------------------------------------
# Seeding
# ---------------------------------------------------------------------------


async def seed_default_categories(
    db: AsyncSession,
    household_id: UUID,
    actor_id: UUID,
) -> None:
    """Create the 12 default categories for a new household (idempotent).

    If the household already has exactly 12 categories and none are missing
    by name (case-insensitive), this is a no-op.
    """
    # Check existing categories
    result = await db.execute(
        select(Category).where(
            Category.household_id == household_id,
            Category.archived == False,
        )
    )
    existing = result.scalars().all()

    if existing:
        existing_names = {row.name.lower() for row in existing}
        expected_names = {cat["name"].lower() for cat in DEFAULT_CATEGORIES}
        # If we have all 12 expected names, skip seeding
        if existing_names >= expected_names:
            logger.info(
                "seed_default_categories_skipped",
                extra={"household_id": str(household_id), "existing_count": len(existing)},
            )
            return

    for cat_data in DEFAULT_CATEGORIES:
        # Skip if already exists (case-insensitive, non-archived only)
        name_result = await db.execute(
            select(Category).where(
                func.lower(Category.name) == func.lower(cat_data["name"]),
                Category.household_id == household_id,
                Category.archived == False,
            )
        )
        if name_result.scalar_one_or_none():
            continue

        cat = Category(
            household_id=household_id,
            name=cat_data["name"],
            category_type=cat_data["type"],
            color=cat_data["color"],
            icon=cat_data["icon"],
            depth=0,
            created_by=actor_id,
        )
        db.add(cat)

    await db.flush()
    logger.info(
        "seed_default_categories_done",
        extra={"household_id": str(household_id)},
    )


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


async def create_category(
    db: AsyncSession,
    household_id: UUID,
    actor_id: UUID,
    data: CategoryCreate,
) -> Category:
    """Create a new category with name uniqueness and hierarchy validation."""
    # Name uniqueness (case-insensitive)
    result = await db.execute(
        select(Category).where(
            func.lower(Category.name) == func.lower(data.name),
            Category.household_id == household_id,
            Category.archived == False,
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "DUPLICATE_NAME", "detail": f"Category '{data.name}' already exists"},
        )

    depth = 0

    if data.parent_id is not None:
        # Validate parent exists in household
        parent_result = await db.execute(
            select(Category).where(
                Category.id == data.parent_id,
                Category.household_id == household_id,
                Category.archived == False,
            )
        )
        parent = parent_result.scalar_one_or_none()
        if parent is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "PARENT_NOT_FOUND", "detail": "Parent category not found"},
            )
        # Enforce max 2 levels: parent must be top-level (depth=0)
        if parent.depth != 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": "MAX_DEPTH_EXCEEDED", "detail": "Cannot nest more than 2 levels"},
            )
        depth = parent.depth + 1

    category = Category(
        household_id=household_id,
        name=data.name,
        color=data.color,
        icon=data.icon,
        category_type=data.category_type,
        parent_id=data.parent_id,
        depth=depth,
        created_by=actor_id,
    )
    db.add(category)
    await db.flush()

    await audit.log(
        db=db,
        household_id=household_id,
        actor_id=actor_id,
        action="create",
        entity_type="category",
        entity_id=category.id,
        after={"name": category.name, "category_type": category.category_type},
    )

    return category


async def update_category(
    db: AsyncSession,
    household_id: UUID,
    actor_id: UUID,
    category_id: UUID,
    data: CategoryUpdate,
) -> Category:
    """Partial update with re-validation."""
    category = await _get_category_by_id(db, household_id, category_id)

    updates = data.model_dump(exclude_unset=True)

    # Re-validate name uniqueness if name is being changed
    if "name" in updates and updates["name"] is not None:
        name_result = await db.execute(
            select(Category).where(
                func.lower(Category.name) == func.lower(updates["name"]),
                Category.household_id == household_id,
                Category.archived == False,
                Category.id != category_id,
            )
        )
        if name_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"error": "DUPLICATE_NAME", "detail": f"Category '{updates['name']}' already exists"},
            )

    # Validate parent_id if changing
    if "parent_id" in updates and updates["parent_id"] is not None:
        # Prevent self-parenting
        if updates["parent_id"] == category_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": "SELF_PARENT", "detail": "Category cannot be its own parent"},
            )

        parent_result = await db.execute(
            select(Category).where(
                Category.id == updates["parent_id"],
                Category.household_id == household_id,
                Category.archived == False,
            )
        )
        parent = parent_result.scalar_one_or_none()
        if parent is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "PARENT_NOT_FOUND", "detail": "Parent category not found"},
            )
        if parent.depth != 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": "MAX_DEPTH_EXCEEDED", "detail": "Cannot nest more than 2 levels"},
            )

    # Apply updates (exclude depth — it's computed)
    for key, value in updates.items():
        if key != "depth":
            setattr(category, key, value)

    # Recalculate depth if parent changed
    if "parent_id" in updates:
        if updates["parent_id"] is not None:
            category.depth = 1
        else:
            category.depth = 0

    await db.flush()

    await audit.log(
        db=db,
        household_id=household_id,
        actor_id=actor_id,
        action="update",
        entity_type="category",
        entity_id=category.id,
        after={"name": category.name, "category_type": category.category_type},
    )

    return category


async def archive_category(
    db: AsyncSession,
    household_id: UUID,
    actor_id: UUID,
    category_id: UUID,
) -> Dict[str, Any]:
    """Soft-delete; auto-promotes children to top-level."""
    category = await _get_category_by_id(db, household_id, category_id)

    # Find children
    children_result = await db.execute(
        select(Category).where(
            Category.parent_id == category_id,
            Category.archived == False,
        )
    )
    children = children_result.scalars().all()
    promoted_count = len(children)

    # Auto-promote children to top-level
    for child in children:
        child.parent_id = None
        child.depth = 0

    # Archive the parent
    category.archived = True
    category.archived_at = utcnow()
    category.archived_by = actor_id
    category.status = StatusEnum.archived

    await db.flush()

    await audit.log(
        db=db,
        household_id=household_id,
        actor_id=actor_id,
        action="archive",
        entity_type="category",
        entity_id=category.id,
        after={"name": category.name, "promoted_children": promoted_count},
    )

    return {"archived": category, "promoted_children": promoted_count}


async def delete_category(
    db: AsyncSession,
    household_id: UUID,
    actor_id: UUID,
    category_id: UUID,
) -> None:
    """Hard-delete; only if zero downstream references."""
    category = await _get_category_by_id(db, household_id, category_id)

    # Check child categories — hard-delete would orphan them (ON DELETE SET NULL)
    children_result = await db.execute(
        select(func.count()).select_from(Category).where(
            Category.parent_id == category_id,
            Category.archived == False,
        )
    )
    if children_result.scalar() > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "HAS_DEPENDENCIES", "detail": "Category has child categories. Archive instead."},
        )

    # Check budget references
    budget_result = await db.execute(
        select(func.count()).select_from(Budget).where(
            Budget.category_id == category_id,
            Budget.archived == False,
        )
    )
    if budget_result.scalar() > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "HAS_DEPENDENCIES", "detail": "Category has active budget references. Archive instead."},
        )

    # Check event references (FinancialEvent may not exist yet — Epic 6)
    try:
        from backend.models.event import FinancialEvent

        event_result = await db.execute(
            select(func.count()).select_from(FinancialEvent).where(
                FinancialEvent.category_id == category_id,
                FinancialEvent.archived == False,
            )
        )
        if event_result.scalar() > 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"error": "HAS_DEPENDENCIES", "detail": "Category has active event references. Archive instead."},
            )
    except ImportError:
        pass  # Events not yet available

    await db.delete(category)
    await db.flush()

    logger.info(
        "category_hard_deleted",
        extra={"category_id": str(category_id), "household_id": str(household_id)},
    )


async def restore_category(
    db: AsyncSession,
    household_id: UUID,
    actor_id: UUID,
    category_id: UUID,
) -> Category:
    """Unarchive an archived category."""
    # Fetch including archived
    result = await db.execute(
        select(Category).where(
            Category.id == category_id,
            Category.household_id == household_id,
        )
    )
    category = result.scalar_one_or_none()

    if category is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "NOT_FOUND", "detail": "Category not found"},
        )

    if not category.archived:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "NOT_ARCHIVED", "detail": "Category is not archived"},
        )

    category.archived = False
    category.archived_at = None
    category.archived_by = None
    category.status = StatusEnum.active

    # If the parent is still archived, promote to top-level rather than restoring a dangling reference
    if category.parent_id is not None:
        parent_result = await db.execute(
            select(Category).where(Category.id == category.parent_id)
        )
        parent = parent_result.scalar_one_or_none()
        if parent is None or parent.archived:
            category.parent_id = None
            category.depth = 0

    await db.flush()

    await audit.log(
        db=db,
        household_id=household_id,
        actor_id=actor_id,
        action="restore",
        entity_type="category",
        entity_id=category.id,
        after={"name": category.name},
    )

    return category


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_category_by_id(
    db: AsyncSession,
    household_id: UUID,
    category_id: UUID,
) -> Category:
    """Fetch an active category by ID, scoped to household."""
    result = await db.execute(
        select(Category).where(
            Category.id == category_id,
            Category.household_id == household_id,
            Category.archived == False,
        )
    )
    category = result.scalar_one_or_none()
    if category is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "NOT_FOUND", "detail": "Category not found"},
        )
    return category
