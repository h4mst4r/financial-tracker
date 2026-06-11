---
title: Financial Tracker — Architecture
version: 4.0
status: rebuild-in-progress
created: 2026-06-11
authority: >
  The implementation contract for the backend, security model, data model, and
  infrastructure. Where this document describes an existing mechanism, it is
  documented FROM SOURCE — the code is ground truth, not intention. Feature-level
  API contracts (entities, events, visualizations) are deferred to Phase 3 and
  co-designed with the UX specification.
supersedes: architecture-legacy.md (v3, archived 2026-06-11)
---

# Financial Tracker — Architecture (v4 rebuild)

> **Stand-alone, greenfield-buildable spec.** Every section is re-implementable with NO access
> to any existing codebase. `file:line` citations are **provenance only** ("this pattern was
> verified against …") — never the spec itself. The spec *is* the prose, schemas, algorithms,
> and contracts here, which stand alone. Build top-to-bottom in this order:
>
> 1. **Foundational Stack Decisions** — the tech choices everything else assumes
> 2. **Authentication & Security** — auth, sessions, CSRF, approved-owners, scoping
> 3. **Data Model & Schema** — every table, the migration plan
> 4. **Backend Application Architecture** — layering, DI, error contract, audit
> 5. **Infrastructure & Operations** — Cloud Run, secrets, jobs, FX fetch, backups
> 6. **Frontend Architecture Skeleton** — app shell, state, API client
> 7. **Status & cleanup register** — the decided code changes to land with their features
>
> Tags: **(as-built)** = verified against the prior working implementation; **(new)** = a decided
> addition. A v3 of this document is archived at `architecture-legacy.md` for history only — it is
> not part of the build.

---

## 0. Document Conventions & Authority

**This document is a contract, not prose.** Every statement is either:
- **(as-built)** — verified against the **archived reference implementation** (a prior working
  build, now retired). The cited file/line records where the pattern was confirmed; the prose
  here is the spec and stands alone (see provenance note below). Treat these as proven designs to
  re-implement from zero, not as "go read the code."
- **(new)** — a decided addition that was never in the reference build. These carry a one-line
  rationale and are authoritative.

**Scope of this document:** the proven, stable layers — stack, auth, security, data model, backend
layering, infrastructure, frontend skeleton. **Per-feature API request/response contracts**
(entities, events, budgets, currencies, visualizations) are specified **per story in `epics.md`**,
alongside the screen that consumes each one, so data shape and UI are pinned together.

**Citations are provenance, not the spec.** `file.py:line` references record where a
mechanism *currently* lives and how the spec was *verified* against reality. They are
**not** the specification — an agent building from zero has no such files. The
specification is the prose, schemas (DDL), algorithms (numbered steps), and contracts
(request/response shapes) in this document, all of which must stand alone. If a citation
were deleted, the spec must remain fully buildable.

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
- **Known consequence:** writes serialize; the auth sliding-window write (§2.14) and any
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
  Firebase Auth (vendor lock-in, another dependency for a 4-user app); **`authlib`**
  (installed but **unused** — the raw `httpx` + `google-auth` path is simpler and is what
  works; `authlib` should be **removed** from requirements — added to the §2.13 sweep).

### 1.7 Background jobs → **APScheduler (MVP) with an explicit scale-to-zero caveat**

- **Decision:** APScheduler with a persisted job store for MVP (currency refresh, alerts,
  budget rollover, monthly snapshots, backup).
- **Why:** simplest single-process scheduler; no extra infra (C1).
- **Honest caveat (from C1's scale-to-zero):** an in-process scheduler does **not** fire
  while the container is scaled to zero. For MVP single-household use this is acceptable
  (the container is usually warm during waking hours, and jobs are idempotent/catch-up on
  next start). **Post-MVP / reliability:** move triggers to **Cloud Scheduler → HTTP
  endpoint** so jobs fire regardless of instance state. Flagged in the brief's risks and the
  post-MVP doc; the Infrastructure part specifies the catch-up-on-start behaviour that makes
  the MVP version safe.

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
  system and the EDP).

### 1.10 Client state → **Zustand (UI/session state) + TanStack Query (server state)**

- **Decision:** Zustand for `authStore` + visualization filter state; TanStack Query for ALL
  server data (entity CRUD, lists, charts). No entity data in Zustand.
- **Why:** clean split — TanStack owns caching/refetch/optimistic updates; Zustand holds the
  small amount of genuine client state. Matches the generic entity layer (`useEntityManager`).
- **Alternatives rejected:** Redux Toolkit (boilerplate disproportionate to a 4-user app);
  putting server data in Zustand (re-implements caching badly).

### 1.11 Supporting libraries (decided, low-controversy)

`react-router-dom` (routing + guards) · `lucide-react` (icons) · `date-fns` (the
`DD-MM-YYYY` ⇄ ISO display/transport rule, FR-V-010) · `httpx` (server HTTP) ·
`apscheduler` · `slowapi` (per-IP rate limiting). Test/quality: `pytest`/`pytest-asyncio`,
`vitest` + Testing Library, `playwright` (E2E), `ruff` (lint/format), `bandit` +
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
| Jobs | APScheduler → (post-MVP) Cloud Scheduler | C1 + reliability |
| Frontend | React 19 + Vite + strict TS | C6, C7 |
| Styling | Tailwind v4, token-first | C7 |
| State | Zustand + TanStack Query | fit-to-purpose |

---

## 2. Authentication & Security

The authentication subsystem **works today** and is the most-proven part of the system.
The v4 rule for it: document the real mechanism exactly, change only what is explicitly
decided. Section 1.7 (`approved_owners`) is the single decided addition; everything else
is as-built.

### 2.1 Middleware Stack — what actually runs *(as-built)*

Auth and household context are **NOT middleware.** They are resolved by FastAPI
dependencies, per route. The ASGI middleware stack is registered in
[main.py:161-164](backend/main.py:161). Starlette runs middleware LIFO (last registered =
outermost = runs first), so the real execution order is:

```
SecurityHeaders  →  DevBypass  →  CSRF  →  SlowAPI (rate-limit)  →  route handler
                                                                       │
                                          get_current_person ──────────┤  (FastAPI dependency)
                                          get_household_id  ───────────┘  (FastAPI dependency)
```

**Why auth is a dependency, not middleware:** the original design resolved auth in
middleware and stashed it on ASGI `scope["state"]`. State propagation across middleware
layers was unreliable and was a source of bugs. The working design resolves auth inside
`get_current_person`, which does its own DB lookup and does not depend on upstream
middleware having populated scope state ([dependencies.py:45-89](backend/dependencies.py:45)).

> **Decommissioned:** `household_middleware.py` no longer exists. Any doc or comment
> describing an "Auth → Household → CSRF" *middleware* chain is stale.

### 2.2 OAuth Flow *(as-built)*

**Authorization Code flow with a confidential client** (`client_secret`). **Not PKCE** —
PKCE is for public clients that cannot hold a secret; this backend is a confidential
server-side client and uses the secret directly, which is the correct choice.
CSRF protection of the OAuth round-trip is an **HMAC-signed `oauth_state` cookie**
([auth_service.py:75-94](backend/services/auth_service.py:75)).

| Step | Endpoint | Behaviour |
|---|---|---|
| 1 | `GET /auth/login` | Generate random state, HMAC-sign with `SESSION_SECRET`, set `oauth_state` cookie (HttpOnly, SameSite=Lax, 10-min TTL, path `/auth/callback`), 302 → Google. [auth.py:39-60](backend/routes/auth.py:39) |
| 2 | `GET /auth/callback` | Verify signed state == returned state; exchange code (+`client_secret`) for tokens; validate ID token via `google-auth` (audience + signature + expiry, 10s skew); `get_or_create_person`; `seed_household_if_needed`; `create_session`; set `session_id` cookie; 302 → frontend. [auth.py:68-151](backend/routes/auth.py:68) |
| — | failure | Any failure 302 → `{FRONTEND_URL}/login?error=oauth_error` (or `?error=not_invited`). Never a 500 to the user. |

Scopes requested: `openid email profile`. Prompt: `select_account`.
The ID-token audience is validated against `GOOGLE_CLIENT_ID`
([auth_service.py:136-147](backend/services/auth_service.py:136)).

### 2.3 Sessions *(as-built)*

Server-side sessions in the `sessions` table ([person.py:71-97](backend/models/person.py:71)).
The session id is an opaque UUID delivered in a cookie.

- **Cookie:** `session_id`, `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` (off only when
  `DEBUG=true`), `max-age = 30 min`.
- **Sliding idle window:** every validated request slides `last_activity_at = now` and
  `expires_at = now + 30 min`. Idle > 30 min → session rejected
  ([auth_middleware.py:96-104](backend/middleware/auth_middleware.py:96)).
- **Columns:** `id, person_id, created_at, expires_at, last_activity_at, csrf_token
  (unique), ip_address (String(45), IPv6-safe), user_agent`.
- `Session` inherits `Base` directly — **no `household_id`, no audit fields.** To scope a
  session to a household, join `Session → Person → Household` via `person_id`.

**Cookie-over-header resolution:** `get_current_person` and both middlewares read the
session id from the cookie first, then fall back to an `X-Session-Token` header. The
header path exists **only** for the dev-bypass flow (the Vite proxy strips `Set-Cookie`
in local dev). In production the cookie is always used and the header is never sent
([dependencies.py:59-68](backend/dependencies.py:59)).

### 2.4 CSRF *(as-built — design confirmed)*

**One synchronizer token per session, stored on the session row. No rotation.**
Mutating methods (POST/PUT/PATCH/DELETE) require an `X-CSRF-Token` header matching the
session's stored `csrf_token`; safe methods (GET/HEAD/OPTIONS) and skip-listed paths
bypass ([csrf_middleware.py:49-104](backend/middleware/csrf_middleware.py:49)). Expired
sessions are rejected even with a correct token
([csrf_middleware.py:126-131](backend/middleware/csrf_middleware.py:126)).

**Design rationale (decided):** a per-session synchronizer token is the OWASP-endorsed
sufficient defense. Per-request rotation is rejected because it breaks concurrent
requests and multi-tab usage (an in-flight mutation carrying a just-rotated token 403s)
for negligible security gain over the HttpOnly + SameSite=Lax cookie that is the primary
defense. A fresh token is minted only at a trust boundary — i.e. when a new session is
created at login. There is no `X-New-CSRF-Token` response header.

### 2.5 Dev Auth Bypass *(as-built)*

`DevBypassMiddleware` ([auth_middleware.py:155-222](backend/middleware/auth_middleware.py:155))
auto-authenticates **only** when ALL hold: `AUTH_BYPASS_ENABLED=true`, the request is
HTTP from a localhost client (`127.0.0.1`/`::1`/`localhost`), and no session cookie/header
is already present. It then injects a fixed dev session
(`google_sub=dev-bypass-user-001`, `user_agent="dev-bypass"`, 24-hour expiry, exempt from
the 30-min staleness check) and adds `Set-Cookie` + `X-Session-Id` to the response.

- **Inert by default** — does nothing when the flag is false.
- **Fail-safe on flag-off:** `validate_session` actively **rejects** any session whose
  `user_agent == "dev-bypass"` while `AUTH_BYPASS_ENABLED=false`, so a stale dev cookie in
  a browser cannot authenticate after bypass is disabled
  ([auth_middleware.py:90-95](backend/middleware/auth_middleware.py:90)).
- **`POST /auth/dev-login`** returns the same `/auth/me`-shaped payload and `404`s when the
  flag is off ([auth.py:269-322](backend/routes/auth.py:269)).
- `/auth/login`, `/auth/callback`, `/auth/dev-login` are excluded from the bypass
  (they create their own sessions).

> **Production guard:** `create_app` logs `CRITICAL` if `AUTH_BYPASS_ENABLED` is true while
> `ENV != "development"` ([main.py:147-151](backend/main.py:147)).

### 2.6 Identity & Household Seeding *(as-built, except the §2.7 gate)*

`get_or_create_person` ([auth_service.py:155-226](backend/services/auth_service.py:155)):
- Match by `google_sub` (stable, unique). Fallback: case-insensitive email match —
  an **intentional account merge** so a user rotating Google accounts but keeping their
  email lands on their existing `Person` rather than a duplicate.
- New persons are created with a **pre-generated UUID** (`id=uuid4()` in Python, before
  flush) because `seed_household_if_needed` passes `person.id` into
  `Household(created_by=...)` before the person row is inserted.

`seed_household_if_needed` ([auth_service.py:298-341](backend/services/auth_service.py:298))
runs **after** `get_or_create_person` and **before** `create_session`. Priority:

1. `person.household_id` already set → return.
2. **Active pending invitation** for this email exists → return, leaving `household_id`
   NULL. *This is intentional:* the session is created with a NULL household and the
   frontend renders the PendingInvitationDialog. A NULL-household session is **not a bug**.
3. *(v4 gate — see §2.7)* email ∈ active `approved_owners` → create + seed a household,
   `role=owner`.
4. else → raise `NotInvitedError`. The `Person` row is **still persisted** (valid Google
   identity, no rights); no session is created; callback redirects to `?error=not_invited`.

`_create_and_seed_household` creates the `Household` (default `SGD` / `Asia/Singapore`),
flushes (to satisfy the `Household.created_by → persons.id` FK ordering), sets
`person.household_id` + `role=owner`, seeds the base `SGD` `Currency`, and seeds default
categories via `category_service.seed_default_categories`
([auth_service.py:250-290](backend/services/auth_service.py:250)).

### 2.7 Approved Owners *(new — replaces the first-person bootstrap heuristic)*

**Decision:** household-creation rights are governed by an explicit allowlist table, not
by a "first real person wins" heuristic. This removes the fragile `recheck` branch at
[auth_service.py:213-224](backend/services/auth_service.py:213) and provides the
provisioning surface needed for eventual commercialization (one approved row ≈ one
provisioned/paying account).

**Table `approved_owners`:**

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `email` | String(320), **unique, case-insensitive** | enforce via `func.lower(email)` unique index |
| `label` | String, nullable | human note — "Founder", "Customer #1234" |
| `is_active` | Boolean, default `true` | deactivate without deleting (preserves history) |
| `added_by` | UUID, nullable, FK `persons.id` | NULL = system/env-seeded |
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

**Future management surface (reserved, not MVP):** an owner-only `/api/approved-owners`
CRUD endpoint. Until then, the allowlist is managed via `BOOTSTRAP_OWNER_EMAILS` + direct
DB rows.

**Migration impact:** a new Alembic revision adds `approved_owners`; the existing
`can_create_household` column on `persons` is retained (semantics change from "bootstrap
winner" to "approved-email cache"). The bootstrap-count logic in `get_or_create_person`
([auth_service.py:186-224](backend/services/auth_service.py:186)) is removed; new persons
default `can_create_household=False` and the flag is set only by the approved-owners match.

### 2.8 Household Scoping & Roles *(as-built)*

- `get_household_id` returns `person.household_id`, raising 401 if NULL
  ([dependencies.py:96-109](backend/dependencies.py:96)). Services receive `household_id`
  as their first positional argument — **never trust a request body for scoping.**
- `_get_or_404` fetches an entity by PK **and** `household_id`, raising 404 if it belongs
  to another household — cross-household access is impossible at the data layer
  ([dependencies.py:148-180](backend/dependencies.py:148)).
- `require_role(min)` enforces a minimum role against the hierarchy
  `{member:1, admin:2, owner:3}`, 403 below threshold
  ([dependencies.py:116-141](backend/dependencies.py:116)).

### 2.9 Security Headers & CSP *(as-built)*

`SecurityHeadersMiddleware` (pure ASGI, outermost) sets on every response
([main.py:39-81](backend/main.py:39)):

- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`
- **CSP:** `default-src 'self'`; `script-src 'self'`; `style-src 'self' 'unsafe-inline'`
  (required for Tailwind v4's injected CSS); `img-src 'self' data:
  https://lh3.googleusercontent.com` (Google profile pictures); `connect-src 'self'`;
  `frame-ancestors 'none'`; `base-uri 'self'`; `form-action 'self'`.

### 2.10 Rate Limiting *(as-built)*

`slowapi` limiter wired via `app.state.limiter` + `SlowAPIMiddleware`
([main.py:161-167](backend/main.py:161), [limiter.py](backend/limiter.py)). Auth
endpoints carry `@limiter.limit("20/minute")`. `RateLimitExceeded` → `429` with the
standard error envelope.

### 2.11 Public / Skip Paths *(as-built)*

[auth_middleware.py:27-50](backend/middleware/auth_middleware.py:27):
- **Skip prefixes** (bypass all middleware): `/health`, `/static/`, `/assets/`, `/docs/`,
  `/redoc/`, `/openapi.json`.
- **Public auth paths** (no session required): `/auth/login`, `/auth/callback`,
  `/auth/dev-login`. Note `/auth/me` and `/auth/logout` **require** auth.

### 2.12 Invariants & Gotchas — do not "fix" these *(as-built)*

These are correct-by-design and were each a past source of churn:

1. **NULL-household session is valid** — a pending-invitation user gets a session with no
   household so the frontend can show the dialog (§2.6 step 2).
2. **Person survives household deletion** — members' `household_id` becomes NULL; they are
   not deleted. On re-login they re-enter the seed flow (§2.6).
3. **Dev session rejected when bypass off** (§2.5) — intentional fail-safe.
4. **Pre-generated UUIDs before flush** (§2.6) — required for the `created_by` FK ordering.
5. **`commit()` expires attributes** — `validate_session` refreshes both `person` and
   `session` objects after commit so callers can read columns without a live session
   ([auth_middleware.py:113-118](backend/middleware/auth_middleware.py:113)).
6. **Cookie takes priority over header** everywhere (§2.3).

### 2.13 Required Implementation Changes (v4) — atomic with code

These are the **decided** deltas to the as-built auth code. Each must land in the same
commit as its dependent work — do not partially apply.

| # | Change | Why | Atomic with |
|---|---|---|---|
| 1 | **Verify `email_verified`.** In `get_or_create_person`, require `claims.get("email_verified") is True` before trusting the email, and restrict the case-insensitive email-merge fallback to verified emails only. | 🔴 Security. Google ID tokens can carry an unverified email; the merge fallback ([auth_service.py:179-184](backend/services/auth_service.py:179)) turns that into an account-takeover vector. | Standalone — may be done any time; smallest, highest-value fix. |
| 2 | **Add `approved_owners` + `BOOTSTRAP_OWNER_EMAILS` seeding** (§2.7) and **remove** the bootstrap-count + `recheck` logic in `get_or_create_person` ([auth_service.py:186-224](backend/services/auth_service.py:186)). New persons default `can_create_household=False`. | Replaces the fragile first-person heuristic; provisioning surface for commercialization. | Single commit — auth breaks if the bootstrap is removed before the table exists. |
| 3 | **Align CSRF comparison to `hmac.compare_digest`** ([csrf_middleware.py:133](backend/middleware/csrf_middleware.py:133)). | 🟡 Rigor/consistency — OAuth state already uses constant-time compare. Negligible practical risk. | Standalone, trivial. |
| 4 | **Code comments match reality:** the built `main.py` module docstring must state the real middleware order, and any `ARCH §X.Y` comment references use this document's numbering. | Comments must not contradict the real design. | Standalone; trivial. |

### 2.14 Known Scaling Note (not an MVP fix)

The auth path is correct but not optimized; these matter only at multi-tenant SaaS scale,
**not** at household scale, and are deliberately left as-is for MVP:
- Every authenticated request performs a DB **write** (sliding-window update of
  `expires_at`/`last_activity_at`). On SQLite, writes serialize.
- A mutating request looks up the session **twice** in separate connections
  (`CSRFMiddleware._validate_csrf` and `get_current_person → validate_session`).

When scaling: consolidate to a single session lookup per request and throttle the
sliding-window write (e.g. only when `last_activity_at` is older than ~60s).

### 2.15 Stand-Alone Implementation Artifacts

Everything needed to rebuild auth without the source. (Provenance for verification:
`models/person.py`, `services/auth_service.py`, `middleware/auth_middleware.py`,
`routes/auth.py`, `config.py`.)

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

**C. `GET /auth/me` response contract** (also returned verbatim by `POST /auth/dev-login`):

```jsonc
{
  "person": {
    "personId": "uuid", "displayName": "str", "email": "str",
    "role": "owner|admin|member", "pictureUrl": "str|null",
    "defaultView": "household|personal", "displayCurrency": "ISO-4217",
    "canCreateHousehold": true
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
| `BOOTSTRAP_OWNER_EMAILS` *(new, §2.7)* | Seed list for `approved_owners` | — |

> Cleanup note: the **session lifetime is hardcoded** to a 30-min constant in
> `auth_service.py`; the `ACCESS_TOKEN_EXPIRE_MINUTES` setting in `config.py` is currently
> dead. Either wire it through or drop it (added to the §2.13 sweep).

---

## 3. Data Model & Schema

Stand-alone and greenfield-buildable. Provenance for verification: `backend/models/*.py`.
Where a table or column differs from the as-built code, it is tagged **(new)**,
**(changed)**, or **(removed)** and summarised in the delta table at §3.10.

### 3.0 Schema Principles (apply to every table)

1. **UUID primary keys**, application-generated (`uuid4()`), never DB auto-increment.
   Client-generatable IDs keep the future offline/PWA sync path (post-MVP) open.
2. **Household scoping:** every domain table carries `household_id` and every query filters
   on it. The only tables without `household_id` are the cross-cutting/technical ones
   (`sessions`, `fx_rate_history`, `audit_logs`, `approved_owners`) — see §3.3.
3. **Money is `Decimal`**, stored `NUMERIC(15,4)`; FX rates `NUMERIC(10,6)`. No floats, ever.
4. **Soft-delete by default:** `archived` flag + `archived_at`/`archived_by`; hard delete only
   for empty entities (no FK references), which produce no audit row.
5. **Dates** stored/transmitted ISO 8601 (`YYYY-MM-DD`); display `DD-MM-YYYY` is a frontend
   concern (FR-V-010). Timestamps are tz-aware UTC.
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

### 3.2 `MonetaryValueMixin` — the 7-column money block *(+1 new column)*

Mixed into any entity that holds a monetary value (`accounts`, `financial_events`). Pure
column mixin — does not inherit Base.

```sql
currency               VARCHAR(3)    NOT NULL,          -- ISO 4217 of the entered amount
amount                 NUMERIC(15,4) NOT NULL,          -- amount in `currency`
fx_rate                NUMERIC(10,6) NOT NULL,          -- rate used (= "fx_rate_used")
amount_base_calculated NUMERIC(15,4) NOT NULL,          -- system fill: amount × rate (or formula)
amount_base            NUMERIC(15,4) NOT NULL,          -- user-overridable bank-statement figure
fx_delta               NUMERIC(15,4) NULL,              -- auto: amount_base_calculated − amount_base
fee_amount             NUMERIC(15,4) NULL,              -- conversion fee, if any
fx_rate_date           DATE          NULL,   -- (new) the date the rate applies to; immutable
```

**Invariants:**
- `fx_delta` is auto-recomputed whenever `amount_base` is set: `fx_delta =
  amount_base_calculated − amount_base`. Positive = bank charged more than the API rate
  (forex loss). Enforced in the model layer, not by the DB.
- When `currency == base_currency`: `fx_rate = 1`, `fx_delta = 0`, fee fields hidden.
- **(new) `fx_rate_date`** records *which day's* rate produced `fx_rate`/`amount_base_calculated`,
  so the annual FX-cost report (post-MVP) and tax-year export use the historical rate, never
  a recomputed current one (PRD FR-E-009). It pairs with the existing `fx_rate`, which already
  serves as `fx_rate_used` — no separate column for that is needed.

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

### 3.4 Identity & Access tables

**`households`** — `id, name, base_currency(ISO,def SGD), timezone(IANA,def Asia/Singapore),
created_at, created_by(UUID,no FK)`. Base currency is immutable after creation in practice
(changing it triggers a full `amount_base` recompute — FR-CU-005).

**`persons`** (BaseEntity, nullable `household_id`/`created_by`) — adds: `email(320,unique),
display_name, picture_url, role(owner|admin|member), display_currency(ISO,def SGD),
default_view(household|personal), google_sub(unique), last_active_at, can_create_household
(bool)`. **(changed)** `can_create_household` semantics: from "first-person bootstrap winner"
→ "cache of approved-owner match" (§2.7). **(new, Phase 3)** also adds `theme` (str, def `'base'`; per-person theme per FR-P-003)
and `colour` (hex; **fallback** initials-avatar background for payee identity — the Google
`picture_url` avatar is used first when present). **(new, Phase 3 fold-back, all per-person prefs,
FR-P-003 / FR-DB-003):** `font` (str, def `'base'`), `density` (`comfortable|compact`, def
`comfortable`), `reduce_motion` (bool, def false), `notification_prefs` (JSON — per-alert-type
opt-in map, FR-SYS-007), `dashboard_layout` (JSON — `{widget_type, span, order, scope?}[]`,
FR-DB-003). Index: `(household_id, email)`.

**`sessions`** (Base) — see §2.15.A (full DDL there). No `household_id`.

**`household_invitations`** (Base) — `id, household_id, invited_email(320), invited_by(FK
persons), created_at, expires_at, accepted_at, status`. **Status enum (changed/aligned):**
`pending | accepted | declined | revoked | expired`. **Expiry = 7 days** per FR-HH-003
(verify `household_service` sets 7d — the model docstring's "48h" is stale).

**`approved_owners`** **(new)** (Base, global) — full spec in §2.7:
`id, email(320,unique,case-insensitive), label, is_active(def true), added_by(FK persons,null),
created_at, updated_at`. Reserved (not MVP): `plan_tier, billing_ref, expires_at`.

### 3.5 Accounts

**`accounts`** (BaseEntity + MonetaryValueMixin, **STI**, discriminator `account_type` ∈
`bank|credit_card|capital|asset|insurance`).

*Shared columns:* `name, account_type, institution, notes`.
**(new, Phase 3)** `colour` (hex; per-instance brand/identity colour, default = entity-type
colour). *Reserved, post-MVP:* `brand_image_ref` (logo / card art).
**(removed)** `month_year` — superseded by `account_snapshots` (§3.6).
**(new)** ledger-backed only: `opening_balance NUMERIC(15,4) NULL`,
`opening_balance_date DATE NULL` — required for Bank/CreditCard (the anchor for the computed
running balance, §1-data rule from FR-A-008); NULL for asset-like types.

*Subtype columns (all nullable):*

| Subtype | Columns |
|---|---|
| bank | `account_number, interest_rate(8,4), interest_frequency` |
| credit_card | `credit_limit(15,4), billing_day(int), due_day(int), reward_points(int), annual_fee(10,2)` |
| capital | `investment_type, cost_basis(15,4)` — **(removed)** `current_value`; current value derived from latest `account_snapshot` |
| asset | `asset_type, purchase_date, purchase_value(15,4), depreciation_formula_id(FK formulas)` |
| insurance | `policy_type, coverage_types(JSON text), premium_frequency, coverage_amount(15,4), insurer` |

**(new) formula assignment columns** (FR-F-003): keep `depreciation_formula_id` (asset);
**add** `fx_formula_id(FK formulas, null)` for bank/credit_card and `interest_formula_id(FK
formulas, null)` for capital/asset. Index: `(household_id, account_type)`.

> **current_value (resolved):** `accounts.current_value` is **dropped.** Current value for
> asset-like accounts (capital, asset, insurance) = the latest `account_snapshot` by date —
> single source of truth, no drift. `cost_basis` stays (it is the basis, not a current value).

**`account_owners`** (Base junction) — composite PK `(account_id, person_id)`, `is_primary,
added_at`. An account always has ≥1 owner.

**`account_snapshots`** **(changed — generalizes `valuation_records`)** (BaseEntity) — the
universal per-account value series (FR-A-008):
`id, household_id, account_id(FK accounts, INDEX), snapshot_date(DATE), value(15,4),
currency(3), value_base(15,4), source, formula_id(FK formulas, null), note` + BaseEntity audit.
**`source` enum:** `manual | formula | reconciliation | appraisal | import | computed`
(broadened from the old `valuation_records.source`). `import` reserved for bank-feed;
`computed` is what the monthly scheduler writes (FR-SYS-006). Index: `(account_id, snapshot_date)`.

**`recurring_configs`** **(removed)** — account-linked recurring is now a real
`FinancialEvent` (§3.6). The `financial_events` columns `source_entity_type` +
`source_entity_id` already model the link back to the originating account, so **no new
columns** are required; the table is dropped and FR-A-017 creates a recurring-payment event.

### 3.6 Events

**`financial_events`** (BaseEntity + MonetaryValueMixin, **STI**, discriminator `event_type` ∈
`transaction|recurring_payment|transfer`).

*Base event columns:* `name, event_date(INDEX), event_type, account_id(FK accounts, null),
payee, transaction_status(pending|completed|cancelled|reconciled, def completed),
payee_person_id(FK persons), payment_method, category_id(FK categories), transaction_type
(inflow|outflow|transfer), is_shared_expense(bool), notes, is_gst_claimable(bool),
is_gift(bool), source_account_id(FK accounts), linked_recurring_id(FK self)`.
**(new)** `source (manual|csv_import|bank_feed, def manual)`, `external_ref(null)` — provenance
(FR-E-001), bank-feed hook.

*Transaction columns:* `reconciled(bool), reconciled_at, duplicate_of(FK self)`.

*RecurringPayment columns:* `frequency_text, frequency_rule(JSON text), next_occurrence,
recurrence_start_date, recurrence_end_date, source_entity_type
(recurring_payment|capital|asset|insurance), source_entity_id(UUID, polymorphic, no FK),
occurrences_generated(int), last_processed_at`.

*Transfer columns:* `destination_account_id(FK accounts), dest_currency, dest_amount(15,4),
dest_amount_base(15,4), is_debt_repayment(bool), debt_cleared_amount(15,4)`.
**(note)** transfers inherit `fx_rate`, `fx_rate_date`, `fx_delta` from the mixin (FR-E-017's
forex-loss tracking); the destination leg is captured by `dest_*`. A future remittance metric
= `amount_base − dest_amount_base`.

*Constraints/indexes:* CHECK `is_shared_expense=0 OR transaction_type='outflow'`
(`ck_shared_expense_outflow_only`); indexes on `(household_id, event_date)`,
`(household_id, category_id)`, `(household_id, payee_person_id)`,
`(household_id, is_shared_expense, transaction_type)`.

**`occurrence_records`** (Base) — `id, recurring_event_id(FK events, INDEX), expected_date,
occurrence_status(upcoming|processed|skipped|missed|failed), generated_event_id(FK events,
null), processed_at, notes`. **(changed)** add `manual` to the status enum (FR-E-015 manual
trigger). Index: `(recurring_event_id, expected_date)`.

### 3.7 Budgets, Categories

**`budgets`** (BaseEntity) — `name, category_id(FK), owner_person_id(FK, null=household-wide),
period_type(monthly|yearly), limit_currency, limit_amount(15,4), limit_amount_base(15,4),
period_start, period_end, alert_threshold_pct(int, def 80), rollover(bool)`. **No
`actual_spent` column — actuals are always computed at query time** (FR-B-003). Indexes:
`(household_id, period_start, period_end)`, `(category_id, period_start)`.

**`categories`** (BaseEntity) — `name, color(7), icon(50), category_type
(income|expense|both, def expense), parent_id(FK self, ON DELETE SET NULL), depth(int)`.
CHECK `depth <= 1` (max 2 levels). Index: `(household_id, parent_id)`.

### 3.8 Currencies, Formulas

**`currencies`** (Base) — `id, household_id, code(3), name, symbol(5), is_base(bool),
is_display_active(bool), rate_to_base(10,6), fee_pct(6,4), last_rate_at, rate_source`.
**(new, Phase 3)** `colour` (hex, nullable — default derived deterministically from `code`;
overridable). This same colour is the currency's series colour in raw-currency stacked charts
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

**`fx_providers`** **(new, Phase 3 fold-back, FR-CU-010)** (Base, household-scoped) — `id,
household_id(FK), name, provider_type(enum: openexchangerates|…), base_url,
api_key_secret_ref(str — a Secret Manager resource name, NEVER the key), priority(int),
is_enabled(bool, def true), last_status(enum ok|stale|down, null), last_checked_at(null)`.
Ordered by `priority` = the fetch fallback chain (§5.7). **The API key value is never stored
here nor returned by any endpoint** — only the secret reference; GET masks it. Default provider
seeded from `EXCHANGERATE_API_KEY` on first run.

**`formulas`** (BaseEntity) — `name, expression(text), applies_to(str), is_system(bool),
description`. System formulas (`is_system=true`) are seeded and undeletable (FR-F-001).

### 3.9 System tables

**`alerts`** (BaseEntity) **(changed)** — `alert_type, title, body, entity_type(null),
entity_id(UUID, null)`. **Replace** `is_read(bool)` with **`read_at`(null) + `dismissed_at`(null)
timestamps** (FR-SYS-007); "read" = `read_at IS NOT NULL`. **`alert_type` enum aligned to
FR-SYS-007:** `BUDGET_WARNING | BUDGET_EXCEEDED | RECURRING_MISSED | FX_RATE_STALE |
UPCOMING_PAYMENTS | FX_API_DOWN | BACKUP_CREATED`.

**`audit_logs`** (Base, **no FKs by design**) — `id, household_id(UUID), actor_id(UUID),
action(create|update|archive|restore|delete), entity_type, entity_id(UUID),
before_state(JSON text), after_state(JSON text), occurred_at(INDEX), ip_address, user_agent`.
**Append-only:** no UPDATE/DELETE ever (FR-SYS-005). Indexes on `household_id, actor_id,
entity_id, occurred_at`.

**`entity_preferences`** **(new, Phase 3 fold-back, FR-E-021)** (Base) — `id, person_id(FK),
entity_type(str), entity_id(UUID), is_favourite(bool, def false), sort_order(int, null)`.
UNIQUE `(person_id, entity_type, entity_id)`. **Per-person** favourite + manual ordering for any
EntityCard list — one member's arrangement never affects another's. Index `(person_id, entity_type)`.

### 3.10 Delta vs as-built — every change at a glance

| Table | Change | Driver |
|---|---|---|
| `accounts` | **−** `month_year`, **−** `current_value`; **+** `opening_balance`, `opening_balance_date`, `fx_formula_id`, `interest_formula_id`, `colour` (Phase 3) | FR-A-008, FR-F-003 |
| `account_snapshots` | **renamed/generalized** from `valuation_records`; `source` enum broadened (+`import`,`computed`,`reconciliation`); applies to all account types | FR-A-008/014/015 |
| `recurring_configs` | **removed** (account-linked recurring → `FinancialEvent`) | FR-A-017 |
| `financial_events` | **+** `source`, `external_ref` | FR-E-001 |
| monetary mixin | **+** `fx_rate_date` (on `accounts` & `financial_events`) | FR-E-009 |
| `occurrence_records` | **+** `manual` status | FR-E-015 |
| `alerts` | **−** `is_read`; **+** `read_at`, `dismissed_at`; `alert_type` enum aligned | FR-SYS-007 |
| `persons` | `can_create_household` semantics change (cache, not bootstrap); **+** `theme`, `colour`, `font`, `density`, `reduce_motion`, `notification_prefs`, `dashboard_layout` (Phase 3) | §2.7, FR-P-003, FR-DB-003 |
| `currencies` | **+** `colour` (Phase 3; chip + raw-currency chart series) | FR-CU-008 |
| `approved_owners` | **new table** | §2.7 |
| `fx_providers` | **new table** (household FX provider chain; key as Secret Manager ref) | FR-CU-010 |
| `entity_preferences` | **new table** (per-person favourite + manual sort) | FR-E-021 |
| `household_invitations` | status enum aligned (`revoked`), expiry pinned to 7d | FR-HH-003/004 |

### 3.11 Resolved schema decisions

1. **`accounts.current_value` — dropped.** Current value for asset-like accounts derives from
   the latest `account_snapshot`; `cost_basis` retained. (§3.5)
2. **FX direction — `amount_base = amount × rate_to_base`.** Single allowed direction
   everywhere; any inverse is a bug. (§3.8)
3. **Materialized monthly snapshots — confirmed.** The scheduler writes one
   `source=computed` `account_snapshot` per Bank/CreditCard account each month (FR-SYS-006);
   ledger-backed current balance = opening balance + ledger, anchored/corrected by manual
   snapshots; asset-like current value = latest snapshot. (§3.5, §3.6)

### 3.12 Migration plan (Alembic)

Greenfield build = one consolidated `0001_initial_schema` reflecting §3.1–3.9 (no need to
replay the legacy incremental migrations). If instead we evolve the existing DB, the ordered
revisions are: (a) add `approved_owners` + backfill from `BOOTSTRAP_OWNER_EMAILS`; (b)
`accounts`: drop `month_year`, add opening-balance + formula-id columns; (c) rename/expand
`valuation_records` → `account_snapshots`; (d) `financial_events`: add `source`/`external_ref`;
(e) add `fx_rate_date` to `accounts` + `financial_events`; (f) `alerts`: drop `is_read`, add
`read_at`/`dismissed_at`; (g) drop `recurring_configs`; (h) `occurrence_records` status enum.
All run against the **root** DB (`./financial_tracker.db`), per the Alembic-URL gotcha
(Infrastructure part).

---

## 4. Backend Application Architecture

Stand-alone and greenfield-buildable. Provenance: `backend/routes/*.py`,
`backend/services/*.py`, `backend/schemas/*.py`, `backend/dependencies.py`, `backend/main.py`.

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

Consequences (all load-bearing):
- A request is **atomic**: either every mutation + its audit rows commit together, or none do.
- Services call `await db.flush()` (to obtain PKs / order FK inserts) but **never** `commit()`.
  A stray `commit()` in a service breaks atomicity.
- `HTTPException` raised mid-service → propagates → `get_db` rolls back → clean error response.
- **Exception:** session validation (§2.15.B) deliberately uses its **own** short-lived
  connection and commits the sliding-window update independently of the request session. This
  is the one sanctioned second connection (and the §2.14 scaling note).

### 4.4 Dependency-injection seam (the contract between transport and logic)

| Dependency | Returns | Raises |
|---|---|---|
| `get_db` | `AsyncSession` (commit/rollback wrapper) | — |
| `get_current_person` | `Person` (validates session; stashes it on `request.state`) | 401 |
| `get_household_id` | `UUID` (`person.household_id`) | 401 if NULL |
| `require_role("admin")` | `Person` if role ≥ threshold | 403 |
| `_get_or_404(db, hid, id, Model)` | household-scoped entity | 404 (incl. cross-household) |

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

### 4.6 Error contract — RFC 7807 (CANONICAL) *(consistency fix required)*

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
| 404 | entity absent **or in another household** (`_get_or_404`) |
| 409 | conflict — duplicate name, or hard-delete blocked by dependencies |
| 422 | Pydantic validation failure |
| 429 | rate limit exceeded |

> 🟡 **Consistency fix (cleanup list):** the as-built code is **not uniform** — `category_service`
> raises the short envelope `{"error","detail"}` while `merge_categories` and `/auth/me` already
> use full 7807. **Canonical = 7807 everywhere.** All non-conforming `raise HTTPException`
> details must be migrated to the 7807 shape during implementation. (Also: `main.py`'s
> string-detail fallback `{"error","code","detail"}` should emit 7807.)

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
per-row ownership check (Member edits own, Admin/Owner edits any).

### 4.11 Consistency / cleanup items found in Part 4

| Item | Detail | Lands |
|---|---|---|
| **Error format** | Unify all `HTTPException` details to RFC 7807 (§4.6); fix `main.py` string fallback | implementation |
| **Category archive** | `archive_category` auto-promotes children — must change to **archive-together** per FR-C-005 / CLAUDE.md §6.6; the `/categories/tree` + `reassign-children` "promote orphans" behaviour is re-reviewed against the same rule | implementation |
| **`spending-summary` stub** | returns `{"total":0}` placeholder — real impl is Phase-3 feature work | Phase 3 |

---

## 5. Infrastructure & Operations

Mixed maturity — tagged **(as-built)** where code exists and **(spec)** where it must be
built. Provenance: `Dockerfile`, `docker-compose.yml`, `.env.example`, `backend/alembic.ini`,
`backend/migrations/env.py`, `backend/database.py`.

### 5.0 What exists vs what is spec

| Built (as-built) | Not yet built (spec) |
|---|---|
| Backend `Dockerfile` (uvicorn, non-root) · dev `docker-compose` · `.env.example` · `alembic.ini` + `env.py` · WAL/FK pragmas · `/health` | frontend build stage + static serving · Cloud Run config · Secret Manager wiring · scheduler job endpoints · FX fetch + circuit breaker · GCS backup/restore · Cloud Scheduler triggers · CI gates |

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

### 5.2 Container image *(as-built backend + new frontend stage)*

As-built: `python:3.12-slim`, install `requirements.txt`, copy `backend/`, create non-root
`appuser`, `CMD uvicorn backend.main:app --host 0.0.0.0 --port 8000`.

**(new) Multi-stage build for same-origin serving:**
1. **Stage 1 (node):** `npm ci && npm run build` in `frontend/` → produces `frontend/dist/`.
2. **Stage 2 (python):** as today, plus `COPY --from=stage1 frontend/dist ./frontend_dist`.
3. **(fix)** Cloud Run injects `$PORT` (default 8080). The CMD must bind it:
   `uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}`. The current hardcoded 8000
   is a cleanup item.

### 5.3 Same-origin SPA serving *(spec)*

`main.py` mounts, in this order: API routers (`/auth`, `/api`) and `/health` **first**, then a
**static mount + SPA fallback last** — any unmatched GET returns `frontend_dist/index.html` so
client-side routes (`/login`, `/accounts`, `/join/:token`) resolve. Built assets are served
from `/assets/*`, which is already in the middleware skip-list (§2.11). No CORS is needed —
the browser sees a single origin, matching the CSP (`connect-src 'self'`).

### 5.4 Configuration & secrets *(matrix)*

| Var | Kind | Notes |
|---|---|---|
| `DATABASE_URL` | config | `sqlite+aiosqlite:///./financial_tracker.db` (root file). Postgres only on the SaaS path. |
| `GOOGLE_CLIENT_ID` | config | OAuth client id |
| `GOOGLE_CLIENT_SECRET` | **secret** | → Secret Manager |
| `GOOGLE_REDIRECT_URI` | config | **(missing from `.env.example` — add)** |
| `SESSION_SECRET` | **secret** | HMAC key; generate per env; → Secret Manager |
| `EXCHANGERATE_API_KEY` | **secret** | FX provider; → Secret Manager |
| `GCS_BUCKET` | config | backup/restore bucket |
| `FRONTEND_URL` | config | callback redirect target **(add to `.env.example`)** |
| `BOOTSTRAP_OWNER_EMAILS` | config | **(new, §2.7)** seed list **(add to `.env.example`)** |
| `AUTH_BYPASS_ENABLED` | config | dev only; CRITICAL log if true in non-dev |
| `ENV` | config | `development` / `production` |
| `DEBUG` | config | SQL echo + cookie `Secure` toggle |
| ~~`ACCESS_TOKEN_EXPIRE_MINUTES`~~ | dead | wire-or-drop (§2.15 cleanup) |

**Secrets** (`GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `EXCHANGERATE_API_KEY`) come from
**Google Secret Manager**, surfaced as env vars by Cloud Run — never committed, never in the
image. Local dev uses `.env` (gitignored). **Cleanup:** `.env.example` is missing the three
vars marked above and its `DATABASE_URL` prod comment wrongly suggests Postgres as the default.

### 5.5 Database operations

- **Pragmas (as-built):** every connection sets `journal_mode=WAL` + `foreign_keys=ON`
  ([database.py:27-33](backend/database.py:27)).
- **Alembic root-DB gotcha (as-built — do not trip on this):** `alembic.ini` lives in
  `backend/` and its `sqlalchemy.url` resolves `./financial_tracker.db` **relative to
  `backend/`** — a *different* file from the app's root `./financial_tracker.db`. `env.py`
  prepends the project root to `sys.path` for model imports, but the **URL must be overridden**
  to the root DB on every Alembic run. Canonical command (run from project root, venv active):
  `alembic -c backend/alembic.ini -x db_url=sqlite+aiosqlite:///./financial_tracker.db upgrade head`
  (env.py reads the `-x db_url` override; if not yet wired, set `sqlalchemy.url` to an absolute
  root path). **Cleanup:** make `env.py` prefer `DATABASE_URL`/`-x db_url` so this is automatic.
- **Migrations on deploy (spec):** the container entrypoint runs `alembic upgrade head`
  **before** uvicorn starts, against the (possibly just-restored) root DB.
- **Cold-start restore (spec, FR-SYS-008):** on startup, if the DB file is absent, download the
  latest backup from `GCS_BUCKET` *before* running migrations.
- **Backup (spec, FR-SYS-008):** a `/jobs/backup` endpoint (triggered by Cloud Scheduler, §5.6)
  performs a WAL checkpoint and uploads the file to GCS; 90-day retention. Because
  `min-instances=0`, the durable copy is the GCS backup — the live file is disposable. **Honest
  risk:** writes between the last backup and an ungraceful stop are lost; mitigate with a
  short backup cadence during active use and a SIGTERM backup hook on graceful shutdown.

### 5.6 Scheduling *(spec — supersedes "APScheduler persisted job store")*

`min-instances=0` means an in-process scheduler does not fire while scaled to zero. **Decision:
Cloud Scheduler (managed cron) calls authenticated HTTP job endpoints** on the service; each
call wakes the instance, runs the job, triggers a backup, then the instance scales back down.

| Cloud Scheduler cron | Endpoint | Does | FR |
|---|---|---|---|
| daily | `/jobs/fx-refresh` | fetch FX for active/recent currencies; write `fx_rate_history` | FR-CU-006 |
| daily | `/jobs/recurring` | process due recurring occurrences; flag missed | FR-SYS-006 |
| daily | `/jobs/alerts` | budget thresholds, missed recurring, FX-stale, upcoming payments | FR-SYS-007 |
| monthly (00:05) | `/jobs/rollover-snapshots` | budget auto-rollover + monthly `account_snapshot` (computed) | FR-B-005, FR-A-008 |
| daily | `/jobs/backup` | WAL checkpoint + upload to GCS | FR-SYS-008 |

**Job endpoint rules:** idempotent + **catch-up aware** (process everything due since
`last_processed_at`, not just "today") — this is what makes scale-to-zero safe. Protected by
Cloud Scheduler OIDC auth (or a shared secret header); never publicly callable. APScheduler may
still be registered for local/warm convenience, but Cloud Scheduler is the source of truth.

> **PRD reconciliation:** FR-SYS-006's "persisted SQLAlchemy job store / survives restarts"
> wording is superseded by this Cloud-Scheduler model and is updated accordingly.

### 5.7 External-call resilience & FX fetch *(spec — grounded in v1)*

All outbound calls use explicit timeouts + a **circuit breaker**. The **FX fetch** is specified
exactly (it was a v1 pain point; the rate math below matches the working v1 implementation).

**Provider abstraction (multi-provider, household-configurable).** FX is **not** pinned to one
vendor. A household configures an **ordered list** of providers (UX §5.2 Integrations); the
fetcher is a small interface with pluggable implementations:

```python
class FxProvider(Protocol):
    name: str
    def fetch_latest(self, base: str, targets: list[str]) -> dict[str, Decimal]: ...      # provider-native rates
    def fetch_historical(self, date: date, base: str, target: str) -> Decimal: ...        # one rate_to_base
```

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
  **never hardcoded** (the v1 hardcoded it; do not).
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

> The legacy `rate_source = "ExchangeRate-API"` string is reconciled to the actual provider name
> at fetch time. The same timeout/breaker/secret-ref pattern applies to any future external API
> (incl. post-MVP **bank connections**, surfaced greyed-out in UX §5.2).

### 5.8 Public / error-page contract (FR-SYS-001 — backend half)

The backend emits **signals**; the frontend renders the **pages** (the pages themselves are
Phase-3 UX). All error bodies are RFC 7807 JSON (§4.6) — never a stack trace. Mapping:

| Backend signal | Frontend page |
|---|---|
| `GET /health` → 200 | (liveness only) |
| 401 (no/expired/invalid session) | Login |
| OAuth `?error=not_invited` | Not Invited |
| OAuth `?error=oauth_error` | Login (with error notice) |
| 403 (role too low / CSRF invalid) | Forbidden / Access Denied |
| 404 (incl. cross-household) | Not Found |
| 429 | Rate-limited notice |
| fetch fails (connection refused) | Refused Connection / Backend Down |
| session lost mid-use (401 after being in) | Lost Connection → re-login |
| in-flight request pending | Loading |
| uncaught 500 (7807, no trace) | Generic Error |

### 5.9 Observability *(as-built pattern, extend)*

Structured logs to stdout/stderr → Cloud Logging. Event-name keys + `extra={}` context, **no
PII in messages** (§4.9). `/health` for Cloud Run liveness. The dev-bypass-in-prod CRITICAL log
(§2.5) is a deliberate alarm.

### 5.10 CI / security gates (per PRD §4.2) *(spec)*

`ruff` (lint/format) · `pytest` + `pytest-asyncio` + `pytest-cov` (backend) · `vitest` +
Testing Library (frontend) · `playwright` (E2E) · `bandit` (Python security lint) · `pip-audit`
(CVE scan) · **OWASP ZAP** on each release — **zero critical findings required to deploy**.

### 5.11 Cleanup items found in Part 5

| Item | Detail | Lands |
|---|---|---|
| `$PORT` | CMD hardcodes 8000; Cloud Run sets `$PORT` (8080) — bind `${PORT:-8000}` | implementation |
| Frontend stage | add node build stage + `dist` copy; mount StaticFiles + SPA fallback in `main.py` | implementation |
| `.env.example` | add `GOOGLE_REDIRECT_URI`, `FRONTEND_URL`, `BOOTSTRAP_OWNER_EMAILS`; fix `DATABASE_URL` prod note; drop/realign `ACCESS_TOKEN_EXPIRE_MINUTES` | implementation |
| Alembic URL | make `env.py` prefer `DATABASE_URL`/`-x db_url` so the root-DB override is automatic | implementation |
| FR-SYS-006 | PRD wording updated to Cloud-Scheduler model (done in this pass) | PRD edit |

---

## 6. Frontend Architecture Skeleton

Scope: the **architecture** — data flow, layers, state, routing, guards. The component
*catalog* and design tokens are owned by the UX spec / EDP and locked in Phase 3; this section
specifies how those components are wired, not how they look. Provenance: `frontend/src/main.tsx`,
`App.tsx`, `api/client.ts`, `store/*.ts`, `hooks/useEntityManager.ts`, `components/entity/*`.

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

### 6.1 Bootstrap & providers *(as-built)*

`main.tsx` mounts: `StrictMode → QueryClientProvider → BrowserRouter → <App/>` plus a
`<ToastContainer/>` rendered **outside** AppShell (so the toast z-index isn't trapped by a
child stacking context). It wires the API client to the auth store once at startup:
`setAuthStoreGetter(() => useAuthStore.getState())` — this is how `api/client.ts` reads the
CSRF token and calls `clearAuth()` without importing the store (avoids a circular dependency).

### 6.2 HTTP client *(as-built)* — `api/client.ts`

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

### 6.3 Client state — Zustand *(as-built)*

Three stores, **client state only** (CLAUDE.md §8.1):

| Store | Holds |
|---|---|
| `authStore` | current person, household id/name/currency, `csrfToken`, `defaultView`, `pendingInvitation`; `setAuth()` / `clearAuth()` |
| `visualizationStore` | active date range, group-by, entity/currency filter state (drives FR-V) |
| `alertStore` | in-app alert panel state |

**Rule:** entity CRUD data never lives in Zustand — that belongs to TanStack Query (§6.4).
`authStore.setAuth()` consumes the exact `/auth/me` shape (§2.15.C); the two move in lockstep.

### 6.4 Server state — TanStack Query + the generic entity layer

**Intended canonical pattern (CLAUDE.md §8.2):** all server data flows through TanStack Query;
keys follow `['entity-type', filters]`; `api/client.ts` handles auth/CSRF/401 underneath.

**(inconsistency — must reconcile, see §6.7):** the generic `useEntityManager<T>` hook is
currently implemented on **`useState`/`useEffect`**, not TanStack Query — it holds `items` in
local component state and mutates the array by hand, while `useCategories`/`usePersons` use
TanStack Query. Two competing patterns. **Decision: the generic entity layer is rebuilt on
TanStack Query** so there is exactly one server-state mechanism (shared cache, automatic
refetch/invalidation, optimistic updates). This is a frontend-rebuild task, flagged in §6.7.

**Generic entity layer (the "no bespoke CRUD pages" rule, CLAUDE.md §8.3):**

| Piece | Role |
|---|---|
| `useEntityManager<T>` | `items, isLoading, create, update, archive, restore, deletePermanently, duplicate, detectDuplicate, showArchived` |
| `EntityPage<T>` | action bar + filter slot + content slot |
| `EntityCard<T>` | accent bar, context menu, archived state |
| `EntityModal<T>` | two-column create/edit form |
| `BulkActionBar` + `useMultiSelect` | multi-select bulk ops (backs the v3.1 FR-E-020 bulk-edit) |

Any new entity feature **extends this layer** — it does not hand-roll a CRUD page.

### 6.5 Routing & auth guards *(as-built)* — `App.tsx`

Guarding is done in `App`, not per-route, in this precedence:
1. **`/login`** renders before any gating (so a dev-bypassed user can still switch to real
   OAuth). Shows `ConnectionError` instead if `authError` (backend unreachable).
2. **Loading** (`isLoading`) → centered `Spinner`.
3. **Unauthenticated** (`!currentPerson`) → only `/join/:token` is reachable; everything else
   `Navigate → /login`.
4. **Authenticated** → `/design-system` (DEV-only, else `NotFound`), `/join/:token`, and all
   app routes wrapped in `<AppShell>`. `/` redirects to `/dashboard`.
5. `<PendingInvitationDialog>` renders at the app root, outside the routes (§2.6 flow).

The whole tree is wrapped in `<ErrorBoundary>`.

### 6.6 Public / error pages — frontend half of FR-SYS-001 *(as-built, extend in Phase 3)*

Pages exist and map to the §5.8 backend contract: `Login`, `JoinHousehold`, `NotFound`,
`Forbidden`, the `PublicPage` layout, `ErrorBoundary`, and `ConnectionError` (backend
unreachable). The remaining FR-SYS-001 pages (Access Denied, Lost Connection, Logout, Loading,
Generic Error) are completed against the §5.8 mapping in Phase 3 UX, each signed off per the
iterative review gate.

### 6.7 Type safety & inconsistencies found

- **Types** (`types/*.ts`) mirror backend response shapes; **no `any`** (look up the type). The
  `/auth/me` payload ↔ `authStore` contract is the canonical example (§2.15.C).
- **Inconsistencies / rebuild tasks:**

| Item | Detail | Lands |
|---|---|---|
| **Generic layer on TanStack Query** | rebuild `useEntityManager` over `useQuery`/`useMutation` so server state has one pattern (not `useState`) | frontend rebuild |
| **Component catalog vs spec** | the existing `components/ui/*` are reconciled against the Phase-3 UX spec + EDP before being treated as canonical (P0: no unauthorized UI) | Phase 3 |
| **CategoryTree** | re-validated against the Phase-3 UX spec with sign-off (the design-ambiguity failure mode) | Phase 3 |

### 6.8 Design-system discipline (pointer)

Tokens live in `index.css` (`@theme`/`@utility`); no raw hex/px/opacity/z-index in components
(P4). Every reusable component has a `/design-system` demo using the **real** exported component.
The authoritative component + token specification is the **UX spec / EDP**, produced in Phase 3
with per-element sign-off — this architecture only fixes *how* components are wired, not their
visual contract.

---

## 7. Build Status & Implementation-Cleanup Register

All seven sections are complete and ordered for a stand-alone, greenfield build (Stack → Auth →
Data → Backend → Infra → Frontend). The one register below collects the decided code changes that
must land **atomically with the features that need them** during the build:

- **Implementation cleanup register** (consolidated from §2.13, §3.10, §4.11, §5.11, §6.7) —
  the decided code changes that land atomically with their features: `email_verified`,
  `approved_owners` + bootstrap removal, `compare_digest`, RFC 7807 error unification, category
  archive-together, drop `recurring_configs` / `current_value` / `month_year` / `is_read`, add
  the v3.1 columns, `$PORT`, frontend build stage, `.env.example` vars, Alembic URL auto-resolve,
  generic layer on TanStack Query.
- **Phase-3 fold-back additions** (new schema + endpoints to include in the initial build, so the
  greenfield migration & API are complete):
  - **Columns** on `persons`: `font, density, reduce_motion, notification_prefs(JSON),
    dashboard_layout(JSON)` (FR-P-003 / FR-DB-003) — into `0001_initial_schema`.
  - **New tables** `fx_providers` (FR-CU-010) and `entity_preferences` (FR-E-021) — into
    `0001_initial_schema`; both household/person-scoped per §3.
  - **FX = provider chain** (§5.7): refactor the fetcher to walk the ordered `fx_providers`
    (fallback chain), resolve each key from **Secret Manager via `api_key_secret_ref`** (never
    plaintext, never echoed by the API), breaker trips only when **all** providers fail. Seed a
    default provider from `EXCHANGERATE_API_KEY` on first run.
  - **Generic multi-select** (`useMultiSelect` + BulkActionBar) wired on ledger **and**
    CategoryTree (FR-E-020), not events-only.
  - **`GET /api/search`** global search/command-palette endpoint (FR-SYS-010) — grouped,
    household-scoped, member-permission-aware.
  - **Branding config** indirection — no hardcoded brand strings/assets (FR-SYS-011, UX §1.1).

These are tracked here so nothing is lost between planning and implementation.

<!-- ARCHITECTURE SPEC COMPLETE — sections ordered, numbering final. -->

