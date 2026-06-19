---
title: Financial Tracker — Architecture
version: 4.0
created: 2026-06-11
authority: >
  The implementation contract for the backend, security model, data model, and
  infrastructure. Together with the UX specification this is self-sufficient: per-feature API
  contracts are DERIVABLE from the entity schemas (§3), the Pydantic conventions (§4.5), and the
  generic CRUD template (§4.10), with every bespoke endpoint specified inline. epics.md is a
  derived work plan generated from this document and the UX spec — not a third source of authority.
---

# Financial Tracker — Architecture

> **Stand-alone, greenfield-buildable spec.** This document assumes no existing code and
> describes the system to be built from zero. The spec *is* the prose, schemas, algorithms,
> and contracts here, which stand alone. Build top-to-bottom in this order:
>
> 1. **Foundational Stack Decisions** — the tech choices everything else assumes
> 2. **Authentication & Security** — auth, sessions, CSRF, approved-owners, scoping
> 3. **Data Model & Schema** — every table, the migration plan
> 4. **Backend Application Architecture** — layering, DI, error contract, audit
> 5. **Infrastructure & Operations** — Cloud Run, secrets, jobs, FX fetch, backups
> 6. **Frontend Architecture Skeleton** — app shell, state, API client
> 7. **Build status** — what each part requires
>
---

## 0. Document Conventions & Authority

**This document is a contract, not prose.** It is a greenfield specification: it assumes no
existing code and describes the system to be built from zero. The specification is the prose,
schemas (DDL), algorithms (numbered steps), and contracts (request/response shapes) in this
document — all of which stand alone.

**Scope of this document:** the foundational, stable layers — stack, auth, security, data model,
backend layering, infrastructure, frontend skeleton.

**Per-feature API request/response contracts are *derivable*, not deferred.** Standard entity
endpoints follow mechanically from the per-entity schemas (§3), the Pydantic `Create`/`Update`/
`Response` conventions (§4.5), and the generic CRUD template (§4.10); the bespoke endpoints —
global search (§4.11), visualizations (§4.12), debt (§3.10), alerts (§3.9), FX (§5.7) — are
specified inline here. Together with the UX specification, **these two documents are
self-sufficient**: anything an agent needs to build a feature is present here or in the UX spec, or
derivable from them. `epics.md` and its per-story contracts are **generated from this document and
the UX spec** — a derived build plan, **not** a third source of authority.

---

## 1. Foundational Stack Decisions

> **Greenfield rule:** this section assumes the reader has made **no** technology choices.
> Each decision is derived from the project's own constraints, with alternatives recorded
> and rejected on the record. The decisions land on the current proven stack — not by
> assumption, but because the constraints point there. Where a derivation could reasonably
> have gone elsewhere, that is stated.

### 1.0 The constraints that drive every choice

From the brief and PRD, non-negotiable:
- **C1 — $0/month idle cost.** Free tiers only; must scale to zero.
- **C2 — 2–4 concurrent users**, single household (multi-tenant is a post-MVP path).
- **C3 — Google OAuth only**; no password storage.
- **C4 — Self-hosted, single deployable**; daily backup; cold-start tolerant.
- **C5 — Multi-currency money math** — exact decimals, never floats.
- **C6 — Maintainable by a generalist + AI** — mainstream, well-documented tech with
  large training-data presence beats clever/niche choices.
- **C7 — Rich, interactive visual UI** with a design-token system.

### 1.1 Runtime & hosting → **Google Cloud Run (container, scale-to-zero)**

- **Decision:** single container image, Cloud Run, min-instances = 0.
- **Why:** C1 (bills nothing idle) + C4 (one deployable) + native Google OAuth/Secret
  Manager/GCS integration.
- **Alternatives rejected:** always-on VM (violates C1); Lambda/API-Gateway (more pieces,
  awkward for a stateful-ish SQLite file + scheduler); Fly.io/Render (fine, but no GCS/OAuth
  ecosystem advantage and weaker free tier for this shape).
- **Consequence:** scale-to-zero means **in-process scheduling is unreliable** — addressed
  in §1.7 and the Infrastructure part (the scheduler is the one real architectural tax of
  this choice).

### 1.2 Backend language/framework → **Python 3.12 + FastAPI (async, ASGI)**

- **Decision:** FastAPI on uvicorn (ASGI).
- **Why:** C6 (Python + FastAPI are among the most-documented modern stacks; huge agent
  training presence) + first-class async (needed for the FX-API and OAuth HTTP calls
  without blocking) + Pydantic-native validation (C5/contracts) + auto OpenAPI.
- **Alternatives rejected:** Node/Express or Nest (viable, but Python's `Decimal` ergonomics
  and data-tooling fit the money-math/finance domain better, C5); Django (batteries we don't
  need; heavier; sync-first); Go/Rust (smaller agent training corpus for the app layer,
  slower to iterate — fails C6's spirit).

### 1.3 Database → **SQLite (WAL mode), file on the container**

- **Decision:** SQLite via `aiosqlite`, `PRAGMA journal_mode=WAL`, `PRAGMA foreign_keys=ON`.
- **Why:** C1 (zero DB cost) + C2 (2–4 users is *far* inside SQLite's envelope) +
  C4 (a single file is trivially backed up to GCS). WAL gives concurrent readers + one
  writer — ample at this scale.
- **Alternatives rejected:** Postgres/Cloud SQL (recurring cost, violates C1; warranted only
  on the multi-tenant SaaS path); Firestore (document model fights the relational entity
  hierarchy and exact-decimal money).
- **Known consequence:** writes serialize; the auth sliding-window write (§2.13) and any
  hot-write path must stay modest. **Migration trigger to Postgres:** the day multi-tenant
  SaaS (post-MVP) begins. The ORM choice (§1.4) keeps that migration mechanical.

### 1.4 ORM & migrations → **SQLAlchemy 2.0 (async) + Alembic**

- **Decision:** SQLAlchemy 2.0 typed `Mapped[...]` models, async session; Alembic migrations.
- **Why:** C5 (`Numeric`/`Decimal` columns, no float money) + portability (the SQLite→Postgres
  path in §1.3 is largely a driver swap) + the entity hierarchy (`BaseEntity`, mixins) maps
  cleanly to declarative inheritance. **No raw SQL** — every query household-scoped through
  the ORM.
- **Alternatives rejected:** raw SQL/`databases` (loses tenant-scoping safety + portability);
  Tortoise/Peewee/SQLModel (smaller ecosystems / thinner async or typing stories).

### 1.5 Money type → **`Decimal`, stored `NUMERIC(15,4)`**

- **Decision:** all monetary values are `Decimal`, persisted `NUMERIC(15,4)`; FX rates
  `NUMERIC(10,6)`. Never `float` anywhere in the money path.
- **Why:** C5 — float rounding is unacceptable in finance. Detailed in the data-model part
  (`MonetaryValueMixin`).

### 1.6 AuthN → **Google OAuth (Authorization Code, confidential client) + server-side sessions**

- **Decision:** as specified in §2. Opaque server-side session tokens in HttpOnly cookies;
  `google-auth` for ID-token validation; `httpx` for token exchange.
- **Why:** C3 + the security posture argued in §1 (revocable sessions, nothing sensitive in
  the browser).
- **Alternatives rejected:** JWT access tokens (revocation is hard; XSS exfiltration risk);
  Firebase Auth (vendor lock-in, another dependency for a 4-user app); `authlib` (the raw
  `httpx` + `google-auth` path is simpler — do not add `authlib`).

### 1.7 Background jobs → **Cloud Scheduler → authenticated HTTP job endpoints**

- **Decision:** managed **Cloud Scheduler** (cron) calls authenticated `/jobs/*` HTTP endpoints
  on the service (currency refresh, recurring processing, alerts, budget rollover, monthly
  snapshots, backup). Each call wakes the instance, runs the job, then it scales back down.
- **Why:** `min-instances=0` (C1) means an **in-process** scheduler does **not** fire while the
  container is scaled to zero — so the trigger must come from outside the instance. Cloud
  Scheduler is managed, free at this volume, and fires regardless of instance state.
- **What makes it safe:** every job endpoint is **idempotent and catch-up-aware** (processes
  everything due since `last_processed_at`, not just "today"), so a missed window self-heals on
  the next run. Full job table + auth in §5.6. (An in-process scheduler may be registered for
  local/warm-dev convenience, but Cloud Scheduler is the source of truth.)

### 1.8 Frontend → **React 19 + Vite + TypeScript (strict)**

- **Decision:** React 19, Vite build, TypeScript with no `any`.
- **Why:** C6 (largest component ecosystem + agent training corpus) + C7 (rich interactive
  UI) + Vite's fast dev/HMR. Strict TS makes contracts (the `/auth/me` shape, entity types)
  machine-checkable.
- **Alternatives rejected:** Next.js (SSR/server runtime we don't need — this is a private
  authenticated SPA behind OAuth, not SEO content; adds a Node server to host); Svelte/Solid
  (smaller ecosystems/training corpus — fails C6's spirit despite being fine tech).

### 1.9 Styling → **Tailwind CSS v4, token-first (`@theme` + `@utility`)**

- **Decision:** Tailwind v4 with all design decisions as `@theme` CSS variables / `@utility`
  classes; **no raw hex/px/opacity/z-index in components** (the P4 rule).
- **Why:** C7 + the design-ambiguity failure mode — a single token source of truth is what
  makes the UX spec enforceable and a coding agent's output checkable.
- **Alternatives rejected:** CSS-in-JS (runtime cost, weaker token discipline); component
  libraries like MUI/Chakra (impose their own design language, fighting the custom token
  system and the entity-design philosophy in §3.0a).
- **⚠️ Two Tailwind-v4 authoring rules that fail SILENTLY (no build error) — binding, carry to any reuse of this stack:**
  1. **Token-name vs class-name collision.** Tailwind v4 derives a utility colour name from
     everything after `--color-`. A token whose name starts with a utility prefix (`ring-`,
     `text-`, `bg-`, `border-`, `accent-`) therefore does NOT produce the obvious class — the
     prefix is parsed twice. `--color-ring-glow-primary` is **not** reachable as `ring-glow-primary`
     (that resolves to the non-existent `--color-glow-primary`); the broken class is dropped and the
     element falls back to a near-white default. **Rule:** expose such tokens via an explicit
     `@utility` of the intended class name (e.g. `@utility ring-glow-primary { --tw-ring-color: var(--color-ring-glow-primary) }`),
     or use the doubled auto-class (`border-border-accent`). Prefer naming new tokens so their
     colour-name does **not** begin with a utility prefix.
  2. **Hand-written CSS must be layered.** Tailwind utilities live in `@layer utilities`;
     **unlayered** CSS beats every utility regardless of specificity. A global rule meant to be a
     *floor* (e.g. a `:focus-visible` outline) must sit in `@layer base`, or component utilities like
     `focus:outline-none` can never override it. The `:where()` specificity-0 trick does NOT help —
     layer order, not specificity, is what governs unlayered-vs-layered.
  - Both fail with green tests and a plausible-looking render, so **a static guard is part of the
    template** (`frontend/tests/design-tokens.test.ts`): it fails CI on a bare colliding token name or
    a removed `@utility` alias. Keep it when reusing this architecture.

### 1.10 Client state → **Zustand (UI/session state) + TanStack Query (server state)**

- **Decision:** Zustand for `authStore` + visualization filter state; TanStack Query for ALL
  server data (entity CRUD, lists, charts). No entity data in Zustand.
- **Why:** clean split — TanStack owns caching/refetch/optimistic updates; Zustand holds the
  small amount of genuine client state. Matches the generic entity layer (`useEntityManager`).
- **Alternatives rejected:** Redux Toolkit (boilerplate disproportionate to a 4-user app);
  putting server data in Zustand (re-implements caching badly).

### 1.11 Supporting libraries (decided, low-controversy)

`react-router-dom` (routing + guards) · `lucide-react` (icons) · `date-fns` (per-person
date display/input ⇄ ISO storage, FR-V-010 / FR-P-009) · `httpx` (server HTTP) ·
`slowapi` (per-IP rate limiting). Test/quality: `pytest`/`pytest-asyncio`,
`vitest` + Testing Library, `playwright` (E2E), `ruff` (lint/format), `eslint`
(JS/TS correctness — flat config: no-`any`, import order, rules-of-hooks), `stylelint`
(CSS correctness — `stylelint-config-recommended`, Tailwind-v4 at-rules allow-listed), `bandit` +
`pip-audit` (security/CVE).

### 1.12 Stack summary table

| Layer | Choice | Primary driver |
|---|---|---|
| Hosting | Cloud Run, scale-to-zero | C1, C4 |
| Backend | Python 3.12 + FastAPI (ASGI) | C6, async |
| DB | SQLite (WAL) + aiosqlite | C1, C2, C4 |
| ORM / migration | SQLAlchemy 2.0 async + Alembic | C5, portability |
| Money | `Decimal` / `NUMERIC(15,4)` | C5 |
| AuthN | Google OAuth + server sessions | C3, §1 |
| Jobs | Cloud Scheduler → HTTP job endpoints | C1 + reliability |
| Frontend | React 19 + Vite + strict TS | C6, C7 |
| Styling | Tailwind v4, token-first | C7 |
| State | Zustand + TanStack Query | fit-to-purpose |

---

## 2. Authentication & Security

The authentication subsystem is the security backbone of the application. This section is
the authoritative specification for it.

### 2.1 Middleware Stack

Auth and household context are **NOT middleware.** They are resolved by FastAPI
dependencies, per route. The ASGI middleware stack is registered on the app, and Starlette
runs middleware LIFO (last registered = outermost = runs first), so the execution order is:

```
SecurityHeaders  →  DevBypass  →  CSRF  →  SlowAPI (rate-limit)  →  route handler
                                                                       │
                                          get_current_person ──────────┤  (FastAPI dependency)
                                          get_household_id  ───────────┘  (FastAPI dependency)
```

**Why auth is a dependency, not middleware:** resolving auth in middleware and stashing it
on ASGI `scope["state"]` makes state propagation across middleware layers unreliable. Auth
is therefore resolved inside `get_current_person`, which does its own DB lookup and does not
depend on any upstream middleware having populated scope state. There is no household
middleware — household scoping is a dependency (`get_household_id`), never a middleware.

**On the CSRF middleware reading the session (not a contradiction).** The CSRF middleware does
perform the single per-request `validate_session()` *read* — it has to, because it needs the
session's `csrf_token` to compare — and stashes the `(person, session)` tuple on
`request.state.auth` (§2.4). That is a transport-layer *read*, not the authorization *decision*:
"auth is not middleware" refers to the authZ decision and household scoping, which remain
dependencies (`get_current_person` reads `request.state.auth` if present; `get_household_id`
enforces scope). The middleware never decides access — it only enforces the CSRF token on
mutations and primes the per-request session cache.

### 2.2 OAuth Flow

**Authorization Code flow with a confidential client** (`client_secret`). **Not PKCE** —
PKCE is for public clients that cannot hold a secret; this backend is a confidential
server-side client and uses the secret directly, which is the correct choice.
CSRF protection of the OAuth round-trip is an **HMAC-signed `oauth_state` cookie**.

| Step | Endpoint | Behaviour |
|---|---|---|
| 1 | `GET /auth/login` | Generate random state, HMAC-sign with `SESSION_SECRET`, set `oauth_state` cookie (HttpOnly, SameSite=Lax, 10-min TTL, path `/auth/callback`), 302 → Google. |
| 2 | `GET /auth/callback` | Verify signed state == returned state; exchange code (+`client_secret`) for tokens; validate ID token via `google-auth` (audience + signature + expiry, 10s skew); **require `email_verified is True`** before trusting the email; `get_or_create_person`; `seed_household_if_needed`; `create_session`; set `session_id` cookie; 302 → frontend. |
| — | failure | Any failure 302 → `{FRONTEND_URL}/login?error=oauth_error` (or `?error=not_invited` / `?error=removed` / `?error=household_deleted`, chosen from `detachment_reason`, §2.6 step 4). Never a 500 to the user. |

Scopes requested: `openid email profile`. Prompt: `select_account`.
The ID-token audience is validated against `GOOGLE_CLIENT_ID`.

**Post-callback token ordering (constraint).** The callback's 302 lands the SPA, which then
calls `GET /auth/me` (a CSRF-exempt GET) to obtain the auth payload **including `csrfToken`**. The
frontend has no CSRF token until `/auth/me` resolves, so it **must not issue any mutation before
`/auth/me` completes**. `authStore.setAuth()` gates the app on this call, so in practice the first
mutation can only fire afterward — but the ordering is a hard requirement, not an incidental.

### 2.3 Sessions

Server-side sessions live in the `sessions` table. The session id is an opaque UUID
delivered in a cookie.

- **Cookie:** `session_id`, `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` (off only when
  `DEBUG=true`), `max-age = 30 min`.
- **Sliding idle window:** every validated request slides `last_activity_at = now` and
  `expires_at = now + 30 min`. Idle > 30 min → session rejected.
- **The cookie `max-age` must slide too (REQUIRED).** Every validated response **re-sends**
  `Set-Cookie: session_id=…; Max-Age=1800` with the same attributes, so the browser cookie's
  lifetime tracks the DB `expires_at`. Without this the browser would discard the cookie 30 min
  after *login* regardless of continued activity, logging an active user out mid-session. The
  re-set is emitted from the same place that performs the sliding-window write (the validated
  request path), not only at login.
- **Columns:** `id, person_id, created_at, expires_at, last_activity_at, csrf_token
  (unique), ip_address (String(45), IPv6-safe), user_agent`.
- `Session` inherits `Base` directly — **no `household_id`, no audit fields.** To scope a
  session to a household, join `Session → Person → Household` via `person_id`.

**Cookie-over-header resolution:** `get_current_person` and the middlewares read the
session id from the cookie first, then fall back to an `X-Session-Token` header. The
header path exists **only** for the dev-bypass flow (the Vite proxy strips `Set-Cookie`
in local dev). In production the cookie is always used and the header is never sent.

### 2.4 CSRF

**One synchronizer token per session, stored on the session row. No rotation.**
Mutating methods (POST/PUT/PATCH/DELETE) require an `X-CSRF-Token` header matching the
session's stored `csrf_token`, compared with a constant-time check (`hmac.compare_digest`);
safe methods (GET/HEAD/OPTIONS) and skip-listed paths bypass. Expired sessions are rejected
even with a correct token.

**CSRF-exempt paths (the skip-list, explicit):** the CSRF check is bypassed for —
(a) the all-middleware skip prefixes in §2.11 (`/health`, `/static/`, `/assets/`, `/docs/`,
`/redoc/`, `/openapi.json`); (b) the public auth paths `/auth/login`, `/auth/callback`,
`/auth/dev-login` (they are GETs that mint their own session and have no prior token); and
(c) the job endpoints `/jobs/*` (machine-to-machine, authenticated by §5.6 job auth, never
browser-originated). All other mutating routes require the token.

**Single session validation per request — no double-lookup, no write conflict (resolved).**
The CSRF middleware and `get_current_person` must **not** each independently call
`validate_session()`; on SQLite two connections sliding the same session row in one request can
collide (`database is locked`) and waste a round-trip. The contract:
- `validate_session()` runs **once per request**, in the CSRF middleware (the first component
  that needs the session — it must read `csrf_token`). It performs the sliding-window write and
  stashes the result on **`request.state.auth`** as an `(person, session)` tuple — the single
  agreed key.
- `get_current_person` **reads `request.state.auth`** if present and only falls back to calling
  `validate_session()` itself when the key is absent (e.g. a GET that skipped CSRF). It never
  re-slides a session already validated this request.

This supersedes the "looked up twice in separate connections" note in §2.13.

**Design rationale (decided):** a per-session synchronizer token is the OWASP-endorsed
sufficient defense. Per-request rotation is rejected because it breaks concurrent
requests and multi-tab usage (an in-flight mutation carrying a just-rotated token 403s)
for negligible security gain over the HttpOnly + SameSite=Lax cookie that is the primary
defense. A fresh token is minted only at a trust boundary — i.e. when a new session is
created at login. There is no `X-New-CSRF-Token` response header.

### 2.5 Dev Auth Bypass

`DevBypassMiddleware` auto-authenticates **only** when ALL hold: `AUTH_BYPASS_ENABLED=true`,
the request is HTTP from a localhost client (`127.0.0.1`/`::1`/`localhost`), and no session
cookie/header is already present. It then injects a fixed dev session
(`google_sub=dev-bypass-user-001`, `user_agent="dev-bypass"`, 24-hour expiry, exempt from
the 30-min staleness check) and adds `Set-Cookie` + `X-Session-Id` to the response.

**It persists real rows (clarified).** On first activation the middleware **upserts a dev
`Person`** (`google_sub=dev-bypass-user-001`, seeded through the normal
`get_or_create_person` + `seed_household_if_needed` path so it lands in a real household — its
synthetic email is **auto-approved at bypass init** (inserted into `approved_owners`, mirroring
`BOOTSTRAP_OWNER_EMAILS`, §2.7) so `seed_household_if_needed` step 3 creates that household instead
of raising `NotInvitedError`) **and inserts a dev `Session` row** (`user_agent="dev-bypass"`). Both are real DB rows — so
`get_current_person`/`validate_session` find them with their ordinary lookups (no mock object,
no special-case in the dependency). The dev rows persist across restarts; the fail-safe in §2.14.B
step 6 is what neutralizes them once the flag is turned off.

- **Inert by default** — does nothing when the flag is false.
- **Fail-safe on flag-off:** session validation actively **rejects** any session whose
  `user_agent == "dev-bypass"` while `AUTH_BYPASS_ENABLED=false`, so a stale dev cookie in
  a browser cannot authenticate after bypass is disabled.
- **`POST /auth/dev-login`** returns the same `/auth/me`-shaped payload and `404`s when the
  flag is off.
- **`GET /auth/config`** is a public, unauthenticated read returning `{ authBypassEnabled }` (no
  secrets). The SPA Login page (UX §4.1) shows its **Dev login** button + **DEV BYPASS ON** badge
  **only** when this reports `true` (combined with a dev build), so the control reflects the live
  backend flag rather than the build mode — it never appears in prod or when the flag is off. The
  dev-login browser path is the `X-Session-Token` fallback (§2.3) the button populates, not the
  middleware cookie injection (unreliable through the Vite dev proxy).
- `/auth/login`, `/auth/callback`, `/auth/dev-login`, `/auth/config` are excluded from the bypass
  (the first three create their own sessions; `/auth/config` must never conjure one).

> **Production guard:** the app factory logs `CRITICAL` if `AUTH_BYPASS_ENABLED` is true
> while `ENV != "development"`.

### 2.6 Identity & Household Seeding

`get_or_create_person`:
- Match by `google_sub` (stable, unique). Fallback: case-insensitive match on a
  **verified** email — an **intentional account merge** so a user rotating Google accounts
  but keeping their email lands on their existing `Person` rather than a duplicate. The
  email-merge fallback applies only when `email_verified is True`.
- New persons are created with a **pre-generated UUID** (`id=uuid4()` in Python, before
  flush) because `seed_household_if_needed` passes `person.id` into
  `Household(created_by=...)` before the person row is inserted.

`seed_household_if_needed` runs **after** `get_or_create_person` and **before**
`create_session`. Priority:

1. `person.household_id` already set → return.
2. **Active pending invitation** for this email exists → return, leaving `household_id`
   NULL. *This is intentional:* the session is created with a NULL household and the
   frontend renders the PendingInvitationDialog. A NULL-household session is **not a bug**.
3. email ∈ active `approved_owners` (§2.7) → create + seed a household, `role=owner`.
4. else → raise `NotInvitedError`. The `Person` row is **still persisted** (valid Google
   identity, no rights); no session is created. The callback picks the redirect from
   `person.detachment_reason` (§3.4): `household_deleted` → `?error=household_deleted`, `removed` →
   `?error=removed`, otherwise (`left` / NULL — a genuine never-invited user) → `?error=not_invited`.
   §5.8 maps each error code to its §3 page.

`_create_and_seed_household` creates the `Household` (default `SGD` / `Asia/Singapore`),
flushes (to satisfy the `Household.created_by → persons.id` FK ordering), sets
`person.household_id` + `role=owner`, **clears `detachment_reason`/`detached_at` to NULL** (the
person is in a household again), seeds the base `SGD` `Currency`, and seeds default
categories via `category_service.seed_default_categories`. The invitation-accept path likewise
clears `detachment_reason`/`detached_at` when it sets `household_id`.

**Archived-member login block (FR-P-007, Story 2.8).** An **archived** member keeps `household_id`
(membership intact — archive is the in-household lifecycle flag `Person.archived`/`status`, §3.1, **not**
a detachment), so step 1 above would otherwise return and mint a session. `complete_oauth_login`
therefore adds an explicit guard **after `get_or_create_person`**: if `person.archived`, raise
`AccountArchivedError` (no session created) → the callback 302s to `?error=account_archived` → the
**Account Suspended** page (§5.8 / UX §3). This is a distinct redirect from the three `detachment_reason`
codes (the person is not detached). Defense-in-depth: `validate_session` also returns `None` for an
archived person, and `archive_member` deletes the member's sessions at archive time (§2.14.B.1). An admin
**Restore** clears `archived` and re-enables login.

> **`SGD` / `Asia/Singapore` are *defaults*, not a hardcoded final value.** The callback runs
> server-side and cannot prompt, so it seeds these defaults; the owner then sets the **household name
> / timezone** in the first-login **New Household modal** (FR-HH-001, `isFirstLogin`-gated, Story
> 2.4c). **Base currency is configured in Epic 3, not the modal** (Story 3.9 / FR-CU-005): a
> freshly-seeded household has zero transactions, so changing the base currency is a clean
> base-`Currency` row replace + `Household.base_currency` update with **no** `amount_base` recompute
> any time before the first transaction; the FR-CU-005 recompute path only matters once financial
> events exist. **Date format is not set here** — it is a per-person preference (`Person.display_format`,
> FR-P-009 / Story 2.11; default `DD-MM-YYYY`), never a household value.

### 2.7 Approved Owners

**Decision:** household-creation rights are governed by an explicit allowlist table, not
by a "first real person wins" heuristic. An allowlist provides the provisioning surface
needed for eventual commercialization (one approved row ≈ one provisioned/paying account).

**Table `approved_owners`:**

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `email` | String(320), **unique, case-insensitive** | enforce via `func.lower(email)` unique index |
| `label` | String, nullable | human note — "Founder", "Customer #1234" |
| `is_active` | Boolean, default `true` | deactivate without deleting (preserves history) |
| `added_by` | UUID, nullable, FK `persons.id` | NULL = system/env-seeded. **Cross-household by design:** the adder is a `Person` inside some household, while `approved_owners` is global/pre-household — this FK intentionally crosses that boundary. Not a bug. |
| `created_at` / `updated_at` | datetime | |

*Reserved for commercialization (NOT MVP, do not build yet):* `plan_tier`,
`billing_ref`, `expires_at`. Listed so the table's growth path is known.

**`can_create_household` on `Person`** becomes a **denormalized cache** of "this email is
approved," synced at login. `approved_owners` is the source of truth; the boolean exists
so the frontend can read it from `/auth/me` without a join. The two are reconciled in
`seed_household_if_needed` step 3 (set the flag `true` when the email matches an active
approved owner).

**Bootstrap seeding (decided):** environment variable `BOOTSTRAP_OWNER_EMAILS`
(comma-separated). A startup hook (FastAPI lifespan) inserts any listed email not already
present in `approved_owners`. This keeps local dev zero-touch (put your email in `.env`)
and is SaaS-ready (rows added later via an owner-only admin endpoint). **No code path
depends on "the first person."**

**Idempotent and add-only.** The hook **only inserts** missing emails — it never updates or
removes existing `approved_owners` rows. Consequences: (a) re-running it (every cold start, incl.
after a GCS restore) is safe; (b) **removing an email from `BOOTSTRAP_OWNER_EMAILS` does not
revoke** an already-seeded owner — deactivate via `is_active=false` (or delete the row) instead.
The env var is a seed list, not a declarative source of truth.

**Future management surface (reserved, not MVP):** an owner-only `/api/approved-owners`
CRUD endpoint. Until then, the allowlist is managed via `BOOTSTRAP_OWNER_EMAILS` + direct
DB rows.

**Schema:** the `approved_owners` table is created in the initial Alembic revision. The
`can_create_household` column on `persons` is a denormalized cache of approved-email status:
new persons default `can_create_household=False`, and the flag is set only by the
approved-owners match in `seed_household_if_needed`.

### 2.8 Household Scoping & Roles

- `get_household_id` returns `person.household_id`, raising 401 if NULL. Services receive
  `household_id` as their first positional argument — **never trust a request body for
  scoping.**
- **`/auth/me` and `/auth/logout` must NOT depend on `get_household_id`** — they depend only on
  `get_current_person`. A pending-invitation user has a valid session with `household_id = NULL`
  (§2.6 step 2, §2.12); `/auth/me` returns `household: null` so the frontend can render the
  `PendingInvitationDialog`. If `/auth/me` required `get_household_id` it would 401 these users and
  the dialog could never load. Every **household-scoped** route (accounts, events, budgets, …)
  *does* depend on `get_household_id` and correctly 401s a NULL-household session.
- `get_or_404` fetches an entity by PK **and** `household_id`, raising 404 if it belongs
  to another household — cross-household access is impossible at the data layer.
- `require_role(min)` enforces a minimum role against the hierarchy
  `{member:1, admin:2, owner:3}`, 403 below threshold.

**Role capabilities:** `owner(3)` — full control, can delete the household and change roles;
`admin(2)` — invite/remove members, manage categories and all entities; `member(1)` — create/edit
own transactions, read-only on others' private data. A person belongs to **at most one
household**; joining a new one requires leaving the current.

### 2.8a Household Membership Transitions

Because a person belongs to at most one household, the lifecycle has three exit paths plus the
join flow:

- **Path A — Owner deletes household** (owner only): hard-deletes the household and ALL its data
  (the FR-HH-005 teardown, §3.0 principle 4). On next login `can_create_household` is **recomputed
  from `approved_owners`** (§2.7) — the ex-owner re-seeds a household only if still approved; it is
  **not** an automatic "you were owner" grant. Other members get `household_id=NULL` with
  **`detachment_reason='household_deleted'`**, **their sessions are deleted at teardown**
  (§2.14.B.1), and on re-login they land on the **Household Deleted** page (§5.8) unless separately
  invited. **Irreversible.**
- **Path B — Admin/Member leaves** (self): detaches the person (`household_id=NULL`,
  `detachment_reason='left'`) and **archives** all their data (kept in the dataset, excluded from
  active queries). Re-joining via a new invitation restores access. **Reversible.** Backend:
  `POST /api/household/leave`.
- **Path C — Admin/Owner removes a member** (`require_role(admin)`; owner not removable): **same
  data outcome as Path B** but initiated by another member (sets `detachment_reason='removed'`). The
  `Person` row **survives** (never hard-deleted — audit integrity). **Invalidates the removed
  member's sessions** → they land on the "Removed from Household" page (UX §3); re-invitable, data
  restored on re-join. Distinct from
  ⋮ Archive/Restore (the in-household lifecycle archive — membership intact). Backend:
  `POST /api/household/members/:id/remove`.
- **Join (pending invitation):** on login with a pending invitation to a *different* household, the
  `PendingInvitationDialog` (UX §4.3) shows role-aware consequences; on confirm an owner runs
  delete-then-accept, an admin/member runs leave-then-accept; on dismiss the invitation stays
  pending and reappears next login. Invitation states: `pending | accepted | declined | revoked |
  expired` (7-day expiry; `revoked` is the sole "cancelled" state — §3.4).

### 2.9 Security Headers & CSP

`SecurityHeadersMiddleware` (pure ASGI, outermost) sets on every response:

- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`
- **CSP:** `default-src 'self'`; `script-src 'self'`; `style-src 'self' 'unsafe-inline'`
  (required for Tailwind v4's injected CSS); `img-src 'self' data:
  https://lh3.googleusercontent.com` (Google profile pictures); `connect-src 'self'`;
  `frame-ancestors 'none'`; `base-uri 'self'`; `form-action 'self'`.

### 2.10 Rate Limiting

`slowapi` limiter wired via `app.state.limiter` + `SlowAPIMiddleware`. Limits are **per client
IP**. The OAuth-initiating endpoints `/auth/login`, `/auth/callback`, `/auth/dev-login` carry
`@limiter.limit("20/minute")`. `RateLimitExceeded` → `429` with the standard error envelope.

- **`/auth/me` is exempt** from the auth limit — it fires on every page load / route change /
  query refetch, so a 20/min cap would throttle normal use. It already requires a valid session,
  which is its own abuse ceiling.
- **`/jobs/*`** are not IP-rate-limited (they are machine-triggered and protected by job auth,
  §5.6).
- **All other authenticated API routes** carry no numeric limiter in MVP. This is an **explicit
  accepted risk**, not an oversight: the MVP trust model is a handful of known, invited household
  members behind a valid session — there is no anonymous attack surface on these routes, and the
  per-session DB-write serialization (a concurrency constraint, *not* a rate limit) bounds
  steady-state load. The **post-MVP hook** is a per-session / per-IP default limit added when the
  app goes multi-tenant (cross-ref the scaling note, §2.13); until then the session requirement is
  the abuse ceiling.

### 2.11 Public / Skip Paths

- **Skip prefixes** (bypass all middleware): `/health`, `/static/`, `/assets/`, `/docs/`,
  `/redoc/`, `/openapi.json`.
- **Public auth paths** (no session required): `/auth/login`, `/auth/callback`,
  `/auth/dev-login`, `/auth/config` (read-only `{authBypassEnabled}`, §2.5). Note `/auth/me` and
  `/auth/logout` **require** auth.

### 2.12 Invariants — correct by design

These are correct-by-design; do not "fix" them:

1. **NULL-household session is valid** — a pending-invitation user gets a session with no
   household so the frontend can show the dialog (§2.6 step 2).
2. **Person survives household deletion** — members' `household_id` becomes NULL; they are
   not deleted. On re-login they re-enter the seed flow (§2.6).
3. **Dev session rejected when bypass off** (§2.5) — intentional fail-safe.
4. **Pre-generated UUIDs before flush** (§2.6) — required for the `created_by` FK ordering.
5. **`commit()` expires attributes** — session validation refreshes both `person` and
   `session` objects after commit so callers can read columns without a live session.
6. **Cookie takes priority over header** everywhere (§2.3).

### 2.13 Known Scaling Note (not an MVP concern)

The auth path is correct but not optimized; this matters only at multi-tenant SaaS scale,
**not** at household scale, and is intentionally left simple for MVP:
- Every authenticated request performs a DB **write** (sliding-window update of
  `expires_at`/`last_activity_at`). On SQLite, writes serialize.

> The former "session looked up **twice** in separate connections" concern is **resolved**, not
> deferred: §2.4 mandates a single `validate_session()` per request stashed on
> `request.state.auth`. The remaining item below is the only open scaling note.

When scaling: throttle the sliding-window write (e.g. only when `last_activity_at` is older than
~60s) so steady-state reads don't each incur a write.

### 2.14 Stand-Alone Implementation Artifacts

Everything needed to build the auth subsystem from this spec alone.

**A. `sessions` table (logical DDL)**

```sql
CREATE TABLE sessions (
    id                TEXT PRIMARY KEY,                 -- UUID
    person_id         TEXT NOT NULL REFERENCES persons(id),
    created_at        TIMESTAMP NOT NULL,               -- UTC; default now
    expires_at        TIMESTAMP NOT NULL,               -- UTC
    last_activity_at  TIMESTAMP NOT NULL,               -- UTC; default now
    csrf_token        VARCHAR(255) NOT NULL UNIQUE,     -- secrets.token_urlsafe(32)
    ip_address        VARCHAR(45),                      -- nullable; IPv6-safe
    user_agent        TEXT                              -- nullable; "dev-bypass" marks dev sessions
);
```

No `household_id`, no audit columns. OAuth `state` is a signed **cookie**, not a table.

**B. `validate_session(session_id)` algorithm** — the single source of session truth,
called by `get_current_person` (auth) and by `CSRFMiddleware` (token check):

1. If `session_id` is empty → return `None`.
2. Parse as UUID; on failure → `None`.
3. `SELECT` the session row by id; if absent → `None`.
4. `now = utcnow()`; coerce `expires_at` / `last_activity_at` to tz-aware UTC.
5. If `expires_at < now` → `None` (expired).
6. `is_dev = (user_agent == "dev-bypass")`. If `is_dev` **and** `AUTH_BYPASS_ENABLED` is
   false → `None` (fail-safe).
7. If **not** `is_dev` and `(now - last_activity_at) > 30 min` → `None` (stale).
8. Slide the window: `last_activity_at = now`; if not dev, `expires_at = now + 30 min`.
9. `SELECT` the person by `session.person_id`; if absent → `None`.
10. `commit()`, then `refresh(person)` and `refresh(session)` (commit expires attributes —
    refresh so callers can read columns without a live session). Return `(person, session)`.

Dev sessions use a 24-hour expiry and are exempt from step 7.

> **Steps 5 and 7 are intentionally both present.** For a normal session they are near-equivalent
> (every slide sets `expires_at = now + 30 min`, so `expires_at < now` ⇔ idle > 30 min). Keeping
> both is deliberate defense-in-depth: step 5 (`expires_at`) is the absolute cutoff that also
> catches dev sessions and clock/restore anomalies where `last_activity_at` and `expires_at`
> disagree (e.g. a DB restored from an older backup); step 7 is the idle rule for non-dev sessions.
> A rejected session here is also a cleanup candidate (§2.14.F).

**B.1 Edge cases the algorithm deliberately handles (resolved).**

- **Household deleted out from under a live session (Path A teardown / Path C removal, §2.8a).**
  `sessions` has no `household_id`, so a stale session is not auto-detected by `validate_session`.
  Both flows therefore **delete the affected persons' `sessions` rows** at the point of teardown/
  removal (by `person_id` — Path A deletes sessions for every member, Path C for the removed
  member only). Effect: the next request finds no session row (algorithm step 3 → `None`) and the
  user re-enters auth — landing on the seed flow (ex-owner) or, for a detached member, the page
  chosen from `detachment_reason` at re-login (§2.6 step 4): **Household Deleted** (Path A) or
  **Removed from Household** (Path C). This makes the change **immediate**, not lazy. *Defense in depth even if a session row
  survives:* its `person.household_id` is now `NULL`, so every household-scoped route 401s via
  `get_household_id` (§2.8) — the user can never reach household data, only `/auth/me`.
- **`can_create_household` changes mid-session.** The flag on `persons` is a **denormalized cache
  of `approved_owners`, synced only at login** in `seed_household_if_needed` (§2.7) —
  `validate_session` does **not** re-query `approved_owners` per request (it would add a read to a
  write-heavy path for no MVP benefit). So toggling someone's approval does not retroactively
  rewrite live sessions, and that is correct: the flag is **advisory for UI only**. The
  **authoritative** gate is re-evaluated at the moment it matters — the next login / household-seed
  attempt re-reads `approved_owners`. A user who loses approval keeps their current session and
  household (they already have one); they simply can't seed a *new* household later. A user who
  gains approval sees it reflected after their next login.

**C. `GET /auth/me` response contract** (also returned verbatim by `POST /auth/dev-login`):

```jsonc
{
  "person": {
    "personId": "uuid", "displayName": "str", "email": "str",
    "role": "owner|admin|member", "pictureUrl": "str|null",
    "defaultView": "household|personal", "displayCurrency": "ISO-4217",
    "canCreateHousehold": true,
    // Profile & appearance prefs (Story 2.9, FR-P-003) — the SPA bootstraps these into the theming engine
    "theme": "base|base-light|retro|brown|gameboy", "font": "base|system|mono",
    "density": "comfortable|compact", "reduceMotion": false,
    // Per-person date-format preference (Story 2.11, FR-P-009) — display/input only; storage stays ISO 8601
    "displayFormat": "DD-MM-YYYY|MM-DD-YYYY|YYYY-MM-DD",
    "notificationPrefs": { "budgetWarnings": true, "budgetOverruns": true, "missedRecurring": true,
                           "upcomingPayments": false, "fxStale": true, "backups": false }
  },
  "household": null,            // null when person has no household (pending-invite case)
  // else: { "householdId": "uuid", "name": "str", "baseCurrency": "ISO", "timezone": "IANA" }
  "csrfToken": "str",           // the session synchronizer token (§2.4)
  "pendingInvitation": null,    // else: { token, householdId, householdName,
                                //         invitedByDisplayName, invitedEmail, expiresAt, status }
  "isFirstLogin": false         // true iff role==owner AND household.created_at within last 2 min
}
```

Any change to this shape requires updating the frontend `authStore.setAuth()` in lockstep.

**D. Auth-relevant environment variables** (full config matrix is in the Infrastructure part):

| Var | Purpose | Default |
|---|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Confidential OAuth client | — |
| `GOOGLE_REDIRECT_URI` | Callback URL | `http://localhost:5173/auth/callback` |
| `SESSION_SECRET` | HMAC key for the OAuth `state` cookie | dev default (warns in non-DEBUG) |
| `AUTH_BYPASS_ENABLED` | Dev localhost bypass (§2.5) | `false` |
| `ENV` | `development` / non-dev (prod guard) | `development` |
| `DEBUG` | Controls cookie `Secure` flag + SQL echo | `false` |
| `FRONTEND_URL` | Redirect target after callback | `http://localhost:5173` |
| `BOOTSTRAP_OWNER_EMAILS` (§2.7) | Seed list for `approved_owners` | — |

> The session lifetime is a 30-min constant. Do not add a competing
> `ACCESS_TOKEN_EXPIRE_MINUTES` setting — there is one source of truth for session length.

**E. `POST /auth/logout`** (requires auth; CSRF-protected like any mutation):
1. Resolve the current session (via `request.state.auth`, §2.4).
2. **Hard-delete the session row** (`DELETE FROM sessions WHERE id = :session_id`) — logout is
   immediate revocation, not a soft flag. Idempotent: a missing row still returns success.
3. Respond `204 No Content` with `Set-Cookie: session_id=; Max-Age=0; Path=/` (plus the same
   `HttpOnly`/`SameSite`/`Secure` attributes) to clear the browser cookie.
4. Google tokens are **not** revoked upstream (the app holds only a server session, no stored
   refresh token); the local session deletion is the complete logout.

**F. Expired-session cleanup.** Sessions are deleted, never left to accumulate:
- **Lazy:** `validate_session` may `DELETE` a row it rejects as expired/stale (steps 5/7) instead
  of leaving it.
- **Sweep:** the daily `/jobs/alerts` run deletes all sessions with
  `expires_at < now() - 1 day` as its **first step**, before computing alerts. This is its
  unambiguous home — no separate scheduler entry and no "dedicated step" elsewhere (see the §5.6
  job table).

---

## 3. Data Model & Schema

The authoritative schema for every table **and the entity-design philosophy behind it** — the
conceptual model, design tenets, and hierarchy (§3.0a) plus the DDL contract (§3.0 onward) now
live together here. UUID PKs, household scoping, exact-decimal money, and the migration plan
(§3.12).

### 3.0a Entity Design Tenets & Hierarchy

**The core promise:** add a new financial entity type and every part of the system — data model,
API, UI card, modal, page, audit trail, archive pattern, currency handling — works without
rewriting shared infrastructure.

**Design tenets** (a divergence from these is a code-review failure):

1. **Hierarchy over repetition.** Every entity inherits from a base; shared behaviour is defined
   once and inherited. Duplication is a bug.
2. **Generic first, specific second.** Build `EntityCard<T>` before `AccountCard`,
   `BaseFinancialEvent` before `Transaction`. Specifics extend generics, never replace them.
3. **One change, everywhere.** A colour token, base field, or CRUD behaviour changed in one place
   must propagate to every entity that uses it.
4. **Extensibility by design.** A new account type (CryptoWallet) or event type (TaxPayment)
   should need only a new subclass + a config object — not new infrastructure.
5. **Computed over stored where safe.** Debt, budget variance, net worth, forex delta, current
   balance are **derived from source entities, not stored** — eliminating synchronisation bugs.
6. **No orphan logic.** Every formula, status rule, and validation belongs to an entity class.
7. **UI reflects structure.** The frontend component hierarchy mirrors this entity hierarchy.

**The entity hierarchy:**

```
EntityHousehold
│
├── EntityPersons                    (User + HouseholdMember unified)
│   ├── EntityAccounts               (BaseAccount — discriminated by account_type; §3.5)
│   │   ├── BankAccount             (interest_rate set ⇒ behaves as savings; no separate type)
│   │   ├── CreditCard               ↳ also a DebtSource (§3.10)
│   │   ├── Capital / Investment     ↳ also a RecurringEventSource
│   │   ├── Asset                    ↳ also a RecurringEventSource
│   │   └── Insurance                ↳ also a RecurringEventSource
│   └── EntityEvents                 (BaseFinancialEvent; §3.6)
│       ├── Transaction
│       ├── RecurringPayment         ↳ source: RecurringPayments, Capital, Assets, Insurance
│       └── Transfer                 ↳ auto-clears EntityDebt; optionally flagged
│
├── EntityBudgets                    (monthly/yearly aspirational targets; §3.7)
├── EntityCategories                 (household-specific, hierarchical, max 2 levels; §3.7)
├── EntityTags                       (household-specific, flat, free-form M2M on transactions; §3.7a)
├── EntityCurrencies                 (base configurable + daily FX + fees + multi-display; §3.8)
├── EntityFormulas                   (system defaults + user-configurable registry; §3.8)
└── EntityDebt                       (computed view — derived, never stored; §3.10)
```

`↳` = a secondary role (a CreditCard is primarily an account but also behaves as a DebtSource).
`EntityDebt` is household-level (debt exists between persons in a household) and is a **computed
view with no table** (§3.10) — listed here only for conceptual completeness.

### 3.0 Schema Principles (apply to every table)

1. **UUID primary keys**, application-generated (`uuid4()`), never DB auto-increment.
   Client-generatable IDs keep the future offline/PWA sync path (post-MVP) open.
2. **Household scoping:** every domain table carries `household_id` and every query filters
   on it. The only tables without `household_id` are the cross-cutting/technical ones
   (`sessions`, `fx_rate_history`, `audit_logs`, `approved_owners`) — see §3.3.
3. **Money is `Decimal`**, stored `NUMERIC(15,4)`; FX rates `NUMERIC(10,6)`. No floats, ever.
4. **Soft-delete by default:** `archived` flag + `archived_at`/`archived_by`; hard delete only
   for empty entities (no FK references), which produce no audit row. **One sanctioned
   exception — household teardown (FR-HH-005):** deleting a household cascades a **hard delete of
   ALL its rows** (accounts, events, categories, budgets, …) — the account-closure path —
   bypassing the "hard-delete only if empty" rule. Member `Person` rows survive with
   `household_id=NULL` (§2.6); do not soft-delete first. See §2.8a Path A.
5. **Dates** stored/transmitted ISO 8601 (`YYYY-MM-DD`); **display + input format is a per-person
   frontend concern** — each person's `Person.display_format` (default `DD-MM-YYYY`; FR-V-010 /
   FR-P-009), never affecting storage/transport or CSV export. Timestamps are tz-aware UTC.
6. **Audit:** every create/update/archive/restore/delete writes an `audit_logs` row
   (except hard-delete of empty entities).
7. **STI for polymorphic families:** Accounts and FinancialEvents each use **Single Table
   Inheritance** — one table, an `account_type`/`event_type` discriminator, subtype columns
   nullable. Rationale: the subtypes share ~70% of columns and all queries are cross-subtype
   (a household's whole ledger, all accounts net worth); STI keeps those queries single-table
   and avoids join fan-out. The cost (nullable subtype columns) is acceptable at this scale.

### 3.1 `BaseEntity` — the 10 shared columns

Every domain entity inherits these (the **only** exceptions are listed in §3.3).

```sql
-- Mixed into every BaseEntity table:
id            TEXT  PRIMARY KEY,                      -- UUID, app-generated
household_id  TEXT  NOT NULL REFERENCES households(id), INDEX,
created_at    TIMESTAMP NOT NULL,                     -- UTC, default now
updated_at    TIMESTAMP NOT NULL,                     -- UTC, default now, onupdate now
created_by    TEXT  NOT NULL REFERENCES persons(id),
updated_by    TEXT  NULL REFERENCES persons(id),
archived      BOOLEAN NOT NULL DEFAULT 0, INDEX,
archived_at   TIMESTAMP NULL,
archived_by   TEXT  NULL REFERENCES persons(id),
status        TEXT  NOT NULL DEFAULT 'active', INDEX   -- enum: active|inactive|archived
```

`status` enum = `active | inactive | archived` (lifecycle: active → inactive → archived →
hard-delete; archived↔active via restore).

### 3.2 `MonetaryValueMixin` — the money column block

Mixed into `financial_events` **only** — the one entity whose row *is* a single monetary value.
Pure column mixin — does not inherit Base. **Accounts do NOT use this mixin:** an account has no
single "amount" (its value is the `opening_balance` ledger anchor plus the `account_snapshots`
series, §3.5), so forcing the `amount NOT NULL` block onto it would be wrong. The flat
destination-leg columns on a Transfer (`dest_*`, §3.6) and `account_snapshots`' own
`value`/`currency`/`value_base` columns are likewise standalone, not this mixin (§3.2 carve-out).

```sql
currency               VARCHAR(3)    NOT NULL,          -- ISO 4217 of the entered amount
amount                 NUMERIC(15,4) NOT NULL,          -- amount in `currency`
fx_rate                NUMERIC(10,6) NOT NULL,          -- rate used (= "fx_rate_used")
amount_base_calculated NUMERIC(15,4) NOT NULL,          -- system fill: amount × rate (or formula)
amount_base            NUMERIC(15,4) NOT NULL,          -- user-overridable bank-statement figure
fx_delta               NUMERIC(15,4) NULL,              -- auto: amount_base_calculated − amount_base
fee_amount             NUMERIC(15,4) NULL,              -- conversion fee, if any
fx_rate_date           DATE          NULL,   -- the date the rate applies to; immutable
```

**Invariants:**
- `fx_delta` is auto-recomputed whenever `amount_base` is set: `fx_delta =
  amount_base_calculated − amount_base`. Positive = bank charged more than the API rate
  (forex loss). Enforced in the model layer, not by the DB.
- When `currency == base_currency`: `fx_rate = 1`, `fx_delta = 0`, fee fields hidden.
- **`fx_rate_date`** records *which day's* rate produced `fx_rate`/`amount_base_calculated`,
  so the annual FX-cost report (post-MVP) and tax-year export use the historical rate, never
  a recomputed current one (PRD FR-E-009). It pairs with `fx_rate`, which serves as
  `fx_rate_used` — no separate column for that is needed.
- **`fx_rate_date` population & nullability.** Set **once**, at rate-resolution time, to the date
  whose rate produced `fx_rate` (the `event_date` for a spot lookup, or the historical lookup
  date for a backfill); **immutable** thereafter — a later re-FX writes a correcting row, it never
  mutates this. It is **NULL only when `currency == base_currency`** (no FX applied); for any
  foreign-currency row it is required (non-NULL).

**`amount_base_calculated` fill priority (override flow):** the system fills the calculated base
amount, then the user may override the actual `amount_base`:
1. **Account FX formula** — if the "paid with" account has `fx_formula_id` set, evaluate it with
   the formula's `variables` (`{amount, rate, fee_pct, fee_fixed}`, §3.8). Most accurate.
2. **Spot rate** — else `amount_base_calculated = amount × rate_to_base` from the currency (§3.8).
3. **Cash / no account** — same spot-rate fallback.

The UI shows how it was derived (`formula` / `spot rate` / `manual`). `amount_base` defaults to
`amount_base_calculated`; the user may override it with the exact bank-statement figure (indicator
→ `manual`), and `fx_delta` recomputes. Accumulated `fx_delta` across transactions is the total
household forex cost — a primary dashboard metric, **always shown, never hidden**. Original
`currency`/`amount` are preserved (never overwritten) so raw-currency breakdowns stay available
for visualisation (§3.8).

**`PersonRef` — the unified person reference.** `Owner`, `Payee`, `Payer` are the same concept: a
reference to an `EntityPerson`. The field name differs by context; the type is always `PersonRef`.
A name is **never stored as a string** — only the `*_person_id` FK is persisted; display name,
avatar, and identity colour resolve at render time from the persons cache.

```typescript
type PersonRef = {
  person_id: UUID;
  display_name: string;
  avatar_url?: string;   // Google picture_url — used FIRST when present
  colour?: HexColor;     // Person.colour — fallback initials-avatar background
};
```

### 3.3 Inheritance map — which tables get the audit trail

| Inherits `BaseEntity` (full audit + `household_id`) | Inherits `Base` directly (technical/child) |
|---|---|
| `persons`* , `accounts`, `account_snapshots`, `financial_events`, `budgets`, `categories`, `formulas`, `alerts` | `households`†, `sessions`, `household_invitations`, `account_owners`, `occurrence_records`, `currencies`, `fx_rate_history`, `audit_logs`, `approved_owners` |

\* `persons` overrides `household_id` and `created_by` to **nullable** (a person exists at
first login before any household). † `households` uses `Base` to avoid a circular
`household_id → households.id` FK; its `created_by` is a plain UUID (no FK — persons may not
exist yet at bootstrap).

**Why some children skip `household_id`:** `sessions` scope via `person_id`; `fx_rate_history`
via `currency_id`; `audit_logs` deliberately store **plain UUIDs with NO foreign keys** so
records survive entity/actor deletion; `approved_owners` is global (pre-household).

**Audit coverage of `Base` tables is intentional (resolved 2026-06-13).** Because
`household_invitations` and `currencies` inherit `Base`, their lifecycle (invite/revoke,
currency add/remove) is **not written to `audit_logs`** — they are treated as config/technical
rows, not audited domain entities. This is a deliberate scope decision, not an oversight; do not
"fix" it by promoting them to BaseEntity without a corresponding requirements change.

### 3.4 Identity & Access tables

**`households`** — `id, name, base_currency(ISO,def SGD), timezone(IANA,def Asia/Singapore),
created_at, created_by(UUID,no FK)`. Base currency is immutable after creation in practice
(changing it triggers a full `amount_base` recompute — FR-CU-005).

**`persons`** (BaseEntity, nullable `household_id`/`created_by`) — adds: `email(320,unique),
display_name, picture_url, role(owner|admin|member), display_currency(ISO,def SGD),
default_view(household|personal), google_sub(unique), last_active_at, can_create_household
(bool)`. `can_create_household` is a denormalized cache of the approved-owner match (§2.7).
Also adds `theme` (str, def `'base'`; per-person theme per FR-P-003)
and `colour` (hex; **fallback** initials-avatar background for payee identity — the Google
`picture_url` avatar is used first when present). Per-person preference columns
(FR-P-003 / FR-P-009 / FR-DB-003): `font` (str, def `'base'`), `density` (`comfortable|compact`, def
`comfortable`), `reduce_motion` (bool, def false), `display_format` (str(20), def `'DD-MM-YYYY'`;
one of `DD-MM-YYYY | MM-DD-YYYY | YYYY-MM-DD` — per-person date display/input, FR-P-009 / Story 2.11),
`notification_prefs` (JSON — per-alert-type opt-in map, FR-SYS-007), `dashboard_layout` (JSON —
`{widget_type, span, order, scope?}[]`, FR-DB-003), `recent_glyphs` (JSON, nullable — the last-8
emoji/icon glyphs the person picked, most-recent first, backing the EmojiIconPicker **Recent** row;
per-person so it follows them across devices. UX §8.3, Story 3.1).
**Detachment tracking (§2.8a):** `detachment_reason` (enum `left | removed | household_deleted`,
nullable — NULL while in a household) and `detached_at` (timestamp, nullable) record *why* a
person's `household_id` went NULL, so re-login can route them to the correct §3 page
(`household_deleted` → Household Deleted; `removed` → Removed from Household; `left` / NULL →
Not Invited). Both are **cleared back to NULL** the moment the person seeds or joins a household
again. Index: `(household_id, email)`.

**`sessions`** (Base) — see §2.14.A (full DDL there). No `household_id`.

**`household_invitations`** (Base) — `id, household_id, invited_email(320), invited_by(FK
persons), created_at, expires_at, accepted_at, status`. **Status enum** (type `InvitationStatus`,
§4.13): `pending | accepted | declined | revoked | expired`. **Expiry = 7 days** per FR-HH-003.

> **The `id` is the `/join/:token` token — do not broadcast it.** The member-viewable Settings
> invitation list (`GET /api/household/invitations`, any member per FR-HH-002) returns
> `invited_email · status · expires_at · created_at` **only** — never the `id`. "Copy join link" is an
> admin/owner action (UX §5.2), so the token rides only the role-gated invite actions (Story 2.6).
> Likewise `GET /api/household/members` is an any-member household-scoped read (name/email/role/status);
> both are `{items, total}` and never expose another household's rows.

> **Token validation has no separate "already-used" state (resolved).** A join token is
> actionable **only** while `status=pending` (and not past `expires_at`). Validation returns a
> reason code — `pending` (proceed) vs `invalid` for any non-actionable case
> (`accepted | declined | revoked | expired`, or unknown token) — and every non-`pending`
> outcome renders the §5.8 / UX §3 error page. UX §4.1a's "already-used" link is simply an
> `accepted` (or `declined`) invitation; it needs no enum value of its own.

**`approved_owners`** (Base, global) — full spec in §2.7:
`id, email(320,unique,case-insensitive), label, is_active(def true), added_by(FK persons,null),
created_at, updated_at`. Reserved (not MVP): `plan_tier, billing_ref, expires_at`.

### 3.5 Accounts

**`accounts`** (BaseEntity, **STI**, discriminator `account_type` ∈
`bank|credit_card|capital|asset|insurance`). **No `MonetaryValueMixin`** (§3.2): an account has
no single amount — its value is the `opening_balance`/`opening_balance_date` ledger anchor plus
the `account_snapshots` series (asset-like current value = latest snapshot, §3.11).

*Shared columns:* `name, account_type, institution, notes`,
`colour` (hex; per-instance brand/identity colour, default = entity-type colour),
`vivid` (bool, def false; per-instance full-saturation fill opt-in, FR-SYS-016 / UX §8.2 — added by Story 4.1).
*Reserved, post-MVP:* `brand_image_ref` (logo / card art).
Ledger-backed only: `opening_balance NUMERIC(15,4) NULL`,
`opening_balance_date DATE NULL` — required for Bank/CreditCard (the anchor for the computed
running balance, FR-A-008); NULL for asset-like types.

*Subtype columns (all nullable):*

| Subtype | Columns |
|---|---|
| bank | `account_number, interest_rate(8,4), interest_frequency, reserved_amount(15,4, null)` — `reserved_amount` is the bank-held emergency reserve, excluded from available balance |
| credit_card | `credit_limit(15,4), billing_day(int), due_day(int), reward_points(int), annual_fee(10,2), reward_type(enum points\|cashback\|miles\|none), bonus_limit(15,4, null), points_expiry(DATE, null)` |
| capital | `investment_type, cost_basis(15,4)` — current value derives from the latest `account_snapshot` (no `current_value` column) |
| asset | `asset_type, registration_no(str, null), purchase_date, purchase_value(15,4), depreciation_formula_id(FK formulas)` — `registration_no` = strata-title no. (property) / plate no. (vehicle) |
| insurance | `policy_no(str, null), insurer(str), policy_type(enum life\|term\|health), policy_status(enum active\|cancelled — domain status, distinct from record lifecycle), purchase_date, premium_frequency, coverage_death(15,4, null), coverage_tpd(15,4, null), coverage_ci(15,4, null), coverage_early_ci(15,4, null), coverage_personal_accident(15,4, null), coverage_hospital(str, null — ward type or excess text, e.g. "Private" / "$2,000 excess"), surrender_value(15,4, null — life policies), surrender_inquiry_date(DATE, null)` |

> **Insurance coverage is individual typed columns, not a JSON blob** (resolved 2026-06-13) — the
> per-coverage amounts (`coverage_death`/`tpd`/`ci`/`early_ci`/`personal_accident`) are first-class
> nullable columns so they are queryable/sortable. There is **no
> `coverage_types(JSON)` / `coverage_amount` column** (an earlier draft used those; they are
> superseded).

**Formula assignment columns** (FR-F-003): `depreciation_formula_id` (asset),
`fx_formula_id(FK formulas, null)` for bank/credit_card, and `interest_formula_id(FK
formulas, null)` for capital/asset. Index: `(household_id, account_type)`.

**Default icon per `account_type` (accounts carry no custom glyph, UX §8.2).** Accounts render a
fixed Lucide icon keyed off the discriminator (the EmojiIconPicker is **categories-only**, §3.7);
there is **no per-account icon column**. The map lives in one frontend constant
(`ACCOUNT_TYPE_ICON`): `bank → Landmark`, `credit_card → CreditCard`, `capital → TrendingUp`,
`asset → Building2`, `insurance → ShieldCheck`. Colour identity still comes from the instance's own
`colour` (§3.0a / UX §5.5) — the icon is type-derived, the colour is per-instance.

> **Current value** for asset-like accounts (capital, asset, insurance) is the latest
> `account_snapshot` by date — single source of truth, no drift. `cost_basis` is the basis,
> not a current value, and is retained.

**`account_owners`** (Base junction) — composite PK `(account_id, person_id)`, `is_primary,
added_at`. An account always has ≥1 owner.

**`account_snapshots`** (BaseEntity) — the universal per-account value series (FR-A-008):
`id, household_id, account_id(FK accounts, INDEX), snapshot_date(DATE), value(15,4),
currency(3), value_base(15,4), source, formula_id(FK formulas, null), note` + BaseEntity audit.
**`source` enum:** `manual | formula | reconciliation | appraisal | import | computed`.
`import` reserved for bank-feed; `computed` is what the monthly scheduler writes (FR-SYS-006).
The three **user-selectable** values (`manual | reconciliation | appraisal`, UX §8.2a) are
**stored and processed identically** — all are user-entered snapshots with no behavioural
difference; the distinct label is a **provenance tag** for audit/reporting (typed by hand /
checked against a statement / professional valuation). `formula | import | computed` are
system-written and never user-selectable. Index: `(account_id, snapshot_date)`.

Account-linked recurring is modelled as a `FinancialEvent` (§3.6), not a separate config
table: the `financial_events` columns `source_entity_type` + `source_entity_id` model the
link back to the originating account, so FR-A-017 creates a recurring-payment event directly.

### 3.6 Events

**`financial_events`** (BaseEntity + MonetaryValueMixin, **STI**, discriminator `event_type` ∈
`transaction|recurring_payment|transfer`).

*Base event columns:* `name, event_date(INDEX), event_type,
transaction_status(pending|completed|cancelled|reconciled, def completed),
payee_person_id(FK persons), payment_method, category_id(FK categories), transaction_type
(inflow|outflow|transfer), is_shared_expense(bool), notes, is_gst_claimable(bool),
source_account_id(FK accounts, null)` *(the single account link — **no separate
`account_id` column**, see note below)*`, linked_recurring_id(FK self)`,
`source (manual|csv_import|bank_feed, def manual)`, `external_ref(null)` — provenance
(FR-E-001), bank-feed hook.

> **`payee` is the paying household member, FK-only (resolved).** "Payee" here = the household
> member who paid (the payer) — stored **only** as `payee_person_id` (a `PersonRef`, §3.2), never
> as a string. There is **no free-text `payee` column** (an earlier draft listed one; it duplicated
> `payee_person_id` and broke the never-store-a-person-as-a-string rule, §3.2). The transaction
> `name` holds the **good/service**; the **merchant/vendor** name, if recorded, goes in `notes`.
> All person-matching — budget owner (§3.7), internal debt (§3.10), duplicate detection (§4.10) —
> compares `payee_person_id`.

> **One account link: `source_account_id` (resolved 2026-06-13).** The originating account is
> `source_account_id` (NULL only for Cash, where `payment_method='cash'`); a Transfer's far leg is
> `destination_account_id`. There is **no separate `account_id` column** — an earlier draft listed
> one, but it duplicated `source_account_id` and nothing referenced it (§3.6 and the PRD only
> know `source_account_id`). Account ledger/history queries (FR-A-007) filter on `source_account_id`
> (plus `destination_account_id` for incoming transfer legs).

*Transaction columns:* `reconciled(bool), reconciled_at, duplicate_of(FK self)`.

*RecurringPayment columns:* `frequency_text, frequency_rule(JSON text), next_occurrence,
recurrence_start_date, recurrence_end_date, source_entity_type
(recurring_payment|capital|asset|insurance), source_entity_id(UUID, polymorphic, no FK),
occurrences_generated(int), last_processed_at`.

*Transfer columns:* `destination_account_id(FK accounts), dest_currency, dest_amount(15,4),
dest_amount_base(15,4), is_debt_repayment(bool), debt_cleared_amount(15,4)`.
Transfers inherit `fx_rate`, `fx_rate_date`, `fx_delta` from the mixin (FR-E-017's
forex-loss tracking); the destination leg is captured by `dest_*`. A future remittance metric
= `amount_base − dest_amount_base`.

*Constraints/indexes:* CHECK `is_shared_expense=0 OR transaction_type='outflow'`
(`ck_shared_expense_outflow_only`); indexes on `(household_id, event_date)`,
`(household_id, category_id)`, `(household_id, payee_person_id)`,
`(household_id, is_shared_expense, transaction_type)`.

**`occurrence_records`** (Base) — `id, recurring_event_id(FK events, INDEX), expected_date,
occurrence_status(upcoming|processed|skipped|missed|failed), generated_event_id(FK events,
null), processed_at, notes`. A user-triggered run (FR-E-015 manual trigger) records the
occurrence as `processed` — there is **no separate `manual` status** (resolved 2026-06-13; the
enum is exactly the five values above). Index: `(recurring_event_id, expected_date)`.

**Recurring frequency — the 9 patterns, parse + storage (FR-E-011/012).** `frequency_text` is the
user's free-text input; a **pure, deterministic** parser (no I/O — same text always yields the same
rule) resolves it to a structured `frequency_rule` (JSON) plus a computed `next_occurrence`. The
**nine supported patterns are the only ones the parser accepts** (weekday `0=Sun..6=Sat`, month
`1–12`):

| # | Pattern | Example | `frequency_rule` |
|---|---|---|---|
| 1 | every [weekday] | "every Sunday" | `{kind:'weekly', weekday:0}` |
| 2 | weekly | "weekly" | `{kind:'weekly', weekday:<start>}` |
| 3 | monthly | "monthly" | `{kind:'monthly_day', day:<start>}` |
| 4 | [N]th of every month | "8th of every month" | `{kind:'monthly_day', day:8}` |
| 5 | every [N] days | "every 10 days" | `{kind:'every_n_days', n:10}` |
| 6 | every [N] weeks | "every 4 weeks" | `{kind:'every_n_weeks', n:4}` |
| 7 | [Nth] [weekday] of [month] | "2nd Tuesday of March" | `{kind:'nth_weekday', nth:2, weekday:2, month:3}` |
| 8 | [month] [day] | "April 10" | `{kind:'yearly_date', month:4, day:10}` |
| 9 | yearly | "yearly" | `{kind:'yearly_date', month:<start>, day:<start>}` |

`<start>` anchors to `recurrence_start_date`. `monthly_day` **clamps to month length** (a `day:31`
rule fires on the last day of short months). **No-match fallback:** text matching no pattern returns
a parse error — the RecurringDateInput (UX §13) surfaces it as a **blocking** validation error and
**Save is disabled**; nothing is stored (never a silent guess). `next_occurrence` is always
recomputed server-side from `frequency_rule` (never trusted from the client); the scheduler (§5.6)
advances it as occurrences process.

### 3.7 Budgets, Categories

**`budgets`** (BaseEntity) — `name, category_id(FK), owner_person_id(FK, null=household-wide),
period_type(monthly|yearly), limit_currency, limit_amount(15,4), limit_amount_base(15,4),
period_start, period_end, alert_threshold_pct(int, def 80), rollover(bool)`. **No
`actual_spent` column — actuals are always computed at query time** (FR-B-003). Indexes:
`(household_id, period_start, period_end)`, `(category_id, period_start)`.

**Budget actuals — computed linkage (FR-B-003).** `actual_spent` is summed at query time over
`financial_events` where: `event_date ∈ [period_start, period_end]` · `category_id` matches
(**including child categories** — spending rolls up to the parent) · `payee_person_id` matches the
budget `owner_person_id` (any person if household-wide) · `transaction_type = outflow` ·
`transaction_status ≠
cancelled`. `variance = limit_amount_base − actual_spent`. Neither is stored. A monthly job
creates next month's record at month-end, copying `limit` unless overridden; monthly + yearly
budgets may coexist for one category.

**Budget rollover (FR-B-009) — computed, no stored carryover.** When `rollover=true`, a period's
unspent balance carries into the next period's *effective* limit. Like actuals, the carryover is
**derived at query time, never stored** (no `rollover_amount` column):
- `carryover_in(P) = max(0, prior.effective_limit − prior.actual_spent)` where `prior` is the
  immediately preceding period **for the same category+owner** and `prior.rollover = true`;
  otherwise `carryover_in(P) = 0`. Only **unspent** carries — an overspend does not roll a deficit
  forward (the chain floors at 0).
- `effective_limit(P) = limit_amount_base + carryover_in(P)`. Health, `alert_threshold_pct`, and
  `variance = effective_limit − actual_spent` all measure against `effective_limit`, not the raw
  `limit_amount_base`.
- The chain is **recursive across consecutive rollover periods** and **breaks** at any period with
  `rollover=false` (carryover resets to 0 for the next). Because every term is recomputed from the
  contributing events, nothing drifts.
- **Mid-period limit edit:** editing `limit_amount` changes the current period's base limit and
  thus its `effective_limit` immediately; `carryover_in` (from the *prior* period) is unaffected.
  Past periods are read-only, so historical carryover never changes retroactively.

**`categories`** (BaseEntity) — `name, color(7), icon(50), category_type
(income|expense|both, def expense), parent_id(FK self, ON DELETE SET NULL), depth(int),
vivid(bool, def false)`. CHECK `depth <= 1` (max 2 levels). Index: `(household_id, parent_id)`.
`vivid` is the **per-instance** (per-entity, not per-person) full-saturation fill opt-in that drives
`EntityCard`/CategoryTree's `bg-entity-fill-vivid` vs the default calm tint (FR-SYS-016, UX §0.1/§8.2);
it is set from the EntityModal colour-picker's vivid toggle. The same `vivid` column lives on every
colour-bearing entity — `accounts` (§3.5) and `currencies` (§3.8) — added by each entity's CRUD story.

**Category behaviour rules:**
- **Max 2 levels** (parent → child, no grandchildren). A top-level category with children cannot
  itself become a subcategory — `depth` must stay 0 while children exist.
- **Archive cascades the whole branch (FR-C-005):** archiving a parent archives its subcategories
  *together*; children are **not** auto-promoted. Restoring the parent restores the branch.
  Returns **200, not 409**. Archived categories keep their references on existing events
  (excluded from dropdowns, preserved for historical accuracy). **Bulk-archiving a parent *and* one
  of its own children together is idempotent** (FR-E-020 multi-select): the branch cascade is
  authoritative, so the explicitly-selected child is already archived by the parent's cascade — the
  redundant child archive is a **no-op** (one audit row per item, no double-archive, no error).
  Selecting both is allowed, never blocked.
- **Hard vs soft delete (§3.0a tenet 5 / §4):** hard-delete only if zero downstream deps (no
  events/budgets/recurring reference it); otherwise archive.
- **Merge:** one or more sources merge into a target — all `financial_events.category_id` on
  sources reassign to the target, sources' subcategories reassign (name clash → append `" (2)"`),
  sources are archived. Transactional (all-or-nothing).
- **Promote:** a subcategory → top-level by setting `parent_id = null` (`depth` → 0).
- **Reassign:** a subcategory → a different top-level parent by updating `parent_id` (`depth`
  stays 1).
- **Spending rollup:** a parent's totals include all child-category spending.
- **Seed:** **13 starter categories** seeded idempotently at household creation (first built in
  Story 2.3's `category_service.seed_default_categories`; reused by the FR-C-007 recovery button in
  Story 3.3). All household-specific; **no system categories exist**; all owner-editable; all
  top-level (`parent_id=null`, `depth=0`). This is the **authoritative seed table** (names, types,
  colours, icons) — `Category.color` is NOT NULL, so a colour is mandatory; `icon` is the emoji:

  | # | name | category_type | color | icon |
  |---|---|---|---|---|
  | 1 | Food & Dining | expense | `#f59e0b` | 🍔 |
  | 2 | Groceries | expense | `#22c55e` | 🛒 |
  | 3 | Transport | expense | `#3b82f6` | 🚇 |
  | 4 | Housing | expense | `#8b5cf6` | 🏠 |
  | 5 | Utilities | expense | `#06b6d4` | 💡 |
  | 6 | Healthcare | expense | `#ef4444` | 🏥 |
  | 7 | Shopping | expense | `#ec4899` | 🛍 |
  | 8 | Entertainment | expense | `#6366f1` | 🎬 |
  | 9 | Insurance | expense | `#14b8a6` | 🛡 |
  | 10 | Education | expense | `#a855f7` | 🎓 |
  | 11 | Salary | income | `#16a34a` | 💰 |
  | 12 | Investment Income | income | `#0ea5e9` | 📈 |
  | 13 | Miscellaneous | both | `#64748b` | 📦 |

  (UX §6, epics Stories 2.3 / 3.1 / 3.3.)

### 3.7a Tags

Free-form labels on transactions, **separate from categories** (a transaction has exactly one
category but **any number of tags**). Tags classify by *nature / controllability* — the dimension
category can't express (one-off vs recurring, essential vs discretionary, emergency, vacation, gift).

**`tags`** (BaseEntity, household-scoped) — `id, household_id(FK, INDEX), name, slug,
colour(token ref, def neutral), archived(bool)`. UNIQUE (`household_id, slug`).
**Full CRUD — every tag can be created, renamed, recoloured, archived, and deleted by any
member.** There are **no system/protected tags** — nothing is locked. A tag is **always
hard-deletable** (unlike most entities): its only referrer is `transaction_tags`, whose rows are
removed with it, so there is no "in use" block — delete simply unlinks it everywhere. `archived` is
an optional soft-hide for a tag you want to keep but stop offering.

**`transaction_tags`** (join) — `transaction_id(FK financial_events, INDEX),
tag_id(FK tags, INDEX)`, PK (`transaction_id, tag_id`). Many-to-many. **Deleting a tag just
removes its join rows** — the affected transactions keep all their data and simply lose that one
tag (no cascade to the transaction).

> **Starter tags are seeded, not special.** At household creation a convenience set —
> **Gift · Essential · Discretionary · Emergency · One-off · Vacation** — is inserted as ordinary
> deletable rows (`is_system` does **not** exist). A household can rename, recolour, or delete any
> of them and add its own.

> **Tags carry no behaviour — the two behavioural flags stay typed columns.**
> `is_shared_expense` (sole driver of internal household debt, §3.10; CHECK `outflow only`; dedicated
> index) and `is_gst_claimable` (tax-report integrity) are **typed booleans, never tags**, precisely
> because logic keys off them. Tags are pure labels: filtered and visualised (§4.12), never wired
> into debt, budgets, or reports. `is_gift` (an earlier boolean) is **removed** — "gift" is now just
> a starter tag.

### 3.8 Currencies, Formulas

**`currencies`** (Base) — `id, household_id, code(3), name, symbol(5), is_base(bool),
is_display_active(bool), rate_to_base(10,6), fee_pct(6,4), last_rate_at, rate_source`,
`colour` (hex, nullable — default derived deterministically from `code`;
overridable), `vivid` (bool, def false; per-instance full-saturation fill opt-in, FR-SYS-016 / UX §8.2 —
added by Story 3.5). This same colour is the currency's series colour in raw-currency stacked charts
(FR-CU-008), so currency identity is consistent across chips and visualizations.
UNIQUE `(household_id, code)`. Exactly one `is_base=true` per household (app-enforced).
**`rate_source` records the *winning provider* from the per-currency fallback chain** (§5.7) —
because providers differ in currency coverage, two currencies in one household may carry
different `rate_source` values after the same daily run.
**FX convention (resolved — authoritative):** `rate_to_base` is the **multiplier from the
foreign amount to base**: `amount_base = amount × rate_to_base`. Example: `amount = 100 NZD`,
`rate_to_base = 0.88` → `amount_base = 88 SGD`. The base currency's own `rate_to_base = 1.0`.
This is the single allowed direction everywhere money is converted; any inverse is a bug.
The PRD's prose "1 base = X target" is restated in this multiplier form to match the field.

**`fx_rate_history`** (Base) — `id, currency_id(FK), rate_date, rate_to_base(10,6), source`.
UNIQUE `(currency_id, rate_date)`. The read side (FR-CU-009 chart) queries this.

**`fx_providers`** (FR-CU-010) (Base, household-scoped) — `id,
household_id(FK), name, provider_type(enum: openexchangerates|…), base_url,
api_key_secret_ref(str — a Secret Manager resource name, NEVER the key), priority(int),
is_enabled(bool, def true), last_status(enum ok|stale|down, null), last_checked_at(null)`.
Ordered by `priority` = the fetch fallback chain (§5.7). **The API key value is never stored
here nor returned by any endpoint** — only the secret reference; GET masks it. **Default provider
seeding is owned by Story 3.6 (FX Provider Configuration), NOT by `_create_and_seed_household`
(§2.6).** The household-creation seed in Story 2.3 deliberately seeds only the base currency + default
categories (the `base_url` literal and the openexchangerates-vs-exchangerate-api provider identity are
unresolved at that point, and FX config is 3.6's subject). 3.6 ensures a single `openexchangerates`
row, `priority=0`, `api_key_secret_ref` pointing at the `EXCHANGERATE_API_KEY` secret; `is_enabled=true`
when that env/secret is set, else `is_enabled=false` (no usable chain → FX uses last-known/seed rates
and raises `FX_API_DOWN` per §5.7) rather than being skipped — so the Integrations UI (UX §5.2) always
has a row to configure. Seeding is idempotent (keyed on `(household_id, provider_type)`), so 3.6 can
seed-on-first-need and backfill any 2.3-created household with no migration.

**`formulas`** (BaseEntity) — `name, formula_key(str, machine key e.g.
`depreciation_straight_line`), expression(text), applies_to(str), variables(JSON — variable
definitions with types and defaults), is_system(bool), is_active(bool, def true), description`.
System formulas (`is_system=true`) are seeded and undeletable (FR-F-001); `is_active=false`
disables a formula for the household without deleting it. `variables` carries the per-formula
defaults the override flow reads — e.g. `fx_fee_calculation` defines `{amount, rate, fee_pct
(def 0), fee_fixed (def 0)}` (§3.2). UNIQUE `(household_id, formula_key)`.

**System default formulas** (seeded, `is_system=true`):

| `formula_key` | `applies_to` | Expression | Purpose |
|---|---|---|---|
| `depreciation_straight_line` | Asset | `purchase_value × (1 - rate × years)` | Linear asset depreciation |
| `depreciation_declining_balance` | Asset | `purchase_value × (1 - rate)^years` | Exponential depreciation |
| `compound_interest` | Capital | `principal × (1 + rate/n)^(n×t)` | Compound interest growth |
| `loan_amortisation` | Asset (mortgage) | Standard amortisation schedule | Monthly repayment breakdown |
| `fx_delta` | All MonetaryValue | `amount_base_calculated - amount_base` | Forex cost per transaction |
| `fx_fee_calculation` | BankAccount, CreditCard | `amount × rate × (1 + fee_pct/100) + fee_fixed` | Actual base amount incl. card FX fee |
| `budget_variance` | Budget | `limit - actual_spent` | Budget remaining |
| `net_worth` | Household | `Σ(account values) - Σ(computed debts)` | Overall financial position |

**Account FX-formula assignment (FR-F-003):** `BankAccount` and `CreditCard` carry
`fx_formula_id` (FK formulas, §3.5). When set, that formula is evaluated during transaction
creation to produce `amount_base_calculated` instead of the raw spot rate (§3.2) — encoding the
card's real-world fee structure (e.g. an Altitude Visa with `fx_fee_calculation`, `fee_pct=1.5`,
auto-fills `amount × rate × 1.015`, matching the statement without manual correction). Formula
results are surfaced **on hover only** (tooltip: name · inputs · result · source); the one
exception is `fx_delta`, always visible on transaction rows (§3.2).

**Formula evaluation — sandboxed AST, never `eval()` (FR-F-002, security).** `expression` is run by
a **restricted arithmetic evaluator built on Python's `ast`**: `ast.parse(expr, mode='eval')`, then
walk the tree against a strict **allow-list** of node types — `Expression, BinOp, UnaryOp,
Constant(int|float), Name (a declared variable only), Call (whitelisted functions only)` — operators
`+ − × ÷ // % **`, functions `min, max, abs, round, pow, sqrt`. **Any other node rejects the
formula**: no `Attribute`, `Subscript`, `Lambda`, comprehension, name outside the declared
`variables`, or dunder. There is **no `eval`/`exec`/`compile`-to-code path** and no access to
builtins or globals. Guards: a max node-count and an exponent cap on `**` stop expansion bombs;
`÷0`/NaN/overflow are caught and returned as a Test-row **warning** (UX §11), not a 500. `variables`
(JSON) supplies the bound `Name`s and their defaults; an unbound token is the editor's blocking
**'unknown variable'** error. The **frontend Test row mirrors the same allow-list** in a small JS
parser for live preview, but **server evaluation is authoritative** — the client never submits a
result to be trusted.

### 3.9 System tables

**`alerts`** (BaseEntity) — `alert_type, title, body, entity_type(null),
entity_id(UUID, null), read_at(null), dismissed_at(null)` (FR-SYS-007); "read" =
`read_at IS NOT NULL`. **`alert_type` enum:** `BUDGET_WARNING | BUDGET_EXCEEDED |
RECURRING_MISSED | FX_RATE_STALE | UPCOMING_PAYMENTS | FX_API_DOWN | BACKUP_CREATED`.

**Alert delivery — poll, no push (MVP).** There is **no WebSocket/SSE** — a persistent socket would
pin a scale-to-zero Cloud Run instance (§1.1). Alerts are produced by the daily `/jobs/alerts` run
(§5.6) and as mutation side-effects (e.g. a budget threshold crossing on event write), then
**pulled** by the client. Read/ack API (household-scoped, RFC 7807 like every route):

```
GET   /api/alerts?status=unread|all   -> { items: [Alert], total, unread_count }
POST  /api/alerts/{id}/read           -> sets read_at
POST  /api/alerts/{id}/dismiss        -> sets dismissed_at
POST  /api/alerts/read-all            -> bulk mark read
```

The frontend `AlertPanel` (UX §7) polls `GET /api/alerts` via TanStack Query with a **60 s
`refetchInterval` + `refetchOnWindowFocus`** (§6.3); the unread badge reads `unread_count`.
Staleness of up to one interval is acceptable — alerts are advisory, never transactional.

**`audit_logs`** (Base, **no FKs by design**) — `id, household_id(UUID), actor_id(UUID),
action(create|update|archive|restore|delete), entity_type, entity_id(UUID),
before_state(JSON text), after_state(JSON text), occurred_at(INDEX), ip_address, user_agent`.
**Append-only:** no UPDATE/DELETE ever (FR-SYS-005). Indexes on `household_id, actor_id,
entity_id, occurred_at`.

**`entity_preferences`** (FR-E-021) (Base) — `id, person_id(FK),
entity_type(str), entity_id(UUID), is_favourite(bool, def false), sort_order(int, null)`.
UNIQUE `(person_id, entity_type, entity_id)`. **Per-person** favourite + manual ordering for any
EntityCard list — one member's arrangement never affects another's. Index `(person_id, entity_type)`.

### 3.10 EntityDebt — computed, **no table**

Debt is **never stored as an independent record** — there is **no `debt` table** and it does
not inherit `BaseEntity`. It is a view derived on demand from the `financial_events` and
`accounts` that qualify as debt contributors. Building a debt table is a design error.

**Source 1 — CreditCard balance (computed):**
```
CreditCard.debt_balance =
    Σ(outflow events on this card) − Σ(transfers to this card marked is_debt_repayment)
```

**Source 2 — Internal household debt (person-to-household):**
```
Person.household_debt =
    Σ(events where payee_person_id = this_person AND is_shared_expense = true
      AND source_account belongs to this person personally)
    − Σ(transfers to this person's account flagged as household-debt repayment)
```
The `is_shared_expense` flag (§3.6) is the **sole driver** of internal household debt: when a
person pays a whole-household expense from their personal account and marks it shared, the
household owes them until a repayment Transfer clears it.

**Total household debt (MVP) = Σ(CreditCard.debt_balance) + Σ(Person.household_debt).**
*Source 3 — asset loan / mortgage remaining — is **POST-MVP** (no MVP `FR-D`); the
`loan_amortisation` formula can still display a payoff schedule without feeding household debt.*

**Debt-clearing via Transfer:** on save, the system checks the destination — a Transfer **to** a
CreditCard, or to a member's account with outstanding household debt, auto-flags
`is_debt_repayment=true`; the user may override to `false` (e.g. topping up a card for spending,
not repayment). `debt_cleared_amount` is recorded on the Transfer and the affected parties' debt
is recomputed.

**API — read-only, computed on demand (FR-D, UX §16).** Debt has **no CRUD** (there is no table);
it exposes only GET endpoints that run the derivation above over the household's events/accounts
each call (no caching in MVP — the dataset is household-scale):
```
GET /api/debt/household        -> { total_base, by_source: { credit_cards, internal },
                                     cards: [ {account_id, debt_balance} ],
                                     persons: [ {person_id, household_debt} ] }
GET /api/debt/person/{id}      -> { person_id, household_debt, contributing: [...], repayments: [...] }
```
Both are household-scoped via `get_household_id`; a Member requesting another member's breakdown is
rejected per FR-P-006. These feed the Debt module and the dashboard debt widget; the aggregated
chart series come from `/api/visualizations/debt-summary` (§4.12). Mutations happen only on the
underlying Transfers/events, never on these routes.

> **"Monthly cleared" is derived, not stored (resolved).** Whether a card is fully paid for a
> period is `computed debt_balance == 0` for that period — **there is no `monthly_cleared`
> column** (an earlier draft named one). Storing it would duplicate the computed balance and
> risk drift, against the computed-over-stored tenet (§3.0a). The month-end scheduler's
> `source=computed` snapshot (§3.5) already records the period balance; "cleared" reads off it.

### 3.11 Resolved schema decisions

1. **No `accounts.current_value` column.** Current value for asset-like accounts derives from
   the latest `account_snapshot`; `cost_basis` retained. (§3.5)
2. **FX direction — `amount_base = amount × rate_to_base`.** Single allowed direction
   everywhere; any inverse is a bug. (§3.8)
3. **Materialized monthly snapshots.** The scheduler writes one `source=computed`
   `account_snapshot` per Bank/CreditCard account each month (FR-SYS-006); ledger-backed
   current balance = opening balance + ledger, anchored/corrected by manual snapshots;
   asset-like current value = latest snapshot. (§3.5, §3.6)

### 3.12 Migration plan (Alembic)

The schema ships as **one consolidated `0001_initial_schema`** revision reflecting §3.1–3.9.
It runs against the **root** DB (`./financial_tracker.db`), per the Alembic-URL note in the
Infrastructure part (§5).

---

## 4. Backend Application Architecture

The layering, dependency-injection seam, error contract, and audit model for the backend.

### 4.0 The four layers

```
HTTP ─► Route (router)          thin: DI, call one service fn, shape the response
        │  Depends(...)         get_db, get_current_person, get_household_id, require_role
        ▼
        Service (service fn)    ALL business logic, validation, audit writes; flush (never commit)
        │
        ▼
        Model (SQLAlchemy ORM)  pure data + invariants (e.g. fx_delta auto-compute); no I/O logic
        ▲
        Schema (Pydantic)       the request/response CONTRACT; validation at the edge
```

**One rule that makes the layering enforceable:** a route never contains business logic, and
a service never touches `Request`/`Response` or HTTP concerns *except* raising `HTTPException`.
The DI dependencies are the only seam between transport and logic.

### 4.1 Layer responsibilities

| Layer | May | May NOT |
|---|---|---|
| **Route** | resolve dependencies; call exactly one service function; map result to a `*Response`; set status code | contain business rules, multi-step DB logic, or audit writes |
| **Service** | all logic, cross-entity validation, dependency scans, `audit.log(...)`, `db.flush()` | `db.commit()`/`rollback()`; read cookies/headers; know about `Request` |
| **Model** | columns, relationships, model-level invariants (`@validates`) | queries, business decisions |
| **Schema** | field validation, shape | DB access |

### 4.2 Request lifecycle (mutating request, end-to-end)

Walkthrough of `POST /api/categories`:

1. **Middleware** (§2.1): SecurityHeaders → DevBypass → **CSRF** (validates `X-CSRF-Token`
   against the session) → SlowAPI.
2. **Route** resolves DI: `get_db` (opens session), `get_current_person` (validates session →
   `Person`), `get_household_id` (→ `UUID`). Pydantic parses the body into `CategoryCreate`
   (422 on failure).
3. **Route** calls `create_category(db, household_id, person.id, data)` — household_id and
   actor_id are **always** the leading positional args.
4. **Service** runs business validation (case-insensitive name uniqueness, parent depth),
   `db.add(...)`, `db.flush()` (assigns PK), then `audit.log(...)`.
5. **Route** returns `CategoryResponse.model_validate(obj)`; FastAPI serializes; status 201.
6. **`get_db` commits** on clean return (or rolls back on any exception) — see §4.3.

### 4.3 Transaction boundary — the single most important rule

**One DB session per request, owned by `get_db`. Services flush; only `get_db` commits.**

```python
async def get_db():
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()      # commit ONCE, on clean return
        except Exception:
            await session.rollback()    # any raised exception → full rollback
            raise
```

**Engine & session factory (SQLite/aiosqlite specifics).**
```python
engine = create_async_engine(
    settings.DATABASE_URL,                 # sqlite+aiosqlite:///./financial_tracker.db
    echo=settings.DEBUG,
    connect_args={"check_same_thread": False},   # required for aiosqlite
    pool_pre_ping=True,
)
# WAL + foreign_keys are set per-connection via a `connect` event listener (§5.5), not here.
async_session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
```
`expire_on_commit=False` so attributes remain readable after `get_db` commits (the route still
needs `obj` to serialize the response). Connection pooling is effectively a single writer
(`max-instances=1`, SQLite single-writer) — do not tune pool size as if Postgres; the SQLAlchemy
default is fine.

Consequences (all load-bearing):
- A request is **atomic**: either every mutation + its audit rows commit together, or none do.
- Services call `await db.flush()` (to obtain PKs / order FK inserts) but **never** `commit()`.
  A stray `commit()` in a service breaks atomicity.
- `HTTPException` raised mid-service → propagates → `get_db` rolls back → clean error response.
- **Exception:** session validation (§2.14.B) deliberately uses its **own** short-lived
  connection and commits the sliding-window update independently of the request session. This
  is the one sanctioned second connection (and the §2.14 scaling note).

### 4.4 Dependency-injection seam (the contract between transport and logic)

| Dependency | Returns | Raises |
|---|---|---|
| `get_db` | `AsyncSession` (commit/rollback wrapper) | — |
| `get_current_person` | `Person` (validates session; stashes it on `request.state`) | 401 |
| `get_household_id` | `UUID` (`person.household_id`) | 401 if NULL |
| `require_role("admin")` | `Person` if role ≥ threshold | 403 |
| `get_or_404(db, model, id, household_id=…)` | household-scoped entity | 404 (incl. cross-household) |

**Service signature law:** `async def <verb>_<entity>(db, household_id, actor_id, ...) -> ...`.
`household_id` comes from `get_household_id`, never from the request body — this is the tenant
isolation guarantee.

### 4.5 Schema / contract conventions (Pydantic)

- Three schemas per entity: **`<Entity>Create`** (all required fields), **`<Entity>Update`**
  (all optional — partial update via `model_dump(exclude_unset=True)`), **`<Entity>Response`**
  (`model_config = {"from_attributes": True}`; built via `Response.model_validate(orm_obj)`).
- **Field validation lives in the schema** (`@field_validator`, regex, `min_length`), e.g. hex
  colour, enum membership. **Cross-entity/business validation lives in the service** (name
  uniqueness, parent depth, dependency scans).
- **List endpoints return an envelope:** `{"items": [...], "total": N}` — never a bare array
  (PRD API rule). Computed fields (e.g. `children_count`, `parent_name`) are added to the
  response dict by the route via a single aggregate query, not N+1.
- Enum-like fields are `Literal[...]` in responses where the value set is closed.
- **STI responses (accounts, financial_events) use a discriminated union.** Each subtype has its
  own `<Subtype>Response` carrying only that subtype's columns; the list/detail response is
  `Annotated[Union[BankAccountResponse, CreditCardResponse, …], Field(discriminator="account_type")]`
  (likewise `event_type` for events). This keeps each serialized object to its **relevant** fields
  instead of a single flat schema padded with every other subtype's columns as `null`. The route
  picks the subtype schema from the discriminator before `model_validate`; `from_attributes=True`
  reads the nullable ORM columns that belong to that subtype.

### 4.6 Error contract — RFC 7807 (CANONICAL)

**Every error response uses RFC 7807 Problem Details:**

```jsonc
{
  "type":   "duplicate_name",          // stable machine slug (snake_case)
  "title":  "Category already exists",  // human summary
  "status": 409,                        // mirrors HTTP status
  "detail": "Category 'Food' already exists",  // specific message
  "instance": "/api/categories"         // optional: the request path
}
```

Raised as `raise HTTPException(status_code=409, detail={...7807...})`; `main.py`'s
`http_exception_handler` passes a dict `detail` through unchanged. Validation (422) errors are
wrapped by `validation_exception_handler` with `type="validation_error"` and a `detail` array
of field errors.

| Status | When |
|---|---|
| 400 | malformed business request (e.g. self-parent, max-depth) |
| 401 | no/invalid session, or NULL household where one is required |
| 403 | authenticated but role too low (`require_role`), or CSRF invalid |
| 404 | entity absent **or in another household** (`get_or_404`) |
| 409 | conflict — duplicate name, or hard-delete blocked by dependencies |
| 422 | Pydantic validation failure |
| 429 | rate limit exceeded |

Every `raise HTTPException` carries a dict `detail` in the 7807 shape; there is no short
`{"error","detail"}` envelope anywhere in the API.

### 4.7 Audit pattern

A singleton `AuditService.log(...)` is the **single entry point** for all audit writes,
called **inside the service** after each mutation, **before** the request commits (so the audit
row is part of the same atomic transaction). It writes an append-only `audit_logs` row with
JSON `before`/`after` snapshots. Hard-delete of an empty entity writes an **INFO log line, not
an audit row** (FR-SYS-005).

```python
await audit.log(db, household_id=hid, actor_id=actor_id,
                action="create",              # create|update|archive|restore|delete
                entity_type="category", entity_id=obj.id,
                before={...}|None, after={...}|None)
```

**What goes in the snapshots:**
- A **full column dict** of the row (via the entity's own serialization, not the response
  schema) — `before` = pre-mutation state (null for `create`), `after` = post-mutation state
  (null for `delete`). Storing the full row, not just changed fields, keeps each audit record
  self-describing without needing to replay history.
- **Relationships are NOT serialized** — only scalar columns / FK ids. No nested objects, no lazy
  loads.
- **Sensitive values are masked** before writing: `account_number` is reduced to `****` + last 4;
  `api_key_secret_ref` and any secret reference is written as the reference string only (it is
  already not the key). No raw secrets ever enter `audit_logs`.
- No hard size cap is enforced in MVP (rows are small, single-tenant); a JSON-size guard is a
  post-MVP concern noted alongside audit-retention.

### 4.8 Validation tiers

1. **Edge (schema):** types, ranges, regex, enum membership → 422.
2. **Business (service):** uniqueness (always `func.lower(col) == func.lower(val)` — never
   Python `.lower()`), hierarchy/depth, dependency scans before hard-delete → 400/404/409.
3. **DB (constraints):** the last line of defense — CHECK (`depth<=1`,
   `is_shared_expense⇒outflow`), UNIQUE (`currency household+code`), FK with `foreign_keys=ON`.

### 4.9 Logging

Structured: `logger = logging.getLogger(__name__)`; log **event-name keys** with an `extra={}`
context dict, never interpolated PII into the message:

```python
logger.info("seed_default_categories_done", extra={"household_id": str(hid)})
logger.critical("auth_bypass_enabled_in_non_dev_environment", extra={"env": settings.ENV})
```

CPU-bound work (e.g. the O(n²) duplicate matcher) is pushed off the event loop with
`asyncio.to_thread(...)` so request handling never blocks.

### 4.10 The generic entity pattern (template every entity follows)

This is the server-side "no bespoke CRUD" rule. Each entity ships **one service module** and
**one router** matching these templates — an agent reproduces them per entity without
inventing structure.

```python
# service
async def create_<e>(db, household_id, actor_id, data: <E>Create) -> <E>: ...
async def update_<e>(db, household_id, actor_id, e_id, data: <E>Update) -> <E>: ...
async def archive_<e>(db, household_id, actor_id, e_id) -> <E>: ...      # soft; status=archived
async def restore_<e>(db, household_id, actor_id, e_id) -> <E>: ...
async def delete_<e>(db, household_id, actor_id, e_id) -> None: ...      # hard ONLY if no FK refs
# each mutation: validate → flush → audit.log

# router  (static paths BEFORE /{id} so segments don't match as UUIDs)
GET    /api/<es>            -> {"items":[...], "total":N}
POST   /api/<es>            -> 201 <E>Response
GET    /api/<es>/{id}       -> <E>Response
PATCH  /api/<es>/{id}       -> <E>Response
POST   /api/<es>/{id}/archive | /restore
DELETE /api/<es>/{id}       -> 204
```

**Standing rules:** no raw SQL (ORM only); every query filtered by `household_id`; idempotent
seeders; route-ordering (static before parameterized); permission via `require_role` or
per-row ownership check.

**Tags follow the same template** (`/api/tags`, full CRUD incl. hard-delete — its only referrer is
`transaction_tags`, whose rows are removed with it, so a tag is **always** deletable). The
**transaction** create/edit payload carries `tag_ids: UUID[]` (the service replaces the
`transaction_tags` set in the same transaction → audit), and the **ledger list** accepts a
`tag_ids` filter (OR semantics — a row matches if it has any listed tag), mirroring the
`VisualizationFilter.tag_ids` (§4.12). Tag assignment touches no debt/budget recompute — tags are
inert labels. The CRUD is consumed **inline by the TagInput picker** (create + rename + recolour +
archive + delete from the dropdown) — there is **no dedicated tag-management page or nav module**
(UX §7/§12.7).

**"Own" = `created_by` (authoritative).** The per-row ownership check is
`row.created_by == current_person.id` — a Member may edit/delete only rows **they created**;
Admin/Owner may edit/delete any. This holds for every entity (events included): ownership follows
the **author of the record**, not `payee_person_id` or any other attribution field (a Member who
is merely the payee of an admin-created event does not gain edit rights). The check is a single
shared helper, not re-implemented per module.

**Hard-delete eligibility (the emptiness scan).** `delete_<e>` hard-deletes **only** when the
entity has zero downstream references; otherwise it returns **409** (the UI then offers archive).
The check is an explicit per-entity dependency scan in the service — a `SELECT COUNT(*)` (or
`EXISTS`) against each table that FKs to this entity — **not** a reliance on a DB FK error:
- `category` → events, budgets, recurring events, child categories referencing `category_id`/`parent_id`
- `account` → financial_events (`source_account_id`/`destination_account_id`), account_snapshots
- `budget`, `formula`, `person`, etc. → their respective referrers
Each entity's `delete_<e>` declares its referrer list; a non-zero count → `409`
(`type="has_dependencies"`). A confirmed-empty delete writes an **INFO log line, not an audit row**
(§4.7, FR-SYS-005). Categories additionally follow the archive-together branch rule (CLAUDE.md §6.6)
rather than hard-delete when they have a subtree.

**Duplicate detection** (Transaction, RecurringPayment, on save). A candidate is: same
`household_id` · same `amount` (±0.01) · same `event_date` (±2 days) · same `category_id` · same
`transaction_type` · same `payee_person_id`. On a hit the UI offers **Proceed** (save independent,
`duplicate_of=null`), **Link** (`duplicate_of=<candidate>`), or **Cancel**. `duplicate_of` is
never auto-resolved — it feeds a post-MVP AI-assisted merge. **Duplicate** as an *operation*
(⋮ menu) clones the row with a new id and cleared date, monetary fields zeroed (§3.5 account
rules), no confirmation.

### 4.11 Global search endpoint — `GET /api/search` (FR-SYS-010)

The backend half of the CommandPalette (UX §8.5). **Read-only, no mutations.**

- **Request:** `GET /api/search?q=<str>&limit=<int, default 8 per group>&person_id=<uuid, optional>`
  — query params only. Household-scoped via `get_household_id` (never trusts a body). `person_id`
  applies the **Individual-mode** member filter; a Member passing another member's id is rejected
  per FR-P-006 (a Member never surfaces others' personal entities).
- **Response** (matches the UX §8.5 grouping and order):
  ```jsonc
  {
    "results": {
      "transactions": [ { "id": "…", "type": "transaction", "label": "…",
                          "sublabel": "amount + date", "colour": "#…" } ],
      "accounts":   [ … ], "categories": [ … ], "currencies": [ … ],
      "budgets":    [ … ], "members":    [ { …, "avatar": "https://…" } ]
    },
    "total": 23
  }
  ```
  Each item: `{ id, type, label, sublabel?, colour? | avatar? }` (members carry `avatar`;
  others carry the entity-type `colour`, §0.1). Each group is capped at `limit`.
- **Ranking:** exact > prefix > substring/fuzzy; tie-break `updated_at` desc; then fixed type
  weight (transactions > accounts > categories > currencies > budgets > members); **archived
  items rank last** (and only appear when relevant). Identical to the UX §8.5 contract.

### 4.12 Visualization architecture (cross-cutting, read-only)

Visualizations are a **first-class architectural concern**, not a Dashboard feature. A
visualization interaction (click a segment, change the period, select a person) applies a
**filter** to the underlying entity queries and can navigate across modules — charts are
interactive view-filters, not static displays.

**`VisualizationFilter` — one app-level object** (Zustand `visualizationStore`, §6.3), not
per-component state; changes propagate to every active visualization at once:

```typescript
interface VisualizationFilter {
  time_range: { start: Date; end: Date;
                preset: 'month'|'quarter'|'year'|'all_time'|'custom' };
  person_ids: UUID[];          // [] = household aggregate
  category_ids: UUID[];        // [] = all; set on segment click
  account_ids: UUID[];         // [] = all
  tag_ids: UUID[];             // [] = no filter; OR semantics — a tx matches if it has ANY listed tag
  currency_mode: 'raw' | 'converted';
  display_currency: ISO4217;   // from Person.display_currency
  transaction_type: 'all' | 'inflow' | 'outflow';
  is_shared_expense: boolean | null;   // null = no filter (debt drill-down sets true)
  comparison_mode: 'persons' | 'categories' | null;   // mutually exclusive w/ single filtering
  comparison_ids: UUID[];
  comparison_group_by: 'category'|'tag'|'month'|'quarter'|'year'|'payment_method' | null;
}
```

**Universal drill-down (the budget pattern §3.7, generalized to every viz):** Level 1 aggregate →
click segment → Level 2 filtered entity list (module view with the filter shown as a dismissible
bar) → click row → Level 3 sub-breakdown (subcategory split or single-entity detail). Navigation
direction is recorded so the browser back button restores the prior filter.

**Backend contract — aggregation endpoints** (distinct from CRUD; pre-aggregated for charts;
all accept `VisualizationFilter` query params; **read-only, no mutations** on these routes;
responses carry **both** raw-currency breakdowns and converted totals so the client switches modes
without a refetch):

```
GET /api/visualizations/spending-by-category
GET /api/visualizations/income-vs-expenses
GET /api/visualizations/net-worth-over-time
GET /api/visualizations/budget-vs-actual
GET /api/visualizations/debt-summary
GET /api/visualizations/forex-loss-trend
GET /api/visualizations/account-balance-history/{account_id}
GET /api/visualizations/asset-valuation-history/{asset_id}
GET /api/visualizations/portfolio-value-over-time
GET /api/visualizations/fx-rate-history/{currency_id}
```

**Comparison** (persons / categories, FR-V-005/006) is **not** a separate route — it is the
`comparison_mode` / `comparison_ids` / `comparison_group_by` fields on the `VisualizationFilter`
above, passed to the relevant endpoint.

**Per-entity visualization contracts** (what each family must support; the UX §9 Viewer renders
them):

| Entity family | Supported visualizations | Drill-down target |
|---|---|---|
| Events — Transaction | spending by category (donut), income vs expenses (grouped bar), volume over time (line), forex loss over time (line) | filtered tx list → tx detail |
| Events — Recurring | upcoming calendar, occurrence history (timeline), missed vs processed (status bar) | recurring detail → linked tx |
| Events — Transfer | transfer flow (sankey / grouped bar by account pair) | transfer detail |
| Accounts — Bank | balance over time (area), inflow vs outflow (stacked bar) | account tx history |
| Accounts — Capital | portfolio value (line), allocation (donut), return vs cost basis (bar), capital history (stacked area) | investment tx history |
| Accounts — Asset | valuation history (line) + depreciation overlay | asset detail → snapshots |
| Accounts — Insurance | premium history (bar), coverage timeline | insurance detail → linked recurring |
| Budgets | budget vs actual (progress/bar), variance over time (line), overspend heatmap, limit-vs-actual trend (line) | contributing tx → subcategory |
| Currencies | spending by currency (stacked bar, raw), aggregate total (bar, converted), forex-loss trend (line) | currency-filtered tx |
| Debt | balance over time (line), by source card-vs-internal (stacked bar), repayment progress | debt-contributing tx → repayments |
| Persons (PersonDashboard) | net worth over time (line), personal vs household split (bar), income sources (donut) | personal filtered module views |
| Comparison — Persons | side-by-side by category (grouped bar), trend over time (multi-line), shared breakdown (stacked bar) | filtered tx for the person |
| Comparison — Categories | trend over time (multi-line), totals (grouped bar), relative share (stacked area %) | filtered tx for the category |

All of the above is surfaced through **one reusable Viewer** (UX §9), not per-module chart
screens; every contextual chart (`MiniSparkline`, Ledger Visualize, dashboard widget) is an entry
point that opens that Viewer seeded with its `VisualizationFilter`.

### 4.13 Naming conventions

Divergence from these is a code-review failure.

| Layer | Convention | Example |
|---|---|---|
| Python model | `PascalCase`, entity prefix | `BankAccount`, `RecurringPayment` |
| Service module | `snake_case` + `_service` | `account_service.py` |
| Route file | `snake_case` plural | `accounts.py`, `events.py` |
| Pydantic schema | `PascalCase` + `Create`/`Update`/`Response` | `TransactionCreate` |
| Database table | `snake_case` plural | `accounts`, `financial_events` |
| Frontend component | `PascalCase` | `AccountCard`, `EntityCard<T>` |
| Frontend hook | `camelCase`, `use` prefix | `useEntityManager` |
| API endpoint | `kebab-case`, resource-oriented | `/api/events/recurring` |
| CSS custom property | `--kebab-case` | `--color-entity-account` |

**Field names cross the wire by case:** Python/DB columns and **API JSON keys** are `snake_case`
(`amount_base`, `account_type`); **TypeScript interfaces** are `camelCase` (`amountBase`). The
boundary conversion is Pydantic's responsibility, not hand-mapped per field.

**Enum values are `snake_case`:** `account_type` (`bank|credit_card|capital|asset|insurance` —
savings is `bank`), `event_type` (`transaction|recurring_payment|transfer`), `transaction_type`
(`inflow|outflow|transfer`), `status` (`active|inactive|archived`), `household_role`
(`owner|admin|member`), `category_type` (`income|expense|both`), `source`
(`manual|csv_import|bank_feed` — recurring provenance is the `linked_recurring_id` FK, not a
source value), `snapshot_source` (`manual|formula|reconciliation|appraisal|import|computed`),
`InvitationStatus`/column `status` (`pending|accepted|declined|expired|revoked`),
`DensityEnum`/column `density` (`comfortable|compact`), `fx_provider_status` (`ok|stale|down`),
`detachment_reason` (`left|removed|household_deleted`, nullable — §3.4/§2.8a).

---

## 5. Infrastructure & Operations

How the application is packaged, configured, deployed, and operated: the container image,
Cloud Run topology, secrets, database operations, scheduled jobs, FX fetch, and backups.

### 5.1 Production topology (decided)

**One Cloud Run service, one container, `min-instances=0 / max-instances=1`, same-origin.**

```
                       ┌──────────────── Cloud Run service (1 instance max) ─────────────┐
Browser ── HTTPS ─────►│  uvicorn / FastAPI                                               │
  (one origin)         │   ├─ /api/*, /auth/*      → routers (§4)                         │
                       │   ├─ /health              → liveness                            │
                       │   └─ /*                   → built SPA static files + index.html │
                       │  SQLite file on EPHEMERAL container disk (WAL)                   │
                       └───────┬───────────────────────────────────────────┬─────────────┘
   Cloud Scheduler (cron) ─────┘ hits /jobs/* HTTP endpoints       GCS bucket ┘ restore-on-start / backup
   Secret Manager ──► env vars                                     (durable DB copies, 90-day)
```

**Why `max-instances=1`:** SQLite is single-writer; a second instance would diverge on its own
ephemeral copy. **Why `min-instances=0`:** true $0 idle (C1). The consequences — cold-start DB
restore and unreliable in-process scheduling — are handled in §5.5 and §5.6.

### 5.2 Container image

**Multi-stage build for same-origin serving:**
1. **Stage 1 (node):** `npm ci && npm run build` in `frontend/` → produces `frontend/dist/`.
2. **Stage 2 (python):** `python:3.12-slim`, install `requirements.txt`, copy `backend/`,
   `COPY --from=stage1 frontend/dist ./frontend_dist`, create non-root `appuser`.
3. **Bind Cloud Run's `$PORT`** (default 8080):
   `CMD uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}`.

### 5.3 Same-origin SPA serving

`main.py` mounts, in this order: API routers (`/auth`, `/api`) and `/health` **first**, then a
**static mount + SPA fallback last** — any unmatched GET returns `frontend_dist/index.html` so
client-side routes (`/login`, `/accounts`, `/join/:token`) resolve. Built assets are served
from `/assets/*`, which is already in the middleware skip-list (§2.11). No CORS is needed —
the browser sees a single origin, matching the CSP (`connect-src 'self'`).

**Dev (two servers).** The same-origin model holds in production because FastAPI serves the built
SPA. In local dev the SPA runs on the Vite dev server (`:5173`) for HMR while the API runs under
`uvicorn` (`:8000`), so Vite must **proxy** the backend route prefixes (`/auth`, `/api`, `/health`,
`/jobs`) to the API server — otherwise the API client's relative-path `fetch`es hit Vite and 404.
This proxy is configured in `frontend/vite.config.ts` (`server.proxy`, target overridable via
`VITE_API_TARGET`, default `http://localhost:8000`); it is the same proxy whose `Set-Cookie`
stripping the dev-bypass `X-Session-Token` path works around (§2.3). Production needs none of this —
one origin, no proxy.

### 5.4 Configuration & secrets *(matrix)*

| Var | Kind | Notes |
|---|---|---|
| `DATABASE_URL` | config | `sqlite+aiosqlite:///./financial_tracker.db` (root file). Postgres only on the SaaS path. |
| `GOOGLE_CLIENT_ID` | config | OAuth client id |
| `GOOGLE_CLIENT_SECRET` | **secret** | → Secret Manager |
| `GOOGLE_REDIRECT_URI` | config | callback URL |
| `SESSION_SECRET` | **secret** | HMAC key; generate per env; → Secret Manager |
| `EXCHANGERATE_API_KEY` | **secret** | FX provider; → Secret Manager |
| `GCS_BUCKET` | config | backup/restore bucket |
| `FRONTEND_URL` | config | callback redirect target |
| `BOOTSTRAP_OWNER_EMAILS` | config | seed list for `approved_owners` (§2.7) |
| `SERVICE_ACCOUNT_KEY` | **secret** | Shared bearer token for `/jobs/*` — **local/manual fallback only**; unset in prod where OIDC is required (§5.6) |
| `JOB_INVOKER_SA` | config | Service-account email the Cloud Scheduler OIDC token must carry (`email` claim), verified by `get_job_auth` (§5.6) |
| `MAINTENANCE_MODE` | config | bool, default `false`. When `true`, a middleware short-circuits **`/api/*` and `/auth/*`** with a **503** RFC-7807 body. The **SPA document routes still serve `index.html`** and `/health` + the static/asset prefixes (§2.11) are **exempt** — so liveness, the static bundle, and the shell all keep loading. The booted SPA's bootstrap `GET /auth/me` gets the 503, which the frontend maps to the **Maintenance** page (§5.8, UX §3). (Document routes are *not* 503'd: if they were, the shell could never boot to render the React Maintenance page — the user would see raw 7807 JSON. Only the data + auth layer 503s.) The maintenance middleware runs just inside `SecurityHeaders` and outside `DevBypass`/`CSRF` (so the 503 still carries the §2.9 headers and no session/DB work runs during maintenance — §2.1 order). |
| `AUTH_BYPASS_ENABLED` | config | dev only; CRITICAL log if true in non-dev |
| `ENV` | config | `development` / `production` |
| `DEBUG` | config | SQL echo + cookie `Secure` toggle |

**Secrets** (`GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `EXCHANGERATE_API_KEY`,
`SERVICE_ACCOUNT_KEY`) come from **Google Secret Manager**, surfaced as env vars by Cloud Run
— never committed, never in the image. Local dev uses `.env` (gitignored); `.env.example`
lists every variable above. `DATABASE_URL` is SQLite at the root path; Postgres is reserved
for the post-MVP SaaS path only.

### 5.5 Database operations

- **Pragmas:** every connection sets `journal_mode=WAL` + `foreign_keys=ON` via a SQLAlchemy
  `connect` event listener.
- **Alembic:** `alembic.ini` lives at the **project root** with
  `sqlalchemy.url = sqlite+aiosqlite:///./financial_tracker.db`, so it resolves to the same
  root DB the app uses. `env.py` prepends the project root to `sys.path` for model imports.
  Canonical command (run from project root, venv active): `alembic upgrade head`.
- **Migrations on deploy (spec):** the container entrypoint runs `alembic upgrade head`
  **before** uvicorn starts, against the (possibly just-restored) root DB.
- **Cold-start restore (spec, FR-SYS-008):** on startup, if the DB file is absent, download the
  latest backup from `GCS_BUCKET` *before* running migrations. **Restore failure handling
  (explicit):**
  - DB file **present** → skip restore (it's a warm restart), proceed to migrations.
  - DB file **absent + a backup object exists** → download it, then migrate.
  - DB file **absent + no backup object exists** (genuine first boot) → start with an empty DB;
    `alembic upgrade head` creates the schema, lifespan seeds run. Log this at `INFO` ("fresh DB").
  - DB file **absent + GCS unreachable / download errors** (network, auth, missing bucket) →
    **fail fast: log `CRITICAL` and exit non-zero.** Do **not** silently boot an empty DB when a
    backup was expected — that would mask data loss. Cloud Run retries the cold start; a transient
    GCS blip self-heals, a persistent one stays loud rather than serving an empty database.
  - Only the **main DB file** is restored. WAL/SHM are process-local and are recreated by SQLite
    on first access — backups never include them (see the checkpoint note below).
- **Backup (spec, FR-SYS-008):** a `/jobs/backup` endpoint (triggered by Cloud Scheduler, §5.6)
  runs **`PRAGMA wal_checkpoint(TRUNCATE)`** (merges all WAL pages into the main file and empties
  the WAL — so the single uploaded file is fully consistent and self-contained) and uploads **only
  the main `financial_tracker.db` file** to GCS; 90-day retention. Because `min-instances=0`, the
  durable copy is the GCS backup — the live file is disposable.
- **SIGTERM backup hook (graceful shutdown).** Cloud Run sends `SIGTERM` before stopping an
  instance. A **FastAPI lifespan shutdown handler** runs the same checkpoint-and-upload as
  `/jobs/backup`, capturing writes made since the last scheduled backup. Constraints: Cloud Run's
  default grace period is short (~10 s) — set the container's `timeoutSeconds`/termination grace
  generously and keep the hook to a single checkpoint + one GCS upload. If the upload fails during
  shutdown, log `CRITICAL` and exit anyway (the instance is going down regardless); the next
  scheduled `/jobs/backup` is the backstop.
- **Honest risk:** writes between the last successful backup and an *ungraceful* stop (OOM, SIGKILL)
  are still lost; mitigate with a short scheduled backup cadence during active use. The SIGTERM hook
  covers graceful shutdowns (deploys, scale-down), not hard kills.

### 5.6 Scheduling

`min-instances=0` means an in-process scheduler does not fire while scaled to zero. **Cloud
Scheduler (managed cron) calls authenticated HTTP job endpoints** on the service; each call wakes
the instance, runs the job, triggers a backup, then the instance scales back down (§1.7).

| Cloud Scheduler cron | Endpoint | Does | FR |
|---|---|---|---|
| daily | `/jobs/fx-refresh` | fetch FX for active/recent currencies; write `fx_rate_history` | FR-CU-006 |
| daily | `/jobs/recurring` | process due recurring occurrences; flag missed | FR-SYS-006 |
| daily | `/jobs/alerts` | **session GC** (delete `expires_at < now()-1 day`, §2.14.F) then budget thresholds, missed recurring, FX-stale, upcoming payments | FR-SYS-007 |
| monthly (00:05) | `/jobs/rollover-snapshots` | budget auto-rollover + monthly `account_snapshot` (computed) | FR-B-005, FR-A-008 |
| daily | `/jobs/backup` | WAL checkpoint + upload to GCS | FR-SYS-008 |

**Job endpoint rules:** idempotent + **catch-up aware** (process everything due since
`last_processed_at`, not just "today") — this is what makes scale-to-zero safe. Never publicly
callable.

**Job auth — `get_job_auth` dependency (OIDC primary, bearer fallback).** `/jobs/*` are guarded
by a dedicated FastAPI dependency, **not** session/CSRF auth (no cookie, no `Person`, no
`household_id`):

1. **OIDC (production).** Cloud Scheduler is configured with an **OIDC token** whose
   `audience = ` the service's own URL and whose service account is `JOB_INVOKER_SA`. The
   dependency reads the `Authorization: Bearer <jwt>`, verifies the **Google-signed** token
   against Google's public JWKS (`https://www.googleapis.com/oauth2/v3/certs`), and checks
   `aud == <service URL>` and `email == JOB_INVOKER_SA`. Verification uses `google-auth`
   (`google.oauth2.id_token.verify_oauth2_token`), with a small clock-skew allowance.
2. **Shared bearer (local / manual trigger).** If `SERVICE_ACCOUNT_KEY` is set and the incoming
   `Authorization: Bearer <token>` equals it (constant-time `hmac.compare_digest`), the request
   is authorized. This path is for local dev and manual `curl` triggers; in production
   `SERVICE_ACCOUNT_KEY` is unset and only OIDC is accepted.
3. Neither present/valid → `401`. The dependency short-circuits before any job logic.

`get_job_auth` does **not** call `validate_session`, set `request.state.auth`, or touch CSRF; the
CSRF middleware already skip-lists `/jobs/*` (§2.4). Config keys (`JOB_INVOKER_SA`,
`SERVICE_ACCOUNT_KEY`) are in the §5.4 matrix.

### 5.7 External-call resilience & FX fetch

All outbound calls use explicit timeouts + a **circuit breaker**. The **FX fetch** is specified
exactly below — the rate math is the single source of truth for currency conversion.

**Provider abstraction (multi-provider, household-configurable).** FX is **not** pinned to one
vendor. A household configures an **ordered list** of providers (UX §5.2 Integrations); the
fetcher is a small interface with pluggable implementations:

```python
class FxProvider(Protocol):
    name: str
    async def fetch_latest(self, base: str, targets: list[str]) -> dict[str, Decimal]: ...      # provider-native rates
    async def fetch_historical(self, date: date, base: str, target: str) -> Decimal: ...        # one rate_to_base
```

Both methods are **`async`** — they perform outbound HTTP via the async `httpx` client (§1.11) on
the async `/jobs/*` request path, so the FX fetch never blocks the event loop. (Implementations do
no CPU-bound work; if a provider's SDK were sync-only it would be wrapped in `asyncio.to_thread`,
§4.9.)

- **`fx_providers` table** (Base, household-scoped): `id, household_id(FK), name, provider_type
  (enum: openexchangerates | …), base_url, api_key_secret_ref (string — a Secret Manager
  resource name, NOT the key), priority(int), is_enabled(bool), last_status(enum ok|stale|down),
  last_checked_at`. Ordered by `priority`. **API keys are never stored in this table or echoed by
  the API** — only the Secret Manager reference is persisted; the value is resolved at fetch time.
- **Fallback chain — resolved *per currency*.** A provider may not list every currency, so the
  chain is walked **independently for each target currency**: for currency X, try providers in
  `priority` order until one returns a usable rate for X; that provider's name is recorded in
  `Currency.rate_source` **and** the `FxRateHistory.source` row for that day. Different currencies
  in the same household may therefore resolve to different providers on the same run. The breaker
  trips **per currency** only when **every** enabled provider fails for that currency (a missing
  symbol counts as a failure for X but does not block other currencies). `provider.fetch_latest`
  returns whatever subset it supports; the fetcher diffs requested-vs-returned and re-requests the
  remainder from the next provider.
- **Reference implementation — Open Exchange Rates:** free tier is **USD-relative** (all
  `rates[...]` are per 1 USD). Key resolved from **Secret Manager** via `api_key_secret_ref` —
  **never hardcoded**.
  - **Daily latest** (`/jobs/fx-refresh`, §5.6): `GET /api/latest.json?app_id=KEY&symbols=<base>,<targets>`.
  - **Historical** (a transaction's `fx_rate_date` / backfill):
    `GET /api/historical/{YYYY-MM-DD}.json?app_id=KEY&symbols=<base>,<target>`.
- **Rate computation — `rate_to_base` for a TARGET currency** (so `amount_base = amount ×
  rate_to_base`, architecture §3.8). Each provider normalizes to this; for a USD-relative provider:
  ```
  rate_to_base = rates[BASE] / rates[TARGET]
  ```
  Both are USD-relative, so the ratio is **target → base** (e.g. 1 NZD → SGD). Persist on
  `Currency.rate_to_base` + write a `FxRateHistory` row for the day.
- **HTTP discipline:** `httpx` with a **10 s timeout** per provider; treat any non-200 as failure;
  tolerate HTTP errors (don't raise into the request path — the job logs and continues).
- **Circuit breaker:** when **every** enabled provider fails for a currency (non-200 / missing or
  incomplete rate / timeout) → **keep the last known rate**, log, **do not retry-storm**. **3
  consecutive daily all-provider failures → `FX_API_DOWN` alert** (FR-CU-006 / FR-SYS-007).
- **Freshness:** update `last_rate_at`; **stale at > 48 h → `FX_RATE_STALE`** (UX §10).

> `rate_source` records the actual winning provider name at fetch time. The same
> timeout/breaker/secret-ref pattern applies to any future external API (incl. post-MVP
> **bank connections**, surfaced greyed-out in UX §5.2).

### 5.8 Public / error-page contract (FR-SYS-001 — backend half)

The backend emits **signals**; the frontend renders the **pages** (the pages themselves are
Phase-3 UX). All error bodies are RFC 7807 JSON (§4.6) — never a stack trace. Mapping:

| Backend signal | Frontend page |
|---|---|
| `GET /health` → 200 | (liveness only) |
| 401 (no/expired/invalid session) | Login |
| OAuth `?error=not_invited` | Not Invited |
| OAuth `?error=removed` (detachment_reason=removed) | Removed from Household |
| OAuth `?error=household_deleted` (detachment_reason=household_deleted) | Household Deleted |
| OAuth `?error=account_archived` (Person.archived, membership intact) | Account Suspended |
| OAuth `?error=oauth_error` | Login (with error notice) |
| 403 (role too low / CSRF invalid) | Forbidden / Access Denied |
| 404 (incl. cross-household) | Not Found |
| 429 | Rate-limited notice |
| fetch fails (connection refused) | Refused Connection / Backend Down |
| session lost mid-use (401 after being in) | Lost Connection → re-login |
| in-flight request pending | Loading |
| uncaught 500 (7807, no trace) | Generic Error |
| 503 (`MAINTENANCE_MODE` on, §5.4) | Maintenance |

### 5.9 Observability

Structured logs to stdout/stderr → Cloud Logging. Event-name keys + `extra={}` context, **no
PII in messages** (§4.9). `/health` for Cloud Run liveness. The dev-bypass-in-prod CRITICAL log
(§2.5) is a deliberate alarm.

### 5.10 CI / security gates (per PRD §4.2)

`ruff` (lint/format) · `pytest` + `pytest-asyncio` + `pytest-cov` (backend) · `vitest` +
Testing Library (frontend) · `eslint` (JS/TS correctness — flat config: no-`any`, import order, rules-of-hooks;
the JS-side complement to the type checker + stylelint) · `stylelint` (CSS — rejects malformed CSS the JS test
suite can't see, e.g. a `*/` that closes a comment early and silently breaks the next `@utility`) · `playwright`
(E2E) · `bandit` (Python security lint) · `pip-audit` (CVE scan) · **OWASP ZAP** on each release — **zero critical
findings required to deploy**. The frontend CI job runs eslint → typecheck → stylelint → vitest → build → bundle-budget.

---

## 6. Frontend Architecture Skeleton

Scope: the **architecture** — data flow, layers, state, routing, guards. The component
*catalog* and design tokens are owned by the UX spec; this section specifies how those
components are wired, not how they look.

> **How they look is the Design Bible.** The rendered, theme-switchable
> `_bmad-output/planning-artifacts/design-bible/index.html` is the visual source of truth for every
> component/screen built here — build against it and diff for parity (UX-spec banner + epics
> frontend DoD). When a build diverges from the rendered prototype, the prototype wins.

### 6.0 Layer model

```
Component (page / entity component)
   │  calls
   ▼
TanStack Query hook  (useQuery/useMutation)  ── server state: cache, refetch, optimistic
   │  calls
   ▼
api/client.ts  (fetch wrapper)  ── CSRF inject, 401 handling, ApiError(7807)
   │  HTTP
   ▼
Backend (§4)

Zustand stores ── CLIENT state only (auth/session, filter state, alerts). NEVER entity data.
```

### 6.1 Bootstrap & providers

`main.tsx` mounts: `StrictMode → QueryClientProvider → BrowserRouter → <App/>` plus a
`<ToastContainer/>` rendered **outside** AppShell (so the toast z-index isn't trapped by a
child stacking context). It wires the API client to the auth store once at startup:
`setAuthStoreGetter(() => useAuthStore.getState())` — this is how `api/client.ts` reads the
CSRF token and calls `clearAuth()` without importing the store (avoids a circular dependency).

### 6.2 HTTP client — `api/client.ts`

A typed `fetch` wrapper (not axios). Single source of HTTP truth:
- **CSRF:** for non-safe methods, injects `X-CSRF-Token` from the auth store (skipped for
  GET/HEAD/OPTIONS and when `skipCsrf` is set, e.g. login).
- **Dev session fallback:** if `sessionStorage['dev_session_token']` is set, sends it as
  `X-Session-Token` (the Vite-proxy-strips-Set-Cookie workaround, §2.3).
- **401 handling:** clears auth and hard-redirects to `/login` (`window.location.href`, a full
  reload to drop all state) — but **not** when already on `/login` (prevents an infinite reload
  loop from `useAuth`'s `fetchMe`).
- **Errors:** throws a typed `ApiError(status, endpoint, message, details)` where `details` is
  the parsed **RFC 7807** body (§4.6) — so error pages can branch on `status` + `type`.
- **Shape:** resolves `{ data, status }`; `204` returns `data: null`.
- Convenience verbs: `api.get/post/put/patch/delete`.

### 6.3 Client state — Zustand

Three stores, **client state only** (CLAUDE.md §8.1):

| Store | Holds |
|---|---|
| `authStore` | current person, household id/name/currency, `csrfToken`, `defaultView`, `pendingInvitation`; `setAuth()` / `clearAuth()` |
| `visualizationStore` | active date range, group-by, entity/currency filter state (drives FR-V) |
| `alertStore` | in-app alert **panel open/closed + toast queue** (UI only — see rule below) |

**Rule:** entity CRUD data never lives in Zustand — that belongs to TanStack Query (§6.4).
`authStore.setAuth()` consumes the exact `/auth/me` shape (§2.14.C); the two move in lockstep.
Likewise `alertStore` holds **only** panel-open and the toast queue: the alert list and
`unread_count` come from TanStack Query polling `GET /api/alerts` (60 s interval +
refetch-on-focus, §3.9) — no alert data is mirrored into Zustand.

### 6.4 Server state — TanStack Query + the generic entity layer

**Intended canonical pattern (CLAUDE.md §8.2):** all server data flows through TanStack Query;
keys follow `['entity-type', filters]`; `api/client.ts` handles auth/CSRF/401 underneath.

**One server-state mechanism.** The generic `useEntityManager<T>` hook is built **on TanStack
Query** (`useQuery`/`useMutation`) — never `useState`/`useEffect` for server data. There is
exactly one server-state path: shared cache, automatic refetch/invalidation, and optimistic
updates all flow through Query, with `api/client.ts` underneath. Every entity hook
(`useCategories`, `usePersons`, …) follows the same pattern.

**Generic entity layer (the "no bespoke CRUD pages" rule, CLAUDE.md §8.3):**

| Piece | Role |
|---|---|
| `useEntityManager<T>` | `items, isLoading, create, update, archive, restore, deletePermanently, duplicate, detectDuplicate, showArchived` |
| `EntityPage<T>` | action bar + filter slot + content slot |
| `EntityCard<T>` | colour-fill identity (calm/vivid), favourite star, context menu, archived state, value-history sparkline |
| `EntityModal<T>` | two-column create/edit form |
| `BulkActionBar` + `useMultiSelect` | multi-select bulk ops (FR-E-020) |

Any new entity feature **extends this layer** — it does not hand-roll a CRUD page.

**Dashboard widget data loading (UX §17).** Each dashboard widget fetches **its own**
read-only data via TanStack Query, keyed `['widget', widget_type, scope, filter]`, against the
existing per-entity **visualization contracts** (`/api/visualizations/...`, §4.12) — the same
read-only aggregation endpoints the Viewer uses. There is **no bespoke widget store and no new
per-widget endpoint**: the query key's inputs are the widget's own `scope`
(`{kind, id?}` from `dashboard_layout`), the `visualizationStore` filter (date range / group-by),
and the topbar context (Household vs member + display currency). Because each widget is an
independent query, the shared cache de-dupes overlapping requests automatically. *(A single batch
endpoint is a post-MVP optimization only — not built for MVP.)*

### 6.5 Routing & auth guards — `App.tsx`

Guarding is done in `App`, not per-route, in this precedence:
1. **`/login`** renders before any gating (so a dev-bypassed user can still switch to real
   OAuth). Shows `ConnectionError` instead if `authError` (backend unreachable).
2. **Loading** (`isLoading`) → centered `Spinner`.
3. **Unauthenticated** (`!currentPerson`) → only `/join/:token` is reachable; everything else
   `Navigate → /login`.
4. **Authenticated but NULL household** (`currentPerson && household == null`, §2.6 step 2) →
   **does not enter the app routes** (a household-scoped page like `/dashboard` would 401). The
   app root renders a **neutral shell that issues no household-scoped queries** and surfaces the
   `PendingInvitationDialog` (no household) or `HouseholdConflictDialog` (already in one,
   §4.4 flow). This is the wired landing state for the NULL-household session — `/auth/me`
   returns `household: null` (§2.8), and the guard branches here before any scoped fetch fires.
5. **Authenticated with a household** → `/design-system` (DEV-only, else `NotFound`),
   `/join/:token`, and all app routes wrapped in `<AppShell>`. `/` redirects to `/dashboard`.
6. `<PendingInvitationDialog>` / `<HouseholdConflictDialog>` render at the app root, outside the
   routes (§2.6 flow, UX §4.3/§4.4) — they can appear over the neutral shell (branch 4) or over
   an in-household view (an invite arriving mid-session).

The whole tree is wrapped in `<ErrorBoundary>`.

### 6.6 Public / error pages — frontend half of FR-SYS-001

Pages exist and map to the §5.8 backend contract: `Login`, `JoinHousehold`, `NotFound`,
`Forbidden`, the `PublicPage` layout, `ErrorBoundary`, and `ConnectionError` (backend
unreachable). The remaining FR-SYS-001 pages (Access Denied, Lost Connection, Logout, Loading,
Generic Error) are completed against the §5.8 mapping in Phase 3 UX, each signed off per the
iterative review gate.

### 6.7 Type safety

**Types** (`types/*.ts`) mirror backend response shapes; **no `any`** — look up the type. The
`/auth/me` payload ↔ `authStore` contract is the canonical example (§2.14.C). The generic entity
layer (`useEntityManager`) is built over TanStack Query `useQuery`/`useMutation` so server state
has one pattern — never `useState` (CLAUDE.md §8.3).

### 6.8 Design-system discipline (pointer)

Tokens live in `index.css` (`@theme`/`@utility`); no raw hex/px/opacity/z-index in components
(P4). Every reusable component has a `/design-system` demo using the **real** exported component.
The authoritative component + token specification is the **UX spec** — this architecture
only specifies *how* components are wired, not their visual contract.

---

## 7. Build Status

All seven parts form one stand-alone, greenfield-buildable specification. Build in order:
Stack (§1) → Auth (§2) → Data (§3) → Backend (§4) → Infra (§5) → Frontend (§6). Each part stands
alone from the prose, schemas, algorithms, and contracts in this document — no existing code is
assumed or required.

The complete schema (including `persons` preference columns, `fx_providers`, `entity_preferences`,
`approved_owners`) ships in the single `0001_initial_schema` migration (§3.12). Cross-cutting
behaviours — the FX provider chain (§5.7), generic multi-select on ledger and CategoryTree
(FR-E-020), global search `GET /api/search` (FR-SYS-010), and branding-config indirection
(FR-SYS-011) — are specified in their respective sections and built with the features that use them.

