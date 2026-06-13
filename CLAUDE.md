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

**Design System Page Rule (enforced here; component index in UX §7):**
- If a story ships a new reusable UI component, add a demo section to `/design-system` using the **real exported component**. No synthetic `<div>` approximations. This is part of Done.
- If a component does not exist yet, do NOT add its section. Add only after the component is real and exported.
- If a story removes a component, remove its design-system section in the same change.

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

## 4. Frontend — Design Token Quick Reference

> Full token tables are in UX §0 (Foundation). This section captures only the most commonly confused tokens.

All design decisions live in `frontend/src/index.css` as `@theme` CSS variables and `@utility` classes.
**Never use raw hex values, px sizes, opacity decimals, or z-index integers in TSX components.**
If a token you need doesn't exist, add it to `index.css` — don't hardcode it inline.

### 4.1 Background Hierarchy (outermost → innermost)

```
bg-bg              — Page root, outer shell
bg-surface         — Main content areas, sidebar, Topbar (NOT bg-bg — UX §1.1)
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

### 4.6 Colour-Forward Identity & Immersive Themes (UX §0.1–§0.2)

Entity identity is a **colour fill** of the instance's own `colour` (calm tint default / vivid opt-in), read via the `--entity-colour` CSS variable (§5.5). Colour source per item: category/account/currency = their own `colour`; payee = Google avatar first, else initials on `Person.colour`; **status & inflow/outflow are SEMANTIC tokens** (success/warning/info/error), never entity colours. Don't paint every attribute at once — pick one lead colour per context (avoid rainbow rows).

**All colour — including the interaction/feedback tokens** (focus ring, selection halo, border, selection-fill: `accent-primary`, `accent-secondary`, `ring-glow-*`, error) — are **theme tokens**, never literals. Under an `immersive` palette they remap through the palette's `tint` ramp automatically (Game Boy → green rings, green selection). Because you always read tokens/variables, this is free — **hardcoding any hex breaks theming.** This is the teeth behind P4.

---

## 5. Frontend — Component Patterns (Common Mistakes)

> Full component library is in UX §1–§8 (component index UX §7). This section captures only patterns agents commonly get wrong.

### 5.1 Picker / Dropdown Trigger Button (EXACT pattern — no deviation)

All picker triggers (Dropdown, DatePicker, ColourPicker, EmojiIconPicker) use this **single ternary** for border/ring state:

```tsx
className={`
  w-full h-10 rounded-md px-3 text-sm
  bg-surface-raised border text-text-primary
  transition-colors duration-150
  flex items-center gap-2
  focus:outline-none
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
**ALWAYS** include `focus:outline-none` in the base classes — omitting it causes the browser's default focus outline to appear alongside the custom ring (see §5.7).

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

### 5.5 Entity Colour-Fill Identity Pattern (the left accent bar is RETIRED)

**Do not build a 4px left accent bar.** That pattern is retired (UX §0.1, §2). Entity identity is now a
**colour FILL** of the instance's own `colour` (default = entity-type colour): a **calm** soft tint by
default, or a **vivid** full-saturation fill when the per-instance `vivid` toggle is on. Text on the fill
is **contrast-aware** (white/dark auto by luminance; muted sub-text = same colour, reduced alpha).

Drive the fill from a CSS variable so children can read it, and keep the colour OFF the `border` shorthand:

```tsx
<div
  className="relative rounded-lg border border-border ..."   // border stays neutral
  style={{ '--entity-colour': entity.colour }}                // fill + children read this
>
```

- Use the themed fill utilities (`bg-entity-fill-calm` / `bg-entity-fill-vivid`) that read `--entity-colour`; never inline a raw hex.
- **Selection** is NOT conveyed by the fill — use the §5.4 ring + corner check + lift (tint alone is insufficient on vivid fills).
- Under an **immersive** theme the instance colour is remapped through the palette's tint ramp (UX §0.2) — because you read it from the token/variable, this happens for free. Never hardcode the hex.

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

**`focus:outline-none` is mandatory on every focusable form element with a custom ring.** Without it, the browser adds its own focus outline (yellow/gold on Windows, blue on Mac) ON TOP of the custom ring, producing a double-border effect. The custom `ring-2` IS the accessible focus indicator — the browser default must be suppressed.

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

**Each segment button MUST set `rounded-none` explicitly.** Default/pre-styled buttons carry a border-radius; if you don't zero it, every segment renders with rounded corners and the control looks wrong. Only the outer container is rounded (`rounded-md`) — its `overflow-hidden` clips the end segments to the container radius; interior edges stay square. The active segment is a **flat, full-bleed** fill (`bg-control-active` + `text-primary`), not an inset pill.

### 5.10 Skeleton Shimmer

Skeleton components require a visible shimmer. Use `bg-surface-active` as the shimmer peak — `bg-surface-hover` is too close to `bg-surface-raised` and is nearly invisible:

```tsx
className="shimmer-gradient animate-shimmer rounded"
// shimmer-gradient uses: surface-raised → surface-active → surface-raised
```

Stat and chart skeleton shapes need a `bg-surface` container frame or they appear as floating bars.

### 5.11 CategoryTree Row Pattern

Tree rows use a flat flex strip, not EntityCard. Each row has a `group` class so the drag handle can appear on hover.

**Row interaction rules (non-negotiable):**
- **Selection is clearable:** state machine is `none → selected → none`. Never a sticky selected state with no escape.
- **onClick → lift + shadow:** clicking a row applies `shadow-md -translate-y-px` (or equivalent lift token) to signal interactivity. Use `transition-all duration-100`.
- **⋮ context menu only — never inline action buttons.** All row actions (Edit, Duplicate, Archive, Delete…) go in a ContextMenu triggered by a `⋮` (`MoreVertical`) button. No icon buttons rendered directly in the row.
- **Default ⋮ trigger:** the `⋮` button is always visible (not hover-only). It uses `opacity-60 hover:opacity-100` for visual weight, not `opacity-0 group-hover:opacity-100`.

**Colour treatment (UX §6 — no left bar, no chip, no connector line):**
- **Parent rows** get a **calm colour-tint fill** of the category's `colour` (read via `--entity-colour`, §5.5) — not a left border, not a colour chip.
- **Subcategory rows** get a **lighter tint of the *parent's* colour** (visually ties child to parent) — **no separate colour chip**, slightly indented, **no connector line**.
- The **Add subcategory** affordance sits at the **end of an expanded parent's children**, not inline on every parent row.

**Row element classes (top-level or parent rows):**
```tsx
<div
  className="group flex items-center gap-2 h-11 pl-3 pr-3 bg-entity-fill-calm hover:bg-surface-hover transition-all duration-100 cursor-pointer"
  style={{ '--entity-colour': category.colour ?? 'var(--color-entity-category)' }}
>
  <GripVertical size={14} className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0 cursor-grab" />
  {hasChildren
    ? <ChevronRight size={14} className={`text-text-secondary shrink-0 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`} />
    : <Minus size={14} className="text-text-muted shrink-0" />}
  <span className="text-base shrink-0">{icon}</span>
  <span className="text-sm font-medium text-text-primary flex-1 truncate min-w-0">{name}</span>
  {/* right-aligned: badges, sub-count */}
  <ContextMenu trigger={<MoreVertical size={14} className="text-text-muted opacity-60 hover:opacity-100 shrink-0" />} items={rowMenuItems} />
</div>
```

**Subcategory group wrapper** — indent only, **no connector border**:
```tsx
<div className="ml-7 divide-y divide-border">
  {/* subcategory rows: pl-4, lighter tint of the PARENT's colour via --entity-colour */}
</div>
```

**Expand/collapse:** conditional render (show/hide children), not `display:none`. Animate with `overflow-hidden` + `max-h-0`/`max-h-[9999px]` if transition is needed.

**Archived rows:** `opacity-60 grayscale` + **dashed full border** (`border border-dashed border-border-strong`) + `[Archived]` Badge. (No left-border bar.)

**Selected rows:** `bg-primary-muted` replaces `hover:bg-surface-hover` when selected (multi-select).

**Design system reference:** `/design-system` → Category Components section — added when CategoryTree component ships (CAT-005).

---

## 6. Backend Gotchas (Common Mistakes)

> Full backend architecture is in ARCH §2–§4 (Auth & Security, Data Model, Backend). This section captures only patterns agents commonly get wrong.

### 6.0 — Always Activate the Venv First

Before running ANY Python command (pytest, uvicorn, alembic, pip):

```
Windows PowerShell:  venv\Scripts\activate
Bash / WSL:          source venv/bin/activate
```

The venv is at `venv/` in the project root. Never run `python` or `pip` without it active.

### 6.0a — Run Alembic From the Project Root

**The app uses `./financial_tracker.db` at the project root.** `alembic.ini` lives at the project root with `sqlalchemy.url = sqlite+aiosqlite:///./financial_tracker.db`, so it resolves to that same root DB.

Run `alembic upgrade head` **from the project root** (venv active). Do not add a second `alembic.ini` under `backend/` — there is one Alembic config, at the root (ARCH §3.12, §5.5).

### 6.1 — Model Column Gotchas

**Not all models inherit `BaseEntity`.** `Session` and `HouseholdInvitation` inherit `Base` directly — they have NO `updated_at` column. Use `expires_at` for recency filtering. See ARCH §3.4 for full model schemas.

**`Session` has NO `household_id`.** Session → Person → Household. Join through `person_id`.

**Case-insensitive uniqueness:** Always `func.lower(Model.name) == func.lower(name)` — never Python `.lower()`.

### 6.2 — DI Chain

`get_db` → `get_current_person` → `get_household_id`. Service layer always receives `household_id` as first positional arg. **Never** trust request body for household scoping. See ARCH §4.4 for full code.

### 6.3 — Error Responses

Use `raise HTTPException(status_code=..., detail={...})` — the global handler formats RFC 7807 Problem Details. See ARCH §4.6 for the canonical format table.

### 6.4 — CSRF

One token per session (not single-use). Frontend sends via `api/client.ts` interceptor — don't reimplement. See ARCH §2.4 for full spec.

### 6.5 — Household Deletion → Person Detachment

When a household is deleted, all member `Person` rows survive (`household_id` becomes `NULL`). On re-login, `seed_household_if_needed` checks `can_create_household`: owner gets a new household, members get `NotInvitedError`.

**Do NOT treat "person survives household deletion" as a bug.** It is the designed flow. See ARCH §2.6 for the full truth table.

### 6.6 — Category Archiving

Archiving a category with subcategories archives the subcategories **together** with the parent (the whole branch is archived) — per PRD FR-C-005. Do NOT auto-promote children to top-level. Return 200, not 409.

### 6.7 — OAuth Callback Flow

`seed_household_if_needed` is called AFTER `get_or_create_person` but BEFORE `create_session`. A pending invitation produces a session with `household_id=NULL` — this is intentional. The frontend shows `PendingInvitationDialog`.

**Do NOT treat "pending invitation + NULL household session" as a bug.** See ARCH §2.6 for the full algorithm.

### 6.8 — Dev Auth Bypass

Set `AUTH_BYPASS_ENABLED=true` in `.env` for local dev. Middleware auto-injects a dev session. **NEVER** enable in production. See ARCH §2.5 for full mechanism.

---

## 7. API Design Rules

- All list endpoints return `{"items": [...], "total": N}` — never a bare array
- Household-scoped queries always `WHERE household_id = :household_id AND is_archived = false` unless `show_archived=true` is passed
- FX stored as `rate_to_base` — the multiplier from the foreign amount to base: `amount_base = amount × rate_to_base` (ARCH §3.8). **Never store the inverse.** The human-readable "1 base = N target" shown in the UI is derived for display only. Rates come from the per-currency provider chain (ARCH §5.7); persist the winning provider in `rate_source`.
- Visualisation endpoints (`/api/visualizations/...`) are read-only, have no mutations, and may return cached/aggregated data — do not add write operations to these routes
- Bulk endpoints, global search (`GET /api/search`), and FX-provider config (`fx_providers`) follow the same household-scoping + RFC 7807 rules. API keys are stored only as Secret Manager references — never returned by any endpoint.

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
- Use `useEntityManager<T>` hook — provides `items`, `isLoading`, `create`, `update`, `archive`, `bulkArchive`. **Built on TanStack Query** (not local `useState`) — server state lives there (§8.2).
- Use `EntityCard<T>` — provides the **colour-fill identity** (§5.5, calm/vivid), favourite star, context menu, archive state, value-history sparkline.
- Use `EntityModal<T>` — two-column form layout, cancel/save actions.
- Use `EntityPage<T>` — action bar, filter slot, main content slot.
- For multi-select, use the **generic `useMultiSelect` + BulkActionBar** (ledger *and* CategoryTree, FR-E-020) — do not re-implement per module.
- Per-person favourite + manual sort persist in `entity_preferences` (ARCH §3) — not on the entity row.

Do NOT build bespoke CRUD pages — extend the generic layer.
