"""Category management API routes."""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db, get_default_category_templates
from ..models import Category, HouseholdMember, User
from ..services.category_service import (
    archive_category,
    calculate_spending_rollup,
    create_category,
    delete_category_permanently,
    detect_duplicates,
    get_category_tree,
    list_categories,
    merge_categories,
    preview_category_mappings,
    reassign_children,
    restore_category,
    save_import_mapping,
    update_category,
)

router = APIRouter(prefix="/api/categories", tags=["categories"])


# --- Pydantic Models ---

class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Category name")
    color: str = Field(default="#9E9E9E", pattern=r"^#[0-9A-Fa-f]{6}$", description="Hex color code")
    icon: Optional[str] = Field(None, max_length=50, description="Emoji or icon identifier")
    parent_id: Optional[UUID] = None  # Optional parent for subcategories


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    icon: Optional[str] = Field(None, max_length=50)
    parent_id: Optional[UUID] = None


class CategoryResponse(BaseModel):
    id: str
    household_id: str | None = None
    parent_id: str | None = None
    name: str
    type: str
    color: str | None = None
    icon: str | None = None
    is_default: bool = False
    is_archived: bool = False
    children_count: int = 0
    created_by: str | None = None
    created_at: str | None = None
    updated_at: str | None = None

    @model_validator(mode="before")
    @classmethod
    def convert_from_orm(cls, value: any) -> any:
        """Convert SQLAlchemy objects to dicts before validation."""
        if isinstance(value, dict):
            return {
                "id": str(value.get("id")) if value.get("id") else "",
                "household_id": str(value.get("household_id")) if value.get("household_id") else None,
                "parent_id": str(value.get("parent_id")) if value.get("parent_id") else None,
                "name": value.get("name", ""),
                "type": value.get("type", ""),
                "color": value.get("color"),
                "icon": value.get("icon"),
                "is_default": value.get("is_default", False),
                "is_archived": value.get("is_archived", False),
                "children_count": value.get("children_count", 0),
                "created_by": str(value.get("created_by")) if value.get("created_by") else None,
                "created_at": value.get("created_at").isoformat() if value.get("created_at") and hasattr(value.get("created_at"), "isoformat") else value.get("created_at"),
                "updated_at": value.get("updated_at").isoformat() if value.get("updated_at") and hasattr(value.get("updated_at"), "isoformat") else value.get("updated_at"),
            }
        # Handle SQLAlchemy objects
        return {
            "id": str(value.id) if value.id else "",
            "household_id": str(value.household_id) if value.household_id else None,
            "parent_id": str(value.parent_id) if value.parent_id else None,
            "name": value.name,
            "type": value.type,
            "color": value.color,
            "icon": value.icon,
            "is_default": value.is_default,
            "is_archived": value.is_archived,
            "children_count": getattr(value, "children_count", 0),
            "created_by": str(value.created_by) if value.created_by else None,
            "created_at": value.created_at.isoformat() if value.created_at and hasattr(value.created_at, "isoformat") else value.created_at,
            "updated_at": value.updated_at.isoformat() if value.updated_at and hasattr(value.updated_at, "isoformat") else value.updated_at,
        }


class CategoryTreeNode(BaseModel):
    id: str
    household_id: str | None = None
    parent_id: str | None = None
    name: str
    type: str
    color: str | None = None
    icon: str | None = None
    is_default: bool = False
    is_archived: bool = False
    children_count: int = 0
    created_by: str | None = None
    created_at: str | None = None
    updated_at: str | None = None
    children: list["CategoryTreeNode"] = []


class SpendingBreakdown(BaseModel):
    category_id: str
    category_name: str
    amount: float
    transaction_count: int


class SpendingSummaryResponse(BaseModel):
    category_id: str
    category_name: str
    direct_amount: float
    direct_transaction_count: int
    children_amount: float
    children_count: int
    total_amount: float
    total_transaction_count: int
    children_breakdown: list[SpendingBreakdown]


class ReassignChildrenRequest(BaseModel):
    new_parent_id: Optional[UUID] = None


class ReassignChildrenResponse(BaseModel):
    reassigned_count: int
    reassigned_ids: list[str]
    new_parent_id: str | None = None


class SeedStatusResponse(BaseModel):
    is_seeded: bool
    expense_count: int = 0
    income_count: int = 0


class MergeRequest(BaseModel):
    target_id: UUID = Field(..., description="Category to keep (surviving category)")
    source_ids: List[UUID] = Field(..., min_items=1, description="Categories to merge into target")


class MergeSourceResult(BaseModel):
    id: str
    name: str
    transactions_reassigned: int
    subcategories_reassigned: int


class MergeResponse(BaseModel):
    success: bool
    target_category: dict
    sources_merged: List[MergeSourceResult]
    total_transactions_reassigned: int
    total_subcategories_reassigned: int
    message: str


class DuplicateCategory(BaseModel):
    id: str
    name: str
    transaction_count: int


class DuplicateGroup(BaseModel):
    group_id: int
    categories: List[DuplicateCategory]
    similarity: str


class DuplicatesResponse(BaseModel):
    duplicate_groups: List[DuplicateGroup]


# --- Routes ---

@router.get("", response_model=List[CategoryResponse])
async def list_categories_endpoint(
    include_archived: bool = Query(False, description="Include archived categories"),
    parent_id: Optional[str] = Query(None, description="Filter by parent category ID"),
    top_level: bool = Query(False, description="Only top-level categories"),
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    """List household-specific categories with optional filters.

    Query parameters:
    - include_archived: Include archived categories (default: false)
    - parent_id: Filter to only subcategories of a specific parent
    - top_level: Filter to only top-level categories (no parent)
    """
    parsed_parent_id = UUID(parent_id) if parent_id else None
    results = list_categories(
        db, user, include_archived=include_archived, parent_id=parsed_parent_id, top_level=top_level
    )

    output = []
    for cat, child_count in results:
        data = cat.to_dict()
        data["children_count"] = child_count
        output.append(data)
    return output


@router.post("", response_model=CategoryResponse, status_code=201)
async def create_category_endpoint(
    body: CategoryCreate,
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    """Create a new custom category in the current user's household."""
    category = create_category(
        db,
        user,
        name=body.name,
        color=body.color,
        icon=body.icon,
        parent_id=body.parent_id,
    )
    return category.to_dict()


@router.put("/{category_id}", response_model=CategoryResponse)
async def update_category_endpoint(
    category_id: UUID,
    body: CategoryUpdate,
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    """Update an existing category (partial update — only provided fields are changed)."""
    category = update_category(
        db,
        user,
        category_id,
        name=body.name,
        color=body.color,
        icon=body.icon,
        parent_id=body.parent_id,
    )
    return category.to_dict()


@router.delete("/{category_id}")
async def archive_category_endpoint(
    category_id: UUID,
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    """Soft-delete (archive) a category.

    Default categories cannot be deleted.
    Categories with existing transactions or subcategories cannot be deleted.
    """
    result = archive_category(db, user, category_id)
    return result


@router.patch("/{category_id}/restore", response_model=CategoryResponse)
async def restore_category_endpoint(
    category_id: UUID,
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    """Restore an archived category."""
    category = restore_category(db, user, category_id)
    return category.to_dict()


@router.delete("/{category_id}/permanent")
async def delete_category_permanently_endpoint(
    category_id: UUID,
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    """Permanently delete an archived category.

    Only archived categories can be permanently deleted.
    Default categories cannot be permanently deleted.
    Children of the deleted category will be promoted to top-level.
    """
    result = delete_category_permanently(db, user, category_id)
    return result


@router.get("/seed-status", response_model=SeedStatusResponse)
async def get_seed_status(
    db=Depends(get_db),
):
    """Check if default categories have been seeded (public endpoint)."""
    from sqlalchemy import func

    expense_count = db.query(Category).filter(
        Category.household_id == None,  # noqa: E711
        Category.is_default == True,  # noqa: E712
        Category.type == "expense"
    ).count()

    income_count = db.query(Category).filter(
        Category.household_id == None,  # noqa: E711
        Category.is_default == True,  # noqa: E712
        Category.type == "income"
    ).count()

    is_seeded = expense_count > 0 and income_count > 0

    return SeedStatusResponse(
        is_seeded=is_seeded,
        expense_count=expense_count,
        income_count=income_count,
    )


@router.get("/tree", response_model=list[CategoryTreeNode])
async def get_category_tree_endpoint(
    include_archived: bool = Query(False, description="Include archived categories"),
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    """Get categories as a nested tree structure.

    Returns top-level categories with nested 'children' arrays for subcategories.
    """
    # Get household_id for the user
    member = db.query(HouseholdMember).filter(
        HouseholdMember.user_id == user.id
    ).first()
    if not member:
        raise HTTPException(status_code=400, detail="You must belong to a household")

    tree = get_category_tree(db, member.household_id, include_archived=include_archived)
    return tree


@router.get("/{category_id}/spending-summary", response_model=SpendingSummaryResponse)
async def get_spending_summary_endpoint(
    category_id: UUID,
    start_date: Optional[str] = Query(None, description="Filter transactions from this date (ISO format)"),
    end_date: Optional[str] = Query(None, description="Filter transactions until this date (ISO format)"),
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    """Get spending rollup for a category including all subcategories.

    Aggregates direct spending on the category plus all child categories.
    Optional date range filtering via start_date and end_date query params.
    """
    member = db.query(HouseholdMember).filter(
        HouseholdMember.user_id == user.id
    ).first()
    if not member:
        raise HTTPException(status_code=400, detail="You must belong to a household")

    summary = calculate_spending_rollup(
        db, category_id, member.household_id,
        start_date=start_date, end_date=end_date
    )
    return summary


@router.patch("/{category_id}/reassign-children", response_model=ReassignChildrenResponse)
async def reassign_children_endpoint(
    category_id: UUID,
    body: ReassignChildrenRequest,
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    """Bulk reassign all subcategories of a category to a new parent.

    Set new_parent_id to a top-level category ID to move children under it,
    or set to null to promote all children to top-level categories.
    """
    member = db.query(HouseholdMember).filter(
        HouseholdMember.user_id == user.id
    ).first()
    if not member:
        raise HTTPException(status_code=400, detail="You must belong to a household")

    result = reassign_children(
        db, category_id, member.household_id, body.new_parent_id
    )
    return result


@router.post("/create-defaults", response_model=List[CategoryResponse], status_code=201)
async def create_default_categories_endpoint(
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    """Create all default categories for the current user's household.

    Uses the built-in category templates to create standard expense and income
    categories. Skips any categories that already exist by name.
    """
    member = db.query(HouseholdMember).filter(
        HouseholdMember.user_id == user.id
    ).first()
    if not member:
        raise HTTPException(status_code=400, detail="You must belong to a household")

    household_id = member.household_id
    templates = get_default_category_templates()
    created = []

    for template in templates:
        # Skip if category with this name already exists
        existing = db.query(Category).filter(
            Category.household_id == household_id,
            func.lower(Category.name) == func.lower(template["name"]),
        ).first()
        if existing:
            continue

        category = Category(
            household_id=household_id,
            parent_id=None,
            name=template["name"],
            type=template["type"],
            color=template["color"],
            icon=template["icon"],
            is_default=False,
            is_archived=False,
            created_by=user.id,
        )
        db.add(category)
        created.append(category)

    db.commit()
    for cat in created:
        db.refresh(cat)

    return created


@router.post("/merge", response_model=MergeResponse)
async def merge_categories_endpoint(
    body: MergeRequest,
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    """Merge multiple source categories into a single target category.

    All transactions and subcategories from sources are reassigned to target.
    Source categories are archived (not deleted) to preserve audit trail.
    """
    member = db.query(HouseholdMember).filter(
        HouseholdMember.user_id == user.id
    ).first()
    if not member:
        raise HTTPException(status_code=400, detail="You must belong to a household")

    result = merge_categories(db, user, body.target_id, body.source_ids)
    return result


@router.get("/duplicates", response_model=DuplicatesResponse)
async def detect_duplicates_endpoint(
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    """Detect potential duplicate categories using name similarity.

    Returns grouped duplicates with similarity scores and transaction counts.
    """
    member = db.query(HouseholdMember).filter(
        HouseholdMember.user_id == user.id
    ).first()
    if not member:
        raise HTTPException(status_code=400, detail="You must belong to a household")

    # detect_duplicates returns {"duplicate_groups": [...]} which matches DuplicatesResponse
    return detect_duplicates(db, member.household_id)


# --- Import Category Mapping ---

class ImportPreviewRequest(BaseModel):
    category_values: List[str] = Field(..., min_items=1, description="List of category names from imported transactions")


class MappedCategory(BaseModel):
    imported_name: str
    transaction_count: int
    matched_category_id: Optional[str] = None
    matched_category_name: Optional[str] = None
    match_type: str  # "exact", "trimmed", "fuzzy", "unmapped"
    needs_mapping: bool


class ImportPreviewResponse(BaseModel):
    mappings: List[MappedCategory]
    total_categories: int
    exact_matches: int
    fuzzy_matches: int
    unmapped_count: int


class MappingOverride(BaseModel):
    imported_name: str
    mapped_to_id: Optional[str] = None
    create_new: bool = False


class ImportMappingRequest(BaseModel):
    mapping_overrides: List[MappingOverride]


class CreatedCategory(BaseModel):
    id: str
    name: str
    color: str


class AppliedMapping(BaseModel):
    imported_name: str
    mapped_to_id: str
    action: str  # "mapped_to_existing" or "auto_created"


class ImportMappingResponse(BaseModel):
    created_categories: List[CreatedCategory]
    applied_mappings: List[AppliedMapping]
    total_created: int
    total_mapped: int


@router.post("/import/preview", response_model=ImportPreviewResponse)
async def preview_import_mapping_endpoint(
    body: ImportPreviewRequest,
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    """Preview how imported category names map to existing categories.

    For each unique imported name, tries to find a match using exact/trimmed/fuzzy logic.
    Returns mapped categories with match types and transaction counts.
    """
    member = db.query(HouseholdMember).filter(
        HouseholdMember.user_id == user.id
    ).first()
    if not member:
        raise HTTPException(status_code=400, detail="You must belong to a household")

    result = preview_category_mappings(db, member.household_id, body.category_values)
    return result


@router.put("/import/mapping", response_model=ImportMappingResponse)
async def save_import_mapping_endpoint(
    body: ImportMappingRequest,
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    """Save user's manual mapping overrides and auto-create unmapped categories.

    For each override:
    - If mapped_to_id is provided, map to existing category
    - If create_new is true, auto-create a new category with a color from the pool
    """
    member = db.query(HouseholdMember).filter(
        HouseholdMember.user_id == user.id
    ).first()
    if not member:
        raise HTTPException(status_code=400, detail="You must belong to a household")

    result = save_import_mapping(db, member.household_id, user.id, body.mapping_overrides)
    return result
