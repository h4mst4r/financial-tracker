# Frontend Audit — build vs. spec

> **Build is on hold.** This file collects discrepancies between the current build and the
> foundation systems in the UX spec (`_bmad-output/planning-artifacts/ux-design-specification.md`).
> We are not reworking the build now. Ordered by blast radius within each table.

## Findings (conformance defects found while writing the foundation)

| # | Location | Finding |
|---|---|---|
| F1 | `pages/AccountDetailView.tsx:447` | Hand-rolls a full `<table>` instead of the `Table` primitive |
| F2 | `pages/Currencies.tsx:274` | Hand-rolls a full `<table>` instead of the `Table` primitive |
| F3 | frontend (TSX) | No arbitrary-value guard for `className` (`[14px]`, `w-[..]`, `rounded-[..]`, hex) — P4 unenforced in TSX |
| F4 | frontend (eslint) | `eslint-plugin-jsx-a11y` not installed — a11y unenforced |
| F5 | `index.css:634,636` | Game Boy hand-writes 2 `color-mix` derivations in its `[data-theme]` block. Root cause: `accent-secondary` (`#306230`) == `--color-surface`, violating "accent must stay distinguishable from the resting fill" |
| F6 | `index.css:636` | Raw literal `#9bbc0f` inside the `ring-glow-accent` mix — should reference a ramp token |
| F7 | `index.css:22-25,506-509,546-549,586-589,624-627` | `border-accent`/`-focus`/`-error` are alias anchors re-pasted as literals in every theme — should be `var()` refs |
| F8 | `index.css` ↔ `theme/palettes.ts` | Immersive `tint`/`tint_ramp` lives in TS, not CSS — split source of truth; verify they agree |
| F9 | `index.css:274-276` | Compact toggle dims invented ("no bible exemplar") — value not locked in spec |
| F10 | auth modals (`App.tsx` gate — Pending/Conflict/NewHousehold/Invite) | Hand-rolled on raw `<Modal>`; recompose onto `ConfirmationDialog` (Pending/Conflict) / `EntityModal` (NewHousehold/Invite) per the spec's "Dissolved — auth/onboarding modals" |
| F11 | `BulkActionBar` (Categories/ledger consumers) | Verify single-target picks (Edit-type/Move/Merge) use the **inline picker in the bar** (ratified §8.6 override), **not** the dissolved `EntityModal + single Dropdown` chooser. Conform if it still opens a chooser-modal |
| F12 | §18 data states | `stale` state **unimplemented** and **`AlertBanner` unbuilt** — build them (FX rates + FX-derived aggregates are the only `stale` surfaces) |
| F13 | Button / Input / … (built primitives) | The **extract-the-behavior refactor** — recompose already-built interactive primitives onto headless `Pressable`/`Field`/`Popover`/`Menu` (L0). On hold until the spec merges + the 4 behavior stories land |

## Foundation-merge reconciliation deltas

> Build↔spec gaps surfaced while writing the systematized spec. Action only after the spec is adopted.

| # | Delta | Where | Why / maps to |
|---|---|---|---|
| **D1** | **Wire the immersive remap + contrast floor into `--entity-colour` consumers** | Story 1.6 (reopened, SCP 2026-06-22) | `remapEntityColour`/`enforceFloor` ship unit-tested but **unwired** — foundation §2 (text brightness) + §3 (entity/immersive resolution) are *specified but not live*. **Highest priority** — the entity/immersive/text engine is dark without it. |
| **D2** | Derive text brightness; delete `--color-text-secondary/-muted` | `index.css` + `text-text-secondary/muted` consumers | foundation §2 — 3 authored hexes/theme → one `mix(pole,surface,brightness%)` formula |
| **D3** | Derive `surface/raised`-hover/active from the ramp | `index.css` theme blocks | foundation §1 — hover/active are offsets, not authored tokens |
| **D4** | Delete `bg-secondary` (0 consumers) | `index.css` (5 theme blocks) | dead token — first confirmed "random addition" |
| **D5** | Fix Game Boy `accent-secondary == surface`; drop the 2 bespoke `color-mix`; ref token not `#9bbc0f` | `index.css:622,634,636` | = **F5/F6** |
| **D6** | Replace re-pasted `border-accent/-focus/-error` literals with `var()` refs | `index.css` ×5 blocks | = **F7** |
| **D7** | Delete `--duration-pop` (orphaned by viz-rebuild→`draw`) | `index.css` | foundation §14 open-decision |
| **D8** | Lock compact toggle dims to a spec value (or derive) | `index.css:274-276` | = **F9** |
| **D9** | Tokenize border-width (`1px` / `2px-ring`); migrate raw borders | TSX | foundation §10 |
| **D10** | Backdrop: add blur (modal-family), keep scrim default | `index.css` `--color-backdrop` + modal | foundation §9, §18 |

## Dead-element sweep (foundation tokens with zero consumers)

> Standing discipline: every foundation token must have a consumer or it's cut. Run at every layer.

| token | usage | verdict |
|---|---|---|
| `bg-secondary` | 0 | **dead** — cut (= D4) |
| `z-sticky` | 0 | **unwired** — sticky elements use `position:sticky` but never claim the band; wire it or cut |
| `z-below` · `z-base` | 0 | unused; keep only as semantic floor/ceiling or cut |
| `duration-archive` · `duration-emphatic` | 0 | **not dead** — specced §13 motions (archive/delete) whose consumers aren't built yet |
| `disabled-grey` | n/a | **dead concept** — never a token; disabled is the §3a relative surface-mix (`--disabled`). Verify no `disabled-grey`/grey-disabled literal exists in `index.css`/TSX; cut if found |

## Post-merge housekeeping (design-bible retirement — do AFTER the spec merge)

> The new spec is concrete and testable, so "match the rendered bible by eye" is obsolete; values are tested directly against `index.css`.

| # | Action | Detail |
|---|---|---|
| **H1** | **Retire the design bible as the visual arbiter** | Stop treating `_bmad-output/.../design-bible/` as the source of truth — the ux-spec's named values are. Keep the bible only as an optional *generated* reference, or remove it. **✅ closed by 5f-8** — kept as an optional generated reference (not deleted; directory-removal is owner discretion); no test/doc treats it as authoritative. |
| **H2** | **Repoint / delete `design-bible-parity.test.ts`** | Replace the bible↔`index.css` diff with a direct **spec↔`index.css` token-parity** test (L1/L1a/L17). `/design-system` stays as the L18 completeness **gallery** (every primitive by its real component), **not** a pixel-diff. **✅ closed by 5f-8** — replaced by `design-token-spec-parity.test.ts` (spec §6/§4/§9 anchors pinned as cited constants ↔ `index.css`; `bible.css` read dropped; DERIVED tokens stay with `ramp-derivation.test.ts`). |
| **H3** | **Update CLAUDE.md P5 (+ P1)** | P5 "spec defines → bible renders → app matches bible" → "spec defines concrete values → tests enforce → `/design-system` demos." Drop the "diff against the rendered prototype" clause in P1/DoD; keep the `/design-system` completeness gallery. **✅ closed by 5f-8** — rewrote P5, the §1 Reference Documents "Design Bible" row (→ optional generated reference), and P7(b)/(d); P1/DoD already verify on `/design-system`-or-in-context. |

## Pass 3 — build ↔ new-systems reconciliation (built, but can no longer sit on the systems)

> Swept against the merged systems. Do after the merge + the relevant primitive stories. **B6 is good news** (nothing to migrate).

| # | Location | Finding · action |
|---|---|---|
| **B1** | `MonetaryValue`/`DateValue`/`NumberValue` **display atoms don't exist** (only `MonetaryValueInput`) | The §7 value atoms are unbuilt, so call sites **hand-format money**: `toLocaleString` at `AccountDetailView.tsx:89,237` · `AccountsList.tsx:224,254,265` · `DesignSystem.tsx:1037`; `toFixed` fee at `Currencies.tsx:328`. The `symbolFor` helper is **duplicated** in `AccountsList.tsx` + `AccountDetailView.tsx`. **Action:** build the three atoms to the §7 **locked format**, fold `symbolFor` + `lib/currency.ts` into them, migrate every site. (L11) |
| **B2** | `EntityCard.tsx` (3) · `AccountDetailView.tsx` (3) · `Categories.tsx` (1) | Raw hex/px/arbitrary-TW in TSX → named tokens (refines **F3** with concrete files). (L7/P4) *(`ColourPicker.tsx` (3) + `Avatar.tsx` (1) hits are likely **legitimate** entity-colour handling — verify, don't blind-replace. `DesignSystem.tsx` (28) is demo content.)* |
| **B3** | `components/primitives/Badge.tsx` | Hand-rolled `box-shadow` — verify it's a §9 **token step**, not a raw shadow. (L9) |
| **B4** | Icon usage (all components) | Glyphs **do** render through `<Icon>` (L14 satisfied), but each call site **imports its lucide glyph ad-hoc** — route choices through the new §11 **icon registry** so a library swap is one edit. Also reconcile the **`Shield`/`ShieldCheck` + `House`/`Building2`** sidebar-vs-account-type split. |
| **B5** | `EmptyState` consumers (`EntityPage`, `ManagementTab`, `Settings`) | `EmptyState` is built + used, but **copy/icon are passed per-caller** — route through the §18 empty/error registry so copy isn't freestyled. (Low) |
| **B6** | naming sweep | **Clean** — no bespoke `MultiSelect`/`TagInput`/`StatusBadge`/`FilledChip`/`Chip`/`Pill` component exists. The renames (→ `MultiSelectField` / `Badge`) are **forward-only**; nothing built to migrate. |
| **B7** | `Currencies.tsx:313–322` | **StatusBadge-registry bypass** — the page maps freshness → tone **inline** (`<Badge variant="success">fresh` · `variant="warning">never` · `stale ? 'warning' : 'success'`) instead of consuming a **registry key** (§4: domain `Currency freshness` → tone). Drive `Badge` from the registry; the same applies to FX-provider / invitation / backup status as those build. (§4 law: "consume a key, never restyle a status".) |
| **B8** | **behaviors — none exist** (no `Pressable`/`Field`/`Popover`/`Menu` files) | **L0, highest blast radius.** Every overlay **hand-rolls** portal + dismiss + keyboard + focus-trap: `Modal` (12 portal/listener/keydown sites), `ContextMenu` (10), `Dropdown` (5), `ThemePicker` (5), `Tooltip` (4), `EmojiIconPicker` (4), `ColourPicker` (4), `DatePicker` (3); every field hand-rolls value/error/label (`Input`·`Checkbox`·`Toggle`·`SegmentedControl`). This is the concrete inventory behind **F13** — extract the 4 headless behaviors and recompose these onto them. |
| **B9** | inline `style={{}}` — 14 files (`Avatar`·`ProgressBar`·`Toggle`·`Spinner`·`ContextMenu`·`ColourPicker`·`Table`·`ThemePicker`·`EmojiIconPicker`·`BrandMark`·`ToastContainer`·`DisplayCurrencyPicker`·`Currencies`·`DesignSystem`) | Audit each: dynamic values via **CSS var / token** are fine; **raw literals are not.** Confirmed offender: `Avatar.tsx:55` sizes via inline `width/height/fontSize: size*0.38` — a **magic ratio** bypassing the §8 **size scale**; fold into size tokens. |
| **B10** | `active:scale-[0.97]` (`Button`, `Toggle`, `Checkbox`, `AccountDetailView`) | The §13 **press-scale** is the only arbitrary-Tailwind value in the codebase (4 hits) — promote to a **named token utility** (`@utility press-scale`) so it isn't a literal. |

| **B11** | clickable `<div>`/`<span>` (`onClick`, 36 files) | Mostly **hand-rolled `Pressable`** (`role="button"`+`tabIndex`+`onClick` on `ContextMenu`/`Card`/`Modal`/Sidebar backdrop) → subsumed by **B8** (compose `Pressable`). **One a11y check:** `EntityCard.tsx:103` is a clickable `<div>` — verify Enter/Space activation + `role`/`tabIndex`; add if missing. |
| **B12b** | `Table` primitive | **No `virtualized`/`infinite` mode** (the pilot served small snapshot lists). The Transactions ledger (tens of thousands of rows) + the import Preview need it: `@tanstack/react-virtual` windowing + `useInfiniteQuery` server keyset-paging — **infinite scroll, no numbered pager** (systems §"Data — Table"). Build before the ledger story. **✅ closed by 5f-8** — `virtualized` (react-virtual windowing, bounded DOM) + `infinite` (keyset paging seam — Table signals near-bottom, consumer owns `useInfiniteQuery`) added + demoed on `/design-system`; the live ledger/import wiring → **5-2 / 10-4**. |
| **B12** | `index.css` colour foundation | **The big foundation delta.** ~**141 raw hex** + 46 `color-mix`/`[data-theme]` sites = ~28 authored tones/theme where §0/§0a allow ~**7 extremes** + `profile`. "Author extremes, derive stops" (§1 ladder · §2 emphasis · §1 state offsets) is **not implemented**; `lerp`/`contrastText`/`enforceFloor` ship **unwired** (= **D1/D2/D3**). The **L1/L1a theme-parity** tests will flag every derived-tone-in-a-theme-block — expect a large, mechanical migration. |

| **B13** | **`opacity-*` as text-emphasis** — pervasive (§2 violation) | Emphasis is hand-rolled out of opacity instead of the §2 contrast-derived tokens. Worst: `AccountDetailView.tsx:429–431` literally `const secondary = 'opacity-70'; const muted = 'opacity-55'; iconTint = 'opacity-80'` — an emphasis scale built from opacity. Also `EntityCard.tsx` (opacity-70/80), `CategoryTree.tsx` (opacity-60), `Currencies.tsx` (opacity-60). **Why it's wrong, not cosmetic:** opacity bleeds the background through and **breaks the §0.11 contrast floor** — the exact guarantee §2 derives. Replace every emphasis-opacity with `text-muted`/`text-default`/`text-strong`. (L3) |
| **B14** | **`opacity-*` as disabled** — `disabled:opacity-40` (`AccountModal`), `disabled:opacity-50` (`AccountDetailView`, `Button`) | Disabled is hand-mixed via opacity (and **inconsistent** — 40 vs 50) instead of the **one §3a `disabled` utility** (relative surface-mix + `faint` text + `not-allowed`). Route all through it. (L5) *(Archived `opacity-60 grayscale` is the sanctioned archived treatment — keep, but tokenize.)* |

> **Swept clean (no action — recorded so effort isn't wasted here):** semantic colours are **tokenized** — `text-error`/`bg-success-fill`/`text-warning`, **zero raw Tailwind palette** (`-red-500` etc.); `aria-*`/`role` present across 33 files (126 hits — manual, just unenforced per F4); arbitrary-Tailwind values are only the 4 B10 hits; `scrollbar-gutter`/themed scrollbar **is** wired; motion **durations are tokenized**; pickers **reuse** `Dropdown`; `EmptyState` built. The build's real debt is concentrated: **B8 (behaviors)** · **B1 (value atoms)** · **B12 (derive the ramp)** · **B13 (opacity-as-emphasis)** — focused refactors, not scattered magic.

## Deep read — `index.css` line-by-line + named modals / pages / Epic-1 primitives

> Confirms the systemic findings with line refs and adds three foundation items. **The headline: the *application* layer is clean** — modals, public pages, EntityModal, the invitation dialogs all **compose primitives + tokens** correctly. The debt is the **foundation derivation** + the **behavior/atom** layers, not scattered through the screens.

**`index.css` (the foundation):**
- **B12 confirmed concretely** — every `[data-theme]` block (`base-light` 490, `retro` 530, `brown` 570, `gameboy` 607) **re-authors all ~13 structural tones + 8 chart hexes as raw hex**, where §0/§0a allow only the ~7 extremes + `profile`. `--color-text-secondary`/`-muted` are **hand-picked per theme** (16–17, 502–503, 542–543, 582–583, 619–620) — so the §2 contrast floor is eyeballed, not derived (= **D2**); `--color-surface-hover`/`-active` authored, not `±ΔL` offsets (= **D3**).
- **GOOD (the *correct* pattern, keep):** the interaction-fill + `*-muted` + `*-fill` tokens (26–61) **are** derived via `color-mix(anchor, --alpha-*)` written **once**, with theme blocks setting only the alpha **inputs** (511–515) — exactly the "author inputs, derive the rest" model. This proves the pattern is achievable; B12 is finishing the job for the structural ramp + text.
- **B15 (new) — shadows authored per step.** Each theme hand-writes **4 full `rgba` shadow rules** (112–115, 523–526, 563–566, 648–651) instead of `lerp(opacity-lo, opacity-hi, step)` (§9 — author the **2 extremes**, derive the 4 steps).
- **Dead/drift tokens (new):** `--radius-2xl: 24px` (108) is **not in the §8 scale** (sm/md/lg/xl/full) → cut or justify; `--color-favourite` (64) should be the spec's **`accent-important`** anchor (§6) → rename/reconcile; `--duration-pop` (144) confirmed orphaned (= **D7**); `--color-bg-secondary` (6) dead (= **D4**). F5/F6/F7/F9 confirmed at 634/636, 22–25, 272–276.

**Named components (spot-confirmations, no new classes):**
- `Modal.tsx` — the **B8 exemplar**: hand-rolls portal (`createPortal`) + focus-trap (manual Tab cycling) + scroll-lock + Escape + backdrop mousedown/click + entrance state (~160 lines) → all belongs to the `Popover`/`Modal` behavior. Plus a magic `setTimeout(…, 50)` (78) and a raw `<button>` close (not a Pressable/icon-`Button`).
- `Button.tsx` — confirms **B10** (`active:scale-[0.97]`), **B14** (`disabled:opacity-50`); variant naming **drifts** from the spec (`primary/secondary` vs spec `filled/outline`; `text/link/icon` variants not built).
- `EntityModal`, `PendingInvitationDialog`, `HouseholdConflictDialog`, `PublicPage` — **clean** (compose `Modal`/`Button`/`Badge`/`Icon` + tokens). The two invitation dialogs are on **raw `<Modal>`** → recompose onto `ConfirmationDialog` (= **F10**). Minor: raw `h-10`/`h-14` icon-circle sizes (→ §8 size tokens).

**Coverage note:** I read `index.css` end-to-end + a representative file per named target (modals, public, EntityModal, two Epic-1 primitives). The findings **converge** — the remaining Epic 1–5 files repeat these same patterns (B8 hand-rolled overlays, B13 opacity-emphasis, token-clean screens), so reading every one would confirm, not extend, the list. Flag any specific file you want drilled.
