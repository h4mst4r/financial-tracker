---
title: Entity Design Philosophy
version: 2.0
status: living
created: 2026-05-26
authority: Master design bible for entity *philosophy, hierarchy, relationships, and cross-cutting
           patterns*. All planning artifacts derive from and must not contradict the philosophy here.
           Where concrete schema/DDL specifics differ, **architecture.md §3 is authoritative for the
           column set, types, and migrations** (this doc states intent; §3 states the bytes).
---

# Entity Design Philosophy — Financial Tracker v2

---

## 0. Purpose & Authority

This document is the **single source of truth** for how Financial Tracker v2 is designed, built,
and extended. Every backend model, every frontend component, every API endpoint, and every UI
element derives from the patterns defined here.

**The core promise:** add a new financial entity type and every part of the system — data model,
API, UI card, modal, page, audit trail, archive pattern, currency handling — works without
rewriting shared infrastructure.

Any developer, designer, or AI agent working on this codebase must read this document first.

---

## 1. Core Design Tenets

1. **Hierarchy over repetition.** Every entity inherits from a base. Shared behaviour is defined
   once and inherited everywhere. Duplication is a bug.

2. **Generic first, specific second.** Build the generic `EntityCard<T>` before building
   `AccountCard`. Build `BaseFinancialEvent` before building `Transaction`. Specifics extend
   generics — they do not replace them.

3. **One change, everywhere.** A colour token, a base field, a CRUD behaviour changed in one
   place must propagate to every entity that uses it. If it does not, the architecture has failed.

4. **Extensibility by design.** A new account type (e.g. CryptoWallet) or a new event type
   (e.g. TaxPayment) should require only a new subclass and a configuration object — not new
   infrastructure.

5. **Computed over stored where safe.** Debt, budget variance, net worth, forex delta — these
   are derived values. They are computed from source entities, not stored as independent records.
   This eliminates synchronisation bugs.

6. **No orphan logic.** Every formula, every status rule, every validation belongs to an entity
   class. Logic that lives outside an entity class does not belong in this codebase.

7. **UI reflects structure.** The frontend component hierarchy mirrors the backend entity
   hierarchy. `EntityCard<Account>` and `EntityCard<Transaction>` share the same base rendering
   contract, just as `BankAccount` and `Transaction` share the same `BaseEntity` fields.

---

## 2. The Entity Hierarchy

```
EntityHousehold
│
├── EntityPersons                    (User + HouseholdMember unified)
│   │
│   ├── EntityAccounts               (BaseAccount — discriminated by account_type)
│   │   ├── BankAccount             (interest_rate set ⇒ behaves as savings; no separate type)
│   │   ├── CreditCard               ↳ also a DebtSource
│   │   ├── Capital / Investment
│   │   ├── Asset                    ↳ also a RecurringEventSource
│   │   └── Insurance                ↳ also a RecurringEventSource
│   │
│   └── EntityEvents                 (BaseFinancialEvent)
│       ├── Transaction
│       ├── RecurringPayment         ↳ sources: RecurringPayments, Capital, Assets, Insurance
│       └── Transfer                 ↳ auto-clears EntityDebt; optionally flagged
│
├── EntityBudgets                    (monthly rolling aspirational targets)
├── EntityCategories                 (household-specific, hierarchical, max 2 levels)
├── EntityCurrencies                 (base configurable + daily FX + fees + multi-display)
├── EntityFormulas                   (system defaults + user-configurable registry)
└── EntityDebt                       (computed — derived, never stored as independent records)
```

**Reading the hierarchy:**
- Indented items are owned by or related to the item above them.
- `↳` denotes a secondary role (a CreditCard is primarily an EntityAccount but also behaves
  as a DebtSource).
- `EntityDebt` is a household-level concept because debt exists between persons in a household,
  not between a person and themselves.
- **`EntityDebt` is a *computed view*, not a stored entity.** It is listed in the hierarchy for
  conceptual completeness, but there is **no `debt` table** and it does not inherit `BaseEntity` —
  it is derived on demand from qualifying `EntityEvents`/`EntityAccounts` (§12). An implementer
  must **not** create a debt table; building one is a design error.

---

## 3. Base Entity Definitions

### 3.1 BaseEntity

Every **domain** entity inherits these fields. A small set of technical/child tables inherit
`Base` directly and carry no audit trail — the authoritative exception list is in **architecture
§3.3** (`households`, `sessions`, `household_invitations`, `account_owners`, `occurrence_records`,
`currencies`, `fx_rate_history`, `audit_logs`, `approved_owners`).

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Immutable unique identifier |
| `household_id` | UUID | Owning household — enforced on every query |
| `created_at` | DateTime (UTC) | Record creation timestamp |
| `updated_at` | DateTime (UTC) | Last modification timestamp |
| `created_by` | PersonRef | Who created this record |
| `updated_by` | PersonRef | Who last modified this record |
| `archived` | Boolean | Soft-delete flag — excluded from default queries |
| `archived_at` | DateTime (UTC) | When archived (null if active) |
| `archived_by` | PersonRef | Who archived (null if active) |
| `status` | StatusEnum | Active / Inactive / Archived |

**Backend (Python/SQLAlchemy):**
```python
class BaseEntity(Base):
    __abstract__ = True
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    household_id: Mapped[UUID] = mapped_column(ForeignKey("households.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)
    created_by: Mapped[UUID] = mapped_column(ForeignKey("persons.id"), nullable=False)
    updated_by: Mapped[UUID] = mapped_column(ForeignKey("persons.id"), nullable=True)
    archived: Mapped[bool] = mapped_column(default=False)
    archived_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    archived_by: Mapped[Optional[UUID]] = mapped_column(ForeignKey("persons.id"), nullable=True)
    status: Mapped[StatusEnum] = mapped_column(default=StatusEnum.active)
```

> **`persons` is the one BaseEntity table with nullable overrides.** A person exists at first
> login before any household, so `persons` overrides `household_id` **and** `created_by` to
> **nullable** (architecture §3.3). On all other BaseEntity tables both are NOT NULL as shown above.

### 3.2 MonetaryValue (Value Object)

The `MonetaryValue` block appears on every financial entity. It is never split across ad-hoc
fields. It is always stored and rendered as a unit.

> **Carve-out — anchor/ledger columns are NOT part of MonetaryValue.** A few entities carry
> standalone monetary *anchor* columns that deliberately sit outside the value-object block
> because they are not "the entity's amount": `accounts.opening_balance` /
> `opening_balance_date` (the ledger anchor, §6.1) and a `Transfer`'s destination leg
> (`dest_currency` / `dest_amount` / `dest_amount_base`, §7.4). These are flat columns by
> design (architecture §3.5/§3.6); the "never split" rule governs the entity's *own* primary
> `MonetaryValue`, not these auxiliary anchors.

| Field | Type | Editable | Description |
|---|---|---|---|
| `currency` | ISO 4217 code | User | The transaction currency (e.g. SGD, NZD, USD) |
| `amount` | Decimal(15,4) | User | Amount in original currency |
| `fx_rate` | Decimal(10,6) | System | The rate used — this is `rate_to_base` (`amount_base = amount × rate_to_base`, architecture §3.8). **Persisted on the row** as `fx_rate_used` so historical events don't drift when daily rates change |
| `fx_rate_date` | Date | System | The date the persisted rate applies to (FR-E-009) — drives historical/backfill lookups |
| `amount_base_calculated` | Decimal(15,4) | System (read-only) | `amount × fx_rate` — what the rate/formula says it should be |
| `amount_base` | Decimal(15,4) | **User-overridable** | Actual base currency amount from bank statement; defaults to `amount_base_calculated` |
| `fx_delta` | Decimal(15,4) | Computed | `amount_base_calculated - amount_base` — forex loss (positive = bank charged more than API rate) |
| `fee_amount` | Decimal(15,4) | User | Optional explicit transaction/conversion fee |

**Override flow:**
1. User enters `amount` and `currency`.
2. User selects "Paid with" account (or Cash).
3. System fills `amount_base_calculated` using the following priority chain:
   - **Priority 1 — Account FX formula:** if the selected account has `fx_formula_id` set,
     evaluate the formula with `{ amount, rate, fee_pct, fee_fixed }` from the formula's
     variable definitions. This produces the most accurate real-world figure.
   - **Priority 2 — Spot rate:** if no formula is assigned, fall back to
     `amount_base_calculated = amount × spot_rate` from `EntityCurrencies`.
   - **Priority 3 — Cash / no account:** same as spot rate fallback.
4. The UI displays an indicator showing how `amount_base_calculated` was derived:
   `formula` / `spot rate` / `manual`.
5. `amount_base` defaults to `amount_base_calculated`.
6. User may override `amount_base` with the exact figure from their bank statement.
   The indicator switches to `manual`. `fx_delta` is recomputed immediately.
7. `fx_delta = amount_base_calculated - amount_base`. Positive = bank charged more than
   the formula/spot-rate predicted (additional fees absorbed). Negative = bank charged less.
8. Over time, accumulated `fx_delta` across all transactions reveals total household forex
   cost — including fees not captured by the formula. This is a primary dashboard metric.

**Rules:**
- `amount_base_calculated` is always system-generated and read-only — it preserves the
  API rate reference even after user override.
- `fx_delta` is always displayed, never hidden. It is the transparency commitment to the user.
- When `currency == base_currency`: `fx_rate = 1`, `amount_base_calculated = amount`,
  `amount_base = amount`, `fx_delta = 0`.
- Original `currency` and `amount` are always preserved — never overwritten — so raw
  currency breakdowns remain available for visualisation (§10).

**Frontend component:** `<MonetaryValue>` — renders the full block. Used inside every entity
card and modal. Never replicated as ad-hoc amount fields.

### 3.3 PersonRef (Unified Person Reference)

`Owner`, `Payee`, `Payer` — these are all the same concept: a reference to an `EntityPerson`
within the household. The field name differs by context but the underlying type is always
`PersonRef`.

```typescript
type PersonRef = {
  person_id: UUID;
  display_name: string;
  avatar_url?: string;   // Google picture_url — used FIRST when present
  colour?: HexColor;     // Person.colour — fallback initials-avatar background
};
```

**Rule:** Never store a person's name as a string. Always store a `PersonRef`. Display names,
avatar, and identity colour are resolved at render time from the `EntityPersons` cache.

**Payee/identity rendering (colour-forward, UX §0.1):** show the Google avatar when present;
otherwise an initials chip on `Person.colour`. This is the payee identity colour everywhere a
person appears (rows, chips, comparison series) — distinct from semantic status/flow colours.

### 3.4 StatusEnum

All entities share the same status lifecycle:

```
Active → Inactive → Archived → (Permanently Deleted)
                 ↑___________↓ (restore)
```

| Status | Meaning | Visible in default views |
|---|---|---|
| `active` | Normal operating state | Yes |
| `inactive` | Paused / suspended (e.g. paused recurring payment) | Yes (with indicator) |
| `archived` | Soft-deleted, retained for history | No (filter required) |

Permanent deletion is only available from the archived state. It requires confirmation and
produces an audit log entry that is itself permanent (cannot be deleted).

---

## 4. EntityHousehold

The top-level container. All data in the system belongs to exactly one household.

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Household identifier |
| `name` | String | Household display name |
| `base_currency` | ISO 4217 | Household base currency (default: SGD) |
| `timezone` | IANA timezone | Single shared timezone for all members |
| `created_at` | DateTime | When household was created |
| `created_by` | UUID (no FK) | Founding member's person id — a **bare UUID, not a `PersonRef`/FK**. `households` inherits `Base` (not BaseEntity) to avoid a circular `household_id → households.id` FK, and the person may not be flush-persisted at bootstrap, so this column carries no foreign-key constraint (architecture §3.3/§3.4). |

**Rules:**
- Every API query is scoped to `household_id`. Queries without a valid household context
  are rejected at the middleware layer.
- There is only one household in the system (single-tenant). The household record is the
  security boundary.
- `base_currency` is used for all `amount_base` calculations across every `MonetaryValue`.

---

## 5. EntityPersons

`EntityPersons` unifies the concepts of `User` (authentication identity) and `HouseholdMember`
(household participant) into a single entity. A person exists as a user of the system AND as a
member of the household — these are not separate records.

| Field | Type | Description |
|---|---|---|
| *BaseEntity fields* | — | See §3.1 |
| `email` | String | Google OAuth email — immutable after creation |
| `display_name` | String | Preferred name shown in UI |
| `picture_url` | String | Google profile picture URL |
| `role` | HouseholdRole | `owner` / `admin` / `member` |
| `display_currency` | ISO 4217 | Preferred display currency (default: household base) |
| `default_view` | DefaultViewEnum | `household` / `personal` — persists PersonDashboard mode across sessions |
| `google_sub` | String | Google subject id (unique) — stable identity key |
| `can_create_household` | Boolean | **Cache of the approved-owners match** (§5.1) — not a bootstrap winner flag |
| `last_active_at` | DateTime | Last session activity |
| `colour` | HexColor | Identity colour — **fallback** initials-avatar background (Google `picture_url` used first when present) |
| `theme` | String | Per-person named palette (def `base`) — colour-forward identity, UX §0.1 |
| `font` | String | Per-person UI font (def `base`) |
| `density` | Enum | `comfortable` / `compact` (UX §0.4) |
| `reduce_motion` | Boolean | Honour reduced-motion (UX §0.7) |
| `notification_prefs` | JSON | Per-alert-type opt-in map (drives which §13/FR-SYS-007 alerts this person receives) |
| `dashboard_layout` | JSON | Per-person dashboard composition `{widget_type, span, order, scope?}[]` (UX §17) |

**`notification_prefs` shape** — a flat per-alert-type opt-in map (keys = the UX §5.1 / FR-SYS-007
alert types; a missing key falls back to its default). MVP is single-channel (in-app); if email /
push arrive later, migrate each `true` → `{ in_app: true, email: false }`.

```jsonc
{ "budget_warning": true, "budget_overrun": true, "missed_recurring": true,
  "upcoming_payment": true, "fx_stale": false, "backup": false }   // defaults: fx_stale + backup OFF
```

**`dashboard_layout` shape** — an ordered array of widget entries (UX §17):

```ts
type WidgetType = 'net_worth' | 'spending_income_debt' | 'account_balances'
  | 'spending_by_category' | 'budget_health' | 'upcoming_payments'
  | 'recent_transactions' | 'debt_summary';            // the curated catalog
interface DashboardWidget {
  widget_type: WidgetType;
  span: 'S' | 'M' | 'L';                                // 1×1 · 2×1 · 2×2
  order: number;                                        // integer ascending = board order
  scope?: { kind: 'account' | 'category' | 'budget' | 'all'; id?: string };  // omitted/all = household-wide
}
```

**Per-person, never shared.** `theme`, `font`, `density`, `reduce_motion`, `colour`,
`notification_prefs`, `dashboard_layout`, `display_currency`, and `default_view` are all
**per-person** — one member's preferences never alter another's session. (Favourites + manual
sort are also per-person but live in `entity_preferences`, §13.6 — not on the person row; the
EmojiIconPicker's `recent_glyphs` list also lives there, UX §8.3.)

**HouseholdRole hierarchy:** `owner(3) > admin(2) > member(1)`
- **Owner:** Full control. Can delete household, change member roles, all admin permissions.
- **Admin:** Can invite/remove members, manage categories, manage all entities.
- **Member:** Can create and edit own transactions; read-only on other persons' private data.

**Rules:**
- One person belongs to at most one household.
- `display_currency` is per-person and controls chart/dashboard display. It does not affect
  stored `MonetaryValue` fields.
- A person cannot be permanently deleted — only archived (preserves audit trail integrity).

**PersonDashboard:** Each person has a personalised dashboard view derived from the household
view, filtered to their own accounts and events. The default view is the household aggregate.

### 5.1 Household Membership Transitions

Because a person belongs to at most one household, joining a new household requires leaving the current one. There are two paths:

**Path A: Owner Deletes Household**
- Only available to the household Owner.
- Permanently deletes the household and ALL its data (accounts, events, categories, budgets, etc.).
- On next login `can_create_household` is **recomputed as a cache of the approved-owners match**
  (architecture §2.7) — the ex-owner can seed a new household only if their email is still an
  active `approved_owners` entry. It is no longer an automatic "you were an owner" grant.
- Other members (if any) get `household_id=null`; on re-login they get `NotInvitedError` unless
  separately approved/invited (they remain uninvited).
- **Irreversible.** Data is gone.

**Path B: Admin/Member Leaves Household**
- Available to Admin and Member roles.
- Detaches the person from the household (sets `household_id=null`).
- All the person's data (accounts, events, etc.) is ARCHIVED — not deleted. It remains in the household's dataset but is excluded from active queries.
- Person can rejoin the same household later (via new invitation) to restore access to their archived data.
- **Reversible.** Data is preserved.

**Pending Invitation Flow:**
When a person logs in and has a pending invitation to a DIFFERENT household:
1. System shows `PendingInvitationDialog` (UX §4.3)
2. Dialog displays role-aware consequences (delete vs. leave)
3. On confirm:
   - **Owner:** Calls `DELETE /api/household` (delete current), then `POST /api/invitations/:token/accept` (join new)
   - **Admin/Member:** Calls `POST /api/household/leave` (leave current), then `POST /api/invitations/:token/accept` (join new)
4. On dismiss: Dialog closes. Invitation remains pending. Reappears on next login.

**Invitation States:**
- `pending` — Awaiting acceptance or decline
- `accepted` — Person joined the household
- `declined` — Person explicitly declined
- `expired` — Past `expires_at` date (expiry = **7 days**)
- `revoked` — Invitation was revoked by the inviter (was `cancelled` in v1 — renamed)

---

## 6. EntityAccounts (BaseAccount)

All account types inherit from `BaseAccount`. The `account_type` field discriminates between
subtypes. No account-type-specific logic may live outside its subclass.

### 6.1 BaseAccount Fields

| Field | Type | Description |
|---|---|---|
| *BaseEntity fields* | — | See §3.1 |
| `name` | String | Account display name |
| `account_type` | AccountTypeEnum | Discriminator — see §6.2 |
| `currency` | ISO 4217 | Primary currency of this account |
| `owners` | List[PersonRef] | Formal owners (many-to-many) — min 1 |
| `institution` | String | Bank/provider name (optional) |
| `colour` | HexColor | **Per-instance** brand/identity colour (default = the account-type colour, §6.2); the colour-forward identity source for this account everywhere (UX §0.1). `brand_image_ref` reserved, post-MVP |
| `opening_balance` | Decimal(15,4) | Ledger-backed types only (Bank/CreditCard) — the anchor for the computed running balance; NULL for asset-like types |
| `opening_balance_date` | Date | Date the opening balance applies from (ledger-backed only) |
| `notes` | String | Free-text notes (optional) |

**Current balance is computed, not a stored field (architecture §3.5/§3.6).** For
ledger-backed accounts (Bank/CreditCard): `current = opening_balance + Σ ledger events`, anchored
and corrected by manual `AccountSnapshot` rows. For asset-like accounts (Capital/Asset/Insurance):
current value = the **latest `AccountSnapshot`**. There is no `balance` or `current_value` column —
both were dropped (`month_year` likewise removed; periodicity is handled by snapshots).

**Multiple owners rule:** Income attribution is tracked via the `Payee` field on
`EntityEvents`, not by account ownership. However, formal ownership is recorded for
accurate net-worth reporting when the same account receives salaries from two people.

**Primary owner rule:** Every account has exactly one primary owner (`AccountOwner.is_primary = true`). Additional owners may be added. Minimum one owner always enforced — the last owner cannot be removed. Primary owner is displayed with a `★` prefix in all UI surfaces.

**Account number storage and display:** `account_number` stores the full number but is displayed masked (last 4 digits visible: `****1234`) in all read-only surfaces. The modal input uses a password-style field with a show/hide toggle. Never display the unmasked number outside the modal input.

**Duplicate account behavior:** Follows the universal entity duplicate pattern (EDP §13.4: "Clone with new ID, cleared date"). Account-specific rules:
- All NON-monetary fields copied: name (appended with " (copy)"), type, subtype fields, institution, owners, notes
- All monetary values ZEROED/cleared: opening_balance, cost_basis, credit_limit, coverage_death, coverage_tpd, coverage_ci, coverage_early_ci, coverage_personal_accident, surrender_value, purchase_value, reserved_amount, bonus_limit, reward_points, etc. (there is no `balance` column — current balance is computed, §6.1)
- No confirmation dialog — duplicate is a frictionless operation consistent with all other entities
- User can set correct balances via Edit modal after duplication

### 6.2 AccountTypeEnum and Subtypes

| Type | Subtype Class | Additional Fields | Secondary Role |
|---|---|---|---|
| `bank` | `BankAccount` | `account_number` (masked), `interest_rate` (optional), `interest_frequency`, `reserved_amount` (Decimal, nullable — bank-held emergency reserve; excluded from available balance), `fx_formula_id` (FK Formula, nullable) | — |
| `credit_card` | `CreditCard` | `credit_limit`, `billing_day`, `due_day`, `reward_points`, `annual_fee`, `reward_type` (enum: `points`/`cashback`/`miles`/`none`), `bonus_limit` (Decimal, nullable — earn-rate threshold), `points_expiry` (date, nullable), `fx_formula_id` (FK Formula, nullable) | **DebtSource** |
| `capital` | `CapitalAccount` | `investment_type` (stock/bond/fund/cpf/fixed_deposit), `cost_basis`, `interest_formula_id` (FK Formula, nullable — growth/interest model) — *current value = latest `AccountSnapshot`, not a stored column* | **RecurringEventSource** |
| `asset` | `AssetAccount` | `asset_type` (property/vehicle/other), `registration_no` (str, nullable — strata title no. for property, plate no. for vehicle), `purchase_date`, `purchase_value`, `depreciation_formula_id`, `interest_formula_id` (FK Formula, nullable — e.g. loan interest) — *value history via `AccountSnapshot`, §6.2a* | **RecurringEventSource** |
| `insurance` | `InsuranceAccount` | `policy_no` (str, nullable), `insurer` (str), `policy_type` (enum: `life`/`term`/`health`), `policy_status` (enum: `active`/`cancelled` — domain status, separate from record lifecycle), `purchase_date`, `premium_frequency`, `coverage_death` (Decimal, nullable), `coverage_tpd` (Decimal, nullable), `coverage_ci` (Decimal, nullable), `coverage_early_ci` (Decimal, nullable), `coverage_personal_accident` (Decimal, nullable), `coverage_hospital` (str, nullable — text field: ward type or dollar excess e.g. "Private" or "$2,000 excess"), `surrender_value` (Decimal, nullable — life policies only), `surrender_inquiry_date` (date, nullable) | **RecurringEventSource** |

**Entity accent colour per account type** — the **default** when an account has no per-instance
`colour`. Under the colour-forward identity (UX §0.1) a per-instance `Account.colour` (brand
colour) **overrides** these and drives a calm colour *fill* (not just a thin bar), with
contrast-aware text. The hex values below are the seed defaults; the live colours are theme
tokens (UX §0.1) and, under an `immersive` palette, may be reskinned entirely. Used for the card
identity fill/border, type `Badge`, and chart segments:

| `account_type` | Token | Colour |
|---|---|---|
| `bank` | `--color-entity-account` | Indigo `#6366f1` |
| `credit_card` | `--color-entity-credit` | Red `#ef4444` |
| `capital` | `--color-entity-capital` | Green `#10b981` |
| `asset` | `--color-entity-asset` | Amber `#f59e0b` |
| `insurance` | `--color-entity-insurance` | Cyan `#06b6d4` |

**AccountCard display contract** — what each `AccountCard` shows at a glance:

| Layer | Content |
|---|---|
| Identity | **Colour fill** — calm tint (default) or vivid (opt-in) of the instance `colour`, contrast-aware text (UX §0.1/§2). Identity is the fill, never a thin left-edge accent border. |
| Header | Name · type `Badge` · balance (`MonetaryValue`) · owner `AvatarStack` (max 3) |
| Owner tags | Neutral `Badge` per owner (`text-xs`); primary owner prefixed `★`; wraps if multiple |
| Secondary | Type-specific info line (see UX §2.2 for per-type content) |

**Bank and savings accounts are unified.** A `BankAccount` with `interest_rate` set is
effectively a savings account. Bonds and fixed deposits belong under `CapitalAccount`
(investment_type: `bond` or `fixed_deposit`). There is no separate savings account type.

### 6.2a Account value history — `AccountSnapshot` (generalized)

Value-over-time is tracked by a single **`AccountSnapshot`** child table (architecture §3.6) —
the generalization of v1's `ValuationRecord`, applying to **all** account types, not just assets.
A snapshot is the anchor/correction point for ledger-backed accounts and the *source of current
value* for asset-like accounts.

```python
class AccountSnapshot(BaseEntity):
    account_id: UUID            # Parent account (any type)
    snapshot_date: date         # Date this value applies
    value: MonetaryValue        # Amount + currency
    source: str                 # enum (architecture §3.5): manual | formula | reconciliation
                                #       | appraisal | import | computed
    formula_id: UUID | None     # If computed by EntityFormulas
    notes: str | None           # Appraiser notes / source document reference

# Asset-like current value = latest AccountSnapshot by snapshot_date.
# Ledger-backed current balance = opening_balance + Σ ledger events, corrected by manual snapshots.
# The monthly scheduler writes a source=computed snapshot per Bank/CreditCard account (FR-SYS-006).
```

This enables:
- Manual entry of new valuations — `source=manual`; professional valuation — `source=appraisal`
- Formula-computed depreciation entries — `source=formula`
- Reconciliation/import anchors — `source=reconciliation` / `import`
- Monthly computed balance snapshots for ledger-backed accounts — `source=computed`
- A historical value chart on any account's detail view / MiniSparkline (UX §9.2)

### 6.3 DebtSource (CreditCard)

A `CreditCard` account is simultaneously an `EntityAccount` and a `DebtSource`. Its debt
balance is **computed** (see §12 EntityDebt), not stored — there is **no `balance` column**
(§6.1); the current outstanding amount is `opening_balance + Σ ledger events`, derived at query
time. When a `Transfer` is made to a `CreditCard` account, that computed balance reflects the
repayment automatically unless the transfer is flagged `is_debt_repayment = false`.

### 6.4 RecurringEventSource (Asset, Capital, Insurance)

`Asset`, `Capital`, and `Insurance` accounts can drive recurring payments. **There is no
`recurring_config` block and no `recurring_configs` table — both were removed (architecture
§3.7).** Instead, enabling recurrence on such an account **spawns a real, linked
`RecurringPayment` `FinancialEvent`** (FR-A-017) whose `source_entity_type` / `source_entity_id`
point back to the account. The single recurring processor (FR-SYS-006) then drives that event like
any other — no separate account-source scanning path exists. This collapses two scheduling code
paths into one and means an account's recurrence is editable as a normal RecurringPayment (§7.3).

**v1 processor mapping → v2** (each maps onto a spawned `RecurringPayment`, not a config block):
| v1 PROCESSORS key | v2 Entity | Transaction field mappings preserved |
|---|---|---|
| `Recurring Payments` | `RecurringPayment` event | Name, Currency, Amount, Payer, Type, Method, Category, Status |
| `Capital` | spawned `RecurringPayment` (source=`capital`) | AccountName→Name, Owner→Payer, Category=Investments |
| `Assets` | spawned `RecurringPayment` (source=`asset`) | AssetName→Name, AssetType→Category (Property→Mortgage, Vehicle→Loan) |
| `Insurance` | spawned `RecurringPayment` (source=`insurance`) | Name, Yearly→Amount, NamedRange→Payer, Category=Insurance |

---

## 7. EntityEvents (BaseFinancialEvent)

All financial events — transactions, recurring payments, transfers — inherit from
`BaseFinancialEvent`. Events are things that **happen** (they have a date, a direction, and
a monetary value). Accounts are things that **hold value**. This distinction is enforced.

### 7.1 BaseFinancialEvent Fields

| Field | Type | Description |
|---|---|---|
| *BaseEntity fields* | — | See §3.1 (includes lifecycle `status`: active/inactive/archived) |
| `name` | String | Event display name / description |
| `event_date` | Date | The date the event occurred or is scheduled |
| `event_type` | EventTypeEnum | `transaction` / `recurring_payment` / `transfer` |
| `transaction_status` | TransactionStatusEnum | Domain status — see below |
| `monetary_value` | MonetaryValue | Full monetary value block (see §3.2) |
| `payee` | PersonRef | Who this event is attributed to (person in household). **DB column = `payee_person_id`** (FK persons) — `payee` is the conceptual `PersonRef`; per §3.3 a `PersonRef` is stored as the `*_person_id` FK and resolved at render time (architecture §3.6). |
| `payment_method` | String | `"cash"` when paid in cash (no account involved); `null` for all account-based transactions. The "Paid with" control in the UI is an Account dropdown — `payment_method` is only set when the user selects the Cash option. |
| `category_id` | UUID | Reference to EntityCategories |
| `transaction_type` | TransactionTypeEnum | `inflow` / `outflow` / `transfer` |
| `is_shared_expense` | Boolean | Flags this event as a shared household expense paid by the `payee` from their personal account — drives internal household debt derivation (§12). **Only valid on `transaction_type = outflow`. Must be `false` on all `Transfer` events.** |
| `notes` | String | Free-text notes |
| `is_gst_claimable` | Boolean | GST claimable flag |
| `is_gift` | Boolean | Gift transaction flag |
| `source_account_id` | UUID | Account the event originates from |
| `linked_recurring_id` | UUID | If generated by a RecurringPayment, its ID |
| `source` | SourceEnum | Provenance — `manual` / `csv_import` / `bank_feed` (def `manual`, FR-E-001). Recurring-generated events are **not** a distinct `source` value — their provenance is the `linked_recurring_id` FK, so they carry `source = manual`/`csv_import` as appropriate. (Aligned to architecture §3.6.) |
| `external_ref` | String | Idempotency/dedup key for imported or generated events (nullable) |

**FX persistence (FR-E-009).** The event's `MonetaryValue` persists the **actual rate used** and
its **date** (`fx_rate_used` / `fx_rate_date` in architecture's MonetaryValueMixin), so historical
rows never drift when daily rates change. See §3.2.

**TransactionStatusEnum — domain status (separate from lifecycle status in BaseEntity):**

| Status | Meaning |
|---|---|
| `pending` | Scheduled or entered but not yet occurred / paid |
| `completed` | Occurred and confirmed |
| `cancelled` | Was scheduled but will not occur |
| `reconciled` | Matched against bank or credit card statement |

**Two status fields explained:**
- `status` (BaseEntity): record lifecycle — `active / inactive / archived`. Controls whether
  the record appears in views.
- `transaction_status` (BaseFinancialEvent): financial domain state — `pending / completed /
  cancelled / reconciled`. Controls financial reporting and reconciliation workflows.
  Both fields exist on every event entity.

### 7.2 Transaction

Extends `BaseFinancialEvent` with:

| Field | Type | Description |
|---|---|---|
| `reconciled` | Boolean | Matched against bank statement |
| `reconciled_at` | DateTime | When reconciled |
| `duplicate_of` | UUID | If flagged as duplicate, reference to original |

### 7.3 RecurringPayment

Extends `BaseFinancialEvent` with:

| Field | Type | Description |
|---|---|---|
| `frequency_text` | String | Raw free-text frequency input (e.g. "3rd of every month") |
| `frequency_rule` | RecurrenceRule | Parsed and user-confirmed recurrence rule |
| `next_occurrence` | Date | Next computed occurrence date |
| `recurrence_start_date` | Date | Recurring period start (DB column name per architecture §3.6; referred to as "start_date" in the parser prose below) |
| `recurrence_end_date` | Date | Recurring period end (null = indefinite) |
| `source_entity_type` | SourceTypeEnum | `recurring_payment` / `capital` / `asset` / `insurance` |
| `source_entity_id` | UUID | Reference to the source entity |
| `occurrences_generated` | Integer | Count of transactions successfully generated |
| `last_processed_at` | DateTime | When the scheduler last ran this |

**Occurrence status** — each expected occurrence has a computed state:

| Occurrence Status | Meaning |
|---|---|
| `upcoming` | Scheduled, not yet due |
| `processed` | Scheduler generated the linked transaction |
| `skipped` | User manually skipped this occurrence |
| `missed` | Due date passed, no transaction generated, no skip recorded — indicates a scheduler failure or bug |
| `failed` | Processing was attempted but errored after all retries |

**Missed occurrence detection:**
The system computes expected occurrences from `frequency_rule` between `start_date` and today.
For each expected date, it checks whether a linked transaction exists (`linked_recurring_id`
matches and `event_date` is within ±1 day). Any expected occurrence with no matching
transaction and no skip record is flagged as `missed` and surfaced as an alert.

**RecurringDateParser — preserved from v1:**

The following patterns are supported, validated by the UI before storing as `frequency_rule`:

| Input Pattern | Example | Parsed Rule |
|---|---|---|
| `every [weekday]` | "every Sunday" | Weekly on Sunday |
| `weekly` | "weekly" | Weekly from start_date weekday |
| `monthly` | "monthly" | Monthly on start_date day |
| `[N]th of every month` | "3rd of every month" | Monthly on day 3 |
| `every [N] days` | "every 31 days" | Every N days from start_date |
| `every [N] weeks` | "every 2 weeks" | Every N weeks from start_date |
| `[Nth] [weekday] of [month]` | "2nd Tuesday of March" | Annually, specific weekday |
| `[month] [day]` | "February 27" | Annually on that date |
| `yearly` | "yearly" | Annually on start_date |

**UI confirmation rule:** The UI must display the parsed next occurrence date alongside the
free-text input before the user can save. The user explicitly confirms the interpretation.
The raw `frequency_text` is stored for display; `frequency_rule` is what drives scheduling.

### 7.4 Transfer

Extends `BaseFinancialEvent` with:

| Field | Type | Description |
|---|---|---|
| `destination_account_id` | UUID | Target account |
| `dest_currency` | ISO 4217 | Destination-leg currency (may differ from the source leg) |
| `dest_amount` | Decimal(15,4) | Amount credited at the destination, in `dest_currency` |
| `dest_amount_base` | Decimal(15,4) | Destination amount converted to base currency |
| `is_debt_repayment` | Boolean | Explicitly flagged as debt repayment (default: auto-detected) |
| `debt_cleared_amount` | Decimal | Computed debt cleared by this transfer |

> **Destination leg is flat columns, not a nested `MonetaryValue`.** Per architecture §3.6 the
> Transfer's destination is captured by the three `dest_*` columns above (a deliberate carve-out
> from the value-object rule, §3.2). The Transfer's *source* leg uses the entity's own
> `MonetaryValue` block (`amount`/`amount_base`/`fx_rate`/`fx_rate_date`/`fx_delta`); a future
> remittance metric = `amount_base − dest_amount_base`.

**Debt-clearing rules (see §12):**
1. Any Transfer **to** a CreditCard account is automatically treated as debt repayment.
2. Any Transfer between household members' accounts where one account is flagged as a
   debt contributor is automatically treated as internal debt repayment.
3. User can override `is_debt_repayment = false` to suppress auto-clearing (e.g. when
   topping up a credit card for spending, not repayment).

**`is_shared_expense` does not apply to Transfers.** The shared expense is always the
original outflow transaction. The Transfer that subsequently repays the debt is captured
via `is_debt_repayment`, not `is_shared_expense`. These two flags serve distinct purposes
and must not be conflated.

---

## 8. EntityBudgets

Budgets are **aspirational targets**. They are not transactions. They do not hold value.
They define an expected spending envelope and the system measures actuals against them.

| Field | Type | Description |
|---|---|---|
| *BaseEntity fields* | — | See §3.1 |
| `name` | String | Budget display name |
| `category_id` | UUID | The category this budget governs |
| `owner` | PersonRef | The person this budget applies to (null = household-wide) |
| `period_type` | PeriodTypeEnum | `monthly` / `yearly` |
| `limit` | MonetaryValue | The spending cap for this period |
| `period_start` | Date | Start of the budget period |
| `period_end` | Date | End of the budget period (derived from `period_type`) |
| `alert_threshold_pct` | Integer | Percentage at which to fire a warning alert (default: 80) |
| `rollover` | Boolean | Whether unspent balance carries to next period |

**Derived (NOT stored columns):**

| Derived value | Computation |
|---|---|
| `actual_spent` | Sum of matching EntityEvents for this period (see linkage below) |
| `variance` | `limit.amount_base - actual_spent` |

> **`actual_spent` and `variance` are computed at query time — there is no `actual_spent` (or
> `variance`) column on the `budgets` table** (architecture §3.7, FR-B-003). They are recomputed
> on every read from the contributing events so they never drift. Do not persist them.

**Budget linkage:** `actual_spent` is computed by summing all `EntityEvents` where:
- `event_date` falls within `period_start` → `period_end`
- `category_id` matches (including child categories in hierarchy — spending rollup)
- `payee` matches the budget `owner` (or is any person if household-wide)
- `transaction_type = outflow` and `transaction_status != cancelled`

**Period types:**
- `monthly`: standard rolling monthly target. Background job creates next month's record
  at month-end, copying `limit` unless overridden.
- `yearly`: annual budget. Created once per year. Monthly actuals roll up into it.
  Both monthly and yearly budgets can coexist for the same category.

**Multi-currency display:** `limit` is a `MonetaryValue`. Display converts using the
person's `display_currency` (e.g. shown in NZD even if stored in SGD). The `actual_spent`
figure respects the same display currency, using `amount_base` values from each contributing
event converted at render time.

**Historical view:** Every budget period is a separate record. Past periods are read-only.
The UI may display a sparkline or bar chart of budget variance across past periods (monthly
or yearly) for trend analysis.

**Drill-down visualization (three levels):**
1. **Primary:** Budget category totals — bar/progress view of all categories vs limits.
2. **Secondary (on click):** Individual transactions that contributed to the selected
   category budget in the current period. Shows each event with date, name, amount.
3. **Tertiary (on click from secondary):** If the category has subcategories, breaks
   down spending by subcategory within the parent. Shows the subcategory contribution split.

This drill-down pattern is the standard for all budget-related visualizations and is
implemented in the UX Specification.

---

## 9. EntityCategories

Categories are the classification system for EntityEvents and EntityBudgets. They are
household-specific — no system-wide global categories exist.

| Field | Type | Description |
|---|---|---|
| *BaseEntity fields* | — | See §3.1 |
| `name` | String | Category display name |
| `color` | HexColor | Display colour (e.g. `#4CAF50`) |
| `icon` | String | Emoji or icon identifier |
| `category_type` | CategoryTypeEnum | `income` / `expense` / `both` |
| `parent_id` | UUID | Parent category ID (null for top-level) |
| `depth` | Integer | Computed depth in hierarchy (0 = top-level, 1 = subcategory; max 2) |

**Rules:**
- Maximum hierarchy depth: 2 levels (parent → child). No grandchildren.
- A top-level category that already has children cannot be made a subcategory of another — `depth` must remain 0 when children exist.
- Categories follow the §13.1 archive pattern: soft-delete (archive) if events, budgets, or
  recurring payments reference the category; hard-delete if empty (zero downstream deps).
  Archived categories retain their reference on existing events — excluded from dropdowns
  but preserved for historical accuracy.
- **Archiving a parent archives the whole branch** — its subcategories are archived *together*
  with it (FR-C-005). Children are **not** auto-promoted to top-level. Restoring the parent
  restores the branch. (Return 200, not 409 — see CLAUDE.md §6.6.)
- Spending rollup: a parent category's totals include all child category spending.
- **Merge:** one or more source categories can be merged into a target. All `FinancialEvent.category_id` references on sources are reassigned to the target. Subcategories of sources are reassigned to the target (name clash → append `" (2)"`). Sources are archived. Merge is transactional — all-or-nothing.
- **Promote:** a subcategory can be promoted to top-level at any time by setting `parent_id = null`; `depth` resets to 0.
- **Reassign:** a subcategory can be reassigned to a different top-level parent by updating `parent_id`; `depth` stays 1.
- On default creation: **13 starter categories** seeded automatically and idempotently at
  household creation — **Expense (10):** Food & Dining, Groceries, Transport, Housing, Utilities,
  Healthcare, Shopping, Entertainment, Insurance, Education · **Income (2):** Salary, Investment
  Income · **Both (1):** Miscellaneous. All are household-specific (`household_id` set); **no
  system categories exist**; all are fully editable/renamable/deletable by the owner. This is the
  authoritative seed list (epics Story 3.1 references it).

---

## 10. EntityCurrencies

Currencies are not just codes. They are configurable entities with rate history, fee
structures, and display preferences.

| Field | Type | Description |
|---|---|---|
| `code` | ISO 4217 | Currency code (e.g. SGD, NZD, USD) |
| `name` | String | Full name (e.g. Singapore Dollar) |
| `symbol` | String | Display symbol (e.g. S$) |
| `is_base` | Boolean | Exactly one currency is the base (default: SGD) |
| `is_display_active` | Boolean | Whether shown in the display currency switcher |
| `last_rate_at` | DateTime | When the FX rate was last fetched |
| `rate_to_base` | Decimal(10,6) | Current rate to base currency (`amount_base = amount × rate_to_base`) |
| `rate_source` | String | The **winning provider** for this currency from the per-currency fallback chain (§10a) — two currencies may resolve to different providers |
| `fee_pct` | Decimal(6,4) | Default conversion fee percentage for this currency |
| `colour` | HexColor | Currency identity colour (default derived deterministically from `code`; overridable). Doubles as the **series colour in raw-currency stacked charts** so currency identity is consistent across chips and viz (UX §0.1) |

**Rules:**
- Daily FX rate fetch via the **configured provider chain** (§10a / architecture §5.7), not a
  single hardcoded vendor. Rate effectively cached for 24 h. Circuit breaker: when **all** enabled
  providers fail for a currency, its last known rate is used. No retry storm.
- `is_base = true` on exactly one currency at all times. Changing the base currency
  recalculates all `amount_base` fields via a background migration job.
- `is_display_active` currencies appear in the household currency switcher (e.g. SGD + NZD).
  Users can switch display currency without changing stored values.
- `fee_pct` is a household-configurable default. Individual events can override it in their
  `MonetaryValue.fee_amount` field.

**Display currency vs base currency:**
- **Base currency** (currently SGD): all `amount_base` values are stored in this currency.
- **Display currency** (per-person, e.g. NZD for someone living in NZ): charts, dashboards,
  and budget totals are rendered in display currency using the current rate at render time.
  This is a view-layer transformation — nothing stored changes.

**Raw vs converted visualization:**
All charts and visualizations must support two modes, toggleable by the user:

- **Raw currency mode:** shows amounts broken down by their original `currency`. For example,
  a food spending chart shows a stacked breakdown: SGD 500 (blue) + NZD 200 (green). Each
  currency segment is coloured distinctly. The original `currency` and `amount` fields on
  `MonetaryValue` are preserved precisely for this purpose.
- **Converted mode:** shows all amounts converted to `display_currency` using `amount_base`
  and the current `display_currency` rate. The food chart shows a single bar of total
  equivalent in NZD (or SGD).

Both modes are available on all spending charts, budget visualizations, and account
summary views. The `MonetaryValue` design — preserving `currency`, `amount`, and
`amount_base` — makes both modes possible from a single data model.

### 10a. FxProvider (rate-source configuration)

FX rates are **not pinned to one vendor**. A household configures an **ordered list** of
`FxProvider` records (the fallback chain). Configured in Settings → Management → Integrations
(UX §5.2); full fetch/resilience spec in architecture §5.7.

| Field | Type | Description |
|---|---|---|
| *household-scoped* | — | One chain per household |
| `name` | String | Display name |
| `provider_type` | Enum | `openexchangerates` \| … (pluggable implementations) |
| `base_url` | String | Provider endpoint |
| `api_key_secret_ref` | String | **A Secret Manager resource name — never the key itself**; never echoed by the API |
| `priority` | Integer | Position in the fallback chain |
| `is_enabled` | Boolean | Whether this provider participates |
| `last_status` | Enum (nullable) | `ok` / `stale` / `down` — **null until the provider's first fetch** (architecture §3.8). Paired with `last_checked_at` (also nullable). |

**Rules:**
- **Resolution is per-currency:** for each currency, walk enabled providers by `priority` until
  one returns a usable rate; record that provider in `Currency.rate_source` (§10) and the rate
  history row. Providers differ in currency coverage, so currencies may resolve to different
  providers on the same run. The breaker trips for a currency only when **every** provider fails.
- **Keys are write-only** — the create/edit path writes the key to Secret Manager and stores only
  the reference; reads mask it. The API never returns the key.
- **Bank connections** are a reserved, post-MVP integration surface (greyed-out placeholder).

---

## 11. EntityFormulas

Formulas are named calculation rules that attach to entity types. They turn raw data into
derived financial insight. The formula system is a **registry** — formulas are registered
by name and associated with entity types that use them.

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Formula identifier |
| `name` | String | Display name (e.g. "Straight-Line Depreciation") |
| `formula_key` | String | Machine key (e.g. `depreciation_straight_line`) |
| `applies_to` | EntityTypeEnum | Which entity type uses this formula |
| `expression` | String | Human-readable formula (e.g. `purchase_value × (1 - rate)^years`) |
| `variables` | JSON | Variable definitions with types and defaults |
| `is_system` | Boolean | System defaults cannot be deleted, only overridden |
| `is_active` | Boolean | Whether this formula is enabled for the household |

**System default formulas:**

| Formula Key | Applies To | Expression | Description |
|---|---|---|---|
| `depreciation_straight_line` | Asset | `purchase_value × (1 - rate × years)` | Linear asset depreciation |
| `depreciation_declining_balance` | Asset | `purchase_value × (1 - rate)^years` | Exponential depreciation |
| `compound_interest` | Capital | `principal × (1 + rate/n)^(n×t)` | Compound interest growth |
| `loan_amortisation` | Asset (mortgage) | Standard amortisation schedule | Monthly repayment breakdown |
| `fx_delta` | All MonetaryValue | `amount_base_calculated - amount_base` | Forex cost per transaction (fees beyond the formula/spot rate prediction) |
| `fx_fee_calculation` | BankAccount, CreditCard | `amount × rate × (1 + fee_pct / 100) + fee_fixed` | Computes actual base-currency amount including card FX fee; variables: `amount`, `rate`, `fee_pct` (default 0), `fee_fixed` (default 0) |
| `budget_variance` | Budget | `monthly_limit - actual_spent` | Budget remaining |
| `net_worth` | Household | `Σ(account balances) - Σ(computed debts)` | Overall financial position |

**Account FX formula assignment:**

`BankAccount` and `CreditCard` have an `fx_formula_id` field (FK to `EntityFormulas`). When set,
the referenced formula is evaluated during transaction creation to produce `amount_base_calculated`
instead of using the raw spot rate. This encodes the card's real-world fee structure into the
system.

Example: An Altitude Visa card with a 1.5% foreign transaction fee gets `fx_fee_calculation`
assigned with `fee_pct = 1.5`. Every foreign transaction on that card auto-fills with
`amount × rate × 1.015` rather than `amount × rate` — matching the statement figure without
manual correction.

**UI rule:** Formula results are **shown on hover only**. They do not clutter card views.
On hover, a tooltip reveals: formula name, current inputs, computed result, and data source.
Exception: `fx_delta` is always visible on transaction rows — never hidden (see §3.2).

---

## 12. EntityDebt

Debt is **never stored as an independent record**. It is a computed view derived from
`EntityEvents` and `EntityAccounts` that qualify as debt contributors.

### 12.1 Debt Derivation Rules

**Source 1 — CreditCard balance:**
```
CreditCard.debt_balance =
    Σ(outflow transactions on this card) - Σ(transfers to this card marked as repayment)
```

**Source 2 — Internal household debt (person-to-household):**
```
Person.household_debt =
    Σ(events where payee = this_person
      AND is_shared_expense = true
      AND source_account belongs to this person personally)
    - Σ(transfers to this person's account flagged as household debt repayment)
```

The `is_shared_expense` flag on `BaseFinancialEvent` (§7.1) is the **sole driver** of
internal household debt. When Person A pays for groceries for the whole household from
their personal bank account and marks the event `is_shared_expense = true`, the system
adds that amount to Person A's household debt balance. The household owes Person A until
a repayment Transfer clears it.

**Source 3 — Asset loan / mortgage *(POST-MVP — no MVP `FR-D` covers this; not in Epic 11):***
```
Asset.remaining_loan =
    loan_amount - Σ(repayment transactions linked to this asset)
    (uses loan_amortisation formula if configured)
```
> Reserved for a future release. MVP debt = Sources 1 + 2 only. To promote it, add an `FR-D` and
> an Epic 11 story; until then the loan-amortisation formula (EDP §11) can still display a payoff
> schedule without feeding household debt.

**Total household debt (MVP):**
```
EntityDebt.total = Σ(CreditCard.debt_balance) + Σ(Person.household_debt)   # + Σ(Asset.remaining_loan) when Source 3 ships
```

### 12.2 Debt-Clearing via Transfer

When a `Transfer` is recorded:
1. System checks destination account type.
2. If `destination_account_type == credit_card`: automatically flags as debt repayment.
3. If destination account belongs to a household member who has outstanding household debt:
   system flags as internal debt repayment.
4. User may override flag to `is_debt_repayment = false` at entry time.
5. On save: `debt_cleared_amount` is recorded on the Transfer and `EntityDebt` is
   recomputed for the affected parties.

**CreditCard monthly auto-clear:** A background job at month-end checks each CreditCard's
`debt_balance`. If a full-payment transfer is detected for the current month, the card is
marked as `monthly_cleared = true`. This can be automated or manually confirmed.

---

## 13. Cross-Cutting Patterns

These patterns apply to **every entity** without exception.

### 13.1 Archive Pattern (Soft Delete) and Hard Deletion

**Standard lifecycle (entities with data):**
```
Active ──[archive]──► Archived ──[restore]──► Active
                              └──[delete]───► Permanently Deleted (irreversible)
```

- Archived entities are excluded from all default queries.
- Archived entities retain all their relationships (e.g. transactions keep their category
  reference even if the category is archived).
- Permanent deletion is only available from the archived state.
- Permanent deletion produces an immutable audit log entry.
- Archived recurring payments are skipped by the scheduler.

**Hard deletion for empty entities (setup/testing):**

An entity may be **hard-deleted directly** (bypassing the archive step, without producing
an audit log entry) if and only if it has **zero downstream dependencies** — meaning no
other entity holds a foreign key reference to it.

Empty entity examples:
- A `Category` with no linked transactions, budgets, or recurring payments
- An `Account` with no linked transactions or transfers
- A `Budget` with no historical contribution records
- A `Person` who has never created any event or account

**Emptiness check:** The system performs a dependency scan before allowing hard deletion.
If any dependent records are found, the UI blocks hard deletion and offers archiving instead.
If the entity is confirmed empty, the system hard-deletes without an audit entry and logs
only an `INFO`-level application log entry (not an audit record).

This rule exists specifically to keep the audit trail clean during initial setup and testing,
when entities are created and discarded before any real data is attached.

### 13.2 Audit Trail

Every state-changing operation (create, update, archive, restore, delete) produces an
immutable audit log record:

| Field | Value |
|---|---|
| `audit_id` | UUID |
| `household_id` | Scoped to household |
| `actor_id` | PersonRef of who performed the action |
| `action` | `create` / `update` / `archive` / `restore` / `delete` |
| `entity_type` | e.g. `transaction`, `account`, `budget` |
| `entity_id` | UUID of affected record |
| `before_state` | JSON snapshot of record before change (null for creates) |
| `after_state` | JSON snapshot of record after change (null for deletes) |
| `occurred_at` | DateTime (UTC) |

Audit records are append-only. No UPDATE or DELETE is permitted on the audit table.

### 13.3 Duplicate Detection

Applied to `Transaction` and `RecurringPayment` on save:

```
Duplicate candidate =
    same household_id
    AND same amount (±0.01)
    AND same event_date (±2 days)
    AND same category_id
    AND same transaction_type
    AND same payee
```

On detection: user is shown a warning with the candidate duplicate. Three choices:
- **Proceed** — save as independent record (`duplicate_of = null`)
- **Link** — save with `duplicate_of = <candidate UUID>` (marks this as a known duplicate of the candidate)
- **Cancel** — discard the new entry

Note: `duplicate_of` is intentionally not auto-resolved. A future AI-assisted merge feature
(noted in PRD) will use this field to identify and surface linkable pairs for automated deduplication.

### 13.4 Universal Entity Operations

All entities support the same operation set, exposed uniformly:

| Operation | Description | Available From |
|---|---|---|
| **Create** | New record | EntityPage action bar |
| **Edit** | Modify fields | EntityCard context menu / EntityModal |
| **Duplicate** | Clone with new ID, cleared date | EntityCard context menu |
| **Archive** | Soft-delete | EntityCard context menu |
| **Restore** | Unarchive | Archived filter view |
| **Delete** | Permanent (requires confirmation) | Archived filter view only |
| **Favourite** | Per-person star (sorts to front) | EntityCard star — stored in `entity_preferences` (§13.6) |
| **Visualize / Expand** | Open the universal Viewer seeded with this entity | MiniSparkline expand + ⋮ (§13.5, UX §9) |
| **Bulk multi-select** | Generic `useMultiSelect` + BulkActionBar | Ledger + CategoryTree (FR-E-020) |

### 13.5 Visualization Architecture (Cross-Cutting)

Visualizations are a **first-class architectural concern**, not a UI feature bolted onto
the Dashboard. The visualization layer is a cross-cutting query and filter mechanism that
operates across all entity families. The Dashboard is its primary home, but every module
can surface contextual visualizations using the same shared infrastructure.

**Core principle:** A visualization interaction — clicking a chart segment, changing a
time period, selecting a person — applies a filter to the underlying entity queries and
can navigate across module boundaries. Charts are not static displays; they are
interactive view filters.

#### VisualizationFilter — Shared App-Level State

A single `VisualizationFilter` object is maintained at app level. Changes to it propagate
to all active visualizations simultaneously. It is not per-component state.

```typescript
interface VisualizationFilter {
  time_range: {
    start: Date;
    end: Date;
    preset: 'month' | 'quarter' | 'year' | 'all_time' | 'custom';
  };
  person_ids: UUID[];          // Empty array = household aggregate view
  category_ids: UUID[];        // Empty = all categories; set on chart segment click
  account_ids: UUID[];         // Empty = all accounts
  currency_mode: 'raw' | 'converted';
  display_currency: ISO4217;   // From EntityPerson.display_currency
  transaction_type: 'all' | 'inflow' | 'outflow';
  is_shared_expense: boolean | null;  // null = no filter; true = shared only (used by debt drill-down)

  // Comparison mode — mutually exclusive with standard single-entity filtering
  comparison_mode: 'persons' | 'categories' | null;
  comparison_ids: UUID[];      // Person IDs or Category IDs to compare
  comparison_group_by: 'category' | 'month' | 'quarter' | 'year' | 'payment_method' | null;
}
```

When a user clicks a category segment on a spending chart, `category_ids` is set to that
category's UUID and all active visualizations and module lists re-query with the new
filter. A breadcrumb trail tracks the applied filters so the user can undo them.

#### Drill-Down Pattern (Generalised)

The three-level drill-down defined for budgets (§8) is the **universal pattern** for all
visualizations in the system:

```
Level 1 — Aggregate view       (e.g. all categories, current month)
    ↓ click segment
Level 2 — Filtered entity list (e.g. transactions in that category)
    ↓ click row or sub-segment
Level 3 — Sub-breakdown        (e.g. subcategory split, or single transaction detail)
```

At Level 2, the user is in a module view (Transactions, Accounts, etc.) with the
`VisualizationFilter` applied. The filter is visible as a dismissible filter bar at the
top of the module. Dismissing returns to Level 1.

#### Cross-Module Navigation

Visualization interactions may navigate between modules. When this happens the
`VisualizationFilter` is carried across. Examples:

- Budget donut segment (Budgets module) → Transactions module filtered to that category
  and period
- Account balance bar (Dashboard) → Accounts module filtered to that account
- Debt bar (Dashboard) → Transactions module filtered to `is_shared_expense = true`
  for that person
- Forex loss line (Dashboard) → Transactions module filtered to non-base currencies
  sorted by `fx_delta` descending

Navigation direction is always recorded so the browser back button restores the prior
filter state.

#### Per-Entity Visualization Contracts

Each entity family declares the visualizations it supports and the drill-down targets
available. The UX Specification implements these; this contract defines what must exist.

| Entity Family | Supported Visualizations | Drill-Down Target |
|---|---|---|
| EntityEvents — Transaction | Spending by category (donut), income vs expenses (grouped bar), transaction volume over time (line), forex loss over time (line) | Filtered transaction list → transaction detail |
| EntityEvents — Recurring | Upcoming payments calendar, occurrence history (timeline), missed vs processed (status bar) | Recurring payment detail → linked transactions |
| EntityEvents — Transfer | Transfer flow (sankey or grouped bar by account pair) | Transfer detail |
| EntityAccounts — Bank | Balance over time (area line), inflow vs outflow (stacked bar) | Account transaction history |
| EntityAccounts — Capital | Portfolio value over time (line), asset allocation (donut), return vs cost basis (bar), **capital history per account: inflow/outflow/interest earned over time (stacked area)** | Investment transaction history |
| EntityAccounts — Asset | Valuation history (line), depreciation curve overlay | Asset detail → valuation records |
| EntityAccounts — Insurance | Premium payment history (bar), coverage timeline | Insurance detail → linked recurring payments |
| EntityBudgets | Budget vs actual (progress/bar), variance over time (line), category overspend heatmap, **budget history: limit vs actual trend across past periods (line — monthly or yearly)** | Contributing transactions → subcategory breakdown |
| EntityCurrencies | Spending by currency (stacked bar — raw mode), aggregated total (bar — converted mode), forex loss trend (line) | Currency-filtered transactions |
| EntityDebt | Debt balance over time (line), debt by source — card vs internal (stacked bar), repayment progress (progress bar) | Debt-contributing transactions → transfer repayments |
| EntityPersons (PersonDashboard) | Net worth over time (line), personal vs household spending split (bar), income sources (donut) | Personal filtered views of any module |
| **Comparison — Persons** | Side-by-side spending by category (grouped bar), person spending trend over time (multi-line), shared category breakdown (stacked bar) | Filtered transaction list for selected person |
| **Comparison — Categories** | Category spending trend over time (multi-line), category totals comparison (grouped bar), relative share over time (stacked area %) | Filtered transaction list for selected category |

#### Raw vs Converted Currency Modes

All visualizations support both modes (as specified in §10). The toggle is part of the
`VisualizationFilter` and changes every active chart simultaneously. Raw mode stacks
currency segments with distinct colours; converted mode shows the aggregated base-currency
total. Both modes use `MonetaryValue` data — `currency` + `amount` for raw, `amount_base`
for converted.

#### Visualization Backend Contract

The backend exposes **aggregation endpoints** for each entity family's visualization
contract. These are distinct from the CRUD endpoints — they return pre-aggregated data
optimised for chart rendering. Each aggregation endpoint accepts `VisualizationFilter`
parameters.

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
```

All accept query parameters matching `VisualizationFilter` fields. Responses return
both raw-currency breakdowns and converted totals so the frontend can switch modes
without a second API call.

#### One Universal Viewer + entry points (FR-V-011..015)

The drill-down/filter mechanism above is surfaced through **a single reusable Viewer component**
(UX §9), not per-module chart screens. Every contextual chart is an **entry point** that opens
that one Viewer seeded with the launching context's `VisualizationFilter`:
- **`MiniSparkline`** (UX §9.2) — a card/row atom (account value, currency FX, budget trend);
  click/expand opens the Viewer seeded with that entity.
- **Ledger Visualize** (event-group aggregation, metric = count/sum/avg).
- **Chart drill-down** (click a point/segment) and **View as table**.
- **Dashboard widgets** — a per-person composed grid (`Person.dashboard_layout`), each widget a
  pre-generated *type* bound to data via an optional `scope`, resizable to S/M/L spans, drilling
  into its module or expanding into the Viewer (UX §17).

The aggregation endpoints are read-only (`/api/visualizations/*`); no mutations on these routes.

### 13.6 Per-Person Preferences — `entity_preferences`

Favourites and manual ordering are **per person**, never shared, so two members of one household
each keep their own arrangement of the same entities.

```python
class EntityPreference(Base):
    person_id: UUID             # The person these preferences belong to
    entity_type: str            # e.g. "account", "category", "currency"
    entity_id: UUID             # The entity being favourited / ordered
    is_favourite: bool          # Star — favourites sort to the front
    sort_order: int | None      # Manual drag order (active when "Custom" sort is chosen)
    # UNIQUE (person_id, entity_type, entity_id)
```

This backs the EntityCard **star** and **drag-reorder** (FR-E-021). It is deliberately a thin
join table — not columns on each entity — precisely because the data is per-viewer, not per-entity.

> **Frontend patterns:** See UX §9 for the component library, CLAUDE.md §4-5 for common token/component gotchas.

---

## 14. Naming Conventions

Consistent naming is enforced across the entire codebase. Divergence from these conventions
is a code review failure.

### 14.1 Entity Class Names

| Layer | Convention | Example |
|---|---|---|
| Backend Python model | `PascalCase`, entity prefix | `BankAccount`, `RecurringPayment` |
| Backend service | `snake_case` + `_service` | `account_service.py`, `event_service.py` |
| Backend route file | `snake_case` plural | `accounts.py`, `events.py` |
| Backend schema (Pydantic) | `PascalCase` + `Schema`/`Create`/`Update` | `AccountSchema`, `TransactionCreate` |
| Database table | `snake_case` plural | `accounts`, `financial_events`, `categories` |
| Frontend component | `PascalCase`, entity-specific | `AccountCard`, `TransactionModal` |
| Frontend generic | `PascalCase`, generic + type param | `EntityCard<T>`, `EntityModal<T>` |
| Frontend hook | `camelCase`, `use` prefix | `useEntityManager`, `useAccounts` |
| API endpoint | `kebab-case`, resource-oriented | `/api/accounts`, `/api/events/recurring` |
| CSS class | `kebab-case`, BEM-inspired | `.entity-card`, `.entity-card--archived` |

### 14.2 Field Names

| Context | Convention | Example |
|---|---|---|
| Python model fields | `snake_case` | `created_at`, `account_type`, `amount_base` |
| TypeScript interfaces | `camelCase` | `createdAt`, `accountType`, `amountBase` |
| API JSON keys | `snake_case` | `{"account_type": "bank", "amount_base": 100.00}` |
| Database columns | `snake_case` | `account_type`, `amount_base`, `household_id` |
| CSS custom properties | `--kebab-case` | `--color-primary`, `--color-entity-account` |

### 14.3 Status and Type Enums

All enums use `snake_case` for values:
- `account_type`: `bank`, `credit_card`, `capital`, `asset`, `insurance` (savings accounts use `bank` — see §6.2)
- `event_type`: `transaction`, `recurring_payment`, `transfer`
- `transaction_type`: `inflow`, `outflow`, `transfer`
- `status`: `active`, `inactive`, `archived`
- `household_role`: `owner`, `admin`, `member`
- `category_type`: `income`, `expense`, `both`
- `event_source`: `manual`, `csv_import`, `bank_feed` (FinancialEvent provenance — §7.1; recurring provenance is the `linked_recurring_id` FK, not a source value)
- `snapshot_source`: `manual`, `formula`, `reconciliation`, `appraisal`, `import`, `computed` (§6.2a)
- `invitation_status`: `pending`, `accepted`, `declined`, `expired`, `revoked` (was `cancelled` — §5.1)
- `person_density`: `comfortable`, `compact` (§5)
- `fx_provider_status`: `ok`, `stale`, `down` (§10a)

> **Backend architecture patterns:** See ARCH §5-7 for DI chain, auth flow, CSRF, session management, and error handling. See CLAUDE.md §6 for common backend gotchas.

---

## 15. What This Document Does Not Cover

The following are specified in their respective planning artifacts, which derive from this
document:

- **Brief:** plain-language product vision, target users, success criteria
- **PRD:** user stories, acceptance criteria, non-functional requirements, API endpoint list
- **Architecture:** deployment topology, database schema DDL, sequence diagrams,
  infrastructure configuration
- **UX Specification:** complete UI component library, animation system, accessibility
  compliance, responsive breakpoints, per-screen wireframes
- **Epics:** implementation story breakdown, acceptance criteria, sprint tracking

Sound system, advanced animations, and PWA features are planned as future extensions and
are not specified in this document or any current planning artifact.

---

*This document is version-controlled alongside the codebase. Any change to the entity
hierarchy, base fields, or core patterns requires a version bump and a note in the
revision history below.*

## Revision History

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-05-26 | Ben + Claude | Initial creation — complete entity hierarchy, base patterns, frontend architecture, naming conventions, backend patterns |
| 1.1 | 2026-05-26 | Ben + Claude | MonetaryValue override model; Bank/Savings merged; Asset valuation history; TransactionStatusEnum; is_shared_expense; missed occurrence detection; yearly budgets; multi-currency budget display; budget drill-down; raw vs converted viz modes; EntityDebt derivation clarified; hard deletion for empty entities |
| 1.2 | 2026-05-26 | Ben + Claude | §14 Frontend Patterns: EntityCard/EntityPage/useEntityManager prop interfaces, accent bar inline style rule, surface nesting rule (§14.6), modal headerless pattern, picker focus color two-tier system. |
| 1.3 | 2026-05-26 | Ben + Claude | VisualizationFilter: comparison_mode, comparison_ids, comparison_group_by added. Per-entity visualization contracts: budget history trend, capital history per account, person comparison charts, category comparison charts added. |
| 1.4 | 2026-06-01 | Ben + Claude | §14.5 Token Rules: corrected bg-accent-active usage — it IS the picker panel tab active token (bg-accent-active text-accent, cyan); bg-control-active (indigo) is for navigation tabs only. Added --color-surface-active to backgrounds list. Security table: corrected CSRF from "single-use tokens" to "session-lifetime token". |
| 1.5 | 2026-06-05 | Ben + Claude | §14.3 EntityCardProps: added children prop. §14.4 EntityPageProps: aligned to built interface — title and items now optional; added showFilterBar, actions, children; renderCard third arg (onSelect) documented. §14.3: removed savings from account_type enum (bank covers savings — §6.2). §15.4: replaced ad-hoc error format with reference to ARCH §4.6 RFC 7807 contract. |
| 1.6 | 2026-06-05 | Ben + Claude | §6.1: primary owner rule (one primary per account, ★ prefix in all UI, min 1 owner enforced); account number storage and display rule (full stored, masked ****1234 in read-only, show/hide toggle in modal). §6.2: entity accent colour table per account_type; AccountCard display contract table (left border, header, owner tags, secondary line). |
| 1.7 | 2026-06-08 | Ben + Claude | §14.4: BulkActionBar.customActions prop (ReactNode, renders between count and Archive/Delete); EntityPageProps.bulkCustomActions passthrough. Enables entity-specific bulk ops (e.g. Merge in CategoryPage) without modifying EntityPage logic. |
| 1.8 | 2026-06-08 | Ben + Claude | §14.8: Design System page policy — no synthetic demos; every story shipping a reusable component must add a real demo to /design-system as part of Done. |
| 1.9 | 2026-06-08 | Ben + Claude | Removed §14 Frontend Patterns (duplicates UX §9) and §16 Backend Architecture Patterns (duplicates ARCH §5-7). Added cross-references to UX and ARCH. Document now contains only entity definitions (§1-13), naming conventions (§14), and scope boundaries (§15). |
| 2.0 | 2026-06-11 | Ben + Claude | **Reconciliation rebuild to architecture v4 / PRD v3.1.** Authority reframed (EDP = philosophy; ARCH §3 authoritative for DDL). **Fixed contradiction:** category archive now archives the whole branch (no auto-promote, FR-C-005). Dropped stale `month_year`, `balance`/`current_value` columns (current value computed — opening_balance + ledger, or latest snapshot). `ValuationRecord` → generalized **`AccountSnapshot`** (§6.2a, all account types, broadened source enum). Removed `RecurringConfig`/`recurring_configs` — account recurrence now spawns a linked `RecurringPayment` (FR-A-017). Colour-forward identity folded in: per-instance `Account.colour`/`Currency.colour`/`Person.colour`, theme/font/density/reduce_motion/notification_prefs/dashboard_layout on `persons`; PersonRef avatar-first + colour fallback. MonetaryValue `fx_rate` aligned to `rate_to_base` + persisted `fx_rate_used`/`fx_rate_date` (FR-E-009); event `source`/`external_ref` (FR-E-001). New entities: **`FxProvider`** per-currency fallback chain (§10a, FR-CU-010), **`entity_preferences`** per-person favourite+sort (§13.6, FR-E-021). Invitation `cancelled`→`revoked`, 7-day expiry; owner re-create gated by approved_owners. Universal Viewer + MiniSparkline + dashboard widget composition folded into §13.5. New enums registered (§14.3). Removed stale SavingsAccount from the hierarchy tree. |
