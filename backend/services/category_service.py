"""Category service — CRUD operations, seeding, hierarchy enforcement.

Services:
    seed_default_categories  — idempotent household seeding (12 defaults)
    create_category          — create with name uniqueness + hierarchy validation
    update_category          — partial update with re-validation
    archive_category         — soft-delete; auto-promotes children to top-level
    delete_category          — hard-delete; blocked if downstream references exist
    restore_category         — unarchive archived category
    detect_duplicates        — find potential duplicate top-level categories
    merge_categories         — merge source categories into a target category

References: EDP §9, ARCH §4.4
"""

import asyncio
import difflib
import logging
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.base import StatusEnum, utcnow
from backend.models.category import Category
from backend.models.budget import Budget
from backend.models.event import FinancialEvent
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


# ---------------------------------------------------------------------------
# Duplicate Detection
# ---------------------------------------------------------------------------


async def detect_duplicates(
    db: AsyncSession,
    household_id: UUID,
) -> List[Dict[str, Any]]:
    """Find groups of potential duplicate top-level categories.

    Two categories are duplicates if their names match exactly (case-insensitive,
    whitespace-trimmed) or have a SequenceMatcher ratio >= 0.85.

    Returns a list of group dicts sorted by highest average transaction count.
    """
    # 1. Fetch all top-level non-archived categories
    result = await db.execute(
        select(Category).where(
            Category.household_id == household_id,
            Category.archived == False,
            Category.depth == 0,
        )
    )
    categories = list(result.scalars().all())

    if len(categories) < 2:
        return []

    # 2. Build transaction counts via single aggregated query
    count_result = await db.execute(
        select(FinancialEvent.category_id, func.count()).where(
            FinancialEvent.category_id.in_([c.id for c in categories]),
        ).group_by(FinancialEvent.category_id)
    )
    tx_counts: Dict[UUID, int] = dict(count_result.all())

    # 3. Compute matching pairs off the event loop (CPU-bound)
    def _find_matches() -> List[tuple]:
        """O(n²) SequenceMatcher — runs in a thread to avoid blocking the event loop."""
        matches = []
        for i in range(len(categories)):
            for j in range(i + 1, len(categories)):
                name_a = categories[i].name.strip().lower()
                name_b = categories[j].name.strip().lower()

                if not name_a or not name_b:
                    continue

                if name_a == name_b:
                    matches.append((categories[i].id, categories[j].id, "exact", 1.0))
                elif name_a[0] == name_b[0]:
                    # Fast gate: different first char → ratio can't reach 0.85
                    score = difflib.SequenceMatcher(None, name_a, name_b).ratio()
                    if score >= 0.85:
                        matches.append((categories[i].id, categories[j].id, "fuzzy", score))
        return matches

    matches = await asyncio.to_thread(_find_matches)

    # 4. Union-find: build groups from matching pairs
    #    Uses tombstone markers (None) instead of del to avoid index corruption
    cat_by_id = {c.id: c for c in categories}
    category_groups: Dict[UUID, int] = {}
    groups: List[Optional[List[Category]]] = []
    group_match_types: List[Optional[str]] = []
    group_match_scores: List[Optional[float]] = []

    for id_a, id_b, match_type, match_score in matches:
        group_a = category_groups.get(id_a)
        group_b = category_groups.get(id_b)

        if group_a is None and group_b is None:
            new_idx = len(groups)
            groups.append([cat_by_id[id_a], cat_by_id[id_b]])
            group_match_types.append(match_type)
            group_match_scores.append(match_score)
            category_groups[id_a] = new_idx
            category_groups[id_b] = new_idx
        elif group_a is not None and group_b is None:
            groups[group_a].append(cat_by_id[id_b])
            category_groups[id_b] = group_a
            if match_type == "exact":
                group_match_types[group_a] = "exact"
                group_match_scores[group_a] = 1.0
        elif group_a is None and group_b is not None:
            groups[group_b].append(cat_by_id[id_a])
            category_groups[id_a] = group_b
            if match_type == "exact":
                group_match_types[group_b] = "exact"
                group_match_scores[group_b] = 1.0
        elif group_a != group_b:
            groups[group_a].extend(groups[group_b])
            for cat_id in [c.id for c in groups[group_b]]:
                category_groups[cat_id] = group_a
            if group_match_types[group_b] == "exact":
                group_match_types[group_a] = "exact"
                group_match_scores[group_a] = max(group_match_scores[group_a], group_match_scores[group_b])
            # Tombstone — keeps indices stable
            groups[group_b] = None
            group_match_types[group_b] = None
            group_match_scores[group_b] = None

    # 5. Format groups with transaction counts (skip tombstoned entries)
    formatted = []
    for idx, group_cats in enumerate(groups):
        if group_cats is None:
            continue
        avg_tx = sum(tx_counts.get(c.id, 0) for c in group_cats) / len(group_cats)
        # Deterministic group_id from sorted category IDs — stable across calls
        sorted_ids = sorted(str(c.id) for c in group_cats)
        group_id = "-".join(sorted_ids[:2]) + ("-" + str(len(group_cats)) if len(group_cats) > 2 else "")
        formatted.append({
            "group_id": group_id,
            "match_type": group_match_types[idx],
            "match_score": round(group_match_scores[idx], 2),
            "categories": [
                {
                    "id": c.id,
                    "name": c.name,
                    "color": c.color,
                    "icon": c.icon,
                    "transaction_count": tx_counts.get(c.id, 0),
                }
                for c in group_cats
            ],
            "_avg_tx": avg_tx,
        })

    # 5. Sort by highest average transaction count first
    formatted.sort(key=lambda g: g["_avg_tx"], reverse=True)

    # Remove internal sort key
    for group in formatted:
        del group["_avg_tx"]

    return formatted


# ---------------------------------------------------------------------------
# Category Merge
# ---------------------------------------------------------------------------


async def merge_categories(
    db: AsyncSession,
    household_id: UUID,
    actor_id: UUID,
    target_id: UUID,
    source_ids: List[UUID],
) -> Dict[str, Any]:
    """Merge source categories into target category (transactional).

    Reassigns events, reassigns subcategories (with name-clash cascade),
    then archives source categories.
    """
    # --- Validation ---

    # Fetch target
    target_result = await db.execute(
        select(Category).where(
            Category.id == target_id,
            Category.household_id == household_id,
            Category.archived == False,
        )
    )
    target = target_result.scalar_one_or_none()
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"type": "not_found", "title": "Target Not Found",
                    "status": 404, "detail": "Target category not found or not in this household"},
        )
    if target.depth != 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"type": "validation_error", "title": "Invalid Target",
                    "status": 422, "detail": "Target category must be top-level (depth=0)"},
        )

    # Fetch sources
    sources_result = await db.execute(
        select(Category).where(
            Category.id.in_(source_ids),
            Category.household_id == household_id,
            Category.archived == False,
        )
    )
    sources = list(sources_result.scalars().all())
    if len(sources) != len(source_ids):
        found_ids = {s.id for s in sources}
        missing = sorted(str(uid) for uid in source_ids if uid not in found_ids)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"type": "not_found", "title": "Sources Not Found",
                    "status": 404, "detail": f"Source categories not found: {', '.join(missing)}"},
        )
    for source in sources:
        if source.depth != 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"type": "validation_error", "title": "Invalid Source",
                        "status": 422, "detail": f"Source category '{source.name}' must be top-level (depth=0)"},
            )

    # --- Reassign events ---
    source_results: List[Dict[str, Any]] = []
    total_events_reassigned = 0
    total_subcats_reassigned = 0

    for source in sources:
        # Count events per source before reassignment
        event_count_result = await db.execute(
            select(func.count()).select_from(FinancialEvent).where(
                FinancialEvent.category_id == source.id,
            )
        )
        event_count = event_count_result.scalar()

        # Bulk reassign events
        await db.execute(
            FinancialEvent.__table__.update()
            .where(FinancialEvent.category_id == source.id)
            .values(category_id=target_id)
        )
        total_events_reassigned += event_count

        # --- Reassign subcategories (including archived — don't leave orphans) ---
        children_result = await db.execute(
            select(Category).where(
                Category.parent_id == source.id,
            )
        )
        children = children_result.scalars().all()

        subcats_reassigned = 0
        for child in children:
            new_name = await _resolve_name_clash(
                db, target.id, child.name
            )
            child.parent_id = target_id
            child.depth = 1
            if new_name != child.name:
                child.name = new_name
            subcats_reassigned += 1
            # Flush after each child so subsequent clash checks see renamed siblings
            await db.flush()

        total_subcats_reassigned += subcats_reassigned

        source_results.append({
            "id": source.id,
            "name": source.name,
            "transactions_reassigned": event_count,
            "subcategories_reassigned": subcats_reassigned,
        })

        # Archive source
        source.archived = True
        source.archived_at = utcnow()
        source.archived_by = actor_id
        source.status = StatusEnum.archived

    await db.flush()

    # --- Audit log ---
    await audit.log(
        db=db,
        household_id=household_id,
        actor_id=actor_id,
        action="merge_categories",
        entity_type="category",
        entity_id=target_id,
        after={
            "source_ids": [str(s.id) for s in sources],
            "transactions_reassigned": total_events_reassigned,
            "subcategories_reassigned": total_subcats_reassigned,
        },
    )

    return {
        "success": True,
        "target_id": target_id,
        "source_categories": source_results,
        "total_transactions_reassigned": total_events_reassigned,
        "total_subcategories_reassigned": total_subcats_reassigned,
        "message": f"Successfully merged {len(sources)} category{'s' if len(sources) != 1 else ''} into '{target.name}'",
    }


async def _resolve_name_clash(
    db: AsyncSession,
    target_parent_id: UUID,
    child_name: str,
) -> str:
    """Resolve subcategory name clash by appending (2), (3), etc.

    Checks if a child of target_parent_id already has the same name
    (case-insensitive). If so, appends (N) until unique.

    Includes archived children in clash check — merge reassigns archived
    subcategories too, so they must not collide.
    """
    # Check if name already exists under target (including archived)
    result = await db.execute(
        select(func.count()).where(
            Category.parent_id == target_parent_id,
            func.lower(Category.name) == func.lower(child_name),
        )
    )
    if result.scalar() == 0:
        return child_name

    counter = 2
    while counter <= 1000:
        candidate = f"{child_name} ({counter})"
        result = await db.execute(
            select(func.count()).where(
                Category.parent_id == target_parent_id,
                func.lower(Category.name) == func.lower(candidate),
            )
        )
        if result.scalar() == 0:
            return candidate
        counter += 1
    # Fallback — should never be reached in practice
    return f"{child_name} ({counter})"


# ---------------------------------------------------------------------------
# Import Category Mapping
# ---------------------------------------------------------------------------

# 14 entity accent colours (from frontend/src/index.css)
ENTITY_ACCENT_COLORS: List[str] = [
    "#6366f1",  # 0: account (indigo)
    "#ef4444",  # 1: credit (red)
    "#10b981",  # 2: capital (green)
    "#f59e0b",  # 3: asset (amber)
    "#06b6d4",  # 4: insurance (cyan)
    "#8b5cf6",  # 5: event (purple)
    "#ec4899",  # 6: recurring (pink)
    "#14b8a6",  # 7: transfer (teal)
    "#f97316",  # 8: budget (orange)
    "#06b6d4",  # 9: category (cyan)
    "#a78bfa",  # 10: currency (violet)
    "#6ee7b7",  # 11: formula (mint)
    "#ef4444",  # 12: debt (red)
    "#38bdf8",  # 13: person (sky)
]


async def preview_import_mappings(
    db: AsyncSession,
    household_id: UUID,
    category_values: List[str],
) -> List[Dict[str, Any]]:
    """Preview category mappings for import data.

    For each unique input name, find the best matching existing category
    using exact → trimmed → fuzzy → unmapped priority.
    """
    # 1. Fetch all non-archived categories for household
    result = await db.execute(
        select(Category).where(
            Category.household_id == household_id,
            Category.archived == False,
        )
    )
    categories = list(result.scalars().all())

    # 2. Build lookup: lowered+trimmed name → category
    cat_lookup: Dict[str, Category] = {}
    for cat in categories:
        key = cat.name.strip().lower()
        if key not in cat_lookup:
            cat_lookup[key] = cat

    # 3. Deduplicate input names (case-insensitive, whitespace-trimmed)
    seen: Dict[str, str] = {}  # normalized → first raw occurrence
    for raw_name in category_values:
        normalized = raw_name.strip().lower()
        if normalized and normalized not in seen:
            seen[normalized] = raw_name

    # 4. Match each unique name
    mappings: List[Dict[str, Any]] = []
    for normalized, original_name in seen.items():
        mapping = _match_category(normalized, original_name, categories, cat_lookup)
        mappings.append(mapping)

    return mappings


def _match_category(
    normalized: str,
    original_name: str,
    categories: List[Category],
    cat_lookup: Dict[str, Category],
) -> Dict[str, Any]:
    """Match a single normalized name to an existing category."""
    had_whitespace = original_name.strip() != original_name

    # Priority 1: Exact match (lowered+trimmed)
    if normalized in cat_lookup:
        cat = cat_lookup[normalized]
        # If original had extra whitespace, it's a "trimmed" match
        match_type = "trimmed" if had_whitespace else "exact"
        return {
            "original_name": original_name,
            "mapped_to_id": cat.id,
            "mapped_to_name": cat.name,
            "match_type": match_type,
            "transaction_count": 0,
            "suggested_action": "map",
        }

    # Priority 2: Fuzzy match
    best_score = 0.0
    best_cat: Optional[Category] = None
    for cat in categories:
        cat_name = cat.name.strip().lower()
        if not cat_name or not normalized:
            continue
        score = difflib.SequenceMatcher(None, normalized, cat_name).ratio()
        if score > best_score:
            best_score = score
            best_cat = cat

    if best_cat and best_score >= 0.85:
        return {
            "original_name": original_name,
            "mapped_to_id": best_cat.id,
            "mapped_to_name": best_cat.name,
            "match_type": "fuzzy",
            "transaction_count": 0,
            "suggested_action": "map",
        }

    # Priority 3: Unmapped
    return {
        "original_name": original_name,
        "mapped_to_id": None,
        "mapped_to_name": None,
        "match_type": "unmapped",
        "transaction_count": 0,
        "suggested_action": "create_new",
    }


async def auto_create_category(
    db: AsyncSession,
    name: str,
    household_id: UUID,
    actor_id: UUID,
) -> Category:
    """Create a category with auto-assigned colour (idempotent).

    Colour cycles through ENTITY_ACCENT_COLORS based on
    count(household categories) % 14.
    """
    # Idempotency check: return existing if name already exists
    result = await db.execute(
        select(Category).where(
            func.lower(Category.name) == func.lower(name),
            Category.household_id == household_id,
            Category.archived == False,
        )
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        return existing

    # Count existing categories for colour cycling
    count_result = await db.execute(
        select(func.count()).where(
            Category.household_id == household_id,
            Category.archived == False,
        )
    )
    count = count_result.scalar()
    color = ENTITY_ACCENT_COLORS[count % 14]

    category = Category(
        household_id=household_id,
        name=name,
        color=color,
        icon=None,
        category_type="expense",
        parent_id=None,
        depth=0,
        created_by=actor_id,
    )
    db.add(category)
    await db.flush()

    return category
