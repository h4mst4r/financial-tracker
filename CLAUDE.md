# Financial Tracker — Claude Code Agent Instructions

This file governs ALL AI agent work in this repository. Read it fully before starting any story.
It supersedes any instinct to "follow common patterns" — follow THESE patterns.

---

## 1. Reference Documents — Read Before Starting Any Story

| Document | Path | When to Read |
|---|---|---|
| **Architecture** | `_bmad-output/planning-artifacts/architecture.md` | Every backend story; any story touching API, DB, auth |
| **UX Design Spec** | `_bmad-output/planning-artifacts/ux-design-specification.md` | Every frontend story |
| **Entity Design Philosophy** | `_bmad-output/planning-artifacts/entity-design-philosophy.md` | Any story involving entity models, relationships, or UI |
| **Epics & Stories** | `_bmad-output/planning-artifacts/epics.md` | Always — this is the authoritative task list |
| **Sprint Status** | `_bmad-output/planning-artifacts/sprint-status.yaml` | Always — update it when a story completes |

Story files live in `_bmad-output/implementation-artifacts/stories/`. Read the story file before implementing.

---

## 2. Process Standards (Non-Negotiable)

---
### P0 — No Unauthorized UI (Highest Priority Rule)

Before adding ANY user-visible element to a page — button, form field, section, panel, menu item, tab, or any interactive control — you MUST verify it appears in `_bmad-output/planning-artifacts/ux-design-specification.md` under the relevant page/component section.

**If the UX spec section for that page does not exist, or does not mention the element: DO NOT BUILD IT.**

The story's ACs are NOT sufficient authorization on their own. Agents frequently invent "logical" UI that was never designed. Every unauthorized addition causes visual inconsistency, introduces untested behaviour, and requires future cleanup work.

If you believe a UI element is necessary but it's not in the spec:
1. **Stop**. Do not implement it.
2. Note it in the story's Dev Agent Record as a "Spec Gap — requires UX spec update before implementation".
3. Implement only what the spec explicitly describes.

This rule exists because agents have repeatedly added unauthorized elements (e.g. Delete Household danger zone, role dropdowns, unauthorized buttons) that the product owner never approved.

---
### P1 — Visual Verification is Part of Done
Before marking any frontend story done, the delivered component(s) must be verified either:
- On the `/design-system` page against the design token and variant spec, **or**
- In the app in-context against the UX specification section referenced in the story

Tests going green is a necessary but not sufficient condition for Done. A story that has passing tests but unverified visual output is not Done.

### P2 — Document CSS / Architecture Nuances at Story-Close
Every frontend story file must include a **"Known CSS / Architecture Nuances"** section in its Dev Agent Record (alongside the existing File List and Completion Notes). This section captures:
- Any non-obvious CSS behaviour discovered (cascade, specificity, shorthand interactions)
- Any token or utility that has a known constraint (e.g. "inline style required here, utility class conflicts with `border` shorthand")
- Any pattern that future agents should inherit rather than reinvent

This is the frontend equivalent of Epic 1's "Lessons Learned" discipline in backend story files.

### P3 — Token Sweep Before Changing Component Mechanism
Before changing how any existing component references a design decision (e.g. switching from inline style to utility class, or from hardcoded value to token), verify the compiled CSS ordering for the affected properties:
1. Run `npx vite build` and inspect the output CSS for the relevant rules
2. Confirm the new rule comes AFTER any Tailwind shorthand that could override it
3. If ordering cannot be guaranteed, use inline style (which has specificity 1-0-0-0 and is always cascade-immune)

### P4 — No Magic Values
All hardcoded colour, opacity, size, z-index, transition duration, or breakpoint values that represent a design decision must be named tokens in `index.css`. See EDP §14.5 and UX §1.9 for the authoritative lists. If a needed token doesn't exist, add it — don't inline it.

Never use:
- Raw hex colors: `#6366f1` → use `text-primary` or `bg-primary`
- Raw opacity: `rgb(99 102 241 / 0.2)` → use `ring-glow-primary`
- Raw z-index: `z-[100]` → use `z-dropdown`
- Raw pixel widths: `w-[320px]` → add `@utility w-date-picker { width: 320px; }` to `index.css`
- `bg-black/70` → use `bg-backdrop`
- `ring-white/80` → use `ring-accent ring-offset-surface-raised`

---

## 3. Story Execution Protocol

Every story, every time, in this order:

1. **Read the story** in `epics.md` — all ACs, files, dependencies, and referenced spec sections
2. **Read the story implementation file** in `stories/` if it exists
3. **Read the referenced spec sections** — ARCH §X, UX §Y, EDP §Z listed in the story
4. **Confirm dependencies** — all `Depends on` stories must be `done` in `sprint-status.yaml`
5. **Run existing tests** — must be green before writing a single line of new code
6. **Implement** — only what the AC requires; no unrequested refactors, no extra abstractions
7. **Visual verify** (frontend only) — open `/design-system` page or the feature page in browser; confirm against UX spec before marking Done
8. **Check off ACs** — update `epics.md` or the story file with `[x]` for each confirmed criterion
9. **Update sprint-status.yaml** — set story to `done`

**Definition of Done (frontend):** All ACs checked AND visual verification passed. Tests passing alone is NOT Done.

---

## 4. Frontend — Design Token Rules

All design decisions live in `frontend/src/index.css` as `@theme` CSS variables and `@utility` classes.
**Never use raw hex values, px sizes, opacity decimals, or z-index integers in TSX components.**
If a token you need doesn't exist, add it to `index.css` — don't hardcode it inline.

### 4.1 Background Hierarchy (use in this order, outermost → innermost)

```
bg-bg              #09090f   — Page root, outer shell
bg-surface         #16162a   — Main content areas, sidebar
bg-surface-raised  #1c1c34   — Cards, panels, picker dropdowns, inputs
bg-surface-hover   #1e1e38   — List row hover (barely visible — see §3.6)
bg-surface-active  #26264a   — Small button hover INSIDE panels, selected states
bg-surface-overlay #222244   — Elevated floating panels on top of raised panels
```

### 43.2 Text Tokens

```
text-text-primary    #e8e8f0   — All body text, selected values, labels
text-text-secondary  #9898b0   — Inactive tabs, placeholder-adjacent labels, sub-labels
text-text-muted      #484860   — Placeholder text, disabled labels ONLY (very low contrast — avoid for interactive text)
text-accent          #06b6d4   — Active picker tabs, accent interactive elements (cyan)
text-primary         #6366f1   — Active nav/control tabs, selected check marks (indigo)
```

### 4.3 Border Tokens

```
border-border         #2a2a45  — Default input/panel border
border-border-light   #3a3a5c  — Hover border
border-border-strong  #4a4a6a  — Focused non-picker inputs
border-accent         #06b6d4  — Open picker/dropdown trigger border (cyan)
border-error          #ef4444  — Error state border
border-border-focus   #6366f1  — Keyboard focus ring border (indigo)
```

### 4.4 Ring / Glow Tokens (for focus rings — always paired with `ring-2`)

```
ring-glow-accent    rgb(6 182 212 / 0.2)    — Picker triggers when open (Dropdown, DatePicker, ColourPicker, EmojiIconPicker)
ring-glow-primary   rgb(99 102 241 / 0.2)   — Text inputs on focus
ring-glow-error     rgb(239 68 68 / 0.2)    — Error state inputs
```

### 4.5 Fill / Active State Tokens

```
bg-accent-subtle    primary at 15%  — Nav sidebar active item background
bg-control-active   primary at 20%  — Active tab in SegmentedControl, Topbar navigation tabs
bg-accent-active    accent  at 20%  — Active tab INSIDE picker panels (ColourPicker, EmojiIconPicker) ONLY
```

**Critical distinction:** `bg-control-active` is for navigation/control tabs. `bg-accent-active` is exclusively for tabs inside picker dropdown panels. Getting this backwards makes pickers look wrong.

---

## 5. Frontend — Component Patterns

### 5.1 Picker / Dropdown Trigger Button (EXACT pattern — no deviation)

All picker triggers (Dropdown, DatePicker, ColourPicker, EmojiIconPicker) use this **single ternary** for border/ring state:

```tsx
className={`
  w-full h-10 rounded-md px-3 text-sm
  bg-surface-raised border text-text-primary
  transition-colors duration-150
  flex items-center gap-2
  ${disabled
    ? 'opacity-50 cursor-not-allowed'
    : open
      ? 'border-accent ring-2 ring-glow-accent'
      : 'border-border hover:border-border-light focus:ring-2 focus:ring-glow-accent focus:border-accent'
  }
`}
```

**DO NOT** split into two separate ternaries — the `focus:ring-*` classes on the closed-but-focused state are lost.
**DO NOT** put `border-border` in the base classes — it belongs only in the ternary's closed branch.

### 5.2 Picker Panel Tab Buttons (EXACT pattern)

Tabs inside picker dropdown panels (ColourPicker Palette/Hex, EmojiIconPicker Emojis/Icons):

```tsx
className={`
  flex-1 text-xs py-1.5 rounded transition-colors focus:outline-none
  ${isActive
    ? 'bg-accent-active text-accent font-medium'
    : 'text-text-secondary hover:text-text-primary hover:bg-surface-active'
  }
`}
```

Tabs used as page/control navigation (SegmentedControl, view toggles):

```tsx
className={`
  flex-1 text-xs py-1.5 rounded transition-colors focus:outline-none
  ${isActive
    ? 'bg-control-active text-primary font-medium'
    : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
  }
`}
```

### 5.3 Hover Token for Small Buttons Inside Panels

Grid buttons inside picker panels (emoji cells, icon cells, calendar day buttons) sit on a `bg-surface-raised` background. The delta from `surface-raised` → `surface-hover` is only 4 per channel — nearly invisible for 40×40px buttons.

```
INSIDE a picker panel grid: hover:bg-surface-active   ← use this
Inside a full-width dropdown list row: hover:bg-surface-hover
```

### 5.4 Color Swatch Selection Ring (EXACT pattern)

```tsx
className={`
  w-7 h-7 rounded-full transition-transform hover:scale-110 focus:outline-none
  ${isSelected ? 'ring-2 ring-offset-1 ring-accent ring-offset-surface-raised' : ''}
`}
```

**Never:** `ring-white/80` — hardcoded magic value.

### 5.5 Entity Accent Bar Pattern

Entity cards have a 4px left accent bar coloured to the entity type. This MUST use an inline style to survive Tailwind's `border` shorthand cascade:

```tsx
<div
  className="relative border border-border rounded-lg ..."
  style={{ borderLeft: `4px solid ${entity.colour}` }}
>
```

**Do not** use `border-entity-accent` utility with a `border` shorthand class on the same element — Tailwind's `border` sets ALL border widths to 1px and can override `border-left-width: 4px` depending on CSS ordering.

For child utilities that read the entity accent colour, set it as a CSS variable:

```tsx
style={{ '--entity-accent': entity.colour, borderLeft: `4px solid ${entity.colour}` }}
```

Then children can use `bg-entity-accent-muted` and `text-entity-accent`.

### 54.6 Nested Button Rule — Never Button Inside Button

`<button>` cannot be a descendant of `<button>` (invalid HTML, React hydration warning).

For secondary interactive elements inside a trigger button (e.g., a clear/X button), use:

```tsx
<span
  role="button"
  tabIndex={-1}
  aria-label="Clear"
  className="text-text-muted hover:text-text-primary cursor-pointer transition-colors"
  onClick={handleClear}
>
  <X size={14} />
</span>
```

### 5.7 Text Input Focus Ring

Text inputs (Input component, search fields, hex input) use `ring-glow-primary` (indigo):

```
focus:outline-none focus:ring-2 focus:ring-glow-primary focus:border-border-focus
```

Search inputs **inside picker panels** use `ring-glow-accent` (cyan), consistent with the picker theme:

```
focus:outline-none focus:ring-1 focus:ring-glow-accent focus:border-accent
```

### 5.8 Tooltip Pattern (CSS-Primary — No JS Timers)

The Tooltip uses CSS hover — never `setTimeout` or `onMouseEnter/Leave` state:

```tsx
<span className="group/tooltip relative inline-flex">
  {children}
  <span className="
    pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2
    opacity-0 group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100
    transition-opacity duration-150 delay-300
    max-w-tooltip w-max px-2 py-1 rounded text-xs
    bg-surface-overlay border border-border text-text-primary shadow-lg
  ">
    {content}
  </span>
</span>
```

Only JS in Tooltip: an Escape key listener to force-dismiss.

### 5.9 SegmentedControl Pattern

Two-option mode toggles (e.g., Household/My Finances) use the segmented control pattern:

```tsx
<div className="flex border border-state rounded-md overflow-hidden">
  <button className={isFirst ? 'bg-control-active text-primary' : 'text-text-secondary'}>
    Option A
  </button>
  <span className="w-px bg-border-state-subtle self-stretch" />
  <button className={!isFirst ? 'bg-control-active text-primary' : 'text-text-secondary'}>
    Option B
  </button>
</div>
```

Tokens: `border-state` for the outer border, `border-state-subtle` for the internal divider. **Never** `border-primary/30`.

### 5.10 Skeleton Shimmer

Skeleton components require a visible shimmer. Use `bg-surface-active` as the shimmer peak — `bg-surface-hover` is too close to `bg-surface-raised` and is nearly invisible:

```tsx
className="shimmer-gradient animate-shimmer rounded"
// shimmer-gradient uses: surface-raised → surface-active → surface-raised
```

Stat and chart skeleton shapes need a `bg-surface` container frame or they appear as floating bars.

### 5.11 Shell Background Hierarchy

```
Page body:              bg-bg        (#09090f)
Sidebar:                bg-surface   (#16162a)
Topbar:                 bg-surface   (#16162a)  ← NOT bg-bg (spec §5.3)
Main content area:      bg-bg        (#09090f)
Cards / panels:         bg-surface-raised (#1c1c34)
Inputs / dropdowns:     bg-surface-raised (#1c1c34)
```

---

## 6. Backend Architecture Rules

### 6.1 Database & ORM

- Always use async SQLAlchemy engine + async sessions
- Set `PRAGMA journal_mode=WAL` and `PRAGMA foreign_keys=ON` via `event.listen(engine.sync_engine, 'connect', ...)` — not in migration
- All models inherit `BaseEntity` (id UUID PK, created_at, updated_at, household_id FK, is_archived bool)
- Monetary values: use `MonetaryValueMixin` — stores `amount_minor_units` INTEGER and `currency_code` VARCHAR(3); never store floats
- STI: `Account.account_type` discriminator; `FinancialEvent.event_type` discriminator
- Case-insensitive uniqueness: **always** `func.lower(Model.name) == func.lower(name)` — never Python `.lower()`

### 6.2 Dependency Injection Chain

```python
get_db              → AsyncSession
get_current_session → Session model row (validates cookie, 401 if missing/expired)
get_current_household_id → household_id UUID (extracted from session)
```

Service layer always receives `household_id` as first positional arg. **Never** trust request body for household scoping.

### 6.3 Error Responses — RFC 7807 Problem Details

```python
{"type": "...", "title": "...", "status": 422, "detail": "...", "instance": "/path"}
```

Use `raise HTTPException(status_code=..., detail={...})` — the global handler formats it.

### 6.4 CSRF

- One CSRF token per session (not single-use — it lives until session expires)
- Middleware validates `X-CSRF-Token` header on POST/PUT/PATCH/DELETE
- Frontend sends token via `api/client.ts` interceptor — don't reimplement this

### 6.5 Category Archiving

Archiving a category auto-promotes its children to top-level (`parent_id = NULL`). Return 200, not 409. The `depth` column (0 = top-level, 1 = child) is simpler than walking the parent chain at query time.

### 6.6 Session Tokens

Session sliding window uses `last_activity_at` (updated on every request). CSRF token has a `used: bool` field but is **not** single-use in middleware — the field exists for audit purposes only.

---

## 7. API Design Rules

- All list endpoints return `{"items": [...], "total": N}` — never a bare array
- Household-scoped queries always `WHERE household_id = :household_id AND is_archived = false` unless `show_archived=true` is passed
- FX rates always stored as `base → target` ratio (1 USD = X target)
- Visualisation endpoints (`/api/visualizations/...`) are read-only, have no mutations, and may return cached/aggregated data — do not add write operations to these routes

---

## 8. Frontend State & API Rules

### 8.1 Zustand Stores

```
authStore        — user identity, session token, default view (Household/My Finances)
visualizationStore — active date range, group-by, entity filter state
```

Do not create new stores for entity CRUD — that belongs to TanStack Query.

### 8.2 TanStack Query

- All server state goes through TanStack Query (`useQuery`, `useMutation`)
- Query keys follow `['entity-type', filters]` convention
- `api/client.ts` handles auth headers, CSRF, and 401 redirect automatically — never duplicate this logic

### 8.3 Generic Entity Layer

For any feature page implementing entity CRUD:
- Use `useEntityManager<T>` hook — provides `items`, `isLoading`, `create`, `update`, `archive`, `bulkArchive`
- Use `EntityCard<T>` — provides accent bar, context menu, archive state
- Use `EntityModal<T>` — two-column form layout, cancel/save actions
- Use `EntityPage<T>` — action bar, filter slot, main content slot

Do NOT build bespoke CRUD pages — extend the generic layer.

---

## 9. Lessons from Completed Epics

### From Epic 1 — Backend Foundation (completed 2026-05-28)

| Lesson | Rule |
|---|---|
| SQLite case sensitivity | Always `func.lower()` for name uniqueness — never Python `.lower()` |
| Category archiving | Returns 200 + promotes children; NOT 409 |
| `CategorySelect.tsx` placement | Belongs in the Transactions epic, not Categories epic |
| Default categories | Seeded at household creation, not app startup |
| Depth column | `depth INT` (0/1) on Category — simpler than recursive parent chain walk |

### From Epic 2 — Frontend Foundation (completed 2026-06-01)

| Lesson | Rule |
|---|---|
| Picker trigger ternary | Single ternary — never split; closed branch must include `focus:ring-*` |
| Picker tab token | `bg-accent-active` (cyan) for picker panels; `bg-control-active` (indigo) for nav |
| Hover in panels | `hover:bg-surface-active` for small items; `hover:bg-surface-hover` for full-width rows |
| Swatch ring | `ring-accent ring-offset-surface-raised` — never `ring-white/80` |
| Entity accent bar | Must use inline `borderLeft` style — `border` shorthand overrides custom utilities |
| Topbar background | `bg-surface`, not `bg-bg` (spec §5.3) |
| Segmented control | `border-state` outer + `border-state-subtle` divider — never `border-primary/30` |
| Skeleton shimmer | Peak token is `bg-surface-active` — `bg-surface-hover` is invisible |
| CSS-primary Tooltip | Use `group-hover/tooltip:opacity-100` — never `setTimeout` show/hide |
| Nested buttons | Inner interactive element must be `<span role="button">` not `<button>` |
| Magic values | Every design value goes through `index.css` — spotted values: glow tokens, backdrop, breakpoints, component widths |
| "Done" definition | Visual verification on `/design-system` is required — tests alone are not enough |
| Viewport boundary clamping | Floating panels (tooltips, context menus) must clamp horizontally within viewport; use `panelMinWidth` option in `useFloatingPosition` for context menus, JS measurement for tooltips |
| Tooltip vertical auto-flip | Tooltips automatically flip from above→below when near the top viewport edge. No `placement` prop needed — JS handles it. Remove `placement="bottom"` from all usages |
| Toast below topbar | Toasts positioned at `top-[80px]` (topbar height 64px + 16px margin) — never `top-4` which obscures the sticky topbar |

---

## 10. What NOT to Do

- Do not refactor code outside the story's scope
- Do not add error handling for impossible cases (trust framework guarantees)
- Do not add comments explaining what the code does — only add comments for non-obvious WHY
- Do not create new Tailwind utilities without adding them to `index.css @utility`
- Do not use `any` in TypeScript — if the type isn't known, look it up in the existing types files
- Do not start a story if `sprint-status.yaml` shows any `Depends on` story as not `done`
- Do not mark a story `done` in `sprint-status.yaml` until ALL ACs are checked and visual verification is complete
