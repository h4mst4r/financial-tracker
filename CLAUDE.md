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

### P0 — No Unauthorized UI (Highest Priority Rule)

Before adding ANY user-visible element — button, form field, section, panel, menu item, tab, or interactive control — verify it appears in `_bmad-output/planning-artifacts/ux-design-specification.md` under the relevant page/component section.

**If the UX spec section does not exist or does not mention the element: DO NOT BUILD IT.**

The story's ACs are NOT sufficient authorization on their own. If you believe an element is necessary but it's not in the spec: stop, log it in the story's Dev Agent Record as "Spec Gap — requires UX spec update before implementation", and implement only what the spec explicitly describes.

### P1 — Visual Verification is Part of Done
Before marking any frontend story done, verify the delivered component(s) either:
- On the `/design-system` page against the design token and variant spec, **or**
- In the app in-context against the UX specification section referenced in the story

Tests going green is necessary but not sufficient. A story with passing tests but unverified visual output is not Done.

### P2 — Document CSS / Architecture Nuances at Story-Close
Every frontend story file must include a **"Known CSS / Architecture Nuances"** section in its Dev Agent Record. Capture:
- Non-obvious CSS behaviour (cascade, specificity, shorthand interactions)
- Token or utility constraints (e.g. "inline style required — utility conflicts with `border` shorthand")
- Patterns future agents should inherit rather than reinvent

### P3 — Token Sweep Before Changing Component Mechanism
Before switching how a component references a design decision (e.g. inline style → utility class):
1. Run `npx vite build` and inspect output CSS for the affected rules
2. Confirm the new rule comes AFTER any Tailwind shorthand that could override it
3. If ordering cannot be guaranteed, use inline style (specificity 1-0-0-0, always cascade-immune)

### P4 — No Magic Values
All hardcoded colour, opacity, size, z-index, transition duration, or breakpoint values must be named tokens in `index.css`. If a token doesn't exist, add it — don't inline it.

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
7. **Visual verify** (frontend only) — open `/design-system` or the feature page; confirm against UX spec
8. **Check off ACs** — update the story file in `stories/` with `[x]` for each confirmed criterion (do NOT update `epics.md`)
9. **Update sprint-status.yaml** — set story to `done` (this is the sole source of truth for status)

**Definition of Done (frontend):** All ACs checked AND visual verification passed. Tests alone are NOT Done.

**Constraints (apply throughout):**
- No error handling for impossible cases — trust framework and SQLAlchemy guarantees
- No comments explaining what code does — only non-obvious WHY (hidden constraint, workaround, subtle invariant)
- No `any` in TypeScript — look up the type in existing types files
- No new Tailwind utilities without a corresponding `@utility` block in `index.css`

---

## 4. Frontend — Design Token Rules

All design decisions live in `frontend/src/index.css` as `@theme` CSS variables and `@utility` classes.
**Never use raw hex values, px sizes, opacity decimals, or z-index integers in TSX components.**
If a token you need doesn't exist, add it to `index.css` — don't hardcode it inline.

### 4.1 Background Hierarchy (outermost → innermost)

```
bg-bg              — Page root, outer shell
bg-surface         — Main content areas, sidebar, Topbar (NOT bg-bg — spec §5.3)
bg-surface-raised  — Cards, panels, picker dropdowns, inputs
bg-surface-hover   — List row hover (barely visible — full-width rows only)
bg-surface-active  — Small button hover INSIDE panels, selected states
bg-surface-overlay — Elevated floating panels on top of raised panels
```

### 4.2 Text Tokens

```
text-text-primary    — All body text, selected values, labels
text-text-secondary  — Inactive tabs, placeholder-adjacent labels, sub-labels
text-text-muted      — Placeholder text, disabled labels ONLY (very low contrast — avoid for interactive text)
text-accent          — Active picker tabs, accent interactive elements (cyan)
text-primary         — Active nav/control tabs, selected check marks (indigo)
```

### 4.3 Border Tokens

```
border-border         — Default input/panel border
border-border-light   — Hover border
border-border-strong  — Focused non-picker inputs
border-accent         — Open picker/dropdown trigger border (cyan)
border-error          — Error state border
border-border-focus   — Keyboard focus ring border (indigo)
```

### 4.4 Ring / Glow Tokens (always paired with `ring-2`)

```
ring-glow-accent    — Picker triggers when open (Dropdown, DatePicker, ColourPicker, EmojiIconPicker)
ring-glow-primary   — Text inputs on focus
ring-glow-error     — Error state inputs
```

### 4.5 Fill / Active State Tokens

```
bg-accent-subtle    — Nav sidebar active item background
bg-control-active   — Active tab in SegmentedControl, Topbar navigation tabs
bg-accent-active    — Active tab INSIDE picker panels (ColourPicker, EmojiIconPicker) ONLY
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

Grid buttons inside picker panels (emoji cells, icon cells, calendar day buttons) sit on `bg-surface-raised`. The delta to `bg-surface-hover` is only 4 per channel — nearly invisible for small buttons.

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

### 5.6 Nested Button Rule — Never Button Inside Button

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

Only JS in Tooltip: an Escape key listener to force-dismiss. Tooltips auto-flip above→below when near the top viewport edge — no `placement` prop needed.

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

---

## 6. Backend Architecture Rules

### 6.0 — Always Activate the Venv First

Before running ANY Python command (pytest, uvicorn, alembic, pip):

```
Windows PowerShell:  .venv\Scripts\activate
Bash / WSL:          source .venv/bin/activate
```

The venv is at `.venv/` in the project root. Never run `python` or `pip` without it active.

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

### 6.7 Dev Auth Bypass (local development only)

Set `AUTH_BYPASS_ENABLED=true` in `.env` to skip Google OAuth during local development. No Google credentials are needed when this is enabled.

- `DevBypassMiddleware` auto-injects a session for all localhost requests before the CSRF check
- Middleware order: `SecurityHeaders → DevBypass → CSRF → Route`
- Fixed dev identity: `dev@localhost` / `google_sub=dev-bypass-user-001` / household "Dev Household"
- Dev sessions have 24h expiry and are exempt from the 30-min sliding-window staleness check
- `POST /auth/dev-login` is the programmatic entry point — public endpoint, no CSRF required
- **NEVER** set `AUTH_BYPASS_ENABLED=true` in production — startup fires a `CRITICAL` log if `ENV != development`
- Do not add OAuth credential checks or bypass fallback paths in application code — the bypass is entirely middleware-level

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
authStore            — user identity, session token, default view (Household/My Finances)
visualizationStore   — active date range, group-by, entity filter state
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
