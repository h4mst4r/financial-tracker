---
story_id: "2-1"
story_key: "default-category-seeding"
title: "Default Category Seeding"
epic_id: "epic-2"
epic_title: "Core Infrastructure & Categories"
status: done
priority: P0 (Critical)
author: Ben
created: 2026-05-24
updated: 2026-05-24
estimated_effort: 1-2 days
dependencies: ["1-1-google-oauth-login"]
---

# Story: Default Category Seeding (2-1)

## User Story

**As a** new user setting up the Financial Tracker,  
**I want to** have 12 default categories automatically created,  
**So that** I can start categorizing transactions immediately without manual setup.

## Acceptance Criteria

### AC-001: Database Model for Categories
- [ ] `Category` model exists in `backend/models.py` with SQLAlchemy ORM
- [ ] Fields: `id` (UUID, PK), `name` (string, indexed), `color` (hex string, default #9E9E9E), `icon` (string, nullable), `is_default` (boolean, default False), `is_archived` (boolean, default False), `parent_id` (FK to Category, nullable for subcategories), `household_id` (FK to Household, nullable — NULL = system-wide defaults)
- [ ] Unique constraint: `(name, household_id)` — prevents duplicate category names per household
- [ ] Index on `household_id` for fast household-scoped queries
- [ ] Index on `parent_id` for subcategory hierarchy queries

### AC-002: Default Category List
- [ ] On first application startup (or when no categories exist), seed exactly 12 default categories:
  | Name | Color | Icon | is_default |
  |------|-------|------|------------|
  | Groceries | #4CAF50 | 🛒 | True |
  | Transport | #2196F3 | 🚗 | True |
  | Utilities | #FF9800 | 💡 | True |
  | Entertainment | #9C27B0 | 🎬 | True |
  | Healthcare | #F44336 | 🏥 | True |
  | Education | #3F51B5 | 📚 | True |
  | Shopping | #795548 | 🛍️ | True |
  | Dining | #E91E63 | 🍽️ | True |
  | Travel | #00BCD4 | ✈️ | True |
  | Bills | #607D8B | 📄 | True |
  | Savings | #8BC34A | 💰 | True |
  | Other | #9E9E9E | 📦 | True |
- [ ] All defaults have `household_id = NULL` (system-wide, shared across households)
- [ ] All defaults have `parent_id = NULL` (top-level categories)
- [ ] Seeding is idempotent — running multiple times does NOT create duplicates

### AC-003: Household-Specific Category Copying
- [ ] When a new household is created (Story 1-2), automatically copy all system-wide default categories (`household_id = NULL`) to the new household with the new `household_id`
- [ ] Copied categories retain original name, color, icon, and `is_default=True`
- [ ] This gives each household their own editable copy of defaults while preserving system-wide templates

### AC-004: Category API Endpoints
- [ ] `GET /api/categories` — list all categories for the current user's household (includes copied defaults + custom categories)
- [ ] Query parameter `?include_archived=true` to include archived categories
- [ ] Response includes: `id`, `name`, `color`, `icon`, `is_default`, `is_archived`, `parent_id`, `children_count`
- [ ] Categories returned sorted by name (alphabetical)
- [ ] Requires authentication (current user must be in a household)

### AC-005: Seeding Verification Endpoint
- [ ] `GET /api/categories/seed-status` — returns whether default categories have been seeded
- [ ] Response: `{ "seeded": true, "count": 12, "household_categories_count": 12 }`
- [ ] Useful for debugging and admin verification

## Technical Requirements

### Backend Implementation

#### Files to Create/Modify
1. **`backend/models.py`** — Add Category model
   - `Category` model with all fields listed in AC-001
   - Self-referential relationship for parent-child hierarchy (`parent` → `children`)
   - Relationship to Household via `household_id`

2. **`backend/database.py`** — Add seeding function
   - `seed_default_categories()` — creates 12 system-wide defaults if they don't exist
   - Called from `init_db()` or application startup event
   - Uses `session.merge()` or INSERT ... ON CONFLICT DO NOTHING for idempotency

3. **`backend/routes/categories.py`** — Category endpoints
   - `GET /api/categories` — list household categories
   - `GET /api/categories/seed-status` — seeding verification
   - Protected with `get_current_user` dependency

4. **`backend/main.py`** — Mount category routes
   - Add `include_router(categories.router)`

#### Database Schema (Category Model)
```python
class Category(Base):
    __tablename__ = "categories"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False, index=True)
    color = Column(String(7), nullable=False, default="#9E9E9E")  # Hex color
    icon = Column(String(50), nullable=True)  # Emoji or icon identifier
    is_default = Column(Boolean, nullable=False, default=False)
    is_archived = Column(Boolean, nullable=False, default=False)
    parent_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"), nullable=True, index=True)
    household_id = Column(UUID(as_uuid=True), ForeignKey("households.id"), nullable=True, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    parent = relationship("Category", remote_side=[id], back_populates="children")
    children = relationship("Category", back_populates="parent")
    household = relationship("Household")
    
    # Unique constraint: name + household_id
    __table_args__ = (
        UniqueConstraint('name', 'household_id', name='uq_category_name_household'),
    )
```

#### Seeding Function
```python
DEFAULT_CATEGORIES = [
    {"name": "Groceries", "color": "#4CAF50", "icon": "🛒"},
    {"name": "Transport", "color": "#2196F3", "icon": "🚗"},
    {"name": "Utilities", "color": "#FF9800", "icon": "💡"},
    {"name": "Entertainment", "color": "#9C27B0", "icon": "🎬"},
    {"name": "Healthcare", "color": "#F44336", "icon": "🏥"},
    {"name": "Education", "color": "#3F51B5", "icon": "📚"},
    {"name": "Shopping", "color": "#795548", "icon": "🛍️"},
    {"name": "Dining", "color": "#E91E63", "icon": "🍽️"},
    {"name": "Travel", "color": "#00BCD4", "icon": "✈️"},
    {"name": "Bills", "color": "#607D8B", "icon": "📄"},
    {"name": "Savings", "color": "#8BC34A", "icon": "💰"},
    {"name": "Other", "color": "#9E9E9E", "icon": "📦"},
]

def seed_default_categories(db: Session) -> int:
    """Seed system-wide default categories. Returns count of categories seeded."""
    existing = db.query(Category).filter_by(household_id=None).all()
    if len(existing) == len(DEFAULT_CATEGORIES):
        return 0  # Already seeded
    
    for cat_data in DEFAULT_CATEGORIES:
        # Check if already exists (idempotent)
        exists = db.query(Category).filter_by(
            name=cat_data["name"], household_id=None
        ).first()
        if not exists:
            category = Category(
                name=cat_data["name"],
                color=cat_data["color"],
                icon=cat_data["icon"],
                is_default=True,
                household_id=None
            )
            db.add(category)
    
    db.commit()
    return len(DEFAULT_CATEGORIES)
```

### Frontend Implementation

#### Files to Create/Modify
1. **`frontend/src/api/categories.ts`** — API client functions
   - `fetchCategories()` — GET /api/categories
   - `fetchSeedStatus()` — GET /api/categories/seed-status

2. **`frontend/src/types/category.ts`** — TypeScript interfaces
   - `Category` interface with all model fields

#### Pydantic Models (categories.py or models.py)
```python
class CategoryCreate(BaseModel):
    name: str = Field(..., max_length=100)
    color: str = Field(default="#9E9E9E", pattern=r"^#[0-9A-Fa-f]{6}$")
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
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True
```

## Design Considerations

### Category Hierarchy (Subcategories)
- `parent_id` enables unlimited nesting depth, but UI should limit to 2 levels (category → subcategory) for usability
- Querying categories with children count requires a correlated subquery or separate count query
- Consider adding a `level` field if performance becomes an issue with deep hierarchies

### Household Isolation
- Each household gets their own copy of default categories (`household_id` set to the household UUID)
- System-wide defaults (`household_id = NULL`) serve as templates only
- This allows households to customize defaults without affecting others

### Default Category Protection
- `is_default=True` categories cannot be deleted (only archived or hidden)
- Custom categories (`is_default=False`) can be fully deleted
- This prevents accidental loss of the 12 core categories

## Testing Checklist

- [ ] Start fresh database → verify 12 default categories seeded with correct colors and icons
- [ ] Run seeding twice → verify no duplicates created
- [ ] Create new household → verify defaults copied to new household_id
- [ ] GET /api/categories → verify returns household categories sorted by name
- [ ] GET /api/categories?include_archived=true → verify archived categories included
- [ ] Verify unique constraint prevents duplicate category names per household
- [ ] Verify system-wide defaults (household_id=NULL) are NOT returned in household category list

## Dependencies

- **Epic 1 complete**: Requires Household model and authentication from Epic 1
- **No frontend UI required**: This story focuses on backend seeding and API. Category management UI comes in Story 2-2

## Notes

- Icons use emoji characters stored as strings — simple, no external dependency
- Color validation should enforce hex format (#RRGGBB) at the Pydantic model level
- Consider adding a migration script for existing databases that don't have the categories table
