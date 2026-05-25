"""Business logic for category operations."""

import re
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Set, Tuple
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import Category, HouseholdMember, Transaction, User


# --- Validation Helpers ---

def validate_color(color: str) -> bool:
    """Check if color is a valid 6-digit hex code."""
    return bool(re.match(r"^#[0-9A-Fa-f]{6}$", color))


def check_circular_relationship(
    db: Session, category_id: UUID, parent_id: UUID
) -> bool:
    """Check if setting parent_id would create a circular relationship.

    Walks up the parent chain from the proposed parent to see if it reaches
    the current category.
    """
    if category_id == parent_id:
        return True  # Self-reference

    # Walk up the parent chain from parent_id
    current = db.query(Category).filter_by(id=parent_id).first()
    visited: Set[UUID] = set()
    while current and current.parent_id:
        if current.id == category_id:
            return True  # Circular detected
        visited.add(current.id)
        current = db.query(Category).filter_by(id=current.parent_id).first()

    return False


def get_user_household_id(
    db: Session, user: User
) -> Optional[UUID]:
    """Get the household_id for the current user."""
    member = db.query(HouseholdMember).filter(
        HouseholdMember.user_id == user.id
    ).first()
    return member.household_id if member else None


def belongs_to_household(db: Session, category: Category, household_id: UUID) -> bool:
    """Check if a category belongs to the user's household."""
    return category.household_id == household_id


# --- CRUD Operations ---

def create_category(
    db: Session,
    user: User,
    name: str,
    color: str = "#9E9E9E",
    icon: Optional[str] = None,
    parent_id: Optional[UUID] = None,
) -> Category:
    """Create a new category in the current user's household.

    Validates:
    - Name is not empty/whitespace
    - Color is valid hex format
    - Name is unique within household (case-insensitive)
    - Parent exists and belongs to same household
    - No circular relationship
    - Maximum nesting depth of 2 levels
    """
    household_id = get_user_household_id(db, user)
    if not household_id:
        raise HTTPException(status_code=400, detail="You must belong to a household to create categories")

    # Validate name
    if not name or not name.strip():
        raise HTTPException(status_code=400, detail="Category name cannot be empty")

    # Validate color
    if not validate_color(color):
        raise HTTPException(status_code=400, detail="Color must be a valid hex code (e.g., #FF5733)")

    # Check name uniqueness (case-insensitive)
    # Include archived categories in the check - names must be unique even when archived
    existing = db.query(Category).filter(
        Category.household_id == household_id,
        func.lower(Category.name) == func.lower(name.strip()),
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Category '{name}' already exists in this household")

    # Validate parent if provided
    if parent_id:
        parent = db.query(Category).filter_by(id=parent_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent category not found")

        if not belongs_to_household(db, parent, household_id):
            raise HTTPException(status_code=400, detail="Parent category must belong to the same household")

        # Check max nesting depth (parent must be top-level)
        if parent.parent_id:
            raise HTTPException(
                status_code=400,
                detail="Maximum nesting depth reached (2 levels only: category → subcategory)",
            )

    # Create the category
    category = Category(
        household_id=household_id,
        parent_id=parent_id,
        name=name.strip(),
        type="expense",  # Default custom categories to expense type
        color=color,
        icon=icon,
        is_default=False,
        is_archived=False,
        created_by=user.id,
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


# Sentinel value to distinguish "field not provided" from "field set to null"
UNSET = object()


def update_category(
    db: Session,
    user: User,
    category_id: UUID,
    name: Optional[str] = None,
    color: Optional[str] = None,
    icon: Optional[str] = None,
    parent_id: Any = UNSET,
) -> Category:
    """Update an existing category (partial update).

    Only updates provided fields. Validates uniqueness and hierarchy rules.
    Use parent_id=None to demote a subcategory to top-level.
    """
    category = db.query(Category).filter_by(id=category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    household_id = get_user_household_id(db, user)
    if not household_id:
        raise HTTPException(status_code=400, detail="You must belong to a household")

    if not belongs_to_household(db, category, household_id):
        raise HTTPException(status_code=404, detail="Category not found")

    # Update name
    if name is not None:
        if not name.strip():
            raise HTTPException(status_code=400, detail="Category name cannot be empty")

        # Check uniqueness excluding self (include archived categories in check)
        existing = db.query(Category).filter(
            Category.household_id == household_id,
            func.lower(Category.name) == func.lower(name.strip()),
            Category.id != category_id,
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Category '{name}' already exists in this household")

        category.name = name.strip()

    # Update color
    if color is not None:
        if not validate_color(color):
            raise HTTPException(status_code=400, detail="Color must be a valid hex code (e.g., #FF5733)")
        category.color = color

    # Update icon
    if icon is not None:
        category.icon = icon

    # Update parent (using sentinel to distinguish "not provided" from "set to null")
    if parent_id is not UNSET:
        if parent_id:
            parent = db.query(Category).filter_by(id=parent_id).first()
            if not parent:
                raise HTTPException(status_code=404, detail="Parent category not found")

            if not belongs_to_household(db, parent, household_id):
                raise HTTPException(status_code=400, detail="Parent category must belong to the same household")

            # Check circular relationship
            if check_circular_relationship(db, category.id, parent_id):
                raise HTTPException(status_code=400, detail="Cannot create circular parent-child relationship")

            # Check max nesting depth
            if parent.parent_id:
                raise HTTPException(
                    status_code=400,
                    detail="Maximum nesting depth reached (2 levels only: category → subcategory)",
                )

        category.parent_id = parent_id

    db.commit()
    db.refresh(category)
    return category


def archive_category(db: Session, user: User, category_id: UUID) -> dict:
    """Soft-delete (archive) a category.

    Validates:
    - Default categories cannot be deleted
    - Categories with existing transactions cannot be deleted
    - Categories with subcategories cannot be deleted until children are moved/deleted
    """
    category = db.query(Category).filter_by(id=category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    household_id = get_user_household_id(db, user)
    if not household_id:
        raise HTTPException(status_code=400, detail="You must belong to a household")

    if not belongs_to_household(db, category, household_id):
        raise HTTPException(status_code=404, detail="Category not found")

    # Check for existing transactions
    transaction_count = db.query(Transaction).filter(
        Transaction.category_id == category_id
    ).count()
    if transaction_count > 0:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete category with existing transactions. Merge or reassign transactions first.",
        )

    # Auto-promote children instead of blocking (set parent_id=NULL)
    promoted_count = promote_children(db, category_id)

    category.is_archived = True
    db.commit()
    return {
        "message": "Category archived successfully",
        "promoted_children": promoted_count
    }


def promote_children(db: Session, parent_id: UUID) -> int:
    """Promote all children of a category by setting their parent_id to NULL.

    Returns the number of children that were promoted.
    """
    children = db.query(Category).filter(Category.parent_id == parent_id).all()
    count = len(children)
    for child in children:
        child.parent_id = None
    return count


def delete_category_permanently(db: Session, user: User, category_id: UUID) -> dict:
    """Permanently delete an archived category from the database.

    Only archived categories can be permanently deleted.
    Default categories cannot be permanently deleted.
    """
    category = db.query(Category).filter_by(id=category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    household_id = get_user_household_id(db, user)
    if not household_id:
        raise HTTPException(status_code=400, detail="You must belong to a household")

    if not belongs_to_household(db, category, household_id):
        raise HTTPException(status_code=404, detail="Category not found")

    # Only archived categories can be permanently deleted
    if not category.is_archived:
        raise HTTPException(
            status_code=409,
            detail="Category must be archived before permanent deletion. Archive it first.",
        )

    # Double-check no transactions reference this category (shouldn't happen if properly archived)
    transaction_count = db.query(Transaction).filter(
        Transaction.category_id == category_id
    ).count()
    if transaction_count > 0:
        raise HTTPException(
            status_code=409,
            detail="Cannot permanently delete category with existing transactions.",
        )

    # Promote children to top-level before deletion
    promoted_count = promote_children(db, category_id)

    db.delete(category)
    db.commit()

    return {
        "message": "Category permanently deleted",
        "promoted_children": promoted_count,
    }


def get_category_tree(
    db: Session, household_id: UUID, include_archived: bool = False
) -> list[dict]:
    """Build a nested tree structure of categories.

    Returns all household-specific categories (no system-wide defaults).
    Each top-level category has a 'children' key containing subcategories.
    Single O(n) query + O(n) tree building.
    """
    # Get household-specific categories only
    query = db.query(Category).filter(
        Category.household_id == household_id
    )
    if not include_archived:
        query = query.filter(Category.is_archived == False)  # noqa: E712
    all_categories = query.all()
    all_categories.sort(key=lambda c: c.name.lower())

    # Build lookup and tree in O(n) — TWO-PASS to handle alphabetical ordering
    # where a child (e.g., "Bills") may sort before its parent (e.g., "Groceries")
    category_map: dict[str, dict] = {}

    # Pass 1: Build the complete lookup map
    for cat in all_categories:
        cat_dict = cat.to_dict()
        cat_dict["children"] = []
        category_map[cat.id] = cat_dict

    # Pass 2: Nest children under parents or collect roots
    root_categories: list[dict] = []

    for cat in all_categories:
        cat_dict = category_map[cat.id]

        if cat.parent_id is None:
            root_categories.append(cat_dict)
        elif cat.parent_id in category_map:
            # Parent exists — nest under parent
            category_map[cat.parent_id]["children"].append(cat_dict)
        else:
            # Parent not in results (archived/filtered), treat as root
            root_categories.append(cat_dict)

    return root_categories


def calculate_spending_rollup(
    db: Session, category_id: UUID, household_id: UUID,
    start_date: Optional[str] = None, end_date: Optional[str] = None
) -> dict:
    """Calculate spending rollup for a category including all subcategories.

    Returns direct spending on this category plus aggregated spending
    from all transactions on child categories.
    """
    category = db.query(Category).filter_by(id=category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    if not belongs_to_household(db, category, household_id):
        raise HTTPException(status_code=404, detail="Category not found")

    # Direct transactions on this category
    direct_query = db.query(Transaction).filter(
        Transaction.category_id == category_id,
        Transaction.household_id == household_id
    )

    if start_date:
        direct_query = direct_query.filter(Transaction.date >= start_date)
    if end_date:
        direct_query = direct_query.filter(Transaction.date <= end_date)

    direct_transactions = direct_query.all()
    direct_amount = sum(t.amount for t in direct_transactions)

    # Get all child categories
    children = db.query(Category).filter(
        Category.parent_id == category_id,
        Category.is_archived == False  # noqa: E712
    ).all()

    children_amount = 0.0
    children_breakdown: list[dict] = []
    total_child_transactions = 0

    for child in children:
        child_query = db.query(Transaction).filter(
            Transaction.category_id == child.id,
            Transaction.household_id == household_id
        )

        if start_date:
            child_query = child_query.filter(Transaction.date >= start_date)
        if end_date:
            child_query = child_query.filter(Transaction.date <= end_date)

        child_transactions = child_query.all()
        child_total = sum(t.amount for t in child_transactions)
        children_amount += child_total
        total_child_transactions += len(child_transactions)

        children_breakdown.append({
            "category_id": str(child.id),
            "category_name": child.name,
            "amount": child_total,
            "transaction_count": len(child_transactions)
        })

    total_amount = direct_amount + children_amount

    return {
        "category_id": str(category_id),
        "category_name": category.name,
        "direct_amount": direct_amount,
        "direct_transaction_count": len(direct_transactions),
        "children_amount": children_amount,
        "children_count": len(children),
        "total_amount": total_amount,
        "total_transaction_count": len(direct_transactions) + total_child_transactions,
        "children_breakdown": children_breakdown
    }


def reassign_children(
    db: Session, category_id: UUID, household_id: UUID, new_parent_id: Optional[UUID]
) -> dict:
    """Bulk reassign all children of a category to a new parent.

    Args:
        db: Database session.
        category_id: Current parent category.
        household_id: Household for authorization.
        new_parent_id: New parent category ID, or NULL to promote to root.
    """
    # Verify source category belongs to household
    source = db.query(Category).filter_by(id=category_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Category not found")

    if not belongs_to_household(db, source, household_id):
        raise HTTPException(status_code=404, detail="Category not found")

    # Validate new parent if provided
    if new_parent_id is not None:
        new_parent = db.query(Category).filter_by(id=new_parent_id).first()
        if not new_parent:
            raise HTTPException(status_code=404, detail="New parent category not found")

        if not belongs_to_household(db, new_parent, household_id):
            raise HTTPException(status_code=400, detail="New parent must belong to the same household")

        # Prevent circular relationship
        if new_parent_id == category_id:
            raise HTTPException(
                status_code=400, detail="Cannot reassign children to themselves"
            )

        # Check if new parent is a descendant of the current category
        current = new_parent
        while current.parent_id:
            if current.parent_id == category_id:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot reassign to a subcategory (would create circular relationship)"
                )
            current = db.query(Category).get(current.parent_id)
            if current is None:
                break

        # Enforce 2-level max: new parent must be top-level
        if new_parent.parent_id is not None:
            raise HTTPException(
                status_code=400,
                detail="New parent must be a top-level category (max 2 levels of nesting)"
            )

    # Get all children
    children = db.query(Category).filter(
        Category.parent_id == category_id
    ).all()

    reassigned_ids = []
    for child in children:
        child.parent_id = new_parent_id
        reassigned_ids.append(str(child.id))

    db.commit()

    return {
        "reassigned_count": len(reassigned_ids),
        "reassigned_ids": reassigned_ids,
        "new_parent_id": str(new_parent_id) if new_parent_id else None
    }


def restore_category(db: Session, user: User, category_id: UUID) -> Category:
    """Restore an archived category."""
    category = db.query(Category).filter_by(id=category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    household_id = get_user_household_id(db, user)
    if not household_id:
        raise HTTPException(status_code=400, detail="You must belong to a household")

    if category.household_id is None or not belongs_to_household(db, category, household_id):
        raise HTTPException(status_code=404, detail="Category not found")

    if not category.is_archived:
        raise HTTPException(status_code=400, detail="Category is not archived")

    category.is_archived = False
    db.commit()
    db.refresh(category)
    return category


def list_categories(
    db: Session,
    user: User,
    include_archived: bool = False,
    parent_id: Optional[UUID] = None,
    top_level: bool = False,
) -> List[Tuple[Category, int]]:
    """List categories for the current user's household with optional filters.

    Returns list of (category, children_count) tuples.
    Includes both system-wide defaults (household_id=NULL) and household-specific categories.
    """
    household_id = get_user_household_id(db, user)
    if not household_id:
        return []

    # Only show household-specific categories (defaults are copied to the household on creation)
    # This avoids showing duplicates when both system-wide and household copies exist
    query = db.query(Category).filter(
        Category.household_id == household_id,
    )

    if not include_archived:
        query = query.filter(Category.is_archived == False)  # noqa: E712

    if parent_id is not None:
        query = query.filter(Category.parent_id == parent_id)
    elif top_level:
        query = query.filter(Category.parent_id == None)  # noqa: E711

    query = query.order_by(func.lower(Category.name))
    categories = query.all()

    # Build children count for each category
    result = []
    for cat in categories:
        child_count = db.query(Category).filter(
            Category.parent_id == cat.id,
            Category.is_archived == False,  # noqa: E712
        ).count()
        result.append((cat, child_count))

    return result


# --- Color Pool for Auto-Created Categories ---

UNUSED_COLOR_POOL = [
    "#FF5722",  # Deep Orange
    "#607D8B",  # Blue Grey
    "#795548",  # Brown
    "#9E9E9E",  # Grey
    "#673AB7",  # Deep Purple
    "#3F51B5",  # Indigo
    "#009688",  # Teal
    "#CDDC39",  # Lime
]


def _get_next_auto_color(db: Session, household_id: UUID) -> str:
    """Pick a color from the pool that isn't used by any active category in the household."""
    existing = db.query(Category.color).filter(
        Category.household_id == household_id,
        Category.is_archived == False,  # noqa: E712
    ).all()
    used_colors = {row[0] for row in existing}

    for color in UNUSED_COLOR_POOL:
        if color not in used_colors:
            return color
    # Fallback: return first color in pool (all taken)
    return UNUSED_COLOR_POOL[0]


# --- Merge & Duplicate Detection ---

def _resolve_name_conflict(db: Session, household_id: UUID, parent_id: Optional[UUID], desired_name: str, exclude_id: Optional[UUID] = None) -> str:
    """Return a unique category name, appending ' (N)' suffix if needed.
    
    Checks both active and archived categories within the household+parent scope.
    """
    candidate = desired_name
    counter = 2
    while True:
        existing = db.query(Category).filter(
            Category.household_id == household_id,
            func.lower(Category.name) == func.lower(candidate),
        ).first()
        if existing and (exclude_id is None or existing.id != exclude_id):
            candidate = f"{desired_name} ({counter})"
            counter += 1
        else:
            break
    return candidate


def merge_categories(
    db: Session,
    user: User,
    target_id: UUID,
    source_ids: List[UUID],
) -> dict:
    """Merge multiple source categories into a single target category.

    All transactions and subcategories from sources are reassigned to target.
    Source categories are archived (not deleted) to preserve audit trail.

    Returns dict with counts of reassigned items and merged category info.
    """
    household_id = get_user_household_id(db, user)
    if not household_id:
        raise HTTPException(status_code=400, detail="You must belong to a household")

    # Validate source list
    if not source_ids:
        raise HTTPException(status_code=400, detail="At least one source category is required")

    # Load target
    target = db.query(Category).filter_by(id=target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target category not found")
    if not belongs_to_household(db, target, household_id):
        raise HTTPException(status_code=404, detail="Target category not found")

    # Target must not be archived
    if target.is_archived:
        raise HTTPException(status_code=400, detail="Cannot merge into an archived category")

    # Load and validate all sources
    sources: List[Category] = []
    for source_id in source_ids:
        if source_id == target_id:
            raise HTTPException(status_code=400, detail="Cannot merge a category into itself")
        source = db.query(Category).filter_by(id=source_id).first()
        if not source:
            continue  # Skip non-existent sources with warning
        if not belongs_to_household(db, source, household_id):
            raise HTTPException(status_code=400, detail=f"Source category {source_id} does not belong to your household")
        if source.is_archived:
            raise HTTPException(status_code=400, detail=f"Cannot merge archived category '{source.name}'")
        # Default protection: cannot merge default into non-default
        if source.is_default and not target.is_default:
            raise HTTPException(
                status_code=403,
                detail=f"Cannot merge default category '{source.name}' into non-default category"
            )
        sources.append(source)

    if not sources:
        raise HTTPException(status_code=404, detail="No valid source categories found")

    # Perform the merge for each source
    total_transactions = 0
    total_subcategories = 0
    merged_sources: List[dict] = []

    for source in sources:
        # 1. Reassign transactions from source → target
        transactions_updated = db.query(Transaction).filter(
            Transaction.category_id == source.id
        ).update({
            Transaction.category_id: target_id,
            Transaction.updated_at: func.now(),
        }, synchronize_session="fetch")
        total_transactions += transactions_updated

        # 2. Reassign subcategories from source → target
        children = db.query(Category).filter(
            Category.parent_id == source.id
        ).all()
        source_subcats = 0
        for child in children:
            # Handle name conflicts with existing subcategories of target
            new_name = _resolve_name_conflict(
                db, household_id, target_id, child.name, exclude_id=child.id
            )
            if new_name != child.name:
                child.name = new_name
            child.parent_id = target_id
            source_subcats += 1
        total_subcategories += source_subcats

        # 3. Archive the source
        source.is_archived = True

        merged_sources.append({
            "id": str(source.id),
            "name": source.name,
            "transactions_reassigned": transactions_updated,
            "subcategories_reassigned": source_subcats,
        })

    db.commit()
    db.refresh(target)

    # Build response matching MergeResponse Pydantic model
    if len(merged_sources) == 1:
        src = merged_sources[0]
        message = f"Category '{src['name']}' merged into '{target.name}'"
    else:
        source_names = ", ".join(s["name"] for s in merged_sources)
        message = f"Merged {len(merged_sources)} categories ({source_names}) into '{target.name}'"

    return {
        "success": True,
        "target_category": {"id": str(target.id), "name": target.name},
        "sources_merged": merged_sources,
        "total_transactions_reassigned": total_transactions,
        "total_subcategories_reassigned": total_subcategories,
        "message": message,
    }


def detect_duplicates(db: Session, household_id: UUID) -> dict:
    """Detect potential duplicate categories using name similarity.

    Groups categories that share similar names (case-insensitive).
    Uses SequenceMatcher ratio for fuzzy matching.
    """
    categories = db.query(Category).filter(
        Category.household_id == household_id,
        Category.is_archived == False,  # noqa: E712
    ).all()

    if len(categories) < 2:
        return {"duplicate_groups": []}

    # Build transaction counts per category (single query via group_by)
    tx_counts = db.query(
        Transaction.category_id, func.count(Transaction.id)
    ).filter(
        Transaction.household_id == household_id
    ).group_by(Transaction.category_id).all()
    tx_map: Dict[str, int] = {str(cid): cnt for cid, cnt in tx_counts}

    # Compare every pair and build groups
    n = len(categories)
    # Union-Find for transitive grouping
    parent: Dict[int, int] = list(range(n))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: int, b: int):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for i in range(n):
        for j in range(i + 1, n):
            name_a = categories[i].name.lower().strip()
            name_b = categories[j].name.lower().strip()
            if name_a == name_b:
                union(i, j)
            else:
                ratio = SequenceMatcher(None, name_a, name_b).ratio()
                if ratio > 0.85:
                    union(i, j)

    # Collect groups
    groups_map: Dict[int, List[int]] = {}
    for i in range(n):
        root = find(i)
        groups_map.setdefault(root, []).append(i)

    duplicate_groups: List[dict] = []
    group_id = 0
    for indices in groups_map.values():
        if len(indices) < 2:
            continue
        group_id += 1
        group_cats = [categories[i] for i in indices]
        
        # Determine similarity type
        names_lower = [c.name.lower().strip() for c in group_cats]
        if len(set(names_lower)) == 1:
            similarity = "exact_case_insensitive" if len(set(c.name for c in group_cats)) > 1 else "whitespace"
        else:
            similarity = "similar"

        duplicate_groups.append({
            "group_id": group_id,
            "categories": [
                {
                    "id": str(c.id),
                    "name": c.name,
                    "transaction_count": tx_map.get(str(c.id), 0),
                }
                for c in group_cats
            ],
            "similarity": similarity,
        })

    return {"duplicate_groups": duplicate_groups}


# --- Import Category Mapping ---

def _match_category(
    imported_name: str,
    existing_categories: List[Category],
) -> Optional[Tuple[Category, str]]:
    """Try to match an imported category name to an existing category.

    Returns (category, match_type) or None if no match found.
    Match types: "exact", "trimmed", "fuzzy"
    """
    name_lower = imported_name.lower()
    name_trimmed = name_lower.strip()

    # 1. Exact case-insensitive match
    for cat in existing_categories:
        if cat.name.lower() == name_trimmed:
            return (cat, "exact")

    # 2. Trimmed match (strip whitespace from both ends)
    for cat in existing_categories:
        if cat.name.strip().lower() == name_trimmed:
            return (cat, "trimmed")

    # 3. Fuzzy match using SequenceMatcher
    best_match = None
    best_ratio = 0.0
    for cat in existing_categories:
        ratio = SequenceMatcher(None, name_trimmed, cat.name.lower()).ratio()
        if ratio > best_ratio and ratio > 0.85:
            best_ratio = ratio
            best_match = cat

    if best_match is not None:
        return (best_match, "fuzzy")

    return None


def preview_category_mappings(
    db: Session,
    household_id: UUID,
    category_values: List[str],
) -> dict:
    """Preview how imported category names map to existing categories.

    For each unique imported name, tries to find a match using exact/trimmed/fuzzy logic.
    Returns mapped categories with match types and transaction counts.
    """
    # Count occurrences of each category value (transaction count)
    value_counts: Dict[str, int] = {}
    for val in category_values:
        value_counts[val] = value_counts.get(val, 0) + 1

    # Get all active categories for matching
    existing_categories = db.query(Category).filter(
        Category.household_id == household_id,
        Category.is_archived == False,  # noqa: E712
    ).all()

    mappings: List[dict] = []
    for imported_name, count in value_counts.items():
        match_result = _match_category(imported_name, existing_categories)

        if match_result is not None:
            matched_cat, match_type = match_result
            mappings.append({
                "imported_name": imported_name,
                "transaction_count": count,
                "matched_category_id": str(matched_cat.id),
                "matched_category_name": matched_cat.name,
                "match_type": match_type,
                "needs_mapping": False,
            })
        else:
            mappings.append({
                "imported_name": imported_name,
                "transaction_count": count,
                "matched_category_id": None,
                "matched_category_name": None,
                "match_type": "unmapped",
                "needs_mapping": True,
            })

    # Summary stats
    exact_matches = sum(1 for m in mappings if m["match_type"] == "exact")
    fuzzy_matches = sum(1 for m in mappings if m["match_type"] in ("trimmed", "fuzzy"))
    unmapped = sum(1 for m in mappings if m["match_type"] == "unmapped")

    return {
        "mappings": mappings,
        "total_categories": len(mappings),
        "exact_matches": exact_matches,
        "fuzzy_matches": fuzzy_matches,
        "unmapped_count": unmapped,
    }


def save_import_mapping(
    db: Session,
    household_id: UUID,
    user_id: UUID,
    mapping_overrides: List[dict],
) -> dict:
    """Save user's manual mapping overrides and auto-create unmapped categories.

    Args:
        mapping_overrides: List of {imported_name, mapped_to_id, create_new} dicts.
            - mapped_to_id: UUID string of existing category to map to
            - create_new: bool to auto-create a new category for unmapped names

    Returns dict with created categories and total mappings saved.
    """
    created_categories: List[dict] = []
    applied_mappings: List[dict] = []

    for override in mapping_overrides:
        # Handle both dict and Pydantic model inputs
        if isinstance(override, dict):
            imported_name = override.get("imported_name", "")
            mapped_to_id = override.get("mapped_to_id")
            create_new = override.get("create_new", False)
        else:
            imported_name = getattr(override, "imported_name", "")
            mapped_to_id = getattr(override, "mapped_to_id", None)
            create_new = getattr(override, "create_new", False)

        if mapped_to_id:
            # User manually selected an existing category
            applied_mappings.append({
                "imported_name": imported_name,
                "mapped_to_id": mapped_to_id,
                "action": "mapped_to_existing",
            })
        elif create_new and imported_name:
            # Auto-create a new category
            color = _get_next_auto_color(db, household_id)
            new_cat = Category(
                household_id=household_id,
                parent_id=None,
                name=imported_name.strip(),
                type="expense",
                color=color,
                icon=None,
                is_default=False,
                is_archived=False,
                created_by=user_id,
            )
            db.add(new_cat)
            db.flush()  # Get the ID before commit
            db.refresh(new_cat)

            applied_mappings.append({
                "imported_name": imported_name,
                "mapped_to_id": str(new_cat.id),
                "action": "auto_created",
            })
            created_categories.append({
                "id": str(new_cat.id),
                "name": new_cat.name,
                "color": new_cat.color,
            })

    db.commit()

    return {
        "created_categories": created_categories,
        "applied_mappings": applied_mappings,
        "total_created": len(created_categories),
        "total_mapped": len(applied_mappings),
    }
