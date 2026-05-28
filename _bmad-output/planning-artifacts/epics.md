---
title: Financial Tracker — Epics & Stories
version: 3.0
status: living
created: 2026-05-28
authority: Implementation plan. Derives from entity-design-philosophy.md [EDP],
           architecture.md [ARCH], prd.md [PRD], ux-design-specification.md [UX].
           Stories 1-1 through 2-5 from the previous attempt inform lessons learned
           but are NOT carried forward — this is a clean-repo start.
---

# Financial Tracker — Epics & Stories

---

## 0. How to Use This Document

Each story is a **single, bounded implementation task**. Work through stories in
dependency order. Never start a story unless all `Depends on` stories are complete.

**Story format:**
- **ID**: Unique identifier — reference in commits and PRs
- **Size**: XS (<80 lines) · S (<200 lines) · M (<400 lines) · L (<600 lines)
- **Depends on**: Story IDs that must be complete first
- **FRs**: Requirements being satisfied (references to `prd.md`)
- **Files**: Exact files to create (`+`) or modify (`~`). Read these before writing.
- **AC**: Acceptance criteria — all must pass before story is done
- **Notes**: Implementation guidance; reference to spec sections

**Before starting any story:**
1. Read the referenced spec sections in EDP, ARCH, PRD, or UX
2. Confirm all `Depends on` stories are merged and tests are green
3. Run the existing test suite — it must be green before you start

**Definition of Done:**
- [ ] All AC checked off
- [ ] Unit and/or integration tests written and passing
- [ ] No new linting errors
- [ ] PR description references this story ID

**Lessons from previous attempt (stories 1-1 → 2-5):**
- Use `func.lower()` for all case-insensitive name uniqueness checks in SQLite
- Session sliding window uses `last_activity_at`; CSRF token uses `used: bool` (not datetime)
- CSRF middleware does not single-use tokens — one token is valid for its lifetime
- Archiving a category auto-promotes its children to top-level (`parent_id = NULL`) — do not return 409
- `CategorySelect.tsx` belongs in the transactions epic, not the categories epic
- Default categories are seeded as household-owned records at household creation, not at app startup
- The `depth` column (0/1) on `Category` is simpler than walking the parent chain for depth checks

---

## Epic 1 — Backend Foundation ✅ COMPLETE

**Purpose:** Establish the complete backend scaffold: all SQLAlchemy models, Alembic
migration, FastAPI app factory, middleware stack, and dependency injection. Every
subsequent epic builds on this foundation without modifying its shared infrastructure.

**Pre-conditions:** Clean repo. Python 3.12+, Docker installed.

**Post-conditions:** `alembic upgrade head` creates all tables. `uvicorn backend.main:app`
starts without errors. All models importable. Middleware stack wired. No feature routes yet.

**Completed:** 2026-05-28 · All 8 stories done · Retrospective complete

---

### BE-001 — Python project scaffold and config ✅ DONE

**Size:** XS · **Depends on:** — · **FRs:** — · **Ref:** ARCH §1.1, §3.1

**Files:**
```
+ backend/main.py
+ backend/config.py
+ backend/database.py
+ requirements.txt
+ .env.example
+ Dockerfile
+ docker-compose.yml
```

**AC:**
- [ ] `requirements.txt` pins all versions from ARCH §1.1 (FastAPI, SQLAlchemy 2.0, Pydantic 2, Alembic, Authlib, httpx, APScheduler, pytest)
- [ ] `config.py` uses `pydantic-settings`; reads `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `EXCHANGERATE_API_KEY`, `GCS_BUCKET`; all required in prod, have defaults for dev
- [ ] `database.py` creates async SQLAlchemy engine; sets `PRAGMA journal_mode=WAL` and `PRAGMA foreign_keys=ON` via `connect_args`; exports `async_session_factory` and `get_db` async generator
- [ ] `main.py` is a FastAPI app factory (`create_app()`); returns app without starting it; `uvicorn backend.main:app --reload` starts without error
- [ ] `Dockerfile` builds a single container serving both API and (future) static frontend; `docker-compose.yml` provides a working local dev environment

---

### BE-002 — BaseEntity, MonetaryValueMixin, and shared enums ✅ DONE

**Size:** S · **Depends on:** BE-001 · **FRs:** — · **Ref:** ARCH §4.2, §4.3, EDP §3.1, §3.2, §3.4

**Files:**
```
+ backend/models/__init__.py
+ backend/models/base.py
```

**AC:**
- [ ] `BaseEntity` abstract SQLAlchemy 2.0 class with all 10 fields from EDP §3.1: `id` (UUID PK), `household_id` (FK households, indexed), `created_at`, `updated_at`, `created_by` (FK persons), `updated_by` (FK persons, nullable), `archived` (bool, indexed), `archived_at` (nullable), `archived_by` (FK persons, nullable), `status` (str, indexed, default `"active"`)
- [ ] `MonetaryValueMixin` adds all 7 fields from EDP §3.2 as inline columns; `@validates("amount_base")` auto-recomputes `fx_delta = amount_base_calculated - amount_base`
- [ ] `StatusEnum` string values: `"active"`, `"inactive"`, `"archived"`
- [ ] `Household` uses `Base` (not `BaseEntity`) — it is a bootstrap entity with no `household_id` FK
- [ ] `pytest` imports `backend.models.base` without error; `MonetaryValueMixin` unit test: setting `amount_base` triggers correct `fx_delta` recomputation

---

### BE-003 — Household, Person, Session, and Invitation models ✅ DONE

**Size:** S · **Depends on:** BE-002 · **FRs:** FR-HH-001, FR-P-001 · **Ref:** ARCH §4.4
**Completed:** 2026-05-28 · **Tests:** 5/5 passing

**Files:**
```
+ backend/models/household.py
+ backend/models/person.py
~ backend/models/__init__.py
```

**AC:**
- [x] `Household` model with fields: `id`, `name`, `base_currency` (default `"SGD"`), `timezone` (default `"Asia/Singapore"`), `created_at`, `created_by` (UUID, no FK — bootstrap)
- [x] `Person` extends `BaseEntity`; fields: `email` (unique, indexed), `display_name`, `picture_url` (nullable), `role` (str, default `"member"`; values: `"owner"` / `"admin"` / `"member"`), `display_currency` (default `"SGD"`), `default_view` (default `"household"`; values: `"household"` / `"personal"`), `google_sub` (unique, indexed), `last_active_at` (nullable); compound index `(household_id, email)`
- [x] `Session` model (not `BaseEntity`): `id` (UUID PK), `person_id` (FK persons), `created_at`, `expires_at`, `last_activity_at`, `csrf_token` (str, unique), `ip_address` (nullable), `user_agent` (nullable)
- [x] `HouseholdInvitation` model (not `BaseEntity`): `id`, `household_id` (FK), `invited_email`, `invited_by` (FK persons), `created_at`, `expires_at`, `accepted_at` (nullable), `status` (default `"pending"`; values: `"pending"` / `"accepted"` / `"expired"` / `"cancelled"`)
- [x] All models importable from `backend.models`

---

### BE-004 — Account and related models ✅ DONE

**Size:** M · **Depends on:** BE-003 · **FRs:** FR-A-001 · **Ref:** ARCH §4.4, EDP §6
**Completed:** 2026-05-28 · **Tests:** 26/26 passing

**Files:**
```
+ backend/models/account.py
~ backend/models/__init__.py
```

**AC:**
- [x] `Account` combines `MonetaryValueMixin` + `BaseEntity`; STI with `account_type` discriminator (indexed); `account_type` values: `"bank"`, `"credit_card"`, `"capital"`, `"asset"`, `"insurance"`
- [x] All base account fields present: `name`, `institution` (nullable), `month_year` (nullable, `"YYYY-MM"`), `notes` (nullable), `account_number` (nullable, masked)
- [x] All subtype-specific nullable fields present per ARCH §4.4: BankAccount (`interest_rate`, `interest_frequency`), CreditCard (`credit_limit`, `billing_day`, `due_day`, `reward_points`, `annual_fee`), Capital (`investment_type`, `cost_basis`, `current_value`), Asset (`asset_type`, `purchase_date`, `purchase_value`, `depreciation_formula_id`), Insurance (`policy_type`, `coverage_types`, `premium_frequency`, `coverage_amount`, `insurer`)
- [x] `AccountOwner` junction table: `account_id` (FK), `person_id` (FK), `is_primary` (bool), `added_at`; unique `(account_id, person_id)`
- [x] `ValuationRecord` extends `BaseEntity`: `account_id` (FK), `valuation_date` (Date, indexed), `value` (Decimal), `notes` (nullable); compound index `(account_id, valuation_date)`
- [x] `RecurringConfig` extends `BaseEntity`: `account_id` (FK, unique), `frequency_text` (str), `frequency_rule` (JSON text), `next_due_date` (Date, nullable), `is_active` (bool, default True)
- [x] Compound index `(household_id, account_type)` on `accounts`

---

### BE-005 — FinancialEvent and OccurrenceRecord models ✅ DONE

**Size:** M · **Depends on:** BE-004 · **FRs:** FR-E-001 · **Ref:** ARCH §4.4, EDP §7

**Files:**
```
+ backend/models/event.py
~ backend/models/__init__.py
```

**AC:**
- [ ] `FinancialEvent` combines `MonetaryValueMixin` + `BaseEntity`; STI with `event_type` discriminator; `event_type` values: `"transaction"`, `"recurring_payment"`, `"transfer"`
- [ ] Base event fields: `name`, `event_date` (Date), `payee` (str, nullable), `payee_person_id` (FK persons, nullable), `category_id` (FK categories, nullable), `account_id` (FK accounts), `notes` (nullable), `transaction_type` (str; `"inflow"` / `"outflow"` / `"transfer"`), `transaction_status` (str; `"pending"` / `"completed"` / `"cancelled"` / `"reconciled"`), `reconciled_at` (datetime, nullable)
- [ ] Transaction-specific fields: `is_shared_expense` (bool, default False)
- [ ] RecurringPayment-specific fields: `frequency_text` (str, nullable), `frequency_rule` (JSON text, nullable), `source_account_id` (FK accounts, nullable — for capital/asset/insurance sourced payments)
- [ ] Transfer-specific fields: `destination_account_id` (FK accounts, nullable), `dest_currency` (nullable), `dest_amount` (Decimal, nullable), `dest_amount_base` (Decimal, nullable), `is_debt_repayment` (bool, default False), `debt_cleared_amount` (Decimal, nullable)
- [ ] `CheckConstraint("(is_shared_expense = 0) OR (transaction_type = 'outflow')")` present
- [ ] All 4 compound indexes from ARCH §4.5 present
- [ ] `OccurrenceRecord`: `recurring_event_id` (FK, indexed), `expected_date` (Date), `occurrence_status` (`"upcoming"` / `"processed"` / `"skipped"` / `"missed"` / `"failed"`), `generated_event_id` (FK events, nullable), `processed_at` (datetime, nullable); compound index `(recurring_event_id, expected_date)`

---

### BE-006 — Remaining models (Budget, Category, Currency, Formula, Audit, Alert) ✅ DONE

**Size:** M · **Depends on:** BE-005 · **FRs:** FR-B-001, FR-C-001, FR-CU-001, FR-F-001 · **Ref:** ARCH §4.4, EDP §8–12

**Files:**
```
+ backend/models/budget.py
+ backend/models/category.py
+ backend/models/currency.py
+ backend/models/formula.py
+ backend/models/audit.py
+ backend/models/alert.py
~ backend/models/__init__.py
```

**AC:**
- [ ] `Budget` extends `BaseEntity`: `name`, `category_id` (FK), `owner_person_id` (FK persons, nullable — null = household-wide), `period_type` (`"monthly"` / `"yearly"`), `limit_currency`, `limit_amount`, `limit_amount_base`, `period_start` (Date), `period_end` (Date), `alert_threshold_pct` (int, default 80), `rollover` (bool, default False); no `actual_spent` column (computed at query time); indexes on `(household_id, period_start, period_end)` and `(category_id, period_start)`
- [ ] `Category` extends `BaseEntity`: `name`, `color` (str, nullable, hex), `icon` (str, nullable), `category_type` (`"income"` / `"expense"` / `"both"`, default `"expense"`), `parent_id` (FK self, nullable, indexed), `depth` (int, default 0); `CheckConstraint("depth <= 1")`; index `(household_id, parent_id)`
- [ ] `Currency`: `id`, `household_id` (FK, indexed), `code` (str 3), `name`, `symbol`, `is_base` (bool), `is_display_active` (bool), `rate_to_base` (Decimal, default 1.0), `fee_pct` (Decimal, default 0), `last_rate_at` (datetime, nullable), `rate_source` (nullable); unique `(household_id, code)`; `FxRateHistory` child table with unique `(currency_id, rate_date)`
- [ ] `Formula` extends `BaseEntity`: `name`, `expression` (Text), `applies_to` (str — entity type), `is_system` (bool, default False), `description` (nullable)
- [ ] `AuditLog` has **no FK constraints** on `entity_id` or `actor_id`; stores UUIDs as plain columns; fields: `id`, `household_id` (UUID, indexed), `actor_id` (UUID, indexed), `action` (`"create"` / `"update"` / `"archive"` / `"restore"` / `"delete"`), `entity_type`, `entity_id` (UUID, indexed), `before_state` (Text JSON, nullable), `after_state` (Text JSON, nullable), `occurred_at` (indexed), `ip_address` (nullable), `user_agent` (nullable)
- [ ] `Alert` extends `BaseEntity`: `alert_type` (str; `"missed_payment"` / `"budget_threshold"` / `"budget_exceeded"` / `"fx_fetch_failed"` / `"duplicate_detected"` / `"system_error"`), `title`, `body` (Text), `entity_type` (nullable), `entity_id` (UUID, nullable), `is_read` (bool, default False), `read_at` (datetime, nullable)

---

### BE-007 — Alembic initial migration ✅ DONE

**Size:** S · **Depends on:** BE-006 · **FRs:** — · **Ref:** ARCH §3.1

**Files:**
```
+ backend/migrations/env.py
+ backend/migrations/script.py.mako
+ backend/alembic.ini
+ backend/migrations/versions/0001_initial_schema.py
```

**AC:**
- [ ] `alembic upgrade head` on a fresh SQLite file creates all tables, all indexes, and all constraints with zero errors
- [ ] `alembic downgrade base` removes all tables cleanly
- [ ] WAL pragma is applied in `env.py` via `connect_args={"check_same_thread": False}` and event listener
- [ ] All compound indexes from ARCH §4.5 are present in the migration (not just the models)
- [ ] The `CheckConstraint` on `financial_events.is_shared_expense` and `categories.depth` are both present in the migration

---

### BE-008 — FastAPI app, middleware stack, DI, and audit service ✅ DONE

**Size:** M · **Depends on:** BE-007 · **FRs:** FR-SYS-002 · **Ref:** ARCH §5.1, §5.2, §5.3, EDP §16.3, §16.4

**Files:**
```
~ backend/main.py
+ backend/middleware/auth_middleware.py
+ backend/middleware/household_middleware.py
+ backend/middleware/csrf_middleware.py
+ backend/dependencies.py
+ backend/services/__init__.py
+ backend/services/audit_service.py
```

**AC:**
- [ ] Middleware registered in order: `AuthMiddleware` → `HouseholdMiddleware` → `CSRFMiddleware`; auth/static paths skipped by all three
- [ ] `AuthMiddleware` validates session cookie against `Session` table; rejects with 401 if absent, expired (`expires_at` < now), or `last_activity_at` > 30 min ago; updates `last_activity_at` on every valid request
- [ ] `HouseholdMiddleware` sets `request.state.household_id` from `request.state.person.household_id`
- [ ] `CSRFMiddleware` validates `X-CSRF-Token` header on all non-GET requests that are not under `/auth/`; returns 403 if missing or not found in `Session.csrf_token`; does NOT single-use invalidate (token valid for session lifetime)
- [ ] Security headers applied globally: `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] All API errors return structured JSON: `{"error": "Human-readable", "code": "SNAKE_CASE_CODE", "detail": {}}`; `RequestValidationError` caught and reformatted
- [ ] `dependencies.py`: `get_db()` async generator (commit on success, rollback on exception); `get_current_person()` (raises 401 if no session or person archived); `get_household_id()`; `require_role(minimum_role: str)` decorator factory; `_get_or_404(db, household_id, entity_id, Model)` helper
- [ ] `audit_service.log(db, household_id, actor_id, action, entity_type, entity_id, before, after)` writes `AuditLog` record; `before`/`after` serialised to JSON; called before `flush()` in every service mutator
- [ ] `pytest` smoke test: app starts, middleware loads, `/health` returns 200

---

## Epic 2 — Frontend Foundation ✅ COMPLETE

**Purpose:** Build the complete frontend scaffold, design system, generic entity components,
and app shell before any feature-specific UI is written.

**Pre-conditions:** Epic 1 complete. Node 20+ installed.

**Post-conditions:** `npm run dev` starts. Design system components render. App shell
renders with placeholder routes. All generic entity components available for feature epics.

**Completed:** 2026-05-29 · All 7 stories done · Retrospective complete

**Delivered:**
- Tailwind v4 `@theme` + `@utility` design tokens in `index.css`
- Full UI component library: Button, Input, Checkbox, Toggle, Dropdown (single/multi/searchable), DatePicker, ColourPicker, EmojiIconPicker, TagInput, MonetaryValueInput, RecurringDateInput, Card, Modal, Drawer, ConfirmationDialog, Accordion, Table, ContextMenu, AlertBanner, ProgressBar, Skeleton, EmptyState, Toast/ToastContainer
- Generic entity layer: `useEntityManager`, `EntityCard`, `EntityModal`, `EntityPage`
- Zustand stores: `authStore` (with mock Dev User for pre-OAuth development), `alertStore`, `visualizationStore`
- AppShell with responsive sidebar, topbar, and React Router v6 routing
- Auth guard implemented; all module routes wired with `EmptyState` placeholders
- `/design-system` route: live component catalogue for the full UI library

---

### FE-001 — Vite + React + TypeScript scaffold and design tokens ✅ DONE

**Size:** S · **Depends on:** — · **FRs:** — · **Ref:** ARCH §1.2, §3.2, UX §1
**Completed:** 2026-05-29

**Files:**
```
+ frontend/index.html
+ frontend/vite.config.ts
+ frontend/tsconfig.json
+ frontend/tailwind.config.ts
+ frontend/src/main.tsx
+ frontend/src/App.tsx
+ frontend/src/index.css
+ frontend/src/types/entities.ts
```

**AC:**
- [x] `npm run dev` starts dev server; `npm run build` produces a dist bundle; no TypeScript errors
- [x] `index.css` has Tailwind v4 `@theme {}` block with **all** colour, typography, spacing, shadow, z-index, and motion tokens from UX §1 (including all `--color-entity-*` tokens); `@utility` blocks for shared component utilities
- [x] `types/entities.ts` exports TypeScript interfaces: `BaseEntity`, `MonetaryValue`, `PersonRef`, `StatusEnum`; field names in `camelCase` per EDP §15.2
- [x] React Router v6 configured; `/login` renders a placeholder; `/` redirects to `/login` (auth guard placeholder); `/design-system` route exposes live component catalogue
- [x] All monetary values formatted via a shared `formatMoney(value, currency, displayCurrency)` utility in `utils/currency.ts`; dates formatted via `utils/date.ts` (stored ISO → displayed `DD-MM-YYYY`)

---

### FE-002 — Design system: atomic components (Layer 2) ✅ DONE

**Size:** L · **Depends on:** FE-001 · **FRs:** — · **Ref:** UX §2
**Completed:** 2026-05-29

**Files:**
```
+ frontend/src/components/ui/Button.tsx
+ frontend/src/components/ui/Input.tsx
+ frontend/src/components/ui/Label.tsx
+ frontend/src/components/ui/Badge.tsx
+ frontend/src/components/ui/Avatar.tsx
+ frontend/src/components/ui/Icon.tsx
+ frontend/src/components/ui/Tooltip.tsx
+ frontend/src/components/ui/Divider.tsx
+ frontend/src/components/ui/Spinner.tsx
+ frontend/src/components/ui/index.ts
```

**AC:**
- [x] `Button`: 5 variants (`primary`, `secondary`, `ghost`, `danger`, `link`); 3 sizes; all states (hover, active, focus-visible, disabled, loading spinner); loading state disables and shows `Spinner`
- [x] `Input`: 4 variants; leading/trailing slot; all states (default, focus, error, disabled); error message slot; `aria-invalid` on error
- [x] `Badge`: 6 variants including `entity` which uses CSS var `--entity-accent` passed as prop
- [x] `Avatar`: 4 sizes; `picture_url` with initials fallback; greyscale when `archived=true`
- [x] `Tooltip`: 200 ms hover delay; max-width 280px; keyboard accessible; dismisses on Escape
- [x] All components: `focus-visible` ring uses `--color-border-focus`; Vitest: each component renders without throwing

---

### FE-003 — Design system: form and selection components (Layer 3) ✅ DONE

**Size:** L · **Depends on:** FE-002 · **FRs:** — · **Ref:** UX §3
**Completed:** 2026-05-29

**Files:**
```
+ frontend/src/components/ui/Dropdown.tsx
+ frontend/src/components/ui/Checkbox.tsx
+ frontend/src/components/ui/Toggle.tsx
+ frontend/src/components/ui/DatePicker.tsx
+ frontend/src/components/ui/ColourPicker.tsx
+ frontend/src/components/ui/EmojiIconPicker.tsx
+ frontend/src/components/ui/MonetaryValueInput.tsx
+ frontend/src/components/ui/RecurringDateInput.tsx
+ frontend/src/components/ui/TagInput.tsx
~ frontend/src/components/ui/index.ts
```

**AC:**
- [x] `Dropdown`: single, searchable, multi, and grouped variants; keyboard nav (arrows, Enter, Escape); `aria-expanded` and `aria-activedescendant`
- [x] `DatePicker`: calendar popover; **accepts and displays** `DD-MM-YYYY`; **stores as ISO**; keyboard nav; clears on Backspace
- [x] `ColourPicker`: 32-swatch palette tab + hex input tab; selected colour shown in trigger button
- [x] `EmojiIconPicker`: emoji groups; search; Lucide icon tab; recently used row (persists in component state)
- [x] `MonetaryValueInput`: currency `Dropdown` + amount `Input`; auto-fills `amount_base_calculated` from parent-provided rates; shows `amount_base` override field and `fx_delta` chip when `currency ≠ base_currency`
- [x] `RecurringDateInput`: free-text input with 500 ms debounce; calls parent-provided `parseRule(text)` and shows next computed date; **Confirm button required** before parent form can save; resets to unconfirmed if text changes after confirmation
- [x] `TagInput`: Enter or comma to add tag; Backspace removes last tag; duplicate tags rejected

---

### FE-004 — Design system: containers, layout, and feedback (Layers 4 and 6) ✅ DONE

**Size:** M · **Depends on:** FE-002 · **FRs:** — · **Ref:** UX §4, §6
**Completed:** 2026-05-29

**Files:**
```
+ frontend/src/components/ui/Card.tsx
+ frontend/src/components/ui/Modal.tsx
+ frontend/src/components/ui/Drawer.tsx
+ frontend/src/components/ui/Accordion.tsx
+ frontend/src/components/ui/Table.tsx
+ frontend/src/components/ui/ContextMenu.tsx
+ frontend/src/components/ui/Toast.tsx
+ frontend/src/components/ui/AlertBanner.tsx
+ frontend/src/components/ui/Skeleton.tsx
+ frontend/src/components/ui/EmptyState.tsx
+ frontend/src/components/ui/ConfirmationDialog.tsx
+ frontend/src/components/ui/ProgressBar.tsx
+ frontend/src/store/alertStore.ts
~ frontend/src/components/ui/index.ts
```

**AC:**
- [x] `Modal`: `sm`/`md`/`lg`/`fullscreen` variants; focus trap; Escape closes (with unsaved-changes guard if `isDirty` prop); on `<768px` renders as bottom sheet
- [x] `Drawer`: slides from right; full-width on mobile; focus trap
- [x] `Table`: sticky `thead`; sortable columns (sort icon state); row hover; responsive card-collapse at `<768px`
- [x] `ContextMenu`: `⋯` trigger; standard items: Edit, Duplicate, separator, Archive, Delete; item-level `disabled` and `destructive` props
- [x] `Card`: hover lift animation per UX §4.1; left accent bar uses CSS var `--entity-accent` passed as prop
- [x] `Toast` / `ToastContainer`: 4 variants; auto-dismiss 4 s (success/info) / 8 s (error/warning); max 3 stacked; slide-in animation; `alertStore` Zustand store with `enqueue` and `dismiss` actions
- [x] `Skeleton`: 4 shapes — `card`, `table-row`, `chart`, `stat`; `ConfirmationDialog` wraps `Modal` with warning/danger variant and Cancel + Confirm; `ProgressBar` implemented

---

### FE-005 — Generic entity components (Layer 9) ✅ DONE

**Size:** M · **Depends on:** FE-003, FE-004 · **FRs:** — · **Ref:** EDP §14, UX §9.1–9.3
**Completed:** 2026-05-29

**Files:**
```
+ frontend/src/hooks/useEntityManager.ts
+ frontend/src/components/entity/EntityCard.tsx
+ frontend/src/components/entity/EntityModal.tsx
+ frontend/src/components/entity/EntityPage.tsx
+ frontend/src/components/entity/index.ts
```

**AC:**
- [x] `useEntityManager<T>`: exposes `{ items, isLoading, error, create, update, archive, restore, deletePermanently, duplicate, detectDuplicate }`; all mutations call the provided `api` adapter; `detectDuplicate` is optional config
- [x] `EntityCard<T>`: left accent bar using `entityAccent` prop (CSS var); header with name + `Badge`; body slot; footer with `updated_at`; `ContextMenu` with standard actions; greyed-out appearance when `archived=true`; `onClick` to open detail/edit
- [x] `EntityModal<T>`: two-column form grid on `≥768px`; section dividers with `Divider` (labelled); footer: Cancel + Save; Save button shows `Spinner` while submitting; `isDirty` guard on Escape
- [x] `EntityPage<T>`: action bar with primary Create button + Show Archived toggle; `VisualizationFilterBar` slot (renders if `showFilterBar` prop); extension slot for entity-specific controls; renders children (list or table)
- [x] Multi-select: Ctrl+click adds to selection; Shift+click range selects; Ctrl+A selects all; `BulkActionBar` appears at bottom when ≥1 selected with count and Archive/Delete bulk actions

---

### FE-006 — Zustand stores and TanStack Query client ✅ DONE

**Size:** S · **Depends on:** FE-001 · **FRs:** FR-P-006, FR-V-001 · **Ref:** ARCH §3.2, EDP §13.5
**Completed:** 2026-05-29

**Files:**
```
+ frontend/src/api/client.ts
+ frontend/src/store/authStore.ts
+ frontend/src/store/visualizationStore.ts
+ frontend/src/types/visualization.ts
```

**AC:**
- [x] `client.ts`: base fetch wrapper; automatically includes `X-CSRF-Token` from `authStore`; on 401 response calls `authStore.clearAuth()` and redirects to `/login`; all errors throw a typed `ApiError`
- [x] `authStore`: `{ currentPerson, householdId, csrfToken, setAuth, clearAuth }`; populated from `/auth/me` on app mount; mock Dev User injected in development mode so app shell is navigable without backend OAuth
- [x] `visualizationStore`: `VisualizationFilter` shape per EDP §13.5: `{ dateRange, categoryIds, personIds, accountIds, currency, comparisonMode, comparisonIds }`; actions: `setFilter`, `drillDown`, `drillUp`, `resetFilter`, `navigateTo(module, filterPatch)`
- [x] `useVisualizationFilter` hook: reads/writes `visualizationStore`; `navigateTo` persists filter across route changes via React Router state
- [x] `types/visualization.ts` exports `VisualizationFilter`, aggregation response types

---

### FE-007 — App shell, routing, and auth guard ✅ DONE

**Size:** M · **Depends on:** FE-005, FE-006 · **FRs:** FR-P-006 · **Ref:** ARCH §8.1, §8.2, UX §5
**Completed:** 2026-05-29

**Files:**
```
+ frontend/src/components/layout/AppShell.tsx
+ frontend/src/components/layout/Sidebar.tsx
+ frontend/src/components/layout/Topbar.tsx
~ frontend/src/App.tsx
```

**AC:**
- [x] `AppShell`: full sidebar layout at `≥1024px`; icon-only collapsed sidebar at `768–1024px`; bottom nav bar at `<768px`
- [x] `Sidebar`: all navigation sections per UX §5.2; Household ⇌ My Finances view toggle at bottom (reads `authStore.currentPerson.default_view`); active route highlighted
- [x] `Topbar`: page title; `VisualizationFilterBar` slot with horizontal scroll on overflow; collapses to `Filters` button at `<480px`; alert bell (reads `alertStore` count); `Avatar` linking to profile/settings
- [x] `App.tsx`: all routes defined; protected routes wrapped in `AuthGuard` component that checks `authStore.currentPerson` and redirects to `/login` if absent; each module route renders its page within `AppShell`; `/design-system` route exposes the full UI component catalogue
- [x] Placeholder pages created for all modules: `Dashboard`, `Accounts`, `Capital`, `Assets`, `Insurance`, `Transactions`, `RecurringPayments`, `Transfers`, `Budgets`, `Categories`, `Settings` — each renders an `EmptyState` until its epic is complete

---

## Epic 3 — Authentication & Household

**Purpose:** Google OAuth login, server-side sessions, CSRF, household creation, and
member management. After this epic both Ben and Kim can log in and are in the same household.

**Pre-conditions:** Epics 1 and 2 complete. Google OAuth credentials configured.

**Post-conditions:** Full auth flow working end-to-end. Household created on first login.
Second user can be invited and accept. All auth tests passing.

---

### AUTH-001 — Google OAuth backend: flow, callback, session

**Size:** M · **Depends on:** BE-008 · **FRs:** FR-P-001, FR-HH-001 · **Ref:** ARCH §7.1, §7.2, EDP §16.3

**Files:**
```
+ backend/services/auth_service.py
+ backend/routes/auth.py
~ backend/main.py
```

**AC:**
- [ ] `GET /auth/login`: generates OAuth state (UUID stored in short-lived DB table or signed cookie), redirects to Google authorization endpoint with `scope=openid email profile`, `prompt=select_account`
- [ ] `GET /auth/callback`: exchanges code for tokens via `httpx`; validates ID token (signature, expiry, audience) using `google-auth`; extracts `email`, `name`, `picture`, `sub` from claims; creates or fetches `Person` by `google_sub` with fallback email match
- [ ] On first login (no `household_id`): creates `Household` with default name, SGD base currency, seeds 12 default categories (per CAT seeding list), adds SGD currency record, assigns person as `owner`
- [ ] `Session` created with `expires_at = now + 30min`, `last_activity_at = now`, `csrf_token = secrets.token_urlsafe(32)`; response sets `HttpOnly`, `Secure`, `SameSite=Lax` session cookie; also returns `X-Session-Id` header for dev cross-port use
- [ ] `GET /auth/me`: returns `{ person: PersonResponse, household: HouseholdResponse }` or 401; used by frontend to rehydrate `authStore`
- [ ] `POST /auth/logout`: deletes `Session` record; clears session cookie; returns 200
- [ ] Integration test: full mock OAuth flow — state → callback → session created → `/auth/me` returns person

---

### AUTH-002 — Household member management backend

**Size:** S · **Depends on:** AUTH-001 · **FRs:** FR-HH-003, FR-HH-004, FR-P-002, FR-P-005 · **Ref:** ARCH §6.2, PRD §2

**Files:**
```
+ backend/services/household_service.py
+ backend/routes/household.py
~ backend/main.py
```

**AC:**
- [ ] `GET /api/household`: returns household details; `PATCH /api/household`: owner-only; updates `name`, `timezone`; audit log entry
- [ ] `GET /api/persons`: lists all household members with roles; `PATCH /api/persons/{id}`: self or admin+ only; updates `display_name`, `display_currency`, `default_view`; `DELETE /api/persons/{id}`: admin+ only; hard-delete if no events, archive otherwise
- [ ] `POST /api/persons/invite`: admin+ only; validates email not already in household; creates `HouseholdInvitation` with 7-day expiry; returns invitation record; no email sent
- [ ] `GET /api/persons/invitations`: admin+ only; returns pending invitations; `DELETE /api/persons/invitations/{id}`: admin+ cancels invitation (sets `status = "cancelled"`)
- [ ] `POST /api/invitations/{id}/accept`: validates session person's email matches `invited_email` via `func.lower()`; creates `Person` with `member` role; sets invitation `status = "accepted"`, `accepted_at = now`; integration test: mismatched email returns 403
- [ ] `PATCH /api/persons/{id}/role`: owner-only; values: `"admin"` / `"member"`; owner cannot demote themselves; audit log

---

### AUTH-003 — Auth frontend: login page, useAuth hook, route hydration

**Size:** M · **Depends on:** FE-007, AUTH-001 · **FRs:** FR-P-001 · **Ref:** UX §9.5

**Files:**
```
+ frontend/src/pages/Login.tsx
+ frontend/src/hooks/useAuth.ts
+ frontend/src/api/usePersons.ts
```

**AC:**
- [ ] `Login.tsx`: centred card on dark background using design tokens; single "Sign in with Google" button; displays `?error` query param as `AlertBanner`; no other inputs
- [ ] `useAuth` hook: calls `GET /auth/me` on mount; populates `authStore`; exposes `{ currentPerson, isLoading, logout }`; `logout()` calls `POST /auth/logout` then clears store and navigates to `/login`
- [ ] `App.tsx` `AuthGuard` calls `useAuth` on mount; shows `Skeleton` while loading; redirects to `/login` if unauthenticated; redirects to `/dashboard` if authenticated and on `/login`
- [ ] On successful callback, app shell loads in the person's `default_view` (household or personal)
- [ ] Vitest: `Login.tsx` renders button; renders error banner when `?error` present

---

### AUTH-004 — Household settings and member management frontend

**Size:** M · **Depends on:** FE-007, AUTH-002 · **FRs:** FR-HH-002 through FR-HH-004, FR-P-003, FR-P-005 · **Ref:** UX §9.5

**Files:**
```
+ frontend/src/pages/Settings.tsx (partial — household and members tabs only)
+ frontend/src/api/usePersons.ts (expand)
```

**AC:**
- [ ] Settings page has tabbed layout: `Household` / `Members` / `Currencies` (currencies tab is placeholder until SETTINGS epic)
- [ ] Household tab: name + timezone fields; Save button; owner-only fields locked for non-owners with `Tooltip`
- [ ] Members tab: `Table` of persons with name, email, role `Badge`, joined date, actions; Invite button (admin+) opens `Modal` with email input
- [ ] Role change dropdown in table row (owner-only); owner cannot change their own role
- [ ] Remove member action (owner-only): `ConfirmationDialog` before delete
- [ ] Pending invitations section: list with cancel action; shows invite link for manual sharing

---

## Epic 4 — Categories

**Purpose:** Full category management — seeding, CRUD, hierarchy, merge/duplicate detection,
and import-time category mapping. After this epic categories are fully operational.

**Pre-conditions:** Epics 1, 2, 3 complete.

**Post-conditions:** 12 default categories exist in every new household. Full CRUD working.
Tree view, spending rollup, merge, and import mapping all operational.

---

### CAT-001 — Category schemas and service (CRUD + seeding)

**Size:** M · **Depends on:** BE-008, AUTH-001 · **FRs:** FR-C-001 through FR-C-004 · **Ref:** EDP §9, ARCH §4.4

**Files:**
```
+ backend/schemas/category.py
+ backend/services/category_service.py
```

**AC:**
- [ ] Pydantic schemas: `CategoryCreate` (`name` max 100; `color` hex pattern; `icon` nullable; `parent_id` nullable), `CategoryUpdate` (all optional), `CategoryResponse` (includes `depth`, `children_count`, `parent_name`)
- [ ] `seed_default_categories(db, household_id, actor_id)`: creates 12 categories per EDP §9 seeding list with their colours/icons as `BaseEntity` records owned by the household; idempotent (no-ops if count matches)
- [ ] `create_category`: validates `name` uniqueness with `func.lower()`; if `parent_id` provided, validates parent exists in household and has `depth == 0` (enforces max 2 levels); sets `depth = parent.depth + 1`; audit log
- [ ] `update_category`: partial update; re-validates name uniqueness excluding self; cannot change `depth` directly; audit log
- [ ] `archive_category`: if category has children, sets `parent_id = NULL` and `depth = 0` on all children before archiving parent; returns `{ archived: Category, promoted_children: int }`; if no data (no events, no children), hard-delete instead; audit log
- [ ] `restore_category`: unarchives; sets `status = "active"`; audit log

---

### CAT-002 — Category routes and hierarchy endpoints

**Size:** S · **Depends on:** CAT-001 · **FRs:** FR-C-001 through FR-C-007 · **Ref:** ARCH §6.2

**Files:**
```
+ backend/routes/categories.py
~ backend/main.py
```

**AC:**
- [ ] `GET /api/categories`: returns flat list; supports `?include_archived`, `?top_level`, `?parent_id`; sorted alphabetically case-insensitive; each item includes `children_count`
- [ ] `GET /api/categories/tree`: single DB query, client-side O(n) tree assembly; returns `[{ ...category, children: [...] }]`; supports `?include_archived`; sorted at each level; used by frontend for all hierarchy rendering
- [ ] `POST /api/categories`, `PUT /api/categories/{id}`, `DELETE /api/categories/{id}`, `POST /api/categories/{id}/restore`: CRUD per CAT-001 service
- [ ] `GET /api/categories/{id}/spending-summary`: returns spending totals for a category and period (`?from=YYYY-MM-DD&to=YYYY-MM-DD`); for top-level: includes direct + all subcategory spending; response shape matches EDP §9 spending rollup contract
- [ ] `PATCH /api/categories/{id}/reassign-children`: bulk reassign subcategories; `{ "new_parent_id": UUID | null }`; `null` promotes to top-level; validates target is top-level if provided
- [ ] Integration test: create parent → create subcategory → archive parent → verify subcategory promoted

---

### CAT-003 — Category merge and duplicate detection

**Size:** S · **Depends on:** CAT-001 · **FRs:** FR-C-005, FR-C-006 · **Ref:** EDP §9.4

**Files:**
```
~ backend/services/category_service.py
~ backend/routes/categories.py
```

**AC:**
- [ ] `GET /api/categories/duplicates`: returns groups of potential duplicates; detection criteria: exact case-insensitive match, whitespace-trimmed match, Levenshtein distance ≤ 2 (use `difflib.SequenceMatcher` with ratio ≥ 0.85); each group includes `transaction_count` per category
- [ ] `POST /api/categories/merge`: `{ "target_id": UUID, "source_ids": [UUID] }`; validates all IDs belong to household; no source == target; no archived sources or targets; default categories cannot be merged into non-default (403); non-default can be merged into default
- [ ] Merge execution (transactional): 1) update all `FinancialEvent.category_id` from source → target; 2) reassign subcategories of source to target (name-clash → append `" (2)"`); 3) archive source; all in one DB transaction
- [ ] Returns `{ success, source_categories: [{id, name, transactions_reassigned}], subcategories_reassigned, message }`
- [ ] Integration test: merge two categories → all events re-pointed → source archived → duplicate detection no longer returns that pair

---

### CAT-004 — Import category mapping service

**Size:** S · **Depends on:** CAT-001 · **FRs:** FR-IE-003 · **Ref:** story 2-5 learnings

**Files:**
```
~ backend/services/category_service.py
~ backend/routes/categories.py
```

**AC:**
- [ ] `POST /api/categories/import/preview`: accepts `{ "category_values": string[] }`; returns per-unique-name: `{ original_name, mapped_to_id, mapped_to_name, match_type, transaction_count, suggested_action }`; match types: `"exact"`, `"trimmed"`, `"fuzzy"`, `"unmapped"`; fuzzy uses `SequenceMatcher` ratio ≥ 0.85
- [ ] Unmapped names default to `suggested_action: "create_new"`; matched names default to `"map"`
- [ ] `auto_create_category(db, name, household_id, actor_id)`: creates category with auto-assigned colour from pool of non-default colours; idempotent per `(name, household_id)`
- [ ] Category matching is case-insensitive and whitespace-trimmed before comparison
- [ ] Unit test: 5 input names covering exact, trimmed, fuzzy, unmapped cases → correct match_type returned for each

---

### CAT-005 — Category management frontend

**Size:** L · **Depends on:** FE-005, CAT-002, CAT-003 · **FRs:** FR-C-001 through FR-C-007 · **Ref:** UX §9.1–9.3

**Files:**
```
+ frontend/src/api/useCategories.ts
+ frontend/src/pages/Categories.tsx
+ frontend/src/components/categories/CategoryTree.tsx
+ frontend/src/components/categories/CategoryManager.tsx
```

**AC:**
- [ ] `useCategories`: TanStack Query hooks wrapping all category API endpoints; `useCategoryTree()` fetches from `/api/categories/tree`
- [ ] `CategoryManager` uses `EntityPage<Category>` with tree-view body instead of card grid
- [ ] `CategoryTree`: collapsible tree; expand/collapse chevron (rotates 90°); subcategories indented with connector line (`border-l`); parent rows: folder icon + children count `Badge`; "Add Subcategory" button under expanded parents (top-level only)
- [ ] Create/edit form in `EntityModal`: name input, `ColourPicker`, `EmojiIconPicker`, parent `Dropdown` (top-level only; shows `" — None (top-level)"` option)
- [ ] Duplicate detection: "Find Duplicates" button triggers `GET /api/categories/duplicates`; results shown in grouped list with "Merge" action per group; merge opens `ConfirmationDialog` with transaction count warning
- [ ] Default categories show lock icon; Delete action disabled with `Tooltip` "Default categories cannot be deleted"

---

## Epic 5 — Accounts

**Purpose:** All account subtypes (bank, credit card, capital, asset, insurance),
account ownership, and asset valuation history.

**Pre-conditions:** Epics 1, 2, 3 complete.

**Post-conditions:** All account types can be created, edited, archived. Owners managed.
Asset valuations tracked. Account pages render with real data.

---

### ACCT-001 — Account Pydantic schemas

**Size:** S · **Depends on:** BE-008 · **FRs:** FR-A-001 · **Ref:** ARCH §3.1, EDP §6

**Files:**
```
+ backend/schemas/common.py
+ backend/schemas/account.py
```

**AC:**
- [ ] `common.py`: `MonetaryValueSchema` (7 fields), `PersonRefSchema`, `PaginationParams`
- [ ] `AccountBase`, `AccountCreate`, `AccountUpdate`, `AccountResponse` schemas; `AccountCreate.account_type` required and validated against enum
- [ ] Subtype field groups as `Optional` on base schema (e.g. `BankAccountFields`, `CreditCardFields`) — all nullable; subtype validation enforced in service, not schema
- [ ] `ValuationRecordCreate` / `ValuationRecordResponse` schemas
- [ ] `RecurringConfigCreate` / `RecurringConfigResponse` schemas
- [ ] Round-trip test: `AccountCreate → Account model → AccountResponse` serialises without error for each of the 5 account types

---

### ACCT-002 — Account service

**Size:** M · **Depends on:** ACCT-001, BE-008 · **FRs:** FR-A-001 through FR-A-018 · **Ref:** ARCH §5.3

**Files:**
```
+ backend/services/account_service.py
```

**AC:**
- [ ] `create_account`: creates account + default `AccountOwner` record for `actor_id` as primary; audit log
- [ ] `update_account`: partial update; `MonetaryValue` fields accept user override for `amount_base`; `fx_delta` recomputed; audit log
- [ ] `archive_account`: hard-delete if no events and no valuation records; soft-archive otherwise; audit log
- [ ] `restore_account`: unarchives; audit log
- [ ] `duplicate_account`: clones with new UUID; resets monetary values to 0; audit log
- [ ] `add_owner(account_id, person_id, is_primary)` / `remove_owner`: enforces minimum 1 primary owner
- [ ] Unit tests: create, archive blocked when events exist, hard-delete succeeds when empty, duplicate clears balances

---

### ACCT-003 — Account API routes + valuation routes

**Size:** S · **Depends on:** ACCT-002 · **FRs:** FR-A-001 through FR-A-018 · **Ref:** ARCH §6.2

**Files:**
```
+ backend/routes/accounts.py
~ backend/main.py
```

**AC:**
- [ ] All CRUD endpoints per ARCH §6.2 `ACCOUNTS` and `VALUATION RECORDS` sections
- [ ] `GET /api/accounts?type=bank` filter works; pagination via `?page` and `?per_page`
- [ ] `DELETE /api/accounts/{id}` returns 204 if empty; 409 with `"has-dependencies"` code if events exist
- [ ] Owner endpoints: list, add, remove; minimum-1-owner enforced with 409
- [ ] `GET/POST/DELETE /api/accounts/{id}/valuations`: latest valuation returned on `AccountResponse` as `current_value`
- [ ] Integration test: full CRUD cycle for each account type; add/remove owner; valuation record lifecycle

---

### ACCT-004 — Account frontend pages

**Size:** L · **Depends on:** FE-005, ACCT-003 · **FRs:** FR-A-001 through FR-A-018 · **Ref:** UX §9.1–9.3

**Files:**
```
+ frontend/src/api/useAccounts.ts
+ frontend/src/pages/Accounts.tsx
+ frontend/src/pages/Capital.tsx
+ frontend/src/pages/Assets.tsx
+ frontend/src/pages/Insurance.tsx
```

**AC:**
- [ ] Each page uses `EntityPage<Account>` filtered by `account_type`
- [ ] `AccountCard` shows: name, type `Badge` (entity accent colour), balance (`MonetaryValue`), owner `Avatar` stack, status; context menu: Edit, Duplicate, Archive
- [ ] Create/edit `EntityModal` dynamically shows subtype-specific field sections based on selected `account_type`; `MonetaryValueInput` used for balance; `RecurringConfig` toggle section in Asset/Capital/Insurance modal
- [ ] Assets page: shows current value from latest `ValuationRecord`; "Add Valuation" button opens small modal with date + value; valuation history renders as a simple line chart (placeholder for VIZ epic)
- [ ] `useAccounts` TanStack Query hooks cover all CRUD + owner + valuation operations

---

## Epic 6 — Transactions & Events

**Purpose:** Full transaction entry, the Transactions ledger, duplicate detection, and
reconciliation. `CategorySelect` (deferred from Epic 4) is built here.

**Pre-conditions:** Epics 1–5 complete.

**Post-conditions:** Transactions can be entered, edited, reconciled. Duplicate detection fires.
CSV imports can map categories using CAT-004 service.

---

### EVENT-001 — Event Pydantic schemas

**Size:** S · **Depends on:** BE-008, ACCT-001 · **FRs:** FR-E-001 · **Ref:** EDP §7, ARCH §3.1

**Files:**
```
+ backend/schemas/event.py
```

**AC:**
- [ ] `TransactionCreate`, `TransactionUpdate`, `TransactionResponse` schemas; `MonetaryValueSchema` embedded
- [ ] `is_shared_expense` validator: `ValidationError` if `True` and `transaction_type != "outflow"`
- [ ] `amount_base` is optional on create (server fills from current FX rate if absent)
- [ ] `TransferCreate`: includes `destination_account_id`; optional `dest_currency` and `dest_amount`
- [ ] `RecurringPaymentCreate`: includes `frequency_text`; `frequency_rule` is server-computed (not accepted on input)
- [ ] `EventListParams`: `date_from`, `date_to`, `category_id`, `account_id`, `payee_person_id`, `transaction_type`, `transaction_status`, `is_shared_expense`, `page`, `per_page`, `sort`, `order`

---

### EVENT-002 — Transaction service (FX, duplicate detection, reconciliation)

**Size:** M · **Depends on:** EVENT-001, BE-008 · **FRs:** FR-E-001 through FR-E-009 · **Ref:** ARCH §5.3, EDP §13.3

**Files:**
```
+ backend/services/event_service.py
+ backend/services/currency_service.py
```

**AC:**
- [ ] `create_transaction`: if `amount_base` absent, calls `currency_service.get_current_rate(household_id, currency)` and fills `amount_base_calculated` and `amount_base`; if `amount_base` provided, sets `fx_delta`; audit log
- [ ] `currency_service.get_current_rate`: returns `rate_to_base` from `Currency` table for household; raises `ValueError` if currency not configured for household
- [ ] `detect_duplicate(db, household_id, event)`: checks for existing events with same `account_id`, `amount`, `event_date ± 1 day`, `payee`; returns candidate `FinancialEvent` or `None`
- [ ] `reconcile(event_id)`: sets `transaction_status = "reconciled"`, `reconciled_at = now()`; audit log
- [ ] `archive_event` / `restore_event` / `duplicate_event`: standard patterns; hard-delete if no downstream references
- [ ] Unit tests: duplicate detection returns correct candidate; `is_shared_expense` on non-outflow raises; FX fill correctly computes `amount_base_calculated`

---

### EVENT-003 — Event API routes

**Size:** S · **Depends on:** EVENT-002 · **FRs:** FR-E-001 through FR-E-009 · **Ref:** ARCH §6.2

**Files:**
```
+ backend/routes/events.py
~ backend/main.py
```

**AC:**
- [ ] All CRUD endpoints per ARCH §6.2 `EVENTS` section for `event_type=transaction`
- [ ] `GET /api/events` supports all `EventListParams` filters; paginated; sorted `event_date desc` by default
- [ ] `POST /api/events/{id}/reconcile` returns 200 with updated event
- [ ] 409 `"duplicate-detected"` returned when `detect_duplicate` finds a candidate; response includes `candidate_id` and `candidate_date`
- [ ] Integration test: create transaction → create near-identical second → 409 returned with candidate; force-create (skip duplicate check with `?force=true`) succeeds

---

### EVENT-004 — Transaction ledger frontend + CategorySelect

**Size:** L · **Depends on:** FE-005, EVENT-003, CAT-002 · **FRs:** FR-E-001 through FR-E-009 · **Ref:** UX §4.7, §9.2

**Files:**
```
+ frontend/src/api/useEvents.ts
+ frontend/src/pages/Transactions.tsx
+ frontend/src/components/categories/CategorySelect.tsx
```

**AC:**
- [ ] `CategorySelect`: hierarchical `<optgroup>` view (parent as non-selectable group label; subcategories as options); flat-list toggle; "No category" option; fetches from `/api/categories/tree`
- [ ] `Transactions` page uses `EntityPage<Event>` in Table layout (not card grid)
- [ ] Table columns: Date (`DD-MM-YYYY`), Name, Category, Payee, Amount (`MonetaryValue`), Status `Badge`, Actions
- [ ] Create/edit `EntityModal`: all transaction fields; `MonetaryValueInput` for amount; `CategorySelect`; `is_shared_expense` checkbox shown only when `transaction_type == "outflow"`
- [ ] Duplicate detection: modal shows 409 warning with candidate transaction details; user chooses Proceed / Cancel
- [ ] Reconcile action in context menu and keyboard shortcut `R`; reconciled rows show muted styling
- [ ] Filter bar: date range `DatePicker`, `CategorySelect` (multi), account `Dropdown`, status, type, shared expense toggle

---

## Epic 7 — Recurring Payments

**Purpose:** Free-text recurrence rule parsing, scheduled occurrence generation,
missed-occurrence detection, and the Recurring Payments page.

**Pre-conditions:** Epics 1–6 complete.

**Post-conditions:** Recurring payments generate transaction events automatically.
Missed occurrences surfaced as alerts.

---

### RECUR-001 — RecurringDateParser service

**Size:** S · **Depends on:** BE-001 · **FRs:** FR-E-011 · **Ref:** EDP §7.3

**Files:**
```
+ backend/services/recurring_date_parser.py
```

**AC:**
- [ ] `parse(frequency_text: str, start_date: date) → tuple[RecurrenceRule | None, date | None]`: parses all 9 patterns from EDP §7.3 into a `RecurrenceRule` dataclass; returns `(None, None)` if unparseable
- [ ] `get_next_occurrence(rule: RecurrenceRule, from_date: date) → date`
- [ ] `get_occurrences_in_range(rule: RecurrenceRule, start: date, end: date) → list[date]`
- [ ] Unit tests: each of the 9 patterns tested with ≥ 3 cases (27 minimum); edge cases: month-end days (28/29/30/31), leap years, weekly on specific day names

---

### RECUR-002 — Recurring payment service and routes

**Size:** M · **Depends on:** RECUR-001, EVENT-002 · **FRs:** FR-E-010 through FR-E-014 · **Ref:** EDP §7.2, §7.3

**Files:**
```
~ backend/services/event_service.py
+ backend/schemas/event.py (extend with recurring schemas)
~ backend/routes/events.py
```

**AC:**
- [ ] `create_recurring_payment`: calls `recurring_date_parser.parse(frequency_text, start_date)`; on successful parse, stores `frequency_rule` JSON; on parse failure, returns 422 with hint; creates initial `OccurrenceRecord` entries for next 3 months; audit log
- [ ] `GET /api/events?event_type=recurring_payment`: filtered list with `next_due_date` included on each item
- [ ] `GET /api/events/recurring/upcoming?days=30`: returns all occurrences due within N days across all recurring events
- [ ] `POST /api/events/{id}/skip-occurrence`: marks one `OccurrenceRecord` as `"skipped"`; creates next occurrence record
- [ ] `POST /api/events/recurring/{id}/parse-preview`: accepts `{ "frequency_text": str }` and returns `{ "rule": RecurrenceRule, "next_dates": list[date] }` or `{ "error": str }`; used by frontend Confirm step in `RecurringDateInput`

---

### RECUR-003 — Scheduler: recurring payment processor and missed-occurrence detection

**Size:** S · **Depends on:** RECUR-002, BE-008 · **FRs:** FR-E-012, FR-E-013, FR-SYS-004 · **Ref:** ARCH §9.3

**Files:**
```
+ backend/scheduler/registry.py
+ backend/scheduler/jobs/recurring_payment_job.py
```

**AC:**
- [ ] APScheduler initialised in `registry.py`; started on app startup; shut down cleanly on app shutdown
- [ ] `recurring_payment_job` runs daily at 06:00 UTC; for each active `RecurringPayment` across all households, generates a `FinancialEvent` (transaction) for each `OccurrenceRecord` with `expected_date ≤ today` and `occurrence_status = "upcoming"`
- [ ] After generating, marks `OccurrenceRecord.occurrence_status = "processed"` and creates the next occurrence record
- [ ] Missed-occurrence detection: any `OccurrenceRecord` with `expected_date < today - 2 days` and `occurrence_status = "upcoming"` is marked `"missed"` and generates an `Alert` of type `"missed_payment"`
- [ ] Unit test: mock DB with 2 upcoming occurrences (one today, one missed); verify correct statuses and alert generated after job run

---

### RECUR-004 — Recurring payments frontend

**Size:** M · **Depends on:** FE-005, RECUR-002 · **FRs:** FR-E-010 through FR-E-014 · **Ref:** UX §9.2

**Files:**
```
+ frontend/src/pages/RecurringPayments.tsx
```

**AC:**
- [ ] `RecurringPayments` page uses `EntityPage<Event>` with card layout (not table)
- [ ] Card shows: name, amount, next due date (`DD-MM-YYYY`), recurrence description (human-readable from `frequency_text`), source account, `Badge` for occurrence status
- [ ] Create/edit modal: `RecurringDateInput` component used for `frequency_text`; Confirm button required before Save is enabled; source account dropdown
- [ ] "Upcoming" panel shows occurrences from `/api/events/recurring/upcoming?days=30`; allows skip per occurrence
- [ ] Missed occurrences shown with `AlertBanner` in amber; link to mark as resolved

---

## Epic 8 — Budgets

**Purpose:** Monthly and yearly budgets with category-linked actuals, rolling-period
management, threshold alerts, and the Budgets page with drill-down.

**Pre-conditions:** Epics 1–6 complete.

**Post-conditions:** Budgets created, actuals computed from transactions, alerts fire at threshold.

---

### BUDG-001 — Budget schemas and service

**Size:** M · **Depends on:** BE-008, CAT-001 · **FRs:** FR-B-001 through FR-B-007 · **Ref:** EDP §8

**Files:**
```
+ backend/schemas/budget.py
+ backend/services/budget_service.py
```

**AC:**
- [ ] `BudgetCreate`: `name`, `category_id`, `owner_person_id` (nullable), `period_type`, `limit_currency`, `limit_amount`, `period_start`, `period_end`, `alert_threshold_pct` (default 80), `rollover` (default False)
- [ ] `BudgetResponse` includes computed `actual_spent`, `actual_spent_base`, `variance`, `variance_pct`; these are **not stored** — computed via `computation_service.compute_budget_actuals()`
- [ ] `create_budget` / `update_budget` / `archive_budget` / `restore_budget`: standard patterns with audit logs
- [ ] `compute_budget_actuals(db, budget)`: sums `FinancialEvent.amount_base` where `category_id IN (budget.category_id + subcategories)`, `event_date BETWEEN period_start AND period_end`, `transaction_type = "outflow"`, `event_type = "transaction"`, `archived = False`; result in base currency
- [ ] Both monthly and yearly budgets can coexist for the same category; service does not prevent this

---

### BUDG-002 — Budget API routes

**Size:** S · **Depends on:** BUDG-001 · **FRs:** FR-B-001 through FR-B-007 · **Ref:** ARCH §6.2

**Files:**
```
+ backend/routes/budgets.py
~ backend/main.py
```

**AC:**
- [ ] All CRUD endpoints per ARCH §6.2 `BUDGETS` section; `GET /api/budgets` supports `?period_type`, `?category_id`, `?owner_person_id`, `?active_on=YYYY-MM-DD`
- [ ] Every `BudgetResponse` includes live `actual_spent` and `variance` computed at request time
- [ ] `GET /api/budgets/summary?month=YYYY-MM`: aggregated view — all active budgets for a month with their actuals; used by dashboard
- [ ] Integration test: create budget → add matching transaction → `actual_spent` reflects transaction amount

---

### BUDG-003 — Budget scheduler: rolling periods and threshold alerts

**Size:** S · **Depends on:** BUDG-001, RECUR-003 · **FRs:** FR-B-005, FR-B-007, FR-SYS-004 · **Ref:** ARCH §9.3

**Files:**
```
+ backend/scheduler/jobs/budget_rollover_job.py
+ backend/scheduler/jobs/alert_generation_job.py
~ backend/scheduler/registry.py
```

**AC:**
- [ ] `budget_rollover_job` runs on the 1st of each month at 00:05 UTC; for each `Budget` with `period_type = "monthly"` and `rollover = True`, creates a new `Budget` for the next month (same category, same limit, new `period_start`/`period_end`)
- [ ] `alert_generation_job` runs daily at 07:00 UTC; for each active budget, computes `variance_pct`; creates `Alert("budget_threshold")` when `variance_pct ≥ alert_threshold_pct` and no unread alert already exists for this budget + period
- [ ] Unit test: rollover job with 3 rollover budgets → 3 new budget records created for next month

---

### BUDG-004 — Budget frontend with drill-down

**Size:** L · **Depends on:** FE-005, BUDG-002 · **FRs:** FR-B-001 through FR-B-007, FR-V-008 · **Ref:** UX §9.2, EDP §8.5

**Files:**
```
+ frontend/src/api/useBudgets.ts
+ frontend/src/pages/Budgets.tsx
```

**AC:**
- [ ] `Budgets` page uses `EntityPage<Budget>` in card layout; cards show: category icon/name, limit vs actual as `ProgressBar`, variance, period label
- [ ] `ProgressBar` colour transitions: green → amber at `alert_threshold_pct`, amber → red at 100%
- [ ] Create/edit modal: category `CategorySelect`, period type toggle (monthly/yearly), limit `MonetaryValueInput`, threshold slider, rollover checkbox
- [ ] Drill-down: clicking a budget card expands or navigates to transaction list filtered to that category + period; subcategory breakdown shown as nested `ProgressBar` list
- [ ] Period navigation: prev/next month arrows in page header; selected period filters all budget cards

---

## Epic 9 — Transfers & Debt

**Purpose:** Inter-account transfers, automatic debt derivation from shared-expense
transactions and credit card balances, and the Transfers page with debt summary widget.

**Pre-conditions:** Epics 1–6 complete.

**Post-conditions:** Transfers work. Household debt computed automatically. Dashboard debt widget live.

---

### DEBT-001 — Transfer service and debt computation

**Size:** M · **Depends on:** EVENT-002 · **FRs:** FR-D-001 through FR-D-006, FR-E-015 through FR-E-017 · **Ref:** EDP §12, ARCH §5.3

**Files:**
```
+ backend/services/computation_service.py
~ backend/services/event_service.py
```

**AC:**
- [ ] `create_transfer`: creates `FinancialEvent(event_type="transfer")`; validates both accounts belong to household; auto-detects if transfer clears shared-expense debt (checks if `destination_account_id` belongs to person owed); sets `is_debt_repayment = True` and `debt_cleared_amount` if detected; audit log
- [ ] `computation_service.compute_household_debt(db, household_id)`: returns `{ internal_debt: Decimal, card_debt: Decimal, detail: [...] }`; **never stored**; internal debt = sum of `amount_base` for `is_shared_expense=True, transaction_type="outflow"` events not yet cleared by a matching transfer; card debt = sum of outstanding credit card balances
- [ ] `compute_net_worth(db, household_id)`: sums all account balances (bank + capital + asset − credit card) in base currency
- [ ] Unit tests: two shared-expense transactions then a clearing transfer → `compute_household_debt` returns zero for that person

---

### DEBT-002 — Transfer API routes

**Size:** S · **Depends on:** DEBT-001 · **FRs:** FR-E-015 through FR-E-017, FR-D-001 through FR-D-006 · **Ref:** ARCH §6.2

**Files:**
```
~ backend/routes/events.py
```

**AC:**
- [ ] `POST /api/events` with `event_type = "transfer"`: full transfer creation; validates destination account
- [ ] `GET /api/events?event_type=transfer`: filtered list; shows `is_debt_repayment` flag
- [ ] `GET /api/household/debt`: returns `compute_household_debt()` result; used by dashboard; cached for 5 min per household (simple in-memory dict, invalidated on any new transfer or transaction)
- [ ] `GET /api/household/net-worth`: returns `compute_net_worth()` result
- [ ] Integration test: create two shared-expense transactions → verify debt > 0 → create clearing transfer → verify debt = 0

---

### DEBT-003 — Transfers frontend and debt widget

**Size:** M · **Depends on:** FE-005, DEBT-002 · **FRs:** FR-E-015 through FR-E-017, FR-D-001 through FR-D-006 · **Ref:** UX §9.2

**Files:**
```
+ frontend/src/pages/Transfers.tsx
+ frontend/src/components/dashboard/DebtSummaryWidget.tsx
```

**AC:**
- [ ] `Transfers` page uses `EntityPage<Event>` in table layout; columns: Date, From Account, To Account, Amount, Debt Repayment flag, Status
- [ ] Create transfer modal: source account `Dropdown`, destination account `Dropdown` (excludes source), `MonetaryValueInput`; optional destination amount for cross-currency transfers
- [ ] `DebtSummaryWidget`: shows internal debt (by person) and credit card debt (by card); clicking person row navigates to Transactions filtered to their shared expenses
- [ ] Auto-detect badge on transfer card when `is_debt_repayment = True`

---

## Epic 10 — Formulas

**Purpose:** System formula defaults (depreciation, FX fee calculation) plus
a user-configurable formula registry for asset and capital computations.

**Pre-conditions:** Epics 1–5 complete.

**Post-conditions:** Depreciation formula assignable to asset accounts. Formula registry browsable.

---

### FORM-001 — Formula service and routes

**Size:** S · **Depends on:** BE-008 · **FRs:** FR-F-001 through FR-F-004 · **Ref:** EDP §11

**Files:**
```
+ backend/services/formula_service.py
+ backend/routes/formulas.py
~ backend/main.py
```

**AC:**
- [ ] System formulas seeded at startup: `straight_line_depreciation`, `declining_balance_depreciation`, `fx_fee_calculation`; `is_system = True`; cannot be deleted
- [ ] `evaluate_formula(formula_id, variables: dict) → Decimal`: safely evaluates `formula.expression` using `simpleeval` (no `eval`); raises `FormulaEvaluationError` on invalid expression or missing variables
- [ ] `GET /api/formulas`: lists all formulas (system + household); `POST /api/formulas`: creates user formula; `DELETE /api/formulas/{id}`: hard-delete if user formula; 403 if system
- [ ] Unit test: straight-line depreciation formula evaluates to expected value for known inputs

---

### FORM-002 — Formula management frontend

**Size:** S · **Depends on:** FE-002, FORM-001 · **FRs:** FR-F-001 through FR-F-004 · **Ref:** UX §9.2

**Files:**
```
+ frontend/src/pages/Settings.tsx (extend — Formulas tab)
```

**AC:**
- [ ] Formulas tab in Settings: table listing all formulas with name, expression preview, applies_to, system badge
- [ ] System formulas: read-only; no edit/delete actions
- [ ] User formulas: edit name/expression in inline form; delete with `ConfirmationDialog`
- [ ] "Test Formula" button opens modal with variable inputs and evaluates live via `POST /api/formulas/evaluate` (pass `{ expression, variables }`)

---

## Epic 11 — Visualisations

**Purpose:** All charts, the Dashboard, VisualizationFilter integration, per-entity
visualisations, PersonDashboard filtering, and comparison mode.

**Pre-conditions:** Epics 1–9 complete.

**Post-conditions:** Dashboard shows real data. All charts render. Filter bar drives all charts.
Raw-currency and converted-aggregate toggle works.

---

### VIZ-001 — Visualisation aggregation API

**Size:** M · **Depends on:** BE-008, EVENT-002, BUDG-001, DEBT-001 · **FRs:** FR-V-001 through FR-V-010 · **Ref:** ARCH §6.2, EDP §13.5

**Files:**
```
+ backend/services/visualization_service.py
+ backend/schemas/visualization.py
+ backend/routes/visualizations.py
~ backend/main.py
```

**AC:**
- [ ] `GET /api/visualizations/spending-by-category`: accepts `VisualizationFilter` params; returns category totals + subcategory breakdown; supports `?currency=NZD` for display-currency conversion at response time using current `rate_to_base`
- [ ] `GET /api/visualizations/income-vs-expenses?month=YYYY-MM`: grouped bar data by month
- [ ] `GET /api/visualizations/net-worth-history?months=12`: monthly snapshots
- [ ] `GET /api/visualizations/account-balance-history/{account_id}`: monthly balance points
- [ ] `GET /api/visualizations/budget-vs-actual`: all active budgets for period with computed actuals
- [ ] All endpoints accept `?person_id=uuid` to filter to PersonDashboard view
- [ ] All endpoints accept `?raw_currency=true` for stacked raw-currency breakdown vs base-currency aggregate
- [ ] Integration test: create 3 transactions across 2 categories → `spending-by-category` returns correct totals

---

### VIZ-002 — Dashboard page

**Size:** L · **Depends on:** FE-005, VIZ-001, DEBT-002 · **FRs:** FR-V-001 through FR-V-005, FR-P-006 · **Ref:** UX §9.2

**Files:**
```
+ frontend/src/api/useVisualizations.ts
+ frontend/src/pages/Dashboard.tsx
+ frontend/src/components/dashboard/StatCard.tsx
+ frontend/src/components/dashboard/UpcomingPaymentsWidget.tsx
```

**AC:**
- [ ] Dashboard layout: stat cards row (Net Worth, Monthly Spend, Monthly Income, Household Debt), then charts row, then upcoming payments
- [ ] `StatCard`: value (large, `MonetaryValue`), label, trend indicator (up/down arrow with % vs last month); `Skeleton` while loading
- [ ] Spending by category doughnut chart (Recharts `PieChart`); clicking a segment calls `vizStore.drillDown({ categoryIds: [id] })` and navigates to Transactions with filter
- [ ] Income vs Expenses bar chart (Recharts `BarChart`); 6-month rolling default
- [ ] `UpcomingPaymentsWidget`: next 7 days of recurring occurrences + credit card due dates
- [ ] Household ⇌ My Finances toggle reads `authStore.currentPerson.default_view`; switching calls `PATCH /api/persons/{id}` to persist; all charts and widgets re-fetch with `?person_id` when in personal mode
- [ ] `CurrencyModeToggle` in topbar switches all charts between raw-currency stacked and converted aggregate simultaneously

---

### VIZ-003 — Per-entity chart components

**Size:** M · **Depends on:** FE-002, VIZ-001 · **FRs:** FR-V-006 through FR-V-010 · **Ref:** EDP §13.6, UX §7

**Files:**
```
+ frontend/src/components/visualization/SpendingByCategoryChart.tsx
+ frontend/src/components/visualization/NetWorthChart.tsx
+ frontend/src/components/visualization/BudgetVsActualChart.tsx
+ frontend/src/components/visualization/AccountBalanceChart.tsx
+ frontend/src/components/visualization/ForexLossTrendChart.tsx
```

**AC:**
- [ ] All charts use Recharts; all use entity accent CSS vars for colour; all show `SkeletonChart` while loading
- [ ] Every chart segment/bar/point is clickable and calls `vizStore.navigateTo` with the corresponding filter; no dead chart interactions
- [ ] `BudgetVsActualChart`: grouped bar per category; threshold line; colour bands at 80% and 100%
- [ ] `ForexLossTrendChart`: line chart of cumulative `fx_delta` over time; renders on accounts page for each FX account
- [ ] `CurrencyModeToggle` state from `vizStore` drives all charts simultaneously — switching raw/converted does not cause a page reload, only a data re-query

---

### VIZ-004 — Comparison mode

**Size:** M · **Depends on:** VIZ-002, VIZ-003 · **FRs:** FR-V-011, FR-V-012 · **Ref:** EDP §13.5

**Files:**
```
~ backend/routes/visualizations.py
~ frontend/src/pages/Dashboard.tsx
+ frontend/src/components/visualization/ComparisonChart.tsx
```

**AC:**
- [ ] `GET /api/visualizations/comparison`: accepts `comparison_mode` (`"period"` / `"person"` / `"account"`), `comparison_ids` (list of IDs or date ranges), `group_by` (`"category"` / `"month"`); returns side-by-side aggregation data per comparison ID
- [ ] `ComparisonChart`: grouped bar chart with one colour per comparison entity; legend per entity
- [ ] Dashboard "Compare" button opens comparison panel; mode and IDs selectable; closes and resets filter
- [ ] Period-over-period: current month vs same month last year vs previous month

---

## Epic 12 — Import / Export

**Purpose:** CSV import wizard with column detection, duplicate detection, and the
CAT-004 category mapping service. CSV export of filtered transaction data.

**Pre-conditions:** Epics 1–6 complete. CAT-004 complete.

**Post-conditions:** Full CSV import and export flow working. Import wizard handles all error cases.

---

### IMPORT-001 — CSV parser and column detection backend

**Size:** S · **Depends on:** BE-008 · **FRs:** FR-IE-001 through FR-IE-006 · **Ref:** EDP §13.4

**Files:**
```
+ backend/services/import_export_service.py
+ backend/schemas/import_export.py
```

**AC:**
- [ ] `parse_csv(file_bytes) → ParsedCsv`: detects encoding (UTF-8 with BOM fallback); returns `{ headers, rows, row_count }`; max 10,000 rows (returns 400 if exceeded)
- [ ] `detect_columns(headers, sample_rows) → ColumnMapping`: heuristic matching for `date`, `amount`, `description`, `category`, `account`; returns confidence score per column; user can override
- [ ] `validate_rows(rows, column_mapping) → ValidationResult`: checks date format (multiple formats → ISO), amount parseable (handles currency symbols, commas), required fields present; returns `{ valid_rows, invalid_rows: [{row, error}] }`
- [ ] Unit tests: CSV with BOM, currency symbols in amounts, mismatched date formats all handled

---

### IMPORT-002 — Import execution service

**Size:** M · **Depends on:** IMPORT-001, EVENT-002, CAT-004 · **FRs:** FR-IE-001 through FR-IE-006 · **Ref:** ARCH §5.3

**Files:**
```
~ backend/services/import_export_service.py
+ backend/routes/import_export.py
~ backend/main.py
```

**AC:**
- [ ] `POST /api/import/preview`: accepts CSV file + column mapping; calls `validate_rows`; calls `preview_category_mappings`; calls `detect_duplicate` for each row; returns `{ valid, invalid, category_mappings, duplicate_candidates }`
- [ ] `POST /api/import/execute`: accepts `{ rows, column_mapping, category_mappings, skip_duplicates }`; creates transactions in bulk; auto-creates unmapped categories via `auto_create_category`; returns `{ imported, skipped_duplicates, failed, created_categories }`
- [ ] All import rows created in a single DB transaction; if any row fails with unrecoverable error, entire import rolls back
- [ ] `GET /api/export/transactions?format=csv`: streams CSV of current filtered transactions; column order: Date, Name, Category, Payee, Amount, Currency, Status
- [ ] Integration test: upload 50-row CSV → preview returns correct mapping → execute → 50 transactions in DB

---

### IMPORT-003 — Import / export frontend wizard

**Size:** M · **Depends on:** FE-005, IMPORT-002 · **FRs:** FR-IE-001 through FR-IE-006 · **Ref:** UX §6.9

**Files:**
```
+ frontend/src/components/entity/ImportWizard.tsx
```

**AC:**
- [ ] 3-step wizard rendered in a `Modal` (`lg` size)
- [ ] Step 1: file upload dropzone; validates CSV MIME type; shows file name + row count on success
- [ ] Step 2: column mapping dropdowns (one per detected column); category mapping table showing match type `Badge` (exact/fuzzy/unmapped) + target dropdown; duplicate warning rows in amber with "Skip" checkbox
- [ ] Step 3: confirm summary → loading overlay → `ImportResult` card (imported / skipped / failed counts; created categories list)
- [ ] Export button in Transactions page action bar; applies current `VisualizationFilter` before download

---

## Epic 13 — Settings, Currencies & Backup

**Purpose:** Person profile management, full currency CRUD, FX rate scheduler,
base currency change with recalculation, and GCS backup.

**Pre-conditions:** Epics 1–3 complete (Settings tab shells exist from AUTH-004).

**Post-conditions:** Full settings page operational. FX rates fetched daily. Backups running.

---

### SETTINGS-001 — Person and currency API routes

**Size:** S · **Depends on:** BE-008, AUTH-002 · **FRs:** FR-P-003, FR-P-004, FR-CU-001 through FR-CU-008 · **Ref:** ARCH §6.2

**Files:**
```
+ backend/routes/currencies.py
~ backend/routes/persons.py
~ backend/main.py
```

**AC:**
- [ ] `PATCH /api/persons/{id}`: self or admin; updates `display_name`, `display_currency` (must be a configured household currency), `default_view`; audit log
- [ ] Currency CRUD: `GET/POST/PATCH /api/currencies`; add currency (name, code, symbol, fee_pct); update (fee_pct, is_display_active); `GET /api/currencies/rates` with freshness indicator; `POST /api/currencies/rates/refresh` forces immediate FX fetch for all active currencies
- [ ] `POST /api/currencies/set-base`: owner-only; validates new base currency exists; triggers background `recalculate_all_amount_base` job; returns `{ job_id }`
- [ ] `recalculate_all_amount_base(db, household_id, new_base_code)`: updates `amount_base` on every `FinancialEvent`, `Account`, `Budget` using stored `fx_rate`; writes single `AuditLog` entry with `entity_type="household"`, `action="base_currency_change"`

---

### SETTINGS-002 — FX rate scheduler job

**Size:** S · **Depends on:** SETTINGS-001, RECUR-003 · **FRs:** FR-CU-006 · **Ref:** ARCH §9.3

**Files:**
```
+ backend/scheduler/jobs/fx_rate_job.py
~ backend/scheduler/registry.py
```

**AC:**
- [ ] Job runs daily at 01:00 UTC; fetches rates for all non-base currencies via ExchangeRate-API free tier (one request per household per day)
- [ ] On success: updates `Currency.rate_to_base` and `last_rate_at`; creates `FxRateHistory` record
- [ ] Circuit breaker: on API failure, preserves last known rate; logs WARNING; after 3 consecutive failures creates `Alert("fx_fetch_failed")`; no retry storm
- [ ] Unit test: mock API success → rate updated; mock API failure × 3 → alert created, rate preserved

---

### SETTINGS-003 — Settings page frontend (currencies and profile)

**Size:** M · **Depends on:** FE-007, AUTH-004, SETTINGS-001 · **FRs:** FR-CU-001 through FR-CU-008, FR-P-003, FR-P-004 · **Ref:** UX §9.5

**Files:**
```
+ frontend/src/api/useCurrencies.ts
~ frontend/src/pages/Settings.tsx
```

**AC:**
- [ ] Currencies tab: table with code, name, symbol, rate, freshness indicator, fee %, display-active toggle; "Add Currency" opens modal with code/name/symbol/fee fields
- [ ] Set Base Currency button (owner-only): `ConfirmationDialog` warning about recalculation; calls `POST /api/currencies/set-base`; shows progress banner while job runs
- [ ] "Refresh Rates" button: calls `POST /api/currencies/rates/refresh`; shows spinner; updates table on completion
- [ ] Profile section accessible from Topbar Avatar menu: display name input, display currency `Dropdown` (household currencies only), default view toggle (Household / Personal); saves via `PATCH /api/persons/{id}`

---

### SETTINGS-004 — Backup scheduler job

**Size:** S · **Depends on:** RECUR-003 · **FRs:** FR-SYS-006 · **Ref:** ARCH §13

**Files:**
```
+ backend/scheduler/jobs/backup_job.py
+ backend/services/backup_service.py
~ backend/scheduler/registry.py
```

**AC:**
- [ ] `backup_service.run_backup()`: WAL checkpoint (`PRAGMA wal_checkpoint(TRUNCATE)`); gzip the SQLite file; uploads to GCS at `gs://{GCS_BUCKET}/db/{YYYY-MM}/{YYYY-MM-DD}.db.gz`
- [ ] Backup job runs daily at 03:00 UTC
- [ ] On cold start (`/data/tracker.db` absent): `backup_service.restore_latest()` downloads latest GCS backup, decompresses, runs `alembic upgrade head`, then starts app
- [ ] Unit test: mock GCS client → upload called with correct path; mock download → file restored correctly

---

## Implementation Order (Recommended Sequence)

```
Phase A — Backend foundation (sequential)
  BE-001 → BE-002 → BE-003 → BE-004 → BE-005 → BE-006 → BE-007 → BE-008

Phase B — Frontend foundation (parallel with Phase A after BE-001)
  FE-001 → FE-002 → FE-003
             FE-002 → FE-004
  FE-003 + FE-004 → FE-005 → FE-006 → FE-007

Phase C — Auth & Household (after Phase A; FE-007 for AUTH-003+)
  AUTH-001 → AUTH-002
  AUTH-001 + FE-007 → AUTH-003 → AUTH-004

Phase D — Categories (after Phase C)
  CAT-001 → CAT-002 → CAT-003
  CAT-001 → CAT-004
  CAT-002 + FE-005 → CAT-005

Phase E — Accounts (after Phase C)
  ACCT-001 → ACCT-002 → ACCT-003
  ACCT-003 + FE-005 → ACCT-004

Phase F — Transactions (after Phases D and E)
  EVENT-001 → EVENT-002 → EVENT-003
  EVENT-003 + FE-005 + CAT-002 → EVENT-004

Phase G — Recurring (after Phase F)
  RECUR-001 → RECUR-002 → RECUR-003 → RECUR-004

Phase H — Budgets (after Phase F)
  BUDG-001 → BUDG-002 → BUDG-003
  BUDG-002 + FE-005 → BUDG-004

Phase I — Transfers & Debt (after Phase F)
  DEBT-001 → DEBT-002
  DEBT-002 + FE-005 → DEBT-003

Phase J — Formulas (after Phase E)
  FORM-001 → FORM-002

Phase K — Visualisations (after Phases G, H, I)
  VIZ-001 → VIZ-002 → VIZ-003 → VIZ-004

Phase L — Import/Export (after Phase F, CAT-004)
  IMPORT-001 → IMPORT-002 → IMPORT-003

Phase M — Settings & Currencies (after Phase C; can run parallel with K)
  SETTINGS-001 → SETTINGS-002 → SETTINGS-003
  SETTINGS-004 (parallel with SETTINGS-001 — no dependencies beyond RECUR-003)
```

---

## FR Coverage Map

| FR Group | Stories |
|---|---|
| FR-HH | AUTH-001, AUTH-002, AUTH-004 |
| FR-P | AUTH-001 through AUTH-004, SETTINGS-001, SETTINGS-003 |
| FR-A | ACCT-001 through ACCT-004 |
| FR-E | EVENT-001 through EVENT-004, RECUR-001 through RECUR-004, DEBT-001 through DEBT-003 |
| FR-B | BUDG-001 through BUDG-004 |
| FR-C | CAT-001 through CAT-005 |
| FR-CU | SETTINGS-001 through SETTINGS-003 |
| FR-F | FORM-001, FORM-002 |
| FR-D | DEBT-001 through DEBT-003 |
| FR-V | VIZ-001 through VIZ-004, EVENT-004, BUDG-004 |
| FR-IE | IMPORT-001 through IMPORT-003, CAT-004 |
| FR-SYS | BE-008, RECUR-003, BUDG-003, VIZ-001, SETTINGS-002, SETTINGS-004 |

---

## Story Status Tracking

| Story | Title | Status |
|---|---|---|
| BE-001 | Python project scaffold and config | done |
| BE-002 | BaseEntity, MonetaryValueMixin, enums | done |
| BE-003 | Household, Person, Session, Invitation models | done |
| BE-004 | Account and related models | done |
| BE-005 | FinancialEvent and OccurrenceRecord models | done |
| BE-006 | Budget, Category, Currency, Formula, Audit, Alert | done |
| BE-007 | Alembic initial migration | done |
| BE-008 | FastAPI app, middleware, DI, audit service | done |
| FE-001 | Vite + React scaffold and design tokens | done |
| FE-002 | Design system: atomic components | done |
| FE-003 | Design system: form and selection components | done |
| FE-004 | Design system: containers, layout, feedback | done |
| FE-005 | Generic entity components | done |
| FE-006 | Zustand stores and TanStack Query client | done |
| FE-007 | App shell, routing, auth guard | done |
| AUTH-001 | Google OAuth backend | pending |
| AUTH-002 | Household member management backend | pending |
| AUTH-003 | Auth frontend | pending |
| AUTH-004 | Household settings and members frontend | pending |
| CAT-001 | Category schemas and service | pending |
| CAT-002 | Category routes and hierarchy endpoints | pending |
| CAT-003 | Category merge and duplicate detection | pending |
| CAT-004 | Import category mapping service | pending |
| CAT-005 | Category management frontend | pending |
| ACCT-001 | Account Pydantic schemas | pending |
| ACCT-002 | Account service | pending |
| ACCT-003 | Account API routes and valuations | pending |
| ACCT-004 | Account frontend pages | pending |
| EVENT-001 | Event Pydantic schemas | pending |
| EVENT-002 | Transaction service | pending |
| EVENT-003 | Event API routes | pending |
| EVENT-004 | Transaction ledger frontend + CategorySelect | pending |
| RECUR-001 | RecurringDateParser | pending |
| RECUR-002 | Recurring payment service and routes | pending |
| RECUR-003 | Scheduler: recurring processor + missed detection | pending |
| RECUR-004 | Recurring payments frontend | pending |
| BUDG-001 | Budget schemas and service | pending |
| BUDG-002 | Budget API routes | pending |
| BUDG-003 | Budget scheduler | pending |
| BUDG-004 | Budget frontend with drill-down | pending |
| DEBT-001 | Transfer service and debt computation | pending |
| DEBT-002 | Transfer API routes | pending |
| DEBT-003 | Transfers frontend and debt widget | pending |
| FORM-001 | Formula service and routes | pending |
| FORM-002 | Formula management frontend | pending |
| VIZ-001 | Visualisation aggregation API | pending |
| VIZ-002 | Dashboard page | pending |
| VIZ-003 | Per-entity chart components | pending |
| VIZ-004 | Comparison mode | pending |
| IMPORT-001 | CSV parser and column detection | pending |
| IMPORT-002 | Import execution service | pending |
| IMPORT-003 | Import/export frontend wizard | pending |
| SETTINGS-001 | Person and currency API routes | pending |
| SETTINGS-002 | FX rate scheduler job | pending |
| SETTINGS-003 | Settings frontend: currencies and profile | pending |
| SETTINGS-004 | Backup scheduler job | pending |

---

## Revision History

| Version | Date | Author | Change |
|---|---|---|---|
| 3.0 | 2026-05-28 | Ben + Claude | Full rewrite. Clean-repo start — no refactor epic. 55 stories across 13 epics. Compact coding-agent format. Builds entity hierarchy (BaseEntity, MonetaryValue, STI) correctly from day 1. Frontend design system fully specified before feature pages. Lessons from stories 1-1 → 2-5 incorporated into AC and notes. |
| 3.1 | 2026-05-29 | Ben + Claude | Marked Epic 1 (BE-001–BE-008) and Epic 2 (FE-001–FE-007) as complete. Updated all AC checkboxes to checked. Added Epic 2 delivered deliverables block (design system component inventory, authStore mock Dev User, /design-system route). BE-008 status corrected from ready-for-dev to done in story table. |
