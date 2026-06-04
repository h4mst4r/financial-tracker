---
title: Financial Tracker — Product Requirements Document
version: 2.0
status: living
created: 2026-05-23
updated: 2026-05-26
authority: Feature requirements and acceptance criteria. Derives from
           entity-design-philosophy.md. Technical implementation in architecture.md.
           UI component specs in ux-design-specification.md.
---

# Financial Tracker — Product Requirements Document

> **Design authority:** Entity definitions, field names, inheritance rules, and
> architectural patterns are specified in `entity-design-philosophy.md` [EDP].
> This document specifies *what the system must do* — functional requirements,
> acceptance criteria, and non-functional constraints.
> Technical implementation detail belongs in `architecture.md`.

---

## 0. Entity Philosophy Preamble

All features in this PRD are expressed in terms of the entity hierarchy defined in
`entity-design-philosophy.md`. Requirements are grouped by entity family. Each entity
family's requirements apply to **all subtypes** unless a subtype is explicitly named.

The entity families in scope:

| Prefix | Entity Family | Subtypes / Scope |
|---|---|---|
| FR-HH | EntityHousehold | Household settings, membership, base currency |
| FR-P | EntityPersons | User + HouseholdMember combined; PersonDashboard |
| FR-A | EntityAccounts | Bank, CreditCard, Capital, Asset, Insurance |
| FR-E | EntityEvents | Transaction, RecurringPayment, Transfer |
| FR-B | EntityBudgets | Monthly + yearly; per-person + household-wide |
| FR-C | EntityCategories | Household-specific hierarchy, max 2 levels |
| FR-CU | EntityCurrencies | All ISO 4217; FX rates; multi-display |
| FR-F | EntityFormulas | System defaults + user-configurable |
| FR-D | EntityDebt | Computed only — never entered manually |
| FR-V | EntityVisualization | VisualizationFilter; all charts; comparison modes |
| FR-IE | Import/Export | CSV import (two-step) + export |
| FR-SYS | System | Auth, scheduler, alerts, audit, backup |

**Cross-cutting rules that apply to every FR below:**

1. Every entity supports: Create, Edit, Archive, Restore, Hard-Delete-if-Empty, Duplicate.
2. Every entity is scoped to `household_id` — no cross-household data access possible.
3. Every mutation produces an audit log entry (except hard-delete of empty entities).
4. Every monetary field uses the `MonetaryValue` block [EDP §3.2] — never ad-hoc amount fields.
5. Dates are stored and transmitted in ISO 8601 (`YYYY-MM-DD`); displayed in `DD-MM-YYYY`.

---

## 1. Product Overview

See `brief.md` for full vision, target users, assumptions, and success criteria.
This document does not repeat the brief. Summary only:

- Self-hosted household financial tracker for 2–4 users
- Replaces Google Sheets + Apps Script
- Runs on Google Cloud Run at zero cost
- Multi-currency (SGD base; NZD, USD, PHP, all ISO 4217 supported)
- Two users: Ben (owner) and Kim (member)

---

## 2. User Roles and Permissions

| Capability | Member | Admin | Owner |
|---|---|---|---|
| View all household data | ✓ | ✓ | ✓ |
| Create / edit own events | ✓ | ✓ | ✓ |
| Create / edit any event | — | ✓ | ✓ |
| Create / edit accounts | — | ✓ | ✓ |
| Manage categories | — | ✓ | ✓ |
| Invite / remove members | — | ✓ | ✓ |
| Change member roles | — | — | ✓ |
| Change base currency | — | — | ✓ |
| Delete household | — | — | ✓ |
| Access settings | — | ✓ | ✓ |

---

## 3. Functional Requirements

### FR-HH — EntityHousehold

**FR-HH-001 — Household Creation**
On first Google OAuth login, the system first checks whether the verified email matches
a pending household invitation. If a match is found, the person joins the invited household
as `member` and the invitation is accepted. If no match is found, a new household is created
with the logged-in person as `owner`.
*Acceptance:* New user with pending invitation → joins invited household (no new household created).
New user without invitation → new household created; person has role `owner`; base currency
defaults to SGD; timezone defaults to Asia/Singapore.

**FR-HH-002 — Household Configuration**
Owner may update: household name, timezone, and base currency.
*Acceptance:* Changes persist. Timezone change updates all future scheduler job times.
Base currency change triggers background recalculation of all `amount_base` values
(see FR-CU-005).

**FR-HH-003 — Member Invitation**
Admin or Owner may invite a new member by entering their Google email address.
The invitation is in-app only — no email is sent. The invitee must log in with the
exact Google account matching the invited email; the system then links them to the household.
*Acceptance:* Invitation record created with 7-day expiry. On matching login, person
is created with role `member` and joined to the household.

**FR-HH-004 — Invitation Management**
Admin or Owner may view pending invitations and cancel any of them. Pending invitations
display as a shareable join URL (`/join/<invitation_id>`) that invitees open to accept.
*Acceptance:* Cancelled invitations change status to `cancelled`; visiting a cancelled
or expired join URL shows a clear error message, not a blank screen.

**FR-HH-005 — Household Permanent Deletion**
The household owner may permanently and irreversibly delete the entire household and all
associated data (persons, accounts, events, budgets, categories, invitations, sessions).
The action requires typing the exact household name as confirmation.
*Acceptance:* Household and all child records removed from the database; all active
sessions for household members are invalidated; owner is logged out and redirected to
the login page; action is owner-only (admin/member receives 403).

---

### FR-P — EntityPersons

**FR-P-001 — Google OAuth Login**
All authentication is via Google OAuth 2.0. No passwords are stored.
*Acceptance:* User clicks Login → redirected to Google → redirected back →
session cookie set → redirected to Dashboard.

**FR-P-002 — Join Household**
A person with a pending invitation may join the household by logging in with the
invited Google account. If the email matches, they are added to the household.
*Acceptance:* Invitation status changes to `accepted`; person record created with
`member` role; person can access all household data.

**FR-P-003 — Profile Management**
Any person may update their own `display_name`.
*Acceptance:* Change persists; `display_name` updates everywhere it appears
(PersonRef, PersonCard, PersonDashboard header).

**FR-P-004 — Display Currency Preference**
Any person may set their preferred display currency. This affects how all monetary
values, charts, and dashboards are rendered for that person.
*Acceptance:* Changing display currency from SGD to NZD immediately converts all
dashboard values to NZD using current FX rate. Stored `amount_base` values are unchanged.

**FR-P-005 — Role Management**
Owner may change any member's role (member ↔ admin). Owner role cannot be transferred
via this interface (requires direct DB action for safety).
*Acceptance:* Role change takes effect on next request from that person.

**FR-P-006 — PersonDashboard**
Any person may filter the entire application to show only their own data. The
default view is the household aggregate. A persistent toggle switches between
"Household" and "My Finances" views. The chosen mode is stored as
`Person.default_view` (`household` | `personal`) and persists across sessions.
*Acceptance:* On login, the app loads in the person's last-used view mode.
In "My Finances" mode, all charts, lists, and summaries filter to
`payee_person_id = current_person.id`. The VisualizationFilter is updated with
`person_ids = [current_person.id]`.

**FR-P-007 — Archive Member**
Owner may archive a household member who has left. Archived members retain all
their historical events and accounts — data is never deleted.
*Acceptance:* Archived member cannot log in; their events and accounts remain visible
in household history; PersonRef resolves to their name + "(archived)" label.

**FR-P-008 — Hard Delete Empty Person**
A person who has never created any event, account, or other record may be
hard-deleted (not archived) — no audit log entry produced.
*Acceptance:* System checks all FK references before permitting hard delete. If any
exist, hard delete is blocked and archiving is offered instead.

---

### FR-A — EntityAccounts

**FR-A-001 — Create Account**
Any Admin or Owner may create an account of any type. Account type is selected from
a picker; the form adapts to show the relevant fields for that subtype.
*Acceptance:* Account created with at least one owner (the creator, by default);
MonetaryValue block populated; status = `active`.

**FR-A-002 — Edit Account**
Any Admin or Owner may edit any account's fields.
*Acceptance:* Changes persist; `updated_at` and `updated_by` refreshed; audit log entry created.

**FR-A-003 — Archive / Restore Account**
Any Admin or Owner may archive an account. Archived accounts are hidden from
default views but their transaction history is preserved.
*Acceptance:* `archived = true`, `archived_at` set. Account excluded from balance
totals and default lists. Restore reverses this.

**FR-A-004 — Hard Delete Empty Account**
An account with zero linked events and no FK references may be hard-deleted.
*Acceptance:* System dependency scan runs before allowing. If dependencies exist,
only archiving is offered. INFO log entry written; no audit record.

**FR-A-005 — Duplicate Account**
Any account may be duplicated (clones all fields, new UUID, cleared monetary values).
*Acceptance:* Duplicate appears in list; owner is the duplicating person; all
subtype-specific fields copied.

**FR-A-006 — Multiple Account Owners**
Any Admin or Owner may add or remove owners on an account. An account must always
have at least one owner.
*Acceptance:* `account_owners` junction updated. PersonRef renders all owners on
the AccountCard.

**FR-A-007 — Account Transaction History**
Any user may view a filtered list of all events linked to a specific account
(via `source_account_id`).
*Acceptance:* History list is paginated, sortable by date, filterable by status.

**FR-A-008 — Month-Year Snapshot**
For periodic account types (CreditCard, Capital, Asset), a `month_year` field
records the statement month this balance represents.
*Acceptance:* `month_year` shown on AccountCard; used in account-balance-history
visualization grouping.

**FR-A-009 — BankAccount: Interest Rate**
A BankAccount may have an optional `interest_rate` and `interest_frequency`.
*Acceptance:* Fields are optional. When set, they are visible on the AccountCard
and used by relevant EntityFormulas.

**FR-A-010 — CreditCard: Limit and Billing**
A CreditCard must capture `credit_limit`, `billing_day`, `due_day`, and optionally
`reward_points` and `annual_fee`.
*Acceptance:* `billing_day` and `due_day` are used to compute the next billing cycle
date shown on the CreditCard card view.

**FR-A-011 — CreditCard: Computed Debt Display**
The computed debt balance (from EntityDebt) is shown directly on the CreditCard
AccountCard and in the CreditCard detail view. It updates in real time as events change.
*Acceptance:* Debt balance = sum of outflows - sum of repayment transfers. Matches
FR-D-002.

**FR-A-012 — Capital: Investment Type and Values**
A CapitalAccount captures `investment_type` (stock, bond, fund, cpf, fixed_deposit),
`cost_basis`, and `current_value`.
*Acceptance:* All three fields visible on CapitalCard. Return on investment
(`current_value - cost_basis`) shown as a derived display field.

**FR-A-013 — Asset: Purchase and Depreciation**
An AssetAccount captures `asset_type`, `purchase_date`, `purchase_value`, and
optionally a `depreciation_formula_id`.
*Acceptance:* When formula is assigned, current estimated value is shown on hover
using FR-F-004 formula hover reveal.

**FR-A-014 — Asset: Valuation Records**
Any Admin or Owner may add a valuation record to an asset at any time.
Fields: `valuation_date`, `value`, `currency`, `source` (manual / appraisal / formula), `notes`.
*Acceptance:* Valuation record persists; current value = latest record by date.

**FR-A-015 — Asset: Valuation History Chart**
The Asset detail view shows a line chart of valuation records over time.
*Acceptance:* Chart shows all `ValuationRecord` entries sorted by `valuation_date`.
Supports raw and converted currency modes.

**FR-A-016 — Insurance: Policy Details**
An InsuranceAccount captures `policy_type`, `coverage_types[]`, `premium_frequency`,
`purchase_date`, `coverage_amount`, and `insurer`.
*Acceptance:* All fields visible on InsuranceCard. Coverage types rendered as tags.

**FR-A-017 — RecurringEventSource Configuration**
For Asset, Capital, and Insurance accounts, Admin or Owner may configure a
`recurring_config` block (enabled, frequency_text, payee, category, amount override).
*Acceptance:* When enabled, the scheduler picks up this account as a recurring
payment source and generates transactions accordingly [EDP §6.4].

---

### FR-E — EntityEvents

**FR-E-001 — Create Transaction**
Any user may create a transaction (inflow or outflow). Required: name, event_date,
transaction_type, MonetaryValue, payee, category. Optional: payment_method, notes,
is_gst_claimable, is_gift, source_account.
*Acceptance:* Transaction created; `transaction_status` defaults to `completed`;
event appears in ledger; budget actuals recomputed.

**FR-E-002 — Edit Transaction**
Any Admin or Owner may edit any transaction. Member may edit their own.
*Acceptance:* Changes persist; audit log entry created; budget actuals recomputed.

**FR-E-003 — Archive / Restore Transaction**
*Acceptance:* Archived transaction excluded from budget actuals, reports, and
default ledger view. Restoring reverses all exclusions.

**FR-E-004 — Transaction Status**
User may set `transaction_status` on any transaction:
`pending` / `completed` / `cancelled` / `reconciled`.
*Acceptance:* `pending` transactions appear in ledger with a distinct visual
indicator. `cancelled` transactions are excluded from all budget actuals and
aggregations. `reconciled` transactions show a checkmark.

**FR-E-005 — Reconciliation**
User may mark a transaction as `reconciled` — confirming it matches their bank
or card statement.
*Acceptance:* `reconciled = true`, `reconciled_at` set. Reconciliation status
visible in ledger view. Filter for unreconciled transactions available.

**FR-E-006 — Shared Household Expense Flag**
On any outflow transaction, user may set `is_shared_expense = true` to indicate
that this personal payment covers a shared household cost.
*Acceptance:* Flag only available when `transaction_type = outflow`. System
immediately updates computed debt balance for the payee person [FR-D-001].

**FR-E-007 — Duplicate Detection**
On save (create or edit), the system checks for duplicates using the criteria
defined in [EDP §13.3].
*Acceptance:* If a candidate duplicate is found, the user is shown a warning with
the duplicate's name, date, and amount. User may: proceed (ignore warning), link
as duplicate (sets `duplicate_of`), or cancel.

**FR-E-008 — MonetaryValue Entry**
When entering a transaction in a foreign currency, the user enters `currency` and
`amount`. The system auto-fills `amount_base_calculated` using today's FX rate.
The user may override `amount_base` with the actual bank statement figure.
`fx_delta` is shown immediately on override.
*Acceptance:* `amount_base_calculated` is read-only after auto-fill. `amount_base`
is editable. `fx_delta = amount_base_calculated - amount_base` shown inline.
When `currency == base_currency`, forex fields are hidden.

**FR-E-009 — GST and Gift Flags**
Any transaction may be flagged as `is_gst_claimable` or `is_gift`.
*Acceptance:* Flags visible as icons on TransactionCard. Filterable in ledger view.

**FR-E-010 — Create Recurring Payment**
Admin or Owner may create a recurring payment with a free-text `frequency_text`
(e.g. "3rd of every month", "every Sunday").
*Acceptance:* On entry, the UI displays the parsed next occurrence date alongside
the raw text. User must confirm the parsed date before saving. `frequency_rule`
stored as structured JSON. `frequency_text` stored as display reference.

**FR-E-011 — Recurring Date Patterns**
The system must support all nine date patterns from v1 [EDP §7.3]:
every [weekday], weekly, monthly, [N]th of every month, every [N] days,
every [N] weeks, [Nth] [weekday] of [month], [month] [day], yearly.
*Acceptance:* Each pattern produces the correct `next_occurrence` for at least
three test cases each.

**FR-E-012 — Occurrence History**
The Recurring Payments module shows a history view of all expected occurrences for
each recurring payment: their expected date, status (upcoming / processed / skipped /
missed / failed), and the linked transaction if processed.
*Acceptance:* Occurrences computed from `frequency_rule` between `start_date` and today.
Each occurrence has a distinct status badge. Missed occurrences show in red.

**FR-E-013 — Skip Occurrence**
User may manually skip an upcoming occurrence without deleting the recurring payment.
*Acceptance:* OccurrenceRecord status = `skipped`. No transaction generated for
that date. Subsequent occurrences continue as scheduled.

**FR-E-014 — Missed Occurrence Alert**
If an expected occurrence date passes without a processed transaction and no skip
record, the system generates a RECURRING_MISSED alert on the next daily alert job run.
*Acceptance:* Alert appears in the in-app alert panel. Alert links to the affected
recurring payment. Can be dismissed.

**FR-E-015 — Create Transfer**
Admin or Owner may create a transfer between two accounts.
Required: `source_account_id`, `destination_account_id`, MonetaryValue.
If the accounts use different currencies, both the source amount and the destination
amount may be entered separately.
*Acceptance:* Transfer event created. Source account balance decreases; destination
account balance increases. Debt-clearing logic runs automatically [FR-D-004].

**FR-E-016 — Debt Repayment Auto-Detection**
When a transfer's `destination_account_id` belongs to a CreditCard account, the
system automatically sets `is_debt_repayment = true`.
*Acceptance:* Transfer saved with flag set. Computed credit card debt balance
immediately decreases by `debt_cleared_amount`. User sees updated debt on the
CreditCard card.

**FR-E-017 — Override Debt Repayment Flag**
User may override `is_debt_repayment = false` on any transfer where it was
auto-detected as true (e.g. topping up a card for spending, not repayment).
*Acceptance:* Override persists. Debt balance is NOT reduced for this transfer.

---

### FR-B — EntityBudgets

**FR-B-001 — Create Monthly Budget**
Admin or Owner may create a monthly budget for a category, optionally scoped to
a specific person or household-wide (owner = null).
*Acceptance:* Budget created with `period_type = monthly`, `period_start` =
first day of selected month, `period_end` = last day of selected month.

**FR-B-002 — Create Yearly Budget**
Admin or Owner may create a yearly budget for a category.
*Acceptance:* Budget created with `period_type = yearly`. Both monthly and yearly
budgets may coexist for the same category.

**FR-B-003 — Real-Time Budget Actuals**
Budget actual spending is computed live from matching events [EDP §8].
It is never stored as a field — it is always derived at query time.
*Acceptance:* Adding or editing a transaction in the relevant category immediately
changes the displayed budget actual when the budget view is refreshed.

**FR-B-004 — Budget Alert Threshold**
When actual spending reaches `alert_threshold_pct`% of the limit, a BUDGET_WARNING
alert is generated. When it exceeds 100%, a BUDGET_EXCEEDED alert is generated.
*Acceptance:* Alerts generated by the daily alert job. Alert badge on the relevant
budget in the Budgets module.

**FR-B-005 — Monthly Budget Auto-Rollover**
On the first day of each month, the scheduler automatically creates the next
month's budget record, copying the limit from the previous month.
*Acceptance:* New budget record exists by 01:00 household timezone. Limit matches
prior month unless the user has manually created the new record already.

**FR-B-006 — Budget Drill-Down (Level 2)**
Clicking a budget's bar or progress indicator opens a secondary view showing
all individual transactions that contributed to that budget's actual spend
for the period.
*Acceptance:* Transaction list is filtered by category, period, and owner
(matching the budget's definition). VisualizationFilter is updated on click.

**FR-B-007 — Budget Drill-Down (Level 3)**
If the selected budget category has subcategories, a tertiary view shows the
spending breakdown by subcategory.
*Acceptance:* Subcategory totals sum to the parent category total.
Clicking a subcategory row filters to transactions in that subcategory.

**FR-B-008 — Budget History**
User may view a trend chart showing budget limit vs actual spend across all
historical periods for a given category and owner scope.
*Acceptance:* Chart sourced from `/api/visualizations/budget-history`. Shows
all budget period instances (monthly or yearly) in chronological order.

**FR-B-009 — Rollover Unspent Balance**
If `rollover = true`, the scheduler carries the unspent balance from the previous
period into the next period's limit.
*Acceptance:* New period `limit = prior_limit + prior_unspent`. Unspent =
`prior_limit_amount_base - prior_actual_spent`. Never goes negative.

---

### FR-C — EntityCategories

**FR-C-001 — Create Category**
Admin or Owner may create a category with: name, color (hex or picker),
icon (emoji or icon picker), category_type (income/expense/both).
*Acceptance:* Category created with `depth = 0` (top-level). Available in all
entity dropdowns immediately.

**FR-C-002 — Create Subcategory**
Admin or Owner may create a subcategory under any top-level category.
Max depth = 1 (no grandchildren).
*Acceptance:* Subcategory created with `depth = 1`, `parent_id` set. System
enforces depth constraint — attempting to create a child of a subcategory is rejected.

**FR-C-003 — Edit Category**
Admin or Owner may edit name, color, icon, and category_type.
*Acceptance:* Changes reflect immediately in all dropdowns and charts using that category.

**FR-C-004 — Archive Category**
Archiving a category hides it from dropdowns but preserves it on all historical events.
*Acceptance:* Archived category excluded from new event category picker.
Existing events retain their `category_id`; the category name still resolves for display.
If category has subcategories, they are archived together.

**FR-C-005 — Hard Delete Empty Category**
A category with zero linked events, budgets, or recurring payments may be hard-deleted.
*Acceptance:* Dependency scan runs. If any reference exists, hard delete is blocked.

**FR-C-006 — Default Category Creation**
A one-click button in the Categories module creates 17 default categories
(12 expense + 5 income) tailored to household use. This is idempotent — running
it twice does not create duplicates.
*Acceptance:* 17 categories created with predefined names, colors, and icons.
Existing categories with matching names are skipped.

**FR-C-007 — Category Spending Rollup**
When computing budget actuals or visualization totals for a parent category, all
matching transactions from child categories are included.
*Acceptance:* Total for "Food" = sum of transactions in "Food" + "Groceries" +
"Eating Out" (if those are subcategories of "Food").

---

### FR-CU — EntityCurrencies

**FR-CU-001 — View Currency List**
Any user may view all household currencies with their current FX rate,
last-fetched timestamp, fee %, and whether they are the base or display-active.
*Acceptance:* Currency list visible in Settings. Shows rate freshness (stale if
> 48 hours old, shown with a warning indicator).

**FR-CU-002 — Add Currency**
Admin or Owner may add any ISO 4217 currency to the household.
*Acceptance:* Currency added; FX rate fetched immediately on creation;
currency available in all monetary value entry fields.

**FR-CU-003 — Configure Display Currencies**
Admin or Owner may toggle which currencies appear in the household currency
switcher (up to 4 simultaneously active display currencies).
*Acceptance:* `is_display_active` currencies appear in the global currency
switcher in the top bar. Non-active currencies are still usable for transaction
entry but not shown in the switcher.

**FR-CU-004 — Per-Person Display Currency**
Any user may set their personal `display_currency` preference from among the
display-active currencies.
*Acceptance:* All of that person's charts, dashboards, and MonetaryValue displays
render in their chosen display currency using the current FX rate. Stored
`amount_base` values are not modified.

**FR-CU-005 — Change Base Currency (Owner)**
The household owner may change the base currency. This triggers a background job
that recalculates all `amount_base` values across all entities.
*Acceptance:* Background job runs; all `amount_base` and `amount_base_calculated`
values updated using the historical FX rate for each event's `event_date`.
A system alert is shown while the job is running and on completion.

**FR-CU-006 — Daily FX Rate Fetch**
The scheduler fetches FX rates daily for all non-base currencies with
`is_display_active = true` or that have appeared in any event in the past 90 days.
*Acceptance:* `Currency.rate_to_base` and `last_rate_at` updated. `FxRateHistory`
record created. Circuit breaker: on API failure, last known rate is preserved;
SYSTEM_ALERT generated after 3 consecutive failures.

**FR-CU-007 — Conversion Fee Configuration**
Admin or Owner may set a `fee_pct` per currency (e.g. 1.5% for Visa foreign
transaction fee on NZD transactions).
*Acceptance:* `fee_pct` stored. When entering a transaction in that currency, the
`fee_amount` field is pre-filled with `amount × fee_pct` and editable.

**FR-CU-008 — Raw vs Converted Toggle**
All visualizations and summary views support a global toggle between:
- **Raw mode:** amounts shown in their original currency, stacked by currency
- **Converted mode:** all amounts converted to the user's `display_currency`
*Acceptance:* Toggle is part of the `VisualizationFilter` and changes all active
charts simultaneously. No additional API call required — both modes are served
in a single response.

---

### FR-F — EntityFormulas

**FR-F-001 — View System Default Formulas**
Any user may view the list of system-provided formulas, their expressions,
the entity types they apply to, and their variable definitions.
*Acceptance:* System formulas are read-only (cannot be deleted or modified).
Includes: straight-line depreciation, declining-balance depreciation,
compound interest, loan amortisation, FX delta, budget variance, net worth.

**FR-F-002 — Create Custom Formula**
Admin or Owner may create a custom formula with a name, expression, target
entity type, and variable definitions.
*Acceptance:* Custom formula saved; available for assignment to accounts
of the target entity type.

**FR-F-003 — Assign Formula to Account**
Admin or Owner may assign a formula to an account that supports it
(e.g. assign "Straight-Line Depreciation" to a Property asset).
*Acceptance:* `depreciation_formula_id` set on the AssetAccount. Formula is
evaluated using that account's `purchase_value`, `purchase_date`, and rate variable.

**FR-F-004 — Hover-Reveal Formula Results**
Formula computation results are shown only on hover — not displayed by default
to avoid cluttering card views.
*Acceptance:* Hovering over an AssetCard or CapitalCard reveals a tooltip
containing: formula name, current variable inputs, computed result, and
the data source date.

**FR-F-005 — Generate Valuation from Formula**
From an AssetAccount's detail view, Admin or Owner may run the assigned
depreciation formula to generate a new `ValuationRecord` using today's date.
*Acceptance:* ValuationRecord created with `source = "depreciation_formula"`,
`formula_id` set, value = formula output. Appears immediately in valuation history chart.

---

### FR-D — EntityDebt

**FR-D-001 — Debt is Always Computed, Never Entered**
There is no "create debt" screen. Debt is derived at query time from:
1. CreditCard outflow transactions minus repayment transfers [EDP §12.1]
2. Outflow transactions with `is_shared_expense = true` per person, minus
   repayment transfers to that person [EDP §12.1]
*Acceptance:* No debt entity exists in the data model. Debt figures update
immediately when a relevant transaction is added or edited.

**FR-D-002 — Credit Card Debt Display**
The current computed debt balance for each CreditCard is shown:
- On the CreditCard AccountCard
- In the Debt Summary section of the Dashboard
- In the Debt visualization charts
*Acceptance:* Debt = Σ outflows on card - Σ transfers to card flagged as repayment.
Matches `/api/visualizations/debt-summary` response.

**FR-D-003 — Internal Household Debt Display**
The amount the household owes each person (from shared expense transactions) is
shown on the Dashboard and in the Debt Summary view, broken down per person.
*Acceptance:* Each person's owed amount is shown with a list of the contributing
shared expense transactions. Drill-down to transaction list available.

**FR-D-004 — Auto-Clear Credit Card Debt via Transfer**
When a Transfer is created with a CreditCard as the `destination_account_id`,
`is_debt_repayment` is automatically set to `true` and `debt_cleared_amount`
is set to the transfer's `amount_base`.
*Acceptance:* Card debt balance immediately reflects the reduction.
CreditCard AccountCard shows updated balance.

**FR-D-005 — Auto-Clear Internal Household Debt via Transfer**
When a Transfer is created to a person's account where that person has an
outstanding `household_debt > 0`, `is_debt_repayment` is automatically set
to `true`.
*Acceptance:* That person's internal debt balance is reduced by the transfer amount.

**FR-D-006 — Override Debt Repayment Flag**
User may override `is_debt_repayment = false` on any transfer where it was
auto-set to true.
*Acceptance:* Override persists; debt balance is NOT reduced for this transfer.
A confirmation dialog explains the consequence before saving the override.

**FR-D-007 — Debt Summary Drill-Down**
The Debt Summary view allows the user to click into any debt balance and see
the individual transactions that created it.
*Acceptance:* Clicking a CreditCard debt → list of outflow transactions on
that card (unreconciled). Clicking a person's household debt → list of that
person's `is_shared_expense = true` transactions.

---

### FR-V — EntityVisualization

**FR-V-001 — VisualizationFilter Controls**
Every module and the Dashboard exposes a filter bar with controls for:
time range (preset: month / quarter / year / all-time / custom date range),
person (household aggregate or specific person), category, account,
transaction type (all / inflow / outflow), and currency mode (raw / converted).
*Acceptance:* Changing any filter control immediately updates all visible
charts and lists on that module page without a page reload.

**FR-V-002 — Chart Segment Drill-Down**
Clicking any segment, bar, or data point on any chart applies a filter and
shows a drill-down view. The breadcrumb trail at the top of the page records
the applied filters.
*Acceptance:* Breadcrumb shows each applied filter as a dismissible chip.
Dismissing a chip removes that filter and updates charts. "Clear all" resets
to the default filter state.

**FR-V-003 — Cross-Module Navigation**
A visualization interaction may navigate to another module with the
`VisualizationFilter` carried across.
*Acceptance:* Navigating from a Dashboard budget chart to the Transactions
module shows the transactions filtered to that category and period.
Browser back button restores the previous filter state.

**FR-V-004 — Raw vs Converted Currency Toggle**
A single toggle switches all active charts between raw-currency mode (stacked by
original currency) and converted mode (all in display currency).
*Acceptance:* Toggle is global — affects every chart on the current page.
Raw mode shows a distinct colour per currency. Converted mode shows a single
aggregated bar/line in the display currency.

**FR-V-005 — Person Comparison Mode**
User may select 2–4 household members and compare their spending side-by-side.
*Acceptance:* Charts show grouped bars or multi-line series, one per person.
Grouped by category, month, quarter, year, or payment method (user-selectable).
Sourced from `/api/visualizations/compare/persons`.

**FR-V-006 — Category Comparison Mode**
User may select 2–8 categories and compare their spending trends over time.
*Acceptance:* Multi-line or grouped bar chart, one series per category.
Grouped by month, quarter, or year. Sourced from
`/api/visualizations/compare/categories`.

**FR-V-007 — Budget History Chart**
A trend chart showing budget limit vs actual spending across all historical
periods for a selected category and owner scope.
*Acceptance:* Available in the Budgets module and Dashboard. Shows monthly
or yearly periods depending on `period_type`. Sourced from
`/api/visualizations/budget-history`.

**FR-V-008 — Capital / Portfolio History Chart**
A chart showing how a capital account's value, inflow, outflow, and earned
interest have changed over time.
*Acceptance:* Stacked area or multi-line chart. Supports raw and converted modes.
Sourced from `/api/visualizations/capital-history`.

**FR-V-009 — PersonDashboard**
In "My Finances" mode (FR-P-006), the Dashboard shows a personalised view:
net worth (own accounts only), personal spending by category, personal income
sources, personal budget status, and personal debt contribution.
*Acceptance:* All figures filtered to `person_ids = [current_person.id]`.
Toggle between Household and My Finances is persistent across sessions
(stored in `display_currency` settings — or a separate preference field).

**FR-V-010 — Date Display Format**
All dates displayed in the UI use `DD-MM-YYYY` format.
All date inputs accept `DD-MM-YYYY` format.
All dates are stored and transmitted as ISO 8601 `YYYY-MM-DD`.
*Acceptance:* A date entered as "27-05-2026" is stored as "2026-05-27".
A date stored as "2026-01-15" is displayed as "15-01-2026" everywhere in the UI.

---

### FR-IE — Import / Export

**FR-IE-001 — CSV Upload**
Any Admin or Owner may upload a CSV file of transactions.
*Acceptance:* Multipart file upload accepted. File size limit: 10 MB.
Accepted MIME types: `text/csv`, `application/csv`.

**FR-IE-002 — Two-Step Import Flow**
CSV import is a two-step process: (1) preview + mapping, (2) confirm.
The user never loses data from a misclick — they must explicitly confirm.
*Acceptance:* After upload, user sees a preview of all parsed rows with
suggested category mappings. User may correct mappings and exclude rows.
Only after pressing "Confirm Import" are records created.

**FR-IE-003 — Category Mapping Suggestions**
During the preview step, the system suggests a category for each row based
on the row's `category` field matching existing category names (case-insensitive).
Unmatched rows are flagged for manual selection.
*Acceptance:* Matched rows show a green indicator and the matched category.
Unmatched rows show an amber indicator and a required category picker.

**FR-IE-004 — Duplicate Detection During Import**
During import confirmation, each row is checked against existing transactions
using the duplicate detection rules [EDP §13.3].
*Acceptance:* Detected duplicates are shown in the preview with a warning.
User may choose to include (with `duplicate_of` set), exclude, or review each.

**FR-IE-005 — v1 Column Compatibility**
The CSV importer must correctly parse exports from the v1 Google Sheets
Financial Tracker, mapping v1 column names to v2 entity fields.
*Acceptance:* A v1 transaction CSV import produces correct records for all
columns: Name, Transaction Date, Currency Type, Amount, Amount (SGD), Payee,
Payment Method, Transaction Type, Category, Status.

**FR-IE-006 — CSV Export**
Any user may export transactions to CSV with all active `VisualizationFilter`
parameters applied (time range, person, category, account).
*Acceptance:* Export includes all fields defined in architecture.md §10.2.
Dates exported in `YYYY-MM-DD` format (ISO 8601 for data interchange).
File name: `financial-tracker-export-{YYYY-MM-DD}.csv`.

---

### FR-SYS — System Requirements

**FR-SYS-001 — Google OAuth 2.0 Authentication**
All login is via Google OAuth. No passwords stored. PKCE flow used.
*Acceptance:* Login → Google → callback → session cookie. Session idle timeout:
30 minutes. Session survives browser refresh (cookie-based).

**FR-SYS-002 — CSRF Protection**
All non-GET API requests require a valid `X-CSRF-Token` header.
Token rotates after each successful mutation.
*Acceptance:* Request without valid token returns 403. New token returned in
`X-New-CSRF-Token` response header.

**FR-SYS-003 — Audit Trail**
Every create, update, archive, restore, and permanent delete operation produces
an immutable audit log entry. Hard deletes of empty entities produce only an
INFO application log entry, not an audit record.
*Acceptance:* Audit log is append-only. No UPDATE or DELETE permitted on
the `audit_log` table. Each entry captures actor, action, entity type/ID,
before/after JSON snapshots, IP, and user agent.

**FR-SYS-004 — Recurring Payment Scheduler**
The scheduler runs daily at 00:05 UTC and processes all active recurring
payment sources (explicit schedules + Capital + Asset + Insurance).
*Acceptance:* Transactions generated for all due occurrences. Missed occurrences
detected and flagged. Job is persisted in SQLAlchemy job store — survives restarts.

**FR-SYS-005 — In-App Alerts**
The system generates and displays the following in-app alerts (no emails):

| Alert Type | Trigger | Dismissible |
|---|---|---|
| BUDGET_WARNING | Spending ≥ threshold % of limit | Yes |
| BUDGET_EXCEEDED | Spending > limit | Yes |
| RECURRING_MISSED | Occurrence expected, not processed, no skip | Yes |
| FX_RATE_STALE | Rate not updated > 48 hours | Yes |
| UPCOMING_PAYMENTS | Recurring due within 3 days | Yes |
| SYSTEM_ALERT | FX API down 3+ consecutive days | Yes |

*Acceptance:* Alert panel accessible from top bar. Unread alerts shown as a count badge.
Each alert links to the relevant entity or module.

**FR-SYS-006 — Daily Backup**
SQLite database backed up daily to Google Cloud Storage. Retained 90 days.
*Acceptance:* Backup file exists in GCS by 04:00 UTC daily. Cold-start container
restores from latest backup if database file is absent.

**FR-SYS-007 — Responsive UI**
The application is usable on desktop (≥ 1280px), tablet (≥ 768px), and
mobile (≥ 375px) browsers.
*Acceptance:* All core workflows (transaction entry, ledger view, dashboard)
function on mobile. No horizontal scrolling on mobile viewport.

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Metric | Target |
|---|---|
| Page initial load | < 3 seconds on 10 Mbps |
| CRUD API response | < 500ms p95 |
| Aggregation API response | < 2 seconds p95 |
| Transaction entry (end-to-end) | < 5 seconds |
| Chart render after filter change | < 1 second |
| Cold start (Cloud Run) | < 5 seconds |

### 4.2 Security

- Google OAuth 2.0 only — no password storage
- All traffic HTTPS; HSTS enforced
- CSRF protection on all mutations [FR-SYS-002]
- All queries household-scoped at service layer
- No raw SQL — SQLAlchemy ORM only
- Secrets via Google Secret Manager only
- Security headers: CSP, X-Frame-Options, Referrer-Policy [architecture.md §7.5]
- OWASP ZAP scan in CI on each release; zero critical findings required to deploy

### 4.3 Reliability

- 99% uptime target (Cloud Run SLA)
- Daily backup with 90-day retention [FR-SYS-006]
- Circuit breakers on all external API calls (FX rate, OAuth)
- APScheduler with persisted job store — jobs survive container restart

### 4.4 Accessibility

- WCAG 2.1 Level AA compliance
- Full keyboard navigation (Tab, Enter, Escape, arrow keys in dropdowns)
- ARIA labels on all interactive elements
- Minimum 4.5:1 contrast ratio on all text
- Minimum 44×44px touch targets on mobile
- `prefers-reduced-motion` respected — all animations suppressed when set

### 4.5 Browser Support

Latest two versions of: Chrome, Firefox, Safari, Edge.
Mobile: Chrome for Android, Safari for iOS.

### 4.6 Data Integrity

- All monetary values stored as `Decimal(15,4)` — no floating point
- `is_shared_expense` enforced at DB level to `outflow` only (CHECK constraint)
- Category depth enforced at DB level (CHECK constraint, max = 1)
- Audit trail is append-only — no mechanism for deletion

---

## 5. Epic Mapping

FRs are implemented across the following epics (detailed in `epics.md`):

| Epic | Title | Primary FRs |
|---|---|---|
| Epic 0 | Entity Foundation Refactor | All cross-cutting FRs; EDP compliance for Epics 1–2 |
| Epic 1 | Auth & Household *(complete)* | FR-HH-001–004, FR-P-001–002, FR-SYS-001–002 |
| Epic 2 | Categories *(complete)* | FR-C-001–007 |
| Epic 3 | Accounts | FR-A-001–018, FR-CU-001–008 |
| Epic 4 | Transactions & Events | FR-E-001–017, FR-V-010 |
| Epic 5 | Recurring Payments | FR-E-010–014, FR-A-017, FR-SYS-004 |
| Epic 6 | Budgets | FR-B-001–009, FR-V-007 |
| Epic 7 | Transfers & Debt | FR-E-015–017, FR-D-001–007 |
| Epic 8 | Formulas | FR-F-001–005 |
| Epic 9 | Visualizations & Dashboard | FR-V-001–009, FR-SYS-005 |
| Epic 10 | Import / Export | FR-IE-001–006 |
| Epic 11 | Persons & Settings | FR-P-003–008, FR-HH-002–004, FR-SYS-003, FR-SYS-006 |

---

## 6. Open Questions

| # | Question | Resolution | Status |
|---|---|---|---|
| OQ-001 | Should PersonDashboard "My Finances" mode persist across sessions? | **Resolved:** Yes. `Person.default_view` field added (`household` \| `personal`). Persists across sessions. FR-P-006 updated. EDP §5 updated. | Closed |
| OQ-002 | Should comparison mode support external benchmarks (e.g. average NZ household spending)? | **Resolved:** Future consideration only. Requires additional external API support not in scope for MVP. Comparison mode limited to household members and household categories for now. Architecture left open for this extension. | Closed — Future |
| OQ-003 | Base currency recalculation (FR-CU-005) — progress indicator or queued background job? | **Resolved:** Progress indicator sufficient. Background job with polling endpoint; UI shows progress bar while job runs; dismissible completion notification. | Closed |
| OQ-004 | CSV export date format: ISO 8601 or DD-MM-YYYY? | **Resolved:** ISO 8601 (`YYYY-MM-DD`) for export. Data portability standard; compatible with Excel, Google Sheets, accounting tools. UI displays DD-MM-YYYY; wire and file formats use ISO. | Closed |
| OQ-005 | Which alerts become email-capable in Phase 3? | **Resolved:** `FX_RATE_STALE`, `UPCOMING_PAYMENTS`, `SYSTEM_ALERT`, `RECURRING_MISSED`. `BUDGET_WARNING` and `BUDGET_EXCEEDED` remain in-app only (too frequent for email). | Closed — Phase 3 |

---

## Revision History

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-05-23 | Ben + BMAD | Initial PRD — flat FR numbering, module-based organisation |
| 2.0 | 2026-05-26 | Ben + Claude | Full rewrite — entity-family FR organisation, entity hierarchy preamble, Loans removed, Debt FRs rewritten as computed, FRs for EntityCurrencies / EntityFormulas / multi-owner accounts / comparison visualizations / budget history / capital history / DD-MM-YYYY display / hard delete / RFC 7807 error codes added. Epic mapping updated. |
