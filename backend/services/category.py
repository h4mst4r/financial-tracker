"""Category service — the default-category seed (ARCH §3.7, FR-C-007).

`DEFAULT_CATEGORIES` is the authoritative 13-row seed table (names + types + colours + icons
fixed in ARCH §3.7). `seed_default_categories` is idempotent and is the single seed used by
both household creation (Story 2.3 `_create_and_seed_household`) and the FR-C-007 recovery
button (Story 3.3). The full Category CRUD / tree / merge logic lands in Epic 3.
"""

import logging
from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend import errors
from backend.db_utils import get_or_404
from backend.models.budget import Category
from backend.schemas.category import CategoryCreate, CategoryUpdate
from backend.services.audit import audit

logger = logging.getLogger(__name__)

# The three allowed category types (ARCH §2.14, FR-C-001). Validated here (no pydantic enum, like
# the household/profile services).
CATEGORY_TYPES = frozenset({"income", "expense", "both"})

# Authoritative seed table (ARCH §3.7): (name, category_type, color, icon). All top-level
# (parent_id=None, depth=0). `color` is mandatory (Category.color is NOT NULL); icons are emoji.
DEFAULT_CATEGORIES: tuple[tuple[str, str, str, str], ...] = (
    ("Food & Dining", "expense", "#f59e0b", "🍔"),
    ("Groceries", "expense", "#22c55e", "🛒"),
    ("Transport", "expense", "#3b82f6", "🚇"),
    ("Housing", "expense", "#8b5cf6", "🏠"),
    ("Utilities", "expense", "#06b6d4", "💡"),
    ("Healthcare", "expense", "#ef4444", "🏥"),
    ("Shopping", "expense", "#ec4899", "🛍"),
    ("Entertainment", "expense", "#6366f1", "🎬"),
    ("Insurance", "expense", "#14b8a6", "🛡"),
    ("Education", "expense", "#a855f7", "🎓"),
    ("Salary", "income", "#16a34a", "💰"),
    ("Investment Income", "income", "#0ea5e9", "📈"),
    ("Miscellaneous", "both", "#64748b", "📦"),
)


async def seed_default_categories(db: AsyncSession, household_id: str, actor_id: str) -> None:
    """Seed the 13 default categories for a household, idempotently (ARCH §3.7, FR-C-007).

    Skips any entry whose name already matches an active category in the household
    (case-insensitive), so running it twice — or as the FR-C-007 recovery path — never
    creates duplicates. Flushes only; the caller commits.
    """
    existing = await db.execute(
        select(func.lower(Category.name)).where(
            Category.household_id == household_id, Category.archived.is_(False)
        )
    )
    present = {name for name in existing.scalars()}

    for name, category_type, color, icon in DEFAULT_CATEGORIES:
        if name.lower() in present:
            continue
        db.add(
            Category(
                household_id=household_id,
                created_by=actor_id,
                name=name,
                category_type=category_type,
                color=color,
                icon=icon,
                parent_id=None,
                depth=0,
            )
        )

    await db.flush()
    logger.info("seed_default_categories_done", extra={"household_id": str(household_id)})


# ─── Category CRUD (Story 3.1) ───


def _snapshot(cat: Category) -> dict:
    """The scalar audit snapshot for a category (the mutable, user-facing columns)."""
    return {
        "name": cat.name,
        "color": cat.color,
        "icon": cat.icon,
        "category_type": cat.category_type,
        "parent_id": cat.parent_id,
        "depth": cat.depth,
        "vivid": cat.vivid,
    }


async def _assert_name_unique(
    db: AsyncSession, household_id: str, name: str, *, exclude_id: str | None = None
) -> None:
    """409 if an active category in the household already has this name (case-insensitive, §3.7)."""
    stmt = select(Category.id).where(
        Category.household_id == household_id,
        func.lower(Category.name) == func.lower(name),
        Category.archived.is_(False),
    )
    if exclude_id is not None:
        stmt = stmt.where(Category.id != exclude_id)
    if (await db.execute(stmt)).first() is not None:
        errors.duplicate_name("Category", name)


async def _resolve_depth(db: AsyncSession, household_id: str, parent_id: str | None) -> int:
    """Derive `depth` from `parent_id`, enforcing the 2-level limit (AC 2, ARCH §3.7).

    Top-level → 0. Under a parent → 1, but only if that parent is itself top-level (`depth == 0`);
    nesting under a subcategory is a 400 (the DB CHECK `depth <= 1` is the backstop). A missing
    parent_id 404s via `get_or_404`.
    """
    if parent_id is None:
        return 0
    parent = await get_or_404(db, Category, parent_id, household_id=household_id)
    if parent.depth != 0:
        errors.bad_request(
            "Invalid parent",
            "A subcategory cannot be nested under another subcategory (max 2 levels)",
        )
    return 1


async def create_category(
    db: AsyncSession, household_id: str, actor_id: str, data: CategoryCreate
) -> Category:
    """Create a category/subcategory (AC 1/2). `depth` is derived from `parent_id`, never trusted
    from the body. Validates type + case-insensitive name uniqueness; writes a create audit row."""
    if data.category_type not in CATEGORY_TYPES:
        errors.bad_request(
            "Invalid category type", f"'{data.category_type}' is not a valid category type"
        )
    await _assert_name_unique(db, household_id, data.name)
    depth = await _resolve_depth(db, household_id, data.parent_id)
    obj = Category(
        household_id=household_id,
        created_by=actor_id,
        name=data.name,
        color=data.color,
        icon=data.icon,
        category_type=data.category_type,
        parent_id=data.parent_id,
        depth=depth,
        vivid=data.vivid,
    )
    db.add(obj)
    await db.flush()
    await audit.log(
        db,
        household_id=household_id,
        actor_id=actor_id,
        action="create",
        entity_type="category",
        entity_id=str(obj.id),
        before=None,
        after=_snapshot(obj),
    )
    return obj


async def update_category(
    db: AsyncSession, household_id: str, actor_id: str, category_id: str, data: CategoryUpdate
) -> Category:
    """Apply a partial update to a category (AC 1) — name / colour / icon / type / vivid only. A
    category never moves in the tree here (`CategoryUpdate` has no `parent_id`; re-parent/promote is
    Story 3.2), so `depth`/`parent_id` are untouched and the 2-level invariant holds. Writes an
    update audit row."""
    obj = await get_or_404(db, Category, category_id, household_id=household_id)
    fields = data.model_dump(exclude_unset=True)

    if "category_type" in fields and fields["category_type"] not in CATEGORY_TYPES:
        errors.bad_request(
            "Invalid category type", f"'{fields['category_type']}' is not a valid category type"
        )
    if "name" in fields:
        if not fields["name"].strip():
            errors.bad_request("Invalid name", "Category name cannot be empty")
        await _assert_name_unique(db, household_id, fields["name"], exclude_id=category_id)

    before = _snapshot(obj)
    for key, value in fields.items():
        setattr(obj, key, value)

    await db.flush()
    await audit.log(
        db,
        household_id=household_id,
        actor_id=actor_id,
        action="update",
        entity_type="category",
        entity_id=str(obj.id),
        before=before,
        after=_snapshot(obj),
    )
    return obj


async def list_categories(
    db: AsyncSession, household_id: str, *, include_archived: bool = False
) -> Sequence[Category]:
    """The household's categories as a flat list (top-level first, then by name). Reads are not
    audited (§4.7). Excludes archived unless `include_archived` (backend.md §2). The frontend
    assembles the 2-level tree by `parent_id`."""
    stmt = select(Category).where(Category.household_id == household_id)
    if not include_archived:
        stmt = stmt.where(Category.archived.is_(False))
    stmt = stmt.order_by(Category.depth, func.lower(Category.name))
    return (await db.execute(stmt)).scalars().all()


async def get_category(db: AsyncSession, household_id: str, category_id: str) -> Category:
    """A single household-scoped category (404 incl. cross-household)."""
    return await get_or_404(db, Category, category_id, household_id=household_id)
