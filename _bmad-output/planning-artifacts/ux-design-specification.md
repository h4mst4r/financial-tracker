---
title: Financial Tracker — UX Design Specification
version: 2.0
status: living
created: 2026-05-26
authority: Complete design system and UI component reference. Derives from
           entity-design-philosophy.md. Feature requirements in prd.md.
           Technical implementation in architecture.md.
---

# Financial Tracker — UX Design Specification

> **Design authority:** Entity hierarchy, component naming, theme token system,
> and VisualizationFilter architecture are specified in `entity-design-philosophy.md` [EDP].
> This document specifies *how the application looks, feels, and behaves* — every
> component, every interaction state, every animation, every accessibility rule.

---

## 0. What Goes Into a Web Application UI

A production web application's UI is built from eleven layers, each depending on the
one below it. This specification covers all eleven.

```
Layer 11 — Accessibility          WCAG AA, keyboard nav, ARIA, reduced motion
Layer 10 — Animation System       Transitions, micro-animations, chart draw-in
Layer  9 — Entity Components      EntityCard<T>, EntityModal<T>, MonetaryValue, PersonCard
Layer  8 — Scrollbars             Custom styled, theme-matched
Layer  7 — Data Visualisation     Charts, stat cards, timelines, budget bars
Layer  6 — Feedback & State       Toasts, alerts, skeletons, empty states, dialogs
Layer  5 — Navigation             Sidebar, topbar, breadcrumbs, tabs, pagination
Layer  4 — Containers & Layout    Cards, modals, drawers, tables, popovers
Layer  3 — Form & Selection       Dropdowns, date pickers, colour pickers, emoji pickers
Layer  2 — Atomic Components      Buttons, inputs, badges, icons, tooltips
Layer  1 — Design Tokens          Colours, typography, spacing, shadows, z-index, motion
```

---

## 1. Design Tokens (Layer 1)

Design tokens are CSS custom properties defined in a single `@theme {}` block.
Changing one token changes every component that uses it. No hardcoded values
anywhere in the codebase.

### 1.1 Colour Tokens

```css
@theme {
  /* === BACKGROUNDS === */
  --color-bg:               #09090f;   /* Page background — deepest layer */
  --color-surface:          #111118;   /* Cards, panels */
  --color-surface-raised:   #1a1a24;   /* Elevated cards, dropdowns */
  --color-surface-overlay:  #22222e;   /* Modals, drawers */
  --color-surface-hover:    #2a2a38;   /* Hover state on interactive surfaces */

  /* === BORDERS === */
  --color-border:           #2a2a3a;   /* Default border */
  --color-border-strong:    #3a3a52;   /* Emphasized borders */
  --color-border-focus:     #6366f1;   /* Focus ring — matches primary */
  --color-border-error:     #ef4444;

  /* === TEXT === */
  --color-text:             #f1f1f5;   /* Primary text */
  --color-text-secondary:   #9898aa;   /* Labels, captions */
  --color-text-muted:       #606072;   /* Placeholders, disabled labels */
  --color-text-disabled:    #3a3a4a;   /* Disabled content */
  --color-text-inverse:     #09090f;   /* Text on light backgrounds */
  --color-text-link:        #818cf8;   /* Links */

  /* === SEMANTIC COLOURS === */
  --color-primary:          #6366f1;   /* Indigo — primary actions */
  --color-primary-hover:    #4f46e5;
  --color-primary-muted:    #1e1b4b;   /* Subtle primary background */
  --color-accent:           #06b6d4;   /* Cyan — highlights, tags */
  --color-accent-muted:     #0c2a31;
  --color-success:          #10b981;   /* Green */
  --color-success-muted:    #052e20;
  --color-warning:          #f59e0b;   /* Amber */
  --color-warning-muted:    #2d1f04;
  --color-error:            #ef4444;   /* Red */
  --color-error-muted:      #2d0a0a;
  --color-info:             #3b82f6;   /* Blue */
  --color-info-muted:       #0a1b38;

  /* === ENTITY ACCENT COLOURS [EDP §14.5] === */
  /* One colour per entity family — used in cards, chart segments, modals */
  --color-entity-account:   #6366f1;   /* Indigo  — bank, savings */
  --color-entity-credit:    #ef4444;   /* Red     — credit cards (debt connotation) */
  --color-entity-capital:   #10b981;   /* Green   — investments (growth) */
  --color-entity-asset:     #f59e0b;   /* Amber   — property, vehicles */
  --color-entity-insurance: #06b6d4;   /* Cyan    — insurance policies */
  --color-entity-event:     #8b5cf6;   /* Purple  — transactions */
  --color-entity-recurring: #ec4899;   /* Pink    — recurring payments */
  --color-entity-transfer:  #14b8a6;   /* Teal    — transfers */
  --color-entity-budget:    #f97316;   /* Orange  — budgets */
  --color-entity-category:  #06b6d4;   /* Cyan    — categories */
  --color-entity-currency:  #a78bfa;   /* Violet  — currencies */
  --color-entity-formula:   #6ee7b7;   /* Mint    — formulas */
  --color-entity-debt:      #ef4444;   /* Red     — debt summary */
  --color-entity-person:    #38bdf8;   /* Sky     — persons */

  /* === CHART PALETTE (for multi-series charts) === */
  --chart-1:  #6366f1;
  --chart-2:  #10b981;
  --chart-3:  #f59e0b;
  --chart-4:  #ef4444;
  --chart-5:  #06b6d4;
  --chart-6:  #ec4899;
  --chart-7:  #8b5cf6;
  --chart-8:  #14b8a6;
}
```

**Colour-blind safety:**
The 8-colour chart palette is distinguishable under Deuteranopia, Protanopia, and
Tritanopia. Semantic meaning (success/error) is never conveyed by colour alone —
always paired with an icon or label.

### 1.2 Typography Tokens

```css
@theme {
  /* Font families */
  --font-sans:  "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono:  "JetBrains Mono", "Fira Code", "Consolas", monospace;
  --font-num:   "Inter", sans-serif;  /* Tabular numbers for monetary values */

  /* Font sizes (rem scale) */
  --text-xs:    0.75rem;    /* 12px — captions, metadata */
  --text-sm:    0.875rem;   /* 14px — secondary labels, table cells */
  --text-base:  1rem;       /* 16px — body text */
  --text-lg:    1.125rem;   /* 18px — card titles */
  --text-xl:    1.25rem;    /* 20px — section headings */
  --text-2xl:   1.5rem;     /* 24px — page headings */
  --text-3xl:   1.875rem;   /* 30px — dashboard stat values */
  --text-4xl:   2.25rem;    /* 36px — hero numbers */

  /* Font weights */
  --font-normal:   400;
  --font-medium:   500;
  --font-semibold: 600;
  --font-bold:     700;

  /* Line heights */
  --leading-none:   1;
  --leading-tight:  1.25;
  --leading-snug:   1.375;
  --leading-normal: 1.5;
  --leading-relaxed:1.625;

  /* Letter spacing */
  --tracking-tight:  -0.025em;
  --tracking-normal: 0;
  --tracking-wide:   0.025em;
  --tracking-wider:  0.05em;   /* Used on stat value labels */
  --tracking-widest: 0.1em;    /* Used on ALL CAPS section labels */
}
```

**Monetary values:** Always rendered in `--font-num` with `font-variant-numeric: tabular-nums`
so decimal points align in columns.

### 1.3 Spacing Tokens

4px base grid. All spacing uses multiples of 4.

```css
@theme {
  --space-0:   0;
  --space-1:   0.25rem;   /* 4px */
  --space-2:   0.5rem;    /* 8px */
  --space-3:   0.75rem;   /* 12px */
  --space-4:   1rem;      /* 16px */
  --space-5:   1.25rem;   /* 20px */
  --space-6:   1.5rem;    /* 24px */
  --space-8:   2rem;      /* 32px */
  --space-10:  2.5rem;    /* 40px */
  --space-12:  3rem;      /* 48px */
  --space-16:  4rem;      /* 64px */
  --space-20:  5rem;      /* 80px */
}
```

### 1.4 Border Radius Tokens

```css
@theme {
  --radius-sm:   0.25rem;   /* 4px  — tags, badges */
  --radius-md:   0.5rem;    /* 8px  — inputs, buttons */
  --radius-lg:   0.75rem;   /* 12px — cards */
  --radius-xl:   1rem;      /* 16px — modals, drawers */
  --radius-2xl:  1.5rem;    /* 24px — large cards */
  --radius-full: 9999px;    /* Pills, avatars */
}
```

### 1.5 Shadow Tokens

```css
@theme {
  --shadow-sm:  0 1px 2px 0 rgb(0 0 0 / 0.4);
  --shadow-md:  0 4px 6px -1px rgb(0 0 0 / 0.5), 0 2px 4px -2px rgb(0 0 0 / 0.4);
  --shadow-lg:  0 10px 15px -3px rgb(0 0 0 / 0.6), 0 4px 6px -4px rgb(0 0 0 / 0.4);
  --shadow-xl:  0 20px 25px -5px rgb(0 0 0 / 0.7), 0 8px 10px -6px rgb(0 0 0 / 0.4);
  --shadow-glow-primary: 0 0 20px 0 rgb(99 102 241 / 0.3);  /* Entity accent glow */
}
```

### 1.6 Z-Index Scale

```css
@theme {
  --z-below:    -1;
  --z-base:      0;
  --z-raised:   10;    /* Cards in hover state */
  --z-dropdown: 100;   /* Dropdowns, popovers */
  --z-sticky:   200;   /* Sticky headers */
  --z-sidebar:  300;   /* Sidebar overlay on mobile */
  --z-modal:    400;   /* Modals */
  --z-toast:    500;   /* Toast notifications */
  --z-tooltip:  600;   /* Tooltips — highest */
}
```

### 1.7 Breakpoints

```css
@theme {
  --bp-sm:  640px;    /* Small phones */
  --bp-md:  768px;    /* Tablets */
  --bp-lg:  1024px;   /* Laptop */
  --bp-xl:  1280px;   /* Desktop */
  --bp-2xl: 1536px;   /* Wide desktop */
}
```

### 1.8 Motion Tokens

```css
@theme {
  /* Durations */
  --duration-instant:  50ms;
  --duration-fast:    100ms;
  --duration-normal:  200ms;
  --duration-slow:    350ms;
  --duration-slower:  500ms;

  /* Easing curves */
  --ease-default:    cubic-bezier(0.4, 0, 0.2, 1);   /* Material standard */
  --ease-in:         cubic-bezier(0.4, 0, 1, 1);
  --ease-out:        cubic-bezier(0, 0, 0.2, 1);
  --ease-bounce:     cubic-bezier(0.34, 1.56, 0.64, 1); /* Overshoot spring */
  --ease-spring:     cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
```

---

## 2. Atomic Components (Layer 2)

### 2.1 Button

Five variants. All share: `border-radius: var(--radius-md)`, `font-weight: --font-medium`,
minimum height 40px (44px on mobile), minimum width 64px.

| Variant | Background | Text | Border | Use case |
|---|---|---|---|---|
| `primary` | `--color-primary` | white | none | Main CTA (Save, Confirm, Create) |
| `secondary` | `--color-surface-raised` | `--color-text` | `--color-border` | Secondary action (Cancel, Back) |
| `ghost` | transparent | `--color-text-secondary` | none | Tertiary action (Edit inline) |
| `danger` | `--color-error-muted` | `--color-error` | `--color-error` at 40% | Destructive (Delete, Archive) |
| `icon` | transparent | `--color-text-secondary` | none | Icon-only (context menu triggers) |

**States for all variants:**
- `default`: base styles above
- `hover`: background lightens by 10% (or darkens on light bg); `transition: --duration-fast`
- `active` (pressed): scale(0.97); `transition: --duration-instant`
- `focus-visible`: `outline: 2px solid --color-border-focus; outline-offset: 2px`
- `disabled`: opacity 0.4; cursor not-allowed; no hover/active effects
- `loading`: left icon replaced with spinner; text unchanged; pointer-events none

**Sizes:**
- `sm`: height 32px, padding `--space-2 --space-3`, text `--text-sm`
- `md` (default): height 40px, padding `--space-2 --space-4`, text `--text-sm`
- `lg`: height 48px, padding `--space-3 --space-6`, text `--text-base`

**Icon Button:** Square. `sm`=32px, `md`=40px, `lg`=48px. Icon centred. No text.

**FAB (Floating Action Button):** 56px circle. `--color-primary` background.
`--shadow-lg`. Fixed bottom-right on mobile (20px inset). Appears only on mobile viewports.

### 2.2 Text Input

Base styles: background `--color-surface-raised`, border `1px solid --color-border`,
`border-radius: --radius-md`, padding `--space-2 --space-3`, height 40px,
text `--text-sm`, colour `--color-text`.

**States:**
- `default`: base styles
- `hover`: border `--color-border-strong`
- `focus`: border `--color-border-focus`; box-shadow `0 0 0 3px rgb(99 102 241 / 0.2)`
- `error`: border `--color-border-error`; icon slot shows error icon in red
- `disabled`: opacity 0.5; background `--color-surface`; cursor not-allowed
- `read-only`: background transparent; border dashed; no focus ring

**Variants:**
- `text`: default
- `number`: `text-align: right`; `font-variant-numeric: tabular-nums`
- `search`: leading search icon; trailing clear button (×) when non-empty
- `password`: trailing show/hide toggle icon

**Slot system:** Every input has a `leading` slot (icon or prefix text) and a
`trailing` slot (icon, button, or suffix text). Used for currency symbols,
unit labels, and action triggers.

### 2.3 Label and Helper Text

- **Label:** `--text-sm`, `--font-medium`, `--color-text-secondary`, `margin-bottom: --space-1`
- **Helper text:** `--text-xs`, `--color-text-muted`, `margin-top: --space-1`
- **Error text:** `--text-xs`, `--color-error`, `margin-top: --space-1`; always accompanied by error icon
- **Required indicator:** asterisk (*) in `--color-error` after label text

### 2.4 Badge and Chip

**Badge:** Inline indicator. Pill shape (`--radius-full`). Height 20px.
Padding `2px --space-2`. Text `--text-xs --font-medium`.

| Type | Background | Text |
|---|---|---|
| `success` | `--color-success-muted` | `--color-success` |
| `warning` | `--color-warning-muted` | `--color-warning` |
| `error` | `--color-error-muted` | `--color-error` |
| `info` | `--color-info-muted` | `--color-info` |
| `neutral` | `--color-surface-raised` | `--color-text-secondary` |
| `entity` | `var(--entity-accent, --color-primary)` at 15% | `var(--entity-accent)` |

**Chip (dismissible):** Badge + trailing × button. Used for VisualizationFilter
active filters in breadcrumb trail. Hover on × shows red tint.

### 2.5 Avatar

Circular. Sizes: `sm`=24px, `md`=32px, `lg`=40px, `xl`=56px.
Displays person's `picture_url` if available; falls back to initials
(first letter of first + last name) on `--color-entity-person` background.
Archived persons: greyscale + 50% opacity.

**AvatarStack:** Multiple overlapping avatars for account owners.
Max 3 shown + "+N" overflow badge.

### 2.6 Icon

Icon library: **Lucide React**. All icons rendered as `<svg>` with `aria-hidden="true"`
when decorative; `aria-label` required when meaningful.

Sizes: `xs`=12px, `sm`=16px, `md`=20px (default), `lg`=24px, `xl`=32px.
Colour: inherits `currentColor`. Never hardcoded.

**Status icons** (always paired with colour and label — never colour alone):
`CheckCircle2` = reconciled, `Clock` = pending, `XCircle` = cancelled,
`AlertCircle` = missed, `RefreshCw` = recurring, `ArrowLeftRight` = transfer.

### 2.7 Tooltip

Trigger: hover (200ms delay) or focus. Max width: 280px. Background: `--color-surface-overlay`.
Border: `--color-border-strong`. `--radius-md`. `--shadow-lg`. `--text-xs`.
Padding: `--space-2 --space-3`. Arrow pointing to trigger. `z-index: --z-tooltip`.

**Formula hover tooltip** [EDP §11]: Wider variant (360px). Shows:
formula name (bold), variable inputs (table), computed result (large + highlighted),
data source date (muted). Trigger: hover over formula-enabled entity card.

### 2.8 Divider

**Horizontal divider:**
`<hr>`. 1px solid `--color-border`. `margin: --space-4 0`.
Lighter variant (for within-card use): `--color-surface-hover`.

**Vertical divider:**
`display: inline-block; width: 1px; height: 1.25em; background: --color-border; margin: 0 --space-3; vertical-align: middle`.
Used in toolbars, filter bars, and inline button groups.

**Section divider (with label):**
```
────────────  OPTIONAL FIELDS  ────────────
```
Label centred, `--text-xs --tracking-widest --font-medium --color-text-muted`.
Lines: 1px solid `--color-border`, flex-grow on both sides.
Used inside modals to separate required from optional fields.

**Spacing rule:** Dividers inside cards use `--space-3` vertical margin.
Dividers between major page sections use `--space-6` vertical margin.
Never use a divider where spacing alone communicates separation adequately.

### 2.9 Spinner / Loader

Three sizes: `sm`=16px, `md`=24px, `lg`=40px.
SVG circle with stroke-dasharray animation. Colour: `--color-primary`.
Animation: 800ms linear infinite rotation. Respects `prefers-reduced-motion`
(pauses animation; shows static arc).

---

## 3. Form & Selection Components (Layer 3)

### 3.1 Dropdown / Select

**Single select:** Custom-rendered (not native `<select>`). Trigger = Input-style button
showing selected value + ChevronDown icon. Opens a floating panel below trigger
(`--shadow-xl`, `--radius-lg`, `--z-dropdown`). Panel max-height: 280px; scrollable.

Each option: 40px height, padding `--space-2 --space-3`, hover background
`--color-surface-hover`, selected item shows checkmark + `--color-primary` text.

**Searchable select:** Adds a search input at the top of the dropdown panel.
Filters options in real time (client-side for < 100 items; server-side for more).

**Multi-select:** Options have checkboxes. Selected items shown as chips in the trigger.
Max displayed chips: 3; overflow shows "+N more" chip.

**Grouped select:** Options organised under sticky group headers
(`--text-xs --tracking-widest` in `--color-text-muted`).

**Loading state:** Trigger shows spinner; panel shows skeleton rows.

### 3.2 Checkbox

24×24px touch target (visually 18×18px box). Custom-rendered SVG.
- Unchecked: border `--color-border-strong`; background `--color-surface-raised`
- Checked: background `--color-primary`; white checkmark icon
- Indeterminate: `--color-primary`; minus icon (used in select-all)
- Disabled: opacity 0.4

### 3.3 Radio Button

Same sizing as Checkbox. Circular. Selected state: outer ring `--color-primary`;
inner filled circle.

### 3.4 Toggle Switch

Width 44px, height 24px. Thumb: 20px circle, white.
- Off: track `--color-surface-raised`; thumb left
- On: track `--color-primary`; thumb right
- Transition: `--duration-normal --ease-default`
- Disabled: opacity 0.4

### 3.5 Range Slider

Custom-rendered. Track: `--color-border` (unfilled), `--color-primary` (filled portion).
Thumb: 20px circle, `--color-primary`, `--shadow-md`.
Hover: thumb scales to 24px. Focus: thumb gets focus ring.

### 3.6 Date Picker

Input field showing `DD-MM-YYYY` formatted date (FR-V-010). Trailing CalendarDays icon
opens a calendar popover.

**Calendar popover:**
- Header: month/year label + left/right navigation arrows
- Grid: 7 columns (Mon–Sun), 5–6 rows
- Today: `--color-primary` ring
- Selected: `--color-primary` background
- Hover: `--color-surface-hover` background
- Out-of-range days: `--color-text-muted`
- Range selection: start/end dates fully filled; in-between dates `--color-primary-muted`

**Keyboard:** Arrow keys navigate days; Enter selects; Escape closes.

**Month/Year picker:** Clicking the header shows a year grid with month sub-picker.

### 3.7 Colour Picker

Two modes, toggled by a tab:

**Palette mode (default):** Grid of 32 preset swatches (8 × 4). Each 28×28px circle.
Selected: white ring. Preset palette includes the entity accent colours and
common financial category colours (food = orange, transport = blue, etc.).

**Hex mode:** Text input for `#RRGGBB` value. Live preview swatch left of input.
Validates on blur — rejects non-hex values.

Input renders the selected colour as a filled circle + hex value in the trigger.

### 3.8 Emoji / Icon Picker

Used for category icons. Trigger: shows current emoji/icon in a pill button.

**Picker panel:** 360px wide.
- Search bar at top (searches emoji names and icon names)
- Tabbed: Emojis | Icons (Lucide subset)
- Emoji grid: 10 columns, 40px cells, groups by category (Smileys, Food, Travel, Objects, etc.)
- Icon grid: same layout showing Lucide icon outlines
- Hover: `--color-surface-hover` background; tooltip shows name
- Recently used: top row of 10 most recently selected

### 3.9 Currency Input (MonetaryValue Component)

Purpose-built for financial entry. Not a generic number input.

**Layout (expanded):**
```
┌─────────┬──────────────────────────────┐
│ SGD ▼   │                    1,234.56  │  ← currency selector + amount
├─────────┴──────────────────────────────┤
│ ≈ NZD 2,156.23  (rate: 1.741)          │  ← base conversion (auto; hidden if same currency)
│ Bank amount: [_________]  Δ +12.30     │  ← override + fx_delta (shown on foreign currency)
└────────────────────────────────────────┘
```

- Currency selector: searchable dropdown of all household currencies
- Amount: right-aligned number input, `--font-mono`, 2 decimal places
- Conversion row: shown only when `currency ≠ base_currency`; `--text-xs --color-text-muted`
- Bank override: appears when user clicks "override" link; editing recalculates fx_delta inline
- `fx_delta` shown in `--color-error` if positive (loss) or `--color-success` if zero/negative

**Collapsed (display-only):** Single line. Currency symbol + formatted amount.
Foreign amounts show base equivalent in muted text below.

### 3.10 Autocomplete / Combobox

Text input + dropdown showing matching suggestions. Dropdown opens after 1 character.
Max 8 suggestions. "No results" state shows empty state message.
Keyboard: ArrowDown/Up navigates; Enter selects; Escape closes.

Used for: payee name entry (suggests from past payees), institution name.

### 3.11 Tag Input

Chips inside an input-style container. Type and press Enter or comma to add a tag.
Click × on a chip to remove. Backspace removes the last chip when input is empty.
Used for: insurance coverage types.

### 3.12 Recurring Date Input (Entity-Specific)

Free-text input for recurring frequency. Placeholder: "e.g. 3rd of every month".

**Inline parse preview:**
```
┌─────────────────────────────────────────┐
│ 3rd of every month              ✕       │
│ Next: 03-07-2026  ✓ Confirm             │
└─────────────────────────────────────────┘
```

- Parse runs on blur or after 500ms debounce
- Parsed date shown in `DD-MM-YYYY` format
- Confirm button required before saving [FR-E-010]
- If parse fails: "Could not understand this pattern" in `--color-error`
- Link "See supported formats" opens a tooltip listing all 9 patterns [EDP §7.3]

---

## 4. Container & Layout Components (Layer 4)

### 4.1 Card

Base card: `background: --color-surface`, `border: 1px solid --color-border`,
`border-radius: --radius-lg`, `padding: --space-4 --space-5`.

**Card hover lift:** On hover, `box-shadow: --shadow-md` and
`translate: 0 -2px`. Transition `--duration-fast --ease-out`.
Left border accent: `4px solid var(--entity-accent)` — colour set by entity type [EDP §14.5].

**Card variants:**
- `default`: base styles
- `stat`: larger, centred content, used for KPI dashboard cards
- `elevated`: `background: --color-surface-raised`; always has shadow
- `ghost`: no background, no border; used inside modals

### 4.2 Modal / Dialog

Centred overlay. Backdrop: `background: rgb(0 0 0 / 0.7)`, `backdrop-filter: blur(4px)`.
Panel: `background: --color-surface-overlay`, `--radius-xl`, `--shadow-xl`.
Max-width: 560px (sm), 720px (md), 960px (lg). Width: `calc(100vw - 2rem)` on mobile.

**Anatomy:**
- Header: title (left) + close button × (right); `padding: --space-5 --space-6`; border-bottom
- Body: scrollable; `padding: --space-6`; max-height 60vh
- Footer: right-aligned action buttons; `padding: --space-4 --space-6`; border-top

**Variants:**
- `form`: standard entity create/edit modal
- `confirmation`: smaller (max 400px); single-paragraph message + Confirm/Cancel
- `fullscreen`: no max-width; full viewport on mobile

**Close behaviour:** × button, Escape key, or backdrop click. Unsaved changes trigger
a confirmation dialog before closing.

**Focus trap:** Tab key cycles only through modal content while open. On open,
focus moves to first interactive element. On close, focus returns to trigger.

### 4.3 Drawer / Side Panel

Slides in from the right. Width: 480px (md), 600px (lg). Full-width on mobile.
Backdrop same as Modal. Header + scrollable body + optional footer.

Used for: entity detail views, filter panels, import preview.

Animation: `translateX(100%) → translateX(0)`, `--duration-slow --ease-out`.

### 4.4 Accordion / Collapsible

Header row (full-width button): label + ChevronDown icon (rotates 180° when open).
Body: collapses/expands with height animation (`--duration-normal --ease-default`).
Used for: Settings sections, formula variable editors.

### 4.5 Popover

Like a Tooltip but interactive. Triggered by click (not hover). Contains form elements,
menus, or rich content. Arrow points to trigger. `--shadow-xl`.
Closes on: Escape, click outside, or trigger re-click.

### 4.6 Context Menu

Right-click or ⋯ trigger. Floating panel, `--z-dropdown`. Min-width 180px.
Items: 36px height, padding `--space-2 --space-3`. Leading icon slot.

Standard entity context menu items:
`Edit` · `Duplicate` · divider · `Archive` (danger colour) · `Delete` (danger; only in archived view)

### 4.7 Table

Used for transaction ledger, recurring payment list, budget detail.

**Anatomy:**
- `<thead>`: sticky on scroll; `background: --color-surface`; border-bottom
- Column header: `--text-xs --tracking-widest --font-medium --color-text-muted`; sortable headers show sort icon
- `<tbody>`: row height 52px; hover `--color-surface-hover`
- Row: click selects (highlights in `--color-primary-muted`)
- `<tfoot>` (optional): summary row; bold totals

**Sortable column:** click header to sort asc; click again for desc; click again for none.
Sort indicator: `↑` / `↓` icon in header.

**Column pinning:** Name/Date columns optionally pinned left on horizontal scroll.

**Responsive:** On mobile (< 768px), table collapses to card-list view — each row
becomes a card with key fields. Horizontal scrolling is not used.

**Empty state:** Full-width cell spanning all columns with EmptyState component.

### 4.8 List

**Flat list:** Vertically stacked items. Used for sidebar nav, alert list.
**Grouped list:** Sticky group headers in `--text-xs --tracking-widest --color-text-muted`.
**Draggable list:** Drag handle (⠿) left of each item. Reorder by drag. Used for category ordering.

---

### 4.9 Drag and Drop Behaviour

Drag and drop is used in two contexts: **reordering cards** in a module grid, and
**reordering rows** in a list (e.g. category order, sidebar nav pin order).

**Drag handle:** ⠿ icon (GripVertical from Lucide). Shown on row/card hover, left edge.
Cursor: `grab` on hover; `grabbing` while dragging.

**Drag initiation (150ms hold before drag activates — prevents accidental drags):**
- Dragged element: lifts — `scale(1.03)`, `--shadow-xl`, `opacity: 0.95`,
  `rotate: 1.5deg`, `z-index: --z-raised`. Transition: `--duration-fast --ease-out`.
- Ghost placeholder: outlined skeleton at original position.
  `background: --color-primary-muted; border: 2px dashed --color-primary; opacity: 0.5`.

**Drop zone highlighting:**
- Valid drop target: `background: --color-primary-muted; border: 2px dashed --color-primary`.
  Transition: `--duration-fast`.
- Invalid drop target: `background: --color-error-muted; border: 2px dashed --color-error`.

**Drop (release):**
- Element snaps to new position with `--duration-normal --ease-bounce`.
- All other elements re-flow smoothly.
- Order change persists via PATCH API call (optimistic update — reverts on failure with error toast).

**Touch support:** Long-press (500ms) activates drag on mobile. Haptic feedback where supported.

**Table row drag:** Drag handle column on the left. Dragging a row lifts it above others
and shows insertion line (2px `--color-primary` horizontal rule) at target position.

**Keyboard drag (accessibility):** Space to pick up; arrow keys to move; Space to drop;
Escape to cancel. Announced via `aria-live` region.

---

### 4.10 Multi-Select Behaviour

Multi-select is available on all entity lists and tables. It enables bulk operations.

**Selection methods:**
| Method | Action |
|---|---|
| Click a row/card | Select that item (deselects others) |
| `Cmd/Ctrl` + click | Add or remove item from selection |
| `Shift` + click | Range select from last selected to clicked item |
| `Cmd/Ctrl` + `A` | Select all visible items |
| Click empty area | Deselect all |

**Selected item appearance:**
- Row/card background: `--color-primary-muted`
- Left border accent: `--color-primary` (overrides entity accent colour)
- Checkbox indicator: appears at the left edge of selected items (checked, `--color-primary`)
- Unselected items while selection is active: `opacity: 0.7`

**Bulk Action Bar:**
Slides up from the bottom of the viewport when ≥ 1 item is selected.
```
┌──────────────────────────────────────────────────────────┐
│  ☑ 4 items selected      [Archive]  [Export]  [✕ Clear] │
└──────────────────────────────────────────────────────────┘
```
- Height: 56px. `background: --color-surface-overlay`. `--shadow-xl`.
  `border-top: 1px solid --color-border`. `z-index: --z-sticky`.
- Slides up: `translateY(100%) → translateY(0)`, `--duration-normal --ease-bounce`.
- Slides down on deselect.
- Actions available: Archive selected, Export selected (CSV), Categorise selected
  (Transactions only — opens category picker for bulk assignment).
- Destructive actions (Archive) use `--color-warning` button.
- Count label updates live as selection changes.

### 5.1 Application Shell

```
┌─────────────────────────────────────────────────────────┐
│  TOPBAR                                           [user] │  ← 64px height
├──────────┬──────────────────────────────────────────────┤
│          │                                              │
│ SIDEBAR  │  PAGE CONTENT                                │
│  240px   │                                              │
│          │                                              │
└──────────┴──────────────────────────────────────────────┘
```

On tablet (768–1024px): sidebar collapses to icon-only (64px wide).
On mobile (< 768px): sidebar hidden; bottom navigation bar (5 icons) replaces it.

### 5.2 Sidebar

`background: --color-surface`. Right border `--color-border`. Fixed height 100vh.

**Full sidebar content (top to bottom):**

```
┌──────────────────────────────┐
│ 💰 Financial Tracker   [≡]  │  ← Logo + household name + collapse toggle
├──────────────────────────────┤
│  MAIN                        │  ← Section label (xs, muted, tracking-widest)
│  ⊞  Dashboard                │
│  ↔  Transactions             │
│  ↻  Recurring Payments       │
│  ⇄  Transfers                │
├──────────────────────────────┤  ← Divider
│  ACCOUNTS                    │
│  🏦 Accounts                 │
│  📈 Capital                  │
│  🏠 Assets                   │
│  🛡  Insurance                │
├──────────────────────────────┤
│  PLANNING                    │
│  📊 Budgets                  │
│  🏷  Categories               │
├──────────────────────────────┤
│  ─────────────────────────── │  ← Spacer (flex-grow)
│  ⚙  Settings                 │
│  🔔 Alerts  [3]              │  ← Unread count badge
├──────────────────────────────┤
│  [Avatar] Ben          [▼]   │  ← PersonCard — click for account menu
│  🏠 Household  ⇌  👤 Mine   │  ← Persistent view toggle [FR-P-006]
└──────────────────────────────┘
```

**Nav item:** full-width button, height 44px, padding `--space-2 --space-3`.
Leading icon + label. `--radius-md`.
- Default: `--color-text-secondary`
- Hover: `--color-surface-hover`
- Active: `background: --color-primary-muted`; text `--color-primary`; left accent bar 3px

**Collapsed (icon-only, tablet):** Icons only, 64px wide. Tooltip on hover shows label.

**View toggle (bottom):** Pill toggle between "Household" and "My Finances".
Persists via `Person.default_view` [FR-P-006]. Active mode highlighted with
`--color-primary-muted` background.

> **No detail panel exists in this application.** All entity inspection and editing
> is performed in the EntityModal (edit modal). There is no separate detail/side panel.
> This is a deliberate design decision — the modal is the single surface for
> create, edit, and focused inspection.

### 5.3 Topbar

Height 64px. `background: --color-surface`. Bottom border `--color-border`.

Left: page title (h1, `--text-xl --font-semibold`).
Centre: VisualizationFilter quick controls (time range preset + currency mode toggle).
Right: alert bell (with unread count badge) + PersonAvatar (opens account menu on click).

**Scrollable filter controls (mobile and overflow):**
On viewports where the filter controls overflow the topbar (tablet portrait, mobile),
the centre filter bar becomes a horizontally scrollable strip with hidden scrollbar.
`overflow-x: auto; scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch`.
Each filter chip snaps on scroll. A fade gradient on the right edge indicates more
controls are available. On very small screens (< 480px), the centre controls collapse
to a single "Filters" pill button that opens a full-screen filter drawer.

**Account menu** (popover): display name, email, display currency selector, logout.

### 5.4 Breadcrumb Trail

Shown below topbar when VisualizationFilter has active drill-down filters.
Each filter chip: entity name + value + × to dismiss.
"Clear all filters" link on the right.

```
Budgets › Food › August 2026 ×    [Clear all]
```

### 5.5 Tabs

Horizontal tab bar. Underline indicator (`--color-primary`, 2px). Active tab text `--color-text`.
Inactive tab text `--color-text-secondary`. Hover: `--color-text`.
Transition on indicator: `--duration-normal --ease-default`.

### 5.6 Pagination

Previous / Next buttons + page number buttons. Current page: `--color-primary` background.
Ellipsis (`…`) for large page ranges. Shows total record count on the right.

### 5.7 Keyboard Shortcuts

Global shortcuts (shown in a ⌨ help modal triggered by `?`):

| Shortcut | Action |
|---|---|
| `N` | New entity — opens Create modal for the current module |
| `E` | Edit selected entity — opens Edit modal |
| `⌘D` / `Ctrl+D` | Duplicate selected entity |
| `⌘C` / `Ctrl+C` | Copy selected entity (holds in clipboard for paste) |
| `⌘V` / `Ctrl+V` | Paste — creates a duplicate from clipboard-held entity |
| `⌫` / `Delete` | Archive selected entity (triggers confirmation dialog) |
| `⌘⌫` / `Ctrl+Delete` | Permanent delete (only available in archived view) |
| `⌘A` / `Ctrl+A` | Select all visible entities (activates multi-select) |
| `Escape` | Close modal / drawer / deselect all |
| `/` | Focus search input |
| `?` | Open keyboard shortcuts help modal |
| `1–9` | Navigate to module by number (1=Dashboard, 2=Transactions, etc.) |

**Context-specific (Transactions module):**

| Shortcut | Action |
|---|---|
| `R` | Mark selected as reconciled |
| `S` | Toggle shared expense flag on selected |

**Copy behaviour:** `⌘C` on a selected entity copies its key fields to a clipboard
object (internal app clipboard, not OS clipboard). `⌘V` opens the Create modal
pre-filled with the copied values — the user can modify before saving.
This is equivalent to Duplicate but with a deliberate edit step.

---

## 6. Feedback & State Components (Layer 6)

### 6.1 Toast Notification

Appears top-right (desktop) or top-centre (mobile). Slides in from above.
Auto-dismisses after 4s (success/info) or 8s (error). Manual × dismiss always available.
Max 3 toasts stacked. Older toasts slide up when new one appears.

| Variant | Icon | Border accent |
|---|---|---|
| `success` | CheckCircle2 | `--color-success` |
| `warning` | AlertTriangle | `--color-warning` |
| `error` | XCircle | `--color-error` |
| `info` | Info | `--color-info` |

Animation: `translateY(-100%) opacity(0) → translateY(0) opacity(1)`, `--duration-normal --ease-bounce`.

### 6.2 Alert Banner

Full-width persistent banner. Shown at page top. Dismissible.
Same variants as Toast. Used for: FX rate stale, system alerts, import results.

### 6.3 In-App Alert Panel

Bell icon in topbar. Unread count badge (max "9+"). Click opens a drawer from right.

Each alert item: icon + title + description + time ago + entity link + × dismiss.
Groups: Today / This week / Older.

Variants and their icons:
- `BUDGET_WARNING`: `TrendingUp` amber
- `BUDGET_EXCEEDED`: `AlertTriangle` red
- `RECURRING_MISSED`: `Calendar` red
- `UPCOMING_PAYMENTS`: `Clock` blue
- `FX_RATE_STALE`: `RefreshCw` amber
- `SYSTEM_ALERT`: `AlertOctagon` red

### 6.4 Progress Bar

**Linear:** Full-width bar. Background track `--color-border`. Fill `--color-primary`.
`--radius-full`. Height 8px (default) or 4px (compact).
Animated fill on mount: width 0 → actual, `--duration-slow --ease-out`.

**Budget progress bar (entity-specific):**
- 0–79% fill: `--color-success`
- 80–99% fill: `--color-warning` (threshold reached)
- 100%+: `--color-error` (exceeded); bar capped at 100% visually but shows % label

```
Food Budget — August
███████████████░░░░░░  SGD 1,240 / 1,500  (82.7%)  ⚠
```

### 6.5 Skeleton Loader

Placeholder shown while data is loading. Matches the shape of the real content.
Uses `background: linear-gradient(90deg, --color-surface-raised, --color-surface-hover, --color-surface-raised)`.
Background-size 200%. Animation: shimmer sweep left-to-right, 1.5s ease infinite.
Respects `prefers-reduced-motion` (static grey if set).

Shapes defined per component:
- `SkeletonCard`: card shape with 3 text lines
- `SkeletonTableRow`: row with 5 varying-width rectangles
- `SkeletonChart`: rectangle + axis lines
- `SkeletonStat`: large number + label below

### 6.6 Empty State

Shown when a query returns zero results. Centred in its container.

```
      [Icon — 48px, --color-text-muted]
      No transactions yet
      Add your first transaction to get started.
      [Button — primary action]
```

Icon chosen contextually: `Receipt` for transactions, `Building2` for accounts, etc.
Title: `--text-lg --font-semibold`. Description: `--color-text-secondary`.
Optional primary action button.

**Filtered empty state** (results exist but filter returned none):
"No results match your current filters." + "Clear filters" link.

### 6.7 Error State

Shown when an API call fails.

```
      [AlertCircle — 48px, --color-error]
      Something went wrong
      Error loading transactions. Please try again.
      [Button — "Retry" — secondary]
```

### 6.8 Confirmation Dialog

Modal variant (max 400px). Used for: Archive, Delete, Base Currency Change.

```
[AlertTriangle icon — --color-warning]
Archive this account?

This account and its history will be hidden from all views.
You can restore it from the archived section at any time.

                     [Cancel — secondary]  [Archive — danger]
```

Delete variant uses `--color-error` icon and danger button labelled "Delete permanently".

### 6.9 Loading Overlay

Full-panel overlay with centred spinner + optional message.
Used during: CSV import confirmation, base currency recalculation, initial page load.
`background: rgb(9 9 15 / 0.8)`. Spinner size: `lg` (40px).

---

## 7. Data Visualisation Components (Layer 7)

All charts use **Recharts**. All respect the VisualizationFilter [EDP §13.5].
All support raw and converted currency modes [FR-CU-008].
All animate on mount (draw-in). All have a loading state (SkeletonChart).

### 7.0 Element Selection — "Pop" Focus Effect

When any chart segment, bar, or data point is selected (clicked for drill-down),
the selected element **pops** to indicate selection, and surrounding elements dim.

**Pop behaviour:**
- Selected element: `scale(1.08)`, `filter: brightness(1.2)`, `--shadow-glow-primary`
  (or `--shadow-xl` with entity accent colour). `z-index: --z-raised`.
  Transition: `--duration-fast --ease-bounce`.
- Unselected siblings: `opacity: 0.45`, `filter: saturate(0.4)`.
  Transition: `--duration-normal`.
- Selected state persists while drill-down filter is active.
- On deselect (breadcrumb dismiss): all elements return to full opacity and scale.
  Transition: `--duration-normal --ease-out`.

**In tables and card lists:**
- Selected row/card: `scale(1.02)` + `--shadow-md` + `--color-primary-muted` background.
  Left border `--color-primary` (4px).
- Other rows: `opacity: 0.65`.
- Selected state does NOT activate drill-down on its own — requires an explicit
  action (click context menu, press E) or is cleared by clicking elsewhere.

### 7.1 Line Chart

Used for: net worth over time, account balance history, debt trend, forex loss trend,
budget history, capital history, asset valuation history.

- Smooth curves (`type="monotone"`)
- Grid lines: `--color-border` at 40% opacity, horizontal only
- Axes: `--text-xs --color-text-muted`; x-axis dates in `DD-MM-YYYY` abbreviated
- Dot: 4px circle on data points; 6px on hover
- Tooltip: `--color-surface-overlay` card; formatted values + dates
- Multi-line: one colour per series from `--chart-*` palette; legend below chart
- Area variant: line + semi-transparent fill (10% opacity) for balance charts

### 7.2 Bar Chart

Used for: income vs expenses, budget vs actual, comparison modes.

- Grouped (side-by-side) or stacked variants
- Bar width adapts to number of data points (min 8px, max 48px)
- Corner radius: `--radius-sm` on top corners
- Hover: bar brightens + tooltip
- Raw currency mode: bars stacked by currency, each currency a colour from `--chart-*`
- `ReferenceLine` for budget limit (dashed, `--color-warning`)

### 7.3 Donut / Pie Chart

Used for: spending by category, asset allocation, income sources.

- Inner radius 60% of outer (donut)
- Segment hover: slightly enlarges (`scale(1.05)`) + tooltip
- Centre label (donut): total amount in display currency
- Legend: right of chart on desktop; below on mobile
- Max segments shown: 8; remaining grouped as "Other"
- Clicking a segment: applies VisualizationFilter for that category [FR-V-002]

### 7.4 Stacked Area Chart

Used for: portfolio value over time (allocation breakdown), spending trends.

- Semi-transparent fills (25% opacity); solid top line per series
- Colour per series from `--chart-*`
- Hover: vertical cursor line + multi-value tooltip

### 7.5 Sparkline

Tiny inline chart. 80×32px. No axes, no labels.
Used inside: AccountCard balance trend, PersonCard spending trend.
Colour: green if trending up (positive for assets), red if trending down.

### 7.6 Stat Card (KPI Card)

Dashboard summary cards.

```
┌─────────────────────────────┐
│ Net Worth          ↑ 3.2%   │
│ SGD 142,450.00              │
│ ▁▂▃▄▅▆▇ (sparkline)        │
└─────────────────────────────┘
```

- Title: `--text-sm --color-text-secondary`
- Value: `--text-3xl --font-bold --font-mono`
- Trend badge: `↑` green or `↓` red + percentage change
- Sparkline: optional, 80×24px

### 7.7 Budget Progress Bar (Visualisation)

Expanded version of the feedback progress bar for the Budgets module.

Each budget row:
```
Food         ████████████████░░░░  SGD 1,240 / 1,500  (82.7%)  ⚠ WARNING
             [click to drill down → Level 2]
```

Colour coding matches budget status (success/warning/error).
Clicking the bar triggers Level 2 drill-down [FR-B-006].

### 7.8 Forex Delta Visualisation

Inline on foreign currency transactions. Shows the forex loss/gain as a chip.

- Loss (positive delta): `--color-error-muted` background; `Δ +SGD 12.30` in `--color-error`
- Zero / gain: `--color-success-muted` background; `Δ 0.00` in `--color-text-muted`

Aggregate forex loss chart: line chart over time, axis = `fx_delta` sum per period.

### 7.9 Comparison Charts

**Person comparison (grouped bar):**
One bar per person per category. Bars grouped by category.
Person colours: first 4 entries from `--chart-*`. Legend shows person avatars.

**Category comparison (multi-line):**
One line per category. Colours from entity colour or `--chart-*`.
X-axis = time periods; Y-axis = amount in display currency.

Both support drill-down: clicking a bar/point filters to that person+category or category+period.

### 7.10 Recurring Payment Calendar

Monthly calendar grid. Each day cell shows upcoming occurrence dots.

- Upcoming: `--color-entity-recurring` dot
- Processed: `--color-success` dot
- Missed: `--color-error` dot
- Multiple occurrences: stacked dots (max 3, then "+N")

Clicking a dot opens a popover with the recurring payment name, amount, and status.

---

## 8. Scrollbars (Layer 8)

Custom styled across all scrollable containers. Applied globally via `::webkit-scrollbar`.

```css
::-webkit-scrollbar        { width: 6px; height: 6px; }
::-webkit-scrollbar-track  { background: transparent; }
::-webkit-scrollbar-thumb  { background: var(--color-border-strong);
                              border-radius: var(--radius-full); }
::-webkit-scrollbar-thumb:hover { background: var(--color-text-muted); }
```

Firefox: `scrollbar-width: thin; scrollbar-color: var(--color-border-strong) transparent;`

Scrollbars fade to transparent on idle (using opacity transition with 2s delay).
Reappear on hover over scrollable container.

---

## 9. Entity-Specific Components (Layer 9)

### 9.1 EntityCard\<T\> [EDP §14.3]

Generic card component. All entity cards inherit from this.

**Anatomy:**
```
┌──────────────────────────────────────────────────────┐
│▌ [Icon]  Name                    [Amount] [Status]   │
│  [Secondary info — date, owner, category]             │
│  [Meta row — formula hover, tags] [Context menu ···] │
└──────────────────────────────────────────────────────┘
```

Left accent bar: 4px, `var(--entity-accent)`.
Context menu (⋯) appears on row hover. Contains standard entity operations.
Status badge right-aligned.
Archived cards: muted opacity (60%), dashed border, "[Archived]" badge.

### 9.2 EntityModal\<T\> [EDP §14.3]

Generic create/edit modal. Header colour uses `var(--entity-accent)` as a subtle top border.

**Form layout:**
- Two-column grid on desktop (> 600px); single column on mobile
- Full-width fields: Name, Notes, MonetaryValue
- Half-width fields: Date, Category, Status, Payee, PaymentMethod
- Section dividers for MonetaryValue block and optional fields

**Footer:** "Cancel" (secondary) + "Save" (primary) / "Create" on create modal.
"Saving…" loading state on submit.

### 9.3 EntityPage\<T\> [EDP §14.4]

Standard module page layout.

```
┌─────────────────────────────────────────────────────┐
│ [Page Title]                    [+ Create] [⋯ More] │ ← Action bar
├─────────────────────────────────────────────────────┤
│ [VisualizationFilterBar]                             │ ← Filter controls
├─────────────────────────────────────────────────────┤
│ [Extension slot — chart panel or summary cards]      │ ← Optional entity-specific
├─────────────────────────────────────────────────────┤
│ [EntityCard list / Table]                            │ ← Main content
│  ...                                                 │
└─────────────────────────────────────────────────────┘
```

"Show archived" toggle in the action bar. Archived entities shown with visual distinction.

### 9.4 MonetaryValue Component [EDP §3.2]

Display variant (in cards and tables):
```
SGD 1,234.56
≈ NZD 2,156.23   Δ +4.30
```

Primary amount: `--font-mono --font-semibold --text-base`.
Conversion line: `--text-xs --color-text-muted`.
`fx_delta`: inline chip (§7.8) — only shown when non-zero.

Entry variant: see §3.9.

### 9.5 PersonCard

Used in: sidebar (current user), PersonDashboard header, AccountOwner list.

```
┌──────────────────────────────────┐
│ [Avatar 40px]  Ben               │
│                Owner · SGD       │
└──────────────────────────────────┘
```

Clicking opens PersonDashboard or account menu depending on context.

**PersonDashboard Header (expanded):**
```
┌──────────────────────────────────────────────────────┐
│ [Avatar 56px]  Ben               [Household ⇌ Mine]  │
│                Last active: today                     │
│  Net worth: SGD 142,450   Income: SGD 8,200           │
└──────────────────────────────────────────────────────┘
```

Toggle between Household and My Finances view [FR-P-006]. Persists via `Person.default_view`.

### 9.6 DebtSummaryView

Dashboard widget and standalone Debt section.

```
┌──────────────────────────────────────┐
│ 💳 Credit Card Debt                  │
│  DBS Card          SGD 1,240.00 [→]  │
│  OCBC Card         SGD   320.50 [→]  │
├──────────────────────────────────────┤
│ 🏠 Internal Household Debt           │
│  Ben owes Kim      SGD   450.00 [→]  │
├──────────────────────────────────────┤
│ Total Debt         SGD 2,010.50      │
└──────────────────────────────────────┘
```

[→] button navigates to drill-down transaction list [FR-D-007].

---

## 10. Animation System (Layer 10)

### 10.1 Page Transitions

Route changes: `opacity: 0 → 1`, `translateY: 8px → 0`. Duration: `--duration-slow`.
Easing: `--ease-out`. Triggered on route mount.

### 10.2 Component Mount / Unmount

**Modals and Drawers:**
- Mount: `opacity: 0 scale(0.95) → opacity: 1 scale(1)`, `--duration-normal --ease-bounce`
- Unmount: `opacity: 1 → opacity: 0 scale(0.95)`, `--duration-fast --ease-in`
- Backdrop: `opacity: 0 → 0.7`, `--duration-normal`

**Dropdowns and Popovers:**
- Mount: `opacity: 0 translateY(-4px) → opacity: 1 translateY(0)`, `--duration-fast --ease-out`
- Unmount: `opacity: 1 → opacity: 0`, `--duration-instant`

**Toast:**
- Mount: `opacity: 0 translateY(-100%) → opacity: 1 translateY(0)`, `--duration-normal --ease-bounce`
- Unmount: `opacity: 1 translateX(0) → opacity: 0 translateX(100%)`, `--duration-fast --ease-in`

**Accordion:**
- Open: height `0 → auto` via `grid-template-rows: 0fr → 1fr`, `--duration-normal`
- Close: reverse

### 10.3 Micro-animations

| Interaction | Animation |
|---|---|
| Button press | `scale(0.97)`, `--duration-instant` |
| Card hover | `translateY(-2px)` + shadow increase, `--duration-fast` |
| Toggle switch | Thumb slide + track colour change, `--duration-normal` |
| Checkbox check | SVG checkmark draws in (stroke-dashoffset), `--duration-fast` |
| Success action (save) | Brief `scale(1.05)` pulse on the saved element, `--duration-normal` |
| Error shake | `translateX(-4px → 4px → -4px → 0)` × 3, `--duration-fast` |
| Number increment | Counter rolls up digit by digit (for stat cards), `--duration-slow` |

### 10.4 Chart Animations

All chart animations run once on mount. Re-querying data uses a fade + update morph.

| Chart type | Mount animation |
|---|---|
| Line / Area | Stroke draws from left to right (`stroke-dashoffset`), `--duration-slower` |
| Bar | Bars grow from 0 to full height, staggered by 30ms per bar, `--duration-slow --ease-bounce` |
| Donut | Segments sweep clockwise from 0°, staggered, `--duration-slow --ease-out` |
| Sparkline | Line draws left to right, `--duration-normal` |
| Budget progress bar | Fill width grows from 0%, `--duration-slow --ease-out` |
| Stat card number | Counts up from 0 to final value, `--duration-slower` |

**Data update (filter change):** New data morphs smoothly into position.
Lines interpolate through intermediate points. Bars animate to new heights.
Duration: `--duration-normal`. No flash or jump.

**3D Perspective and Floating Idle Animation:**

All chart containers have a subtle 3D tilt and a gentle floating idle animation,
as though the charts are physical objects floating slightly above the page surface.

```css
/* Base 3D perspective — applied to all chart wrapper divs */
.chart-wrapper {
  transform-style: preserve-3d;
  perspective: 1200px;
}

/* Idle state — slight angle, as if viewed from above-left */
.chart-3d {
  transform: perspective(1200px) rotateX(6deg) rotateY(-3deg) translateZ(0);
  transition: transform var(--duration-slow) var(--ease-out);
  animation: chart-float 6s var(--ease-default) infinite;
}

/* Gentle float: subtle vertical bob + micro-rotation variance */
@keyframes chart-float {
  0%   { transform: perspective(1200px) rotateX(6deg)   rotateY(-3deg) translateY(0px); }
  33%  { transform: perspective(1200px) rotateX(5.5deg) rotateY(-2deg) translateY(-4px); }
  66%  { transform: perspective(1200px) rotateX(6.5deg) rotateY(-4deg) translateY(-2px); }
  100% { transform: perspective(1200px) rotateX(6deg)   rotateY(-3deg) translateY(0px); }
}

/* Selected / focused state — flattens to face-on, scales slightly, re-glows */
.chart-3d.is-selected {
  animation: none;  /* Pause idle float */
  transform: perspective(1200px) rotateX(0deg) rotateY(0deg)
             translateZ(16px) scale(1.03);
  box-shadow: var(--shadow-glow-primary), var(--shadow-xl);
  transition: transform var(--duration-slow) var(--ease-bounce),
              box-shadow var(--duration-normal);
}

/* After interaction resolves, return to idle float */
.chart-3d.returning {
  animation: chart-return-to-float 0.8s var(--ease-bounce) forwards,
             chart-float 6s var(--ease-default) var(--duration-slow) infinite;
}
@keyframes chart-return-to-float {
  from { transform: perspective(1200px) rotateX(0deg) rotateY(0deg) translateZ(16px) scale(1.03); }
  to   { transform: perspective(1200px) rotateX(6deg) rotateY(-3deg) translateY(0px); }
}
```

**Interaction sequence:**
1. Page loads → charts mount with draw-in animation (§10.4 table above)
2. After mount completes → idle float begins (`chart-float`, 6s loop)
3. User clicks a chart segment → float pauses; chart snaps to face-on focus state
4. User drill-down occurs; chart may re-render with filtered data
5. On filter dismiss or deselect → `chart-return-to-float` plays once, then idle float resumes

**3D angle is subtle by design.** `rotateX(6deg) rotateY(-3deg)` is barely perceptible
— enough to convey depth and physicality without making axes unreadable or the chart
appear distorted. The float amplitude (4px) is gentle — calming, not distracting.

**Performance note:** The floating animation uses `transform` and `will-change: transform`
only — no layout or paint triggers. 60fps on modern hardware.

**Reduced motion:** When `prefers-reduced-motion: reduce`, both the 3D tilt and float
animation are disabled. Charts render flat and stationary. The selected state still
applies a subtle `scale(1.02)` as the only transform.

### 10.5 Reduced Motion

All animations check `prefers-reduced-motion: reduce`. When set:
- All transitions set to `--duration-instant` (effectively immediate)
- Chart draw-in animations disabled — charts appear fully rendered
- Number count-up disabled — stat values appear directly
- Skeleton shimmer pauses (static grey)
- Toast and modal still appear/disappear but without transform animations
- **3D chart tilt and floating idle animation fully disabled** — charts render flat and stationary
- Chart selection state: only `scale(1.02)` applies; no glow or translateZ

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 1ms !important;
    transition-duration: 1ms !important;
  }
  .chart-3d,
  .chart-3d.is-selected,
  .chart-3d.returning {
    transform: none !important;
    animation: none !important;
  }
}
```

---

## 11. Accessibility (Layer 11)

### 11.1 WCAG 2.1 Level AA Compliance

| Criterion | Requirement | Implementation |
|---|---|---|
| 1.4.3 Contrast | 4.5:1 for normal text; 3:1 for large text | All token combinations verified |
| 1.4.11 Non-text contrast | 3:1 for UI components and charts | Borders, icons, chart lines verified |
| 1.4.4 Resize text | Functional at 200% zoom | Rem-based sizes; no fixed-pixel text |
| 2.1.1 Keyboard | All functionality operable by keyboard | Tested with no mouse |
| 2.4.3 Focus order | Logical tab order | DOM order = visual order |
| 2.4.7 Focus visible | Visible focus indicator on all elements | `--color-border-focus` outline |
| 3.3.1 Error identification | Errors described in text | Error messages below inputs |
| 4.1.2 Name, role, value | All interactive elements have ARIA labels | Linting enforced |

### 11.2 Keyboard Navigation Map

| Key | Context | Action |
|---|---|---|
| `Tab` | Global | Move focus forward |
| `Shift+Tab` | Global | Move focus backward |
| `Enter` / `Space` | Buttons, checkboxes | Activate |
| `Escape` | Modal, Drawer, Dropdown | Close |
| `ArrowDown` / `ArrowUp` | Dropdown, Select | Navigate options |
| `Home` / `End` | Dropdown | First / last option |
| `ArrowLeft` / `ArrowRight` | Date picker, Tabs | Navigate |
| `Enter` | Date picker | Select date |
| `?` | Global | Open keyboard shortcuts help |

### 11.3 Focus Management

- On modal open: focus moves to first interactive element inside modal
- On modal close: focus returns to the element that triggered the modal
- On route change: focus moves to page heading (`<h1>`)
- Focus trap active inside modals and drawers

### 11.4 ARIA Patterns

- `role="dialog"` + `aria-modal="true"` + `aria-labelledby` on all modals
- `role="alertdialog"` on confirmation dialogs
- `aria-live="polite"` on toast notification region
- `aria-live="assertive"` on error messages
- `aria-expanded` on accordions, dropdowns
- `aria-selected` on tab items
- `aria-current="page"` on active sidebar nav item
- `aria-label` on all icon-only buttons (e.g. "Close modal", "Delete transaction")
- `aria-describedby` linking inputs to their helper/error text
- `role="status"` on loading overlays with `aria-label="Loading…"`
- Chart containers: `role="img"` + `aria-label` describing chart purpose and key values

### 11.5 Colour-Blind Safe Palette

The 8-colour chart palette is verified against Deuteranopia (red-green), Protanopia
(red-green), and Tritanopia (blue-yellow) using simulation tools. Verified combinations:

All charts use both colour AND pattern (or shape) to distinguish data series where
possible. Line charts use different stroke-dasharray patterns per series (solid,
dashed, dotted) in addition to colour. Bar charts use distinct hatching patterns in
high-contrast mode.

### 11.6 Touch Targets (Mobile)

All interactive elements have a minimum touch target of **44×44px** on mobile viewports.
Visually smaller elements (e.g. 24px icons) have invisible padding to reach the minimum.

---

## 12. Responsive Layout

### 12.1 Breakpoint Behaviour

| Viewport | Layout | Sidebar | Charts |
|---|---|---|---|
| ≥ 1280px (Desktop) | Full two-column shell | Full (240px) | Full-size; side-by-side |
| 1024–1279px (Laptop) | Two-column shell | Full (240px) | Condensed; stacked |
| 768–1023px (Tablet) | Two-column; sidebar icon-only | Icon-only (64px) | Single column |
| < 768px (Mobile) | Single column; bottom nav | Hidden; bottom bar | Full-width; scrollable |

### 12.2 Module-Specific Responsive Rules

- **Tables:** Collapse to card-list view on mobile. No horizontal scroll.
- **Modals:** Full-width bottom sheet on mobile (slides up from bottom).
- **Drawers:** Full-width on mobile.
- **Charts:** Minimum height 200px. Recharts `ResponsiveContainer` wraps all charts.
- **Comparison charts:** Side-by-side on desktop; stacked on mobile.
- **MonetaryValue entry:** Stacked (currency above amount) on mobile.
- **EntityCard:** Two columns on tablet/desktop grid; single column on mobile.

---

## Revision History

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-05-23 | Ben + BMAD | Initial UX spec — partial component list |
| 2.0 | 2026-05-26 | Ben + Claude | Full rewrite — all 11 layers. See Phase 5 completion note. |
| 2.1 | 2026-05-26 | Ben + Claude | §2.8 Divider: 3 variants specified (horizontal, vertical, labelled section). §4.9 Drag and Drop: lift effect, ghost placeholder, drop zones, touch support, keyboard drag. §4.10 Multi-Select: selection methods, selected appearance, Bulk Action Bar. §5.2 Sidebar: full content inventory, no-detail-panel declaration. §5.3 Topbar: scrollable filter controls on overflow/mobile, collapse to drawer on < 480px. §5.7 Keyboard Shortcuts: copy (⌘C), paste (⌘V), archive (⌫), permanent delete (⌘⌫), duplicate (⌘D), select all (⌘A), module-specific shortcuts added. §7.0 Element Selection Pop: scale + glow + sibling dim effect on chart and list selection. §10.4 Chart Animations: 3D perspective tilt (rotateX 6°, rotateY -3°), gentle 6s floating idle loop, focus-to-flat on selection, return-to-float after interaction, reduced-motion override. |
