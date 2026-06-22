# Frontend Reference — Tokens, Component Patterns, State

Load this for **any frontend story**. Authoritative source for full detail is UX §0–§8;
this file is only the tokens + patterns agents commonly get wrong.

All design decisions live in `frontend/src/index.css` as `@theme` CSS variables and `@utility` classes.
**Never use raw hex, px sizes, opacity decimals, or z-index integers in TSX.** If a token doesn't exist, add it to `index.css`.

---

## 1. Design Token Quick Reference (full tables: UX §0)

### 1.1 Background Hierarchy (outermost → innermost)

```
bg-bg              — Page root, outer shell
bg-surface         — Main content areas, sidebar, Topbar (NOT bg-bg — UX §1.1)
bg-surface-raised  — Cards, panels, picker dropdowns, inputs
bg-surface-hover   — List row hover (barely visible — full-width rows only)
bg-surface-active  — Small button hover INSIDE panels, selected states
bg-surface-overlay — Elevated floating panels on top of raised panels
```

### 1.2 Text Tokens

```
text-text-primary    — All body text, selected values, labels
text-text-secondary  — Inactive tabs, placeholder-adjacent labels, sub-labels
text-text-muted      — Placeholder text, disabled labels ONLY (very low contrast — avoid for interactive text)
text-accent          — Active picker tabs, accent interactive elements (cyan). The accent FOREGROUND:
                       resolves to `var(--color-accent-fg, --color-accent-secondary)`. Standard themes
                       use the fallback (accent-secondary); an immersive palette whose accent-secondary
                       is a dark slot colliding with the surface (Game Boy: accent-secondary == surface)
                       MUST set `--color-accent-fg` to a legible light slot, else text-accent is invisible.
                       (Decouples accent-as-text from accent-as-fill — see §1.6.)
text-primary         — Active nav/control tabs, selected check marks (indigo)
```

### 1.3 Border Tokens

```
border-border         — Default input/panel border
border-border-light   — Hover border
border-border-strong  — Focused non-picker inputs
border-border-accent  — Open picker/dropdown trigger border (cyan)
border-border-error   — Error state border
border-border-focus   — Keyboard focus ring border (indigo)
```

### 1.4 Ring / Glow Tokens (always paired with `ring-2`)

```
ring-glow-accent    — Picker triggers when open (Dropdown, DatePicker, ColourPicker, EmojiIconPicker)
ring-glow-primary   — Text inputs on focus
ring-glow-error     — Error state inputs
```

These three are backed by **explicit `@utility` blocks** in `index.css` (they set `--tw-ring-color`),
NOT auto-generated colour utilities — see §1.4a. Do not "simplify" them away.

### 1.4a ⚠️ Tailwind v4 token-name vs class-name collision (read before adding any colour token)

Tailwind v4 derives a utility *colour name* from everything after `--color-`. So a token whose name
**starts with a utility prefix** (`ring-`, `text-`, `bg-`, `border-`, `accent-`) does NOT produce the
class you'd expect — the prefix gets parsed twice:

| Token | Naïve class (BROKEN — silently no-ops) | What actually works |
|---|---|---|
| `--color-ring-glow-primary` | `ring-glow-primary` → looks up `--color-glow-primary` (∄) | `@utility ring-glow-primary { --tw-ring-color: var(--color-ring-glow-primary) }` |
| `--color-border-accent` | `border-accent` → `--color-accent` (∄) | `border-border-accent` (double up) |
| `--color-border-error` | `border-error` → `--color-error` (wrong token, only *coincidentally* the same value) | `border-border-error` |
| `--color-accent-primary` | `text-primary`/`bg-primary` → `--color-primary` (∄) | `@utility text-primary`/`bg-primary` (alias to accent), or `text-accent-primary` |
| `--color-accent-secondary` | `text-accent` → `--color-accent` (∄) | `@utility text-accent`, or `text-accent-secondary` |

A broken colour utility fails **silently** — the class is dropped and `ring-2`/text falls back to a
near-white default. There is no build error. **Verify focus rings and selection colours actually
render the themed colour** (inspect `--tw-ring-color` / computed `color`), don't trust that the class
"looks right". The aliases (`bg-primary`, `text-primary`, `text-accent`, `ring-glow-*`) are the
sanctioned spellings — they exist as `@utility` blocks specifically to dodge this collision.

`frontend/tests/design-tokens.test.ts` enforces this: it fails CI if any component uses a bare
colliding token name, or if a sanctioned `@utility` alias is removed. Add new colliding tokens to an
`@utility` (or use the doubled class) and the guard stays green.

**Sizing-scale sibling — `max-w-*` collides with `--spacing-*`.** Same trap, different scale: Tailwind v4
resolves `max-w-<key>` against the `--spacing-*` scale when a matching token exists, so `max-w-sm`→**12px**
and `max-w-lg`→**24px** (the spacing token shadows the container scale) — collapsing the element to a
sliver / one-word-per-line, silently. This bit EmptyState 4×. **Never use `max-w-sm/md/lg/xl/2xl` in TSX**;
use a dedicated `@utility` (`max-w-empty-state`, `max-w-modal`, `max-w-input`, `max-w-tooltip`). The same
`design-tokens.test.ts` has a second guard that fails CI on any `max-w-<spacing-key>` in a component.
(`max-w-3xl` works only because no `--spacing-3xl` exists.)

### 1.5 Fill / Active State Tokens

```
bg-accent-subtle    — Nav sidebar active item background
bg-control-active   — Active tab in SegmentedControl, Topbar navigation tabs
bg-accent-active    — Active tab INSIDE picker panels (ColourPicker, EmojiIconPicker) ONLY
```

**Critical distinction:** `bg-control-active` is for navigation/control tabs. `bg-accent-active` is exclusively for tabs inside picker dropdown panels. Getting this backwards makes pickers look wrong.

### 1.6 Colour-Forward Identity & Immersive Themes (UX §0.1–§0.2)

Entity identity is a **colour fill** of the instance's own `colour` (calm tint default / vivid opt-in), read via the `--entity-colour` CSS variable (§2.5). Colour source per item: category/account/currency = their own `colour`; payee = Google avatar first, else initials on `Person.colour`; **status & inflow/outflow are SEMANTIC tokens** (success/warning/info/error), never entity colours. Don't paint every attribute at once — pick one lead colour per context (avoid rainbow rows).

**All colour — including the interaction/feedback tokens** (focus ring, selection halo, border, selection-fill: `accent-primary`, `accent-secondary`, `ring-glow-*`, error) — are **theme tokens**, never literals. Under an `immersive` palette they remap through the palette's `tint` ramp automatically (Game Boy → green rings, green selection). Because you always read tokens/variables, this is free — **hardcoding any hex breaks theming.**

> **⚠️ Caveat — this "for free" remap holds ONLY for tokens defined in CSS** (the interaction/feedback tokens above, and entity-*type* defaults). A **runtime, user-picked per-instance colour** (`Account.colour`, `Category.color`, …) is NOT remapped by CSS — `color-mix` can't snap an arbitrary hex to a ramp slot. It must pass through the JS resolver (`remapEntityColour` → `enforceFloor`) at the point `--entity-colour` is set (SCP 2026-06-22 colour-system-contract; UX §0.2). Do **not** assume an instance colour themes itself on immersive — wire it through the resolver. See §2.5.

### 1.7 No Magic Values (governance P4 — full enforcement here)

All hardcoded colour, opacity, size, z-index, transition duration, or breakpoint values must be named tokens in `index.css`. Never use:
- Raw hex colors: `#6366f1` → use `text-primary` or `bg-primary`
- Raw opacity: `rgb(99 102 241 / 0.2)` → use `ring-glow-primary`
- Raw z-index: `z-[100]` → use `z-dropdown`
- Raw pixel widths: `w-[320px]` → add `@utility w-date-picker { width: 320px; }` to `index.css`
- `bg-black/70` → use `bg-backdrop`
- `ring-white/80` → use `ring-accent ring-offset-surface-raised`

### 1.8 Token Sweep Before Changing Component Mechanism (governance P3)

Before switching how a component references a design decision (e.g. inline style → utility class):
1. Run `npx vite build` and inspect output CSS for the affected rules
2. Confirm the new rule comes AFTER any Tailwind shorthand that could override it
3. If ordering cannot be guaranteed, use inline style (specificity 1-0-0-0, always cascade-immune)

### 1.8a Two distinct CSS failure modes — lint catches one, only a build-grep catches the other

`index.css` is linted by **`stylelint`** (`npm run lint:css`, in CI before the unit tests). It parses the CSS
and **rejects malformed source** — this is what catches the class of bug that wasted ~90 min in story 1.10: a
literal **`*/` inside a comment** (e.g. writing `fill-*/stroke-*` in prose) closes the comment early, so the
text after it becomes invalid CSS and the **next `@utility` silently breaks**. Stylelint flags it as a
`parseError`; the JS/vitest suite does **not** (JSDOM tests only assert the className is on the element, never
that the CSS rule emitted). **Rule: never write `*/` — or glob-y `fill-*/stroke-*`, `w-*/h-*` — inside an
`index.css` comment.**

Stylelint does **not** catch a *silent non-emit* — a custom utility that compiles to nothing (e.g. a §1.4a
token/class collision where the class is valid-but-dropped). The source is well-formed, so the parser is
happy. **For "did my new utility actually emit?", the only reliable check is still the §1.8 build-grep:** run
`npx vite build` and grep the built `dist/assets/index-*.css` for the rule. Do this for every new `@utility`
or token before marking a story done — green tests + green stylelint are necessary but not sufficient.

---

## 2. Component Patterns (full library: UX §1–§8, index UX §7)

### 2.1 Picker / Dropdown Trigger Button (EXACT pattern — no deviation)

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
      ? 'border-border-accent ring-2 ring-glow-accent'
      : 'border-border hover:border-border-light focus:ring-2 focus:ring-glow-accent focus:border-border-accent'
  }
`}
```

**DO NOT** split into two separate ternaries — the `focus:ring-*` classes on the closed-but-focused state are lost.
**DO NOT** put `border-border` in the base classes — it belongs only in the ternary's closed branch.
**Class spelling (§1.4a):** use `border-border-accent` — the bare `border-accent` resolves to the non-existent `--color-accent` and silently no-ops. `ring-glow-accent` and `ring-accent` are the sanctioned `@utility` aliases.
**ALWAYS** include `focus:outline-none` in the base classes — omitting it causes the browser's default focus outline to appear alongside the custom ring (see §2.7).

### 2.2 Picker Panel Tab Buttons (EXACT pattern)

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

### 2.3 Hover Token for Small Buttons Inside Panels

Grid buttons inside picker panels (emoji cells, icon cells, calendar day buttons) sit on `bg-surface-raised`. The delta to `bg-surface-hover` is only 4 per channel — nearly invisible for small buttons.

```
INSIDE a picker panel grid: hover:bg-surface-active   ← use this
Inside a full-width dropdown list row: hover:bg-surface-hover
```

### 2.4 Color Swatch Selection Ring (EXACT pattern)

```tsx
className={`
  w-7 h-7 rounded-full transition-transform hover:scale-110 focus:outline-none
  ${isSelected ? 'ring-2 ring-offset-1 ring-accent ring-offset-surface-raised' : ''}
`}
```

**Never:** `ring-white/80` — hardcoded magic value.

### 2.5 Entity Colour-Fill Identity Pattern (the left accent bar is RETIRED)

**Do not build a 4px left accent bar.** That pattern is retired (UX §0.1, §2). Entity identity is now a
**colour FILL** of the instance's own `colour` (default = entity-type colour): a **calm** soft tint by
default, or a **vivid** full-saturation fill when the per-instance `vivid` toggle is on. Text on the fill
is **contrast-aware** (white/dark auto by luminance; muted sub-text = same colour, reduced alpha).

Drive the fill from a CSS variable so children can read it; the **border is also a tint** of the
instance colour (design bible `.ecard`: `color-mix(--ec 30%, --border)`), via the `border-entity-calm`
utility — NOT a flat neutral `border-border`. (The colour still never goes on a raw hex; it reads
`--entity-colour`.)

```tsx
<div
  className="relative rounded-lg border border-entity-calm ..."  // tinted edge (bible .ecard)
  style={{ '--entity-colour': entity.colour }}                   // fill + border + children read this
>
```

- Use the themed utilities (`bg-entity-fill-calm` / `bg-entity-fill-vivid` for the fill, `border-entity-calm` for the edge) that read `--entity-colour`; never inline a raw hex.
- **Selection** is NOT conveyed by the fill — use the §2.4 ring + corner check + lift (tint alone is insufficient on vivid fills).
- Under an **immersive** theme the instance colour is remapped through the palette's tint ramp (UX §0.2). This does **NOT** happen for free in CSS — a runtime instance hex is resolved in JS (`remapEntityColour` → `enforceFloor`) at the point `--entity-colour` is set, so route every `--entity-colour` setter through the shared resolver / `useEntityColour` hook (SCP 2026-06-22 colour-system-contract; reopened Story 1.6). Never hardcode the hex; never assume the bare CSS variable self-themes on immersive.

### 2.6 Nested Button Rule — Never Button Inside Button

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

### 2.7 Text Input Focus Ring

**`focus:outline-none` is mandatory on every focusable form element with a custom ring.** Without it, the browser adds its own focus outline (yellow/gold on Windows, blue on Mac) ON TOP of the custom ring, producing a double-border effect. The custom `ring-2` IS the accessible focus indicator — the browser default must be suppressed.

Text inputs (Input component, search fields, hex input) use `ring-glow-primary` (indigo):

```
focus:outline-none focus:ring-2 focus:ring-glow-primary focus:border-border-focus
```

Search inputs **inside picker panels** use `ring-glow-accent` (cyan), consistent with the picker theme:

```
focus:outline-none focus:ring-1 focus:ring-glow-accent focus:border-border-accent
```

### 2.8 Tooltip Pattern (CSS-Primary — No JS Timers)

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

### 2.9 SegmentedControl Pattern

Two-option mode toggles (e.g., Household/My Finances) use the segmented control pattern:

```tsx
<div className="flex border border-border rounded-md overflow-hidden">
  <button className={isFirst ? 'bg-control-active text-primary' : 'text-text-secondary'}>
    Option A
  </button>
  <span className="w-px bg-border self-stretch" />
  <button className={!isFirst ? 'bg-control-active text-primary' : 'text-text-secondary'}>
    Option B
  </button>
</div>
```

Tokens: `border-border` for the outer border, `bg-border` for the internal divider span. **Never** `border-primary/30` or invented `border-state*` names.

**Each segment button MUST set `rounded-none` explicitly.** Default/pre-styled buttons carry a border-radius; if you don't zero it, every segment renders with rounded corners and the control looks wrong. Only the outer container is rounded (`rounded-md`) — its `overflow-hidden` clips the end segments to the container radius; interior edges stay square. The active segment is a **flat, full-bleed** fill (`bg-control-active` + `text-primary`), not an inset pill.

### 2.10 Skeleton Shimmer

Skeleton components require a visible shimmer. Use `bg-surface-active` as the shimmer peak — `bg-surface-hover` is too close to `bg-surface-raised` and is nearly invisible:

```tsx
className="shimmer-gradient animate-shimmer rounded"
// shimmer-gradient uses: surface-raised → surface-active → surface-raised
```

Stat and chart skeleton shapes need a `bg-surface` container frame or they appear as floating bars.

### 2.11 CategoryTree Row Pattern

Tree rows use a flat flex strip, not EntityCard. Each row has a `group` class so the drag handle can appear on hover.

> **Drag-and-drop = `@dnd-kit/core`, NOT native HTML5 DnD.** Native `draggable`/`onDragStart` was tried and hardened repeatedly on CategoryTree and stayed unreliable in real browsers (rows that were DOM-identical behaved differently); synthetic `fireEvent.dragStart/drop` tests passed but proved nothing (they bypass real drag initiation). Use dnd-kit for **any** drag surface (CategoryTree now, the Dashboard board §17 later): handle-based `useDraggable`, `useDroppable` targets, Pointer **+ Keyboard** sensors, and keep the drop *outcome* a **pure unit-tested function** (`resolveMove(active, over, items)` is the model). Install needs `--legacy-peer-deps`. Full post-mortem: SCP 2026-06-20; rationale in ARCH §1.11.

**Row interaction rules (non-negotiable):**
- **Selection is clearable:** state machine is `none → selected → none`. Never a sticky selected state with no escape.
- **onClick → lift + shadow:** clicking a row applies `shadow-md -translate-y-px` (or equivalent lift token) to signal interactivity. Use `transition-all duration-100`.
- **⋮ context menu only — never inline action buttons.** All row actions (Edit, Duplicate, Archive, Delete…) go in a ContextMenu triggered by a `⋮` (`MoreVertical`) button. No icon buttons rendered directly in the row.
- **Default ⋮ trigger:** the `⋮` button is always visible (not hover-only). It uses `opacity-60 hover:opacity-100` for visual weight, not `opacity-0 group-hover:opacity-100`.

**Colour treatment (UX §6 — no left bar, no chip, no connector line):**
- **Parent rows** get a **calm colour-tint fill** of the category's `colour` (read via `--entity-colour`, §2.5) — not a left border, not a colour chip.
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

**Selected rows (multi-select):** `bg-surface-active` (neutral) fill **plus** `ring-2 ring-accent` (the §0.9 selection colour, `accent-secondary` / cyan) — the ring is the load-bearing signal (a fill alone is too quiet over an entity tint). Keep the leading `Checkbox` too. The drag-over **drop-target** uses the *other* §0.9 accent — **`ring-2 ring-primary`** (a solid `accent-primary` / indigo ring; **not** the translucent `ring-glow-primary`, which is a 35%-alpha halo that reads muddy as a drop signal) on the hovered parent block + the promote zone. So selection (cyan) and drop-target (indigo) stay distinct. `ring-primary` is the `@utility` alias for solid `accent-primary` (sibling of `ring-accent`; the bare `ring-primary` would collide per §1.4a).

**Design system reference:** `/design-system` → Category Components section — added when CategoryTree component ships (CAT-005).

---

## 3. State & API Rules

### 3.1 Zustand Stores

```
authStore            — user identity, session token, default view (Household/My Finances)
visualizationStore   — active date range, group-by, entity filter state
alertStore           — unread-alert / notification panel + toast state (ARCH §6.3)
```

Do not create new stores for entity CRUD — that belongs to TanStack Query.

### 3.2 TanStack Query

- All server state goes through TanStack Query (`useQuery`, `useMutation`)
- Query keys follow `['entity-type', filters]` convention
- `api/client.ts` handles auth headers, CSRF, and 401 redirect automatically — never duplicate this logic

### 3.3 Generic Entity Layer

For any feature page implementing entity CRUD:
- Use `useEntityManager<T>` hook — provides `items`, `isLoading`, `create`, `update`, `archive`, `bulkArchive`. **Built on TanStack Query** (not local `useState`) — server state lives there (§3.2).
- Use `EntityCard<T>` — provides the **colour-fill identity** (§2.5, calm/vivid), favourite star, context menu, archive state, value-history sparkline.
- Use `EntityModal<T>` — two-column form layout, cancel/save actions.
- Use `EntityPage<T>` — action bar, filter slot, main content slot.
- For multi-select, use the **generic `useMultiSelect` + BulkActionBar** (ledger *and* CategoryTree, FR-E-020) — do not re-implement per module.
- Per-person favourite + manual sort persist in `entity_preferences` (ARCH §3) — not on the entity row.

Do NOT build bespoke CRUD pages — extend the generic layer.

**Sanctioned exception — CategoryTree.** The CategoryTree is a *tree*, not a card grid, so it does **NOT** use `EntityCard` — it renders the flat flex-strip rows of §2.11. It still extends the rest of the generic layer (EntityPage, EntityModal, `useEntityManager`, `useMultiSelect` + BulkActionBar). This is the **only** entity surface exempt from `EntityCard`; everything else uses it. (UX §6.)
