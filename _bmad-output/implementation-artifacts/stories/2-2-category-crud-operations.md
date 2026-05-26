---
story_id: "2-2"
story_key: "category-crud-operations"
title: "Category CRUD Operations"
epic_id: "epic-2"
epic_title: "Core Infrastructure & Categories"
status: in-progress
priority: P1 (High)
author: Ben
created: 2026-05-24
updated: 2026-05-24
estimated_effort: 3-4 days
dependencies: ["2-1-default-category-seeding"]
---

# Story: Category CRUD Operations (2-2)

## User Story

**As a** household member,  
**I want to** create, edit, and delete custom categories with name, color, and icon,  
**So that** I can organize my transactions with categories that match my spending habits.

## Acceptance Criteria

### AC-001: Create Custom Category
- [ ] `POST /api/categories` — creates a new category in the current user's household
- [ ] Request body: `{ "name": string, "color": hex_string, "icon": string?, "parent_id": UUID? }`
- [ ] Name is required, max 100 characters, unique within household (case-insensitive check using `func.lower()`)
- [ ] Color defaults to `#9E9E9E` if not provided, must be valid hex format (`^#[0-9A-Fa-f]{6}$`)
- [ ] Icon is optional, max 50 characters (emoji or icon identifier)
- [ ] Parent ID is optional — if provided, must reference an existing category in the same household
- [ ] Returns `201 Created` with the new category object including generated UUID
- [ ] Returns `409 Conflict` if category name already exists in the household

### AC-002: Update Category
- [ ] `PUT /api/categories/{category_id}` — updates an existing category
- [ ] Request body: `{ "name"?: string, "color"?: hex_string, "icon"?: string?, "parent_id"?: UUID? }` — all fields optional
- [ ] Only updates provided fields (partial update behavior)
- [ ] Name uniqueness check applies (excluding the current category itself)
- [ ] Cannot change `is_default` flag after creation
- [ ] Returns `200 OK` with updated category object
- [ ] Returns `404 Not Found` if category doesn't exist or doesn't belong to user's household
- [ ] Returns `403 Forbidden` if attempting to modify a default category's protected fields

### AC-003: Delete Category (Soft Delete via Archive)
- [ ] `DELETE /api/categories/{category_id}` — soft-deletes (archives) a category
- [ ] Sets `is_archived = true` instead of physically deleting
- [ ] Default categories (`is_default=True`) CANNOT be deleted — return `403 Forbidden` with message "Default categories cannot be deleted"
- [ ] Categories with existing transactions CANNOT be deleted — return `409 Conflict` with message "Cannot delete category with existing transactions. Merge or reassign transactions first."
- [ ] Categories with subcategories (children) CANNOT be deleted until children are deleted or reassigned — return `409 Conflict`
- [ ] Returns `200 OK` with `{ "message": "Category archived successfully" }`
- [ ] Archived categories excluded from default category list queries

### AC-004: Restore Archived Category
- [ ] `PATCH /api/categories/{category_id}/restore` — restores an archived category
- [ ] Sets `is_archived = false`
- [ ] Returns `200 OK` with restored category object
- [ ] Returns `404 Not Found` if category doesn't exist or is not archived

### AC-005: Category List with Filtering and Hierarchy
- [ ] `GET /api/categories` — list categories with optional filters
- [ ] Query parameters:
  - `?include_archived=true` — include archived categories (default: false)
  - `?parent_id=uuid` — filter to only subcategories of a specific parent
  - `?top_level=true` — filter to only top-level categories (no parent)
- [ ] Response includes `children_count` for each category (count of active subcategories)
- [ ] Categories sorted by name alphabetically (case-insensitive)
- [ ] System-wide defaults (`household_id=NULL`) are NOT included in household category lists

### AC-006: Category Validation Rules
- [ ] Name cannot be empty or whitespace-only
- [ ] Name must be unique within the household (case-insensitive: "Groceries" and "groceries" conflict)
- [ ] Cannot create circular parent-child relationships (A → B → A)
  - Validate: if setting `parent_id`, ensure the parent's ancestors don't include the current category
- [ ] Maximum nesting depth: 2 levels (category → subcategory only, no grandchild categories)
  - If `parent_id` is provided, validate that the parent has `parent_id = NULL`

## Technical Requirements

### Backend Implementation

#### Files to Create/Modify
1. **`backend/models.py`** — Category model (created in Story 2-1)
   - Add validation for circular relationships in model methods or repository layer

2. **`backend/routes/categories.py`** — Full CRUD endpoints
   - `POST /api/categories` — create category
   - `PUT /api/categories/{category_id}` — update category
   - `DELETE /api/categories/{category_id}` — archive category
   - `PATCH /api/categories/{category_id}/restore` — restore archived category
   - `GET /api/categories` — list with filters (from Story 2-1)

3. **`backend/services/category_service.py`** — Business logic layer
   - `create_category()` — validation + persistence
   - `update_category()` — partial update with validation
   - `archive_category()` — soft delete with transaction/child checks
   - `restore_category()` — unarchive
   - `list_categories()` — filtered query with hierarchy count
   - `check_circular_relationship()` — prevent circular parent-child

#### Pydantic Models (schemas.py or inline in routes)
```python
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
    id: UUID
    name: str
    color: str
    icon: Optional[str]
    is_default: bool
    is_archived: bool
    parent_id: Optional[UUID]
    children_count: int = 0
    household_id: UUID
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True
```

#### Circular Relationship Prevention
```python
def check_circular_relationship(db: Session, category_id: UUID, parent_id: UUID) -> bool:
    """Check if setting parent_id would create a circular relationship."""
    if category_id == parent_id:
        return True  # Self-reference
    
    # Walk up the parent chain from parent_id
    current = db.query(Category).filter_by(id=parent_id).first()
    visited = set()
    while current and current.parent_id:
        if current.id == category_id:
            return True  # Circular detected
        visited.add(current.id)
        current = db.query(Category).filter_by(id=current.parent_id).first()
    
    return False
```

### Frontend Implementation

#### Files to Create/Modify
1. **`frontend/src/api/categories.ts`** — API client functions
   ```typescript
   export interface Category {
     id: string;
     name: string;
     color: string;
     icon: string | null;
     is_default: boolean;
     is_archived: boolean;
     parent_id: string | null;
     children_count: number;
     household_id: string;
     created_at: string;
     updated_at: string;
   }

   export interface CategoryCreateData {
     name: string;
     color?: string;
     icon?: string | null;
     parent_id?: string | null;
   }

   export interface CategoryUpdateData {
     name?: string;
     color?: string;
     icon?: string | null;
     parent_id?: string | null;
   }

   export const fetchCategories = async (params?: {
     include_archived?: boolean;
     parent_id?: string;
     top_level?: boolean;
   }): Promise<Category[]> => {
     const searchParams = new URLSearchParams();
     if (params?.include_archived) searchParams.set('include_archived', 'true');
     if (params?.parent_id) searchParams.set('parent_id', params.parent_id);
     if (params?.top_level) searchParams.set('top_level', 'true');
     
     const response = await fetch(`/api/categories?${searchParams}`, {
       credentials: 'include',
       headers: { 'X-Session-Id': getSessionId() },
     });
     if (!response.ok) throw new Error(`Failed to fetch categories: ${response.statusText}`);
     return response.json();
   };

   export const createCategory = async (data: CategoryCreateData): Promise<Category> => {
     const csrfToken = await fetchCsrfToken();
     const response = await fetch('/api/categories', {
       method: 'POST',
       credentials: 'include',
       headers: {
         'Content-Type': 'application/json',
         'X-Session-Id': getSessionId(),
         'X-CSRF-Token': csrfToken,
       },
       body: JSON.stringify(data),
     });
     if (!response.ok) throw new Error(`Failed to create category: ${response.statusText}`);
     return response.json();
   };

   export const updateCategory = async (id: string, data: CategoryUpdateData): Promise<Category> => {
     const csrfToken = await fetchCsrfToken();
     const response = await fetch(`/api/categories/${id}`, {
       method: 'PUT',
       credentials: 'include',
       headers: {
         'Content-Type': 'application/json',
         'X-Session-Id': getSessionId(),
         'X-CSRF-Token': csrfToken,
       },
       body: JSON.stringify(data),
     });
     if (!response.ok) throw new Error(`Failed to update category: ${response.statusText}`);
     return response.json();
   };

   export const deleteCategory = async (id: string): Promise<{ message: string }> => {
     const csrfToken = await fetchCsrfToken();
     const response = await fetch(`/api/categories/${id}`, {
       method: 'DELETE',
       credentials: 'include',
       headers: {
         'X-Session-Id': getSessionId(),
         'X-CSRF-Token': csrfToken,
       },
     });
     if (!response.ok) throw new Error(`Failed to delete category: ${response.statusText}`);
     return response.json();
   };

   export const restoreCategory = async (id: string): Promise<Category> => {
     const csrfToken = await fetchCsrfToken();
     const response = await fetch(`/api/categories/${id}/restore`, {
       method: 'PATCH',
       credentials: 'include',
       headers: {
         'X-Session-Id': getSessionId(),
         'X-CSRF-Token': csrfToken,
       },
     });
     if (!response.ok) throw new Error(`Failed to restore category: ${response.statusText}`);
     return response.json();
   };
   ```

2. **`frontend/src/components/CategoryManager.tsx`** — Category management UI component
   - List view with color-coded category names and icons
   - Create new category modal/form with name input, color picker, icon selector
   - Edit category inline or via modal
   - Delete confirmation dialog (with validation messages for protected categories)
   - Archive/restore toggle
   - Subcategory indicator (indentation or tree view)

#### CategoryManager Component Design
```tsx
// Key UI elements:
// - Table/list view with columns: Icon, Name, Color Swatch, Subcategories Count, Actions
// - "Add Category" button → opens create modal
// - Each row: Edit button, Delete button (disabled for defaults), Archive toggle
// - Create/Edit form:
//   - Name input (required, max 100 chars)
//   - Color picker (native <input type="color"> or custom palette)
//   - Icon selector (dropdown of common emojis, or free-text input)
//   - Parent category dropdown (optional, for subcategories)
// - Validation feedback inline (name conflict, empty name, etc.)
```

## Design Considerations

### Color Picker UX
- Use native `<input type="color">` for simplicity, or a custom color palette picker
- Show color swatch next to category name in the list view
- Default to `#9E9E9E` if user doesn't pick a color

### Icon Selection
- Provide a curated list of ~30 common finance-related emojis as quick-pick options
- Allow free-text emoji input for flexibility
- Show selected icon preview in the form

### Name Uniqueness Feedback
- Real-time validation: show "Category name already exists" when typing a duplicate name
- Case-insensitive check via API endpoint `GET /api/categories/check-name?name=Groceries`

### Default Category Protection
- Visual indicator (lock icon or "Default" badge) for default categories
- Delete button disabled with tooltip "Default categories cannot be deleted"
- Edit form restricts changes to name/color/icon only (not is_default flag)

## Testing Checklist

- [ ] Create category with valid name, color, and icon → returns 201 with UUID
- [ ] Create category with duplicate name (case-insensitive) → returns 409
- [ ] Create subcategory with valid parent_id → succeeds
- [ ] Create category with parent_id that would create circular relationship → returns 400
- [ ] Create category with grandchild nesting (parent has a parent) → returns 400 (max depth 2)
- [ ] Update category name to unique value → returns 200
- [ ] Update default category's name → returns 403 (protected field)
- [ ] Delete custom category with no transactions → returns 200, is_archived=true
- [ ] Delete default category → returns 403
- [ ] Delete category with existing transactions → returns 409
- [ ] Delete category with subcategories → returns 409
- [ ] Restore archived category → returns 200, is_archived=false
- [ ] GET /api/categories?top_level=true → returns only categories without parents
- [ ] GET /api/categories?parent_id=uuid → returns only subcategories of specified parent
- [ ] GET /api/categories?include_archived=true → includes archived categories

## Dependencies

- **Story 2-1 complete**: Category model and default seeding must exist first
- **Epic 1 complete**: Authentication, CSRF protection, and household management required

## Notes

- All mutations (POST, PUT, DELETE, PATCH) require CSRF token validation via middleware
- Category operations are household-scoped — users can only manage categories in their own household
- Consider adding a "duplicate category" feature in a future story (clone with modified name)
- Transaction reassignment before deletion is handled in Story 2-4 (Merge Duplicate Categories)
