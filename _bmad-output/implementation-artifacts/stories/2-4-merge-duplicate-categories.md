---
story_id: "2-4"
story_key: "merge-duplicate-categories"
title: "Merge Duplicate Categories"
epic_id: "epic-2"
epic_title: "Core Infrastructure & Categories"
status: done
priority: P2 (Medium)
author: Ben
created: 2026-05-24
updated: 2026-05-26
completed: 2026-05-26
estimated_effort: 2-3 days
dependencies: ["2-1-default-category-seeding", "2-2-category-crud-operations", "2-3-subcategory-support"]
---

# Story: Merge Duplicate Categories (2-4)

## User Story

**As a** household member who has accidentally created duplicate categories (or imported data with category inconsistencies),  
**I want to** merge duplicate or similar categories into one,  
**So that** my spending data is consolidated under a single category without losing transaction history.

## Context & Background

**Problem Statement**: Users create duplicate categories through typos ("Groceries" vs "groceries"), re-creation after archiving, or data imports with inconsistent naming. This fragments spending data and makes reporting inaccurate.

**Key Learnings from Previous Stories**:
- Story 2-2 established: Pydantic models defined inline in route files, service functions return dicts
- Story 2-3 established: CategoryTree uses recursive rendering, subcategories have `parent_id` FK
- Transaction model (Epic 3) has `category_id` FK with `ON DELETE SET NULL` — merge must update this field before archiving source
- All route handlers follow: auth check → household resolution → service call → JSON response pattern

## Acceptance Criteria

### AC-000: Multi-Select Categories UI
- [ ] Category tree displays checkboxes next to each category node for multi-selection
- [ ] Selecting a parent category optionally selects all children (with toggle indicator)
- [ ] When 2+ categories are selected, a "Merge Selected" button appears in the toolbar
- [ ] Selected categories are visually highlighted (e.g., blue background row)
- [ ] Click "Merge Selected" opens the merge confirmation dialog

### AC-001: Merge Categories Endpoint
- [ ] `POST /api/categories/merge` — merges one or more source categories into a target category
- [ ] Request body: `{ "target_id": UUID, "source_ids": [UUID] }` — supports merging multiple sources into one target
- [ ] Both categories must belong to the same household (validated per source-target pair)
- [ ] Source and target cannot be the same category — return `400 Bad Request`
- [ ] At least one source ID required — return `400 Bad Request` if empty array
- [ ] Returns `404 Not Found` if target category doesn't exist (skip non-existent sources with warning)

### AC-002: Transaction Reassignment
- [ ] All transactions assigned to the source category are reassigned to the target category
- [ ] Transaction `category_id` is updated from `source_id` to `target_id`
- [ ] Transaction `updated_at` timestamp is refreshed on reassignment
- [ ] Transaction history is preserved — no transactions are deleted
- [ ] Returns merge result with count of reassigned transactions

### AC-003: Subcategory Reassignment
- [ ] All subcategories (children) of the source category are reassigned to the target category
- [ ] Source `parent_id` is updated to `target_id` for all child categories
- [ ] If target already has a subcategory with the same name as a source subcategory, append " (2)" to avoid conflicts
- [ ] Subcategory hierarchy is preserved — children of source become children of target

### AC-004: Source Category Deletion
- [ ] After reassignment, the source category is archived (`is_archived = true`)
- [ ] Source category is NOT physically deleted (preserves audit trail)
- [ ] Default categories (`is_default=True`) cannot be merged into non-default categories — return `403 Forbidden`
- [ ] Returns `200 OK` with merge result:
  ```json
  {
    "success": true,
    "source_category": { "id": "uuid", "name": "groceries" },
    "target_category": { "id": "uuid", "name": "Groceries" },
    "transactions_reassigned": 15,
    "subcategories_reassigned": 2,
    "message": "Category 'groceries' merged into 'Groceries'"
  }
  ```

### AC-005: Duplicate Detection and Suggestions
- [ ] `GET /api/categories/duplicates` — identifies potential duplicate categories within current household
- [ ] Detection criteria (case-insensitive):
  - Exact name match (e.g., "Groceries" and "groceries")
  - Name similarity using Levenshtein distance ≤ 2 (e.g., "Dining" and "Dinning")
  - Whitespace-only differences (e.g., "Groceries " and "Groceries")
- [ ] Response returns groups of potentially duplicate categories:
  ```json
  {
    "duplicate_groups": [
      {
        "group_id": 1,
        "categories": [
          { "id": "uuid", "name": "Groceries", "transaction_count": 45 },
          { "id": "uuid", "name": "groceries", "transaction_count": 12 }
        ],
        "similarity": "exact_case_insensitive"
      }
    ]
  }
  ```

### AC-006: Merge Confirmation Dialog
- [ ] Merge operation requires explicit confirmation (cannot be accidental)
- [ ] Dialog shows: target category (highlighted), list of source categories with transaction counts
- [ ] Warning banner if total transactions to merge > 10: "This will move X transactions"
- [ ] "Merge" button is destructive-styled (red) with confirmation text
- [ ] On success: toast notification "Merged X categories, moved Y transactions and Z subcategories"
- [ ] On failure: error toast with specific message from backend

### AC-007: Merge Validation Rules
- [ ] Cannot merge archived categories — return `400 Bad Request` with "Cannot merge archived category"
- [ ] Cannot merge default category into non-default — return `403 Forbidden` with "Cannot merge default category into non-default"
- [ ] CAN merge non-default into default (default survives)
- [ ] Cannot merge category that is the target of another source in the same request — detect circular references
- [ ] All sources must be in the same household as target — return `400 Bad Request` for violations

## Technical Requirements

### Backend Implementation

#### Files to Create/Modify
1. **`backend/routes/categories.py`** — Merge endpoints (ADD)
   - `POST /api/categories/merge` — perform multi-source merge
   - `GET /api/categories/duplicates` — detect duplicates for current household

2. **`backend/services/category_service.py`** — Merge business logic (ADD)
   - `merge_categories()` — reassign transactions/subcategories, archive sources
   - `detect_duplicates()` — find similar category names using SequenceMatcher

3. **`backend/models.py`** — NO CHANGES needed
   - Transaction model (Epic 3) has `category_id` FK — merge updates this field
   - Category model already has `parent_id`, `is_archived`, `is_default` fields

#### Merge Service Function Signature
```python
def merge_categories(db: Session, target_id: UUID, source_ids: List[UUID]) -> dict:
    """Merge multiple source categories into a single target category.
    
    All transactions and subcategories from sources are reassigned to target.
    Source categories are archived (not deleted) to preserve audit trail.
    
    Returns dict with counts of reassigned items and merged category info.
    """
```

#### Merge Route Handler Pattern
Follow established pattern from Story 2-2/2-3:
```python
@router.post("/categories/merge", response_model=MergeResponse)
def merge_categories_endpoint(
    request: MergeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 1. Resolve household (current_user.household_id or from profile)
    # 2. Validate target exists and belongs to household
    # 3. Call service layer
    result = category_service.merge_categories(db, request.target_id, request.source_ids)
    # 4. Return JSON response
    return result
```

#### Pydantic Models (inline in routes file)
```python
from pydantic import BaseModel, Field, validator
from typing import List
from uuid import UUID

class MergeRequest(BaseModel):
    target_id: UUID = Field(..., description="Category to keep (surviving category)")
    source_ids: List[UUID] = Field(..., min_items=1, description="Categories to merge into target")
    
    @validator('source_ids')
    def sources_cannot_include_target(cls, v, values):
        if 'target_id' in values and values['target_id'] in v:
            raise ValueError('Cannot merge a category into itself')
        return v

class MergeSourceResult(BaseModel):
    id: str
    name: str
    transactions_reassigned: int
    subcategories_reassigned: int

class MergeResponse(BaseModel):
    success: bool
    target_category: dict  # Category dict with id, name
    merged_sources: List[MergeSourceResult]
    total_transactions_reassigned: int
    total_subcategories_reassigned: int
    message: str
```

#### Duplicate Detection
```python
def detect_duplicates(db: Session, household_id: UUID) -> dict:
    """Detect potential duplicate categories using name similarity."""
    from difflib import SequenceMatcher
    
    categories = db.query(Category).filter_by(
        household_id=household_id, is_archived=False
    ).all()
    
    duplicate_groups = []
    used = set()
    
    for i, cat1 in enumerate(categories):
        if i in used:
            continue
        
        group = [cat1]
        for j, cat2 in enumerate(categories):
            if j <= i or j in used:
                continue
            
            # Check similarity
            similarity = SequenceMatcher(None, cat1.name.lower(), cat2.name.lower()).ratio()
            
            # Exact case-insensitive match or very similar (Levenshtein approximation)
            if cat1.name.lower() == cat2.name.lower() or similarity > 0.85:
                group.append(cat2)
        
        if len(group) > 1:
            for cat in group:
                used.add(categories.index(cat))
            
            duplicate_groups.append({
                "group_id": len(duplicate_groups) + 1,
                "categories": [
                    {
                        "id": str(cat.id),
                        "name": cat.name,
                        # Transaction count query (deferred)
                        "transaction_count": 0,
                    }
                    for cat in group
                ],
                "similarity": "exact_case_insensitive" if all(
                    c.name.lower() == group[0].name.lower() for c in group
                ) else "similar",
            })
    
    return {"duplicate_groups": duplicate_groups}
```

### Frontend Implementation

#### Files to Create/Modify
1. **`frontend/src/api/categories.ts`** — API client functions
   ```typescript
   export interface MergeResult {
     success: boolean;
     source_category: { id: string; name: string };
     target_category: { id: string; name: string };
     transactions_reassigned: number;
     subcategories_reassigned: number;
     message: string;
   }

   export interface DuplicateGroup {
     group_id: number;
     categories: Array<{
       id: string;
       name: string;
       transaction_count: number;
     }>;
     similarity: string;
   }

   export const mergeCategories = async (sourceId: string, targetId: string): Promise<MergeResult> => {
     const csrfToken = await fetchCsrfToken();
     const response = await fetch(`/api/categories/${sourceId}/merge`, {
       method: 'POST',
       credentials: 'include',
       headers: {
         'Content-Type': 'application/json',
         'X-Session-Id': getSessionId(),
         'X-CSRF-Token': csrfToken,
       },
       body: JSON.stringify({ target_id: targetId }),
     });
     if (!response.ok) throw new Error(`Failed to merge categories: ${response.statusText}`);
     return response.json();
   };

   export const detectDuplicates = async (): Promise<{ duplicate_groups: DuplicateGroup[] }> => {
     const response = await fetch('/api/categories/duplicates', {
       credentials: 'include',
       headers: { 'X-Session-Id': getSessionId() },
     });
     if (!response.ok) throw new Error(`Failed to detect duplicates: ${response.statusText}`);
     return response.json();
   };
   ```

2. **`frontend/src/components/MergeCategoriesDialog.tsx`** — Merge confirmation UI
   ```tsx
   const MergeCategoriesDialog: React.FC<{
     sourceCategory: Category;
     targetCategory: Category;
     onConfirm: () => void;
     onCancel: () => void;
   }> = ({ sourceCategory, targetCategory, onConfirm, onCancel }) => {
     return (
       <div className="merge-dialog">
         <h3>Merge Categories</h3>
         <p>
           Merge <strong>{sourceCategory.icon} {sourceCategory.name}</strong>
           {' '}into{' '}
           <strong>{targetCategory.icon} {targetCategory.name}</strong>?
         </p>
         <div className="merge-preview">
           <p>All transactions and subcategories will be moved to the target category.</p>
           <p className="warning">This action cannot be undone.</p>
         </div>
         <div className="dialog-actions">
           <button onClick={onCancel} className="btn-secondary">Cancel</button>
           <button onClick={onConfirm} className="btn-danger">Merge</button>
         </div>
       </div>
     );
   };
   ```

3. **`frontend/src/components/DuplicateCategoriesPanel.tsx`** — Duplicate detection UI
   - List of duplicate groups with merge buttons
   - Shows transaction counts for each category in the group
   - "Merge All" button for quick resolution of a group

## Edge Cases

### Subcategory Name Conflicts
- **Scenario**: Source has subcategory "Produce", target already has subcategory "Produce"
- **Resolution**: Rename source's child to "Produce (2)" during reassignment
- **Escalation**: If "Produce (2)" also exists, increment to "Produce (3)", etc.

### Deep Nesting
- **Scenario**: Source category has deeply nested subcategories (3+ levels)
- **Resolution**: Only direct children are reassigned; deeper nesting preserved via recursive parent_id updates
- **Note**: CategoryTree.tsx already handles recursive rendering from Story 2-3

### Empty Merge
- **Scenario**: Source category has no transactions and no subcategories
- **Resolution**: Proceed with merge, just archive the source (valid operation)

### All Sources Archived
- **Scenario**: User attempts to merge an archived category as source
- **Resolution**: Reject with `400 Bad Request` — archived categories cannot be merged

### Target is Child of Source
- **Scenario**: User tries to merge parent into one of its children
- **Resolution**: Allow — this is a valid reorganization. All other siblings become children of the new parent

### Cross-Household Protection
- **Scenario**: Malicious user attempts to merge categories from different households
- **Resolution**: Service validates `source.household_id === target.household_id` for each pair

## Developer Notes

### Implementation Order
1. **Backend first**: `merge_categories()` service function → route handler → test with curl/Postman
2. **Frontend API client**: Add `mergeCategories()` and `detectDuplicates()` to `categories.ts`
3. **UI multi-select**: Add checkboxes to CategoryTree, manage state in CategoryManager
4. **Merge dialog**: Create `MergeDialog.tsx` component
5. **Duplicate detection**: Implement `detect_duplicates()` service + endpoint (can be P2 deferred)

### Key Patterns from Previous Stories
- **Service functions return dicts** — no Pydantic models in service layer
- **Route handlers define Pydantic models inline** — keep validation close to endpoints
- **All operations wrapped in try/except** with proper HTTPException mapping
- **Frontend uses `credentials: 'include'`** for cookie-based sessions
- **CSRF token required** on all POST/PUT/DELETE requests

### Transaction Reassignment Note
The Transaction model may not exist yet (Epic 3). Implement merge with a conditional:
```python
try:
    from models import Transaction
    transactions_updated = db.query(Transaction).filter_by(category_id=source_id).update(...)
except ImportError:
    transactions_updated = 0  # Deferred until Epic 3
```

### Testing Strategy
- Unit test `merge_categories()` with mock DB session
- Unit test `detect_duplicates()` with known similar names
- Integration test: create categories → merge → verify archive state + subcategory reassignment
- E2E: Select two categories in UI → confirm merge → verify tree refreshes

## Testing Checklist

### Backend Tests
- [ ] Merge two categories → source archived, target unchanged
- [ ] Merge with transactions → all reassigned to target (when Transaction model exists)
- [ ] Merge with subcategories → all reassigned to target
- [ ] Merge with name conflicts in subcategories → " (2)" suffix added correctly
- [ ] Merge same category into itself → returns 400
- [ ] Merge categories from different households → returns 400
- [ ] Merge default category into non-default → returns 403
- [ ] Merge non-default into default → succeeds (default survives)
- [ ] Merge archived category → returns 400
- [ ] Merge with empty source_ids → returns 400
- [ ] Merge with non-existent target → returns 404
- [ ] Detect exact case-insensitive duplicates → grouped correctly
- [ ] Detect similar names (SequenceMatcher > 0.85) → grouped correctly
- [ ] Detect no duplicates → empty groups array

### Frontend Tests
- [ ] Multi-select checkboxes render correctly in tree
- [ ] Selecting parent optionally selects children
- [ ] "Merge Selected" button appears when 2+ selected
- [ ] Merge dialog shows correct source/target categories
- [ ] Merge dialog warns for >10 transactions
- [ ] Successful merge shows toast and refreshes tree
- [ ] Failed merge shows error toast
- [ ] Duplicate detection panel displays groups correctly

## Dependencies

- **Story 2-1 complete**: Category model must exist
- **Story 2-2 complete**: CRUD operations for categories
- **Story 2-3 complete**: Subcategory support (parent_id hierarchy)
- **Epic 3 (Transaction Management)**: Transaction model with `category_id` FK required for full transaction reassignment. Story can be partially implemented without transactions.

## Future Considerations

- **Undo Merge**: Restore archived source and reassign transactions back (future story)
- **Audit Trail**: Log merge operations for compliance tracking
- **Background Duplicate Detection**: Pre-compute duplicate groups for large datasets
- **Bulk Merge Confirmation**: "Merge All" button for one-click resolution of all duplicate groups
