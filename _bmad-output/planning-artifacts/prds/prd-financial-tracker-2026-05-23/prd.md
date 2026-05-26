---
title: "Financial Tracker — Product Requirements Document"
status: living
author: Ben (with Mary BA, Winston Architect, John PM, Sally UX, Amelia Dev, Paige Tech Writer)
created: 2026-05-23
updated: 2026-05-25
revisionDate: 2026-05-25
revisionNote: Synchronized with implementation reality after Epic 1 (complete) and Epic 2 (complete). Replaced preliminary API endpoint list with complete inventory of 40+ endpoints organized by module, with implementation status per endpoint. Updated to reflect service layer pattern, CSRF protection architecture, and invitation system details.

> **Implementation Progress:** See `../../implementation-artifacts/sprint-status.yaml` for canonical implementation progress.
source-brief: ../briefs/brief-financial-tracker-2026-05-23
---

# Financial Tracker — Product Requirements Document

## 1. Product Overview

### 1.1 Problem Statement
Ben and household members currently manage finances through a complex Google Sheets setup that is difficult to maintain, lacks automation, and provides limited visibility into financial health. The system needs to support multi-user collaboration, automated recurring payments, multi-currency transactions, and visual dashboards — all while maintaining $0/month hosting costs.

### 1.2 Product Vision
A web-based financial tracking application for small households (2-4 members) that automates financial management, provides real-time visual insights, and eliminates spreadsheet complexity — with zero ongoing hosting costs.

### 1.3 Non-Goals
The following are explicitly OUT OF SCOPE for MVP:
- **Native mobile apps** (iOS/Android) — responsive web is sufficient
- **Multi-tenant SaaS** — single household only
- **Email notifications** — in-app alerts only (email deferred to Phase 3)
- **Accountant-level tax reporting** — CSV export for external tools
- **Real-time collaboration** — users update sequentially, not simultaneously
- **Multi-currency invoicing** — personal household use only
- **Investment trading** — tracking only, no buy/sell execution
- **Bank feed integration** — manual entry and CSV import only

### 1.4 Target Users

| Role | Count | Description |
|------|-------|-------------|
| Primary User (Ben) | 1 | Intermediate technical skill, manages household finances |
| Household Members | 2-4 | Family members who need access to view/add transactions |

### 1.5 Success Criteria
| Metric | Target | Measurement | Counter-Metric |
|--------|--------|-------------|----------------|
| MVP modules delivered | 6 of 6 Phase 1 modules | Module checklist | Phase 2+ modules not started = 0 (expected) |
| Authentication working | 100% of users can log in | Login success rate | Failed logins < 1% |
| Recurring payments process | 95% of payments process on schedule | Missed payments per month | < 2 missed payments/month |
| Multi-currency accuracy | SGD override applied within 0.01 | FX delta variance | Average FX delta < $0.05 |
| Dashboard performance | P95 render < 2s | Lighthouse performance score | Score > 80 |
| CSV import success | 95% of valid CSVs import without error | Import success rate | Error rate < 5% |
| $0/month hosting | Actual cost = $0 | Monthly Cloud billing report | Cost > $1 triggers review |
| Mobile responsive | 100% of core features usable on mobile | Mobile usability test | < 3 blocked mobile flows |

### 1.6 Counter-Metrics
| Metric | Counter-Metric | Threshold |
|--------|----------------|-----------|
| $0/month hosting | Actual monthly cost | $0 ± $1 (free tier overage buffer) |
| Dashboard < 2s render | P95 render time | < 2.5s |
| Transaction search < 1s | P95 search latency | < 1.5s |
| 50,000 transactions | Rows per user | < 60,000 |
| 99.9% uptime | Actual uptime | < 99% triggers investigation |

## 2. Feature Requirements

### 2.1 Authentication Module [MVP]
- Google OAuth 2.0 login
- Household member management
- Role-based access control
- **Invitation Flow**:
  - In-app invitations only — no actual emails sent (email notifications deferred to Phase 3)
  - Email-matching flow: inviter enters invitee's email address; system matches against Google OAuth profile on login
  - Invitations stored in `HouseholdInvitation` model with status enum (pending/accepted/expired/revoked)
  - 7-day expiry period — invitations automatically expire after 7 days
  - Email matching uses `func.lower()` for case-insensitive comparison
  - Invitee receives in-app notification of pending invitation upon login
  - Inviter can revoke pending invitations before acceptance

### 2.2 Dashboard Module [MVP]
- Visual charts (Chart.js)
- Financial overview
- Key metrics display

### 2.3 Transactions Module [MVP]
- Full transaction CRUD + duplicate + archive
- Multi-currency support
- SGD override capability
- Forex loss tracking
- Fee tracking

### 2.4 Accounts Module [MVP]
- Bank account CRUD + duplicate + archive
- Payment method configuration

### 2.5 Recurring Payments Module [MVP]
- Automated recurring transaction processing
- Schedule management with start date and end date
- APScheduler integration

### 2.6 Budgets Module [Phase 2]
- Budget CRUD + duplicate + archive
- Category-based budgets
- Variance reporting

### 2.7 Capital Module [Phase 2]
- Investment CRUD + duplicate + archive
- Capital account management

### 2.8 Assets Module [Phase 3]
- Asset CRUD + duplicate + archive
- Depreciation tracking (Phase 3)

### 2.9 Credit Cards Module [Phase 2]
- Credit card CRUD + duplicate + archive
- Payment tracking

### 2.10 Insurance Module [Phase 3]
- Insurance policy CRUD + duplicate + archive
- Insurance policy tracking (Phase 3)

### 2.11 Transfers Module [Phase 2]
- Inter-account transfers
- Multi-currency transfer handling

### 2.12 Categories Module [MVP]
- Category CRUD + duplicate + archive
- Default category templates available via "Create Default Categories" button in the UI (e.g., Groceries, Transport, Utilities, Entertainment, Healthcare, Education, Shopping, Dining, Travel, Bills, Savings, Other)
- New households start with no categories; user clicks "Defaults" to create a suggested set of 17 categories (12 expense + 5 income)
- All categories are household-specific — no system-wide default categories exist
- User can create custom categories with: Name, Color, Icon, Parent Category (for subcategories)
- Categories can be assigned to transactions, recurring payments, and budgets
- Auto-create categories from CSV imports — new category names from imports are added automatically
- User can merge duplicate categories (e.g., "Groceries" and "groceries" merged into one)
- Category-based filtering and reporting across all modules

### 2.13 Debt Module [Phase 3]
- Internal household debt tracking — how much each person has spent from their personal accounts toward shared household expenses
- Auto-derived from transactions tagged to flagged personal accounts
- Debt accounts list with flag to identify which accounts contribute to debt
- Manual entry when transferring money from shared account to personal account to pay back debt
- Monthly debt ledger showing month/year, calculated debt, and repayment status
- Debt Accounts with the following characteristics:
  - Debt Name
  - Owner (household member)
  - Currency Type
  - Status (Active/Paid/Partial)
  - Latest Paid Date
- Manual repayment entry: when transferring from shared account to personal account, user flags it as debt repayment
- Monthly remaining balance: user manually notes how much is still left over each month
- Spreadsheet-style view: month/year, calculated debt, repayment status

#### Credit Card Debt Tracking [Phase 3]
- Track debt generated when personal credit cards pay for shared household expenses
- When a transaction is recorded on a credit card, the amount is added to the credit card debt balance
- When the user makes a payment from a personal account to the credit card, they can flag it as "Credit Card Repayment" which reduces the credit card debt balance
- When the user transfers money from another account to cover the credit card payment, the transfer is recorded separately and the credit card debt is reduced accordingly
- Credit card debt summary shows: card name, current balance, credit limit, available credit, status (Active/Paid/Partial), due date
- Monthly credit card view shows: month/year, statement balance, minimum payment, amount paid, remaining balance
- Alert when credit card payment is due (integrated with alert system)

#### CPF Mortgage Payment Tracking [Phase 3]
- Track mortgage payments made from CPF accounts
- When the user creates a mortgage record, they can enter: property address, loan amount, interest rate, monthly payment, CPF account(s) used, start date
- When the user records a monthly mortgage payment, they can specify: amount paid from CPF, amount paid from personal account, payment date
- Mortgage summary shows: total loan, total paid from CPF, total paid from personal, remaining balance, next payment date
- Monthly mortgage view shows: month/year, total payment, CPF contribution, personal contribution, remaining balance
- Alert when mortgage payment is missed (integrated with alert system)

### 2.14 Universal Item Operations [MVP]
Every module item supports:
- **Create** — add new item
- **Duplicate** — clone existing item with all fields (user can modify before saving)
- **Delete** — permanently remove item (with confirmation)
- **Archive** — soft-delete item, hide from default views, restore from archive
- Archive items excluded from calculations, charts, and reports unless explicitly viewed
- Archived recurring payments do NOT process (scheduler skips archived items)

### 2.15 CSV Import/Export [MVP]
- Transaction data import
- Export functionality
- Auto-create categories from imports: new category names encountered during import are automatically added to the categories list
- Category mapping during import: user can map imported category names to existing categories (e.g., "Groceries" → "Groceries", "Food" → "Groceries")

## 3. User Journeys

### UJ-001: Daily Transaction Entry & Recurring Payment Verification
**Actor:** Primary User (Ben) or Household Member
**Frequency:** Multiple times per day

1. User logs in via Google OAuth
2. User navigates to Transactions tab
3. User adds 5-10 transactions from daily spending (shopping, meals, transport)
4. For each transaction:
   - User enters amount in local currency
   - System auto-converts to SGD using daily FX rate
   - User reviews SGD amount; overrides if bank statement differs
   - FX delta and fees tracked automatically
5. User checks Recurring Payments tab for upcoming/processed items
6. User verifies recurring payments processed correctly for the period:
   - System shows recurring payments by date range
   - User confirms no missed occurrences
   - User can mark recurring payments as "verified" or flag issues
7. If recurring payment failed to process, user receives alert and can manually trigger

**Key Requirements:**
- Recurring payments can be scheduled ahead of time (multiple occurrences)
- Verification view shows all recurring payments in a date range
- Alert system notifies when recurring payments fail or are missed
- Quick-add transaction form for rapid daily entry

### UJ-002: Monthly Financial Review & Reconciliation
**Actor:** Any household member
**Frequency:** Monthly

1. User navigates to Accounts tab
2. User updates all account balances manually (reflecting actual bank balances)
3. User navigates to Credit Cards tab
4. User reconciles credit card statements:
   - Compares system transactions against credit card statement
   - Marks transactions as reconciled
   - Identifies any discrepancies
5. User navigates to Dashboard tab
6. User reviews:
   - Spending by category visualization
   - Budget vs actual variance
   - Income vs expenses trend
   - Net worth summary
7. User checks Budgets tab for any over-budget alerts
8. User reviews upcoming recurring payments for next month
9. User bulk-updates status of multiple items (e.g., mark multiple transactions as reconciled, or multiple recurring payments as verified)

**Key Requirements:**
- Account balance update with date stamp
- Credit card statement reconciliation workflow
- Visual budget variance reporting
- Category-based spending analysis
- Upcoming payment calendar view
- Bulk status update for multiple items in any module

### UJ-003: Annual Data Management & Setup
**Actor:** Any household member
**Frequency:** As needed (tax season, new bills, etc.)

1. User navigates to Settings > Data Management
2. User exports data for tax purposes:
   - Selects filters: date range, user/payer, category, currency, status, transaction type
   - Chooses export format (CSV)
   - Exports filtered transaction data
3. User sets up new recurring bills:
   - Creates new recurring payment entry
   - Sets frequency, amount, start date
   - System auto-schedules future occurrences
4. User archives existing recurring bills:
   - Marks recurring payments as inactive/archived
   - Provides option to export archived items
5. User can re-import archived data if needed

**Key Requirements:**
- Flexible CSV export with date range filtering
- Recurring payment lifecycle management (active/inactive/archived)
- Data re-import capability for restored/archived data
- Export format suitable for tax preparation

## 4. Non-Functional Requirements

### 4.1 Performance
- Dashboard charts render within 2 seconds for up to 12 months of data
- Transaction search returns results within 1 second
- CSV import/export handles files up to 10,000 rows

### 4.2 Security
- All data encrypted at rest (SQLite encryption via SQLCipher or application-level encryption)
- All API communications over HTTPS/TLS
- Google OAuth 2.0 for authentication — no password storage
- **Authentication Architecture**:
  - Server-side sessions stored in SQLite database (NOT JWT tokens)
  - Session model tracks: `user_id`, `expires_at`, `last_activity_at`, `ip_address`, `user_agent`
  - 30-minute session expiry with activity tracking — each request updates `last_activity_at`
  - HTTP-only cookies for session ID + X-Session-Id header for cross-port communication (backend :8000 → frontend :5173)
  - OAuth state tokens: database-stored single-use tokens prevent CSRF during OAuth flow (5-minute expiry)
- **CSRF Protection**:
  - Database-stored single-use tokens via `CsrfToken` model (`id`, `user_id`, `token`, `expires_at`, `used`, `created_at`)
  - Tokens fetched via `GET /api/auth/csrf-token` endpoint before any state-changing request
  - Middleware validates CSRF token on ALL non-GET requests (except auth endpoints)
  - Returns 403 for missing, invalid, expired, or already-used tokens
  - Tokens marked as `used=true` after single use — cannot be replayed
- **Role-Based Access Control**:
  - HouseholdRole hierarchy: owner(2) > admin(1) > member(0)
  - Helper functions (`require_role`, `require_household_member`) enforce permissions
  - All household members have equal access for MVP; role hierarchy enables future differentiation
- **Session Timeout**: 30-minute inactivity timeout with automatic redirect to login on 401 response
- **Audit Trail**: All data modifications (create/update/delete/archive) logged with: user ID, timestamp, action type, record ID, before/after values (where applicable)
- **Input Validation**: All user-supplied fields validated server-side:
  - Amounts: positive decimals, max 2 decimal places
  - Dates: valid YYYY-MM-DD format, cannot be in the future for transactions
  - Currencies: ISO 4217 3-letter codes only
  - Strings: max 255 characters, sanitized for XSS prevention
  - File uploads: CSV only, max 10,000 rows, validated schema before processing
- **SQL Injection Prevention**: All database queries use parameterized statements via SQLAlchemy ORM
- **XSS Prevention**: All user-generated content escaped in HTML rendering; React JSX auto-escapes by default

### 4.3 Reliability
- Recurring payments process daily with retry logic (up to 3 attempts)
- Database backups via Google Cloud Storage (daily automated backups)
- 99.9% uptime target (serverless architecture provides inherent redundancy)

### 4.4 Scalability
- Support 2-4 concurrent household users (MVP)
- Handle up to 50,000 transactions per user without performance degradation
- Horizontal scaling via Google Cloud Run auto-scaling (Phase 2+)

### 4.5 Cost Constraints
- $0/month hosting cost for MVP
- Free tiers only: Google Cloud Run (2GB memory, 1 CPU), Cloud Storage (5GB)
- ExchangeRate-API free tier (1 request/day, cached for 24 hours)
- No paid dependencies for MVP

### 4.6 Compatibility
- Responsive design for mobile, tablet, and desktop browsers
- Supported browsers: Chrome, Safari, Firefox, Edge (latest 2 versions)
- PWA support for mobile app-like experience (Phase 2)

### 4.7 Maintainability
- Clean separation of concerns (API, database, frontend)
- Comprehensive API documentation (OpenAPI/Swagger)
- Automated testing for critical paths (authentication, recurring payments, data import/export)
- Code comments and documentation for AI-assisted development

### 4.8 Data Retention
- 3 years of active data in database
- Older data archived to CSV with download prompt
- User can re-upload archived data if needed

### 4.9 Timezone
- Single shared timezone for all users
- Configurable in app settings

### 4.10 Error Handling
- All API endpoints return consistent error format: `{"error": "description", "code": "ERROR_CODE"}`
- Input validation on all user-supplied fields (amounts, dates, currencies)
- Graceful degradation when external services unavailable (FX API down → use cached rate)
- Database connection retry logic (up to 3 attempts with exponential backoff)

## 5. User Stories

### US-001: Google OAuth Login
**As a** household member,
**I want to** log in using my Google account,
**So that** I can access the system without remembering another password.

**Implementation Status:** ✅ COMPLETE (Story 1-1)

**Acceptance Criteria:**
- [x] AC-001: User clicks "Login with Google" button
- [x] AC-002: User is redirected to Google OAuth consent screen
- [x] AC-003: Upon consent, user is redirected back and logged in
- [x] AC-004: New users are automatically added to the household
- [x] AC-005: Primary user can manage (add/remove) household members

### US-002: Household Member Management
**As a** primary household user,
**I want to** add and manage household members,
**So that** my family can share and track finances together.

**Implementation Status:** ✅ COMPLETE (Story 1-2)

**Acceptance Criteria:**
- [x] AC-011: Primary user can invite members via email
- [x] AC-012: Invited members receive email with join link
- [x] AC-013: Invited members can accept invitation and join
- [x] AC-014: Primary user can remove members
- [x] AC-015: Members can view all household transactions
- [x] AC-016: Members can add/edit their own transactions

### US-003: View Dashboard
**As a** household member,
**I want to** see visual charts of my finances,
**So that** I can understand my financial health at a glance.

**Implementation Status:** 🟡 PARTIALLY COMPLETE (Basic dashboard UI exists, charts and visualizations pending)

**Acceptance Criteria:**
- [ ] AC-014: Dashboard displays a pie chart of spending by category for the selected period (default: current month), showing top 5 categories by amount with percentage labels
- [ ] AC-015: Dashboard displays a grouped bar chart comparing monthly income vs expenses for the last 6 months, with values in SGD
- [ ] AC-016: Dashboard displays net worth as a single summary card showing: total assets (sum of all account balances) minus total liabilities (sum of all debt balances), with month-over-month change percentage
- [ ] AC-017: Dashboard shows a table of upcoming recurring payments for the next 7 days, sorted by date, with columns: name, amount, due date, and status (pending/processed)
- [ ] AC-018: Dashboard layout adapts to mobile viewports (< 768px): charts stack vertically, tables scroll horizontally, navigation collapses to hamburger menu

### US-004: Set Up Recurring Payment
**As a** household member,
**I want to** set up a recurring payment,
**So that** automatic transactions are created without manual entry.

**Acceptance Criteria:**
- [ ] AC-019: User can create recurring payment with frequency (daily/weekly/monthly)
- [ ] AC-020: User can set start date and end date (end date is optional — if omitted, recurring continues indefinitely)
- [ ] AC-021: User can schedule multiple occurrences ahead of time
- [ ] AC-022: Recurring payment can be edited, paused, or deleted
- [ ] AC-023: System processes recurring payments daily via APScheduler
- [ ] AC-024: Processed recurring payments appear in transaction list
- [ ] AC-025: Recurring payment can be marked as active/inactive/archived

### US-005: Verify Recurring Payments
**As a** household member,
**I want to** verify recurring payments for a date range,
**So that** I can confirm no occurrences were missed.

**Acceptance Criteria:**
- [ ] AC-026: User can view recurring payments by date range
- [ ] AC-027: System shows expected vs actual processed occurrences
- [ ] AC-028: User can flag missed or failed occurrences
- [ ] AC-029: User can manually trigger a missed recurring payment
- [ ] AC-030: Alert displayed when recurring payment fails to process

### US-006: Monthly Account Reconciliation
**As a** household member,
**I want to** update account balances and reconcile credit card statements,
**So that** my records match actual bank statements.

**Acceptance Criteria:**
- [ ] AC-031: User can update account balance with date stamp
- [ ] AC-032: User can reconcile credit card transactions against statement
- [ ] AC-033: User can mark transactions as reconciled
- [ ] AC-034: Discrepancies between system and statement are highlighted
- [ ] AC-035: Reconciliation history is tracked

### US-007: Manage Categories
**As a** household member,
**I want to** create, edit, and manage spending categories,
**So that** I can organize my transactions and budgets with meaningful labels.

**Implementation Status:** 🟡 PARTIALLY COMPLETE (Story 2-1: Category Seeding ✅, Story 2-2: Category CRUD ✅, Story 2-3: Subcategories ⏳, Story 2-4: Merge Duplicates ⏳, Story 2-5: Import Mapping ⏳)

**Acceptance Criteria:**
- [x] AC-036: User can create default categories on-demand via "Create Default Categories" button (17 categories: 12 expense + 5 income templates)
- [x] AC-036.1: New households start with no categories; categories are created only when user clicks the Defaults button
- [x] AC-036.2: All categories are household-specific — no system-wide default categories exist
- [x] AC-037: User can create custom categories with name, color, icon, and type (Income/Expense/Both)
- [ ] AC-038: User can create subcategories by assigning a parent category
- [x] AC-039: User can edit category name, color, icon, and type
- [x] AC-040: User can archive categories (transactions retain the category reference but archived categories hidden from dropdowns)
- [ ] AC-041: User can merge duplicate categories (transactions reassigned to merged category)
- [x] AC-042: Categories appear in dropdowns when creating/editing transactions, recurring payments, and budgets
- [x] AC-043: Categories with color codes displayed in charts and visualizations

### US-008: Import/Export Data
**As a** household member,
**I want to** import and export transaction data,
**So that** I can manage data for tax purposes and migration.

**Acceptance Criteria:**
- [ ] AC-044: User can export transactions with filters (date range, user/payer, category, currency, status, transaction type)
- [ ] AC-045: Export format is CSV suitable for tax preparation
- [ ] AC-046: User can upload CSV file through UI
- [ ] AC-047: System validates CSV format and reports errors
- [ ] AC-048: Imported transactions appear in transaction list
- [ ] AC-049: User can re-import archived data if needed
- [ ] AC-050: New category names from imported CSV are auto-created in the categories list
- [ ] AC-051: User can map imported category names to existing categories during import (e.g., "Food" → "Groceries")

### US-009: Receive Alerts
**As a** household member,
**I want to** receive alerts for important events,
**So that** I can take action promptly.

**Acceptance Criteria:**
- [ ] AC-052: Alert when recurring payment fails to process
- [ ] AC-053: Alert when budget threshold exceeded (configurable)
- [ ] AC-054: Alert when credit card reconciliation has discrepancies
- [ ] AC-055: Alert when credit card payment is due
- [ ] AC-056: Alert when mortgage payment is missed
- [ ] AC-057: Alerts visible in dashboard notification area
- [ ] AC-058: Alerts can be dismissed or marked as resolved

### US-010: API Rate Limiting Protection
**As a** system administrator,
**I want to** enforce API rate limits per user with configurable thresholds,
**So that** the API is protected from abuse and excessive requests.

**Acceptance Criteria:**
- [ ] AC-059: API enforces rate limits per user with sliding window algorithm
- [ ] AC-060: Default rate limit is 100 requests per minute per user
- [ ] AC-061: Rate limits are configurable per endpoint category (e.g., read endpoints: 100/min, write endpoints: 20/min)
- [ ] AC-062: When rate limit is exceeded, user receives 429 Too Many Requests response with Retry-After header
- [ ] AC-063: Response includes rate limit headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
- [ ] AC-064: Rate limit window resets after the configured time period
- [ ] AC-065: Rate limiting does not interfere with legitimate bulk operations (e.g., CSV import/export)
- [ ] AC-066: Admin can view per-user request counts and 429 response logs

## 6. Technical Specifications

### 6.1 Architecture
- **Backend**: Python with FastAPI
- **Database**: SQLite with WAL mode
- **ORM**: SQLAlchemy
- **Task Scheduler**: APScheduler
- **Authentication**: Google OAuth 2.0
- **Hosting**: Google Cloud Run
- **Frontend**: React with Chart.js
- **Containerization**: Docker

### 6.2 Data Model

**Debt Calculation Logic:**
- Debt is auto-derived from transactions tagged to accounts flagged as "Debt Accounts"
- When a transaction is recorded from a flagged personal account, the amount is added to the corresponding owner's debt balance
- When money is transferred from the shared account to a personal account, the user can flag it as a "Debt Repayment" — this reduces the debt balance
- Monthly debt ledger shows: month/year, calculated debt, repayment amount, remaining balance

#### Transaction Item Fields
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Transaction ID | UUID | Yes | Unique identifier |
| Date | Date | Yes | Transaction date |
| Name | String | Yes | Transaction description |
| Currency | String | Yes | ISO 4217 currency code |
| Amount | Decimal | Yes | Amount in selected currency |
| Auto-converted SGD | Decimal | Yes | Auto-calculated SGD equivalent |
| SGD Override | Decimal | No | User override if bank differs |
| FX Rate Delta | Decimal | Yes | Difference between API rate and actual |
| Fee Amount | Decimal | No | Transaction fee (optional) |
| Payer | String | Yes | User who created transaction |
| Type | Enum | Yes | Income/Expense/Transfer |
| Payment Method | String | Yes | Bank transfer/Credit Card/etc. |
| Category ID | UUID | Yes | Reference to Category table |
| Description | Text | No | Additional notes |
| Status | Enum | Yes | Pending/Completed/Canceled |
| GST Claimable | Boolean | No | GST applicable flag |
| Gift | Boolean | No | Gift transaction flag |
| Created At | DateTime | Yes | Record creation timestamp |
| Updated At | DateTime | Yes | Last modification timestamp |
| Archived | Boolean | Yes | Soft-delete flag |

#### Recurring Payment Fields
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Recurring ID | UUID | Yes | Unique identifier |
| Name | String | Yes | Payment description |
| Amount | Decimal | Yes | Amount per occurrence |
| Currency | String | Yes | ISO 4217 currency code |
| Frequency | Enum | Yes | Daily/Weekly/Monthly/Yearly |
| Start Date | Date | Yes | First occurrence date |
| End Date | Date | No | Last occurrence date (omit for indefinite) |
| Category ID | UUID | Yes | Reference to Category table |
| Payment Method | String | Yes | Account/payment method |
| Status | Enum | Yes | Active/Inactive/Archived |
| Total Occurrences Scheduled | Integer | Yes | Number of occurrences created |
| Next Occurrence Date | Date | Yes | Next scheduled date |

#### Account Fields
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Account ID | UUID | Yes | Unique identifier |
| Name | String | Yes | Account name |
| Type | Enum | Yes | Bank/Credit Card/Savings/Cash |
| Currency | String | Yes | Primary currency |
| Current Balance | Decimal | Yes | Last updated balance |
| Last Updated | Date | Yes | Balance update date |
| Institution | String | No | Bank/institution name |
| Status | Enum | Yes | Active/Archived |

#### Budget Fields
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Budget ID | UUID | Yes | Unique identifier |
| Name | String | Yes | Budget name |
| Category ID | UUID | Yes | Reference to Category table |
| Amount | Decimal | Yes | Budget limit |
| Currency | String | Yes | Currency |
| Period | Enum | Yes | Monthly/Quarterly/Yearly |
| Start Date | Date | Yes | Budget start date |
| End Date | Date | Yes | Budget end date |
| Status | Enum | Yes | Active/Archived |
#### Category Fields
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Category ID | UUID | Yes | Unique identifier |
| Name | String | Yes | Category name (e.g., "Groceries", "Transport") |
| Color | String | No | Hex color code for visualization (e.g., "#FF5733") |
| Icon | String | No | Icon identifier (e.g., "shopping-cart", "car") |
| Parent Category ID | UUID | No | Reference to parent category for subcategories |
| Type | Enum | Yes | Income/Expense/Both |
| Is Default | Boolean | Yes | False for all categories (retained for schema compatibility; no categories are system-wide defaults) |
| Status | Enum | Yes | Active/Archived |
| Created At | DateTime | Yes | Record creation timestamp |
| Updated At | DateTime | Yes | Last modification timestamp |
| Archived | Boolean | Yes | Soft-delete flag |
#### Credit Card Fields
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Card ID | UUID | Yes | Unique identifier |
| Name | String | Yes | Card name |
| Institution | String | Yes | Bank/institution |
| Currency | String | Yes | Card currency |
| Current Balance | Decimal | Yes | Outstanding balance |
| Credit Limit | Decimal | Yes | Maximum credit |
| Due Date | Day | Yes | Monthly payment due day |
| Status | Enum | Yes | Active/Archived |

#### Capital/Investment Fields
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Investment ID | UUID | Yes | Unique identifier |
| Name | String | Yes | Investment name |
| Type | Enum | Yes | Stock/Fund/Bond/Other |
| Current Value | Decimal | Yes | Current market value |
| Cost Basis | Decimal | Yes | Total invested amount |
| Currency | String | Yes | Currency |
| Status | Enum | Yes | Active/Archived |

#### Asset Fields
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Asset ID | UUID | Yes | Unique identifier |
| Name | String | Yes | Asset name |
| Type | Enum | Yes | Property/Vehicle/Other |
| Purchase Date | Date | Yes | Acquisition date |
| Purchase Value | Decimal | Yes | Purchase price |
| Current Value | Decimal | No | Estimated current value |
| Depreciation Method | String | No | Depreciation calculation method |
| Status | Enum | Yes | Active/Archived |

#### Insurance Policy Fields
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Policy ID | UUID | Yes | Unique identifier |
| Provider | String | Yes | Insurance provider |
| Type | Enum | Yes | Life/Health/Property/Other |
| Premium | Decimal | Yes | Premium amount |
| Frequency | Enum | Yes | Payment frequency |
| Coverage Amount | Decimal | Yes | Coverage limit |
| Start Date | Date | Yes | Policy start date |
| End Date | Date | Yes | Policy expiry date |
| Status | Enum | Yes | Active/Archived |

#### Debt Fields
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Debt ID | UUID | Yes | Unique identifier |
| Debt Name | String | Yes | Description of the debt (e.g., "Ben's personal account") |
| Owner | String | Yes | Household member who owns the debt |
| Linked Account | UUID | Yes | Personal account that contributes to this debt |
| Currency | String | Yes | Currency type (e.g., SGD, USD) |
| Current Balance | Decimal | Yes | Amount owed to this person |
| Status | Enum | Yes | Active/Paid/Partial |
| Latest Paid Date | Date | No | Date of most recent repayment |
| Monthly Remaining | Decimal | No | Manually noted remaining balance for current month |
| Created At | DateTime | Yes | Record creation timestamp |
| Updated At | DateTime | Yes | Last modification timestamp |
| Archived | Boolean | Yes | Soft-delete flag |

#### Debt Account Fields
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Account ID | UUID | Yes | Unique identifier |
| Name | String | Yes | Account name |
| Type | Enum | Yes | Bank/Credit Card/Savings/Cash |
| Currency | String | Yes | Primary currency |
| Current Balance | Decimal | Yes | Last updated balance |
| Last Updated | Date | Yes | Balance update date |
| Institution | String | No | Bank/institution name |
| Is Debt Account | Boolean | Yes | Flag — if true, transactions from this account contribute to internal debt |
| Status | Enum | Yes | Active/Archived |

#### Transfer Fields
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Transfer ID | UUID | Yes | Unique identifier |
| From Account | UUID | Yes | Source account |
| To Account | UUID | Yes | Destination account |
| Amount | Decimal | Yes | Transfer amount |
| Currency | String | Yes | Transfer currency |
| Date | Date | Yes | Transfer date |
| Status | Enum | Yes | Pending/Completed/Canceled |

### 6.3 API Endpoints

#### Authentication & Session Management ✅ Implemented
| Method | Endpoint | Description | Status |
|--------|----------|-------------|--------|
| GET | `/auth/login` | Embedded HTML login page | ✅ |
| GET | `/auth/google` | Initiate Google OAuth flow | ✅ |
| GET | `/auth/google/callback` | OAuth callback handler | ✅ |
| GET | `/auth/logout` | Destroy session, clear cookies | ✅ |
| GET | `/auth/me` | Get current user profile | ✅ |
| GET | `/auth/csrf-token` | Generate single-use CSRF token | ✅ |
| POST | `/auth/csrf-token/validate` | Validate CSRF token | ✅ |

#### Household Management ✅ Implemented
| Method | Endpoint | Description | Status |
|--------|----------|-------------|--------|
| POST | `/api/households/` | Create new household | ✅ |
| GET | `/api/households/my-household` | Get current user's household | ✅ |
| GET | `/api/households/{household_id}` | Get specific household details | ✅ |
| GET | `/api/households/{household_id}/members` | List household members | ✅ |
| PATCH | `/api/households/{household_id}/members/{member_id}` | Update member role | ✅ |
| POST | `/api/households/{household_id}/members/invite` | Invite new member (email) | ✅ |

#### Invitation Management ✅ Implemented
| Method | Endpoint | Description | Status |
|--------|----------|-------------|--------|
| GET | `/api/households/my-invitations` | List pending invitations for user | ✅ |
| GET | `/api/households/invitations/{id}` | Get invitation details | ✅ |
| POST | `/api/households/invitations/{id}/accept` | Accept invitation (join household) | ✅ |
| DELETE | `/api/households/invitations/{id}/decline` | Decline invitation | ✅ |
| POST | `/api/households/invitations/{id}/resend` | Resend invitation link | ✅ |
| POST | `/api/invitations/{id}/accept` | Standalone accept flow (email-matching) | ✅ |

#### Category Management ✅ Implemented
| Method | Endpoint | Description | Status |
|--------|----------|-------------|--------|
| GET | `/api/categories` | List categories (with filters) | ✅ |
| POST | `/api/categories` | Create new category | ✅ |
| PUT | `/api/categories/{id}` | Update category | ✅ |
| DELETE | `/api/categories/{id}` | Archive category (soft delete) | ✅ |
| PATCH | `/api/categories/{id}/restore` | Restore archived category | ✅ |
| DELETE | `/api/categories/{id}/permanent` | Permanently delete category | ✅ |
| GET | `/api/categories/tree` | Get hierarchical category tree | ✅ |
| GET | `/api/categories/seed-status` | Check if defaults created for household | ✅ |
| GET | `/api/categories/{id}/spending-summary` | Get spending rollup for category | ✅ |
| PATCH | `/api/categories/{id}/reassign-children` | Reassign children to new parent | ✅ |
| POST | `/api/categories/create-defaults` | Create 17 default categories | ✅ |

#### Dashboard ⏳ Planned
| Method | Endpoint | Description | Status |
|--------|----------|-------------|--------|
| GET | `/api/dashboard` | Dashboard data aggregation | ⏳ |

#### Transactions ⏳ Planned (Model Exists)
| Method | Endpoint | Description | Status |
|--------|----------|-------------|--------|
| GET | `/api/transactions` | List transactions | ⏳ |
| POST | `/api/transactions` | Create transaction | ⏳ |
| PUT | `/api/transactions/{id}` | Update transaction | ⏳ |
| DELETE | `/api/transactions/{id}` | Delete transaction | ⏳ |
| POST | `/api/transactions/{id}/duplicate` | Duplicate transaction | ⏳ |
| PATCH | `/api/transactions/{id}/archive` | Archive transaction | ⏳ |

#### Budgets ⏳ Planned (Model Exists)
| Method | Endpoint | Description | Status |
|--------|----------|-------------|--------|
| GET | `/api/budgets` | List budgets | ⏳ |
| POST | `/api/budgets` | Create budget | ⏳ |
| PUT | `/api/budgets/{id}` | Update budget | ⏳ |
| DELETE | `/api/budgets/{id}` | Delete budget | ⏳ |

#### Recurring Payments ⏳ Planned (Model Exists)
| Method | Endpoint | Description | Status |
|--------|----------|-------------|--------|
| GET | `/api/recurring` | List recurring payments | ⏳ |
| POST | `/api/recurring` | Create recurring payment | ⏳ |
| PUT | `/api/recurring/{id}` | Update recurring payment | ⏳ |
| DELETE | `/api/recurring/{id}` | Delete recurring payment | ⏳ |
| POST | `/api/recurring/{id}/trigger` | Manually trigger occurrence | ⏳ |

#### Other Modules ⏳ Planned
| Method | Endpoint | Description | Status |
|--------|----------|-------------|--------|
| GET/POST | `/api/accounts` | List/Create accounts | ⏳ |
| PUT | `/api/accounts/{id}` | Update account | ⏳ |
| PATCH | `/api/accounts/{id}/balance` | Update account balance | ⏳ |
| GET/POST | `/api/capital` | List/Create investments | ⏳ |
| PUT/DELETE | `/api/capital/{id}` | Update/Delete investment | ⏳ |
| GET/POST | `/api/assets` | List/Create assets | ⏳ |
| PUT/DELETE | `/api/assets/{id}` | Update/Delete asset | ⏳ |
| GET/POST | `/api/credit-cards` | List/Create credit cards | ⏳ |
| PUT/DELETE | `/api/credit-cards/{id}` | Update/Delete credit card | ⏳ |
| GET/POST | `/api/insurance` | List/Create insurance policies | ⏳ |
| PUT/DELETE | `/api/insurance/{id}` | Update/Delete policy | ⏳ |
| GET/POST | `/api/debt` | List/Create debts | ⏳ |
| PUT/DELETE | `/api/debt/{id}` | Update/Delete debt | ⏳ |
| POST/GET | `/api/transfers` | Create/List transfers | ⏳ |
| PUT/DELETE | `/api/transfers/{id}` | Update/Delete transfer | ⏳ |
| GET | `/api/alerts` | List alerts | ⏳ |
| PATCH | `/api/alerts/{id}` | Dismiss/resolve alert | ⏳ |
| POST | `/api/import/csv` | CSV import | ⏳ |
| GET | `/api/export/csv` | CSV export | ⏳ |
| GET | `/api/health` | Health check | ⏳ |

### 6.4 Cost Protection Mechanisms
- API rate limiting on all endpoints
- Request quotas for external APIs
- Circuit breakers for ExchangeRate-API
- Google Cloud budget alerts ($5/month limit)
- Daily backup to Google Cloud Storage (5GB free tier)

## 7. Glossary
| Term | Definition |
|------|------------|
| Household | A single family unit (2-4 members) sharing finances, the sole tenant of the application |
| Account | A financial container (bank, credit card, savings, cash) holding balances |
| Transaction | A single financial event (income, expense, or transfer) with amount, currency, and category |
| Recurring Payment | A template that auto-generates transactions on a defined schedule (daily/weekly/monthly/yearly) |
| Debt | Internal obligation between household members when one person pays for a shared expense from their personal account |
| Credit Card Debt | Debt generated when a personal credit card is used for shared household expenses; repaid via transfers from other accounts |
| CPF Mortgage | Mortgage payments made from CPF (Central Provid Fund) accounts toward a household property loan |
| FX Rate Delta | The difference between the system's auto-converted SGD amount and the user's manual SGD override on a transaction |
| Budget | A spending limit set for a category over a period (monthly/quarterly/yearly) |
| Capital/Investment | Financial instruments (stocks, funds, bonds) tracked for portfolio value |
| Asset | Physical property (property, vehicle) with purchase and current value tracking |
| Insurance Policy | A coverage contract with provider, premium, and coverage amount details |
| Transfer | Movement of funds between two accounts within the household |
| Category | A label (e.g., Groceries, Transport) used to classify transactions, budgets, and recurring payments |
| Subcategory | A child category under a parent category (e.g., "Dining Out" under "Food") |
| Reconciliation | The process of verifying system records match actual bank/credit card statements |
| SGD Override | Manual override of the auto-converted SGD amount when the bank statement differs from the FX-converted value |
| PWA | Progressive Web App — a web app that provides an app-like experience on mobile browsers |

## 8. MVP Scope

### Phase 1 (Core)
- Google OAuth authentication
- Category management with default categories
- Transaction CRUD with category references
- Account management
- Recurring payments with APScheduler
- Dashboard with Chart.js visualizations
- CSV import/export with auto-create categories
- Multi-currency support with SGD override

### Phase 2 (Enhancement)
- Budgets module
- Capital/investments tracking
- Credit card management
- Inter-account transfers
- Advanced transaction filtering

### Phase 3 (Advanced)
- Assets with depreciation tracking
- Insurance policy tracking
- Debt tracking
- Advanced visualizations
- Transaction reconciliation

## 7. Data Migration and Seed Strategy

### 7.1 Default Category Templates (On-Demand Creation)
- Categories are NOT auto-created on first setup or household creation
- User clicks "Create Default Categories" button in the Category Manager UI to create a suggested set
- Template data is stored in `backend/database.py` as `DEFAULT_EXPENSE_CATEGORIES` (12 categories) and `DEFAULT_INCOME_CATEGORIES` (5 categories)
- When user clicks Defaults, `create_default_categories_for_household()` creates all 17 categories as regular household-specific categories:
  - Groceries (Food & Dining, #4CAF50, shopping-cart icon)
  - Transport (Transportation, #2196F3, car icon)
  - Utilities (Bills & Utilities, #FF9800, lightning icon)
  - Entertainment (Leisure, #9C27B0, film icon)
  - Healthcare (Health, #F44336, medical icon)
  - Education (Education, #3F51B5, school icon)
  - Shopping (Personal Care, #00BCD4, shopping-bag icon)
  - Dining (Food & Dining, #E91E63, restaurant icon)
  - Travel (Transportation, #607D8B, flight icon)
  - Bills (Bills & Utilities, #795548, bill icon)
  - Savings (Savings & Investments, #1DE9B6, piggy-bank icon)
  - Other (Miscellaneous, #9E9E9E, more icon)
  - Salary (Income, #4CAF50, money icon)
  - Freelance (Income, #2196F3, briefcase icon)
  - Investments (Income, #FF9800, chart icon)
  - Gifts (Income, #9C27B0, gift icon)
  - Other Income (Income, #9E9E9E, plus icon)
- Each category has: name, color (hex), icon identifier, type (Income/Expense/Both), is_default=False, household_id set
- No system-wide default categories exist (household_id IS NULL) — all categories belong to a specific household

### 7.2 CSV Import Schema
- Supported columns (all optional except Date, Amount, Currency):
  | Column | Type | Required | Description |
  |--------|------|----------|-------------|
  | Date | Date (YYYY-MM-DD) | Yes | Transaction date |
  | Name | String | Yes | Transaction description |
  | Amount | Decimal | Yes | Transaction amount |
  | Currency | String (ISO 4217) | Yes | e.g., SGD, USD, EUR |
  | Category | String | No | Category name (auto-created if not exists) |
  | Payer | String | No | User who created transaction |
  | Type | Enum | No | Income/Expense/Transfer (defaults to Expense) |
  | Description | Text | No | Additional notes |
  | Status | Enum | No | Pending/Completed/Canceled (defaults to Completed) |
  | Fee Amount | Decimal | No | Transaction fee |
  | GST Claimable | Boolean | No | GST applicable flag |
  | Gift | Boolean | No | Gift transaction flag |
- Import validation: system reports row-level errors (invalid dates, negative amounts, missing required fields)
- Duplicate detection: transactions with same Date + Name + Amount + Currency are flagged as potential duplicates

### 7.3 CSV Export Schema
- Exported CSV includes all Transaction Item Fields from §6.2 data model
- Exported CSV can be re-imported to restore data (round-trip compatible)
- Archived items excluded from export unless explicitly selected

### 7.4 Archive Restoration
- Archived CSV can be re-imported to restore data
- System detects and merges with existing records (prevents duplicates)
- User can preview restore before committing

## 8. Assumptions
1. Household has Google accounts for OAuth login
2. ExchangeRate-API free tier (1 request/day) is sufficient
3. In-app alerts are sufficient for notifications (email notifications deferred to Phase 3 if needed)
4. Google Cloud Storage 5GB free tier is sufficient for backups
5. All household members are comfortable with web application
6. No native mobile app required (responsive web sufficient)
7. Single timezone for entire household
8. SQLite WAL mode handles 2-4 concurrent users adequately
9. APScheduler in-process scheduling sufficient for daily recurring payments
10. No complex multi-tenant architecture needed
11. FX rate updates daily are sufficient for household tracking
12. CSV format for archive is acceptable for long-term data retention

## 9. Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| ExchangeRate-API rate limit exceeded | Low | Cache rates, daily update sufficient |
| SQLite concurrent write conflicts | Low | WAL mode, light usage profile |
| Google Cloud Run cold starts | Low | Acceptable for personal use |
| Data loss | High | Daily backups to GCS |
| Cost overruns | High | Budget alerts, circuit breakers |
| APScheduler lost on scale-to-zero | High | Google Cloud Scheduler triggers Cloud Run job on schedule (Phase 2) |

## 10. Decision Log
See `.decision-log.md` for canonical decision record.

## 11. Open Questions
| # | Question | Impact | Owner | Status |
|---|----------|--------|-------|--------|
| Q1 | How to handle APScheduler when Cloud Run scales to 0? | Recurring payments may not process during idle periods | Winston | Open — consider Google Cloud Scheduler for Phase 2 |
| Q2 | What is the exact formula for auto-derived debt calculation? | Debt module implementation depends on this | Winston | Open — needs calculation specification |
| Q3 | Should CSV import support Excel (.xlsx) format? | Affects import complexity | Amelia | Open — MVP limited to CSV only |
| Q4 | How to handle timezone changes mid-year? | Affects recurring payment scheduling | Sally | Open — single timezone enforced, no change support in MVP |
| Q5 | What is the maximum CSV file size for import? | Affects performance and memory | Amelia | Open — 10,000 rows limit documented in NFR 4.1 |

---

*This PRD is in DRAFT status. Pending resolution of validation findings before re-finalization.*
