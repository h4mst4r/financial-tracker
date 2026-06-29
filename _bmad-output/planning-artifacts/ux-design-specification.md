# Financial Tracker — UX Design Specification

> **Systems, not values.** Layers: **Foundation** → Primitives → Composites → Pages. Each system = **inputs · derivation · law**; everything borrowed, never authored at a call site. `§0–§18` = a foundation system **in this doc**; page modules are referenced **by name**. Build-conformance gaps (build ↔ this spec) live in [FRONTEND-AUDIT.md](FRONTEND-AUDIT.md).

---

## 0. Theme Authoring — the authorable set

A theme is **only** these inputs; everything else derives. (Per-person prefs — theme choice, font, density, reduce-motion — are *not* theme inputs.)

| group | authorable | scope |
|---|---|---|
| **Structure** | `hue` · `chroma-lo` · `chroma-hi` · `profile` (dark/light/immersive) · `L-lo` · `L-hi` · `ΔL-state` · *(opt)* `interaction-tint` | per theme · §1 |
| **Accents** | `accent-primary` · `accent-secondary` · `accent-important` | per theme · §6 |
| **Alphas** | `alpha-max` (~35) — fills/glows are fractions | per theme · §6 |
| **Shadows** | opacity extremes `[lo, hi]` + *(opt)* `shadow-tint` | per theme · §9 |
| **Semantic** | `success` · `warning` · `error` · `info` | **global default** — immersive remaps; override only for harmony · §4 |
| **Viz series** | `chart-1 … chart-8` | **global default** — immersive remaps; override optional · §9 |
| **Immersive** (`immersive=true`) | `tint` · `tint_ramp` | per immersive theme · §1 · §3 |

All graded values (L tones, emphasis, alphas, shadow opacity) come from **the Scale (§0a)** — author the *extremes*, the stops derive. `on-primary`, `red-muted` derive. *(Disabled is a **relative surface-mix** (§3a, `--disabled`), not a `disabled-grey` colour — there is no such token.)* Optional `interaction-tint` / `shadow-tint` ship **unset** for MVP (inherit the plain L-step / near-black defaults).

**Law:** anything *derived* (surface states, `*-subtle/active/fill`, `ring-glow-*`, entity tints, text emphasis) in a `[data-theme]` block is the failure signal.

## 0a. The Scale (one generator)

Every graded value — surface lightness (§1), text emphasis (§2), fill/glow/shadow alpha (§6/§9) — is `lerp(lo, hi, f)`: `f` a **fixed normalized fraction** (the stop's position, shared across themes), `[lo, hi]` the **per-context extremes** a theme authors. Where contrast matters, **`lo` = the a11y floor** — so every stop is legible *by construction*, not by clamp. Linear (predictable without a viewer). **Author the extremes; the stops derive.**

## 1. Structural Ladder

Surface/border tone = `OKLCH( lerp(L-lo, L-hi, f), lerp(chroma-lo, chroma-hi, f), hue )` (§0a) — `f` from the theme's **profile**. Chroma is on the scale too, so it fades toward the neutral extreme (a near-neutral `bg`, a near-white `surface`).

**Authored:** `hue · chroma-lo · chroma-hi · profile · L-lo · L-hi · ΔL-state` (~7 numbers; the 8 tones derive).

**Profiles** (stop → fraction; shared by every theme of that family):

| stop | dark | light | immersive |
|---|---|---|---|
| bg | 0 | .91 | 0 |
| surface | .22 | 1.0 | .36 |
| surface-active | .30 | .86 | · |
| raised | .37 | 1.0 | .52 |
| overlay | .52 | 1.0 | · |
| border | .52 | .62 | .81 |
| border-light | .73 | .35 | · |
| border-strong | 1.0 | 0 | 1.0 |

(Dark: bg darkest. Light: surfaces pin to white, borders descend — elevation via shadow, §9. Immersive: a few distinct flat tones.)

**Per-theme extremes** (OKLCH L %):

| | dark | light | retro | brown | gameboy |
|---|---|---|---|---|---|
| profile | dark | light | light | dark | immersive |
| L-lo | 14 | 78 | 70 | 22 | 30 |
| L-hi | 44 | 100 | 99 | 49 | 72 |
| chroma-lo | .015 | .03 | .04 | .02 | .09 |
| chroma-hi | .05 | .005 | .02 | .05 | .11 |
| ΔL-state | 6 | 4 | 4 | 6 | — |

*(chroma values approximate — tune on build; `lo`/`hi` track the L-lo/L-hi ends, so the neutral end gets the lower chroma.)*

**State chain (rest → hover → pressed → active/selected → disabled).** Every state is a transform of the *resolved* resting fill (§1 structural · §3 entity calm/vivid/immersive · §6 accent) — **never a separate colour decision.** It varies only by element kind:

| element | rest | hover | pressed | selected *(§6)* | disabled |
|---|---|---|---|---|---|
| **Card** | resolved calm/vivid fill | **float** — translate up + shadow (§13 hover-lift); **fill unchanged** (calm/vivid identity preserved) | — *(cards don't press; tap = open)* | offset `selection-ring` + corner tick + lift | §3a |
| **Control — *structural fill*** (row · ghost-rest button · segment · menu item) | a structural stop (§1) | step `ΔL-state` **toward the border pole** (lighter on dark themes, darker on light — always *away from `bg`*; for list/menu rows the resolved hover tone *is* the `surface-active` stop) | fill **floods to `border`** (the outline fills in) + press-scale `.97` (§13) | `accent-secondary` ring/fill (§6) | §3a |
| **Control — *solid colour/accent fill*** (primary Button · active Toggle · vivid) | the accent/entity fill | one step **more saturated / emphasised** (no outline to flood) | one step **darker** + press-scale `.97` | per §6 | §3a |
| **Bordered / ghost** | transparent + `border` | faint fill tint of the resolved colour + `border → border-light` | floods to solid `border` fill + press-scale `.97` | `accent-secondary` (§6) | §3a |
| **Input** | **inset** = `surface − ΔL-state` (recessed; on `surface`+, **never `bg`**) | — *(inputs focus, not lift)* | — | focus = `focus-ring` + glow · error = `error-ring` · **open picker = `accent-secondary`** (§6) | §3a |

> **Selection is always §6 accent, never `surface-active`.** The `surface-active` stop is a **neutral §1 tone** (list/menu-row hover · toggle-off track · scrollbar thumb) — a *resolved hover/held tone*, **not** the selected state. Selected/active-item/open-picker = `accent-secondary` (§6).

**Deriving the step (§0a):** `ΔL-state` is the per-theme state offset (dark ≈ 6, light ≈ 4). Hover moves the fill **one step along the Scale toward the high-contrast `border` end of the ramp**; `inset-input` moves one step the other way (toward `bg`) to recess. A **chromatic** (entity/accent) fill takes an equal-weight saturate/brighten step instead of a tone step — **hue is always preserved.** *(opt)* **interaction-tint:** if a theme sets a tint, hover/pressed/active interpolate toward it (Winamp-style) instead; ships **unset** (plain steps).

**Pressed, resolved (what the "outline fills in" shorthand hides):** "fill floods to `border`" applies **only where there is an outline to flood** — structural / bordered / ghost controls. A fill that is **already solid** (primary Button, active Toggle, vivid card) has no outline, so its press is **one step darker + press-scale**, not a flood. *Every* element presses with the §13 `.97` scale regardless.

**Disabled is not a lift — it is §3a.** It resolves **first** and wins the §6 precedence (`disabled > error > selected > focus > hover`): the fill mixes **toward its own surface** by `--disabled`, text → `faint` (§2), cursor `not-allowed`, and **no hover / press / focus** fires. §1 only *references* §3a — the definition stays single-sourced there.

**Immersive changes the *mechanism*, not the chain.** Under `immersive=true` the fill is a **ramp slot** (§3 remap beats vivid), so the steps above become **discrete ramp shifts, not continuous `ΔL` nudges** (the ramp is banded — a sub-step would be invisible): rest = the entity's ramp slot · hover → shift toward `border-strong` · pressed → solid `border` fill · active/selected → a **distinct** ramp slot · disabled → §3a toward its ramp surface. **Law: hover / pressed / selected must land on visibly distinct ramp tones.**

**Borders** = the three top stops (`border < border-light < border-strong`); per-entity / immersive may tint them.

**Laws:** a `[data-theme]` sets only the §0 set — a derived tone in a theme block FAILS. Inputs sit on `surface`+, never `bg`. Disabled is §3a, never re-defined at the control.

## 2. Text Emphasis

`text = mix(pole, surface, e)` where `e = lerp(floor, pole, f)` (§0a) — `pole` = the surface's contrast-winner; **`floor` = that surface's 4.5:1 point** (`contrastText`). So `muted` *is* the floor by construction. Size is independent (§7).

| emphasis | f | ratio | use |
|---|---|---|---|
| strong | 1.0 | pole (max) | headings, key figures |
| default | 0.5 | ~7:1 | body, primary UI |
| muted | 0.0 | 4.5:1 (floor) | secondary, caption, meta |
| faint | sub-floor | 3:1 | disabled, decorative, large-only |

`faint` = solved to its own **3:1** target (below the floor — exempt use only); `--e-text-faint` is solved per theme just as `--e-text-muted` is solved to 4.5:1 (the immersive Game-Boy ramp is floor-exempt). The four stops are the tokens `--color-text-{strong,default,muted,faint}` (renamed from `primary/secondary` to this §2 vocabulary). **Law:** colour only via the emphasis util; `faint` is never body content.

## 3. Colour Resolution (one engine)

`resolve(hue, {calm|vivid|immersive}) → fill`, then `contrastText(fill) → text`. **The hue is a per-entity colour OR a semantic hue** (status / alert / zone-like containers).

**Order:** disabled (§3a) → hue overrides the structural anchor → theme tints (calm) → vivid (full saturation, ignores theme) → immersive (ramp slot, **beats vivid**). **Text precedence:** immersive > vivid > tint > theme; **contrast-clamp is terminal**.

**Law:** no per-element entity/semantic `color-mix` — call the resolver / `bg-entity-*` utils.

**Immersive remap (the algorithm).** When `immersive=true`, every per-instance entity hue and the semantic hues remap onto the theme's `tint_ramp` (N steps, light→dark): **entity colour → the ramp step nearest in lightness**, `idx = round((1 − L) · (N − 1))` on OKLab L\* (darker source → darker step, preserving relative lightness); **collisions** (two entities on one slot) nudge one to an adjacent slot by a stable `entity_id` hash → distinct chart shades, deterministic across sessions. **Semantic colours → fixed ramp positions** (income lightest, expense darkest), meaning carried by icon/shape (a monochrome ramp can't hold red-vs-green). Interaction/feedback tokens (`accent-primary/secondary`, rings, selection-fill) map to **two distinct ramp positions** so focus/selection still read. `immersive=false` skips the remap — entity + semantic hues keep their true hex; only roles 1–3 reskin.

## 3a. Disabled

Resolves first; beats entity/theme/vivid/immersive.

- Text → `faint` (§2). Fills/controls → blended **toward their own surface** by the named `--disabled` amount (`--disabled: 40%` — relative, not a fixed opacity); no compounding on nested disabled. Implemented as the one unlayered `.disabled` class so it wins over a control's base fill/text utilities.
- Cursor `not-allowed`; no hover/press/focus.
- a11y: `aria-disabled` if it must explain why; `disabled` if truly dead.

**Permission rendering (one rule, so it isn't guessed per surface):** an action the user can't take is **`disabled` + a reason** when the control is *contextually present but blocked* (Delete-if-has-data, a Member on a row they don't own, owner-not-removable) — never a dead-end; it is **hidden** only when the **whole capability is out of scope** (a Member never sees household-admin sections at all). Default: **row/menu/inline actions → disabled-with-reason; entire admin surfaces → hidden.**

**Law:** one `disabled` utility — no per-component hand-mix.

## 4. Semantic Colours

Anchors `success · warning · error · info` — **global defaults, not per-theme** (one set works on every theme; the contrast floor handles legibility). Immersive remaps them to ramp positions (meaning via icon/shape, never hue). `red-muted` derives (disabled = the §3a relative surface-mix, not a colour token).

| inflow / `+` | success | outflow / `−` | error |
|---|---|---|---|

Signs colour the **figure's text** (amount/sign), not status — **all status colouring is the StatusBadge registry below** (transaction `paid/pending/cancelled` etc. resolve there, single source). Cross-currency uses the arrow form. A **semantic hue feeds the §3 resolver** to tint a container (alerts, zones). **Chips / badges** = `{semantic}-fill` (the semantic colour at `alpha-fill`, §6) + solid `{semantic}` text. **Law:** no green/red/amber hex in TSX.

**StatusBadge registry — the one status binding.** Every status indicator (chip · freshness badge · ledger `dot` · alert badge) is `Badge` driven by a **tone** from a central registry; a surface passes a *domain + status key*, **never a colour**. **Five tones — each *is* a §0/§4 token, so they reskin per theme:** `positive` = `success` (green) · `warning` = `warning` (amber) · `critical` = `error` (red) · `neutral` = grey (`surface-active`/`border`) · `info` = `info` (blue — the §0 semantic anchor, **not** `accent-secondary`). **No domain uses a sixth tone**, and each domain picks a *subset* (every current domain uses ≤ 4). **Registry (authoritative — add a status = one row):**

| domain | status → tone |
|---|---|
| Currency freshness | fresh → positive · stale >48 h → warning · never → neutral |
| FX provider | ok → positive · stale → warning · down → critical · unknown → neutral |
| Backup | success → positive · in-progress → warning (spinner) · failed → critical |
| Recurring occurrence | processed → positive · upcoming/skipped → neutral · missed/failed → critical |
| Transaction (`dot`) | paid → positive · pending → warning · cancelled → neutral |
| Invitation | accepted → positive · pending → warning · declined/expired/revoked → neutral |
| Member | active → positive · archived → neutral |
| FX provider key | set → positive · missing → warning |
| FX provider enabled | enabled → positive · disabled → neutral |
| Category type | income → positive · expense → critical · both → info (the §0.1 inflow/outflow semantic) |
| Budget health | under → positive · near (≥ threshold) → warning · over 100 % → critical |
| FX base source (Transaction modal) | formula → info · spot → neutral · manual → warning |
| Alert (`alert_type`) | BUDGET_WARNING → warning · BUDGET_EXCEEDED → critical · RECURRING_MISSED → critical · FX_RATE_STALE → warning · UPCOMING_PAYMENTS → info · FX_API_DOWN → critical · BACKUP_CREATED → positive |

**FX base source** renders as the input **border** colour (§10) + a tag, **not** a `Badge` — but obeys the same discipline (consume the key, read the tone token; the three tones `info`/`neutral`/`warning` are visually distinct blue/grey/amber). **Law:** a surface consumes `Badge` (or the tone token) + a registry key — it **never** restyles a status / authors the colour at the call site.

## 5. Per-Entity Identity

- **Category · Account** → tints its `Badge` (text + fill) **and** the card / CategoryTree-row (§3, entity hue).
- **Currency** → its `Badge`, plus the currency **name's text colour** in the Currencies page (text-only).
- **Payment Method** → its linked account's colour. **Avatar** → person avatar (circle).
- **Colour dots** → carry **semantic** colour (status, read/unread alerts) or a **chart-legend** key — never entity identity. (People = circles, things = rounded squares.)
- **The "glyph chip" / "icon chip" is not a new primitive** — for a *thing* it is a `Badge` (entity tone, **icon-only**, rounded-square); for a *person* it is an `Avatar` (circle). "chip", "tag", "pill" are **always a `Badge`** — never bespoke.

**Law:** entity identity colour reaches the DOM **only via the §3 resolver / `bg-entity-*` utils** — never a raw entity hex at a call site; a dot never carries identity (semantic/legend only).

## 6. Feedback & Selection

**Anchors (authored):** `accent-primary` (focus) · `accent-secondary` (selection / active / Open·Visualize) · `accent-important` (favourite). Delete = `error` (§4). `on-primary` derives (`contrastText(accent-primary)`).

**Alpha scale (§0a):** author `alpha-max` (~35); fills/glows are fractions — `subtle .45 (≈16)` · `fill .5 (≈18)` · `active .6 (≈21)` · `glow 1.0 (35)`.

**The feedback grid** — 3 roles × {ring · fill · glow}, generated from the anchors + the alpha scale:

| role | ring (solid 2px) | fill | glow |
|---|---|---|---|
| **focus** = accent-primary | `focus-ring` (`:focus-visible`) | `accent-subtle` | `ring-glow-primary` |
| **selection / active** = accent-secondary | `selection-ring` | `selection-fill` | `ring-glow-secondary` |
| **error** = error | `error-ring` | `error-fill` | `ring-glow-error` |

- **Focus** = ring **+** glow together. **Selection** = ring (bordered) or fill (borderless) + glow.
- **Selection mechanics:** bordered → `selection-ring`; borderless → `selection-fill`. **Tick** = the non-colour signal *only where no Checkbox is shown*. Control by cardinality: multi → **Checkbox**; single-choice surfaces use `SegmentedControl` / `Dropdown` (no standalone Radio primitive — 0 consumers). Picked date-day = solid; glyph = outline.
- **Semantic `Badge` fills** (status badges) live in §4, not here — they're status, not interaction.
- **Precedence (no two states share a channel):** **disabled > error > selected > focus > hover**. The top state owns the *primary* channel (ring / fill colour); lower states stack on *other* channels — error owns the ring, focus adds the glow; selection owns ring/tick, hover adds the §1 hover step. Only same-channel conflicts resolve by priority; different channels coexist.

**Law:** focus / selection / error treatments come **only** from the feedback-grid tokens (`focus-ring` · `selection-ring`/`selection-fill` · `error-ring`/`error-fill` · `ring-glow-*` · `accent-subtle`); **no hand-rolled ring / outline / box-shadow / `accent-*` mix** at a call site. The anchors (`accent-primary/secondary/important`) live in a theme block; everything else here derives (§0a alpha scale).

## 7. Typography

Inter (sans) · JetBrains Mono (money, columnar contexts only). Scale (geometric — emphasis is §2): 3xl 30 · 2xl 24 · xl 20 · lg 18 · base 16 · sm 14 · xs 12 · 2xs 11 · 3xs 10. Role→size: Display 3xl · H1 2xl · H2 xl · H3 lg · body base · UI sm · caption xs · label 2xs · micro 3xs.

**Every figure is an atom** — `MonetaryValue` · `DateValue` · `NumberValue` (the *components* live in Layer 2; variant = the format, callers never hand-format; null → `—` at `muted`; overflow → ellipsis + full value on hover). **`MonetaryValue` variants:** `columnar` (mono/tabular, right-aligned — ledgers/tables) · `hero` (sans face — standalone card figures) · `dual` (cross-currency "S$ 500 → NZD 568", one owner of the arrow) · `signColour` (outflow red / inflow green, opt-in); **layer is the caller's choice** — the atom renders whatever amount+currency it's handed (native / base / display), owning *how* money looks, never *which* layer. **Format (locked, so two devs can't diverge):** symbol/code **prefix** + space (`S$ 1,234.50`); **comma** thousands · **dot** decimal; **2 dp** for fiat (the currency's `Intl` minor-units where they differ, e.g. JPY 0); negative = a **leading `−`** (not parentheses), coloured by `signColour` when opted in; null → `—` at `muted`. `DateValue` = the per-person `display_format` (§Settings), never a hand-built string. **Law:** no raw `.toLocaleString()` / `.toFixed()` / hand-built dates in TSX — via the atoms.

## 8. Spacing / Radius / Size

Spacing (8px): 2xs 4 · xs 8 · sm 12 · md 16 · lg 24 · xl 32 · 2xl 48. Radius (4px): sm 4 · md 8 · lg 12 (card) · xl 16 · full. **Size** (icon / avatar / indicator): xs 16 · sm 20 · md 24 · lg 32 · xl 40 · 2xl 48. **Control height** (button/input/segment/row): base 40 · compact 32 (the ×0.8 density transform, §15). **Law:** no raw px / arbitrary Tailwind values in TSX.

**Content-region (slot) rule:** any region hosting routed or centred content — **AppShell main · NeutralShell centre · Modal / Dialog / Drawer body · page content · EmptyState** — **fills its available main-axis** and **sets `min-w-0` / `min-h-0`** (defeats the flex min-content collapse — the recurring "one-word-wide" bug) and **owns its own overflow/scroll**. One rule; every slot inherits it. **Law:** a content slot without the min-axis reset FAILS.

## 9. Elevation / Layering

Two axes: **tone** (§1) and **elevation** = `{ z, shadow, below-treatment }`. Shadow scales with z-depth (the depth cue — deeper floats cast bigger shadows, not arbitrary). Below-treatment has exactly three values because there are three interaction semantics: **none** (passive) · **click-catcher** (transparent light-dismiss) · **backdrop** (dim, blocks).

| z | level | shadow | below-treatment |
|---|---|---|---|
| −1 | below | none | none |
| 0 | base | sm (resting) | none |
| 10 | raised | md (hover-lift) | none |
| 100 | dropdown | lg | click-catcher (no dim) |
| 200 | sticky | none → sm on scroll | none |
| 300 | sidebar | desktop none / mobile xl | desktop none / mobile backdrop |
| 400 | modal | xl | backdrop (dim + optional blur) |
| 500 | toast | lg | none — never blocks |
| 600 | tooltip | md / none | none, `pointer-events:none` |

Backdrop lives **only** at the modal family (+ mobile drawer); a `ConfirmationDialog` is modal-family (backdrop), **not** a toast. Nested modals stack within the band, each its own backdrop. Blur is modal-only, separable from dim.

**Shadow** — geometry per step is fixed (`y blur`: sm `0 1 2` · md `0 2 8` · lg `0 8 24` · xl `0 16 48`). **Opacity = `lerp(opacity-lo, opacity-hi, step)`** (§0a): a theme authors just the **two extremes** — dark `[.30, .55]`, light `[.06, .16]` (light needs stronger; dark leans on the surface-lift). Colour = `shadow-tint` (if unset, inherits near-black `#000`).

Breakpoints: xs 480 · sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1536. Usable: desktop ≥1280 · tablet ≥768 · mobile ≥375. **Law:** backdrop outside the modal tier FAILS; shadow = a token step.

## 10. Borders

Width: `1px` everywhere · `2px` rings (focus/selection). Colour from the border stop (§1); immersive / per-entity may tint it. **Law:** no arbitrary border-width. (Focus / selection / error treatments → §6.)

## 11. Icons & Emojis

Icons via the `Icon` wrapper (lucide, 16–20px), coloured **as text** (tint + contrast-pole). Emojis: one library, tinted, **never contrast-poled**. **One library** (lucide) behind the wrapper so a copyright/licensing swap is a **single edit** — never a direct lucide import at a call site.

**Icon registry (authoritative — a glyph is a *lookup*, never a call-site pick; lifted from the build's `config/`):**

| domain | key → lucide glyph |
|---|---|
| **Sidebar nav** | Dashboard→`LayoutDashboard` · Accounts→`Wallet` · Capital→`TrendingUp` · Assets→`House` · Insurance→`Shield` · Transactions→`ArrowLeftRight` · Recurring→`Repeat` · Transfers→`ArrowRightLeft` · Budgets→`ChartPie` · Debt→`CreditCard` · Categories→`FolderTree` · Currencies→`CircleDollarSign` · Formula→`Calculator` · Settings→`Settings` |
| **Account-type glyph** (`ACCOUNT_TYPE_ICON`) | bank→`Landmark` · credit_card→`CreditCard` · capital→`TrendingUp` · asset→`Building2` · insurance→`ShieldCheck` |
| **Row / menu actions** (`ACTION_ICON`) | New/Add→`Plus` · Edit→`Pencil` · Duplicate→`Copy` · Archive→`Archive` · Restore→`RotateCcw` · Restore-member→`ArchiveRestore` · Delete→`Trash2` · Favourite→`Star` · More(⋮)→`MoreVertical` · Sort→`ArrowUpDown` · Search→`Search` · Expand/Visualize→`Maximize2` · Drag→`GripVertical` · Promote→`ArrowUpToLine` · Move-to→`FolderInput` · Merge→`Merge` · Close/Clear→`X` · Select✓→`Check` · Tag→`Tag` · Invite→`UserPlus` · Revoke-invite→`MailX` · Remove-member→`UserMinus` · Profile→`User` · Sign-out→`LogOut` · Locked→`Lock` · Role-up→`ArrowUp` · Role-down→`ArrowDown` |
| **Control / furniture** (`CONTROL_ICON` — primitive UI affordances, not domain choices) | Hamburger→`Menu` · Calendar-trigger→`Calendar` · Filters→`SlidersHorizontal` · Sort-asc→`ChevronUp` · Sort-desc / collapse→`ChevronDown` · Prev→`ChevronLeft` · Next / tree-expand→`ChevronRight` · Tree-leaf→`Minus` · Trend-up→`TrendingUp` · Trend-down→`TrendingDown` |
| **Semantic / status** (`STATUS_ICON`, keyed by the §4 `StatusTone` — *never colour alone*) | `positive`→`Check` · `warning`→`AlertTriangle` · `critical`→`XCircle` · `info`→`Info` · `neutral`→ none |
| **Alert types** (`ALERT_ICON`; `alert_type` → glyph; tone in §4) | BUDGET_WARNING→`AlertTriangle` · BUDGET_EXCEEDED→`AlertTriangle` · RECURRING_MISSED→`CalendarX` · FX_RATE_STALE→`Clock` · UPCOMING_PAYMENTS→`CalendarClock` · FX_API_DOWN→`PlugZap` · BACKUP_CREATED→`DatabaseBackup` |
| **EmptyState icon** | = the surface's **own module nav glyph** (above) — empty Accounts shows `Wallet`, empty Categories `FolderTree`; **error** surfaces use `TriangleAlert` |
| **Category glyph palette** (`config/categoryIcons.ts`) | the one tinted category-icon library the `EmojiIconPicker` offers (House · Car · ShoppingCart · Utensils · Plane · Heart · Gift · Briefcase · … one library, never a call-site pick) |
| **Public/Error pages** (state → glyph · tone) | `loading`→Spinner (no icon) · `not_invited`→`Mail` warning · `access_denied`→`Lock` error · `not_found`→`SearchX` neutral · `refused_connection`→`Unplug` error · `lost_connection`→`WifiOff` warning · `generic_error`→`TriangleAlert` error · `logout`→`LogOut` neutral · `maintenance`→`Wrench` info · `household_deleted`→`House` error · `removed`→`UserMinus` warning · `account_archived`→`Ban` warning · `invalid_invitation`→`Ban` error |

**Law:** every glyph is a registry lookup through `Icon`; no glyph chosen at a call site. *(The sidebar uses `Shield`/`House` for Insurance/Assets while the account-type glyph uses `ShieldCheck`/`Building2` — this split is **intentional and kept**: a nav entry and an account-type badge are distinct contexts. Each context's home (`shell/navigation.ts` vs `config/accountIcons.ts`) owns its glyph; do not collapse them.)*

## 12. Scrollbars & Cursors

Thin themed scrollbar (8px · thumb = `surface-active` → `border-strong` on hover · transparent track · radius-full; **light themes use `border-strong` — `surface-active` is too pale to see**); tinted to the entity colour inside an entity panel, else theme. **Reserve the gutter** (`scrollbar-gutter: stable`) on every app scroll region (the §8 content-region) — a scrollbar appearing/disappearing must not narrow the content box and re-centre a `mx-auto` column (the tab-switch horizontal jump). **Cursors:** pointer (clickable/selectable) · grab/grabbing (draggable) · text (inputs) · **not-allowed (disabled)**.

**Theme-colouring:** the thumb tracks the **§1 structural stops** of the active surface (`surface-active` → `border-strong` on hover); **light** themes pin the thumb to `border-strong` (`surface-active` is too pale); inside an **entity** panel it tints to that entity's resolved §3 colour; under **immersive** it takes the panel's ramp tone. **Law:** every app scroll region uses the themed thin scrollbar **and reserves the gutter** (`scrollbar-gutter: stable`); never the OS default, never a raw scrollbar colour (→ L20).

## 13. Motion (`duration × ease × property × reduced`)

Reduced ∈ {none · instant · fade · **subtle** · pulse · static} (`fade` = explicit cross-fade; **`subtle`** = a kept micro-cue, ≤3% scale; `×motion-factor` produces none/instant).

| trigger | `--duration` | `--ease` | property | reduced |
|---|---|---|---|---|
| press-scale | press 80 | out | `scale(.97)` | **subtle** (kept — ≤3% ≠ vestibular) |
| hover-lift | quick 130 | out | translate + shadow | none |
| modal-in/out | base 200 | out/in | scale + opacity | instant |
| toast-in/out | base 200 | out | translate+opacity+grid-rows | instant |
| drawer | drawer 250 | out | translate | instant |
| expand/collapse | base 200 | in-out | grid-rows | instant |
| viz-rebuild | draw 300 | out | filter saturate+brightness — **series/data-ink layer only** (panel · gridlines · axes static) | instant |
| check-draw / pin-pop / spark-draw | draw 300 | out | stroke-dashoffset / scale | instant |
| merge-slide | slide 420 | in-out | transform+opacity — **phases sequential** (scale→move→fade) | fade |
| delete | emphatic 500 | in | transform+opacity — **drift bottom-right, NO rotate** | fade |
| error-bounce | emphatic 500 | spring | translate (shake) | none |
| archive | archive 550 | linear | filter saturate→0 | instant |
| number-rollup | rollup 650 | linear | JS count | instant |
| skeleton-shimmer | shimmer 1500 | linear | background-position (loop) | static |
| viz-idle-float | float 4000 | in-out | transform (loop) — **pie charts only** | static |
| pie-drill | base 200 | in-out | **cross-zoom**: clicked slice scales up toward full-circle while its child breakdown cross-fades in as the new ring (the **Drill model** — narrows the filter, pushes the breadcrumb); breadcrumb-pop reverses it | fade |
| spin (Spinner) | rollup 650 | linear | rotate loop | **pulse** |
| sweep (ProgressBar) | slide 420 | in-out | translateX loop | **pulse** |
| toggle-slide | quick 130 | out | translateX (thumb) | instant |
| segmented-slide | quick 130 | out | translateX (indicator) | instant |
| tooltip-fade | quick 130 | out | opacity | instant |

**`pulse`** = the reduced fallback for continuous loaders (spin/sweep): an opacity loop (1→.5→1), **not** static (a frozen spinner is meaningless) and vestibular-safe (opacity, not translation).

**Law:** every transition uses `--duration`/`--ease` tokens + declares a reduced kind. Durations stay ≥ a perceptible step apart.

## 14. Gestures (action parity)

Accelerators for existing controls — never new capability. Every action has a keyboard path.

| action | pointer | touch | keyboard |
|---|---|---|---|
| open detail | tap card | tap | Enter |
| favourite | tap ★ (≥44px) | tap ★ | F / menu |
| edit | ⋮→Edit / dbl-click | swipe-right | Enter on ⋮ |
| archive | ⋮→Archive | swipe-left → reveal → tap (+ undo toast) | menu |
| reorder | drag (handle on hover) | drag | ↑/↓ + modifier |
| multi-select | checkbox / shift-click | long-press *(cards)* | Space |
| context menu | ⋮ / right-click | long-press *(rows)* | Menu key |

No touch hover → affordances always-visible or via long-press.

**Drag-feedback (one shared system, all `@dnd-kit` surfaces — CategoryTree · Dashboard reorder · FX-provider reorder):** the **valid drop target** = an `accent-primary` **solid** ring (`ring-2`, the §6 focus *colour* but a solid ring, **not** the translucent glow — so it reads apart from `accent-secondary` selection); the **dragged source dims**; a **drag-overlay chip follows the pointer** (§13 drag-follow). Re-specced **once here**, never per surface; the drop *outcome* is a pure unit-tested `resolveMove` function. **Law:** no bespoke per-surface drop styling.

## 15. Density

comfortable (default) / compact = a **transform on spacing/size tokens**: control/row heights **×0.8**, vertical padding **−1 spacing step**, gaps **−1 step** (e.g. control-height 40→32, `py` xs→2xs). **Law:** any hardcoded height/padding not reading a density token FAILS compact.

## 16. Reduce-motion

`--motion-factor → 0`; each motion's reduced kind (§13) defines its fallback. **No exemptions** — every motion declares a reduced kind; the sole retained micro-cue is the **`subtle` press-scale** (≤3%, not a vestibular trigger). OS `prefers-reduced-motion` or per-person. **Law:** a transition with no declared reduced kind FAILS (the §13 table is the registry; enforced by L12) — reduce-motion is never a per-component opt-out.

## 17. Responsive & Accessibility

**Responsive:** card grids → 1 col (`auto-fit/minmax`, never scroll-x on touch) · CategoryTree stays a strip · pickers/modals → bottom sheets `< md` · ledgers hand-tune (table → cards) · mobile nav = slide-up bottom sheet · expand/rail persists per person.

**Accessibility (WCAG 2.1 AA):**
- Contrast floor 4.5:1 (3:1 ≥18px/bold), **terminal**.
- **Never colour alone** — every colour-meaning also carries icon/shape/text/position.
- Overlays **trap focus** + **return to trigger**. Dynamic feedback announces via `aria-live`.
- Keyboard nav · ARIA · ≥44px targets · **LTR only**.

## 18. Data-Surface States (contract — detail at Layer 3)

Canonical set: **loading** (Skeleton) · **empty** (EmptyState) · **error** (inline + Retry) · **stale** (AlertBanner over live data). **`stale` is targeted** — only externally-refreshed surfaces (FX rates + FX-derived aggregates); most surfaces never declare it. **Skeleton** = surface-level load; **Spinner** = inline/action busy. **Archived is NOT a data state** — it's an entity-instance treatment (§3a / §2.2), orthogonal. **Law:** every data surface declares **each *applicable*** state (not a blanket all-four); a missing applicable state = incomplete (checked at composite/page, like §15 / §17).

---

# Part II — Enforcement

Each system → a guard, so **`/design-system` (the live primitive gallery) is a *demo/output*, no longer an arbiter** — **this spec's** concrete, named values are the truth and are tested **directly** (token parity against `index.css`), not by eyeballing a rendered bible. Mechanism by *kind*; exact guard files settled when tests are written.

**Guard-authoring law — allowlist-detection, never example-matching (binds Story 5F.7; applies to every guard below).** Every guard that *can* be expressed as a positive invariant **MUST** be: declare the **allowlist of legal homes** for a value/construct, then flag **every other origin** — never match the one syntactic *shape* an audit happened to record. A shape-matcher (e.g. `grep 'variant="(success|warning|error)"'`) catches only the form it was written against and is blind to the **same violation re-expressed** — a `Record<…, BadgeVariant>` map, a ternary, a computed prop, a helper, a value buried in a `types/*.ts` file. That is exactly how hand-rolled/DIY surfaces evade the gate: a value-level sweep found the §4 **semantic** tone resolved at call sites that a `variant="…"` grep missed — `INVITATION_BADGE`, the inline `<Badge variant={cond ? … : …}>` status ternaries (member active/archived, FX-provider key/enabled), and `CATEGORY_TYPE_META.badge`. All of these are **semantic** badges and so resolve through the **one §4 registry** (add a domain — `invitation`, `member`, `fxProviderKey`/`fxProviderEnabled`, `categoryType`); there is **no separate "category-badge" home** — a semantic badge is a semantic badge. (`ROLE_BADGE` is **not** in this set: roles map to `outline`/`neutral`, which are *not* semantic tones, so a small local map is fine — there is nothing to register.) **A test that asserts one example is not a guard — it is theatre.** Therefore:

- **Express the invariant, not the example.** Ban the status tones `'success' | 'warning' | 'error'` as a `Badge` variant / `Record<…, BadgeVariant>` origin **outside** the allowlisted homes (`statusRegistry`/`Badge`; allowlist the toast API and the `semanticTextClass` sign-colour path). Same pattern for L6 (green/red/amber hex outside the token layer), L14 (lucide value-imports outside the §11 registry homes; `allowTypeImports`), L11 (`.toLocaleString`/`.toFixed`/hand-built dates outside `lib/` + the value atoms), L1 (derived tones outside §0 inputs in a `[data-theme]` block).
- **Prove non-vacuous in a *non-obvious shape*.** Inject the violation as a `Record`/ternary/helper — not just an inline literal — and confirm the guard goes red. A guard that only reddens on the inline example is vacuous in practice.
- **Manual audit covers only what a guard *cannot*** — the **semantic** call (is this badge a *status* or a *category* badge?), never the mechanical re-expression. The detector's job is to make "is there a hidden system I don't know about?" answerable by CI, not by re-reading every file.

| # | System | Law | test |
|---|---|---|---|
| L0 | Behaviors | every interactive element composes a behavior (`Pressable`/`Field`/`Popover`/`Menu`) — no bare `onClick`/overlay/portal re-implementing focus, keyboard, or dismiss | lint + integration |
| L1 | Ramp / structural | theme sets only §0 inputs (extremes + profile, **not** stops); no derived tone/`*-fill`/scale-stop authored in a theme block | theme-parity + unit |
| L1a | The Scale | graded values via `lerp(extremes, fraction)`; no hardcoded stop values (L tone, emphasis, alpha, shadow opacity) | unit |
| L2 | Inputs on surface | no input/inset element on bare `bg` | lint/review |
| L3 | Text emphasis | colour only via the emphasis util; `faint` ≠ body content | lint + unit |
| L4 | Colour resolution | no per-element entity/semantic `color-mix`; call the resolver | lint + unit |
| L5 | Disabled | one `disabled` utility (relative surface-mix); no hand-mix | lint |
| L6 | Semantic / amounts | no green/red/amber hex in TSX | lint |
| L7 | Magic values (P4) | no raw hex/px/arbitrary-TW in TSX | lint |
| L8 | Reuse | no hand-rolled element a primitive provides | lint (`no-restricted-syntax`) |
| L9 | Elevation | backdrop only in modal tier; shadow = a token step | lint + review |
| L10 | Borders | width ∈ {1px, 2px-ring} | lint |
| L11 | Value atoms | no raw `.toLocaleString()`/`.toFixed()`/hand-built date in TSX | lint |
| L12 | Motion | every transition uses `--duration`/`--ease` + a reduced kind | lint |
| L13 | Density | no hardcoded height/padding; read a density token | lint + compact render test |
| L14 | Icons | no direct lucide import outside `Icon` | lint (`no-restricted-imports`) |
| L15 | a11y | contrast terminal; never-colour-alone; focus-trap/return; `aria-live` | a11y lint + `contrastText` unit |
| L16 | Gestures | every action has a control + keyboard path | integration / checklist |
| L17 | Token hygiene | no prefix/class collisions | token test |
| L18 | Component completeness | every primitive has a `/design-system` gallery entry rendered by its **real exported component** (no synthetic stand-ins) | completeness test (gallery) — **not** a bible pixel-diff |
| L19 | Data-surface states | every data surface declares loading/empty/error/stale | integration / review |
| L20 | Scroll / cursor (§12) | every app scroll region reserves the gutter (`scrollbar-gutter: stable`) + themed thin scrollbar; disabled → `not-allowed`, draggable → `grab` | lint + review |

L16 and L19 aren't pure lint (a control-mapping / a runtime state aren't syntactic) — integration tests or a checklist. The rest are hard gates.

---

# Layer 2 — Primitives

> Each primitive = a composition of foundation systems + a variant law. The job: confirm every primitive borrows **existing** systems (no new authored values). Where a cell has no system, it's a **revisit** (collected at the end). **✓ built · ○ specced, not built.**

## Behaviors (headless — the interaction contracts)

Every interactive thing = **a behavior + a skin**. The behavior owns the interaction (focus, keyboard, state); the skin owns the look. This is the single reuse point — what stops the next hand-rolled radio. "So many buttons" = **one `Pressable` × many skins.**

| behavior | owns | **inherited by — exhaustive, no exceptions** |
|---|---|---|
| **Pressable** | press · focus · disabled · keyboard-activate (§1 states · §3a · §6 focus · §13 press-scale · §14 keyboard · §12 cursor) | Button (filled/outline/text/link/icon/ghost/danger) · FavouriteStar · MiniSparkline · DragHandle · Breadcrumb-crumb · Add-`+` · **every** SegmentedControl segment · Menu item · Table sort-header & row-action · Accordion-style expand-chevron (CategoryTree, recurring) · calendar day · viz-legend toggle · avatar-profile-nav |
| **Field** | value · change · error · disabled · label (§1 inset · §6 · §3a · §2) | Input · Checkbox · Toggle · SegmentedControl · MonetaryValueInput · MultiSelect · Dropdown · DatePicker · CustomRangePicker · GridPicker · ColourPicker · EmojiIconPicker · ThemePicker · RecurringDateInput |
| **Popover** | anchor · position · dismiss · portal · elevation (§9 · §1 overlay) | Modal · Tooltip · ContextMenu · Dropdown · DatePicker · CustomRangePicker · GridPicker · ColourPicker · EmojiIconPicker · ThemePicker · AlertPanel · Drawer · CommandPalette |
| **Menu** | rows-in-Popover + roving keyboard (↑↓ Enter Esc) | Dropdown · ContextMenu · CommandPalette · ThemePicker |

**Law (L0):** these lists are **authoritative** — every interactive component appears under exactly the behaviors it composes. A new interactive component not added here = drift. *(`FontPicker` is **not** a separate primitive — it is a plain `Dropdown` instance, so it carries no row and isn't separately listed; `ThemePicker` earns its row only because it adds a Swatch-row preview.)*

Skins below compose these — `Button` = Pressable + label/icon · `Modal` = Popover + backdrop · `Dropdown` = Menu + trigger.

> **Reading the tables:** an interactive primitive's **inherits** = its **behavior** (which already bundles focus / press / keyboard / disabled / dismiss) **+** only its *presentation-specific* systems. Non-interactive atoms inherit systems directly.

## Atoms (display-only — own no interaction)

> An **atom** renders content and owns no interaction. A clickable atom = a `Pressable` *wrapping* it (e.g. **Avatar → profile**, **Badge → viz-legend toggle**) — the atom stays display-only; the press is the wrapper's. Common but not special — same rule for any atom. `Icon` also renders user-chosen emoji/lucide glyphs (`GlyphView` folded in).

| atom | made of | inherits |
|---|---|---|
| **Icon** ✓ | `<svg>` (lucide / emoji) | §11 · colour §2+§3 · §8 size |
| **Label** ✓ | `<label>` | §7 · §2 · §3a |
| **Divider** ✓ | `<hr>` | §10 · §1 · §3 |
| **Spinner** ✓ | `<svg>` | track = `surface-active` (§1) · arc = `accent-primary` (§6) · §13 spin · §8 size |
| **Skeleton** ✓ | `<div>` | gradient `surface-raised→surface-active` (§1) · §13 skeleton-shimmer · §8 |
| **ProgressBar** ✓ | `<div>` | track = `surface-active` (§1) · fill = `accent-primary`/entity (§6/§3) **or a §4 semantic `tone`** (budget-health under→`positive`/near→`warning`/over→`critical`, read from the registry — never a call-site green/amber/red) · §13 sweep · §8 |
| **Avatar** ✓ | `<img>` / initials | §5 person · §2 initials · §1 fallback · §8 size |
| **Badge** ✓ | `<span>` (+ Icon, + opt Dot) — *absorbs StatusBadge + FilledChip* | §4 status / §5 entity / neutral `surface-active` · §2 · §8 |
| **Dot** ○ | tiny circle `<span>` | status = `§4` semantic · legend = viz-series · unread/new = `accent` (§6) · §8 size |
| **Swatch** ○ | coloured rounded-square `<span>` | the colour as fill · §8 radius-sm · (Pressable when selectable) |
| **MonetaryValue** ✓ | `<span>` — variants `columnar│hero│dual│signColour` | §7 · §4 sign · §2 |
| **DateValue** ✓ | `<span>` | §7 |
| **NumberValue** ✓ | `<span>` | §7 |
| **Watermark** ✓ | large faint `<img>` over `bg` (low opacity) | §1 bg · §8 size |
| **Logo** ✓ | accent-gradient square (+ optional wordmark) | `brand-gradient` = accent-primary→secondary (§6) · §8 size |

> **Branding (white-label config).** `appName · wordmark · mark · favicon · defaultTheme · defaultFont` come from one swappable `branding` config (never hardcoded) — feeds `Logo` / `Watermark` and the default theme + font (the commercial / white-label seam).

## Pressable skins (interactive leaves)

| primitive | made of | inherits (= Pressable +) |
|---|---|---|
| **Button** ✓ | Pressable + label / Icon | `primary` variant = `accent-primary` fill + `on-primary` text (§6); others not · §2 · §8 · §15 · §13 hover-lift |
| **FavouriteStar** ✓ | Pressable + ★ Icon | off = outline / on = filled `accent-important` (§6) · §13 pin-pop |
| **MiniSparkline** ✓ | Pressable + MiniChart-render (launches the **Viewer** with its data) | §5 entity · §13 spark-draw |
| **DragHandle** ○ | Pressable + grip Icon | §14 drag · §12 grab · fades in on row-hover (§13 quick), always-visible on touch (§14) |
| **Breadcrumb-crumb** ○ | Pressable + text / chevron (link skin) | §2 text (focus via Pressable) |
| **Add-`+`** ○ | Pressable + `+` Icon | `accent-primary` fill (primary affordance, §6) · §8 |

## Field skins (controls)

| primitive | made of | inherits (= Field +) |
|---|---|---|
| **Input** ✓ | Field | §10 · §8 · §15 |
| **Checkbox** ✓ | Field + check Icon | §13 check-draw · §8 |
| **Toggle** ✓ | Field + thumb | track off=`surface-active` / on=`accent-primary` (§1/§6) · §13 toggle-slide · §15 |
| **SegmentedControl** ✓ | Field (single-select) + Pressable segments — *`seg-link` variant = **Tabs** (page nav, e.g. Settings)* | §2 · §8 · §13 segmented-slide · §15 |
| **MonetaryValueInput** ✓ | Field + Dropdown + MonetaryValue | — |
| **MultiSelectField** ○ | Field + Dropdown + removable **tokens** (`Badge` entity · `Avatar` person). **Configs:** `create` (on → type-to-create + in-dropdown manage · off → pick existing) · `token` (Badge/Avatar) · opt `cap`. **3 customers:** Transactions tags *(create-on, Badge)* · Accounts owners *(create-off, Avatar)* · Viewer compare *(create-off + cap 2–4/2–8)* | §5 · select-multiple |

> **`MultiSelectField` (this Field) ≠ `useMultiSelect`** (the **row-selection hook** driving `BulkActionBar`, FR-E-020 — a different layer). **Renamed from `MultiSelect`** precisely to end this collision; the hook keeps `useMultiSelect`.

## Pickers (Field + Popover)

> Every picker's trigger opens a Popover; a picker with multiple panes carries a **header row** (tabs and/or a search Input) — **stated per picker, never assumed.**
>
> **`MonthGrid` is a shared *layout base*, not a picker** — neither an atom (it composes Pressable for prev/next month nav) nor a Field+Popover (the pickers wrap it). It renders the 7×N month day-grid + nav and takes a caller **cell render** (selectable day · range cell · heatmap cell); it underlies **DatePicker · CustomRangePicker · the Chart calendar-heatmap**. *(inherits: §8 grid · §13 month-slide · Pressable nav.)*

| primitive | made of | inherits |
|---|---|---|
| **Dropdown** ✓ | Field + Popover + Menu + option rows; **`searchable` variant** = a filter Input at the panel top (roving ↑↓ · ↵ select · Esc close) for long lists | open trigger = `accent-secondary` (§6) · option hover = `surface-active` (§1) · §13 list-slide |
| **DatePicker** ✓ | Field (**typeable input** — a typed date parses) + Popover + **MonthGrid** | picked day = solid `accent-secondary` (§6) · §13 month-slide |
| **CustomRangePicker** ○ | Field + Popover + **MonthGrid** (two-month desktop / one-month `< md`) + preset rail (Last 7/30 · This/Last month · This quarter · This/last year · YTD · All time · Custom) | **selection = a continuous `selection-fill` band** over the in-range days (wrapping onto each week row); the **start & end dates are solid `accent-secondary` endpoint cells** (§6); selected preset = `bg-accent-active`/`text-accent` · §13 month-slide |
| **GridPicker** base ○ | Field + Popover + grid of Pressable cells; **selected cell = `accent-secondary` ring (§6)** | — |
| **ColourPicker** ✓ | GridPicker + **header tabs `Palette │ Hex`** (Hex pane = OS colour-wheel input + hex field) + Swatch cells + vivid Toggle | §5 colour |
| **EmojiIconPicker** ✓ | GridPicker + **header tabs `Emojis │ Icons` + search Input + Recent row** + GlyphView cells | §12 scroll |
| **ThemePicker** ✓ | Dropdown + Swatch row (palette preview) | — |
| **RecurringDateInput** ○ | **`Field` (text `Input`)** — free-text `frequency_text` parsed against the 9 patterns + a **`DateValue` "Next: {date}" preview** (§2 muted) below; no-match = **blocking** `Field` error (§6, Save disabled). **No `Dropdown`/`SegmentedControl` builder** — the parser *is* the interface | §6 error · §2 |

## Overlays (Popover / Menu skins)

| primitive | made of | inherits (= Popover +) |
|---|---|---|
| **Popover** ○ | `<div>` + portal *(the base behavior's component)* | §9 dropdown-tier · §1 overlay · §8 |
| **Modal** ✓ | Popover + backdrop + close | §9 **modal**-tier (overrides base) · §13 modal-in/out · §17 focus-trap |
| **Tooltip** ✓ | Popover | §9 **tooltip**-tier · §2 · §13 tooltip-fade |
| **ContextMenu** ✓ | Popover + Menu + items (Icon + Label) | item hover = `surface-active` (§1) · **action→colour:** Edit/Duplicate/Archive = `text` (§2) · Favourite = `accent-important` (§6) · Open/Visualize = `accent-secondary` (§6) · Delete/Remove = `error` (§4) below a `Divider` (§10) · disabled = §3a |
| **Drawer** ○ | Popover (**modal**-tier) + content | §13 drawer-slide |

*(`AlertPanel` + `CommandPalette` are app-specific arrangements → Layer 3 composites, not Layer 2 skins.)*

## Feedback (non-overlay)

| primitive | made of | inherits |
|---|---|---|
| **Toast** ✓ | `<div>` + Icon + text (+ Button) | body = `surface-overlay` (§1) · **icon only** = semantic (§4, *not* the whole toast) · §9 toast-tier (**fixed bottom-right, off the topbar search/bell/avatar cluster**; newest at bottom, ~4 s auto-dismiss) · §13 toast-in/out |
| **ConfirmationDialog** ✓ | Modal + message + Button(s) + **optional confirm-input slot** (a *safeguard* on high-risk destructive actions, e.g. type-to-confirm — still a decision, not a form) | confirm = `error` (§4) **only when destructive**, else primary |
| **EmptyState** ✓ | `<div>` + Icon + text + Button | §1 · §2 `muted` · §18 |

## Containers

| primitive | made of | inherits |
|---|---|---|
| **Card** ✓ | `<div>` | §1 surface/raised · §10 · §9 shadow · §8 radius-lg · §3 entity · §13 hover-lift |
| **AlertBanner** ✓ | `<div>` + Icon + text (+ Button) | §4 hue → §3 tint · body text = §2 `default` · §8 |
| **Zone / Info-box** ✓ | `<div>` + title + border | §3 tint (semantic/neutral) · §10 dashed/solid · §2 |

## Data — Table (one primitive, three profiles)

`Table<T>` is the **only** tabular surface (never a bespoke row layout). Columns are the reuse unit — each bundles a display atom + inline editor.

- **made of:** `<table>` row-grid + **column vocabulary** — `text` · `money` (MonetaryValue) · `date` (DatePicker) · `status` (Badge `status` + Dot) · `select` (Checkbox / Add-`+`) · `actions` (⋮ ContextMenu) · `metric`/`dimension` (aggregation).
- **inherits:** §1 row hover = `surface-active` · §10 · §2 header `muted`/cells `default` · §6 selection · §15 row height · §12 · §18 loading/empty · §17 collapse-to-cards. *(sorting just reorders — no motion.)*
- **profiles** (presets of the same flags — *no subclasses*): **record-ledger** (selectable + inlineEdit + **quickAdd** *(one add — the leading `＋` in the `select` column; no trailing Add)* + expandableRows) · **aggregation** (onRowClick-drill + totalsRow + matrix, read-only) · **display** (plain read-only).
- **boundary:** Table owns *only the row-grid* — not the page (EntityPage), filters (FilterBar), or bulk bar (BulkActionBar).
- **Scale — `virtualized` + `infinite` (tens of thousands of rows):** a `virtualized` flag **windows** the DOM (`@tanstack/react-virtual` — only the visible rows + a buffer are mounted, so DOM count is bounded, not proportional to data); an `infinite` data source pairs it with **server keyset-pagination** (`useInfiniteQuery` — fetch ~100 rows as you near the bottom, sort/filter server-side). **The ledger uses both = infinite scroll, never numbered pages** (matches the v1 spreadsheet's scroll model). The **import Preview** uses `virtualized` only (the file is already in memory). **Law:** a list expected to exceed ~a few hundred rows declares `virtualized`; **no numbered-page pager.**

## Viz / Dashboard

> Charts are **interactive data**, not atoms — they own hover-tooltip · click-drill · brush-zoom · legend-toggle (each legend key / slice is a `Pressable`). **Two tiers on one shared math layer** (`chartMath` = `d3-scale`/`d3-shape`, grown from `sparkline.ts`): **Tier 1 — math-only, engine-less** (`MiniChart`/`MiniSparkline` — hand-rolled SVG, static, the card/button preview; no charting lib in cards); **Tier 2 — the `visx` engine** over the *same* math (`Chart` in the Viewer **and** `DashboardWidget`-L — one engine, two consumers). Same math + same data/filter contract, different engine. Tapping a `MiniSparkline` (the Pressable wrapper) **navigates to the `Chart` Viewer route seeded with the same `VisualizationFilter`** — one Viewer, every entry point (§9.1).

| primitive | made of | inherits |
|---|---|---|
| **MiniChart** family ○ | `<svg>` — sparkline (= MiniSparkline render) · mini-bar · mini-donut · mini-area | §5 entity-colour · §13 spark-draw · viz math |
| **Chart** (visx engine) ○ | `<svg>` (visx · SVG-only) — line · bar · area · pie/donut · stacked · **calendar-heatmap** (the `table` type = `Table` AggregationTable profile, **not** Chart); *engine detail below* | §4/§5 series colours · §13 viz-rebuild/pie-drill/idle-float · legend = **Badge keys** |

*(`DashboardWidget` · `DashboardGrid` are arrangements → Layer 3 composites, not viz primitives. `DrillBreadcrumb` folds into the **Viewer** — its in-drill stack, not a standalone composite; the crumb is a `Pressable` link.)*

### Chart — the one new viz primitive (the `visx` engine)

The **only** new primitive the Viewer needs; everything else it composes already exists. **`visx` over `d3-scale`/`d3-shape`, SVG-only** (series reskin via `chart-1..8` under immersive themes — never canvas). All motion is **ours** (§13: viz-rebuild CRT-pop on the data-ink layer · pie idle-float · pie-drill cross-zoom) — visx renders static SVG.

- **Renders:** line · bar · area · pie/donut · stacked · **calendar-heatmap** (reuses the shared `MonthGrid`; month nav lives in the control-bar `FilterBar`, differs only in cell render; a **recurring-`Icon`** — lucide `Repeat` via the §11 `Icon` wrapper, **not** a raw `↻` glyph or emoji — on days backed by *known* recurring data, never inferred; date-dimensioned only). The **`table` chart-type is not a Chart** — it's the `Table` AggregationTable profile in the render-slot.
  - **Heatmap colour scale (sequential, single-hue):** each day's metric value maps to a **lightness position on the one `accent-secondary` ramp** (low → high) — a *sequential* scale, **not** the `chart-1..8` categorical set (one metric = one hue, intensity carries magnitude). Domain = **min→max of the metric across the *visible* days** (the range the FilterBar set), so the scale re-normalizes when the range changes; **zero / no-data days are untinted** (`surface`, not the ramp floor) so "no activity" reads distinctly from "low activity". Any in-cell label takes the §0.11 contrast pole (dark text flips on high-intensity cells). Under **immersive** the `accent-secondary` ramp remaps to the theme ramp (§3), so the heatmap reskins with everything else.
- **Interaction:** **hover/focus a point → `Tooltip`** (value · date/bucket · series name; multi-series lists each) + **crosshair + ring/halo marker**; **click pins + drills** → narrows `VisualizationFilter` · **legend toggle** (each `Badge` key is a `Pressable`) · **compare-overlay** (add a series — reuses `MultiSelectField`, capped 2–4 persons / 2–8 categories). *(**Brush-to-zoom is DEFERRED post-MVP** — the date range is driven entirely by the `FilterBar` presets + Custom, and **the axes rescale when a preset is chosen**; that is the MVP behaviour.)*
- **Range & axes:** the date **range** is set by the `FilterBar` presets (Last 7 / 30 days · This/Last month · This quarter · This/last year · YTD · All time · **Custom** → `CustomRangePicker`) + group-by (day/month/quarter/year) — **not** by zoom. The value axis **auto-fits** ("nice" bounds, not forced to 0) with a **"Start at zero"** toggle (default on for bars, off for tight trends); **tick density adapts to the active range** (set by the presets — brush-zoom deferred).
- **Colour (the engine, §3/§5/§0):** a series colour is **deterministic, never picked at the call site** — an **entity-backed series** (a category / account / person / currency) takes **that entity's own §5 identity colour** (so the chart matches its card/chip); an **abstract series** with no identity takes `chart-1..8` (§0) **by stable index** (series order, tie-broken by a stable `entity_id`/key hash; collisions nudge to the next free slot — the same §3 collision rule). **Anti-rainbow:** a single series is **one** colour; colour encodes meaning only with > 1 series. Under **immersive** all of the above remap to the theme's `tint_ramp` (§3).
- **Flat — no faux-3D:** no extrusion / tilt / ground-shadow; bars get only a `radius-sm` top cap; heights/angles geometrically true.
- **States** (§18, in the Viewer slot): empty (`EmptyState` "No data for this range" + Reset) · error (inline + Retry) · loading (chart-shaped `Skeleton`) · **archived scoped entity** → `AlertBanner` above a still-rendered series.

---

# Layer 3 — Composites

> A **composite** = an arrangement of primitives. **It adds no new system or token** — if one needs something new, that's a gap in Layers 0–2. `made of` = the parts it arranges; `inherits` = foundation systems it adds (named to the token). **Pages live in Layer 4.** **✓ built · ○ specced.**
>
> **Reference scheme:** `§0–§18` always = a **foundation system in *this* doc**; a page **module** (Transactions, Budgets, Settings…) is referenced **by name, never `§`**.

## Composites

> **Do-not-recreate ledger** (these were considered and folded — never re-add them as new components): `CategoryDefaultsPrompt` (→ an `EmptyState` instance) · `DensityToggle` (→ a `SegmentedControl`) · `Accordion` (cut — redundant with Table `expandableRows`) · `FilledChip`/`StatusBadge` (→ `Badge`) · `TagInput` (→ `MultiSelectField`) · `MultiSelect` (→ `MultiSelectField`).

| composite | made of | inherits |
|---|---|---|
| **AppShell** ✓ | Sidebar + Topbar + content-region (§8 slot rule) + ToastContainer | §1 bg/surface · §9 sidebar z-band · §17 rail↔bottom-sheet |
| **Sidebar** ✓ | **grouped** nav Pressables (5 groups — Overview · Accounts · Activity · Insights · Setup — from one `NAV_GROUPS` source, muted group labels) + logo-mark (`brand-gradient`, §6) + Settings pinned bottom | active item = `accent-secondary` fill (§6) · §17 rail↔bottom-sheet (rail: labels→Tooltips, group labels→thin dividers, mark-only header, expand toggle) |
| **Topbar** ✓ | ViewContextSwitcher + CommandPalette trigger (Input-styled) + AlertPanel (bell) + ContextMenu(Avatar trigger) → Profile · Sign out | §9 sticky z-band |
| **ViewContextSwitcher** ○ | Mode `SegmentedControl` (Household↔Individual) + member `Dropdown` (Individual-only) + display-currency `Dropdown` | active seg = `accent-secondary` selection (§6) |
| **NeutralShell** ✓ | bare `bg` + centred content-region (§8) | §1 bg |
| **EntityPage** ✓ | EntityPageToolbar + FilterBar + card grid (EntityCard) / Table + EmptyState + Skeleton | §17 card-grid (auto-fit) · §18 loading/empty |
| **EntityPageToolbar** ○ | name (H3 §2) + info-text + sort Pressable + grid/list `SegmentedControl` + `+New` Button (+ grid-end "+New" ghost tile) | §17 → Filters collapse `< md` |
| **EntityCard** ✓ | Card + Avatar/Icon + MonetaryValue(hero) + MiniSparkline + FavouriteStar + ContextMenu + Badge(archived) + owner Avatars | §3 entity calm/vivid fill · §6 selection ring/fill + tick · §13 hover-lift |
| **EntityDetailView** ✓ | the read surface an `EntityCard` **tap** opens (edit stays ⋮→`EntityModal`) — Modal + subtype rows (Label+value) + Table (history) + MiniSparkline + Visualize launch. **Generic to any entity rendered as an `EntityCard`** (Accounts = first consumer; **a Transaction is an `EntityCard` on mobile** (card/tx), so it opens one too) | §3 entity calm/vivid fill (same rules as EntityCard) |
| **EntityModal** ✓ | Modal + Field(s) + Cancel/primary Buttons — *detail block below* | §3 entity tint · §17 bottom-sheet `< md`; tall-form → Drawer variant |
| **BulkActionBar** ✓ | sticky bar + count + Clear `×` (ghost icon Button) + **actions** ∈ {Button · **inline picker** (Dropdown/SegmentedControl — single-target) · destructive→ConfirmationDialog} (destructive after `Divider`) | §9 sticky z-band · §13 bulk-bar-slide |
| **CategoryTree** ✓ | tree row (Pressable) + expand-chevron (Pressable) + Icon[glyph] + Badge[type] + Badge[archived] + Checkbox + Add-`＋` + DragHandle + ContextMenu | §3 entity tint · §14 drag (`@dnd-kit`) · §13 merge-slide |
| **FilterBar** ✓ | descriptor controls (`search │ dateRange │ dropdown │ segmented │ popover`) + clear-all; **two profiles** (record-list · aggregation) | §1 surface · serialises to `VisualizationFilter` |
| **CommandPalette** ○ | Modal (high-centre) + search Input + Menu — **results grouped + capped + counted** (Transactions · Accounts · Categories · Currencies · Budgets · Members, then a **Commands** group: "Go to {module}" / "+ New {entity}") · row = leading `Badge`/`Avatar` + label + muted sublabel + active-row ↵ hint · **ranking** exact > prefix > substring, tie-break `updated_at`, **archived last** · **household-scoped** (respects Individual member filter) · states empty→recents · loading→`Skeleton` rows · none→`EmptyState`+New | §9 modal-tier · §13 modal-in · §17 focus-trap |
| **AlertPanel** ○ | Popover + header ("Alerts" · Mark-all-read) + **alert-row list** + footer ("View all alerts" → `/alerts`). **Alert row** (each a `Pressable`, not a new primitive): leading `Badge` (alert glyph §11 + tone §4) · title §2-strong · one-line body §2-default · relative `DateValue` §2-muted · unread `Dot` §6 · ⋮ `ContextMenu` (Mark read / Dismiss); tap → its `entity_type/id` (`openWithFilter`/route); read (`read_at`) → desaturated (§3a). **The Alerts page reuses this same row list, full-page.** | §9 dropdown-tier · §1 overlay · §13 quick |
| **ToastContainer** ✓ | stack host (portal) for Toast — mounted outside AppShell | §9 toast z-band |
| **TabView** ✓ | `SegmentedControl` (`seg-link`) + panel slot | active tab = seg selection (§6) |
| **Viewer** ○ | **route** (§9 base-tier) — Header (title · chart-type `SegmentedControl` · close=back) + `FilterBar`(aggregation) + **render-slot** {`Chart` · `Table`(aggregation) · calendar} + drill-stack crumbs (the in-Viewer breadcrumb) + `Badge` legend (Pressable toggles) + `MultiSelectField` compare-picker + §18 states | **adds no new system** (reuse-only) · **route forced by FR-V-003** (browser-back restores filter) · §17 mobile = sheet→fullscreen · §13 viz motions |
| **DashboardGrid** ○ | DashboardWidget tiles (span S/M/L, order; per-person persist) — board **container**; lives in the Dashboard page | §14 drag-reorder (`@dnd-kit`) · §17 responsive |
| **DashboardWidget** ○ | Card + (S `MonetaryValue` / M `MiniSparkline` / L visx Viewer-render) + DragHandle + ContextMenu (Resize/Remove/Expand) | §1 · §3 · §14 drag |
| **Table-profile composites** ○ | applied `Table<T>` presets — **RecordLedger** (selectable+inlineEdit+quickAdd+expandableRows) · **AggregationTable** (drill+totalsRow+matrix, read-only) · **ConfigTable** (control cells + opt `@dnd-kit` reorder) | per the `Table` primitive |
| **§18 data-state surfaces** ○ | loading=`Skeleton` · empty=`EmptyState` · error=inline `Icon`(error)+`Retry` (`ErrorBoundary` host) · stale=`AlertBanner` — *detail block below* | §18 — each *applicable* state; archived is an entity state (§3a + the archived-card variant), **not** here |
| **ImportFlow** ○ | `Drawer` + **target `SegmentedControl`** (Transactions / Account snapshots) + 3 steps (Upload → Preview&map → Confirm) + Back/Next/Confirm footer + the conflict `Table`-in-`Modal` — *detail block below*. **Adds no new primitive** (Drawer · Table · Modal · SegmentedControl · Dropdown · Checkbox · Button · EmptyState) | §17 Drawer · §18 states |

## Composite detail (the ‡ deep-pass)

### EntityModal — the one create/edit *form*

`Modal + Field(s) + Cancel/primary Buttons`, §3 entity-tinted (calm, **same colour rules as the card**). The **single** create/edit surface — there are no bespoke form-modal siblings; every form folds here.

**Members (every form is an EntityModal):** account *(subtype-adaptive)* · category *(+ subcategory)* · currency · FX-provider · **snapshot add** *(`EntityModal<AccountSnapshot>` — date · value · source · notes; a **modal** so date + amount are entered together and the series tallies cleanly)* · transaction *(+ FX/money block)* · recurring *(+ RecurringDateInput)* · transfer · NewHousehold · Invite · **bulk multi-field edit** *(events "Edit shared fields" — category · payment_method · status · payee · is_shared_expense at once; a normal form, Epic 5)*.

**NOT an EntityModal (the boundary):**
- **decisions** → `ConfirmationDialog` (incl. destructive + the optional safeguard-input).
- **read / detail** → `EntityDetailView` (Account = first consumer).
- **search** → `CommandPalette`.
- **single-target bulk picks** (Edit-type / Move / Merge) → an **inline picker in `BulkActionBar`** (destructive → `ConfirmationDialog`), **not** a modal. The bar owns the picker **inline**; there is **no** "bulk chooser" modal.
- **inline-editable tabular *rows*** → edited in the `Table` (ledger · snapshot **history** · recurring occurrences). The modal owns **create** + the **non-column rich fields** (shared/GST flags · tags · status/reconciliation · FX breakdown · duplicate-link). *(Asymmetry by design: snapshot **add** is a modal — date + value together; snapshot **history** corrections are inline.)*

**Layout / responsive:** centered **two-column** default · **Drawer variant** for a genuinely tall form (Insurance · Formula editor) — a *form-length* choice, **not** a breakpoint · **bottom-sheet `< md`** (§17).

**Button law:** exactly **Cancel (left) + one primary (right)** · primary = `error` **only** when its action is destructive · **no third button**.

**Fields:** any Field / picker primitive; **subtype-adaptive** — changing the Type `Dropdown` swaps the field set (account subtype; category type with semantic-coloured labels).

**Validation messages (one convention — copy is a *template*, never freestyled).** Inline, under the field, `error` channel (§6); Save disabled while any **error** remains. **Two severities** (the Formula editor §11's model, generalised): **error blocks Save**, **warning doesn't**.

| trigger | template |
|---|---|
| required empty | **"{Field} is required."** |
| bad format | **"Enter a valid {type}."** (email · date · number · amount) |
| duplicate / taken | **"{value} already exists."** |
| out of range | **"{Field} must be between {min} and {max}."** |
| too long | **"{Field} must be {n} characters or fewer."** |
| unknown reference *(warning)* | **"Unknown {thing} — did you mean {suggestion}?"** |

**Law:** field errors use a template (or a field-specific message stated in that surface's spec) — **no ad-hoc message strings, no `console`-style copy.**

### Dissolved — auth / onboarding modals (no "Auth modals" archetype; noting where the instances live)

There is **no auth-modal family** — each is an instance of one of the two archetypes:

| modal | archetype | where it lives |
|---|---|---|
| **PendingInvitationDialog** | `ConfirmationDialog` | login / post-auth gate (`App.tsx`) — logged-in + no household + pending invite; Decline / Accept |
| **HouseholdConflictDialog** | `ConfirmationDialog` *(2 content variants: member/admin · owner)* | same gate — invitee already belongs to / owns a household; **no Accept**, Decline / Go-to-Settings |
| **NewHouseholdModal** | `EntityModal` *(name + timezone)* | first-login **owner** setup (`isFirstLogin`, shows once); Skip / Save |
| **InviteModal** | `EntityModal` *(email)* | **Settings → Management** — a household-admin action, **not** auth; Cancel / Send |

*(This table is a **reuse mapping**, not history — it exists so no one builds an "AuthModal" family; each instance is one of the two archetypes. Build-conformance of the current hand-rolled modals → FRONTEND-AUDIT F10.)*

### Toolbar · FilterBar · BulkActionBar — three distinct bars

Three bars, **never merged** — they differ by **trigger × target**, and each is **reused without the others**:

| bar | trigger | target | proof it stands alone |
|---|---|---|---|
| **EntityPageToolbar** | always | the collection / view (name · info · sort · view-toggle · +New) | every module page |
| **FilterBar** | always (when filters exist) | the **query** → serialises to `VisualizationFilter` | the **Viewer** mounts it with **no toolbar** |
| **BulkActionBar** | only on **≥1 selected** (slides up, §13 bulk-bar-slide) | the **selection** | **CategoryTree** (not an EntityPage) uses it |

- **Filters live only in FilterBar.** The toolbar merely hosts FilterBar's **`< md` collapse** into its Filters popover — it owns no filter state.
- **BulkActionBar actions** ∈ { **Button** · **inline picker** (`Dropdown`/`SegmentedControl` — a single-target pick: Categories Edit-type / Move / Merge) · **destructive** → `ConfirmationDialog` }. The bar owns its parameterised pickers **inline** — there is **no separate "bulk chooser" modal**. A **multi-field** bulk edit (events "Edit shared fields") is a plain `EntityModal`.

### §18 data-state surfaces — each *applicable* state

A "data surface" (card grid · `Table` · chart/Viewer · detail view · dashboard widget) declares **each state that applies** — never a blanket four. The states are **mutually exclusive surface views** (you're in exactly one); **archived is not among them** (an entity-instance treatment, §3a + the archived-card variant, rendered *within* a populated surface).

| state | trigger | primitive | applies to |
|---|---|---|---|
| **loading** | first fetch unresolved | `Skeleton` (structure-shaped) | every fetched surface |
| **empty** | resolved, **zero** rows | `EmptyState` (Icon + prompt + `+New`) | collections (lists/grids/tables); **not** single detail views |
| **error** | fetch failed | inline `Icon`(error-fill) + **`Retry`** Button — route-level via `ErrorBoundary` | every fetched surface |
| **stale** | externally-refreshed data lagged | `AlertBanner` over live data (§4 hue → §3) | **targeted** — FX rates + FX-derived aggregates **only** |

**Empty / error copy registry (so copy isn't freestyled per surface — `{x}` = the module's noun):**

| surface | empty icon · copy · action | error copy (icon `TriangleAlert` + `Retry`) |
|---|---|---|
| Accounts/Capital/Assets/Insurance | `Wallet` · "No {accounts/capital/assets/policies} yet" · +New | "Couldn't load accounts" |
| Categories | `FolderTree` · "No categories yet" · **Create defaults** + New category | "Couldn't load categories" |
| Transactions | `ArrowLeftRight` · "No transactions yet" · +New | "Couldn't load transactions" |
| Recurring | `Repeat` · "No recurring payments yet" · +New | "Couldn't load recurring" |
| Transfers | `ArrowRightLeft` · "No transfers yet" · +New | "Couldn't load transfers" |
| Budgets | `ChartPie` · "No budgets yet" · +New | "Couldn't load budgets" |
| Currencies | `CircleDollarSign` · "No currencies yet" · +Add | "Couldn't load currencies" |
| Formula | `Calculator` · "No custom formulas yet" · +New | "Couldn't load formulas" |
| Debt | `CreditCard` · "No debt — you're square" *(computed; no +New)* | "Couldn't compute debt" |
| Viewer/chart | `Maximize2` · "No data for this range" · **Reset range** | "Couldn't load chart" |
| Dashboard widget | the widget's own glyph · "No data yet" | "Couldn't load widget" |

- **Pattern (the rule, not just the rows):** empty icon = the surface's **module nav glyph** (§11); copy = **"No {plural noun} yet"**; action = the surface's `+New` (or a domain action where one fits — Categories "Create defaults", Viewer "Reset range"); error = `TriangleAlert` + **"Couldn't load {x}"** + `Retry`. A new collection inherits the pattern — it does **not** author copy.
- **Skeleton vs Spinner:** `Skeleton` = a not-yet-arrived **surface** (placeholder structure); `Spinner` = **inline / action busy** (mutation in flight · pending Button · route transition).
- **`stale` ≠ status.** A record's own lifecycle (recurring `processed/upcoming/missed` · transaction `pending/reconciled`) is **`Badge` status (§4)** + alerts (AlertPanel) — **not** a surface stale-banner. (Recurring is status, not stale; a failed *scheduler job* surfaces via the `RECURRING_MISSED` alert, not a banner.)

### Viewer + drill model — route, reuse-only, one contract

**Viewer = a thin composite mounted as a route** — FR-V-003 + ARCH §4.12 force it (browser-back restores the prior filter; a modal can't). Its `made of` is **entirely existing parts — it adds no system.** The chart-area is **one render-slot** dispatching `{Chart (visx) · Table (AggregationTable) · calendar-heatmap}`, gated valid-only by data shape (FR-V-014). Mobile: the route presents as a **sheet → fullscreen** (§17).

**Drill model — one contract; every drillable surface cites it, never re-describes it:**
- **The contract = `VisualizationFilter`** — the same shape `FilterBar` serialises to; as a route it lives in the **URL**, so **browser-back = drill-undo** (FR-V-003).
- **In-Viewer drill** (slice · point · table row · calendar day) → narrows the filter + pushes `DrillBreadcrumb` (`All ▸ {x} ▸ …`); crumb / centre / empty space pops.
- **Cross-module drill** → `openWithFilter(target, filter)` = **route navigation**; the **breadcrumb resets** to the target's context, only the filter carries. Cited by budget card · debt row · dashboard widget · account-history series — not just the Viewer.

### ImportFlow — CSV import (transactions + account snapshots), reuse-only

A `Drawer` (tall) in **Settings → Data**. **One flow, two targets** — a leading **target `SegmentedControl`** (Transactions / Account snapshots) chooses the column map + conflict key; the steps are identical. **Adds no new primitive.**

**Steps (Back / Next / Confirm footer — title carries the step, "Import · Step 2 of 3"; no Stepper):**
1. **Upload** — drop-zone (`Icon` + copy + file `Input`) · ≤10 MB · `text/csv` UTF-8 · header matched case-insensitively. Validation via the EntityModal validation-message convention.
2. **Preview & map** — the parsed rows in the **ledger `Table`** (RecordLedger column vocabulary, **`virtualized`** for large files), plus: a **map column** (needs-pick → `Dropdown`; green = matched / `warning` = needs a pick, §4) whose **"+ Create…"** opens the nested **`EntityModal`** (`<Category>` for transactions · `<Account>` for snapshots) — **never silent**; an **exclude `Checkbox`** per row. **Duplicate detection** opens the conflict resolver.
3. **Confirm** — result summary (created / skipped / merged counts). Records are written **only here**, each with `actor_id` = the importing person + its own audit row; transactions carry `source = csv_import`.

**Conflict resolver = `Table`-in-`Modal`** (not a bespoke side-by-side): rows = conflicts, columns = `incoming (file)` · `existing (ledger)` · a per-row **`SegmentedControl`** (Keep newer / Keep existing / Keep both); **Apply-to-all** in the header; unresolved default = **Keep existing**; the Table `virtualized`/scrolls when long.

**Per target:** Transactions → FR-IE-005 columns, map = **category**, conflict key = same transaction; Account snapshots → `Account · Date · Value · (Source)`, map = **account**, conflict key = `account + date` (populates the value-history the account-detail reconciliation grid derives from).

**Export / Backup** (same tab, not the flow): **CSV Export** = a `Button` serialising the ledger's active `VisualizationFilter` → `financial-tracker-export-{YYYY-MM-DD}.csv`. **Backup** = last-backup `DateValue` + `Badge` (Backup §4: success/in-progress-spinner/failed) + **Back-up-now** `Button` (admin/owner).

---

# Layer 4 — Pages

> Routes = arrangements of composites. Pages add no new system — they're `AppShell`/`NeutralShell` + composites. The right column names the **module's own detail spec** (the screen spec lives in "Page detail" below).

| page | made of | module detail |
|---|---|---|
| **Login** ✓ | NeutralShell + form (Fields + Button) + logo-mark | Login & Auth |
| **JoinHousehold** ✓ | NeutralShell + form | JoinHousehold |
| **Public / Error** ✓ | NeutralShell + PublicPage (EmptyState) | Public & Error |
| **Accounts / Capital / Assets / Insurance** ✓ | AppShell + EntityPage⟨Account⟩ — **four sidebar routes, one filtered component** (`AccountsList subtypes=[…]`); single-subtype routes (`/capital` `/assets` `/insurance`) **lock the Type Dropdown** (EntityModal) | Accounts (+ 3 subtype routes) |
| **Account detail** ✓ | AppShell + EntityDetailView⟨Account⟩ | Account-detail |
| **Categories** ✓ | AppShell + CategoryTree | Categories |
| **Currencies** ✓ | AppShell + Table (FX) + MiniSparkline | Currencies |
| **Settings** ✓ | AppShell + TabView⟨Profile│Management│Data⟩ | Settings (Profile/Management/Data) |
| **Transactions** ○ | AppShell + Table (record-ledger) + quick-add + `MultiSelectField` (tags) | Transactions ledger |
| **Recurring** ○ | AppShell + Table (expandable rows) | Recurring Payments |
| **Budgets** ○ | AppShell + EntityPage / cards + MiniChart | Budgets |
| **Transfers** ○ | AppShell + Table (ledger collapse) | Transfers |
| **Debt** ○ | AppShell + Table + drill | Debt |
| **Dashboard** ○ | AppShell + DashboardGrid | Dashboard |
| **Visualization Viewer** ○ | full-height route mounting the **Viewer** composite | Viewer |
| **Formula** ○ | AppShell + formula editor | Formula |
| **Alerts** ○ | AppShell + `EntityPageToolbar` (Mark-all-read) + FilterBar (type · unread/all) + date-grouped `AlertPanel` rows — reached from the topbar bell, not a sidebar module | Alerts |

## Page detail

> Each page = `AppShell`/`NeutralShell` + existing composites. Below is each module's **screen spec** (columns · fields · flows · responsive). **No new system/primitive/composite** — anything that would need one is flagged ⚠.
>
> **Page invariants (every authenticated module page obeys — divergence must be *impossible*, not merely chosen):**
> 1. **Frame** = `AppShell` (Sidebar + Topbar + content-region §8 slot rule); pre-auth/standalone = `NeutralShell`. No page hand-rolls a frame.
> 2. **Header** = `EntityPageToolbar` in the **fixed order** (name H3 · info-text · sort · grid/list · show-archived · entity filters · `+New`) — never re-ordered or bespoke. A computed page with no creation (Debt) simply omits `+New`; it does **not** restyle the bar.
> 3. **Filters** = `FilterBar` (record-list profile) when filters exist — never inline in the toolbar.
> 4. **Body** = exactly one render-slot: **EntityCard grid** · **`Table`** (a profile) · **`CategoryTree`** (the one sanctioned grid exception). No fourth body type.
> 5. **Create/edit** = `EntityModal`; **read** = `EntityDetailView`; **decisions** = `ConfirmationDialog`; **bulk** = `BulkActionBar`. One surface each, everywhere.
> 6. Cross-cutting **§18 states** (loading/empty/error + archived-instance), **§15 density**, **§17 responsive** (table→fewer-cols→cards; pickers/modals→sheets `< md`) apply to **all** — never re-specced per page.
>
> A page block below that appears to need anything outside these invariants is a **flag (⚠)**, not a licence to invent.

**Toolbar summary + default sort (per module — so the info-text and initial order aren't invented):**

| module | info-text summary (live) | default sort |
|---|---|---|
| Accounts/Capital/Assets/Insurance | "{n} {nouns} · {net} net" | **favourites first**, then `sort_order` |
| Categories | "{n} categories · {n} archived" | tree order (parent `sort_order`, subs under) |
| Transactions | "{n} txns · {out} out · {in} in (base)" | **date desc** |
| Recurring | "{n} active · next due {date}" | next-occurrence asc |
| Transfers | "{n} transfers · {sum} moved" | **date desc** |
| Budgets | "{n} budgets · {n} over · {n} near" | health desc (over → near → under) |
| Currencies | "{n} currencies · base {code}" | base first, then code A–Z |
| Formula | "{n} formulas ({n} system)" | system first, then name A–Z |
| Debt | "Total owing {sum}" *(header, no toolbar +New)* | amount desc |
| Alerts | "{n} unread" *(Mark-all-read in the +New slot)* | newest first (`created_at` desc), within Today / Earlier groups |

**Law:** a module's summary fields + default sort are **declared here** (or in its block); a list never ships an unspecified default order.

### Login
`NeutralShell` + form. `Logo` (mark + wordmark, no tagline) · **Continue with Google** (primary `Button`) · error banner (`AlertBanner`, calm red) on `?error=oauth_error` · **Dev login** Button + **DEV BYPASS ON** `Badge` (only when backend `GET /auth/config` reports `AUTH_BYPASS_ENABLED`). `?error=not_invited` → the Not-Invited Public page.

### JoinHousehold — `/join/:token`
`NeutralShell`. Logged-out + valid token: `Logo` + invite-context card (inviter `Avatar` · "invited you to join" · household · role `Badge`) + Google `Button`. Logged-in + valid → `PendingInvitationDialog` or `HouseholdConflictDialog`. Invalid/expired/used → a §3 semantic-error Public page.

### Public / Error (the 12-state catalog)
`NeutralShell` + `PublicPage` (centred: opt `Watermark` · semantic `Icon` in a tinted circle · H3 · calm subtitle · primary `Button` ± secondary). Backend signal → page (ARCH §5.8); icon colour = §4 semantic. **States:** Loading (branded `Spinner`) · Not-Invited (warning) · Access-Denied (403) · Not-Found (404) · Refused-Connection (backend down, Retry) · Lost-Connection (401-after-auth) · Generic-Error (500) · Logout · Maintenance (info, passive) · Household-Deleted · Removed-from-Household · Account-Suspended. 429 → a `Toast`, not a page.

### Accounts / Capital / Assets / Insurance (the locked reference)
`AppShell` + `EntityPage⟨Account⟩`. **Four sidebar routes mount the *same* page, filtered by `subtypes`** (`/accounts` = bank+credit_card · `/capital` · `/assets` · `/insurance`); the three single-subtype routes **lock the Type Dropdown** (the `EntityModal`) to that subtype. No bespoke per-subtype page. Toolbar: name + info ("5 accounts · S$ 22,370 net") + Sort + grid/list + **bank/credit type filter** + **+New account**. Grid of `EntityCard` (calm/vivid · hero `MonetaryValue` · `MiniSparkline` · `FavouriteStar` · owner `Avatar`s) ending in a "+New" ghost tile. Card variants: asset · capital (ROI) · insurance (coverage) · bank (interest) · credit-card (debt-leading). Tap → `EntityDetailView`; ⋮→Edit → `EntityModal`.

### Account detail
`AppShell` + `EntityDetailView⟨Account⟩` (read; edit via ⋮→`EntityModal`). Subtype `label→value` rows (empty hidden): insurance coverages · credit-card rewards/billing · bank account-no/reserved/interest · capital cost-basis/ROI · asset purchase/registration. Value-history **inline `Table`** (RecordLedger: date·value·source; double-click→PATCH · inline add-row · per-row delete; Admin/Owner, members read-only). **Visualize** → the subtype-adaptive entity-history Viewer. Surface = §3 entity calm/vivid. Snapshot **add** = `EntityModal<AccountSnapshot>` (date·value·source·notes).

### Categories
`AppShell` + `CategoryTree` (the one sanctioned EntityCard exception). Toolbar: name + info + search + **type filter** (All/Expense/Income) + archived toggle + **+New category**. Zero active → `EmptyState` "Create defaults" (13 starter categories, idempotent) + "New category". Parent row: calm tint · drag handle · expand chevron (or `–`) · glyph `Badge` (entity, icon-only) · name · **sub-count `Badge`** (neutral, "N subs") · right `Badge` type (income=success/expense=error/both=info) · ⋮. Sub row: lighter parent-tint · **no glyph, name only** · indented · no connector. Drag (`@dnd-kit` pointer+keyboard) re-parents/promotes; valid drop target = `accent-primary` **solid** ring (vs selection `accent-secondary`). Promote = dropping a subcategory on the **`Zone`** "Drop here to make top-level" (a neutral dashed Zone, shown only while a subcategory is dragging; its drag-over state is the Zone `active` highlight). Multi-select → `BulkActionBar` (Edit type · Promote · Move to… · Archive · Merge). 2 levels max; archiving a parent archives the branch.

### Currencies
`AppShell` + `EntityPage` as `Table` (ConfigTable). Rows: colour chip · code (mono) · name (colour-text) · **rate "1 {base} = N {target}"** · **Status** `StatusBadge` (fresh/{relative}/amber>48h/never) + last-updated · fee · **display-active** `Toggle` · **FX-history `MiniSparkline`**→Viewer · ⋮. Base: rate fixed, not removable. Daily FX refetch (window-focus) → "Exchange rates updated" `Toast`. **+Add currency** → `EntityModal`: Code (searchable `Dropdown` over `Intl`, read-only on edit) · Symbol · Name · `ColourPicker`+vivid · **FX fee %** (non-base, edit-only) · display-active. Picking a code auto-fills Name/Symbol/colour from `Intl`; new currency rate = "never" until refresh.

### Settings
`AppShell` + `TabView⟨Profile│Management│Data⟩`.
- **Profile** (own): identity (display name · display currency) · appearance (`ThemePicker` · font `Dropdown`) · notifications (Checkboxes/alert-type) · app (density `SegmentedControl` · reduce-motion `Toggle` · **date format** DD-MM/MM-DD/YYYY-MM-DD).
- **Management** (owner-edit; read-only+lock others): household config (name · timezone searchable `Dropdown` · base currency + recompute warning) · **Members** `Table` (avatar · name+email · role · status; ⋮ Promote/Demote · **Archive/Restore** · **Remove** · **Delete**-if-empty — three distinct lifecycles; owner not removable) · **Invitations** (+Invite `EntityModal`; rows email · `StatusBadge` · expiry; Copy-link/Resend/Revoke/Delete) · **FX providers** `Table` (ConfigTable, `@dnd-kit` reorder; type · enabled `Toggle` · `StatusBadge`; +Add `EntityModal`, secret-**reference** name only) · **Bank connections** "Coming soon" dashed `Zone` · **Danger Zone** (`Zone`, §4 hue): Leave (`ConfirmationDialog`) / Delete-household (owner, type-name `ConfirmationDialog` + input).
- **Data**: **`ImportFlow`** (the `Drawer` import — target `SegmentedControl` Transactions/Account-snapshots · Upload → Preview&map `Table` → Confirm · conflict `Table`-in-`Modal`; detail in Layer 3) + **CSV Export** (`Button` → ledger's active `VisualizationFilter`) + **Backup** (`DateValue` + `Badge` §4 + Back-up-now `Button`, admin/owner).

### Transactions
`AppShell` + `Table` (RecordLedger). Toolbar: name + info (count · out/in base) + **+New**. `FilterBar` (record-list): search · date range · category · type · Filters popover (account/person/status/GST/tags/reconciled) → `VisualizationFilter`.
- **Columns:** checkbox · Date · Name(+method/desc sub-line) · Payee(`Avatar`) · Category(`Badge`, colour leads) · Currency(`Badge`) · Amount(`MonetaryValue` columnar+signColour) · Base SGD(`MonetaryValue` columnar) · status(`StatusBadge` dot) · ⋮. All data columns sortable; shared=default (personal icon-flagged); tags = small colour `Badge`s after Category.
- **Quick-add row** (pinned top): leading `＋` · date·name·payer·**payment method** (account `Dropdown`+Cash) · category·currency·amount(→base). Enter commits.
- **Inline cell edit:** double-click → optimistic PATCH (rollback+toast on fail) · Esc cancels; Base-SGD edit = the FX manual override. Per-row permission; desktop/tablet only.
- **Selection** → `BulkActionBar` (Edit shared fields · Duplicate · Archive · Delete · Visualize).
- **Transaction modal** (`EntityModal` + money block): Paid-with (account FX-formula auto-fill / Cash spot) · Amount · Base (auto, read-only-until-override; source border formula=cyan/spot=blue/manual=amber + spot·fee·Δ) · Flags (outflow only: Shared-default-on · GST) · **Tags** (`MultiSelectField` create-on) · duplicate-detection warning on save.
- **Visualize** → Viewer seeded with the filter as an event set (metric × group-by, or tag). **Responsive:** tablet folds payer/method into sub-line; mobile = card/tx, quick-add → sticky `＋` sheet.

### Recurring
`AppShell` + `Table` (RecordLedger, expandable rows). Toolbar: name + info (next due) + **+New recurring**. `FilterBar`: search · source (all/explicit/account-linked) · missed indicator.
- Row: expand chevron · glyph `Badge` (entity, icon-only) · name + **frequency + next occurrence** sub-line · amount(mono) · **source `Badge`** (Explicit / Asset-/Capital-/Insurance-linked) · ⋮.
- **Occurrence history** (expand): timeline + `StatusBadge` (upcoming/processed/skipped/missed/failed); processed → clickable linked transaction (cross-module); missed = red. Per-occurrence: Skip · Trigger now · Process now.
- **Create/edit** `EntityModal` + **`RecurringDateInput`** = a single **`Field` text `Input`** for `frequency_text` → parses the 9 patterns → a **`DateValue` "Next: {date}" preview** below confirms before save; no-match = **blocking** `Field` error (§6), Save disabled, nothing stored. **No structured Dropdown/SegmentedControl builder** — the free-text parser is the whole interface.

### Budgets
`AppShell` + `EntityPage` (cards + `MiniChart`). Toolbar: name + info (over/near) + **+New budget**. `FilterBar`: period (Monthly/Yearly) · scope (Household/person) · period selector.
- **Budget card:** glyph `Badge` (entity, icon-only) + name + period `Badge` + ⋮ · **limit vs actual** (`MonetaryValue`) · **`ProgressBar` by health** (green<thr / amber≥`alert_threshold_pct` / red>100%) · "S$ N left/over" + budget-health `StatusBadge` · drill ("N transactions →"). Actuals computed live; **parent budget = whole-subtree total** (subcategory rollup).
- **3-level drill** (card → tx → subcategory) via `openWithFilter`. **Budget history** → Viewer (limit vs actual). Multi-currency normalizes to base.

### Transfers
`AppShell` + `Table` (RecordLedger, **same columns/density/responsive as Transactions §12**). Toolbar: name + info + **+New transfer**.
- Row: date · name · **source → destination** (account colour `Badge`s) · **Debt repayment** `Badge` (auto) · amount `MonetaryValue` **`dual`** ("S$ 500 → NZD 568") · ⋮.
- **Create/edit** `EntityModal`: source · destination · `MonetaryValueInput` (+ dest currency/amount + `fx_delta`). `is_debt_repayment` auto-detects (dest = CreditCard / internal-debt person) + override `ConfirmationDialog`.

### Debt
`AppShell` + `Table` + drill. **Computed summary — never entered** (no debt entity). Header: **Total owing** `MonetaryValue` hero. **Credit cards** (per card = Σ outflows − Σ repayments) · **Household owes** (per person = Σ their shared outflows − repayments). Drills render contributing tx in the ledger-style `Table` via `openWithFilter` (ARCH §3.10 derivation; no dedicated drill endpoint).

### Dashboard
`AppShell` + `DashboardGrid`. Context from topbar (Household/member + display currency). **Net-worth headline** (`MonetaryValue` hero) + net-worth-over-time trend + delta. **Stat cards:** spending · income · debt. `DashboardGrid` owns edit-mode + `auto-fit` span grid + `@dnd-kit` reorder + persistence (`{widget_type,span,order,scope?}[]`). `DashboardWidget` = `Card` + content by span (S=`MonetaryValue` · M=`MiniSparkline` · L=Viewer renderer) + ⋮ (Resize/Remove/Expand). **Customize** toggle → edit mode (drag handle · S/M/L · remove ✕). **Add-widget gallery** = a `Drawer` (curated types by module; tile icon+name+mini-preview+span badge + scope `Dropdown`; required-scope disables Add until scoped). Spans S=1×1 · M=2×1 · L=2×2. Each widget drills via `openWithFilter`; ⋮→expand opens the Viewer; each fetches its own data (TanStack, keyed by type+scope+filter+context).

### Visualization Viewer
A **full-height route** mounting the `Viewer` composite — fully detailed in Layer 3 (Viewer + `Chart` + drill model). Entry points: card `MiniSparkline` · ledger Visualize · chart drill / View-as-table · dashboard widget expand · budget/account/FX history.

### Formula
`AppShell` + `EntityPage` (`Table`). Rows: name · expression(mono) · applies-to `Badge` · **System** (lock, read-only, info `Tooltip`) vs **Custom** (⋮ edit/delete). **+New/edit** = the Formula editor = `EntityModal` **`Drawer`** (tall): name · applies-to · expression w/ insertable variable chips · variables table (name·default·desc) · **Test row** (sample → live result) · Cancel/Save. **Validation 2 severities:** errors block Save (syntax · unknown variable + "did you mean?" · invalid/duplicate name); warnings don't (unused var · missing default · test-eval fail). Footer "N error · N warning". Computed results hover-revealed on asset/capital cards.

### Alerts — `/alerts`
`AppShell` + the full alert history; reached from the **topbar bell** (not a sidebar module).
- **Toolbar** (`EntityPageToolbar`, no `+New` — alerts aren't user-created): name "Alerts" + info ("{n} unread") + a **Mark-all-read** `Button` in the primary-action slot.
- **FilterBar** (record-list): **type filter** `Dropdown` (All + the 7 `alert_type`s) · **unread / all** `SegmentedControl`.
- **Body** = the **`AlertPanel`'s alert-row list, full-page** (reuse of the same rows, not a new component — like CategoryTree, a sanctioned non-`Table` list), **date-grouped** under muted **Today / Earlier** headers. **Read rows desaturate**; tap → the alert's entity (`openWithFilter`/route).
- **§18 states:** loading → `Skeleton` rows · **empty** → `EmptyState` (`Bell` glyph, "No alerts") · error → inline `Retry`. **Density / responsive** per the page invariants (mobile: the row body stacks; the bar collapses to a Filters popover `< md`).

## Known gaps

1. **Page-module detail** (Layer 4 "Page detail"): every page's screen spec (columns · fields · flows · responsive) is in-doc, composing only existing systems. The import/export module is the **`ImportFlow`** composite (Layer 3); `RecurringDateInput` is settled; the Alerts page + alert registry are specced. **No open flags.**
