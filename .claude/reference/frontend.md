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

The §2 emphasis scale is `strong / default / muted / faint` — all DERIVED (`text = mix(pole, surface, e)`);
the names were `primary/secondary` before 5f-5 (value-preserving rename to the §2 vocabulary, no re-point).
```
text-text-strong     — Headings, key figures, selected values (the §2 max-emphasis stop; was text-text-primary)
text-text-default    — Body, primary UI, labels (~7:1; was text-text-secondary)
text-text-muted      — Caption, meta, sub-labels (the 4.5:1 floor)
text-text-faint      — Disabled / decorative / large-only (the §2 3:1 SUB-floor — NEVER body content; L3).
                       Disabled text is `faint` via the one `.disabled` utility (§3a), not a hand-mix.
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

### 1.6a Chart Series Tokens (role-3 viz series, defined Story 1.6)

`--color-chart-1 … --color-chart-8` are defined per-palette in `index.css` (base values in `@theme`,
overrides per `[data-theme]` block). Epic 9 chart series **must read `var(--color-chart-N)`** so they
reskin per palette automatically — never mint a new chart palette or hardcode series hexes. Per-instance
entity series colours additionally pass through `remapEntityColour` under an immersive theme.

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

### 2.0 `Button` primitive — the seven variants (5f-9)

`Button` (`primitives/Button.tsx`) composes `usePressable` (press-scale + the §3a `disabled` class — never
re-author per variant) and exposes **seven** `variant`s. The frame utilities (`h-control px-md`) live in the
variant map, not the shared base, so `link` (frameless) and `icon` (size-to-child) can opt out.

| variant | use for | look |
|---|---|---|
| **`filled`** (default) | the primary affordance (one per surface) | `accent-primary` fill + `on-primary` text (§6) |
| **`outline`** | secondary actions | raised surface + `border` |
| **`ghost`** | tertiary / low-emphasis bordered | transparent + `border`, hover fills |
| **`danger`** | destructive confirm | `error` fill + `on-primary` text |
| **`text`** | a neutral, borderless text button | transparent, `text-strong`, hover `surface-hover`, **no border** |
| **`link`** | an inline accent hyperlink | **no frame**, `text-accent`, underline on hover |
| **`icon`** | a bare icon-only affordance | centered + `rounded-md` + `p-2xs` hit-area; **size from the `<Icon>` child**, **colour inherited `currentColor`** (caller styles it) |

- **Renamed in 5f-9** (value-preserving): `primary`→`filled`, `secondary`→`outline`. No `primary`/`secondary`
  values remain — `filled`/`outline` compute the identical class set.
- **`icon` is bare/size-to-child, NOT a fixed control-height square** — the app's icon buttons are 14–16px bare
  icons with colour-change hovers; a forced square fit almost none. Pass the size on the `<Icon>` child and the
  colour via `className` (the variant pins no `text-*`, so a caller's `text-error`/entity colour can't be beaten
  by stylesheet source order). Provide an `aria-label` for icon-only buttons.
- The raw-`<button>` consumer migration onto these variants (+ the L8 `<button>`→`Button` eslint promotion) is
  **Story 5.12**, not 5f-9 — 5f-9 only builds the variants + renames existing `Button` usages.

### 2.1 Picker / Dropdown Trigger Button (EXACT pattern — no deviation)

All picker triggers (Dropdown, DatePicker, ColourPicker, EmojiIconPicker) use this **single ternary** for border/ring state:

```tsx
className={`
  w-full h-10 rounded-md px-3 text-sm
  bg-surface-raised border text-text-strong
  transition-colors duration-150
  flex items-center gap-2
  focus:outline-none
  ${disabled
    ? 'disabled'
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
    : 'text-text-default hover:text-text-strong hover:bg-surface-active'
  }
`}
```

Tabs used as page/control navigation (SegmentedControl, view toggles):

```tsx
className={`
  flex-1 text-xs py-1.5 rounded transition-colors focus:outline-none
  ${isActive
    ? 'bg-control-active text-primary font-medium'
    : 'text-text-default hover:text-text-strong hover:bg-surface-hover'
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

### 2.5a Colour-Pole Inheritance on Entity Surfaces (panel sets ONE foreground; children inherit)

On any entity-fill surface (EntityCard, its detail view/modal — **calm OR vivid**) the **panel sets the
foreground pole once and every child inherits it**; mute with the **§2 entity-axis emphasis utilities**
(`text-entity-default` / `-muted` / `-faint`, `text-entity-strong` = the full pole) — **never `opacity-*`**
(it bleeds the bg + breaks the §0.11 floor, B13) and never a neutral `text-text-*` / `bg-surface-*` /
`border-border` token. The panel sets `--entity-fg` + `--entity-emph-surface` once (vivid → the on-colour
pole over the fill; calm → the `:root` defaults = the text-entity-fg pole over surface-raised); children
consume a `text-entity-*` class, never a TSX `color-mix` (L4). Patching elements one-by-one is the wrong
method — the fix is inheritance.

- **Vivid fill:** foreground = the WCAG contrast pole `contrastText(colour)` (→ `--entity-on-colour` /
  the `text-on-entity` utility on the root). A child that hardcodes `text-text-default` overrides the
  inherited pole and renders light-on-light on a *light* vivid fill (the EntityCard ⋮-dots-invisible bug).
- **Calm fill:** foreground = **`text-entity-fg`** (`color-mix(text-primary 60%, --entity-colour)` — the
  pole pulled toward the instance hue). Owner reversed the old neutral-pole rule 2026-06-22 ("ugly with the
  neutral"). Icons → `text-entity`; dividers/scrollbar/chrome → `border-entity-edge` / `scrollbar-entity`
  (pole-aware). Use `border-entity-edge`, not `border-entity-calm`, on a surface that can go vivid.
- **MiniSparkline** reads `var(--spark-colour, var(--entity-colour))`; EntityCard sets
  `--spark-colour: var(--entity-on-colour)` on vivid **only** — else the chart is the same colour as the
  fill and vanishes. Calm keeps the identity colour.
- **Only exempt** (theme-governed by their own rules): semantic colours (success/error), the theme accent
  (`ring-accent`, `bg-primary` selection check, `text-primary` action buttons), emoji glyphs, the favourite
  star (always gold).
- **Verify live** on a **light** vivid fill and across every account subtype — walk each descendant's
  computed color/stroke/border/bg and assert none equals a neutral `--color-*`. jsdom can't see this.

### 2.6 Nested Button Rule — Never Button Inside Button

`<button>` cannot be a descendant of `<button>` (invalid HTML, React hydration warning).

For secondary interactive elements inside a trigger button (e.g., a clear/X button), use:

```tsx
<span
  role="button"
  tabIndex={-1}
  aria-label="Clear"
  className="text-text-muted hover:text-text-strong cursor-pointer transition-colors"
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
    bg-surface-overlay border border-border text-text-strong shadow-lg
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
  <button className={isFirst ? 'bg-control-active text-primary' : 'text-text-default'}>
    Option A
  </button>
  <span className="w-px bg-border self-stretch" />
  <button className={!isFirst ? 'bg-control-active text-primary' : 'text-text-default'}>
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
    ? <ChevronRight size={14} className={`text-text-default shrink-0 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`} />
    : <Minus size={14} className="text-text-muted shrink-0" />}
  <span className="text-base shrink-0">{icon}</span>
  <span className="text-sm font-medium text-text-strong flex-1 truncate min-w-0">{name}</span>
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

**Archived rows:** the **`archived`** utility (the sanctioned `opacity-60 grayscale`, tokenised 5f-5) + **dashed full border** (`border border-dashed border-border-strong`) + `[Archived]` Badge. (No left-border bar.) `archived` is the ONE place state-opacity is allowed; everything else uses the §2 emphasis tokens / `.disabled`.

**Selected rows (multi-select):** `bg-surface-active` (neutral) fill **plus** `ring-2 ring-accent` (the §0.9 selection colour, `accent-secondary` / cyan) — the ring is the load-bearing signal (a fill alone is too quiet over an entity tint). Keep the leading `Checkbox` too. The drag-over **drop-target** uses the *other* §0.9 accent — **`ring-2 ring-primary`** (a solid `accent-primary` / indigo ring; **not** the translucent `ring-glow-primary`, which is a 35%-alpha halo that reads muddy as a drop signal) on the hovered parent block + the promote zone. So selection (cyan) and drop-target (indigo) stay distinct. `ring-primary` is the `@utility` alias for solid `accent-primary` (sibling of `ring-accent`; the bare `ring-primary` would collide per §1.4a).

**Design system reference:** `/design-system` → Category Components section — added when CategoryTree component ships (CAT-005).

---

### 2.12 Modal Portal Stacking Traps (z-index: `dropdown` 100 < `modal` 400)

Both `Modal` and `ContextMenu` `createPortal` to `document.body`.
- **A ⋮ ContextMenu inside a Modal is invisible/unclickable** — its flyout portals at `z-dropdown` (100),
  behind the modal panel (`z-modal` 400). Use **inline icon buttons** for per-row actions inside a modal,
  not a ⋮ menu.
- **A ConfirmationDialog launched from inside a modal must be a SIBLING of it, not a child.** Nested,
  React commits its body portal *before* the parent's → the parent paints over it (confirm button
  un-hittable). Render `<><EntityModal/><ConfirmationDialog/></>`.

Equal z-index → DOM/commit order decides paint; the lesson is the nesting, not the number. Verify live
(`document.elementFromPoint` on the action button) — jsdom has no stacking/paint.

**ConfirmationDialog confirm-input safeguard (UX §Layer-2 — type-to-confirm).** For a high-risk destructive
confirm (delete-household, drop-data), pass `confirmText` (the exact value the user must type). The dialog then
renders a labelled `Input` below the `message` and keeps the primary (destructive) `Button` **disabled until the
typed value `=== confirmText`** (combined with `busy`, so it's `busy || !match`). Pair it with
`confirmInputLabel` (visible `<Label>`) and/or `confirmInputAriaLabel` (the a11y name — overrides the visible
label). **The dialog owns the typed value and resets it on close**, so a reopened dialog is never pre-filled — do
NOT hand-roll a raw `Modal` + local `typed` state for this. Omit `confirmText` for the plain decision dialog
(default, unchanged). Reach for `closeOnConfirm={false}` when the confirm action itself unmounts the dialog (e.g.
delete → clear-auth → redirect), so it doesn't flash a reset state before unmounting. See `DeleteHousehold`
(`ManagementTab.tsx`) for the canonical consumer.

### 2.13 Searchable Dropdown; Toast & Scroll-Gutter Polish

- **Dropdown has an opt-in `searchable` prop** (Story 1.13) — ONE combobox component, reuse for any "type
  to find one of many" (currency, timezone, future CommandPalette). Filters on
  `DropdownOption.searchText ?? (string label : value)` — **never the raw `label`** (it's a ReactNode).
  Searchable mode keeps DOM focus in the filter input and tracks the highlight via `aria-activedescendant`
  + `bg-surface-active`; the roving-tabIndex `.focus()` is gated to the non-searchable path (don't
  reintroduce per-option focus for searchable). Disabled trigger sets the real HTML `disabled` attribute.
- **`scrollbar-gutter-stable`** on `AppShell <main>` — without it a tall tab's scrollbar narrows the
  content box and re-centres `max-w-* mx-auto` columns ~5px on tab switch. Inherit for any new scroll
  region with centred content.
- **Toast motion** (UX §0.7): `ToastContainer` is `flex-col-reverse` + per-item grid wrapper transitioning
  `grid-template-rows 0fr↔1fr` (height growth bumps older toasts) + inner `translate-x`/`opacity` slide.
  Removal is **timer-driven** (`TOAST_EXIT_MS`), NOT `transitionend` — a 0s reduce-motion transition emits
  no `transitionend`, so the toast would stick in the DOM.
- **Dropdown menu width = `max(trigger, content)`** (5f-11, UX §436): the portalled panel is `w-max` +
  inline `minWidth: pos.width` (the trigger width as a floor) — **never** a fixed `width: pos.width`. So a
  full-width field trigger keeps a trigger-width menu (content ≤ trigger) while a deliberately-compact
  trigger (`w-bulk-picker`, the BulkActionBar pickers) lets its menu grow to its labels instead of wrapping.
  This is the **default for every Dropdown** — do NOT add a per-call `menuFit`-style flag (that was tried and
  reverted as unspecced drift; the §436 rule supersedes it). **Law:** a Dropdown menu never wraps an option row.

### 2.14a Mobile bottom-nav chrome & `< md` bottom-pinned elements (5f-11, UX §17)

- **`--nav-mobile-h` (48px)** is the one source for the fixed mobile Menu bar height (`h-nav-mobile` on
  `Sidebar`'s `MobileNav` bar), the `AppShell <main>` bottom inset (`pb-nav-mobile md:pb-0` — so scrolled
  content clears the bar `< md`), and the offset for any `< md` bottom-pinned element.
- **A bottom-pinned `< md` element clears the nav — but HOW depends on whether it lives inside the padded
  `<main>` or not.** Two cases, don't conflate them:
  - **Inside `<main>` (sticky):** `BulkActionBar`'s wrapper is `bottom-lg max-md:bottom-0` (+ the bar
    `max-md:w-full`, keeping `overflow-x-auto` so actions scroll not clip). It uses **`bottom-0`, not
    `bottom-nav-mobile`** — `<main>` already insets its bottom by `--nav-mobile-h`, and sticky `bottom` is
    measured from that padded scrollport edge, so a second nav-height offset would **compound into a 48px gap**
    (caught in 5f-11 code review). Rely on the inset; pin flush with `bottom-0`.
  - **Outside `<main>` (fixed):** `ToastContainer` is mounted outside AppShell (so its z isn't trapped), so it
    gets **no** `<main>` padding and must add the whole clearance itself: `bottom-toast max-md:bottom-toast-mobile`
    (`calc(--nav-mobile-h + --toast-inset-bottom)`).
  - Overlap is fixed by the **inset/offset**, not z — §9 already stacks `sticky` (z200) below the mobile nav
    (z300). For any future `< md` bottom chrome, first ask: inside the padded scroll container, or fixed outside it?

### 2.14 Table\<T\> Record-Ledger Primitive (Story 5.0a)

`components/primitives/Table.tsx` (+ `tableColumns.tsx` factories `date/text/money/select/actionsColumn`,
`tableLogic.ts` pure `nextSort`/`sortRows`/`shouldCommit`). Demoed at `/design-system#table`.
- **It's the dumb row-grid** — no fetch, no filters, no modal, no selection state. `rows` + selection come
  from `useEntityManager` / `useMultiSelect`. Sort is both modes (internal default; controlled when caller
  passes `sort` + `onSortChange`).
- **Inline edit:** double-click → `editControl` swap; Enter/blur-out → `onCellCommit(row,key,value)`;
  Esc/blur-within → cancel; `canEditRow` gates. **Optimism + rollback + toast live in the CALLER's
  `onCellCommit`**, not Table. Double-fire guarded by a `resolved` ref.
- **Neutral surface tokens** (`border-border` / `bg-surface-hover`), NOT entity tints — the tint is the
  consumer's job (§2.5).
- Every `primitives/index.ts` export must map to a `/design-system` section or
  `design-system-completeness.test.tsx` fails. Column factories live in their own `.tsx` to dodge
  `react-refresh/only-export-components`.
- **Scale modes (5f-8):** `virtualized` windows the DOM via `@tanstack/react-virtual` (only visible rows +
  an `overscan` buffer mount → bounded DOM); `infinite` (implies `virtualized`) is a server keyset-paging
  **seam** — Table detects near-bottom + calls the consumer-supplied `infinite.fetchNextPage` and renders a
  loading sentinel, but **never owns the query** (`useInfiniteQuery` lives in the consumer; boundary at
  `Table.tsx:10`). Never a numbered pager (UX line 481). Row height = the `--ledger-row-height` density
  token (read via `getComputedStyle`; L13 — no literal). The windowing uses leading/trailing **spacer
  `<tr>`s** (padding rows) so the `colgroup`/`tableLayout:fixed` grid survives. Declare `virtualized` for
  any list expected to exceed ~a few hundred rows.
- Seams (deferred, not bugs): category/currency/account/person cols + amount+ccy edit cell = 5.2;
  aggregation profile (totals, drill) = 9.2b; reorderable config profile + bespoke-table retrofit = 5.12.
  *(`moneyColumn`→`MonetaryValue` and `statusColumn`→Badge+registry landed in 5f-3/5f-4.)*

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

### 3.4 Backend Timestamps Serialize Naive (no `Z`) — Append `Z` Before `new Date()`

`DateTime(timezone=True)` columns round-trip **naive** from SQLite; Pydantic emits them tz-less
(`"2026-06-20T11:59:35"`, no `Z`). `new Date(naive)` in the browser parses as **local** → any
relative-age / freshness / "N ago" math skews by the viewer's UTC offset (a 52 h-stale rate showed as
"64 h"). Before `new Date()`, append `Z` when the string carries no offset:
`/[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z'` (pattern lives in `lib/currency.ts::rateTimeMs`).
Route every freshness helper through it. Applies to **any** backend timestamp rendered for elapsed
display (snapshots E4, transactions E5, occurrences E6, alerts E10, chart x-axes E9). `lib/date.ts` does
**not** cover this — it's the per-person *date-only* preference. Tests must include a naive (no-`Z`) input,
not just `toISOString()` (which always emits `Z` and hides the bug).

---

## 4. Gate Reality, Local Dev & Repo Gotchas

### 4.1 The Frontend Gate Is Three Layers — Re-run the Whole Thing; `tsc -b` Is the Only Real Type Check

`npm run lint` = `eslint` → `tsc -b` → `stylelint`, chained. `npm run build` = `tsc -b && vite build`.
- **`tsc -b`, never `tsc --noEmit`.** The root `tsconfig.json` is a solution file (`files: []` +
  `references`); plain `tsc --noEmit` on it compiles **zero files and exits 0** — a no-op gate that always
  passed (a file that didn't even compile sailed through every historical "green"). Fixed in `package.json`
  2026-06-22 → `tsc -b`. Only `tsc -b` / `npm run build` is a trustworthy type gate.
- **eslint has NO underscore-ignore for unused vars** — `_url` / `_opts` still error. Route a fetch mock by
  URL so its params are actually used (repo convention in `management-tab.test.tsx`); don't underscore-prefix.
- **Re-run the FULL gate after any fix** (`npm run lint && npm run test && npm run build`) — a fix for one
  layer routinely breaks another (a `tsc` fix that introduces an eslint unused-var). One green layer ≠ done.
- Green lint/test ≠ compiles ≠ visually correct — **no layer checks colour/pole**; do the live visual
  verify (governance P1).

### 4.1c Conformance guards: ban the TONE/VALUE, not the EXAMPLE shape

When you author or strengthen a CI guard (the Part II L0–L20 set, or any `no-restricted-syntax`/grep
gate), ban the **forbidden value at the literal level with an allowlist of legal homes** — never the
one syntactic *shape* the audit happened to record. A shape-ban catches the example and is blind to the
**same sin re-expressed**: a status tone `'success'` evades `grep variant="(success|warning|error)"` the
moment it's a `Record<…, BadgeVariant>` map value, a ternary, or a computed prop. This is the exact hole
that let `INVITATION_BADGE` + the inline status ternaries (hand-rolled in `ManagementTab`) sail through the
gate — DIY surfaces evade shape-greps by construction.

- **Status tones:** ban the literals `'success' | 'warning' | 'error'` anywhere outside
  `config/statusRegistry.ts` + `components/primitives/Badge.tsx`. **Every semantic badge is a §4 registry
  domain** — `currencyFreshness`, `fxProvider`, `member`, `invitation`, `categoryType` (income/expense/both),
  … — resolved via `statusTone(domain, key)` → `BADGE_VARIANT_FOR_TONE` (or `badgeVariantForStatus`). There is
  **no separate "category-badge" home**. *(Roles map to `outline`/`neutral` — not semantic tones — so a tiny
  local `Record<role, BadgeVariant>` is fine; the guard only flags the banned tone literals.)* Scope the
  Record-value half of the guard to the `Record<…, BadgeVariant>` object literal, not the whole file (else a
  harmless neutral role map sharing a file with an unrelated toast `variant: 'error'` false-positives).
- **Semantic colour (L6):** ban green/red/amber **hex** outside the token layer.
- **Icons (L14):** ban lucide **value**-imports outside the §11 registry homes (`config/**`,
  `shell/navigation.ts`, `public/publicPages.ts`, `primitives/Icon.tsx`, demo `DesignSystem.tsx`);
  `allowTypeImports: true` (type-only `LucideIcon` is fine).
- **Value atoms (L11):** ban `.toLocaleString`/`.toFixed`/hand-built dates outside `lib/` + the atoms.

**Prove every guard non-vacuous in a non-obvious shape** — plant the violation as a `Record` value/map
(not just an inline literal) and confirm red. A value-invariant only works once every legal use has a
**home**: define the missing registry domain *first* (e.g. an `invitation` status domain) so the ban has
no false-positive escape. The guards must catch every *mechanical* re-expression; manual audit then
backstops only genuine *semantic* judgments (is this a semantic badge — so a §4 domain — or a plain
neutral identity badge like a role?).

**One registry, self-enforcing coverage (5f-8).** Every source-scan value-guard is a single entry in
`GUARDS` (`tests/helpers/enforcement.ts`): its detector + extensions + allowlist. Three suites maintain
themselves off that registry so the design system can't be quietly under-covered —
`tests/enforcement-coverage.test.ts`: the **discovery canary** fails if the source sweep stops reaching
any `src/**/*.{ts,tsx}` file (an independent glob must agree — proving *every* component is scanned, not
just the ones an audit remembered); the **allowlist audit** fails on a stale exemption or any drift from
the reviewed exemption snapshot (a new/broader exemption is a deliberate, reviewed edit); the **rogue
battery** runs every `GUARDS` detector over `tests/fixtures/violations/RogueComponent.tsx` and fails if any
guard doesn't bite a real file; and a **registration check** fails if any exported `detect*` is missing
from `GUARDS`. So **to add or strengthen a value-guard, register it in `GUARDS`** — the battery then forces
its violation into the rogue fixture and the audit forces its allowlist into the snapshot, and the red
tests (not memory or a checklist) keep all three layers current. Never hand-roll a parallel one-off guard
that bypasses the registry — it escapes the battery + audit. These layers are **mechanically** complete;
they cannot catch a violation *shape* no detector models (extend the rogue fixture + a self-test when you
meet one) nor a value inside an allowlisted home, which manual P0/P1 review still owns.

### 4.2 Stock Python `.gitignore` Silently Swallows `frontend/src` Dirs Named `lib`/`build`/`dist`/`var`

The root `.gitignore` is the Python template with **unanchored** `lib/`, `build/`, `dist/`, `var/`,
`parts/`, `wheels/` — they match anywhere in the tree, so `frontend/src/lib/` is ignored (file on disk,
`git add` skips it, `git status` clean, breaks only on a fresh clone). `frontend/src/lib/` is already
negated (`!frontend/src/lib/`). When a new dir under `frontend/src/` collides with one of those names, add
a `!frontend/src/<dir>/` negation. Verify: `git check-ignore -v <path>` (no output = safe).

### 4.3 Local Dev Run (don't remove the Dev-login button; `/dashboard`; uvicorn :8000)

- **Browser dev login = the Login page "Dev login" button** (the X-Session-Token path), NOT the middleware
  cookie auto-inject (unreliable through the Vite proxy). Button → `POST /auth/dev-login` →
  `sessionStorage.dev_session_token` → `api/client.ts` sends `X-Session-Token` on every request. **Do NOT
  remove the button** (removing it broke browser dev login once). It + the "DEV BYPASS ON" badge gate on
  the live backend flag (`GET /auth/config {authBypassEnabled}`, in `PUBLIC_AUTH_PATHS`) **and**
  `import.meta.env.DEV` — gating on `import.meta.env.DEV` alone is the bug (shows when the flag is off).
- **`/dashboard` is canonical**; `/` → `<Navigate to="/dashboard">`. Nav + public-error "back" target it.
- **uvicorn runs on :8000** (Vite proxy `VITE_API_TARGET` default), not :8080.
