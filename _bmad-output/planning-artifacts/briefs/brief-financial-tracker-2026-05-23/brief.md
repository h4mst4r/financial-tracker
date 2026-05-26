---
title: Financial Tracker Web Application
status: living
created: 2026-05-23
updated: 2026-05-25
revisionNote: "Synchronized with implementation reality after Epic 1 (complete) and Epic 2 (complete). Fixed PostgreSQL→SQLite conflict in Assumption 9. Replaced 'Email Notifications' assumption with 'Invitation System' (in-app only, no emails sent). Updated MVP status to reflect completed stories.

> **Implementation Progress:** See `../implementation-artifacts/sprint-status.yaml` for canonical implementation progress.
---

# Financial Tracker Web Application

## Problem Statement

The household currently manages finances through a complex Google Sheets document with multiple formulas, Google Apps Script, and auto-running capabilities. The system allows multiple household members to update transactions, but requires manual reconciliation against bank statements every few days, monthly manual balance entries, and manual discrepancy checking. The system is error-prone, difficult to maintain, and lacks proper visualization.

## Product Vision

A self-hosted, multi-user financial tracking web application that replaces the current Google Sheets setup with a proper database-backed system featuring automated recurring payments, multi-currency support with daily FX rates, visual dashboards with charts, and CSV import/export for tax purposes.

## Target Users

- **Primary:** Household members (2-4 people) who need to track and manage shared and individual finances
- **Primary User:** Ben (technical, familiar with Python, manages the system)
- **Secondary:** Other household members who need to view and update transactions

## Core Requirements

### Multi-User System
- Individual user accounts with login capability
- User-specific budgets and spending limits
- Shared household budgets for common expenses (food, insurance, transportation)
- Transaction attribution (who paid, who received)
- **Audit trail:** Every change logged with user, timestamp, and before/after values — implemented from day one

### Financial Domain Model
Every financial item includes:
- ID, Date, Name, Amount, Currency, Transaction Type (Inflow/Outflow)
- Payer, Payee, Payment Method, Category, Status (Paid/Pending/Cancelled)
- Optional attributes

### Tabs/Modules

1. **Dashboard** — Today's date, current user, quick-fill table per person per account, charts section
2. **Budgets** — Per-person and shared budgets by category, currency conversion display, positive/negative expenditure tracking
3. **Accounts** — Bank accounts with balance tracking, monthly/yearly spreadsheets, transfers, reserved amounts
4. **Capital** — Investment accounts (stocks, cash funds, dividends), compounding interest estimation
5. **Assets** — Physical assets (property, cars), depreciation tracking, loan interest accrual
6. **Credit Cards** — Credit limit, bonus points, annual fees, billing cycles, inflow/outflow tracking
7. **Insurance** — Policy details, coverage types (Death, TPD, CI, Early CI, PA, Hospital), premium tracking in SGD
8. **Recurring Payments** — Automatic transaction creation on billing dates, natural language date descriptions
9. **Transactions** — Core transaction management, duplicate detection, auto-convert with override, GST/gift flags

Each Transaction Item consists of:
- Transaction ID
- Transaction Date
- Transaction Name
- Currency Type
- Amount (original currency)
- Auto-converted SGD Amount (based on daily FX rate, shown as reference)
- SGD Amount (auto-filled from FX rate, user can override based on bank statement)
- FX Rate Delta (difference between API rate and actual charged amount — captures forex loss)
- Fee Amount (optional — card fees, conversion fees, etc.)
- Payer
- Transaction Type (Inflow/Outflow)
- Payment Method
- Category
- Description
- Status (Paid/Pending/Cancelled)
- GST Claimable?
- Gift?
10. **Transfers** — Internal account transfers (not inflow/outflow), live rate with manual override
11. **Debt** — Internal household debt tracking, auto-derived from flagged transactions, repayment tracking

### Recurring Payments
- Natural language billing dates (Every Sunday, 3rd of every month, Every 31 Days, February 27, Yearly)
- Automatic transaction creation/removal on billing dates
- Start/end dates, status tracking

### Multi-Currency Support
- Base currency configurable (currently SGD, visualization in NZD/SGD)
- Daily FX rate fetch from free API, stored in database
- Currency conversion for budgets and visualization
- **Auto-convert with override:** System auto-fills SGD amount using daily FX rate; user can override when bank statement shows different amount (due to fees, card FX rate, etc.)
- **Forex loss tracking:** System calculates and displays delta between API rate and actual charged amount per transaction
- **Fee tracking:** Optional fee field per transaction to capture card fees, conversion fees, etc.
- Track and display currency comparison in histogram

### Data Management
- CSV import for initial data migration from Google Sheets
- CSV export for tax calculation
- Archive-then-hard-delete pattern
- Daily/monthly/yearly data storage
- Filter/sort by time period, category, attributes

### Visualization
- Pie charts, histograms, bar charts for expenses, income, categories, currency types
- Currency comparison histograms
- Monthly/yearly loss/gain analysis
- Budget vs actual comparison

## Technical Architecture

### Backend
- **Language:** Python (preferred for familiarity and ease of troubleshooting)
- **Framework:** FastAPI (recommend for modern API-first approach, lightweight footprint)
- **Database:** SQLite (WAL mode) — zero cost, sufficient for 2-4 concurrent users, no separate server needed
- **ORM:** SQLAlchemy (lightweight, works well with SQLite)
- **Authentication:** Google OAuth 2.0 (via Google Cloud Identity) — seamless login for household members already using Google accounts
- **Session Management:** Server-side sessions stored in SQLite database — 30-minute expiry with `last_activity_at` tracking, HTTP-only cookies + X-Session-Id header for cross-port communication
- **CSRF Protection:** Database-stored single-use tokens via `CsrfToken` model — middleware validates on all non-GET requests, returns 403 for missing/invalid/expired tokens
- **Task Scheduler:** APScheduler (in-process, no Redis/Celery needed) — runs daily cron for recurring payments

### Frontend
- **Framework:** React or Vue.js (recommend React for ecosystem and component reusability)
- **UI Library:** Material-UI or Tailwind CSS + Headless UI
- **Charts:** Chart.js or Recharts
- **State Management:** Redux or Zustand

### Deployment
- **Hosting:** Google Cloud Run (serverless, container-based) or Google Compute Engine (VM) — integrates seamlessly with Google OAuth, auto-scaling, pay-per-use pricing
- **Containerization:** Docker with docker-compose
- **Reverse Proxy:** Nginx (or Cloud Run built-in)
- **SSL:** Let's Encrypt (certbot) or Google-managed certificates
- **Database Backup:** Automated daily backups to Google Cloud Storage

### External Services
- **FX Rates:** ExchangeRate-API or exchangerate.host (free tier available)
- **Email:** SendGrid or Mailgun for password reset and notifications (nice-to-have)

### Cost Protection (Zero-Cost Guarantee)
Every external service has safeguards to prevent runaway costs:

**API Rate Limiting**
- FX API: Max 1 request/day (daily cron), cached for 24 hours
- Email API: Max 50 emails/day (budget alerts, reminders)
- Google OAuth: Rate limited by Google, no cost to us

**Request Quotas**
- All API calls bounded by design — no loops, no retries without user action
- Bulk operations (CSV import) capped at 10,000 records per upload
- No background polling — everything event-driven or scheduled

**Circuit Breakers**
- FX API fallback: If API fails, use last known rate (no retry storms)
- Email fallback: Queue failed emails, retry max 3 times over 24 hours
- Any external service failure degrades gracefully, never explodes

**Cloud Budget Alerts**
- Set Google Cloud budget at $5/month with alerts at 50%, 100%, 150%
- Auto-disable non-critical services if budget exceeded (manual review required)
- Monthly cost review notification to primary user

**Monitoring**
- Simple health check endpoint — logs all external API calls
- Daily cron summary: API calls made, costs incurred, anomalies detected
- Primary user gets weekly cost report (email or dashboard notification)

## MVP Scope

> **Story breakdown:** See `../epics.md` for the complete epic and story list.
> **Implementation progress:** See `../../implementation-artifacts/sprint-status.yaml` for canonical implementation progress.

### Phase 1 (MVP)
- User authentication and authorization — Google OAuth, server-side sessions, HTTP-only cookies, CSRF protection
- Household management — Create household, role hierarchy: owner/admin/member, member invite/accept/decline/resend
- Invitation system — In-app only, email-matching flow, 7-day expiry
- Category management — CRUD with validation, subcategory hierarchy max 2 levels, archive + permanent delete, spending rollup
- Default category templates — 17 templates: 12 expense + 5 income, on-demand creation via UI button
- Core transaction management (create, read, update, delete)
- Basic accounts (bank accounts)
- Recurring payments with natural language dates
- Dashboard with basic charts
- CSV import/export
- Multi-currency with daily FX rates

### Phase 2
- Budgets (per-person and shared)
- Capital/investment accounts
- Credit card tracking
- Transfers between accounts
- Advanced filtering and sorting

### Phase 3
- Assets with depreciation
- Insurance policy tracking
- Debt tracking
- Advanced visualizations and currency comparison histograms
- Automated reconciliation suggestions

## Assumptions

1. **Deployment:** Google Cloud Run (serverless) or Google Compute Engine (VM) — integrates with Google OAuth, auto-scaling, pay-per-use
2. **Authentication:** Google OAuth 2.0 — household members log in with existing Google accounts
3. **Data Sensitivity:** Personal/household use only — no specific compliance requirements beyond basic data protection
4. **Transaction SGD Override:** System auto-fills SGD using daily FX rate; user overrides when bank statement differs (due to fees, card FX rate, etc.). Override is source of truth. FX delta and fees are tracked separately.
5. **Recurring Payment Processing:** Daily cron job checks for upcoming billing dates and creates transactions
6. **Duplicate Detection:** Rule-based matching on amount, date proximity, and description similarity
7. **Natural Language Dates:** Parsed using dateutil and custom rules for common patterns
8. **Chart Library:** Chart.js for frontend — good balance of features and ease of use
9. **Database:** SQLite (WAL mode) — zero cost, sufficient for 2-4 concurrent users, no separate server needed
10. **Backup Strategy:** Daily automated backups to Google Cloud Storage
11. **Audit Trail:** Implemented from day one — every change logged with user, timestamp, and before/after values
12. **Invitation System:** In-app invitations only — no actual emails sent (email notifications deferred to Phase 3). Email-matching flow: inviter enters invitee's email; system matches against Google OAuth profile on login. Invitations expire after 7 days.

## Success Criteria

- Replaces Google Sheets as primary financial tracking system
- All household members can independently update transactions
- Recurring payments automatically created without manual intervention
- Multi-currency visualization works seamlessly
- CSV import/export functions correctly for tax purposes
- Dashboard provides clear visual overview of household finances
- System is maintainable and extensible for future features

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Complex migration from Google Sheets | High | Phased migration, validate data integrity |
| Recurring payment timing issues | Medium | Daily cron with configurable timezone |
| FX rate API reliability | Medium | Cache rates, fallback to last known rate |
| Multi-user concurrency conflicts | Medium | Optimistic locking, clear audit trail |
| Data loss | High | Automated backups, archive-then-delete pattern |

## Open Questions

- [x] **Hosting:** Google Cloud Run (PaaS) — confirmed
- [x] **Authentication:** Google OAuth 2.0 — confirmed
- [x] **Mobile:** Responsive web only — works on phone browser, no native app
- [x] **Data retention:** 3 years active, older data archived to CSV with download prompt. User can re-upload archived data if needed.
- [x] **Performance:** Light usage — ~100 transactions, 2-4 users, no special optimization needed
- [x] **Timezone:** Single shared timezone for all users, configurable in app settings (household may relocate)
