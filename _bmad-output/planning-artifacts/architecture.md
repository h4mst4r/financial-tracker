---
title: Financial Tracker — Architecture
version: 2.0
status: living
created: 2026-05-26
authority: Technical architecture specification. Derives from entity-design-philosophy.md.
           Feature requirements live in prd.md. UI component specs live in ux-design-specification.md.
---

# Financial Tracker — Architecture

> **Design authority:** Entity definitions, field names, inheritance rules, naming
> conventions, and cross-cutting patterns are specified in `entity-design-philosophy.md`.
> This document specifies *how the system is built* — topology, schema, services, APIs,
> security, scheduling, and testing. When conflict exists, `entity-design-philosophy.md`
> wins on entity matters; this document wins on infrastructure matters.

---

## 0. Preamble

This document is written for developers implementing Financial Tracker v2. It assumes
familiarity with `entity-design-philosophy.md`. Sections reference the philosophy document
as `[EDP §N]` throughout.

---

## 1. Technology Stack

### 1.1 Backend

| Concern | Technology | Version | Rationale |
|---|---|---|---|
| Language | Python | 3.12+ | Ecosystem, team familiarity |
| Web framework | FastAPI | 0.115+ | Async, auto OpenAPI, Pydantic-native |
| ORM | SQLAlchemy | 2.0+ | Typed mapped columns, async support |
| Schema validation | Pydantic | 2.0+ | Co-native with FastAPI, strict typing |
| Database | SQLite (WAL) | 3.45+ | Zero cost, sufficient for 2–4 users |
| Scheduler | APScheduler | 3.10+ | In-process scheduler, persisted jobs |
| Auth library | Authlib | 1.3+ | Google OAuth 2.0 PKCE flow |
| HTTP client | httpx | 0.27+ | Async, used for FX API + OAuth |
| Migrations | Alembic | 1.13+ | SQLAlchemy-integrated schema migrations |
| Testing | pytest + pytest-asyncio | latest | Async test support |
| E2E testing | Playwright | latest | Browser automation |
| Security scan | bandit | latest | Static analysis for security issues |
| Containerisation | Docker | latest | Local dev + Cloud Run deployment |

### 1.2 Frontend

| Concern | Technology | Version | Rationale |
|---|---|---|---|
| Language | TypeScript | 5.4+ | Type safety across entity hierarchy |
| Framework | React | 18+ | Component model, ecosystem |
| Build tool | Vite | 5+ | Fast HMR, ESM-native |
| Styling | Tailwind CSS v4 | 4.0+ | CSS-variable theme via `@theme {}` in `index.css`; shared component patterns via `@utility {}` blocks; no `tailwind.config.ts` (v4 config-in-CSS model) |
| Charts | Recharts | 2.12+ | React-native, composable, animatable |
| Routing | React Router | 6+ | Declarative, nested route support |
| State management | Zustand | 4+ | Lightweight, VisualizationFilter global store |
| HTTP client | TanStack Query | 5+ | Cache, background refetch, mutation state |
| Form handling | React Hook Form | 7+ | Performant, Zod-integrated |
| Schema validation | Zod | 3+ | Runtime type safety mirroring Pydantic schemas |
| Icons | Lucide React | latest | Consistent, tree-shakeable |
| Date handling | date-fns | 3+ | Locale-aware, tree-shakeable |
| Testing | Vitest + RTL | latest | Component and hook testing |

### 1.3 Infrastructure

| Concern | Technology | Rationale |
|---|---|---|
| Hosting | Google Cloud Run | Serverless, zero idle cost, integrates with Google OAuth |
| Container registry | Google Artifact Registry | Private image storage |
| Backup storage | Google Cloud Storage | Daily SQLite snapshots, lifecycle policies |
| Secrets | Google Secret Manager | API keys, session secret — never in code |
| FX rates | ExchangeRate-API (free tier) | 1,500 req/month free; daily fetch = 30/month |
| CI/CD | GitHub Actions | Build, test, deploy on push to main |

---

## 2. System Topology

```
                         ┌─────────────────────────────┐
                         │       Google Cloud Run       │
                         │                             │
  Browser ──HTTPS──────► │  ┌─────────┐  ┌──────────┐ │
                         │  │  React  │  │ FastAPI  │ │
                         │  │  SPA    │  │ Backend  │ │
                         │  │ (Vite)  │  │          │ │
                         │  └─────────┘  └────┬─────┘ │
                         │                    │        │
                         │              ┌─────▼──────┐ │
                         │              │  SQLite DB  │ │
                         │              │  (WAL mode) │ │
                         │              └─────────────┘ │
                         └──────────────────┬────────────┘
                                            │
              ┌─────────────────────────────┼──────────────────────┐
              │                             │                      │
              ▼                             ▼                      ▼
   Google OAuth 2.0              ExchangeRate-API         Google Cloud Storage
   (Authentication)              (FX rates — daily)       (Daily DB backups)
```

**Deployment notes:**
- React SPA is served as static files from the FastAPI process (mounted via StaticFiles).
  Single container, single port, single Cloud Run service.
- SQLite database is stored on the container's ephemeral filesystem during runtime.
  A startup hook restores from GCS on cold start if the file is absent.
- Cloud Run minimum instances: 0 (scale to zero). APScheduler keepalive mechanism
  prevents scheduler loss on idle (see §9.6).
- All secrets injected via Google Secret Manager at runtime — never in environment files
  or Dockerfiles.

---

## 3. Application Structure

### 3.1 Backend Directory Tree

```
backend/
├── main.py                    # FastAPI app factory, middleware registration
├── database.py                # SQLAlchemy engine, session factory, BaseEntity
├── config.py                  # Settings (pydantic-settings, reads Secret Manager)
├── dependencies.py            # FastAPI dependency injection (session, current_user, household)
│
├── models/                    # SQLAlchemy mapped models (one file per entity family)
│   ├── base.py                # BaseEntity abstract class, MonetaryValueMixin
│   ├── household.py           # Household
│   ├── person.py              # Person, HouseholdInvitation
│   ├── account.py             # Account (STI), AccountOwner, ValuationRecord, RecurringConfig
│   ├── event.py               # FinancialEvent (STI), RecurrenceRule, OccurrenceRecord
│   ├── budget.py              # Budget
│   ├── category.py            # Category
│   ├── currency.py            # Currency, FxRateHistory
│   ├── formula.py             # Formula
│   ├── audit.py               # AuditLog
│   └── alert.py               # Alert
│
├── schemas/                   # Pydantic schemas (request/response contracts)
│   ├── common.py              # MonetaryValueSchema, PersonRefSchema, PaginationSchema
│   ├── household.py
│   ├── person.py
│   ├── account.py
│   ├── event.py
│   ├── budget.py
│   ├── category.py
│   ├── currency.py
│   ├── formula.py
│   └── visualization.py       # VisualizationFilter, aggregation response schemas
│
├── services/                  # Business logic layer (one file per domain)
│   ├── household_service.py
│   ├── person_service.py
│   ├── account_service.py
│   ├── event_service.py
│   ├── budget_service.py
│   ├── category_service.py
│   ├── currency_service.py
│   ├── formula_service.py
│   ├── computation_service.py # EntityDebt, net worth, budget actuals
│   ├── visualization_service.py # Aggregation queries for all chart endpoints
│   ├── scheduler_service.py   # APScheduler setup and job registration
│   ├── import_export_service.py
│   ├── audit_service.py
│   ├── alert_service.py
│   └── backup_service.py
│
├── routes/                    # FastAPI routers (thin — call services, format responses)
│   ├── auth.py                # /auth/login, /auth/callback, /auth/logout
│   ├── household.py
│   ├── persons.py
│   ├── accounts.py
│   ├── events.py
│   ├── budgets.py
│   ├── categories.py
│   ├── currencies.py
│   ├── formulas.py
│   ├── visualizations.py      # All /api/visualizations/* endpoints
│   └── import_export.py
│
├── middleware/
│   ├── auth_middleware.py     # Session validation on every request
│   ├── household_middleware.py # Household scoping enforcement
│   └── csrf_middleware.py
│
├── scheduler/
│   ├── jobs/
│   │   ├── recurring_payment_job.py
│   │   ├── fx_rate_job.py
│   │   ├── budget_rollover_job.py
│   │   ├── alert_generation_job.py
│   │   └── backup_job.py
│   └── registry.py            # Job registration and scheduler lifecycle
│
├── migrations/                # Alembic migrations
│   ├── env.py
│   └── versions/
│
└── tests/
    ├── unit/
    │   ├── test_account_service.py
    │   ├── test_event_service.py
    │   ├── test_computation_service.py
    │   ├── test_recurring_date_parser.py
    │   └── test_visualization_service.py
    ├── integration/
    │   ├── test_accounts_api.py
    │   ├── test_events_api.py
    │   └── test_auth_api.py
    └── e2e/
        ├── test_transaction_entry.py
        ├── test_csv_import.py
        └── test_recurring_payment.py
```

### 3.2 Frontend Directory Tree

```
frontend/
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
│
└── src/
    ├── main.tsx               # App entry point
    ├── App.tsx                # Root — router, global providers
    │
    ├── api/                   # TanStack Query hooks (one file per entity family)
    │   ├── client.ts          # Axios/fetch base client, error interceptor
    │   ├── useAccounts.ts
    │   ├── useEvents.ts
    │   ├── useBudgets.ts
    │   ├── useCategories.ts
    │   ├── useCurrencies.ts
    │   ├── usePersons.ts
    │   └── useVisualizations.ts
    │
    ├── store/                 # Zustand stores
    │   ├── visualizationStore.ts  # VisualizationFilter global state
    │   ├── authStore.ts           # Current user, household
    │   └── alertStore.ts          # In-app alert queue
    │
    ├── hooks/                 # Generic hooks
    │   ├── useEntityManager.ts    # [EDP §14.2] — generic CRUD + lifecycle
    │   ├── useVisualizationFilter.ts  # Read/write VisualizationFilter from store
    │   └── useTheme.ts            # Theme token access
    │
    ├── components/
    │   ├── entity/            # Generic entity components [EDP §14]
    │   │   ├── EntityCard.tsx
    │   │   ├── EntityModal.tsx
    │   │   └── EntityPage.tsx
    │   │
    │   ├── ui/                # Design system primitives (Layer 2 — see UX Spec)
    │   │   ├── Button.tsx
    │   │   ├── Input.tsx
    │   │   ├── MonetaryValue.tsx  # [EDP §3.2]
    │   │   ├── PersonRef.tsx      # [EDP §3.3]
    │   │   ├── StatusBadge.tsx
    │   │   ├── Modal.tsx
    │   │   ├── Drawer.tsx
    │   │   ├── Toast.tsx
    │   │   └── ...            # Full inventory in ux-design-specification.md
    │   │
    │   ├── visualization/     # Chart components
    │   │   ├── VisualizationFilterBar.tsx  # Shared filter controls
    │   │   ├── CurrencyModeToggle.tsx
    │   │   ├── SpendingByCategoryChart.tsx
    │   │   ├── IncomeVsExpensesChart.tsx
    │   │   ├── NetWorthChart.tsx
    │   │   ├── BudgetVsActualChart.tsx
    │   │   ├── DebtSummaryChart.tsx
    │   │   ├── ForexLossTrendChart.tsx
    │   │   ├── AccountBalanceChart.tsx
    │   │   ├── AssetValuationChart.tsx
    │   │   └── PortfolioValueChart.tsx
    │   │
    │   └── layout/
    │       ├── AppShell.tsx       # Sidebar + topbar wrapper
    │       ├── Sidebar.tsx
    │       ├── Topbar.tsx
    │       └── PersonDashboardFilter.tsx
    │
    ├── pages/                 # Route-level page components
    │   ├── Dashboard.tsx
    │   ├── Accounts.tsx
    │   ├── Capital.tsx
    │   ├── Assets.tsx
    │   ├── Insurance.tsx
    │   ├── Transactions.tsx
    │   ├── RecurringPayments.tsx
    │   ├── Transfers.tsx
    │   ├── Budgets.tsx
    │   ├── Categories.tsx
    │   └── Settings.tsx
    │
    ├── types/                 # TypeScript interfaces mirroring Pydantic schemas
    │   ├── entities.ts        # BaseEntity, MonetaryValue, PersonRef, StatusEnum
    │   ├── account.ts
    │   ├── event.ts
    │   ├── budget.ts
    │   ├── category.ts
    │   ├── currency.ts
    │   ├── person.ts
    │   └── visualization.ts   # VisualizationFilter, aggregation response types
    │
    └── utils/
        ├── currency.ts        # MonetaryValue formatting, raw/converted helpers
        ├── date.ts            # date-fns wrappers, RecurrenceRule helpers
        └── validation.ts      # Zod schemas mirroring backend Pydantic schemas
```

---

## 4. Database Architecture

### 4.1 Design Decisions

**Single-table inheritance (STI) for polymorphic entities:**
`accounts` and `financial_events` use STI — one table per entity family with a `type`
discriminator column. Subtype-specific fields are nullable. This avoids join overhead on
the most-queried tables and simplifies queries. Subtype fields that require their own
relationships (e.g. `ValuationRecord` for assets) use child tables.

**MonetaryValue as column group (mixin):**
Rather than a separate `monetary_values` table, the seven monetary value fields are
inlined on every table that holds financial amounts. The `MonetaryValueMixin` SQLAlchemy
mixin adds them with consistent naming. This eliminates joins on the hot path.

**Audit log as append-only table:**
No foreign keys from `audit_log` to entity tables — UUIDs are stored as strings.
This ensures audit entries survive entity deletion. No cascade, no referential integrity
enforcement on the audit table.

**SQLite WAL mode:**
`PRAGMA journal_mode=WAL` is set on every connection open. WAL allows concurrent readers
alongside a single writer — sufficient for 2–4 simultaneous users.

### 4.2 MonetaryValue Column Mixin

```python
# models/base.py

class MonetaryValueMixin:
    """
    Inline monetary value block. [EDP §3.2]
    Apply to any model that holds a financial amount.
    Column names use the provided prefix (default: empty).
    Usage: class Transaction(MonetaryValueMixin("mv_"), BaseEntity, Base): ...
    """
    currency:               Mapped[str]     = mapped_column(String(3), nullable=False)
    amount:                 Mapped[Decimal] = mapped_column(Numeric(15, 4), nullable=False)
    fx_rate:                Mapped[Decimal] = mapped_column(Numeric(10, 6), nullable=False, default=Decimal("1.0"))
    amount_base_calculated: Mapped[Decimal] = mapped_column(Numeric(15, 4), nullable=False)
    amount_base:            Mapped[Decimal] = mapped_column(Numeric(15, 4), nullable=False)
    fx_delta:               Mapped[Decimal] = mapped_column(Numeric(15, 4), nullable=False, default=Decimal("0"))
    fee_amount:             Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 4), nullable=True)

    @validates("amount_base")
    def recompute_fx_delta(self, key, value):
        """Auto-recompute fx_delta when amount_base is set."""
        if self.amount_base_calculated is not None:
            self.fx_delta = self.amount_base_calculated - value
        return value
```

### 4.3 BaseEntity Abstract Model

```python
# models/base.py

class BaseEntity(DeclarativeBase):
    __abstract__ = True

    id:           Mapped[UUID]           = mapped_column(primary_key=True, default=uuid4)
    household_id: Mapped[UUID]           = mapped_column(ForeignKey("households.id"), nullable=False, index=True)
    created_at:   Mapped[datetime]       = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at:   Mapped[datetime]       = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    created_by:   Mapped[UUID]           = mapped_column(ForeignKey("persons.id"), nullable=False)
    updated_by:   Mapped[Optional[UUID]] = mapped_column(ForeignKey("persons.id"), nullable=True)
    archived:     Mapped[bool]           = mapped_column(Boolean, default=False, index=True)
    archived_at:  Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    archived_by:  Mapped[Optional[UUID]] = mapped_column(ForeignKey("persons.id"), nullable=True)
    status:       Mapped[str]            = mapped_column(String(20), default="active", index=True)
    # status values: "active" | "inactive" | "archived"  [EDP §3.4]
```

### 4.4 Core Table Schemas

```python
# models/household.py

class Household(Base):
    __tablename__ = "households"
    id:            Mapped[UUID]     = mapped_column(primary_key=True, default=uuid4)
    name:          Mapped[str]      = mapped_column(String(200), nullable=False)
    base_currency: Mapped[str]      = mapped_column(String(3), nullable=False, default="SGD")
    timezone:      Mapped[str]      = mapped_column(String(50), nullable=False, default="Asia/Singapore")
    created_at:    Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    created_by:    Mapped[UUID]     = mapped_column(nullable=False)  # Person UUID — no FK (bootstrap)

    persons:    Mapped[List["Person"]]   = relationship(back_populates="household")
    categories: Mapped[List["Category"]] = relationship(back_populates="household")
    currencies: Mapped[List["Currency"]] = relationship(back_populates="household")


# models/person.py

class Person(BaseEntity):
    __tablename__ = "persons"
    email:            Mapped[str]           = mapped_column(String(320), nullable=False, unique=True, index=True)
    display_name:     Mapped[str]           = mapped_column(String(200), nullable=False)
    picture_url:      Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    role:             Mapped[str]           = mapped_column(String(20), nullable=False, default="member")
    # role values: "owner" | "admin" | "member"
    display_currency: Mapped[str]           = mapped_column(String(3), nullable=False, default="SGD")
    joined_at:        Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=utcnow)
    last_active_at:   Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    google_sub:       Mapped[str]           = mapped_column(String(200), nullable=False, unique=True, index=True)
    # google_sub: Google OAuth subject identifier

    household: Mapped["Household"] = relationship(back_populates="persons")

    __table_args__ = (
        Index("ix_persons_household_email", "household_id", "email"),
    )


class HouseholdInvitation(Base):
    __tablename__ = "household_invitations"
    id:           Mapped[UUID]           = mapped_column(primary_key=True, default=uuid4)
    household_id: Mapped[UUID]           = mapped_column(ForeignKey("households.id"), nullable=False)
    invited_email:Mapped[str]            = mapped_column(String(320), nullable=False)
    invited_by:   Mapped[UUID]           = mapped_column(ForeignKey("persons.id"), nullable=False)
    created_at:   Mapped[datetime]       = mapped_column(DateTime(timezone=True), default=utcnow)
    accepted_at:  Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at:   Mapped[datetime]       = mapped_column(DateTime(timezone=True), nullable=False)
    status:       Mapped[str]            = mapped_column(String(20), default="pending")
    # status: "pending" | "accepted" | "expired" | "cancelled"


# models/account.py

class Account(MonetaryValueMixin, BaseEntity):
    """
    Single-table inheritance for all account subtypes. [EDP §6]
    account_type discriminates between subtypes.
    Subtype-specific fields are nullable.
    """
    __tablename__ = "accounts"

    # Base fields [EDP §6.1]
    name:              Mapped[str]           = mapped_column(String(200), nullable=False)
    account_type:      Mapped[str]           = mapped_column(String(30), nullable=False, index=True)
    # account_type: "bank" | "credit_card" | "capital" | "asset" | "insurance"
    institution:       Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    month_year:        Mapped[Optional[str]] = mapped_column(String(7), nullable=True)  # "YYYY-MM"
    notes:             Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # MonetaryValue fields (balance) — from mixin; column names: currency, amount, etc.

    # BankAccount fields [EDP §6.2]
    account_number:    Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # masked
    interest_rate:     Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 4), nullable=True)
    interest_frequency:Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # CreditCard fields [EDP §6.2]
    credit_limit:      Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 4), nullable=True)
    billing_day:       Mapped[Optional[int]]     = mapped_column(Integer, nullable=True)
    due_day:           Mapped[Optional[int]]     = mapped_column(Integer, nullable=True)
    reward_points:     Mapped[Optional[int]]     = mapped_column(Integer, nullable=True)
    annual_fee:        Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)

    # CapitalAccount fields [EDP §6.2]
    investment_type:   Mapped[Optional[str]]     = mapped_column(String(30), nullable=True)
    # investment_type: "stock" | "bond" | "fund" | "cpf" | "fixed_deposit"
    cost_basis:        Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 4), nullable=True)
    current_value:     Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 4), nullable=True)

    # AssetAccount fields [EDP §6.2]
    asset_type:        Mapped[Optional[str]]     = mapped_column(String(30), nullable=True)
    # asset_type: "property" | "vehicle" | "other"
    purchase_date:     Mapped[Optional[date]]    = mapped_column(Date, nullable=True)
    purchase_value:    Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 4), nullable=True)
    depreciation_formula_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("formulas.id"), nullable=True)

    # InsuranceAccount fields [EDP §6.2]
    policy_type:       Mapped[Optional[str]]     = mapped_column(String(50), nullable=True)
    coverage_types:    Mapped[Optional[str]]     = mapped_column(Text, nullable=True)  # JSON array
    premium_frequency: Mapped[Optional[str]]     = mapped_column(String(20), nullable=True)
    coverage_amount:   Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 4), nullable=True)
    insurer:           Mapped[Optional[str]]     = mapped_column(String(200), nullable=True)

    # Relationships
    owners:             Mapped[List["AccountOwner"]]    = relationship(back_populates="account", cascade="all, delete-orphan")
    valuation_records:  Mapped[List["ValuationRecord"]] = relationship(back_populates="account", cascade="all, delete-orphan")
    recurring_config:   Mapped[Optional["RecurringConfig"]] = relationship(back_populates="account", uselist=False)

    __table_args__ = (
        Index("ix_accounts_household_type", "household_id", "account_type"),
    )


class AccountOwner(Base):
    """Many-to-many between Account and Person. [EDP §6.1]"""
    __tablename__ = "account_owners"
    account_id: Mapped[UUID] = mapped_column(ForeignKey("accounts.id"), primary_key=True)
    person_id:  Mapped[UUID] = mapped_column(ForeignKey("persons.id"), primary_key=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    added_at:   Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    account: Mapped["Account"] = relationship(back_populates="owners")
    person:  Mapped["Person"]  = relationship()


class ValuationRecord(BaseEntity):
    """Asset valuation history. [EDP §6.2]"""
    __tablename__ = "valuation_records"
    asset_id:        Mapped[UUID]           = mapped_column(ForeignKey("accounts.id"), nullable=False, index=True)
    valuation_date:  Mapped[date]           = mapped_column(Date, nullable=False)
    value:           Mapped[Decimal]        = mapped_column(Numeric(15, 4), nullable=False)
    value_currency:  Mapped[str]            = mapped_column(String(3), nullable=False)
    value_base:      Mapped[Decimal]        = mapped_column(Numeric(15, 4), nullable=False)
    source:          Mapped[str]            = mapped_column(String(50), nullable=False)
    # source: "manual" | "market_appraisal" | "depreciation_formula"
    formula_id:      Mapped[Optional[UUID]] = mapped_column(ForeignKey("formulas.id"), nullable=True)
    notes:           Mapped[Optional[str]]  = mapped_column(Text, nullable=True)

    account: Mapped["Account"] = relationship(back_populates="valuation_records")

    __table_args__ = (
        Index("ix_valuations_asset_date", "asset_id", "valuation_date"),
    )


class RecurringConfig(BaseEntity):
    """Recurring payment configuration for RecurringEventSource accounts. [EDP §6.4]"""
    __tablename__ = "recurring_configs"
    account_id:         Mapped[UUID]           = mapped_column(ForeignKey("accounts.id"), nullable=False, unique=True)
    enabled:            Mapped[bool]           = mapped_column(Boolean, default=True)
    frequency_text:     Mapped[str]            = mapped_column(String(200), nullable=False)
    frequency_rule:     Mapped[str]            = mapped_column(Text, nullable=False)  # JSON RecurrenceRule
    next_occurrence:    Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    payment_method:     Mapped[Optional[str]]  = mapped_column(String(100), nullable=True)
    payee_person_id:    Mapped[Optional[UUID]] = mapped_column(ForeignKey("persons.id"), nullable=True)
    category_id:        Mapped[Optional[UUID]] = mapped_column(ForeignKey("categories.id"), nullable=True)
    amount_override:    Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 4), nullable=True)
    currency_override:  Mapped[Optional[str]]    = mapped_column(String(3), nullable=True)

    account: Mapped["Account"] = relationship(back_populates="recurring_config")


# models/event.py

class FinancialEvent(MonetaryValueMixin, BaseEntity):
    """
    Single-table inheritance for all event subtypes. [EDP §7]
    event_type discriminates between subtypes.
    """
    __tablename__ = "financial_events"

    # BaseFinancialEvent fields [EDP §7.1]
    name:               Mapped[str]           = mapped_column(String(300), nullable=False)
    event_date:         Mapped[date]          = mapped_column(Date, nullable=False, index=True)
    event_type:         Mapped[str]           = mapped_column(String(30), nullable=False, index=True)
    # event_type: "transaction" | "recurring_payment" | "transfer"
    transaction_status: Mapped[str]           = mapped_column(String(20), nullable=False, default="completed")
    # transaction_status: "pending" | "completed" | "cancelled" | "reconciled"  [EDP §7.1]
    payee_person_id:    Mapped[Optional[UUID]]= mapped_column(ForeignKey("persons.id"), nullable=True, index=True)
    payment_method:     Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    category_id:        Mapped[Optional[UUID]]= mapped_column(ForeignKey("categories.id"), nullable=True, index=True)
    transaction_type:   Mapped[str]           = mapped_column(String(20), nullable=False)
    # transaction_type: "inflow" | "outflow" | "transfer"
    is_shared_expense:  Mapped[bool]          = mapped_column(Boolean, default=False, index=True)
    # is_shared_expense only valid when transaction_type = "outflow" [EDP §7.1]
    notes:              Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_gst_claimable:   Mapped[bool]          = mapped_column(Boolean, default=False)
    is_gift:            Mapped[bool]          = mapped_column(Boolean, default=False)
    source_account_id:  Mapped[Optional[UUID]]= mapped_column(ForeignKey("accounts.id"), nullable=True, index=True)
    linked_recurring_id:Mapped[Optional[UUID]]= mapped_column(ForeignKey("financial_events.id"), nullable=True)
    # MonetaryValue fields from mixin

    # Transaction fields [EDP §7.2]
    reconciled:    Mapped[bool]           = mapped_column(Boolean, default=False)
    reconciled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    duplicate_of:  Mapped[Optional[UUID]] = mapped_column(ForeignKey("financial_events.id"), nullable=True)

    # RecurringPayment fields [EDP §7.3]
    frequency_text:          Mapped[Optional[str]]  = mapped_column(String(200), nullable=True)
    frequency_rule:          Mapped[Optional[str]]  = mapped_column(Text, nullable=True)  # JSON
    next_occurrence:         Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    recurrence_start_date:   Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    recurrence_end_date:     Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    source_entity_type:      Mapped[Optional[str]]  = mapped_column(String(30), nullable=True)
    # source_entity_type: "recurring_payment" | "capital" | "asset" | "insurance"
    source_entity_id:        Mapped[Optional[UUID]] = mapped_column(nullable=True)
    occurrences_generated:   Mapped[int]            = mapped_column(Integer, default=0)
    last_processed_at:       Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Transfer fields [EDP §7.4]
    destination_account_id:    Mapped[Optional[UUID]]    = mapped_column(ForeignKey("accounts.id"), nullable=True)
    dest_currency:             Mapped[Optional[str]]     = mapped_column(String(3), nullable=True)
    dest_amount:               Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 4), nullable=True)
    dest_amount_base:          Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 4), nullable=True)
    is_debt_repayment:         Mapped[bool]              = mapped_column(Boolean, default=False)
    debt_cleared_amount:       Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 4), nullable=True)

    __table_args__ = (
        Index("ix_events_household_date",     "household_id", "event_date"),
        Index("ix_events_household_category", "household_id", "category_id"),
        Index("ix_events_household_payee",    "household_id", "payee_person_id"),
        Index("ix_events_shared_expense",     "household_id", "is_shared_expense", "transaction_type"),
        CheckConstraint(
            "(is_shared_expense = 0) OR (transaction_type = 'outflow')",
            name="ck_shared_expense_outflow_only"
        ),
    )


class OccurrenceRecord(Base):
    """Tracks each expected occurrence of a RecurringPayment. [EDP §7.3]"""
    __tablename__ = "occurrence_records"
    id:                  Mapped[UUID]           = mapped_column(primary_key=True, default=uuid4)
    recurring_event_id:  Mapped[UUID]           = mapped_column(ForeignKey("financial_events.id"), nullable=False, index=True)
    expected_date:       Mapped[date]           = mapped_column(Date, nullable=False)
    occurrence_status:   Mapped[str]            = mapped_column(String(20), nullable=False, default="upcoming")
    # occurrence_status: "upcoming" | "processed" | "skipped" | "missed" | "failed"
    generated_event_id:  Mapped[Optional[UUID]] = mapped_column(ForeignKey("financial_events.id"), nullable=True)
    processed_at:        Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    notes:               Mapped[Optional[str]]  = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("ix_occurrences_recurring_date", "recurring_event_id", "expected_date"),
    )


# models/budget.py

class Budget(BaseEntity):
    """[EDP §8]"""
    __tablename__ = "budgets"
    name:               Mapped[str]           = mapped_column(String(200), nullable=False)
    category_id:        Mapped[UUID]          = mapped_column(ForeignKey("categories.id"), nullable=False, index=True)
    owner_person_id:    Mapped[Optional[UUID]]= mapped_column(ForeignKey("persons.id"), nullable=True, index=True)
    # null owner = household-wide budget
    period_type:        Mapped[str]           = mapped_column(String(10), nullable=False, default="monthly")
    # period_type: "monthly" | "yearly"
    limit_currency:     Mapped[str]           = mapped_column(String(3), nullable=False)
    limit_amount:       Mapped[Decimal]       = mapped_column(Numeric(15, 4), nullable=False)
    limit_amount_base:  Mapped[Decimal]       = mapped_column(Numeric(15, 4), nullable=False)
    period_start:       Mapped[date]          = mapped_column(Date, nullable=False)
    period_end:         Mapped[date]          = mapped_column(Date, nullable=False)
    alert_threshold_pct:Mapped[int]           = mapped_column(Integer, default=80)
    rollover:           Mapped[bool]          = mapped_column(Boolean, default=False)
    # actual_spent and variance are computed at query time — not stored [EDP §8]

    __table_args__ = (
        Index("ix_budgets_household_period", "household_id", "period_start", "period_end"),
        Index("ix_budgets_category_period",  "category_id", "period_start"),
    )


# models/category.py

class Category(BaseEntity):
    """[EDP §9]"""
    __tablename__ = "categories"
    name:          Mapped[str]           = mapped_column(String(100), nullable=False)
    color:         Mapped[Optional[str]] = mapped_column(String(7), nullable=True)   # hex e.g. "#4CAF50"
    icon:          Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # emoji or icon key
    category_type: Mapped[str]           = mapped_column(String(10), nullable=False, default="expense")
    # category_type: "income" | "expense" | "both"
    parent_id:     Mapped[Optional[UUID]]= mapped_column(ForeignKey("categories.id"), nullable=True, index=True)
    depth:         Mapped[int]           = mapped_column(Integer, nullable=False, default=0)
    # depth: 0 = top-level, 1 = subcategory; max 2 levels enforced in service layer

    children: Mapped[List["Category"]] = relationship(
        "Category", back_populates="parent", foreign_keys=[parent_id]
    )
    parent: Mapped[Optional["Category"]] = relationship(
        "Category", back_populates="children", remote_side="Category.id"
    )

    __table_args__ = (
        Index("ix_categories_household_parent", "household_id", "parent_id"),
        CheckConstraint("depth <= 1", name="ck_category_max_depth"),
    )


# models/currency.py

class Currency(Base):
    """[EDP §10]"""
    __tablename__ = "currencies"
    id:                 Mapped[UUID]           = mapped_column(primary_key=True, default=uuid4)
    household_id:       Mapped[UUID]           = mapped_column(ForeignKey("households.id"), nullable=False, index=True)
    code:               Mapped[str]            = mapped_column(String(3), nullable=False)
    name:               Mapped[str]            = mapped_column(String(100), nullable=False)
    symbol:             Mapped[str]            = mapped_column(String(5), nullable=False)
    is_base:            Mapped[bool]           = mapped_column(Boolean, default=False)
    is_display_active:  Mapped[bool]           = mapped_column(Boolean, default=False)
    last_rate_at:       Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    rate_to_base:       Mapped[Decimal]        = mapped_column(Numeric(10, 6), nullable=False, default=Decimal("1.0"))
    rate_source:        Mapped[Optional[str]]  = mapped_column(String(100), nullable=True)
    fee_pct:            Mapped[Decimal]        = mapped_column(Numeric(6, 4), nullable=False, default=Decimal("0"))

    fx_history: Mapped[List["FxRateHistory"]] = relationship(back_populates="currency")

    __table_args__ = (
        UniqueConstraint("household_id", "code", name="uq_currency_household_code"),
    )


class FxRateHistory(Base):
    """Daily FX rate log. Used for historical amount_base recalculation. [EDP §10]"""
    __tablename__ = "fx_rate_history"
    id:           Mapped[UUID]    = mapped_column(primary_key=True, default=uuid4)
    currency_id:  Mapped[UUID]    = mapped_column(ForeignKey("currencies.id"), nullable=False, index=True)
    rate_date:    Mapped[date]    = mapped_column(Date, nullable=False)
    rate_to_base: Mapped[Decimal] = mapped_column(Numeric(10, 6), nullable=False)
    source:       Mapped[str]     = mapped_column(String(100), nullable=False)
    fetched_at:   Mapped[datetime]= mapped_column(DateTime(timezone=True), default=utcnow)

    currency: Mapped["Currency"] = relationship(back_populates="fx_history")

    __table_args__ = (
        UniqueConstraint("currency_id", "rate_date", name="uq_fx_rate_currency_date"),
    )


# models/audit.py

class AuditLog(Base):
    """Append-only audit trail. [EDP §13.2] No FK constraints — survives entity deletion."""
    __tablename__ = "audit_log"
    id:           Mapped[UUID]    = mapped_column(primary_key=True, default=uuid4)
    household_id: Mapped[UUID]    = mapped_column(nullable=False, index=True)
    actor_id:     Mapped[UUID]    = mapped_column(nullable=False, index=True)
    action:       Mapped[str]     = mapped_column(String(20), nullable=False)
    # action: "create" | "update" | "archive" | "restore" | "delete"
    entity_type:  Mapped[str]     = mapped_column(String(50), nullable=False)
    entity_id:    Mapped[UUID]    = mapped_column(nullable=False, index=True)
    before_state: Mapped[Optional[str]] = mapped_column(Text, nullable=True)   # JSON
    after_state:  Mapped[Optional[str]] = mapped_column(Text, nullable=True)   # JSON
    occurred_at:  Mapped[datetime]= mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    ip_address:   Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    user_agent:   Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
```

### 4.5 Key Indexes Summary

| Table | Index | Purpose |
|---|---|---|
| `persons` | `(household_id, email)` | Login lookup |
| `accounts` | `(household_id, account_type)` | Module page queries |
| `financial_events` | `(household_id, event_date)` | Date-range queries (most common) |
| `financial_events` | `(household_id, category_id)` | Budget actuals, category charts |
| `financial_events` | `(household_id, payee_person_id)` | PersonDashboard filter |
| `financial_events` | `(household_id, is_shared_expense, transaction_type)` | Debt computation |
| `budgets` | `(household_id, period_start, period_end)` | Budget period queries |
| `categories` | `(household_id, parent_id)` | Hierarchy traversal |
| `currencies` | `(household_id, code)` | Unique; currency lookups |
| `audit_log` | `(household_id, entity_id)` | Entity history lookup |
| `valuation_records` | `(asset_id, valuation_date)` | Latest valuation, history chart |
| `occurrence_records` | `(recurring_event_id, expected_date)` | Missed occurrence detection |

---

## 5. Backend Architecture

### 5.1 Request Lifecycle

```
Browser Request
    │
    ▼
HTTPS / Cloud Run ingress
    │
    ▼
FastAPI Middleware Stack (in order):
    1. AuthMiddleware        → validates session cookie; injects Person into request state
    2. HouseholdMiddleware   → resolves household_id from Person; injects into request state
    3. CSRFMiddleware         → validates CSRF token on non-GET requests
    │
    ▼
Route handler (routes/*.py)
    → Validates request body via Pydantic schema
    → Calls service function(s) with (db_session, household_id, actor_id, ...)
    │
    ▼
Service layer (services/*.py)
    → Business logic, validation, orchestration
    → Calls model queries directly (no separate repository layer — SQLAlchemy ORM used inline)
    → Writes audit log via audit_service before committing
    │
    ▼
Database (SQLAlchemy async session)
    → Commit or rollback
    │
    ▼
Route handler formats response via Pydantic response schema
    │
    ▼
JSON response to browser
```

### 5.2 Dependency Injection

```python
# dependencies.py

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise

async def get_current_person(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> Person:
    """Validated from session cookie. Raises 401 if absent or expired."""
    person_id = request.state.person_id  # Set by AuthMiddleware
    person = await db.get(Person, person_id)
    if not person or person.archived:
        raise HTTPException(status_code=401, detail="Authentication required")
    return person

async def get_household_id(
    current_person: Person = Depends(get_current_person)
) -> UUID:
    return current_person.household_id

def require_role(minimum_role: str):
    """Decorator factory for role enforcement."""
    role_hierarchy = {"member": 1, "admin": 2, "owner": 3}
    def _check(current_person: Person = Depends(get_current_person)):
        if role_hierarchy.get(current_person.role, 0) < role_hierarchy[minimum_role]:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return current_person
    return _check
```

### 5.3 Service Layer Contracts

All service functions follow the same signature pattern:

```python
# Example: account_service.py

async def create_account(
    db: AsyncSession,
    household_id: UUID,
    actor_id: UUID,
    data: AccountCreateSchema,
) -> Account:
    # 1. Validate business rules
    # 2. Construct model
    # 3. Add to session
    # 4. Write audit log (BEFORE commit)
    await audit_service.log(db, household_id, actor_id, "create", "account", account.id,
                             before=None, after=account)
    await db.flush()
    return account

async def archive_account(
    db: AsyncSession,
    household_id: UUID,
    actor_id: UUID,
    account_id: UUID,
) -> Account:
    account = await _get_or_404(db, household_id, account_id)
    # Check for hard-delete eligibility [EDP §13.1]
    has_deps = await _has_dependencies(db, account_id)
    if has_deps:
        account.archived = True
        account.archived_at = utcnow()
        account.archived_by = actor_id
        account.status = "archived"
        await audit_service.log(db, household_id, actor_id, "archive", "account", account_id,
                                 before=account, after=None)
    else:
        # Hard delete — no audit entry, INFO log only
        logger.info("hard_delete", entity="account", id=str(account_id), actor=str(actor_id))
        await db.delete(account)
    await db.flush()
    return account
```

---

## 6. API Design

### 6.1 Conventions

- Base path: `/api/`
- All endpoints require authentication except `/auth/*`
- All data responses are scoped to the authenticated user's `household_id`
- Standard pagination: `?page=1&per_page=50`
- Standard sort: `?sort=event_date&order=desc`
- Standard filter: `?status=active&archived=false`
- **API wire format for dates:** ISO 8601 `YYYY-MM-DD` — international standard for
  financial data, unambiguous, correctly sortable as a string. Used in all request
  parameters and JSON responses.
- **UI display format:** `DD-MM-YYYY` — familiar to Singapore and New Zealand users.
  The frontend formats all displayed dates and parses all date inputs in `DD-MM-YYYY`.
  This is a pure frontend layer; the API never receives or returns `DD-MM-YYYY`.
- Datetimes in ISO 8601 UTC (YYYY-MM-DDTHH:MM:SSZ)
- All amounts as strings in JSON to preserve Decimal precision
- IDs as UUID strings

### 6.2 CRUD Endpoint Inventory

```
AUTH
  POST   /auth/login                 → Initiate Google OAuth
  GET    /auth/callback              → OAuth callback, set session
  POST   /auth/logout                → Clear session
  GET    /auth/me                    → Current person + household

HOUSEHOLD
  GET    /api/household              → Get household details
  PATCH  /api/household              → Update (owner only)

PERSONS
  GET    /api/persons                → List household members
  GET    /api/persons/{id}           → Get person
  PATCH  /api/persons/{id}           → Update (self or admin)
  DELETE /api/persons/{id}           → Archive / hard delete if empty
  POST   /api/persons/invite         → Create invitation (admin+)
  GET    /api/persons/invitations    → List pending invitations
  DELETE /api/persons/invitations/{id} → Cancel invitation

ACCOUNTS
  GET    /api/accounts               → List (filter: ?type=bank|credit_card|capital|asset|insurance)
  POST   /api/accounts               → Create account
  GET    /api/accounts/{id}          → Get account
  PATCH  /api/accounts/{id}          → Update account
  POST   /api/accounts/{id}/archive  → Archive
  POST   /api/accounts/{id}/restore  → Restore
  DELETE /api/accounts/{id}          → Hard delete (empty only)
  GET    /api/accounts/{id}/owners   → List account owners
  POST   /api/accounts/{id}/owners   → Add owner
  DELETE /api/accounts/{id}/owners/{person_id} → Remove owner

VALUATION RECORDS
  GET    /api/accounts/{id}/valuations        → List valuation history
  POST   /api/accounts/{id}/valuations        → Add valuation record
  DELETE /api/accounts/{id}/valuations/{vid}  → Remove valuation

RECURRING CONFIGS
  GET    /api/accounts/{id}/recurring-config  → Get recurring config
  PUT    /api/accounts/{id}/recurring-config  → Set/update recurring config
  DELETE /api/accounts/{id}/recurring-config  → Remove recurring config

EVENTS
  GET    /api/events                 → List (filter: ?type=transaction|recurring_payment|transfer)
  POST   /api/events                 → Create event
  GET    /api/events/{id}            → Get event
  PATCH  /api/events/{id}            → Update event
  POST   /api/events/{id}/archive    → Archive
  POST   /api/events/{id}/restore    → Restore
  DELETE /api/events/{id}            → Hard delete (empty only)
  POST   /api/events/{id}/reconcile  → Mark reconciled

OCCURRENCE RECORDS
  GET    /api/events/{id}/occurrences          → List expected occurrences (recurring only)
  POST   /api/events/{id}/occurrences/{oid}/skip   → Skip an occurrence
  POST   /api/events/{id}/occurrences/process  → Manually trigger processing

BUDGETS
  GET    /api/budgets                → List (filter: ?period_type=monthly|yearly&period_start=)
  POST   /api/budgets                → Create budget
  GET    /api/budgets/{id}           → Get budget (includes computed actual_spent, variance)
  PATCH  /api/budgets/{id}           → Update budget
  POST   /api/budgets/{id}/archive   → Archive
  DELETE /api/budgets/{id}           → Hard delete (empty only)

CATEGORIES
  GET    /api/categories             → List (filter: ?include_archived=false)
  POST   /api/categories             → Create category
  GET    /api/categories/{id}        → Get category
  PATCH  /api/categories/{id}        → Update category
  POST   /api/categories/{id}/archive  → Archive
  DELETE /api/categories/{id}        → Hard delete (empty only)
  POST   /api/categories/defaults    → Create default household categories

CURRENCIES
  GET    /api/currencies             → List household currencies
  POST   /api/currencies             → Add currency
  PATCH  /api/currencies/{id}        → Update (fee_pct, is_display_active)
  POST   /api/currencies/{id}/set-base → Change base currency (owner only)
  GET    /api/currencies/rates       → Get current rates
  POST   /api/currencies/rates/refresh → Force FX rate refresh

FORMULAS
  GET    /api/formulas               → List (system + household)
  POST   /api/formulas               → Create custom formula
  PATCH  /api/formulas/{id}          → Update custom formula (household only)
  DELETE /api/formulas/{id}          → Delete custom formula (household only; system = cannot delete)

IMPORT / EXPORT
  POST   /api/import/csv             → Upload CSV (multipart/form-data)
  GET    /api/import/preview/{job_id}   → Preview parsed rows with category mapping suggestions
  POST   /api/import/confirm/{job_id}   → Confirm import
  GET    /api/export/csv             → Download CSV (filter params matching events)

ALERTS
  GET    /api/alerts                 → List active alerts
  POST   /api/alerts/{id}/dismiss    → Dismiss alert
```

### 6.3 Visualization Endpoints

All accept `VisualizationFilter` as query parameters. All return both raw-currency
breakdowns and converted totals in a single response. [EDP §13.5]

```
SPENDING & INCOME
GET /api/visualizations/spending-by-category
    → { categories: [{id, name, color, raw_amounts: [{currency, amount}], total_base}] }

GET /api/visualizations/income-vs-expenses
    → { periods: [{label, income_base, expense_base, income_raw, expense_raw}] }

GET /api/visualizations/forex-loss-trend
    → { periods: [{label, total_fx_delta_base, transactions: [{id, name, fx_delta}]}] }

NET WORTH & ACCOUNTS
GET /api/visualizations/net-worth-over-time
    → { periods: [{label, assets_base, liabilities_base, net_worth_base}] }

GET /api/visualizations/account-balance-history
    → requires: ?account_id=UUID
    → { periods: [{label, balance_base, inflow_base, outflow_base}] }

BUDGETS
GET /api/visualizations/budget-vs-actual
    → { budgets: [{id, name, limit_base, actual_base, variance_base, pct_used}] }

GET /api/visualizations/budget-contributors/{budget_id}
    → Level 2 drill-down: [{event_id, name, date, amount_base, category}]

GET /api/visualizations/budget-history
    → Budget trend over time for a category or person.
    → requires: ?category_id=UUID (optional: &owner_person_id=UUID &period_type=monthly|yearly)
    → { periods: [{label, limit_base, actual_base, variance_base, pct_used}] }
    → Enables: "how has our food budget and actual spending changed over the past 12 months"

CAPITAL & INVESTMENTS
GET /api/visualizations/portfolio-value-over-time
    → { periods: [{label, total_value_base, allocation: [{account_id, name, value_base, pct}]}] }

GET /api/visualizations/capital-history
    → Capital account inflow, outflow, and value over time — per account or all capital.
    → optional: ?account_id=UUID
    → { periods: [{label, value_base, inflow_base, outflow_base, interest_earned_base}] }
    → Enables: "how has my CPF / investment portfolio grown over time"

ASSETS
GET /api/visualizations/asset-valuation-history
    → requires: ?account_id=UUID
    → { valuations: [{date, value_base, source, formula_id}] }

DEBT
GET /api/visualizations/debt-summary
    → { credit_card_debt: [{account_id, name, balance_base}],
        internal_debt: [{person_id, name, owed_base}],
        total_debt_base }

RECURRING
GET /api/visualizations/recurring-payment-calendar
    → { occurrences: [{date, recurring_id, name, amount_base, status}] }

COMPARISON MODES
GET /api/visualizations/compare/persons
    → Compare spending between two or more persons over the filter period.
    → requires: ?person_ids[]=UUID&person_ids[]=UUID (2–4 persons)
    → optional: &group_by=category|month|payment_method
    → { persons: [{person_id, display_name, avatar_url,
                   total_base, spending_by_category: [{category_id, name, amount_base}],
                   raw_amounts: [{currency, amount}]}],
        shared_categories: [{category_id, name, color,
                             values: [{person_id, amount_base}]}] }
    → Enables: "Ben vs Kim — who spent more on food this month"

GET /api/visualizations/compare/categories
    → Compare spending across two or more categories over time.
    → requires: ?category_ids[]=UUID&category_ids[]=UUID (2–8 categories)
    → optional: &group_by=month|quarter|year
    → { categories: [{category_id, name, color,
                      total_base, periods: [{label, amount_base, raw_amounts}]}],
        periods: [label, ...] }
    → Enables: "Food vs Transport vs Utilities — trend over the last 12 months"
```

### 6.4 Error Contract

Error responses follow **RFC 7807 — Problem Details for HTTP APIs** (IETF standard).
`Content-Type: application/problem+json`

```json
{
  "type":     "https://financialtracker.app/errors/validation-error",
  "title":    "Validation Error",
  "status":   400,
  "detail":   "The 'amount' field must be greater than zero.",
  "instance": "/api/events",
  "errors":   [{"field": "amount", "message": "Must be > 0"}]
}
```

| HTTP Status (RFC 9110) | `type` path | `title` | Meaning |
|---|---|---|---|
| 400 | `/errors/validation-error` | Validation Error | Pydantic field-level failure — `errors[]` has field details |
| 400 | `/errors/business-rule-violation` | Business Rule Violation | e.g. `is_shared_expense` on a transfer |
| 401 | `/errors/not-authenticated` | Not Authenticated | No valid session cookie |
| 403 | `/errors/insufficient-role` | Insufficient Role | Valid session, role too low |
| 404 | `/errors/not-found` | Not Found | Entity absent or not in household |
| 409 | `/errors/duplicate-detected` | Duplicate Detected | Duplicate transaction — `instance` holds candidate ID |
| 409 | `/errors/has-dependencies` | Has Dependencies | Hard delete blocked — entity has linked records |
| 422 | `/errors/unprocessable` | Unprocessable | Semantically invalid (e.g. `end_date` before `start_date`) |
| 500 | `/errors/internal-error` | Internal Server Error | Unexpected failure — logged server-side |

**HTTP status codes follow RFC 9110** (the current HTTP semantics standard).
`type` URIs are resolvable documentation pages (served as static HTML in production).
The `instance` field identifies the specific request URI where the error occurred.

FastAPI's built-in validation errors (`RequestValidationError`) are caught and
reformatted to RFC 7807 before returning — the raw Pydantic error format is never
exposed to clients.

---

## 7. Authentication & Security

### 7.1 Google OAuth 2.0 Flow

```
Browser                     Backend                      Google
   │                            │                            │
   │── GET /auth/login ─────────►│                            │
   │                            │── Generate state + nonce   │
   │                            │── Store in DB session      │
   │◄── Redirect to Google ─────│                            │
   │                            │                            │
   │──────────────────────────────────────────────────────────►│
   │◄─────────────────── Redirect with code + state ──────────│
   │                            │                            │
   │── GET /auth/callback ──────►│                            │
   │    ?code=...&state=...      │── Validate state vs DB    │
   │                            │── Exchange code for token ─►│
   │                            │◄── id_token + access_token ─│
   │                            │── Decode id_token          │
   │                            │── Lookup/create Person     │
   │                            │── Create server session    │
   │◄── Set-Cookie: session ────│── Update last_active_at    │
   │── Redirect to app ─────────►│                            │
```

**Test isolation:** Unit and integration tests never contact Google. A `MockOAuthServer`
fixture intercepts all `httpx` calls to Google endpoints and returns signed mock tokens.
Only one E2E smoke test (`test_auth_real_oauth.py`) exercises the real Google OAuth flow
and requires a dedicated test Google account (credentials in Secret Manager, `test` env only).

### 7.2 Session Management

- Sessions stored in `sessions` table (SQLite). Record: `{id, person_id, expires_at, last_active_at, ip, user_agent}`.
- Session cookie: `HttpOnly`, `Secure`, `SameSite=Strict`, 30-day max-age.
- **Sliding expiry:** `last_active_at` updated on every authenticated request. Session
  expires if no activity for 30 minutes (configurable via `SESSION_IDLE_MINUTES` secret).
- On expiry: session record deleted; client receives 401.
- Concurrent sessions allowed (one per browser/device).

### 7.3 CSRF Protection

- CSRF token generated per session, stored in `sessions.csrf_token`.
- Required on all `POST`, `PATCH`, `PUT`, `DELETE` requests as `X-CSRF-Token` header.
- Single-use rotation: token is rotated after each successful mutation (new token returned
  in response header `X-New-CSRF-Token`).
- Exempt: `/auth/*` endpoints (pre-authentication) and `GET` requests.

### 7.4 Household Scoping Middleware

```python
# middleware/household_middleware.py

class HouseholdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Skip for auth routes and static files
        if request.url.path.startswith(("/auth/", "/static/")):
            return await call_next(request)

        person_id = request.state.person_id  # Set by AuthMiddleware
        if person_id:
            person = await get_person_cached(person_id)
            request.state.household_id = person.household_id

        response = await call_next(request)
        return response
```

Every service function receives `household_id` explicitly. The SQLAlchemy query helper
`_get_or_404` enforces household scope on every lookup:

```python
async def _get_or_404(db: AsyncSession, household_id: UUID, entity_id: UUID,
                      model: type[T]) -> T:
    result = await db.execute(
        select(model).where(
            model.id == entity_id,
            model.household_id == household_id,   # ← enforced always
            model.archived == False
        )
    )
    entity = result.scalar_one_or_none()
    if not entity:
        raise HTTPException(status_code=404, detail="Not found")
    return entity
```

There is no mechanism to query across household boundaries. This is by design.

### 7.5 Security Headers

Applied globally via middleware:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy:   default-src 'self'; script-src 'self'; ...
X-Content-Type-Options:    nosniff
X-Frame-Options:           DENY
Referrer-Policy:           strict-origin-when-cross-origin
Permissions-Policy:        camera=(), microphone=(), geolocation=()
```

---

## 8. Frontend Architecture

### 8.0 Design Token System

All design tokens are defined in `frontend/src/index.css` using Tailwind CSS v4's
native `@theme {}` block — no separate `tailwind.config.ts` is used.

```css
/* index.css */
@import "tailwindcss";

@theme {
  /* Colour tokens */
  --color-primary: ...;
  --color-bg-surface: ...;
  --color-entity-account: ...;   /* Entity accent colours */
  --color-entity-category: ...;
  --color-border-focus: ...;
  /* Typography, spacing, shadow, z-index, motion tokens */
}

@utility entity-card {
  /* Shared card shell styles referenced as a Tailwind utility class */
}
```

The `@utility {}` blocks define shared structural CSS patterns (e.g. `entity-card`,
`sidebar-nav-item`) that are used in components via Tailwind's utility class system.
CSS custom properties (e.g. `--entity-accent`) are passed as inline `style` props from
parent components to control per-instance colour theming without prop drilling.

**Component layer map (atoms → organisms):**

| Layer | Location | Examples |
|---|---|---|
| Atoms (Layer 2) | `components/ui/` | Button, Input, Badge, Avatar, Tooltip, Spinner |
| Form / selection (Layer 3) | `components/ui/` | Dropdown, Checkbox, Toggle, DatePicker, ColourPicker, EmojiIconPicker, MonetaryValueInput, RecurringDateInput, TagInput |
| Containers / feedback (Layer 4+) | `components/ui/` | Card, Modal, Drawer, ConfirmationDialog, Accordion, Table, ContextMenu, AlertBanner, ProgressBar, Skeleton, EmptyState, Toast, ToastContainer |
| Generic entity (Layer 9) | `components/entity/` | EntityCard, EntityModal, EntityPage |
| Feature-specific | `components/<domain>/` | Built per feature epic |
| Layout | `components/layout/` | AppShell, Sidebar, Topbar |

### 8.1 Routing

```typescript
// App.tsx — React Router v6 nested routes

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,           // Sidebar + topbar; requires auth
    loader: requireAuth,
    children: [
      { index: true,        element: <Dashboard /> },
      { path: "accounts",   element: <Accounts /> },
      { path: "capital",    element: <Capital /> },
      { path: "assets",     element: <Assets /> },
      { path: "insurance",  element: <Insurance /> },
      { path: "transactions", element: <Transactions /> },
      { path: "recurring",  element: <RecurringPayments /> },
      { path: "transfers",  element: <Transfers /> },
      { path: "budgets",    element: <Budgets /> },
      { path: "categories", element: <Categories /> },
      { path: "settings",   element: <Settings /> },
    ],
  },
  { path: "/login",         element: <Login /> },
  { path: "/callback",      element: <OAuthCallback /> },
  { path: "/join/:token",   element: <JoinHousehold /> },
  { path: "/design-system", element: <DesignSystem /> }, // Live component catalogue — dev/QA use
]);
```

**Auth guard and mock Dev User:**  
`AuthGuard` checks `authStore.currentPerson` on every protected route render. In
development mode (before Google OAuth is wired), `authStore` is pre-populated with a
mock Dev User so the full app shell and all placeholder module pages are navigable without
a running backend. The mock is stripped at build time in production via a Vite
`import.meta.env.DEV` guard.

### 8.2 Auth Store

```typescript
// store/authStore.ts — Zustand
interface AuthState {
  currentPerson: Person | null;
  householdId: string | null;
  csrfToken: string | null;
  setAuth: (person: Person, householdId: string, csrfToken: string) => void;
  clearAuth: () => void;
}
// In development (import.meta.env.DEV), the store is initialised with a
// mock Dev User so the app shell is navigable without backend OAuth.
```

### 8.3 VisualizationFilter Global State

```typescript
// store/visualizationStore.ts — Zustand

interface VisualizationState {
  filter: VisualizationFilter;
  filterHistory: VisualizationFilter[];  // For breadcrumb trail + back navigation

  setFilter: (partial: Partial<VisualizationFilter>) => void;
  drillDown: (partial: Partial<VisualizationFilter>) => void;  // Pushes to history
  drillUp: () => void;                                          // Pops from history
  resetFilter: () => void;

  navigateTo: (path: string, filterOverride?: Partial<VisualizationFilter>) => void;
  // Carries filter state across module navigation
}

const defaultFilter: VisualizationFilter = {
  time_range: { preset: "month", start: startOfMonth(new Date()), end: endOfMonth(new Date()) },
  person_ids: [],
  category_ids: [],
  account_ids: [],
  currency_mode: "converted",
  display_currency: "SGD",
  transaction_type: "all",
};
```

### 8.4 Three-Layer Component Architecture

```typescript
// hooks/useEntityManager.ts — [EDP §14.2]

export function useEntityManager<T extends BaseEntity>(
  config: EntityManagerConfig<T>
) {
  const queryClient = useQueryClient();

  const { data: entities = [], isLoading } = useQuery({
    queryKey: config.queryKey,
    queryFn: () => config.loadAll(config.defaultParams ?? {}),
  });

  const createMutation  = useMutation({ mutationFn: config.create,  onSuccess: invalidate });
  const updateMutation  = useMutation({ mutationFn: config.update,  onSuccess: invalidate });
  const archiveMutation = useMutation({ mutationFn: config.archive, onSuccess: invalidate });

  function invalidate() { queryClient.invalidateQueries({ queryKey: config.queryKey }); }

  return {
    entities: entities.filter(e => !e.archived),
    archivedEntities: entities.filter(e => e.archived),
    isLoading,
    create:  createMutation.mutate,
    update:  updateMutation.mutate,
    archive: archiveMutation.mutate,
    // ... full interface per EDP §14.2
  };
}
```

```tsx
// components/entity/EntityCard.tsx — [EDP §14.3]

export function EntityCard<T extends BaseEntity>({
  entity,
  renderPrimary,
  renderSecondary,
  renderMeta,
  onEdit,
  onArchive,
  extensionSlot,
}: EntityCardProps<T>) {
  const [showActions, setShowActions] = useState(false);

  return (
    <div
      className="entity-card"
      style={{ "--entity-accent": "var(--color-entity-account)" } as CSSProperties}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="entity-card__primary">{renderPrimary(entity)}</div>
      <div className="entity-card__secondary">{renderSecondary(entity)}</div>
      {renderMeta && (
        <div className="entity-card__meta">{renderMeta(entity)}</div>
      )}
      {showActions && (
        <EntityCardActions entity={entity} onEdit={onEdit} onArchive={onArchive} />
      )}
      {extensionSlot}
    </div>
  );
}
```

---

## 9. Scheduler Architecture

### 9.1 Job Registry

```python
# scheduler/registry.py

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore

def create_scheduler(database_url: str) -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(
        jobstores={"default": SQLAlchemyJobStore(url=database_url)},
        timezone="UTC",
    )
    scheduler.add_job(recurring_payment_job, "cron", hour=0, minute=5,  id="recurring_payments")
    scheduler.add_job(fx_rate_job,           "cron", hour=1, minute=0,  id="fx_rates")
    scheduler.add_job(budget_rollover_job,   "cron", day=1, hour=0, minute=30, id="budget_rollover")
    scheduler.add_job(alert_generation_job,  "cron", hour=8, minute=0,  id="alerts")
    scheduler.add_job(backup_job,            "cron", hour=3, minute=0,  id="daily_backup")
    scheduler.add_job(keepalive_job,         "interval", minutes=14,   id="keepalive")
    return scheduler
```

### 9.2 Recurring Payment Processor

```
Daily at 00:05 UTC

For each active RecurringPayment event (event_type = "recurring_payment"):
    1. Compute all expected occurrences from frequency_rule between
       last_processed_at (or start_date) and today.
    2. For each expected occurrence date:
       a. Check if an OccurrenceRecord already exists for this date.
       b. If not: create OccurrenceRecord(status="upcoming").
    3. For each OccurrenceRecord where expected_date <= today AND status = "upcoming":
       a. Generate a new Transaction event (event_type="transaction") copying
          all fields from the RecurringPayment, setting event_date = expected_date.
       b. Set OccurrenceRecord.status = "processed", generated_event_id = new_transaction.id
       c. Set RecurringPayment.last_processed_at = now()
    4. For each OccurrenceRecord where expected_date < today - 1 AND status = "upcoming":
       → Status = "missed". Generate MISSED_OCCURRENCE alert.

For each RecurringEventSource account (Capital / Asset / Insurance)
with recurring_config.enabled = True:
    → Same logic, using recurring_config.frequency_rule as the rule
    → Field mapping per EDP §6.4 v1 processor table
```

### 9.3 FX Rate Job

```
Daily at 01:00 UTC

For each Currency where is_base = False:
    1. Fetch rate from ExchangeRate-API.
    2. If API call succeeds:
       → Update Currency.rate_to_base, last_rate_at, rate_source
       → Insert FxRateHistory record
    3. If API call fails:
       → Log WARNING "fx_rate_fetch_failed" with currency code
       → Do NOT update Currency.rate_to_base (last known rate preserved)
       → Circuit breaker: if 3 consecutive failures, generate SYSTEM_ALERT

Rate is used for all new MonetaryValue.amount_base_calculated values for the next 24h.
```

### 9.4 Budget Rollover Job

```
First of each month at 00:30 UTC

For each active monthly Budget:
    1. Check if a Budget record already exists for the new month.
    2. If not: create new Budget copying limit, category_id, owner_person_id,
       alert_threshold_pct, rollover from the previous month's record.
    3. If rollover = True: carry unspent balance from previous month into new limit.

For yearly Budgets: created manually or at year start — no auto-rollover.
```

### 9.5 Alert Generation

```
Daily at 08:00 UTC (household timezone)

Checks performed:
  BUDGET_WARNING:        Any budget where actual_spent >= alert_threshold_pct% of limit
  BUDGET_EXCEEDED:       Any budget where actual_spent > limit
  RECURRING_MISSED:      Any OccurrenceRecord with status = "missed" (not yet alerted)
  DEBT_HIGH:             Total computed debt > household-configured threshold
  FX_RATE_STALE:         Any Currency with last_rate_at > 48 hours ago
  UPCOMING_PAYMENTS:     RecurringPayments due within 3 days

Each alert: one record in alerts table per household per type per day (deduplication).
```

### 9.6 Serverless Keepalive

```
Every 14 minutes (within Cloud Run idle timeout window)

Cloud Run scales to zero after ~15 minutes of inactivity.
APScheduler lives in-process. Scale-to-zero kills it.

Keepalive strategy:
  1. keepalive_job pings a lightweight internal endpoint every 14 minutes
     to prevent scale-to-zero during active household hours.
  2. Cloud Run minimum_instances = 0 (cost target). Keepalive only activates
     after first daily request (first request warms up instance).
  3. On cold start: APScheduler reloads jobs from SQLAlchemyJobStore (persisted in DB).
     Missed jobs are caught by the "coalesce=True" APScheduler setting.
```

---

## 10. Import / Export Architecture

### 10.1 CSV Import Flow

```
POST /api/import/csv (multipart, file upload)
    │
    ▼
import_export_service.parse_csv()
    → Detect column structure using header-mapping heuristic
      (v1 compatibility: buildHeaderMap / findHeader logic preserved)
    → Parse each row into provisional ImportRow objects
    → Suggest category mapping using category_id matching by name
    → Return job_id + ImportPreview (rows, suggestions, errors)
    │
    ▼
GET /api/import/preview/{job_id}
    → User reviews rows, corrects category mappings, removes bad rows
    │
    ▼
POST /api/import/confirm/{job_id}
    → For each approved row:
        → Run duplicate detection [EDP §13.3]
        → Create FinancialEvent via event_service.create_event()
        → Write audit log
    → Return ImportResult (imported_count, skipped_count, duplicate_ids)
```

### 10.2 CSV Export

Query `FinancialEvent` with all `VisualizationFilter` params applied. Output columns:

`id, name, event_date, event_type, transaction_type, transaction_status,
currency, amount, amount_base, fx_delta, payee_name, payment_method,
category_name, category_parent_name, is_shared_expense, source_account_name,
notes, created_at`

---

## 11. Logging & Error Handling

### 11.1 Structured Log Format

```python
# All services log via structlog

import structlog
logger = structlog.get_logger()

# Usage in service layer:
logger.info("account_created",
    household_id=str(household_id),
    actor_id=str(actor_id),
    account_id=str(account.id),
    account_type=account.account_type,
)

logger.warning("fx_rate_fetch_failed",
    currency_code="NZD",
    attempt=attempt_number,
    error=str(exc),
)

logger.error("scheduler_job_failed",
    job_id="recurring_payments",
    error=str(exc),
    traceback=format_exc(),
)
```

Log levels: `DEBUG` (dev only) · `INFO` (normal operations) · `WARNING` (degraded but
functional) · `ERROR` (operation failed, user-impacting) · `CRITICAL` (system integrity)

### 11.2 Global Exception Handler

```python
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("unhandled_exception",
        path=request.url.path,
        method=request.method,
        error=str(exc),
        traceback=format_exc(),
    )
    return JSONResponse(
        status_code=500,
        content={"error": "An unexpected error occurred.", "code": "INTERNAL_ERROR", "detail": {}}
    )
```

---

## 12. Testing Architecture

### 12.1 Unit Tests (pytest)

Coverage target: **80% of service layer**. Priority targets:

| Test File | What It Tests |
|---|---|
| `test_recurring_date_parser.py` | All 9 frequency patterns from v1 [EDP §7.3] |
| `test_computation_service.py` | EntityDebt calculation — all three sources [EDP §12] |
| `test_account_service.py` | STI CRUD, empty-entity hard-delete logic |
| `test_event_service.py` | Transaction, RecurringPayment, Transfer; is_shared_expense constraint |
| `test_visualization_service.py` | Aggregation query results, raw vs converted modes, comparison queries |
| `test_currency_service.py` | FX conversion, fx_delta computation, base currency change |
| `test_formula_service.py` | All system default formulas with known inputs/outputs |

### 12.2 Integration Tests (pytest + test DB)

Each integration test uses a fresh in-memory SQLite instance with a **pre-seeded test
session** — no Google OAuth call is ever made. The `MockOAuthServer` fixture (using
`pytest-httpx`) intercepts all outbound OAuth calls and returns valid mock `id_token`
payloads. Tests receive a pre-authenticated `Person` via a `test_client` fixture that
injects a valid session cookie directly.

```python
# conftest.py
@pytest.fixture
def test_client(app, db_session):
    """Pre-authenticated test client. No Google OAuth call required."""
    person = create_test_person(db_session, role="owner")
    session = create_test_session(db_session, person_id=person.id)
    client = TestClient(app)
    client.cookies.set("session", session.id)
    return client, person
```

| Test File | Coverage |
|---|---|
| `test_auth_api.py` | Mock OAuth callback, session creation, CSRF rotation — no real Google call |
| `test_accounts_api.py` | Full CRUD, ownership, hard-delete eligibility |
| `test_events_api.py` | Transaction + transfer + shared_expense constraint |
| `test_import_api.py` | CSV parse, preview, confirm, duplicate detection |
| `test_visualization_api.py` | All aggregation endpoints; comparison modes; budget history |

### 12.3 E2E Tests (Playwright)

| Test | Critical Path | Google OAuth Required |
|---|---|---|
| `test_auth_real_oauth.py` | Login → session created → redirect to app | **Yes** — test Google account, `test` env only |
| `test_transaction_entry.py` | Add transaction → verify ledger → verify budget updated | No (pre-seeded session) |
| `test_recurring_payment.py` | Create recurring → trigger scheduler → verify transaction | No |
| `test_csv_import.py` | Upload CSV → fix mappings → confirm → verify count | No |
| `test_multi_currency.py` | Enter NZD + SGD + USD + PHP transactions → verify conversions → toggle display currency | No |
| `test_debt_computation.py` | Mark shared expense → verify debt → transfer → verify cleared | No |
| `test_comparison_viz.py` | Person comparison chart → category comparison chart → drill-down | No |

**Real OAuth test account:** One dedicated `financialtracker.test@gmail.com` Google account.
Credentials stored in Secret Manager under the `test` environment only. The test runs in
CI nightly, not on every push.

---

## 13. Backup Architecture

```
Daily at 03:00 UTC

1. Flush all pending SQLite WAL frames: PRAGMA wal_checkpoint(TRUNCATE)
2. Copy SQLite file to /tmp/backup_{YYYY-MM-DD}.db
3. Compress: gzip → .db.gz
4. Upload to GCS bucket: gs://{PROJECT_ID}-backups/db/{YYYY-MM}/{YYYY-MM-DD}.db.gz
5. Log INFO "backup_complete" with file size and upload duration
6. GCS lifecycle policy: retain 90 days, then auto-delete

Cold start restore:
  On container startup, if /data/tracker.db is absent:
    → Download latest backup from GCS
    → Decompress and place at /data/tracker.db
    → Run Alembic migrations (idempotent)
    → Start application
```

---

## 14. Computational Architecture

### 14.1 EntityDebt Computation [EDP §12]

`computation_service.compute_household_debt()` returns the full debt breakdown. This
is called by the `/api/visualizations/debt-summary` endpoint and on dashboard load.
It is never cached — always computed live from the event and account tables.

```python
async def compute_household_debt(db: AsyncSession, household_id: UUID) -> DebtSummary:
    # Source 1: Credit card balances
    cc_debt = await db.execute(
        select(
            Account.id,
            Account.name,
            func.coalesce(
                func.sum(
                    case(
                        (FinancialEvent.transaction_type == "outflow", FinancialEvent.amount_base),
                        else_=0
                    )
                ) -
                func.sum(
                    case(
                        (FinancialEvent.is_debt_repayment == True, FinancialEvent.amount_base),
                        else_=0
                    )
                ),
                0
            ).label("debt_balance")
        )
        .join(FinancialEvent, FinancialEvent.source_account_id == Account.id)
        .where(
            Account.household_id == household_id,
            Account.account_type == "credit_card",
            Account.archived == False,
            FinancialEvent.archived == False,
            FinancialEvent.transaction_status != "cancelled",
        )
        .group_by(Account.id, Account.name)
    )

    # Source 2: Internal household debt (is_shared_expense)
    internal_debt = await db.execute(
        select(
            Person.id,
            Person.display_name,
            func.coalesce(
                func.sum(
                    case(
                        (FinancialEvent.is_shared_expense == True, FinancialEvent.amount_base),
                        else_=0
                    )
                ) -
                func.sum(
                    case(
                        (
                            and_(
                                FinancialEvent.event_type == "transfer",
                                FinancialEvent.is_debt_repayment == True,
                            ),
                            FinancialEvent.amount_base,
                        ),
                        else_=0
                    )
                ),
                0
            ).label("owed_to_person")
        )
        .join(FinancialEvent, FinancialEvent.payee_person_id == Person.id)
        .where(
            Person.household_id == household_id,
            FinancialEvent.household_id == household_id,
            FinancialEvent.archived == False,
            FinancialEvent.transaction_status != "cancelled",
        )
        .group_by(Person.id, Person.display_name)
    )

    return DebtSummary(credit_card=cc_debt.all(), internal=internal_debt.all())
```

### 14.2 Budget Actuals Computation [EDP §8]

```python
async def compute_budget_actuals(
    db: AsyncSession,
    household_id: UUID,
    budget: Budget,
) -> Decimal:
    """Returns actual_spent in amount_base for the given budget's period."""
    category_ids = await get_category_and_descendants(db, household_id, budget.category_id)

    result = await db.execute(
        select(func.sum(FinancialEvent.amount_base))
        .where(
            FinancialEvent.household_id == household_id,
            FinancialEvent.event_date >= budget.period_start,
            FinancialEvent.event_date <= budget.period_end,
            FinancialEvent.category_id.in_(category_ids),
            FinancialEvent.transaction_type == "outflow",
            FinancialEvent.transaction_status != "cancelled",
            FinancialEvent.archived == False,
            (
                FinancialEvent.payee_person_id == budget.owner_person_id
                if budget.owner_person_id else True
            ),
        )
    )
    return result.scalar() or Decimal("0")
```

---

## Revision History

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-05-23 | Ben + BMAD | Initial architecture — v1 migration scope |
| 2.0 | 2026-05-26 | Ben + Claude | Full rewrite — entity hierarchy applied to all models, STI for accounts and events, MonetaryValueMixin, VisualizationFilter architecture, aggregation API endpoints, four-source recurring payment processor, EntityDebt computation queries, hard-delete logic, security patterns, comprehensive test strategy |
| 2.1 | 2026-05-26 | Ben + Claude | Date format: ISO 8601 wire + DD-MM-YYYY display. Visualization endpoints: budget history, capital history, person comparison, category comparison. Error contract updated to RFC 7807 Problem Details (IETF standard). Mock OAuth strategy for tests — real credentials required only for one E2E smoke test. Multi-currency breadth: all ISO 4217 supported (SGD, NZD, USD, PHP, etc.) |
| 2.2 | 2026-05-29 | Ben + Claude | Frontend architecture section updated to reflect Epic 2 completion: §8.0 Design Token System (Tailwind v4 @theme/@utility pattern, component layer map); §8.2 Auth Store (mock Dev User for pre-OAuth development); §8.1 routing updated with /design-system route; §8.3 VisualizationFilter and §8.4 component architecture renumbered. |
