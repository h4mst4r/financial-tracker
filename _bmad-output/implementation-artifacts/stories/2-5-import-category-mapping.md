---
story_id: "2-5"
story_key: "import-category-mapping"
title: "Import Category Mapping"
epic_id: "epic-2"
epic_title: "Core Infrastructure & Categories"
status: done
priority: P2 (Medium)
author: Ben
created: 2026-05-24
updated: 2026-05-25
estimated_effort: 2-3 days
dependencies: ["2-1-default-category-seeding", "2-2-category-crud-operations"]
---

# Story: Import Category Mapping (2-5)

## User Story

**As a** household member importing transaction data from a CSV file,  
**I want to** map imported category names to existing categories and auto-create unmapped ones,  
**So that** my imported transactions are properly categorized without manual cleanup.

## Acceptance Criteria

### AC-001: Extract Unique Categories from Import
- [ ] When a CSV file is uploaded for import, the system scans the category column and extracts all unique category names
- [ ] `POST /api/categories/import/preview` — previews category mapping before import
- [ ] Request body: `{ "category_column_index": number, "category_values": string[] }`
- [ ] Response returns each unique category name with a suggested mapping:
  ```json
  {
    "imported_categories": [
      {
        "original_name": "Groceries",
        "mapped_to_id": "uuid",
        "mapped_to_name": "Groceries",
        "match_type": "exact",
        "transaction_count": 45
      },
      {
        "original_name": "Food",
        "mapped_to_id": null,
        "mapped_to_name": null,
        "match_type": "unmapped",
        "transaction_count": 12,
        "suggested_action": "create_new"
      }
    ]
  }
  ```

### AC-002: Auto-Match Imported Categories
- [ ] Exact case-insensitive match: "groceries" → "Groceries" (existing category)
- [ ] Whitespace-trimmed match: " Groceries " → "Groceries"
- [ ] Fuzzy match using Levenshtein distance ≤ 2: "Dinning" → "Dining" (suggested, not auto-applied)
- [ ] No match: category name has no similar existing category — marked as "unmapped"
- [ ] Unmapped categories default to `suggested_action: "create_new"` (auto-create on import)

### AC-003: Manual Category Mapping Override
- [ ] `PUT /api/categories/import/mapping` — saves user's manual mapping overrides
- [ ] Request body: `{ "mappings": { "original_name": target_category_id | null }[] }`
  - `target_category_id = null` means "don't categorize these transactions"
  - Omitted categories use auto-match or create_new default
- [ ] Returns mapping session ID for subsequent import step
- [ ] Mapping is stored temporarily (session-scoped or short-lived cache)

### AC-004: Auto-Create Unmapped Categories
- [ ] Categories with `suggested_action: "create_new"` are automatically created during import
- [ ] New categories get a default color from an unused color pool (cycle through available colors)
- [ ] New categories are created in the user's household with `is_default=False`
- [ ] Option to disable auto-create: user can set `auto_create: false` in import config
- [ ] Auto-created categories are tracked in the import result summary

### AC-005: Import Execution with Category Assignment
- [ ] `POST /api/import/execute` — executes the import with category mappings applied
- [ ] For each imported transaction row:
  - Look up the category mapping for the row's category value
  - If mapped to existing category: use that category ID
  - If auto-create: create new category first, then use its ID
  - If unmapped and auto-create disabled: set `category_id = NULL` (uncategorized)
- [ ] Returns import result with counts:
  ```json
  {
    "transactions_imported": 150,
    "categories_mapped": 8,
    "categories_created": 3,
    "transactions_uncategorized": 5,
    "created_categories": [
      { "id": "uuid", "name": "Subscriptions", "color": "#FF5722" }
    ]
  }
  ```

### AC-006: Category Mapping UI
- [ ] Import wizard step shows category mapping table
- [ ] Columns: Imported Category Name | Transaction Count | Mapped To (dropdown) | Action
- [ ] Auto-matched categories show the matched existing category pre-selected
- [ ] Unmapped categories show "Create New" checkbox (checked by default)
- [ ] User can change any mapping via dropdown of existing categories
- [ ] "Map All Unmapped to 'Other'" bulk action button

## Technical Requirements

### Backend Implementation

#### Files to Create/Modify
1. **`backend/routes/categories.py`** — Import mapping endpoints
   - `POST /api/categories/import/preview` — preview category mappings
   - `PUT /api/categories/import/mapping` — save manual mappings
   - Category creation helper function for auto-create

2. **`backend/services/category_service.py`** — Mapping logic
   - `preview_category_mappings()` — match imported names to existing categories
   - `apply_import_mapping()` — execute mappings and auto-create new categories
   - `auto_create_category()` — create category with auto-assigned color

3. **`backend/services/import_service.py`** — Import execution (new file)
   - `execute_import()` — process CSV rows with category assignments
   - `track_import_progress()` — return counts and created categories

#### Category Matching Logic
```python
from difflib import SequenceMatcher

def match_category_name(imported_name: str, existing_categories: list[Category]) -> tuple[Category | None, str]:
    """Match an imported category name to an existing category.
    
    Returns: (matched_category, match_type)
    match_type: 'exact', 'trimmed', 'fuzzy', 'unmapped'
    """
    # Exact case-insensitive match
    for cat in existing_categories:
        if cat.name.lower() == imported_name.lower():
            return cat, 'exact'
    
    # Trimmed whitespace match
    trimmed = imported_name.strip()
    for cat in existing_categories:
        if cat.name.lower() == trimmed.lower():
            return cat, 'trimmed'
    
    # Fuzzy match (Levenshtein approximation)
    best_match = None
    best_ratio = 0.0
    for cat in existing_categories:
        ratio = SequenceMatcher(None, imported_name.lower(), cat.name.lower()).ratio()
        if ratio > best_ratio and ratio >= 0.85:
            best_match = cat
            best_ratio = ratio
    
    if best_match:
        return best_match, 'fuzzy'
    
    return None, 'unmapped'

UNUSED_COLOR_POOL = [
    "#FF5722", "#607D8B", "#795548", "#9E9E9E", 
    "#673AB7", "#3F51B5", "#009688", "#CDDC39"
]
_color_index = 0

def get_next_auto_color() -> str:
    """Get next color from the auto-assignment pool."""
    global _color_index
    color = UNUSED_COLOR_POOL[_color_index % len(UNUSED_COLOR_POOL)]
    _color_index += 1
    return color

def auto_create_category(db: Session, name: str, household_id: UUID) -> Category:
    """Auto-create a category from an imported name."""
    # Check if already created during this import session
    existing = db.query(Category).filter_by(
        name=name, household_id=household_id
    ).first()
    if existing:
        return existing
    
    category = Category(
        name=name,
        color=get_next_auto_color(),
        icon="📦",  # Default icon for auto-created categories
        is_default=False,
        household_id=household_id,
    )
    db.add(category)
    db.flush()
    return category
```

#### Import Preview Endpoint
```python
@router.post("/api/categories/import/preview")
async def preview_import_mapping(
    payload: ImportPreviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Preview category mappings for an import."""
    household_id = current_user.household_id
    
    # Get existing categories for the household
    existing_categories = db.query(Category).filter_by(
        household_id=household_id, is_archived=False
    ).all()
    
    # Count occurrences of each imported category name
    category_counts: dict[str, int] = {}
    for val in payload.category_values:
        category_counts[val] = category_counts.get(val, 0) + 1
    
    # Match each unique imported name
    imported_categories = []
    for original_name, count in category_counts.items():
        matched_cat, match_type = match_category_name(original_name, existing_categories)
        
        imported_categories.append({
            "original_name": original_name,
            "mapped_to_id": str(matched_cat.id) if matched_cat else None,
            "mapped_to_name": matched_cat.name if matched_cat else None,
            "match_type": match_type,
            "transaction_count": count,
            "suggested_action": "map" if matched_cat else "create_new",
        })
    
    return {"imported_categories": imported_categories}
```

### Frontend Implementation

#### Files to Create/Modify
1. **`frontend/src/api/categories.ts`** — API client functions
   ```typescript
   export interface ImportedCategory {
     original_name: string;
     mapped_to_id: string | null;
     mapped_to_name: string | null;
     match_type: 'exact' | 'trimmed' | 'fuzzy' | 'unmapped';
     transaction_count: number;
     suggested_action: 'map' | 'create_new';
   }

   export const previewImportMapping = async (
     categoryValues: string[]
   ): Promise<{ imported_categories: ImportedCategory[] }> => {
     const response = await fetch('/api/categories/import/preview', {
       method: 'POST',
       credentials: 'include',
       headers: {
         'Content-Type': 'application/json',
         'X-Session-Id': getSessionId(),
       },
       body: JSON.stringify({
         category_column_index: 0,
         category_values: categoryValues,
       }),
     });
     if (!response.ok) throw new Error(`Failed to preview mapping: ${response.statusText}`);
     return response.json();
   };
   ```

2. **`frontend/src/components/ImportCategoryMapping.tsx`** — Category mapping UI
   ```tsx
   interface ImportCategoryMappingProps {
     importedCategories: ImportedCategory[];
     existingCategories: Category[];
     onMappingChange: (originalName: string, targetId: string | null) => void;
     onAutoCreateToggle: (originalName: string, enabled: boolean) => void;
   }

   const ImportCategoryMapping: React.FC<ImportCategoryMappingProps> = ({
     importedCategories,
     existingCategories,
     onMappingChange,
     onAutoCreateToggle,
   }) => {
     return (
       <div className="import-category-mapping">
         <h3>Map Categories</h3>
         <table className="mapping-table">
           <thead>
             <tr>
               <th>Imported Category</th>
               <th>Count</th>
               <th>Mapped To</th>
               <th>Action</th>
             </tr>
           </thead>
           <tbody>
             {importedCategories.map((imp) => (
               <tr key={imp.original_name} className={`match-${imp.match_type}`}>
                 <td>{imp.original_name}</td>
                 <td>{imp.transaction_count}</td>
                 <td>
                   <select
                     value={imp.mapped_to_id || ''}
                     onChange={(e) => onMappingChange(imp.original_name, e.target.value || null)}
                   >
                     <option value="">Uncategorized</option>
                     {existingCategories.map(cat => (
                       <option key={cat.id} value={cat.id}>
                         {cat.icon} {cat.name}
                       </option>
                     ))}
                   </select>
                 </td>
                 <td>
                   {imp.match_type === 'unmapped' && (
                     <label>
                       <input
                         type="checkbox"
                         checked={imp.suggested_action === 'create_new'}
                         onChange={(e) => onAutoCreateToggle(imp.original_name, e.target.checked)}
                       />
                       Create New
                     </label>
                   )}
                   {imp.match_type !== 'unmapped' && (
                     <span className="match-badge">{imp.match_type}</span>
                   )}
                 </td>
               </tr>
             ))}
           </tbody>
         </table>
         <div className="bulk-actions">
           <button onClick={() => /* map all unmapped to 'Other' */}>
             Map All Unmapped to "Other"
           </button>
         </div>
       </div>
     );
   };
   ```

## Design Considerations

### Match Type Visual Indicators
- Exact match: green badge, pre-selected dropdown
- Trimmed match: blue badge, pre-selected dropdown
- Fuzzy match: yellow badge, pre-selected but highlighted for review
- Unmapped: red badge, "Create New" checkbox checked by default

### Auto-Create Color Assignment
- Cycle through a pool of colors not used by the 12 defaults
- Track which colors are already used in the household to avoid duplicates
- Fall back to random hex color if pool is exhausted

### Mapping Session Persistence
- Store mappings in a short-lived server-side session (tied to import workflow)
- Alternative: pass mappings as part of the final import execution request
- For MVP, keep it simple — mappings are part of the single import request

### Performance for Large Imports
- Category matching is done once per unique name, not per row
- Auto-create is done once per unmapped category, not per transaction
- Bulk INSERT for new categories if many are created

## Testing Checklist

- [ ] Preview import with exact match category names → all mapped correctly
- [ ] Preview import with case-different names → trimmed/exact matches found
- [ ] Preview import with typo names → fuzzy matches suggested
- [ ] Preview import with completely new names → marked as unmapped with create_new suggestion
- [ ] Execute import with auto-create enabled → new categories created with colors
- [ ] Execute import with auto-create disabled → transactions uncategorized
- [ ] Execute import with manual mapping overrides → mappings applied correctly
- [ ] Auto-create same category name twice → only one category created (idempotent)
- [ ] Map all unmapped to "Other" bulk action → all unmapped categories mapped to Other
- [ ] Import result includes correct counts for mapped, created, and uncategorized

## Dependencies

- **Story 2-1 complete**: Category model and default seeding must exist
- **Story 2-2 complete**: Category CRUD for auto-creating new categories
- **Epic 3 (Transaction Management)**: Full import execution requires Transaction model. Preview and mapping can work without it.

## Notes

- This story focuses on the category mapping aspect of CSV imports. The full CSV import workflow (file parsing, column detection, transaction creation) is part of Epic 3 or a dedicated Import Epic
- For MVP, the import preview endpoint accepts raw category values (string array) rather than parsing a file. File parsing is handled elsewhere
- Consider adding a "save mapping profile" feature for recurring imports from the same source
- The fuzzy match threshold (0.85) should be tunable via configuration
