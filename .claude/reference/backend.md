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

### 1.3 Model Column Gotchas

**Not all models inherit `BaseEntity`.** `Session` and `HouseholdInvitation` inherit `Base` directly — they have NO `updated_at` column. Use `expires_at` for recency filtering. See ARCH §3.4 for full model schemas.

**`Session` has NO `household_id`.** Session → Person → Household. Join through `person_id`.

**Case-insensitive uniqueness:** Always `func.lower(Model.name) == func.lower(name)` — never Python `.lower()`.

### 1.4 DI Chain

`get_db` → `get_current_person` → `get_household_id`. Service layer always receives `household_id` as first positional arg. **Never** trust request body for household scoping. See ARCH §4.4 for full code.

**The injected `person` is a read-only snapshot — re-`select` it to mutate.** Per ARCH §2.4, the CSRF middleware is the single `validate_session()` caller: it loads `(person, session)` in its **own** session, commits, and closes it *before* the route's `get_db` opens (deliberate — keeps SQLite writes sequential, §2.13). With `expire_on_commit=False` the detached `person` keeps its column values, so **reads are fine** (and most routes only need `person.id` — e.g. `update_household` loads its target fresh). But mutating the injected `person` (`person.x = …; await db.flush()`) **silently no-ops** — it isn't in the route session, and there is **no error**. To change the *current* person (e.g. accept-invite sets `household_id`/`role`; future leave/archive-self), first re-load it on the route `db`: `(await db.execute(select(Person).where(Person.id == person.id))).scalar_one()`, then mutate that row. (Story 2.6a does this in `invitation.accept_invitation`; a shared `get_writable_person` DI dependency should be introduced when 2.7/2.8 add more self-mutating routes.)

### 1.5 Error Responses

Use `raise HTTPException(status_code=..., detail={...})` — the global handler formats RFC 7807 Problem Details. See ARCH §4.6 for the canonical format table.

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

---

## 2. API Design Rules

- All list endpoints return `{"items": [...], "total": N}` — never a bare array
- Household-scoped queries always `WHERE household_id = :household_id AND is_archived = false` unless `show_archived=true` is passed
- FX stored as `rate_to_base` — the multiplier from the foreign amount to base: `amount_base = amount × rate_to_base` (ARCH §3.8). **Never store the inverse.** The human-readable "1 base = N target" shown in the UI is derived for display only. Rates come from the per-currency provider chain (ARCH §5.7); persist the winning provider in `rate_source`.
- Visualisation endpoints (`/api/visualizations/...`) are read-only, have no mutations, and may return cached/aggregated data — do not add write operations to these routes
- Bulk endpoints, global search (`GET /api/search`), and FX-provider config (`fx_providers`) follow the same household-scoping + RFC 7807 rules. API keys are stored only as Secret Manager references — never returned by any endpoint.
