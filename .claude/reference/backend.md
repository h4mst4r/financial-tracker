# Backend Reference — Gotchas & API Design

Load this for **any backend story** (API, DB, auth, services). Authoritative source is ARCH §2–§5;
this file is only the patterns agents commonly get wrong plus the API contract rules.

---

## 1. Backend Gotchas (full architecture: ARCH §2–§4)

### 1.1 Always Activate the Venv First

Before running ANY Python command (pytest, uvicorn, alembic, pip):

```
Windows PowerShell:  venv\Scripts\activate
Bash / WSL:          source venv/bin/activate
```

The venv is at `venv/` in the project root. Never run `python` or `pip` without it active.

### 1.2 Run Alembic From the Project Root

**The app uses `./financial_tracker.db` at the project root.** `alembic.ini` lives at the project root with `sqlalchemy.url = sqlite+aiosqlite:///./financial_tracker.db`, so it resolves to that same root DB.

Run `alembic upgrade head` **from the project root** (venv active). Do not add a second `alembic.ini` under `backend/` — there is one Alembic config, at the root (ARCH §3.12, §5.5).

**Squash — DONE at the Epic 4 boundary.** The pre-Epic-5 chain (`0001`–`0008`) was collapsed into one `0001_initial_schema` (dev DB is throwaway sqlite — no backfill had value). **That single revision is now the baseline; do not re-add incremental migrations for pre-Epic-5 schema.** Lesson banked: autogenerate emits only what the **models** declare, so a Python-only `default=` is silently dropped from the DDL — this is what bit `vivid`. `server_default=false()` now lives on the three `vivid` columns in the models (account/currency/budget), so a re-autogenerate stays faithful; column *types* (`reward_rate` Numeric(6,4), `display_currency` String(16)) always survive on their own. If you ever squash again (new epic boundary, still pre-deploy): point `alembic.ini` at a **throwaway temp DB** to autogenerate (don't fight a running `uvicorn`'s file lock on the dev DB), then `ruff format` the generated file and `pytest`. Never squash mid-story or after first deploy.

### 1.3 Model Column Gotchas

**Not all models inherit `BaseEntity`.** `Session` and `HouseholdInvitation` inherit `Base` directly — they have NO `updated_at` column. Use `expires_at` for recency filtering. See ARCH §3.4 for full model schemas.

**`Session` has NO `household_id`.** Session → Person → Household. Join through `person_id`.

**Case-insensitive uniqueness:** Always `func.lower(Model.name) == func.lower(name)` — never Python `.lower()`.

**Account names are deliberately NON-unique — never add a uniqueness check.** Categories and currencies enforce the case-insensitive uniqueness above; **accounts do not, by design.** Two household members legitimately hold the same real-world account (same bank/card), differing only by owner + values — a constraint would force fake names. Duplicate-clone copies the name **verbatim** (no "(Copy)" suffix). Same-name disambiguation is the transaction "Paid with" picker's job (render name + owner + institution), Story 5.1 — not a DB constraint. The 4.1 service already skips the check; don't "fix" it.

**No bare `String()` columns — always `String(N)` or `Text`.** A bare `String` is unbounded `VARCHAR` on Postgres (SQLite ignores length entirely, so the bad value silently persists there). Short / enum-like values → `String(N)` (statuses, STI discriminators like `account_type`/`event_type`, ISO codes); genuine free text → `Text` (notes, descriptions). `BaseEntity.status` is `String(20)`, so every entity inherits a bounded status. The model bound is the storage backstop; the **schema** layer (§2) is what turns an over-long value into a clean 422.

### 1.4 DI Chain

`get_db` → `get_current_person` → `get_household_id`. Service layer always receives `household_id` as first positional arg. **Never** trust request body for household scoping. See ARCH §4.4 for full code.

**The injected `person` is a read-only snapshot — re-`select` it to mutate.** Per ARCH §2.4, the CSRF middleware is the single `validate_session()` caller: it loads `(person, session)` in its **own** session, commits, and closes it *before* the route's `get_db` opens (deliberate — keeps SQLite writes sequential, §2.13). With `expire_on_commit=False` the detached `person` keeps its column values, so **reads are fine** (and most routes only need `person.id` — e.g. `update_household` loads its target fresh). But mutating the injected `person` (`person.x = …; await db.flush()`) **silently no-ops** — it isn't in the route session, and there is **no error**. To change the *current* person (e.g. accept-invite sets `household_id`/`role`; future leave/archive-self), first re-load it on the route `db`: `(await db.execute(select(Person).where(Person.id == person.id))).scalar_one()`, then mutate that row. (Story 2.6a does this in `invitation.accept_invitation`; a shared `get_writable_person` DI dependency should be introduced when 2.7/2.8 add more self-mutating routes.)

### 1.5 Error Responses

Use the typed raisers in `backend/errors.py` — `not_found` / `bad_request` / `conflict` / `forbidden` / `unauthorized` / `has_dependencies` / `duplicate_name` — **never hand-roll** `HTTPException(detail=problem(...))` at a call site. They all emit the canonical RFC 7807 shape (ARCH §4.6); the global handler passes the dict through. A generic 409 is **`errors.conflict(detail)`** (added after two services each reinvented a private `_conflict`). If you need a status with no helper, add one to `errors.py` rather than inlining `problem(...)`.

### 1.6 CSRF

One token per session (not single-use). Frontend sends via `api/client.ts` interceptor — don't reimplement. See ARCH §2.4 for full spec.

### 1.7 Household Deletion → Person Detachment

When a household is deleted, all member `Person` rows survive (`household_id` becomes `NULL`). On re-login, `seed_household_if_needed` checks `can_create_household`: owner gets a new household, members get `NotInvitedError`.

**Do NOT treat "person survives household deletion" as a bug.** It is the designed flow. See ARCH §2.6 for the full truth table.

### 1.8 Category Archiving

Archiving a category with subcategories archives the subcategories **together** with the parent (the whole branch is archived) — per PRD FR-C-005. Do NOT auto-promote children to top-level. Return 200, not 409.

### 1.9 OAuth Callback Flow

`seed_household_if_needed` is called AFTER `get_or_create_person` but BEFORE `create_session`. A pending invitation produces a session with `household_id=NULL` — this is intentional. The frontend shows `PendingInvitationDialog`.

**Do NOT treat "pending invitation + NULL household session" as a bug.** See ARCH §2.6 for the full algorithm.

### 1.10 Dev Auth Bypass

Set `AUTH_BYPASS_ENABLED=true` in `.env` for local dev. Middleware auto-injects a dev session. **NEVER** enable in production. See ARCH §2.5 for full mechanism.

### 1.11 Backend Gate (ruff + bandit + pytest)

Full gate (venv active, from project root): `ruff check .` + `ruff format --check backend` + `pytest -q` +
`bandit -r backend -c pyproject.toml` (bandit exits 1 on any finding).
- **`bandit` suppression is `# nosec`, NOT ruff's `# noqa`** — different tools; `# noqa: S105` does nothing
  for bandit. **B105 (hardcoded_password_string) is trigger-happy:** it flags any string literal whose
  variable name or dict key contains `token`/`password`/`secret` (a URL constant ending `/token`, a
  `{"id_token": "..."}` test stub). Suppress those false positives with `# nosec B105`.
- **FastAPI `Depends`/`Query`/`Path`/`Header` in arg defaults trips ruff B008** (mutable-default false
  positive). `pyproject.toml` allowlists them via `[tool.ruff.lint.flake8-bugbear] extend-immutable-calls`
  — don't re-fight this per file with `# noqa`.

### 1.12 `hmac.compare_digest` on a Request Header — Compare BYTES, Not str

Comparing an attacker-controlled header against a secret: encode to bytes first —
`hmac.compare_digest(request.headers.get(name, "").encode("latin-1"), secret.encode())`. A `str` with
non-ASCII chars raises `TypeError` → unhandled **500 on a security path**. Starlette decodes header values
as latin-1, so bytes `0x80–0xFF` arrive as a non-ASCII str; `.encode("latin-1")` round-trips them safely.
Applies to every header-vs-secret compare (CSRF token, signed-state header, job bearer). **To
regression-test:** `httpx`/`TestClient` reject non-ASCII header values client-side, so drive the ASGI app
directly — build an `http` scope with `"headers": [(b"x-csrf-token", b"\x80\x81bad")]`, a trivial
`receive`/`send`, `await app(scope, receive, send)`, read the `http.response.start` status (see
`backend/tests/test_middleware.py`).

### 1.13 Two Standing Gotchas (SQLite tzinfo; module-level Limiter)

- **SQLite drops tzinfo on read** — `DateTime(timezone=True)` columns round-trip **naive**. Normalize with
  `_as_utc()` before comparing to `datetime.now(UTC)` (the `auth.py` convention). The frontend has the
  mirror of this bug — see frontend.md §3.4 (append `Z` before `new Date()`).
- **The SlowAPI `Limiter` is module-level**, not inside `create_app()` — its decorators apply at import
  time, so it can't be constructed per-app. `main.py` binds it to `app.state.limiter` + a
  `RateLimitExceeded`→429 handler.

### 1.14 Scheduled-Job Harness (`/jobs/*`, `get_job_auth`, shared `create_alert`)

Story 3.7 built the first `/jobs/*` endpoint + `get_job_auth`; `/jobs/recurring` (E6),
`/jobs/rollover-snapshots` (E8), `/jobs/alerts`+`/jobs/backup` (E10) inherit the shape:
- Router-level `dependencies=[Depends(get_job_auth)]`; the job entrypoint **iterates `Household.id`
  itself** (system-scoped — NO session, NO `get_household_id`).
- `get_job_auth`: OIDC (`aud == SERVICE_URL` + `email == job_invoker_sa`), else shared-bearer
  `compare_digest` vs `SERVICE_ACCOUNT_KEY` (compare as bytes — §1.12). Local/test uses the bearer path;
  `SERVICE_URL` is prod-only.
- **All alerts go through the shared `backend/services/alerts.py::create_alert`** — never fork a parallel
  writer. `Alert.created_by` is NOT NULL but a job has no person → resolve the household **owner** as the
  system actor. The `FX_API_DOWN` 3-failure streak is derived from `Currency.last_rate_at` staleness
  (>72 h), not a counter column.

---

## 2. API Design Rules

- All list endpoints return `{"items": [...], "total": N}` — never a bare array
- **Bound every inbound field to its column.** Request schemas (`*Create` / `*Update` / body models) must constrain each `str` / `Decimal` to its backing column via the shared types in `backend/schemas/constraints.py` — `Str3/5/16/20/30/50/64/100/200/320/500`, `NoteText` (Text columns), `Money` (Numeric 15,4), `InterestRate` (8,4), `AnnualFee` (10,2), `Pct` / `RewardRate` (6,4; the latter also `≥0`), and `Hex` for `#RRGGBB` colours. Without this an over-long / over-precise value is a silent store on SQLite or a **500 on Postgres** instead of a clean **422**. **Response schemas read trusted server data (`from_attributes`) and stay unbounded.** If a column width isn't covered, add a new alias to `constraints.py` — never inline a magic `max_length` / `max_digits`.
- Household-scoped queries always `WHERE household_id = :household_id AND is_archived = false` unless `show_archived=true` is passed
- FX stored as `rate_to_base` — the multiplier from the foreign amount to base: `amount_base = amount × rate_to_base` (ARCH §3.8). **Never store the inverse.** The human-readable "1 base = N target" shown in the UI is derived for display only. Rates come from the per-currency provider chain (ARCH §5.7); persist the winning provider in `rate_source`.
- Visualisation endpoints (`/api/visualizations/...`) are read-only, have no mutations, and may return cached/aggregated data — do not add write operations to these routes
- Bulk endpoints, global search (`GET /api/search`), and FX-provider config (`fx_providers`) follow the same household-scoping + RFC 7807 rules. API keys are stored only as Secret Manager references — never returned by any endpoint.
- **FX providers — keys are reference-only.** Store `api_key_secret_ref` (an env *name*); resolve from env at fetch time. No `google-cloud-secret-manager` SDK. GET returns the ref + a computed `key_configured: bool`, never the value. Registry seeds **Frankfurter** (keyless ECB fallback, priority 0, always on) + **Open Exchange Rates** / **ExchangeRate-API** (key-by-ref). Rate math: `rate_to_base = rates[BASE]/rates[TARGET]`; base never fetched (= 1.0). Integrations panel is **owner-only** edit (read-only for admin).
- **`entity_preferences`** (favourite + manual sort, FR-E-021) has a router as of Story 4.12: `GET /api/entity-preferences?entity_type=` → `{items,total}`, `PUT` upsert. The **PUT is a partial MERGE** keyed on `model_dump(exclude_unset=True)` — only fields the client sent apply (a favourite toggle never wipes a stored `sort_order`; `sort_order=None` is a real value, so null-ness can't be the merge signal). Per-**person** scope (`get_current_person`/`get_writable_person`, never the body; `UNIQUE(person_id, entity_type, entity_id)`). The hook also declares `/reorder` but it is **not built** — add it when a drag-reorder surface consumes it.
- **Allowlist any user/owner-controlled string used in a dynamic lookup.** A value from the request body — or an owner-edited config row — that feeds `getattr(obj, value)`, a dispatch dict, a settings read, or an `ast`/eval name MUST be validated against a fixed allowlist *before* the lookup, else it reads arbitrary attributes. This bit FX (`api_key_secret_ref` → `getattr(settings, ref.lower())` could resolve `session_secret` and exfiltrate it; now allowlisted) and **will recur in Epic 7 formula variable-binding** (a formula `Name` → a value source): bind only known names per `applies_to`, reject the rest with 400.
- **Router structure conventions** (every entity router — see `accounts.py` / `categories.py`): static collection routes (`/spending`, `/types`, `/reorder`, `/defaults`, `/merge`) are declared **before** `/{id}` so they aren't captured as an id; provide a symmetric `GET /{id}` single-read alongside the list; build the role gate **once** as a module singleton (`_require_admin = require_role("admin")`) — never inline `require_role(...)` in an arg default (ruff B008); funnel every response through one `_to_response(db, household_id, obj)` so computed fields (`can_delete` / owners / current-value) never drift between the list and single-row routes; keep the standard `/api` prefix + full per-route paths (don't sub-prefix per router).

---

## 3. Testing Conventions

`pytest` (async; no fixture framework beyond pytest's own). Patterns every new test follows — and the anti-patterns the Epic-4 audit removed:

- **Test OUR code, never the framework.** A test that builds a throwaway model + session and asserts `commit` persists / `rollback` discards is testing SQLAlchemy — it passes even if our code is deleted. To cover a dependency like `get_db`, **drive the real one**: monkeypatch its module-global factory and iterate the async generator (`await gen.__anext__()` resumes past the `yield` → commit; `await gen.athrow(...)` → the rollback path). For config, assert the **production** object (`async_session_factory.expire_on_commit`), not a copy you built with the kwarg in the test.
- **Assert state/behaviour, not just the status code.** A 200/201 with no body or DB check is weak. Round-trip it (PUT → GET), assert the persisted value, and for security paths assert the **negative**: cross-household → 404; another person sees `total == 0`; a body-supplied `person_id` is ignored. `test_entity_preferences.py` is the model (merge contract + per-person isolation + body-can't-override-scoping).
- **Masking/serialization tests assert through the real path**, not the helper alone — assert the masked value in `_scalar_snapshot(row)`, not just that `_mask_value(...)` works.
- **Every security fix leaves one regression test** — the smallest thing that fails if the guard is removed (e.g. a disallowed `api_key_secret_ref` → 400).
- **Integration harness** (the repeated `_make_factory` / `_client_with_db` / `_seed_session` / `_auth` blocks): a self-contained temp-DB engine per test (disposed in `finally` — Windows WAL/SHM handle leak), the CSRF middleware pointed at a monkeypatched `async_session_factory`, session cookie + `X-CSRF-Token` on mutations. This boilerplate is duplicated across ~15 files; a shared `conftest`/helper extraction is the **pending tests-cleanup task** — until then, copy the existing pattern, don't invent a new one. **Don't make `_disable_rate_limit` a global autouse fixture** — it would silently disable the rate-limit assertions.
