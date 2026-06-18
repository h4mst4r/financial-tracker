---
title: Financial Tracker — Product Requirements Document
version: 4.0
status: living
created: 2026-05-23
updated: 2026-06-14
authority: Feature requirements and acceptance criteria.
---

# Financial Tracker — Product Requirements Document

> **Design authority:** 
> This document specifies *what the system must do* — functional requirements,
> acceptance criteria, and non-functional constraints.

---

## 0. Entity Philosophy

All features in this PRD are expressed in terms of the entity hierarchy defined in
`architecture.md` §3 (data model & entity hierarchy). Requirements are grouped by entity family. Each entity
family's requirements apply to **all subtypes** unless a subtype is explicitly named.

The entity families in scope:

| Prefix | Entity Family | Subtypes / Scope |
|---|---|---|
| FR-HH | EntityHouseholds | Household settings, membership, timezone, region, date/time |
| FR-P | EntityPersons | User + HouseholdMember combined; PersonDashboard |
| FR-A | EntityAccounts | Bank, CreditCard, Capital, Asset, Insurance |
| FR-E | EntityEvents | Transaction, RecurringPayment, Transfer |
| FR-B | EntityBudgets | Monthly + yearly; per-person + household-wide |
| FR-C | EntityCategories | Household-specific hierarchy, max 2 levels |
| FR-CU | EntityCurrencies | All ISO 4217; FX rates; multi-display |
| FR-F | EntityFormulas | System defaults + user-configurable |
| FR-D | EntityDebt | Computed only |
| FR-V | EntityVisualization | VisualizationFilter; chart viewer; comparison modes |
| FR-DB | Dashboard | modules from all other entities can be pinned here |
| FR-IE | Import/Export | CSV import (two-step) + export |
| FR-SYS | System | Authentication, scheduler, alerts, error pages, logging, themes, audit, backup |

**Cross-cutting rules that apply to every FR below:**

1. Every entity supports: Create, Edit, Archive, Restore, Hard-Delete-if-Empty, Duplicate.
2. Every entity is scoped to `household_id` — no cross-household data access possible.
3. Every mutation produces an audit log entry (except hard-delete of empty entities).
4. Every monetary field uses the `MonetaryValue` block — never ad-hoc amount fields.
5. Dates are stored and transmitted in ISO 8601 (`YYYY-MM-DD`); displayed in `DD-MM-YYYY`.
6. Timezone/regions of dates are based on EntityHousehold timezone settings.

---

## 1. Product Overview

See `brief.md` for full vision, target users, assumptions, and success criteria.
This document does not repeat the brief. Summary only:

- Self-hosted household financial tracker for 2–4 users
- Replaces Google Sheets + Apps Script
- Runs on Google Cloud Run at zero cost
- Multi-currency (SGD; NZD, USD, PHP, all ISO 4217 supported)

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
| Export/import/backup | — | ✓ | ✓ |

---

## 3. Functional Requirements

### FR-HH — EntityHousehold

**FR-HH-001 — Household Creation**
On first Google OAuth login, the system first checks whether the verified email matches
a approved owners list/table. If a match is found, the person creates a brand new household and
the New Household modal will show, allowing the user to set the timezone, date and base currency.
If not on the approved owners list, the system then checks whether the email has a pending household invitation.
If a match is found, the Pending Invitation modal will show, allowing the person to choose to accept or decline
the invitation. If the invitation is accepted, the person joins the household as `member` and the invitation is marked as `accepted`.
If the user declines, the No Invitation Error page will show and the invitation is marked as `declined`.
*Acceptance:* New user with pending invitation → able to join invited household (no new household created).
New user with pending invitation → able to decline.
New user without invitation but on owner list → new household created; person has role `owner`; New Household modal will show,
default timezone is Asia/Singapore and base currency is SGD.

**FR-HH-002 — Household Configuration and Management**
Owner may update: household name, timezone, date/time and base currency, in the Profile tab of the Settings module. Other users may only view them.
Users may also view both the members list and the invitations list, which is in a separate Household Managment tab in the Settings module.
Owner and admin users can add, remove, archive, restore, promote and demote users in the members list, and invite, revoke invite and resend invite in the invitations list.
All admin and member users also have a Leave Household button in the Profile tab, which will show a Leave Household confirmation, requiring them to click again
*Acceptance:* Changes persist. Timezone and date/time change updates all future scheduler job times.
Base currency change triggers background recalculation of all `amount_base` values.
Can see members and invitations list and carry out the administrative functions.

**FR-HH-003 — Member Invitation**
Admin or Owner may invite a new member by entering their Google email address in the Invitation modal at the invitations list.
The invitation is in-app only — no email is sent. The invitee must log in with the
exact Google account matching the invited email; the system then links them to the household and shows the Pending Invitation modal and the person can accept or decline.
Admin or Owner may invite a member that already belongs to an existing household. The Household Conflict modal then shows **two actions only — Go to Settings / Decline — and NO Accept button** (you cannot accept in place; you must first leave/delete your current household, after which the pending invitation re-appears and is accepted there).
If an owner is invited, the modal informs them they must **delete** their existing household to join (owners can't simply leave).
For admin and member users, the modal informs them they must **leave** their existing household first (data archived, restored if they return).
In both variants the copy must never imply an "Accept" action that the modal does not offer; **Decline** rejects the invitation outright.
**Decline is always terminal (both the Pending Invitation and Household Conflict modals).**
Choosing **Decline** sets the invitation to `declined` immediately and permanently and is **always
available** — an invitee can never be forced to keep an offer open (this prevents an owner from
trolling another owner with an un-dismissable invite). Only **Go to Settings** leaves the
invitation `pending` (the user opted to resolve the conflict, not reject it).
*Acceptance:* Invitation record created with 7-day expiry. On matching login, the Pending Invitation modal will show, allowing the person to choose to accept or decline
the invitation. If accepted, the person joins as `member` and the invitation → `accepted`. **If declined (from either modal), the invitation → `declined` and the modal closes — it does NOT remain pending.**
The full authentication flow for new and existing owner and member users must be tested to ensure it works.

**FR-HH-004 — Invitation Management**
Admin or Owner may view pending invitations and revoke any of them, where upon they will disappear from the invitation list.
Pending invitations display as a shareable join URL (`/join/<invitation_id>`) that invitees open to accept.
If an invitation was accepted, the invitation status changes from `pending` to `accepted`, whereby it can then be deleted.
IF an invitation was declined, the invitation status changes from `pending` to `declined`, whereby it can then be deleted.
*Acceptance:* Pending, accepted and declined invitations change status appropriately; visiting a revoked
or expired join URL shows the Invalid/Expired Error page.

**FR-HH-005 — Household Permanent Deletion**
The household owner may permanently and irreversibly delete the entire household and all its
household-scoped data (accounts, events, budgets, categories, currencies, formulas, invitations).
The action requires typing the exact household name as confirmation.
**`Person` rows are NOT deleted** — each member is **detached** (`household_id → NULL`) so the
person/identity survives and can re-enter the seed flow on next login (architecture §2.6/§2.12).
Their *household-scoped data* (their accounts, events, etc.) is deleted with the household; only
the identity row persists. Member sessions are invalidated.
*Acceptance:* Household and all its child records removed from the database **except `persons`**,
which are detached to `household_id = NULL`; all active sessions for household members are
invalidated. On re-login each detached member is routed by their `detachment_reason` to the
matching page — Household Deleted / Removed from Household / Not Invited (FR-SYS-001, ARCH §2.6/§5.8).

**FR-HH-006 — Approved Owners Management**

An "approved owner" is a person (identified by Google email) authorized to create a household
if they have none. The system maintains an `approved_owners` table (email unique, case-insensitive;
optional label; active/inactive flag; `added_by` person — nullable, cross-household by design).

A person's `can_create_household` flag is a denormalized cache — synced at login — reflecting
whether they appear in the active approved-owners list. On first deploy, the system idempotently
seeds bootstrap approved owners from the `BOOTSTRAP_OWNER_EMAILS` environment variable
(insert-only, never overwrites manual changes).

*Acceptance:* Bootstrap seeding runs on first migration/start (idempotent); `can_create_household`
updates at login; only approved owners see the "Create Household" option on the No-Household page.

> **Future (reserved, not MVP):** owner-only CRUD endpoint to add/remove approved owners.

**FR-HH-007 — Person Leave / Remove**

A person can exit a household through three paths:

- **Path A — Owner Deletes Household:** The household owner permanently deletes the household
  (FR-HH-005). Irreversible. All household data deleted; persons detached (`household_id → NULL`)
  with `detachment_reason = household_deleted`. Sessions invalidated.

- **Path B — Self-Leave:** A non-owner member may voluntarily leave the household. Their
  household-scoped data is **archived** (not deleted) so it can be restored if they re-join.
  `detachment_reason = left`. Sessions invalidated.

- **Path C — Admin/Owner Removes Member:** The household admin or owner may remove a member
  (not themselves). Same as Path B — data archived, `detachment_reason = removed`, sessions
  invalidated.

Re-joining via a new invitation restores access (person re-linked to household; archived data
becomes active again).

*Acceptance:* `POST /api/household/leave` (self-leave, member-only); `POST /api/household/members/:id/remove`
(admin/owner only, can't remove self — use leave instead); `detachment_reason` enum on `persons`
table tracks exit path; sessions invalidated on all paths; re-joining via invitation restores access.

---

### FR-P — EntityPersons

**FR-P-001 — Google OAuth Login**
All authentication is via Google OAuth 2.0. No passwords are stored.
*Acceptance:* User clicks Login → redirected to Google → redirected back →
session cookie set → redirected to Dashboard.

**FR-P-002 — Join Household**
A person with a pending invitation may join the household by logging in with the
invited Google account. If the email matches, the Pending Invitation modal will show, 
allowing the person to choose to accept or decline the invitation. If the invitation 
is accepted, the person joins the household as `member` and the invitation is marked as `accepted`.
If the user declines, the No Invitation Error page will show.
*Acceptance:* Invitation status changes to `accepted`, it is removed from the invitations table;
person record created with `member` role; person can access all household data.

**FR-P-003 — Profile & Appearance Management**
Any person may update their own personal preferences (UX §5.1 Profile tab): `display_name`,
`colour` (avatar fallback), and the **Appearance / App** set — `theme` (named palette per
FR-SYS-015), `font`, **density** (comfortable/compact), **reduce_motion**, and
**notification_prefs** (per-alert-type opt-in: budget warnings/overruns, missed recurring,
upcoming payments, FX stale, backups — feeds FR-SYS-007).
*Acceptance:* Each change persists per person and applies only to that person's session;
`display_name` updates everywhere it appears (PersonRef, PersonCard, PersonDashboard header);
`theme`/`font`/`density`/`reduce_motion` re-render the UI live; `notification_prefs` gate which
in-app alerts that person receives. Stored on `persons` (`theme, font, density, reduce_motion,
notification_prefs(JSON), colour`).

**FR-P-004 — Display Currency Preference**
Any person may set their preferred display currency. This affects how the dashboard is rendered for that person.
*Acceptance:* Changing display currency from SGD to NZD immediately converts all
dashboard values to NZD using current FX rate, while keeping existing NZD values. Stored `amount_base` values are unchanged.

**FR-P-005 — Role Management**
Owner may change any member's role (member ↔ admin). Owner role cannot be transferred
via this interface (requires setting of the approved owners list manually).
*Acceptance:* Role change takes effect on next request from that person.

**FR-P-006 — PersonDashboard**
Any person may filter the entire application between the household aggregate and a single
member. The default view is the household aggregate. A persistent toggle switches between
"My Household" and "Individual" views, with a member dropdown in the topbar.
**Member-selection permission:** **Admin/Owner may select ANY household member** in the dropdown;
a **Member may only select themselves** (the dropdown shows only their own entry). This applies
identically everywhere Individual mode is offered (Dashboard, every Visualization, ledger
filters).
The chosen mode is stored as `Person.default_view` (`household` | `personal`) and persists across sessions.
*Acceptance:* On login, the app loads in the person's last-used view mode.
In "Individual" mode, all charts, lists, and summaries filter to the selected member; the
VisualizationFilter is updated with `person_ids = [selected_member.id]`. A Member who attempts to
target another member (e.g. via crafted request) receives 403.

**FR-P-007 — Archive Member**
Owner may archive a household member who has been removed or left. Archived members retain all
their historical events and accounts — data is never deleted.
*Acceptance:* Archived member cannot log in unless they are reinvited and accepted the invite; their events and accounts remain visible
in household history; PersonRef resolves to their name + "(archived)" label.

**FR-P-008 — Hard Delete Empty Person**
A person who has never created any event, account, or other record may be
hard-deleted (not archived) — no audit log entry produced.
*Acceptance:* System checks all FK references before permitting hard delete. If any
exist, hard delete is blocked and archiving is offered instead.

**FR-P-009 — Date Display Format Preference**
Any person may choose the date format used to **display and enter** dates throughout the UI,
independently of other members — e.g. `DD-MM-YYYY` (SG / NZ / AU / UK), `MM-DD-YYYY` (US), or
`YYYY-MM-DD` (ISO-style). Stored on `persons.display_format` (default `DD-MM-YYYY`). Only rendering and
input parsing change; **storage and transport remain ISO 8601** (`YYYY-MM-DD`) and CSV export stays ISO
(FR-V-010). The selector lives in UX §5.1 Profile → App, beside density / reduce-motion.
*Acceptance:* Changing the preference re-renders every displayed date in the new format for that person
only and makes date inputs accept the chosen ordering; stored ISO date/`amount` values are unchanged; a
new person defaults to `DD-MM-YYYY`.

---

### FR-A — EntityAccounts

**FR-A-001 — Create Account**
Any Admin or Owner may create an account of any type. Account type is selected from
a picker; the form adapts to show the relevant fields for that subtype.
*Acceptance:* Account created with at least one owner (the creator, by default);
MonetaryValue block populated; status = `active`. Ledger-backed accounts (Bank, CreditCard)
additionally require `opening_balance` + `opening_balance_date` (FR-A-008).

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
Any account may be duplicated (clones all fields and current values, new UUID).
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
*Acceptance:* History list is paginated, sortable by date, filterable by field.

**FR-A-008 — Account Value Snapshots & History (all account types)**
Every account records its value over time through `AccountSnapshot` records:
`{snapshot_date, value, currency, source: manual|formula|reconciliation|appraisal|import|computed, note}`.
- **Ledger-backed accounts (Bank, CreditCard):** value is the running balance computed from
  linked events, anchored by a required `opening_balance` + `opening_balance_date`. Manual
  snapshots act as corrections/anchors that override the computed value from their date forward.
  The scheduler writes a `source = computed` snapshot per account each month (FR-SYS-006) so the
  history is materialised, not replayed.
- **Asset-like accounts (Asset, Insurance, Capital):** snapshots ARE the value series; current
  value = latest snapshot by date.

`source = import` is reserved for future bank-feed ingestion.
*Acceptance:* Current value resolves per the rules above. A month/year value-history chart is
available on every AccountCard (mini-chart) and detail view via FR-V. Adding a manual snapshot
updates current value and the chart immediately.

**FR-A-009 — BankAccount: Interest Rate**
A BankAccount may have an optional `interest_rate` and `interest_frequency`.
*Acceptance:* Fields are optional. When set, they are visible on the AccountCard
and used by relevant EntityFormulas.

**FR-A-010 — CreditCard: Limit and Billing**
A CreditCard must capture `credit_limit`, `billing_day`, `due_day`, and optionally
`rewards_type` and `annual_fee`.
*Acceptance:* `billing_day` and `due_day` are used to compute the next billing cycle
date shown on the CreditCard card view.

**FR-A-011 — CreditCard: Computed Debt Display**
The computed debt balance (from EntityDebt) is shown directly on the CreditCard
AccountCard and in the CreditCard detail view. It updates in real time as events change.
*Acceptance:* Debt balance = sum of outflows - sum of repayment transfers. Matches
FR-D-002.

**FR-A-012 — Capital: Investment Type and Values**
A CapitalAccount captures `investment_type` (stock, bond, fund, cpf, fixed_deposit) and
`cost_basis`. **Current value is not a stored column** — it is the latest `AccountSnapshot`
by date (FR-A-008; architecture §3.5).
*Acceptance:* `investment_type`, `cost_basis`, and the derived current value visible on
CapitalCard. Return on investment (`current_value − cost_basis`, where `current_value` = latest
snapshot) shown as a derived display field.

**FR-A-013 — Asset: Purchase and Depreciation**
An AssetAccount captures `asset_type`, `purchase_date`, `purchase_value`, and
optionally a `depreciation_formula_id`.
*Acceptance:* When formula is assigned, current estimated value is shown on hover
using FR-F-004 formula hover reveal.

**FR-A-014 — Add Manual Value Snapshot (all account types)**
Any Admin or Owner may add a manual `AccountSnapshot` to any account at any time (FR-A-008).
For asset-like accounts this is the primary way value is recorded; for ledger-backed accounts
it acts as a balance correction/anchor.
*Acceptance:* Snapshot persists; current value recomputed per FR-A-008; appears in the
value-history chart immediately.

**FR-A-015 — Account Value History Chart (all account types)**
Every account's detail view (and a mini-chart on its card) shows its value over time,
grouped by month or year, sourced from `AccountSnapshot` records (FR-A-008) via FR-V.
*Acceptance:* Chart plots all snapshots sorted by `snapshot_date`. Supports line/bar,
raw and converted currency modes, and expands into the full visualization viewer (FR-V).

**FR-A-016 — Insurance: Policy Details**
An InsuranceAccount captures `policy_no`, `insurer`, `policy_type` (life/term/health),
`policy_status`, `purchase_date`, `premium_frequency`, the per-coverage amounts
(`coverage_death`, `coverage_tpd`, `coverage_ci`, `coverage_early_ci`,
`coverage_personal_accident`), `coverage_hospital` (text), and `surrender_value` /
`surrender_inquiry_date`. These are individual typed columns, not a JSON blob (architecture §3.5).
*Acceptance:* All populated fields visible on InsuranceCard; the per-coverage amounts render as
labelled rows/tags. Empty coverages are hidden.

**FR-A-017 — Account-Linked Recurring Payment**
For Asset, Capital, and Insurance accounts, Admin or Owner may enable a recurring payment.
Doing so creates a real `RecurringPayment` entity (FR-E-011) linked back to the originating
account via the polymorphic pair **`source_entity_type`** (`capital`/`asset`/`insurance`) +
**`source_entity_id`** (the account id) — *not* `source_account_id`, which is the "Paid with"
account on plain events (architecture §3.6). It carries its own `frequency_text`,
payee, category, and amount. It appears
natively in the Recurring Payments module like any other recurring payment.
*Acceptance:* Enabling creates a linked RecurringPayment; the scheduler processes it through
the single recurring path (FR-SYS-006) — no separate account-source scanning. Disabling the
account's recurring payment archives the linked RecurringPayment.

---

### FR-E — EntityEvents

**FR-E-001 — Create Transaction**
Any user may create a transaction (inflow or outflow). Required: name, event_date,
transaction_type, MonetaryValue, payee, payment_method, category. Optional: notes,
is_gst_claimable, is_gift, source_account.
The form pre-fills *context* fields — `paid_with` account, `currency`, `payment_method`,
`category` — from the person's last successful entry (stored as `Person.last_tx_context`);
`name`, `amount`, and `payee` are never pre-filled. Repeating a specific past transaction is
done via Duplicate (FR-E-003) — there is no separate template concept.
Every transaction stores provenance: `source` (`manual` | `csv_import` | `bank_feed`, default
`manual`) and a nullable `external_ref` reserved for future bank-feed ingestion.
*Acceptance:* Transaction created; `transaction_status` defaults to `completed`;
event appears in ledger; budget actuals recomputed. Context defaults reflect the last entry;
hand-entered transactions persist `source = manual`.

**FR-E-002 — Edit Transaction/s**
Any Admin or Owner may edit any transaction. Member may edit their own.
*Acceptance:* Changes persist; audit log entry created; budget actuals recomputed.

**FR-E-003 — Duplicate Transaction/s**
Any Admin or Owner may duplicate a transaction. This copies all values and opens the edit modal.
*Acceptance:* Duplicate; audit log entry created; budget actuals recomputed

**FR-E-004 — Archive / Restore Transaction/s**
*Acceptance:* Archived transaction excluded from budget actuals, reports, and
default ledger view. Restoring reverses all exclusions.

**FR-E-005 — Transaction Status**
User may set `transaction_status` on any transaction:
`pending` / `completed` / `cancelled` / `reconciled`.
*Acceptance:* `pending` transactions appear in ledger with a distinct visual
indicator. `cancelled` transactions are excluded from all budget actuals and
aggregations. `reconciled` transactions show a checkmark.

**FR-E-006 — Reconciliation**
User may mark a transaction as `reconciled` — confirming it matches their bank
or card statement.
*Acceptance:* `reconciled = true`, `reconciled_at` set. Reconciliation status
visible in ledger view. Filter for unreconciled transactions available.

**FR-E-007 — Shared Household Expense Flag**
On any outflow transaction, user may set `is_shared_expense = true` to indicate
that this personal payment covers a shared household cost.
*Acceptance:* Flag only available when `transaction_type = outflow`. System
immediately updates computed debt balance for the payee person.

**FR-E-008 — Duplicate Detection**
On save (create or edit), the system checks for duplicates.
*Acceptance:* If a candidate duplicate is found, the user is shown a warning with
the duplicate's name, date, and amount. User may: proceed (ignore warning), link
as duplicate (sets `duplicate_of`), or cancel entry.

**FR-E-009 — MonetaryValue Entry**
When entering a transaction in a foreign currency, the user enters `currency`, `amount`,
and selects a "Paid with" account (or Cash). The system auto-fills `amount_base_calculated`
using the following priority chain: (1) account's assigned FX formula if set, (2) spot rate
from EntityCurrencies. A source (`formula` / `spot rate` / `manual`) indicated by border colour highlights the base-currency field.
The user may override `amount_base` with the exact bank statement figure; the indicator switches to `manual` and `fx_delta` is shown immediately.
*Acceptance:* `amount_base_calculated` is read-only after auto-fill. `amount_base` is
editable. Source indicator updates on account selection and on manual override.
`fx_delta = amount_base_calculated - amount_base` shown inline.
The applied `fx_rate_used` and its `rate_date` are persisted on the event and are immutable —
historical reports, the annual FX cost report, and tax exports use this stored rate, never a
recomputed current rate.
When `currency == base_currency`, forex fields are hidden.
When Cash is selected, spot rate is used and `source_account_id` is null.

**FR-E-010 — GST and Gift Flags**
Any transaction may be flagged as `is_gst_claimable` or `is_gift`.
*Acceptance:* Flags visible as icons on Transaction item. Filterable in ledger view.

**FR-E-011 — Create Recurring Payment**
Admin or Owner may create a recurring payment with a free-text `frequency_text`
(e.g. "3rd of every month", "every Sunday", "every 4 weeks", "April 10").
*Acceptance:* On entry, the UI displays the parsed next occurrence date alongside
the raw text. User must confirm the parsed date before saving. `frequency_rule`
stored as structured JSON. `frequency_text` stored as display reference.

**FR-E-012 — Recurring Date Patterns**
The system must support all nine date patterns from v1:
every [weekday], weekly, monthly, [N]th of every month, every [N] days,
every [N] weeks, [Nth] [weekday] of [month], [month] [day], yearly.
*Acceptance:* Each pattern produces the correct `next_occurrence` for at least
three test cases each.

**FR-E-013 — Occurrence History**
The Recurring Payments module shows a history view of all expected occurrences for
each recurring payment: their expected date, status (upcoming / processed / skipped /
missed / failed — there is no separate `manual` status; a manually-triggered run lands on
`processed`, FR-E-015 / ARCH §3.6), and the linked transaction if processed.
*Acceptance:* Occurrences computed from `frequency_rule` between `start_date` and today.
Each occurrence has a distinct status badge. Missed occurrences show in red border highlight.

**FR-E-014 — Skip Occurrence**
User may manually skip an upcoming occurrence without deleting the recurring payment.
*Acceptance:* OccurrenceRecord status = `skipped`. No transaction generated for
that date. Subsequent occurrences continue as scheduled.

**FR-E-015 — Trigger Occurrence**
User may manually trigger an occurrence without deleting the recurring payment on the current date
*Acceptance:* The triggered occurrence generates its linked transaction and the `OccurrenceRecord`
status becomes `processed` (same terminal state as a scheduler-run occurrence — there is no
separate `manual` status; the occurrence enum is `upcoming|processed|skipped|missed|failed`,
architecture §3.6).

**FR-E-016 — Missed Occurrence Alert**
If an expected occurrence date passes without a processed transaction and no skip
record, the system generates a RECURRING_MISSED alert on the next daily alert job run.
*Acceptance:* Alert appears in the in-app alert panel. Alert links to the affected
recurring payment. Can be dismissed.

**FR-E-017 — Create Transfer**
Admin or Owner may create a transfer between two accounts.
Required: `source_account_id`, `destination_account_id`, MonetaryValue.
If the accounts use different currencies, both the source amount and the destination
amount are entered separately; the system records `fx_rate_used`, `rate_date`, and `fx_delta`
for the transfer exactly as for transactions (FR-E-009) — this makes future remittance-cost
tracking a filter, not a schema change.
*Acceptance:* Transfer event created. Source account balance decreases; destination
account balance increases. For cross-currency transfers `fx_delta` is computed and stored.
Debt-clearing logic runs automatically.

**FR-E-018 — Debt Repayment Auto-Detection**
When a transfer's `destination_account_id` belongs to a CreditCard account, the
system automatically sets `is_debt_repayment = true`.
*Acceptance:* Transfer saved with flag set. Computed credit card debt balance
immediately decreases by `debt_cleared_amount`. User sees updated debt on the
CreditCard item.

**FR-E-019 — Override Debt Repayment Flag**
User may override `is_debt_repayment = false` on any transfer where it was
auto-detected as true (e.g. topping up a card for spending, not repayment).
*Acceptance:* Override persists. Debt balance is NOT reduced for this transfer.

**FR-E-020 — Bulk Operations (generic multi-select)**
Multi-select is a **generic capability** (a shared `useMultiSelect` hook + BulkActionBar, UX §12.4),
available on the **Transactions ledger** and the **CategoryTree**, and extensible to any future
entity list. With ≥1 items selected the user may bulk-edit shared fields, bulk archive/restore,
bulk duplicate, and bulk delete-if-empty. Per surface the editable field set differs:
- **Events:** category, payment_method, transaction_status, payee, is_shared_expense.
- **Categories:** type (Expense/Income), archive/restore, **merge** (fold selected into one),
  promote-out; archiving a parent archives its branch (FR-C-005).
Permission rules apply per item (Member may bulk-act only on own events; Admin/Owner on any).
*Acceptance:* Bulk-edit applies only the fields the user changed, leaving others untouched. A
single confirmation precedes destructive bulk actions. Each affected item produces its own
audit log entry. For events, budget actuals recompute once after the batch. The multi-select
mechanism is shared, not re-implemented per module.

**FR-E-021 — Favourite & Manual Sort (per-person)**
On any EntityCard list (Accounts, Categories, Currencies, …) a person may **favourite** an item
(the card's star, UX §2) and **manually drag-reorder** items. Both are stored **per person**, so
one member's favourites/ordering never affect another's. Favourites sort to the front; manual
order overrides default sort when "Custom" sort is active.
*Acceptance:* Favourite + sort_order persist per `(person, entity_type, entity_id)` in
`entity_preferences`; the star toggles favourite; drag writes sort_order; another member viewing
the same household sees their own arrangement, not the actor's.

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
Budget actual spending is computed live from matching events.
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
*Acceptance:* Chart sourced from `/api/visualizations/budget-vs-actual`. Shows
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

**FR-C-003 — Unparent Subcategory from Category**
Admin or Owner may unparent (promote) a subcategory to top-level, or re-parent it under a
different top-level category (drag in the CategoryTree; ARCH §3.7 Promote / Reassign).
*Acceptance:* Promote sets `parent_id = null` and `depth = 0`; the (now top-level) category keeps
all its events and appears in every category dropdown. Re-parent sets a new `parent_id` (depth
stays 1). Neither loses event references.

**FR-C-004 — Edit Category**
Admin or Owner may edit name, color, icon, and category_type.
*Acceptance:* Changes reflect immediately in all dropdowns and charts using that category.

**FR-C-005 — Archive Category**
Archiving a category hides it from dropdowns but preserves it on all historical events.
*Acceptance:* Archived category excluded from new event category picker.
Existing events retain their `category_id`; the category name still resolves for display.
If category has subcategories, they are archived together.

**FR-C-006 — Hard Delete Empty Category**
A category with zero linked events, budgets, or recurring payments may be hard-deleted.
*Acceptance:* Dependency scan runs. If any reference exists, hard delete is blocked.

**FR-C-007 — Default Category Creation**
A one-click button in the Categories module creates the 13 default categories
(10 expense + 2 income + 1 both) tailored to household use — the authoritative
seed list defined in the Entity Design Philosophy (§9). This is the same set
auto-seeded at household creation; the button is the recovery path, surfaced only
when there are zero active categories. It is idempotent — running it twice does
not create duplicates.
*Acceptance:* 13 categories created with predefined names, colors, and icons.
Existing categories with matching names (case-insensitive) are skipped.

**FR-C-008 — Category Spending Rollup**
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
48 hours old, shown with a warning indicator).

**FR-CU-002 — Add Currency**
Admin or Owner may add any ISO 4217 currency to the household.
*Acceptance:* Currency added; FX rate fetched immediately on creation;
currency available in all monetary value entry fields.

**FR-CU-003 — Configure Display Currencies**
Admin or Owner may toggle which currencies appear in the household currency
switcher.
*Acceptance:* `is_display_active` currencies appear in the global currency
switcher in the top bar. Non-active currencies are still usable for transaction
entry but not shown in the switcher.

**FR-CU-004 — Per-Person Display Currency**
Any user may set their personal `display_currency` preference from among the
display-active currencies.
*Acceptance:* All of that person's dashboard render in their chosen display currency using the current FX rate. Stored
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
record created. Rates are fetched via the configured **provider fallback chain** (FR-CU-010).
Circuit breaker: when **all** enabled providers fail, last known rate is preserved;
SYSTEM_ALERT generated after 3 consecutive (all-provider) failures. (Architecture §5.7.)

**FR-CU-010 — FX Provider Configuration**
The household configures an **ordered list** of FX rate providers (UX §5.2 Integrations, owner-
editable). Each provider has a type, base URL, an **API key stored only as a Secret Manager
reference** (never persisted in plaintext or returned by the API), an enabled flag, and a
priority. The daily fetch (FR-CU-006) and historical lookups walk enabled providers by priority
and use the first that succeeds. **Resolution is per-currency** — providers differ in currency
coverage, so each currency walks the chain independently and records its winning provider in
`Currency.rate_source`; the breaker trips for a currency only when every provider fails for it.
*Acceptance:* Providers persist in `fx_providers` (household-scoped, ordered). The create/edit
endpoint writes the API key to Secret Manager and stores only the reference; GET responses mask
the key. Reordering changes which provider is primary. A **Bank-connections** surface is present
but disabled (post-MVP placeholder).

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

**FR-CU-009 — FX Rate History & Chart**
Any user may view the historical FX rate trend for any non-base currency, sourced from
`FxRateHistory` (FR-CU-006), as a line chart grouped by day or month, with the base currency
as reference.
*Acceptance:* Chart shows all `FxRateHistory` points for the currency in the selected range.
Available on the currency's card (mini-chart) and in the Currencies module, expanding into the
visualization viewer (FR-V). Sourced from `/api/visualizations/fx-rate-history/{currency_id}`.

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
of the target entity type. Expressions are run by a **sandboxed arithmetic evaluator** — an AST
allow-list (arithmetic operators + a fixed function whitelist; bound variables only; **never
`eval()`**, no attribute/builtin/dunder access; ARCH §3.8). Server evaluation is authoritative.

**FR-F-003 — Assign Formula to Account**
Admin or Owner may assign a formula to an account that supports it.
Two assignment types:
- **Depreciation formula** (Asset accounts): `depreciation_formula_id` set on AssetAccount;
  evaluated using `purchase_value`, `purchase_date`, and rate variable.
- **FX fee formula** (Bank and CreditCard accounts): `fx_formula_id` set on BankAccount or
  CreditCard; evaluated during transaction creation to produce `amount_base_calculated`.
  Variables: `amount`, `rate`, `fee_pct`, `fee_fixed`.
- **Compound interest formula** (Capital and Asset accounts): `interest_formula_id` set on
  the account; evaluated using principal / current value, rate, and period variables.
*Acceptance:* Formula assignment visible and editable in the account's edit modal.
FX formula dropdown shows only formulas with `applies_to = "bank" or "credit_card"`.
When assigned, all subsequent foreign transactions on that account auto-fill using the formula.

**FR-F-004 — Hover-Reveal Formula Results**
Formula computation results are shown only on hover — not displayed by default
to avoid cluttering views.
*Acceptance:* Hovering over an AssetCard or CapitalCard reveals a tooltip
containing: formula name, current variable inputs, computed result, and
the data source date.

**FR-F-005 — FX Formula Auto-Fill in Transaction Entry**
When a user selects a "Paid with" account that has an FX formula assigned, the system
immediately evaluates the formula against the entered amount and current FX rate and
populates `amount_base_calculated`. The user sees the indicator `formula` next to the
base-currency field, identifying how the figure was derived. The user may still override
with the exact bank statement figure (indicator becomes `manual`).
*Acceptance:* Changing the "Paid with" account during entry recalculates
`amount_base_calculated` immediately if the new account has a different formula (or none).
Selecting Cash always uses spot rate. Formula evaluation uses the formula's stored variable
defaults unless the account has overridden them (e.g. `fee_pct = 1.5`).

**FR-F-006 — Generate Value Snapshot from Formula**
From an AssetAccount's detail view, Admin or Owner may run the assigned
depreciation formula to generate a new `AccountSnapshot` (FR-A-008) using today's date.
*Acceptance:* Snapshot created with `source = "formula"`, `formula_id` set,
value = formula output. Appears immediately in the value-history chart.

**FR-F-007 — Formula Editor & Validation**
Custom formulas are created/edited in a dedicated **formula editor** (UX §11 — the EntityModal
side-drawer variant): an **expression** field with insertable **variable chips**, a **variables
table** (name · default · description), and a **Test row** (sample inputs → live computed result).
Validation has **two severities**:
- **Errors block Save** — syntax error; **unknown variable** (the offending token is highlighted
  inline with a fuzzy *"did you mean …?"* suggestion); invalid variable name; duplicate variable name.
- **Warnings don't block** — an unused variable; a missing default; a Test-row evaluation failure
  on the sample inputs (e.g. divide-by-zero / NaN — the formula may still be valid for real data).
A live *"N error · N warning"* count shows in the footer; **Save is disabled while any error remains**.
*Acceptance:* Known variables render as chips; the Test row evaluates live through the sandboxed
evaluator (FR-F-002 / ARCH §3.8). An unknown-variable token blocks Save and shows a fuzzy
suggestion; warnings surface but still allow Save. Errors (red) and warnings (amber) are visually
distinct (UX §0.9). System formulas are read-only — the editor opens in view mode for them (FR-F-001).

---

### FR-D — EntityDebt

**FR-D-001 — Computered Debt**
There is no "create debt" screen. Debt is derived at query time from:
1. CreditCard outflow transactions minus repayment transfers
2. Outflow transactions with `is_shared_expense = true` per person, minus
   repayment transfers to that person
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
Served by the spending/income endpoints with `comparison_mode = persons` + `comparison_ids` on the
VisualizationFilter (FR-V-016 / ARCH §4.12) — comparison is a filter param, not a separate route.

**FR-V-006 — Category Comparison Mode**
User may select 2–8 categories and compare their spending trends over time.
*Acceptance:* Multi-line or grouped bar chart, one series per category.
Grouped by month, quarter, or year. Served via `comparison_mode = categories` + `comparison_ids`
on the VisualizationFilter (FR-V-016 / ARCH §4.12) — comparison is a filter param, not a separate route.

**FR-V-007 — Budget History Chart**
A trend chart showing budget limit vs actual spending across all historical
periods for a selected category and owner scope.
*Acceptance:* Available in the Budgets module and Dashboard. Shows monthly
or yearly periods depending on `period_type`. Sourced from
`/api/visualizations/budget-vs-actual`.

**FR-V-008 — Capital / Portfolio History Chart**
A chart showing how a capital account's value, inflow, outflow, and earned
interest have changed over time.
*Acceptance:* Stacked area or multi-line chart. Supports raw and converted modes.
Sourced from `/api/visualizations/portfolio-value-over-time` (per-account capital history).

**FR-V-009 — PersonDashboard**
In "Individual" mode, the Dashboard shows a personalised view:
net worth (own accounts only), personal spending by category, personal income
sources, personal budget status, and personal debt contribution.
*Acceptance:* All figures filtered to `person_ids = [selected_member.id]` (Member may only
select self; Admin/Owner may select any member — per FR-P-006).
Toggle between Household and My Finances is persistent across sessions, stored in
`Person.default_view` (`household` | `personal`) per FR-P-006.

**FR-V-010 — Date Display Format**
Dates are displayed and entered in **each viewing person's chosen format**
(`Person.display_format`, default `DD-MM-YYYY`; see FR-P-009) — consistently everywhere in the UI for
that person.
All dates are **stored and transmitted as ISO 8601 `YYYY-MM-DD`** regardless of display preference, and
CSV export uses ISO 8601.
*Acceptance:* With the default `DD-MM-YYYY`, a date entered "27-05-2026" is stored as "2026-05-27" and a
date stored "2026-01-15" displays "15-01-2026". A person who selects `MM-DD-YYYY` sees the same stored
date as "01-15-2026" and enters dates month-first; the stored ISO value is identical for both.

**FR-V-011 — Universal Visualization Viewer**
A single reusable viewer renders any chartable data set. It is opened either inline
(expanded from a card mini-chart) or full-screen, and is always driven by a
`VisualizationFilter` plus an aggregation spec (`metric: count|sum|avg`, `group_by:
day|month|quarter|year`, `chart_type`). Every place that shows history (account cards,
budget cards, currency cards, the ledger, the Dashboard) opens this same viewer — there
is no bespoke per-module chart component.
*Acceptance:* Opening the viewer from any card seeds it with that entity's filter.
Changing metric, grouping, or chart type re-renders without leaving the viewer.
The viewer is implemented once and reused everywhere (verified on `/design-system`).

**FR-V-012 — Entity History Mini-Chart**
Every entity with a value/usage history (accounts via FR-A-008, budgets via FR-B-008,
currencies via FR-CU-009) shows a compact mini-chart on its card summarising its trend,
which expands into the universal viewer (FR-V-011) on click.
*Acceptance:* Mini-chart reflects the same data as the expanded viewer. Clicking it opens
the viewer pre-seeded with that entity's filter and a sensible default grouping (month).

**FR-V-013 — Event-Group Aggregation**
The viewer charts an arbitrary filtered *set* of events aggregated over time — e.g. "every
transaction named 'Netflix' in 2026, counted by month" or "Groceries spend summed by quarter".
Supported metrics: `count`, `sum(amount_base)`, `avg(amount_base)`.
*Acceptance:* Applying a ledger filter and opening the viewer produces a time series of the
selected metric over the selected grouping. Switching metric re-aggregates the same filtered set.

**FR-V-014 — Chart Type Selection**
The viewer supports line, bar, pie, area, and stacked chart types. Not every type fits every
data shape; the viewer offers only the types valid for the current data (e.g. pie only for a
single-period categorical breakdown).
*Acceptance:* Selecting a chart type re-renders the current data set in that type. Invalid
types for the current data are disabled, not hidden.

**FR-V-015 — Series Toggle & Auto Colour-Coding**
When a chart has multiple series (currencies, categories, persons, accounts), each series is
automatically assigned a stable colour and listed in a legend. The user may toggle individual
series on and off; the chart rescales to the visible series.
*Acceptance:* Colours are deterministic per series identity (same category = same colour across
charts). Toggling a series off removes it and rescales; toggling on restores it.

**FR-V-016 — Visualization Endpoints**

The backend exposes **10 read-only visualization endpoints** (no mutations). All accept
`VisualizationFilter` query params and return **both** raw-currency breakdowns and converted
totals so the client switches modes without a refetch:

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

**Comparison modes (FR-V-005/006) are NOT separate endpoints** — they are the
`comparison_mode` / `comparison_ids` / `comparison_group_by` fields on the `VisualizationFilter`
(ARCH §4.12), passed to the relevant endpoint above.

**Per-entity visualization contracts** (what each family must support; the UX §9 Viewer renders
them):

| Entity Family | Supported Visualizations | Drill-down Target |
|---|---|---|
| Events — Transaction | spending by category (donut), income vs expenses (grouped bar), volume over time (line), forex loss over time (line) | filtered tx list → tx detail |
| Events — Recurring | upcoming calendar, occurrence history (timeline), missed vs processed (status bar) | recurring detail → linked tx |
| Events — Transfer | transfer flow (sankey / grouped bar by account pair) | transfer detail |
| Accounts — Bank | balance over time (area), inflow vs outflow (stacked bar) | account tx history |
| Accounts — Capital | portfolio value (line), allocation (donut), return vs cost basis (bar), capital history (stacked area) | investment tx history |

*Acceptance:* All 10 endpoints are read-only (no POST/PATCH/DELETE). Accept `VisualizationFilter`
query params (including the comparison fields). Return both raw-currency and converted totals.
Support drill-down to entity detail.

---

### FR-DB — Dashboard

**FR-DB-001 — Net Worth Computation**
The Dashboard's headline net-worth figure is computed, never stored:
`Σ(positive account values) − Σ(liabilities)`, all converted to the viewer's display
currency at the current FX rate.
- **Positive:** Bank, Capital, and Asset current values (latest value per FR-A-008).
- **Negative:** CreditCard computed debt (FR-D-002) and any other liability balances.
- **Insurance:** included only if the policy carries a surrender/cash value; pure-premium
  policies contribute 0.
- Archived accounts are excluded.
*Acceptance:* Net worth = Σ positive values − Σ debts in the display currency. Changing
display currency reconverts without altering stored values. Matches the latest point of
`/api/visualizations/net-worth-over-time`.

**FR-DB-002 — Net Worth Over Time**
The Dashboard shows net worth grouped by month/year, computed from the materialised monthly
`AccountSnapshot` series (FR-A-008). For MVP, each period's value is converted at the current
FX rate. (Per-period historical-rate replay against `FxRateHistory` is a post-MVP enhancement.)
*Acceptance:* Timeline plots one point per month from monthly snapshots, in display currency.
Uses the FR-V chart controls. Archived accounts excluded.

**FR-DB-003 — Dashboard Pinning, Sizing & Add-Widget**
A user composes their own Dashboard (UX §17) via **direct manipulation** in a `Customize` edit
mode — widgets are **dragged to reorder** and **resized in place** to discrete spans (S = 1×1
stat, M = 2×1 row, L = 2×2 chart — each type declares a default + min/max), and removed inline;
⋮ → expand opens the full Viewer (FR-V-011). New widgets come from an **Add-Widget drawer**: a
**fixed, curated catalog of widget types** (grouped by module, live mini-previews) whose instances
**bind to data via an optional `scope`** chosen at add-time. Multiple instances of a type are
allowed (e.g. two budget widgets scoped to different budgets).
*Acceptance:* The full layout — `{widget_type, span, order, scope?}[]` — persists **per person**
(`persons.dashboard_layout`, JSON) and renders with live data; on mobile the grid reflows to one
column and spans clamp to full width.

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
*Acceptance:* Matched rows are highlighted green and the matched category.
Unmatched rows are highlighted yellow and a required category picker.

**FR-IE-004 — Duplicate Detection During Import**
During import confirmation, each row is checked against existing transactions
using the duplicate detection rules. If there is a duplicate, a separate Conflicting Transactions
modal will appear, indicating the number of conflicts, the incoming conflict and the existing conflicts,
with the options to Keep Newer, Keep Existing, or Keep Both with `duplicate_of` set.
*Acceptance:* Detected duplicates are shown in the preview with a warning.
User may choose to Keep Newer, Keep Existing, or Keep Both with `duplicate_of` set.

**FR-IE-005 — v1 Column Compatibility**
The CSV importer must correctly parse exports from the v1 Google Sheets
Financial Tracker, mapping v1 column names to v4 entity fields.
*Acceptance:* A v1 transaction CSV import produces correct records for all
columns: Name, Transaction Date, Currency Type, Amount, Amount (SGD), Payee,
Payment Method, Transaction Type, Category, Status. The importer additionally
accepts the v4 columns Description (→ `notes`), GST Claim (→ `is_gst_claimable`),
Personal (Yes ⇒ `is_shared_expense = false`), and Gift (→ `is_gift`).
Categories that don't match an existing one are flagged in the preview and must
be mapped or explicitly created — never silently auto-created (UX §5.3).

**FR-IE-006 — CSV Export**
Any user may export transactions to CSV with all active `VisualizationFilter`
parameters applied (date range, person, category, account, etc).
*Acceptance:* Export includes all fields defined in architecture.md.
Dates exported in `YYYY-MM-DD` format (ISO 8601 for data interchange).
File name: `financial-tracker-export-{YYYY-MM-DD}.csv`.

---

### FR-SYS — System Requirements
**FR-SYS-001 — Public and Error Pages**

The application renders specific error pages mapped to backend signals (13 states):

| Backend Signal | Frontend Page |
|---|---|
| `GET /health` → 200 | (liveness only) |
| 401 (no/expired/invalid session) | Login |
| OAuth `?error=not_invited` | Not Invited |
| OAuth `?error=removed` (`detachment_reason=removed`) | Removed from Household |
| OAuth `?error=household_deleted` (`detachment_reason=household_deleted`) | Household Deleted |
| OAuth `?error=oauth_error` | Login (with error notice) |
| 403 (role too low / CSRF invalid) | Forbidden / Access Denied |
| 404 (incl. cross-household) | Not Found |
| 429 | Rate-limited notice |
| fetch fails (connection refused) | Refused Connection / Backend Down |
| session lost mid-use (401 after being in) | Lost Connection → re-login |
| in-flight request pending | Loading |
| uncaught 500 (RFC 7807, no trace) | Generic Error |
| 503 (`MAINTENANCE_MODE` on) | Maintenance |

*Acceptance:* Each page appears at the right time; no default generic error page is shown.

**FR-SYS-002 — Localhost Dev Account**
Local dev account bypassing Google OAuth only when environment is set as "dev" and local dev account is set as "true".
*Acceptance:* Local dev account button on the login page when flags are set, that when pressed, bypasses Google OAuth. This
is to allow for faster dev work and time. If flags are set as "false", dev account and household is deleted.

**FR-SYS-003 — Google OAuth 2.0 Authentication**
Login is via Google OAuth. No passwords stored. The flow is the **Authorization Code flow
with a confidential client** (server-side `client_secret`); the OAuth round-trip is
CSRF-protected by an HMAC-signed `state` cookie. (PKCE is not used — it is for public
clients without a secret; this backend is a confidential client. See ARCH §1.2.)
Session is closed when idle for 30 minutes.
*Acceptance:* Login → Google → callback → session cookie. Session idle timeout:
30 minutes (sliding window). Session survives browser refresh (cookie-based).

**FR-SYS-004 — CSRF Protection**
All non-GET API requests require a valid `X-CSRF-Token` header matching the session's
token. The token is a **per-session synchronizer token** — one stable token for the
session lifetime, minted fresh only when a new session is created at login. It does NOT
rotate per request (rotation breaks concurrent requests / multi-tab and adds no real
security over the HttpOnly + SameSite=Lax session cookie). See ARCH §1.4.
*Acceptance:* Request without a valid token returns 403. The token is delivered to the
frontend in the `/auth/me` payload (`csrfToken`) and remains valid for the session.

**FR-SYS-005 — Audit Trail**
Every create, update, archive, restore, and permanent delete operation produces
an immutable audit log entry. Hard deletes of empty entities produce only an
INFO application log entry, not an audit record.
*Acceptance:* Audit log is append-only. No UPDATE or DELETE permitted on
the `audit_log` table. Each entry captures actor, action, entity type/ID,
before/after JSON snapshots, IP, and user agent.

**FR-SYS-006 — Recurring Payment Scheduler**
A daily scheduled job processes all active recurring payment sources (explicit schedules +
account-linked Capital/Asset/Insurance recurring payments per FR-A-017). Because the service
scales to zero, the trigger is **Cloud Scheduler** (managed cron) hitting an authenticated job
endpoint — not an in-process timer. See ARCH §5.6.
*Acceptance:* Transactions generated for all due occurrences. The job is **idempotent and
catch-up aware** — on each run it processes every occurrence due since the last processed
point (not only "today"), so a scaled-to-zero gap never drops occurrences. Missed occurrences
detected and flagged. Job endpoint is callable only by the scheduler (OIDC / shared secret).

**FR-SYS-007 — In-App Alerts**
The system generates and displays the following in-app alerts (no emails):

| Alert Type | Trigger | Dismissible |
|---|---|---|
| BUDGET_WARNING | Spending ≥ threshold % of limit | Yes |
| BUDGET_EXCEEDED | Spending > limit | Yes |
| RECURRING_MISSED | Occurrence expected, not processed, no skip | Yes |
| FX_RATE_STALE | Rate not updated > 48 hours | Yes |
| UPCOMING_PAYMENTS | Recurring due within 3 days | Yes |
| FX_API_DOWN | FX API down 3+ consecutive days | Yes |
| BACKUP_CREATED | Database backed up | Yes |

*Acceptance:* Alert panel accessible from top bar. Unread alerts shown as a count badge.
Each alert links to the relevant entity or module. Each alert stores `created_at`, `read_at`,
and `dismissed_at` timestamps (nullable, not booleans) to support a future delivery layer
(email/push) and dedup.

**FR-SYS-008 — Daily Backup**
SQLite database backed up daily to Google Cloud Storage. Retained 90 days.
*Acceptance:* Backup file exists in GCS by 04:00 UTC daily. Cold-start container
restores from latest backup if database file is absent.

**FR-SYS-009 — Responsive UI**
The application is usable on desktop (≥ 1280px), tablet (≥ 768px), and
mobile (≥ 375px) browsers.
*Acceptance:* All core workflows (transaction entry, ledger view, dashboard)
function on mobile. No horizontal scrolling on mobile viewport.

**FR-SYS-010 — Global Search & Command Palette**
A keyboard-summoned (Cmd/Ctrl-K) and topbar-accessible palette searches **across entities**
(transactions, accounts, categories, currencies, budgets, members) and offers **navigation
commands** (jump to any module, "+ New {entity}" actions). Results are grouped by type and
household-scoped; in Individual mode they respect the active member filter and FR-P-006
member-selection permission.
*Acceptance:* A single `GET /api/search?q=` endpoint returns grouped, household-scoped results
(`{type, id, label, sublabel, href}`), capped per group. **Ranking (default):** exact match >
prefix match > substring/fuzzy; tie-break by recency (`updated_at` desc); then a fixed entity-type
weight (transactions > accounts > categories > currencies > budgets > members); archived items
rank last. Selecting a result navigates to the entity (carrying filter state where relevant);
selecting a command runs it. The palette is reachable by keyboard and pointer, and closes on Escape.

**FR-SYS-011 — Branding Configuration** *(reserved — post-MVP)*
App branding (name, logo, primary palette) is sourced from a single swappable `branding` config
rather than hardcoded, to enable future white-labelling. MVP ships the default brand; no
per-household branding UI. *Acceptance (MVP):* No brand strings/assets are hardcoded in
components — all read from the `branding` config (UX §1.1). Per-household white-label is out of
scope for MVP.

**FR-SYS-012 — Maintenance Mode**

A `MAINTENANCE_MODE` environment flag enables site-wide maintenance. When `true`, a middleware
short-circuits all `/api/*`, `/auth/*`, and SPA app routes with a **503** RFC 7807 response body,
which the frontend renders as the Maintenance page (§5.8, UX §3).

The `/health` endpoint and static/asset prefixes are **exempt** — liveness checks and the shell
still serve.

*Acceptance:* Setting `MAINTENANCE_MODE=true` immediately blocks all API/auth/app routes with 503;
`/health` remains 200; static assets still serve; frontend shows the Maintenance page.

**FR-SYS-013 — CI / Security Gates**

Every deployment passes these gates:

- **ruff** — Python lint and format check
- **pytest** + **pytest-asyncio** + **pytest-cov** — backend unit/integration tests with coverage
- **vitest** + **Testing Library** — frontend unit tests
- **playwright** — E2E browser tests
- **bandit** — Python security lint
- **pip-audit** — CVE vulnerability scan for Python dependencies
- **OWASP ZAP** — release gate — **zero critical findings required to deploy**

*Acceptance:* CI pipeline fails if any gate produces errors or critical findings. Deployment
blocked until all gates pass.

**FR-SYS-014 — Generic Entity Pattern**

All entity CRUD follows a generic pattern — no bespoke CRUD pages or endpoints.

**Backend:** Each entity ships **one service module** and **one router** following a standard
template:
- Service: `create_<e>`, `update_<e>`, `archive_<e>`, `restore_<e>`, `delete_<e>`
- Router: `GET /api/<es>` (list), `POST /api/<es>` (create), `GET /api/<es>/{id}` (read),
  `PATCH /api/<es>/{id}` (update), `POST /api/<es>/{id}/archive`, `POST /api/<es>/{id}/restore`,
  `DELETE /api/<es>/{id}` (hard-delete only if zero downstream refs; otherwise 409)
- Every mutation: validate → flush → audit.log
- No raw SQL (ORM only); every query filtered by `household_id`

**Frontend:** Generic reusable layer:
- `useEntityManager<T>` — hook providing `items`, `isLoading`, `create`, `update`, `archive`,
  `bulkArchive` (built on TanStack Query)
- `EntityPage<T>` — action bar, filter slot, main content slot
- `EntityCard<T>` — colour-fill identity (§5.5), favourite star, context menu, archive state,
  value-history sparkline
- `EntityModal<T>` — two-column form layout, cancel/save actions

**Ownership:** Every entity has a `created_by` field. "Own" = author of the record. A Member may
edit/delete only rows they created; Admin/Owner may edit/delete any. The check is a single shared
helper, not re-implemented per module.

*Acceptance:* Every entity follows the generic pattern. No entity has bespoke CRUD endpoints or
UI components (except CategoryTree, which is a tree — exempt from EntityCard but uses the rest
of the generic layer).

**FR-SYS-015 — Immersive Themes**

The application supports expressive palettes (themes) that can be "immersive" — remapping not
just UI chrome but also entity and semantic colours through a single hue family.

**Per-palette `immersive` flag:**
- `immersive=false` — palette reskins only UI chrome (backgrounds, surfaces, borders, text,
  accents); entity and semantic colours keep their true hex
- `immersive=true` — palette also remaps entity colours (category/account/currency/person) and
  semantic colours (success/warning/error/info) through its `tint` + `tint_ramp`

**Immersive `tint` + `tint_ramp` mechanism:**
- An immersive palette declares a single **`tint`** (anchor hue) and a **`tint_ramp`** of N
  ordered steps (light→dark)
- **Entity colours → ramp slot by lightness (luminance-matched):** Each entity's own colour maps
  to the ramp step whose lightness is closest: `idx = round((1 − L) · (N − 1))`, where L = OKLab
  L* (perceptual lightness). Preserves relative lightness (light entity stays light, dark stays
  dark) while collapsing hue to the theme
- **Hash collision resolution:** When two entities land on the same slot, a stable `entity_id`
  hash nudges one to an adjacent slot so they remain distinguishable (different shades in charts)
- **Semantic colours → fixed ramp positions:** Because a monochrome tint can't carry red-vs-green,
  status/flow meaning shifts to lightness + icon/shape (e.g., income = lightest step, expense =
  darkest; status uses ramp positions plus existing iconography ▲▼ for in/out-flow, dot states)
- **Interaction/feedback tokens are themed too:** Focus ring, selection halo, border, and
  selection-fill colours are role-2/UI-accent theme tokens (not literals), so they remap onto
  the tint/ramp (e.g., Game Boy → green rings, green selection halos). They derive from a
  *different* ramp slot than the resting fill so selection/focus still reads as selected within
  a monochrome theme

**Per-person:** Theme and font are personal preferences (`Person.theme`, `Person.font`). A theme
= a `data-theme` attribute on the root swapping the token set.

*Acceptance:* Each palette defines structural tokens (bg, surface, border, text), accent tokens,
status tokens, 8-colour viz series, and the `immersive` flag. Immersive palettes additionally
define `tint` + `tint_ramp`. Switching themes swaps all tokens; immersive themes remap entity and
semantic colours through the tint ramp.

**FR-SYS-016 — Entity Colour-Fill Identity**

Entity identity is conveyed through **colour fill**, never a thin left-edge accent bar (that
pattern is retired).

- **Entity cards** carry a colour **fill**. Default is **calm** (a soft tint of the entity's own
  colour); any instance can be flipped to **vivid** (full saturated fill) — per-instance opt-in
- **Small reference items** (category, payment method, currency, payee) render as **filled
  coloured chips** — the thing that "pops"
- **Contrast-aware text:** Text colour is chosen by the fill's relative luminance (WCAG) — white
  on dark fills, near-black on light fills — with an enforced **contrast floor** so a user's
  brand colour can never make text unreadable. Secondary/sub text = the same contrast colour at
  reduced opacity
- **Colour-chip shape:** Colour swatches / identity chips / chart legend markers are **rounded
  squares** (radius `sm`); **circles are reserved for person avatars** — people round, things
  squared
- **Driven by CSS variable:** The fill uses `--entity-colour` CSS variable, read by children
  (e.g., `bg-entity-fill-calm` / `bg-entity-fill-vivid` utilities). Never inline a raw hex

*Acceptance:* No entity uses a left accent bar. All entities use colour-fill identity (calm
default, vivid opt-in). Text on fills is contrast-aware. Colour chips are rounded squares;
person avatars are circles. Under immersive themes, entity colours remap through the tint ramp
automatically (because they read from the CSS variable, not a hardcoded hex).

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
- CSRF protection on all mutations
- All queries household-scoped at service layer
- No raw SQL — SQLAlchemy ORM only
- Secrets via Google Secret Manager only
- Security headers: CSP, X-Frame-Options, Referrer-Policy
- OWASP ZAP scan in CI on each release; zero critical findings required to deploy

### 4.3 Reliability

- 99% uptime target (Cloud Run SLA)
- Daily backup with 90-day retention
- Circuit breakers on all external API calls (FX rate, OAuth)
- Scheduling via **Cloud Scheduler** (managed cron) → authenticated `/jobs/*` HTTP endpoints —
  **not** an in-process timer (which cannot fire at `min-instances=0`). Jobs are **idempotent +
  catch-up-aware**, so a scale-to-zero gap self-heals on the next run (ARCH §1.7 / §5.6)

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

## Revision History

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-05-23 | Ben + BMAD | Initial PRD — flat FR numbering, module-based organisation |
| 2.0 | 2026-05-26 | Ben + Claude | Full rewrite — entity-family FR organisation, entity hierarchy preamble, Loans removed, Debt FRs rewritten as computed, FRs for EntityCurrencies / EntityFormulas / multi-owner accounts / comparison visualizations / budget history / capital history / DD-MM-YYYY display / hard delete / RFC 7807 error codes added. Epic mapping updated. |
| 3.0 | 2026-06-10 | Ben | Modification to make it complete source of truth |
| 4.0 | 2026-06-14 | Ben + Claude | Aligned to v4 architecture + UX before epic generation: added Formula Editor & Validation (FR-F-007) + sandboxed-evaluator note (FR-F-002); removed stale recurring `manual` status (FR-E-013); fixed dangling FR-P-003a → FR-SYS-015; completed truncated FR-HH-005 acceptance; corrected FR-C-003 acceptance (promote/re-parent); APScheduler → Cloud Scheduler (NFR 4.3); reconciled visualization endpoint names to the canonical ARCH §4.12 set (comparison is a filter param; budget-history → budget-vs-actual; capital-history → portfolio-value-over-time; net-worth → net-worth-over-time) and added the missing `fx-rate-history/{currency_id}` endpoint to both docs. |
| 3.1 | 2026-06-10 | Ben + Claude | Rebuild alignment pass. Consolidated FR-A-008/014/015 into general `AccountSnapshot` value-history (+ required `opening_balance` on ledger-backed accounts, hybrid computed+anchor model). FR-A-017 now spawns a real linked `RecurringPayment`. FR-E-001 rewritten (sticky per-person context defaults + provenance `source`/`external_ref`; removed "default button"). Persisted `fx_rate_used`/`rate_date` on events; transfers carry `fx_delta`. Added FR-E-020 bulk event ops; renumbered duplicate FR-E-016/017 → 018/019. FR-F-003 `interest_formula_id`; reordered FR-F-005/006. Added FR-CU-009 FX rate history. Fleshed out FR-V (FR-V-011–015: universal viewer, mini-charts, event-group aggregation, chart types, series toggle); fixed FR-V-009 storage to `Person.default_view`. Added FR-DB section (net worth computation + over-time + pinning). Alert read/dismiss timestamps. Brief: Formula module entity fix + account value-history + visualization layer prose. |