"""Category request/response schemas (ARCH §3.7, Story 3.1).

Generic-entity surface → **snake_case wire** (plain `BaseModel`, no `to_camel`). Unlike the
household/profile surface (the §2.14.C camelCase exception), categories cross the wire snake_case to
match the generic frontend entity layer (`frontend/src/types/entity.ts`; `api/client.ts` does no
case conversion). The list response follows the `{items, total}` rule (backend.md).

Three schemas per the services/base.py template: `CategoryCreate` (required), `CategoryUpdate`
(all optional — partial via `exclude_unset`), `CategoryResponse` (`from_attributes`). `depth` is
derived by the service from `parent_id`, so it is read-only (response only, never in the body).
"""

from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class CategoryCreate(BaseModel):
    name: str
    color: str
    icon: str | None = None
    category_type: str = "expense"
    parent_id: str | None = None
    vivid: bool = False


class CategoryUpdate(BaseModel):
    # No `parent_id`: re-parent / promote is Story 3.2 (with its own depth + has-children guards).
    # Editing a category never moves it in the tree; a parent_id sent here is ignored (Pydantic
    # drops extra fields), so the tree's 2-level invariant can't be violated via PATCH.
    name: str | None = None
    color: str | None = None
    icon: str | None = None
    category_type: str | None = None
    vivid: bool | None = None


class CategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    color: str
    icon: str | None
    category_type: str
    parent_id: str | None
    depth: int
    vivid: bool
    status: str
    # Computed by the router (Story 3.2), not ORM columns: drives the ⋮ Delete-disabled-with-reason
    # (UX §8.1). Defaults make `model_validate(cat)` safe; the router overrides them from the
    # dependency scan. `can_delete=False` ⇒ `delete_blocked_reason` explains why.
    can_delete: bool = True
    delete_blocked_reason: str | None = None


class CategoryMove(BaseModel):
    # Promote (parent_id=None → depth 0) or re-parent (parent_id=<top-level> → depth 1). The single
    # move operation behind both the ⋮ Promote/Move items and drag (Story 3.2, UX §6/§8.1).
    parent_id: str | None = None


class CategoryListOut(BaseModel):
    items: list[CategoryResponse]
    total: int


class CategorySpendingOut(BaseModel):
    # Rolled-up base-currency spend per category (FR-C-008): a parent's figure includes all its
    # children's spend. Map of category-id → amount_base. Consumers: budget actuals (Story 8.2),
    # dashboard spending pie (Epic 9). Built ahead of those so they are pure wiring.
    spending: dict[str, Decimal]
