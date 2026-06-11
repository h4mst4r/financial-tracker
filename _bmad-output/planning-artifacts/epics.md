---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-financial-tracker-2026-05-23/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
  - _bmad-output/planning-artifacts/entity-design-philosophy.md
  - _bmad-output/planning-artifacts/briefs/brief-financial-tracker-2026-05-23/brief.md
---

# Financial Tracker — Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Financial Tracker, decomposing the requirements from the PRD, UX Design Specification, Architecture, and Entity Design Philosophy into implementable stories.

**Epic ordering principle:** FR-SYS (System) infrastructure epics come first, followed by FR-HH (Household) as the foundational domain layer. This ensures the platform is operational before any business logic depends on it.

---

## Requirements Inventory

### Functional Requirements

> **Ordering rationale:** FR-SYS (infrastructure) → FR-HH (tenant) → FR-P (users) → FR-C (categories) → FR-V (visualization viewer + mini-charts, needed by accounts/budgets/currencies) → FR-A (accounts, use mini-charts) → FR-CU (currencies, needed before transactions for MonetaryValue) → FR-E (events, depend on accounts+categories+currencies) → FR-B (budgets, depend on events+categories) → FR-F (formulas, used by accounts) → FR-D (debt, computed from events+accounts) → FR-DB (dashboard, aggregates everything) → FR-IE (import/export, data migration)

#### FR-SYS — System Requirements

| FR | Description |
|---|---|
| FR-SYS-001 | Public and Error Pages (Login, Access Denied, Forbidden, Refused Connection, Not Invited, Logout, Lost Connection, Loading, Generic Error) |
| FR-SYS-002 | Localhost Dev Account (OAuth bypass when env=dev and flag=true) |
| FR-SYS-003 | Google OAuth 2.0 Authentication (Authorization Code flow, confidential client, HMAC-signed state cookie, 30-min idle timeout) |
| FR-SYS-004 | CSRF Protection (per-session synchronizer token, delivered via `/auth/me`, 403 on invalid) |
| FR-SYS-005 | Audit Trail (append-only, every create/update/archive/restore/delete, before/after JSON snapshots) |
| FR-SYS-006 | Recurring Payment Scheduler (Cloud Scheduler → authenticated job endpoint, idempotent, catch-up aware) |
| FR-SYS-007 | In-App Alerts (BUDGET_WARNING, BUDGET_EXCEEDED, RECURRING_MISSED, FX_RATE_STALE, UPCOMING_PAYMENTS, FX_API_DOWN, BACKUP_CREATED) |
| FR-SYS-008 | Daily Backup (SQLite → GCS, 90-day retention, cold-start restore) |
| FR-SYS-009 | Responsive UI (desktop ≥1280px, tablet ≥768px, mobile ≥375px) |
| FR-SYS-010 | Global Search & Command Palette (Cmd/Ctrl-K, cross-entity search, navigation commands) |
| FR-SYS-011 | Branding Configuration (swappable `branding` config, no hardcoded brand strings) |

#### FR-HH — EntityHousehold

| FR | Description |
|---|---|
| FR-HH-001 | Household Creation (approved owners list → New Household modal; pending invitation → Pending Invitation modal) |
| FR-HH-002 | Household Configuration and Management (name, timezone, date/time, base currency, members list, invitations list) |
| FR-HH-003 | Member Invitation (Google email, in-app only, Household Conflict modal for existing members) |
| FR-HH-004 | Invitation Management (pending/accepted/declined status, revoke, shareable join URL) |
| FR-HH-005 | Household Permanent Deletion (owner-only, type household name confirmation, cascade delete) |

#### FR-P — EntityPersons

| FR | Description |
|---|---|
| FR-P-001 | Google OAuth Login (redirect to Google, session cookie, redirect to Dashboard) |
| FR-P-002 | Join Household (pending invitation → accept/decline, member role) |
| FR-P-003 | Profile & Appearance Management (display_name, colour, theme, font, density, reduce_motion, notification_prefs) |
| FR-P-004 | Display Currency Preference (per-person display currency, dashboard converts) |
| FR-P-005 | Role Management (owner changes member ↔ admin) |
| FR-P-006 | PersonDashboard (Household/Individual toggle, member dropdown, permission-aware) |
| FR-P-007 | Archive Member (archived member can't log in, data preserved, "(archived)" label) |
| FR-P-008 | Hard Delete Empty Person (FK check, only if no records exist) |

#### FR-C — EntityCategories

| FR | Description |
|---|---|
| FR-C-001 | Create Category (name, color, icon, category_type, depth=0) |
| FR-C-002 | Create Subcategory (under top-level, max depth=1) |
| FR-C-003 | Unparent Subcategory (promote to top-level, depth=0) |
| FR-C-004 | Edit Category (name, color, icon, category_type, immediate reflection) |
| FR-C-005 | Archive Category (hidden from dropdowns, preserves historical events, archives subcategories together) |
| FR-C-006 | Hard Delete Empty Category (dependency scan, zero linked events/budgets/recurring) |
| FR-C-007 | Default Category Creation (17 defaults: 12 expense + 5 income, idempotent) |
| FR-C-008 | Category Spending Rollup (parent total includes all child transactions) |

#### FR-V — EntityVisualization

| FR | Description |
|---|---|
| FR-V-001 | VisualizationFilter Controls (time range, person, category, account, type, currency mode) |
| FR-V-002 | Chart Segment Drill-Down (click segment → filter, breadcrumb trail, dismissible chips) |
| FR-V-003 | Cross-Module Navigation (carry VisualizationFilter across modules, browser back) |
| FR-V-004 | Raw vs Converted Currency Toggle (global, single response) |
| FR-V-005 | Person Comparison Mode (2-4 members, grouped bars/multi-line) |
| FR-V-006 | Category Comparison Mode (2-8 categories, multi-line/grouped bar) |
| FR-V-007 | Budget History Chart (limit vs actual, monthly/yearly periods) |
| FR-V-008 | Capital / Portfolio History Chart (value, inflow, outflow, interest over time) |
| FR-V-009 | PersonDashboard Individual Mode (net worth, spending, income, budget, debt — filtered to person) |
| FR-V-010 | Date Display Format (DD-MM-YYYY display, ISO 8601 storage) |
| FR-V-011 | Universal Visualization Viewer (single reusable component, inline/full-screen, filter-driven) |
| FR-V-012 | Entity History Mini-Chart (compact on card, expands to universal viewer) |
| FR-V-013 | Event-Group Aggregation (filtered event set aggregated over time, count/sum/avg) |
| FR-V-014 | Chart Type Selection (line, bar, pie, area, stacked — invalid types disabled) |
| FR-V-015 | Series Toggle & Auto Colour-Coding (stable colours per series, legend toggle) |

#### FR-A — EntityAccounts

| FR | Description |
|---|---|
| FR-A-001 | Create Account (any type, adaptive form, default owner, MonetaryValue, opening balance for ledger-backed) |
| FR-A-002 | Edit Account (persist changes, refresh updated_at/updated_by, audit log) |
| FR-A-003 | Archive / Restore Account (hidden from defaults, transaction history preserved) |
| FR-A-004 | Hard Delete Empty Account (dependency scan, only if zero FK references) |
| FR-A-005 | Duplicate Account (clone all fields, new UUID, duplicating person as owner) |
| FR-A-006 | Multiple Account Owners (add/remove owners, minimum one owner) |
| FR-A-007 | Account Transaction History (filtered list by source_account_id, paginated, sortable) |
| FR-A-008 | Account Value Snapshots & History (AccountSnapshot records, computed for ledger-backed, manual for asset-like) |
| FR-A-009 | BankAccount: Interest Rate (optional interest_rate and interest_frequency) |
| FR-A-010 | CreditCard: Limit and Billing (credit_limit, billing_day, due_day, rewards_type, annual_fee) |
| FR-A-011 | CreditCard: Computed Debt Display (debt balance on card and detail view) |
| FR-A-012 | Capital: Investment Type and Values (investment_type, cost_basis, current_value, ROI) |
| FR-A-013 | Asset: Purchase and Depreciation (asset_type, purchase_date, purchase_value, depreciation_formula_id) |
| FR-A-014 | Add Manual Value Snapshot (any account type, any time) |
| FR-A-015 | Account Value History Chart (mini-chart on card, detail view, line/bar, raw/converted) |
| FR-A-016 | Insurance: Policy Details (policy_type, coverage_types, premium_frequency, purchase_date, coverage_amount, insurer) |
| FR-A-017 | Account-Linked Recurring Payment (Asset/Capital/Insurance → creates RecurringPayment entity) |

#### FR-E — EntityEvents

| FR | Description |
|---|---|
| FR-E-001 | Create Transaction (inflow/outflow, required fields, context pre-fill, provenance source/external_ref) |
| FR-E-002 | Edit Transaction/s (admin/owner any, member own, audit log, budget actuals recompute) |
| FR-E-003 | Duplicate Transaction/s (copy all values, open edit modal) |
| FR-E-004 | Archive / Restore Transaction/s (excluded from budget actuals and reports) |
| FR-E-005 | Transaction Status (pending/completed/cancelled/reconciled) |
| FR-E-006 | Reconciliation (mark reconciled, reconciled_at, filter unreconciled) |
| FR-E-007 | Shared Household Expense Flag (is_shared_expense on outflow only, updates computed debt) |
| FR-E-008 | Duplicate Detection (on save, show warning, proceed/link/cancel) |
| FR-E-009 | MonetaryValue Entry (foreign currency, paid-with account, auto-fill amount_base_calculated, manual override, fx_delta) |
| FR-E-010 | GST and Gift Flags (is_gst_claimable, is_gift, icons, filterable) |
| FR-E-011 | Create Recurring Payment (free-text frequency_text, parsed next occurrence, structured frequency_rule) |
| FR-E-012 | Recurring Date Patterns (9 patterns: every weekday, weekly, monthly, Nth of month, every N days, every N weeks, Nth weekday of month, month day, yearly) |
| FR-E-013 | Occurrence History (expected occurrences, status badges, linked transaction) |
| FR-E-014 | Skip Occurrence (manual skip, no transaction generated) |
| FR-E-015 | Trigger Occurrence (manual trigger on current date) |
| FR-E-016 | Missed Occurrence Alert (RECURRING_MISSED alert on next daily job) |
| FR-E-017 | Create Transfer (source/destination accounts, MonetaryValue, cross-currency fx_delta) |
| FR-E-018 | Debt Repayment Auto-Detection (transfer to CreditCard → is_debt_repayment=true) |
| FR-E-019 | Override Debt Repayment Flag (set false on auto-detected transfer) |
| FR-E-020 | Bulk Operations (generic multi-select hook + BulkActionBar, events and categories) |
| FR-E-021 | Favourite & Manual Sort (per-person, entity_preferences table, star toggle, drag reorder) |

#### FR-B — EntityBudgets

| FR | Description |
|---|---|
| FR-B-001 | Create Monthly Budget (category, person-scoped or household-wide, period dates) |
| FR-B-002 | Create Yearly Budget (coexists with monthly for same category) |
| FR-B-003 | Real-Time Budget Actuals (computed live from matching events, never stored) |
| FR-B-004 | Budget Alert Threshold (BUDGET_WARNING at threshold%, BUDGET_EXCEEDED at >100%) |
| FR-B-005 | Monthly Budget Auto-Rollover (scheduler creates next month's budget, copies limit) |
| FR-B-006 | Budget Drill-Down Level 2 (click bar → transaction list filtered by category/period/owner) |
| FR-B-007 | Budget Drill-Down Level 3 (subcategory breakdown if parent has children) |
| FR-B-008 | Budget History (trend chart, limit vs actual, all historical periods) |
| FR-B-009 | Rollover Unspent Balance (rollover=true → new limit = prior_limit + prior_unspent) |

#### FR-CU — EntityCurrencies

| FR | Description |
|---|---|
| FR-CU-001 | View Currency List (FX rate, last-fetched, fee%, base/display-active, stale warning) |
| FR-CU-002 | Add Currency (any ISO 4217, fetch FX immediately) |
| FR-CU-003 | Configure Display Currencies (toggle is_display_active for switcher) |
| FR-CU-004 | Per-Person Display Currency (from display-active set) |
| FR-CU-005 | Change Base Currency (owner-only, background job recalculates all amount_base) |
| FR-CU-006 | Daily FX Rate Fetch (scheduler, provider fallback chain, circuit breaker) |
| FR-CU-007 | Conversion Fee Configuration (fee_pct per currency, pre-fills fee_amount) |
| FR-CU-008 | Raw vs Converted Toggle (global, affects all charts simultaneously) |
| FR-CU-009 | FX Rate History & Chart (line chart, day/month grouping, mini-chart on card) |
| FR-CU-010 | FX Provider Configuration (ordered list, Secret Manager API keys, per-currency resolution) |

#### FR-F — EntityFormulas

| FR | Description |
|---|---|
| FR-F-001 | View System Default Formulas (read-only, depreciation, interest, amortisation, FX delta, budget variance, net worth) |
| FR-F-002 | Create Custom Formula (name, expression, target entity type, variable definitions) |
| FR-F-003 | Assign Formula to Account (depreciation, FX fee, compound interest — three assignment types) |
| FR-F-004 | Hover-Reveal Formula Results (tooltip on hover, formula name, inputs, result, source date) |
| FR-F-005 | FX Formula Auto-Fill in Transaction Entry (account has FX formula → auto-fill amount_base_calculated) |
| FR-F-006 | Generate Value Snapshot from Formula (AssetAccount → new AccountSnapshot with source=formula) |

#### FR-D — EntityDebt

| FR | Description |
|---|---|
| FR-D-001 | Computed Debt (derived at query time, no debt entity in data model) |
| FR-D-002 | Credit Card Debt Display (on card, dashboard debt summary, debt visualization) |
| FR-D-003 | Internal Household Debt Display (per-person owed amount, contributing transactions, drill-down) |
| FR-D-004 | Auto-Clear Credit Card Debt via Transfer (destination=CreditCard → is_debt_repayment=true) |
| FR-D-005 | Auto-Clear Internal Household Debt via Transfer (destination person has household_debt > 0) |
| FR-D-006 | Override Debt Repayment Flag (confirmation dialog, debt NOT reduced) |
| FR-D-007 | Debt Summary Drill-Down (click debt balance → contributing transactions list) |

#### FR-DB — Dashboard

| FR | Description |
|---|---|
| FR-DB-001 | Net Worth Computation (Σ positive − Σ liabilities, display currency, archived excluded) |
| FR-DB-002 | Net Worth Over Time (monthly snapshots, display currency) |
| FR-DB-003 | Dashboard Pinning, Sizing & Add-Widget (drag reorder, resize S/M/L, per-person layout, mobile reflow) |

#### FR-IE — Import / Export

| FR | Description |
|---|---|
| FR-IE-001 | CSV Upload (multipart, 10MB limit, text/csv MIME) |
| FR-IE-002 | Two-Step Import Flow (preview + mapping → confirm, no data loss) |
| FR-IE-003 | Category Mapping Suggestions (case-insensitive match, green/yellow highlights) |
| FR-IE-004 | Duplicate Detection During Import (Conflicting Transactions modal, Keep Newer/Existing/Both) |
| FR-IE-005 | v1 Column Compatibility (parse v1 Google Sheets export columns) |
| FR-IE-006 | CSV Export (all VisualizationFilter applied, ISO 8601 dates) |

---

### Non-Functional Requirements

| NFR | Description |
|---|---|
| NFR-1 | Page initial load < 3 seconds on 10 Mbps |
| NFR-2 | CRUD API response < 500ms p95 |
| NFR-3 | Aggregation API response < 2 seconds p95 |
| NFR-4 | Transaction entry end-to-end < 5 seconds |
| NFR-5 | Chart render after filter change < 1 second |
| NFR-6 | Cold start (Cloud Run) < 5 seconds |
| NFR-7 | Google OAuth 2.0 only — no password storage |
| NFR-8 | All traffic HTTPS; HSTS enforced |
| NFR-9 | CSRF protection on all mutations |
| NFR-10 | All queries household-scoped at service layer |
| NFR-11 | No raw SQL — SQLAlchemy ORM only |
| NFR-12 | Secrets via Google Secret Manager only |
| NFR-13 | Security headers: CSP, X-Frame-Options, Referrer-Policy |
| NFR-14 | OWASP ZAP scan in CI on each release; zero critical findings |
| NFR-15 | 99% uptime target (Cloud Run SLA) |
| NFR-16 | Daily backup with 90-day retention |
| NFR-17 | Circuit breakers on all external API calls |
| NFR-18 | WCAG 2.1 Level AA compliance |
| NFR-19 | Full keyboard navigation (Tab, Enter, Escape, arrow keys) |
| NFR-20 | ARIA labels on all interactive elements |
| NFR-21 | Minimum 4.5:1 contrast ratio on all text |
| NFR-22 | Minimum 44×44px touch targets on mobile |
| NFR-23 | prefers-reduced-motion respected |
| NFR-24 | Latest two versions of Chrome, Firefox, Safari, Edge |
| NFR-25 | Mobile: Chrome for Android, Safari for iOS |
| NFR-26 | All monetary values stored as Decimal(15,4) — no floating point |
| NFR-27 | is_shared_expense enforced at DB level (CHECK constraint) |
| NFR-28 | Category depth enforced at DB level (CHECK constraint, max=1) |
| NFR-29 | Audit trail is append-only — no deletion mechanism |

---

### Additional Requirements (Architecture)

- **Stack:** Python 3.12 + FastAPI (async, ASGI) + uvicorn
- **Database:** SQLite (WAL mode) via aiosqlite, foreign_keys=ON
- **ORM:** SQLAlchemy 2.0 typed `Mapped[...]` models, async session
- **Migrations:** Alembic
- **Frontend:** React + Vite + Tailwind CSS + TanStack Query + Zustand
- **Hosting:** Google Cloud Run, min-instances=0 (scale-to-zero)
- **Auth:** Google OAuth (Authorization Code, confidential client), `google-auth` + `httpx`
- **Sessions:** Opaque server-side session tokens in HttpOnly cookies
- **CSRF:** Per-session synchronizer token (one per session, not single-use)
- **Scheduler:** Cloud Scheduler → authenticated job endpoint (not in-process timer)
- **FX:** Provider fallback chain in `fx_providers` table, per-currency resolution, circuit breaker
- **Secrets:** Google Secret Manager for API keys (never persisted in plaintext)
- **Backup:** Daily SQLite → GCS, 90-day retention, cold-start restore
- **Money:** `Decimal`, `NUMERIC(15,4)` for amounts, `NUMERIC(10,6)` for FX rates
- **DI Chain:** `get_db` → `get_current_person` → `get_household_id`
- **Error Responses:** RFC 7807 Problem Details via global handler
- **Household Deletion:** Person rows survive (household_id=NULL), seed_household_if_needed on re-login
- **Dev Auth Bypass:** `AUTH_BYPASS_ENABLED=true` env var, middleware auto-injects dev session

---

### UX Design Requirements

| UX-DR | Description |
|---|---|
| UX-DR-1 | Design token system in `index.css` — `@theme` CSS variables for colors, typography, spacing, motion |
| UX-DR-2 | Immersive theming — 5 starter palettes (Base Dark, Base Light, Retro 70s, Muted Brown, Game Boy DMG), `immersive` flag, `tint` + `tint_ramp` remapping |
| UX-DR-3 | Generic entity layer — `EntityCard<T>`, `EntityModal<T>`, `EntityPage<T>`, `useEntityManager<T>` hook |
| UX-DR-4 | Input component — text input with focus ring (`ring-glow-primary`), validation states |
| UX-DR-5 | Dropdown component — picker trigger button pattern, panel, search, list items |
| UX-DR-6 | DatePicker component — calendar grid, date selection, DD-MM-YYYY format |
| UX-DR-7 | ColourPicker component — palette grid + hex input, colour swatch selection ring |
| UX-DR-8 | EmojiIconPicker component — emoji/icon tabs, search, grid |
| UX-DR-9 | SegmentedControl component — two-option mode toggle, border-state tokens |
| UX-DR-10 | Tooltip component — CSS-only hover, auto-flip, Escape key dismiss |
| UX-DR-11 | Skeleton components — shimmer animation, stat/chart shapes, `bg-surface-active` shimmer peak |
| UX-DR-12 | ConfirmActions component — destructive action confirmation pattern |
| UX-DR-13 | StatusMessage component — success/warning/error/info states |
| UX-DR-14 | EmptyState component — no-data placeholder with illustration and CTA |
| UX-DR-15 | CategoryTree component — colour-fill identity, expand/collapse, drag reorder, context menu, row patterns |
| UX-DR-16 | Visualization Viewer — universal reusable chart component (line, bar, pie, area, stacked) |
| UX-DR-17 | Design System page (`/design-system`) — demo sections for all components, real exported components |
| UX-DR-18 | Responsive breakpoints — desktop ≥1280px, tablet ≥768px, mobile ≥375px |
| UX-DR-19 | Motion system — transitions (100ms/150ms/300ms), shimmer animation, `prefers-reduced-motion` |
| UX-DR-20 | Entity colour-fill identity pattern — `--entity-colour` CSS variable, calm/vivid fills, contrast-aware text |

---

### FR Coverage Map

FR-SYS-001: Epic 1 — Platform Foundation (public/error pages)
FR-SYS-002: Epic 1 — Platform Foundation (dev auth bypass)
FR-SYS-003: Epic 2 — Household & Authentication (Google OAuth flow)
FR-SYS-004: Epic 2 — Household & Authentication (CSRF protection)
FR-SYS-005: Epic 1 — Platform Foundation (audit trail infrastructure)
FR-SYS-006: Epic 7 — Recurring Payments & Transfers (scheduler job endpoint)
FR-SYS-007: Epic 8 — Budgets (budget alerts) + Epic 7 — Recurring Payments & Transfers (recurring alerts) + Epic 9 — Currencies & FX (FX alerts)
FR-SYS-008: Epic 1 — Platform Foundation (backup job)
FR-SYS-009: Epic 1 — Platform Foundation (responsive breakpoints)
FR-SYS-010: Epic 1 — Platform Foundation (global search + command palette)
FR-SYS-011: Epic 1 — Platform Foundation (branding config)
FR-HH-001: Epic 2 — Household & Authentication (household creation on first login)
FR-HH-002: Epic 2 — Household & Authentication (household settings page)
FR-HH-003: Epic 2 — Household & Authentication (member invitations)
FR-HH-004: Epic 2 — Household & Authentication (invitation management)
FR-HH-005: Epic 2 — Household & Authentication (household deletion)
FR-P-001: Epic 2 — Household & Authentication (Google OAuth login)
FR-P-002: Epic 2 — Household & Authentication (join household via invitation)
FR-P-003: Epic 2 — Household & Authentication (profile & appearance settings)
FR-P-004: Epic 2 — Household & Authentication (display currency preference)
FR-P-005: Epic 2 — Household & Authentication (role management)
FR-P-006: Epic 12 — Advanced Visualization (PersonDashboard toggle)
FR-P-007: Epic 2 — Household & Authentication (archive member)
FR-P-008: Epic 2 — Household & Authentication (hard delete empty person)
FR-C-001: Epic 3 — Categories (create category)
FR-C-002: Epic 3 — Categories (create subcategory)
FR-C-003: Epic 3 — Categories (unparent subcategory)
FR-C-004: Epic 3 — Categories (edit category)
FR-C-005: Epic 3 — Categories (archive category)
FR-C-006: Epic 3 — Categories (hard delete empty category)
FR-C-007: Epic 3 — Categories (default category creation)
FR-C-008: Epic 3 — Categories (category spending rollup)
FR-V-001: Epic 12 — Advanced Visualization (filter controls)
FR-V-002: Epic 12 — Advanced Visualization (chart segment drill-down)
FR-V-003: Epic 12 — Advanced Visualization (cross-module navigation)
FR-V-004: Epic 12 — Advanced Visualization (raw vs converted toggle)
FR-V-005: Epic 12 — Advanced Visualization (person comparison mode)
FR-V-006: Epic 12 — Advanced Visualization (category comparison mode)
FR-V-007: Epic 12 — Advanced Visualization (budget history chart)
FR-V-008: Epic 12 — Advanced Visualization (capital/portfolio history chart)
FR-V-009: Epic 12 — Advanced Visualization (PersonDashboard individual mode)
FR-V-010: Epic 4 — Visualization Foundation (date display format)
FR-V-011: Epic 4 — Visualization Foundation (universal visualization viewer)
FR-V-012: Epic 4 — Visualization Foundation (entity history mini-chart)
FR-V-013: Epic 12 — Advanced Visualization (event-group aggregation)
FR-V-014: Epic 4 — Visualization Foundation (chart type selection)
FR-V-015: Epic 4 — Visualization Foundation (series toggle & auto colour-coding)
FR-A-001: Epic 5 — Accounts (create account)
FR-A-002: Epic 5 — Accounts (edit account)
FR-A-003: Epic 5 — Accounts (archive/restore account)
FR-A-004: Epic 5 — Accounts (hard delete empty account)
FR-A-005: Epic 5 — Accounts (duplicate account)
FR-A-006: Epic 5 — Accounts (multiple account owners)
FR-A-007: Epic 5 — Accounts (account transaction history)
FR-A-008: Epic 5 — Accounts (account value snapshots & history)
FR-A-009: Epic 5 — Accounts (BankAccount interest rate)
FR-A-010: Epic 5 — Accounts (CreditCard limit and billing)
FR-A-011: Epic 5 — Accounts (CreditCard computed debt display)
FR-A-012: Epic 5 — Accounts (Capital investment type and values)
FR-A-013: Epic 5 — Accounts (Asset purchase and depreciation)
FR-A-014: Epic 5 — Accounts (add manual value snapshot)
FR-A-015: Epic 5 — Accounts (account value history chart)
FR-A-016: Epic 5 — Accounts (Insurance policy details)
FR-A-017: Epic 5 — Accounts (account-linked recurring payment)
FR-E-001: Epic 7 — Transactions (create transaction)
FR-E-002: Epic 7 — Transactions (edit transactions)
FR-E-003: Epic 7 — Transactions (duplicate transactions)
FR-E-004: Epic 7 — Transactions (archive/restore transactions)
FR-E-005: Epic 7 — Transactions (transaction status)
FR-E-006: Epic 7 — Transactions (reconciliation)
FR-E-007: Epic 7 — Transactions (shared household expense flag)
FR-E-008: Epic 7 — Transactions (duplicate detection)
FR-E-009: Epic 7 — Transactions (MonetaryValue entry)
FR-E-010: Epic 7 — Transactions (GST and gift flags)
FR-E-011: Epic 8 — Recurring Payments & Transfers (create recurring payment)
FR-E-012: Epic 8 — Recurring Payments & Transfers (recurring date patterns)
FR-E-013: Epic 8 — Recurring Payments & Transfers (occurrence history)
FR-E-014: Epic 8 — Recurring Payments & Transfers (skip occurrence)
FR-E-015: Epic 8 — Recurring Payments & Transfers (trigger occurrence)
FR-E-016: Epic 8 — Recurring Payments & Transfers (missed occurrence alert)
FR-E-017: Epic 8 — Recurring Payments & Transfers (create transfer)
FR-E-018: Epic 8 — Recurring Payments & Transfers (debt repayment auto-detection)
FR-E-019: Epic 8 — Recurring Payments & Transfers (override debt repayment flag)
FR-E-020: Epic 7 — Transactions (bulk operations)
FR-E-021: Epic 7 — Transactions (favourite & manual sort)
FR-B-001: Epic 9 — Budgets (create monthly budget)
FR-B-002: Epic 9 — Budgets (create yearly budget)
FR-B-003: Epic 9 — Budgets (real-time budget actuals)
FR-B-004: Epic 9 — Budgets (budget alert threshold)
FR-B-005: Epic 9 — Budgets (monthly budget auto-rollover)
FR-B-006: Epic 9 — Budgets (budget drill-down level 2)
FR-B-007: Epic 9 — Budgets (budget drill-down level 3)
FR-B-008: Epic 9 — Budgets (budget history)
FR-B-009: Epic 9 — Budgets (rollover unspent balance)
FR-CU-001: Epic 6 — Currencies & FX (view currency list)
FR-CU-002: Epic 6 — Currencies & FX (add currency)
FR-CU-003: Epic 6 — Currencies & FX (configure display currencies)
FR-CU-004: Epic 6 — Currencies & FX (per-person display currency)
FR-CU-005: Epic 6 — Currencies & FX (change base currency)
FR-CU-006: Epic 6 — Currencies & FX (daily FX rate fetch)
FR-CU-007: Epic 6 — Currencies & FX (conversion fee configuration)
FR-CU-008: Epic 6 — Currencies & FX (raw vs converted toggle)
FR-CU-009: Epic 6 — Currencies & FX (FX rate history & chart)
FR-CU-010: Epic 6 — Currencies & FX (FX provider configuration)
FR-F-001: Epic 11 — Formulas (view system default formulas)
FR-F-002: Epic 11 — Formulas (create custom formula)
FR-F-003: Epic 11 — Formulas (assign formula to account)
FR-F-004: Epic 11 — Formulas (hover-reveal formula results)
FR-F-005: Epic 11 — Formulas (FX formula auto-fill in transaction entry)
FR-F-006: Epic 11 — Formulas (generate value snapshot from formula)
FR-D-001: Epic 11 — Debt Tracking (computed debt)
FR-D-002: Epic 11 — Debt Tracking (credit card debt display)
FR-D-003: Epic 11 — Debt Tracking (internal household debt display)
FR-D-004: Epic 11 — Debt Tracking (auto-clear credit card debt via transfer)
FR-D-005: Epic 11 — Debt Tracking (auto-clear internal household debt via transfer)
FR-D-006: Epic 11 — Debt Tracking (override debt repayment flag)
FR-D-007: Epic 11 — Debt Tracking (debt summary drill-down)
FR-DB-001: Epic 13 — Dashboard (net worth computation)
FR-DB-002: Epic 13 — Dashboard (net worth over time)
FR-DB-003: Epic 13 — Dashboard (dashboard pinning, sizing & add-widget)
FR-IE-001: Epic 14 — Import / Export (CSV upload)
FR-IE-002: Epic 14 — Import / Export (two-step import flow)
FR-IE-003: Epic 14 — Import / Export (category mapping suggestions)
FR-IE-004: Epic 14 — Import / Export (duplicate detection during import)
FR-IE-005: Epic 14 — Import / Export (v1 column compatibility)
FR-IE-006: Epic 14 — Import / Export (CSV export)

---

## Epic List

### Epic 1: Platform Foundation
**User outcome:** The application is bootstrapped and operational — design tokens, component primitives, generic entity layer contract, API skeleton, database schema, error pages, and deployment infrastructure are ready for all features.

**FRs covered:** FR-SYS-001, FR-SYS-002, FR-SYS-005, FR-SYS-008, FR-SYS-009, FR-SYS-010, FR-SYS-011
**NFRs covered:** NFR-1 to NFR-29 (performance, security, accessibility, browser support, data integrity)
**Architecture covered:** Stack setup, DI chain, error responses (RFC 7807), dev auth bypass, backup job
**UX covered:** UX-DR-1 (design tokens), UX-DR-2 (theming), UX-DR-3 (generic entity layer contract: EntityCard, EntityModal, EntityPage, useEntityManager interfaces), UX-DR-4 to UX-DR-14 (component primitives), UX-DR-17 (design system page), UX-DR-18 (responsive breakpoints), UX-DR-19 (motion system)

### Epic 2: Household & Authentication
**User outcome:** Users can sign in with Google, create or join a household, manage member invitations, and configure their profile and appearance preferences.

**FRs covered:** FR-SYS-003, FR-SYS-004, FR-HH-001 to FR-HH-005, FR-P-001 to FR-P-008

### Epic 3: Categories
**User outcome:** Users can create, organize, and manage spending categories with subcategories — the foundation for classifying all financial data.

**FRs covered:** FR-C-001 to FR-C-008
**UX covered:** UX-DR-15 (CategoryTree component)

### Epic 4: Visualization Foundation
**User outcome:** The charting infrastructure is available — Universal Visualization Viewer, mini-charts, filter controls, and chart types. Every subsequent entity can plug into this for history charts and data exploration.

**FRs covered:** FR-V-010, FR-V-011, FR-V-012, FR-V-013, FR-V-014, FR-V-015
**UX covered:** UX-DR-16 (Visualization Viewer)

### Epic 5a: Core Accounts (Bank & Credit Card)
**User outcome:** Users can create, manage, and track Bank and Credit Card accounts with value history charts, multiple owners, interest rates, credit limits, and billing details. The generic entity layer (EntityCard, EntityModal, EntityPage, useEntityManager) is concretely implemented for the first time.

**FRs covered:** FR-A-001, FR-A-002, FR-A-003, FR-A-004, FR-A-005, FR-A-006, FR-A-007, FR-A-008, FR-A-009, FR-A-010, FR-A-011, FR-A-014, FR-A-015
**UX covered:** UX-DR-3 (generic entity layer concrete implementation)

### Epic 5b: Advanced Accounts (Capital, Asset, Insurance)
**User outcome:** Users can manage investment accounts (Capital), physical assets (Asset with depreciation), and insurance policies (Insurance) with type-specific details and account-linked recurring payments.

**FRs covered:** FR-A-012, FR-A-013, FR-A-016, FR-A-017

### Epic 6: Currencies & FX
**User outcome:** Users can manage multiple currencies, configure display currencies, see automatic FX rate fetching and conversion, and track FX rate history. This must ship before Transactions so that MonetaryValue entry (foreign currency) has FX rates available.

**FRs covered:** FR-CU-001 to FR-CU-010

### Epic 7: Transactions
**User outcome:** Users can record, search, edit, and manage financial transactions with category assignment, person tracking, status management, reconciliation, foreign currency (MonetaryValue), and multi-select bulk operations.

**FRs covered:** FR-E-001 to FR-E-010, FR-E-020, FR-E-021

### Epic 8: Recurring Payments & Transfers
**User outcome:** Users can set up recurring payments with flexible date patterns, track occurrence history, and manage transfers between accounts with debt repayment detection.

**FRs covered:** FR-E-011 to FR-E-019, FR-SYS-006

### Epic 9: Budgets
**User outcome:** Users can create monthly and yearly budgets, track spending against limits in real-time, receive alerts when approaching or exceeding limits, and explore budget history with drill-down to transactions.

**FRs covered:** FR-B-001 to FR-B-009, FR-SYS-007 (budget alerts portion)

### Epic 10: Formulas
**User outcome:** Users can define custom formulas for computed values (depreciation, interest calculations), assign them to accounts, and see formula results as hover-reveal tooltips.

**FRs covered:** FR-F-001 to FR-F-006

### Epic 11: Debt Tracking
**User outcome:** Users can see computed debt (credit card balances, internal household debt), auto-clear debt via transfers, and drill down into contributing transactions.

**FRs covered:** FR-D-001 to FR-D-007

### Epic 12: Advanced Visualization
**User outcome:** Users can explore spending patterns with interactive drill-down, person/category comparison modes, cross-module filter navigation, event-group aggregation, and personalized PersonDashboard views.

**FRs covered:** FR-V-001 to FR-V-009, FR-V-013, FR-P-006

### Epic 13: Dashboard
**User outcome:** Users see a personalized dashboard with net worth computation, net worth over time chart, and customizable widgets they can pin, resize, and reorder.

**FRs covered:** FR-DB-001 to FR-DB-003

### Epic 14: Import / Export
**User outcome:** Users can import historical data from CSV files (including v1 migration), map categories during import, detect duplicates, and export filtered data for external use.

**FRs covered:** FR-IE-001 to FR-IE-006

---

**Next step:** Design stories within each epic.

---

## Epic 1: Platform Foundation

**Goal:** Bootstrap the application — stack setup, design tokens, component primitives, generic entity layer contract, error pages, audit trail, and backup infrastructure.

**FRs:** FR-SYS-001, FR-SYS-002, FR-SYS-005, FR-SYS-008, FR-SYS-009, FR-SYS-010, FR-SYS-011
**NFRs:** NFR-1 to NFR-29
**UX-DRs:** UX-DR-1 to UX-DR-19

### Story 1.1: Project Bootstrap & Stack Setup

As a developer,
I want the project scaffolding, backend API skeleton, and database infrastructure configured,
So that all subsequent features have a working foundation to build on.

**Acceptance Criteria:**

**Given** a fresh clone of the repository
**When** I run `pip install -r requirements.txt` and `npm install`
**Then** all dependencies are installed without errors
**And** the backend starts with `uvicorn` on the configured port
**And** the frontend starts with `vite dev` on the configured port
**And** SQLite database is created in WAL mode with `foreign_keys=ON`
**And** Alembic is initialized with the first migration
**And** the DI chain (`get_db` → `get_current_person` → `get_household_id`) is wired
**And** the global error handler returns RFC 7807 Problem Details responses
**And** dev auth bypass middleware is available when `AUTH_BYPASS_ENABLED=true` (FR-SYS-002)
**And** `api/client.ts` handles auth headers, CSRF, and 401 redirect
**And** an authenticated job endpoint infrastructure exists for Cloud Scheduler jobs (used by Epic 8 scheduler)
**And** `GET /auth/me` returns 401 without a session, and 200 with a valid session

---

### Story 1.2: Audit Trail Infrastructure

> **Moved from 1.8** — every subsequent story depends on audit logging; must be built before features.

As an administrator,
I want every create, update, archive, restore, and delete operation logged with before/after snapshots,
So that I can trace all data changes for debugging and compliance.

**Acceptance Criteria:**

**Given** the audit trail system
**When** any entity is created, updated, archived, restored, or deleted
**Then** an append-only audit log entry is written (FR-SYS-005)
**And** the entry contains: timestamp, person_id, entity_type, entity_id, action, before JSON snapshot, after JSON snapshot
**And** audit log entries can never be deleted (NFR-29)
**And** the audit log table has indexes on `entity_id`, `person_id`, and `timestamp`
**And** a query endpoint `GET /api/audit-log?entity_id=...&person_id=...` returns filtered entries

---

### Story 1.3: Design Token System & Theming

As a designer,
I want a complete design token system with immersive theming support,
So that all UI elements use consistent colors, typography, and motion — and can be remapped through any theme palette.

**Acceptance Criteria:**

**Given** the `index.css` file
**When** I define `@theme` CSS variables for all design tokens
**Then** all color tokens are available (bg-bg, bg-surface, bg-surface-raised, text-text-primary, border-border, ring-glow-*, etc.)
**And** 5 palettes are defined: Base Dark, Base Light, Retro 70s, Muted Brown, Game Boy DMG (UX-DR-2)
**And** immersive tint ramp remapping works (`tint` + `tint_ramp` variables)
**And** typography scale is defined (font families, sizes, weights)
**And** responsive breakpoints are configured: desktop ≥1280px, tablet ≥768px, mobile ≥375px (UX-DR-18)
**And** motion tokens are defined: transitions (100ms/150ms/300ms), shimmer animation, `prefers-reduced-motion` (UX-DR-19)
**And** no raw hex values, px sizes, or z-index integers exist in TSX components (P4 rule)
**And** `--entity-colour` CSS variable pattern is available for entity colour-fill identity (UX-DR-20)

---

### Story 1.4: Component Primitives — Primary Pickers

As a developer,
I want the primary picker components (Input, Dropdown, DatePicker, ColourPicker, EmojiIconPicker) built and demoed,
So that all forms and entity editors have consistent, accessible input controls.

**Acceptance Criteria:**

**Given** the component library
**When** I use the Input component
**Then** it has focus ring (`ring-glow-primary`), validation states, and `focus:outline-none` (UX-DR-4)
**And** when I use the Dropdown component
**Then** it uses the exact picker trigger button pattern with ternary border/ring state (UX-DR-5)
**And** when I use the DatePicker component
**Then** it shows a calendar grid with date selection in DD-MM-YYYY format (UX-DR-6)
**And** when I use the ColourPicker component
**Then** it shows a palette grid + hex input with colour swatch selection ring (UX-DR-7)
**And** when I use the EmojiIconPicker component
**Then** it shows emoji/icon tabs with search and grid (UX-DR-8)
**And** all components are demoed on `/design-system` using real exported components (UX-DR-17)
**And** all components pass keyboard navigation (Tab, Enter, Escape, arrow keys) (NFR-19)

---

### Story 1.5: Component Primitives — Secondary Components

As a developer,
I want the secondary component set (SegmentedControl, Tooltip, Skeleton, ConfirmActions, StatusMessage, EmptyState) built and demoed,
So that all UI states (loading, empty, confirmation, feedback) are handled consistently.

**Acceptance Criteria:**

**Given** the component library
**When** I use the SegmentedControl component
**Then** it uses `border-state` and `border-state-subtle` tokens with two-option toggle (UX-DR-9)
**And** when I use the Tooltip component
**Then** it uses CSS-only hover with auto-flip and Escape key dismiss (UX-DR-10)
**And** when I use the Skeleton components
**Then** they show shimmer animation with `bg-surface-active` peak (UX-DR-11)
**And** when I use the ConfirmActions component
**Then** it shows destructive action confirmation pattern (UX-DR-12)
**And** when I use the StatusMessage component
**Then** it shows success/warning/error/info states (UX-DR-13)
**And** when I use the EmptyState component
**Then** it shows no-data placeholder with illustration and CTA (UX-DR-14)
**And** all components are demoed on `/design-system` (UX-DR-17)

---

### Story 1.6: Generic Entity Layer Contract

> **Note:** Contract defined here, concretely implemented in Epic 5a. A contract validation step will re-confirm the interface before implementation (see Story 5a.1).

As a developer,
I want the generic entity layer interfaces defined (EntityCard, EntityModal, EntityPage, useEntityManager),
So that all entity CRUD pages share a consistent pattern and the concrete implementation can be built incrementally.

**Acceptance Criteria:**

**Given** the generic entity layer
**When** I review the `EntityCard<T>` interface
**Then** it defines props for colour-fill identity (calm/vivid), favourite star, context menu, archive state, value-history sparkline (UX-DR-3)
**And** when I review the `EntityModal<T>` interface
**Then** it defines a two-column form layout with cancel/save actions
**And** when I review the `EntityPage<T>` interface
**Then** it defines action bar, filter slot, and main content slot
**And** when I review the `useEntityManager<T>` hook interface
**Then** it defines `items`, `isLoading`, `create`, `update`, `archive`, `bulkArchive` on TanStack Query
**And** when I review the `useMultiSelect` + `BulkActionBar` interface
**Then** it defines multi-select state and bulk action bar (FR-E-020)
**And** placeholder sections are added to `/design-system` (marked as "TBD — concrete implementation in Epic 5a")

---

### Story 1.7: Public & Error Pages

As a user,
I want clear, branded error and status pages,
So that I understand what happened when something goes wrong.

**Acceptance Criteria:**

**Given** the application
**When** I visit the app without a session
**Then** I see the Login page with Google OAuth button (FR-SYS-001)
**And** when I access a page without permission
**Then** I see the Access Denied page
**And** when I receive a 403 CSRF error
**Then** I see the Forbidden page
**And** when I receive a connection error
**Then** I see the Refused Connection or Lost Connection page
**And** when I have a pending invitation
**Then** I see the Not Invited / Pending Invitation page
**And** when I log out
**Then** I see the Logout confirmation page
**And** when the app is loading
**Then** I see the Loading page with skeleton/shimmer
**And** all pages use the branding config (no hardcoded brand strings) (FR-SYS-011)
**And** all pages are responsive across breakpoints (FR-SYS-009)

---

### Story 1.8: Global Search & Command Palette

> **Note:** Contract defined in Epic 1. Full implementation deferred to Epic 7 (after entities exist). Epic 1 delivers the shell (Cmd/Ctrl-K opener, empty state, command registry pattern).

As a user,
I want a global search and command palette (Cmd/Ctrl-K),
So that I can quickly navigate to any entity or command without using the sidebar.

**Acceptance Criteria:**

**Given** the application
**When** I press Cmd/Ctrl-K
**Then** a command palette shell opens with a search input (FR-SYS-010)
**And** when I type a search term
**Then** it searches across registered commands (entity search providers added in Epic 7+)
**And** when I select a command
**Then** it executes that navigation/action
**And** when I press Escape
**Then** the palette closes

---

### Story 1.9: Backup Infrastructure

> **Parallel story** — can run anytime after Story 1.1. Does not block features.

As an administrator,
I want daily automated backups of the database to cloud storage,
So that data can be restored in case of corruption or accidental deletion.

**Acceptance Criteria:**

**Given** the backup system
**When** the daily backup job runs (Cloud Scheduler)
**Then** the SQLite database is copied to GCS (FR-SYS-008)
**And** backups are retained for 90 days
**And** old backups beyond 90 days are automatically deleted
**And** a restore endpoint exists for cold-start recovery

---

## Epic 2: Household & Authentication

**Goal:** Users can sign in with Google, create or join a household, manage member invitations, and configure their profile.

**FRs:** FR-SYS-003, FR-SYS-004, FR-HH-001 to FR-HH-005, FR-P-001 to FR-P-008

### Story 2.1: Google OAuth 2.0 Authentication

As a user,
I want to sign in with my Google account,
So that I can access the application securely without managing passwords.

**Acceptance Criteria:**

**Given** I am not logged in
**When** I click "Sign in with Google"
**Then** I am redirected to Google's OAuth 2.0 Authorization Code flow (FR-SYS-003, FR-P-001)
**And** a HMAC-signed state cookie is set for CSRF protection
**And** when Google redirects back with an authorization code
**Then** the code is exchanged for an access token + ID token
**And** when the person is first seen
**Then** a Person row is created with Google profile data
**And** when I am an approved owner with no household
**Then** a new household is created and I am set as owner
**And** when I am a member with no pending invitation
**Then** I receive `NotInvitedError`
**And** an opaque server-side session token is stored in an HttpOnly cookie
**And** when I visit `/auth/me`
**Then** I receive my person data and CSRF synchronizer token (FR-SYS-004)

---

### Story 2.2: Household Creation & Configuration

As an approved owner,
I want to create and configure my household,
So that I can set up the shared financial environment.

**Acceptance Criteria:**

**Given** I am an approved owner with no household
**When** I log in for the first time
**Then** a "New Household" modal appears (FR-HH-001)
**And** when I enter a household name and confirm
**Then** the household is created with me as the owner
**And** when I visit Household Settings
**Then** I can configure: name, timezone, date/time format, base currency (FR-HH-002)
**And** when I change the household name
**Then** the change is persisted and reflected immediately
**And** when I delete the household (owner-only)
**Then** I must type the household name to confirm (FR-HH-005)
**And** all household-scoped data is cascade-deleted
**And** all Person rows survive with `household_id=NULL`

---

### Story 2.3: Member Invitations

As a household owner,
I want to invite other Google accounts to join my household,
So that we can share financial data.

**Acceptance Criteria:**

**Given** I am a household owner
**When** I enter a Google email address
**Then** an invitation is created with status "pending" (FR-HH-003)
**And** when the invited person already exists in the system
**Then** a Household Conflict modal appears if they're already a member
**And** when I revoke a pending invitation
**Then** the invitation is deleted (FR-HH-004)
**And** when I share a join URL
**Then** the invited person can join via the URL

---

### Story 2.4: Join Household & Role Management

As an invited member,
I want to accept or decline a household invitation,
So that I can join the shared financial environment.

**Acceptance Criteria:**

**Given** I have a pending invitation
**When** I log in
**Then** a "Pending Invitation" modal appears
**And** when I click "Accept"
**Then** I am added to the household as a member (FR-P-002)
**And** when I click "Decline"
**Then** the invitation is marked as declined
**And** when the owner changes my role to admin
**Then** I gain admin permissions (FR-P-005)
**And** when I am archived
**Then** I can't log in and my name shows "(archived)" (FR-P-007)
**And** when I am hard deleted (only if no records exist)
**Then** the Person row is removed (FR-P-008)

---

### Story 2.5: Profile & Appearance Settings

As a user,
I want to customize my profile and appearance preferences,
So that the application looks and feels right for me.

**Acceptance Criteria:**

**Given** I am logged in
**When** I visit Profile Settings
**Then** I can set: display_name, colour, theme, font, density, reduce_motion, notification_prefs (FR-P-003)
**And** when I change my theme
**Then** the UI updates immediately to the selected palette
**And** when I set a display currency preference
**Then** the dashboard converts amounts to my preferred currency (FR-P-004)
**And** when I enable reduce_motion
**Then** all animations are disabled (NFR-23)

---

## Epic 3: Categories

**Goal:** Users can create, organize, and manage spending categories with subcategories.

**FRs:** FR-C-001 to FR-C-008
**UX-DRs:** UX-DR-15 (CategoryTree component)

### Story 3.1: Category CRUD & Defaults

As a user,
I want to create, edit, and archive categories,
So that I can organize my spending into meaningful groups.

**Acceptance Criteria:**

**Given** the Categories page
**When** I create a new category with name, color, icon, and category_type
**Then** it is created at depth=0 (top-level) (FR-C-001)
**And** when I edit a category
**Then** changes are persisted and reflected immediately everywhere (FR-C-004)
**And** when I archive a category
**Then** it is hidden from dropdowns but historical events are preserved (FR-C-005)
**And** when I hard delete a category with zero linked events/budgets/recurring
**Then** it is permanently removed (FR-C-006)
**And** when a household is first created
**Then** 17 default categories are created (12 expense + 5 income, idempotent) (FR-C-007)

---

### Story 3.2: Subcategory Management

As a user,
I want to create subcategories under top-level categories and promote them back,
So that I can have a flexible category hierarchy.

**Acceptance Criteria:**

**Given** a top-level category
**When** I create a subcategory under it
**Then** it is created at depth=1 (FR-C-002)
**And** when I unparent a subcategory
**Then** it is promoted to depth=0 (top-level) (FR-C-003)
**And** when I archive a parent category
**Then** all subcategories are archived together (FR-C-005)
**And** category depth is enforced at DB level (CHECK constraint, max=1) (NFR-28)

---

### Story 3.3: CategoryTree Component

As a user,
I want an interactive category tree with colour-fill identity, expand/collapse, drag reorder, and context menu,
So that I can visually organize and manage my categories.

**Acceptance Criteria:**

**Given** the CategoryTree component
**When** I view the category list
**Then** each row uses colour-fill identity (`--entity-colour` CSS variable, calm/vivid) (UX-DR-15)
**And** when I click a parent category
**Then** it expands/collapses to show/hide subcategories
**And** when I drag a category
**Then** it reorders in the tree
**And** when I click the ⋮ menu
**Then** a ContextMenu appears with: Edit, Duplicate, Archive, Delete
**And** when I view an archived category
**Then** it shows `opacity-60 grayscale` with dashed border and [Archived] badge
**And** the component is demoed on `/design-system`

---

## Epic 4: Visualization Foundation

**Goal:** Charting infrastructure — Universal Visualization Viewer, mini-charts, chart types, and series controls.

**FRs:** FR-V-010, FR-V-011, FR-V-012, FR-V-014, FR-V-015
**UX-DRs:** UX-DR-16 (Visualization Viewer)

### Story 4.1: Universal Visualization Viewer

As a user,
I want a single reusable chart component that can render inline or full-screen,
So that all charts across the app share the same interaction model.

**Acceptance Criteria:**

**Given** the Visualization Viewer component
**When** I pass it chart data and a chart type
**Then** it renders the chart (line, bar, pie, area, stacked) (FR-V-011, FR-V-014)
**And** when I click the expand button
**Then** it switches to full-screen mode
**And** when I change the chart type
**Then** invalid types for the data are disabled
**And** the component accepts a generic data shape: `{ labels, series: [{ name, values, colour }] }`
**And** dates are displayed in DD-MM-YYYY format using a shared `formatDate` utility (FR-V-010)

---

### Story 4.2: Entity History Mini-Chart

As a user,
I want compact mini-charts on entity cards that expand to the full viewer,
So that I can see trends at a glance.

**Acceptance Criteria:**

**Given** an entity card with history data
**When** I view the card
**Then** a compact mini-chart is rendered (FR-V-012)
**And** when I click the mini-chart
**Then** it expands to the Universal Visualization Viewer in full-screen
**And** the mini-chart uses the same colour coding as the full viewer

---

### Story 4.3: Chart Series Controls

As a user,
I want to toggle chart series on/off and see stable colour coding,
So that I can focus on specific data series.

**Acceptance Criteria:**

**Given** a chart with multiple series
**When** I click a series in the legend
**Then** that series is toggled on/off (FR-V-015)
**And** each series has a stable colour that persists across interactions
**And** when I change the date range
**Then** series colours remain consistent

---

## Epic 5a: Core Accounts (Bank & Credit Card)

**Goal:** Users can create and manage Bank and Credit Card accounts with the generic entity layer concretely implemented.

**FRs:** FR-A-001, FR-A-002, FR-A-003, FR-A-004, FR-A-005, FR-A-006, FR-A-007, FR-A-008, FR-A-009, FR-A-010, FR-A-011, FR-A-014, FR-A-015
**UX-DRs:** UX-DR-3 (generic entity layer concrete implementation)

### Story 5a.1: Generic Entity Layer — Concrete Implementation & Contract Validation

As a developer,
I want to validate the generic entity layer contract from Epic 1 and then concretely implement it for Accounts,
So that the contract is confirmed correct before all subsequent epics depend on it.

**Acceptance Criteria:**

**Given** the generic entity layer interfaces from Epic 1
**When** I review the contract against the Account use case
**Then** I validate that all props (colour-fill, favourite, context menu, archive, sparkline) are sufficient
**And** if the contract is insufficient, I update the Epic 1 contract before proceeding
**And** when I implement `EntityCard<Account>`
**Then** it renders colour-fill identity (calm/vivid), favourite star, context menu, archive state, value-history sparkline (UX-DR-3)
**And** when I implement `EntityModal<Account>`
**Then** it shows a two-column form layout with cancel/save actions
**And** when I implement `EntityPage<Account>`
**Then** it shows action bar, filter slot, and main content slot
**And** when I implement `useEntityManager<Account>`
**Then** it provides `items`, `isLoading`, `create`, `update`, `archive`, `bulkArchive` on TanStack Query
**And** all components are demoed on `/design-system`

---

### Story 5a.2: Bank Account CRUD (Including Interest Rate)

As a user,
I want to create, edit, archive, and delete Bank accounts with optional interest settings,
So that I can track my bank balances and interest earnings.

**Acceptance Criteria:**

**Given** the Accounts page
**When** I create a Bank account with name, owner, and opening balance
**Then** it is created with MonetaryValue (FR-A-001)
**And** when I set an optional interest_rate and interest_frequency
**Then** the values are persisted (FR-A-009)
**And** when I leave interest fields empty
**Then** the account works normally without interest
**And** when I edit a Bank account
**Then** changes are persisted with `updated_at`/`updated_by` refresh and audit log (FR-A-002)
**And** when I archive a Bank account
**Then** it is hidden from defaults but transaction history is preserved (FR-A-003)
**And** when I hard delete a Bank account with zero FK references
**Then** it is permanently removed (FR-A-004)
**And** when I duplicate a Bank account
**Then** a clone is created with a new UUID and me as owner (FR-A-005)

---

### Story 5a.3: Credit Card Account CRUD

As a user,
I want to create and manage Credit Card accounts with limits and billing details,
So that I can track credit card balances and payments.

**Acceptance Criteria:**

**Given** the Accounts page
**When** I create a Credit Card account
**Then** I can set: credit_limit, billing_day, due_day, rewards_type, annual_fee (FR-A-010)
**And** when I view the card
**Then** the current debt balance is displayed (FR-A-011)
**And** when I add multiple owners
**Then** minimum one owner is enforced (FR-A-006)

---

### Story 5a.4: Account Value Snapshots & History

As a user,
I want to see account value history with snapshots and charts,
So that I can track how my balances change over time.

**Acceptance Criteria:**

**Given** an account with transactions
**When** I view the account detail
**Then** AccountSnapshot records are computed for ledger-backed accounts (FR-A-008)
**And** when I add a manual value snapshot
**Then** it is recorded with the current value (FR-A-014)
**And** when I view the value history chart
**Then** a mini-chart is shown on the card, expandable to full viewer (FR-A-015)
**And** the chart supports line/bar types with raw/converted currency

---

### Story 5a.5: Account Transaction History

As a user,
I want to see transaction history filtered by account,
So that I can review all activity for a specific account.

**Acceptance Criteria:**

**Given** an account
**When** I view its transaction history
**Then** a filtered list of transactions by `source_account_id` is shown (FR-A-007)
**And** the list is paginated and sortable
**And** clicking a transaction navigates to its detail view

---

## Epic 5b: Advanced Accounts (Capital, Asset, Insurance)

**Goal:** Users can manage investment accounts, physical assets, and insurance policies.

**FRs:** FR-A-012, FR-A-013, FR-A-016, FR-A-017

### Story 5b.1: Capital Account — Investment Type and Values

As a user,
I want to create Capital accounts with investment details,
So that I can track investments and their performance.

**Acceptance Criteria:**

**Given** the Accounts page
**When** I create a Capital account
**Then** I can set: investment_type, cost_basis, current_value (FR-A-012)
**And** when I view the account
**Then** ROI is computed from cost_basis and current_value
**And** when I update the current_value
**Then** the value snapshot is recorded

---

### Story 5b.2: Asset Account — Purchase and Depreciation

As a user,
I want to create Asset accounts with purchase details and optional depreciation,
So that I can track physical assets and their value over time.

**Acceptance Criteria:**

**Given** the Accounts page
**When** I create an Asset account
**Then** I can set: asset_type, purchase_date, purchase_value, depreciation_formula_id (FR-A-013)
**And** when `depreciation_formula_id` is NULL
**Then** the asset has no depreciation applied
**And** when a formula is assigned (after Epic 10)
**Then** depreciation is computed from the formula

---

### Story 5b.3: Insurance Account — Policy Details

As a user,
I want to create Insurance accounts with policy details,
So that I can track insurance policies and premiums.

**Acceptance Criteria:**

**Given** the Accounts page
**When** I create an Insurance account
**Then** I can set: policy_type, coverage_types, premium_frequency, purchase_date, coverage_amount, insurer (FR-A-016)
**And** when I view the account
**Then** all policy details are displayed

---

### Story 5b.4: Account-Linked Recurring Payment

As a user,
I want Asset, Capital, and Insurance accounts to optionally create linked recurring payments,
So that regular premiums or contributions are tracked automatically.

**Acceptance Criteria:**

**Given** an Asset, Capital, or Insurance account
**When** I create a linked recurring payment
**Then** a RecurringPayment entity is created associated with the account (FR-A-017)
**And** when I view the account
**Then** linked recurring payments are listed

---

## Epic 6: Currencies & FX

**Goal:** Users can manage multiple currencies, configure display currencies, and see automatic FX rate fetching.

**FRs:** FR-CU-001 to FR-CU-010

### Story 6.1: Currency List & Add Currency

As a user,
I want to view and add currencies with FX rates,
So that I can use multiple currencies in transactions.

**Acceptance Criteria:**

**Given** the Currencies page
**When** I view the currency list
**Then** each currency shows: FX rate, last-fetched, fee%, base/display-active, stale warning (FR-CU-001)
**And** when I add a new currency by ISO 4217 code
**Then** it is added and FX rate is fetched immediately (FR-CU-002)
**And** when the FX provider chain fails
**Then** a circuit breaker opens and a stale warning is shown

---

### Story 6.2: Display Currency Configuration

As a user,
I want to configure which currencies are available as display options,
So that household members can choose their preferred display currency.

**Acceptance Criteria:**

**Given** the Currencies page
**When** I toggle `is_display_active` on a currency
**Then** it appears in the display currency switcher (FR-CU-003)
**And** when I set my per-person display currency
**Then** all amounts are converted to my preferred currency (FR-CU-004)
**And** when the owner changes the base currency
**Then** a background job recalculates all `amount_base` values (FR-CU-005)

---

### Story 6.3: FX Rate Fetching & Provider Configuration

As an administrator,
I want automatic daily FX rate fetching with provider fallback,
So that exchange rates are always current.

**Acceptance Criteria:**

**Given** the FX system
**When** the daily FX fetch job runs (Cloud Scheduler)
**Then** rates are fetched from the provider fallback chain (FR-CU-006)
**And** when I configure FX providers
**Then** I can set an ordered list with Secret Manager API keys (FR-CU-010)
**And** when I set a conversion fee per currency
**Then** it pre-fills `fee_amount` in transactions (FR-CU-007)
**And** when I toggle raw vs converted
**Then** all charts update simultaneously (FR-CU-008)

---

### Story 6.4: FX Rate History & Chart

As a user,
I want to see FX rate history with a chart,
So that I can track exchange rate trends.

**Acceptance Criteria:**

**Given** a currency with FX history
**When** I view the currency detail
**Then** a line chart shows FX rate history with day/month grouping (FR-CU-009)
**And** a mini-chart is shown on the currency card
**And** rates use `rate_to_base` convention (multiplier from foreign to base)

---

## Epic 7: Transactions

**Goal:** Users can record, search, edit, and manage financial transactions.

**FRs:** FR-E-001 to FR-E-010, FR-E-020, FR-E-021

### Story 7.1: Create Transaction

As a user,
I want to create transactions with all required fields,
So that I can record financial activity.

**Acceptance Criteria:**

**Given** the Transactions page
**When** I create a new transaction
**Then** I can set: type (inflow/outflow), amount, category, account, date, description (FR-E-001)
**And** when I save
**Then** the transaction is created with provenance `source` and `external_ref`
**And** when context pre-fill is available (e.g., from a recurring payment)
**Then** form fields are pre-populated

---

### Story 7.2: Edit, Duplicate, Archive Transactions

As a user,
I want to edit, duplicate, and archive transactions,
So that I can correct mistakes and organize my data.

**Acceptance Criteria:**

**Given** existing transactions
**When** I edit a transaction
**Then** changes are persisted with audit log and budget actuals recompute (FR-E-002)
**And** when I duplicate a transaction
**Then** a copy is created with all values and the edit modal opens (FR-E-003)
**And** when I archive a transaction
**Then** it is excluded from budget actuals and reports (FR-E-004)
**And** permissions are enforced: admin/owner can edit any, member can edit own only

---

### Story 7.3: Transaction Status & Reconciliation

As a user,
I want to set transaction status and mark transactions as reconciled,
So that I can track which transactions are confirmed.

**Acceptance Criteria:**

**Given** a transaction
**When** I set its status to pending/completed/cancelled/reconciled
**Then** the status badge is displayed (FR-E-005)
**And** when I mark a transaction as reconciled
**Then** `reconciled_at` is set and it can be filtered as reconciled/unreconciled (FR-E-006)

---

### Story 7.4: Shared Expense, GST & Gift Flags

As a user,
I want to flag transactions as shared household expenses, GST claimable, or gifts,
So that I can track special transaction types.

**Acceptance Criteria:**

**Given** an outflow transaction
**When** I set `is_shared_expense`
**Then** it updates computed household debt (FR-E-007)
**And** `is_shared_expense` is enforced at DB level for outflow only (NFR-27)
**And** when I set `is_gst_claimable` or `is_gift`
**Then** icons are shown and the transaction is filterable by these flags (FR-E-010)

---

### Story 7.5: Duplicate Detection

As a user,
I want to be warned when saving a transaction that matches an existing one,
So that I don't accidentally create duplicates.

**Acceptance Criteria:**

**Given** a transaction being saved
**When** it matches an existing transaction (same amount, date, category, account)
**Then** a warning modal appears with options: proceed, link, or cancel (FR-E-008)
**And** when I choose "proceed"
**Then** the transaction is saved as a new entry
**And** when I choose "link"
**Then** it is linked to the existing transaction

---

### Story 7.6: MonetaryValue Entry (Foreign Currency)

> **Deferrable** — raw amounts work without FX. This story can be skipped if Epic 6 (Currencies & FX) is delayed; transactions default to base currency.

As a user,
I want to record transactions in foreign currencies,
So that I can track multi-currency spending.

**Acceptance Criteria:**

**Given** a transaction form
**When** I select a foreign currency account
**Then** the MonetaryValue entry fields appear (FR-E-009)
**And** when I enter a foreign amount
**Then** `amount_base_calculated` is auto-filled from the current FX rate
**And** when I manually override `amount_base_calculated`
**Then** `fx_delta` is computed as the difference
**And** the conversion fee is pre-filled from the currency's `fee_pct`
**And** when no FX rate is available (circuit breaker open)
**Then** the user can enter `amount_base_calculated` manually

---

### Story 7.7: Bulk Operations & Favourite

As a user,
I want to perform bulk operations on selected transactions and favourite important ones,
So that I can manage multiple transactions efficiently.

**Acceptance Criteria:**

**Given** a list of transactions
**When** I select multiple transactions
**Then** a BulkActionBar appears with archive/delete options (FR-E-020)
**And** when I click the star on a transaction
**Then** it is marked as favourite (per-person, stored in `entity_preferences`) (FR-E-021)
**And** when I drag to reorder
**Then** the manual sort order is persisted

---

## Epic 8: Recurring Payments & Transfers

**Goal:** Users can set up recurring payments and manage transfers between accounts.

**FRs:** FR-E-011 to FR-E-019, FR-SYS-006

### Story 8.1: Create Recurring Payment

As a user,
I want to create recurring payments with flexible frequency patterns,
So that regular expenses and income are tracked automatically.

**Acceptance Criteria:**

**Given** the Recurring Payments page
**When** I create a recurring payment
**Then** I can set: amount, category, account, frequency_text (free-text), and description (FR-E-011)
**And** when I enter a frequency pattern
**Then** it is parsed into a structured `frequency_rule` with the next occurrence date (FR-E-012)
**And** all 9 date patterns are supported: every weekday, weekly, monthly, Nth of month, every N days, every N weeks, Nth weekday of month, month day, yearly

---

### Story 8.2: Occurrence History, Skip & Trigger

As a user,
I want to see occurrence history and manually skip or trigger occurrences,
So that I can manage recurring payment execution.

**Acceptance Criteria:**

**Given** a recurring payment
**When** I view its occurrence history
**Then** expected occurrences are listed with status badges and linked transactions (FR-E-013)
**And** when I skip an occurrence
**Then** no transaction is generated for that date (FR-E-014)
**And** when I trigger an occurrence manually
**Then** a transaction is created for the current date (FR-E-015)

---

### Story 8.3: Scheduler & Missed Occurrence Alerts

As a user,
I want the system to automatically generate recurring payment transactions and alert me when one is missed,
So that no recurring payment is forgotten.

**Acceptance Criteria:**

**Given** recurring payments with upcoming occurrences
**When** the daily scheduler job runs (Cloud Scheduler → authenticated job endpoint from Epic 1)
**Then** due occurrences are processed idempotently (FR-SYS-006)
**And** the job endpoint verifies the scheduler's HMAC signature before processing
**And** when an occurrence is missed
**Then** a RECURRING_MISSED alert is generated on the next daily job (FR-E-016)
**And** catch-up is aware — it doesn't generate transactions for dates far in the past

---

### Story 8.4: Create Transfer

As a user,
I want to create transfers between accounts,
So that I can track money moving between accounts.

**Acceptance Criteria:**

**Given** the Transfers page
**When** I create a transfer
**Then** I select source and destination accounts, amount, and MonetaryValue for cross-currency (FR-E-017)
**And** when the transfer is cross-currency
**Then** `fx_delta` is computed from the FX rate
**And** when the destination is a Credit Card
**Then** `is_debt_repayment` is auto-detected as true (FR-E-018)
**And** when I override the debt repayment flag
**Then** a confirmation dialog appears and debt is NOT reduced (FR-E-019)

---

## Epic 9: Budgets

**Goal:** Users can create budgets, track spending against limits, and explore budget history.

**FRs:** FR-B-001 to FR-B-009, FR-SYS-007 (budget alerts)

### Story 9.1: Create Monthly & Yearly Budgets

As a user,
I want to create monthly and yearly budgets per category,
So that I can plan my spending.

**Acceptance Criteria:**

**Given** the Budgets page
**When** I create a monthly budget
**Then** I select category, person-scoped or household-wide, period dates, and limit (FR-B-001)
**And** when I create a yearly budget
**Then** it coexists with monthly for the same category (FR-B-002)
**And** when I enable rollover
**Then** unspent balance carries to the next period (FR-B-009)

---

### Story 9.2: Real-Time Budget Actuals & Alerts

As a user,
I want to see real-time budget actuals and receive alerts when I'm close to or over my limit,
So that I can stay within budget.

**Acceptance Criteria:**

**Given** an active budget
**When** I view the budget
**Then** actuals are computed live from matching events (never stored) (FR-B-003)
**And** when actuals reach the alert threshold
**Then** a BUDGET_WARNING alert is shown (FR-B-004, FR-SYS-007)
**And** when actuals exceed 100%
**Then** a BUDGET_EXCEEDED alert is shown
**And** archived transactions are excluded from actuals

---

### Story 9.3: Budget Drill-Down & History

As a user,
I want to drill down from budget charts to transactions and see budget history,
So that I can understand where my spending went.

**Acceptance Criteria:**

**Given** a budget with actuals
**When** I click a budget bar
**Then** a transaction list is shown filtered by category/period/owner (FR-B-006)
**And** when the parent category has subcategories
**Then** a subcategory breakdown is shown (FR-B-007)
**And** when I view budget history
**Then** a trend chart shows limit vs actual for all historical periods (FR-B-008)

---

### Story 9.4: Monthly Budget Auto-Rollover

As a user,
I want monthly budgets to automatically roll over to the next month,
So that I don't have to recreate them every month.

**Acceptance Criteria:**

**Given** a monthly budget that has ended
**When** the scheduler runs
**Then** next month's budget is created with the same limit (FR-B-005)
**And** if rollover is enabled
**Then** the new limit = prior_limit + prior_unspent (FR-B-009)

---

## Epic 10: Formulas

**Goal:** Users can define custom formulas for computed values.

**FRs:** FR-F-001 to FR-F-006

### Story 10.1: System Default Formulas & Custom Formula Creation

As a user,
I want to view system default formulas and create custom ones,
So that I can define computed values for my accounts.

**Acceptance Criteria:**

**Given** the Formulas page
**When** I view system defaults
**Then** read-only formulas are shown: depreciation, interest, amortisation, FX delta, budget variance, net worth (FR-F-001)
**And** when I create a custom formula
**Then** I set: name, expression, target entity type, variable definitions (FR-F-002)
**And** the expression evaluator is sandboxed (never `eval()`)

---

### Story 10.2: Assign Formula to Account & Hover-Reveal Results

As a user,
I want to assign formulas to accounts and see results on hover,
So that I can see computed values without cluttering the UI.

**Acceptance Criteria:**

**Given** a formula and an account
**When** I assign a formula to an account
**Then** it is linked (depreciation, FX fee, or compound interest assignment) (FR-F-003)
**And** when I hover over a formula result
**Then** a tooltip shows: formula name, inputs, result, source date (FR-F-004)
**And** when an account has an FX formula
**Then** `amount_base_calculated` is auto-filled in transaction entry (FR-F-005)
**And** when I generate a value snapshot from a formula
**Then** a new AccountSnapshot is created with `source=formula` (FR-F-006)

---

## Epic 11: Debt Tracking

**Goal:** Users can see computed debt and auto-clear debt via transfers.

**FRs:** FR-D-001 to FR-D-007

### Story 11.1: Computed Debt Display

As a user,
I want to see computed debt for credit cards and internal household debt,
So that I know what I owe.

**Acceptance Criteria:**

**Given** the debt system
**When** I view a Credit Card account
**Then** the current debt balance is displayed (computed at query time, no debt entity) (FR-D-001, FR-D-002)
**And** when I view household debt
**Then** per-person owed amounts are shown with contributing transactions (FR-D-003)
**And** when I click a debt balance
**Then** a drill-down list of contributing transactions is shown (FR-D-007)

---

### Story 11.2: Auto-Clear Debt via Transfer

As a user,
I want debt to be automatically cleared when I make a transfer to the right account,
So that I don't have to manually track debt repayment.

**Acceptance Criteria:**

**Given** a transfer to a Credit Card account
**When** the transfer is saved
**Then** `is_debt_repayment=true` is auto-detected and debt is reduced (FR-D-004)
**And** when a transfer is to a person with household_debt > 0
**Then** internal household debt is auto-cleared (FR-D-005)
**And** when I override the debt repayment flag
**Then** a confirmation dialog appears and debt is NOT reduced (FR-D-006)

---

## Epic 12: Advanced Visualization

**Goal:** Users can explore spending patterns with drill-down, comparison modes, and cross-module navigation.

**FRs:** FR-V-001 to FR-V-009, FR-V-013, FR-P-006

### Story 12.1: VisualizationFilter Store & Cross-Module Integration

> **Split from Epic 4:** The VisualizationFilter Zustand store and component were added to Epic 4. This story integrates it across all modules.

As a user,
I want filter controls that persist across modules and support browser navigation,
So that I can explore data consistently.

**Acceptance Criteria:**

**Given** the VisualizationFilter (store + component from Epic 4)
**When** I set filters (time range, person, category, account, type, currency mode)
**Then** they are applied to all charts across all modules (FR-V-001)
**And** when I navigate between modules (e.g., Transactions → Budgets)
**Then** filters are carried across (FR-V-003)
**And** when I press browser back
**Then** the previous filter state is restored
**And** when I toggle raw vs converted
**Then** all charts update globally (FR-V-004)

---

### Story 12.2: Chart Segment Drill-Down

As a user,
I want to click chart segments to drill down into details,
So that I can explore data interactively.

**Acceptance Criteria:**

**Given** a chart with segments
**When** I click a segment (e.g., a category slice in a pie chart)
**Then** the view filters to that segment (FR-V-002)
**And** a breadcrumb trail shows the drill-down path (e.g., "Dashboard → Food & Dining → Restaurants") with clickable segments to navigate back
**And** dismissible chips above the chart allow clearing individual filters

---

### Story 12.3: Person & Category Comparison Modes

As a user,
I want to compare multiple people or categories on the same chart,
So that I can see relative spending patterns.

**Acceptance Criteria:**

**Given** the visualization viewer
**When** I enable person comparison mode
**Then** 2-4 members are shown with grouped bars/multi-line (FR-V-005)
**And** when I enable category comparison mode
**Then** 2-8 categories are shown with multi-line/grouped bar (FR-V-006)

---

### Story 12.4: Budget & Capital History Charts

As a user,
I want specialized charts for budget history and capital/portfolio tracking,
So that I can see budget performance and investment trends.

**Acceptance Criteria:**

**Given** budget or capital data
**When** I view budget history
**Then** a chart shows limit vs actual for monthly/yearly periods (FR-V-007)
**And** when I view capital history
**Then** a chart shows value, inflow, outflow, and interest over time (FR-V-008)

---

### Story 12.5: PersonDashboard Individual Mode & Event-Group Aggregation

As a user,
I want a personalized dashboard view and event-group aggregation,
So that I can see my personal financial overview.

**Acceptance Criteria:**

**Given** the PersonDashboard
**When** I switch to Individual mode
**Then** net worth, spending, income, budget, and debt are shown filtered to me (FR-V-009, FR-P-006)
**And** when I view event-group aggregation
**Then** a filtered event set is aggregated over time with count/sum/avg (FR-V-013)

---

## Epic 13: Dashboard

**Goal:** Users see a personalized dashboard with net worth and customizable widgets.

**FRs:** FR-DB-001 to FR-DB-003

### Story 13.1: Net Worth Computation & Over Time

As a user,
I want to see my net worth and how it changes over time,
So that I can track my financial health.

**Acceptance Criteria:**

**Given** the Dashboard
**When** I view net worth
**Then** it shows Σ positive − Σ liabilities in display currency, archived excluded (FR-DB-001)
**And** when I view net worth over time
**Then** monthly snapshots are shown in display currency (FR-DB-002)

---

### Story 13.2: Dashboard Pinning, Sizing & Add-Widget

As a user,
I want to customize my dashboard layout with draggable, resizable widgets,
So that I can prioritize the information I care about.

**Acceptance Criteria:**

**Given** the Dashboard
**When** I drag a widget
**Then** it reorders in the layout (FR-DB-003)
**And** when I resize a widget
**Then** it changes size (S/M/L)
**And** when I add a new widget
**Then** it appears in the layout
**And** layout is stored per-person (server-side in `person_preferences`)
**And** on mobile, widgets reflow to single column

---

## Epic 14: Import / Export

**Goal:** Users can import historical data from CSV and export filtered data.

**FRs:** FR-IE-001 to FR-IE-006

### Story 14.1: CSV Upload & Two-Step Import Flow

As a user,
I want to upload CSV files and preview data before importing,
So that I can migrate historical data safely.

**Acceptance Criteria:**

**Given** the Import page
**When** I upload a CSV file
**Then** it accepts multipart upload up to 10MB with text/csv MIME (FR-IE-001)
**And** when I preview the import
**Then** a two-step flow shows: preview + column mapping → confirm (FR-IE-002)
**And** when I confirm
**Then** all rows are imported and the imported row count matches the CSV row count
**And** a spot-check of 3 random rows shows correct values for amount, date, category, and description

---

### Story 14.2: Category Mapping & Duplicate Detection

As a user,
I want automatic category mapping suggestions and duplicate detection during import,
So that imported data matches my existing categories.

**Acceptance Criteria:**

**Given** a CSV import preview
**When** I map categories
**Then** case-insensitive match suggestions are shown with green/yellow highlights (FR-IE-003)
**And** when duplicates are detected
**Then** a Conflicting Transactions modal appears with Keep Newer/Existing/Both options (FR-IE-004)
**And** when the CSV has v1 Google Sheets columns
**Then** they are parsed correctly (FR-IE-005)

---

### Story 14.3: CSV Export

As a user,
I want to export filtered transaction data as CSV,
So that I can use it in external tools.

**Acceptance Criteria:**

**Given** the Export page
**When** I export with VisualizationFilter applied
**Then** a CSV is downloaded with all filters applied (FR-IE-006)
**And** dates are in ISO 8601 format

---

## Epic Dependency Summary

| # | Epic | FRs | Depends On |
|---|---|---|---|
| 1 | Platform Foundation | FR-SYS (7) | None — bootstrap |
| 2 | Household & Authentication | FR-SYS (2) + FR-HH (5) + FR-P (8) | Epic 1 |
| 3 | Categories | FR-C (8) | Epic 1 |
| 4 | Visualization Foundation | FR-V (5) | Epic 1 |
| 5a | Core Accounts (Bank & Credit Card) | FR-A (13) | Epics 1, 4 |
| 5b | Advanced Accounts (Capital, Asset, Insurance) | FR-A (4) | Epic 5a |
| 6 | Currencies & FX | FR-CU (10) | Epic 1 |
| 7 | Transactions | FR-E (12) | Epics 3, 5a, 6 |
| 8 | Recurring Payments & Transfers | FR-E (9) + FR-SYS (1) | Epics 5a, 7 |
| 9 | Budgets | FR-B (9) + FR-SYS (1) | Epics 3, 7 |
| 10 | Formulas | FR-F (6) | Epic 5a |
| 11 | Debt Tracking | FR-D (7) | Epics 5a, 8 |
| 12 | Advanced Visualization | FR-V (10) | Epics 4, 7, 9 |
| 13 | Dashboard | FR-DB (3) | Epics 5a, 7, 11, 12 |
| 14 | Import / Export | FR-IE (6) | Epics 3, 7 |

**Total: 15 epics** (Epic 5 split into 5a + 5b for context window management)
