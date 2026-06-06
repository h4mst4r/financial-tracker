---
title: Financial Tracker — UX Design Specification
version: 2.11
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

## 0a. Developer Process Standards

These process requirements apply to all frontend stories from Epic 3 onwards (established: Epic 2 Retrospective, 2026-06-01).

### Visual Verification — Part of Done

Before any frontend story is marked Done, the delivered component(s) must be visually verified against this specification, either:

- On the `/design-system` page — use the relevant sub-section as the verification surface, or
- In the app in-context — compare rendered output against the component section referenced in the story's **Ref:** field

Tests passing is necessary but not sufficient. A story with green tests but unverified visual output is **not Done**.

### No Magic Values

All hardcoded colours, opacities, sizes, z-indices, transition durations, and breakpoints that represent design decisions must be named tokens in `frontend/src/index.css`. See §1.9 for the complete utility table. If a value is not listed there, add it before using it in a component.

### CSS Nuances — Document at Story-Close

Every frontend story's Dev Agent Record must include a **"Known CSS / Architecture Nuances"** section capturing any non-obvious behaviour discovered during implementation. Future agents inherit the knowledge, not the bugs.

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
  --color-surface:          #16162a;   /* Sidebar, topbar, main content areas */
  --color-surface-raised:   #1c1c34;   /* Cards, panels, inputs, picker dropdowns */
  --color-surface-hover:    #1e1e38;   /* Full-width list row hover (e.g. dropdown options, table rows) */
  --color-surface-active:   #26264a;   /* Small button hover INSIDE panels (emoji/icon grid, calendar days) — more visible than surface-hover on raised backgrounds */
  --color-surface-overlay:  #222244;   /* Modals, drawers, elevated floating panels */

  /* === BORDERS === */
  --color-border:                #2a2a45;              /* Default border */
  --color-border-light:          #3a3a5c;              /* Hover border */
  --color-border-strong:         #4a4a6a;              /* Focused non-picker inputs */
  --color-border-focus:          #6366f1;              /* Keyboard focus ring — matches primary */
  --color-border-error:          #ef4444;              /* Input error border */
  --color-border-state:          rgb(99 102 241 / 0.3); /* Controls with persistent selection state */
  --color-border-state-subtle:   rgb(99 102 241 / 0.2); /* Internal divider within state controls */

  /* === FOCUS RING GLOWS === */
  --color-glow-primary:    rgb(99 102 241 / 0.2);   /* ring colour: focused text inputs (Input, Checkbox, etc.) */
  --color-glow-accent:     rgb(6 182 212 / 0.2);    /* ring colour: open/focused picker triggers (Dropdown, DatePicker, ColourPicker, EmojiIconPicker) */
  --color-glow-error:      rgb(239 68 68 / 0.2);    /* ring colour: focused error-state inputs */

  /* === BACKDROP === */
  --color-backdrop:        rgb(0 0 0 / 0.7);         /* modal / drawer overlay */

  /* === TEXT === */
  --color-text:             #f1f1f5;   /* Primary text */
  --color-text-secondary:   #9898aa;   /* Labels, captions */
  --color-text-muted:       #606072;   /* Placeholders, disabled labels */
  --color-text-disabled:    #3a3a4a;   /* Disabled content */
  --color-text-inverse:     #ffffff;   /* Text on coloured/accent surfaces (primary buttons, avatar initials, entity-coloured chips). NOT for light backgrounds — use --color-text for standard dark-surface text. */
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

**Focus ring / glow tokens** — used as `ring-2 ring-glow-*` on focused elements:

| Token | Value | Applies to |
|---|---|---|
| `ring-glow-primary` | `rgb(99 102 241 / 0.2)` | Text inputs (`Input`, search fields, hex input in ColourPicker) |
| `ring-glow-accent` | `rgb(6 182 212 / 0.2)` | Picker triggers when open (Dropdown, DatePicker, ColourPicker, EmojiIconPicker); search input inside picker panels |
| `ring-glow-error` | `rgb(239 68 68 / 0.2)` | Any input in error state |

Pattern: `focus:ring-2 focus:ring-glow-primary focus:border-border-focus` (text inputs) or `open ? 'ring-2 ring-glow-accent border-accent' : '...'` (picker triggers). Never mix; pickers use accent (cyan), text inputs use primary (indigo), errors always override with error (red).

**`text-text-inverse` semantics** — white text for coloured backgrounds:

`--color-text-inverse: #ffffff`. Used exclusively on surfaces that have a coloured (non-neutral) background:
- Primary Button text (`bg-primary` → `text-text-inverse`)
- Active SegmentedControl pill (`bg-primary` → `text-text-inverse`)
- Avatar initials on entity-colour backgrounds (`bg-entity-*` → `text-text-inverse`)

Never use `text-text-inverse` on neutral dark surfaces (`bg-surface`, `bg-surface-raised`, etc.) — use `text-text-primary` (#e8e8f0) there. `text-text-inverse` and `text-text-primary` are not interchangeable.

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
  --z-below:    -1;    /* Reserved; no current use */
  --z-base:      0;    /* Normal document flow */
  --z-raised:   10;    /* Cards in hover state (shadow lift) */
  --z-dropdown: 100;   /* Dropdown panels, DatePicker, ColourPicker, EmojiIconPicker */
  --z-sticky:   200;   /* Table <thead> sticky positioning */
  --z-sidebar:  300;   /* Sidebar on mobile overlay */
  --z-modal:    400;   /* Modal backdrop AND modal panel (backdrop is absolute; panel is relative) */
  --z-toast:    500;   /* Toast notifications — above modals */
  --z-tooltip:  600;   /* Tooltips — topmost; always readable */
}
```

**Stacking context rules:**

- **Floating panels** (Dropdown, DatePicker, ColourPicker, EmojiIconPicker) use `createPortal(document.body)` to escape parent `overflow-hidden` containers that would clip them. They receive `position: fixed` + `z-dropdown`.
- **Modal backdrop + panel** both use `z-modal` (400). The backdrop is `fixed inset-0`; the panel is `relative z-modal` inside the backdrop's flex container — not a separate stacking context.
- **Toast container** is rendered in `main.tsx` (outside `<AppShell>`) so it is never trapped by `AppShell`'s overflow-hidden. It is positioned `fixed top-[80px]` — 80px from top to sit below the 64px Topbar with an 16px gap.
- **Tooltip** is always in the DOM (never portalled); visibility is controlled by CSS `opacity` and `transition-delay`. Since it lives inside the component tree it inherits the parent's stacking context — it relies on `z-tooltip` (600) being higher than any ancestor context.
- **Never use raw integers** for z-index. If a new layer is needed, add a named `--z-*` token to `index.css`.

### 1.7 Breakpoints

```css
@theme {
  --breakpoint-xs:  480px;   /* Topbar filter bar collapse threshold (§5.3) */
  --breakpoint-sm:  640px;
  --breakpoint-md:  768px;   /* Sidebar switches to icon-only below this */
  --breakpoint-lg:  1024px;  /* Full sidebar appears above this */
  --breakpoint-xl:  1280px;
  --breakpoint-2xl: 1536px;
}
```

All Tailwind responsive utilities use these named tokens (`xs:`, `sm:`, `md:`, etc.).
Never use arbitrary bracket breakpoints (`min-[480px]:`) — add a named token instead.

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

### 1.9 Component Size Utilities and Interaction Utilities

Named `@utility` classes in `index.css` that encode specific component dimensions and interaction
patterns. **Always prefer these over arbitrary bracket values.** If a needed size doesn't exist,
add it to `index.css` with a semantic name — never inline `w-[320px]` in a component.

| Utility | Value | Used by |
|---------|-------|---------|
| `max-w-tooltip` | 280px | Tooltip bubble |
| `w-date-picker` | 320px | DatePicker calendar panel |
| `max-h-dropdown-list` | 280px | Dropdown scrollable option list |
| `max-w-dropdown-chip` | 10rem | Multi-select chip truncation |
| `w-colour-picker` | 280px | ColourPicker panel |
| `w-emoji-picker` | 480px | EmojiIconPicker panel |
| `w-drawer-sm` | 480px | Drawer (medium) |
| `w-drawer-md` | 600px | Drawer (large) |
| `max-w-dialog-xs` | 400px | ConfirmationDialog |
| `max-w-dialog-sm` | 560px | Modal (small) |
| `max-w-dialog-md` | 720px | Modal (medium) |
| `max-w-dialog-lg` | 960px | Modal (large) |
| `min-h-error-state` | 200px | ErrorBoundary fallback |
| `min-w-toast` / `max-w-toast` | 320px / 400px | Toast notification |
| `min-w-context-menu` | 180px | ContextMenu panel |
| `bg-accent-subtle` | primary at 15% opacity | Nav item active background |
| `bg-control-active` | primary at 20% opacity | Navigation/control tab active background — SegmentedControl, Topbar tabs, view toggles. **NOT for picker panel tabs.** |
| `bg-accent-active` | accent/cyan at 20% opacity | **Active tab inside picker panels only** — ColourPicker (Palette/Hex), EmojiIconPicker (Emojis/Icons). Always paired with `text-accent`. Never use `bg-control-active` inside a picker panel. |
| `ring-glow-accent` | `--color-glow-accent` (cyan 20%) | Open-state ring on picker triggers (Dropdown, DatePicker, ColourPicker, EmojiIconPicker) |
| `bg-entity-accent-muted` | `--entity-accent` at 15% | Badge entity variant background |
| `border-entity-accent` | 4px solid `--entity-accent` | Demo contexts without a conflicting `border` class |
| `text-entity-accent` | `--entity-accent` colour | Badge entity variant text |

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
- `focus`: border `--color-border-focus`; ring `ring-glow-primary` (`--color-glow-primary` = `rgb(99 102 241 / 0.2)`)
- `error`: border `--color-border-error`; ring `ring-glow-error` (`--color-glow-error`); icon slot shows error icon in red
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
| `entity` | `bg-entity-accent-muted` utility (15% opacity, via `--entity-accent` CSS var) | `text-entity-accent` utility (via `--entity-accent` CSS var) |

**Chip (dismissible):** Badge + trailing × button. Used for VisualizationFilter
active filters in breadcrumb trail. Hover on × shows red tint.

### 2.5 Avatar

Circular. Sizes: `sm`=24px, `md`=32px, `lg`=40px, `xl`=56px.

**Image path:** Displays `pictureUrl` (Google profile photo) when available and loads without error. If `pictureUrl` is null, empty, or the `<img>` fires `onError`, falls back to initials.

**Initials algorithm:**
```
"Ben Tan"      → "BT"   (first char of first word + first char of last word, uppercased)
"Kim"          → "KI"   (single word — first 2 chars)
""  / undefined → "?"   (no name available)
```
Split on whitespace; if two or more parts, take `parts[0][0] + parts[last][0]`. If one part, take `parts[0].slice(0, 2)`. Always `.toUpperCase()`.

**Initials fallback background:** `--color-entity-person` (sky blue `#38bdf8`). Text: `--color-text-inverse` (white). This maximises contrast at all avatar sizes without anti-aliasing issues.

**Alt text:** `alt={name ?? 'Avatar'}` on `<img>`; `aria-label={name ?? 'Avatar'}` on the div fallback (`role="img"`).

Archived persons: `grayscale opacity-50`.

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

**CSS-primary implementation** — visibility is driven by CSS `group-hover` and `group-focus-within`
on the wrapper element. The tooltip bubble is always in the DOM; only opacity changes. Never use `setTimeout` or `onMouseEnter/Leave` state — CSS transitions handle show/hide.

Trigger: hover or focus. Delay: 200ms via CSS `transition-delay` (inline style `transitionDelay: '200ms'` on the bubble). Max width: `max-w-tooltip` (280px). Text wrapping: `whitespace-normal break-words` — the bubble wraps at word boundaries and hyphenates long words. Never `whitespace-nowrap` (single-line tooltips silently overflow on long strings). Background: `--color-surface-overlay`. Border: `--color-border-strong`. `--radius-md`. `--shadow-lg`. `--text-xs`. Padding: `--space-2 --space-3`. Arrow pointing to trigger. `z-index: --z-tooltip` (600).

Escape key dismiss: JS listener sets a `dismissed` flag that forces `opacity-0` via `!opacity-0` override until the next hover/focus clears the flag.

**Viewport boundary clamping:** The tooltip is horizontally centred on the trigger by default. When the trigger is near a viewport edge, JS measures the tooltip's rendered width via `requestAnimationFrame` on each show and adjusts the `left` offset so the bubble stays ≥ 8px from the viewport edge. The arrow's horizontal position follows the clamped offset (not always centred on trigger).

**Vertical auto-flip:** Renders above the trigger by default (`bottom-full mb-2`). If space above trigger < tooltip height, JS flips to below (`top-full mt-2`, arrow pointing upward). No `placement` prop needed — always self-corrects. Decision made by comparing `wrapperRect.top` (space above) vs `viewportHeight - wrapperRect.bottom` (space below).

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

### 2.10 Segmented Control

Used for binary or small-N mode toggles that hold **persistent state**. First instance:
the Household / My Finances view toggle in the Sidebar.

**Visual language:**
- Container: `--radius-md`, `border: --color-border-state` (primary at 30% opacity) — the tinted border
  is the visual cue that this control holds state, not just performs a transient action.
  `overflow-hidden` keeps all four border edges pixel-flush regardless of inner content height.
- Background: `--color-bg` (recessed relative to sidebar's `--color-surface`)
- Active pill: `background: --color-primary`, `color: --color-text-inverse`, `font-weight: medium`
- Inactive pill: `color: --color-text-secondary`, hover `--color-surface-hover` — inherits nav item language
- Internal divider between pills: `border: --color-border-state-subtle` (primary at 20% opacity)
- Typography: `--text-sm --font-medium` — same as sidebar nav item labels

**Collapsed variant (icon-only sidebar):** pills stacked vertically; single letter (H / M) per option.
Divider becomes `border-top` instead of `border-left`. Same active/inactive token set.

**Rule:** Every segmented control instance must reference `--color-border-state` for its outer border.
Never use `border-primary/30` or similar arbitrary opacity fractions — these are design decisions,
not implementation details, and belong in named tokens.

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

**Palette mode (default):** Two labelled sections:
1. **Entity colours** — 12 unique entity accent swatches (6-col grid, 28×28px circles, `title` shows entity name). These are the 14 entity accent tokens deduplicated to 12 unique hex values. Selected swatch: `ring-2 ring-offset-1 ring-accent ring-offset-surface-raised` — uses design tokens, never `ring-white/80` (magic value).
2. **Extended palette** — 16 curated general-purpose swatches (8-col grid) for categories and custom entities that don't match an entity type.

**Hex mode:** Text input for `#RRGGBB` value. Live preview swatch left of input. Validates on blur — rejects non-hex values.

Trigger renders the selected colour as a filled circle + hex value. Trigger placeholder: closed shows current value; no empty state (always has a default colour).

**Swatch buttons:** `focus:outline-none` — browser default focus rings must be suppressed. The `ring-accent ring-offset-surface-raised` selected indicator is visible against any swatch colour without using a magic value.

**Token alignment (must match Dropdown / DatePicker / EmojiIconPicker):**
- Trigger open state: `border-accent ring-2 ring-glow-accent` — cyan. Using `border-primary` or `ring-glow-primary` is incorrect.
- **Panel tabs (Palette / Hex) active state: `bg-accent-active text-accent font-medium`** — cyan. The picker panel is an accent-themed context; indigo (`bg-control-active text-primary`) is for navigation/control tabs, NOT picker panel tabs. This is the `bg-accent-active` utility's primary use case.
- Panel tabs inactive state: `text-text-secondary hover:text-text-primary hover:bg-surface-active` — `text-text-muted` is too dark for interactive text on dark backgrounds (~1.9:1 contrast).
- Hex text input focus: `border-border-focus ring-glow-primary` — text input, follows TextInput convention (indigo).

### 3.8 Emoji / Icon Picker

Used for category icons. Trigger: shows current emoji/icon in a pill button.

**Picker panel:** `w-emoji-picker` (480px, matches Drawer `md` width for visual consistency).
- Search bar at top (searches emoji names and icon names in real time)
- Tabbed: Emojis | Icons (Lucide subset)
- **Grid button hover: `bg-surface-active`** — `bg-surface-hover` is nearly invisible on `bg-surface-raised` panels (delta: #1c1c34 → #1e1e38 = 4 per channel). Use `bg-surface-active` (#26264a) for small items inside panels.
- `title` attribute on each button shows name on hover
- Recently used: top row of 10 most recently selected (component state); shown when not searching

**Emojis tab — 8 grouped sections (~160 emojis, 10 columns, sticky section headers):**
Finance · Food & Drink · Home & Utilities · Transport · Health & Fitness · Shopping & Lifestyle · Entertainment · Education & Work

**Icons tab — 9 grouped Lucide sections (~86 icons, 8 columns, sticky section headers):**
Finance · Home & Utilities · Food & Drink · Transport · Health · Shopping · Entertainment · Work · General

Finance section leads in both tabs since this is a financial tracker. Scroll area: `max-h-56`.

**Trigger placeholder:** When no value is selected, show `Pick emoji or icon…` in `text-text-muted`. Never just "Select" — the placeholder must communicate what kind of content is being selected.

**Clear button:** When a value is selected and the picker is closed, show an X button on the trigger (right side, `<span role="button">` to avoid nesting `<button>` inside `<button>`). Clicking clears the selection (calls `onChange('', 'emoji')`).

**Icon buttons inside panel:** `focus:outline-none` on all emoji and icon buttons — browser default focus rings must be suppressed.

**Token alignment (must match Dropdown / DatePicker / ColourPicker):**
- Trigger open state: `border-accent ring-2 ring-glow-accent` — cyan. Never raw `ring-accent/20`.
- **Panel tabs (Emojis / Icons) active state: `bg-accent-active text-accent font-medium`** — cyan. Matches ColourPicker tabs. `bg-control-active text-primary` (indigo) is for navigation tabs, not picker panel tabs.
- Panel tabs inactive state: `text-text-secondary hover:text-text-primary hover:bg-surface-active`.
- Search input focus: `border-accent ring-glow-accent` — search is within the picker context; inherits accent colour.

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
Left border accent: **inline style** `borderLeft: '4px solid var(--entity-accent)'` — set directly
on the Card element alongside `--entity-accent` CSS var. Inline style is used rather than the
`border-entity-accent` utility because Tailwind's `border-width: 1px` shorthand (applied by the
`border` class in the Card variant) can override CSS utility longhands via cascade ordering.
Colour set by entity type [EDP §14.5]. Never hardcode the hex color directly — always use the CSS var.

**Card variants:**
- `default`: base styles
- `stat`: larger, centred content, used for KPI dashboard cards
- `elevated`: `background: --color-surface-raised`; always has shadow
- `ghost`: no background, no border; used inside modals

### 4.2 Modal / Dialog

Centred overlay. Backdrop: `background: rgb(0 0 0 / 0.7)`, `backdrop-filter: blur(4px)`.
Panel: `background: --color-surface-overlay`, `--radius-xl`, `--shadow-xl`.
Max-width: 560px (sm), 720px (md), 960px (lg). Width: `calc(100vw - 2rem)` on mobile.

**Anatomy (titled modals):**
- Header: title (left) + close button × (right); `padding: --space-5 --space-6`; border-bottom
- Body: scrollable; `padding: --space-6`; max-height 60vh
- Footer: right-aligned action buttons; `padding: --space-4 --space-6`; border-top

**Headerless modals (no title):** When no title is provided (e.g. `ConfirmationDialog`), the
header strip and border-bottom are omitted entirely. The × close button is positioned absolutely
at `top-3 right-3`. The consuming component provides its own heading with `id="modal-title"`
so `aria-labelledby` resolves correctly. This prevents the visual artefact of an empty dark
header band making the body appear as a separate, lighter surface.

**Form controls inside modals:** Inputs and dropdowns use `--color-surface-raised` (#1c1c34),
which is darker than the modal background (`--color-surface-overlay`, #222244). This creates
an intentional recessed/basin affordance — the darker field clearly demarcates where the user
types or selects. Do not change input tokens to match the overlay. See EDP §14.6.

**Dirty-guard banner:** When a form modal has unsaved changes and the user clicks × or the backdrop, an inline banner appears inside the modal above the body (not a `window.confirm` dialog): `bg-warning-muted border border-warning/30 rounded-md px-3 py-2 text-sm text-warning`. It asks "You have unsaved changes. Leave anyway?" with "Discard" (secondary) and "Keep editing" (primary) buttons. Only shown when the consumer passes `isDirty={true}`.

**Sizes:**
| Size | Max width | Used by |
|---|---|---|
| `xs` | 400px (`max-w-dialog-xs`) | ConfirmationDialog |
| `sm` | 560px (`max-w-dialog-sm`) | Default form modals |
| `md` | 720px (`max-w-dialog-md`) | Wide entity modals |
| `lg` | 960px (`max-w-dialog-lg`) | Complex forms, preview modals |
| `fullscreen` | 100vw / 100vh, no radius | Mobile-optimised views |

**Mobile bottom-sheet (below `md` breakpoint):** On narrow viewports, the modal container uses `items-end` instead of `items-center` — the panel slides up from the bottom edge. The panel receives `rounded-t-xl` only (no bottom radius). This mirrors native mobile sheet behaviour.

**Variants:**
- `form`: standard entity create/edit modal — always titled
- `confirmation`: `ConfirmationDialog` component — always headerless; `size="xs"` (max 400px)
- `fullscreen`: no max-width; full viewport on mobile

**Close behaviour:** × button, Escape key, or backdrop click. Unsaved changes trigger the dirty-guard banner (see above).

**Focus trap:** Tab key cycles only through modal content while open. On open,
focus moves to first interactive element. On close, focus returns to trigger.

### 4.3 Drawer / Side Panel

Slides in from the right. Width: 480px (md), 600px (lg). Full-width on mobile.
Panel: `background: --color-surface-overlay` (same as Modal — NOT `--color-surface`).
Backdrop same as Modal. Header + scrollable body + optional footer.

**Form controls inside drawers:** Same recessed-basin rule as Modal (EDP §14.6 Rule 2) — inputs use
`--color-surface-raised` (#1c1c34), which is darker than the drawer's `--color-surface-overlay` (#222244),
creating a visible inset. Using `--color-surface` for the drawer panel instead would invert this relationship
and make inputs appear elevated (lighter than the panel) — incorrect.

Used for: entity detail views, filter panels, import preview.

Animation: `translateX(100%) → translateX(0)`, `--duration-slow --ease-out`.

### 4.4 Accordion / Collapsible

Header row (full-width button): `background: --color-surface`, label + ChevronDown icon (rotates 180° when open).
Body: `background: --color-surface` (same as header — content is revealed within the container, not floating above it);
`border-top: --color-border`; padding `--space-4`.
Collapses/expands with height animation (`--duration-normal --ease-default`).
Used for: Settings sections, formula variable editors.

**Background rule:** The content area always uses the same token as the header (`--color-surface`). Using
`--color-surface-raised` for the body creates a "floats above" appearance that implies incorrect depth — the
content is inside the accordion item, not elevated relative to it. See EDP §14.6 Rule 1.

### 4.5 Popover

Like a Tooltip but interactive. Triggered by click (not hover). Contains form elements,
menus, or rich content. Arrow points to trigger. `--shadow-xl`.
Closes on: Escape, click outside, or trigger re-click.

### 4.6 Context Menu

Right-click or ⋯ trigger. Floating panel, `--z-dropdown`. Min-width 180px.
Items: 36px height, padding `--space-2 --space-3`. Leading icon slot.

Standard entity context menu items:
`Edit` · `Duplicate` · divider · `Archive` or `Restore` · divider · `Delete` (destructive; only shown in archived view)

**Custom trigger:** When a `trigger` prop is passed (e.g. `<Button>Options</Button>`), `ContextMenu` wraps it in an `<span className="inline-block">` — NOT a `<button>`. This prevents button-in-button invalid HTML and removes the unintended outer hover area that would appear if the wrapper were a `<button p-1 hover:bg-surface-hover>`. The custom trigger element's own hover styles apply unchanged.

**Divider rule — the `ContextMenu` component automatically suppresses orphan dividers:**
Callers (e.g. `EntityCard`) may unconditionally push `{ divider: true }` before conditional items. The component's render pass removes:
- Leading dividers (nothing precedes them)
- Trailing dividers (nothing follows them)
- Consecutive dividers (empty section between two dividers)

This means callers never need to guard dividers with `if (hasItemAboveAndBelow)` — just declare the intended group structure and let the component normalise it. The filtering is applied to the `visibleItems` list before rendering, not to the `items` prop itself.

**Header item variant:** `ContextMenuItem` supports a non-interactive header type: `{ header: true; displayName: string; email: string }`. When present it must be the first item in the `items` array. It renders as a two-line block above the first menu item and a separator `border-t border-border` divider below it. Styles: displayName → `text-sm font-medium text-text-primary truncate`; email → `text-xs text-text-secondary truncate`; container → `px-3 py-2`. The header item is extracted before divider-normalisation runs, so it never participates in the orphan-divider suppression logic. Currently used by the Topbar account menu (§5.3).

**Viewport boundary clamping:** The `useFloatingPosition` hook accepts a `panelMinWidth` option. When set, the returned `left` value is clamped so that `left + panelMinWidth ≤ viewportWidth - 8px`. ContextMenu passes `{ panelMinWidth: 180 }` matching its `min-w-context-menu` utility. This prevents the menu panel from overflowing the right viewport edge when the trigger is near the right side of the screen.

---

### 4.6a Floating Position Pattern (shared by all floating panels)

All panels that detach from normal document flow and follow their trigger — Dropdown, DatePicker, ColourPicker, EmojiIconPicker, ContextMenu — use the `useFloatingPosition` hook in `frontend/src/hooks/useFloatingPosition.ts`.

**Behaviour:**
- On open: measures trigger `getBoundingClientRect()` synchronously and sets `top/left` as `position: fixed` styles — no flash or post-render repositioning
- Scroll + resize tracking: `requestAnimationFrame`-throttled event listeners (capture phase) keep the panel attached to its trigger as the page scrolls or resizes
- Horizontal clamping: optional `panelMinWidth` prevents right-edge overflow (8px viewport padding)
- Vertical flip: optional `preferAbove` causes the panel to render above the trigger when there's insufficient space below

**Portal escaping:** All floating panels use `ReactDOM.createPortal(panel, document.body)` to escape ancestor `overflow-hidden` containers (e.g. table cells, card wrappers). The portal target is always `document.body` — never a custom container.

**API signature:**

```typescript
// Return type — pass directly to the panel's style prop
interface FloatingPosition {
  top: number;    // px from viewport top (trigger.bottom + gap)
  left: number;   // px from viewport left (clamped if panelMinWidth set)
  width: number;  // trigger element width — use to match panel width to trigger
}

interface FloatingPositionOptions {
  gap?: number;           // px between trigger bottom and panel top. Default: 4
  panelMinWidth?: number; // when set, clamps left so panel stays within viewport
  viewportPadding?: number; // px clearance from each viewport edge. Default: 8
}

function useFloatingPosition(
  triggerRef: React.RefObject<HTMLElement | null>,
  open: boolean,
  options?: number | FloatingPositionOptions, // number shorthand = gap only
): FloatingPosition | null
```

Returns `null` when `open` is false (panel not yet measured) or when `triggerRef.current` is absent. Always guard: `{open && position && createPortal(...)}`.

**Usage pattern:**

```tsx
const triggerRef = useRef<HTMLButtonElement>(null);
const position = useFloatingPosition(triggerRef, isOpen, { panelMinWidth: 180 });

{isOpen && position && createPortal(
  <div className="fixed z-dropdown" style={{ top: position.top, left: position.left }}>
    ...
  </div>,
  document.body
)}
```

**Rule:** Do not implement custom positioning logic in individual components. All new floating panels must use `useFloatingPosition`. This ensures consistent boundary awareness across the product.

### 4.7 Table

Used for transaction ledger, recurring payment list, budget detail.

**Container:** `rounded-lg border border-border bg-surface overflow-hidden` — the whole table is enclosed in a card-like surface container. This ensures the area below the last row is not bare `bg-bg`.

**Background hierarchy:**

| Layer | Token | Value |
|---|---|---|
| `<thead>` | `bg-surface-raised` | #1c1c34 — distinctly lighter than body rows |
| `<thead>` border | `border-b-2 border-border-light` | 2px `#3a3a5c` — thicker than row dividers to clearly separate header from body |
| Odd body rows | inherit `bg-surface` from container | #16162a |
| Even body rows | `bg-surface-raised` | #1c1c34 |
| Hover (all rows) | `bg-surface-hover` | #1e1e38 |
| Selected row | `bg-primary-muted` | indigo at ~10% opacity |

**Why `<thead>` must be visually distinct from body rows:** The header and odd body rows both inherit similar colours if the same token is used — the visual result is that header cells look like regular rows. Using `bg-surface-raised` for `<thead>` paired with a 2px border provides clear, obvious separation without introducing a jarring new colour.

**Anatomy:**
- `<thead>`: `sticky top-0 z-sticky bg-surface-raised border-b-2 border-border-light`; column headers `text-sm font-medium text-text-secondary`; sortable headers show ChevronUp/Down icon
- `<tbody>`: row height ~52px; `divide-y divide-border`; zebra as above; row `transition-colors duration-fast`
- `<tfoot>` (optional): summary row; bold totals; `border-t-2 border-border-light` to mirror header weight

**Sortable columns:**
- Clicking a header button cycles: none → asc → desc → none
- Sort icon: `opacity-0 group-hover:opacity-60` when not sorted by this column (hints at sortability); `opacity-100` when this column is the active sort. Uses `ChevronUp` (asc) or `ChevronDown` (desc).
- Sorted column header: `text-text-primary` (full brightness vs muted for unsorted)

**Mobile responsive (below 768px):** Table collapses to a card-list view. Each row becomes a `bg-surface border border-border rounded-lg p-4` card. Key fields display as `flex justify-between` label/value pairs. Selected card: `border-primary bg-primary-muted`. No horizontal scrolling — collapse to card is preferred.

**Row actions:** All row-level actions (edit, archive, delete, reconcile) are accessed via a single `⋯` ContextMenu trigger per row (§4.6). Never render multiple inline action buttons in a table row — they consume column space and increase DOM node count.

**Column pinning:** Name/Date columns optionally pinned left on horizontal scroll (desktop only).

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
Appears inline below the entity list when ≥ 1 item is selected. See §4.11 for full spec.
```
┌──────────────────────────────────────────────────────────┐
│  4 items selected              [Archive]  [Delete]  [✕]  │
└──────────────────────────────────────────────────────────┘
```
- Count label updates live as selection changes.
- Archive and Delete buttons only rendered when the consumer passes `onBulkArchive` / `onBulkDelete` to `EntityPage`.
- `BulkActionBar` is a separate component (`components/entity/BulkActionBar.tsx`) — see §4.11.

### 4.11 BulkActionBar

Rendered by `EntityPage` below the entity list whenever `selectedIds.size > 0`. Returns `null` when selection is empty — no reserved space.

**Anatomy:**
```
┌──────────────────────────────────────────────────────────┐
│  4 items selected              [Archive]  [Delete]  [✕]  │
└──────────────────────────────────────────────────────────┘
```

**Container:** `bg-surface-overlay border border-border rounded-lg shadow-xl px-4 py-2 mt-3`. Inline within the page flow — not fixed to the viewport bottom.

**Entrance animation:** `animate-slide-in` (defined in `index.css`). Appears when `selectedCount` goes from 0 → 1; disappears (unmounts) when it returns to 0.

**Count label:** `"{N} item(s) selected"` — `text-sm text-text-secondary`. Singular/plural handled by the component.

**Action buttons** (right-aligned, rendered only when the prop is provided):

| Button | Variant | Icon | Prop required |
|---|---|---|---|
| Archive | `secondary sm` | `Archive` (Lucide) | `onArchive` |
| Delete | `danger sm` | `Trash2` (Lucide) | `onDelete` |
| × Clear | `icon sm` | `X` (Lucide) | `onClear` (always required) |

All buttons respect an `isLoading` prop that disables them while a mutation is in-flight.

**Props:**
```typescript
interface BulkActionBarProps {
  selectedCount: number;
  onArchive?: () => void;   // omit to hide Archive button
  onDelete?: () => void;    // omit to hide Delete button
  onClear: () => void;      // always present — × button
  isLoading?: boolean;
}
```

**Integration:** `EntityPage` manages selection state internally. Consumers pass `onBulkArchive` and/or `onBulkDelete` to `EntityPage`; it wires them to `BulkActionBar` after collecting the selected IDs. Consumers do not interact with `BulkActionBar` directly.

---

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

**View toggle (bottom):** Segmented control (§2.10) with two pills: "Household" / "My Finances".
Persists via `Person.default_view` [FR-P-006].
- Outer border: `--color-border-state` (signals persistent state)
- Active pill: `--color-primary` fill, `--color-text-inverse` text
- Inactive pill: `--color-text-secondary`, hover `--color-surface-hover`
- Collapsed: stacked `H` / `M` pills, same token set

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

**Account menu** (popover — opens on avatar button click in the right rail):

```
┌──────────────────────────────┐
│  Ben Tan                     │  ← display name  text-text-primary font-medium text-sm
│  ben@example.com             │  ← email         text-text-secondary text-xs
├──────────────────────────────┤  ← border-t border-border
│  ⚙  Settings                 │  ← navigates to /settings; closes menu
├──────────────────────────────┤  ← border-t border-border
│  ↪  Log out                  │  ← destructive colour (text-error); calls logout()
└──────────────────────────────┘
```

Panel: `bg-surface-overlay border border-border rounded-lg shadow-xl py-1`. Positioned below-right of the trigger via `useFloatingPosition`. `z-dropdown`. `min-w-context-menu` (180px).

Header section (display name + email): non-interactive, `px-3 py-2`, no hover background.

Menu items: 36px height, `px-3 py-2 text-sm`. Leading icon slot (16px Lucide icon). Hover: `bg-surface-hover`. Settings item: `text-text-primary`. Log out item: `text-error`.

Trigger: the existing avatar+name button in the right rail — replaced from a `<Link>` to a `<button>` that toggles the panel.

Close on: Escape, click outside, or re-click trigger.

**Deferred:** Display currency selector — added in the Settings epic (too wide a concern for this panel in MVP).

**Implementation note:** Uses `ContextMenu` with a custom `trigger` prop and an extended `ContextMenuItem` type that includes a `header` variant for the non-interactive name/email block. Callers pass `{ header: true, displayName, email }` as the first item.

### 5.4 Breadcrumb Trail

Shown below topbar when VisualizationFilter has active drill-down filters.
Each filter chip: entity name + value + × to dismiss.
"Clear all filters" link on the right.

```
Budgets › Food › August 2026 ×    [Clear all]
```

### 5.5 Tabs

Two distinct tab patterns exist. Choose based on context:

---

**Pattern A — Underline tabs** (navigation within a content area; e.g. sub-views of a module page)

Horizontal tab bar. Underline indicator (`--color-primary`, 2px) slides beneath the active tab.
Active tab text: `text-text-primary`. Inactive: `text-text-secondary`. Hover: `text-text-primary`.
Transition on indicator: `--duration-normal --ease-default`.

---

**Pattern B — Pill tab bar** (settings panels, picker panels, page-level section switching)

Pill buttons inside a rounded container. Same visual language as `SegmentedControl` (§2.10) but supports 3 or more options. Used in: Settings page (§9.8), any section-level nav where options are 2–5.

```
┌────────────────────────────────────┐
│  [Household]  [Members]  [Currencies]  [Profile]  │
└────────────────────────────────────┘
```

Container: `flex gap-1 bg-surface-raised border border-border rounded-lg p-1 w-fit`
Active pill: `bg-control-active text-primary font-medium rounded px-4 py-1.5 text-sm`
Inactive pill: `text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded px-4 py-1.5 text-sm transition-colors duration-fast`

**When to use Pattern A vs B:**
- Pattern A: content sub-views within a module where the user expects underline navigation convention (e.g. Transactions → All / Income / Expenses)
- Pattern B: settings panels, admin pages, picker panels, or anywhere the tab bar sits inside a card/panel surface rather than at the page edge

**URL sync:** Pattern B tab bars that represent persistent page state (e.g. Settings) sync the active tab to a `?tab=` query parameter so deep-linking and browser back work correctly. Pattern A tabs within data views do not need URL sync — they reflect local filter state only.

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

**Vertical position** [patch 2026-06-04]: Toasts are positioned at `top-[80px]` (64px topbar height
+ 16px margin) — NOT `top-4`. This ensures toasts appear below the sticky topbar and never obscure
it. The topbar is `z-sticky` (200) and toasts are `z-toast` (500), so without the vertical offset,
toasts would render on top of the topbar.

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

**Shimmer bars:** `background: linear-gradient(90deg, --color-surface-raised, --color-surface-active, --color-surface-raised)`.
`background-size: 200%`. Animation: shimmer sweep left-to-right, 1.5s ease infinite.
Respects `prefers-reduced-motion` (static grey if set).

**Container model — critical for visual correctness:**
- `card`, `chart`, `stat` shapes include their own `bg-surface` container frame (matching the real component they represent). Place these shapes on a `bg-bg` page background so the container is visible, exactly as real cards appear.
- `table-row` shape is a bare shimmer row with no container — place it inside a `bg-surface` table wrapper (matching the real table's thead/tbody context).

Shapes defined per component:
- `card`: `bg-surface` card frame + 3 shimmer text lines
- `table-row`: bare row with 5 varying-width shimmer rectangles (no container — lives inside a table)
- `chart`: `bg-surface` card frame + large shimmer area + 3 axis-label shimmer lines
- `stat`: `bg-surface` card frame + large number shimmer + label shimmer below

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
- Multi-line: one colour per series from `--chart-*` palette; legend below chart uses interactive toggle pills (§7.11)
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
- Colour per series from `--chart-*`; legend uses interactive toggle pills (§7.11)
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
Person colours: first 4 entries from `--chart-*`. Legend shows person avatars using interactive toggle pills (§7.11).

**Category comparison (multi-line):**
One line per category. Colours from entity colour or `--chart-*`. Legend uses interactive toggle pills (§7.11).
X-axis = time periods; Y-axis = amount in display currency.

Both support drill-down: clicking a bar/point filters to that person+category or category+period.

### 7.10 Recurring Payment Calendar

Monthly calendar grid. Each day cell shows upcoming occurrence dots.

- Upcoming: `--color-entity-recurring` dot
- Processed: `--color-success` dot
- Missed: `--color-error` dot
- Multiple occurrences: stacked dots (max 3, then "+N")

Clicking a dot opens a popover with the recurring payment name, amount, and status.

### 7.11 Chart Legend Toggle Pills

Interactive colored pill buttons that appear below multi-series charts. Each pill controls visibility of one chart series. Used by: Line/Area charts (§7.1) with ≥ 2 series, Stacked Area (§7.4), Comparison charts (§7.9). Donut/Pie (§7.3) uses segment click → VisualizationFilter instead — no legend toggle pills.

**Anatomy:**

```
[● Income]  [● Expenses]  [● Net]
  indigo      red/dimmed    cyan
```

Leading dot: 8px filled circle (`rounded-full`) in the series color. Label: series name. Layout: `flex flex-wrap gap-2` below the chart.

**States:**

| State | Background | Text | Border | Dot |
|---|---|---|---|---|
| Active (series visible) | series color at 15% opacity | series color | series color at 40% opacity, 1px solid | series color, full opacity |
| Inactive (series hidden) | `bg-surface-active` | `text-text-muted` | `border-border` | `text-text-muted` |
| Hover (inactive pill) | `bg-surface-hover` | `text-text-secondary` | `border-border-light` | `text-text-secondary` |

Active pill background and border are expressed as inline styles using the `--chart-N` CSS variable (not Tailwind, since chart colors are dynamic). Inactive state is purely token-based.

**Pill structure:**

```tsx
<button
  className="h-7 px-3 rounded-full text-xs font-medium flex items-center gap-1.5
             transition-colors duration-fast border"
  style={isActive ? {
    backgroundColor: `color-mix(in srgb, ${seriesColor} 15%, transparent)`,
    color: seriesColor,
    borderColor: `color-mix(in srgb, ${seriesColor} 40%, transparent)`,
  } : undefined}
>
  <span className="w-2 h-2 rounded-full shrink-0"
    style={{ backgroundColor: isActive ? seriesColor : undefined }}
  />
  {label}
</button>
```

**Toggle behavior:** Clicking an active pill hides the series (chart line/area fades `opacity 1→0`, `--duration-normal`). Clicking an inactive pill shows it (`opacity 0→1`, `--duration-normal`). At least one series must remain visible — the last active pill's click is a no-op (pill does not dim).

**Accessibility:** Each pill is a `<button>` with `aria-pressed={isActive}` and `aria-label="Toggle [series name] series"`.

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

Left accent bar: 4px inline style `borderLeft: '4px solid var(--entity-accent)'` on the Card wrapper. The CSS variable `--entity-accent` is set inline alongside it: `style={{ '--entity-accent': colour, borderLeft: '4px solid colour' }}`. Inline style is required — Tailwind's `border` shorthand overrides `border-left-width` via cascade ordering. Never use the `border-entity-accent` utility alone on an element that also has `border` or `border-*` class.

Context menu (⋯) appears on row hover. Contains standard entity operations: Edit, Duplicate, divider, Archive/Restore, divider, Delete.
Status badge right-aligned.
Archived cards: `grayscale opacity-60` + dashed border, "[Archived]" `Badge`.

**Design System page — EntityCard variants (§FE-008):**
The `/design-system` page demos four EntityCard states:
1. **Default** — active entity with accent bar and standard context menu
2. **Archived** — `grayscale opacity-60`, dashed border
3. **Warning status** — status Badge renders `variant="warning"` (amber)
4. **With body slot** — optional `renderBody` prop for custom content below the header row

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

**Design System page — EntityPage demo (§FE-008):** The `/design-system` page shows the action bar in isolation: Create button (primary, fires a toast), Show Archived toggle. Layout verified at full page width.

**Multi-select + BulkActionBar (§FE-008):** The design system page demos 5 selectable EntityCards with the `useMultiSelect` hook. Selection via Ctrl+click (toggle), Ctrl+A (select all), Escape (clear). `BulkActionBar` appears with slide-in animation (`animate-slide-in`) when `selectedCount > 0`, showing: "N selected" count, Archive (secondary) and Delete (danger) buttons, × clear button.

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

### 9.6 PublicPage [AUTH-003, AUTH-005]

Shell-less page layout component. Parallel to `EntityPage` — same design token discipline, no Sidebar or Topbar. Used by Login, JoinHousehold, NotFound, and Forbidden.

```
┌──────────────────────────────────────────────────────┐
│  bg-bg (full viewport, min-h-screen)                 │
│  flex items-center justify-center                    │
│                                                      │
│         [optional title text-2xl mb-2]               │
│         [optional subtitle text-sm mb-6]             │
│         (title without subtitle: mb-6 spacer added)  │
│                                                      │
│         ┌─────────────────────────────┐              │
│         │  bg-surface-raised          │              │
│         │  border-border rounded-lg   │              │
│         │  p-6                        │              │
│         │                             │              │
│         │  { children }               │              │
│         │                             │              │
│         └─────────────────────────────┘              │
│         w-full max-w-content (28rem/448px) mx-4      │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**Layout tokens:**
- Outer wrapper: `w-full flex items-center justify-center min-h-screen bg-bg`
- Content wrapper: `w-full max-w-content mx-4` — `max-w-content` = 28rem (448px) from `@utility` in `index.css`. Never `min-w-[360px]` — the card is fluid within the max.
- Title: `text-2xl font-semibold text-text-primary text-center mb-2`
- Subtitle: `text-text-secondary text-sm text-center mb-6`
- Spacing rule: Title present without subtitle → `<div className="mb-6" />` spacer before card. Title + subtitle → subtitle provides the `mb-6`. No title → no spacer.
- Card: `bg-surface-raised border border-border rounded-lg p-6`

All buttons inside `PublicPage` use the `Button` component (primary or secondary variant). No inline button styles.

### 9.7 JoinHousehold Page [AUTH-005]

Public page at `/join/:token`. Uses `PublicPage`. Accessible without authentication (invitation details fetched from public endpoint).

```
┌─────────────────────────────────────┐
│  You've been invited to join        │
│                                     │
│  🏠 Smith Family Finances           │
│  Invited by: Kim Smith              │
│  Expires: 10 Jun 2026               │
│                                     │
│  [Accept Invitation]   [Decline]    │
└─────────────────────────────────────┘
```

**States:**
- **Valid, unauthenticated:** shows details + "Accept Invitation" (primary) which stores token and routes to OAuth; "Decline" (secondary) returns to `/login` (no API call — unauthenticated decline just drops the flow; user will create their own household on next login)
- **Valid, authenticated, email matches:** "Accept Invitation" (primary) calls `POST /api/invitations/:token/accept`; on 200 navigates to `/dashboard`; on 403 shows email-mismatch `AlertBanner`; on 409 shows `AlertBanner` "You already belong to a household — leave or delete it before accepting this invitation." with a "Go to Settings" action. "Decline" (secondary) calls `POST /api/invitations/:token/decline`; on 200 updates `authStore` with new household data from response and navigates to `/dashboard` (the welcome toast fires there, see §9.8.3).
- **Valid, authenticated, email mismatch:** `AlertBanner` (error) with instructions to sign in with correct account; both CTAs hidden until dismissed
- **Expired / cancelled / declined / not found:** `AlertBanner` (warning) + "Back to Login" `Button` (secondary)

Token is the invitation `id` (UUID). All `Button` instances use design-system `Button` component.

### 9.8 Settings Page [AUTH-004, AUTH-006, SETTINGS-003]

Settings lives at `/settings`. Uses the standard `AppShell`. Four tabs using the SegmentedControl-style tab bar pattern (§2.10):

```
┌─────────────────────────────────────────────────────────────────┐
│  Settings                                                        │
│                                                                  │
│  ┌──────────┬──────────┬─────────────┬──────────┐               │
│  │Household │ Members  │ Currencies  │ Profile  │  ← tab bar    │
│  └──────────┴──────────┴─────────────┴──────────┘               │
│                                                                  │
│  { active tab content }                                          │
└─────────────────────────────────────────────────────────────────┘
```

Tab bar: `bg-surface-raised border border-border rounded-lg p-1 w-fit`. Active pill: `bg-control-active text-primary font-medium`. Inactive: `text-text-secondary hover:text-text-primary hover:bg-surface-hover`. Same token pattern as SegmentedControl (§2.10).

**Tab key → URL:** `?tab=household|members|currencies|profile`. On mount, read `useSearchParams` to activate the matching tab (default `household`). Stale or unknown `?tab` values fall back to `household` silently. Components navigating to a specific tab use `navigate('/settings?tab=members')` etc.

---

#### 9.8.1 Household Tab

```
┌─────────────────────────────────────────────────────┐
│  Household Settings                                  │
│                                                      │
│  Name        [________________________]  ← owner only; non-owners see read-only text
│  Timezone    [Asia/Singapore ▾       ]  ← owner only Dropdown; non-owners read-only
│                                                      │
│                              [Save Changes]          │
│                                                      │
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│  Danger Zone                               (owner only — hidden for admin/member)
│                                                      │
│  [Delete Household]  ← Button destructive outline   │
│                          (border-error text-error)   │
└─────────────────────────────────────────────────────┘
```

- Non-owner users see all fields as read-only text; no Save button; Danger Zone section hidden.
- Delete Household opens `ConfirmationDialog` with a text `Input` requiring the user to type the exact household name. Confirm button stays disabled until the typed value matches exactly (case-insensitive). On confirm calls `DELETE /api/household`. On success calls `logout()` and navigates to `/login?deleted=1`.

---

#### 9.8.2 Members Tab

```
┌─────────────────────────────────────────────────────┐
│  Members                            [Invite Member]  │  ← button visible to admin+
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ Avatar  Name / Email     Role    Joined  ⋯   │   │
│  │ ──────  ────────────────  ──────  ──────  ─   │   │
│  │ [img]   Ben Tan (You)    Owner   01 Jan  —   │   │
│  │         ben@example.com                       │   │
│  │ [img]   Kim Smith        Admin   14 Mar  [▾][🗑]│   │
│  │         kim@example.com                       │   │
│  │ [img]   Alex Lee         Member  02 Apr  [▾][🗑]│   │
│  │         alex@example.com                      │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  Pending Invitations                                 │
│  ┌──────────────────────────────────────────────┐   │
│  │ jane@example.com   Expires 11 Jun  [Copy] [✕]│   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  [Leave Household]   ← visible to member / admin ONLY (not owner)
└─────────────────────────────────────────────────────┘
```

**Role dropdown visibility rules** (column `[▾]`):
- Owner sees dropdown on every non-owner row (admin → member or member → admin)
- Admin sees dropdown on member rows only (can promote members to admin, demote admins is NOT permitted — admin cannot manage peers of equal rank)
- Member sees no dropdowns
- Own row: never shows dropdown

**Actions column (`⋯` ContextMenu per row — §4.7):**
- Own row / rows the current user cannot act on: `—` (no ContextMenu)
- Role change item: "Change to Admin" or "Change to Member" depending on target's current role
- ContextMenu label for remove: **"Remove member"** (not "Remove from household" — too long for a menu item)
- Remove visibility: owner sees it on every non-owner row; admin sees it on member rows only; no one can remove themselves; owner cannot be removed

**Pending Invitations table (`Table` component — §4.7):**
Columns: Email (`text-text-primary font-medium`) / Expires (formatted date, `text-text-secondary`) / Actions (`⋯` ContextMenu).
ContextMenu items: "Copy invitation link" (copies `{origin}/join/{id}` to clipboard, fires success toast) + divider + "Cancel invitation" (destructive). Hidden entirely when no pending invitations exist.

**Invite Member flow:**
Opens `Modal` with:
```
┌─────────────────────────────────────┐
│  Invite Member                   ✕  │
│                                     │
│  Email address                      │
│  [_________________________________]│
│                    [Cancel] [Invite] │
│                                     │
│  ── after successful invite ────    │
│  Share this link with [email]:      │
│  [https://…/join/uuid    ] [Copy]   │
│                          [Done]     │
└─────────────────────────────────────┘
```
Two-phase modal: email entry → link reveal. `Input` with validation, `AlertBanner` on API error. The copy field is a read-only `Input` with a trailing copy `<span role="button">` icon (§5.4 Nested Button Rule).

**Leave Household flow:**
"Leave Household" `Button` (`variant="danger"`) visible only to non-owner members (admin or member role). Opens `ConfirmationDialog` with message "You will leave **[household name]**. A new household will be created for you when you next sign in. This cannot be undone." Confirm calls `POST /api/persons/leave`. On 200: `response.household` is `null` — call `clearAuth()` and navigate to `/login`. A fresh household is created automatically the next time the user signs in via OAuth.

---

#### 9.8.3 Welcome Toast [AUTH-006]

A one-time `Toast` shown immediately after the first login of a new household owner. Triggered in `useAuth.ts` when `/auth/me` returns `isFirstLogin: true`.

```
┌────────────────────────────────────────────────────┐
│ 🏠  Your household "[name]" has been created.      │
│     Invite your household members to get started.  │
│                           [Invite Members]  ✕      │
└────────────────────────────────────────────────────┘
```

- Variant: `success` toast
- "Invite Members" action button: navigates to `/settings?tab=members` and dismisses the toast
- Dismissed by ✕ or by clicking "Invite Members"
- `sessionStorage.setItem('hasSeenWelcome', '1')` set immediately when shown; `useAuth.ts` checks this flag and skips the toast on subsequent renders within the same browser session
- `isFirstLogin` is `true` only when `person.role == "owner"` and `person.created_at` is within the last 2 minutes — only fires once per account creation window

**Note:** The `Toast` component (§6.1) supports an optional `action: { label, onClick }` prop — this is the first use of that prop; ensure it is implemented if not already.

---

#### 9.8.4 Currencies Tab [SETTINGS-003]

Manages the household's active currencies, FX rates, and conversion fees.

```
┌────────────────────────────────────────────────────────────────────┐
│  Currencies               [Refresh Rates]  [Add Currency]          │
│                           ← both owner-only                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Code  Name                  Symbol  Rate       Fee    Active  │  │
│  │ ─────────────────────────────────────────────────────────    │  │
│  │ SGD   Singapore Dollar      S$      BASE       —      ●      │  │
│  │ NZD   New Zealand Dollar    NZ$     0.834 ⚠    1.5%   ●  [⋯] │  │
│  │ USD   US Dollar             US$     1.345       2.0%   ●  [⋯] │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  Base: SGD  ·  Last refreshed: today 09:15                         │
└────────────────────────────────────────────────────────────────────┘
```

**Column definitions:**

| Column | Source field | Notes |
|---|---|---|
| Code | `currency.code` | `font-medium text-text-primary` |
| Name | `currency.name` | `text-text-secondary` |
| Symbol | `currency.symbol` | |
| Rate | `currency.rate_to_base` | Shows `"BASE"` for the base currency. Amber `⚠` icon if `last_rate_at` is null or older than 48 h (stale). |
| Fee | `currency.fee_pct` | Formatted as `"1.5%"`. Dash `"—"` for base currency. |
| Active | `currency.is_display_active` | `Toggle` (§3.4) — controls whether this currency appears in display currency selectors. Owner-only toggle; non-owners see state read-only. |
| Actions | — | `⋯` ContextMenu. Base currency row has no actions column (cannot be deleted or reassigned). |

**Actions ContextMenu (non-base currencies, owner-only):**
- **Edit** → opens Edit Currency modal
- **Set as Base** → opens ConfirmationDialog (see below)
- **Delete** → enabled only if no `FinancialEvent` references this currency; otherwise disabled with `Tooltip`: "Used in [N] transactions — cannot be deleted"

**Footer:** `"Base: [code] · Last refreshed: [time ago]"` — `text-xs text-text-muted`. If any currency's `last_rate_at` is stale (> 48 h) or null, footer becomes `"⚠ Some rates are outdated — click Refresh to update"` in amber (`text-warning`).

---

**Add / Edit Currency modal:**

```
┌───────────────────────────────────────────────┐
│  Add Currency                              ✕  │
│                                               │
│  Currency code (ISO 4217)                     │
│  [USD___________________________________]     │
│                                               │
│  Name                                         │
│  [US Dollar_____________________________]     │
│                                               │
│  Symbol                                       │
│  [US$___________________________________]     │
│                                               │
│  FX fee %                                     │
│  [2.00__________________________________]     │
│  Rate will be fetched automatically on save   │
│                                               │
│                   [Cancel]  [Add Currency]    │
└───────────────────────────────────────────────┘
```

Edit mode: same modal pre-filled; Code field is read-only; confirm label is "Save Changes".

Validation inline: Code must be 3 uppercase letters. Duplicate code returns `AlertBanner` "This currency is already in your household." Fee must be ≥ 0 and ≤ 100.

---

**Set as Base ConfirmationDialog:**

```
Title:   Change base currency to [CODE]?
Message: All stored amounts will be recalculated using the
         current [CODE] exchange rate. This may take a moment.
Confirm: Change Base Currency   (primary — not danger variant)
Cancel:  Cancel
```

On confirm: `POST /api/currencies/{id}/set-base`. While job runs, show full-width `AlertBanner` (info) at tab top: "Recalculating amounts… this may take a few seconds." Auto-dismiss when the subsequent `GET /api/currencies` poll returns with the updated base flag.

---

**Refresh Rates button:**
`POST /api/currencies/rates/refresh`. Button shows `loading` state in-flight. On success: invalidate currencies query; enqueue success toast "Exchange rates updated."

---

#### 9.8.5 Profile Tab [SETTINGS-003]

Personal preferences for the currently authenticated user. Saves via `PATCH /api/persons/{id}`.

```
┌──────────────────────────────────────────────────────┐
│  My Profile                                           │
│                                                       │
│  ┌─────────────────────────────────────────────┐     │
│  │  [Avatar]   Display Name                    │     │
│  │   56 px     [Ben Tan______________________] │     │
│  │             Email                           │     │
│  │             ben@gmail.com   (read-only)      │     │
│  └─────────────────────────────────────────────┘     │
│                                                       │
│  Preferences                                          │
│  ─────────────────────────────────────────────────   │
│  Display Currency    [SGD (Base) ▾            ]       │
│  Default View        [Household | My Finances ]       │
│                                                       │
│                                    [Save Changes]     │
└──────────────────────────────────────────────────────┘
```

**Fields:**

| Field | Component | Notes |
|---|---|---|
| Avatar | `Avatar` 56 px | Read-only; sourced from Google `pictureUrl`. No upload in MVP. |
| Display Name | `Input` | Required; max 100 chars. |
| Email | Read-only `text-text-secondary text-sm` | Bound to Google account; cannot be changed here. |
| Display Currency | `Dropdown` | Lists only currencies where `is_display_active = true`. Base currency listed first, labelled "[CODE] (Base)". |
| Default View | `SegmentedControl` | "Household" / "My Finances". Writes `person.default_view`. Identical visual to the Sidebar bottom toggle. |
| Save Changes | `Button` primary | Enabled only when at least one field differs from loaded values. Loading state while mutation in-flight. |

**Access from account menu:** §5.3 Topbar account menu gains a "My Profile" item (between the name/email header and Settings). Navigates to `/settings?tab=profile`. See the §5.3 revision note at the end of this section.

**§5.3 account menu update (SETTINGS-003):** Add "My Profile" row between the header block and the Settings row:

```
┌──────────────────────────────┐
│  Ben Tan                     │
│  ben@example.com             │
├──────────────────────────────┤
│  👤  My Profile              │  ← new; navigates to /settings?tab=profile
├──────────────────────────────┤
│  ⚙   Settings                │
├──────────────────────────────┤
│  ↪   Log out                 │
└──────────────────────────────┘
```

---

### 9.9 Login Page — Not Invited Error [AUTH-006]

The existing `Login.tsx` already renders the `?error` query param as an `AlertBanner`. Add copy for the `not_invited` error code:

> **You need an invitation to sign in.** Contact an existing household member to receive an invitation link.

No new components required — this is a copy addition to the existing error-message mapping in `Login.tsx`.

### 9.10 Design System Page [FE-008]

Route: `/design-system`. Accessible without authentication (outside AppShell). Used for visual regression testing — every story that touches a component must verify against this page before marking Done.

**Section catalogue (in scroll order):**

| Section | Components covered |
|---|---|
| Colors & Typography | Colour swatches for all token groups; typography scale |
| Atoms | Spinner, Icon, Badge (all variants), Avatar (all sizes + stack), Divider, Label/HelperText, Tooltip |
| Buttons & Controls | Button (all variants/sizes/states), SegmentedControl |
| Inputs | Input (default, search, password, error, disabled), Label with helper text |
| Form Controls | Checkbox, Toggle, Dropdown (single/multi), DatePicker, ColourPicker, EmojiIconPicker, TagInput, MonetaryValueInput, RecurringDateInput |
| Cards | Card (default, stat, elevated, ghost) + entity accent colour variants |
| Overlays | Modal (sizes + dirty guard), Drawer, ConfirmationDialog, Accordion |
| Feedback | Toast (all variants + action prop), AlertBanner (all variants), Skeleton (4 shapes), EmptyState, ProgressBar |
| Data | Table (full columns, sort, row selection, mobile card collapse) |
| Actions | ContextMenu (all item types: default, icon, destructive, disabled, divider, header variant) |
| Entity Components | EntityCard (4 variants), EntityPage action bar, Multi-select + BulkActionBar |
| Public Pages | Inline card previews of Login, NotFound, Forbidden, JoinHousehold card content (§9.6, §9.7) |

**Public Pages subsection note:** `PublicPage` uses `min-h-screen` — embedding full instances would push other sections far down the page. The design system page embeds only the inner card content (inside a `bg-bg p-8` container). Full-page render must be checked by navigating to `/login`, `/join/test-token` (with a mock), `/404`, `/forbidden` directly.

### 9.11 DebtSummaryView

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

### 9.12 Categories Page [CAT-005]

Route: `/categories`. Uses standard `AppShell`. Pure management page — no charts or summary panels.

#### Layout

```
┌─────────────────────────────────────────────────────────┐
│  Categories               [Find Duplicates]  [+ Create] │  ← action bar
├─────────────────────────────────────────────────────────┤
│  [Show Archived toggle]                                  │
├─────────────────────────────────────────────────────────┤
│  [CategoryTree — full width]                             │
│                                                          │
│  ▶ 🍕 Food & Drink     expense   2 subs    ···           │
│      └─ 🍔 Eating Out  expense             ···           │
│      └─ 🛒 Groceries   expense             ···           │
│  ─ 🏠 Housing          expense             ···           │
│  ─ 💰 Income           income              ···           │
│  ...                                                     │
└─────────────────────────────────────────────────────────┘
```

#### CategoryTree Row Anatomy

Each row is a full-width strip with a coloured left bar (same 4px inline `borderLeft` pattern as EntityCard — using the category's `color` field). If no colour is set, falls back to `--color-entity-category` (cyan).

```
[⠿] [▶/─] [icon] Name                [type Badge]  [N subs]  [+ Add Sub]  [···]
 │    │      │                                          │          │
drag  │    emoji/                                  only on      only on
handle│    lucide                                 parents     top-level
     chevron                                                  when expanded
```

- **Drag handle** (`⠿`): visible on hover; always present on every row
- **Chevron** (`▶`): shown only on parent rows (has children); rotates 90° when expanded; top-level rows with no children show `─` (a short dash) in place of chevron
- **Icon**: emoji or Lucide icon from `EmojiIconPicker`
- **Name**: `text-text-primary font-medium`
- **Type badge**: `Badge` component — `expense` → warning variant (amber), `income` → success variant (green), `both` → default variant (grey)
- **Sub-count**: `text-text-secondary text-sm` — e.g. `2 subs`; hidden on subcategory rows
- **`+ Add Sub` button**: `Button` ghost xs — visible only on top-level rows when that row is expanded; hidden when collapsed or on subcategory rows
- **`···` ContextMenu**: see below

Subcategory rows are indented with a `pl-8` left padding and a `border-l border-border` connector line running the height of the group.

**Archived rows**: `opacity-60 grayscale` + dashed left border + `[Archived]` Badge; shown only when "Show Archived" is on.

#### Drag and Drop

Categories support three drag interactions:

| Gesture | Result |
|---|---|
| Drag a top-level category onto another top-level category | Drop target highlights; on release: confirmation prompt "Make '[name]' a subcategory of '[target]'?" — confirm assigns `parent_id` |
| Drag a subcategory onto a different top-level category | Reassigns `parent_id` to the new parent — no prompt (intent is unambiguous) |
| Drag a subcategory out of its group (drop onto the root zone between top-level rows) | Promotes to top-level — sets `parent_id = null`; root drop zone highlighted with a `border-dashed border-accent` indicator |

**Drag visual feedback:**
- Dragged row: `opacity-40` ghost in original position
- Valid drop target (parent): `bg-surface-active border-accent` highlight on the target row
- Root drop zone: `border-dashed border-2 border-accent bg-accent/5` strip appears between top-level rows when a subcategory is being dragged
- Invalid drop (e.g. dragging a parent onto its own child): no highlight; drop rejected silently

Note: drag-and-drop uses the HTML5 Drag and Drop API (`draggable`, `onDragStart`, `onDragOver`, `onDrop`). No third-party DnD library required at this scale.

#### ContextMenu Items

**Top-level category row (active):**
```
Edit
Add Subcategory
Duplicate
Merge into…
─────────────
Promote  ← disabled (already top-level); shown greyed with Tooltip "Already a top-level category"
─────────────
Archive
```

**Top-level category row (archived view):**
```
Edit
Add Subcategory
Duplicate
Merge into…
─────────────
Promote  ← disabled (already top-level); shown greyed with Tooltip "Already a top-level category"
─────────────
Restore
Delete  ← destructive; only shown in archived view; hard-deletes if empty (no downstream deps), otherwise 409 with "Archive instead" prompt
```

**Subcategory row (active):**
```
Edit
Duplicate
Merge into…
─────────────
Promote to top-level
─────────────
Archive
```

**Subcategory row (archived view):**
```
Edit
Duplicate
Merge into…
─────────────
Promote to top-level
─────────────
Restore
Delete  ← destructive; only shown in archived view; hard-deletes if empty (no downstream deps), otherwise 409 with "Archive instead" prompt
```

#### Create / Edit Modal

Uses `EntityModal` pattern. Fields:

| Field | Component | Notes |
|---|---|---|
| Name | `Input` | Required; max 100 chars |
| Icon | `EmojiIconPicker` | Required |
| Colour | `ColourPicker` | Required |
| Type | `Dropdown` | `expense` / `income` / `both` |
| Parent category | `Dropdown` | Top-level categories only; "— None (top-level)" option; selecting None detaches from parent and promotes to top-level |

Setting Parent to "— None (top-level)" on a subcategory promotes it. Setting a parent on a top-level category makes it a subcategory. The `depth` constraint (max 1) is enforced — top-level categories that already have children cannot be assigned a parent (dropdown option disabled with Tooltip "Cannot nest — this category has subcategories").

#### Merge Flow

Two entry points — both open the same Merge Modal:

**Path A — ContextMenu → "Merge into…" (single source):**
Selects the context-menu row as the source. Opens Merge Modal with source pre-populated.

**Path B — BulkActionBar → "Merge" (multi-select):**
Rows support Ctrl+click (toggle), Ctrl+A (select all), Escape (clear) per §9.3. When ≥ 2 categories are selected, `BulkActionBar` appears (§9.3) with: "N selected" count, **Merge** (secondary), Archive/Restore (secondary — depends on archived view state), Delete (danger — only in archived view), × clear. Clicking Merge opens the Merge Modal with all selected categories as sources; the user picks the target from a dropdown that excludes all selected sources.

**Merge Modal** (`Modal` md size):

1. Title: "Merge into…" (multi-select) or "Merge '[name]' into…" (single)
2. Source list: read-only chips showing each source category name + colour dot
3. Target: searchable `Dropdown` of all non-archived categories excluding sources
4. `AlertBanner` (warning) if any source has transactions or subcategories: "This will reassign [N] transactions and [M] subcategories to the target. Sources will be archived."
5. Footer: Cancel + "Merge" (primary)
6. On confirm: calls `POST /api/categories/merge`; success Toast; invalidates category tree query

#### Find Duplicates Flow

"Find Duplicates" button in action bar calls `GET /api/categories/duplicates`. If no duplicates found: Toast "No duplicate categories found." If duplicates found: opens `Modal` (lg size) titled "Potential Duplicate Categories":

```
┌─────────────────────────────────────────────────────────┐
│  Potential Duplicate Categories                      ✕  │
│                                                          │
│  Group 1                                                 │
│  ┌──────────────────────────────────────────────────┐   │
│  │  🍕 Food & Drink     14 transactions             │   │
│  │  🍔 Food             3 transactions              │   │
│  │                              [Merge →]           │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  Group 2                                                 │
│  ...                                                     │
│                                              [Done]      │
└─────────────────────────────────────────────────────────┘
```

"Merge →" per group opens the standard Merge Modal (above) pre-populated with the group's categories, largest transaction count pre-selected as target.

---

### 9.13 Accounts Pages [ACCT-004]

Routes: `/accounts` (bank + credit_card), `/capital`, `/assets`, `/insurance`. All use the standard `AppShell`. All use `EntityPage<Account>` with a card grid layout filtered by `account_type`. No summary panels above the grid — all four pages are identical in structure; only the page title and filtered cards differ.

---

#### AccountCard Anatomy

All account cards use the standard `EntityCard<T>` shell (4px left accent bar via inline `borderLeft` in the entity accent colour, context menu on hover). The accent colour per type:

| account_type | Entity accent token |
|---|---|
| `bank` | `--color-entity-account` (indigo) |
| `credit_card` | `--color-entity-credit` (red) |
| `capital` | `--color-entity-capital` (green) |
| `asset` | `--color-entity-asset` (amber) |
| `insurance` | `--color-entity-insurance` (cyan) |

**Left accent bar:** 4px inline `borderLeft` in the entity accent colour for the account's type (see token table above). Same inline style pattern as all `EntityCard` instances — never a utility class.

**Header row (always):** Account name (`text-base font-semibold text-text-primary`) + type `Badge` (entity variant, coloured via `--entity-accent`) + balance (`MonetaryValue` — primary amount right-aligned) + owner `AvatarStack` (max 3, "+N" overflow).

**Owner name tags:** Below the header row, each owner is shown as a small `Badge` (neutral variant, `text-xs`) with their `display_name`. Primary owner badge has a `★` prefix (e.g. `★ Ben`). Non-primary owners show just their name (e.g. `Kim`). Tags wrap if there are multiple owners. Placed above the secondary info line.

**Secondary info line (type-specific):**

| Type | Secondary line content |
|---|---|
| `bank` | `****{last4} · {institution}` — masked account number + institution name. If no account_number, show institution only. If neither, omit. |
| `credit_card` | Mini utilisation bar (4px height, full width of card, `--color-success`/`--color-warning`/`--color-error` based on pct) + `SGD {used} / {limit} · Due {due_day}{ordinal}` |
| `capital` | `{investment_type} · {current_value in display currency}` — investment type capitalised (e.g. "Stock"), current value from `current_value` field |
| `asset` | `{asset_type} · {latest valuation in display currency}` — asset type capitalised (e.g. "Property"), latest value from most recent `ValuationRecord`; if no valuations, shows purchase_value |
| `insurance` | `{policy_type} · {insurer}` — both capitalised; if insurer is null, show policy_type only |

**Context menu (⋯):** Edit · Duplicate · divider · Manage Owners · divider · Archive / Restore · divider · Delete (archived view only).

**Duplicate behavior:** Follows the universal entity duplicate pattern (EDP §13.4). Clicking "Duplicate" clones the account immediately — no confirmation dialog. The clone has " (copy)" appended to the name and all monetary values zeroed. User can set correct balances via Edit modal after duplication.

---

#### Account Type Selector (Create modal)

A row of 5 pill toggle buttons at the top of the create modal, spanning full width:

```
┌──────────────────────────────────────────────────────────┐
│  [🏦 Bank] [💳 Credit Card] [📈 Capital] [🏠 Asset] [🛡 Insurance]  │
└──────────────────────────────────────────────────────────┘
```

Each pill: icon + label, equal width (`flex-1`). Active pill: `bg-control-active text-primary font-medium border-border-state`. Inactive: `text-text-secondary hover:bg-surface-hover border-border`. Container: `flex border border-border rounded-lg overflow-hidden` (no gap — pills are flush).

**Type-switch warning (when switching type after filling subtype fields):** A `ConfirmationDialog` appears with:
- Title: "Change account type?"
- Message: "Switching to [New Type] will clear [N] fields specific to [Current Type]. This cannot be undone."
- Confirm: "Change Type" (primary) · Cancel: "Keep [Current Type]" (secondary)

Only triggers when at least one subtype-specific field (any nullable subtype field for the current type) has a non-empty value. If no subtype fields are filled, the type switches silently.

---

#### Account Modal Field Layout

Two-column grid on ≥ 768px. Field width assignments:

**Full-width fields (span both columns):**
- Account type selector (pill toggle row)
- Name
- Balance (`MonetaryValueInput`)
- Account number (bank only — password-style input with show/hide toggle; `type="password"` equivalent; displays `****{last4}` in read-only views)
- Notes
- RecurringConfig section (Capital, Asset, Insurance — see below)

**Half-width field pairs:**
- Institution · Month/Year
- Bank: Interest Rate · Interest Frequency
- Credit Card: Credit Limit · Annual Fee (row 1) · Billing Day · Due Day (row 2) · Reward Points (half, alone on row 3)
- Capital: Investment Type · Cost Basis
- Asset: Asset Type · Purchase Date · Purchase Value · Depreciation Formula (row 2)
- Insurance: Policy Type · Insurer (row 1) · Premium Frequency · Coverage Amount (row 2) · Coverage Types (TagInput, full-width)

**Month/Year field:** Uses the DatePicker in month-only mode (no day selection). Displays as `MM-YYYY`. Stores as `YYYY-MM`.

**Section dividers** (using the labelled `Divider` component):
- After Name: `─── BALANCE ───`
- After balance block: `─── DETAILS ───` (groups institution, account number, month/year)
- After base details: `─── [TYPE] SETTINGS ───` (groups subtype-specific fields)
- At bottom (Capital/Asset/Insurance): `─── RECURRING PAYMENT ───` (the toggle section)

---

#### RecurringConfig Section (Capital, Asset, Insurance modals only)

Placed at the bottom of the modal, after the `─── RECURRING PAYMENT ───` divider.

```
─── RECURRING PAYMENT ────────────────────────────────────
Set up recurring payment   [Toggle OFF]
```

When Toggle is ON, the following fields animate in below the toggle row:

```
Frequency      [3rd of every month            ✕  ]
               Next: 03-07-2026  ✓ Confirm
Category       [Insurance ▾                      ]
Amount override [SGD ▾] [_______________          ]
               (leave blank to use account balance)
Payment method [_______________                   ]
Payee          [Ben ▾                             ]
```

Fields: `frequency_text` (uses `RecurringDateInput` component with the Confirm step), `category_id` (searchable Dropdown — requires CAT-005 from Epic 4), `amount_override` (`MonetaryValueInput`, optional), `payment_method` (text Input), `payee_person_id` (person Dropdown).

Toggle defaults to OFF on create. Toggle defaults to ON in edit mode if a `RecurringConfig` record exists for this account. Toggling OFF in edit mode opens a `ConfirmationDialog`: "Remove recurring payment config?" with "Remove" (danger) and "Keep" (secondary). Confirmed removal deletes the `RecurringConfig` via `DELETE /api/accounts/{id}/recurring-config`.

---

#### Valuation History (Assets page — Add Valuation flow)

The Assets page AccountCard shows a `Skeleton` chart shape (shimmer) with a centred "Chart coming soon" label in `text-text-muted text-xs` below the secondary info line. This placeholder occupies the same height as the real chart will in the VIZ epic so the card height is stable.

**Add Valuation** — triggered from a secondary button in the card context menu: "Add Valuation". Opens a small `Modal` (`size="sm"`):

```
┌─────────────────────────────────────┐
│  Add Valuation                   ✕  │
│                                     │
│  Date        [01-07-2026          ] │  ← DatePicker
│  Value       [SGD ▾] [__________  ] │  ← MonetaryValueInput
│  Source      [Manual ▾            ] │  ← Dropdown: Manual / Market Appraisal / Depreciation Formula
│  Notes       [___________________  ] │  ← optional text Input
│                                     │
│                  [Cancel]  [Add]    │
└─────────────────────────────────────┘
```

Source values: `manual` (default) / `market_appraisal` / `depreciation_formula`. When "Depreciation Formula" is selected, a Formula Dropdown appears below Source (lists available asset formulas). The `formula_id` field on `ValuationRecord` is populated.

On save, the card's secondary line updates to show the new latest valuation value.

---

#### Manage Owners Modal

Triggered from the "Manage Owners" context menu item. Opens a `Modal` (`size="sm"`, title "Manage Owners").

```
┌─────────────────────────────────────┐
│  Manage Owners                   ✕  │
│                                     │
│  Owners                             │
│  [Ben ★  ▾] [Kim  ▾] [+  ▾]        │  ← person chips
│                                     │
│  Primary owner: Ben ★               │  ← star is clickable to change primary
│                                     │
│                  [Cancel]  [Save]   │
└─────────────────────────────────────┘
```

Owners field: a multi-select `Dropdown` that renders selected persons as chips. Each chip has a ★ icon (gold when this person is primary, outline when not). Clicking a ★ on a chip sets that person as the primary owner (removes star from all others). Clicking × on a chip removes that owner (blocked if they are the only owner — `Tooltip`: "At least one owner is required").

The Dropdown options list all household members not already selected. Adding an owner adds them as non-primary by default.

On Save, calls `POST /api/accounts/{id}/owners` for each added person and `DELETE /api/accounts/{id}/owners/{person_id}` for each removed person, then `PATCH` (or re-POST with `is_primary: true`) for the primary owner change. All mutations are batched before Save — no live API calls until the user confirms.

---

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

**Entity card entrance (after create):**
- New card: `opacity: 0, translateY(12px) → opacity: 1, translateY(0)`, `--duration-slow --ease-out`
- Only the newly created card animates. Existing cards do not shift until the new card has fully mounted.

**Entity card archive / delete:**
- Step 1: `opacity: 1 → 0`, `--duration-fast`
- Step 2: `max-height → 0, margin-bottom → 0`, `--duration-normal --ease-in` (siblings slide up to fill gap)

**Staggered list load (data arrives from API):**
- Each card: `opacity: 0, translateY(8px) → opacity: 1, translateY(0)`, `--duration-normal --ease-out`
- Stagger: 40ms delay per item (index × 40ms). Cap at 8 items — items 9+ appear at `--duration-instant` to avoid long waits on large lists.

**Alert banner appear / dismiss:**
- Mount: `opacity: 0, translateY(-8px) → opacity: 1, translateY(0)`, `--duration-fast --ease-out`
- Dismiss: `opacity: 1 → 0` then `max-height → 0`, `--duration-normal`

**Sidebar collapse / expand:**
- Width: `240px → 56px` (icon-only collapsed state), `--duration-normal --ease-in-out`
- Labels: fade `opacity: 1 → 0` at `--duration-fast` before the width transition begins, so text never wraps or squishes mid-animation
- Expand is the reverse: width first, then labels fade in after width settles

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
| Chart legend pill toggle off | Affected series: `opacity 1 → 0`, `--duration-normal` |
| Chart legend pill toggle on | Affected series: `opacity 0 → 1`, `--duration-normal` |
| Filter chip appear | `scale(0) → scale(1)`, `--duration-fast --ease-bounce` |
| Filter chip dismiss | `scale(1) → scale(0)`, `--duration-fast --ease-in` |
| Drag card lift | `translateY(-4px) scale(1.02)` + shadow to `--shadow-xl`, `--duration-fast` (see §4.9) |
| Balance value live update | Amber highlight pulse on the number (`background-color` flash to `--color-warning-muted → transparent`), `--duration-slow` |

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
| 2.2 | 2026-05-29 | Ben + Claude | Post-Epic 2 tester review updates (rounds 1–3). Skeleton shimmer peak: surface-active not surface-hover. §2.10 Segmented Control pattern: border-state outer, border-state-subtle divider tokens. §3.7 ColourPicker trigger alignment with Dropdown/DatePicker. §4.1 Card entity accent bar cascade note. §0a Developer Process Standards added (visual verification, no magic values, CSS nuances). |
| 2.3 | 2026-06-01 | Ben + Claude | §1.1 Surface tokens: corrected hex values to match index.css implementation; added --color-surface-active (#26264a) for small button hover inside panels; corrected --color-border values. §1.9 Token table: clarified bg-control-active (nav tabs only) vs bg-accent-active (picker panel tabs only). §3.7 ColourPicker: swatch ring changed from ring-white/80 (magic) to ring-accent ring-offset-surface-raised (tokens); panel tab corrected to bg-accent-active text-accent; inactive tab corrected to text-text-secondary. §3.8 EmojiIconPicker: grid hover changed from bg-surface-hover to bg-surface-active (surface-hover is near-invisible on raised panels); panel tab corrected to bg-accent-active text-accent; clear button added to trigger. |
| 2.4 | 2026-06-04 | Ben + Claude | §5.3 Topbar account menu expanded: full visual layout (name/email header + Settings + Log out), panel tokens (bg-surface-overlay, border-border, shadow-xl, z-dropdown, min-w-context-menu), trigger pattern (avatar button replaces Link), close behaviours (Escape/click-outside/re-click), destructive Log out styling (text-error), deferred display currency selector, implementation note (ContextMenu with header item variant). |
| 2.5 | 2026-06-04 | Ben + Claude | §9.7 JoinHousehold: added decline-for-authenticated-user flow (POST /api/invitations/:token/decline creates new household, triggers welcome toast); updated expired/declined/cancelled state list. §9.8 Settings Page: full specification — Household tab (owner-only edit, Danger Zone delete), Members tab (role visibility rules for owner/admin/member, invite flow, Leave Household button), Welcome Toast (§9.8.3, isFirstLogin flag, sessionStorage guard), Currencies placeholder. §9.9 Login not_invited error copy. §9.8 (former DebtSummaryView) renumbered to §9.10. |
| 2.9 | 2026-06-05 | Ben + Claude | Bug fix pass. §9.7 JoinHousehold accept state: added 409 AlertBanner ("already belongs to a household — leave or delete it first") with "Go to Settings" action. §9.8.2 Leave Household: corrected flow — `POST /api/persons/leave` returns `household: null`; on 200 call `clearAuth()` and navigate to `/login`; corrected modal copy (new household created on next sign-in, not immediately). |
| 2.6 | 2026-06-04 | Ben + Claude | §9.8 Settings Page expanded to 4 tabs. §9.8 opening: full tab-bar visual + token spec. §9.8.4 Currencies tab: full spec — table columns (Code/Name/Symbol/Rate with stale ⚠/Fee/Active toggle/Actions ContextMenu), Add/Edit modal, Set as Base ConfirmationDialog, Refresh Rates button, stale footer. §9.8.5 Profile tab (new): Avatar/Display Name/Email(read-only)/Display Currency Dropdown/Default View SegmentedControl/Save Changes. §5.3 account menu update noted: "My Profile" item added (SETTINGS-003). |
| 2.7 | 2026-06-04 | Ben + Claude | Comprehensive implementation alignment pass (from FE-001–FE-008 + AUTH-003–005 diff audit). §1.1: focus ring glow token table (ring-glow-primary/accent/error with per-component mapping); text-text-inverse semantics (white on coloured backgrounds only). §1.6 Z-Index Scale: portal escaping rule, toast top-[80px] placement, modal backdrop/panel both z-modal note, raw integer prohibition. §2.5 Avatar: exact initials algorithm (2-char, fallback "?"), alt text pattern, entity-person background. §2.7 Tooltip: whitespace-normal break-words wrapping; JS boundary clamping + vertical flip precise mechanism documented (no placement prop needed). §4.2 Modal: dirty-guard banner tokens (bg-warning-muted), size table (xs/sm/md/lg/fullscreen), mobile bottom-sheet (items-end + rounded-t-xl). §4.6a FloatingPosition: new section documenting useFloatingPosition hook, RAF-throttled tracking, portal escaping, single-hook rule. §4.7 Table: thead bg changed to bg-surface-raised + border-b-2 border-border-light for obvious header distinctness; sort icon opacity behaviour; mobile card-list collapse detail; ContextMenu-per-row rule. §9.1 EntityCard: inline style accent bar note (Tailwind border shorthand override); design system demo variants. §9.3 EntityPage: design system demo + BulkActionBar behaviour. §9.6 PublicPage: corrected max-w-content (28rem) not min-w-[360px]; full layout token documentation. §9.10 Design System Page (new): section catalogue, public pages subsection note. §9.11 DebtSummaryView renumbered. |
| 2.8 | 2026-06-05 | Ben + Claude | §5.5 Tabs: split into Pattern A (underline) and Pattern B (pill tab bar); defined when to use each, container/pill tokens, URL-sync rule. §7.1, §7.4, §7.9: added §7.11 legend toggle pill reference. §7.11 Chart Legend Toggle Pills (new): pill states (active/inactive/hover), inline style pattern for dynamic chart colors using color-mix(), toggle behavior, at-least-one-active guard, aria-pressed accessibility. §10.2: added entity card entrance (translateY 12px, duration-slow), entity archive (opacity then max-height collapse), staggered list load (40ms stagger, cap at 8), alert banner appear/dismiss, sidebar collapse/expand (labels fade before width). §10.3: added chart legend pill toggle on/off, filter chip appear/dismiss (ease-bounce/ease-in), drag card lift (cross-ref §4.9), balance value live update (amber pulse). |
| 2.9 | 2026-06-05 | Ben + Claude | §9.8.2 Members tab: replaced inline role Dropdown + trash icon button with `⋯` ContextMenu per row (§4.7 consistency); ContextMenu items: "Change to Admin"/"Change to Member" + divider + "Remove member" (label shortened from "Remove from household"). Pending Invitations section converted from custom div list to `Table` component with `⋯` ContextMenu (Copy invitation link + Cancel invitation). "Leave Household" button changed from `secondary + text-error` to `variant="danger"`. |
| 2.11 | 2026-06-05 | Ben + Claude | §9.13 Accounts Pages (new): full spec for AccountCard anatomy per account_type (secondary info lines for bank/credit_card/capital/asset/insurance), entity accent token mapping, account type selector pill row, type-switch ConfirmationDialog, modal field layout (full-width vs half-width per type), section dividers, RecurringConfig Toggle section, valuation history Skeleton placeholder + Add Valuation modal (Date/Value/Source/Notes), Manage Owners modal (multi-select chips with primary star). |
| 2.10 | 2026-06-05 | Ben + Claude | Epic 2 doc alignment pass. §4.6 ContextMenu: added header item variant spec (`{ header: true; displayName; email }` — renders non-interactive name/email block above items, used by Topbar account menu). §4.6a FloatingPosition: added full API signature (`useFloatingPosition(triggerRef, open, options?)` → `FloatingPosition \| null`) with usage pattern. §4.10 Multi-Select: corrected BulkActionBar description — bar is inline below entity list, not fixed-bottom viewport; updated button set (Archive + Delete, no Export or Categorise yet). §4.11 BulkActionBar (new standalone spec): container tokens, entrance animation, count label, action button table, props interface, integration note. Revision history reordered: 2.7 (Jun 4) → 2.8 (Jun 5) → 2.9 (Jun 5) — previously listed out of order as 2.9 → 2.8 → 2.7. Frontmatter version corrected to 2.10. |
