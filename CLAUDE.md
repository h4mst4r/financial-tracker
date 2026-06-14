# Financial Tracker — Claude Code Agent Instructions

This file governs ALL AI agent work in this repo. It is intentionally short so it always fits in
context. The **detailed patterns live in two task-scoped reference files** — load only the one your
story needs (§4). Follow THESE patterns over any instinct to "follow common patterns".

---

## 1. Reference Documents

| Document | Path | When to Read |
|---|---|---|
| **Architecture** | `_bmad-output/planning-artifacts/architecture.md` | Every backend story; any API/DB/auth story. Holds the entity model + entity-design philosophy (§3.0a, formerly EDP). |
| **UX Design Spec** | `_bmad-output/planning-artifacts/ux-design-specification.md` | Every frontend story |
| **Epics & Stories** | `_bmad-output/planning-artifacts/epics.md` | Always — authoritative task list |
| **Sprint Status** | `_bmad-output/implementation-artifacts/sprint-status.yaml` | Always — update when a story completes |

Story files live in `_bmad-output/implementation-artifacts/stories/`. Read the story file before implementing.

---

## 2. Process Standards (Non-Negotiable)

**P0 — No Unauthorized UI (highest priority).** Before adding ANY user-visible element — button, field, section, panel, menu item, tab, control — verify it appears in the UX spec under the relevant page/component section. **If the spec doesn't mention it: DO NOT BUILD IT.** The story's ACs are NOT sufficient authorization alone. If you believe an element is necessary but it's missing: stop, log it in the story's Dev Agent Record as "Spec Gap — requires UX spec update before implementation", and implement only what the spec describes.

**P1 — Visual Verification is Part of Done.** Before marking any frontend story done, verify the component(s) either on `/design-system` against the token/variant spec, OR in-context against the referenced UX section. Tests green is necessary but NOT sufficient.
- New reusable component → add a `/design-system` demo using the **real exported component** (no synthetic `<div>` approximations). Component doesn't exist yet → don't add its section. Component removed → remove its section in the same change.

**P2 — Document CSS / Architecture Nuances at story-close.** Every frontend story file's Dev Agent Record needs a **"Known CSS / Architecture Nuances"** section: non-obvious CSS behaviour, token/utility constraints, patterns future agents should inherit.

**P3 — Token sweep before changing a component's styling mechanism.** Detail in [reference/frontend.md](.claude/reference/frontend.md) §1.8.

**P4 — No magic values.** No raw hex/opacity/z-index/px/breakpoint in TSX — use named tokens in `index.css`, add the token if missing. Full list in [reference/frontend.md](.claude/reference/frontend.md) §1.7.

---

## 3. Story Execution Protocol

Every story, every time, in order:

1. **Read the story** in `epics.md` — ACs, files, dependencies, referenced spec sections
2. **Read the story file** in `stories/` if it exists
3. **Read the referenced spec sections** — ARCH §X, UX §Y (entity-model/philosophy now in ARCH §3)
4. **Confirm dependencies** — all `Depends on` stories must be `done` in `sprint-status.yaml`
5. **Run existing tests** — must be green before writing any new code
6. **Implement** — only what the AC requires; no unrequested refactors or extra abstractions
7. **Visual verify** (frontend) — open `/design-system` or the feature page; confirm against UX spec
8. **Check off ACs** — update the story file in `stories/` with `[x]` (do NOT edit `epics.md`)
9. **Update sprint-status.yaml** — set story to `done` (sole source of truth for status)

**Definition of Done (frontend):** All ACs checked AND visual verification passed.

**Constraints (apply throughout):**
- No error handling for impossible cases — trust framework / SQLAlchemy guarantees
- No comments explaining WHAT code does — only non-obvious WHY (hidden constraint, workaround, invariant)
- No `any` in TypeScript — look up the type in existing types files
- No new Tailwind utilities without a corresponding `@utility` block in `index.css`

---

## 4. Task-Scoped Reference Files — Load What Your Story Needs

These hold the exact tokens, TSX patterns, and backend gotchas. **They are NOT auto-loaded — read the
relevant one when your story touches that layer.** Each is a condensed "common mistakes" extract; the full
authoritative detail is in ARCH / UX.

| Working on… | Read |
|---|---|
| Any **frontend** story (components, tokens, CSS, state, CRUD pages) | [.claude/reference/frontend.md](.claude/reference/frontend.md) |
| Any **backend** story (API, DB, auth, services, migrations) | [.claude/reference/backend.md](.claude/reference/backend.md) |

`reference/frontend.md` covers: design token tables (bg/text/border/ring/fill), colour-fill identity & immersive themes, P3/P4 detail, and every component pattern agents get wrong (pickers, tabs, swatches, tooltips, SegmentedControl, skeletons, CategoryTree), plus Zustand/TanStack/generic-entity-layer rules.

`reference/backend.md` covers: venv & alembic, model column gotchas, DI chain, RFC 7807 errors, CSRF, household-deletion & OAuth flows, category archiving, dev auth bypass, and the API design rules (list shape, household scoping, FX `rate_to_base`, visualisation read-only).
