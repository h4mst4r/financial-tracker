"""Category service — the default-category seed (ARCH §3.7, FR-C-007).

`DEFAULT_CATEGORIES` is the authoritative 13-row seed table (names + types + colours + icons
fixed in ARCH §3.7). `seed_default_categories` is idempotent and is the single seed used by
both household creation (Story 2.3 `_create_and_seed_household`) and the FR-C-007 recovery
button (Story 3.3). The full Category CRUD / tree / merge logic lands in Epic 3.
"""

import logging
from collections.abc import Sequence
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend import errors
from backend.db_utils import get_or_404
from backend.models.budget import Budget, Category
from backend.models.event import FinancialEvent
from backend.schemas.category import CategoryCreate, CategoryUpdate
from backend.services.audit import audit
from backend.services.base import assert_no_dependencies

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


# ─── Archive / restore / move / delete (Story 3.2) ───


async def _active_children(db: AsyncSession, household_id: str, parent_id: str) -> list[Category]:
    stmt = select(Category).where(
        Category.household_id == household_id,
        Category.parent_id == parent_id,
        Category.archived.is_(False),
    )
    return list((await db.execute(stmt)).scalars().all())


async def _archived_children(db: AsyncSession, household_id: str, parent_id: str) -> list[Category]:
    stmt = select(Category).where(
        Category.household_id == household_id,
        Category.parent_id == parent_id,
        Category.archived.is_(True),
    )
    return list((await db.execute(stmt)).scalars().all())


async def _has_children(db: AsyncSession, household_id: str, parent_id: str) -> bool:
    stmt = select(
        exists().where(Category.household_id == household_id, Category.parent_id == parent_id)
    )
    return bool((await db.execute(stmt)).scalar_one())


async def archive_category(
    db: AsyncSession, household_id: str, actor_id: str, category_id: str
) -> Category:
    """Archive a category, cascading the whole branch (AC 1, FR-C-005). Archiving a parent archives
    its **active children together** (not auto-promoted); archiving a sub archives only it. Returns
    **200, never 409**. Idempotent: a row already archived is skipped (no second audit row). Refs on
    `financial_events` are untouched (history preserved). Flush only; `get_db` commits."""
    target = await get_or_404(db, Category, category_id, household_id=household_id)
    branch = [target]
    if target.depth == 0:
        branch += await _active_children(db, household_id, target.id)

    now = datetime.now(UTC)
    for row in branch:
        if row.archived:
            continue  # idempotent no-op
        before = _snapshot(row)
        row.status = "archived"
        row.archived = True
        row.archived_at = now
        row.archived_by = actor_id
        await audit.log(
            db,
            household_id=household_id,
            actor_id=actor_id,
            action="archive",
            entity_type="category",
            entity_id=str(row.id),
            before=before,
            after=_snapshot(row),
        )
    await db.flush()
    return target


async def restore_category(
    db: AsyncSession, household_id: str, actor_id: str, category_id: str
) -> Category:
    """Restore an archived category (AC 1). Restoring a parent restores its archived children too
    (the branch comes back together, ARCH §3.7); restoring a sub restores only it. Idempotent: an
    already-active row is skipped."""
    target = await get_or_404(db, Category, category_id, household_id=household_id)
    branch = [target]
    if target.depth == 0:
        branch += await _archived_children(db, household_id, target.id)

    for row in branch:
        if not row.archived:
            continue  # idempotent no-op
        before = _snapshot(row)
        row.status = "active"
        row.archived = False
        row.archived_at = None
        row.archived_by = None
        await audit.log(
            db,
            household_id=household_id,
            actor_id=actor_id,
            action="restore",
            entity_type="category",
            entity_id=str(row.id),
            before=before,
            after=_snapshot(row),
        )
    await db.flush()
    return target


async def move_category(
    db: AsyncSession, household_id: str, actor_id: str, category_id: str, parent_id: str | None
) -> Category:
    """Promote or re-parent a category (AC 2, FR-C-003). `parent_id=None` promotes to top-level
    (`depth 0`); a top-level `parent_id` re-parents (`depth 1`). Rejects (400) anything that would
    create a 3rd level: the target must itself be top-level, and a category that **has its own
    children** can't be demoted into a subcategory. The DB CHECK `depth<=1` only guards a single
    row, so the has-children guard here is what actually keeps the tree 2 levels deep."""
    obj = await get_or_404(db, Category, category_id, household_id=household_id)
    if parent_id == category_id:
        errors.bad_request("Invalid move", "A category cannot be its own parent")

    if parent_id is None:
        new_depth = 0
    else:
        parent = await get_or_404(db, Category, parent_id, household_id=household_id)
        if parent.archived:
            errors.bad_request(
                "Invalid move", "Cannot move a category under an archived parent"
            )
        if parent.depth != 0:
            errors.bad_request(
                "Invalid move", "The target must be a top-level category (max 2 levels)"
            )
        if await _has_children(db, household_id, obj.id):
            errors.bad_request(
                "Invalid move", "A category with subcategories cannot become a subcategory"
            )
        new_depth = 1

    before = _snapshot(obj)
    obj.parent_id = parent_id
    obj.depth = new_depth
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


async def delete_category(
    db: AsyncSession, household_id: str, actor_id: str, category_id: str
) -> None:
    """Hard-delete a category if it has zero downstream references (AC 3, FR-C-006). The dependency
    scan covers `financial_events`, `budgets`, and **child categories**; any hit → 409
    `has_dependencies` (the UI offers archive instead). On success the row is gone — a hard delete
    leaves an INFO log, never an audit row (services/base.py template)."""
    obj = await get_or_404(db, Category, category_id, household_id=household_id)  # 404 scope guard
    await assert_no_dependencies(
        db,
        [
            (FinancialEvent, "category_id"),
            (Budget, "category_id"),
            (Category, "parent_id"),
        ],
        str(category_id),
        entity_type="category",
    )
    await db.delete(obj)
    await db.flush()
    logger.info(
        "hard_delete_category",
        extra={"household_id": str(household_id), "entity_id": str(category_id)},
    )


# ─── Delete-eligibility (powers can_delete / delete_blocked_reason, UX §8.1) ───

# Precedence for the human reason when a category has multiple blockers.
_BLOCKER_SUBCATEGORIES = "has subcategories"
_BLOCKER_TRANSACTIONS = "has transactions"
_BLOCKER_BUDGETS = "has budgets"


async def delete_blockers(db: AsyncSession, household_id: str) -> dict[str, str]:
    """Map every household category that **cannot** be hard-deleted to its reason, via three batched
    queries (never per-row counts). Precedence: subcategories → transactions → budgets."""
    blockers: dict[str, str] = {}

    async def _ids(model: type, column: str) -> set[str]:
        col = getattr(model, column)
        stmt = select(col).where(model.household_id == household_id, col.is_not(None)).distinct()
        return {row for row in (await db.execute(stmt)).scalars().all()}

    # Lowest precedence first; later writes win for the chosen reason.
    for cid in await _ids(Budget, "category_id"):
        blockers[cid] = _BLOCKER_BUDGETS
    for cid in await _ids(FinancialEvent, "category_id"):
        blockers[cid] = _BLOCKER_TRANSACTIONS
    for cid in await _ids(Category, "parent_id"):
        blockers[cid] = _BLOCKER_SUBCATEGORIES
    return blockers


async def single_delete_blocker(
    db: AsyncSession, household_id: str, category_id: str
) -> str | None:
    """The hard-delete blocker reason for one category, or None if it is deletable. Same checks +
    precedence as `delete_blockers`, for single-row responses."""

    async def _referenced(model: type, column: str) -> bool:
        stmt = select(exists().where(getattr(model, column) == category_id))
        return bool((await db.execute(stmt)).scalar_one())

    if await _referenced(Category, "parent_id"):
        return _BLOCKER_SUBCATEGORIES
    if await _referenced(FinancialEvent, "category_id"):
        return _BLOCKER_TRANSACTIONS
    if await _referenced(Budget, "category_id"):
        return _BLOCKER_BUDGETS
    return None


# ─── Spending rollup (Story 3.3, FR-C-008) ───


async def spending_rollup(db: AsyncSession, household_id: str) -> dict[str, Decimal]:
    """Base-currency spend per category, with each parent's figure including all its children's
    spend (FR-C-008, ARCH §3.7). Spend = `amount_base` of `financial_events` that are
    `transaction_type='outflow'` and `transaction_status != 'cancelled'` — the same authoritative
    predicate as Story 8.2 budget actuals (ARCH §3.7 / FR-B-003), minus that path's budget-period
    and owner narrowing. Always base currency (never sum `amount` across mixed currencies).

    Built ahead of its consumers (budget actuals 8.2, dashboard pie 9.x) so they are pure wiring.
    """
    # Raw spend per category — one grouped query.
    raw_rows = await db.execute(
        select(FinancialEvent.category_id, func.sum(FinancialEvent.amount_base))
        .where(
            FinancialEvent.household_id == household_id,
            FinancialEvent.category_id.is_not(None),
            FinancialEvent.transaction_type == "outflow",
            FinancialEvent.transaction_status != "cancelled",
        )
        .group_by(FinancialEvent.category_id)
    )
    raw: dict[str, Decimal] = {cid: total for cid, total in raw_rows.all()}

    # Fold children into parents. Max 2 levels (DB CHECK depth<=1) → a single pass is exact.
    cats = await db.execute(
        select(Category.id, Category.parent_id).where(Category.household_id == household_id)
    )
    rows = cats.all()
    out: dict[str, Decimal] = {cid: raw.get(cid, Decimal("0")) for cid, _ in rows}
    for cid, parent_id in rows:
        if parent_id is not None and parent_id in out:
            out[parent_id] += raw.get(cid, Decimal("0"))
    return out
