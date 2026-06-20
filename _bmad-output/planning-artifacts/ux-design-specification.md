---
title: Financial Tracker — UX Design Specification
version: 4.0
status: final
created: 2026-06-11
authority: >
  The visual + interaction contract. Built BACKWARDS from signed-off visuals — every
  token, motion, and state here was reviewed and approved before being written. Greenfield-
  buildable: an agent must be able to reproduce the UI from this doc + architecture.md §3
  (entity model) without the existing codebase. Schema-backed fields cross-reference architecture.md §3.
---

# Financial Tracker — UX Design Specification

> **Stand-alone, build-ready spec.** Built bottom-up from owner-approved visuals — nothing entered
> this doc unseen. Read top-to-bottom:
> 0. Foundation — tokens, theming (incl. immersive tint), motion, gestures, feedback
> 1. Page scaffold & EntityPage · 2. EntityCard · 3. Public/Error · 4. Login/auth
> 5. Settings · 6. Categories · 7. Component index · 8. Shared composites · 9. Visualization Viewer
> 10. Currencies · 11. Formula · 12. Transactions · 13. Recurring · 14. Budgets · 15. Transfers
> 16. Debt · 17. Dashboard · 18. States & flows
>
> **Rendered companion — the visual source of truth:** every section here is rendered, live and
> theme-switchable, in the **Design Bible** at `design-bible/index.html` (open in a browser; each
> prototype is annotated with its UX §). This spec is the *words*; the bible is the *pixels*.
> **For any frontend work, build against the bible and diff your result against it** — when a build
> diverges from the rendered prototype, the prototype wins (or the spec + bible are updated together
> first). Keep the two in sync: changing a component here means re-rendering its bible section.

---

## 0. Foundation

The locked visual + interaction language. Everything in later sections references these
tokens; no component may introduce a raw value (hex, px, ms) that isn't a token here (rule P4).

### 0.1 Colour — colour-forward identity

**Principle:** colour *fills* regions and pops; it is not a timid accent — identity is a colour
**fill**, never a thin left-edge accent bar.

- **Entity cards** carry a colour **fill**. Default is **calm** (a soft tint of the colour);
  any instance can be flipped to **vivid** (full saturated fill) — per-instance opt-in.
- **Small reference items** (category, payment method, currency, payee) render as **filled
  coloured chips** — the thing that "pops".
- **Contrast-aware text:** text colour is chosen by the fill's relative luminance (WCAG) —
  white on dark fills, near-black on light fills — with an enforced **contrast floor** so a
  user's brand colour can never make text unreadable. Secondary/sub text = the same contrast
  colour at reduced opacity.

**Colour-chip shape:** colour swatches / identity chips / chart legend markers are **rounded
squares** (radius `sm`); **circles are reserved for person avatars** — people round, things
squared. One consistent shape language.

**The four colour roles** (this separation is what lets theming + brand colour coexist):

| Role | What | Themed by palettes? |
|---|---|---|
| 1 · Structural | bg, surface, border, text | Yes |
| 2 · UI accent | `accent-primary` (input focus) + `accent-secondary` (picker-open, selection) | Yes |
| 3 · Viz series | the chart palette | Yes |
| 4 · Per-instance entity | a specific account/category/currency's own colour | **No** (except immersive palettes — §0.2) |

**Colour source per item type:**

| Item | Colour source |
|---|---|
| Category | its own `Category.color` |
| Account | its own `Account.colour` (brand; default = entity-type colour) |
| Currency | `Currency.colour` (default derived from ISO code); also its chart-series colour |
| Payee (person) | **avatar** (Google `picture_url`); initials on `Person.colour` as fallback |
| Payment method | **inherits the linked account's colour**; Cash / free-text → neutral chip |
| Status | semantic: completed=green, pending=amber, reconciled=blue, cancelled=red-muted |
| Inflow / outflow | semantic: inflow=green, outflow=red |

**Discipline rule (avoid rainbow rows):** not every attribute is a filled chip at once. In
each context one attribute *leads* with colour (a filled chip); the rest use **text-colour or
position**. (Tuned per screen — e.g. on the Transactions row, category leads; in the Currencies
table the code identifies by **text colour**, not a marker.)

**Colour dots are NOT an identity device.** A standalone coloured dot is reserved for **status /
presence indicators** (traffic-light convention — online / offline / away / error) and **chart-legend
keys** (rounded-square markers, per the chip-shape rule above). Entity identity always leads with a
**fill** or **text-colour**, never a dot.

**Context-action colours (non-mutating "special" actions).** Two action colours are foundation tokens
(not per-component literals), so menus / bulk bars read consistently (§8.1): **Favourite = gold**
(`--color-favourite`; immersive palettes remap it via the tint ramp) · **Open / Visualize =
`accent-secondary`**. They sit between **neutral** actions (Edit / Duplicate = text colour) and
**destructive** (Delete = `error`), so the non-mutating "specials" are visually distinct.

Schema backing (architecture.md §3): `Account.colour`, `Category.color`, `Currency.colour`,
`Person.colour`.

### 0.2 Theming

- **Base theme ships light + dark** — the readable default. Both are first-class.
- **Expressive palettes are standalone single looks** (Retro, Muted Brown, Game Boy, …) — no
  light/dark pair.
- **Per-palette `immersive` flag:** `immersive=true` → the palette overrides role-4 per-instance
  entity colours too (Game Boy → the whole app becomes its greens). `immersive=false` → palette
  reskins only roles 1–3; brand colours stay true (Retro, Brown).
- **Immersive `tint` + ramp (the mapping mechanism).** An immersive palette declares a single
  **`tint`** (anchor hue) and a **`tint_ramp`** of N ordered steps (light→dark, e.g. Game Boy's
  4 greens). When `immersive=true`, *all* user-defined entity colours (category / account /
  currency / person) and the semantic colours are **remapped through that ramp** instead of using
  their true hex:
  - **Entity colours → ramp slot by lightness (luminance-matched).** Remap each entity's own colour
    to the ramp step whose lightness is closest: `idx = round((1 − L) · (N − 1))`, where **L =
    OKLab L\*** (perceptual lightness; darker source → darker step) and `N = tint_ramp.length`. This
    preserves each entity's *relative lightness* (a light category stays light, a dark one stays
    dark) while collapsing hue to the theme. When two entities land on the same slot, a stable
    **`entity_id` hash** nudges one to an adjacent slot so they remain *different shades*
    (distinguishable in charts), deterministically across sessions. Applies to entity-identity
    colours only (category/account/currency own colour, payee `Person.colour`).
  - **Semantic colours → fixed ramp positions, not hue.** Because a monochrome tint can't carry
    red-vs-green, status/flow meaning shifts to **lightness + icon/shape**: e.g. income = lightest
    ramp step, expense = darkest; status uses the ramp's positions plus its existing iconography
    (▲▼ for in/out-flow, dot states). Contrast floor (§0.11) still enforced.
  - **Interaction / feedback tokens are themed too.** The focus **ring**, selection **halo**,
    **border**, and **selection-fill** colours (§0.9 — `accent-primary`, `accent-secondary`,
    `ring-glow-*`, selection ring/offset, error) are **role-2/UI-accent theme tokens, not literals**,
    so an immersive palette remaps them onto its `tint`/ramp like everything else (Game Boy → green
    rings, green selection halos). They must remain **distinguishable from the resting fill** —
    derive them from a *different* ramp slot (or the accent pair) so a selected/focused element
    still reads as selected within a monochrome theme. The two-colour focus language (§0.9) is
    preserved by mapping `accent-primary` and `accent-secondary` to two distinct ramp positions.
  - **`immersive=false` palettes skip the entity/semantic remap** — entity + semantic colours keep
    their true hex; roles 1–3 (UI chrome **incl. the interaction/feedback tokens**) and the
    viz-series defaults are still reskinned.
  This keeps immersive themes coherent (one hue family) without losing the ability to tell series,
  selection, and focus apart. `tint` + `tint_ramp` are required only when `immersive=true`.
- **Per-person:** theme + font are personal preferences (`Person.theme`, `Person.font`).
  A theme = a `data-theme` attribute on the root swapping the role-1–3 token set.

**Each palette must define:** structural (bg, bg-secondary, surface, surface-raised,
surface-hover, border, border-light, text, text-secondary, text-muted), `accent-primary`,
`accent-secondary`, status (success/warning/error/info), the 8-colour viz series, and the
`immersive` flag. **Immersive palettes additionally define `tint` + `tint_ramp`** (the entity/
semantic colour remap, above).

**Starter palettes (signed-off directions — exact hex tuned at build):**

| Palette | bg | surface | text | accent-1 | accent-2 | immersive |
|---|---|---|---|---|---|---|
| Base · Dark | `#09090f` | `#16162a` | `#e8e8f0` | `#6366f1` | `#06b6d4` | no |
| Base · Light | `#f7f7fb` | `#ffffff` | `#1a1a2e` | `#4f46e5` | `#0891b2` | no |
| Retro · 70s | `#f4ecd8` | `#fffaf0` | `#3a2a18` | `#d2691e` | `#2a9d8f` | no |
| Muted Brown | `#1f1a16` | `#2b241d` | `#e8ddd0` | `#b08968` | `#9c6644` | no |
| Game Boy · DMG | `#0f380f` | `#306230` | `#9bbc0f` | `#8bac0f` | `#306230` | **yes** |

> **Game Boy accents are two *separated* ramp slots** (`accent-1 = #8bac0f` light,
> `accent-2 = #306230` dark). The two-colour focus language (§0.9) needs `accent-primary` and
> `accent-secondary` to be visibly distinct even inside a 4-shade monochrome ramp, so the accents
> are pulled from clearly different luminance positions — never two adjacent near-identical greens.

Custom user palettes = post-MVP.

### 0.3 Typography

Face: **`Inter`** (text), **`JetBrains Mono`** (money, tabular nums) — **font is user-swappable**
via a theme-settings dropdown (`Person.font`; swaps `--font-sans`). Scale:

| Token | px | Use |
|---|---|---|
| 3xl | 30 | Display |
| 2xl | 24 | Heading 1 |
| xl | 20 | Heading 2 |
| lg | 18 | Heading 3 |
| base | 16 | reading body |
| sm | 14 | **default UI body** |
| xs | 12 | caption / meta |
| 2xs | 11 | label |
| 3xs | 10 | micro label |

Weights: 400 / 500 / 600 / 700. **Monetary font is contextual:** `.monetary-value`
(JetBrains Mono, tabular nums) **only in columnar contexts** — ledgers, tables, any list where
figures stack and must align. **Standalone hero figures on cards** use the **sans** face at the
same weight (no alignment need there; it reads warmer).

### 0.4 Spacing & density — 8px-based

`2xs 4 · xs 8 · sm 12 · md 16 · lg 24 · xl 32 · 2xl 48`.

**Density system:** two densities — **comfortable** (default) and **compact** (tightens row
heights + vertical padding for data-dense power use). Components reference density-aware spacing
tokens (e.g. row height, card padding); **every component must support both**. Per-person
preference (Settings → Personal → App). Also there: a **reduce-motion** override (§0.7).

### 0.5 Radius

`sm 4 · md 8 · lg 12 · xl 16 · 2xl 24 · full`. **Card default = `lg` (12px).** Single-sided
borders never get rounded corners.

### 0.6 Elevation

In a dark theme, elevation = a **progressively lighter surface** *plus* a shadow (shadow alone
muddies on dark). In a light theme, elevation = white surface + a stronger shadow. Levels:
`sm` (resting card edge) · `md` (card / raised) · `lg` (dropdown / popover) · `xl` (modal).
The surface-step values live in each palette (§0.2). Prefer borders + fills for separation;
use shadow sparingly.

### 0.7 Motion vocabulary

Every motion maps to a duration + easing token and has a `prefers-reduced-motion` fallback
(accessibility, §0.11). Defaults plus the owner's signature motions:

| Motion | Trigger | Spec | Reduced-motion |
|---|---|---|---|
| Hover-lift | hover card/row | translateY −2px + soft shadow · 130ms ease-out | none |
| Press-scale | press any tappable | scale 0.97 · 80ms | kept (subtle) |
| Flip ↔ | tap account card | rotateY to detail + expand; **toggles open AND close** · 800ms ease-in-out | cross-fade |
| Error bounce | failed validate/action | horizontal shake · 500ms spring | red flash, no move |
| Merge slide | category merge/dedup | sub-item **collapses into a line that points at the target (horizontal or vertical by the merge direction), slides toward it, then fades — the scale → move → fade phases run sequentially (organic), not at once** · 420ms ease-out | cross-fade |
| Delete | hard delete | **scale down + drift to bottom-right + fade; NO rotate** · 500ms ease-in | fade only |
| Archive | archive | **desaturate only** (no collapse) · 550ms | instant grey |
| Number roll-up | balances load/change | count to value, tabular · 650ms ease-out | set instantly |
| Viz idle float | **pie charts only** | subtle idle bob **~4.0s** (calm) — the only chart that floats at idle | static |
| Viz rebuild | **any** chart re-rendered (filter/update/open) | **CRT saturation pop** — a quick over-bright/over-saturated flash that settles; signals "updated". Applies to the **series / data-ink layer only** (saturate 1→1.7→1 + brightness 1→1.32→1, ~280ms ease-out); the panel background, gridlines, and axes stay static. No opacity change, no flicker | instant |
| Pie drill-down | click a pie slice | **cross-zoom + breadcrumb** — the donut cross-fades/zooms into a sub-donut of that slice's subcategories (sub-slice colours are tints of the parent colour); a persistent breadcrumb (`All ▸ {category}`) shows state. Sub-slice click → its transactions; breadcrumb / centre / empty space → zoom back. (Supersedes the earlier "slice explodes outward" idea, which mis-read as broken.) | cross-fade |
| Modal / drawer | open/close | modal scale 0.96→1 + fade 200ms · drawer slide-from-edge 250ms | fade |
| Expand / collapse | tree, accordion | height + opacity · 200ms | instant |
| Pin-pop / check-draw | favourite / save | scale-pop + star · checkmark draw 300ms | instant |
| Drag-follow | reorder / pin drag | lift (scale 1.03 + shadow) → follows pointer → spring-settle on drop | no lift, instant move |
| Skeleton shimmer | loading | 1.5s linear loop | static |
| Toast in / out | toast pushed / dismissed | **slide in from the right + fade** while the row height grows `0fr→1fr` so the new toast (newest at the **bottom** of the bottom-right stack) **bumps the older ones up**; dismiss reverses every property · 200ms spring | snap in/out, no slide |

### 0.8 Gestures (the interaction library)

- **Star = favourite** (favourites sort first); **drag = reorder** cards on the grid
  (drag-follow motion).
- **Hover-reveal** — drag handles / row affordances appear on hover (desktop).
- **Tap = flip-open** a card to its detail.
- **Mobile / tablet swipe** — **swipe-left → archive**, **swipe-right → edit**;
  **long-press → multi-select / context menu**. Touch targets ≥ 44px.

Storage (architecture.md §3): a **per-person favourite + manual sort-order** per entity
(distinct from FR-DB-003 dashboard pinning).

### 0.9 Feedback / interaction states

**Two-colour focus language — but both hues are theme tokens** (§0.2), so they reskin per
palette (never hardcoded indigo/cyan):

| State | Treatment |
|---|---|
| Text input · focus | `accent-primary` border + ring |
| Text input · error | `error` border + ring |
| Picker / dropdown · open | `accent-secondary` border + ring |
| Card / row · selected | **offset ring (`accent-secondary`) + corner check badge + lift** (+ tint on calm cards). Reads on *any* fill — tint alone is insufficient on vivid cards. |
| Disabled | opacity 0.5 |
| Hover | see interaction principle below |

**Ring coherence (resolved in the design bible).** Input focus and card/row selection use the
**same ring recipe** (a soft `box-shadow` ring of equal weight) so they read as one system; they
differ only by **role-colour** — input focus = **`accent-primary`**, selection/picker-open =
**`accent-secondary`** — and selection additionally carries a **surface-gap offset** (an offset
ring) plus the corner check, so it survives on vivid card fills. They are *meant* to look related
but not identical; don't render one as a hard outline and the other as a blurry glow.

**Interaction-emphasis principle** (the resolved rule):
- **Solid / accent fills** (primary button, active toggle): hover = **darker / more saturated**;
  active = darker + press.
- **Neutral surfaces** (cards, rows, ghost/secondary buttons): **dark theme → hover *lightens***
  (surface → lighter surface); **light theme → hover darkens slightly**. (Move *away* from the bg.)
- **Bordered / ghost**: hover = border lightens + faint fill tint.
- **All tappables**: press = **scale 0.97** (universal tactile cue).

The visualization filter selectors (time range, person, category, account, currency mode,
chart type, metric, group-by) reuse these open/selected states; their layout is specified with
the viewer (§later).

### 0.10 Layering, breakpoints, iconography

- **Z-index scale:** below −1 · base 0 · raised 10 · dropdown 100 · sticky 200 · sidebar 300 ·
  modal 400 · toast 500 · tooltip 600.
- **Breakpoints:** xs 480 · sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1536. Core flows usable at
  desktop ≥1280, tablet ≥768, mobile ≥375 (FR-SYS-009).
- **Responsive default (modules without a bespoke spec).** Only **Transactions (§12.6)** — and the
  Transfers / Debt-drill / Budget-drill ledgers that explicitly follow §12.6 — carry a hand-tuned
  collapse. **Every other module inherits the standard reflow, which needs no per-module spec:**
  EntityPage **card grids** reflow via `auto-fit minmax` (§1.3), multi-column → single column; the
  **CategoryTree** stays a single-column strip with its indentation preserved; **pickers / modals**
  become bottom sheets below `md` (the §9 Custom-range picker is the precedent). A module only needs
  its own responsive spec if it diverges from these defaults — and any such divergence is post-MVP.
- **Icons:** all icons go through a single **`Icon` wrapper component** so the underlying
  library is a one-line swap (commercial / licensing flexibility). Current library:
  **`lucide-react`** (ISC, commercial-safe), outline, 16–20px inline. *(Phase-3 mockups used
  Tabler — the rendering tool's set — for illustration only; the app uses lucide.)*
- **Scrollbars:** every in-app scroll region uses a **thin themed scrollbar** (never the OS
  default): `width: 8px`, thumb = `surface-active` (hover → `border-strong`), **transparent
  track**, `radius-full`; Firefox fallback via `scrollbar-width: thin` + `scrollbar-color`.
  **Light themes use a darker structural thumb (`border-strong`)** — `surface-active` is too pale to see.
  Overlay / picker panels inherit the same treatment.
- **Reserve the scrollbar gutter** on every app scroll region (`scrollbar-gutter: stable`, e.g. the
  AppShell `<main>`). Without it, a scrollbar appearing/disappearing as content grows past the
  viewport narrows the content box, and any centred (`mx-auto`) column re-centres by ~half the
  scrollbar width — a visible horizontal jump when switching tabs/views (e.g. Settings tabs). A
  reserved gutter keeps content width constant, so tabbed/header/row surfaces don't shift.

### 0.11 Accessibility (WCAG 2.1 AA)

**Contrast floor** enforced on all text (incl. contrast-aware fills). Mechanism: compute the
**effective background** (composite the fill over its surface — calm tint = entity colour at low
alpha; vivid = the colour itself), pick **white vs dark** text by whichever has the higher WCAG
contrast ratio against it, and require **≥ 4.5:1** (≥ 3:1 for ≥18px / bold). If the better text
pole still fails the floor, the **fill is auto-adjusted** — mixed away from mid-luminance (toward
dark/white) in steps until the chosen text passes. Implemented via CSS `color-mix()` for static
composites + a memoized JS `contrastText()` / `enforceFloor()` helper for runtime entity hex.
Full keyboard nav (Tab / Enter / Esc / arrows). ARIA labels on interactive elements. ≥44×44px
touch targets. `prefers-reduced-motion` honoured — every §0.7 motion degrades to its fallback.

---

## 1. Page Scaffold & EntityPage

The shared frame for every entity module (Accounts, Capital, Assets, Insurance, Categories,
Currencies, Formula, Budgets, and the list-lean Transactions/Recurring/Transfers).

### 1.1 AppShell — Branding · Sidebar · Topbar

**Branding (swappable config).** App name, logo/mark, wordmark, favicon — **and the default theme
(base palette/colours) + default font** — come from a single `branding` config at
`frontend/src/config/branding.ts` (`{ appName, wordmark, mark?, favicon?, defaultTheme, defaultFont }`)
— **never hardcoded** — so the whole identity *and* look changes in one place (commercial /
white-label path). MVP: name "Financial Tracker" + wordmark *through* the config; `mark` and
`favicon` are **optional and undefined in MVP** — when `mark` is unset the palette-reactive
gradient placeholder (`BrandMark`) renders, and no `<link rel="icon">` is injected until `favicon`
is set. Both are present in the config shape as the white-label provision (a one-value swap).
Per-tenant white-label (and a server-driven config) is post-MVP.

**Sidebar** (left):
- **Branded header** — logo mark + app name (from `branding`).
- **Grouped nav** (13 modules + Settings — too many to list flat, so sectioned with muted group labels):
  OVERVIEW → Dashboard · ACCOUNTS → Accounts, Capital, Assets, Insurance · ACTIVITY →
  Transactions, Recurring, Transfers · INSIGHTS → Budgets, Debt · SETUP → Categories,
  Currencies, Formula.
- **Active item:** `accent-subtle` fill + `accent-primary` text.
- **Bottom:** Settings link only (no identity row — identity lives in the topbar avatar).
- **Responsive:**
  - **Icon rail** (user-collapsible; **auto-collapses below `lg`**): ~62px — labels become
    **hover tooltips** (the Tooltip primitive, §7; pattern in CLAUDE.md §5.8), group labels collapse to thin dividers, the active item keeps the
    `accent-subtle` fill + `accent-primary` treatment, the branded header shows the **mark only**,
    an **expand toggle** sits at the top, Settings stays pinned at the bottom. The expanded ↔ rail
    choice persists per person.
  - **Mobile (< `md`) — slide-up bottom sheet** (not a side drawer): a bottom **Menu** bar; tapping
    it (or swiping up) raises a sheet with the **full grouped nav** (group labels intact) that you
    scroll vertically and **drag down / tap to dismiss**. Closes on selection.

**Topbar** (persistent across authenticated screens):
- **Left — view context (grouped):** a **Household / Individual** segmented control **+ a
  display-currency picker**, together (both scope *what you're looking at*). In **Individual**
  mode a **member picker** chooses whose finances to view — **a Member may select only
  themselves; an Admin/Owner may select ANY household member** (the dropdown shows only the
  permitted entries). Persists via `Person.default_view` (FR-P-006); the chosen member sets the
  `person_ids = [member.id]` filter (FR-V-009).
- **Right cluster:** **global search / command palette** (Cmd/Ctrl-K or click — searches across
  entities and offers navigation + "+ New" commands; grouped, household-scoped, respects the
  active member filter; FR-SYS-010, backed by `GET /api/search`) · **alerts bell** (unread badge;
  opens the alert panel) · **avatar menu** (the sole user menu — profile, theme + font pickers,
  sign out).

**Toast stack** (§0.7, §7) — fixed **bottom-right** (`z-toast`, above modals), deliberately **off the
top-right cluster** (search · alerts bell · avatar menu) and a centered command palette, so a transient
toast never obscures an open menu/panel. Newest at the bottom (bumps older ones up); ~4s auto-dismiss.
Persistent notices use the Alerts panel / AlertBanner, never a lingering toast.

**Alerts panel** (FR-SYS-007) — dropdown from the bell:
- Header: "Alerts" + "Mark all read".
- **Rows:** type icon in a semantic-tinted chip · title · one-line body · relative time · an
  **unread dot** (+ subtle row tint for unread); **hover reveals dismiss**. Each row **links to
  the relevant entity/module**.
- Alert types: BUDGET_WARNING/EXCEEDED · RECURRING_MISSED · FX_RATE_STALE · UPCOMING_PAYMENTS ·
  FX_API_DOWN · BACKUP_CREATED. Read state via `read_at` / `dismissed_at` (architecture §3.9).
- Footer: **"View all alerts"** → the dedicated **`/alerts` page** (reachable only from the bell,
  *not* a sidebar module): reuses these same alert rows with a **type filter** + an **unread/all**
  SegmentedControl + **Mark all read**, **date-grouped** (Today / Earlier), showing full history.
  Read rows desaturate; row **⋮** → mark read / dismiss.

### 1.2 EntityPage toolbar (standardized — do not bespoke per module)

One header region, in order:
- **Left:** module **name** (H3) + **info text** (live summary, e.g. "5 accounts · S$ 22,370 net").
- **Right cluster:** **search**, **sort** control, **grid/list** view toggle (segmented),
  **show-archived** toggle, **entity-specific filters**, then the primary **+ New {entity}** button.
- **Entity-specific filters slot in here.** Accounts → a **bank / credit-card** type filter.
- **Responsive:** below `md`, the right cluster collapses into a single **Filters** popover +
  the New button (breakpoints, §0.10).

### 1.3 Content area

- **Grid (default) or list** (view toggle). Responsive card grid: `auto-fit, minmax(~160px,1fr)`.
- The grid ends with a clickable **"+ New" ghost tile** — a *second* entry point equal to the
  toolbar button (two ways = intended).
- **Empty state** (zero entities): centered icon + prompt + New action.

---

## 2. EntityCard

The most-reused composite. Extracted from the signed-off Accounts anchor; every entity module
renders its instances through it.

### 2.1 Anatomy

- **Colour fill** — `calm` default (a soft tint of the instance colour) or `vivid` (full
  saturated fill, per-instance opt-in). Colour = the instance's own `colour` (default =
  entity-type colour, §0.1). Contrast-aware text on vivid fills.
- **Header row:** colour **icon chip** · **name** (flex) · **favourite star** · **⋮** context menu.
- **Hero figure:** the primary value (balance / current value), **sans face** (§0.3), large.
- **Value-history sparkline** (FR-A-015) — from `account_snapshots`. The mini-chart is
  **clickable** (with a hover "expand" affordance) and opens the **Visualization viewer**
  (§9, FR-V-012).
- **Footer meta:** `type · currency` and, on **multi-owner** accounts, stacked **owner avatars**
  (PersonRef — Google picture, else initials on `Person.colour`).

### 2.2 Variants

| Variant | Difference |
|---|---|
| bank / capital / asset / insurance | entity icon + default entity colour; hero = balance/value + sparkline |
| **credit card** | leads with **Debt owing** (semantic red), shows due date + limit; debt-trend may replace the balance sparkline |
| archived | desaturated, **dashed** border, `Archived` badge, **`opacity-60`** (the named token — same value used by CategoryTree archived rows, CLAUDE.md §5.11) |

### 2.3 States

| State | Treatment |
|---|---|
| default | calm fill, ⋮ visible, star = **outline gold** (the `--color-favourite` token — outline, not muted) |
| hover | lift −2px + shadow; star scale-pops (hover-lift + pin-pop motion, §0.7) |
| favourited | **solid (filled) gold star**, same `--color-favourite` colour, **contrast-aware** (amber/gold default; alternative hue when the card fill is amber/yellow). The favourited vs un-favourited distinction is **fill** (solid vs outline), not colour. Favourites **sort first**. |
| selected | offset ring (`accent-secondary`) + corner check badge + lift (§0.9) — where multi-select applies |
| vivid | full-colour fill, contrast-aware text |

### 2.4 Interactions (gestures, §0.8)

`tap` = **flip-expand directly into the EntityModal** (§8.2 / §0.7) — the flip animation *is* the
modal opening; there is **no separate intermediate "card detail" state** · `star` = favourite
(sorts first) · `drag` = reorder on grid ·
`⋮` = context menu (Edit · Duplicate · Archive · Delete-if-empty) · mobile `swipe-left` =
archive / `swipe-right` = edit · `long-press` = multi-select.

Schema backing: `Account.colour`, per-person favourite + sort-order (architecture.md §3).

### 2.5 Reference screen

The **Accounts** screen is the locked reference composition of §1 + §2 (signed off in the
Phase-3 session). Other entity screens inherit this scaffold; only their entity-specific
filters and card variant differ.

---

## 3. Public & Error Pages

**Shared `PublicPage` shell:** centered column — *(reserved, post-MVP)* faint large background
**watermark logo** in an elevated surface tone · semantic **icon** (via the `Icon` wrapper) in a
tinted circle · **title** (H3) · **subtitle** (calm, plain copy — no jokes) · primary action
(+ optional secondary). Rendered in the base theme (often pre-auth). The full-page **loader is a
branded spinner**; in-app loading uses skeletons (§0.7).

**Backend signal → page** (architecture §5.8). Icon colours are semantic (§0.1).

| Page | Icon | Colour | Shown when | Action |
|---|---|---|---|---|
| Loading | loader (spin) | accent-primary | request in flight | — (branded spinner) |
| Not Invited | mail-off | warning | OAuth `?error=not_invited` | Sign in with another account |
| Access Denied | lock | error | 403 | Back to dashboard |
| Not Found | map-search | neutral | 404 | Back to dashboard |
| Refused Connection | plug-x | error | fetch fails (backend down) | Retry |
| Lost Connection | wifi-off | warning | 401 after being authenticated | Reconnect |
| Generic Error | alert-triangle | error | uncaught 500 (7807) | Try again |
| Logout | logout | neutral | after sign-out | Sign in |
| Maintenance | tool | info | maintenance mode | (passive — retry later) |
| Household Deleted | home-x | error | re-login after owner deleted the household — `?error=household_deleted` (ARCH §5.8 / §2.8a Path A) | Sign out / await new household |
| Removed from Household | user-x | warning | re-login after removal by owner/admin — `?error=removed` (ARCH §5.8 / §2.8a Path C) | Sign out / await re-invite |
| Account Suspended | ban | warning | re-login while **archived** (membership intact — `household_id` kept, not a detachment) — `?error=account_archived` (ARCH §5.8 / FR-P-007, Story 2.8) | Sign out / await an admin Restore |

Copy is **calm and plain** throughout. Rate-limited (429) surfaces as a toast, not a full page.

**Adjacent auth *modals*** (not full pages — interactive choices, specified with Login in §4):
**Pending Invitation** and **Household Conflict**.

---

## 4. Login & Auth Modals

### 4.1 Login page

A `PublicPage`-shell variant (no semantic-error icon — it's the entry point):
- Branding **wordmark + mark** (from the `branding` config). **No tagline.**
- **Continue with Google** button (primary path; OAuth, §architecture 1.2).
- **Error banner** (calm, red) on `?error=oauth_error` — "Sign-in failed — please try again."
- **Dev login** button + a **DEV BYPASS ON** badge — rendered **only** when the backend reports
  `AUTH_BYPASS_ENABLED` (FR-SYS-002), read from the public `GET /auth/config`; calls
  `POST /auth/dev-login`. (Gating on the live backend flag — not the build's `import.meta.env.DEV` —
  keeps the badge from claiming "on" when the flag is off.)
- `?error=not_invited` routes to the **Not Invited** page (§3), not Login.

### 4.1a JoinHousehold page (`/join/:token`)

The invite landing (architecture §6.5/§6.6) — a `PublicPage`-shell that validates the token, then
routes via existing surfaces (no novel screens):
- **Logged out + valid token:** branding wordmark/mark (from `branding`), an **invite-context
  card** — inviter **Avatar** · "invited you to join" · **household name** · role **Badge** — and
  the same **Continue with Google** button as Login (§4.1). After OAuth the token is consumed and
  the accept dialogs take over.
- **Logged in + valid token:** a brief handoff — renders the **PendingInvitationDialog** (no
  household) or the **HouseholdConflictDialog** (already in one → §4.4 flow).
- **Invalid / expired / revoked / already-used token:** a **§3 semantic error page** (calm icon +
  plain copy + "Go to login"). A token is actionable only while `status=pending`; "already-used" =
  an `accepted`/`declined` invitation — there is no separate enum state for it (ARCH §3.4).

### 4.2 Dialog convention (global)

**All dialogs:** primary action **right**, ghost/cancel action **left**. Locked everywhere.

### 4.3 Pending Invitation modal (FR-HH-003 / FR-P-002)

- Icon (`user-plus`, accent) · title "You've been invited" · body naming the **inviter**,
  **household**, and **role** · actions **Decline** / **Accept**.
- Accept → joins as member, invitation `accepted`. Decline → invitation `declined`; if the
  person has no household, they land on the **Not Invited** page (§3).
- Renders at the app root over the current view; a NULL-household session shows it immediately
  on login (architecture §2.6 step 2).

### 4.4 Household Conflict modal (FR-HH-003)

Shown when an invitee already belongs to a household. **There is NO Accept button** — its only two
actions are **Decline** / **Go to Settings** (you can't accept in place because you must first
leave/delete your current household; the copy must never imply an "Accept" action that isn't there).
- **Member/admin:** "You're already in {current}. To join {target} you must leave your current
  household first — Go to Settings (your data is archived, restored if you return). Or decline."
- **Owner:** "You own {current}. To join another you must delete your current household first —
  owners can't simply leave. Or decline."

**Decline always declines — non-negotiable.** In *both* variants, **Decline** sets the invitation
to `declined` **immediately and permanently** and closes the modal. An invitee can **never** be
forced to keep an offer open (no "stays pending until you act"); this prevents an owner from
trolling another owner with an un-dismissable invite. Decline is always available and always
terminal.

**"Go to Settings" is the only path that leaves the invitation `pending`** — because the user
chose to *act on* the conflict rather than reject it, so they can return after resolving it.
**Member/admin:** Settings → Danger Zone → **Leave Household** (ConfirmationDialog). **Owner:**
Settings → Danger Zone → **Delete Household** (type-the-name confirm; logs out, FR-HH-005) →
re-login. Once the person no longer belongs to a household their next session is a
**NULL-household session** and the **`PendingInvitationDialog` auto-appears** (architecture §2.6 /
§6.7) — Accept joins the target household; **Decline there is likewise terminal** → the **Not
Invited** page (§3).

### 4.5 New Household modal (FR-HH-001 — first-login owner setup)

Shown **once**, automatically, when `/auth/me` returns `isFirstLogin: true` (owner + household
`created_at` within the last 2 min, architecture §2.14.C) — i.e. immediately after an approved owner's
first login, over the app shell. It lets the owner replace the **defaults** the server seeded (the
callback runs server-side and cannot prompt, so `_create_and_seed_household` seeds the
`"<display name>'s Household"` name and `Asia/Singapore` timezone, architecture §2.6).

- Icon (`home-plus`, accent) · title "Set up your household" · body "We've created your household with
  sensible defaults — adjust them now or change later in Settings."
- Fields: **household name** · **timezone**.
- Actions (§4.2 convention): **Skip** (left, ghost — keeps the seeded defaults) / **Save** (right,
  primary).
- **Save** persists via `PATCH /api/household` (architecture §2.8 owner-scoped) — name/timezone only.
- **Dismissible:** Skip / close keeps the seeded defaults (the household already functions). The modal
  does not reappear (it is `isFirstLogin`-gated, which is false on the next login).
- **Base currency is not set here.** It is configured in **Epic 3** (Currencies page / Settings →
  Management, FR-CU-003/FR-CU-005, Story 3.9): a brand-new household has zero transactions, so the base
  currency changes with **no recompute** any time before the first transaction. **Date format is not a
  field** — the UI uses a fixed `DD-MM-YYYY` (FR-V-010), not a per-household/per-person setting.

---

## 5. Settings

Tabbed (SegmentedControl): **Profile · Management · Data**. Split by ownership — *you* vs *the
household* — so there's no Personal/Household column ambiguity.

### 5.1 Profile tab (you — any member edits own)

Single column of personal preferences:
- **Identity:** display name · display currency (the default; also in the topbar).
- **Appearance:** theme picker (swatch dropdown) · font dropdown (`Person.font`).
- **Notifications:** checkboxes per alert type (`Person.notification_prefs`) — budget
  warnings/overruns, missed recurring, upcoming payments, FX stale, backups.
- **App:** density toggle (comfortable/compact, §0.4) · reduce-motion toggle (§0.7) · **date format**
  (per-person `Person.display_format`: `DD-MM-YYYY` · `MM-DD-YYYY` · `YYYY-MM-DD`; default `DD-MM-YYYY` —
  FR-P-009/FR-V-010). This is the **only** date-format control in the app; it is per-person, not a
  household setting (§5.2 has none).

### 5.2 Management tab (the household)

- **Household config** (owner-editable; **read-only + lock for others**): name · timezone ·
  **base currency** + recompute warning (FR-CU-005, Epic 3). *(Date format is not configurable — the UI
  uses a fixed `DD-MM-YYYY`, FR-V-010.)*
- **Members:** avatar · name+email · role chip · status (an **archived** member stays listed, shown
  with the desaturated `Archived` treatment, §2.3 — `PersonRef` reads "(archived)"). **⋮:**
  Promote/Demote (role change owner-only; owner not demotable), **Archive/Restore**, **Remove**, and
  **Delete** (FR-P-005/007/008). The three are distinct: **Archive/Restore** is the in-household
  lifecycle archive of the Person record (membership intact — the archived member can no longer log
  in: a re-login hits the **Account Suspended** page, §3, until an admin Restores them; admin/owner
  only); **Remove** detaches the member (`household_id=NULL`), **archives all their data**, and
  **invalidates their sessions** → they hit the "Removed from Household" page (§3) and are re-invitable
  with data restored (admin/owner only; ARCH §2.8a Path C); **Delete** (owner-only) **hard-deletes an
  empty Person** (zero references) and is **disabled with a reason** ("Has data — archive instead")
  when the row reports **`canDelete=false`** — the members list carries a per-row `canDelete` emptiness
  signal, mirroring the §8.1 "Delete-if-empty" rule (a referenced Person can only be Archived, not
  deleted; ARCH §3.0a tenet 5 / §4). The owner is **not removable, archivable, or deletable**.
- **Invitations:** **+ Invite** → modal (Google email). Rows: email · status
  (pending/accepted/declined/expired/revoked) · expiry. Actions: Copy join link (`/join/<id>`),
  Resend, Revoke (pending) / Delete (terminal) (FR-HH-003/004).
- **Integrations** (owner-editable; read-only for others):
  - **FX rate providers** — an **ordered list** (priority = fallback chain, §arch 5.7). Each row:
    provider name · type (e.g. Open Exchange Rates) · **enabled** toggle · status chip
    (ok / stale / down) · ⋮ (reorder, edit, remove). **+ Add provider** → modal: type · base URL ·
    **API key** (write-only — masked `••••`, stored in Secret Manager, never echoed back, §arch 5.7).
    The first enabled provider is primary; on failure the fetcher falls through to the next.
  - **Bank connections** — section present but **greyed-out / "Coming soon"** (post-MVP): a
    **dashed-border, dimmed** card with a "Coming soon" badge and a **disabled** Connect control —
    no functional controls, just the placeholder so the surface exists.
- **Danger Zone** (role-conditional): admin/member → **Leave Household** (confirm); owner →
  **Delete Household** (type the exact household name; removes all data, invalidates every
  member session, logs the owner out — FR-HH-005). **Post-deletion landing:** the owner is sent to
  `/login`, and on next sign-in `seed_household_if_needed` gives them a **fresh empty household**
  (ARCH §2.6); other members — now `household_id = NULL` with `detachment_reason='household_deleted'`
  — hit the **"Household Deleted"** page (§3) on re-login until re-invited (ARCH §2.8a Path A). No
  transitional in-app "deleted" state: the invalidated session simply fails the next request
  (→ Lost Connection), and re-login routes them by `detachment_reason` (ARCH §5.8).

### 5.3 Data tab

Organised into **two sections**: **Import / Export** and **Backup** (not inline with each other).
The import **Preview &amp; map** step renders through the **Table** primitive (§7), like every other
tabular list in the app — not a bespoke layout.

**Import / Export**

- **CSV Import** — a 2-step wizard (FR-IE-001..005):
  1. **Upload** — drag/drop or pick a `.csv` (≤10 MB; `text/csv`, UTF-8); accepts the documented
     import column layout (FR-IE-005): **Name · Transaction Date · Currency Type · Amount ·
     Amount (SGD) · Payee · Payment Method · Transaction Type · Category · Status**, plus
     **Description** (→ `notes`), **GST Claim** (→ `is_gst_claimable`), **Personal** (Yes ⇒
     `is_shared_expense = false`; default is shared), and optional **Tags** (comma-separated →
     matched or created as tags; a legacy **Gift** column maps to the Gift tag). Header
     row matched case-insensitively; **Amount (SGD)** is optional (recomputed via FX if blank);
     **Payment Method** maps to the "Paid with" account / Cash (§12.3); **Category** matched by
     name (`Parent > Child` ⇒ subcategory).
  2. **Preview & map** — table of parsed rows; each row's category auto-suggested
     (**green** = matched, **yellow** = needs a pick). **Unmatched categories must be mapped to an
     existing category (or explicitly created) before Confirm — never silently auto-created.** The
     yellow cell is a **Dropdown of existing categories with a "+ Create new category…" item** at
     the foot; choosing it opens an **inline mini-create** (name · parent · type) that creates the
     category immediately so it becomes selectable for that row and any later one — an explicit,
     never-silent creation. Rows
     excludable; **duplicate detection** surfaces a **Conflicting Transactions** modal (FR-IE-004):
     each conflict shows the **incoming (file) row vs the existing (ledger) row** side by side with
     a per-conflict **SegmentedControl** — **Keep newer** (imports the incoming row and **replaces
     the existing record in place** — same id, audited) · **Keep existing** (skips the incoming
     row) · **Keep both** (imports as a separate record) — plus an **Apply to all** bulk control.
     **Unresolved conflicts default to Keep existing** (Apply is always enabled); the conflict list
     scrolls when it exceeds the panel.
  3. **Confirm** — records are created **only** here; result summary (created / skipped / merged).
     Every imported event **and** any inline-created category is written with **`actor_id` = the
     importing person** (whoever ran the wizard) and gets its **own audit row** (ARCH §4.7);
     imported events carry `source = csv_import` (ARCH §3.6).
- **CSV Export** — the current ledger with the active VisualizationFilter applied; filename
  `financial-tracker-export-{YYYY-MM-DD}.csv` (FR-IE-006).
**Backup** *(separate section)*

- **Backup** — last-backup **timestamp** + a **status chip**: **Success** (green), **In progress**
  (amber, spinner), or **Failed** (red, with a retry affordance). Manual **Back up now** is
  **admin/owner only** (FR-SYS-008).

---

## 6. Categories (CategoryTree)

Uses the §1 EntityPage scaffold — header: name + info + search + **type filter**
(All/Expense/Income) + archived toggle + **+ New category**. When there are **zero active
categories**, the body shows an **EmptyState** with a **Create defaults** action (FR-C-007) — a
one-click, idempotent create of the **13 authoritative starter categories** (ARCH §3.7: 10 expense +
2 income + 1 both; the same set auto-seeded at household creation), previewed as chips (income
tinted with the semantic income colour) alongside a secondary **New category**. Otherwise the body
= the **CategoryTree** (2 levels max).

> **CategoryTree is the one sanctioned exception to the EntityCard layer (CLAUDE.md §8.3).** It is
> a *tree*, not a card grid, so it does **not** render `EntityCard` — it uses its own flat
> flex-strip rows (CLAUDE.md §5.11). It still reuses the rest of the generic layer (EntityPage
> scaffold, EntityModal, `useEntityManager`, `useMultiSelect` + BulkActionBar). "No bespoke CRUD
> pages" still holds: the tree is a shared, specced component, not a one-off — and it is the *only*
> entity surface exempt from `EntityCard`.

- **Parent row:** calm colour-tint fill · drag handle (hover-reveal) · expand chevron (or `–`
  if childless) · colour icon chip · name · **sub-count pill** (`N subs`) · **right-aligned**
  semantic-coloured **type badge** · ⋮ menu.
- **Subcategory row:** a row **light-filled in the *parent's* colour** (a lighter tint than the
  parent row — visually ties it to its parent; **no separate colour chip**, **and no glyph — name
  only**). Reads as selectable (multi-select, merge, promote-out) · slightly **offset/indented** ·
  **no connector line** · drag handle · name · right-aligned type badge · ⋮. An **"Add subcategory"**
  affordance sits at the end of an expanded parent's children (not inline on every primary row).
- **Type badge colour (income / expense / both):** the type badge is **semantic-coloured** — **income
  = green (`success`)**, **expense = red (`error`)**, **both = blue (`info`)** — tying the tag to the
  app-wide **inflow/outflow semantics** (§0.1: inflow green, outflow red). All three are semantic
  tokens, so they remap per theme (never raw hex). The **same colour drives the type-field label** in
  the create/edit modal's Type **Dropdown** (§8.2).
- **No left accent bar.** Category identity is the **colour-tint fill** (§0.1 / §5.5) — the 4px
  left-border accent bar is **not used** anywhere (parent or sub rows); neither is a colour chip or
  a connector line. (This prohibition is mirrored in CLAUDE.md §5.11.)
- **Behaviours:** archiving a parent **archives the whole branch** (no auto-promote, FR-C-005) ·
  **drag** (pointer **or keyboard**, via `@dnd-kit` — ARCH §1.11) **re-parents / promotes**: drop a
  **subcategory** onto another parent to re-parent, or onto the **top-level drop zone** to promote;
  drop a **childless top-level** onto a parent to **nest** it. A top-level **with children** has no
  valid move (would exceed 2 levels) so it isn't draggable and carries no grip. **2 levels max** ·
  expand/collapse animates (§0.7). *(Reorder **within** a level is not yet supported — it needs
  per-person sort persistence, `entity_preferences` / FR-E-021; deferred to its own story.)*
- **Promote / Move are also in the `⋮` menu** — **"Promote to top level"** (subcategories only) and
  **"Move to…"** (one item per other top-level parent) — the explicit, discoverable path alongside
  drag (same pairing as the Dashboard widget board, §17). With `@dnd-kit`, drag itself is now
  keyboard-accessible, so the `⋮` items complement rather than substitute for it. Both routes go
  through the same move operation (FR-C-003).
- **Multi-select (FR-E-020):** each row carries a leading **Checkbox**; selecting **≥1** row reveals
  the generic **`BulkActionBar`** (§8.6) pinned to the bottom of the list region. A **selected** row
  takes the **§0.9 selection treatment — an `accent-secondary` ring** (`ring-2 ring-accent`) plus a
  neutral `surface-active` fill; the ring is the primary signal so selection reads even on a vivid
  fill (a fill alone is too quiet). The categories action set is **Edit type · Promote · Move to… · Archive/Restore ·
  Merge** (§8.6) — the whole surface is admin/owner-managed (ARCH §2.8), so there is no per-item
  permission split here.
- **Drag feedback (drop target):** while dragging, the **valid drop target** — the hovered parent
  block (re-parent/nest) or the top-level promote zone — shows the **§0.9 focus/active accent,
  `accent-primary`** as a **solid** ring (`ring-2 ring-primary` — not the translucent focus *glow*,
  which reads muddy here), the *other* accent from selection so the two read apart (selection = cyan,
  drop target = indigo). The dragged row dims; the drag overlay chip follows the pointer (§0.7
  drag-follow).

---

## 7. Component Library (reusability index)

Every UI element resolves to a library component; **every component appears on `/design-system`**
(P1 enforcement). New Phase-3 components are mostly *compositions* of existing primitives.

> **The app follows the bible** (see CLAUDE.md P5): the bible is the designer-approved visual truth, and
> every component is built to match its bible prototype. `/design-system` mirrors the bible's section order
> as the live inventory of what's built. CI guards token parity (`design-bible-parity.test.ts`).

- **Primitives:** Button · Input · Label · Checkbox · Toggle · Dropdown · SegmentedControl ·
  DatePicker · ColourPicker · EmojiIconPicker · Badge · Avatar · Card · Divider · Spinner ·
  Skeleton · ProgressBar · Tooltip · **ContextMenu** · **Modal** · Drawer · Toast · Accordion ·
  Table · TagInput *(transaction tags — assign + create + inline rename/recolour/archive/delete; §12.7)* ·
  EmptyState · AlertBanner · ConfirmationDialog · Icon (wrapper) ·
  MonetaryValueInput · RecurringDateInput.
- **Composites:** AppShell (Sidebar · Topbar) · EntityPage · **EntityCard** · **EntityModal** ·
  BulkActionBar · CategoryTree · PendingInvitationDialog · HouseholdConflictDialog.
- **New (Phase-3):** AlertPanel *(Popover + rows)* · ViewContextSwitcher *(SegmentedControl +
  Dropdowns)* · ThemePicker *(Dropdown + swatches)* · FontPicker *(Dropdown)* · CommandPalette
  *(Modal + Input + rows)* · DensityToggle · **MiniSparkline** *(new atom)* · **FilledChip**
  *(new atom)* · **FavouriteStar** *(new atom)* · Watermark/Branding *(new atom)*.

> The **ContextMenu**, **EntityModal**, **EmojiIconPicker**, **ViewContextSwitcher**,
> **CommandPalette**, and **BulkActionBar** are specced in detail in §8.

---

## 8. Shared Interaction Composites

### 8.1 ContextMenu (⋮)

The action menu on every entity row/card. Standard set: **Edit · Duplicate · Favourite/Unfavourite ·
Open · — · Archive/Restore · Delete**.
- **Adaptive per state:** Archive↔Restore by archived state; **Delete is disabled** (greyed + a
  reason, e.g. "has transactions") when dependencies exist — the hard-delete-if-empty rule made
  visible, so the user never hits a dead end.
- **Adaptive per permission:** members see only permitted actions (no Archive/Delete on others'
  entities); destructive actions sit **below a divider**.
- **Entity-specific extras** slot in (category: "Add subcategory", **"Promote to top level"** /
  **"Move to…"** *(the accessible twin of CategoryTree drag, §6)*, "Merge"; account: "Add value
  snapshot"). Promote/Move sit **above** the destructive divider (they are non-destructive moves).
- **Item colour treatment (resolved in the design bible):** Edit / Duplicate are **neutral**
  (`text` colour); **Favourite/Unfavourite** uses the **star colour** and **Open / Visualize** uses
  **`accent-secondary`** — the two non-mutating "special" actions are tinted so they read apart from
  plain edits; **destructive** items below the divider stay neutral (Archive) or **`error`**
  (Delete, greyed with a reason when disabled). No other items are coloured (avoid a rainbow menu).

### 8.2 EntityModal (create / edit)

The single create/edit surface for every entity.
- **Layout:** centered **two-column modal** by default; a **side drawer** only when a form is
  genuinely tall (e.g. Insurance). Footer: **Cancel left / primary right** (locked convention, §4.2).
- **Opens from a card via the flip-expand animation** (§0.7): tapping a card flips it and expands
  into this modal — the card's "detail" **is** the EntityModal.
- **Subtype-adaptive:** changing the type swaps in that subtype's fields (FR-A-001).
- **Controls:** name · **type** *(a **Dropdown** for an enumerated type — e.g. category
  income/expense/both, account subtype; **SegmentedControl is reserved for 2-option toggles**, §0.9.
  For category type, the Dropdown labels are **semantic-coloured** to match the §6 type badge —
  income green / expense red / both blue)* · **colour picker** (+ **vivid** per-instance toggle) ·
  **EmojiIconPicker** *(only where the entity has a custom glyph — categories;* **accounts use
  the type-default icon**, no custom glyph*)* · MonetaryValue input · DatePicker · multi-owner
  chips · notes.
- **ColourPicker panel:** two tabs — **Palette** (the curated swatch grid) and **Hex**, the Hex tab
  pairing a **native colour-input ("colour wheel" / gradient — the OS picker)** with a hex text field
  for precise entry (both write the same value; no third-party colour library). A **vivid** toggle
  sits at the foot of the panel (the per-instance calm↔vivid opt-in). The panel is a **fixed-/fit-width
  popover** (≥ trigger, §0.10) — never constrained to a narrow field column.
- **Validation:** §0.9 focus/error states; required fields; inline messages; Save disabled until valid.

### 8.2a Add value snapshot (account ⋮)

From an account's **⋮ → Add value snapshot** (§8.1). An **`EntityModal<AccountSnapshot>`**
(two-column, §8.2): **Date** (DatePicker, defaults today) · **Value** (MonetaryValueInput; currency
defaults to the account's) · **Source** (Dropdown — user options **Manual · Appraisal ·
Reconciliation** only; `formula` / `computed` / `import` are system-written). The three user
options are **functionally identical** — all write a user-entered snapshot, processed the same way;
the choice is only a **provenance label** for audit/history (typed by hand / professional valuation
/ checked against a statement; ARCH §3.5) · **Notes** (optional).
The header shows the account's latest snapshot for reference; **Cancel** left / **Save snapshot**
right (§4.2). Writes an `account_snapshots` row (architecture §3.6).

### 8.3 EmojiIconPicker

The glyph picker for entities that carry a **custom glyph — categories only** (accounts use the
type-default icon, no custom glyph, §8.2). Opens as a **Popover** from the icon field inside the
EntityModal.
- **Trigger:** the icon field shows the current glyph (or a placeholder); clicking it opens the
  panel with the trigger in the open/accent state (picker-trigger pattern, §0.9).
- **Panel anatomy:** **two tabs — Emojis | Icons** (picker-tab pattern, §0.9) · a **search**
  field (filters the active tab by name/keyword; cyan picker-focus ring, §0.9) · an **8-column
  grid** of glyph cells (fixed-/fit-width popover ≥ trigger, §0.10 — never constrained to a narrow
  field column). Emojis are native unicode (full-colour, theme-independent); **Icons** are the
  Lucide set and render in the **themed text colour** (`currentColor` = `text-primary` by default —
  white on dark, dark on light; contrast-aware on a vivid fill), so an icon glyph reads on any
  surface. A small **Recent** row sits above the grid once a person has picked glyphs before — the
  **last 8** picked glyphs (most-recent first; mixed emojis + icons; **no label**, separated from the
  grid by a divider), persisted **per-person in `persons.recent_glyphs`** (a JSON column — NOT
  `entity_preferences`, which is keyed per-entity and can't hold a per-person ordered list; SCP
  2026-06-19) so they follow the person across devices. The row is hidden until the person has ever
  picked a glyph.
- **Selection:** the chosen cell is highlighted with the selection ring (§0.9); picking it sets
  the field and closes the panel. Grid cells hover with `surface-active` (small-button-in-panel
  rule). An entity may also have **no glyph** — a "clear / none" affordance falls back to the
  category's colour chip alone.
- **Keyboard & a11y:** tabs are arrow-navigable; the grid is a roving-focus listbox (arrows move,
  `↵` selects, `Esc` closes); search is focus-trapped within the panel.

### 8.4 ViewContextSwitcher (topbar — Household/Individual + member + currency)

The topbar-left view scope (FR-P-006 / FR-V-009). Three controls read as **one grouped cluster**
(they all answer "*what am I looking at*"):
- **Mode** — a **SegmentedControl** (§7 primitive): **Household** ↔ **Individual**.
- **Member picker** — a **Dropdown**, **shown only in Individual mode** (hidden in Household).
  Each option is an **Avatar + name** (avatar = Google picture, else initials on `Person.colour`,
  §0.1). **Permission-adaptive (FR-P-006):** an **Admin/Owner** sees **every household member**;
  a **Member** sees **only themselves** — the dropdown collapses to a single, non-interactive
  entry (no chevron) so the restriction is obvious, never a disabled mystery.
- **Display-currency picker** — a **Dropdown** of the household's `is_display_active` currencies,
  each a colour chip + code (§0.1). Sets the person's display currency for all converted figures.

**Behaviour:** Mode persists to `Person.default_view` (`household | personal`); on login the app
restores the last-used mode. Selecting a member sets the global `person_ids = [member.id]` filter
that every chart, list, and summary reads (FR-V-009). Switching back to Household clears it.
**A11y:** the cluster is one labelled group; the SegmentedControl and Dropdowns are
keyboard-operable with the standard focus treatment (§0.9).

### 8.5 CommandPalette (global search)

The keyboard-first global search + navigation surface (FR-SYS-010). **Summoned by `Cmd/Ctrl-K`
or the topbar search affordance** (§1.1). Built from **Modal + Input + rows** (§7).
- **Shell:** a Modal anchored **high-centre** (top third) over the standard backdrop (`bg-backdrop`),
  `surface-overlay` panel, `max-w` capped; opens with the standard modal motion (§0.7).
- **Input:** full-width, leading search icon, placeholder "Search or jump to…"; the focus ring is
  the text-input focus treatment (`ring-glow-primary`, §0.9). Typing filters live (debounced).
- **Results — grouped by type**, each group under a muted label header, in the FR-SYS-010 order:
  **Transactions · Accounts · Categories · Currencies · Budgets · Members**, then a **Commands**
  group (navigation: "Go to {module}"; creation: "+ New {entity}"). Each group is **capped**, with
  a count.
- **Row anatomy:** a leading **FilledChip** (entity type colour, §0.1) or **Avatar** (members) ·
  **label** (primary) · **sublabel** (muted — e.g. amount+date, parent category, account type) ·
  a right-aligned **↵ hint** on the active row. The active row uses the selection fill (§0.9).
- **Ranking (default, FR-SYS-010):** exact > prefix > substring/fuzzy; tie-break by `updated_at`
  desc; then fixed type weight (transactions > accounts > categories > currencies > budgets >
  members); **archived items rank last**.
- **Scope:** household-scoped; in **Individual** mode it respects the active member filter and the
  FR-P-006 member-selection permission (a Member never surfaces others' personal entities).
- **Keyboard:** `↑/↓` move the active row across groups, `↵` opens it (navigates, carrying filter
  state where relevant) or runs the command, `Esc` closes. Fully pointer-operable too.
- **States:** **empty query** → recent / suggested destinations; **loading** → 3–4 **Skeleton**
  rows (§7); **no results** → **EmptyState** with a "+ New" shortcut for the typed text where it
  makes sense.
- **A11y:** focus is trapped in the palette; the input owns the listbox via `aria-activedescendant`;
  results are an `aria-listbox`. Reachable by both keyboard and pointer (FR-SYS-010 acceptance).

### 8.6 BulkActionBar (generic multi-select)

The action bar for **`useMultiSelect`** (FR-E-020) — **one generic component**, used on the
Transactions ledger **and** the CategoryTree (§12.4, §6), extensible to any entity list.
- **Appearance:** hidden at zero selection; when **≥1 row** is selected it **slides up** as a
  sticky bar pinned to the bottom of the list region (`surface-overlay`, elevated shadow). Selecting
  rows uses each surface's selected-row treatment (ledger checkbox; CategoryTree selected-row
  fill, §6).
- **Anatomy (left→right):** **"{N} selected"** count · a **Clear** (`×`) control that deselects all ·
  the **action cluster** · destructive actions sit **after a divider** (mirrors the ContextMenu
  destructive-grouping rule, §8.1).
- **Actions are per-surface** (the editable set differs, FR-E-020):
  - **Events (ledger):** **Edit shared fields** (category · payment_method · transaction_status ·
    payee · is_shared_expense) · **Duplicate** · **Archive/Restore** · **Delete-if-empty** ·
    **Visualize** (→ Viewer, §9.1) — **Visualize is tinted `accent-secondary`** (same treatment as
    the ContextMenu "Open / Visualize", §8.1).
  - **Categories (tree):** **Edit type** (Expense/Income) · **Promote** (selected subs → top-level)
    / **Move to…** (selected subs → a chosen parent; the bulk twin of the single-row §6 move,
    FR-C-003) · **Archive/Restore** (archiving a parent archives its branch, FR-C-005) · **Merge**
    (fold selected into one). Promote/Move apply only to selected **subcategories**; a selected
    parent-with-children is greyed with a reason (can't become a sub — 2-levels max). Merge greys
    below 2 selected.
- **Parameterised actions use a chooser (EntityModal + Dropdown).** Actions that need a target —
  **Edit type** (pick Expense/Income/Both), **Move to…** (pick a top-level parent), **Merge** (pick
  the surviving target among the selection) — open an **`EntityModal` (§8.2) with a single
  `Dropdown`**; the modal's confirm **is** the single confirmation. **Archive** (no target) uses a
  plain **`ConfirmationDialog`**. Promote (no target — always to top-level) acts directly. **Merge**
  reassigns the sources' events + subcategories to the target and archives the sources (ARCH §3.7).
- **Permission-adaptive:** actions a **Member** can't take on others' items are greyed with a reason
  (per-item rule — Member acts on own only; Admin/Owner on any).
- **Safety & side-effects:** a **single confirmation** precedes destructive bulk actions; **each
  affected item writes its own audit entry**; for events, **budget actuals recompute once** after
  the batch (FR-E-020 acceptance).

---

## 9. Visualization Viewer

The single reusable viewer (FR-V-011..015) — opened from any mini-chart (card/row) via the
expand animation, or full-screen. Specced once, reused everywhere.
- **Header:** title · **chart-type** toggle (line / bar / area / pie / stacked / **table** /
  **calendar** — only types valid for the current data are enabled, FR-V-014; **table** and
  **calendar** require date-dimensioned event data) · close.
- **Control bar:** **date range** (presets **+ Custom range picker**) · **group-by**
  (day / month / quarter / year). **Contextual controls** appear only when relevant: **metric**
  (count / sum / avg) for event-group aggregation (FR-V-013); **raw/converted** toggle for
  multi-currency (FR-V-004 / FR-CU-008).
- **Chart area:** axes, gridlines, series; **drill-down** — click a point/segment to filter
  (FR-V-002), or **View as table**.
- **View as table** (chart-type): swaps the chart for a `Table` (header + control bar persist).
  It shows the **aggregated series behind the current chart — not the ledger's individual
  transactions**. Columns are **derived from the active group-by + metric**: a **dimension**
  column (the group-by — Month / Category / Account / Payee / Currency; entity dimensions render
  with their `FilledChip`/colour), a **Txns** count column, the **metric value** column
  (Sum / Count / Avg — mono, right-aligned, sortable, default sort desc), and a **Share %** column
  for proportional metrics (omitted for Avg), plus a pinned **Totals** row. A two-dimension
  (stacked) chart becomes a **matrix** — bucket rows × series columns + Total. Sortable headers
  (Table primitive); **row click drills down** like a chart segment (FR-V-002).
- **Calendar** (chart-type): a **month heatmap** — each day tinted by the active metric
  (`accent-secondary` ramp, so it reskins under immersive themes; high-intensity cells flip to
  dark text via the §0.11 contrast floor). Days backed by a `RecurringEventSource` /
  `occurrence_record` carry a **↻ marker** (so a weekly charge lights up the same weekday) — driven
  by **known recurring data only, never inferred**. Month nav + metric control in the control bar;
  **day click drills down** (FR-V-002). Enabled only for date-dimensioned event data.
- **Custom range picker** (the date-range control's "Custom" mode): a picker `Popover` themed in
  `accent-secondary` (cyan). **Desktop/tablet** — a preset rail (Last 7/30 days · This/Last month ·
  This quarter · This year · Year to date · All time · **Custom range**; selected preset uses the
  picker-panel-selected style `bg-accent-active`+`text-accent`) · Start/End date fields (active =
  cyan ring) · a **two-month** calendar. **Mobile (< md)** — a bottom sheet with **Custom mode
  only** (no preset chips), a **single** month + month nav. Selection is one **continuous tinted
  band** rounded around the whole selection (rounded at the true start/end and at each week-wrap);
  the start/end days are solid `accent-secondary` endpoints. Footer: Cancel / Apply.
- **Axis scaling (granularity):** the value axis **auto-fits to the data range** ("nice" rounded
  bounds), not forced to zero — so small variations stay legible — with a **"Start at zero"**
  toggle for honest magnitude comparison (default on for bars, off for tight trend lines). The
  time axis supports **zoom / brush-to-range** (drag-select a span to zoom in; double-click to
  reset), which also narrows the active date range. Tick density adapts to the zoom level.
- **Data-point selection + tooltip:** hovering or keyboard-focusing a series shows the nearest
  point with a **ring/halo marker** and a **vertical crosshair**, and a **tooltip** pinned to it
  giving the **value** (display-currency formatted), the date/bucket, and the series name; with
  multiple series the tooltip lists each series' value at that x. **Click pins** the tooltip (stays
  on screen) and **drills** (sets the filter to that point); click empty space to release. Markers
  and crosshair use the series' deterministic colour (§0.1); reduced-motion disables the crosshair
  glide (§0.7).
- **Visual treatment — flat (no faux 3D).** Charts are **flat**: no extruded edges, no ground
  shadows, no top-down tilt on pie/donut. The earlier "subtle depth" treatment was dropped — it
  added little and risked mis-reading values. Bars retain only a `radius-sm` (4px) **top cap**
  (same radius token family as buttons / SegmentedControl) for visual consistency; everything
  else is a clean flat fill. Heights, slice angles, and axis positions are always geometrically
  true. The only chart motion is the §0.7 set (idle float on pie, CRT pop on rebuild, drill-down).
- **Series & comparison (FR-V-005/006):** the legend lists each series with its colour, each
  **toggleable**. **"Add series to compare"** opens a picker to overlay another series — another
  currency's rate, or another person / category / account — drawn as an additional auto-coloured
  line (or grouped bars). Series colours are deterministic per identity (§0.1); limits 2–4
  persons, 2–8 categories.
- **Empty / error / stale states (every entry point).** **Zero data points** in the active range →
  the chart area shows an **EmptyState** (§1.3: "No data for this range" + a *Reset range* action),
  never blank axes. **Range wider than the available history** → render what exists and show a subtle
  "data starts {date}" caption rather than padding empty buckets. **A scoped entity since archived**
  (a dashboard widget or saved drill bound to it) → an **AlertBanner** ("{name} is archived") above
  the chart, still rendering its historical series. **Query failure** → an inline error with
  **Retry** (the §18 Error state), never a silent empty chart. Loading → a chart-shaped Skeleton
  (§5.10 / §9.2).
- Sources: `/api/visualizations/*` (read-only).

### 9.1 Entering the Viewer — every entry point

All open the **same** Viewer, seeded with the launching context's filter:
- **Card mini-chart** click / expand (account value, currency FX, budget trend) — §9.2; the
  card's ⋮ ContextMenu also carries an **Expand / Visualize** item (redundant keyboard/a11y path).
- Ledger **Visualize** action (toolbar + bulk-selection bar) → event-group aggregation (§12.8).
- **Chart drill-down** (click a point / bar / pie slice) and **View as table** (§9).
- **Dashboard widget** expand (⋮ → expand) (§17).
- **Budget history** (§14) · **Capital / account history** (FR-V-008) · **FX history** (§10).

### 9.2 MiniSparkline (card mini-chart)

A compact inline chart on cards/rows summarising an entity's recent history/usage (account value,
currency FX rate, budget burn). A new atom (§7), reused everywhere a card shows history.
- **Form:** axis-less and label-less — pure trend. **Line** for continuous series (account value,
  FX rate), **bar** for discrete/period series (budget months). Renders the **last 12 points** of
  the entity's series (fewer if fewer exist — never downsampled below the available data); the line
  carries a soft area fill beneath.
- **Colour:** the entity's **deterministic identity colour** (§0.1) — so the sparkline matches the
  card's fill/chip and stays consistent under immersive themes (the ramp remap, §0.2).
- **Latest-point emphasis:** the most recent point gets a small end-dot; an optional **delta
  caption** (▲▼ + % vs the first visible point) sits beside it, using the semantic inflow/outflow
  colours (§0.1), not the series colour.
- **Interaction:** **clickable** with a hover "expand" affordance (and a keyboard-focusable
  control) → opens the **Viewer** (§9.1) seeded with this entity's series and filter. Hover shows
  the nearest point's value/date in a lightweight tooltip; full crosshair/pinning lives in the
  Viewer, not here.
- **States:** **< 2 points** → a muted "no history yet" placeholder line (never a broken/empty
  chart); **loading** → a Skeleton bar sized to the sparkline footprint (§7). Reduced-motion
  disables the draw-on-mount animation (§0.7).

## 10. Currencies

EntityPage scaffold; **rows** (FX data is tabular): per-currency colour chip · code (mono) ·
name · **rate shown human-readably as "1 {base} = N {target}"** (the inverse of the stored
`rate_to_base`; storage + math unchanged, architecture §3.8) · **freshness** (fresh / **amber
stale at >48h**) · fee · **display-active** toggle (`is_display_active`) · **FX-history
mini-chart** → expands to the Viewer (§9, FR-CU-009) · ⋮. Base currency: rate fixed, no toggle,
not removable. **+ Add currency** → modal (any ISO 4217). Base-currency *change* lives in
Settings (owner; recompute warning).

**Add/Edit currency modal (EntityModal, §8.2).** Fields: **Code** (ISO 4217 — a type-ahead over the
runtime's currency list; **read-only when editing**, since the code is the row's identity) · **Symbol**
· **Name** · **Colour** (ColourPicker + the per-instance **vivid** toggle, §8.2) · **Display-active**
toggle (defaults on). The code list, default **Name**, and default **Symbol** come from the browser's
native `Intl` (`supportedValuesOf` / `DisplayNames` / `NumberFormat`) — there is **no maintained
currency table**; picking a code auto-fills Name + Symbol + a deterministic default colour, all
overridable. A freshly-added currency has **no rate yet** (the FX fetch is a later story) — its rate
reads as the placeholder and its freshness shows **"never"** until the daily refresh runs.

> **Scope notes (sequencing).** The **fee** value is *set* in a later story (FR-CU-007) — the column
> is read-only here. The **FX-history mini-chart** + real rate freshness arrive with FX fetching
> (FR-CU-009). The **topbar display-currency switcher** that consumes `is_display_active` is the
> **ViewContextSwitcher** (§8.4), and **per-person display currency** is its own story (FR-CU-004) —
> the Currencies page only *sets* `is_display_active`, it does not render the switcher.

## 11. Formula

EntityPage scaffold; rows: name · expression (mono) · applies-to badge · **System** (lock,
read-only) vs **Custom** (⋮ edit/delete). **Each System formula has an info tooltip** explaining
in plain language what it computes (straight-line / declining-balance depreciation, compound
interest, loan amortisation, FX delta, budget variance, net worth). **+ New formula** and edit
use the **Formula editor** — the EntityModal **side-drawer** variant (§8.2; it's a tall form):
name · applies-to · **expression** with insertable variable chips · **variables** table
(name · default · description) · a **Test row** (sample inputs → live result) · Cancel / Save.
**Validation has two severities. Errors block Save** (red `error` ring, §0.9): syntax error ·
**unknown variable** (the offending token is highlighted inline, with a fuzzy *"did you mean …?"*
suggestion) · invalid variable name · duplicate variable name. **Warnings don't block** (amber):
an unused variable · a missing default · a Test-row evaluation failure from the sample inputs
(e.g. divide-by-zero / NaN — the formula may still be valid for real inputs). Known variables
render as chips; the footer shows a live *"N error · N warning"* count and disables Save while any
error remains. Computed results are **hover-revealed** on asset/capital cards (FR-F-004).

---

## 12. Transactions (ledger)

EntityPage scaffold. **Header:** "Transactions" + info (count · out/in totals in base) · **+ New**.
**Filter bar:** search · date range · category · type (all/inflow/outflow) · a **Filters** popover
for secondary filters (account, person, status, GST, tags, reconciled).

### 12.1 Columns (desktop)
checkbox · **Date** (sortable) · **Name** (+ payment-method / description sub-line) · **Payee**
(avatar — the `payee_person_id` PersonRef, ARCH §3.2; header reads "Payee" to match the data model) ·
**Category** (filled chip — *colour leads*, anti-rainbow §0.1) · **Currency** (chip) ·
**Amount** (original, sortable, mono) · **Base SGD** (prominent, sortable, mono) · **status**
(faint dot) · ⋮.
- **Currency + Amount + Base are first-class** (the figures that matter most).
  Outflow/inflow is conveyed by amount **sign + colour** (red/green), not a separate column.
- **Status is de-emphasized** — a faint dot (green paid · amber pending · grey cancelled);
  rarely edited, full state in the detail modal.
- **Shared is the default**; only the **exception** is icon-flagged — a small icon for *personal*
  (= shared off; most expenses are shared). Any **tags** on a row render as small colour chips (the
  tag's own colour), after the Category chip — tags are free-form labels, not the category.
- Foreign rows: Base differs from Amount; `fx_delta` shows in the detail/modal.
- **Column alignment:** a **fixed-width column grid** (table-layout) so Payee / Category /
  Currency / Amount / SGD align cleanly across every row — columns never overlap.

### 12.2 Sorting — both
**Sortable column headers** (Date / Amount / SGD, asc↕desc) on desktop; collapses to a **sort
dropdown** on mobile.

### 12.3 Quick-add row
An inline row pinned at the top for fast entry of the **always-edited** fields: date (today) ·
name · payer · **payment method** · category · currency · amount (→ base auto-filled). Enter
commits; the **full modal** is still used for detail / foreign-currency / FX-formula entry
(brief "quick entry"). The quick-add row's **leading cell carries a `＋` add affordance** (and a
trailing "Add" action); this `＋` marks the **quick-add row only** — every normal ledger row shows
the **selection checkbox** in that column, not a `＋`.

> **"Payment method" is the "Paid with" account picker — not a free enum.** The control is an
> **account dropdown** plus a **Cash** option (same control as the modal's "Paid with", §12.7).
> Field mapping (ARCH §3.6): selecting an account sets **`source_account_id`** and leaves
> `payment_method = null`; selecting **Cash** sets `payment_method = "cash"` and
> `source_account_id = null`. There is no standalone "payment method" string the user types.

### 12.4 Selection & bulk
Rows are **multi-selectable** (checkboxes) → the **BulkActionBar** (Edit shared fields · Duplicate
· Archive · Delete). **Bulk multi-select is a GENERIC capability** (`useMultiSelect` +
`BulkActionBar`, FR-E-020) — **not events-only**: it also applies to the **CategoryTree** (bulk
edit / archive / **merge**) and is extensible to any future entity list. Per surface the editable
field set differs (events: category, payment_method, transaction_status, payee, is_shared_expense;
categories: type, archive/restore, merge). Permission applies per item — a Member may bulk-act
only on their own events, an Admin/Owner on any.

### 12.5 Interactions
Row click → **flip-expand into the transaction modal** (§8.2). ⋮ → ContextMenu (§8.1).
Mobile: swipe-left archive / swipe-right edit.

### 12.6 Responsive collapse
- **Desktop (≥ lg):** full table, sortable headers.
- **Tablet (md–lg):** drop lower-priority columns — payer + payment-method fold into the name
  sub-line; keep Date · Name · Category · Currency · Amount · **SGD**.
- **Mobile (< md):** one **card per transaction** — Name + Category chip on top, **Amount + Base
  SGD prominent**, date + payer small; tap to expand; sort via the dropdown; quick-add becomes a
  sticky **+** opening a compact sheet.

---

### 12.7 Transaction modal (MonetaryValue & FX)

The EntityModal (§8.2) plus the money block — the visible payoff of the FX architecture:
- **Paid with (account):** selecting an account that has an FX formula drives the auto-fill
  (FR-E-009 / FR-F-005). Cash → spot rate, no source account.
- **Amount:** currency + amount.
- **Base (SGD):** auto-filled (`amount_base_calculated`), **read-only until overridden**.
  **Source indicator = border colour + tag:** `formula` = cyan (accent), `spot` = neutral/blue,
  `manual` = amber. Breakdown line shows spot rate · fee · **fx Δ** (forex loss). Editing it →
  flips to `manual`. When `currency == base`, the FX part collapses (no source/Δ).
- **Flags (outflow only, FR-E-007 — hidden for inflow):** a single **Shared expense** toggle
  (**default ON**; off = personal) + **GST claimable**. (No separate "Personal" toggle — it is
  simply shared=off.) These two are the only typed flags — they drive behaviour (debt / GST report).
- **Tags (FR-E-022, shown for inflow too — tags aren't outflow-only):** a **TagInput** (§7) to
  attach any number of household tags or **create one inline**; the picker dropdown also lets you
  **rename / recolour / archive / delete** a tag in place (no separate management screen). "Gift" is
  now just one of the seeded tags. Persisted via `tag_ids`.
- **Duplicate detection on save (FR-E-008):** a candidate surfaces an inline warning
  (Link as duplicate / Ignore) before the record commits.

---

### 12.8 Visualize the current set (event-group aggregation)

A **Visualize** action in the ledger (toolbar, and on the bulk-selection bar) opens the **Viewer
(§9)** seeded with the **current filter / selection** as an *event set*, where you pick a
**metric** (count / sum(`amount_base`) / avg) and **group-by** (day/month/quarter/year, **or tag**)
— e.g. "Netflix, counted by month", "Groceries summed by quarter", or "spend by tag
(essential vs discretionary)" (FR-V-013, FR-E-022). The series uses the lead category's colour (or
neutral for mixed sets); a tag group-by uses each tag's own colour.

The expandable-row mechanism (parent → expand) is the **same reusable pattern** behind
CategoryTree (§6) and Recurring's occurrence history (§13).

---

## 13. Recurring Payments

EntityPage scaffold. **Header:** name + info (next due) + **+ New recurring**. **Filters:** search ·
**source** (all / explicit / account-linked) · a header **missed** indicator.
- **Rows:** expand chevron · category icon chip · name + **frequency text + next occurrence**
  sub-line · amount (mono) · **source badge** — Explicit / **Asset-/Capital-/Insurance-linked**
  (FR-A-017) · ⋮.
- **Occurrence history (expand):** a timeline of expected occurrences with status badges —
  **upcoming · processed · skipped · missed · failed** (FR-E-013; a manually-triggered run lands on
  `processed` — there is no separate `manual` status, architecture §3.6). Processed shows the
  **linked transaction — clickable → opens it in the Transactions module** (cross-module nav,
  FR-V-003); **missed is highlighted red**. Per-occurrence actions: **Skip** (FR-E-014),
  **Trigger now** (manual, FR-E-015), **Process now** (a missed one).
- **Create/edit modal:** EntityModal + the **RecurringDateInput** — free-text `frequency_text`
  ("8th of every month") that **parses and shows the next occurrence for confirmation** before
  saving (the 9 patterns, FR-E-011/012; enumerated with their `frequency_rule` shapes in ARCH §3.6).
  A free-text entry matching **none** of the 9 patterns is a **blocking** error — Save is disabled,
  nothing is stored (never a silent guess).
- Account-linked recurring are created from their account (FR-A-017) and appear here read-linked.
  Missed occurrences raise RECURRING_MISSED alerts (FR-E-016).

---

## 14. Budgets

EntityPage scaffold. **Header:** name + info (over/near counts) + **+ New budget**. **Filters:**
**period** (Monthly / Yearly) · **scope** (Household / a person) · period selector.
- **Budget cards:** category icon chip + name + period badge + ⋮ · **limit vs actual** (mono) ·
  a **progress bar coloured by health** — green (< threshold) / amber (≥ `alert_threshold_pct`,
  default 80) / red (> 100%) · status ("S$ N left" / "S$ N over") + **alert badge** · a **drill
  affordance** ("N transactions →"). Rollover budgets show a `rollover` hint.
- **Actuals are computed live**, never stored (FR-B-003).
- **Subcategory rollup (important).** A budget on a **parent** category counts spending in **all its
  child categories** too — `actual_spent` is the whole-subtree total, not just events tagged to the
  parent directly (ARCH §3.7). This is a frequent source of confusion, so it is called out explicitly
  rather than buried.
- **3-level drill-down (FR-B-006/007):** card → contributing **transactions** → **subcategory**
  breakdown.
- **Budget history:** the Viewer (§9) charts **limit vs actual across periods** (FR-B-008 / FR-V-007).
- Monthly + yearly may **coexist** for one category; scope is per-person or household-wide.
- **Multi-currency:** a budget's `limit` carries a `limit_currency` but is normalized to
  `limit_amount_base`; **actuals aggregate in base** (`amount_base`). So one budget covers spend
  across many currencies — e.g. subscriptions billed in 4 currencies all roll up via their base
  amounts. The progress bar compares **actual vs limit in base**; figures display in the viewer's
  display currency.
- Alerts: **BUDGET_WARNING** at the threshold, **BUDGET_EXCEEDED** over 100% (FR-B-004);
  auto-rollover + next-period creation by the scheduler (FR-B-005/009).

---

## 15. Transfers

EntityPage scaffold rendered as a **ledger-style table — same columns / alignment / density /
sortable headers / responsive collapse as Transactions (§12)**. **Header:** name + info +
**+ New transfer**.
- **Rows:** date · name · **source → destination** (account colour chips) · **Debt repayment**
  badge (auto-detected, FR-E-018) · amount — dual "S$ 500 → NZD 568" for cross-currency · ⋮.
- **Create/edit modal:** source account · destination account · MonetaryValue (+ dest
  currency/amount + `fx_delta` for cross-currency, FR-E-017). **`is_debt_repayment` auto-detects**
  when the destination is a CreditCard, or a person with internal debt (FR-D-004/005), with an
  **override** + confirm dialog (FR-E-019 / FR-D-006). Debt-clearing runs automatically.

## 16. Debt

A **computed summary — never entered** (FR-D-001; no debt entity). **Total owing** in the header.
Two sections:
- **Credit cards:** per card, balance = Σ outflows − Σ repayment transfers (FR-D-002); drill →
  contributing transactions (FR-D-007).
- **Household owes (internal):** per person, = Σ their `is_shared_expense` outflows − repayment
  transfers to them (FR-D-003); drill → contributing transactions.
Auto-cleared by transfers (FR-D-004/005). Also surfaced on the Dashboard debt summary and on the
CreditCard cards. **Drill-downs render the contributing transactions in the ledger-style table
(§12)** — consistent with Transactions/Transfers.

> **Drill filter (resolved).** The contributing set is exactly the derivation in ARCH §3.10 — not a
> free-form query. *Credit-card row →* events with `source_account_id = <that card>` AND
> `transaction_type = outflow` (less its `is_debt_repayment` transfers). *Household-owes-person row
> →* events with `payee_person_id = <person>` AND `is_shared_expense = true` AND a source account
> personal to them (less repayment transfers to them). Both seed the ledger Viewer/table via a
> `VisualizationFilter` (the internal case sets `is_shared_expense = true`, ARCH §4.12) — there is
> **no dedicated drill endpoint**.

---

## 17. Dashboard

The home overview (FR-DB, FR-V-009). Context (Household / Individual member + display currency)
comes from the topbar (§1.1).
- **Net worth headline** (FR-DB-001) — `Σ positive account values − Σ liabilities` in display
  currency — with a **net-worth-over-time** trend (FR-DB-002) and the period delta.
- **Stat cards:** this period's **spending · income · debt**.
- **Customize is direct manipulation (not a layout modal).** A **`Customize`** toggle in the
  header puts the widget grid into **edit mode**: each widget reveals an in-card **drag handle**
  (drag-reorder *on the board*, with live reflow — drag-follow §0.7), an inline **S/M/L size
  control**, and a **remove ✕**. Exiting (`Done`) returns to the static board. Outside edit mode
  the board is read-only (widgets are still clickable to drill in). A ⋮ menu on each widget carries
  **Resize / Remove / Expand** as the redundant keyboard/a11y path (the ContextMenu, §8.1). Layout
  persists per person (`{widget_type, span, order, scope?}[]`).
- **Data loading.** Each widget fetches **its own** data via TanStack Query, keyed by
  `widget_type` + its `scope` + the active VisualizationFilter + topbar context (Household/member +
  display currency), against the read-only visualization contracts (`/api/visualizations/...`,
  ARCH §4.12 / §6.4). No batch endpoint in MVP; the shared query cache de-dupes overlapping
  widgets.
- **Widget sizing — discrete spans, resized in place.** In edit mode the S/M/L control rescales
  the widget **live on the grid** (no separate dialog); widgets snap to the responsive grid (same
  `auto-fit` columns as the card grid, §1.3). Three spans:
  - **S** = 1×1 — stat/number (net-worth headline, debt summary, a single stat card).
  - **M** = 2×1 — sparkline / bar row (account balances, budget health, upcoming payments).
  - **L** = 2×2 — full chart (spending-by-category pie, net-worth-over-time).
  Each type declares a **default span** + min/max; persisted as `span`. On mobile the grid reflows
  to a single column and spans clamp to full-width (§0.10). No arbitrary pixel resize.
- **Add-Widget gallery (drawer, not a blocking modal).** In edit mode a dashed **"+ Add widget"**
  ghost tile + a header action open a **side drawer/panel** (§8 composite). The catalog is a
  **fixed, curated set of widget *types*** grouped by module (Accounts / Transactions / Budgets /
  Debt / Insights); each tile = icon + name + **live mini-preview** + default size badge.
  **Templates are pre-generated; each instance binds to your data via a `scope` chosen at add-time.**
  Each gallery tile carries an inline **scope `Dropdown`** (household-scoped, respecting the
  Individual-mode member filter): **unscoped** types (net worth; the spending/income/debt stat
  cards) have none and are household-wide; **optional all-or-one** types (account balances,
  spending-by-category, recent transactions, upcoming payments, debt summary) default to *All*;
  **required** types (budget health) must target exactly one entity — **Add is disabled until a
  scope is chosen**. Persisted in `dashboard_layout` as
  `scope?: { kind: 'account' | 'category' | 'budget' | 'all', id?: uuid }` (omitted / `all` =
  household-wide).
  Click adds it at its default span to the end of the grid. Already-pinned types show a **"✓ pinned"**
  marker but remain addable (multiples allowed — two budget widgets scoped to different budgets).
- **Widgets** include: spending-by-category (**pie — the one chart that idle-floats**, §0.7),
  upcoming payments, budget health, recent transactions, account balances, debt summary. Each
  **drills into its module** with filter state carried (cross-module nav, FR-V-002/003), and ⋮ →
  **expand** opens the full Viewer (§9.1) seeded with the widget's context.
- **Individual mode (FR-V-009):** when the topbar is set to a member, every figure filters to
  `person_ids = [that member]` (admin/owner may pick any member; §1.1).

---

## 18. States & flows (cross-cutting)

Per-component states are defined where the component lives; collected here as the checklist
every screen must honour:
- **Empty** (EmptyState, §1.3) · **Loading** (skeletons in-app, branded spinner full-page,
  §0.7/§3) · **Error** (inline + the §3 pages) · **Archived** (desaturated + dashed, §2.3).
- **Reduced-motion** fallbacks (§0.7) and **density** (§0.4) apply everywhere.
- **Responsive** collapse follows the §12.6 pattern (table→fewer-columns→cards; sidebar→drawer).
