---
title: Financial Tracker — UX Design Specification
version: 4.0
status: rebuild-in-progress
created: 2026-06-11
authority: >
  The visual + interaction contract. Built BACKWARDS from signed-off visuals — every
  token, motion, and state here was reviewed and approved before being written. Greenfield-
  buildable: an agent must be able to reproduce the UI from this doc + the EDP without the
  existing codebase. Schema-backed fields cross-reference architecture.md §3.
supersedes: ux-design-specification-legacy.md (v3.4, archived 2026-06-11)
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
> A prior draft is archived at `ux-design-specification-legacy.md` (history only — not part of the build).

---

## 0. Foundation

The locked visual + interaction language. Everything in later sections references these
tokens; no component may introduce a raw value (hex, px, ms) that isn't a token here (rule P4).

### 0.1 Colour — colour-forward identity

**Principle:** colour *fills* regions and pops; it is not a timid accent. This is a deliberate
reversal of the old 4px left-accent-bar pattern (now retired).

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
each context one attribute *leads* with colour; the rest use dots, text-colour, or position.
(Tuned per screen — e.g. on the Transactions row, category leads.)

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
  - **Entity colours → deterministic ramp slot.** Each entity's identity (`entity_id`) hashes to a
    stable slot in `tint_ramp`, so two categories still read as *different shades of the tint*
    (distinguishable in charts) yet everything is on-theme. Stable per entity across sessions.
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
| Game Boy · DMG | `#0f380f` | `#306230` | `#9bbc0f` | `#8bac0f` | `#9bbc0f` | **yes** |

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

### 0.4 Spacing & density — 8px-based *(scale approved as-is)*

`2xs 4 · xs 8 · sm 12 · md 16 · lg 24 · xl 32 · 2xl 48`.

**Density system:** two densities — **comfortable** (default) and **compact** (tightens row
heights + vertical padding for data-dense power use). Components reference density-aware spacing
tokens (e.g. row height, card padding); **every component must support both**. Per-person
preference (Settings → Personal → App). Also there: a **reduce-motion** override (§0.7).

### 0.5 Radius *(approved as-is)*

`sm 4 · md 8 · lg 12 · xl 16 · 2xl 24 · full`. **Card default = `lg` (12px).** Single-sided
borders never get rounded corners.

### 0.6 Elevation *(corrected — per theme)*

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
| Merge slide | category merge/dedup | sub-item **scales down into a line/arrow toward the target, from its own direction; NO fade** · 420ms ease-out | cross-fade |
| Delete | hard delete | **scale down + drift to bottom-right + fade; NO rotate** · 500ms ease-in | fade only |
| Archive | archive | **desaturate only** (no collapse) · 550ms | instant grey |
| Number roll-up | balances load/change | count to value, tabular · 650ms ease-out | set instantly |
| Viz idle float | **pie charts only** | subtle idle bob **~4.0s** (calm) — the only chart that floats at idle | static |
| Viz rebuild | **any** chart re-rendered (filter/update/open) | **CRT saturation pop** — a quick over-bright/over-saturated flash that settles; signals "updated". No flicker | instant |
| Pie drill-down | click a pie slice | the slice **detaches / explodes outward** from the pie, then drills in | cross-fade |
| Modal / drawer | open/close | modal scale 0.96→1 + fade 200ms · drawer slide-from-edge 250ms | fade |
| Expand / collapse | tree, accordion | height + opacity · 200ms | instant |
| Pin-pop / check-draw | favourite / save | scale-pop + star · checkmark draw 300ms | instant |
| Drag-follow | reorder / pin drag | lift (scale 1.03 + shadow) → follows pointer → spring-settle on drop | no lift, instant move |
| Skeleton shimmer | loading | 1.5s linear loop | static |

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

### 0.10 Layering, breakpoints, iconography *(from existing, kept)*

- **Z-index scale:** below −1 · base 0 · raised 10 · dropdown 100 · sticky 200 · sidebar 300 ·
  modal 400 · toast 500 · tooltip 600.
- **Breakpoints:** xs 480 · sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1536. Core flows usable at
  desktop ≥1280, tablet ≥768, mobile ≥375 (FR-SYS-009).
- **Icons:** all icons go through a single **`Icon` wrapper component** so the underlying
  library is a one-line swap (commercial / licensing flexibility). Current library:
  **`lucide-react`** (ISC, commercial-safe), outline, 16–20px inline. *(Phase-3 mockups used
  Tabler — the rendering tool's set — for illustration only; the app uses lucide.)*

### 0.11 Accessibility (WCAG 2.1 AA)

Contrast floor enforced on all text (incl. contrast-aware fills). Full keyboard nav (Tab /
Enter / Esc / arrows). ARIA labels on interactive elements. ≥44×44px touch targets.
`prefers-reduced-motion` honoured — every §0.7 motion degrades to its fallback.

---

## 1. Page Scaffold & EntityPage

The shared frame for every entity module (Accounts, Capital, Assets, Insurance, Categories,
Currencies, Formula, Budgets, and the list-lean Transactions/Recurring/Transfers).

### 1.1 AppShell — Branding · Sidebar · Topbar

**Branding (swappable config).** App name, logo/mark, wordmark, and favicon come from a single
`branding` config — **never hardcoded** — so the whole identity changes in one place
(commercial / white-label path). MVP: name "Financial Tracker" + a placeholder mark, *through*
the config. Per-tenant white-label is post-MVP.

**Sidebar** (left):
- **Branded header** — logo mark + app name (from `branding`).
- **Grouped nav** (14 modules are too many flat — sectioned with muted group labels):
  OVERVIEW → Dashboard · ACCOUNTS → Accounts, Capital, Assets, Insurance · ACTIVITY →
  Transactions, Recurring, Transfers · INSIGHTS → Budgets, Debt · SETUP → Categories,
  Currencies, Formula.
- **Active item:** `accent-subtle` fill + `accent-primary` text.
- **Bottom:** Settings link only (no identity row — identity lives in the topbar avatar).
- **Responsive:** user-collapsible to an **icon rail**; auto-collapses below `lg` (tablet);
  **drawer** below `md` (mobile).

**Topbar** (persistent across authenticated screens):
- **Left — view context (grouped):** a **Household / Individual** segmented control **+ a
  display-currency picker**, together (both scope *what you're looking at*). In **Individual**
  mode a **member picker** chooses whose finances to view — **members may select only
  themselves; admins/owners may select ANY member** (parse any member's finances). Persists via
  `Person.default_view` (FR-P-006); the chosen member sets the `person_ids` filter (FR-V-009).
  *(The admin/owner "any member" widening needs a small PRD permission update — flagged.)*
- **Right cluster:** **global search** (command palette — jump to any entity/module;
  *new MVP feature — needs a search endpoint + FR, flagged*) · **alerts bell** (unread badge;
  opens the alert panel) · **avatar menu** (the sole user menu — profile, theme + font pickers,
  sign out).

**Alerts panel** (FR-SYS-007) — dropdown from the bell:
- Header: "Alerts" + "Mark all read".
- **Rows:** type icon in a semantic-tinted chip · title · one-line body · relative time · an
  **unread dot** (+ subtle row tint for unread); **hover reveals dismiss**. Each row **links to
  the relevant entity/module**.
- Alert types: BUDGET_WARNING/EXCEEDED · RECURRING_MISSED · FX_RATE_STALE · UPCOMING_PAYMENTS ·
  FX_API_DOWN · BACKUP_CREATED. Read state via `read_at` / `dismissed_at` (architecture §3.9).
- Footer: "View all alerts".

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
| archived | desaturated, **dashed** border, `Archived` badge, opacity ~0.55 |

### 2.3 States

| State | Treatment |
|---|---|
| default | calm fill, ⋮ visible, star = outline |
| hover | lift −2px + shadow; star outline becomes prominent (hover-lift motion, §0.7) |
| favourited | **solid star**, colour **contrast-aware** (amber/gold default; alternative hue when the card fill is amber/yellow). Favourites **sort first**. |
| selected | offset ring (`accent-secondary`) + corner check badge + lift (§0.9) — where multi-select applies |
| vivid | full-colour fill, contrast-aware text |

### 2.4 Interactions (gestures, §0.8)

`tap` = flip-to-open detail · `star` = favourite (sorts first) · `drag` = reorder on grid ·
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
| Household Deleted | home-x | error | member's household deleted by owner | Sign out / await new household |
| Removed from Household | user-x | warning | member removed by owner/admin | Sign out / await re-invite |

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
- **Dev login** button + a **DEV BYPASS ON** badge — rendered **only** when
  `AUTH_BYPASS_ENABLED` (FR-SYS-002); calls `POST /auth/dev-login`.
- `?error=not_invited` routes to the **Not Invited** page (§3), not Login.

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

Shown when an invitee already belongs to a household. Two variants, same two actions
(**Decline** / **Go to Settings**):
- **Member/admin:** "Accepting will remove you from {current} and move you to {target}."
- **Owner:** "You must delete your current household before joining another" (owners can't
  simply leave).

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
- **App:** density toggle (comfortable/compact, §0.4) · reduce-motion toggle (§0.7).

### 5.2 Management tab (the household)

- **Household config** (owner-editable; **read-only + lock for others**): name · timezone ·
  date format · **base currency** + recompute warning (FR-CU-005).
- **Members:** avatar · name+email · role chip · status. **⋮:** Promote/Demote (role change
  owner-only; owner not demotable), Archive/Restore, Remove (FR-P-005/007).
- **Invitations:** **+ Invite** → modal (Google email). Rows: email · status
  (pending/accepted/declined/expired/revoked) · expiry. Actions: Copy join link (`/join/<id>`),
  Resend, Revoke (pending) / Delete (terminal) (FR-HH-003/004).
- **Integrations** (owner-editable; read-only for others):
  - **FX rate providers** — an **ordered list** (priority = fallback chain, §arch 5.7). Each row:
    provider name · type (e.g. Open Exchange Rates) · **enabled** toggle · status chip
    (ok / stale / down) · ⋮ (reorder, edit, remove). **+ Add provider** → modal: type · base URL ·
    **API key** (write-only — masked `••••`, stored in Secret Manager, never echoed back, §arch 5.7).
    The first enabled provider is primary; on failure the fetcher falls through to the next.
  - **Bank connections** — section present but **greyed-out / "Coming soon"** (post-MVP; no
    controls, just the placeholder so the surface exists).
- **Danger Zone** (role-conditional): admin/member → **Leave Household** (confirm); owner →
  **Delete Household** (type the exact household name; removes all data, invalidates every
  member session, logs the owner out — FR-HH-005).

### 5.3 Data tab

- **CSV Import** — a 2-step wizard (FR-IE-001..005):
  1. **Upload** — drag/drop or pick a `.csv` (≤10 MB; `text/csv`). v1-column compatible (FR-IE-005).
  2. **Preview & map** — table of parsed rows; each row's category auto-suggested
     (**green** = matched, **yellow** = needs a pick); rows excludable; **duplicate detection**
     surfaces a **Conflicting Transactions** modal (Keep Newer / Keep Existing / Keep Both — FR-IE-004).
  3. **Confirm** — records are created **only** here; result summary (created / skipped / merged).
- **CSV Export** — the current ledger with the active VisualizationFilter applied; filename
  `financial-tracker-export-{YYYY-MM-DD}.csv` (FR-IE-006).
- **Backup** — last-backup timestamp + status; manual **Back up now** (admin/owner) (FR-SYS-008).

---

## 6. Categories (CategoryTree)

Uses the §1 EntityPage scaffold — header: name + info + search + **type filter**
(All/Expense/Income) + archived toggle + **+ New category**; a **Create defaults** action is
surfaced when the list is near-empty (FR-C-007). Body = the **CategoryTree** (2 levels max).

- **Parent row:** calm colour-tint fill · drag handle (hover-reveal) · expand chevron (or `–`
  if childless) · colour icon chip · name · sub-count · **right-aligned** type badge · ⋮ menu.
- **Subcategory row:** a row **light-filled in the *parent's* colour** (a lighter tint than the
  parent row — visually ties it to its parent; **no separate colour chip**). Reads as selectable
  (multi-select, merge, promote-out) · slightly **offset/indented** · **no connector line** ·
  drag handle · name · right-aligned badge · ⋮. An **"Add subcategory"** affordance sits at the
  end of an expanded parent's children (not inline on every primary row).
- **Behaviours:** archiving a parent **archives the whole branch** (no auto-promote, FR-C-005) ·
  **drag** reorders within a level and **onto another parent re-parents** a sub · **2 levels max**
  · expand/collapse animates (§0.7).

---

## 7. Component Library (reusability index)

Every UI element resolves to a library component; **every component appears on `/design-system`**
(P1 enforcement). New Phase-3 components are mostly *compositions* of existing primitives.

- **Primitives:** Button · Input · Label · Checkbox · Toggle · Dropdown · SegmentedControl ·
  DatePicker · ColourPicker · EmojiIconPicker · Badge · Avatar · Card · Divider · Spinner ·
  Skeleton · ProgressBar · Tooltip · **ContextMenu** · **Modal** · Drawer · Toast · Accordion ·
  Table · TagInput · EmptyState · AlertBanner · ConfirmationDialog · Icon (wrapper) ·
  MonetaryValueInput · RecurringDateInput.
- **Composites:** AppShell (Sidebar · Topbar) · EntityPage · **EntityCard** · **EntityModal** ·
  BulkActionBar · CategoryTree · PendingInvitationDialog · HouseholdConflictDialog.
- **New (Phase-3):** AlertPanel *(Popover + rows)* · ViewContextSwitcher *(SegmentedControl +
  Dropdowns)* · ThemePicker *(Dropdown + swatches)* · FontPicker *(Dropdown)* · CommandPalette
  *(Modal + Input + rows)* · DensityToggle · **MiniSparkline** *(new atom)* · **FilledChip**
  *(new atom)* · **FavouriteStar** *(new atom)* · Watermark/Branding *(new atom)*.

> The **ContextMenu**, **EntityModal**, and **EmojiIconPicker** are specced in detail in §8.

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
- **Entity-specific extras** slot in (category: "Add subcategory", "Merge"; account: "Add value
  snapshot").

### 8.2 EntityModal (create / edit)

The single create/edit surface for every entity.
- **Layout:** centered **two-column modal** by default; a **side drawer** only when a form is
  genuinely tall (e.g. Insurance). Footer: **Cancel left / primary right** (locked convention, §4.2).
- **Opens from a card via the flip-expand animation** (§0.7): tapping a card flips it and expands
  into this modal — the card's "detail" **is** the EntityModal.
- **Subtype-adaptive:** changing the type swaps in that subtype's fields (FR-A-001).
- **Controls:** name · type · **colour picker** (+ **vivid** per-instance toggle) ·
  **EmojiIconPicker** *(only where the entity has a custom glyph — categories;* **accounts use
  the type-default icon**, no custom glyph*)* · MonetaryValue input · DatePicker · multi-owner
  chips · notes.
- **Validation:** §0.9 focus/error states; required fields; inline messages; Save disabled until valid.

### 8.3 EmojiIconPicker

Used wherever an entity has a custom glyph (categories). A picker panel with **two tabs —
Emojis | Icons** (tab pattern §0.9) · a **search** field · a scrollable **grid** of selectable
glyphs (selected one highlighted). Opens from the icon field inside the EntityModal.

---

## 9. Visualization Viewer

The single reusable viewer (FR-V-011..015) — opened from any mini-chart (card/row) via the
expand animation, or full-screen. Specced once, reused everywhere.
- **Header:** title · **chart-type** toggle (line / bar / area / pie / stacked — only types valid
  for the current data are enabled, FR-V-014) · close.
- **Control bar:** **date range** (presets **+ Custom range picker**) · **group-by**
  (day / month / quarter / year). **Contextual controls** appear only when relevant: **metric**
  (count / sum / avg) for event-group aggregation (FR-V-013); **raw/converted** toggle for
  multi-currency (FR-V-004 / FR-CU-008).
- **Chart area:** axes, gridlines, series; **drill-down** — click a point/segment to filter
  (FR-V-002), or **View as table**.
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
- **Visual treatment — subtle depth (not gimmick 3D).** Charts carry a *slight* top-down
  perspective: bars/columns get a thin extruded edge + soft ground shadow, pie/donut a gentle
  top-down tilt — just enough to read as dimensional. **Hard rule: depth is decorative only and
  must never distort comparison** — bar heights, slice angles, and axis positions stay
  geometrically true (no foreshortened "3D bar chart" that misreads values). Drop the extrusion
  under reduced-motion / flat preference. A finish, not a data encoding.
- **Series & comparison (FR-V-005/006):** the legend lists each series with its colour, each
  **toggleable**. **"Add series to compare"** opens a picker to overlay another series — another
  currency's rate, or another person / category / account — drawn as an additional auto-coloured
  line (or grouped bars). Series colours are deterministic per identity (§0.1); limits 2–4
  persons, 2–8 categories.
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

A compact inline chart on cards/rows summarising an entity's history/usage (account value,
currency FX, budget trend). **Line or bar**, reads the entity's series, deterministic colour
(§0.1). **Clickable** with a hover "expand" affordance → opens the Viewer (§9.1) seeded with that
entity. A new atom (§7); reused everywhere a card shows history.

## 10. Currencies

EntityPage scaffold; **rows** (FX data is tabular): per-currency colour chip · code (mono) ·
name · **rate shown human-readably as "1 {base} = N {target}"** (the inverse of the stored
`rate_to_base`; storage + math unchanged, architecture §3.8) · **freshness** (fresh / **amber
stale at >48h**) · fee · **display-active** toggle (`is_display_active`) · **FX-history
mini-chart** → expands to the Viewer (§9, FR-CU-009) · ⋮. Base currency: rate fixed, no toggle,
not removable. **+ Add currency** → modal (any ISO 4217). Base-currency *change* lives in
Settings (owner; recompute warning).

## 11. Formula

EntityPage scaffold; rows: name · expression (mono) · applies-to badge · **System** (lock,
read-only) vs **Custom** (⋮ edit/delete). **Each System formula has an info tooltip** explaining
in plain language what it computes (straight-line / declining-balance depreciation, compound
interest, loan amortisation, FX delta, budget variance, net worth). **+ New formula** and edit
use the **Formula editor modal**: name · applies-to · **expression** with insertable variable
chips · **variables** table (name · default · description) · a **Test row** (sample inputs →
live result) · Cancel / Save. Computed results are **hover-revealed** on asset/capital cards
(FR-F-004).

---

## 12. Transactions (ledger)

EntityPage scaffold. **Header:** "Transactions" + info (count · out/in totals in base) · **+ New**.
**Filter bar:** search · date range · category · type (all/inflow/outflow) · a **Filters** popover
for secondary filters (account, person, status, GST/gift, reconciled).

### 12.1 Columns (desktop)
checkbox · **Date** (sortable) · **Name** (+ payment-method / description sub-line) · **Payer**
(avatar) · **Category** (filled chip — *colour leads*, anti-rainbow §0.1) · **Currency** (chip) ·
**Amount** (original, sortable, mono) · **Base SGD** (prominent, sortable, mono) · **status**
(faint dot) · ⋮.
- **Currency + Amount + Base are first-class** (the figures that matter most, per v1 use).
  Outflow/inflow is conveyed by amount **sign + colour** (red/green), not a separate column.
- **Status is de-emphasized** — a faint dot (green paid · amber pending · grey cancelled);
  rarely edited, full state in the detail modal.
- **Shared is the default**; only **exceptions** are flagged — a small icon for *personal (not
  shared)* or *gift* (most expenses are shared).
- Foreign rows: Base differs from Amount; `fx_delta` shows in the detail/modal.
- **Column alignment:** a **fixed-width column grid** (table-layout) so Payer / Category /
  Currency / Amount / SGD align cleanly across every row — columns never overlap.

### 12.2 Sorting — both
**Sortable column headers** (Date / Amount / SGD, asc↕desc) on desktop; collapses to a **sort
dropdown** on mobile.

### 12.3 Quick-add row
An inline row pinned at the top for fast entry of the **always-edited** fields: date (today) ·
name · payer · **payment method** · category · currency · amount (→ base auto-filled). Enter
commits; the **full modal** is still used for detail / foreign-currency / FX-formula entry
(brief "quick entry").

### 12.4 Selection & bulk
Rows are **multi-selectable** (checkboxes) → the **BulkActionBar** (Edit shared fields · Duplicate
· Archive · Delete). **Bulk multi-select is a GENERIC capability** (`useMultiSelect` +
`BulkActionBar`) — **not events-only**: it also applies to **Categories** (bulk edit / archive /
merge) and other entity lists where useful. *(Widens FR-E-020 — flagged for PRD.)*

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
  (**default ON**; off = personal) + **Gift** + **GST claimable**. (No separate "Personal"
  toggle — it is simply shared=off.)
- **Duplicate detection on save (FR-E-008):** a candidate surfaces an inline warning
  (Link as duplicate / Ignore) before the record commits.

---

### 12.8 Visualize the current set (event-group aggregation)

A **Visualize** action in the ledger (toolbar, and on the bulk-selection bar) opens the **Viewer
(§9)** seeded with the **current filter / selection** as an *event set*, where you pick a
**metric** (count / sum(`amount_base`) / avg) and **group-by** (day/month/quarter/year) — e.g.
"Netflix, counted by month" or "Groceries summed by quarter" (FR-V-013). The series uses the
lead category's colour (or neutral for mixed sets).

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
  **upcoming · processed · skipped · missed · manual · failed** (FR-E-013). Processed shows the
  **linked transaction — clickable → opens it in the Transactions module** (cross-module nav,
  FR-V-003); **missed is highlighted red**. Per-occurrence actions: **Skip** (FR-E-014),
  **Trigger now** (manual, FR-E-015), **Process now** (a missed one).
- **Create/edit modal:** EntityModal + the **RecurringDateInput** — free-text `frequency_text`
  ("8th of every month") that **parses and shows the next occurrence for confirmation** before
  saving (the 9 patterns, FR-E-011/012).
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
- **Actuals are computed live**, never stored (FR-B-003); category rollup includes subcategories.
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
  **Resize / Remove / Expand** as the redundant keyboard/a11y path (§5.6). Layout persists per
  person (`{widget_type, span, order, scope?}[]`).
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
  **Templates are pre-generated; each instance binds to your data via an optional `scope`** chosen
  at add-time (e.g. "Budget health" → pick which budget; "Account balances" → all or one account).
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

<!-- UX SPEC SCREENS COMPLETE — remaining: final consolidation pass (renumber + fold Phase-3 features into PRD/architecture); EDP rebuild -->


