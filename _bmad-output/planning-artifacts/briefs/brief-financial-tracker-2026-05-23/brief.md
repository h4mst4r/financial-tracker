---
title: Financial Tracker — Product Brief
version: 3.0
status: living
created: 2026-06-10
authority: Plain-language product vision
---

# Financial Tracker — Product Brief

> **Design authority:** All entity definitions, field names, inheritance rules, and
> architectural patterns referenced in this document are formally specified in
> `architecture.md` (§3 — data model & entity-design philosophy). This brief describes *what*
> the system does and *why*. The architecture document specifies *how* it is structured.

---

## Problem Statement

The household currently manages finances through a complex Google Sheets document with
manual formulas, Google Apps Script automation, and multi-person data entry. It works —
but it demands constant maintenance, has no proper visualisation, requires manual
reconciliation against bank statements every few days, and breaks whenever a new financial
product is added to the household's life.

More fundamentally: the spreadsheet has no model. Each sheet is a one-off structure.
Adding an insurance policy means a new sheet with new formulas. Adding a person means
duplicating columns. There is no shared logic, no hierarchy, and no extensibility.

Financial Tracker v2 replaces this with a **properly modelled, self-hosted web application**
built on a coherent entity hierarchy — so that adding a new account type, a new household
member, or a new currency is a configuration change, not a rebuild.

---

## Product Vision

A self-hosted, multi-user financial tracking web application for a small household (2–4
people) that:

- Replaces the Google Sheets setup with a database-backed system
- Tracks all financial entities — accounts, events, budgets, forex, transfers — through a
  unified entity hierarchy
- Automates recurring payments from all contributing sources
- Supports multi-currency transactions with daily FX rates, forex loss tracking, and
  flexible display currency switching
- Provides visual dashboards with drill-down capability at household and per-person level
- Computes household debt automatically from transaction flags — no separate debt entry
- Runs at zero ongoing hosting cost on Google Cloud

---

## What Sets This Apart

Most personal finance applications convert foreign currency amounts using spot exchange rates.
This gives you a theoretically correct figure — but not the figure that actually appears on
your bank statement.

Real-world credit card and bank transactions include:
- **Card network fees** (Visa/Mastercard typically 1–1.5%)
- **Issuer FX margins** (varies per bank and card product)
- **GST on conversion fees** (applicable in some jurisdictions)

These charges mean the SGD amount on your statement is consistently higher than
`NZD amount × spot rate`. The difference — tracked per transaction as `fx_delta` — accumulates
into a meaningful annual cost that most apps make invisible.

Financial Tracker v2 solves this with **per-account FX formulas**. Each bank account or credit
card can have an FX fee formula assigned (e.g. `amount × rate × 1.015` for a card with a 1.5%
foreign transaction fee). When you enter a foreign currency transaction on that card, the system
auto-fills the base-currency amount using the formula rather than the raw spot rate — producing
a figure that matches your actual bank statement without manual correction.

Manual override is always available: enter the exact SGD figure from your statement and the
system records the delta. Over time, the dashboard surfaces your true total forex cost — not
a theoretical one.

The Google Sheets setup this replaces accumulated years of manual corrections to spot-rate
conversions. This application makes those corrections automatic, transparent, and measurable.

The full multi-currency architecture — `MonetaryValue` block, `fx_delta` tracking, per-account
formula assignment, display-currency switching is elaborated later.

---

## Target Users

| Role | Person | Description |
|---|---|---|
| Primary User | Ben | Technical, manages the system, handles most financial setup |
| Household Member | Kim | Needs to view and add transactions; accesses personal financial view |

Both users are `EntityPersons` within the same `EntityHousehold`. Ben holds the `owner`
role; Kim holds `admin`. Both have equal transaction entry capability. Role difference
affects administrative operations only.

**PersonDashboard:** Each person sees the household aggregate by default. They can filter
to their own views — showing only their own accounts and events, and if admin or higher, others as well.
This is not a separate data model; it is a view filter over the same household data.

---

## Core Design Philosophy

Every financial concept in this application is an instance of a known entity class.
Accounts, transactions, recurring payments, budgets, currencies, formulas, and debt are
not ad-hoc modules. They are nodes in a hierarchy with shared behaviour, shared fields,
and shared UI patterns.

**What this means in practice:**

- Adding a new account type (e.g. a cryptocurrency wallet) requires a new subclass of
  `EntityAccounts` — not a new page, not a new API, not a new component.
- Changing the archive behaviour applies everywhere simultaneously.
- A colour token change in the theme propagates to every design entity card in the app.
- Multi-currency handling is defined once in `MonetaryValue` and used on every financial
  entity without repetition.

This brief summarises the hierarchy at a product level.

---

## Entity Overview

The application is structured around ten entity families:

**EntityHousehold** — the overarching household entity. It holds EntityPersons at different
adminstrative capabilities and can be created, archived, restored, and deleted.

**EntityPersons** — household members. Each person is both a system user (Google OAuth
identity) and a financial participant (with their own accounts, transactions, and
personal dashboard view). A person belongs to exactly one household.

**EntityAccounts** — anything that holds financial value. Bank accounts, credit cards,
capital and investment accounts, physical assets (property, vehicles), and insurance
policies all inherit from a common `BaseAccount`. Each account belongs to one or more
persons. Credit cards additionally serve as debt sources. Assets, insurance, and capital
accounts additionally spawn recurring payments. Every account records its value over time as
periodic `AccountSnapshots`, giving each one a month/year value-history chart: for
ledger-backed accounts (bank, credit card) the balance is computed from events, anchored by an
opening balance and optional manual corrections; for asset-like accounts (property, insurance,
capital) the snapshots themselves are the value series.

**EntityEvents** — anything that happens financially. Transactions, recurring payments,
and transfers all inherit from `BaseFinancialEvent`. Every event has an id, monetary value,
a payee, a category, a transaction status (pending/completed/cancelled/reconciled), and
a lifecycle status. Recurring payments know their own schedule — including free-text date
descriptions that are parsed, confirmed by the user, and stored as structured rules.
Insurance, asset, and capital account payments flow into the recurring payment processor
automatically.

**EntityBudgets** — aspirational spending targets. Monthly or yearly, per-person or
household-wide, linked to a category. Budget actuals are computed from matching events —
never entered manually. Both monthly and yearly budgets can coexist for the same category.
Budget visualisations support three levels of drill-down: category totals → contributing
transactions → subcategory breakdown.

**EntityCategories** — the classification system. Household-specific, up to two levels
deep (parent → subcategory). Used by events, budgets, and recurring payments. Spending
rolls up from subcategory to parent automatically.

**EntityCurrencies** — the monetary layer. One default base currency. Daily FX
rates fetched from an external API and cached. Any transaction in a foreign currency
stores both the original amount and the base-currency equivalent, with the gap between the
API rate and the actual bank rate tracked as forex loss. Users can switch their display
currency (e.g. NZD) without affecting stored values. All visualisations support
raw-currency stacked views, display currency stacked views, and converted aggregate views.

**EntityFormulas** — Formula used for computing straight-line depreciation,
declining-balance depreciation, compound interest, loan amortisation, FX delta,
budget variance, net worth. Custom formula can be assigned to specific fields.

**EntityDebt** — household debt is never entered. It is computed automatically from two
signals: outflow transactions flagged as shared household expenses (internal debt), and
credit card balances not yet repaid (card debt). Debt is cleared when a Transfer is made
to the relevant account. The system detects this automatically.

**EntityVisualization** — the universal charting layer. Every entity with history (accounts,
budgets, currencies) carries a mini-chart on its card that expands into a full visualization
viewer. The viewer also charts *groups* of events: filter the ledger to a set (e.g. every
"Netflix" transaction) and see it aggregated over time — count, sum, or average by month/year.
Chart types include bar, line, pie, area, and stacked, in automatically colour-coded series
that the user can toggle on and off. The same `VisualizationFilter` drives drill-down,
cross-module navigation, raw-vs-converted currency, and person/category comparison.

---

## Modules / Tabs

| Module | Primary Entity | Description |
|---|---|---|
| Dashboard | All | Household overview: net worth, spending, income, upcoming payments, alerts. Filterable to PersonDashboard. |
| Accounts | EntityAccounts (bank) | Balance tracking and history, transaction history, reconciliation |
| Capital | EntityAccounts (capital) | Portfolio value tracking and history, inflow/outflow, interest and growth |
| Assets | EntityAccounts (asset) | Property and vehicle values, depreciation, loan repayments and valuation tracking and history |
| Insurance | EntityAccounts (insurance) | Policy details, premium tracking and history, recurring premium payments |
| Transactions | EntityEvents (transaction) | Full transaction ledger, filtering and sorting, quick entry, CSV import/export, duplicate detection |
| Recurring Payments | EntityEvents (recurring) | All recurring sources: explicit schedules + capital/asset/insurance payments. Verification view for missed occurrences. |
| Transfers | EntityEvents (transfer) | Inter-account transfers |
| Debt | EntityDebt | calculated debt, debt-clearing detection |
| Budgets | EntityBudgets | Monthly and yearly spending targets vs actuals, drill-down visualisation, sorting and filtering visualizations |
| Categories | EntityCategories | Category management, hierarchy |
| Formula | EntityFormula | System formula and user defined |
| Currencies | EntityCurrencies | Currency setup, forex tracking and history |
| Settings | EntityHousehold, EntityPersons | Household configuration and management, member management, theme management, import and export |

---

## Multi-Currency Approach

The household is based in New Zealand with ongoing financial commitments in Singapore
(credit card payments, mortgage, insurance). Travel to the Philippines, the United States,
and other countries means USD, PHP, and additional currencies appear regularly.

The system supports **all ISO 4217 currencies** without restriction.While SGD is the current household's
base currency by default, any currency could be selected at initial onset. Once selected, this cannot be changed
as a lot of data relies on this default currency.
NZD is the primary display currency for the NZ-based household members, but one could change this interactively.
Any currency encountered during travel can be added on demand.

The system handles this by:
- Storing every monetary amount in both its original currency and the household base
  currency (SGD)
- Allowing users to override the base-currency amount when the bank statement differs
  from the API rate — the gap is recorded as forex loss
- Letting each person choose a display currency that converts all views
  at render time without altering stored data
- Showing visualisations in both raw-currency stacked views and converted aggregate views
- Fetching daily FX rates for all active currencies — not just SGD/NZD

---

## Recurring Payments

Recurring payments are not a single module — they are a family of sources that all feed
into the same event processor:

- **Explicit schedules:** manually created entries with free-text date descriptions
  (e.g. "3rd of every month"). UI parses and confirms before storing structured rule.
- **Capital accounts:** periodic payments due to DCA, accumulated interest or dividend inflows
- **Asset accounts:** loan and mortgage repayments
- **Insurance accounts:** yearly or periodic premium payments

All four sources generate events through a single scheduler. Missed occurrences are
detected automatically and surfaced as alerts.

---

## Debt Tracking

Debt is a derived concept. It is never manually entered.

**Internal household debt:** When a person pays for a shared household expense from their
personal account or credit cards, they flag the transaction as a shared expense. The system accumulates
this to determine what the household "owes" that person. A transfer back to that person
clears this internal household debt automatically.

**Credit card debt:** The outstanding balance on any credit card. Each outflow adds to
it; each repayment transfer reduces it. Detected automatically. It is currently assumed that a user will definitely
pay off the credit card debt each month, therefore it is kept for posterity whereby if bank integration does happen, this
will be automatically flagged

---

## Assumptions

1. **Deployment:** Google Cloud Run — serverless, integrates with Google OAuth, zero idle cost
2. **Authentication:** Google OAuth 2.0 — no password storage
3. **Database:** SQLite (WAL mode) — zero cost, sufficient for 2–4 concurrent users
4. **Backup:** Automated daily backups to Google Cloud Storage
5. **Mobile:** Responsive web only — no native app
6. **Timezone:** Single shared household timezone, configurable in settings
7. **Data retention:** 3 years active; older data exported to CSV on request
8. **Cost:** $0/month target — free tiers only; circuit breakers on all external APIs
9. **Invitations:** In-app only — no emails sent; email-matching flow on login
10. **Audit trail:** All mutations logged; empty entities may be hard-deleted during setup
    without audit entries

---

## Success Criteria

- Fully replaces Google Sheets as the household's primary financial system
- All household members can independently enter and review transactions
- Recurring payments process automatically from all four sources
- Multi-currency transactions entered and visualised in under 5 seconds
- Dashboard provides household and per-person financial overview with drill-down
- Interactive visualisations operate as view filters across all modules — any chart
  segment can be clicked to filter the underlying data, drill down to contributing
  records, and navigate across module boundaries with filter state preserved
- Raw-currency and converted-aggregate views are available on every chart and
  switch simultaneously from a single toggle
- Debt is always current without manual entry
- A new entity type can be added without touching shared infrastructure

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Migration from Google Sheets | High | CSV import with category mapping; validate before cutover |
| Recurring payments on serverless scale-to-zero | High | Cloud Scheduler (managed cron) → authenticated `/jobs/*` endpoints; jobs idempotent + catch-up-aware so a scale-to-zero gap self-heals (ARCH §1.7/§5.6) |
| FX rate API reliability | Medium | Cache last known rate; circuit breaker; no retry storm |
| Multi-user concurrency on SQLite | Medium | WAL mode; optimistic locking on critical paths |
| Data loss | High | Daily GCS backups; archive-then-delete pattern |

---

## Out of Scope (MVP)

- Native iOS / Android app
- Email notifications (deferred to Phase 3)
- Real-time collaborative editing
- Bank feed integration
- Sound system and advanced animation (future extension)
- Accountant-level tax reporting

---

*Open questions are tracked in `prd.md`. Technical detail is in `architecture.md`.
Entity hierarchy authority is `architecture.md` §3.0a.*
