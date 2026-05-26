---
stepsCompleted: [1, 2]
inputDocuments: [
  "prd-financial-tracker-2026-05-24",
  "architecture-financial-tracker-2026-05-24",
  "ux-design-specification-2026-05-24",
  "brief-financial-tracker-2026-05-23"
]
project_name: "Financial Tracker"
date: "2026-05-24"
status: in-progress
epic1_status: finalized
epic1_finalized_date: "2026-05-24"
epic2_status: finalized
epic2_planning_date: "2026-05-24"
epic2_finalized_date: "2026-05-25"
epic2_2_1_status: complete
epic2_2_1_complete_date: "2026-05-24"
epic2_2_2_status: complete
epic2_2_2_complete_date: "2026-05-24"
epic2_2_3_status: complete
epic2_2_3_complete_date: "2026-05-25"
epic2_2_4_status: complete
epic2_2_4_complete_date: "2026-05-25"
epic2_2_5_status: complete
epic2_2_5_complete_date: "2026-05-25"
---

# Financial Tracker — Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Financial Tracker, decomposing the requirements from the PRD, UX Design Specification, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements (47)

| ID | Title | Epic |
|----|-------|------|
| FR1 | Google OAuth Login | Epic 1 |
| FR2 | Household Member Management | Epic 1 |
| FR3 | Role-Based Access Control | Epic 1 |
| FR4 | Create Transaction | Epic 3 |
| FR5 | Read/List Transactions | Epic 3 |
| FR6 | Update Transaction | Epic 3 |
| FR7 | Delete Transaction | Epic 8 |
| FR8 | Duplicate Transaction | Epic 8 |
| FR9 | Archive Transaction | Epic 8 |
| FR10 | Dashboard Spending by Category Chart | Epic 7 |
| FR11 | Dashboard Income vs Expenses Chart | Epic 7 |
| FR12 | Dashboard Net Worth Summary | Epic 7 |
| FR13 | Create Recurring Payment | Epic 4 |
| FR14 | Read/List Recurring Payments | Epic 4 |
| FR15 | Update Recurring Payment | Epic 4 |
| FR16 | Delete Recurring Payment | Epic 8 |
| FR17 | Process Recurring Payments (Scheduler) | Epic 4 |
| FR18 | Verify Recurring Payments | Epic 4 |
| FR19 | Create Account | Epic 3 |
| FR20 | Update Account Balance | Epic 3 |
| FR21 | Create Budget | Epic 5 |
| FR22 | Read/List Budgets | Epic 5 |
| FR23 | Update Budget | Epic 5 |
| FR24 | Delete Budget | Epic 8 |
| FR25 | Create Capital/Investment | Epic 5 |
| FR26 | Read/List Capital/Investments | Epic 5 |
| FR27 | Update Capital/Investment | Epic 5 |
| FR28 | Create Transfer | Epic 3 |
| FR29 | Read/List Transfers | Epic 3 |
| FR30 | Create Category ✅ COMPLETE | Epic 2 |
| FR31 | Read/List Categories ✅ COMPLETE | Epic 2 |
| FR32 | Update Category ✅ COMPLETE | Epic 2 |
| FR33 | Archive Category ✅ COMPLETE | Epic 2 |
| FR34 | Merge Duplicate Categories | Epic 2 |
| FR35 | On-Demand Default Category Creation ✅ COMPLETE | Epic 2 |
| FR36 | Category-based Filtering and Reporting ✅ COMPLETE | Epic 2 |
| FR37 | Create Internal Household Debt | Epic 6 |
| FR38 | Read/List Internal Debts | Epic 6 |
| FR39 | Update Internal Debt | Epic 6 |
| FR40 | Create Credit Card Debt | Epic 6 |
| FR41 | Read/List Credit Card Debts | Epic 6 |
| FR42 | Create CPF Mortgage | Epic 6 |
| FR43 | Create, Duplicate, Delete, Archive (Universal) | Epic 8 |
| FR44 | Export Transactions (CSV) | Epic 9 |
| FR45 | Import Transactions (CSV) | Epic 9 |
| FR46 | Category Mapping During Import | Epic 9 |
| FR47 | Auto-create Categories from Import | Epic 9 |

### Non-Functional Requirements (12)

| ID | Title | Epic |
|----|-------|------|
| NFR1 | Dashboard charts render within 2 seconds | Epic 7 |
| NFR2 | Transaction search returns results within 1 second | Epic 3 |
| NFR3 | CSV import/export handles files up to 10,000 rows | Epic 9 |
| NFR4 | All data encrypted at rest | Epic 11 |
| NFR5 | All API communications over HTTPS/TLS | Epic 11 |
| NFR6 | Session timeout after 30 minutes of inactivity | Epic 1 |
| NFR7 | Audit trail for all data modifications | Epic 11 |
| NFR8 | Recurring payments process daily with retry logic (up to 3 attempts) | Epic 4 |
| NFR9 | 99.9% uptime target | Epic 11 |
| NFR10 | Support 2-4 concurrent household users | Epic 11 |
| NFR11 | $0/month hosting cost for MVP | Epic 11 |
| NFR12 | Responsive design for mobile, tablet, and desktop browsers | Epic 7 |

### Additional Requirements (6)

| ID | Title | Epic |
|----|-------|------|
| AR1 | Input Validation — amounts, dates, currencies, strings, file uploads | Epic 11 |
| AR2 | SQL Injection Prevention via parameterized statements | Epic 11 |
| AR3 | XSS Prevention — React auto-escape, no dangerouslySetInnerHTML | Epic 7 |
| AR4 | CSRF Protection — SameSite cookies + CSRF tokens | Epic 1 |
| AR5 | Consistent error format: `{"error": "description", "code": "ERROR_CODE"}` | Epic 11 |
| AR6 | Graceful degradation when external services unavailable | Epic 11 |

### UX Design Requirements (14)

| ID | Title | Epic |
|----|-------|------|
| UX-DR1 | Dark futuristic aesthetic with Tailwind CSS + shadcn/ui | Epic 7 |
| UX-DR2 | Responsive navigation — hamburger menu on mobile | Epic 7 |
| UX-DR3 | Transaction entry in under 5 seconds | Epic 3 |
| UX-DR4 | Multi-currency UX — toggle between foreign/SGD entry | Epic 3 |
| UX-DR5 | Recurring payment verification view | Epic 4 |
| UX-DR6 | Monthly reconciliation workflow | Epic 3 |
| UX-DR7 | Category management with color coding and tree view | Epic 2 |
| UX-DR8 | Dashboard with real-time financial health visualization | Epic 7 |
| UX-DR9 | Smart category suggestions based on merchant | Epic 3 |
| UX-DR10 | Forex delta visualization with color coding | Epic 3 |
| UX-DR11 | Budget progress bars with visual thresholds | Epic 5 |
| UX-DR12 | Debt tracker with spreadsheet-style monthly view | Epic 6 |
| UX-DR13 | CSV import with category mapping interface | Epic 9 |
| UX-DR14 | Alert system with in-app notification area | Epic 10 |

### FR Coverage Map

All 47 Functional Requirements are mapped to epics with no gaps:

- **Epic 1 (Auth):** FR1, FR2, FR3
- **Epic 2 (Categories):** FR30, FR31, FR32, FR33, FR34, FR35, FR36
- **Epic 3 (Transactions & Transfers):** FR4, FR5, FR6, FR7, FR8, FR9, FR19, FR20, FR28, FR29
- **Epic 4 (Recurring Payments):** FR13, FR14, FR15, FR16, FR17, FR18
- **Epic 5 (Financial Modules):** FR21, FR22, FR23, FR24, FR25, FR26, FR27
- **Epic 6 (Debt Tracking):** FR37, FR38, FR39, FR40, FR41, FR42
- **Epic 7 (Dashboard):** FR10, FR11, FR12
- **Epic 8 (Universal Operations):** FR7, FR8, FR9, FR16, FR24, FR43
- **Epic 9 (Import/Export):** FR44, FR45, FR46, FR47
- **Epic 10 (Alerts):** (NFR14-NFR16 coverage via alert types)
- **Epic 11 (Deployment):** NFR4, NFR5, NFR7, NFR9, NFR10, NFR11, AR1-AR6
- **Epic 12 (Testing):** (Testing infrastructure)

## Epic List

| Epic | Title | Goal | Stories |
|------|-------|------|---------|
| 1 | Authentication & User Management | Secure Google OAuth login with household support and RBAC | 3 |
| 2 | Core Infrastructure & Categories | Complete category system with CRUD, subcategories, merge, and import mapping | 5 |
| 3 | Transactions & Transfers | Full transaction lifecycle with multi-currency and account transfers | 5 |
| 4 | Recurring Payments | Recurring payment scheduling with automated processing and verification | 4 |
| 5 | Financial Modules | Budgets, capital/investments, and credit card tracking | 3 |
| 6 | Debt Tracking | Internal household debt, credit card debt, and CPF mortgage tracking | 3 |
| 7 | Dashboard & Visualization | Financial overview with charts, metrics, and responsive layout | 4 |
| 8 | Universal Operations | Duplicate, archive/restore, and delete across all modules | 3 |
| 9 | Import/Export | CSV import/export with category mapping and auto-create | 4 |
| 10 | Alerts & Notifications | Reliability alerts for recurring failures, budgets, and credit cards | 4 |
| 11 | Deployment & Infrastructure | Security, validation, error handling, rate limiting, audit trail | 5 |
| 12 | Testing | Unit, integration, E2E, and security testing infrastructure | 4 |

## Epic 1: Authentication & User Management

**Goal:** Implement secure Google OAuth login with household management, role-based access control, session timeout, and CSRF protection.

### Story 1.1: Google OAuth Login

As a returning or new visitor,
I want to log in with my Google account,
So that I can securely access my financial data without remembering another password.

**Acceptance Criteria:**

**Given** I am on the landing page
**When** I click the "Sign in with Google" button
**Then** I am redirected to the Google OAuth consent screen
**And** after consent, I am redirected back to the app with a server-side session stored in the database
**And** if I am a new user, I am prompted to create a new household or join an existing one

**Given** I am an existing user with a valid server-side session
**When** I navigate to any protected route
**Then** I am granted access to the dashboard
**And** my user profile is loaded from the database

**Given** my session has expired (30 minutes of inactivity)
**When** I attempt to access a protected API endpoint
**Then** I receive a 401 Unauthorized response
**And** I am redirected to the login page

### Story 1.2: Household Member Management

As a household creator,
I want to invite other family members to join my household,
So that we can all track our shared and individual finances together.

**Given** I am logged in as a household member
**When** I navigate to the household settings page
**Then** I see an "Invite Member" button (only visible to Admin or Owner role)
**And** I can enter an email address to create an in-app invitation

**Given** I have been invited to join a household via an in-app invitation link
**When** I click the invitation link
**Then** I am prompted to sign in with my Google account if not already signed in
**And** my email is matched against the invitation (email-matching, not token-based) for security
**And** I am added to the household with a default "Member" role

**Given** I am a household Admin or Owner
**When** I view the household members list
**Then** I see all members with their roles (Owner, Admin, Member)
**And** I can change a member's role or remove them from the household

### Story 1.3: Session Timeout and CSRF Protection

As a security-conscious user,
I want my session to timeout after inactivity and all forms to have CSRF protection,
So that my financial data remains secure even if I forget to log out.

**Given** I have been inactive for 30 minutes
**When** I attempt to perform any action
**Then** I am shown a "Session expired" message
**And** I am redirected to the login page

**Given** I am logged in and viewing any form (e.g., create transaction, update budget)
**When** I submit the form
**Then** the request includes a CSRF token
**And** if the CSRF token is missing or invalid, the request is rejected with a 403 Forbidden response

## Epic 2: Core Infrastructure & Categories

**Goal:** Implement the complete category system with on-demand default creation, CRUD operations, subcategory support, merge duplicates, and import mapping.

**Progress:** 5 of 5 stories complete ✅ **COMPLETE** (2-1 ✅, 2-2 ✅, 2-3 ✅, 2-4 ✅, 2-5 ✅)

> **Implementation Progress:** See `../implementation-artifacts/sprint-status.yaml` for canonical implementation progress.

### Story 2.1: Default Category Templates (On-Demand Creation) ✅ COMPLETE

**Implementation Date:** 2026-05-24  
**Files:** `backend/database.py`, `backend/routes/categories.py`, `backend/services/category_service.py`, `frontend/src/api/categories.ts`, `frontend/src/components/CategoryManager.tsx`  
**Acceptance Criteria:** All criteria verified ✅

As a new household member,
I want to create default categories on demand via a "Create Default Categories" button,
So that I have a starting point for categorizing transactions without the system pre-populating my account.

**Architectural Change:** Categories are NO LONGER auto-seeded on startup or household creation. All categories are household-specific (`household_id` set, `is_default=False`). Template data lives in `backend/database.py` as Python lists.

**Acceptance Criteria:**

**Given** a new household has been created
**When** the user navigates to Category Manager
**Then** no categories exist yet (empty state)
**And** a "Create Default Categories" button is visible in the header

**Given** I click "Create Default Categories"
**When** the API call completes successfully
**Then** 17 categories are created as regular household-specific categories:
- 12 expense categories: Groceries, Transport, Utilities, Entertainment, Healthcare, Education, Shopping, Dining, Travel, Bills, Savings, Other
- 5 income categories: Salary, Freelance, Investments, Gifts, Other Income
**And** each category has its designated color, icon, and type
**And** all categories have `household_id` set to my household and `is_default=False`
**And** all categories have null parent_category_id (top-level)

**Given** default categories already exist for my household
**When** I click "Create Default Categories" again
**Then** the API returns an error or skips existing categories (no duplicates created)

### Story 2.2: Category CRUD Operations ✅ COMPLETE

**Implementation Date:** 2026-05-24  
**Files:** `backend/routes/categories.py`, `backend/services/category_service.py`, `frontend/src/api/categories.ts`, `frontend/src/components/CategoryManager.tsx`  
**Acceptance Criteria:** All 6 criteria verified ✅

As a user,
I want to create, edit, and delete categories,
So that I can customize them to match my spending patterns.

**Given** I am on the Categories page
**When** I click "Add Category"
**Then** a form appears with fields for name, color picker, and optional parent category dropdown
**And** after saving, the new category appears in the list

**Given** I see a category in the list
**When** I click the edit icon
**Then** I can modify its name and color
**And** changes are saved immediately

**Given** I have created a custom category (not one of the 12 defaults)
**When** I click the delete icon
**Then** I am asked for confirmation
**And** the category is removed (defaults cannot be deleted, only hidden)

### Story 2.3: Subcategory Support

As a power user,
I want to create subcategories under existing categories,
So that I can track spending with more granularity.

**Given** I am on the Categories page
**When** I expand a parent category (e.g., "Dining")
**Then** I see an option to "Add Subcategory" beneath it
**And** I can create a subcategory (e.g., "Fast Food", "Fine Dining") with its own name and color

**Given** I have created subcategories
**When** I create a transaction and select a subcategory
**Then** the transaction is associated with both the subcategory and its parent category
**And** spending reports roll up subcategory spending to the parent

### Story 2.4: Merge Duplicate Categories

As a user who imported data with duplicate categories,
I want to merge duplicate categories,
So that my transactions are consolidated under a single category.

**Given** I have two categories with similar names (e.g., "Groceries" and "Grocery")
**When** I select both categories and click "Merge"
**Then** I am prompted to choose which category to keep as the parent
**And** all transactions from the merged category are reassigned to the kept category
**And** the merged category is deleted after the transfer

### Story 2.5: Import Category Mapping

As a user importing a CSV file,
I want to map CSV columns to app categories during import,
So that my imported transactions get the correct categories.

**Given** I am on the CSV import page
**When** I upload a CSV file
**Then** I see a column mapping interface where I can select which CSV column maps to the category field
**And** for each unique value in the CSV category column, I can map it to an existing category or create a new one
**And** unmapped values are assigned to the "Other" category by default

## Epic 3: Transactions & Transfers

**Goal:** Implement the complete transaction lifecycle with quick entry (under 5 seconds), multi-currency support, account management, and inter-account transfers.

### Story 3.1: Quick Transaction Entry

As a user,
I want to enter a new transaction in under 5 seconds,
So that tracking expenses feels effortless and doesn't become a chore.

**Given** I am on any page in the app
**When** I click the "+" FAB or press the keyboard shortcut (N)
**Then** a quick-entry dialog appears with focused input on the amount field
**And** I can type the amount, press Tab, type the description, press Tab, select a category, and press Enter to save
**And** the dialog closes and the transaction is saved

**Given** the quick-entry dialog is open
**When** I press Escape
**Then** the dialog closes without saving

### Story 3.2: Multi-Currency Transactions with SGD Override

As a user traveling or making international purchases,
I want to record transactions in foreign currencies with automatic SGD conversion,
So that my financial overview always shows values in my home currency (SGD).

**Given** I am creating a transaction
**When** I select a currency other than SGD (e.g., USD, EUR)
**Then** I can enter both the foreign amount and the exchange rate (pre-filled with the latest rate)
**And** the transaction displays both amounts: original currency and SGD equivalent
**And** the SGD equivalent is used in all reports and the dashboard

**Given** I have transactions in multiple currencies
**When** I view my net worth or spending reports
**Then** all values are converted to SGD using the exchange rate at the time of entry
**And** a note indicates that forex delta may affect accuracy

### Story 3.3: Account Management

As a user,
I want to create and manage multiple accounts (Cash, Bank, Credit Card),
So that I can track all my finances in one place.

**Given** I am on the Accounts page
**When** I click "Add Account"
**Then** a form appears with fields for name, type (Cash, Bank, Credit Card), currency, and initial balance
**And** after saving, the account appears in the accounts list with its current balance

**Given** I have multiple accounts
**When** I view the dashboard
**Then** I see the combined balance across all accounts
**And** I can filter transactions by account

### Story 3.4: Inter-Account Transfers

As a user,
I want to transfer money between my own accounts,
So that I can accurately reflect movements like moving money from Savings to Bank.

**Given** I am creating a transfer
**When** I select a source account and a destination account (different accounts only)
**Then** I enter the amount and date
**And** the system creates two linked entries: a negative entry in the source account and a positive entry in the destination account
**And** the transfer appears as a single item in the transactions list with a transfer icon

**Given** I have an existing transfer
**When** I edit or delete it
**Then** both linked entries are updated or removed together

### Story 3.5: Transaction CRUD and Duplicate Detection

As a user,
I want to create, edit, archive, and delete transactions, with automatic duplicate detection,
So that my transaction history is accurate and clean.

**Given** I am creating or editing a transaction
**When** I save it
**Then** the system checks for potential duplicates (same amount, same date ±2 days, same category)
**And** if a potential duplicate is found, I am shown a warning message

**Given** I have a transaction in the list
**When** I click the options menu
**Then** I can Edit, Archive, or Delete it
**And** archived transactions are hidden from the default view but accessible via a filter
**And** deleting a transaction permanently removes it (with confirmation dialog)

## Epic 4: Recurring Payments

**Goal:** Implement recurring payment scheduling with APScheduler processing, verification view, and manual trigger with retry logic.

### Story 4.1: Create Recurring Payment

As a user,
I want to set up recurring payments (subscriptions, bills, salary),
So that I never miss a payment and can track automatic charges.

**Given** I am on the Recurring Payments page
**When** I click "Add Recurring Payment"
**Then** a form appears with fields for description, amount, frequency (daily/weekly/monthly/quarterly/yearly), start date, end date (optional), source account, and category
**And** after saving, the recurring payment appears in the list with its next occurrence date

**Given** I have created a recurring payment
**When** I view its details
**Then** I see the payment history (past occurrences) and upcoming occurrences
**And** I can edit or delete it at any time

### Story 4.2: APScheduler Processing

As the system,
I want to automatically process recurring payments at their scheduled times using APScheduler,
So that transactions are created automatically without manual intervention.

**Given** there are recurring payments due today
**When** the daily cron job runs (start of day)
**Then** transactions are created for all due recurring payments
**And** each created transaction is linked to its source recurring payment
**And** a log entry is recorded for each processed recurring payment

**Given** a recurring payment transaction creation fails
**When** the processing encounters an error (e.g., account not found)
**Then** the error is logged
**And** the system retries up to 3 attempts with exponential backoff
**And** after all retries fail, an alert is generated (linked to Epic 10)

### Story 4.3: Recurring Payment Verification View

As a user,
I want to review recurring payments before they are processed,
So that I can catch any errors or adjust upcoming occurrences.

**Given** I am on the Recurring Payments page
**When** I view the "Upcoming" tab
**Then** I see all recurring payments due in the next 7 days with their transaction preview
**And** I can pause, skip, or modify any upcoming occurrence
**And** skipped occurrences are marked and not processed by the scheduler

### Story 4.4: Manual Trigger for Recurring Payment

As a user,
I want to manually trigger a recurring payment outside its scheduled time,
So that I can record a payment that just happened but wasn't yet scheduled.

**Given** I am viewing a recurring payment in the list
**When** I click "Trigger Now"
**Then** a transaction is immediately created for the current date
**And** the transaction is linked to the recurring payment
**And** the payment history is updated to reflect this manual entry

## Epic 5: Financial Modules

**Goal:** Implement budget CRUD with progress bars, capital/investment tracking, and credit card debt management.

### Story 5.1: Budget CRUD with Progress Bars

As a user,
I want to create and manage monthly budgets per category,
So that I can monitor my spending against planned limits.

**Given** I am on the Budgets page
**When** I click "Add Budget"
**Then** a form appears with fields for category, monthly amount, and optional custom period
**And** after saving, the budget appears with a visual progress bar showing spent vs. limit

**Given** I have an existing budget
**When** I view it on the dashboard
**Then** the progress bar changes color: green (<50%), yellow (50-80%), orange (80-100%), red (>100%)
**And** I can edit the budget amount at any time

**Given** I am over budget on a category
**When** I view the budget details
**Then** I see the overspent amount highlighted in red
**And** I can see a breakdown of transactions in that category

### Story 5.2: Capital and Investment Tracking

As a user with investments,
I want to track capital assets and investments (stocks, bonds, CPF OA),
So that my net worth calculation includes all my financial holdings.

**Given** I am on the Capital/Investments page
**When** I click "Add Investment"
**Then** a form appears with fields for name, type (Stock, Bond, CPF OA, Other), current value, and purchase date
**And** after saving, the investment appears in the list with its current value

**Given** I have multiple investments
**When** I view the dashboard
**Then** the total investment value is included in my net worth summary
**And** I can update the current value of any investment at any time

### Story 5.3: Credit Card Payment Tracking

As a credit card user,
I want to track my credit card balances and upcoming due dates,
So that I can pay the right amount on time and avoid interest.

**Given** I have linked a credit card account
**When** I view the credit card page
**Then** I see the current balance, minimum payment, and due date
**And** I can record a payment against the credit card
**And** the payment reduces the outstanding balance

## Epic 6: Debt Tracking

**Goal:** Implement internal household debt, credit card debt tracking, and CPF mortgage payment management with spreadsheet-style views.

### Story 6.1: Internal Household Debt

As a user sharing a household,
I want to track money I owe to or that is owed to other household members,
So that we can settle up fairly at the end of the month.

**Given** I am on the Debts page
**When** I click "Add Internal Debt"
**Then** a form appears with fields for description, amount, type (I owe / They owe me), other household member (dropdown), and due date (optional)
**And** after saving, the debt appears in the list with its status (active, partially paid, settled)

**Given** I have an internal debt
**When** I record a partial payment
**Then** the remaining balance is updated
**And** the payment history is recorded

### Story 6.2: Credit Card Debt Tracking

As a credit card holder,
I want to track my credit card debt with interest and minimum payments,
So that I can plan my payoff strategy.

**Given** I am on the Debts page
**When** I click "Add Credit Card Debt"
**Then** a form appears with fields for card name, outstanding balance, interest rate (annual %), and minimum payment percentage
**And** after saving, the debt appears with a projected payoff timeline based on minimum payments

**Given** I have a credit card debt
**When** I make a payment
**Then** the outstanding balance is reduced
**And** the projected payoff date is recalculated

### Story 6.3: CPF Mortgage Payment Tracking

As a HDB home buyer,
I want to track my CPF mortgage payments,
So that I know how much I still owe and can plan my finances.

**Given** I am on the Debts page
**When** I click "Add CPF Mortgage"
**Then** a form appears with fields for property address, loan amount, interest rate (2.5% default), remaining term, and monthly payment amount
**And** after saving, the mortgage appears with a visual amortization schedule

**Given** I have a CPF mortgage
**When** I view its details
**Then** I see a spreadsheet-style monthly view showing principal vs. interest breakdown for each payment
**And** I can record extra payments to reduce the term

## Epic 7: Dashboard & Visualization

**Goal:** Implement the financial dashboard with spending by category chart, income vs expenses chart, net worth summary, and responsive layout with dark theme.

### Story 7.1: Spending by Category Chart

As a user,
I want to see a donut chart of my spending by category for the selected period,
So that I can quickly understand where my money goes.

**Given** I am on the dashboard
**When** the page loads
**Then** I see a donut chart showing spending by category for the current month (default period)
**And** each slice is colored according to its category color
**And** hovering over a slice shows the category name, amount, and percentage

**Given** I change the period selector (month/quarter/year)
**When** I select a different period
**Then** the chart updates to reflect the selected period

### Story 7.2: Income vs Expenses Chart

As a user,
I want to see a bar chart comparing my monthly income vs. expenses,
So that I can track my savings trend over time.

**Given** I am on the dashboard
**When** I view the income vs. expenses section
**Then** I see a grouped bar chart with income bars (green) and expense bars (red) for each month
**And** I can toggle between monthly and yearly views
**And** the net savings (income - expenses) is displayed as a line overlay

### Story 7.3: Net Worth Summary

As a user,
I want to see my net worth (assets minus liabilities) prominently displayed,
So that I can track my overall financial health at a glance.

**Given** I am on the dashboard
**When** the page loads
**Then** I see my net worth displayed as a large number at the top
**And** below it, a breakdown showing total assets (bank accounts, cash, investments, assets) and total liabilities (credit cards, debts, mortgages)
**And** the net worth value changes color: green if positive, red if negative

**Given** I have data from previous months
**When** I view the net worth
**Then** a small sparkline chart shows the net worth trend over the last 6 months

### Story 7.4: Responsive Layout and Performance

As a user on any device,
I want the dashboard to load quickly and display correctly on mobile, tablet, and desktop,
So that I can access my finances anywhere.

**Given** I am viewing the dashboard on a mobile device
**When** the page loads
**Then** the navigation collapses to a hamburger menu
**And** charts are stacked vertically and remain readable
**And** all charts render within 2 seconds (NFR1)

**Given** I am viewing the dashboard on any screen size
**When** I interact with the page
**Then** the layout adapts responsively (Tailwind CSS breakpoints)
**And** all text remains readable and interactive elements are touch-friendly (UX-DR2, NFR12)

## Epic 8: Universal Operations

**Goal:** Implement duplicate, archive/restore, and delete functionality across all modules with consistent UX.

### Story 8.1: Duplicate Functionality

As a user,
I want to duplicate any entity (transaction, recurring payment, budget, investment, debt),
So that I can quickly create similar entries without re-typing.

**Given** I am viewing any entity in its list (e.g., a transaction)
**When** I click the "Duplicate" option from the options menu
**Then** a pre-filled form opens with all fields copied from the original
**And** the date and ID are set to current/empty so the user must save it as a new entry
**And** the duplicated entity appears in the list after saving

### Story 8.2: Archive and Restore

As a user,
I want to archive entities I no longer need to see in my main views,
So that my lists stay clean without permanently losing data.

**Given** I am viewing an entity in its list
**When** I select "Archive" from the options menu
**Then** the entity is hidden from the default list view
**And** I can access archived entities via an "Archived" filter or dedicated archived view
**And** I can restore an archived entity back to the active view

**Given** I have archived entities
**When** I view the archived list
**Then** I can permanently delete them from there
**And** archiving does not affect associated reports (archived entities are excluded by default)

### Story 8.3: Delete with Confirmation

As a user,
I want to permanently delete entities I no longer need, with a safety confirmation,
So that I can clean up my data without accidental losses.

**Given** I am viewing an entity or an archived entity
**When** I select "Delete" from the options menu
**Then** a confirmation dialog appears showing the entity name and a warning that this action is irreversible
**And** I must type the entity name or click "Confirm" to proceed
**And** upon confirmation, the entity is permanently removed from the database
**And** all related data (e.g., linked transactions from a deleted recurring payment) is handled gracefully with appropriate user notification

## Epic 9: Import/Export

**Goal:** Implement CSV export with filters, CSV import with validation, category mapping interface, and auto-create categories from import data.

### Story 9.1: CSV Export with Filters

As a user,
I want to export my transactions to a CSV file with optional filters,
So that I can analyze my data in spreadsheet software or back it up.

**Given** I am on the Export page
**When** I click "Export to CSV"
**Then** I am presented with filter options: date range, account, category, amount range
**And** after applying filters and clicking export, a CSV file downloads with columns: Date, Description, Amount, Category, Account, Currency
**And** the exported data includes all transactions matching the selected filters

**Given** I have transactions in multiple currencies
**When** I export to CSV
**Then** the CSV includes both the original currency amount and the SGD equivalent
**And** a note in the file indicates the exchange rate used for conversion

### Story 9.2: CSV Import with Validation

As a user,
I want to import transactions from a CSV file with automatic validation,
So that I can migrate data from other apps or bank statements quickly.

**Given** I am on the Import page
**When** I upload a CSV file
**Then** the system validates the file format and shows a preview of the first 10 rows
**And** if the CSV has invalid rows (e.g., missing required fields, invalid dates), those rows are highlighted with error messages
**And** I can proceed with importing only the valid rows after reviewing

**Given** my CSV file has more than 10,000 rows
**When** I attempt to import it
**Then** I am shown an error message explaining the 10,000 row limit (NFR3)
**And** I am offered to split the file or import in batches

### Story 9.3: Category Mapping Interface

As a user importing a CSV,
I want to map CSV category values to my app's categories during import,
So that my imported transactions get the correct categories.

**Given** I am on the Import page with a valid CSV uploaded
**When** the system detects a category column in the CSV
**Then** it displays a mapping interface showing each unique CSV category value
**And** for each value, I can select an existing category from my app or create a new one
**And** the system suggests matches based on similarity (e.g., "Grocery" → "Groceries")
**And** unmapped values default to the "Other" category

### Story 9.4: Auto-create Categories from Import

As a user importing data with new categories,
I want the system to automatically create categories that don't exist in my app,
So that I don't have to manually create each one before importing.

**Acceptance Criteria:**

**Given** I am on the Import page with a CSV containing categories not in my app
**When** I review the category mapping interface
**Then** I see a "Create new categories" option for unmapped CSV categories
**And** after confirming, the new categories are created with default colors (randomly assigned from the palette)
**And** the import proceeds with the new categories in place
**And** I am shown a summary of newly created categories after import completes

## Epic 10: Alerts & Notifications

**Goal:** Implement the alert system infrastructure with in-app notification area, recurring payment alerts, budget threshold alerts, and credit card/mortgage alerts.

### Story 10.1: Alert System Infrastructure

As the system,
I want to provide an in-app notification area for all alert types,
So that users receive timely reminders about important financial events.

**Acceptance Criteria:**

**Given** an alert condition is triggered (e.g., budget threshold reached)
**When** the condition occurs
**Then** a notification appears in the user's in-app notification area (bell icon in header)
**And** the notification includes a clear message, severity level, and action link
**And** unread notifications are indicated by a red badge on the bell icon

**Given** I am viewing the notification area
**When** I click a notification
**Then** I am navigated to the relevant page (e.g., budget page for budget alert)
**And** the notification is marked as read
**And** I can clear individual notifications or clear all at once

### Story 10.2: Recurring Payment Alerts

As a user,
I want to be alerted when a recurring payment fails or is about to process,
So that I can take action if needed.

**Acceptance Criteria:**

**Given** I have active recurring payments
**When** a recurring payment is about to process (24 hours before)
**Then** I receive a notification: "Your [description] payment of [amount] is scheduled for tomorrow"

**Given** a recurring payment fails to process
**When** all 3 retry attempts are exhausted
**Then** I receive a notification: "Your [description] payment failed. Please check your account settings."
**And** the recurring payment is marked as failed in the list

### Story 10.3: Budget Threshold Alerts

As a budget-conscious user,
I want to be notified when I approach or exceed my budget limits,
So that I can adjust my spending before going overboard.

**Acceptance Criteria:**

**Given** I have active budgets
**When** spending in a category reaches 80% of the budget limit
**Then** I receive a warning notification: "You've used 80% of your [category] budget"

**Given** I continue spending in that category
**When** I exceed the budget limit (100%)
**Then** I receive an urgent notification: "You've exceeded your [category] budget by [amount]"
**And** the budget progress bar turns red on the dashboard

### Story 10.4: Credit Card and Mortgage Alerts

As a homeowner with a mortgage and credit cards,
I want to be reminded of upcoming due dates and missed payments,
So that I never miss a payment and avoid penalties.

**Acceptance Criteria:**

**Given** I have credit cards with upcoming due dates
**When** a due date is 7 days away
**Then** I receive a notification: "Your [card name] payment of [amount] is due in 7 days"

**Given** I have a CPF mortgage with upcoming payments
**When** a mortgage payment date is 3 days away
**Then** I receive a notification: "Your mortgage payment of [amount] is due in 3 days"

**Given** a credit card or mortgage payment date has passed
**When** no payment has been recorded
**Then** I receive an urgent alert: "Your [card/mortgage] payment was due yesterday. Please pay immediately."

## Epic 11: Deployment & Infrastructure

**Goal:** Implement security measures, input validation, error handling, audit trail, and rate limiting to meet deployment requirements.

### Story 11.1: Security Measures

As a security-conscious user,
I want all my data encrypted at rest and all communications over HTTPS,
So that my financial information is protected from unauthorized access.

**Acceptance Criteria:**

**Given** data is stored in the database
**When** sensitive fields (passwords, tokens) are written
**Then** they are encrypted using industry-standard encryption at rest (NFR4)

**Given** any API request is made
**When** the request is sent
**Then** it is transmitted over HTTPS/TLS (NFR5)
**And** the application enforces HTTPS-only redirects

### Story 11.2: Input Validation

As a user,
I want all inputs to be validated before processing,
So that invalid data never corrupts the database.

**Acceptance Criteria:**

**Given** I am submitting any form or API request
**When** the data is received by the backend
**Then** all amounts are validated as positive numbers
**And** all dates are validated as valid date formats
**And** all currency codes are validated against ISO 4217
**And** all strings are sanitized to prevent injection attacks (AR2)
**And** all file uploads are validated for type and size (AR1)

**Given** invalid input is detected
**When** the validation fails
**Then** a consistent error response is returned: `{"error": "description", "code": "ERROR_CODE"}` (AR5)
**And** the invalid data is never persisted to the database

### Story 11.3: Error Handling

As a user,
I want to receive clear, helpful error messages when something goes wrong,
So that I can understand and resolve issues without frustration.

**Acceptance Criteria:**

**Given** an unexpected error occurs in the application
**When** it happens
**Then** the error is logged server-side with a unique error ID
**And** the user sees a friendly error message with the error ID for support reference
**And** the application does not crash or show technical stack traces (AR5)

**Given** an external service (e.g., Google OAuth, forex API) is unavailable
**When** the application attempts to use it
**Then** the application degrades gracefully with a fallback message (AR6)
**And** the user is informed that the feature is temporarily unavailable

### Story 11.4: Audit Trail

As an administrator,
I want a complete audit trail of all data modifications,
So that I can track changes and investigate issues.

**Acceptance Criteria:**

**Given** any user modifies data (create, update, delete)
**When** the modification is saved
**Then** an audit log entry is created with: user ID, action type, entity type, entity ID, old values, new values, and timestamp (NFR7)
**And** audit logs are stored in a separate table with append-only writes (cannot be modified or deleted)

**Given** I am a household Admin
**When** I view the audit log
**Then** I can filter by date range, user, and action type
**And** I can export the audit log to CSV

### Story 11.5: Rate Limiting

As a system administrator,
I want to limit API request rates per user,
So that the application remains responsive and resistant to abuse.

**Acceptance Criteria:**

**Given** a user makes API requests
**When** the user exceeds 100 requests per minute
**Then** subsequent requests are rejected with a 429 Too Many Responses status
**And** the response includes a `Retry-After` header indicating when to retry
**And** rate limit violations are logged in the audit trail

## Epic 12: Testing

**Goal:** Implement comprehensive testing infrastructure including unit tests, integration tests, E2E tests, and security tests.

### Story 12.1: Unit Testing

As a developer,
I want to write unit tests for all business logic,
So that individual components work correctly in isolation.

**Acceptance Criteria:**

**Given** a service or utility function exists (e.g., currency conversion, budget calculation)
**When** I write a unit test for it
**Then** the test runs independently using mocked dependencies
**And** the test suite covers all edge cases and error paths
**And** the test suite runs in under 2 minutes

### Story 12.2: Integration Testing

As a developer,
I want to write integration tests for API endpoints and database interactions,
So that the system components work correctly together.

**Given** an API endpoint exists (e.g., POST /transactions)
**When** I write an integration test for it
**Then** the test uses a test database (SQLite in-memory or separate instance)
**And** the test verifies the full request-response cycle including database persistence
**And** the test covers both success and failure scenarios (valid input, invalid input, unauthorized access)

### Story 12.3: End-to-End Testing

As a QA engineer,
I want to write E2E tests for critical user flows,
So that the application works correctly from a user's perspective.

**Given** a critical user flow exists (e.g., login → create transaction → view dashboard)
**When** I write an E2E test for it
**Then** the test uses Playwright to simulate real user interactions in a browser
**And** the test verifies the complete user journey from start to finish
**And** the test runs against a fully deployed staging environment

**Given** critical flows include: Google OAuth login, quick transaction entry, budget creation, CSV import
**When** the E2E test suite runs
**Then** all critical flows pass successfully
**And** test results are reported in a readable format

### Story 12.4: Security Testing

As a developer,
I want to run security tests to identify vulnerabilities,
So that the application is resistant to common attacks.

**Acceptance Criteria:**

**Given** the application is deployed in a staging environment
**When** I run security tests
**Then** the tests verify: SQL injection prevention (AR2), XSS prevention (AR3), CSRF protection (AR4), authentication bypass attempts
**And** the tests use tools like OWASP ZAP or manual penetration testing scripts
**And** any vulnerabilities found are logged as issues and must be fixed before production deployment

