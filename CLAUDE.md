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
| **Design Bible (rendered)** | `_bmad-output/planning-artifacts/design-bible/index.html` | **Optional generated reference** (retired as arbiter, 5f-8). A non-authoritative rendering kept for convenience only — the **UX spec + `/design-system` + the token tests are the source of truth**. Do **not** diff your build against it or treat the prototype as authoritative. |
| **Epics & Stories** | `_bmad-output/planning-artifacts/epics.md` | Always — authoritative task list |
| **Sprint Status** | `_bmad-output/implementation-artifacts/sprint-status.yaml` | Always — update when a story completes |

Story files live in `_bmad-output/implementation-artifacts/stories/`. Read the story file before implementing.

> **Git visibility:** all of `_bmad-output/` is gitignored except force-tracked `architecture.md`, `ux-design-specification.md`, and the PRD. Editing `epics.md`, story files, or `sprint-status.yaml` produces **no** `git status` / `diff` output — verify those edits on the filesystem, never via git.

---

## 2. Process Standards (Non-Negotiable)

**P0 — No Unauthorized UI (highest priority).** Before adding ANY user-visible element — button, field, section, panel, menu item, tab, control — verify it appears in the UX spec under the relevant page/component section. **If the spec doesn't mention it: DO NOT BUILD IT.** The story's ACs are NOT sufficient authorization alone. If you believe an element is necessary but it's missing: stop, log it in the story's Dev Agent Record as "Spec Gap — requires UX spec update before implementation", and implement only what the spec describes.

**P1 — Visual Verification is Part of Done.** Before marking any frontend story done, verify the component(s) either on `/design-system` against the token/variant spec, OR in-context against the referenced UX section. Tests green is necessary but NOT sufficient.
- New reusable component → add a `/design-system` demo using the **real exported component** (no synthetic `<div>` approximations). Component doesn't exist yet → don't add its section. Component removed → remove its section in the same change.

**P2 — Document CSS / Architecture Nuances at story-close.** Every frontend story file's Dev Agent Record needs a **"Known CSS / Architecture Nuances"** section: non-obvious CSS behaviour, token/utility constraints, patterns future agents should inherit.

**P3 — Token sweep before changing a component's styling mechanism.** Detail in [reference/frontend.md](.claude/reference/frontend.md) §1.8.

**P4 — No magic values.** No raw hex/opacity/z-index/px/breakpoint in TSX — use named tokens in `index.css`, add the token if missing. Full list in [reference/frontend.md](.claude/reference/frontend.md) §1.7.

**P5 — Spec defines concrete values → tests enforce → `/design-system` demos.** The **UX spec is the sole source of truth** for exact values (tokens/hex/px/ms/z-index/breakpoints) and rules. You can't eyeball whether the app "looks right" — so the **CI drift guards enforce the spec** and `/design-system` is the live inventory of what's built: `design-token-spec-parity.test.ts` (spec §6/§4/§9 anchors ↔ `index.css`) + `ramp-derivation.test.ts` (the DERIVED structural/text/shadow ramp, L1/L1a) + `design-tokens.test.ts` (class/`max-w-*` collisions), and the L18 completeness gallery on `/design-system` (every reusable component demoed with its **real exported component**). The design bible is **retired as arbiter** (5f-8) — an optional generated reference only; do not build against it.

**P6 — Build backend capability ahead of its consumer.** When a story's AC names a backend capability, deliver the **service fn + its endpoint + tests against seeded data** — not just an internal helper — even with no UI consumer yet, so the consumer story is pure wiring. An endpoint is **not** UI, so **P0 does not block it** (P0 only blocks user-visible *page* elements). Defer only the *display*, never the backend. This overrides the default YAGNI "no caller-less endpoint" instinct for this repo.

**P7 — Keep planning artifacts greenfield and in-sync.** (a) The planning artifacts read as a **pure greenfield spec** — no provenance/archaeology, no `(as-built)` / delta tags, no "prior build" citations; *strip* such cruft, don't document it. (b) When a frontend story builds/changes specced UI, update **UX spec + `/design-system` together during dev** (not deferred to a re-review pass) — no SCP needed for in-story P5 parity. (c) `bmad-create-story` output must **lock every spec-deferred value verbatim** — "use sensible values" / "either X or Y" are defects; the dev agent transcribes, it doesn't design.

**P8 — Never invent; surface every decision at story-end (highest priority alongside P0).** The recurring failure mode: when the spec is ambiguous, silent, or self-contradictory, the agent fills the gap, rationalises the fill as "spec-compliant", and bakes it into the spec + tests so it reads as native. That is forbidden. Four hard rules:
1. **Owner-decision flags are BLOCKERS.** Any "owner decision", "flag for owner", "spec gap", or unresolved contradiction between spec sources **halts** implementation until the human rules. The agent may **never** substitute its own recommendation for the human's decision and proceed — including flags it wrote itself at create-story time.
2. **No design-introducing spec edits during dev-story.** In-story spec edits are limited to **verbatim value/token lockstep** (P7b). Any edit that *introduces or changes a rule/behaviour* is forbidden — that is a `correct-course`, not an inline edit. Reaching to edit the spec to make code look authorised is the alarm itself.
3. **Every test traces to a spec line.** A test asserting behaviour with no AC/spec citation is how invention is laundered into "green/verified". No citation → it is a spec gap, not a feature.
4. **Report decisions in the completion message, not a buried file.** Every `bmad-dev-story` / `bmad-quick-dev` run **ends its chat hand-off with an explicit "Decisions & assumptions I made" list** — each item citing its spec line, or marked **"NONE — needs your ruling"**. Anything unspecced that the agent nonetheless built is surfaced here, in chat, so the human reviews a short list instead of re-deriving the diff. Create-story raises its owner-flags the same way. A run that made calls but reports "none" is a defect.

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

**Definition of Done (frontend):** All ACs checked AND visual verification passed. Gate green: `npm run lint && npm run test && npm run build` (`lint` = `eslint` (JS/TS — no `any`, import order, rules-of-hooks) + `tsc --noEmit` (types) + `stylelint` (CSS); the eslint/stylelint layers catch what the JS tests can't). Run a single layer with `lint:js` / `typecheck` / `lint:css`.

**Constraints (apply throughout):**
- No error handling for impossible cases — trust framework / SQLAlchemy guarantees
- No comments explaining WHAT code does — only non-obvious WHY (hidden constraint, workaround, invariant)
- No `any` in TypeScript — look up the type in existing types files
- No new Tailwind utilities without a corresponding `@utility` block in `index.css` (enforced by `stylelint`); never write a literal `*/` inside an `index.css` comment — it closes the comment early and silently breaks the next rule

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
