---
storyId: "3-0"
epic: "Epic 3: Transactions & Transfers"
title: "Shared Component Architecture"
status: ready-for-dev
priority: critical
type: technical-foundation
dependsOn: []
created: "2026-05-26"
updated: "2026-05-26"
---

# Story 3-0: Shared Component Architecture

## Context

During implementation of Story 3-3 (Account Management), a critical architectural gap was identified: AccountManager and CategoryManager share nearly identical patterns but are implemented separately with no shared abstractions. This duplication will compound with every subsequent entity management page (transactions, debt, budgets, recurring payments, capital).

**Correct Course triggered**: User invoked `/bmad-correct-course` to establish shared component patterns before continuing Epic 3.

## Problem Statement

1. **Duplicated state management**: Both components have `loadEntities()`, loading/error states, form state (`showForm`, `editingId`, `form*`), CRUD handlers, and archive/restore/delete handlers
2. **Duplicated UI patterns**: Page headers with create button, archived toggle, loading spinner, error banner, card list with hover-reveal action buttons
3. **Duplicated icons**: `PlusIcon`, `EditIcon`, `ArchiveIcon`, `RestoreIcon`, `XIcon`, `CheckIcon` defined in both files
4. **No architectural guidance**: `architecture.md` and `ux-design-specification.md` contain no shared component patterns or design system layering rules
5. **Future compounding**: Epics 4-7, 9-12 will each add entity management pages that repeat these patterns

## Solution Design

### Three-Layer Abstraction

```
Layer 1: useEntityManager<T> hook (state + CRUD + lifecycle logic)
  └─ Layer 2: EntityCard<T> component (individual entity display + action buttons)
       └─ Layer 3: EntityPage layout (header, filters, grid, archived toggle)
```

### Design System Layering

```
Theme tokens (colors, spacing, typography)
  └─ Component themes (button styles, card styles, form styles)
       └─ Page themes (entity-specific color accents, icons)
            └─ Extension hooks (animation, sound, security patterns)
```

## Deliverables

### 1. Shared Hook: `useEntityManager<T>`

**File**: `frontend/src/hooks/useEntityManager.ts`

Generic entity management hook that handles:
- Entity list with loading/error states
- Include archived toggle with auto-refresh
- Form state management (`showForm`, `editingId`, `resetForm`)
- CRUD operations with auto-refresh on success
- Archive/restore/permanent delete with confirmation dialogs
- Seed defaults operation

### 2. Shared Icons: `icons.tsx`

**File**: `frontend/src/components/shared/icons.tsx`

Centralized icon library:
- `PlusIcon`, `EditIcon`, `ArchiveIcon`, `RestoreIcon`, `DeletePermanentlyIcon`
- `XIcon`, `CheckIcon`, `ChevronRightIcon`, `RotateCcwIcon`
- `TrashIcon`

### 3. Shared Component: `EntityCard<T>`

**File**: `frontend/src/components/shared/EntityCard.tsx`

Configurable entity card with:
- Left section: icon + name + subtitle (configurable via render props)
- Right section: primary value + hover-reveal action buttons
- Action buttons: edit, archive/restore, delete permanently (auto-switches based on `is_active`)
- Extension slot for entity-specific content

### 4. Shared Layout: `EntityPage`

**File**: `frontend/src/components/shared/EntityPage.tsx`

Standard page layout with:
- Header: title + subtitle
- Action bar: create button + seed defaults button (optional)
- Archived toggle checkbox
- Loading spinner
- Error banner
- Extension slot for entity-specific sections (e.g., combined balance card)
- Card list or grid view

### 5. Refactored AccountManager

**File**: `frontend/src/components/AccountManager.tsx`

Refactored to use:
- `useEntityManager<Account>` for all state and CRUD logic
- `EntityPage` for page layout
- `EntityCard` for account list items
- Account-specific form fields rendered inline
- Account-specific extensions: combined balance card, account type selector

### 6. Refactored CategoryManager

**File**: `frontend/src/components/CategoryManager.tsx`

Refactored to use:
- `useEntityManager<Category>` for base CRUD + lifecycle
- `EntityPage` for page layout
- Category-specific extensions: tree view, merge dialog, multi-select, emoji picker, color picker
- Category-specific form fields rendered inline

### 7. Updated Architecture Documentation

**File**: `_bmad-output/planning-artifacts/architecture.md`

Add "Frontend Component Architecture" section documenting:
- Entity management patterns (EntityManager → EntityCard → EntityPage)
- Design system layering (theme tokens → component themes → page themes)
- Extension points for entity-specific behavior
- Security patterns (CSRF, session handling baked into API client)
- Rule: All future entity management pages MUST use shared abstractions

### 8. Updated UX Design Specification

**File**: `_bmad-output/planning-artifacts/ux-design-specification.md`

Add "Shared UI Architecture" section documenting:
- Component inheritance model
- Theme application rules
- Animation/sound hooks (future extension points)
- Consistency requirements for all entity management pages
- Rule: All entity pages MUST follow EntityPage layout pattern

### 9. Updated Sprint Status

**File**: `_bmad-output/implementation-artifacts/sprint-status.yaml`

Add story 3-0 to Epic 3 tracking.

## Acceptance Criteria

- [ ] `useEntityManager` hook exists and handles all common entity management patterns
- [ ] Shared icons extracted to `components/shared/icons.tsx`
- [ ] `EntityCard` component exists with configurable action buttons
- [ ] `EntityPage` layout exists with header, filters, loading/error states
- [ ] AccountManager refactored to use shared abstractions (reduced from ~520 lines)
- [ ] CategoryManager refactored to use shared abstractions (preserving tree view, merge, multi-select)
- [ ] Both pages render identically to pre-refactor state (visual regression check)
- [ ] All CRUD + archive/restore/delete operations still functional
- [ ] `architecture.md` updated with frontend component architecture section
- [ ] `ux-design-specification.md` updated with shared UI architecture section
- [ ] `sprint-status.yaml` updated with story 3-0

## Technical Constraints

- React + TypeScript with Tailwind CSS v4 + shadcn/ui
- No breaking changes to existing API contracts
- Maintain dark futuristic theme (#0a0a0f background, #12121a surfaces)
- Preserve all existing functionality — this is a refactor, not a feature change
- Generic types must be properly constrained for TypeScript safety

## Extension Points for Future Epics

| Epic | Entity Type | Shared Abstraction Used | Entity-Specific Extension |
|------|-------------|------------------------|--------------------------|
| Epic 3 | Transaction | `useEntityManager<Transaction>` | Quick entry form, duplicate detection |
| Epic 4 | Recurring Payment | `useEntityManager<RecurringPayment>` | Scheduler configuration, preview |
| Epic 5 | Budget | `useEntityManager<Budget>` | Progress bars, period selector |
| Epic 5 | Capital/Investment | `useEntityManager<Capital>` | Value charts, performance metrics |
| Epic 6 | Debt | `useEntityManager<Debt>` | Payment schedules, interest calculations |
| Epic 7 | Dashboard | N/A (read-only) | Chart components, data aggregation |
| Epic 9 | Import/Export | N/A (utility) | CSV parser, category mapping UI |

## Story Order Impact

This story is inserted **before** the remaining Epic 3 stories:
- 3-0 (this story) → 3-1 → 3-2 → 3-4 → 3-5

All subsequent Epic 3 stories will use the shared abstractions established here.
