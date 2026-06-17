"""Category service — the default-category seed (ARCH §3.7, FR-C-007).

`DEFAULT_CATEGORIES` is the authoritative 13-row seed table (names + types + colours + icons
fixed in ARCH §3.7). `seed_default_categories` is idempotent and is the single seed used by
both household creation (Story 2.3 `_create_and_seed_household`) and the FR-C-007 recovery
button (Story 3.3). The full Category CRUD / tree / merge logic lands in Epic 3.
"""

import logging

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.budget import Category

logger = logging.getLogger(__name__)

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
